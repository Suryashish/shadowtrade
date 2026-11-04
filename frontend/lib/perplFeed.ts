import type { BookLevel, Candle, Trade } from "./market";

type Listener = (msg: FeedMessage) => void;

type RawLevel = { p: number; s: number; o: number };
type RawTrade = { at: { b: number; t: number; tx: number; txid: string }; p: number; s: number; sd: number };
type RawCandle = { t: number; o: number; c: number; h: number; l: number; v: string };

export type FeedMessage =
  | { mt: 6 }
  | { mt: 11 | 12; d: RawCandle[] }
  | { mt: 15 | 16; bid: RawLevel[]; ask: RawLevel[] }
  | { mt: 17 | 18; d: RawTrade[] };

/**
 * Perpl market-data streams, relayed by our server as Server-Sent Events (Perpl's socket rejects
 * browser origins). One EventSource per stream, shared and reference-counted across components;
 * EventSource reconnects on its own.
 */
class PerplFeed {
  private sources = new Map<string, { source: EventSource; listeners: Set<Listener> }>();

  subscribe(stream: string, listener: Listener): () => void {
    let entry = this.sources.get(stream);
    if (!entry && typeof EventSource !== "undefined") {
      const source = new EventSource(`/api/perpl/stream?s=${encodeURIComponent(stream)}`);
      const created = { source, listeners: new Set<Listener>() };
      source.onmessage = (event: MessageEvent<string>) => {
        let msg: FeedMessage;
        try {
          msg = JSON.parse(event.data) as FeedMessage;
        } catch {
          return;
        }
        created.listeners.forEach((l) => l(msg));
      };
      this.sources.set(stream, created);
      entry = created;
    }
    entry?.listeners.add(listener);
    return () => {
      const current = this.sources.get(stream);
      if (!current) return;
      current.listeners.delete(listener);
      if (current.listeners.size === 0) {
        current.source.close();
        this.sources.delete(stream);
      }
    };
  }
}

export const perplFeed = new PerplFeed();

const scale = (v: number, decimals: number) => v / 10 ** decimals;

export function applyBookLevels(levels: Map<number, number>, raw: RawLevel[], snapshot: boolean) {
  if (snapshot) levels.clear();
  for (const l of raw) {
    if (l.o === 0 || l.s === 0) levels.delete(l.p);
    else levels.set(l.p, l.s);
  }
}

export function toBookSide(levels: Map<number, number>, priceDecimals: number, sizeDecimals: number, descending: boolean): BookLevel[] {
  return [...levels.entries()]
    .sort((a, b) => (descending ? b[0] - a[0] : a[0] - b[0]))
    .map(([p, s]) => ({ price: scale(p, priceDecimals), size: scale(s, sizeDecimals) }));
}

export function toTrades(raw: RawTrade[], priceDecimals: number, sizeDecimals: number): Trade[] {
  return raw.map((t) => ({
    id: `${t.at.txid}:${t.at.tx}:${t.p}:${t.s}`,
    price: scale(t.p, priceDecimals),
    size: scale(t.s, sizeDecimals),
    side: t.sd === 1 ? "buy" : "sell",
    time: t.at.t,
  }));
}

export function toCandles(raw: RawCandle[], priceDecimals: number): Candle[] {
  return raw.map((c) => ({
    time: Math.floor(c.t / 1000),
    open: scale(c.o, priceDecimals),
    high: scale(c.h, priceDecimals),
    low: scale(c.l, priceDecimals),
    close: scale(c.c, priceDecimals),
    volume: Number(c.v) / 1e6,
  }));
}

export type { RawCandle };
