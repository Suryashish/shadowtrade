"use client";

import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { usePoll } from "@/hooks/usePoll";
import type { Step } from "@/lib/session";
import {
  getMarkPrice,
  liquidationPrice,
  lotsFor,
  openPosition,
  type PerpMarket,
  type Position,
  type Side,
} from "@/lib/perpl";
import { ensureExitGas, finishPerplSetup, perplSetup, type StealthSession } from "@/lib/session";

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

function formatSize(size: number, dp: number) {
  return size.toLocaleString(undefined, { maximumFractionDigits: Math.min(dp, 8) });
}

function formatPx(value: number, dp: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

function formatUsd(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatFee(value: number) {
  return value >= 0.01 ? formatUsd(value) : "<$0.01";
}

const MIN_NOTIONAL = 10;

function hypothetical(side: Side, lots: bigint, mark: bigint, margin: bigint): Position {
  return { side, sizeLots: lots, entryPNS: mark, marginCNS: margin, pnlCNS: 0n, markPNS: mark };
}

function blockReason(o: { busy: boolean; loaded: boolean; hasAccount: boolean; collateral: bigint; free: bigint; lots: bigint; notional: number; mark: bigint | null }) {
  if (o.busy) return "Working…";
  if (!o.loaded || o.mark === null) return "Loading market…";
  if (!o.hasAccount) return "Perpl account not set up";
  if (o.collateral <= 0n) return "Enter an amount";
  if (o.collateral > o.free) return "Amount exceeds free balance";
  if (o.lots <= 0n) return "Size too small";
  if (o.notional < MIN_NOTIONAL) return "Below minimum order";
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
  "h-6 flex-1 rounded-md border border-border bg-surface-2 text-xs text-muted transition-colors hover:border-faint hover:text-text disabled:cursor-not-allowed disabled:opacity-50";

const leverageChip = (active: boolean) =>
  `tabular h-6 rounded-md border px-2 font-mono text-[11px] transition-colors ${
    active ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-2 text-muted hover:border-faint hover:text-text"
  }`;

export function PerpsOrderForm({
  session,
  market,
  markets,
  run,
  busy,
  priceHint,
}: {
  session: StealthSession;
  market: PerpMarket;
  markets: PerpMarket[];
  run: Run;
  busy: boolean;
  priceHint?: number | null;
}) {
  const [side, setSide] = useState<Side>("long");
  const [amount, setAmount] = useState("");
  const [leverage, setLeverage] = useState(5);
  const lev = Math.min(leverage, market.maxLeverage);

  const owner = session.burner.address;
  const setup = usePoll(() => perplSetup(owner), 3000, owner).data;
  const account = setup?.account ?? null;
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

  const reason = blockReason({ busy, loaded: setup !== null, hasAccount: account !== null, collateral, free, lots, notional, mark: polledMark });
  const isLong = side === "long";
  const over = account !== null && collateral > free;
  const tooSmall = !over && lots > 0n && notional < MIN_NOTIONAL;
  const showValues = !over && lots > 0n;
  const label = `Open ${isLong ? "Long" : "Short"} ${formatSize(size, market.sizeDecimals)} ${market.symbol}`;

  const submit = () => {
    if (reason !== null) return;
    void run(async (onStep) => {
      onStep({ index: 1, total: 1, label: "Placing market order on Perpl" });
      await ensureExitGas(session, markets);
      await openPosition(session.burner.wallet, market, side, lots, lev);
      return `Opened ${side} ${formatSize(toSize(market, lots), market.sizeDecimals)} ${market.symbol} at ${lev}x`;
    });
  };

  const finishSetup = () =>
    void run(async (onStep) => {
      onStep({ index: 1, total: 1, label: "Opening a Perpl margin account" });
      await finishPerplSetup(session);
      return "Perpl account is ready. You can trade now.";
    });

  const fillPercent = (pct: number) => setAmount(formatUnits((free * BigInt(pct)) / 100n, 6));
  const leverageChips = [2, 5, 10].filter((x) => x < market.maxLeverage);
  const mid = Math.round(market.maxLeverage / 2);
  const ticks = Array.from(new Set([1, mid, market.maxLeverage]));

  return (
    <div className="flex flex-col gap-2.5 px-3 pb-3 pt-3">
      <div role="radiogroup" aria-label="Direction" className="grid grid-cols-2 gap-1 rounded-md bg-surface-2 p-1">
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

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">Available</span>
        <button
          type="button"
          disabled={!account}
          onClick={() => fillPercent(100)}
          title="Use full balance"
          className="font-mono tabular underline-offset-4 enabled:hover:text-accent enabled:hover:underline disabled:cursor-default"
        >
          {account ? `${formatUsd(Number(free) / CNS)} AUSD` : "—"}
        </button>
      </div>

      <div>
        <label
          className={`flex h-9 items-center gap-2 rounded-md border bg-surface-2 px-3 ${over ? "border-danger" : "border-border focus-within:border-accent"}`}
        >
          <span className="shrink-0 text-xs text-faint">Collateral</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0.00"
            aria-label="Collateral in AUSD"
            aria-invalid={over}
            className="min-w-0 flex-1 bg-transparent text-right font-mono text-[13px] tabular outline-none placeholder:text-faint"
          />
          <span className="shrink-0 text-xs text-muted">AUSD</span>
        </label>
        {over && (
          <p role="alert" className="mt-1 text-[11px] text-danger">
            Exceeds available balance ({formatUsd(Number(free) / CNS).replace("$", "")} AUSD)
          </p>
        )}
        <div className="mt-1.5 flex gap-1.5">
          {PERCENTS.map((p) => (
            <button key={p} type="button" className={chip} onClick={() => fillPercent(p)} disabled={!account}>
              {p === 100 ? "Max" : `${p}%`}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 text-xs">
          <label htmlFor="perp-leverage" className="text-muted">
            Leverage
          </label>
          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs tabular text-text">{lev}x</span>
          <div className="ml-auto flex gap-1">
            {leverageChips.map((x) => (
              <button key={x} type="button" aria-pressed={lev === x} className={leverageChip(lev === x)} onClick={() => setLeverage(x)}>
                {x}x
              </button>
            ))}
            <button type="button" aria-pressed={lev === market.maxLeverage} className={leverageChip(lev === market.maxLeverage)} onClick={() => setLeverage(market.maxLeverage)}>
              Max
            </button>
          </div>
        </div>
        <input
          id="perp-leverage"
          type="range"
          min={1}
          max={market.maxLeverage}
          step={1}
          value={lev}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="mt-1.5 block h-4 w-full accent-[var(--color-accent)]"
        />
        <div className="flex justify-between font-mono text-[10px] leading-none text-faint" aria-hidden>
          {ticks.map((t) => (
            <span key={t}>{t}x</span>
          ))}
        </div>
      </div>

      <dl className="space-y-1.5 border-t border-border pt-2.5" aria-live="polite">
        <Row label="Size" value={showValues ? `${formatSize(size, market.sizeDecimals)} ${market.symbol}` : "—"} />
        <Row label="Notional" value={showValues ? formatUsd(notional) : "—"} />
        <Row label="Est. entry (mark)" value={mark !== null ? formatPx(toPrice(market, mark), market.priceDecimals) : "—"} />
        <Row label="Est. liquidation" value={showValues && liq !== null && Number.isFinite(liq) && liq > 0 ? formatPx(liq, market.priceDecimals) : "—"} />
        <Row label={`Fee (taker ${market.takerFeeBps} bps)`} value={showValues ? formatFee(fee) : "—"} />
        <Row label="Max slippage" value="1%" />
      </dl>

      <div>
        {setup && !account && (
          <div className="mb-2 rounded-md border border-warning/40 bg-surface-2 p-2.5 text-[11px] leading-snug text-muted">
            {setup.idle > 0n ? (
              <>
                Setup stopped before the Perpl account opened. {formatUsd(Number(setup.idle) / CNS).replace("$", "")} AUSD is waiting in your burner.
                <button
                  type="button"
                  disabled={busy}
                  onClick={finishSetup}
                  className="mt-2 h-8 w-full rounded-md bg-accent text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  Finish setup
                </button>
              </>
            ) : (
              "Setup stopped before any AUSD reached your burner. Exit Stealth and enter again."
            )}
          </div>
        )}
        {tooSmall && <p className="mb-1.5 text-[11px] text-warning">Minimum order is about $10 notional</p>}
        <button
          type="button"
          disabled={reason !== null}
          onClick={submit}
          className={`h-10 w-full rounded-md text-[13px] font-semibold transition-opacity ${
            reason !== null ? "cursor-not-allowed border border-border bg-surface-2 text-muted" : `text-white hover:opacity-90 ${isLong ? "bg-success" : "bg-danger"}`
          }`}
        >
          {reason ?? label}
        </button>
      </div>
    </div>
  );
}
