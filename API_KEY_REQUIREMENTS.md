# API Key & Credential Requirements

Living list of what ShadowTrade needs from outside. Values go in `frontend/.env.local` (gitignored), never in code.

## ✅ Done
| Item | Details |
|---|---|
| Monad testnet relayer wallet | `0x674f9e09E6fB102498bF9eb4744b247E4D5b0B54`, funded with ~9 MON from the devnads agent faucet. Key is in `.env.local` as `RELAYER_PRIVATE_KEY`; it is also the ASP postman. Top up at https://faucet.monad.xyz if it runs low. |
| 0xbow Privacy Pools (private balance) | Deployed on the **local fork** by `scripts/fork-setup.sh`. Not deployed on live testnet yet. |

## ⏳ Needed to trade on live testnet (not needed for the local fork)
Both venues' collateral tokens are admin-mint only on testnet. There is no public faucet.

| # | What | Why | How to get it |
|---|---|---|---|
| 0 | **Deploy the Privacy Pools to testnet** | Until `frontend/lib/deployments.json` points at real contracts there is nothing to deposit into. | Run `contracts/script/DeployPrivacyPools.s.sol` with `POSTMAN_ADDRESS` = relayer address and a dedicated owner key (the owner can upgrade the Entrypoint and register pools), then commit `deployments.json`. Needs MON for gas. |
| 1 | **Testnet aUSD** (`0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`), ~2,000+ | Perpl perps collateral. Opening an account needs ≥100 aUSD. | Ask Perpl (Discord / Telegram) to send aUSD to your wallet, or check https://testnet.perpl.xyz for a faucet. |
| 2 | *(not needed while Kuru is disabled, `NEXT_PUBLIC_ENABLE_KURU=false`)* **Kuru test USDC** (`0xb01DC575a7ef75e58A05D2bde73ab79f8e7dd0Be`), ~1,000+ | Kuru spot trading | Ask the Kuru team. The mint owner is `0xfeb3BF5CE7A6b0A59bcc6cb8308661b45aCa002c`. |

Send them to your own MetaMask address. Then deposit them into your private balance from the app.

## ❌ Dropped
| Item | Reason |
|---|---|
| Unlink API key | Dashboard registration fails, and the testnet engine host (`monad-testnet-production-api.unlink.xyz`) doesn't resolve. Replaced by 0xbow Privacy Pools, which need no API key. |

## No key needed
- Perpl market data (`https://testnet.perpl.xyz/api/v1/pub/context`) is public.
- Perpl and Kuru trades are direct on-chain calls from the burner, with no API key or whitelist. Verified: `whitelistingEnabled() == false`.

## Server env (`frontend/.env.local`)
- `RELAYER_PRIVATE_KEY`: relayer and ASP postman key (server only). Its address must equal `NEXT_PUBLIC_RELAYER_ADDRESS` (defaults to `0x674f...0B54`).
- `ASP_DENYLIST`: optional comma-separated depositor addresses the ASP will not approve.
- `NEXT_PUBLIC_RPC_URL`: RPC endpoint. Pool event scanning is chunked to 100 blocks per `eth_getLogs`.
