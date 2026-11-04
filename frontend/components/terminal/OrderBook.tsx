"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BookLevel, MarketInfo, OrderBook as OrderBookData } from "@/lib/market";

type Row = { price: number; size: number; total: number } | null;

function withTotals(levels: BookLevel[], depth: number): Row[] {
  let total = 0;
  return levels.slice(0, depth).map((l) => {
    total += l.size;
    return { price: l.price, size: l.size, total };
  });
}

function fmt(value: number, decimals: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function BookRow({
  row,
  side,
  max,
  market,
  onPriceClick,
}: {
  row: Row;
  side: "bid" | "ask";
  max: number;
  market: MarketInfo;
  onPriceClick?: (price: number) => void;
}) {
  if (!row) return <div className="h-[22px] shrink-0" aria-hidden />;
  const pct = max > 0 ? Math.min(100, (row.total / max) * 100) : 0;
  const color = side === "bid" ? "text-success" : "text-danger";
  const bar = side === "bid" ? "bg-success-soft" : "bg-danger-soft";
  return (
    <button
      type="button"
      onClick={() => onPriceClick?.(row.price)}
      aria-label={`${side === "bid" ? "Bid" : "Ask"} ${fmt(row.price, market.priceDecimals)}, size ${fmt(row.size, market.sizeDecimals)}`}
      className="group relative grid h-[22px] w-full shrink-0 cursor-pointer grid-cols-3 items-center px-3 text-right font-mono text-xs tabular hover:bg-surface-2"
    >
      <span className={`absolute inset-y-0 right-0 ${bar}`} style={{ width: `${pct}%` }} aria-hidden />
      <span className={`relative text-left ${color}`}>{fmt(row.price, market.priceDecimals)}</span>
      <span className="relative text-text">{fmt(row.size, market.sizeDecimals)}</span>
      <span className="relative text-muted">{fmt(row.total, market.sizeDecimals)}</span>
    </button>
  );
}

export function OrderBook({
  book,
  market,
  depth = 16,
  onPriceClick,
}: {
  book: OrderBookData | null;
  market: MarketInfo;
  depth?: number;
  onPriceClick?: (price: number) => void;
}) {
  const view = useMemo(() => {
    if (!book) return null;
    const empty = book.asks.length === 0 && book.bids.length === 0;
    const rawAsk = book.asks.length ? Math.min(...book.asks.map((l) => l.price)) : null;
    const rawBid = book.bids.length ? Math.max(...book.bids.map((l) => l.price)) : null;
    const ref = rawAsk !== null && rawBid !== null ? (rawAsk + rawBid) / 2 : (rawAsk ?? rawBid);
    const near = (l: BookLevel) => ref === null || Math.abs(l.price - ref) <= ref * 0.1;
    const asks = withTotals(book.asks.filter(near).sort((a, b) => a.price - b.price), depth);
    const bids = withTotals(book.bids.filter(near).sort((a, b) => b.price - a.price), depth);
    const pad = (rows: Row[]) => Array.from({ length: depth - rows.length }, (): Row => null);
    const max = Math.max(asks.at(-1)?.total ?? 0, bids.at(-1)?.total ?? 0);
    const bestAsk = rawAsk;
    const bestBid = rawBid;
    return {
      empty,
      askRows: [...pad(asks), ...asks.slice().reverse()],
      bidRows: [...bids, ...pad(bids)],
      max,
      bestAsk,
      bestBid,
    };
  }, [book, depth]);

  const bidsRef = useRef<HTMLDivElement>(null);
  const [bidCap, setBidCap] = useState(depth);
  useEffect(() => {
    const el = bidsRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBidCap(Math.max(1, Math.floor(el.clientHeight / 22))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  const header = (
    <div className="grid h-9 shrink-0 grid-cols-3 items-center border-b border-border px-3 text-[11px] text-faint">
      <span className="text-left">Price ({market.quote})</span>
      <span className="text-right">Size ({market.base})</span>
      <span className="text-right">Total ({market.base})</span>
    </div>
  );

  if (!view) {
    return (
      <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading order book">
        {header}
        <div className="flex-1 overflow-hidden px-3 py-1">
          {Array.from({ length: depth * 2 + 1 }, (_, i) => (
            <div key={i} className="flex h-[22px] items-center">
              <div className="h-3 w-full animate-pulse rounded-sm bg-surface-2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view.empty) {
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="flex flex-1 items-center justify-center px-3 text-center text-[12px] text-muted">
          No resting orders on this market right now
        </div>
      </div>
    );
  }

  const mid = view.bestAsk !== null && view.bestBid !== null ? (view.bestAsk + view.bestBid) / 2 : null;
  const spread = view.bestAsk !== null && view.bestBid !== null ? view.bestAsk - view.bestBid : null;
  const spreadPct = spread !== null && mid ? (spread / mid) * 100 : null;

  return (
    <div className="flex h-full flex-col">
      {header}
      {/* Asks anchor to the spread and bids hang from it, so the best prices always meet in the middle. */}
      <div role="list" aria-label="Asks" className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
        {view.askRows.map((r, i) => (
          <BookRow key={i} row={r} side="ask" max={view.max} market={market} onPriceClick={onPriceClick} />
        ))}
      </div>
      <div className="flex h-9 shrink-0 items-center justify-between border-y border-border px-3">
        <span className="font-mono text-sm tabular text-text">{mid !== null ? fmt(mid, market.priceDecimals) : "—"}</span>
        <span className="font-mono text-[11px] tabular text-faint">
          {spread !== null && spreadPct !== null ? `Spread ${fmt(spread, market.priceDecimals)} (${spreadPct.toFixed(3)}%)` : "Spread —"}
        </span>
      </div>
      <div ref={bidsRef} role="list" aria-label="Bids" className="min-h-0 flex-1 overflow-hidden">
        {view.bidRows.slice(0, bidCap).map((r, i) => (
          <BookRow key={i} row={r} side="bid" max={view.max} market={market} onPriceClick={onPriceClick} />
        ))}
      </div>
    </div>
  );
}
