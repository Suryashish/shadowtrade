import type { Address, Hash } from "viem";
import type { WithdrawRequest } from "./pool";

export type RelayRequest = { kind: "gas"; to: Address } | ({ kind: "withdraw" } & WithdrawRequest);

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
