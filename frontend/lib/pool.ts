import { erc20Abi, type Address, type Hex, type LocalAccount, type WalletClient } from "viem";
import { shadowPoolAbi } from "./abi/pool";
import { chainTime, publicClient, write } from "./chain";
import { monadTestnet, SHADOW_POOL } from "./config";

const WITHDRAW_TTL_SEC = 300n;

export type WithdrawRequest = {
  token: Address;
  amount: string;
  to: Address;
  owner: Address;
  deadline: string;
  signature: Hex;
};

export async function privateBalance(token: Address, shadow: Address): Promise<bigint> {
  return publicClient.readContract({ address: SHADOW_POOL, abi: shadowPoolAbi, functionName: "balanceOf", args: [token, shadow] });
}

/** Total tokens held by the pool: the anonymity set every burner hides in. */
export async function poolLiquidity(token: Address): Promise<bigint> {
  return publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [SHADOW_POOL] });
}

/** Deposits from any wallet (main wallet or burner) into the shadow key's private balance. */
export async function depositToPool(wallet: WalletClient, token: Address, amount: bigint, shadow: Address) {
  await write(wallet, { address: token, abi: erc20Abi, functionName: "approve", args: [SHADOW_POOL, amount] });
  await write(wallet, { address: SHADOW_POOL, abi: shadowPoolAbi, functionName: "deposit", args: [token, amount, shadow] });
}

/** Signs a withdrawal with the shadow key. The relayer submits it, so no user wallet appears on-chain. */
export async function signWithdraw(shadow: LocalAccount, token: Address, amount: bigint, to: Address): Promise<WithdrawRequest> {
  const [nonce, now] = await Promise.all([
    publicClient.readContract({ address: SHADOW_POOL, abi: shadowPoolAbi, functionName: "nonces", args: [shadow.address] }),
    chainTime(),
  ]);
  const deadline = now + WITHDRAW_TTL_SEC;
  const signature = await shadow.signTypedData({
    domain: { name: "ShadowPool", version: "1", chainId: monadTestnet.id, verifyingContract: SHADOW_POOL },
    types: {
      Withdraw: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "to", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Withdraw",
    message: { token, amount, to, nonce, deadline },
  });
  return { token, amount: amount.toString(), to, owner: shadow.address, deadline: deadline.toString(), signature };
}
