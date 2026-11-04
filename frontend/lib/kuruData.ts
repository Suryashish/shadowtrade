import { kuruOrderBookAbi } from "./abi/kuru";
import { publicClient } from "./chain";
import type { SpotMarket } from "./config";
import type { Candle, MarketStats, OrderBook, Resolution, Trade } from "./market";

const API = "https://api.testnet.kuru.io/api/v1/markets";
const VOLUME_SCALE = 1e18;
const CANDLES_PER_LOAD = 300;

/** Kuru precisions per market (from its market params). */
export const KURU_PRECISION: Record<string, { price: number; size: number }> = {
  "WETH/USDC": { price: 1e4, size: 1e10 },
  "cbBTC/USDC": { price: 1e3, size: 1e8 },
};

// Kuru serves 1m/5m/1h/1d; other terminal resolutions are aggregated from the nearest finer one.
const INTERVALS: Record<Resolution, { interval: string; seconds: number; factor: number }> = {
  60: { interval: "1m", seconds: 60, factor: 1 },
  300: { interval: "5m", seconds: 300, factor: 1 },
  900: { interval: "5m", seconds: 300, factor: 3 },
  3600: { interval: "1h", seconds: 3600, factor: 1 },
  14400: { interval: "1h", seconds: 3600, factor: 4 },
  86400: { interval: "1d", seconds: 86400, factor: 1 },
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Kuru market data is unavailable right now.");
  return (await res.json()) as T;
}

const marketUrl = (m: SpotMarket) => `${API}/${m.orderBook.toLowerCase()}`;

type StatsResponse = { data: { lastPrice: string | null; priceChange24hPct: string | null; volume24h: string | null } };

export async function fetchKuruStats(m: SpotMarket): Promise<MarketStats> {
  const { data } = await getJson<StatsResponse>(marketUrl(m));
  const price = data.lastPrice ? Number(data.lastPrice) / KURU_PRECISION[m.symbol].price : null;
  return {
    price,
    mark: null,
    oracle: null,
    change24h: data.priceChange24hPct === null ? null : Number(data.priceChange24hPct),
    volume24h: data.volume24h === null ? null : Number(data.volume24h) / VOLUME_SCALE,
    openInterest: null,
  };
}

type CandleResponse = { data: { t: number[]; o: string[]; h: string[]; l: string[]; c: string[]; v: string[] } };

function aggregate(candles: Candle[], bucketSeconds: number): Candle[] {
  const out: Candle[] = [];
  for (const c of candles) {
    const time = c.time - (c.time % bucketSeconds);
    const last = out[out.length - 1];
    if (last && last.time === time) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume += c.volume;
    } else {
      out.push({ ...c, time });
    }
  }
  return out;
}

export async function fetchKuruCandles(m: SpotMarket, resolution: Resolution, nowSec: number): Promise<Candle[]> {
  const spec = INTERVALS[resolution];
  const from = nowSec - spec.seconds * spec.factor * CANDLES_PER_LOAD;
  const { data } = await getJson<CandleResponse>(`${marketUrl(m)}/candles?interval=${spec.interval}&from=${from}`);
  const pp = KURU_PRECISION[m.symbol].price;
  const candles = data.t.map((t, i) => ({
    time: t,
    open: Number(data.o[i]) / pp,
    high: Number(data.h[i]) / pp,
    low: Number(data.l[i]) / pp,
    close: Number(data.c[i]) / pp,
    volume: Number(data.v[i]) / VOLUME_SCALE,
  }));
  return spec.factor === 1 ? candles : aggregate(candles, resolution);
}

type TradesResponse = {
  data: { tradeId: string; isBuy: boolean; price: string; filledSize: string; blockTimestamp: number }[];
};

export async function fetchKuruTrades(m: SpotMarket): Promise<Trade[]> {
  const { data } = await getJson<TradesResponse>(`${marketUrl(m)}/trades?limit=50`);
  const p = KURU_PRECISION[m.symbol];
  return data.map((t) => ({
    id: t.tradeId,
    price: Number(t.price) / p.price,
    size: Number(t.filledSize) / p.size,
    side: t.isBuy ? "buy" : "sell",
    time: t.blockTimestamp * 1000,
  }));
}

/** The book is read on-chain, from the same chain trades execute on. */
export async function fetchKuruBook(m: SpotMarket, levels = 16): Promise<OrderBook> {
  const [bidPrices, bidSizes, askPrices, askSizes] = await publicClient.readContract({
    address: m.orderBook,
    abi: kuruOrderBookAbi,
    functionName: "getL2Book",
    args: [BigInt(levels)],
  });
  const p = KURU_PRECISION[m.symbol];
  const side = (prices: readonly number[], sizes: readonly bigint[]) =>
    prices
      .map((price, i) => ({ price: price / p.price, size: Number(sizes[i]) / p.size }))
      .filter((l) => l.price > 0 && l.size > 0);
  return { bids: side(bidPrices, bidSizes), asks: side(askPrices, askSizes) };
}
