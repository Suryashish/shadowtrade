import { BaseError, ContractFunctionRevertedError, erc20Abi, type Address, type WalletClient } from "viem";
import { perplExchangeAbi } from "./abi/perpl";
import { publicClient, write } from "./chain";
import { PERPL } from "./config";

export type Side = "long" | "short";

export type PerpMarket = {
  id: number;
  symbol: string;
  priceDecimals: number;
  sizeDecimals: number;
  maxLeverage: number;
  maintenanceLeverage: number;
  takerFeeBps: number;
};

export type Position = {
  side: Side;
  sizeLots: bigint;
  entryPNS: bigint;
  marginCNS: bigint;
  pnlCNS: bigint;
  markPNS: bigint;
};

export type PerplAccount = { id: bigint; balanceCNS: bigint };

const ORDER = { openLong: 0, openShort: 1, closeLong: 2, closeShort: 3 } as const;
const ORDER_TTL_BLOCKS = 20n;
const MAX_NEG_PNL_COLLAT_BPS = 1000n;
const POSITION_LONG = 0;

type ContextMarket = {
  id: number;
  symbol: string;
  config: { is_open: boolean; price_decimals: number; size_decimals: number; initial_margin: number; maintenance_margin: number; taker_fee: number };
};

export type PerplContext = { markets: ContextMarket[] };

export const PERPL_CONTEXT_URL = `${PERPL.api}/v1/pub/context`;

/** Market metadata. Browsers go through our proxy route because Perpl's API has no CORS headers. */
export async function fetchPerpMarkets(): Promise<PerpMarket[]> {
  const inBrowser = typeof window !== "undefined";
  const res = await fetch(inBrowser ? "/api/perpl/markets" : PERPL_CONTEXT_URL);
  if (!res.ok) throw new Error("Perpl market data is unavailable right now.");
  return inBrowser ? ((await res.json()) as PerpMarket[]) : toPerpMarkets((await res.json()) as PerplContext);
}

export function toPerpMarkets(ctx: PerplContext): PerpMarket[] {
  return ctx.markets
    .filter((m) => m.config?.is_open)
    .map((m) => ({
      id: m.id,
      symbol: m.symbol,
      priceDecimals: m.config.price_decimals,
      sizeDecimals: m.config.size_decimals,
      // Margin fractions are expressed in hundredths of leverage (1200 = 12x).
      maxLeverage: m.config.initial_margin / 100,
      maintenanceLeverage: m.config.maintenance_margin / 100,
      takerFeeBps: m.config.taker_fee / 100,
    }));
}

export async function getMarkPrice(perpId: number): Promise<bigint> {
  const info = await publicClient.readContract({
    address: PERPL.exchange,
    abi: perplExchangeAbi,
    functionName: "getPerpetualInfoV2",
    args: [BigInt(perpId)],
  });
  return info.markPNS;
}

export async function getAccount(owner: Address): Promise<PerplAccount | null> {
  try {
    const info = await publicClient.readContract({
      address: PERPL.exchange,
      abi: perplExchangeAbi,
      functionName: "getAccountByAddr",
      args: [owner],
    });
    return { id: info.accountId, balanceCNS: info.balanceCNS };
  } catch (e) {
    const revert = e instanceof BaseError ? e.walk((err) => err instanceof ContractFunctionRevertedError) : null;
    if (revert instanceof ContractFunctionRevertedError && revert.data?.errorName === "AccountDoesNotExist") return null;
    throw e;
  }
}

export async function getPosition(perpId: number, accountId: bigint): Promise<Position | null> {
  const [p, markPNS] = await publicClient.readContract({
    address: PERPL.exchange,
    abi: perplExchangeAbi,
    functionName: "getPositionV2",
    args: [BigInt(perpId), accountId],
  });
  if (p.lotLNS === 0n) return null;
  return {
    side: p.positionType === POSITION_LONG ? "long" : "short",
    sizeLots: p.lotLNS,
    entryPNS: p.pricePNS,
    marginCNS: p.depositCNS,
    pnlCNS: p.pnlCNS,
    markPNS,
  };
}

/** Moves collateral from the wallet into its Perpl account, creating the account if needed. */
export async function fundAccount(wallet: WalletClient, amountCNS: bigint) {
  const owner = wallet.account!.address;
  await write(wallet, { address: PERPL.collateral, abi: erc20Abi, functionName: "approve", args: [PERPL.exchange, amountCNS] });
  const existing = await getAccount(owner);
  if (existing) {
    await write(wallet, { address: PERPL.exchange, abi: perplExchangeAbi, functionName: "depositCollateral", args: [amountCNS] });
    return;
  }
  if (amountCNS < PERPL.minAccountOpen) throw new Error("Perpl needs at least 100 AUSD to open an account.");
  await write(wallet, { address: PERPL.exchange, abi: perplExchangeAbi, functionName: "createAccount", args: [amountCNS] });
}

type MarketOrder = { perpId: number; type: number; lots: bigint; limitPNS: bigint; leverage: number };

async function execMarketOrder(wallet: WalletClient, o: MarketOrder) {
  const block = await publicClient.getBlockNumber();
  await write(wallet, {
    address: PERPL.exchange,
    abi: perplExchangeAbi,
    functionName: "execOrder",
    args: [
      {
        orderDescId: BigInt(Date.now()),
        perpId: BigInt(o.perpId),
        orderType: o.type,
        orderId: 0n,
        pricePNS: o.limitPNS,
        lotLNS: o.lots,
        expiryBlock: 0n,
        postOnly: false,
        fillOrKill: false,
        immediateOrCancel: true,
        maxMatches: 0n,
        leverageHdths: BigInt(Math.round(o.leverage * 100)),
        lastExecutionBlock: block + ORDER_TTL_BLOCKS,
        amountCNS: 0n,
        maxNegPnlCollatBPS: MAX_NEG_PNL_COLLAT_BPS,
      },
    ],
  });
}

function slip(price: bigint, bps: number, up: boolean) {
  const delta = (price * BigInt(bps)) / 10_000n;
  return up ? price + delta : price - delta;
}

/** Converts a collateral amount and leverage into lots at the current mark. */
export function lotsFor(market: PerpMarket, collateralCNS: bigint, leverage: number, markPNS: bigint): bigint {
  // notional (collateral units 1e6) -> base size scaled by sizeDecimals, priced at mark (priceDecimals).
  const notionalCNS = (collateralCNS * BigInt(Math.round(leverage * 100))) / 100n;
  const scale = 10n ** BigInt(market.priceDecimals + market.sizeDecimals);
  return (notionalCNS * scale) / (markPNS * 1_000_000n);
}

export async function openPosition(
  wallet: WalletClient,
  market: PerpMarket,
  side: Side,
  lots: bigint,
  leverage: number,
  slippageBps = 100,
) {
  if (lots <= 0n) throw new Error("Position size is too small for this market.");
  const mark = await getMarkPrice(market.id);
  await execMarketOrder(wallet, {
    perpId: market.id,
    type: side === "long" ? ORDER.openLong : ORDER.openShort,
    lots,
    limitPNS: slip(mark, slippageBps, side === "long"),
    leverage,
  });
}

export async function closePosition(wallet: WalletClient, market: PerpMarket, position: Position, slippageBps = 100) {
  const mark = await getMarkPrice(market.id);
  const isLong = position.side === "long";
  await execMarketOrder(wallet, {
    perpId: market.id,
    type: isLong ? ORDER.closeLong : ORDER.closeShort,
    lots: position.sizeLots,
    limitPNS: slip(mark, slippageBps, !isLong),
    leverage: 1,
  });
}

export async function withdrawAll(wallet: WalletClient): Promise<bigint> {
  const account = await getAccount(wallet.account!.address);
  if (!account || account.balanceCNS === 0n) return 0n;
  await write(wallet, { address: PERPL.exchange, abi: perplExchangeAbi, functionName: "withdrawCollateral", args: [account.balanceCNS] });
  return account.balanceCNS;
}

/** Estimated liquidation price, using the market's maintenance margin. */
export function liquidationPrice(market: PerpMarket, p: Position): number {
  const size = Number(p.sizeLots) / 10 ** market.sizeDecimals;
  const entry = Number(p.entryPNS) / 10 ** market.priceDecimals;
  const margin = Number(p.marginCNS) / 1e6;
  const mm = 1 / market.maintenanceLeverage;
  return p.side === "long" ? (size * entry - margin) / (size * (1 - mm)) : (size * entry + margin) / (size * (1 + mm));
}
