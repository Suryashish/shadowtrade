# ShadowTrade

**Incognito mode for traders on Monad.** Trade on Perpl perps or Kuru spot from a fresh throwaway wallet with no on-chain link to your main wallet, then send the money back into a private balance and wipe the key.

```
 [Main wallet] --deposit--> [Private balance (0xbow Privacy Pool)]
                                    |  Enter Stealth Mode: browser creates a burner key and proves
                                    |  (ZK) a fixed-size withdrawal to it; relayer submits it and drips gas
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
| **0xbow Privacy Pools** (Entrypoint + one ERC20 pool per token, Groth16 verifiers), addresses in [`contracts/deployments/10143.json`](./contracts/deployments/10143.json) | **Real ZK pool.** Upstream contracts vendored unmodified, circuits from 0xbow's trusted setup |
| ASP (Association Set Provider, `/api/pool`) | Ours. Approves every deposit (no screening yet) |
| Relayer (`/api/relay`) | Real, but a single dev key (also the ASP postman) |

### How the private balance works

The private balance is a [0xbow Privacy Pool](https://0xbow.io). Unlink was the original plan, but its testnet was unreachable; 0xbow's contracts are open source, so we deploy them on Monad ourselves.

- **Keys.** One wallet signature derives the Privacy Pools master keys in the browser. Every note's nullifier and secret derive from them, so the balance is rebuilt from public pool events on any device. Nothing secret is stored.
- **Deposit** (public). The main wallet calls `Entrypoint.deposit` with a precommitment (a hash of the note's secrets). The ASP then approves the deposit's label by posting a new association-set root.
- **Withdraw to a burner** (private). The browser builds a Groth16 proof (snarkjs, ~3 s) that it owns *some* unspent, ASP-approved note in the pool, and binds the proof to the recipient (the burner). The relayer submits it through `Entrypoint.relay`, so the burner is funded by the Entrypoint in a transaction sent by the relayer. Nothing on-chain says which deposit paid for it. Any remainder stays in the pool as a new change note.
- **Exit.** The burner deposits everything back as a new note owned by the same master keys, and its key is wiped.
- **What the server sees.** The indexer serves the pool's full public history (all commitments and approved labels), and the browser builds its Merkle proofs locally. The server never learns which note you spend until the proof is on-chain, and even then the proof hides it.
- **Limits.** Deposits are public, so the anonymity set is everyone who has deposited and been approved. A small or quiet pool gives weak privacy, and the privacy score warns about this. The ASP approves everything; a production ASP would screen deposits (and 0xbow's `ragequit` lets a depositor exit publicly if never approved).

## Features

**Terminal (`/trade`)**

- **Live candles** (1m to 1D) on TradingView Lightweight Charts.
- **Live order book** with depth and spread, and a **recent trades** feed.
- **Pair selector with search** across all Perpl markets plus Kuru WETH/USDC and cbBTC/USDC.
- **Perps order ticket** with leverage and estimated liquidation price; **positions table** with market close.
- **Spot swaps** with quote and price impact; **spot holdings**.
- **Private balance** deposit and withdraw forms.
- **Stealth flow:** a 4-step onboarding in the order panel (connect, deposit to private balance, pick a bucket, Enter Stealth Mode), then trade, then Exit Stealth Mode.
- **Recoverable sessions:** burner *n* is derived from your unlock signature (hash of a signature-derived seed and *n*), so no key is ever stored. Each session takes the next never-used index, so burners stay unrelated on-chain and are never reused. Unlocking on any browser or device re-derives your burners and restores any session that still holds funds or positions, so it can always be exited, even after site data is cleared. The sign message names the app, chain and what it unlocks, and the first unlock on a device signs twice to reject wallets that don't sign deterministically.
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
| `frontend/lib/keys.ts` | Signature-derived Privacy Pools master keys and burner seed; burner *n* derivation |
| `frontend/lib/notes.ts` | Note recovery from public pool events, withdrawal planning, Groth16 proof building (0xbow SDK) |
| `frontend/lib/pool.ts` | Private balance: deposit, ZK withdraw via the relayer (re-proves if a new root lands first), circuit loading |
| `frontend/lib/poolIndex.server.ts`, `frontend/app/api/pool/route.ts` | Server indexer of pool events and the ASP (approves deposits, posts association-set roots) |
| `frontend/lib/relayer.server.ts` | The relayer key and its serialized send queue (shared by relayer and ASP) |
| `frontend/lib/perpl.ts` | Perpl account, deposit, open and close positions, market metadata |
| `frontend/lib/perplFeed.ts` | Client for Perpl candles, book, trades and the SSE stream |
| `frontend/lib/kuru.ts` | Kuru quotes and spot swaps through AccountCore. Swaps refuse partial fills and anything over 2% price impact vs the top of book (fair-price guard) |
| `frontend/lib/kuruData.ts` | Kuru public REST (candles, trades, 24h stats) and on-chain `getL2Book` |
| `frontend/lib/vault.ts` | Non-secret per-wallet hints: active session index, exited-burner counter, signature-determinism check |
| `frontend/lib/chain.ts` | viem clients (`cacheTime: 0`), Monad 3-block pacing and gas padding |
| `frontend/lib/privacy.ts` | Privacy score and checks |
| `frontend/lib/relay.ts`, `frontend/app/api/relay/route.ts` | Relayer client and server route (gas drip, withdrawal relay) |
| `frontend/app/api/perpl/markets`, `market-data/[...path]`, `stream` | Perpl metadata proxy, cached REST proxy, WebSocket-to-SSE relay |
| `frontend/app/page.tsx`, `frontend/components/landing/*` | Landing page |
| `frontend/app/trade/page.tsx`, `frontend/components/terminal/*` | Terminal: TopNav, MarketBar, PriceChart, OrderBook, RecentTrades, OrderPanel, PerpsOrderForm, SpotOrderForm, PositionsTable, SpotHoldings, BalanceForms, BottomPanel, Toast |
| `frontend/components/brand/Logo.tsx` | Logo |
| `frontend/hooks/*` | `useWallet`, `useShadowTrade`, `useMarketData`, `usePoll` |
| `contracts/src/privacy-pools/` | 0xbow Privacy Pools, vendored unmodified (Apache-2.0) |
| `contracts/script/DeployPrivacyPools.s.sol` | Deploys Poseidon libraries, verifiers, Entrypoint (UUPS proxy) and the AUSD/USDC pools |
| `frontend/scripts/fetch-circuits.sh` | Fetches the circuit artifacts into `public/artifacts` (runs before `dev` and `build`) |
| `scripts/fork.sh`, `scripts/fork-setup.sh` | Local Monad testnet fork with real Perpl and Kuru |
| `frontend/scripts/e2e.ts` | Headless end-to-end test against the fork (`pnpm e2e`) |

Stack: Next.js 16, React 19, viem, Foundry.

## Monad-specific engineering notes

- **Gas is billed on the gas limit, not gas used.** Every transaction is simulated, then sent with the estimate padded by 20% rather than a flat limit.
- **Reserve balance and 3-block delay.** Monad state reaches consensus 3 blocks late. Burner transactions are paced 3 blocks apart, and the session waits 3 blocks after funding before the burner sends anything.
- **No EIP-7702 on burners.** Delegated accounts cannot drop below the 10 MON reserve, so burners stay plain accounts.
- **Relayer gas drip.** The relayer sends 0.5 MON, and only to brand-new accounts (zero nonce, zero balance, once per address). Gas is never funded from the main wallet, since that would create a direct link.
- **Exit gas reserve.** A full session (two positions opened and closed, margin withdrawal, pool deposit) measured 2.44M gas limit, about 0.25 MON at ~102 gwei. Since a burner gets one drip, new positions are refused once its MON would only cover closing everything and returning to the pool.
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

`fork-setup.sh` gives your address 100 MON, 20,000 AUSD and 20,000 USDC, and also funds the relayer. It pins the fork clock so Perpl's and Kuru's oracles never go stale, and on a fork without the 0xbow Privacy Pools it deploys them (with `RELAYER_PRIVATE_KEY`) and writes the addresses to `frontend/lib/privacyPools.json`. Run it right after `fork.sh`: Perpl rejects trades once its mark price is ~60 s older than the block time, and the fork's own blocks age it until the clock is pinned. Re-running it is safe and doesn't move the clock. After a fresh deployment, restart `pnpm dev`.

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
cd contracts && forge test        # 8 Privacy Pools deployment/deposit/root/relay tests
cd frontend && pnpm e2e           # all checks; needs the fork (A) and the dev server running
```

A frozen-clock fork has no market makers, so repeated testing can drain one side of an order book. Restart the fork (`scripts/fork.sh` then `scripts/fork-setup.sh`) to reset it.

The 8 contract tests cover: deployment and pool registration, ERC20 deposit (commitment and label match PoseidonT4), duplicate precommitment, below-minimum deposit, unregistered asset, ASP root posting (postman only), and relay with a bad proof.

**Verified e2e script result (fresh local fork, production build, Perpl; Kuru is off by default and skipped):**

- Deposits land as notes and are approved by the ASP immediately; another user's keys see none of them.
- Stealth session ready in about 19.5 s on a 1 s-block fork, including the in-process Groth16 proof (Monad testnet blocks are ~0.4 s, so live is faster).
- ETH 5x long and BTC 3x short opened and closed; 998.69 of 1,000 AUSD returned to the private balance as a new note.
- Every burner is funded by the Entrypoint in a relayer-sent transaction; no transfers from the main wallet.
- A private withdrawal to a fresh address works, and all notes are rebuilt from public events using only the wallet signature.
- 9 of 9 abuse cases rejected: re-funding a burner, gas to an existing wallet, redirected recipient (`ContextMismatch`), non-zero relay fee, wrong processooor, forged proof, double spend (`NullifierAlreadySpent`), overdraw, and a proof against a superseded ASP root (`IncorrectASPRoot`); a fresh proof then relays.
- Concurrent pool syncs agree on one ASP root.

**Browser flows (Playwright, headless Chromium, against the fork):** connect, unlock, deposit (approved in ~4-6 s), Enter Stealth with the proof generated in the browser (~4 s), a perps order, Exit Stealth (999.59 of 1,000 AUSD back), a private withdrawal to a fresh address, and refresh-then-resume of a live session all pass, with no bundling, wasm or worker errors.

## Known limitations

- Market orders only (no limit orders).
- Kuru testnet liquidity is thin, so spot charts are mostly flat.
- On the local fork, the book and chart show live testnet data while trades execute against the fork's snapshot, so displayed and executed prices can differ.
- The ASP approves every deposit; there is no deposit screening yet.
- Everything private derives from one wallet signature: a site that tricks you into signing the exact ShadowTrade message could derive your keys. Wallets show the requesting site for every signature; only sign it on ShadowTrade.
- Spending several notes in one withdrawal sends one relayed transaction per note, so the split is visible on-chain.

## Next steps

- Deposit screening in the ASP (Chainalysis/TRM style) before approving labels, and a `ragequit` button for unapproved deposits.
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
