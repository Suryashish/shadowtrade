import {
  calculateContext,
  generateDepositSecrets,
  generateMerkleProof,
  generateWithdrawalSecrets,
  getCommitment,
  hashPrecommitment,
  type Hash,
  type PrivacyPoolSDK,
  type Secret,
} from "@0xbow/privacy-pools-core-sdk";
import { poseidon1 } from "poseidon-lite";
import { encodeAbiParameters, toHex, type Address, type Hex } from "viem";

/**
 * Privacy Pools (0xbow) notes. A deposit creates a commitment owned by secrets derived from the
 * user's master keys, so the full private balance can be rebuilt from public pool events alone:
 * no note storage, nothing to lose on a new device.
 */

export type MasterKeys = { masterNullifier: Secret; masterSecret: Secret };

/** Everything a client needs from the pool's public history to find its notes and build proofs. */
export type PoolState = {
  scope: bigint;
  /** State tree leaves (deposit and change commitments) in insertion order. */
  leaves: bigint[];
  deposits: { label: bigint; commitment: bigint; value: bigint; precommitment: bigint }[];
  withdrawals: { spentNullifier: bigint; newCommitment: bigint; value: bigint }[];
  ragequitLabels: bigint[];
  /** Labels the ASP approved, in ASP tree order; their root is the Entrypoint's latest root. */
  aspLabels: bigint[];
  aspRoot: bigint;
};

export type Note = {
  label: bigint;
  value: bigint;
  nullifier: Secret;
  secret: Secret;
  commitment: bigint;
  /** Withdrawals already made from this deposit; indexes the secrets of the next change note. */
  spends: bigint;
  approved: boolean;
};

export type SolidityProof = {
  pA: [Hex, Hex];
  pB: [[Hex, Hex], [Hex, Hex]];
  pC: [Hex, Hex];
  pubSignals: [Hex, Hex, Hex, Hex, Hex, Hex, Hex, Hex];
};

export type WithdrawalData = { processooor: Address; data: Hex };

// The withdraw circuit is compiled for trees up to depth 32; siblings are zero-padded to it.
const MAX_TREE_DEPTH = 32n;

export function depositSecrets(keys: MasterKeys, scope: bigint, index: bigint) {
  const { nullifier, secret } = generateDepositSecrets(keys, scope as Hash, index);
  return { nullifier, secret, precommitment: hashPrecommitment(nullifier, secret) };
}

/** Walks every deposit made with these keys and follows each through its withdrawals to the current note. */
export function recoverNotes(keys: MasterKeys, state: PoolState): { notes: Note[]; nextDepositIndex: bigint } {
  const deposits = new Map(state.deposits.map((d) => [d.precommitment, d]));
  const withdrawals = new Map(state.withdrawals.map((w) => [w.spentNullifier, w]));
  const ragequit = new Set(state.ragequitLabels);
  const approved = new Set(state.aspLabels);
  const notes: Note[] = [];

  // Deposits always take the lowest unused index, so the first miss ends the sequence.
  let index = 0n;
  for (; ; index++) {
    const s = depositSecrets(keys, state.scope, index);
    const deposit = deposits.get(s.precommitment);
    if (!deposit) break;
    let note: Note = { label: deposit.label, value: deposit.value, nullifier: s.nullifier, secret: s.secret, commitment: deposit.commitment, spends: 0n, approved: approved.has(deposit.label) };
    for (let w = withdrawals.get(poseidon1([note.nullifier])); w; w = withdrawals.get(poseidon1([note.nullifier]))) {
      const next = generateWithdrawalSecrets(keys, note.label as Hash, note.spends);
      note = { ...note, value: note.value - w.value, nullifier: next.nullifier, secret: next.secret, commitment: w.newCommitment, spends: note.spends + 1n };
    }
    if (note.value > 0n && !ragequit.has(note.label)) notes.push(note);
  }
  return { notes, nextDepositIndex: index };
}

export const spendable = (notes: Note[]) => notes.filter((n) => n.approved).reduce((sum, n) => sum + n.value, 0n);
export const pending = (notes: Note[]) => notes.filter((n) => !n.approved).reduce((sum, n) => sum + n.value, 0n);

/**
 * Picks notes to cover `amount`. One proof spends one note, so a single covering note is best
 * (the smallest one, to leave the larger notes whole); otherwise largest-first across several.
 */
export function planWithdrawal(notes: Note[], amount: bigint): { note: Note; amount: bigint }[] {
  const usable = notes.filter((n) => n.approved).sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
  const single = usable.find((n) => n.value >= amount);
  if (single) return [{ note: single, amount }];
  const plan: { note: Note; amount: bigint }[] = [];
  let left = amount;
  for (const note of usable.reverse()) {
    if (left === 0n) break;
    const take = note.value < left ? note.value : left;
    plan.push({ note, amount: take });
    left -= take;
  }
  if (left > 0n) throw new Error("InsufficientBalance");
  return plan;
}

/** Relay data paying `recipient` with no fee; the context binds the proof to it, so it can't be redirected. */
export function relayWithdrawal(entrypoint: Address, recipient: Address, feeRecipient: Address): WithdrawalData {
  const data = encodeAbiParameters(
    [{ type: "tuple", components: [{ name: "recipient", type: "address" }, { name: "feeRecipient", type: "address" }, { name: "relayFeeBPS", type: "uint256" }] }],
    [{ recipient, feeRecipient, relayFeeBPS: 0n }],
  );
  return { processooor: entrypoint, data };
}

export async function proveWithdrawal(prover: Pick<PrivacyPoolSDK, "proveWithdrawal">, keys: MasterKeys, state: PoolState, note: Note, amount: bigint, withdrawal: WithdrawalData): Promise<SolidityProof> {
  const stateProof = generateMerkleProof(state.leaves, note.commitment);
  const aspProof = generateMerkleProof(state.aspLabels, note.label);
  const change = generateWithdrawalSecrets(keys, note.label as Hash, note.spends);
  const { proof, publicSignals } = await prover.proveWithdrawal(getCommitment(note.value, note.label, note.nullifier, note.secret), {
    context: BigInt(calculateContext(withdrawal, state.scope as Hash)),
    withdrawalAmount: amount,
    stateMerkleProof: stateProof,
    aspMerkleProof: aspProof,
    stateRoot: stateProof.root as Hash,
    stateTreeDepth: MAX_TREE_DEPTH,
    aspRoot: state.aspRoot as Hash,
    aspTreeDepth: MAX_TREE_DEPTH,
    newNullifier: change.nullifier,
    newSecret: change.secret,
  });
  const h = (v: string | bigint) => toHex(BigInt(v), { size: 32 });
  // The Solidity verifier takes G2 coordinates in the reverse order of snarkjs.
  return {
    pA: [h(proof.pi_a[0]), h(proof.pi_a[1])],
    pB: [
      [h(proof.pi_b[0][1]), h(proof.pi_b[0][0])],
      [h(proof.pi_b[1][1]), h(proof.pi_b[1][0])],
    ],
    pC: [h(proof.pi_c[0]), h(proof.pi_c[1])],
    pubSignals: publicSignals.map(h) as SolidityProof["pubSignals"],
  };
}

// JSON wire format: every PoolState value is a bigint, sent as a decimal string.
export const encodePoolState = (s: PoolState) => JSON.stringify(s, (_, v) => (typeof v === "bigint" ? v.toString() : v));
export const decodePoolState = (text: string) => JSON.parse(text, (_, v) => (typeof v === "string" ? BigInt(v) : v)) as PoolState;
