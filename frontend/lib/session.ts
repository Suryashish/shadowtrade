import { erc20Abi, parseUnits, type Address } from "viem";
import { noteFunded, publicClient, sendValue } from "./chain";
import { entrypointAbi } from "./abi/entrypoint";
import { ENTRYPOINT, RELAYER_ADDRESS, SPOT_MARKETS, TOKENS, type Venue } from "./config";
import { createBurner, type Burner } from "./keys";
import type { MasterKeys } from "./privacySdk";
import * as kuru from "./kuru";
import * as perpl from "./perpl";
import { depositToPool, withdrawToAddress, type PoolEnv } from "./pool";
import { relay } from "./relay";

export type Step = { index: number; total: number; label: string };
export type OnStep = (step: Step) => void;

export type StealthSession = {
  burner: Burner;
  venue: Venue;
  bucket: number;
  startedAt: number;
};

const GAS_SWEEP_LIMIT = 21_000n;

function stepper(total: number, onStep?: OnStep) {
  let index = 0;
  return (label: string) => onStep?.({ index: ++index, total, label });
}

async function tokenBalance(token: Address, owner: Address) {
  return publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
}

export async function enterStealth(opts: {
  keys: MasterKeys;
  venue: Venue;
  bucket: number;
  onStep?: OnStep;
  /** Points the pool and relayer at another origin (Node test harness). */
  poolEnv?: PoolEnv;
  /** Called with the session before any funds move, so it can be backed up and exited if a later step fails. */
  onSession?: (session: StealthSession) => Promise<void>;
}): Promise<StealthSession> {
  const token = TOKENS[opts.venue];
  const amount = parseUnits(String(opts.bucket), token.decimals);
  const step = stepper(4, opts.onStep);

  step("Creating a fresh burner wallet");
  const session: StealthSession = { burner: createBurner(), venue: opts.venue, bucket: opts.bucket, startedAt: Date.now() };
  await opts.onSession?.(session);
  const { burner } = session;

  step("Sending gas from the shared relayer");
  const gas = await relay({ kind: "gas", to: burner.address }, opts.poolEnv?.apiBase);
  noteFunded(burner.address, BigInt(gas.block));

  const withdrawal = await withdrawToAddress(opts.keys, token.address, amount, burner.address, () => step("Generating zero-knowledge proof"), opts.poolEnv);
  noteFunded(burner.address, BigInt(withdrawal.block));

  step(opts.venue === "perpl" ? "Opening a Perpl margin account" : "Depositing into Kuru");
  if (opts.venue === "perpl") await perpl.fundAccount(burner.wallet, amount);
  else await kuru.deposit(burner.wallet, token.address, amount);

  return session;
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
  poolEnv?: PoolEnv;
  perpMarkets: perpl.PerpMarket[];
  onStep?: OnStep;
}): Promise<bigint> {
  const { session } = opts;
  const token = TOKENS[session.venue];
  const step = stepper(3, opts.onStep);

  step(session.venue === "perpl" ? "Closing positions and withdrawing margin" : "Selling to USDC and withdrawing");
  if (session.venue === "perpl") await unwindPerpl(session, opts.perpMarkets);
  else await unwindKuru(session);

  step("Returning funds to your private balance");
  const amount = await tokenBalance(token.address, session.burner.address);
  // The Entrypoint refuses deposits under its minimum; that dust can't be returned but must not block the exit.
  const [, minimumDeposit] = await publicClient.readContract({ address: ENTRYPOINT, abi: entrypointAbi, functionName: "assetConfig", args: [token.address] });
  const returned = amount >= minimumDeposit ? amount : 0n;
  if (returned > 0n) await depositToPool(session.burner.wallet, token.address, returned, opts.keys, opts.poolEnv);

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
