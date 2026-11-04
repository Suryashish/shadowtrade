// End-to-end test of the full stealth loop on 0xbow Privacy Pools, against a local fork
// (scripts/fork.sh + fork-setup.sh + contracts deployed) and the running Next.js app (relayer, ASP,
// circuit artifacts). Usage: pnpm e2e
import assert from "node:assert/strict";
import { Circuits, PrivacyPoolSDK } from "@0xbow/privacy-pools-core-sdk";
import { createWalletClient, erc20Abi, formatUnits, http, isAddressEqual, parseAbiItem, parseUnits, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { publicClient } from "../lib/chain";
import { monadTestnet, PRIVACY_POOLS, RELAYER_ADDRESS, RPC_URL, SPOT_MARKETS, TOKENS, VENUES } from "../lib/config";
import { masterKeysFromSignature, shadowKeyMessage } from "../lib/keys";
import * as kuru from "../lib/kuru";
import { planWithdrawal, proveWithdrawal, recoverNotes, relayWithdrawal } from "../lib/notes";
import * as perpl from "../lib/perpl";
import { depositToPool, fetchPoolState, privateBalance, withdrawFromPool } from "../lib/pool";
import { relay } from "../lib/relay";
import { ensureExitGas, enterStealth, exitStealth } from "../lib/session";

const RELAY = process.env.RELAY_URL ?? "http://localhost:3000";
// anvil's default account #0, funded by fork-setup.sh
const MAIN_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

assert.ok(RPC_URL.includes("127.0.0.1"), "e2e must run against the local fork (NEXT_PUBLIC_RPC_URL)");

const main = createWalletClient({ account: privateKeyToAccount(MAIN_KEY), chain: monadTestnet, transport: http(RPC_URL) });
const mainAddr = main.account.address;
const log = (msg: string) => console.log(`  ${msg}`);
const fmt = (v: bigint) => Number(formatUnits(v, 6)).toLocaleString();
const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const erc20 = (token: Address, owner: Address) => publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });

async function anvil(method: string, params: unknown[]) {
  const res = await fetch(RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const body = (await res.json()) as { error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
}

async function expectRelayError(label: string, req: Parameters<typeof relay>[0], pattern: RegExp) {
  await assert.rejects(relay(req, RELAY), pattern, label);
  log(`✓ rejected: ${label}`);
}

/** Token transfers between two addresses in the last `span` blocks (RPCs cap log ranges at 100 blocks). */
async function transfers(token: Address, from: Address | undefined, to: Address, span = 600n) {
  const head = await publicClient.getBlockNumber();
  const found = [];
  for (let start = head - span; start <= head; start += 100n) {
    const end = start + 99n > head ? head : start + 99n;
    found.push(...(await publicClient.getLogs({ address: token, event: transfer, args: { from, to }, fromBlock: start, toBlock: end })));
  }
  return found;
}

async function main_() {
  const signature = await main.signMessage({ message: shadowKeyMessage(mainAddr) });
  const keys = masterKeysFromSignature(signature);
  const again = masterKeysFromSignature(await main.signMessage({ message: shadowKeyMessage(mainAddr) }));
  assert.deepEqual(keys, again, "master keys must be deterministic");
  console.log(`main ${mainAddr}\nentrypoint ${PRIVACY_POOLS.entrypoint}`);

  console.log("\n1. Deposit into private balance (0xbow Privacy Pools)");
  for (const venue of VENUES) {
    const t = TOKENS[venue];
    const before = await privateBalance(keys, venue, RELAY);
    await depositToPool(main, keys, venue, parseUnits("5000", 6), RELAY);
    const after = await privateBalance(keys, venue, RELAY);
    assert.equal(after.spendable, before.spendable + parseUnits("5000", 6), "deposit must be approved by the ASP and spendable");
    assert.equal(after.pending, 0n);
    log(`✓ ${t.symbol} private balance ${fmt(after.spendable)} (ASP approved)`);
  }
  const stranger = masterKeysFromSignature(await privateKeyToAccount(generatePrivateKey()).signMessage({ message: "other" }));
  assert.equal((await privateBalance(stranger, "perpl", RELAY)).spendable, 0n);
  log("✓ another user's keys see none of these notes");

  console.log("\n2. Perps session on Perpl (burner funded by a ZK withdrawal)");
  const markets = await perpl.fetchPerpMarkets();
  const eth = markets.find((m) => m.symbol === "ETH")!;
  const btc = markets.find((m) => m.symbol === "BTC")!;
  const t0 = Date.now();
  const perpSession = await enterStealth({ keys, venue: "perpl", bucket: 1000, relayBase: RELAY, onStep: (s) => log(`[${s.index}/${s.total}] ${s.label}`) });
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
  log(`✓ ETH long ${Number(ethLots) / 10 ** eth.sizeDecimals} @ ${entry}, est. liq ${liq.toFixed(2)}`);

  const btcMark = await perpl.getMarkPrice(btc.id);
  const btcLots = perpl.lotsFor(btc, parseUnits("200", 6), 3, btcMark);
  await perpl.openPosition(perpSession.burner.wallet, btc, "short", btcLots, 3);
  const btcPos = await perpl.getPosition(btc.id, account!.id);
  assert.equal(btcPos?.side, "short");
  log(`✓ BTC short ${Number(btcLots) / 10 ** btc.sizeDecimals}`);

  // The burner's single gas drip must always cover its exit; new positions are refused before that.
  const burnerGas = await publicClient.getBalance({ address: perpSession.burner.address });
  const setBalance = (value: bigint) => anvil("anvil_setBalance", [perpSession.burner.address, `0x${value.toString(16)}`]);
  await setBalance(1_000_000_000_000n);
  await assert.rejects(ensureExitGas(perpSession, markets), /LowBurnerGas/);
  await setBalance(burnerGas);
  await ensureExitGas(perpSession, markets);
  log("✓ refuses a new position once the burner's gas only covers its exit");

  const beforeExit = (await privateBalance(keys, "perpl", RELAY)).spendable;
  const returned = await exitStealth({ session: perpSession, keys, perpMarkets: markets, relayBase: RELAY, onStep: (s) => log(`[${s.index}/${s.total}] ${s.label}`) });
  assert.equal(await perpl.getPosition(eth.id, account!.id), null);
  assert.equal(await perpl.getPosition(btc.id, account!.id), null);
  assert.equal((await privateBalance(keys, "perpl", RELAY)).spendable, beforeExit + returned, "exit deposit must land as a spendable note");
  assert.ok(returned > parseUnits("990", 6), `returned ${fmt(returned)} should be ~1000 minus fees`);
  log(`✓ returned ${fmt(returned)} AUSD to private balance`);

  const sessions = [perpSession];
  if (VENUES.includes("kuru")) {
    console.log("\n3. Spot session on Kuru");
    const weth = SPOT_MARKETS[0];
    const spot = await enterStealth({ keys, venue: "kuru", bucket: 500, relayBase: RELAY });
    const q = await kuru.swap(spot.burner.wallet, weth, true, parseUnits("40", 6));
    const id = await kuru.accountId(spot.burner.address);
    assert.ok((await kuru.balanceOf(id, weth.baseToken)) > 0n);
    log(`✓ bought ${formatUnits(q.amountOut, 18)} WETH for 40 USDC`);
    await assert.rejects(kuru.swap(spot.burner.wallet, weth, false, parseUnits("1000", 18)), /Not enough buyers|more than 2%/);
    log("✓ refused a sell deeper than the order book");
    const spotBack = await exitStealth({ session: spot, keys, perpMarkets: [], relayBase: RELAY });
    assert.equal(await kuru.balanceOf(id, weth.baseToken), 0n);
    assert.ok(spotBack > parseUnits("495", 6));
    log(`✓ sold back, returned ${fmt(spotBack)} USDC to private balance`);
    sessions.push(spot);
  } else {
    console.log("\n3. Kuru spot is disabled (NEXT_PUBLIC_ENABLE_KURU), skipped");
  }

  console.log("\n4. Privacy invariants");
  for (const [burner, token] of sessions.map((s) => [s.burner.address, TOKENS[s.venue].address] as const)) {
    assert.equal((await transfers(token, mainAddr, burner)).length, 0, "main wallet must never pay a burner");
    const funding = await transfers(token, undefined, burner);
    assert.ok(isAddressEqual(funding[0].args.from!, PRIVACY_POOLS.entrypoint), "burner must be funded by the pool's Entrypoint");
    const tx = await publicClient.getTransaction({ hash: funding[0].transactionHash! });
    assert.ok(isAddressEqual(tx.from, RELAYER_ADDRESS), "the funding withdrawal must be sent by the relayer, not the user");
  }
  log("✓ burners funded by the Entrypoint via relayer-sent ZK withdrawals; no transfers from the main wallet");

  console.log("\n5. Private withdrawal to a fresh address, and recovery from chain data");
  const fresh = privateKeyToAccount(generatePrivateKey()).address;
  const beforeOut = (await privateBalance(keys, "perpl", RELAY)).spendable;
  await withdrawFromPool({ keys, venue: "perpl", amount: parseUnits("10", 6), recipient: fresh, base: RELAY });
  assert.equal(await erc20(TOKENS.perpl.address, fresh), parseUnits("10", 6));
  assert.equal((await privateBalance(keys, "perpl", RELAY)).spendable, beforeOut - parseUnits("10", 6));
  log(`✓ ${fresh} received 10 AUSD; the private balance followed the change note`);
  const recovered = recoverNotes(masterKeysFromSignature(signature), await fetchPoolState("perpl", RELAY));
  assert.ok(recovered.notes.length >= 2 && recovered.nextDepositIndex >= 2n);
  log(`✓ ${recovered.notes.length} notes rebuilt from public events with only the wallet signature`);

  console.log("\n6. Relayer and pool abuse checks");
  await expectRelayError("re-funding a used burner", { kind: "gas", to: perpSession.burner.address }, /already funded|brand-new/);
  await expectRelayError("gas to an existing wallet", { kind: "gas", to: mainAddr }, /brand-new/);

  const prover = new PrivacyPoolSDK(new Circuits({ browser: true, baseUrl: `${RELAY}/` }));
  const state = await fetchPoolState("perpl", RELAY);
  const [{ note }] = planWithdrawal(recoverNotes(keys, state).notes, parseUnits("5", 6));
  const toFresh = relayWithdrawal(PRIVACY_POOLS.entrypoint, fresh, RELAYER_ADDRESS);
  const proof = await proveWithdrawal(prover, keys, state, note, parseUnits("5", 6), toFresh);
  const toAttacker = relayWithdrawal(PRIVACY_POOLS.entrypoint, mainAddr, RELAYER_ADDRESS);
  await expectRelayError("redirected recipient", { kind: "withdraw", venue: "perpl", withdrawal: toAttacker, proof }, /ContextMismatch/);
  await expectRelayError("non-zero relay fee", { kind: "withdraw", venue: "perpl", withdrawal: { ...toFresh, data: toFresh.data.replace(/0{4}$/, "0064") as typeof toFresh.data }, proof }, /no fee/);
  await expectRelayError("processooor not the Entrypoint", { kind: "withdraw", venue: "perpl", withdrawal: { ...toFresh, processooor: mainAddr }, proof }, /Invalid withdrawal/);
  const forged = { ...proof, pA: [proof.pA[1], proof.pA[0]] as typeof proof.pA };
  await expectRelayError("forged proof", { kind: "withdraw", venue: "perpl", withdrawal: toFresh, proof: forged }, /InvalidProof|reverted/);
  await relay({ kind: "withdraw", venue: "perpl", withdrawal: toFresh, proof }, RELAY);
  log("✓ the untampered proof relays");
  await expectRelayError("double spend (replayed proof)", { kind: "withdraw", venue: "perpl", withdrawal: toFresh, proof }, /NullifierAlreadySpent/);
  await assert.rejects(withdrawFromPool({ keys, venue: "perpl", amount: parseUnits("1000000", 6), recipient: fresh, base: RELAY }), /InsufficientBalance/);
  log("✓ rejected: overdraw");
  assert.equal(await erc20(TOKENS.perpl.address, fresh), parseUnits("15", 6));

  console.log("\n7. ASP root changes and concurrent syncs");
  const staleState = await fetchPoolState("perpl", RELAY);
  const [{ note: staleNote }] = planWithdrawal(recoverNotes(keys, staleState).notes, parseUnits("5", 6));
  const staleProof = await proveWithdrawal(prover, keys, staleState, staleNote, parseUnits("5", 6), toFresh);
  await depositToPool(main, keys, "perpl", parseUnits("100", 6), RELAY); // the ASP posts a new root
  await expectRelayError("proof against a superseded ASP root", { kind: "withdraw", venue: "perpl", withdrawal: toFresh, proof: staleProof }, /IncorrectASPRoot/);
  await withdrawFromPool({ keys, venue: "perpl", amount: parseUnits("5", 6), recipient: fresh, base: RELAY });
  assert.equal(await erc20(TOKENS.perpl.address, fresh), parseUnits("20", 6));
  log("✓ a fresh proof against the new root relays");
  const roots = await Promise.all(Array.from({ length: 6 }, () => fetchPoolState("perpl", RELAY).then((s) => s.aspRoot)));
  assert.ok(roots.every((r) => r === roots[0]), "concurrent syncs must agree on the ASP root");
  log("✓ 6 concurrent pool syncs agree on one ASP root");

  console.log("\nAll end-to-end checks passed ✅");
}

// snarkjs keeps its prover threads alive, so exit explicitly.
main_().then(() => process.exit(0), (e) => {
  console.error("\n❌ E2E failed:", e);
  process.exit(1);
});
