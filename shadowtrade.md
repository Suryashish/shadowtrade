# ShadowTrade — Private Trading on Monad

> **One line:** Incognito mode for traders on Monad. You trade on Kuru or Perpl from a fresh throwaway wallet that has no on-chain link to your main wallet, then send the money back into a private balance when you're done.
>
> **Facts last checked:** 4 Nov 2026. Sources are listed at the bottom.

---

## 1. The Problem

On public DEXs, your wallet is a glass box. If you trade size:

- **Copy-bots and trackers** (Arkham, Nansen, whale-alert bots) follow your wallet and trade ahead of you or next to you, so you get worse prices.
- **Liquidation hunting.** Perp positions and liquidation prices are public, so others can push price toward your liquidation level.
- **Exposure.** Anyone can see your net worth, PnL and strategy.

**What exists today:** **Finity** (`finity.click`) moves shielded Zcash to a fresh Hyperliquid account, trades there, and moves it back. But:
- Funding takes **~2 hours** and the return takes **~2 hours** (100 Zcash confirmations plus the Unit bridge).
- You need ZEC and a Zcash wallet.
- It is **experimental, testnet-only and unaudited**, and its mainnet funding is turned off.

---

## 2. What ShadowTrade Does

The same round trip as Finity, but all on Monad, in **seconds instead of hours**, using **USDC/MON**.

```
 [Your public wallet]
        |  1. Deposit USDC into a private balance (Unlink ZK pool)
        v
 [Private balance]  (encrypted notes; outsiders can't see amounts or owner)
        |  2. "Enter Stealth Mode": the browser creates a fresh burner key.
        |     A fixed-size amount (e.g. 1,000 USDC) is withdrawn to the burner.
        |     A shared relayer gives the burner a little MON for gas.
        v
 [Burner wallet 0x8F2…]  (no history, no link to you)
        |  3. Trade: spot on Kuru, or perps on Perpl
        v
 [Close position]
        |  4. "Exit Stealth": the burner deposits everything back into the
        |     private balance, and the key is wiped from the browser
        v
 [Private balance]  -> withdraw later to any address you choose
```

**To an observer:** a new wallet, funded from a shared privacy pool, made some trades and returned funds to the pool. Nothing points to your main wallet.

### Two ways to trade
| Mode | Use for | How |
|---|---|---|
| **A. Private swap** | One-shot market swaps | Unlink's `execute` lets a private balance call an external contract directly, so no burner is needed. *Test whether it works with Kuru's router.* |
| **B. Stealth account** | Limit orders, perps, anything that stays open | The burner wallet flow above. This is the main product. |

---

## 3. Why Monad

- **Fast:** ~400 ms blocks and ~800 ms finality. The whole loop (deposit, fund burner, trade, sweep) takes **a few seconds** including ZK proof generation. Finity takes hours.
- **Cheap:** the minimum base fee is 100 MON-gwei, so a simple transfer costs about 0.002 MON. Spinning up a burner and trading costs a fraction of a cent.
- **Fully on-chain order books:** Kuru (spot CLOB plus AMM) and Perpl (perps CLOB, live on mainnet since 24 Feb 2026). Both run on-chain, so a burner can trade on them like any other wallet.
- **Privacy layer already live:** **Unlink** went live on Monad in June 2026 (ZK proofs, encrypted notes, `deposit / transfer / withdraw / execute`). **We don't build our own ZK pool.**
- **Native USDC** from Circle is live on Monad mainnet.

---

## 4. How We Build It

| Part | Choice |
|---|---|
| Privacy pool | **Unlink SDK** (`@unlink-xyz/sdk`, use the `/browser` entry so keys stay on the client). Monad **testnet** (`monad-testnet`, chain 10143) is open; Monad **mainnet** (`monad`, chain 143) requires an access grant from Unlink. |
| Burner wallets | Generated in the browser (viem), kept in memory only, wiped on exit |
| Gas for burners | A small **shared relayer** sends MON to burners. Never fund gas from the main wallet, because that creates a direct link. |
| Trading | Kuru (SDK: `kuru-sdk-py`; the older `kuru-sdk` is archived) and the Perpl API |
| Frontend | Next.js + viem: "Stealth Mode" toggle, burner status, privacy warnings |

### Monad gotchas (verified in Monad docs)
- **Gas is charged on the gas *limit*, not gas used.** Set tight limits on burner transactions or you overpay.
- **Reserve balance (10 MON default).** A plain (undelegated) burner can still spend below 10 MON through the "emptying" exception, but only about once per 3 blocks. Consensus also caps in-flight gas at min(10 MON, balance). **Fund burners with enough MON to cover a few transactions' gas limits.**
- **Don't use EIP-7702 delegation on burners.** Delegated accounts cannot drop below 10 MON (those transactions revert). Some providers, such as Alchemy, also have 7702 disabled by default on Monad.

### Privacy hygiene (built in, not optional)
A fresh address alone is **not** enough. Analytics firms link wallets by amount and timing.
1. **Fixed sizes:** withdraw to burners only in set buckets (e.g. 500 / 1,000 / 5,000 / 10,000 USDC).
2. **Timing gap:** add random delays between deposit and burner funding, or pre-fund "warm" burners ahead of time.
3. **Never touch the main wallet** from a burner, for gas, sweeps or approvals.
4. **Exit to the pool or to a fresh address**, never straight back to the main wallet.
5. **RPC/IP leak:** the same RPC endpoint can see your IP for both wallets. Offer a separate RPC per burner session.
6. **Be honest:** privacy is only as strong as the number of other people using the pool, and your trading style can still be fingerprinted.

---

## 5. Extra Things We Can Add

**Core extensions**
1. **Stealth perps on Perpl.** Open leveraged positions from burners, so nobody can hunt your liquidation price.
2. **Split orders across burners.** Break one large order into N burners and N fixed-size chunks (like a private TWAP). This also hides total size.
3. **Multiple liquidation points.** Spread one perp position across several burners so there is no single big liquidation level to hunt.
4. **Private exit to a stealth address** (ERC-5564 stealth addresses). Profits land at a one-time address only you can spend from.

**Safety and trust**
5. **Privacy score meter.** A live warning such as "your amount is unique", "you funded too fast" or "pool is small right now", with a 0–100 score.
6. **"Am I being tracked?" checker.** Paste a public wallet and see how exposed it is: labels, known trackers, copy-bot activity. This is also a good free hook for users.
7. **Deposit screening.** Block sanctioned or hacked funds at deposit using a screening API (Chainalysis / TRM style).
8. **Selective disclosure for tax and audit.** Unlink supports scoped "audit views", so you can show your own trade history to an accountant or fund admin without making it public.

**UX**
9. **One-click Stealth Mode** with passkeys, so there are no seed phrases and no wallet popups per trade.
10. **Session history.** A local, encrypted log of each burner session's PnL, kept on your device only.

**Bigger ideas (later)**
11. **Private DeFi beyond trading.** Use Unlink `execute` to lend or borrow on Aave or Morpho from the private balance.
12. **Private fund mode.** A fund manager runs a strategy from burners, and investors see verified PnL through audit views without seeing positions.
13. **Trading bot / AI agent mode.** An API so bots and agents can trade from rotating burners.

---

## 6. Competition (checked Nov 2026)

| Project | What it does | Overlap |
|---|---|---|
| **Finity** | Zcash to Hyperliquid round trip, ~2 h each way, testnet only | Same idea, much slower, not on Monad |
| **Unlink** | Privacy infrastructure on Monad | **We build on it.** It is not a trading app. |
| **ShadowBet** (GitHub, Feb–Mar 2026) | Private prediction-market bets on Monad using Unlink | Prediction markets only, no DEX trading |
| **Monadow** (Metropolis hackathon) | Private stealth payments on Monad | Payments, not trading |
| **MoneyMarkets** | Passkey trading app for Kuru | Trading UX with no privacy |
| **Monad Private Settlement** (Category Labs, announced 6 Oct 2026) | Encrypted execution domains for banks and funds | Institutional; **published design only, not live** |

**Gap:** no one has a private trading terminal for Kuru or Perpl on Monad yet. **Monad Private Settlement** is the long-term one to watch, because if it ships it targets big institutions. ShadowTrade targets individual traders and small funds, and it works now.

> To do: check the **Metropolis** hackathon winners (announced 3 Nov) for any new private-trading project.

---

## 7. Legal Positioning (keep it clean)

- The US Treasury **removed Tornado Cash from the sanctions list in March 2025**. However, developer **Roman Storm was convicted in Aug 2025** of conspiracy to run an unlicensed money-transmitting business, and his **retrial on the money-laundering and sanctions counts is set for 26 Apr 2027**. Privacy tools are still a legal grey zone.
- So ShadowTrade should be:
  - **Non-custodial:** keys stay in the user's browser, and we never hold funds.
  - **Screened:** bad funds are blocked at deposit.
  - **Auditable by the user:** selective disclosure for tax and compliance.
- **Pitch:** "commercial privacy for traders", the same reason funds don't publish their positions. Not "a mixer".
- *This is not legal advice. Talk to a lawyer before mainnet.*

---

## 8. Hackathon MVP (6–8 hours)

**Build:**
1. Unlink on **Monad testnet**: deposit USDC, withdraw a fixed bucket to the burner.
2. Relayer script that drips MON gas to burners.
3. One trade on Kuru (or a mock order-book contract if testnet liquidity is thin).
4. Sweep back into Unlink and wipe the burner key.
5. A UI with the Stealth Mode toggle and privacy score.

**2-minute demo:**
1. Show the public wallet on Monadscan.
2. Click **Enter Stealth Mode**. The burner is funded in about a second.
3. Place the trade, then open the burner on Monadscan: it is brand new, funded by the pool, with **no link to the main wallet**.
4. Click **Exit Stealth**. Funds go back to the private balance and the key is wiped.
5. Close with: *"Finity takes about 2 hours each way. On Monad this takes seconds."*

---

## 9. Corrections vs. Earlier Notes

| Earlier claim | Correct (Nov 2026) |
|---|---|
| "Whole loop in under 800 ms" | 800 ms is **one finality step**. The full loop is **a few seconds**. |
| "1-second block times" | **~400 ms** blocks, **~800 ms** finality |
| "Build our own ZK pool / Groth16 circuit" | Use **Unlink**, which is already live on Monad |
| "0.01 MON gas stipend is enough" | Monad charges by **gas limit** and has **reserve-balance** rules, so budget more and test |
| "Zero competition" | Small gap for *trading*, but Unlink, ShadowBet, Monadow and Monad Private Settlement all exist |
| "Tornado Cash is sanctioned" | Delisted in Mar 2025, but the Storm case is ongoing (retrial Apr 2027) |

---

## Sources

- Monad finality and block time: [Dune — Monad overview](https://docs.dune.com/data-catalog/evm/monad/overview), [Aave governance — Monad deployment](https://governance.aave.com/t/arfc-deploy-aave-protocol-v3-7-on-monad/24943/2)
- Monad gas, reserve balance, EIP-7702: [Differences from Ethereum](https://docs.monad.xyz/developer-essentials/differences), [Reserve balance](https://docs.monad.xyz/developer-essentials/reserve-balance), [EIP-7702 on Monad](https://docs.monad.xyz/developer-essentials/eip-7702), [Gas pricing](https://docs.monad.xyz/developer-essentials/gas-pricing), [Category Labs — setting gas limit](https://www.category.xyz/blogs/setting-your-gas-limit-on-monad), [Alchemy — 7702 disabled on Monad](https://support.alchemy.com/articles/3464779447-why-do-i-get-eip-7702-is-disabled-32602-when-sending-a-user-operation-on-monad)
- Unlink: [Monad blog — Privacy comes to Monad with Unlink](https://monad.xyz/blog/privacy-comes-to-monad-with-unlink), [unlink.xyz](https://www.unlink.xyz/), [Unlink docs](https://docs.unlink.xyz), [Supported chains](https://docs.unlink.xyz/supported-chains.md)
- Finity: [finity.click](https://finity.click)
- Kuru: [4Pillars — dapps after Monad mainnet](https://4pillars.io/en/articles/must-watch-dapps-after-monad-mainnet-launch), [kuru-sdk-py (PyPI)](https://pypi.org/project/kuru-sdk-py/0.1.7/)
- Perpl: [Monad blog — high-frequency finance](https://monad.xyz/blog/monad-home-high-frequency-finance), [Perpl docs](https://docs.perpl.xyz)
- USDC on Monad: [Circle — USDC on Monad](https://www.circle.com/multi-chain-usdc/monad)
- Competitors: [ShadowBet](https://github.com/YuxiangJiangCT/shadow-bet), [Monadow](https://github.com/erhantrk/monadow), [MoneyMarkets](https://github.com/moneymarkets/moneymarkets), [Monad Private Settlement](https://monad.xyz/blog/monad-private-settlement), [Metropolis hackathon](https://monad.xyz/developers/hackathons/metropolis)
- Legal: [The Block — Storm retrial moved to Apr 2027](https://www.theblock.co/news/regulation/2026-08-26-tornado-cash-roman-storm-retrial-april-2027-412761), [Decrypt — retrial pushed](https://decrypt.co/376577/roman-storms-tornado-cash-retrial-pushed-to-april-2027)
