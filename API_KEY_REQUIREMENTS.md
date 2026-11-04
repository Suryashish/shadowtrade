# API Key & Credential Requirements

Living list of what ShadowTrade needs from outside. Values go in `frontend/.env.local` (gitignored), never in code.

## ✅ Done
| Item | Details |
|---|---|
| Monad testnet relayer wallet | `0x674f9e09E6fB102498bF9eb4744b247E4D5b0B54`, funded with ~9 MON from the devnads agent faucet. Key is in `.env.local` as `RELAYER_PRIVATE_KEY`. Top up at https://faucet.monad.xyz if it runs low. |
| ShadowPool (private balance) | Deployed on testnet at `0xe9c9b7598dF01f3c9bE036E8e1B067a63eAa5A9D`. |

## ⏳ Needed to trade on live testnet (not needed for the local fork)
Both venues' collateral tokens are admin-mint only on testnet. There is no public faucet.

| # | What | Why | How to get it |
|---|---|---|---|
| 1 | **Testnet aUSD** (`0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`), ~2,000+ | Perpl perps collateral. Opening an account needs ≥100 aUSD. | Ask Perpl (Discord / Telegram) to send aUSD to your wallet, or check https://testnet.perpl.xyz for a faucet. |
| 2 | *(not needed while Kuru is disabled, `NEXT_PUBLIC_ENABLE_KURU=false`)* **Kuru test USDC** (`0xb01DC575a7ef75e58A05D2bde73ab79f8e7dd0Be`), ~1,000+ | Kuru spot trading | Ask the Kuru team. The mint owner is `0xfeb3BF5CE7A6b0A59bcc6cb8308661b45aCa002c`. |

Send them to your own MetaMask address. The app deposits them into the private pool for you.

## ❌ Dropped
| Item | Reason |
|---|---|
| Unlink API key | Dashboard registration fails, and the testnet engine host (`monad-testnet-production-api.unlink.xyz`) doesn't resolve. ShadowPool is used instead. It sits behind one module (`lib/pool.ts`), so Unlink can be swapped in later. |

## No key needed
- Perpl market data (`https://testnet.perpl.xyz/api/v1/pub/context`) is public.
- Perpl and Kuru trades are direct on-chain calls from the burner, with no API key or whitelist. Verified: `whitelistingEnabled() == false`.
