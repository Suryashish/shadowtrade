import type { Address } from "viem";

// Wire format of GET /api/pool. Field elements are decimal strings because JSON has no bigint.
export type DepositRecord = { depositor: Address; commitment: string; label: string; value: string; precommitment: string };
export type WithdrawalRecord = { spentNullifier: string; withdrawn: string; newCommitment: string };
export type RagequitRecord = { label: string };

export type PoolSnapshot = {
  leaves: string[];
  deposits: DepositRecord[];
  withdrawals: WithdrawalRecord[];
  ragequits: RagequitRecord[];
};

export type PoolApiResponse = {
  /** Root currently accepted by the Entrypoint, and the approved labels in tree order. */
  asp: { root: string; labels: string[] };
  pools: Record<string, PoolSnapshot>;
  block: string;
};
