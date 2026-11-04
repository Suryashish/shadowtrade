// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Development stand-in for the Unlink privacy pool. Balances are owned by a
/// browser-derived "shadow key" and withdrawals are signed off-chain and relayed, so the
/// depositor's wallet never interacts with the burner. NOT zero-knowledge: on-chain observers
/// can link the shadow key's deposits and withdrawals. Production uses Unlink.
contract ShadowPool is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant WITHDRAW_TYPEHASH =
        keccak256("Withdraw(address token,uint256 amount,address to,uint256 nonce,uint256 deadline)");

    mapping(address token => mapping(address owner => uint256)) public balanceOf;
    mapping(address owner => uint256) public nonces;

    event Deposited(address indexed token, address indexed owner, uint256 amount);
    event Withdrawn(address indexed token, address indexed owner, address to, uint256 amount);

    error Expired();
    error BadSignature();
    error InsufficientBalance();
    error ZeroAmount();

    constructor() EIP712("ShadowPool", "1") {}

    function deposit(address token, uint256 amount, address owner) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - before;
        balanceOf[token][owner] += received;
        emit Deposited(token, owner, received);
    }

    function withdraw(
        address token,
        uint256 amount,
        address to,
        address owner,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        if (block.timestamp > deadline) revert Expired();
        if (amount == 0) revert ZeroAmount();
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(WITHDRAW_TYPEHASH, token, amount, to, nonces[owner], deadline))
        );
        if (ECDSA.recover(digest, signature) != owner) revert BadSignature();
        if (balanceOf[token][owner] < amount) revert InsufficientBalance();

        nonces[owner]++;
        balanceOf[token][owner] -= amount;
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(token, owner, to, amount);
    }
}
