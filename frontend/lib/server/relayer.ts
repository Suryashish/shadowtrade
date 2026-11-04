import { createWalletClient, http, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet, RPC_URL } from "@/lib/config";

export function relayerWallet() {
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key || !isHex(key)) throw new Error("Relayer is not configured.");
  return createWalletClient({ account: privateKeyToAccount(key), chain: monadTestnet, transport: http(RPC_URL) });
}

// One relayer key sends both relays and ASP root updates: serialize every send so nonces and
// Monad's per-sender pacing stay correct. Kept on globalThis because route bundles may not share modules.
const shared = globalThis as typeof globalThis & { __relayerQueue?: Promise<unknown> };

export function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const queue = shared.__relayerQueue ?? Promise.resolve();
  const run = queue.then(job, job);
  shared.__relayerQueue = run.catch(() => undefined);
  return run;
}
