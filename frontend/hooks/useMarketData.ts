"use client";

import { useEffect, useState } from "react";
import { SPOT_MARKETS, type SpotMarket } from "@/lib/config";
import { fetchKuruBook, fetchKuruCandles, fetchKuruStats, fetchKuruTrades, KURU_PRECISION } from "@/lib/kuruData";
import type { Candle, MarketInfo, MarketStats, OrderBook, Resolution, Trade } from "@/lib/market";
import type { PerpMarket } from "@/lib/perpl";
import { applyBookLevels, perplFeed, toBookSide, toCandles, toTrades, type FeedMessage, type RawCandle } from "@/lib/perplFeed";
import { usePoll } from "./usePoll";

const BOOK_DEPTH = 16;
const MAX_TRADES = 50;
const CANDLES_PER_LOAD = 300;

export type TerminalMarket =
  | { info: MarketInfo; venue: "perpl"; perp: PerpMarket }
  | { info: MarketInfo; venue: "kuru"; spot: SpotMarket };

export function perpInfo(m: PerpMarket): MarketInfo {
  return {
    key: `perpl:${m.id}`,
    venue: "perpl",
    name: `${m.symbol}-PERP`,
    base: m.symbol,
    quote: "USD",
    priceDecimals: m.priceDecimals,
    sizeDecimals: m.sizeDecimals,
    maxLeverage: m.maxLeverage,
  };
}

export function spotInfo(m: SpotMarket): MarketInfo {
  const p = KURU_PRECISION[m.symbol];
  return {
    key: `kuru:${m.symbol}`,
    venue: "kuru",
    name: m.symbol,
    base: m.base,
    quote: "USDC",
    priceDecimals: Math.round(Math.log10(p.price)) - 2,
    sizeDecimals: Math.min(6, Math.round(Math.log10(p.size)) - 4),
    maxLeverage: null,
  };
}

export const SPOT_TERMINAL_MARKETS: TerminalMarket[] = SPOT_MARKETS.map((spot) => ({ info: spotInfo(spot), venue: "kuru", spot }));

type TickerState = { orl: number; mrk: number; lst: number; prv: number; dva: string; oi: number };

async function fetchPerplTicker(): Promise<Record<string, TickerState>> {
  const res = await fetch("/api/perpl/market-data/ticker");
  if (!res.ok) throw new Error("Perpl prices are unavailable right now.");
  return ((await res.json()) as { d: Record<string, TickerState> }).d;
}

function perpStats(m: PerpMarket, t: TickerState | undefined): MarketStats | null {
  if (!t) return null;
  const px = (v: number) => v / 10 ** m.priceDecimals;
  const last = px(t.lst || t.mrk);
  return {
    price: last,
    mark: px(t.mrk),
    oracle: px(t.orl),
    change24h: t.prv ? (t.lst - t.prv) / t.prv : null,
    volume24h: Number(t.dva) / 1e6,
    openInterest: (t.oi / 10 ** m.sizeDecimals) * px(t.mrk),
  };
}

/** Every market on both venues with live 24h stats. */
export function useMarketStats(perps: PerpMarket[]) {
  const ticker = usePoll(perps.length ? fetchPerplTicker : null, 5000, "perpl");
  const spot = usePoll(() => Promise.all(SPOT_MARKETS.map((m) => fetchKuruStats(m).catch(() => null))), 10_000, "kuru");
  const stats = new Map<string, MarketStats | null>();
  for (const m of perps) stats.set(perpInfo(m).key, perpStats(m, ticker.data?.[String(m.id)]));
  SPOT_TERMINAL_MARKETS.forEach((m, i) => stats.set(m.info.key, spot.data?.[i] ?? null));
  return stats;
}

type Keyed<T> = { key: string; value: T };

function mergeCandles(prev: Candle[], updates: Candle[]): Candle[] {
  const next = [...prev];
  for (const c of updates) {
    const last = next[next.length - 1];
    if (!last || c.time > last.time) next.push(c);
    else if (c.time === last.time) next[next.length - 1] = c;
  }
  return next;
}

async function fetchPerplCandles(m: PerpMarket, resolution: Resolution): Promise<Candle[]> {
  // Aligned to the candle boundary so concurrent viewers share the proxy's cache entry.
  const step = resolution * 1000;
  const to = Math.ceil(Date.now() / step) * step;
  const from = to - step * CANDLES_PER_LOAD;
  const res = await fetch(`/api/perpl/market-data/${m.id}/candles/${resolution}/${from}-${to}`);
  if (!res.ok) throw new Error("Chart data is unavailable right now.");
  return toCandles(((await res.json()) as { d: RawCandle[] }).d, m.priceDecimals);
}

export function useCandles(market: TerminalMarket, resolution: Resolution) {
  const key = `${market.info.key}:${resolution}`;
  const [state, setState] = useState<Keyed<Candle[]> | null>(null);
  const [error, setError] = useState<Keyed<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      (market.venue === "perpl" ? fetchPerplCandles(market.perp, resolution) : fetchKuruCandles(market.spot, resolution, Math.floor(Date.now() / 1000)))
        .then((value) => !cancelled && setState({ key, value }))
        .catch((e: unknown) => !cancelled && setError({ key, value: e instanceof Error ? e.message : "Chart data is unavailable." }));
    load();

    if (market.venue === "kuru") {
      const id = setInterval(load, 10_000);
      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }
    const perp = market.perp;
    const unsubscribe = perplFeed.subscribe(`candles@${perp.id}*${resolution}`, (msg: FeedMessage) => {
      if (msg.mt !== 12) return;
      const updates = toCandles(msg.d, perp.priceDecimals);
      setState((prev) => (prev && prev.key === key ? { key, value: mergeCandles(prev.value, updates) } : prev));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [market, resolution, key]);

  return {
    candles: state?.key === key ? state.value : null,
    error: error?.key === key ? error.value : null,
  };
}

export function useOrderBook(market: TerminalMarket): OrderBook | null {
  const key = market.info.key;
  const [state, setState] = useState<Keyed<OrderBook> | null>(null);
  const spot = usePoll(market.venue === "kuru" ? () => fetchKuruBook(market.spot, BOOK_DEPTH) : null, 1500, key);

  useEffect(() => {
    if (market.venue !== "perpl") return;
    const { id, priceDecimals, sizeDecimals } = market.perp;
    const bids = new Map<number, number>();
    const asks = new Map<number, number>();
    return perplFeed.subscribe(`order-book@${id}`, (msg: FeedMessage) => {
      if (msg.mt !== 15 && msg.mt !== 16) return;
      applyBookLevels(bids, msg.bid, msg.mt === 15);
      applyBookLevels(asks, msg.ask, msg.mt === 15);
      setState({
        key,
        value: {
          bids: toBookSide(bids, priceDecimals, sizeDecimals, true).slice(0, BOOK_DEPTH),
          asks: toBookSide(asks, priceDecimals, sizeDecimals, false).slice(0, BOOK_DEPTH),
        },
      });
    });
  }, [market, key]);

  if (market.venue === "kuru") return spot.data;
  return state?.key === key ? state.value : null;
}

export function useTrades(market: TerminalMarket): Trade[] | null {
  const key = market.info.key;
  const [state, setState] = useState<Keyed<Trade[]> | null>(null);
  const spot = usePoll(market.venue === "kuru" ? () => fetchKuruTrades(market.spot) : null, 5000, key);

  useEffect(() => {
    if (market.venue !== "perpl") return;
    const { id, priceDecimals, sizeDecimals } = market.perp;
    return perplFeed.subscribe(`trades@${id}`, (msg: FeedMessage) => {
      if (msg.mt !== 17 && msg.mt !== 18) return;
      const incoming = toTrades(msg.d, priceDecimals, sizeDecimals).sort((a, b) => b.time - a.time);
      setState((prev) => {
        const base = msg.mt === 17 || !prev || prev.key !== key ? [] : prev.value;
        return { key, value: [...incoming, ...base].slice(0, MAX_TRADES) };
      });
    });
  }, [market, key]);

  if (market.venue === "kuru") return spot.data;
  return state?.key === key ? state.value : null;
}
