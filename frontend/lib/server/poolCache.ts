import { BaseError, ContractFunctionRevertedError, type Address } from "viem";
import { entrypointAbi } from "@/lib/abi/entrypoint";
import { privacyPoolAbi } from "@/lib/abi/privacyPool";
import { publicClient, write } from "@/lib/chain";
import { DEPLOYMENT, ENTRYPOINT, POOLS } from "@/lib/config";
import { loadPrivacySdk } from "@/lib/privacySdk";
import type { PoolApiResponse, PoolSnapshot } from "@/lib/poolState";
import { enqueue, relayerWallet } from "./relayer";

// Monad's RPC rejects eth_getLogs ranges over 100 blocks.
const MAX_LOG_SPAN = 99n;
// updateRoot only checks the CID length (32 to 64 chars); the ASP does not publish its data set yet.
// Every new root invalidates proofs made against the old one, so roots are batched instead of posted per deposit.
const ROOT_UPDATE_INTERVAL_MS = 15_000;
const PLACEHOLDER_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

type Cache = {
  next: bigint;
  pools: Record<string, PoolSnapshot>;
  /** Every deposit across pools in chain order; the ASP tree covers labels from all pools. */
  deposits: { depositor: Address; label: bigint }[];
  confirmed: { root: bigint; labels: bigint[] };
  lastRootPost: number;
  chain: Promise<unknown>;
};

const shared = globalThis as typeof globalThis & { __poolCache?: Cache };

function cache(): Cache {
  shared.__poolCache ??= {
    next: BigInt(DEPLOYMENT.startBlock),
    pools: Object.fromEntries(POOLS.map((p) => [p.symbol, { leaves: [], deposits: [], withdrawals: [], ragequits: [] }])),
    deposits: [],
    confirmed: { root: 0n, labels: [] },
    lastRootPost: 0,
    chain: Promise.resolve(),
  };
  return shared.__poolCache;
}

const denylist = () => new Set((process.env.ASP_DENYLIST ?? "").split(",").map((a) => a.trim().toLowerCase()).filter(Boolean));

async function syncEvents(c: Cache): Promise<bigint> {
  const head = await publicClient.getBlockNumber();
  const symbolByAddress = new Map(POOLS.map((p) => [p.address.toLowerCase(), p.symbol]));
  while (c.next <= head) {
    const to = c.next + MAX_LOG_SPAN < head ? c.next + MAX_LOG_SPAN : head;
    const logs = await publicClient.getLogs({ address: POOLS.map((p) => p.address), events: privacyPoolAbi, fromBlock: c.next, toBlock: to, strict: true });
    for (const log of logs) {
      const pool = c.pools[symbolByAddress.get(log.address.toLowerCase()) ?? ""];
      if (!pool) continue;
      if (log.eventName === "LeafInserted") pool.leaves.push(log.args._leaf.toString());
      else if (log.eventName === "Deposited") {
        const a = log.args;
        pool.deposits.push({ depositor: a._depositor, commitment: a._commitment.toString(), label: a._label.toString(), value: a._value.toString(), precommitment: a._precommitmentHash.toString() });
        c.deposits.push({ depositor: a._depositor, label: a._label });
      } else if (log.eventName === "Withdrawn") {
        const a = log.args;
        pool.withdrawals.push({ spentNullifier: a._spentNullifier.toString(), withdrawn: a._value.toString(), newCommitment: a._newCommitment.toString() });
      } else pool.ragequits.push({ label: log.args._label.toString() });
    }
    c.next = to + 1n;
  }
  return head;
}

async function onchainRoot(): Promise<bigint> {
  try {
    return await publicClient.readContract({ address: ENTRYPOINT, abi: entrypointAbi, functionName: "latestRoot" });
  } catch (e) {
    // The Entrypoint reverts with NoRootsAvailable until the first root is posted.
    if (e instanceof BaseError && e.walk((x) => x instanceof ContractFunctionRevertedError)) return 0n;
    throw e;
  }
}

/** The screening stub: every depositor is approved unless listed in ASP_DENYLIST. */
function approvedLabels(c: Cache): bigint[] {
  const blocked = denylist();
  return c.deposits.filter((d) => !blocked.has(d.depositor.toLowerCase())).map((d) => d.label);
}

async function rootOf(labels: bigint[]): Promise<bigint> {
  if (labels.length === 0) return 0n;
  const { generateMerkleProof } = await loadPrivacySdk();
  return generateMerkleProof(labels, labels[0]).root;
}

/** Labels are append-only, so a root that is behind the target is the root of an earlier prefix. */
async function prefixWithRoot(labels: bigint[], root: bigint): Promise<bigint[]> {
  for (let size = labels.length - 1; size > 0; size--) if ((await rootOf(labels.slice(0, size))) === root) return labels.slice(0, size);
  return [];
}

/** Posts the ASP root over all approved labels when the on-chain one is behind (at most once per interval). */
async function postman(c: Cache): Promise<void> {
  const labels = approvedLabels(c);
  const target = await rootOf(labels);
  let current = await onchainRoot();
  const due = current === 0n || Date.now() - c.lastRootPost >= ROOT_UPDATE_INTERVAL_MS;
  if (target !== 0n && target !== current && due) {
    try {
      await enqueue(async () => {
        // Re-check inside the queue: a concurrent request may already have posted this root.
        if ((await onchainRoot()) === target) return;
        await write(relayerWallet(), { address: ENTRYPOINT, abi: entrypointAbi, functionName: "updateRoot", args: [target, PLACEHOLDER_CID] });
      });
      current = target;
      c.lastRootPost = Date.now();
    } catch (e) {
      // Deposits stay pending and the next request retries; balances must still load.
      console.error("ASP root update failed:", e instanceof BaseError ? e.shortMessage : e instanceof Error ? e.name : "unknown");
    }
  }
  if (current === target) c.confirmed = { root: target, labels };
  else if (c.confirmed.root !== current) c.confirmed = { root: current, labels: await prefixWithRoot(labels, current) };
}

/** Syncs events, approves new deposits and returns the public pool state. Calls are serialized. */
export function poolState(): Promise<PoolApiResponse> {
  const c = cache();
  const run = c.chain.then(async () => {
    const block = await syncEvents(c);
    await postman(c);
    return {
      asp: { root: c.confirmed.root.toString(), labels: c.confirmed.labels.map(String) },
      pools: c.pools,
      block: block.toString(),
    };
  });
  c.chain = run.catch(() => undefined);
  return run;
}
