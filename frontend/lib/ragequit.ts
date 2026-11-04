import type { Address, WalletClient } from "viem";
import { write } from "./chain";
import { loadAccount, type Note, type PoolAccount, type PoolEnv } from "./pool";
import { loadPrivacySdk, type MasterKeys } from "./privacySdk";

// The pool's safety exit. privacyPool.ts only lists the events the app reads, so the call lives here.
const ragequitAbi = [
  {
    type: "function",
    name: "ragequit",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "_proof",
        type: "tuple",
        components: [
          { name: "pA", type: "uint256[2]" },
          { name: "pB", type: "uint256[2][2]" },
          { name: "pC", type: "uint256[2]" },
          { name: "pubSignals", type: "uint256[4]" },
        ],
      },
    ],
    outputs: [],
  },
  { type: "error", name: "OnlyOriginalDepositor", inputs: [] },
  { type: "error", name: "InvalidProof", inputs: [] },
] as const;

/** A note the connected wallet itself deposited and the ASP has not approved. */
export type PendingNote = Note;

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Unapproved, unspent notes deposited by `depositor`. Deposits made from a burner (stealth exit) are
 * left out: only the original depositor can ragequit, and the burner key is wiped.
 */
export function pendingNotesOf(account: PoolAccount, depositor: Address): PendingNote[] {
  // Inconsistent ASP data marks everything unapproved; that is a data problem, not a reason to exit.
  if (!account.aspConsistent && account.state.asp.labels.length > 0) return [];
  return Object.entries(account.notes).flatMap(([symbol, notes]) => {
    const deposits = account.state.pools[symbol]?.deposits ?? [];
    return notes.filter((n) => !n.approved && deposits.some((d) => BigInt(d.label) === n.label && sameAddress(d.depositor, depositor)));
  });
}

export async function loadPendingNotes(keys: MasterKeys, depositor: Address, env: PoolEnv = {}): Promise<PendingNote[]> {
  return pendingNotesOf(await loadAccount(keys, env), depositor);
}

export type OnStage = (stage: "proving" | "returning") => void;

/** Proves ownership of the commitment and returns the deposit to the connected wallet, publicly. */
export async function ragequit(wallet: WalletClient, note: PendingNote, env: PoolEnv = {}, onStage?: OnStage) {
  const sdk = await loadPrivacySdk();
  onStage?.("proving");
  const circuits = new sdk.Circuits(env.circuits ?? { browser: true, baseUrl: window.location.origin });
  const { proof, publicSignals } = await new sdk.PrivacyPoolSDK(circuits).proveCommitment(note.value, note.label, note.nullifier, note.secret);
  onStage?.("returning");
  return write(wallet, {
    address: note.pool.address,
    abi: ragequitAbi,
    functionName: "ragequit",
    args: [
      {
        pA: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
        // snarkjs lists G2 coordinates as (x0, x1); the Solidity verifier wants (x1, x0).
        pB: [
          [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
          [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
        ],
        pC: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
        pubSignals: [BigInt(publicSignals[0]), BigInt(publicSignals[1]), BigInt(publicSignals[2]), BigInt(publicSignals[3])],
      },
    ],
  });
}
