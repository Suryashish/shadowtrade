// One minimal stealth round trip on live Monad testnet with LIVE_TEST_PRIVATE_KEY: deposit the
// smallest bucket, enter stealth, open and close one small Perpl position, exit to the pool, and
// withdraw the private balance back to the main wallet. Live AUSD is scarce: this spends only fees.
// Needs the Next.js app running against live testnet (RELAY_URL). Usage: pnpm smoke:live
import assert from "node:assert/strict";
import { createWalletClient, erc20Abi, formatUnits, http, isHex, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { publicClient } from "../lib/chain";
import { BUCKETS, IS_FORK, monadTestnet, PRIVACY_POOLS, RELAYER_ADDRESS, RPC_URL, TOKENS } from "../lib/config";
import { burnerSeedFromSignature, deriveBurner, masterKeysFromSignature, shadowKeyMessage } from "../lib/keys";
import * as perpl from "../lib/perpl";
import { depositToPool, privateBalance, withdrawFromPool } from "../lib/pool";
import { enterStealth, exitStealth, scanBurners } from "../lib/session";

const RELAY = process.env.RELAY_URL ?? "http://localhost:3000";
const BUCKET = BUCKETS[0];
const MARGIN = parseUnits("25", 6);
const LEVERAGE = 2;

assert.ok(!IS_FORK, "smoke:live runs against live testnet; set NEXT_PUBLIC_RPC_URL=https://testnet-rpc.monad.xyz");
const key = process.env.LIVE_TEST_PRIVATE_KEY;
assert.ok(key && isHex(key), "LIVE_TEST_PRIVATE_KEY missing from .env.local");

const main = createWalletClient({ account: privateKeyToAccount(key), chain: monadTestnet, transport: http(RPC_URL) });
const mainAddr = main.account.address;
const ausd = TOKENS.perpl;
const log = (msg: string) => console.log(`  ${msg}`);
const fmt = (v: bigint) => formatUnits(v, ausd.decimals);
const walletAusd = () => publicClient.readContract({ address: ausd.address, abi: erc20Abi, functionName: "balanceOf", args: [mainAddr] });
const spendable = async (keys: Parameters<typeof privateBalance>[0]) => (await privateBalance(keys, "perpl", RELAY)).spendable;

async function run() {
  const signature = await main.signMessage({ message: shadowKeyMessage(mainAddr) });
  const keys = masterKeysFromSignature(signature);
  const seed = burnerSeedFromSignature(signature);
  const startAusd = await walletAusd();
  const startMon = await publicClient.getBalance({ address: mainAddr });
  console.log(`main ${mainAddr}: ${fmt(startAusd)} AUSD, ${formatUnits(startMon, 18)} MON\nentrypoint ${PRIVACY_POOLS.entrypoint} via ${RPC_URL}`);

  const markets = await perpl.fetchPerpMarkets();
  const scan = await scanBurners(seed, 0, markets);
  if (scan.unfinished) {
    console.log(`\n0. Exiting unfinished session on burner #${scan.unfinished.burner.index} from an earlier run`);
    log(`returned ${fmt(await exitStealth({ session: scan.unfinished, keys, perpMarkets: markets, relayBase: RELAY }))} AUSD`);
  }

  console.log(`\n1. Private balance of at least ${BUCKET} AUSD`);
  const have = await spendable(keys);
  const need = parseUnits(String(BUCKET), ausd.decimals);
  if (have < need) {
    await depositToPool(main, keys, "perpl", need - have, RELAY);
    log(`deposited ${fmt(need - have)} AUSD from the main wallet`);
  }
  const pooled = await spendable(keys);
  assert.ok(pooled >= need, `private balance ${fmt(pooled)} should cover the ${BUCKET} bucket`);
  log(`✓ private balance ${fmt(pooled)} AUSD (ASP approved)`);

  console.log(`\n2. Enter stealth with the ${BUCKET} bucket`);
  const { next } = await scanBurners(seed, 0, markets);
  const t0 = Date.now();
  const session = await enterStealth({ burner: deriveBurner(seed, next), keys, venue: "perpl", bucket: BUCKET, relayBase: RELAY, onStep: (s) => log(`[${s.index}/${s.total}] ${s.label}`) });
  const account = await perpl.getAccount(session.burner.address);
  assert.equal(account?.balanceCNS, need, "burner's Perpl account should hold the bucket");
  log(`✓ burner #${session.burner.index} ${session.burner.address} ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  console.log(`\n3. Small ETH long (${fmt(MARGIN)} AUSD margin, ${LEVERAGE}x)`);
  const eth = markets.find((m) => m.symbol === "ETH")!;
  const lots = perpl.lotsFor(eth, MARGIN, LEVERAGE, await perpl.getMarkPrice(eth.id));
  await perpl.openPosition(session.burner.wallet, eth, "long", lots, LEVERAGE);
  const pos = await perpl.getPosition(eth.id, account!.id);
  assert.equal(pos?.side, "long");
  log(`✓ long ${Number(pos!.sizeLots) / 10 ** eth.sizeDecimals} ETH @ ${Number(pos!.entryPNS) / 10 ** eth.priceDecimals}`);

  console.log("\n4. Exit stealth");
  const beforeExit = await spendable(keys);
  const returned = await exitStealth({ session, keys, perpMarkets: markets, relayBase: RELAY, onStep: (s) => log(`[${s.index}/${s.total}] ${s.label}`) });
  assert.equal(await perpl.getPosition(eth.id, account!.id), null, "position should be closed");
  assert.equal(await spendable(keys), beforeExit + returned, "exit deposit should be spendable");
  assert.ok(returned > need - parseUnits("5", 6), `returned ${fmt(returned)} should be ~${BUCKET} minus fees`);
  log(`✓ returned ${fmt(returned)} AUSD to the private balance (cost ${fmt(need - returned)})`);
  const funding = await publicClient.getTransactionCount({ address: session.burner.address });
  log(`✓ burner sent ${funding} txs; leftover gas swept to relayer ${RELAYER_ADDRESS}`);

  console.log("\n5. Withdraw the private balance back to the main wallet");
  const all = await spendable(keys);
  await withdrawFromPool({ keys, venue: "perpl", amount: all, recipient: mainAddr, base: RELAY });
  assert.equal(await spendable(keys), 0n);
  const endAusd = await walletAusd();
  log(`✓ main wallet ${fmt(endAusd)} AUSD (net ${fmt(endAusd - startAusd)}), ${formatUnits(await publicClient.getBalance({ address: mainAddr }), 18)} MON`);

  console.log("\nLive smoke test passed ✅");
}

// snarkjs keeps its prover threads alive, so exit explicitly.
run().then(() => process.exit(0), (e) => {
  console.error("\n❌ Live smoke test failed:", e);
  process.exit(1);
});
