import { defineChain, type Address } from "viem";
import deployment from "./privacyPools.json";

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

export const RELAYER_ADDRESS: Address = "0x674f9e09E6fB102498bF9eb4744b247E4D5b0B54";

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

// 0xbow Privacy Pools: one Entrypoint, one ERC20 pool per venue token. privacyPools.json is the
// deploy script's output (contracts/deployments/10143.json), copied in by scripts/fork-setup.sh.
export const PRIVACY_POOLS = {
  entrypoint: deployment.entrypoint as Address,
  deploymentBlock: BigInt(deployment.deploymentBlock),
  pools: {
    perpl: { address: deployment.pools.AUSD.address as Address, scope: BigInt(deployment.pools.AUSD.scope) },
    kuru: { address: deployment.pools.USDC.address as Address, scope: BigInt(deployment.pools.USDC.scope) },
  },
} satisfies { entrypoint: Address; deploymentBlock: bigint; pools: Record<Venue, { address: Address; scope: bigint }> };

// Each pool's minimumDepositAmount (contracts/script/DeployPrivacyPools.s.sol), in whole tokens.
export const POOL_MIN_DEPOSIT = 1;

export const isPoolVenue = (v: unknown): v is Venue => typeof v === "string" && Object.hasOwn(PRIVACY_POOLS.pools, v);

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
