import { concat, createWalletClient, http, keccak256, toHex, type Address, type Hex, type LocalAccount, type WalletClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { monadTestnet, RPC_URL } from "./config";

const SHADOW_KEY_MESSAGE =
  "ShadowTrade private balance key\n\nSigning derives your private balance key on this device. " +
  "It never leaves your browser and costs no gas.\n\nVersion: 1";

export function shadowKeyMessage(main: Address) {
  return `${SHADOW_KEY_MESSAGE}\nWallet: ${main.toLowerCase()}`;
}

/** Deterministic key from a wallet signature (RFC 6979), so the same wallet always recovers it. */
export function shadowAccountFromSignature(signature: Hex): LocalAccount {
  return privateKeyToAccount(keccak256(signature));
}

/** Separate secret for encrypting session backups; never equal to the shadow signing key. */
export function vaultSecretFromSignature(signature: Hex): Hex {
  return keccak256(concat([signature, toHex("shadowtrade:session-vault:v1")]));
}

export type Burner = { address: Address; wallet: WalletClient; privateKey: Hex };

/** A fresh throwaway account. Its key is only persisted encrypted (see vault.ts) and never logged. */
export function createBurner(privateKey: Hex = generatePrivateKey()): Burner {
  const account = privateKeyToAccount(privateKey);
  const wallet = createWalletClient({ account, chain: monadTestnet, transport: http(RPC_URL) });
  return { address: account.address, wallet, privateKey };
}
