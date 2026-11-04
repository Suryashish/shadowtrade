// End-to-end test of the full stealth loop against a local fork (scripts/fork.sh + fork-setup.sh)
// and the running Next.js relayer. Usage: pnpm e2e
import assert from "node:assert/strict";
import { createWalletClient, formatUnits, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { publicClient } from "../lib/chain";
import { monadTestnet, RPC_URL, SPOT_MARKETS, TOKENS } from "../lib/config";
import { shadowAccountFromSignature, shadowKeyMessage } from "../lib/keys";
import * as kuru from "../lib/kuru";
import * as perpl from "../lib/perpl";
import { depositToPool, privateBalance, signWithdraw } from "../lib/pool";
import { relay } from "../lib/relay";
import { enterStealth, exitStealth } from "../lib/session";

const RELAY = process.env.RELAY_URL ?? "http://localhost:3000";
// anvil's default account #0, funded by fork-setup.sh
const MAIN_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

assert.ok(RPC_URL.includes("127.0.0.1"), "e2e must run against the local fork (NEXT_PUBLIC_RPC_URL)");

const main = createWalletClient({ account: privateKeyToAccount(MAIN_KEY), chain: monadTestnet, transport: http(RPC_URL) });
const mainAddr = main.account.address;
const log = (msg: string) => console.log(`  ${msg}`);
const fmt = (v: bigint) => Number(formatUnits(v, 6)).toLocaleString();

async function expectRelayError(label: string, req: Parameters<typeof relay>[0], pattern: RegExp) {
  await assert.rejects(relay(req, RELAY), pattern, label);
  log(`✓ rejected: ${label}`);
}

async function main_() {
  const shadow = shadowAccountFromSignature(await main.signMessage({ message: shadowKeyMessage(mainAddr) }));
  const again = shadowAccountFromSignature(await main.signMessage({ message: shadowKeyMessage(mainAddr) }));
  assert.equal(shadow.address, again.address, "shadow key must be deterministic");
  console.log(`main ${mainAddr}\nshadow ${shadow.address}`);

  console.log("\n1. Deposit into private balance");
  for (const t of [TOKENS.perpl, TOKENS.kuru]) {
    const before = await privateBalance(t.address, shadow.address);
    await depositToPool(main, t.address, parseUnits("5000", 6), shadow.address);
    assert.equal(await privateBalance(t.address, shadow.address), before + parseUnits("5000", 6));
    log(`✓ ${t.symbol} private balance ${fmt(await privateBalance(t.address, shadow.address))}`);
  }

  console.log("\n2. Perps session on Perpl");
  const markets = await perpl.fetchPerpMarkets();
  const eth = markets.find((m) => m.symbol === "ETH")!;
  const btc = markets.find((m) => m.symbol === "BTC")!;
  const t0 = Date.now();
  const perpSession = await enterStealth({ shadow, venue: "perpl", bucket: 1000, relayBase: RELAY, onStep: (s) => log(`[${s.index}/${s.total}] ${s.label}`) });
  log(`✓ stealth ready in ${((Date.now() - t0) / 1000).toFixed(1)}s, burner ${perpSession.burner.address}`);
  const account = await perpl.getAccount(perpSession.burner.address);
  assert.equal(account?.balanceCNS, parseUnits("1000", 6));

  const ethMark = await perpl.getMarkPrice(eth.id);
  const ethLots = perpl.lotsFor(eth, parseUnits("200", 6), 5, ethMark);
  await perpl.openPosition(perpSession.burner.wallet, eth, "long", ethLots, 5);
  const ethPos = await perpl.getPosition(eth.id, account!.id);
  assert.equal(ethPos?.side, "long");
  assert.equal(ethPos?.sizeLots, ethLots);
  const liq = perpl.liquidationPrice(eth, ethPos!);
  const entry = Number(ethPos!.entryPNS) / 10 ** eth.priceDecimals;
  assert.ok(liq < entry && liq > entry * 0.7, `long liq ${liq} should sit below entry ${entry}`);
  log(`✓ ETH long ${Number(ethLots) / 10 ** eth.sizeDecimals} @ ${entry}, margin ${fmt(ethPos!.marginCNS)}, est. liq ${liq.toFixed(2)}`);

  const btcMark = await perpl.getMarkPrice(btc.id);
  const btcLots = perpl.lotsFor(btc, parseUnits("200", 6), 3, btcMark);
  await perpl.openPosition(perpSession.burner.wallet, btc, "short", btcLots, 3);
  const btcPos = await perpl.getPosition(btc.id, account!.id);
  assert.equal(btcPos?.side, "short");
  const btcLiq = perpl.liquidationPrice(btc, btcPos!);
  assert.ok(btcLiq > Number(btcPos!.entryPNS) / 10 ** btc.priceDecimals, "short liq should sit above entry");
  log(`✓ BTC short ${Number(btcLots) / 10 ** btc.sizeDecimals}, est. liq ${btcLiq.toFixed(1)}`);

  const beforeExit = await privateBalance(TOKENS.perpl.address, shadow.address);
  const returned = await exitStealth({ session: perpSession, shadow: shadow.address, perpMarkets: markets, onStep: (s) => log(`[${s.index}/${s.total}] ${s.label}`) });
  assert.equal(await perpl.getPosition(eth.id, account!.id), null);
  assert.equal(await perpl.getPosition(btc.id, account!.id), null);
  assert.equal(await privateBalance(TOKENS.perpl.address, shadow.address), beforeExit + returned);
  assert.ok(returned > parseUnits("990", 6), `returned ${fmt(returned)} should be ~1000 minus fees`);
  log(`✓ returned ${fmt(returned)} AUSD to private balance; burner MON left ${formatUnits(await publicClient.getBalance({ address: perpSession.burner.address }), 18)}`);

  console.log("\n3. Spot session on Kuru");
  const weth = SPOT_MARKETS[0];
  const spot = await enterStealth({ shadow, venue: "kuru", bucket: 500, relayBase: RELAY });
  const q = await kuru.swap(spot.burner.wallet, weth, true, parseUnits("40", 6));
  const id = await kuru.accountId(spot.burner.address);
  assert.ok((await kuru.balanceOf(id, weth.baseToken)) > 0n);
  log(`✓ bought ${formatUnits(q.amountOut, 18)} WETH for 40 USDC`);
  // An order deeper than the book must be refused up front, not dumped at a bad price.
  await assert.rejects(kuru.swap(spot.burner.wallet, weth, false, parseUnits("1000", 18)), /Not enough buyers|more than 2%/);
  log("✓ refused a sell deeper than the order book");
  const spotBack = await exitStealth({ session: spot, shadow: shadow.address, perpMarkets: [] });
  assert.equal(await kuru.balanceOf(id, weth.baseToken), 0n);
  assert.ok(spotBack > parseUnits("495", 6));
  log(`✓ sold back, returned ${fmt(spotBack)} USDC to private balance`);

  console.log("\n4. Privacy invariants");
  const transfer = { type: "event", name: "Transfer", inputs: [{ name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "value", type: "uint256", indexed: false }] } as const;
  const head = await publicClient.getBlockNumber();
  for (const burner of [perpSession.burner.address, spot.burner.address]) {
    // The main wallet must never have transacted with the burner. RPCs cap log ranges at 100 blocks.
    for (let from = head - 500n; from <= head; from += 100n) {
      const to = from + 99n > head ? head : from + 99n;
      const logs = await publicClient.getLogs({ fromBlock: from, toBlock: to, event: transfer, args: { from: mainAddr, to: burner } });
      assert.equal(logs.length, 0);
    }
    assert.equal(await publicClient.getTransactionCount({ address: burner }) > 0, true);
  }
  log("✓ no token transfers from main wallet to any burner");

  console.log("\n5. Relayer abuse checks");
  await expectRelayError("re-funding a used burner", { kind: "gas", to: perpSession.burner.address }, /already funded|brand-new/);
  await expectRelayError("gas to an existing wallet", { kind: "gas", to: mainAddr }, /brand-new/);
  const req = await signWithdraw(shadow, TOKENS.perpl.address, parseUnits("10", 6), mainAddr);
  await expectRelayError("tampered amount", { kind: "withdraw", ...req, amount: parseUnits("4000", 6).toString() }, /BadSignature|reverted|signature/i);
  await expectRelayError("redirected recipient", { kind: "withdraw", ...req, to: perpSession.burner.address }, /BadSignature|reverted|signature/i);
  const tooMuch = await signWithdraw(shadow, TOKENS.perpl.address, parseUnits("1000000", 6), mainAddr);
  await expectRelayError("overdraw", { kind: "withdraw", ...tooMuch }, /InsufficientBalance|reverted|balance/i);
  await expectRelayError("unknown token", { kind: "withdraw", ...req, token: weth.baseToken }, /Invalid withdrawal/);

  console.log("\nAll end-to-end checks passed ✅");
}

main_().catch((e) => {
  console.error("\n❌ E2E failed:", e);
  process.exit(1);
});
