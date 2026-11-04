import { concat, keccak256, toHex, type Address, type Hex } from "viem";
import type { Venue } from "./config";

/**
 * Per-wallet hints on this device. None are secret: burner keys re-derive from the wallet
 * signature (keys.ts), so losing this storage only costs a chain scan on the next unlock.
 */

export type VaultSession = { index: number; venue: Venue; bucket: number; startedAt: number };

type Stored = { v: 2; session: VaultSession | null; exitedThrough: number; signatureHash: Hex | null };

const storageKey = (main: Address) => `shadowtrade:wallet:${main.toLowerCase()}`;
const EMPTY: Stored = { v: 2, session: null, exitedThrough: 0, signatureHash: null };

function read(main: Address): Stored {
  try {
    const raw = localStorage.getItem(storageKey(main));
    const stored = raw ? (JSON.parse(raw) as Stored) : null;
    return stored?.v === 2 ? stored : EMPTY;
  } catch {
    return EMPTY;
  }
}

function update(main: Address, patch: Partial<Stored>) {
  try {
    localStorage.setItem(storageKey(main), JSON.stringify({ ...read(main), ...patch }));
  } catch {
    // Storage blocked: everything here can be rebuilt from the chain.
  }
}

export const loadSession = (main: Address) => read(main).session;
export const saveSession = (main: Address, session: VaultSession) => update(main, { session });
export const hasSessionToResume = (main: Address) => read(main).session !== null;

/** Burners up to this index are known to be exited and empty, so recovery scans start after it. */
export const exitedThrough = (main: Address) => read(main).exitedThrough;

export function clearSession(main: Address, exitedIndex: number) {
  update(main, { session: null, exitedThrough: Math.max(read(main).exitedThrough, exitedIndex) });
}

/**
 * Every key derives from one signature, so the wallet must sign deterministically (RFC 6979).
 * The first unlock on a device signs twice and compares; later unlocks compare against a hash.
 * Returns whether this signature can be trusted, or null when a second signature is needed.
 */
export function checkSignature(main: Address, signature: Hex): boolean | null {
  const known = read(main).signatureHash;
  return known === null ? null : known === signatureCheck(signature);
}

export const rememberSignature = (main: Address, signature: Hex) => update(main, { signatureHash: signatureCheck(signature) });

// Domain-separated: a plain keccak of the signature is a derived private key (keys.ts).
const signatureCheck = (signature: Hex) => keccak256(concat([signature, toHex("shadowtrade:signature-check:v1")]));
