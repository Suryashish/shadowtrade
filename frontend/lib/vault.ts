import { bytesToHex, hexToBytes, type Address, type Hex } from "viem";
import type { Venue } from "./config";

/**
 * Keeps an active session's burner key on this device, encrypted with a key only the user's
 * wallet signature can re-derive, so a refresh or crash never strands funds in a burner.
 * It is written before any funds move and deleted when the session exits.
 */

type StoredSession = { v: 1; iv: Hex; ct: Hex; venue: Venue; bucket: number; startedAt: number };

export type VaultSession = { burnerKey: Hex; venue: Venue; bucket: number; startedAt: number };

const storageKey = (shadow: Address) => `shadowtrade:session:${shadow.toLowerCase()}`;

// WebCrypto wants ArrayBuffer-backed views; copying gives a fresh, non-shared buffer.
const bytes = (hex: Hex) => new Uint8Array(hexToBytes(hex));

async function aesKey(vaultSecret: Hex) {
  return crypto.subtle.importKey("raw", bytes(vaultSecret), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function saveSession(shadow: Address, vaultSecret: Hex, s: VaultSession) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(vaultSecret), bytes(s.burnerKey));
  const record: StoredSession = { v: 1, iv: bytesToHex(iv), ct: bytesToHex(new Uint8Array(ct)), venue: s.venue, bucket: s.bucket, startedAt: s.startedAt };
  // Throws if storage is unavailable; callers must not move funds without this backup.
  localStorage.setItem(storageKey(shadow), JSON.stringify(record));
}

export async function loadSession(shadow: Address, vaultSecret: Hex): Promise<VaultSession | null> {
  let raw: string | null;
  try {
    raw = localStorage.getItem(storageKey(shadow));
  } catch {
    return null;
  }
  if (!raw) return null;
  const record = JSON.parse(raw) as StoredSession;
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(record.iv) }, await aesKey(vaultSecret), bytes(record.ct));
  return { burnerKey: bytesToHex(new Uint8Array(pt)), venue: record.venue, bucket: record.bucket, startedAt: record.startedAt };
}

export function clearSession(shadow: Address) {
  try {
    localStorage.removeItem(storageKey(shadow));
  } catch {
    // Nothing stored.
  }
}

// A non-secret marker per main wallet, so the UI can say "you have a session to resume" before
// the user signs (the encrypted record itself is keyed by the shadow address, unknown until then).
const markerKey = (main: Address) => `shadowtrade:active:${main.toLowerCase()}`;

export function markSessionActive(main: Address, active: boolean) {
  try {
    if (active) localStorage.setItem(markerKey(main), "1");
    else localStorage.removeItem(markerKey(main));
  } catch {
    // Only drives a hint.
  }
}

export function hasSessionToResume(main: Address): boolean {
  try {
    return localStorage.getItem(markerKey(main)) === "1";
  } catch {
    return false;
  }
}
