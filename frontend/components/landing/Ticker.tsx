"use client";

import { useEffect, useState } from "react";

type Market = { id: number; symbol: string; priceDecimals: number };
type TickerRes = { d: Record<string, { mrk?: number; prv?: number; lst?: number }> };
type Row = { symbol: string; price: number; change: number | null };

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 2 : 4, minimumFractionDigits: n >= 100 ? 2 : 2 });
}

export function Ticker() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let alive = true;
    let markets: Market[] | null = null;

    async function load() {
      try {
        if (!markets) {
          const m = await fetch("/api/perpl/markets");
          if (!m.ok) throw new Error("markets");
          markets = (await m.json()) as Market[];
        }
        const t = await fetch("/api/perpl/market-data/ticker");
        if (!t.ok) throw new Error("ticker");
        const data = (await t.json()) as TickerRes;
        const next: Row[] = [];
        for (const mk of markets) {
          const e = data.d?.[String(mk.id)];
          if (!e) continue;
          const scale = 10 ** mk.priceDecimals;
          const raw = e.mrk ?? e.lst;
          if (!raw) continue;
          const price = raw / scale;
          const prev = e.prv ? e.prv / scale : null;
          next.push({ symbol: mk.symbol, price, change: prev ? ((price - prev) / prev) * 100 : null });
        }
        if (alive) setRows(next);
      } catch {
        if (alive) setRows([]);
      }
    }

    void load();
    const id = setInterval(() => void load(), 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (rows.length === 0) return <div aria-hidden className="h-[49px] border-y border-l-rule-soft bg-l-bg" />;

  return (
    <div className="border-y border-l-rule-soft bg-l-bg text-l-fg" aria-label="Live Perpl markets">
      <ul className="mx-auto flex w-full max-w-[1280px] gap-10 overflow-x-auto px-5 py-3.5 font-mono text-[12px] font-medium uppercase tracking-[0.06em] sm:px-10 [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_85%,transparent)]">
        {rows.map((r) => (
          <li key={r.symbol} className="flex shrink-0 items-center gap-2.5">
            <span className="text-l-muted">{r.symbol}</span>
            <span>{fmt(r.price)}</span>
            {r.change !== null ? (
              <span className={r.change >= 0 ? "text-l-up" : "text-l-down"}>
                {r.change >= 0 ? "+" : ""}
                {r.change.toFixed(2)}%
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
