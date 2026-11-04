import type { Address, Hash, Hex } from "viem";

/** A Groth16 withdrawal proof as the Entrypoint expects it (pB already coordinate-swapped), decimal strings. */
export type ProofWire = { pA: [string, string]; pB: [[string, string], [string, string]]; pC: [string, string]; pubSignals: string[] };

export type WithdrawRequest = {
  scope: string;
  withdrawal: { processooor: Address; data: Hex };
  proof: ProofWire;
};

export type RelayRequest = { kind: "gas"; to: Address } | ({ kind: "withdraw" } & WithdrawRequest);

export type RelayResponse = { hash: Hash; block: string };

export class RelayFailure extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** The proof was made against a root that is no longer current; re-proving against fresh state fixes it. */
export const STALE_STATUS = 409;

/** Base URL lets the Node test harness call the relayer; the browser uses same-origin. */
export async function relay(req: RelayRequest, baseUrl = ""): Promise<RelayResponse> {
  const res = await fetch(`${baseUrl}/api/relay`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  const body = (await res.json()) as RelayResponse | { error: string };
  if (!res.ok || "error" in body) throw new RelayFailure("error" in body ? body.error : "The relayer is unavailable.", res.status);
  return body;
}
