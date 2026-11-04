// End-to-end test of the full stealth loop against a local fork (scripts/fork.sh + fork-setup.sh)
// and the running Next.js relayer/ASP. Usage: pnpm e2e
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createWalletClient, encodeAbiParameters, erc20Abi, formatUnits, http, parseUnits, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount, privateKeyToAddress } from "viem/accounts";
import { relayDataParams } from "../lib/abi/entrypoint";
import { noteFunded, publicClient, sendValue, write } from "../lib/chain";
import { monadTestnet, KURU_ENABLED, RELAYER_ADDRESS, RPC_URL, SPOT_MARKETS, TOKENS, VENUES } from "../lib/config";
import type { MasterKeys } from "../lib/privacySdk";
import { createBurner, privacyKeysFromSignature, shadowKeyMessage } from "../lib/keys";
import * as kuru from "../lib/kuru";
import * as perpl from "../lib/perpl";
import { balancesOf, depositToPool, fetchPoolState, loadAccount, privateBalance, proveWithdrawal, withdrawToAddress, type PoolEnv } from "../lib/pool";
import { relay, RelayFailure, STALE_STATUS, type RelayRequest } from "../lib/relay";
import { enterStealth, exitStealth } from "../lib/session";

const RELAY = process.env.RELAY_URL ?? "http://localhost:3000";
// Drive-less file URL: the SDK's Node loader reads URL.pathname, which breaks on "file:///C:/...".
const circuitsUrl = pathToFileURL(`${resolve("public")}/`).href.replace(/^file:\/\/\/[A-Za-z]:/, "file://");
const env: PoolEnv = { apiBase: RELAY, circuits: { browser: false, baseUrl: circuitsUrl } };
// anvil's default account #0, funded by fork-setup.sh
const MAIN_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

assert.ok(RPC_URL.includes("127.0.0.1"), "e2e must run against the local fork (NEXT_PUBLIC_RPC_URL)");

const main = createWalletClient({ account: privateKeyToAccount(MAIN_KEY), chain: monadTestnet, transport: http(RPC_URL) });
const mainAddr = main.account.address;
const AUSD = TOKENS.perpl.address;
const log = (msg: string) => console.log(`  ${msg}`);
const fmt = (v: bigint) => Number(formatUnits(v, 6)).toLocaleString();
const seconds = (since: number) => ((Date.now() - since) / 1000).toFixed(1);
const freshAddress = () => privateKeyToAddress(generatePrivateKey());
const relayData = (recipient: Address, feeRecipient: Address, fee: bigint) => encodeAbiParameters(relayDataParams, [{ recipient, feeRecipient, relayFeeBPS: fee }]);
const erc20Balance = (token: Address, owner: Address) => publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
const lower = (a: string) => a.toLowerCase();

/** Root updates are batched (see poolCache), so a fresh deposit stays pending for up to one interval. */
async function settledBalance(token: Address, keys: MasterKeys): Promise<bigint> {
  for (let i = 0; i < 60; i++) {
    const { spendable, pending } = balancesOf(await loadAccount(keys, env), token);
    if (pending === 0n) return spendable;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("deposit was never approved by the ASP");
}

async function expectRelayError(label: string, req: RelayRequest, pattern: RegExp, status?: number) {
  await assert.rejects(relay(req, RELAY), (e: unknown) => e instanceof RelayFailure && pattern.test(e.message) && (status === undefined || e.status === status), label);
  log(`✓ rejected: ${label}`);
}

// Serialised lowercase hex, so address/field-element needles can be searched for anywhere in a tx.
const dump = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString(16) : x)).toLowerCase();
const word = (n: string) => toHex(BigInt(n), { size: 32 }).slice(2);

const transferEvent = { type: "event", name: "Transfer", inputs: [{ name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "value", type: "uint256", indexed: false }] } as const;

/** First relayer-sent gas drip and token funding of a burner, found from `fromBlock`. RPCs cap log ranges at 100 blocks. */
async function fundingTxs(burner: Address, fromBlock: bigint) {
  const head = await publicClient.getBlockNumber();
  const toBlock = fromBlock + 99n < head ? fromBlock + 99n : head;
  const logs = await publicClient.getLogs({ fromBlock, toBlock, event: transferEvent, args: { to: burner } });
  assert.ok(logs.length > 0, "token funding transfer not found");
  const blocks = await Promise.all(Array.from({ length: Math.min(40, Number(head - fromBlock) + 1) }, (_, i) => publicClient.getBlock({ blockNumber: fromBlock + BigInt(i), includeTransactions: true })));
  const gas = blocks.flatMap((b) => b.transactions).find((t) => t.to && lower(t.to) === lower(burner) && t.value > 0n);
  assert.ok(gas, "gas funding tx not found");
  return { gas, token: await publicClient.getTransaction({ hash: logs[0].transactionHash }), tokenReceipt: await publicClient.getTransactionReceipt({ hash: logs[0].transactionHash }) };
}

async function main_() {
  const sign = () => main.signMessage({ message: shadowKeyMessage(mainAddr) });
  const keys = await privacyKeysFromSignature(await sign());
  console.log(`main ${mainAddr}`);

  console.log("\n1. Deposit into private balance");
  for (const t of VENUES.map((v) => TOKENS[v])) {
    const before = await settledBalance(t.address, keys);
    await depositToPool(main, t.address, parseUnits("5000", 6), keys, env);
    const spendable = await settledBalance(t.address, keys);
    assert.equal(spendable, before + parseUnits("5000", 6), "deposit must be approved by the ASP");
    log(`✓ ${t.symbol} private balance ${fmt(spendable)} (approved, nothing pending)`);
  }
  // A one-leaf ASP tree publishes that leaf as its root, so unlinkability needs a second depositor in the set.
  const other = createWalletClient({ account: privateKeyToAccount(generatePrivateKey()), chain: monadTestnet, transport: http(RPC_URL) });
  await sendValue(main, other.account.address, parseUnits("2", 18));
  await write(main, { address: AUSD, abi: erc20Abi, functionName: "transfer", args: [other.account.address, parseUnits("1000", 6)] });
  const otherKeys = await privacyKeysFromSignature(await other.signMessage({ message: shadowKeyMessage(other.account.address) }));
  await depositToPool(other, AUSD, parseUnits("1000", 6), otherKeys, env);
  assert.equal(await settledBalance(AUSD, otherKeys), parseUnits("1000", 6));
  assert.equal(await settledBalance(AUSD, keys), parseUnits("5000", 6));
  log("✓ a second user's deposit shares the pool; each sees only their own balance");
  const recovered = await privacyKeysFromSignature(await sign());
  for (const t of VENUES.map((v) => TOKENS[v])) assert.equal(await privateBalance(t.address, recovered, env), await privateBalance(t.address, keys, env));
  const stranger = await privacyKeysFromSignature(await privateKeyToAccount(generatePrivateKey()).signMessage({ message: "other" }));
  assert.equal(await privateBalance(AUSD, stranger, env), 0n);
  log("✓ re-deriving keys from a fresh signature recovers the same balances; unrelated keys see none");

  console.log("\n2. Perps session on Perpl");
  const markets = await perpl.fetchPerpMarkets();
  const eth = markets.find((m) => m.symbol === "ETH")!;
  const btc = markets.find((m) => m.symbol === "BTC")!;
  const perpHead = await publicClient.getBlockNumber();
  const t0 = Date.now();
  let proofStart = t0;
  let proofSeconds = "";
  const perpSession = await enterStealth({
    keys,
    venue: "perpl",
    bucket: 1000,
    poolEnv: env,
    onStep: (s) => {
      log(`[${s.index}/${s.total}] ${s.label}`);
      if (s.label.includes("zero-knowledge")) proofStart = Date.now();
      else if (s.index === 4) proofSeconds = seconds(proofStart);
    },
  });
  log(`✓ stealth ready in ${seconds(t0)}s (proof + relay ${proofSeconds}s), burner ${perpSession.burner.address}`);
  const account = await perpl.getAccount(perpSession.burner.address);
  assert.equal(account?.balanceCNS, parseUnits("1000", 6));
  assert.equal(await privateBalance(AUSD, keys, env), parseUnits("4000", 6), "the 5000 note minus the 1000 withdrawal leaves a 4000 change note");

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

  const beforeExit = await settledBalance(AUSD, keys);
  const returned = await exitStealth({ session: perpSession, keys, poolEnv: env, perpMarkets: markets, onStep: (s) => log(`[${s.index}/${s.total}] ${s.label}`) });
  assert.equal(await perpl.getPosition(eth.id, account!.id), null);
  assert.equal(await perpl.getPosition(btc.id, account!.id), null);
  assert.equal(await settledBalance(AUSD, keys), beforeExit + returned);
  assert.ok(returned > parseUnits("990", 6), `returned ${fmt(returned)} should be ~1000 minus fees`);
  log(`✓ returned ${fmt(returned)} AUSD to private balance; burner MON left ${formatUnits(await publicClient.getBalance({ address: perpSession.burner.address }), 18)}`);

  console.log("\n3. Spot session on Kuru");
  const burners = [{ address: perpSession.burner.address, head: perpHead }];
  if (KURU_ENABLED) {
    const weth = SPOT_MARKETS[0];
    const spotHead = await publicClient.getBlockNumber();
    const spot = await enterStealth({ keys, venue: "kuru", bucket: 500, poolEnv: env });
    burners.push({ address: spot.burner.address, head: spotHead });
    const q = await kuru.swap(spot.burner.wallet, weth, true, parseUnits("40", 6));
    const id = await kuru.accountId(spot.burner.address);
    assert.ok((await kuru.balanceOf(id, weth.baseToken)) > 0n);
    log(`✓ bought ${formatUnits(q.amountOut, 18)} WETH for 40 USDC`);
    // An order deeper than the book must be refused up front, not dumped at a bad price.
    await assert.rejects(kuru.swap(spot.burner.wallet, weth, false, parseUnits("1000", 18)), /Not enough buyers|more than 2%/);
    log("✓ refused a sell deeper than the order book");
    const spotBack = await exitStealth({ session: spot, keys, poolEnv: env, perpMarkets: [] });
    assert.equal(await kuru.balanceOf(id, weth.baseToken), 0n);
    assert.ok(spotBack > parseUnits("495", 6));
    log(`✓ sold back, returned ${fmt(spotBack)} USDC to private balance`);
  } else log("- skipped: Kuru is disabled (NEXT_PUBLIC_ENABLE_KURU=true enables it)");

  console.log("\n4. Privacy invariants (zero-knowledge unlinkability)");
  const head = await publicClient.getBlockNumber();
  const pool = await fetchPoolState(env);
  const allDeposits = Object.values(pool.pools).flatMap((p) => p.deposits);
  const mainDeposits = allDeposits.filter((d) => lower(d.depositor) === lower(mainAddr));
  assert.ok(mainDeposits.length >= 1);
  const needles = [lower(mainAddr.slice(2)), ...mainDeposits.flatMap((d) => [d.label, d.commitment, d.precommitment].map(word))];
  for (const { address: burner, head: from } of burners) {
    for (let start = from; start <= head; start += 100n) {
      const to = start + 99n > head ? head : start + 99n;
      assert.equal((await publicClient.getLogs({ fromBlock: start, toBlock: to, event: transferEvent, args: { from: mainAddr, to: burner } })).length, 0);
    }
    const { gas, token, tokenReceipt } = await fundingTxs(burner, from);
    assert.equal(lower(gas.from), lower(RELAYER_ADDRESS), "gas must come from the relayer, not the main wallet");
    assert.equal(lower(token.from), lower(RELAYER_ADDRESS), "token funding must be sent by the relayer");
    const haystack = dump({ gas, token, tokenReceipt });
    for (const needle of needles) assert.ok(!haystack.includes(needle), `funding txs leak ${needle} in ${haystack.slice(Math.max(0, haystack.indexOf(needle) - 200), haystack.indexOf(needle) + 100)}`);
  }
  log("✓ gas and token funding of every burner were sent by the relayer; calldata and logs hold no main-wallet address, label, commitment or precommitment");
  log("✓ no token transfers from main wallet to any burner");
  for (const { address: burner } of burners) {
    const sweeps = allDeposits.filter((d) => lower(d.depositor) === lower(burner));
    assert.equal(sweeps.length, 1, "exit must deposit from the burner");
  }
  log("✓ exit Deposited events have the burner as depositor, not the main wallet");

  console.log("\n5. Relayer abuse checks");
  await expectRelayError("re-funding a used burner", { kind: "gas", to: perpSession.burner.address }, /already funded|brand-new/);
  await expectRelayError("gas to an existing wallet", { kind: "gas", to: mainAddr }, /brand-new/);

  // A root change while proving makes the proof stale: the relayer answers 409 instead of wasting gas.
  const bumpRoot = async () => {
    const { asp } = await fetchPoolState(env);
    await depositToPool(main, AUSD, parseUnits("100", 6), keys, env);
    while ((await fetchPoolState(env)).asp.root === asp.root) await new Promise((r) => setTimeout(r, 1000));
  };
  let bump: Promise<void> = Promise.resolve();
  const staleReq = await proveWithdrawal(keys, AUSD, parseUnits("10", 6), freshAddress(), env, () => (bump = bumpRoot()));
  await bump;
  await expectRelayError("stale ASP root", { kind: "withdraw", ...staleReq }, /state changed/, STALE_STATUS);

  // Root posts are throttled to one per interval; let it lapse so this bump lands while the proof is still running.
  await new Promise((r) => setTimeout(r, 16_000));
  let proofRuns = 0;
  const t1 = Date.now();
  const retryTo = freshAddress();
  const retried = await withdrawToAddress(keys, AUSD, parseUnits("10", 6), retryTo, () => { if (++proofRuns === 1) bump = bumpRoot(); }, env);
  await bump;
  assert.equal(proofRuns, 2, "client must re-prove exactly once after a 409");
  assert.equal(await erc20Balance(AUSD, retryTo), parseUnits("10", 6));
  log(`✓ stale root: client re-proved once and the retry succeeded (${seconds(t1)}s, tx ${retried.hash.slice(0, 10)}…)`);

  const recipient = freshAddress();
  const proofTimer = Date.now();
  const req = await proveWithdrawal(keys, AUSD, parseUnits("10", 6), recipient, env);
  log(`proof generated in ${seconds(proofTimer)}s`);
  const withData = (data: Hex, processooor: Address = req.withdrawal.processooor): RelayRequest => ({ kind: "withdraw", ...req, withdrawal: { processooor, data } });
  await expectRelayError("recipient changed after proving (context mismatch)", withData(relayData(freshAddress(), RELAYER_ADDRESS, 0n)), /ContextMismatch/);
  await expectRelayError("nonzero relayFeeBPS", withData(relayData(recipient, RELAYER_ADDRESS, 5n)), /fee must be zero/i);
  await expectRelayError("feeRecipient other than the relayer", withData(relayData(recipient, mainAddr, 0n)), /fee recipient/i);
  await expectRelayError("processooor other than the Entrypoint", withData(req.withdrawal.data, mainAddr), /Entrypoint/);
  await expectRelayError("unknown scope", { kind: "withdraw", ...req, scope: "123456789" }, /Unknown pool/);
  assert.equal(await erc20Balance(AUSD, recipient), 0n);
  await relay({ kind: "withdraw", ...req }, RELAY);
  assert.equal(await erc20Balance(AUSD, recipient), parseUnits("10", 6));
  log("✓ the untampered proof still relays after all rejections (10 AUSD received)");
  await expectRelayError("replay of a spent proof", { kind: "withdraw", ...req }, /NullifierAlreadySpent/);

  const notes = (await loadAccount(keys, env)).notes.AUSD.filter((n) => n.approved);
  const total = notes.reduce((s, n) => s + n.value, 0n);
  await assert.rejects(withdrawToAddress(keys, AUSD, total + 1n, freshAddress(), undefined, env), /No single private note covers/);
  log(`✓ overdraw refused client-side: no single note covers ${fmt(total + 1n)} (notes ${notes.map((n) => fmt(n.value)).join(" + ")})`);

  console.log("\n6. Withdraw to an arbitrary address");
  const dest = freshAddress();
  const beforeWithdraw = await settledBalance(AUSD, keys);
  const t2 = Date.now();
  await withdrawToAddress(keys, AUSD, parseUnits("25", 6), dest, undefined, env);
  assert.equal(await erc20Balance(AUSD, dest), parseUnits("25", 6));
  assert.equal(await settledBalance(AUSD, keys), beforeWithdraw - parseUnits("25", 6));
  log(`✓ 25 AUSD withdrawn to ${dest} from the private balance in ${seconds(t2)}s`);

  console.log("\n7. Exit with dust below the pool minimum");
  const dustBurner = createBurner();
  const dustSession = { burner: dustBurner, venue: "perpl" as const, bucket: 0, startedAt: Date.now() };
  noteFunded(dustBurner.address, BigInt((await relay({ kind: "gas", to: dustBurner.address }, RELAY)).block));
  await write(main, { address: AUSD, abi: erc20Abi, functionName: "transfer", args: [dustBurner.address, parseUnits("0.5", 6)] });
  const beforeDust = await settledBalance(AUSD, keys);
  assert.equal(await exitStealth({ session: dustSession, keys, poolEnv: env, perpMarkets: markets }), 0n);
  assert.equal(await settledBalance(AUSD, keys), beforeDust);
  log("✓ a 0.5 AUSD leftover is below the Entrypoint minimum: the exit still completes and returns 0");

  console.log("\nAll end-to-end checks passed ✅");
}

main_().catch((e) => {
  console.error("\n❌ E2E failed:", e);
  process.exit(1);
});
