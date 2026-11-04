import type { Venue } from "./config";

/** Venue-agnostic market data in human units, shared by every terminal component. */

export type MarketInfo = {
  key: string; // "perpl:32" | "kuru:WETH/USDC"
  venue: Venue;
  /** Display name, e.g. "ETH-PERP" or "WETH/USDC". */
  name: string;
  base: string;
  quote: string;
  /** Decimals to display prices with. */
  priceDecimals: number;
  /** Decimals to display sizes with. */
  sizeDecimals: number;
  maxLeverage: number | null;
};

export type MarketStats = {
  price: number | null;
  mark: number | null;
  oracle: number | null;
  /** Fractional 24h change, e.g. 0.0123 = +1.23%. */
  change24h: number | null;
  /** 24h volume in quote (USD). */
  volume24h: number | null;
  /** Open interest in quote (USD), perps only. */
  openInterest: number | null;
};

export type BookLevel = { price: number; size: number };
export type OrderBook = { bids: BookLevel[]; asks: BookLevel[] };

export type Trade = { id: string; price: number; size: number; side: "buy" | "sell"; time: number };

/** time is unix seconds (lightweight-charts UTCTimestamp). */
export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };

export const RESOLUTIONS = [
  { label: "1m", seconds: 60 },
  { label: "5m", seconds: 300 },
  { label: "15m", seconds: 900 },
  { label: "1h", seconds: 3600 },
  { label: "4h", seconds: 14400 },
  { label: "1D", seconds: 86400 },
] as const;

export type Resolution = (typeof RESOLUTIONS)[number]["seconds"];
