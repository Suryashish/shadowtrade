"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePoll } from "./usePoll";
import { BaseError, erc20Abi, parseUnits, type Address, type LocalAccount, type WalletClient } from "viem";
import { publicClient } from "@/lib/chain";
import { TOKENS, type Venue } from "@/lib/config";
import { shadowAccountFromSignature, shadowKeyMessage } from "@/lib/keys";
import { fetchPerpMarkets, type PerpMarket } from "@/lib/perpl";
import { depositToPool, poolLiquidity, privateBalance, signWithdraw } from "@/lib/pool";
import { relay } from "@/lib/relay";
import { enterStealth, exitStealth, type StealthSession, type Step } from "@/lib/session";

export type Balances = Record<Venue, { wallet: bigint; private: bigint; pool: bigint }>;

export type Activity = { kind: "idle" } | { kind: "busy"; step: Step } | { kind: "error"; message: string } | { kind: "done"; message: string };

type DepositRecord = { at: number; amount: number };

const LAST_DEPOSIT_KEY = "shadowtrade:last-deposit";
const EMPTY: Balances = {
  perpl: { wallet: 0n, private: 0n, pool: 0n },
  kuru: { wallet: 0n, private: 0n, pool: 0n },
};

export function friendlyError(e: unknown): string {
  const raw = e instanceof BaseError ? e.shortMessage : e instanceof Error ? e.message : String(e);
  if (/reject|denied|cancel/i.test(raw)) return "You cancelled the request in your wallet.";
  if (/insufficient funds/i.test(raw)) return "Not enough MON for gas in this wallet.";
  if (/InsufficientBalance/.test(raw)) return "Your private balance is too low for that amount.";
  if (/OracleAgeExceedsMax|markPrice/i.test(raw)) return "Perpl prices are updating. Try again in a few seconds.";
  if (/TakerOrderSettlementFailed/.test(raw)) return "The order couldn't fill within your price limit. Try a smaller size.";
  if (/fetch failed|Failed to fetch|HTTP request failed/i.test(raw)) return "Network problem reaching Monad. Check your connection and retry.";
  return raw.split("\n")[0];
}

function readLastDeposit(): DepositRecord | null {
  try {
    const raw = localStorage.getItem(LAST_DEPOSIT_KEY);
    return raw ? (JSON.parse(raw) as DepositRecord) : null;
  } catch {
    return null;
  }
}

function writeLastDeposit(record: DepositRecord) {
  try {
    localStorage.setItem(LAST_DEPOSIT_KEY, JSON.stringify(record));
  } catch {
    // Only feeds the privacy hint; safe to skip when storage is blocked.
  }
}

async function erc20Balance(token: Address, owner: Address) {
  return publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
}

async function loadBalances(owner: Address, shadow: Address): Promise<Balances> {
  const venues = Object.keys(TOKENS) as Venue[];
  const rows = await Promise.all(
    venues.map(async (v) => {
      const t = TOKENS[v].address;
      const [w, p, pool] = await Promise.all([erc20Balance(t, owner), privateBalance(t, shadow), poolLiquidity(t)]);
      return [v, { wallet: w, private: p, pool }] as const;
    }),
  );
  return Object.fromEntries(rows) as Balances;
}

export function useShadowTrade(wallet: WalletClient | null) {
  // Bound to the wallet that derived it, so switching wallets can never reuse another wallet's key.
  const [unlocked, setUnlocked] = useState<{ owner: Address; account: LocalAccount } | null>(null);
  const [session, setSession] = useState<StealthSession | null>(null);
  const [markets, setMarkets] = useState<PerpMarket[]>([]);
  const [marketsError, setMarketsError] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity>({ kind: "idle" });
  const [lastDeposit, setLastDeposit] = useState<DepositRecord | null>(readLastDeposit);
  const busy = useRef(false);

  const address = wallet?.account?.address ?? null;
  const shadow = unlocked && unlocked.owner === address ? unlocked.account : null;

  const reloadMarkets = useCallback(() => {
    fetchPerpMarkets()
      .then((m) => {
        setMarkets(m);
        setMarketsError(null);
      })
      .catch((e: unknown) => setMarketsError(friendlyError(e)));
  }, []);

  useEffect(reloadMarkets, [reloadMarkets]);

  const balancePoll = usePoll(address && shadow ? () => loadBalances(address, shadow.address) : null, 6000, `${address}:${shadow?.address}`);
  const balances = balancePoll.data ?? EMPTY;
  const balancesLoaded = balancePoll.data !== null;
  const refresh = balancePoll.refresh;

  // The burner key exists only in memory, so leaving mid-session would strand its funds.
  useEffect(() => {
    if (!session) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [session]);

  const clearActivity = useCallback(() => setActivity({ kind: "idle" }), []);

  const run = useCallback(
    async (job: (onStep: (s: Step) => void) => Promise<string>) => {
      if (busy.current) return;
      busy.current = true;
      setActivity({ kind: "busy", step: { index: 1, total: 1, label: "Waiting for your wallet" } });
      try {
        const message = await job((step) => setActivity({ kind: "busy", step }));
        setActivity({ kind: "done", message });
      } catch (e) {
        setActivity({ kind: "error", message: friendlyError(e) });
      } finally {
        busy.current = false;
        refresh().catch(() => undefined);
      }
    },
    [refresh],
  );

  const unlock = useCallback(async () => {
    if (!wallet?.account) return;
    try {
      const signature = await wallet.signMessage({ account: wallet.account, message: shadowKeyMessage(wallet.account.address) });
      setUnlocked({ owner: wallet.account.address, account: shadowAccountFromSignature(signature) });
      setActivity({ kind: "idle" });
    } catch (e) {
      setActivity({ kind: "error", message: friendlyError(e) });
    }
  }, [wallet]);

  const deposit = useCallback(
    (venue: Venue, amount: number) =>
      run(async (onStep) => {
        if (!wallet || !shadow) throw new Error("Unlock your private balance first.");
        const t = TOKENS[venue];
        onStep({ index: 1, total: 2, label: `Approve ${t.symbol} in your wallet` });
        await depositToPool(wallet, t.address, parseUnits(String(amount), t.decimals), shadow.address);
        const record = { at: Date.now(), amount };
        writeLastDeposit(record);
        setLastDeposit(record);
        return `Deposited ${amount.toLocaleString()} ${t.symbol} into your private balance.`;
      }),
    [run, wallet, shadow],
  );

  const withdraw = useCallback(
    (venue: Venue, amount: number, to: Address) =>
      run(async (onStep) => {
        if (!shadow) throw new Error("Unlock your private balance first.");
        const t = TOKENS[venue];
        onStep({ index: 1, total: 1, label: "Relaying your private withdrawal" });
        const req = await signWithdraw(shadow, t.address, parseUnits(String(amount), t.decimals), to);
        await relay({ kind: "withdraw", ...req });
        return `Sent ${amount.toLocaleString()} ${t.symbol} to ${to.slice(0, 6)}…${to.slice(-4)}.`;
      }),
    [run, shadow],
  );

  const enter = useCallback(
    (venue: Venue, bucket: number) =>
      run(async (onStep) => {
        if (!shadow) throw new Error("Unlock your private balance first.");
        const s = await enterStealth({ shadow, venue, bucket, onStep });
        setSession(s);
        return "Stealth Mode is on. You're trading from a fresh wallet.";
      }),
    [run, shadow],
  );

  const exit = useCallback(
    () =>
      run(async (onStep) => {
        if (!shadow || !session) throw new Error("No active stealth session.");
        const t = TOKENS[session.venue];
        const returned = await exitStealth({ session, shadow: shadow.address, perpMarkets: markets, onStep });
        setSession(null);
        return `Stealth session closed. ${(Number(returned) / 10 ** t.decimals).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${t.symbol} is back in your private balance and the burner key is wiped.`;
      }),
    [run, shadow, session, markets],
  );

  return {
    shadow,
    unlock,
    balances,
    balancesLoaded,
    session,
    markets,
    marketsError,
    reloadMarkets,
    activity,
    clearActivity,
    lastDeposit,
    run,
    deposit,
    withdraw,
    enter,
    exit,
    refresh,
  };
}

export type ShadowTrade = ReturnType<typeof useShadowTrade>;
