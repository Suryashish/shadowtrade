# ShadowTrade

**Incognito mode for traders on Monad.** Trade on Perpl perps or Kuru spot from a fresh throwaway wallet with no on-chain link to your main wallet, then send the money back into a private balance and wipe the key.

```
 [Main wallet] --deposit--> [Private balance (0xbow Privacy Pools)]
                                    |  Enter Stealth Mode: browser creates a burner key, relayer drips gas,
                                    |  a fixed-size bucket is withdrawn to it with a ZK proof (relayed)
                                    v
                            [Burner wallet, no history]
                                    |  trade: Perpl perps  or  Kuru spot
                                    v
                            [Close positions]
                                    |  Exit Stealth: burner deposits everything back
                                    |  (the note belongs to your keys, not the burner)
                                    v
                    [Private balance]  (burner key wiped from the browser)
```

The whole round trip runs in seconds on Monad. The product spec is in [`shadowtrade.md`](./shadowtrade.md).

## What is real and what is a stand-in

| Piece | Status |
|---|---|
| **Perpl** perps, exchange `0x1964C32f0bE608E7D29302AFF5E61268E72080cc`, AUSD collateral | **Real** Monad testnet contracts |
| **Kuru Spot V2** (AccountCore, WETH/USDC and cbBTC/USDC order books) | **Real** Monad testnet contracts |
| **0xbow Privacy Pools** (one Entrypoint, plus one ERC-20 pool each for AUSD and USDC), audited, Apache-2.0, unmodified | **Real protocol** (ZK withdrawals, ASP approval). **Deployed on the local fork only so far; not on live testnet yet** |
| Relayer and ASP (`/api/relay`, `/api/pool`) | Ours. One relayer key is also the ASP postman |
| Association set (ASP) | **Stand-in policy:** auto-approves every deposit except an env denylist (`ASP_DENYLIST`); no real screening |

How the privacy layer works:

- **One Entrypoint, one pool per token.** `Entrypoint.deposit` puts funds in the AUSD or USDC pool as a commitment. The commitment's secrets are derived from your keys, so whichever wallet deposits (your main wallet, or a burner on exit), the note is yours.
- **ZK withdrawals, relayed.** To fund a burner, the browser proves in zero knowledge that it owns an approved, unspent note, and the relayer submits `Entrypoint.relay`. Nothing on-chain links the main wallet's deposit to the burner's withdrawal. Each withdrawal spends one note; the remainder becomes a new change note.
- **Keys come from your wallet signature.** The unlock signature is hashed (with a domain tag) into a BIP-39 mnemonic that feeds the 0xbow SDK's key derivation. Nothing secret is sent to the server and nothing needs saving: notes are rebuilt from public chain events, so the same wallet always recovers them.
- **ASP approval.** A deposit is spendable only once its label is in the association set whose root is the latest one on the Entrypoint. The server posts that root (auto-approve with a denylist). An unapproved deposit can be recovered by its original depositor with the contract's `ragequit`, but there is no ragequit UI yet.
- **0% fees.** Vetting fee 0, relay fee 0 (the contract caps relay fees at 10 bps; our relayer refuses anything but 0).
- **Server event cache (`GET /api/pool`).** Monad's RPC caps `eth_getLogs` at 100 blocks, so the browser cannot scan the chain. The server keeps an incremental cache of pool events and the approved labels, and the browser rebuilds Merkle proofs from it. It is public data; no wallet address is sent.
- **Addresses** live in `frontend/lib/deployments.json`, written by the deploy script (`contracts/script/DeployPrivacyPools.s.sol`). `scripts/fork-setup.sh` deploys the pools to the fork and overwrites that file, so it currently describes the fork, not live testnet.

Honest limits: the anonymity set is only as large as the pool's deposit history, which starts tiny (on a fresh fork it is just you), so correlation by amount and timing is realistic until real usage grows. The relayer sees your IP and the burner address. The relayer/ASP is a single hot key that we operate, and its approval policy is ours.


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
| `frontend/lib/keys.ts` | Keys derived from the unlock signature (Privacy Pools master keys, vault secret) and burner key creation |
| `frontend/lib/pool.ts`, `poolState.ts`, `privacySdk.ts` | Privacy Pools client: rebuild notes from events, deposit, ZK-prove and relay withdrawals (0xbow SDK, loaded on demand) |
| `frontend/lib/perpl.ts` | Perpl account, deposit, open and close positions, market metadata |
| `frontend/lib/perplFeed.ts` | Client for Perpl candles, book, trades and the SSE stream |
| `frontend/lib/kuru.ts` | Kuru quotes and spot swaps through AccountCore. Swaps refuse partial fills and anything over 2% price impact vs the top of book (fair-price guard) |
| `frontend/lib/kuruData.ts` | Kuru public REST (candles, trades, 24h stats) and on-chain `getL2Book` |
| `frontend/lib/vault.ts` | AES-GCM encrypted burner-key storage for session resume |
| `frontend/lib/chain.ts` | viem clients (`cacheTime: 0`), Monad 3-block pacing and gas padding |
| `frontend/lib/privacy.ts` | Privacy score and checks |
| `frontend/lib/relay.ts`, `frontend/app/api/relay/route.ts` | Relayer client and server route (gas drip, validated `Entrypoint.relay`) |
| `frontend/app/api/pool/route.ts`, `frontend/lib/server/poolCache.ts` | Public pool state from a server-side event cache; also runs the ASP postman (`updateRoot`) |
| `frontend/lib/deployments.json` | Entrypoint, pool addresses and scopes (written by the deploy script) |
| `frontend/app/api/perpl/markets`, `market-data/[...path]`, `stream` | Perpl metadata proxy, cached REST proxy, WebSocket-to-SSE relay |
| `frontend/app/page.tsx`, `frontend/components/landing/*` | Landing page |
| `frontend/app/trade/page.tsx`, `frontend/components/terminal/*` | Terminal: TopNav, MarketBar, PriceChart, OrderBook, RecentTrades, OrderPanel, PerpsOrderForm, SpotOrderForm, PositionsTable, SpotHoldings, BalanceForms, BottomPanel, Toast |
| `frontend/components/brand/Logo.tsx` | Logo |
| `frontend/hooks/*` | `useWallet`, `useShadowTrade`, `useMarketData`, `usePoll` |
| `contracts/script/DeployPrivacyPools.s.sol`, `contracts/test/PrivacyPools.t.sol` | Deploys the 0xbow Entrypoint (UUPS proxy) and AUSD/USDC pools; deploy, role and deposit tests |
| `scripts/fork.sh`, `scripts/fork-setup.sh` | Local Monad testnet fork with real Perpl and Kuru; setup also deploys the Privacy Pools |
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
- **Relayer abuse limits:** one drip per brand-new account, per-IP and global rate limits, and withdrawals accepted only for known pools, routed through the Entrypoint with a zero relay fee. The ZK proof binds recipient and amount, so the relayer cannot redirect funds.

## Quick start

Prerequisites: Node with pnpm, [Foundry](https://book.getfoundry.sh/) (for anvil, cast, forge), and MetaMask (optional with the dev wallet).

### A. Local fork with the real contracts (recommended)

```bash
# terminal 1: fork Monad testnet (1s blocks)
scripts/fork.sh

# terminal 2: fund your wallet and freeze the clock
scripts/fork-setup.sh <your-address>
```

`fork-setup.sh <your-address> [relayer-address]` gives your address 100 MON, 20,000 AUSD and 20,000 USDC, and also funds the relayer. It freezes the fork clock so Perpl's and Kuru's oracles never go stale, then deploys the Privacy Pools (relayer = ASP postman) and rewrites `frontend/lib/deployments.json`. `PORT` (default 8545) selects the anvil port.

Create `frontend/.env.local`:

```bash
RELAYER_PRIVATE_KEY=0x...                      # relayer key, also the ASP postman; its address must equal NEXT_PUBLIC_RELAYER_ADDRESS
NEXT_PUBLIC_RELAYER_ADDRESS=0x...              # optional; defaults to 0x674f...0B54 in config.ts
ASP_DENYLIST=                                  # optional; comma-separated depositor addresses the ASP will not approve
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

**Not usable yet:** the Privacy Pools are not deployed on live testnet. First deploy them (`DeployPrivacyPools.s.sol`, with a dedicated owner key or multisig, not the dev account) and commit the resulting `deployments.json`. Then set `NEXT_PUBLIC_RPC_URL=https://testnet-rpc.monad.xyz` and a funded `RELAYER_PRIVATE_KEY` (faucet: https://faucet.monad.xyz). Collateral tokens are admin-mint only, so you need AUSD (Perpl) and USDC (Kuru) from the respective teams. See [`API_KEY_REQUIREMENTS.md`](./API_KEY_REQUIREMENTS.md). No API keys are needed for Perpl or Kuru trading.

## Testing

```bash
cd contracts && forge test        # PrivacyPools.t.sol: deploy, registration, roles, deposit path
cd frontend && pnpm e2e           # needs the fork (A) and the dev server running
```

A frozen-clock fork has no market makers, so repeated testing can drain one side of an order book. Restart the fork (`scripts/fork.sh` then `scripts/fork-setup.sh`) to reset it.

The contract tests cover deployment, pool registration, roles and the deposit path. The proof and withdraw path needs the circuit artifacts and is covered by the end-to-end test.

TODO: fill in the Privacy Pools end-to-end results from the latest run (private deposit, ZK withdraw to a burner, Perpl and Kuru round trips, exit back to the pool, relayer abuse cases, proof generation time). The numbers from the old ShadowPool build were removed because they no longer apply.

## Known limitations

- Market orders only (no limit orders).
- Kuru testnet liquidity is thin, so spot charts are mostly flat.
- On the local fork, the book and chart show live testnet data while trades execute against the fork's snapshot, so displayed and executed prices can differ.
- The Privacy Pools are deployed on the local fork only; there is no live-testnet deployment yet.
- The anonymity set starts small. Fixed buckets help, but amounts and timing can still correlate a deposit with a withdrawal.
- A withdrawal spends one note, so a balance split across notes (for example after sessions that end in a small loss) may not cover a whole bucket with any single note.
- No ragequit UI: a deposit the ASP does not approve can only be recovered by the original depositor calling the contract directly. For exit deposits that depositor is the discarded burner.
- Single relayer key, which is also the ASP postman; the ASP's auto-approve policy is ours, not independent screening.

## Next steps

- Deploy the Privacy Pools to live Monad testnet and commit `deployments.json`.
- Ragequit UI, and a real ASP (independent screening, published association-set data).
- Testnet collateral (AUSD, Kuru USDC) must come from the Perpl and Kuru teams for live-testnet runs.
- Per-session RPC so a single endpoint cannot correlate burner traffic.
- Split large orders across multiple burners (private TWAP, spreads liquidation levels).
- Passkeys for one-click Stealth Mode with no seed phrases or per-trade popups.
- Production needs a hardened, decentralized relayer and ASP, and a multisig owner for the Entrypoint.

*ShadowTrade is designed to be non-custodial: keys stay in the user's browser and we never hold funds. This is not legal advice; talk to a lawyer before mainnet.*

## Submission

Built for Monad Blitz Devcon Mumbai.

- Repo: https://github.com/monad-developers/monad-blitz-devcon-mumbai
- Portal: https://blitz.devnads.com
