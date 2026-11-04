import { formatUnits } from "viem";

export function formatToken(value: bigint, decimals = 6, maxFraction = 2) {
  return Number(formatUnits(value, decimals)).toLocaleString(undefined, { maximumFractionDigits: maxFraction });
}

export function formatUsd(value: number, maxFraction = 2) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: maxFraction });
}

export function formatPrice(value: number) {
  const digits = value >= 1000 ? 1 : value >= 1 ? 2 : 5;
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
