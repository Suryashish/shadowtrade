import { encodeAbiParameters, erc20Abi, formatUnits, type Address, type WalletClient } from "viem";
import { entrypointAbi, relayDataParams } from "./abi/entrypoint";
import { publicClient, write } from "./chain";
import { ENTRYPOINT, POOLS, poolForToken, RELAYER_ADDRESS, TOKENS, type Pool } from "./config";
import { loadPrivacySdk, type Hash, type MasterKeys, type Secret } from "./privacySdk";
import type { PoolApiResponse, PoolSnapshot } from "./poolState";
import { relay, RelayFailure, STALE_STATUS, type ProofWire, type WithdrawRequest } from "./relay";

/** Lets the Node test harness point the pool at its own server; the browser uses same-origin defaults. */
export type PoolEnv = {
  /** Origin serving /api/pool and /api/relay. */
  apiBase?: string;
  /** Where the SDK reads circuit artifacts from. Defaults to this origin's /artifacts. */
  circuits?: { browser: boolean; baseUrl: string };
};

export type OnProving = () => void;

const MAX_PROOF_ATTEMPTS = 3;

/** One unspent commitment owned by the user's keys. */
export type Note = {
  pool: Pool;
  label: bigint;
  value: bigint;
  nullifier: Secret;
  secret: Secret;
  /** Withdrawals already made from this account; also the index of the next change secrets. */
  children: bigint;
  approved: boolean;
};

export type PoolAccount = {
  state: PoolApiResponse;
  /** Notes with a balance, per pool symbol. */
  notes: Record<string, Note[]>;
  /** First deposit index whose precommitment has not been used on-chain, per pool symbol. */
  nextDepositIndex: Record<string, bigint>;
  /** False when the ASP data doesn't hash to the on-chain root; nothing counts as approved then. */
  aspConsistent: boolean;
};

export async function fetchPoolState(env: PoolEnv = {}): Promise<PoolApiResponse> {
  const res = await fetch(`${env.apiBase ?? ""}/api/pool`, { cache: "no-store" });
  const body = (await res.json()) as PoolApiResponse | { error: string };
  if (!res.ok || "error" in body) throw new Error("error" in body ? body.error : "Pool data is unavailable right now.");
  return body;
}

const emptySnapshot: PoolSnapshot = { leaves: [], deposits: [], withdrawals: [], ragequits: [] };

/**
 * Rebuilds the user's notes from public events alone: deposit secrets are deterministic per index,
 * and each spend's change secrets are deterministic per (label, child index), so the keys are enough.
 */
async function recoverNotes(keys: MasterKeys, pool: Pool, snapshot: PoolSnapshot, approved: Set<string>): Promise<{ notes: Note[]; next: bigint }> {
  const { generateDepositSecrets, generateWithdrawalSecrets, hashPrecommitment, poseidon } = await loadPrivacySdk();
  const commitmentHash = (value: bigint, label: bigint, nullifier: Secret, secret: Secret) => poseidon([value, label, hashPrecommitment(nullifier, secret)]);
  const nullifierHash = (nullifier: Secret) => poseidon([nullifier]).toString();
  const depositByPrecommitment = new Map(snapshot.deposits.map((d) => [d.precommitment, d]));
  const spendByNullifier = new Map(snapshot.withdrawals.map((w) => [w.spentNullifier, w]));
  const ragequit = new Set(snapshot.ragequits.map((r) => r.label));

  const notes: Note[] = [];
  let index = 0n;
  for (;; index++) {
    const { nullifier, secret } = generateDepositSecrets(keys, pool.scope as Hash, index);
    const deposit = depositByPrecommitment.get(hashPrecommitment(nullifier, secret).toString());
    if (!deposit) break;

    const label = BigInt(deposit.label);
    let note: Note = { pool, label, value: BigInt(deposit.value), nullifier, secret, children: 0n, approved: approved.has(deposit.label) };
    let spend = spendByNullifier.get(nullifierHash(nullifier));
    while (spend) {
      const child = generateWithdrawalSecrets(keys, label as Hash, note.children);
      const value = note.value - BigInt(spend.withdrawn);
      if (commitmentHash(value, label, child.nullifier, child.secret).toString() !== spend.newCommitment) break;
      note = { ...note, value, nullifier: child.nullifier, secret: child.secret, children: note.children + 1n };
      spend = spendByNullifier.get(nullifierHash(child.nullifier));
    }
    if (!ragequit.has(deposit.label) && note.value > 0n && !spend) notes.push(note);
  }
  return { notes, next: index };
}

export async function loadAccount(keys: MasterKeys, env: PoolEnv = {}): Promise<PoolAccount> {
  const [state, sdk] = await Promise.all([fetchPoolState(env), loadPrivacySdk()]);
  const labels = state.asp.labels.map(BigInt);
  const aspConsistent = labels.length > 0 && sdk.generateMerkleProof(labels, labels[0]).root.toString() === state.asp.root;
  const approved = new Set(aspConsistent ? state.asp.labels : []);

  const notes: PoolAccount["notes"] = {};
  const nextDepositIndex: PoolAccount["nextDepositIndex"] = {};
  for (const pool of POOLS) {
    const recovered = await recoverNotes(keys, pool, state.pools[pool.symbol] ?? emptySnapshot, approved);
    notes[pool.symbol] = recovered.notes;
    nextDepositIndex[pool.symbol] = recovered.next;
  }
  return { state, notes, nextDepositIndex, aspConsistent };
}

/** Spendable balance (ASP-approved, unspent) and deposits still waiting for approval. */
export function balancesOf(account: PoolAccount, token: Address): { spendable: bigint; pending: bigint } {
  let spendable = 0n;
  let pending = 0n;
  for (const note of account.notes[poolForToken(token).symbol] ?? []) {
    if (note.approved) spendable += note.value;
    else pending += note.value;
  }
  return { spendable, pending };
}

export async function privateBalance(token: Address, keys: MasterKeys, env: PoolEnv = {}): Promise<bigint> {
  return balancesOf(await loadAccount(keys, env), token).spendable;
}

/** Total tokens held by the pool: the anonymity set every burner hides in. */
export async function poolLiquidity(token: Address): Promise<bigint> {
  return publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [poolForToken(token).address] });
}

/**
 * Deposits from any wallet (main wallet or burner) into the user's private balance. The precommitment
 * comes from the user's keys, so the depositing wallet never owns the note.
 */
export async function depositToPool(wallet: WalletClient, token: Address, amount: bigint, keys: MasterKeys, env: PoolEnv = {}) {
  const pool = poolForToken(token);
  const { generateDepositSecrets, hashPrecommitment } = await loadPrivacySdk();
  const account = await loadAccount(keys, env);
  const { nullifier, secret } = generateDepositSecrets(keys, pool.scope as Hash, account.nextDepositIndex[pool.symbol]);
  await write(wallet, { address: token, abi: erc20Abi, functionName: "approve", args: [ENTRYPOINT, amount] });
  await write(wallet, { address: ENTRYPOINT, abi: entrypointAbi, functionName: "deposit", args: [token, amount, hashPrecommitment(nullifier, secret)] });
  // Polling approves it too; this just makes the balance spendable right away.
  await fetchPoolState(env).catch(() => undefined);
}

function pickNote(account: PoolAccount, pool: Pool, amount: bigint): Note {
  const notes = account.notes[pool.symbol] ?? [];
  const spendable = notes.filter((n) => n.approved);
  const fit = spendable.filter((n) => n.value >= amount).sort((a, b) => (a.value < b.value ? -1 : 1))[0];
  if (fit) return fit;
  if (spendable.length === 0) throw new Error(notes.length ? "Your deposit is still waiting for approval. Try again in a moment." : "You have no private balance in this pool.");
  const largest = spendable.reduce((m, n) => (n.value > m.value ? n : m));
  const decimals = Object.values(TOKENS).find((t) => t.address === pool.token)?.decimals ?? 6;
  throw new Error(`No single private note covers that amount. Your largest note holds ${formatUnits(largest.value, decimals)}.`);
}

function wireProof(zk: { proof: { pi_a: string[]; pi_b: string[][]; pi_c: string[] }; publicSignals: string[] }): ProofWire {
  const { pi_a, pi_b, pi_c } = zk.proof;
  // snarkjs lists G2 coordinates as (x0, x1); the Solidity verifier wants (x1, x0).
  return {
    pA: [pi_a[0], pi_a[1]],
    pB: [
      [pi_b[0][1], pi_b[0][0]],
      [pi_b[1][1], pi_b[1][0]],
    ],
    pC: [pi_c[0], pi_c[1]],
    pubSignals: zk.publicSignals,
  };
}

/** Depth of a LeanIMT holding `size` leaves. */
function treeDepth(size: number): bigint {
  return size <= 1 ? 0n : BigInt((size - 1).toString(2).length);
}

/** Picks a note and proves the withdrawal against the current state, producing the relayer request. */
export async function proveWithdrawal(keys: MasterKeys, token: Address, amount: bigint, recipient: Address, env: PoolEnv = {}, onProving?: OnProving): Promise<WithdrawRequest> {
  const pool = poolForToken(token);
  const account = await loadAccount(keys, env);
  if (!account.aspConsistent) throw new Error("The association set is not ready yet. Try again in a moment.");
  const note = pickNote(account, pool, amount);

  const sdk = await loadPrivacySdk();
  const withdrawal = {
    processooor: ENTRYPOINT,
    data: encodeAbiParameters(relayDataParams, [{ recipient, feeRecipient: RELAYER_ADDRESS, relayFeeBPS: 0n }]),
  };
  const commitment = sdk.getCommitment(note.value, note.label, note.nullifier, note.secret);
  const change = sdk.generateWithdrawalSecrets(keys, note.label as Hash, note.children);
  const stateLeaves = account.state.pools[pool.symbol].leaves.map(BigInt);
  const aspLabels = account.state.asp.labels.map(BigInt);
  const stateProof = sdk.generateMerkleProof(stateLeaves, commitment.hash);
  const aspProof = sdk.generateMerkleProof(aspLabels, note.label);

  onProving?.();
  const circuits = new sdk.Circuits(env.circuits ?? { browser: true, baseUrl: window.location.origin });
  const zk = await new sdk.PrivacyPoolSDK(circuits).proveWithdrawal(commitment, {
    context: BigInt(sdk.calculateContext(withdrawal, pool.scope as Hash)),
    withdrawalAmount: amount,
    stateMerkleProof: stateProof,
    aspMerkleProof: aspProof,
    stateRoot: stateProof.root as Hash,
    stateTreeDepth: treeDepth(stateLeaves.length),
    aspRoot: aspProof.root as Hash,
    aspTreeDepth: treeDepth(aspLabels.length),
    newNullifier: change.nullifier,
    newSecret: change.secret,
  });
  return { scope: pool.scope.toString(), withdrawal, proof: wireProof(zk) };
}

async function proveAndRelay(keys: MasterKeys, token: Address, amount: bigint, recipient: Address, env: PoolEnv, onProving?: OnProving) {
  return relay({ kind: "withdraw", ...(await proveWithdrawal(keys, token, amount, recipient, env, onProving)) }, env.apiBase);
}

/**
 * Pays `amount` from one private note to `recipient` through the relayer with a zero-knowledge proof.
 * If the ASP or state root moved while proving, re-proves against fresh state (a busy pool keeps moving).
 */
export async function withdrawToAddress(keys: MasterKeys, token: Address, amount: bigint, recipient: Address, onProving?: OnProving, env: PoolEnv = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await proveAndRelay(keys, token, amount, recipient, env, onProving);
    } catch (e) {
      if (!(e instanceof RelayFailure && e.status === STALE_STATUS) || attempt >= MAX_PROOF_ATTEMPTS) throw e;
    }
  }
}
