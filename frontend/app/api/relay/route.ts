import { BaseError, ContractFunctionRevertedError, decodeAbiParameters, isAddress, isAddressEqual, isHex, type Address, type Hash, type Hex } from "viem";
import { entrypointAbi, privacyPoolAbi } from "@/lib/abi/privacyPools";
import { publicClient, sendValue, write } from "@/lib/chain";
import { BURNER_GAS_DRIP, IS_FORK, isPoolVenue, PRIVACY_POOLS } from "@/lib/config";
import type { RelayRequest } from "@/lib/relay";
import { enqueue, relayerWallet } from "@/lib/relayer.server";

const dripped = new Set<string>();

// Best-effort abuse limits. State is per server instance (lost on restart / not shared across
// serverless instances); the on-chain "brand-new address" check and the balance floor below are
// the restart-proof backstops.
const WINDOW_MS = 10 * 60_000;
const MAX_GAS_PER_IP = 6; // one drip per stealth session
const MAX_WITHDRAW_PER_IP = 20;
const MAX_GAS_PER_WINDOW = 10; // global: caps drain at ~5 MON per window
const MAX_WITHDRAW_PER_WINDOW = 60; // global: each relayed withdrawal costs the relayer gas
const MIN_RELAYER_BALANCE = 1_000_000_000_000_000_000n; // keep 1 MON for withdrawals and ASP roots
const MIN_RELAYER_BALANCE_TO_RELAY = 100_000_000_000_000_000n; // 0.1 MON
const MAX_BODY_BYTES = 8192;
const hits = new Map<string, number[]>();
let globalGas: number[] = [];
let globalWithdraws: number[] = [];

function allow(bucket: string, limit: number, store = hits): boolean {
  const now = Date.now();
  const recent = (store.get(bucket) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) {
    store.set(bucket, recent);
    return false;
  }
  recent.push(now);
  store.set(bucket, recent);
  if (store.size > 5000) for (const [k, v] of store) if (v.every((t) => now - t >= WINDOW_MS)) store.delete(k);
  return true;
}

class RelayError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
async function dripGas(to: Address): Promise<Hash> {
  const key = to.toLowerCase();
  if (dripped.has(key)) throw new RelayError("This burner was already funded.");
  const [nonce, balance] = await Promise.all([publicClient.getTransactionCount({ address: to }), publicClient.getBalance({ address: to })]);
  // Only brand-new accounts get gas, so the relayer can't be drained into existing wallets.
  if (nonce > 0 || balance > 0n) throw new RelayError("Gas is only sent to brand-new burner wallets.");
  const wallet = relayerWallet();
  const relayerBalance = await publicClient.getBalance({ address: wallet.account.address });
  if (relayerBalance < MIN_RELAYER_BALANCE + BURNER_GAS_DRIP) throw new RelayError("The relayer is out of gas funds.", 503);
  dripped.add(key);
  return sendValue(wallet, to, BURNER_GAS_DRIP).catch((e: unknown) => {
    dripped.delete(key);
    throw e;
  });
}

type PoolError = Extract<(typeof privacyPoolAbi)[number], { type: "error" }>;
// Pool reverts (ContextMismatch, NullifierAlreadySpent, ...) bubble up through relay(); include the
// pool's errors so they decode by name.
const relayAbi = [...entrypointAbi, ...privacyPoolAbi.filter((item): item is PoolError => item.type === "error")];

type Bigs<N extends number, T extends bigint[] = []> = T["length"] extends N ? T : Bigs<N, [...T, bigint]>;
const isWord = (v: unknown): v is Hex => typeof v === "string" && isHex(v) && v.length === 66;
const words = (v: unknown, n: number) => Array.isArray(v) && v.length === n;

/** Relays a ZK withdrawal through the Entrypoint, so the recipient never needs gas or a link to the depositor. */
async function relayWithdraw(req: Extract<RelayRequest, { kind: "withdraw" }>): Promise<Hash> {
  const { withdrawal, proof } = req;
  const validShape =
    isPoolVenue(req.venue) &&
    isAddress(withdrawal?.processooor) &&
    isHex(withdrawal?.data) &&
    words(proof?.pA, 2) &&
    words(proof?.pC, 2) &&
    words(proof?.pubSignals, 8) &&
    words(proof?.pB, 2) &&
    proof.pB.every((row) => words(row, 2) && row.every(isWord)) &&
    [...proof.pA, ...proof.pC, ...proof.pubSignals].every(isWord);
  if (!validShape) throw new RelayError("Invalid withdrawal request.");
  if (!isAddressEqual(withdrawal.processooor, PRIVACY_POOLS.entrypoint)) throw new RelayError("Invalid withdrawal request.");
  let fee: bigint;
  try {
    [{ relayFeeBPS: fee }] = decodeAbiParameters(
      [{ type: "tuple", components: [{ name: "recipient", type: "address" }, { name: "feeRecipient", type: "address" }, { name: "relayFeeBPS", type: "uint256" }] }],
      withdrawal.data,
    );
  } catch {
    throw new RelayError("Invalid withdrawal request.");
  }
  if (fee !== 0n) throw new RelayError("This relayer charges no fee.");
  // The proof itself (nullifier, roots, context binding recipient and amount) is checked on-chain;
  // write() simulates first, so an invalid proof costs the relayer no gas.
  const wallet = relayerWallet();
  if ((await publicClient.getBalance({ address: wallet.account.address })) < MIN_RELAYER_BALANCE_TO_RELAY) throw new RelayError("The relayer is out of gas funds.", 503);
  return write(wallet, {
    address: PRIVACY_POOLS.entrypoint,
    abi: relayAbi,
    functionName: "relay",
    args: [
      withdrawal,
      {
        pA: [BigInt(proof.pA[0]), BigInt(proof.pA[1])],
        pB: [
          [BigInt(proof.pB[0][0]), BigInt(proof.pB[0][1])],
          [BigInt(proof.pB[1][0]), BigInt(proof.pB[1][1])],
        ],
        pC: [BigInt(proof.pC[0]), BigInt(proof.pC[1])],
        pubSignals: proof.pubSignals.map(BigInt) as Bigs<8>,
      },
      PRIVACY_POOLS.pools[req.venue].scope,
    ],
  });
}

/** Contract revert name (e.g. IncorrectASPRoot), which clients use to retry or explain. */
function revertName(e: unknown): string | undefined {
  if (!(e instanceof BaseError)) return undefined;
  const reverted = e.walk((err) => err instanceof ContractFunctionRevertedError);
  return reverted instanceof ContractFunctionRevertedError ? reverted.data?.errorName : undefined;
}

function parse(body: unknown): RelayRequest {
  if (typeof body !== "object" || body === null || !("kind" in body)) throw new RelayError("Invalid request.");
  const req = body as RelayRequest;
  if (req.kind === "gas" && isAddress(req.to)) return req;
  if (req.kind === "withdraw") return req;
  throw new RelayError("Invalid request.");
}

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) throw new RelayError("Request too large.", 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new RelayError("Invalid request.");
    }
    const req = parse(body);
    const ip = clientIp(request);
    // A local fork's gas is free, and the e2e suite opens several sessions back to back.
    if (!IS_FORK && !allow(`${req.kind}:${ip}`, req.kind === "gas" ? MAX_GAS_PER_IP : MAX_WITHDRAW_PER_IP)) {
      throw new RelayError("Too many requests. Try again later.", 429);
    }
    if (!IS_FORK) {
      const now = Date.now();
      const recent = (req.kind === "gas" ? globalGas : globalWithdraws).filter((t) => now - t < WINDOW_MS);
      if (recent.length >= (req.kind === "gas" ? MAX_GAS_PER_WINDOW : MAX_WITHDRAW_PER_WINDOW)) throw new RelayError("The relayer is busy. Try again later.", 429);
      recent.push(now);
      if (req.kind === "gas") globalGas = recent;
      else globalWithdraws = recent;
    }
    const hash = await enqueue(() => (req.kind === "gas" ? dripGas(req.to) : relayWithdraw(req)));
    const receipt = await publicClient.getTransactionReceipt({ hash });
    return Response.json({ hash, block: receipt.blockNumber.toString() });
  } catch (e) {
    if (e instanceof RelayError) return Response.json({ error: e.message }, { status: e.status });
    const name = revertName(e);
    if (name) return Response.json({ error: name }, { status: 400 });
    // Never echo raw errors: viem messages can embed the RPC URL (with API keys) and request data.
    const short = e instanceof Error ? (e as Error & { shortMessage?: string }).shortMessage : undefined;
    console.error("relay failed:", short ?? (e instanceof Error ? e.name : "unknown"));
    return Response.json({ error: short ? short.slice(0, 200) : "Relay failed." }, { status: 400 });
  }
}
