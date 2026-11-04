import { createWalletClient, http, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet, SERVER_RPC_URL } from "./config";

/** The single server key: drips burner gas, relays withdrawals and posts ASP roots. */
export function relayerWallet() {
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key || !isHex(key)) throw new Error("Relayer is not configured.");
  return createWalletClient({ account: privateKeyToAccount(key), chain: monadTestnet, transport: http(SERVER_RPC_URL) });
}

let queue: Promise<unknown> = Promise.resolve();

/** One key: serialize sends so nonces and Monad's per-sender pacing stay correct. */
export function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}
