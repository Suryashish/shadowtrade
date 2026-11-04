import { erc20Abi, parseUnits, type Address, type Hex } from "viem";
import { noteFunded, publicClient, sendValue } from "./chain";
import { POOL_MIN_DEPOSIT, RELAYER_ADDRESS, SPOT_MARKETS, TOKENS, type Venue } from "./config";
import { deriveBurner, type Burner } from "./keys";
import * as kuru from "./kuru";
import * as perpl from "./perpl";
import type { MasterKeys } from "./notes";
import { depositToPool, minimumDeposit, withdrawFromPool } from "./pool";
import { relay } from "./relay";

export type Step = { index: number; total: number; label: string };
export type OnStep = (step: Step) => void;

export type StealthSession = {
  burner: Burner;
  venue: Venue;
  /** Session size in whole tokens; 0 for a session recovered from the chain (size unknown). */
  bucket: number;
  startedAt: number;
};

const GAS_SWEEP_LIMIT = 21_000n;
// Gas limits measured on a full session (Monad bills the limit): margin withdraw ~180k, approve
// ~85k, pool deposit ~530k (grows with the tree), sweep 21k; each position costs ~340k to close.
const EXIT_GAS = 900_000n;
const POSITION_GAS = 340_000n;

function stepper(total: number, onStep?: OnStep) {
  let index = 0;
  return (label: string) => onStep?.({ index: ++index, total, label });
}

async function tokenBalance(token: Address, owner: Address) {
  return publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
}

/** Where a used burner still holds funds, if anywhere: an unfinished session to resume and exit. */
async function heldVenue(address: Address, perpMarkets: perpl.PerpMarket[]): Promise<Venue | null> {
  const dust = (venue: Venue) => parseUnits(String(POOL_MIN_DEPOSIT), TOKENS[venue].decimals);
  const [account, ausd, usdc, kuruId] = await Promise.all([
    perpl.getAccount(address),
    tokenBalance(TOKENS.perpl.address, address),
    tokenBalance(TOKENS.kuru.address, address),
    kuru.accountId(address),
  ]);
  if (ausd >= dust("perpl") || (account && account.balanceCNS > 0n)) return "perpl";
  if (account && (await Promise.all(perpMarkets.map((m) => perpl.getPosition(m.id, account.id)))).some(Boolean)) return "perpl";
  if (usdc >= dust("kuru")) return "kuru";
  if (kuruId !== 0) {
    const held = await Promise.all([TOKENS.kuru.address, ...SPOT_MARKETS.map((m) => m.baseToken)].map((t) => kuru.balanceOf(kuruId, t)));
    if (held.some((b) => b > 0n)) return "kuru";
  }
  return null;
}

/**
 * Walks this wallet's burners after `exitedThrough` (known exited): returns the first that still
 * holds funds as a session to resume, or else the first never-used index for a new session.
 * A used burner is never reused, since that would link two sessions.
 */
export async function scanBurners(seed: Hex, exitedThrough: number, perpMarkets: perpl.PerpMarket[]): Promise<{ next: number; unfinished: StealthSession | null }> {
  for (let index = exitedThrough + 1; ; index++) {
    const burner = deriveBurner(seed, index);
    const [nonce, gas] = await Promise.all([publicClient.getTransactionCount({ address: burner.address }), publicClient.getBalance({ address: burner.address })]);
    // Brand-new: also what the relayer requires before it sends gas.
    if (nonce === 0 && gas === 0n) return { next: index, unfinished: null };
    const venue = await heldVenue(burner.address, perpMarkets);
    if (venue) return { next: index + 1, unfinished: { burner, venue, bucket: 0, startedAt: Date.now() } };
  }
}

export async function enterStealth(opts: {
  /** The burner for this session: a never-used index from scanBurners. */
  burner: Burner;
  keys: MasterKeys;
  venue: Venue;
  bucket: number;
  onStep?: OnStep;
  relayBase?: string;
  /** Called with the session before any funds move, so it can be backed up and exited if a later step fails. */
  onSession?: (session: StealthSession) => Promise<void>;
}): Promise<StealthSession> {
  const token = TOKENS[opts.venue];
  const amount = parseUnits(String(opts.bucket), token.decimals);
  const step = stepper(4, opts.onStep);

  step("Creating a fresh burner wallet");
  const session: StealthSession = { burner: opts.burner, venue: opts.venue, bucket: opts.bucket, startedAt: Date.now() };
  await opts.onSession?.(session);
  const { burner } = session;

  step("Sending gas from the shared relayer");
  const gas = await relay({ kind: "gas", to: burner.address }, opts.relayBase);
  noteFunded(burner.address, BigInt(gas.block));

  step(`Proving and moving ${opts.bucket.toLocaleString()} ${token.symbol} from your private balance`);
  const withdrawals = await withdrawFromPool({ keys: opts.keys, venue: opts.venue, amount, recipient: burner.address, base: opts.relayBase });
  noteFunded(burner.address, BigInt(withdrawals[withdrawals.length - 1].block));

  step(opts.venue === "perpl" ? "Opening a Perpl margin account" : "Depositing into Kuru");
  if (opts.venue === "perpl") await perpl.fundAccount(burner.wallet, amount);
  else await kuru.deposit(burner.wallet, token.address, amount);

  return session;
}

/** A Perpl burner's margin account, plus any AUSD still sitting idle in the burner itself. */
export async function perplSetup(address: Address) {
  const [account, idle] = await Promise.all([perpl.getAccount(address), tokenBalance(TOKENS.perpl.address, address)]);
  return { account, idle };
}

/** Finishes an interrupted entry: moves the burner's idle AUSD into Perpl, opening the account if needed. */
export async function finishPerplSetup(session: StealthSession) {
  const { idle } = await perplSetup(session.burner.address);
  if (idle === 0n) throw new Error("The burner holds no AUSD. Exit Stealth and enter again.");
  await perpl.fundAccount(session.burner.wallet, idle);
}

/**
 * The burner gets one gas drip, so it must always keep enough to exit: close every position
 * (including the one about to open), withdraw margin and deposit back. Otherwise its funds would be
 * stuck. Throws LowBurnerGas when opening another position would eat into that reserve.
 */
export async function ensureExitGas(session: StealthSession, markets: perpl.PerpMarket[]) {
  const { address } = session.burner;
  const [account, balance, fees] = await Promise.all([perpl.getAccount(address), publicClient.getBalance({ address }), publicClient.estimateFeesPerGas()]);
  const open = account ? (await Promise.all(markets.map((m) => perpl.getPosition(m.id, account.id)))).filter(Boolean).length : 0;
  // Opening costs about as much as closing.
  const needed = (EXIT_GAS + POSITION_GAS * BigInt(open + 2)) * fees.maxFeePerGas;
  if (balance < needed) throw new Error("LowBurnerGas");
}

async function unwindPerpl(session: StealthSession, markets: perpl.PerpMarket[]) {
  const account = await perpl.getAccount(session.burner.address);
  if (!account) return;
  for (const market of markets) {
    const position = await perpl.getPosition(market.id, account.id);
    if (position) await perpl.closePosition(session.burner.wallet, market, position);
  }
  await perpl.withdrawAll(session.burner.wallet);
}

async function unwindKuru(session: StealthSession) {
  const { wallet, address } = session.burner;
  const id = await kuru.accountId(address);
  for (const market of SPOT_MARKETS) {
    const sellable = kuru.floorToLot(market, await kuru.balanceOf(id, market.baseToken));
    if (sellable > 0n) await kuru.swap(wallet, market, false, sellable);
  }
  await kuru.withdrawAll(wallet, [TOKENS.kuru.address]);
}

/** Closes everything, returns all funds to the private balance and discards the burner. */
export async function exitStealth(opts: {
  session: StealthSession;
  keys: MasterKeys;
  perpMarkets: perpl.PerpMarket[];
  onStep?: OnStep;
  relayBase?: string;
}): Promise<bigint> {
  const { session } = opts;
  const token = TOKENS[session.venue];
  const step = stepper(3, opts.onStep);

  step(session.venue === "perpl" ? "Closing positions and withdrawing margin" : "Selling to USDC and withdrawing");
  if (session.venue === "perpl") await unwindPerpl(session, opts.perpMarkets);
  else await unwindKuru(session);

  step("Returning funds to your private balance");
  const [amount, minimum] = await Promise.all([tokenBalance(token.address, session.burner.address), minimumDeposit(session.venue)]);
  // The pool rejects deposits under its minimum. Dust that small is left behind rather than
  // blocking the exit forever (sending it anywhere else would link the burner).
  const returned = amount >= minimum ? amount : 0n;
  if (returned > 0n) await depositToPool(session.burner.wallet, opts.keys, session.venue, returned, opts.relayBase);

  step("Returning leftover gas and wiping the burner key");
  // Funds are already safe in the pool; a failed dust sweep must not turn the exit into an error.
  await sweepGas(session.burner).catch(() => undefined);
  return returned;
}

async function sweepGas(burner: Burner) {
  const [balance, fees] = await Promise.all([publicClient.getBalance({ address: burner.address }), publicClient.estimateFeesPerGas()]);
  const cost = GAS_SWEEP_LIMIT * fees.maxFeePerGas;
  // Leftover dust isn't worth a failed tx; the burner is discarded either way.
  if (balance > cost * 2n) await sendValue(burner.wallet, RELAYER_ADDRESS, balance - cost, fees.maxFeePerGas);
}
