// Safety-exit check against a local fork (scripts/fork.sh + fork-setup.sh) and the running Next.js ASP.
// The main wallet must be in the server's ASP_DENYLIST, so its deposit is never approved.
// Usage: tsx --env-file=.env.local scripts/ragequit-check.ts
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createWalletClient, erc20Abi, formatUnits, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { publicClient } from "../lib/chain";
import { monadTestnet, RPC_URL, TOKENS } from "../lib/config";
import { privacyKeysFromSignature, shadowKeyMessage } from "../lib/keys";
import { balancesOf, depositToPool, fetchPoolState, loadAccount, type PoolEnv } from "../lib/pool";
import { loadPendingNotes, ragequit } from "../lib/ragequit";

const RELAY = process.env.RELAY_URL ?? "http://localhost:3000";
// Drive-less file URL: the SDK's Node loader reads URL.pathname, which breaks on "file:///C:/...".
const circuitsUrl = pathToFileURL(`${resolve("public")}/`).href.replace(/^file:\/\/\/[A-Za-z]:/, "file://");
const env: PoolEnv = { apiBase: RELAY, circuits: { browser: false, baseUrl: circuitsUrl } };
// anvil dev accounts #1 (the denylisted depositor) and #2 (a stranger)
const DEPOSITOR_KEY = process.env.NEXT_PUBLIC_DEV_WALLET_KEY as `0x${string}`;
const STRANGER_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const ASP_INTERVAL_MS = 20_000;

assert.ok(RPC_URL.includes("127.0.0.1"), "must run against the local fork (NEXT_PUBLIC_RPC_URL)");
assert.ok(DEPOSITOR_KEY, "NEXT_PUBLIC_DEV_WALLET_KEY must be set");

const wallet = (key: `0x${string}`) => createWalletClient({ account: privateKeyToAccount(key), chain: monadTestnet, transport: http(RPC_URL) });
const depositor = wallet(DEPOSITOR_KEY);
const stranger = wallet(STRANGER_KEY);
const token = TOKENS.perpl;
const amount = parseUnits("1000", token.decimals);
const log = (msg: string) => console.log(`  ${msg}`);
const balanceOf = (owner: `0x${string}`) => publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
const fmt = (v: bigint) => formatUnits(v, token.decimals);

async function main() {
  const addr = depositor.account.address;
  const keys = await privacyKeysFromSignature(await depositor.signMessage({ message: shadowKeyMessage(addr) }));
  const startPending = (await loadPendingNotes(keys, addr, env)).length;

  console.log("1. Deposit from a denylisted wallet");
  const beforeDeposit = await balanceOf(addr);
  await depositToPool(depositor, token.address, amount, keys, env);
  assert.equal(await balanceOf(addr), beforeDeposit - amount);
  await new Promise((r) => setTimeout(r, ASP_INTERVAL_MS));
  const { spendable, pending } = balancesOf(await loadAccount(keys, env), token.address);
  assert.equal(spendable, 0n, "a denylisted deposit must not become spendable");
  assert.equal(pending, amount * BigInt(startPending + 1));
  log(`✓ stays pending after one ASP interval (pending ${fmt(pending)}, spendable ${fmt(spendable)})`);

  const notes = await loadPendingNotes(keys, addr, env);
  assert.equal(notes.length, startPending + 1);
  const note = notes[notes.length - 1];
  assert.equal(note.value, amount);
  log("✓ listed as a pending note owned by the depositing wallet");

  console.log("\n2. Only the original depositor can exit");
  await assert.rejects(ragequit(stranger, note, env), /OnlyOriginalDepositor/);
  log("✓ a different wallet is rejected with OnlyOriginalDepositor");
  assert.equal((await loadPendingNotes(keys, addr, env)).length, startPending + 1);

  console.log("\n3. Ragequit");
  const beforeExit = await balanceOf(addr);
  const t0 = Date.now();
  await ragequit(depositor, note, env, (stage) => log(`stage: ${stage}`));
  assert.equal((await balanceOf(addr)) - beforeExit, amount);
  log(`✓ ${fmt(amount)} ${token.symbol} returned to the depositing wallet in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const ragequits = (await fetchPoolState(env)).pools.AUSD.ragequits;
  assert.ok(ragequits.some((r) => r.label === note.label.toString()));
  const after = await loadPendingNotes(keys, addr, env);
  assert.equal(after.length, startPending);
  assert.ok(!after.some((n) => n.label === note.label));
  log("✓ the note is no longer listed");
  await assert.rejects(ragequit(depositor, note, env), /revert|NullifierAlreadySpent|Spent/i);
  log("✓ a second ragequit of the same deposit is rejected");

  console.log("\nRagequit checks passed ✅");
}

main().catch((e) => {
  console.error("\n❌ ragequit check failed:", e);
  process.exit(1);
});
