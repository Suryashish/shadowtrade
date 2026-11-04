import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon2 } from "poseidon-lite";
import { BaseError, ContractFunctionRevertedError, parseAbi, type Address, type Log } from "viem";
import { entrypointAbi } from "./abi/privacyPools";
import { publicClient, write } from "./chain";
import { PRIVACY_POOLS, type Venue } from "./config";
import type { PoolState } from "./notes";
import { enqueue, relayerWallet } from "./relayer.server";

/**
 * Server-side indexer and Association Set Provider (ASP).
 *
 * Indexes each pool's public events so clients can rebuild their notes and Merkle proofs locally
 * (the server never learns which note a client spends). As the ASP it approves every deposit and
 * posts the root of all approved labels to the Entrypoint; withdrawals must prove membership in
 * the latest root. A production ASP would screen deposits here before approving them.
 */

const poolEvents = parseAbi([
  "event LeafInserted(uint256 _index, uint256 _leaf, uint256 _root)",
  "event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)",
  "event Withdrawn(address indexed _processooor, uint256 _value, uint256 _spentNullifier, uint256 _newCommitment)",
  "event Ragequit(address indexed _ragequitter, uint256 _commitment, uint256 _label, uint256 _value)",
]);

// Monad RPCs cap eth_getLogs at 100 blocks per call.
const LOG_RANGE = 100n;
const PARALLEL_RANGES = 8;
// Entrypoint.updateRoot requires a 32-64 byte CID. This ASP publishes its label set over HTTP
// (GET /api/pool), not IPFS, so the CID is a fixed tag.
const ASP_CID = "shadowtrade-asp-approve-all-v1-http-api-pool";

type Deposit = PoolState["deposits"][number] & { order: bigint };

type Index = {
  scannedTo: bigint;
  leaves: bigint[];
  deposits: Deposit[];
  withdrawals: PoolState["withdrawals"];
  ragequitLabels: bigint[];
};

// Survives dev hot reloads; a cold start rescans from the deployment block.
type Asp = { labels: bigint[]; root: bigint };
const store = globalThis as typeof globalThis & { __poolIndex?: Map<Address, Index>; __poolSync?: { running: Promise<Asp> | null; next: Promise<Asp> | null } };
const indexes: Map<Address, Index> = (store.__poolIndex ??= new Map());

const order = (log: Log) => (log.blockNumber! << 32n) | BigInt(log.logIndex!);

async function scanRange(pool: Address, fromBlock: bigint, toBlock: bigint) {
  return publicClient.getLogs({ address: pool, events: poolEvents, fromBlock, toBlock, strict: true });
}

async function syncPool(pool: Address, head: bigint) {
  // Registered up front so progress survives a failed batch.
  const idx: Index = indexes.get(pool) ?? { scannedTo: PRIVACY_POOLS.deploymentBlock - 1n, leaves: [], deposits: [], withdrawals: [], ragequitLabels: [] };
  indexes.set(pool, idx);
  const ranges: [bigint, bigint][] = [];
  for (let from = idx.scannedTo + 1n; from <= head; from += LOG_RANGE) ranges.push([from, from + LOG_RANGE - 1n > head ? head : from + LOG_RANGE - 1n]);
  for (let i = 0; i < ranges.length; i += PARALLEL_RANGES) {
    const batches = await Promise.all(ranges.slice(i, i + PARALLEL_RANGES).map(([from, to]) => scanRange(pool, from, to)));
    // Applied to copies and committed together, so a bad batch can't leave the index half-updated.
    const next = { leaves: [...idx.leaves], deposits: [...idx.deposits], withdrawals: [...idx.withdrawals], ragequitLabels: [...idx.ragequitLabels] };
    for (const log of batches.flat().sort((a, b) => (order(a) < order(b) ? -1 : 1))) {
      if (log.eventName === "LeafInserted") {
        // `_index` is the tree size after the insert. Leaves must arrive gap-free, or every Merkle
        // proof built from them would be wrong.
        if (log.args._index !== BigInt(next.leaves.length + 1)) throw new Error(`Pool index out of order at leaf ${log.args._index}`);
        next.leaves.push(log.args._leaf);
      } else if (log.eventName === "Deposited") {
        const { _label: label, _commitment: commitment, _value: value, _precommitmentHash: precommitment } = log.args;
        next.deposits.push({ label, commitment, value, precommitment, order: order(log) });
      } else if (log.eventName === "Withdrawn") {
        next.withdrawals.push({ spentNullifier: log.args._spentNullifier, newCommitment: log.args._newCommitment, value: log.args._value });
      } else {
        next.ragequitLabels.push(log.args._label);
      }
    }
    Object.assign(idx, next, { scannedTo: ranges[Math.min(i + PARALLEL_RANGES, ranges.length) - 1][1] });
  }
}

async function latestRoot(): Promise<bigint> {
  try {
    return await publicClient.readContract({ address: PRIVACY_POOLS.entrypoint, abi: entrypointAbi, functionName: "latestRoot" });
  } catch (e) {
    // Reverts until the first root is posted; any other failure must not look like "no root",
    // or the ASP would post a redundant root and invalidate in-flight proofs.
    const reverted = e instanceof BaseError && e.walk((err) => err instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError && reverted.data?.errorName === "NoRootsAvailable") return 0n;
    throw e;
  }
}

/** All deposit labels across pools, oldest first. Append-only, so every posted root is a prefix of it. */
function allLabels(): bigint[] {
  return Object.values(PRIVACY_POOLS.pools)
    .flatMap((p) => indexes.get(p.address)?.deposits ?? [])
    .sort((a, b) => (a.order < b.order ? -1 : 1))
    .map((d) => d.label);
}

/** The prefix of `labels` whose tree root is `root`: what the ASP has approved on-chain so far. */
function approvedPrefix(labels: bigint[], root: bigint): bigint[] {
  const tree = new LeanIMT<bigint>((a, b) => poseidon2([a, b]));
  for (let i = 0; i < labels.length; i++) {
    tree.insert(labels[i]);
    if (tree.root === root) return labels.slice(0, i + 1);
  }
  return [];
}

async function approveAll(): Promise<Asp> {
  const labels = allLabels();
  const current = await latestRoot();
  if (labels.length === 0) return { labels: [], root: current };
  const tree = new LeanIMT<bigint>((a, b) => poseidon2([a, b]), labels);
  if (tree.root !== current) {
    await enqueue(() => write(relayerWallet(), { address: PRIVACY_POOLS.entrypoint, abi: entrypointAbi, functionName: "updateRoot", args: [tree.root, ASP_CID] }));
  }
  return { labels, root: tree.root };
}

async function syncAll(): Promise<Asp> {
  const head = await publicClient.getBlockNumber();
  // Every pool shares the Entrypoint's one ASP root, so all are indexed to the same block.
  await Promise.all(Object.values(PRIVACY_POOLS.pools).map((p) => syncPool(p.address, head)));
  try {
    return await approveAll();
  } catch (e) {
    console.error("ASP root update failed:", e instanceof BaseError ? e.shortMessage : e instanceof Error ? e.name : "unknown");
    // Posting failed (e.g. relayer out of gas): serve the set that is approved on-chain, so
    // proofs still match the latest root; newer deposits stay pending until the next sync.
    const root = await latestRoot();
    return { labels: approvedPrefix(allLabels(), root), root };
  }
}

const syncs = (store.__poolSync ??= { running: null, next: null });

/**
 * One sync at a time. Callers arriving mid-sync share a single follow-up sync (which starts after
 * their request, so it sees their latest transaction): at most two syncs, however many callers.
 */
function sync(): Promise<Asp> {
  if (!syncs.running) {
    syncs.running = syncAll().finally(() => (syncs.running = null));
    return syncs.running;
  }
  syncs.next ??= syncs.running.catch(() => undefined).then(() => {
    syncs.next = null;
    return sync();
  });
  return syncs.next;
}

/** Indexes new events, approves new deposits, and returns the venue's pool state for clients. */
export async function poolState(venue: Venue): Promise<PoolState> {
  const asp = await sync();
  const idx = indexes.get(PRIVACY_POOLS.pools[venue].address)!;
  return {
    scope: PRIVACY_POOLS.pools[venue].scope,
    leaves: idx.leaves,
    deposits: idx.deposits.map(({ label, commitment, value, precommitment }) => ({ label, commitment, value, precommitment })),
    withdrawals: idx.withdrawals,
    ragequitLabels: idx.ragequitLabels,
    aspLabels: asp.labels,
    aspRoot: asp.root,
  };
}
