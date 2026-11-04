"use client";

import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { usePoll } from "@/hooks/usePoll";
import type { Step } from "@/lib/session";
import { formatPrice, formatUsd } from "@/lib/format";
import {
  getAccount,
  getMarkPrice,
  liquidationPrice,
  lotsFor,
  openPosition,
  type PerpMarket,
  type Position,
  type Side,
} from "@/lib/perpl";
import type { StealthSession } from "@/lib/session";

type Run = (job: (onStep: (s: Step) => void) => Promise<string>) => Promise<void>;

const CNS = 1e6;
const PERCENTS = [25, 50, 75, 100] as const;

function parseCollateral(value: string): bigint {
  try {
    return value && value !== "." ? parseUnits(value, 6) : 0n;
  } catch {
    return 0n;
  }
}

function toPrice(market: PerpMarket, pns: bigint) {
  return Number(pns) / 10 ** market.priceDecimals;
}

function toSize(market: PerpMarket, lots: bigint) {
  return Number(lots) / 10 ** market.sizeDecimals;
}

function formatSize(size: number) {
  return size.toLocaleString(undefined, { maximumFractionDigits: 5 });
}

function hypothetical(side: Side, lots: bigint, mark: bigint, margin: bigint): Position {
  return { side, sizeLots: lots, entryPNS: mark, marginCNS: margin, pnlCNS: 0n, markPNS: mark };
}

function blockReason(o: { busy: boolean; hasAccount: boolean; collateral: bigint; free: bigint; lots: bigint; mark: bigint | null }) {
  if (o.busy) return "Working…";
  if (!o.hasAccount || o.mark === null) return "Loading market…";
  if (o.collateral <= 0n) return "Enter an amount";
  if (o.collateral > o.free) return "Amount exceeds free balance";
  if (o.lots <= 0n) return "Size too small";
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
  "h-7 flex-1 rounded-md border border-border bg-surface-2 text-xs text-muted transition-colors hover:border-faint hover:text-text";

export function PerpsOrderForm({
  session,
  market,
  run,
  busy,
  priceHint,
}: {
  session: StealthSession;
  market: PerpMarket;
  run: Run;
  busy: boolean;
  priceHint?: number | null;
}) {
  const [side, setSide] = useState<Side>("long");
  const [amount, setAmount] = useState("");
  const [leverage, setLeverage] = useState(5);
  const lev = Math.min(leverage, market.maxLeverage);

  const owner = session.burner.address;
  const account = usePoll(() => getAccount(owner), 3000, owner).data;
  const polledMark = usePoll(() => getMarkPrice(market.id), 2000, String(market.id)).data;
  const free = account?.balanceCNS ?? 0n;
  const collateral = parseCollateral(amount);

  const hintPNS =
    priceHint != null && priceHint > 0 ? BigInt(Math.round(priceHint * 10 ** market.priceDecimals)) : null;
  const mark = polledMark !== null && polledMark > 0n ? polledMark : hintPNS;

  const lots = mark !== null ? lotsFor(market, collateral, lev, mark) : 0n;
  const size = toSize(market, lots);
  const notional = mark !== null ? size * toPrice(market, mark) : 0;
  const fee = (notional * market.takerFeeBps) / 10_000;
  const liq = mark !== null && lots > 0n ? liquidationPrice(market, hypothetical(side, lots, mark, collateral)) : null;

  const reason = blockReason({ busy, hasAccount: account !== null, collateral, free, lots, mark: polledMark });
  const isLong = side === "long";
  const label = `Open ${isLong ? "Long" : "Short"} ${formatSize(size)} ${market.symbol}`;

  const submit = () => {
    if (reason !== null) return;
    void run(async (onStep) => {
      onStep({ index: 1, total: 1, label: "Placing market order on Perpl" });
      await openPosition(session.burner.wallet, market, side, lots, lev);
      return `Opened ${side} ${formatSize(toSize(market, lots))} ${market.symbol} at ${lev}x`;
    });
  };

  const fillPercent = (pct: number) => setAmount(formatUnits((free * BigInt(pct)) / 100n, 6));
  const leverageChips = [2, 5, 10].filter((x) => x < market.maxLeverage);
  const mid = Math.round(market.maxLeverage / 2);
  const ticks = Array.from(new Set([1, mid, market.maxLeverage]));

  return (
    <div className="space-y-3 px-3 py-3">
      <div role="radiogroup" aria-label="Direction" className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
        {(["long", "short"] as const).map((s) => {
          const active = s === side;
          const fill = s === "long" ? "bg-success" : "bg-danger";
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSide(s)}
              className={`h-8 rounded-md text-[13px] font-medium transition-colors ${active ? `${fill} text-white` : "text-muted hover:text-text"}`}
            >
              {s === "long" ? "Long" : "Short"}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 border-b border-border text-xs">
        <span className="-mb-px border-b-2 border-accent pb-1.5 font-medium text-text">Market</span>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">Available</span>
        <span className="font-mono tabular">{account ? `${formatUsd(Number(free) / CNS)} AUSD` : "—"}</span>
      </div>

      <div>
        <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 focus-within:border-accent">
          <span className="shrink-0 text-xs text-faint">Collateral</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0.00"
            aria-label="Collateral in AUSD"
            className="min-w-0 flex-1 bg-transparent text-right font-mono text-[13px] tabular outline-none placeholder:text-faint"
          />
          <span className="shrink-0 text-xs text-muted">AUSD</span>
        </label>
        <div className="mt-1.5 flex gap-1.5">
          {PERCENTS.map((p) => (
            <button key={p} type="button" className={chip} onClick={() => fillPercent(p)} disabled={!account}>
              {p === 100 ? "Max" : `${p}%`}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="perp-leverage" className="text-muted">
            Leverage
          </label>
          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs tabular text-text">{lev}x</span>
        </div>
        <input
          id="perp-leverage"
          type="range"
          min={1}
          max={market.maxLeverage}
          step={1}
          value={lev}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="mt-2 w-full accent-[var(--color-accent)]"
        />
        <div className="mt-0.5 flex justify-between font-mono text-[10px] text-faint" aria-hidden>
          {ticks.map((t) => (
            <span key={t}>{t}x</span>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          {leverageChips.map((x) => (
            <button key={x} type="button" className={chip} onClick={() => setLeverage(x)}>
              {x}x
            </button>
          ))}
          <button type="button" className={chip} onClick={() => setLeverage(market.maxLeverage)}>
            Max
          </button>
        </div>
      </div>

      <dl className="space-y-1.5 border-t border-border pt-3" aria-live="polite">
        <Row label="Size" value={lots > 0n ? `${formatSize(size)} ${market.symbol}` : "—"} />
        <Row label="Notional" value={lots > 0n ? formatUsd(notional) : "—"} />
        <Row label="Est. entry (mark)" value={mark !== null ? `$${formatPrice(toPrice(market, mark))}` : "—"} />
        <Row label="Est. liquidation" value={liq !== null && Number.isFinite(liq) && liq > 0 ? `$${formatPrice(liq)}` : "—"} />
        <Row label={`Fee (taker ${market.takerFeeBps} bps)`} value={lots > 0n ? formatUsd(fee, 4) : "—"} />
        <Row label="Max slippage" value="1%" />
      </dl>

      <button
        type="button"
        disabled={reason !== null}
        onClick={submit}
        className={`h-11 w-full rounded-lg text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${isLong ? "bg-success" : "bg-danger"}`}
      >
        {reason ?? label}
      </button>
    </div>
  );
}
