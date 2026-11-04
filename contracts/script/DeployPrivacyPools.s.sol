// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Script, console} from 'forge-std/Script.sol';
import {stdJson} from 'forge-std/StdJson.sol';
import {ERC1967Proxy} from '@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import {Entrypoint} from 'src/privacy-pools/contracts/Entrypoint.sol';
import {PrivacyPoolComplex} from 'src/privacy-pools/contracts/implementations/PrivacyPoolComplex.sol';
import {CommitmentVerifier} from 'src/privacy-pools/contracts/verifiers/CommitmentVerifier.sol';
import {WithdrawalVerifier} from 'src/privacy-pools/contracts/verifiers/WithdrawalVerifier.sol';

contract DeployPrivacyPools is Script {
  using stdJson for string;

  address internal constant CREATE2_PROXY = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
  address internal constant POSEIDON_T3 = 0x3333333C0A88F9BE4fd23ed0536F9B6c427e3B93;
  address internal constant POSEIDON_T4 = 0x4443338EF595F44e0121df4C21102677B142ECF0;

  address internal constant AUSD = 0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC;
  address internal constant USDC = 0xb01DC575a7ef75e58A05D2bde73ab79f8e7dd0Be;

  uint256 internal constant MINIMUM_DEPOSIT = 1e6; // 1 token (6 decimals)

  struct Deployment {
    Entrypoint entrypoint;
    WithdrawalVerifier withdrawalVerifier;
    CommitmentVerifier commitmentVerifier;
    PrivacyPoolComplex[] pools;
  }

  function run() external {
    uint256 startBlock = block.number;

    IERC20[] memory assets = new IERC20[](2);
    assets[0] = IERC20(AUSD);
    assets[1] = IERC20(USDC);

    vm.startBroadcast();
    (, address deployer,) = vm.readCallers();
    address owner = vm.envOr('POOL_OWNER', deployer);
    Deployment memory d = _deploy(owner, assets);
    vm.stopBroadcast();

    console.log('Entrypoint', address(d.entrypoint));
    console.log('AUSD pool', address(d.pools[0]));
    console.log('USDC pool', address(d.pools[1]));
    console.log('Deployment block', startBlock);

    _writeJson(d, startBlock);
  }

  /// @dev Must be called by `_owner`, who needs OWNER_ROLE to register the pools.
  function _deploy(address _owner, IERC20[] memory _assets) internal returns (Deployment memory d) {
    _ensurePoseidon(POSEIDON_T3, 'script/poseidon/PoseidonT3.hex');
    _ensurePoseidon(POSEIDON_T4, 'script/poseidon/PoseidonT4.hex');

    d.withdrawalVerifier = new WithdrawalVerifier();
    d.commitmentVerifier = new CommitmentVerifier();

    Entrypoint implementation = new Entrypoint();
    d.entrypoint = Entrypoint(
      payable(address(new ERC1967Proxy(address(implementation), abi.encodeCall(Entrypoint.initialize, (_owner, _owner)))))
    );

    d.pools = new PrivacyPoolComplex[](_assets.length);
    for (uint256 i; i < _assets.length; ++i) {
      d.pools[i] = new PrivacyPoolComplex(
        address(d.entrypoint), address(d.withdrawalVerifier), address(d.commitmentVerifier), address(_assets[i])
      );
      d.entrypoint.registerPool(_assets[i], d.pools[i], MINIMUM_DEPOSIT, 0, 0);
    }
  }

  /// @dev The hex file is `salt ++ initcode` from poseidon-solidity, which the CREATE2 proxy deploys at a canonical address.
  function _ensurePoseidon(address _canonical, string memory _dataFile) internal {
    if (_canonical.code.length != 0) return;
    (bool ok,) = CREATE2_PROXY.call(vm.parseBytes(vm.readFile(_dataFile)));
    require(ok && _canonical.code.length != 0, 'poseidon deploy failed');
  }

  function _writeJson(Deployment memory d, uint256 _deploymentBlock) internal {
    string memory ausd = 'ausd';
    ausd.serialize('address', address(d.pools[0]));
    string memory ausdJson = ausd.serialize('scope', d.pools[0].SCOPE());
    string memory usdc = 'usdc';
    usdc.serialize('address', address(d.pools[1]));
    string memory usdcJson = usdc.serialize('scope', d.pools[1].SCOPE());

    string memory pools = 'pools';
    pools.serialize('AUSD', ausdJson);
    string memory poolsJson = pools.serialize('USDC', usdcJson);

    string memory root = 'root';
    root.serialize('entrypoint', address(d.entrypoint));
    root.serialize('pools', poolsJson);
    root.serialize('withdrawalVerifier', address(d.withdrawalVerifier));
    root.serialize('commitmentVerifier', address(d.commitmentVerifier));
    string memory json = root.serialize('deploymentBlock', _deploymentBlock);

    json.write(string.concat('deployments/', vm.toString(block.chainid), '.json'));
  }
}
