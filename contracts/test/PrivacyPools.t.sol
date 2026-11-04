// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, Vm} from "forge-std/Test.sol";
import {ERC20} from "@oz/token/ERC20/ERC20.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {IAccessControl} from "@oz/access/IAccessControl.sol";
import {Entrypoint} from "pp/contracts/Entrypoint.sol";
import {IEntrypoint} from "pp/interfaces/IEntrypoint.sol";
import {IPrivacyPool} from "pp/interfaces/IPrivacyPool.sol";
import {ProofLib} from "pp/contracts/lib/ProofLib.sol";
import {DeployPrivacyPools} from "../script/DeployPrivacyPools.s.sol";

contract MockToken is ERC20 {
    constructor(string memory symbol_) ERC20(symbol_, symbol_) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// Deployment, registration, roles and deposit path. The proof/withdraw path needs circuit artifacts and is
/// covered by the frontend end-to-end test.
contract PrivacyPoolsTest is Test, DeployPrivacyPools {
    bytes32 constant ASP_POSTMAN = keccak256("ASP_POSTMAN");
    bytes32 constant OWNER_ROLE = keccak256("OWNER_ROLE");
    string constant CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

    address postman = address(0xA5B);
    address user = address(0xD0);
    Entrypoint entrypoint;
    Pool[] pools;
    MockToken ausd;
    MockToken usdc;

    function setUp() public {
        ausd = new MockToken("AUSD");
        usdc = new MockToken("USDC");
        string[] memory symbols = new string[](2);
        symbols[0] = "AUSD";
        symbols[1] = "USDC";
        address[] memory tokens = new address[](2);
        tokens[0] = address(ausd);
        tokens[1] = address(usdc);
        Pool[] memory deployed;
        (entrypoint, deployed) = deploy(address(this), postman, symbols, tokens);
        for (uint256 i; i < deployed.length; ++i) {
            pools.push(deployed[i]);
        }
        ausd.mint(user, 1_000e6);
        vm.prank(user);
        ausd.approve(address(entrypoint), type(uint256).max);
    }

    function test_poolsRegisteredWithConfig() public view {
        for (uint256 i; i < pools.length; ++i) {
            assertEq(address(entrypoint.scopeToPool(pools[i].scope)), pools[i].pool);
            (IPrivacyPool pool, uint256 minDeposit, uint256 vettingFee, uint256 maxRelayFee) =
                entrypoint.assetConfig(IERC20(pools[i].token));
            assertEq(address(pool), pools[i].pool);
            assertEq(minDeposit, 1e6);
            assertEq(vettingFee, 0);
            assertEq(maxRelayFee, 10);
        }
        assertTrue(pools[0].scope != pools[1].scope);
    }

    function test_roles() public view {
        assertTrue(entrypoint.hasRole(OWNER_ROLE, address(this)));
        assertTrue(entrypoint.hasRole(ASP_POSTMAN, postman));
        assertFalse(entrypoint.hasRole(ASP_POSTMAN, address(this)));
    }

    function test_onlyPostmanUpdatesRoot() public {
        vm.prank(postman);
        entrypoint.updateRoot(123, CID);
        assertEq(entrypoint.latestRoot(), 123);

        vm.expectRevert();
        vm.prank(user);
        entrypoint.updateRoot(456, CID);

        vm.expectRevert(IEntrypoint.InvalidIPFSCIDLength.selector);
        vm.prank(postman);
        entrypoint.updateRoot(456, "short");
    }

    function test_onlyOwnerRegistersPools() public {
        vm.expectRevert();
        vm.prank(user);
        entrypoint.registerPool(IERC20(address(usdc)), IPrivacyPool(pools[1].pool), 1e6, 0, 10);
    }

    function test_depositEmitsDepositedAndHoldsFunds() public {
        vm.recordLogs();
        vm.prank(user);
        entrypoint.deposit(IERC20(address(ausd)), 100e6, 42);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == pools[0].pool && logs[i].topics[0] == IPrivacyPool.Deposited.selector) {
                found = true;
                assertEq(address(uint160(uint256(logs[i].topics[1]))), user);
            }
        }
        assertTrue(found);
        assertEq(ausd.balanceOf(pools[0].pool), 100e6);
        assertTrue(entrypoint.usedPrecommitments(42));
    }

    function test_depositBelowMinimumReverts() public {
        vm.expectRevert(IEntrypoint.MinimumDepositAmount.selector);
        vm.prank(user);
        entrypoint.deposit(IERC20(address(ausd)), 1e6 - 1, 7);
    }

    function test_relayWithBadProofReverts() public {
        IPrivacyPool.Withdrawal memory withdrawal =
            IPrivacyPool.Withdrawal({processooor: address(entrypoint), data: ""});
        ProofLib.WithdrawProof memory proof;
        vm.prank(postman);
        vm.expectRevert();
        entrypoint.relay(withdrawal, proof, pools[0].scope);
    }

    function test_rendersDeploymentsJson() public view {
        string memory json = render(address(entrypoint), 99, _pools());
        assertEq(vm.parseJsonAddress(json, '.["31337"].entrypoint'), address(entrypoint));
        assertEq(vm.parseJsonString(json, '.["31337"].startBlock'), "99");
        assertEq(vm.parseJsonAddress(json, ".[\"31337\"].pools.AUSD.address"), pools[0].pool);
        assertEq(vm.parseJsonString(json, ".[\"31337\"].pools.USDC.scope"), vm.toString(pools[1].scope));
    }

    function _pools() internal view returns (Pool[] memory out) {
        out = new Pool[](pools.length);
        for (uint256 i; i < pools.length; ++i) {
            out[i] = pools[i];
        }
    }
}
