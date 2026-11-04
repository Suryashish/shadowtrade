import { erc20Abi, type Address, type WalletClient } from "viem";
import { kuruAccountCoreAbi, kuruOrderBookAbi } from "./abi/kuru";
import { chainTime, publicClient, write } from "./chain";
import { KURU, TOKENS, type SpotMarket } from "./config";
import { KURU_PRECISION } from "./kuruData";

const SWAP_DEADLINE_SEC = 120n;

export type Quote = { amountIn: bigint; amountOut: bigint };

/** Kuru fills base-token sizes in whole lots; anything finer is dust the book rejects as a partial fill. */
export function floorToLot(market: SpotMarket, amount: bigint): bigint {
  const size = KURU_PRECISION[market.symbol]?.size;
  if (!size) return amount;
  const lot = 10n ** BigInt(market.baseDecimals) / BigInt(size);
  return lot > 1n ? amount - (amount % lot) : amount;
}

export async function accountId(owner: Address): Promise<number> {
  return publicClient.readContract({ address: KURU.accountCore, abi: kuruAccountCoreAbi, functionName: "rootAccountIdOf", args: [owner] });
}

export async function balanceOf(id: number, token: Address): Promise<bigint> {
  if (id === 0) return 0n;
  return publicClient.readContract({ address: KURU.accountCore, abi: kuruAccountCoreAbi, functionName: "getBalance", args: [id, token] });
}

const EMPTY_BID = 2 ** 32 - 1;
// A swap that would land more than this far from top of book is refused rather than dumped.
const MAX_PRICE_IMPACT_BPS = 200n;

type TopOfBook = { bid: number | null; ask: number | null; precision: number };

async function topOfBook(market: SpotMarket): Promise<TopOfBook> {
  const [[bid, ask], params] = await Promise.all([
    publicClient.readContract({ address: market.orderBook, abi: kuruOrderBookAbi, functionName: "bestBidAsk" }),
    publicClient.readContract({ address: market.orderBook, abi: kuruOrderBookAbi, functionName: "getMarketParams" }),
  ]);
  return { bid: bid === EMPTY_BID || bid === 0 ? null : bid, ask: ask === 0 ? null : ask, precision: Number(params[0]) };
}

/** Best bid/ask as human prices (quote per base). Empty sides are null. */
export async function bestBidAsk(market: SpotMarket): Promise<{ bid: number | null; ask: number | null }> {
  const { bid, ask, precision } = await topOfBook(market);
  return { bid: bid === null ? null : bid / precision, ask: ask === null ? null : ask / precision };
}

/** Output if the whole order filled at the best price, in output-token atoms. */
function topOfBookOut(market: SpotMarket, isBuy: boolean, amountIn: bigint, book: TopOfBook): bigint | null {
  const price = isBuy ? book.ask : book.bid;
  if (price === null) return null;
  const p = BigInt(price);
  const precision = BigInt(book.precision);
  // price = p / precision quote per whole base; scale between 10^baseDecimals and 10^quoteDecimals atoms.
  const base = 10n ** BigInt(market.baseDecimals);
  const quote = 10n ** BigInt(TOKENS.kuru.decimals);
  return isBuy ? (amountIn * precision * base) / (p * quote) : (amountIn * p * quote) / (precision * base);
}

/** Largest unspent quote a buy may leave: the book fills whole lots, so up to ~2 lots' worth plus 0.1% is dust. */
function buyDustAllowance(market: SpotMarket, amountIn: bigint, book: TopOfBook): bigint {
  const lot = 10n ** BigInt(market.baseDecimals) / BigInt(KURU_PRECISION[market.symbol]?.size ?? 10 ** market.baseDecimals);
  const lotQuote = book.ask === null ? 0n : (lot * BigInt(book.ask) * 10n ** BigInt(TOKENS.kuru.decimals)) / (BigInt(book.precision) * 10n ** BigInt(market.baseDecimals));
  return amountIn / 1000n + 2n * lotQuote + 1n;
}

async function assertFairFill(market: SpotMarket, isBuy: boolean, amountIn: bigint, q: Quote) {
  const side = isBuy ? "sellers" : "buyers";
  if (q.amountOut === 0n) throw new Error(`No ${side} on the ${market.symbol} book right now. Try again shortly.`);
  const book = await topOfBook(market);
  const dust = isBuy ? buyDustAllowance(market, amountIn, book) : 0n;
  if (q.amountIn + dust < amountIn) throw new Error(`Not enough ${side} on the ${market.symbol} book to fill this in full. Try a smaller amount.`);
  const ideal = topOfBookOut(market, isBuy, q.amountIn, book);
  if (ideal !== null && q.amountOut * 10_000n < ideal * (10_000n - MAX_PRICE_IMPACT_BPS)) {
    throw new Error(`This trade would move the ${market.symbol} price more than 2%. Try a smaller amount.`);
  }
}

/** isBuy: spend quote (USDC) for base. Otherwise spend base for quote. */
export async function quote(market: SpotMarket, isBuy: boolean, amountIn: bigint): Promise<Quote> {
  if (amountIn === 0n) return { amountIn: 0n, amountOut: 0n };
  const { amountInUsed, amountOut } = await publicClient.readContract({
    address: market.orderBook,
    abi: kuruOrderBookAbi,
    functionName: "estimateSwap",
    args: [isBuy, amountIn],
  });
  return { amountIn: amountInUsed, amountOut };
}

export async function deposit(wallet: WalletClient, token: Address, amount: bigint) {
  const owner = wallet.account!.address;
  await write(wallet, { address: token, abi: erc20Abi, functionName: "approve", args: [KURU.accountCore, amount] });
  await write(wallet, { address: KURU.accountCore, abi: kuruAccountCoreAbi, functionName: "deposit", args: [owner, token, amount] });
}

export async function swap(wallet: WalletClient, market: SpotMarket, isBuy: boolean, amountIn: bigint, slippageBps = 100): Promise<Quote> {
  const id = await accountId(wallet.account!.address);
  if (id === 0) throw new Error("Deposit funds into Kuru before trading.");
  const q = await quote(market, isBuy, amountIn);
  await assertFairFill(market, isBuy, amountIn, q);
  const minOut = (q.amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
  const deadline = (await chainTime()) + SWAP_DEADLINE_SEC;
  await write(wallet, { address: market.orderBook, abi: kuruOrderBookAbi, functionName: "swap", args: [id, isBuy, amountIn, minOut, deadline] });
  return q;
}

/** Withdraws every listed token held in Kuru back to the wallet. */
export async function withdrawAll(wallet: WalletClient, tokens: Address[]) {
  const owner = wallet.account!.address;
  const id = await accountId(owner);
  for (const token of tokens) {
    const amount = await balanceOf(id, token);
    if (amount === 0n) continue;
    await write(wallet, { address: KURU.accountCore, abi: kuruAccountCoreAbi, functionName: "withdraw", args: [id, token, amount, owner] });
  }
}
