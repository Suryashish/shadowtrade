import { BaseError, ContractFunctionRevertedError, decodeAbiParameters, isAddress, isHex, zeroAddress, type Address, type Hash } from "viem";
import { entrypointAbi, relayDataParams } from "@/lib/abi/entrypoint";
import { publicClient, sendValue, write } from "@/lib/chain";
import { connection } from "next/server";
import { BURNER_GAS_DRIP, ENTRYPOINT, IS_FORK, POOLS, RELAYER_ADDRESS } from "@/lib/config";
import { STALE_STATUS, type ProofWire, type RelayRequest, type WithdrawRequest } from "@/lib/relay";
import { allow, clientIp } from "@/lib/server/rateLimit";
import { enqueue, relayerWallet } from "@/lib/server/relayer";

const KNOWN_SCOPES = new Set(POOLS.map((p) => p.scope.toString()));
const dripped = new Set<string>();

// Abuse limits (see lib/server/rateLimit). The on-chain "brand-new address" check and the balance
// floor below are the restart-proof backstops.
const MAX_GAS_PER_IP = 6; // one drip per stealth session
const MAX_WITHDRAW_PER_IP = 20;
const MAX_GAS_PER_WINDOW = 10; // global: caps drain at ~5 MON per window
const MIN_RELAYER_BALANCE = 1_000_000_000_000_000_000n; // keep 1 MON for withdrawals
const MAX_BODY_BYTES = 8192;

class RelayError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

let misconfigured = false;

/** The relayer wallet, after checking that its address is the fee recipient clients are configured with. */
function checkedRelayer() {
  try {
    const wallet = relayerWallet();
    if (wallet.account.address.toLowerCase() === RELAYER_ADDRESS.toLowerCase()) return wallet;
    if (!misconfigured) console.error(`Relayer misconfigured: NEXT_PUBLIC_RELAYER_ADDRESS (${RELAYER_ADDRESS}) is not the address of RELAYER_PRIVATE_KEY (${wallet.account.address}).`);
  } catch {
    if (!misconfigured) console.error("Relayer misconfigured: RELAYER_PRIVATE_KEY is missing or invalid.");
  }
  misconfigured = true;
  throw new RelayError("Relayer misconfigured.", 500);
}

/** Enforces the gas limits; call only once a request is known to be valid. A local fork's gas is free and e2e opens many sessions. */
function chargeGas(ip: string) {
  if (IS_FORK) return;
  if (!allow(`gas:${ip}`, MAX_GAS_PER_IP)) throw new RelayError("Too many requests. Try again later.", 429);
  if (!allow("gas:global", MAX_GAS_PER_WINDOW)) throw new RelayError("The relayer is busy. Try again later.", 429);
}

async function dripGas(to: Address, ip: string): Promise<Hash> {
  const key = to.toLowerCase();
  if (dripped.has(key)) throw new RelayError("This burner was already funded.");
  const [nonce, balance] = await Promise.all([publicClient.getTransactionCount({ address: to }), publicClient.getBalance({ address: to })]);
  // Only brand-new accounts get gas, so the relayer can't be drained into existing wallets.
  if (nonce > 0 || balance > 0n) throw new RelayError("Gas is only sent to brand-new burner wallets.");
  const wallet = checkedRelayer();
  const relayerBalance = await publicClient.getBalance({ address: wallet.account.address });
  if (relayerBalance < MIN_RELAYER_BALANCE + BURNER_GAS_DRIP) throw new RelayError("The relayer is out of gas funds.", 503);
  chargeGas(ip);
  dripped.add(key);
  return sendValue(wallet, to, BURNER_GAS_DRIP).catch((e: unknown) => {
    dripped.delete(key);
    throw e;
  });
}

const FIELD = /^\d{1,78}$/;
const isField = (v: unknown): v is string => typeof v === "string" && FIELD.test(v);
const isPair = (v: unknown): v is [string, string] => Array.isArray(v) && v.length === 2 && v.every(isField);

function isProof(p: unknown): p is ProofWire {
  if (typeof p !== "object" || p === null) return false;
  const { pA, pB, pC, pubSignals } = p as Record<string, unknown>;
  return isPair(pA) && isPair(pC) && Array.isArray(pB) && pB.length === 2 && pB.every(isPair) && Array.isArray(pubSignals) && pubSignals.length === 8 && pubSignals.every(isField);
}

/** The relayer only submits withdrawals that route through the Entrypoint and pay it nothing extra. */
function validateWithdraw(req: WithdrawRequest, relayer: Address) {
  const { withdrawal } = req;
  if (!isField(req.scope) || !KNOWN_SCOPES.has(req.scope)) throw new RelayError("Unknown pool.");
  if (typeof withdrawal !== "object" || withdrawal === null || !isAddress(withdrawal.processooor) || !isHex(withdrawal.data)) throw new RelayError("Invalid withdrawal.");
  if (withdrawal.processooor.toLowerCase() !== ENTRYPOINT.toLowerCase()) throw new RelayError("Withdrawals must go through the Entrypoint.");
  if (!isProof(req.proof)) throw new RelayError("Invalid proof.");
  let data;
  try {
    [data] = decodeAbiParameters(relayDataParams, withdrawal.data);
  } catch {
    throw new RelayError("Invalid relay data.");
  }
  if (data.feeRecipient.toLowerCase() !== relayer.toLowerCase()) throw new RelayError("Wrong fee recipient.");
  if (data.relayFeeBPS !== 0n) throw new RelayError("Relay fee must be zero.");
  if (data.recipient === zeroAddress) throw new RelayError("Invalid recipient.");
}

// A proof built against an out-of-date ASP or state root; the client re-proves against fresh state.
function isStale(e: unknown): boolean {
  if (!(e instanceof BaseError)) return false;
  const reverted = e.walk((x) => x instanceof ContractFunctionRevertedError);
  const name = reverted instanceof ContractFunctionRevertedError ? reverted.data?.errorName : undefined;
  return name === "IncorrectASPRoot" || name === "UnknownStateRoot";
}

async function relayWithdraw(req: WithdrawRequest): Promise<Hash> {
  const wallet = checkedRelayer();
  const { pA, pB, pC, pubSignals } = req.proof;
  try {
    return await write(wallet, {
      address: ENTRYPOINT,
      abi: entrypointAbi,
      functionName: "relay",
      args: [
        { processooor: req.withdrawal.processooor, data: req.withdrawal.data },
        { pA: [BigInt(pA[0]), BigInt(pA[1])], pB: [[BigInt(pB[0][0]), BigInt(pB[0][1])], [BigInt(pB[1][0]), BigInt(pB[1][1])]], pC: [BigInt(pC[0]), BigInt(pC[1])], pubSignals: pubSignals.map(BigInt) as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] },
        BigInt(req.scope),
      ],
    });
  } catch (e) {
    if (isStale(e)) throw new RelayError("The pool state changed. Retry.", STALE_STATUS);
    throw e;
  }
}

function parse(body: unknown): RelayRequest {
  if (typeof body !== "object" || body === null || !("kind" in body)) throw new RelayError("Invalid request.");
  const req = body as RelayRequest;
  if (req.kind === "gas" && isAddress(req.to)) return req;
  if (req.kind === "withdraw") return req;
  throw new RelayError("Invalid request.");
}

/** Rejects oversized bodies from content-length first, then while streaming for requests without one. */
async function readBody(request: Request): Promise<string> {
  const tooLarge = () => new RelayError("Request too large.", 413);
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    size += part.value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function GET() {
  await connection();
  try {
    return Response.json({ relayer: checkedRelayer().account.address });
  } catch (e) {
    if (e instanceof RelayError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function POST(request: Request) {
  try {
    const raw = await readBody(request);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new RelayError("Invalid request.");
    }
    const req = parse(body);
    const ip = clientIp(request);
    if (req.kind === "withdraw") {
      validateWithdraw(req, checkedRelayer().account.address);
      if (!IS_FORK && !allow(`withdraw:${ip}`, MAX_WITHDRAW_PER_IP)) throw new RelayError("Too many requests. Try again later.", 429);
    }
    const hash = await enqueue(() => (req.kind === "gas" ? dripGas(req.to, ip) : relayWithdraw(req)));
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
