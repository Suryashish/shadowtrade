import type { Address, Hash } from "viem";
import type { Venue } from "./config";
import type { SolidityProof, WithdrawalData } from "./notes";

export type RelayRequest = { kind: "gas"; to: Address } | { kind: "withdraw"; venue: Venue; withdrawal: WithdrawalData; proof: SolidityProof };

export type RelayResponse = { hash: Hash; block: string };

/** Base URL lets the Node test harness call the relayer; the browser uses same-origin. */
export async function relay(req: RelayRequest, baseUrl = ""): Promise<RelayResponse> {
  const res = await fetch(`${baseUrl}/api/relay`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  const body = (await res.json()) as RelayResponse | { error: string };
  if (!res.ok || "error" in body) throw new Error("error" in body ? body.error : "The relayer is unavailable.");
  return body;
}
