"use client";

import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { usePoll } from "@/hooks/usePoll";
import { SPOT_MARKETS, TOKENS, type SpotMarket } from "@/lib/config";
import { formatPrice, formatToken } from "@/lib/format";
import * as kuru from "@/lib/kuru";
import type { StealthSession, Step } from "@/lib/session";

type Run = (job: (onStep: (s: Step) => void) => Promise<string>) => Promise<void>;

const USDC = TOKENS.kuru;
const SLIPPAGE_BPS = 100n;
const QUOTE_DEBOUNCE_MS = 300;
const PERCENTS = [25, 50, 75, 100] as const;

type Side = "buy" | "sell";
type QuoteState = { key: string; out: bigint } | { key: string; error: true };

function parseAmount(value: string, decimals: number): bigint | null {
  if (!value || Number(value) <= 0) return null;
  try {
    return parseUnits(value, decimals);
  } catch {
    return null;
  }
}

/** Guards against float round-trips: snap a value equal to the balance back to the exact balance. */
function snapToBalance(amount: bigint, value: string, balance: bigint, decimals: number) {
  return amount > balance && Number(value) === Number(formatUnits(balance, decimals)) ? balance : amount;
}

function toNumber(value: bigint, decimals: number) {
  return Number(formatUnits(value, decimals));
}

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function useQuote(market: SpotMarket, isBuy: boolean, amountIn: bigint | null) {
  const key = amountIn === null ? "" : `${market.symbol}:${isBuy}:${amountIn}`;
  const debouncedKey = useDebounced(key, QUOTE_DEBOUNCE_MS);
  const [state, setState] = useState<QuoteState | null>(null);
  useEffect(() => {
    if (!debouncedKey || debouncedKey !== key || amountIn === null) return;
    let cancelled = false;
    kuru
      .quote(market, isBuy, amountIn)
      .then((q) => !cancelled && setState({ key: debouncedKey, out: q.amountOut }))
      .catch(() => !cancelled && setState({ key: debouncedKey, error: true }));
    return () => {
      cancelled = true;
    };
  }, [debouncedKey, key, market, isBuy, amountIn]);
  const current = state && state.key === key && key !== "" ? state : null;
  return { loading: key !== "" && current === null, out: current && "out" in current ? current.out : null, failed: current !== null && "error" in current };
}

function disabledReason(o: { busy: boolean; amountIn: bigint | null; balance: bigint | null; out: bigint | null; loading: boolean; failed: boolean }) {
  if (o.busy) return "Another action is in progress";
  if (o.balance === null) return "Loading balance";
  if (o.amountIn === null) return "Enter an amount";
  if (o.amountIn > o.balance) return "Exceeds your balance";
  if (o.failed) return "Couldn't fetch a quote";
  if (o.loading || o.out === null) return "Fetching quote";
  if (o.out === 0n) return "No liquidity on this side right now";
  return null;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono tabular">{value}</dd>
    </div>
  );
}

const chip =
  "h-7 flex-1 rounded-md border border-border bg-surface-2 text-xs text-muted transition-colors hover:border-faint hover:text-text disabled:cursor-not-allowed disabled:opacity-50";

export function SpotOrderForm({ session, market, run, busy }: { session: StealthSession; market: SpotMarket; run: Run; busy: boolean }) {
  const [side, setSide] = useState<Side>("buy");
  const [input, setInput] = useState("");

  const isBuy = side === "buy";
  const marketIndex = SPOT_MARKETS.findIndex((m) => m.symbol === market.symbol);
  const inDecimals = isBuy ? USDC.decimals : market.baseDecimals;
  const outDecimals = isBuy ? market.baseDecimals : USDC.decimals;
  const inSymbol = isBuy ? USDC.symbol : market.base;
  const outSymbol = isBuy ? market.base : USDC.symbol;

  const owner = session.burner.address;
  const book = usePoll(() => kuru.bestBidAsk(market), 3000, market.symbol).data;
  const balances = usePoll(
    async () => {
      const id = await kuru.accountId(owner);
      const [usdc, ...bases] = await Promise.all([kuru.balanceOf(id, USDC.address), ...SPOT_MARKETS.map((m) => kuru.balanceOf(id, m.baseToken))]);
      return { usdc, bases };
    },
    3000,
    owner,
  ).data;
  const balance = balances ? (isBuy ? balances.usdc : balances.bases[marketIndex]) : null;

  const rawIn = parseAmount(input, inDecimals);
  const amountIn = rawIn !== null && balance !== null ? snapToBalance(rawIn, input, balance, inDecimals) : rawIn;
  const { loading, out, failed } = useQuote(market, isBuy, amountIn);

  const reason = disabledReason({ busy, amountIn, balance, out, loading, failed });
  const minOut = out !== null ? (out * (10_000n - SLIPPAGE_BPS)) / 10_000n : null;
  const effectivePrice =
    amountIn !== null && out !== null && out > 0n
      ? isBuy
        ? toNumber(amountIn, inDecimals) / toNumber(out, outDecimals)
        : toNumber(out, outDecimals) / toNumber(amountIn, inDecimals)
      : null;
  const ref = book ? (isBuy ? book.ask : book.bid) : null;
  const impact =
    effectivePrice !== null && ref !== null && ref > 0 ? Math.max(0, isBuy ? (effectivePrice - ref) / ref : (ref - effectivePrice) / ref) * 100 : null;

  const submit = () => {
    if (amountIn === null || reason) return;
    void run(async (onStep) => {
      onStep({ index: 1, total: 1, label: "Swapping on Kuru" });
      const q = await kuru.swap(session.burner.wallet, market, isBuy, amountIn);
      const spent = formatToken(q.amountIn, inDecimals, 6);
      const got = formatToken(q.amountOut, outDecimals, 6);
      return isBuy ? `Bought ${got} ${outSymbol} for ${spent} ${inSymbol}` : `Sold ${spent} ${inSymbol} for ${got} ${outSymbol}`;
    });
  };

  const fillPercent = (pct: number) => {
    if (balance === null) return;
    setInput(formatUnits((balance * BigInt(pct)) / 100n, inDecimals));
  };
  const changeSide = (s: Side) => {
    setSide(s);
    setInput("");
  };

  return (
    <div className="space-y-3 px-3 py-3">
      <div role="radiogroup" aria-label="Side" className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
        {(["buy", "sell"] as const).map((s) => {
          const active = s === side;
          const fill = s === "buy" ? "bg-success" : "bg-danger";
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => changeSide(s)}
              className={`h-8 rounded-md text-[13px] font-medium transition-colors ${active ? `${fill} text-white` : "text-muted hover:text-text"}`}
            >
              {s === "buy" ? "Buy" : "Sell"}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 border-b border-border text-xs">
        <span className="-mb-px border-b-2 border-accent pb-1.5 font-medium text-text">Market</span>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">Available</span>
        <span className="font-mono tabular">{balance !== null ? `${formatToken(balance, inDecimals, 6)} ${inSymbol}` : "—"}</span>
      </div>

      <div>
        <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 focus-within:border-accent">
          <span className="shrink-0 text-xs text-faint">{isBuy ? "Spend" : "Sell"}</span>
          <input
            inputMode="decimal"
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0.00"
            aria-label={`Amount in ${inSymbol}`}
            className="min-w-0 flex-1 bg-transparent text-right font-mono text-[13px] tabular outline-none placeholder:text-faint"
          />
          <span className="shrink-0 text-xs text-muted">{inSymbol}</span>
        </label>
        <div className="mt-1.5 flex gap-1.5">
          {PERCENTS.map((p) => (
            <button key={p} type="button" className={chip} onClick={() => fillPercent(p)} disabled={balance === null}>
              {p === 100 ? "Max" : `${p}%`}
            </button>
          ))}
        </div>
      </div>

      <dl className="space-y-1.5 border-t border-border pt-3" aria-live="polite">
        <Row
          label="You receive ≈"
          value={amountIn === null ? "—" : loading ? "…" : out === null ? "—" : `${formatToken(out, outDecimals, 6)} ${outSymbol}`}
        />
        <Row label="Avg. price" value={effectivePrice !== null ? `${formatPrice(effectivePrice)} USDC` : "—"} />
        <Row label="Min received (1%)" value={minOut !== null ? `${formatToken(minOut, outDecimals, 6)} ${outSymbol}` : "—"} />
        <Row label="Price impact" value={impact !== null ? `${impact.toFixed(2)}%` : "—"} />
      </dl>

      <button
        type="button"
        disabled={reason !== null}
        onClick={submit}
        className={`h-11 w-full rounded-lg text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${isBuy ? "bg-success" : "bg-danger"}`}
      >
        {reason ?? `${isBuy ? "Buy" : "Sell"} ${market.base}`}
      </button>
    </div>
  );
}
