# ShadowTrade

**Incognito mode for traders on Monad.** Trade on Perpl perps or Kuru spot from a fresh throwaway wallet with no on-chain link to your main wallet, then send the money back into a private balance and wipe the key.

```
 [Main wallet] --deposit--> [Private balance (ShadowPool)]
                                    |  Enter Stealth Mode: browser creates a burner key,
                                    |  a fixed-size bucket is withdrawn to it, relayer drips gas
                                    v
                            [Burner wallet, no history]
                                    |  trade: Perpl perps  or  Kuru spot
                                    v
                            [Close positions]
                                    |  Exit Stealth: burner deposits everything back
                                    v
                    [Private balance]  (burner key wiped from the browser)
```

The whole round trip runs in seconds on Monad. The product spec is in [`shadowtrade.md`](./shadowtrade.md).

## What is real and what is a stand-in

| Piece | Status |
|---|---|
| **Perpl** perps, exchange `0x1964C32f0bE608E7D29302AFF5E61268E72080cc`, AUSD collateral | **Real** Monad testnet contracts |
| **Kuru Spot V2** (AccountCore, WETH/USDC and cbBTC/USDC order books) | **Real** Monad testnet contracts |
| **ShadowPool** `0xe9c9b7598dF01f3c9bE036E8e1B067a63eAa5A9D` (Monad testnet) | **Stand-in, not zero-knowledge.** Replaces Unlink |
| Relayer (`/api/relay`) | Real, but a single dev key |

Why a stand-in: the plan was to use Unlink for the private balance, but Unlink dashboard registration failed and its testnet engine host does not resolve in DNS. ShadowPool sits behind one module, `frontend/lib/pool.ts`, which is the swap point for Unlink.

What ShadowPool does give you: the main wallet never interacts with the burner. Balances belong to a browser-derived shadow key, and withdrawals to the burner are signed by that key (EIP-712) and submitted by the relayer. What it does not give you: the shadow key's deposits and withdrawals are linkable on-chain, because there is no ZK mixing. Treat this build as a working demo of the flow, not as production privacy.

## Features

**Terminal (`/trade`)**

- **Live candles** (1m to 1D) on TradingView Lightweight Charts.
- **Live order book** with depth and spread, and a **recent trades** feed.
- **Pair selector with search** across all Perpl markets plus Kuru WETH/USDC and cbBTC/USDC.
- **Perps order ticket** with leverage and estimated liquidation price; **positions table** with market close.
- **Spot swaps** with quote and price impact; **spot holdings**.
- **Private balance** deposit and withdraw forms.
- **Stealth flow:** a 4-step onboarding in the order panel (connect, deposit to private balance, pick a bucket, Enter Stealth Mode), then trade, then Exit Stealth Mode.
- **Encrypted session resume:** the burner key is encrypted (AES-GCM, key derived from your unlock signature) and saved before any funds move. After a refresh, "Sign to resume" restores the same burner. The key is cleared on exit.
- **Silent wallet reconnect** after reload (`eth_accounts`, no popup).
- Bottom panel tabs (positions, holdings, session, balance), toasts, **mobile view switcher**, dark and light themes.

**Routes**

| Route | Page |
|---|---|
| `/` | Landing page (hero, problem, how it works, privacy, why Monad, FAQ) |
| `/trade` | The trading terminal |

Also: `app/icon.svg` (favicon) and `app/opengraph-image.tsx` (share card; set `NEXT_PUBLIC_SITE_URL` when deploying).

## Data sources

- **Perpl REST** (candles, book, ticker, markets) goes through server proxies, because Perpl's REST API sends no CORS headers: `api/perpl/markets` and the cached `api/perpl/market-data/[...path]`.
- **Perpl WebSocket** market data goes through `api/perpl/stream`, a server-side WebSocket to Server-Sent Events relay, because Perpl's WS rejects browser origins with 403.
- **Kuru** candles, trades and 24h stats come from the public REST API (`https://api.testnet.kuru.io`); the spot order book is read on-chain via `getL2Book`.
- Account state, positions and execution are on-chain through viem.

## Architecture

| Component | Role |
|---|---|
| `frontend/lib/config.ts` | All addresses, tokens, spot markets, withdrawal buckets, gas drip |
| `frontend/lib/session.ts` | The stealth session flow: fund burner, trade, close, sweep back to pool |
| `frontend/lib/keys.ts` | Browser-derived shadow key and in-memory burner key creation |
| `frontend/lib/pool.ts` | Pool deposit and signed withdrawals (**Unlink swap point**) |
| `frontend/lib/perpl.ts` | Perpl account, deposit, open and close positions, market metadata |
| `frontend/lib/perplFeed.ts` | Client for Perpl candles, book, trades and the SSE stream |
| `frontend/lib/kuru.ts` | Kuru quotes and spot swaps through AccountCore. Swaps refuse partial fills and anything over 2% price impact vs the top of book (fair-price guard) |
| `frontend/lib/kuruData.ts` | Kuru public REST (candles, trades, 24h stats) and on-chain `getL2Book` |
| `frontend/lib/vault.ts` | AES-GCM encrypted burner-key storage for session resume |
| `frontend/lib/chain.ts` | viem clients (`cacheTime: 0`), Monad 3-block pacing and gas padding |
| `frontend/lib/privacy.ts` | Privacy score and checks |
| `frontend/lib/relay.ts`, `frontend/app/api/relay/route.ts` | Relayer client and server route (gas drip, withdrawal relay) |
| `frontend/app/api/perpl/markets`, `market-data/[...path]`, `stream` | Perpl metadata proxy, cached REST proxy, WebSocket-to-SSE relay |
| `frontend/app/page.tsx`, `frontend/components/landing/*` | Landing page |
| `frontend/app/trade/page.tsx`, `frontend/components/terminal/*` | Terminal: TopNav, MarketBar, PriceChart, OrderBook, RecentTrades, OrderPanel, PerpsOrderForm, SpotOrderForm, PositionsTable, SpotHoldings, BalanceForms, BottomPanel, Toast |
| `frontend/components/brand/Logo.tsx` | Logo |
| `frontend/hooks/*` | `useWallet`, `useShadowTrade`, `useMarketData`, `usePoll` |
| `contracts/src/ShadowPool.sol` | Pool: `deposit`, EIP-712 signed `withdraw`, nonces, deadlines |
| `scripts/fork.sh`, `scripts/fork-setup.sh` | Local Monad testnet fork with real Perpl and Kuru |
| `frontend/scripts/e2e.ts` | Headless end-to-end test against the fork (`pnpm e2e`) |

Stack: Next.js 16, React 19, viem, Foundry.

## Monad-specific engineering notes

- **Gas is billed on the gas limit, not gas used.** Every transaction is simulated, then sent with the estimate padded by 20% rather than a flat limit.
- **Reserve balance and 3-block delay.** Monad state reaches consensus 3 blocks late. Burner transactions are paced 3 blocks apart, and the session waits 3 blocks after funding before the burner sends anything.
- **No EIP-7702 on burners.** Delegated accounts cannot drop below the 10 MON reserve, so burners stay plain accounts.
- **Relayer gas drip.** The relayer sends 0.5 MON, and only to brand-new accounts (zero nonce, zero balance, once per address). Gas is never funded from the main wallet, since that would create a direct link.
- The relayer serializes its sends in one queue to keep nonces and per-sender pacing correct.

## Privacy hygiene built in

- **Fixed buckets:** burners are funded only with 500 / 1,000 / 5,000 / 10,000 so amounts do not fingerprint you.
- **Privacy score (0-100)** with checks for pool size relative to your bucket, time since your last deposit, and odd (unique) deposit amounts.
- **Relayer-funded gas,** so the main wallet never touches the burner.
- **Exit to pool:** everything is swept back to the private balance and the burner key is wiped. If an exit cannot sell at a fair price (Kuru swaps refuse partial fills or >2% price impact vs top of book), the session stays open so funds are never stranded with a wiped key.
- **Relayer abuse limits:** only allowed tokens, one drip per brand-new account, and withdrawals bound to the signed amount and recipient.

## Quick start

Prerequisites: Node with pnpm, [Foundry](https://book.getfoundry.sh/) (for anvil, cast, forge), and MetaMask (optional with the dev wallet).

### A. Local fork with the real contracts (recommended)

```bash
# terminal 1: fork Monad testnet (1s blocks)
scripts/fork.sh

# terminal 2: fund your wallet and freeze the clock
scripts/fork-setup.sh <your-address>
```

`fork-setup.sh` gives your address 100 MON, 20,000 AUSD and 20,000 USDC, and also funds the relayer. It freezes the fork clock so Perpl's and Kuru's oracles never go stale.

Create `frontend/.env.local`:

```bash
RELAYER_PRIVATE_KEY=0x...                      # relayer key; address in config.ts is 0x674f...0B54
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
# optional, fork only: enables a "Use test wallet" button (hooks/useWallet.ts) instead of MetaMask.
# Use anvil account #1 (0x70997970C51812dc3A010C7d01b50e0d17dc79C8)
NEXT_PUBLIC_DEV_WALLET_KEY=0x...
# optional, for deployments: absolute base URL for the share card
NEXT_PUBLIC_SITE_URL=
```

If you use the test wallet, also run `scripts/fork-setup.sh 0x70997970C51812dc3A010C7d01b50e0d17dc79C8` so that address is funded. The button is hidden unless the RPC URL is localhost.

```bash
cd frontend && pnpm install && pnpm dev
```

Open `http://localhost:3000` for the landing page and `/trade` for the terminal. Other scripts: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm e2e`.

### B. Live Monad testnet

Set `NEXT_PUBLIC_RPC_URL=https://testnet-rpc.monad.xyz` and a funded `RELAYER_PRIVATE_KEY` (faucet: https://faucet.monad.xyz). Collateral tokens are admin-mint only, so you need AUSD (Perpl) and USDC (Kuru) from the respective teams. See [`API_KEY_REQUIREMENTS.md`](./API_KEY_REQUIREMENTS.md). No API keys are needed for Perpl or Kuru trading.

## Testing

```bash
cd contracts && forge test        # 7 ShadowPool tests
cd frontend && pnpm e2e           # all checks; needs the fork (A) and the dev server running
```

A frozen-clock fork has no market makers, so repeated testing can drain one side of an order book. Restart the fork (`scripts/fork.sh` then `scripts/fork-setup.sh`) to reset it.

The 7 contract tests cover: deposit credit, relayed withdraw to a burner, replay, wrong signer, redirected recipient, expired signature, and overdraw.

**Browser flows (Playwright, headless Chromium, against the fork):**

- Perps: open, close and Exit Stealth returned 999.18 of 1,000 AUSD.
- Spot: buy and Exit Stealth returned 499.88 of 500 USDC.
- Refresh mid-session shows "Sign to resume", which restores the same burner; exit then returns 500 of 500 AUSD.
- No horizontal overflow at 1920, 1440, 1280, 1024 and 390 px widths; dark and light themes checked.
- Zero console errors.

**Verified e2e script result (local fork):**

- Private deposits into the pool succeed.
- Perpl session ready in about 12.6s on a 1s-block fork (Monad testnet blocks are ~0.4s, so live is faster).
- ETH 5x long and BTC 3x short opened and closed; 998.69 of 1,000 AUSD returned to the pool.
- Kuru WETH buy and sell; 499.71 of 500 USDC returned.
- No transfers from the main wallet to any burner.
- 6 of 6 relayer abuse cases rejected: re-funding a burner, gas to an existing wallet, tampered amount, redirected recipient, overdraw, unknown token.

## Known limitations

- Market orders only (no limit orders).
- Kuru testnet liquidity is thin, so spot charts are mostly flat.
- On the local fork, the book and chart show live testnet data while trades execute against the fork's snapshot, so displayed and executed prices can differ.
- The pool is a non-ZK dev stand-in (see above).

## Next steps

- Swap ShadowPool for Unlink (ZK pool) via `lib/pool.ts` once its testnet access works. Until then deposits and withdrawals by the shadow key are linkable.
- Testnet collateral (AUSD, Kuru USDC) must come from the Perpl and Kuru teams for live-testnet runs.
- Per-session RPC so a single endpoint cannot correlate burner traffic.
- Split large orders across multiple burners (private TWAP, spreads liquidation levels).
- Passkeys for one-click Stealth Mode with no seed phrases or per-trade popups.
- Single relayer key; production needs a hardened, decentralized relayer and deposit screening.

*ShadowTrade is designed to be non-custodial: keys stay in the user's browser and we never hold funds. This is not legal advice; talk to a lawyer before mainnet.*

## Submission

Built for Monad Blitz Devcon Mumbai.

- Repo: https://github.com/monad-developers/monad-blitz-devcon-mumbai
- Portal: https://blitz.devnads.com
