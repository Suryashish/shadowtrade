"use client";

import type { MarketInfo, Trade } from "@/lib/market";

function fmt(value: number, decimals: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtTime(seconds: number) {
  return new Date(seconds * 1000).toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function RecentTrades({ trades, market }: { trades: Trade[] | null; market: MarketInfo }) {
  return (
    <div className="flex h-full flex-col">
      <div className="grid h-9 shrink-0 grid-cols-3 items-center border-b border-border px-3 text-[11px] text-faint">
        <span className="text-left">Price ({market.quote})</span>
        <span className="text-right">Size ({market.base})</span>
        <span className="text-right">Time</span>
      </div>
      {trades === null ? (
        <div className="flex-1 overflow-hidden px-3 py-1" aria-busy="true" aria-label="Loading trades">
          {Array.from({ length: 14 }, (_, i) => (
            <div key={i} className="flex h-[22px] items-center">
              <div className="h-3 w-full animate-pulse rounded-sm bg-surface-2" />
            </div>
          ))}
        </div>
      ) : trades.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs text-faint">No recent trades</div>
      ) : (
        <div className="scroll-thin flex-1 overflow-y-auto" role="list" aria-label="Recent trades">
          {trades.slice(0, 50).map((t, i) => (
            <div
              key={t.id}
              role="listitem"
              className={`grid h-[22px] grid-cols-3 items-center px-3 font-mono text-xs tabular hover:bg-surface-2 ${
                i === 0 ? (t.side === "buy" ? "flash-up" : "flash-down") : ""
              }`}
            >
              <span className={`text-left ${t.side === "buy" ? "text-success" : "text-danger"}`}>
                {fmt(t.price, market.priceDecimals)}
              </span>
              <span className="text-right text-text">{fmt(t.size, market.sizeDecimals)}</span>
              <span className="text-right text-faint">{fmtTime(t.time)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
