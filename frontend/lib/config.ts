import { defineChain, type Address } from "viem";
import deployments from "./deployments.json";

// The local fork (anvil) keeps chain id 10143 and every testnet address, so only the RPC differs.
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://testnet-rpc.monad.xyz";
export const IS_FORK = RPC_URL.includes("127.0.0.1") || RPC_URL.includes("localhost");

export const monadTestnet = defineChain({
  id: 10143,
  name: IS_FORK ? "Monad Testnet (local fork)" : "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Monadscan", url: "https://testnet.monadscan.com" } },
  testnet: true,
});

export const EXPLORER = monadTestnet.blockExplorers.default.url;

export const RELAYER_ADDRESS = (process.env.NEXT_PUBLIC_RELAYER_ADDRESS ?? "0x674f9e09E6fB102498bF9eb4744b247E4D5b0B54") as Address;

type PoolDeployment = { address: Address; token: Address; scope: string };
type Deployment = { entrypoint: Address; startBlock: string; pools: Record<string, PoolDeployment> };

// Written by the contracts deploy script (scripts/fork-setup.sh on a fork).
export const DEPLOYMENT = (deployments as Record<string, Deployment>)[String(monadTestnet.id)];
export const ENTRYPOINT = DEPLOYMENT.entrypoint;

export const PERPL = {
  exchange: "0x1964C32f0bE608E7D29302AFF5E61268E72080cc",
  collateral: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
  api: "https://testnet.perpl.xyz/api",
  minAccountOpen: 100_000000n,
} as const satisfies Record<string, Address | string | bigint>;

export const KURU = {
  accountCore: "0xe08573a1Ecc4aa507c9626071fA0c4513caf7906",
  usdc: "0xb01DC575a7ef75e58A05D2bde73ab79f8e7dd0Be",
} as const satisfies Record<string, Address>;

export type Venue = "perpl" | "kuru";

// Kuru spot is off until we have testnet USDC for it. Set NEXT_PUBLIC_ENABLE_KURU=true to bring it back.
export const KURU_ENABLED = process.env.NEXT_PUBLIC_ENABLE_KURU === "true";
export const VENUES: Venue[] = KURU_ENABLED ? ["perpl", "kuru"] : ["perpl"];

export type StableToken = { address: Address; symbol: string; decimals: number; venue: Venue };

export const TOKENS: Record<Venue, StableToken> = {
  perpl: { address: PERPL.collateral, symbol: "AUSD", decimals: 6, venue: "perpl" },
  kuru: { address: KURU.usdc, symbol: "USDC", decimals: 6, venue: "kuru" },
};

export type SpotMarket = {
  symbol: string;
  base: string;
  orderBook: Address;
  baseToken: Address;
  baseDecimals: number;
};

export const SPOT_MARKETS: SpotMarket[] = [
  { symbol: "WETH/USDC", base: "WETH", orderBook: "0x0A082280e4eA3D822E23Ec1186685477241A039d", baseToken: "0xB711D972876AE19481fFD1AB2047B8e5E31BEe5F", baseDecimals: 18 },
  { symbol: "cbBTC/USDC", base: "cbBTC", orderBook: "0x87A177348710BE5cc1B025ce20CABAB267C90Bf6", baseToken: "0x7bC3a5FCEB95bE797D57eE762B881596B3cfA992", baseDecimals: 8 },
];

// Fixed withdrawal sizes so burner funding amounts don't fingerprint the user.
export const BUCKETS = [500, 1_000, 5_000, 10_000] as const;

// MON the relayer drips to each burner. Monad bills the gas *limit*, so budget for ~8 txs.
export const BURNER_GAS_DRIP = 500_000_000_000_000_000n; // 0.5 MON

export type Pool = { symbol: string; address: Address; token: Address; scope: bigint };

export const POOLS: Pool[] = Object.entries(DEPLOYMENT.pools).map(([symbol, p]) => ({ symbol, address: p.address, token: p.token, scope: BigInt(p.scope) }));

export function poolForToken(token: Address): Pool {
  const pool = POOLS.find((p) => p.token.toLowerCase() === token.toLowerCase());
  if (!pool) throw new Error("There is no privacy pool for this token.");
  return pool;
}
