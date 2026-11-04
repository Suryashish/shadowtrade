export type CoinStyle = "solid" | "white" | "ghost";

export interface CoinDef {
  id: string;
  label: string;
  color: string;
  edge: string;
  /** Preferred face style; the ring may flip it for variety. */
  style: CoinStyle;
}

export const COIN_DEFS: readonly CoinDef[] = [
  { id: "BTC", label: "BTC", color: "#f7931a", edge: "#b8650a", style: "solid" },
  { id: "ETH", label: "ETH", color: "#4f46e5", edge: "#2e2894", style: "solid" },
  { id: "SOL", label: "SOL", color: "#10b9a0", edge: "#07705f", style: "solid" },
  { id: "MON", label: "MON", color: "#7c3aed", edge: "#4c1d95", style: "solid" },
  { id: "ZEC", label: "ZEC", color: "#e8a31a", edge: "#9c6a05", style: "white" },
  { id: "LIT", label: "LIT", color: "#e11d48", edge: "#8f0f2d", style: "solid" },
  { id: "PUMP", label: "PUMP", color: "#16a34a", edge: "#0b6330", style: "solid" },
  { id: "NEAR", label: "NEAR", color: "#0a0a0a", edge: "#000000", style: "white" },
  { id: "WETH", label: "WETH", color: "#6366f1", edge: "#3a3cae", style: "white" },
  { id: "cbBTC", label: "cbBTC", color: "#f59e0b", edge: "#a86a04", style: "white" },
  { id: "USDC", label: "USDC", color: "#2775ca", edge: "#154b86", style: "solid" },
  { id: "AUSD", label: "AUSD", color: "#0a0a0a", edge: "#000000", style: "solid" },
  { id: "ghost-a", label: "", color: "#0000f5", edge: "#00008f", style: "ghost" },
  { id: "ghost-b", label: "", color: "#9ca3af", edge: "#5b6270", style: "ghost" },
];
