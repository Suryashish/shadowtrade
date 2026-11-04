import type { Secret } from "@0xbow/privacy-pools-core-sdk";
import { poseidon1 } from "poseidon-lite";
import { concat, createWalletClient, hexToBigInt, http, keccak256, toHex, type Address, type Hex, type LocalAccount, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet, RPC_URL } from "./config";
import type { MasterKeys } from "./notes";

// BN254 scalar field: every Privacy Pools secret must be an element of it.
const SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416903303401171488016641973889n;

// Everything private (pool notes and every burner) derives from this one signature, so the message
// says what it unlocks and where to sign it. Changing it changes every derived key.
const SHADOW_KEY_MESSAGE =
  "ShadowTrade private keys\n\nSign this only on ShadowTrade. It derives your private balance and " +
  "burner wallet keys on this device; anyone with this signature can spend them. It never leaves " +
  "your browser and costs no gas.";

export function shadowKeyMessage(main: Address) {
  return `${SHADOW_KEY_MESSAGE}\n\nChain: ${monadTestnet.id}\nWallet: ${main.toLowerCase()}\nVersion: 2`;
}

/** Deterministic key from a wallet signature (RFC 6979), so the same wallet always recovers it. */
export function shadowAccountFromSignature(signature: Hex): LocalAccount {
  return privateKeyToAccount(keccak256(signature));
}

/**
 * Privacy Pools master keys from the same signature, domain-separated from the other keys.
 * Every note's nullifier and secret derive from these, so the signature alone recovers the balance.
 */
export function masterKeysFromSignature(signature: Hex): MasterKeys {
  const derive = (tag: string) => poseidon1([hexToBigInt(keccak256(concat([signature, toHex(tag)]))) % SNARK_SCALAR_FIELD]) as Secret;
  return { masterNullifier: derive("shadowtrade:privacy-pools:nullifier:v1"), masterSecret: derive("shadowtrade:privacy-pools:secret:v1") };
}

/** Secret from which every burner key derives. Kept in memory only. */
export function burnerSeedFromSignature(signature: Hex): Hex {
  return keccak256(concat([signature, toHex("shadowtrade:burner-seed:v1")]));
}

export type Burner = { index: number; address: Address; wallet: WalletClient };

/**
 * Burner number `index` (1, 2, ...). Each session uses a new index, so burners are unrelated
 * addresses on-chain, yet any of them can be re-derived from the signature to resume an
 * unfinished session on any device. The key is never stored or logged.
 */
export function deriveBurner(seed: Hex, index: number): Burner {
  const account = privateKeyToAccount(keccak256(concat([seed, toHex(index, { size: 32 })])));
  const wallet = createWalletClient({ account, chain: monadTestnet, transport: http(RPC_URL) });
  return { index, address: account.address, wallet };
}
