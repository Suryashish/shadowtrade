import type { Circuits, PrivacyPoolSDK } from "@0xbow/privacy-pools-core-sdk";
import { erc20Abi, type Address, type WalletClient } from "viem";
import { entrypointAbi } from "./abi/privacyPools";
import { publicClient, write } from "./chain";
import { POOL_INDEX_LAG, PRIVACY_POOLS, RELAYER_ADDRESS, TOKENS, type Venue } from "./config";
import type { MasterKeys, PoolState } from "./notes";
import { relay, type RelayResponse } from "./relay";

/**
 * The private balance, backed by 0xbow Privacy Pools. Deposits are public, but withdrawals are
 * zero-knowledge proofs relayed by the server: on-chain, a withdrawal can't be tied to the deposit
 * it spends, only to the set of all approved deposits in the pool.
 *
 * `base` is the app origin; the browser uses same-origin and the Node test harness passes a URL.
 */

// The 0xbow SDK (with snarkjs, ~3 MB) is loaded on first use, keeping it out of the page's
// initial bundle and server render.
const notesModule = () => import("./notes");

let prover: Promise<{ sdk: PrivacyPoolSDK; circuits: Circuits }> | null = null;

// Circuit artifacts (~24 MB, hash-checked by the SDK) are served from /artifacts.
function getProver(base: string) {
  prover ??= import("@0xbow/privacy-pools-core-sdk").then(({ Circuits, PrivacyPoolSDK }) => {
    const circuits = new Circuits({ browser: true, baseUrl: `${base || window.location.origin}/` });
    return { sdk: new PrivacyPoolSDK(circuits), circuits };
  });
  return prover;
}

/** Loads the SDK and starts the one-time circuit download, so the first withdrawal doesn't wait. */
export function preloadProver(base = "") {
  getProver(base)
    .then(({ circuits }) => circuits.getProvingKey("withdraw"))
    .catch(() => undefined);
}

/** Syncs the server index and ASP (which approves new deposits) and returns the venue's pool history. */
export async function fetchPoolState(venue: Venue, base = ""): Promise<PoolState> {
  const res = await fetch(`${base}/api/pool?venue=${venue}`, { cache: "no-store" });
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "The privacy pool is unavailable.");
  const { decodePoolState } = await notesModule();
  return decodePoolState(await res.text());
}

export type PrivateBalance = { spendable: bigint; pending: bigint };

export async function privateBalance(keys: MasterKeys, venue: Venue, base = ""): Promise<PrivateBalance> {
  const [{ recoverNotes, spendable, pending }, state] = await Promise.all([notesModule(), fetchPoolState(venue, base)]);
  const { notes } = recoverNotes(keys, state);
  return { spendable: spendable(notes), pending: pending(notes) };
}

/** Total tokens held by the pool: the anonymity set every withdrawal hides in. */
export async function poolLiquidity(venue: Venue): Promise<bigint> {
  return publicClient.readContract({ address: TOKENS[venue].address, abi: erc20Abi, functionName: "balanceOf", args: [PRIVACY_POOLS.pools[venue].address] });
}

/** Smallest deposit the pool accepts. */
export async function minimumDeposit(venue: Venue): Promise<bigint> {
  const [, minimum] = await publicClient.readContract({ address: PRIVACY_POOLS.entrypoint, abi: entrypointAbi, functionName: "assetConfig", args: [TOKENS[venue].address] });
  return minimum;
}

/** Deposits from any wallet (main wallet or burner) into a new note owned by `keys`. */
export async function depositToPool(wallet: WalletClient, keys: MasterKeys, venue: Venue, amount: bigint, base = "") {
  const [{ recoverNotes, depositSecrets }, state] = await Promise.all([notesModule(), fetchPoolState(venue, base)]);
  const { nextDepositIndex } = recoverNotes(keys, state);
  const { precommitment } = depositSecrets(keys, PRIVACY_POOLS.pools[venue].scope, nextDepositIndex);
  const token = TOKENS[venue].address;
  await write(wallet, { address: token, abi: erc20Abi, functionName: "approve", args: [PRIVACY_POOLS.entrypoint, amount] });
  await write(wallet, { address: PRIVACY_POOLS.entrypoint, abi: entrypointAbi, functionName: "deposit", args: [token, amount, precommitment] });
  // Syncing makes the ASP approve the new deposit right away, so it is spendable immediately.
  await untilIndexed();
  await fetchPoolState(venue, base).catch(() => undefined);
}

/** The server indexer trails the head by POOL_INDEX_LAG blocks; waits until our latest tx is in its range. */
async function untilIndexed() {
  const target = (await publicClient.getBlockNumber()) + POOL_INDEX_LAG;
  while ((await publicClient.getBlockNumber()) < target) await new Promise((r) => setTimeout(r, 250));
}

// A new ASP root (any new deposit in the pool) landing between proving and relaying invalidates the
// proof; re-prove against the fresh state.
const STALE_PROOF = /IncorrectASPRoot|UnknownStateRoot/;
const MAX_STALE_RETRIES = 4;

/** Proves and relays withdrawals of `amount` to `recipient`, one per note spent. */
export async function withdrawFromPool(opts: {
  keys: MasterKeys;
  venue: Venue;
  amount: bigint;
  recipient: Address;
  base?: string;
  onPart?: (index: number, total: number) => void;
}): Promise<RelayResponse[]> {
  const { keys, venue, recipient, base = "" } = opts;
  const { planWithdrawal, proveWithdrawal, recoverNotes, relayWithdrawal } = await notesModule();
  const withdrawal = relayWithdrawal(PRIVACY_POOLS.entrypoint, recipient, RELAYER_ADDRESS);
  const receipts: RelayResponse[] = [];
  let left = opts.amount;
  let retries = 0;
  while (left > 0n) {
    const state = await fetchPoolState(venue, base);
    const plan = planWithdrawal(recoverNotes(keys, state).notes, left);
    opts.onPart?.(receipts.length + 1, receipts.length + plan.length);
    const [{ note, amount }] = plan;
    const proof = await proveWithdrawal((await getProver(base)).sdk, keys, state, note, amount, withdrawal);
    try {
      receipts.push(await relay({ kind: "withdraw", venue, withdrawal, proof }, base));
      left -= amount;
      // The next plan (and the caller's balance) must see this spend and its change note.
      await untilIndexed();
    } catch (e) {
      if (!(e instanceof Error && STALE_PROOF.test(e.message)) || retries++ >= MAX_STALE_RETRIES) throw e;
    }
  }
  return receipts;
}
