// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from 'forge-std/Test.sol';
import {ERC20} from '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {PoseidonT4} from 'poseidon/PoseidonT4.sol';

import {DeployPrivacyPools} from 'script/DeployPrivacyPools.s.sol';
import {IEntrypoint} from 'src/privacy-pools/interfaces/IEntrypoint.sol';
import {IPrivacyPool} from 'src/privacy-pools/interfaces/IPrivacyPool.sol';
import {Constants} from 'src/privacy-pools/contracts/lib/Constants.sol';
import {ProofLib} from 'src/privacy-pools/contracts/lib/ProofLib.sol';

contract MockUSD is ERC20('Mock USD', 'mUSD') {
  function decimals() public pure override returns (uint8) {
    return 6;
  }

  function mint(address _to, uint256 _amount) external {
    _mint(_to, _amount);
  }
}

contract PrivacyPoolsTest is Test, DeployPrivacyPools {
  // Runtime code of the deterministic deployment proxy (not present in a bare test EVM).
  bytes internal constant CREATE2_PROXY_CODE =
    hex'7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3';

  MockUSD internal token;
  Deployment internal d;
  IPrivacyPool internal pool;
  address internal alice = makeAddr('alice');

  function setUp() public {
    vm.etch(CREATE2_PROXY, CREATE2_PROXY_CODE);
    token = new MockUSD();
    IERC20[] memory assets = new IERC20[](1);
    assets[0] = token;
    d = _deploy(address(this), assets);
    pool = IPrivacyPool(address(d.pools[0]));

    token.mint(alice, 100e6);
    vm.prank(alice);
    token.approve(address(d.entrypoint), type(uint256).max);
  }

  function test_deployRegistersPool() public view {
    (IPrivacyPool registered, uint256 minimum, uint256 vettingFee, uint256 maxRelayFee) =
      d.entrypoint.assetConfig(token);
    assertEq(address(registered), address(pool));
    assertEq(minimum, MINIMUM_DEPOSIT);
    assertEq(vettingFee, 0);
    assertEq(maxRelayFee, 0);
    assertEq(address(d.entrypoint.scopeToPool(pool.SCOPE())), address(pool));
    assertEq(address(pool.ENTRYPOINT()), address(d.entrypoint));
  }

  function test_depositCreditsCommitment() public {
    uint256 precommitment = 123;
    uint256 label = uint256(keccak256(abi.encodePacked(pool.SCOPE(), uint256(1)))) % Constants.SNARK_SCALAR_FIELD;
    uint256 commitment = PoseidonT4.hash([uint256(5e6), label, precommitment]);

    vm.expectEmit(address(pool));
    emit IPrivacyPool.Deposited(alice, commitment, label, 5e6, precommitment);
    vm.prank(alice);
    uint256 returned = d.entrypoint.deposit(token, 5e6, precommitment);

    assertEq(returned, commitment);
    assertEq(pool.currentTreeSize(), 1);
    assertEq(pool.depositors(label), alice);
    assertEq(token.balanceOf(address(pool)), 5e6);
    assertEq(token.balanceOf(alice), 95e6);
  }

  function test_duplicatePrecommitmentReverts() public {
    vm.startPrank(alice);
    d.entrypoint.deposit(token, 1e6, 7);
    vm.expectRevert(IEntrypoint.PrecommitmentAlreadyUsed.selector);
    d.entrypoint.deposit(token, 1e6, 7);
    vm.stopPrank();
  }

  function test_belowMinimumDepositReverts() public {
    vm.prank(alice);
    vm.expectRevert(IEntrypoint.MinimumDepositAmount.selector);
    d.entrypoint.deposit(token, MINIMUM_DEPOSIT - 1, 1);
  }

  function test_unregisteredAssetReverts() public {
    MockUSD other = new MockUSD();
    other.mint(alice, 1e6);
    vm.startPrank(alice);
    other.approve(address(d.entrypoint), 1e6);
    vm.expectRevert(IEntrypoint.PoolNotFound.selector);
    d.entrypoint.deposit(other, 1e6, 1);
    vm.stopPrank();
  }

  function test_updateRootRequiresPostman() public {
    vm.prank(alice);
    vm.expectRevert();
    d.entrypoint.updateRoot(1, _cid());
  }

  function test_postmanUpdatesRoot() public {
    d.entrypoint.updateRoot(42, _cid());
    assertEq(d.entrypoint.latestRoot(), 42);
    assertEq(d.entrypoint.rootByIndex(0), 42);
  }

  function test_relayWithBadProofReverts() public {
    ProofLib.WithdrawProof memory proof;
    proof.pubSignals[2] = 1e6; // withdrawn value
    IPrivacyPool.Withdrawal memory withdrawal =
      IPrivacyPool.Withdrawal({processooor: address(d.entrypoint), data: ''});

    uint256 scope = pool.SCOPE();
    vm.expectRevert(IPrivacyPool.ContextMismatch.selector);
    d.entrypoint.relay(withdrawal, proof, scope);
  }

  function _cid() internal pure returns (string memory) {
    return 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
  }
}
