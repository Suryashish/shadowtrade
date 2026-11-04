import { createWalletClient, http, isAddress, isHex, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { shadowPoolAbi } from "@/lib/abi/pool";
import { publicClient, sendValue, write } from "@/lib/chain";
import { BURNER_GAS_DRIP, IS_FORK, monadTestnet, RPC_URL, SHADOW_POOL, TOKENS } from "@/lib/config";
import type { RelayRequest } from "@/lib/relay";

const ALLOWED_TOKENS = new Set(Object.values(TOKENS).map((t) => t.address.toLowerCase()));
const dripped = new Set<string>();

// Best-effort abuse limits. State is per server instance (lost on restart / not shared across
// serverless instances); the on-chain "brand-new address" check and the balance floor below are
// the restart-proof backstops.
const WINDOW_MS = 10 * 60_000;
const MAX_GAS_PER_IP = 6; // one drip per stealth session
const MAX_WITHDRAW_PER_IP = 20;
const MAX_GAS_PER_WINDOW = 10; // global: caps drain at ~5 MON per window
const MIN_RELAYER_BALANCE = 1_000_000_000_000_000_000n; // keep 1 MON for withdrawals
const MAX_BODY_BYTES = 4096;
const hits = new Map<string, number[]>();
let globalGas: number[] = [];

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
let queue: Promise<unknown> = Promise.resolve();

function relayerWallet() {
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key || !isHex(key)) throw new Error("Relayer is not configured.");
  return createWalletClient({ account: privateKeyToAccount(key), chain: monadTestnet, transport: http(RPC_URL) });
}

// One relayer key: serialize sends so nonces and Monad's per-sender pacing stay correct.
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
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

async function relayWithdraw(req: Extract<RelayRequest, { kind: "withdraw" }>): Promise<Hash> {
  const valid =
    isAddress(req.token) &&
    isAddress(req.to) &&
    isAddress(req.owner) &&
    isHex(req.signature) &&
    /^\d+$/.test(req.amount) &&
    /^\d+$/.test(req.deadline) &&
    ALLOWED_TOKENS.has(req.token.toLowerCase());
  if (!valid) throw new RelayError("Invalid withdrawal request.");
  return write(relayerWallet(), {
    address: SHADOW_POOL,
    abi: shadowPoolAbi,
    functionName: "withdraw",
    args: [req.token, BigInt(req.amount), req.to, req.owner, BigInt(req.deadline), req.signature],
  });
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
    if (req.kind === "gas" && !IS_FORK) {
      const now = Date.now();
      globalGas = globalGas.filter((t) => now - t < WINDOW_MS);
      if (globalGas.length >= MAX_GAS_PER_WINDOW) throw new RelayError("The relayer is busy. Try again later.", 429);
      globalGas.push(now);
    }
    const hash = await enqueue(() => (req.kind === "gas" ? dripGas(req.to) : relayWithdraw(req)));
    const receipt = await publicClient.getTransactionReceipt({ hash });
    return Response.json({ hash, block: receipt.blockNumber.toString() });
  } catch (e) {
    if (e instanceof RelayError) return Response.json({ error: e.message }, { status: e.status });
    // Never echo raw errors: viem messages can embed the RPC URL (with API keys) and request data.
    const short = e instanceof Error ? (e as Error & { shortMessage?: string }).shortMessage : undefined;
    console.error("relay failed:", short ?? (e instanceof Error ? e.name : "unknown"));
    return Response.json({ error: short ? short.slice(0, 200) : "Relay failed." }, { status: 400 });
  }
}
