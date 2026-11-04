import { createWalletClient, http, isAddress, isHex, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { shadowPoolAbi } from "@/lib/abi/pool";
import { publicClient, sendValue, write } from "@/lib/chain";
import { BURNER_GAS_DRIP, monadTestnet, RPC_URL, SHADOW_POOL, TOKENS } from "@/lib/config";
import type { RelayRequest } from "@/lib/relay";

const ALLOWED_TOKENS = new Set(Object.values(TOKENS).map((t) => t.address.toLowerCase()));
const dripped = new Set<string>();
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
  if (dripped.has(key)) throw new Error("This burner was already funded.");
  const [nonce, balance] = await Promise.all([publicClient.getTransactionCount({ address: to }), publicClient.getBalance({ address: to })]);
  // Only brand-new accounts get gas, so the relayer can't be drained into existing wallets.
  if (nonce > 0 || balance > 0n) throw new Error("Gas is only sent to brand-new burner wallets.");
  dripped.add(key);
  return sendValue(relayerWallet(), to, BURNER_GAS_DRIP).catch((e: unknown) => {
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
  if (!valid) throw new Error("Invalid withdrawal request.");
  return write(relayerWallet(), {
    address: SHADOW_POOL,
    abi: shadowPoolAbi,
    functionName: "withdraw",
    args: [req.token, BigInt(req.amount), req.to, req.owner, BigInt(req.deadline), req.signature],
  });
}

function parse(body: unknown): RelayRequest {
  if (typeof body !== "object" || body === null || !("kind" in body)) throw new Error("Invalid request.");
  const req = body as RelayRequest;
  if (req.kind === "gas" && isAddress(req.to)) return req;
  if (req.kind === "withdraw") return req;
  throw new Error("Invalid request.");
}

export async function POST(request: Request) {
  try {
    const req = parse(await request.json());
    const hash = await enqueue(() => (req.kind === "gas" ? dripGas(req.to) : relayWithdraw(req)));
    const receipt = await publicClient.getTransactionReceipt({ hash });
    return Response.json({ hash, block: receipt.blockNumber.toString() });
  } catch (e) {
    const message = e instanceof Error ? (e as Error & { shortMessage?: string }).shortMessage ?? e.message : "Relay failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}
