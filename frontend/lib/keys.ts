import {
  createWalletClient,
  http,
  keccak256,
  type Address,
  type LocalAccount,
  type WalletClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { monadTestnet, RPC_URL } from "./config";

const SHADOW_KEY_MESSAGE =
  "ShadowTrade private balance key\n\nSigning derives your private balance key on this device. " +
  "It never leaves your browser and costs no gas.\n\nVersion: 1";

export function shadowKeyMessage(main: Address) {
  return `${SHADOW_KEY_MESSAGE}\nWallet: ${main.toLowerCase()}`;
}

/** Deterministic key from a wallet signature (RFC 6979), so the same wallet always recovers it. */
export function shadowAccountFromSignature(signature: `0x${string}`): LocalAccount {
  return privateKeyToAccount(keccak256(signature));
}

export type Burner = { address: Address; wallet: WalletClient };

/** A fresh throwaway account. The key lives only in this closure and is never stored or logged. */
export function createBurner(): Burner {
  const account = privateKeyToAccount(generatePrivateKey());
  const wallet = createWalletClient({ account, chain: monadTestnet, transport: http(RPC_URL) });
  return { address: account.address, wallet };
}
