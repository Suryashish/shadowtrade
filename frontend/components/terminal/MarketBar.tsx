"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { VENUES, type Venue } from "@/lib/config";
import type { MarketInfo, MarketStats } from "@/lib/market";
import { COIN_DEFS } from "../landing/coins";

type Entry = { info: MarketInfo; stats: MarketStats | null };

const usdCompact = new Intl.NumberFormat(undefined, {
  notation: "compact",
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function num(value: number | null, decimals: number) {
  if (value === null) return "—";
  return value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function usd(value: number | null) {
  return value === null ? "—" : usdCompact.format(value);
}

function pct(change: number | null) {
  if (change === null) return "—";
  return `${change >= 0 ? "+" : ""}${(change * 100).toFixed(2)}%`;
}

function changeColor(change: number | null) {
  if (change === null || change === 0) return "text-text";
  return change > 0 ? "text-success" : "text-danger";
}

function hueOf(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/** Strip wrapper/synthetic prefixes so e.g. WETH resolves to the ETH mark. */
function coinFor(base: string) {
  const id = base.toLowerCase();
  return COIN_DEFS.find((c) => c.id.toLowerCase() === id && c.label !== "");
}

export function CoinMark({ base, size = 24 }: { base: string; size?: number }) {
  const def = coinFor(base);
  const color = def?.color ?? `hsl(${hueOf(base)} 12% 42%)`;
  const label = base.length <= 4 ? base.toUpperCase() : base.slice(0, 3).toUpperCase();
  const fontSize = Math.max(7, Math.round(size * (label.length >= 4 ? 0.27 : label.length === 3 ? 0.31 : 0.4)));
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-sans font-extrabold leading-none tracking-tight text-white"
      style={{
        width: size,
        height: size,
        fontSize,
        backgroundColor: color,
        boxShadow: def?.id === "NEAR" ? "inset 0 0 0 1.5px rgba(255,255,255,0.85)" : `inset 0 0 0 1px ${def?.edge ?? "rgba(0,0,0,0.25)"}`,
      }}
    >
      {label}
    </span>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      <span className="text-[11px] leading-none text-faint">{label}</span>
      <span className="font-mono text-xs leading-none tabular text-text">{children}</span>
    </div>
  );
}

function MarketPicker({
  markets,
  selected,
  onSelect,
  onClose,
}: {
  markets: Entry[];
  selected: MarketInfo;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return markets;
    return markets.filter((m) => m.info.name.toLowerCase().includes(q) || m.info.base.toLowerCase().includes(q));
  }, [markets, query]);

  const active = Math.min(cursor, Math.max(0, filtered.length - 1));

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  useEffect(() => {
    rootRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor(Math.min(active + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor(Math.max(active - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = filtered[active];
      if (m) onSelect(m.info.key);
    }
  }

  return (
    <div
      ref={rootRef}
      onKeyDown={onKeyDown}
      className="fixed inset-x-3 top-[104px] z-40 rounded-xl sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-1 sm:w-[420px] border border-border-strong bg-surface shadow-pop overflow-hidden"
    >
      <div className="border-b border-border p-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          placeholder="Search markets"
          aria-label="Search markets"
          className="h-8 w-full rounded-md border border-border bg-surface-2 px-2 text-xs text-text outline-none placeholder:text-faint focus:border-accent"
        />
      </div>
      <div className="grid h-7 grid-cols-[1.4fr_1fr_0.9fr_1fr] items-center border-b border-border px-3 text-[11px] text-faint">
        <span>Market</span>
        <span className="text-right">Last price</span>
        <span className="text-right">24h change</span>
        <span className="text-right">24h volume</span>
      </div>
      <div role="listbox" aria-label="Markets" className="scroll-thin max-h-[min(380px,calc(70vh-90px))] overflow-y-auto pb-1">
        {filtered.length === 0 && <div className="px-3 py-6 text-center text-xs text-faint">No markets found</div>}
        {filtered.map((m, i) => {
          const isSel = m.info.key === selected.key;
          const isActive = i === active;
          return (
            <div
              key={m.info.key}
              role="option"
              aria-selected={isSel}
              data-active={isActive}
              tabIndex={-1}
              onMouseEnter={() => setCursor(i)}
              onClick={() => onSelect(m.info.key)}
              className={`relative grid h-10 cursor-pointer grid-cols-[1.4fr_1fr_0.9fr_1fr] items-center px-3 text-xs transition-colors hover:bg-surface-2 ${
                isSel ? "bg-accent-soft" : isActive ? "bg-surface-2" : ""
              }`}
            >
              {isSel && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
              <span className="flex min-w-0 items-center gap-2">
                <CoinMark base={m.info.base} size={22} />
                <span className="truncate font-medium text-text">{m.info.name}</span>
                {m.info.maxLeverage !== null && (
                  <span className="hidden rounded-sm border border-border px-1 py-px font-mono text-[10px] leading-none text-muted sm:inline">
                    {m.info.maxLeverage}×
                  </span>
                )}
              </span>
              <span className="text-right font-mono tabular text-text">
                {num(m.stats?.price ?? null, m.info.priceDecimals)}
              </span>
              <span className={`text-right font-mono tabular ${changeColor(m.stats?.change24h ?? null)}`}>
                {pct(m.stats?.change24h ?? null)}
              </span>
              <span className="text-right font-mono tabular text-muted">{usd(m.stats?.volume24h ?? null)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MarketBar({
  markets,
  selected,
  stats,
  onSelect,
  venue,
  onVenueChange,
  midPrice,
}: {
  markets: Entry[];
  selected: MarketInfo;
  stats: MarketStats | null;
  onSelect: (key: string) => void;
  venue: Venue;
  onVenueChange: (v: Venue) => void;
  midPrice?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const change = stats?.change24h ?? null;
  const last = stats?.price ?? null;
  const useMid = venue === "kuru" && midPrice != null;
  const price = useMid ? midPrice : last;
  const thin = (stats?.volume24h ?? Infinity) < 100;
  const cc = changeColor(change);
  const d = selected.priceDecimals;

  return (
    <div className="relative flex h-14 items-center gap-3 border-b border-border bg-surface px-3 sm:gap-6">
      {VENUES.length > 1 && (
        <div role="tablist" aria-label="Venue" className="flex h-8 shrink-0 items-center rounded-md bg-surface-2 p-0.5">
          {VENUES.map((v) => [v, v === "perpl" ? "Perps" : "Spot"] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={venue === v}
              onClick={() => onVenueChange(v)}
              className={`h-7 rounded px-2 text-xs font-medium transition-colors sm:px-3 ${
                venue === v ? "bg-surface text-text shadow-card" : "text-muted hover:text-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="relative shrink-0">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Select market, current ${selected.name}`}
          onClick={() => setOpen((o) => !o)}
          className="flex h-9 items-center gap-2 rounded-md px-1 hover:bg-surface-2 sm:px-2"
        >
          <span className="hidden sm:inline-flex">
            <CoinMark base={selected.base} size={28} />
          </span>
          <span className="whitespace-nowrap text-sm font-semibold text-text sm:text-[15px]">{selected.name}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="text-muted">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <MarketPicker
            markets={markets}
            selected={selected}
            onClose={() => setOpen(false)}
            onSelect={(key) => {
              onSelect(key);
              setOpen(false);
            }}
          />
        )}
      </div>

      <span className={`shrink-0 whitespace-nowrap font-mono text-base font-medium tabular sm:text-lg ${cc}`}>
        {num(price, d)}
      </span>

      <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max items-center gap-6 pr-6">
          {useMid && <Stat label="Last trade">{num(last, d)}</Stat>}
          {venue === "perpl" && <span className="hidden sm:contents"><Stat label="Mark">{num(stats?.mark ?? null, d)}</Stat></span>}
          {stats?.oracle != null && <span className="hidden sm:contents"><Stat label="Oracle">{num(stats.oracle, d)}</Stat></span>}
          <Stat label="24h Change">
            {thin ? (
              <span className="text-faint" title="Very little trading in the last 24h">
                {pct(change)}
              </span>
            ) : (
              <span className={cc}>{pct(change)}</span>
            )}
          </Stat>
          <Stat label="24h Volume">{usd(stats?.volume24h ?? null)}</Stat>
          {stats?.openInterest != null && <Stat label="Open Interest">{usd(stats.openInterest)}</Stat>}
        </div>
      </div>

      <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
        {venue === "perpl" && selected.maxLeverage !== null && (
          <span className="inline-flex h-6 items-center rounded-sm border border-border px-2 font-mono text-[11px] text-muted">
            Max <span className="ml-1 text-text">{selected.maxLeverage}×</span>
          </span>
        )}
        <span className="inline-flex h-6 items-center rounded-sm border border-border bg-surface-2 px-2 text-[11px] font-medium text-muted">
          {venue === "perpl" ? "Perpl" : "Kuru"}
        </span>
      </div>
    </div>
  );
}
