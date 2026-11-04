import {
  createPublicClient,
  http,
  type Abi,
  type Account,
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type Hash,
  type WalletClient,
} from "viem";
import { monadTestnet, SERVER_RPC_URL } from "./config";

// viem caches block numbers for ~4s by default, far longer than Monad's 400ms blocks; that would
// stretch every 3-block pacing wait to several seconds. The public RPC rate-limits bursts (429), so
// retry with backoff (0.3, 0.6, 1.2, 2.4, 4.8 s) rather than failing the request.
export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(SERVER_RPC_URL, { retryCount: 5, retryDelay: 300 }),
  cacheTime: 0,
  pollingInterval: 250,
});

// Monad state is visible to consensus 3 blocks late: a freshly funded account can't send until its
// funding is 3 blocks old, and accounts under the 10 MON reserve may send one tx per 3 blocks.
const MONAD_DELAY_BLOCKS = 3n;
// Monad bills the gas limit, not gas used, so pad estimates tightly instead of using flat limits.
const GAS_PADDING_PCT = 120n;

const lastTxBlock = new Map<Address, bigint>();

export function noteFunded(account: Address, block: bigint) {
  lastTxBlock.set(account, block);
}

async function waitForDelay(account: Address) {
  const last = lastTxBlock.get(account);
  if (last === undefined) return;
  while ((await publicClient.getBlockNumber()) < last + MONAD_DELAY_BLOCKS) {
    await new Promise((r) => setTimeout(r, 250));
  }
}

export type WriteParams<
  TAbi extends Abi,
  TName extends ContractFunctionName<TAbi, "nonpayable" | "payable">,
> = {
  address: Address;
  abi: TAbi;
  functionName: TName;
  args: ContractFunctionArgs<TAbi, "nonpayable" | "payable", TName>;
  value?: bigint;
};

/** Simulates, sends with a padded gas limit, and waits for a successful receipt. */
export async function write<
  const TAbi extends Abi,
  TName extends ContractFunctionName<TAbi, "nonpayable" | "payable">,
>(wallet: WalletClient, params: WriteParams<TAbi, TName>): Promise<Hash> {
  const account = wallet.account as Account;
  await waitForDelay(account.address);
  // viem's generic overloads can't be narrowed through this wrapper; params are type-checked above.
  const request = params as unknown as Parameters<typeof publicClient.simulateContract>[0];
  const { request: simulated } = await publicClient.simulateContract({ ...request, account });
  const gas = await publicClient.estimateContractGas({ ...request, account });
  const hash = await wallet.writeContract({ ...simulated, gas: (gas * GAS_PADDING_PCT) / 100n, chain: monadTestnet, account });
  return confirm(account.address, hash);
}

export async function sendValue(wallet: WalletClient, to: Address, value: bigint, maxFeePerGas?: bigint): Promise<Hash> {
  const account = wallet.account as Account;
  await waitForDelay(account.address);
  const fees = maxFeePerGas ? { maxFeePerGas, maxPriorityFeePerGas: 0n } : {};
  const hash = await wallet.sendTransaction({ to, value, gas: 21_000n, chain: monadTestnet, account, ...fees });
  return confirm(account.address, hash);
}

async function confirm(sender: Address, hash: Hash): Promise<Hash> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 250 });
  lastTxBlock.set(sender, receipt.blockNumber);
  if (receipt.status !== "success") throw new Error(`Transaction reverted (${hash})`);
  return hash;
}

export async function chainTime(): Promise<bigint> {
  return (await publicClient.getBlock()).timestamp;
}
