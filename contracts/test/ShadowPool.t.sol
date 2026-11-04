// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ShadowPool} from "../src/ShadowPool.sol";

contract MockUSD is ERC20("Mock USD", "mUSD") {
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract ShadowPoolTest is Test {
    ShadowPool pool;
    MockUSD usd;
    address depositor = address(0xD0);
    uint256 shadowPk = 0xA11CE;
    address shadow;
    address burner = address(0xB0);
    address relayer = address(0x7E);

    function setUp() public {
        pool = new ShadowPool();
        usd = new MockUSD();
        shadow = vm.addr(shadowPk);
        usd.mint(depositor, 10_000e6);
        vm.prank(depositor);
        usd.approve(address(pool), type(uint256).max);
        vm.prank(depositor);
        pool.deposit(address(usd), 5_000e6, shadow);
    }

    function _sign(uint256 pk, uint256 amount, address to, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash =
            keccak256(abi.encode(pool.WITHDRAW_TYPEHASH(), address(usd), amount, to, nonce, deadline));
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("ShadowPool"),
                keccak256("1"),
                block.chainid,
                address(pool)
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }

    function test_depositCreditsShadowOwner() public view {
        assertEq(pool.balanceOf(address(usd), shadow), 5_000e6);
        assertEq(pool.balanceOf(address(usd), depositor), 0);
    }

    function test_relayedWithdrawToBurner() public {
        bytes memory sig = _sign(shadowPk, 1_000e6, burner, 0, block.timestamp + 60);
        vm.prank(relayer);
        pool.withdraw(address(usd), 1_000e6, burner, shadow, block.timestamp + 60, sig);
        assertEq(usd.balanceOf(burner), 1_000e6);
        assertEq(pool.balanceOf(address(usd), shadow), 4_000e6);
    }

    function test_replayRejected() public {
        bytes memory sig = _sign(shadowPk, 1_000e6, burner, 0, block.timestamp + 60);
        pool.withdraw(address(usd), 1_000e6, burner, shadow, block.timestamp + 60, sig);
        vm.expectRevert(ShadowPool.BadSignature.selector);
        pool.withdraw(address(usd), 1_000e6, burner, shadow, block.timestamp + 60, sig);
    }

    function test_wrongSignerRejected() public {
        bytes memory sig = _sign(0xBAD, 1_000e6, burner, 0, block.timestamp + 60);
        vm.expectRevert(ShadowPool.BadSignature.selector);
        pool.withdraw(address(usd), 1_000e6, burner, shadow, block.timestamp + 60, sig);
    }

    function test_redirectedRecipientRejected() public {
        bytes memory sig = _sign(shadowPk, 1_000e6, burner, 0, block.timestamp + 60);
        vm.expectRevert(ShadowPool.BadSignature.selector);
        pool.withdraw(address(usd), 1_000e6, relayer, shadow, block.timestamp + 60, sig);
    }

    function test_expiredRejected() public {
        bytes memory sig = _sign(shadowPk, 1_000e6, burner, 0, block.timestamp);
        vm.warp(block.timestamp + 1);
        vm.expectRevert(ShadowPool.Expired.selector);
        pool.withdraw(address(usd), 1_000e6, burner, shadow, block.timestamp - 1, sig);
    }

    function test_overdrawRejected() public {
        bytes memory sig = _sign(shadowPk, 6_000e6, burner, 0, block.timestamp + 60);
        vm.expectRevert(ShadowPool.InsufficientBalance.selector);
        pool.withdraw(address(usd), 6_000e6, burner, shadow, block.timestamp + 60, sig);
    }
}
