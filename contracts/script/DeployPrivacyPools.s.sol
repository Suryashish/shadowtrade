// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@oz/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Entrypoint} from "pp/contracts/Entrypoint.sol";
import {PrivacyPoolComplex} from "pp/contracts/implementations/PrivacyPoolComplex.sol";
import {WithdrawalVerifier} from "pp/contracts/verifiers/WithdrawalVerifier.sol";
import {CommitmentVerifier} from "pp/contracts/verifiers/CommitmentVerifier.sol";
import {IPrivacyPool} from "pp/interfaces/IPrivacyPool.sol";

/// Deploys 0xbow Privacy Pools (one Entrypoint, one ERC-20 pool per token) and writes frontend/lib/deployments.json.
/// Env: POSTMAN_ADDRESS (ASP + relayer). The broadcaster becomes the Entrypoint owner.
/// Library linking (PoseidonT3/T4) is handled by forge.
contract DeployPrivacyPools is Script {
    uint256 internal constant MIN_DEPOSIT = 1e6; // 1 token (6 decimals)
    uint256 internal constant VETTING_FEE_BPS = 0;
    uint256 internal constant MAX_RELAY_FEE_BPS = 10;

    address internal constant AUSD = 0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC;
    address internal constant USDC = 0xb01DC575a7ef75e58A05D2bde73ab79f8e7dd0Be;

    string internal constant OUTPUT = "../frontend/lib/deployments.json";

    struct Pool {
        string symbol;
        address token;
        address pool;
        uint256 scope;
    }

    function run() external {
        address postman = vm.envAddress("POSTMAN_ADDRESS");
        string[] memory symbols = new string[](2);
        symbols[0] = "AUSD";
        symbols[1] = "USDC";
        address[] memory tokens = new address[](2);
        tokens[0] = AUSD;
        tokens[1] = USDC;

        uint256 startBlock = block.number;
        vm.startBroadcast();
        (Entrypoint entrypoint, Pool[] memory pools) = deploy(msg.sender, postman, symbols, tokens);
        vm.stopBroadcast();

        vm.writeFile(OUTPUT, render(address(entrypoint), startBlock, pools));
    }

    /// The caller must be `owner` (it registers the pools).
    function deploy(address owner, address postman, string[] memory symbols, address[] memory tokens)
        public
        returns (Entrypoint entrypoint, Pool[] memory pools)
    {
        address withdrawalVerifier = address(new WithdrawalVerifier());
        address ragequitVerifier = address(new CommitmentVerifier());

        address implementation = address(new Entrypoint());
        entrypoint = Entrypoint(
            payable(address(
                    new ERC1967Proxy(implementation, abi.encodeCall(Entrypoint.initialize, (owner, postman)))
                ))
        );

        pools = new Pool[](tokens.length);
        for (uint256 i; i < tokens.length; ++i) {
            PrivacyPoolComplex pool =
                new PrivacyPoolComplex(address(entrypoint), withdrawalVerifier, ragequitVerifier, tokens[i]);
            entrypoint.registerPool(
                IERC20(tokens[i]), IPrivacyPool(address(pool)), MIN_DEPOSIT, VETTING_FEE_BPS, MAX_RELAY_FEE_BPS
            );
            pools[i] = Pool(symbols[i], tokens[i], address(pool), pool.SCOPE());
        }
    }

    function render(address entrypoint, uint256 startBlock, Pool[] memory pools) public view returns (string memory) {
        string memory entries;
        for (uint256 i; i < pools.length; ++i) {
            entries = string.concat(
                entries,
                i == 0 ? "" : ",",
                '"',
                pools[i].symbol,
                '":{"address":"',
                vm.toString(pools[i].pool),
                '","token":"',
                vm.toString(pools[i].token),
                '","scope":"',
                vm.toString(pools[i].scope),
                '"}'
            );
        }
        return string.concat(
            '{"',
            vm.toString(block.chainid),
            '":{"entrypoint":"',
            vm.toString(entrypoint),
            '","startBlock":"',
            vm.toString(startBlock),
            '","pools":{',
            entries,
            "}}}\n"
        );
    }
}
