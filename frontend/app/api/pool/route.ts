import { connection } from "next/server";
import { ENTRYPOINT, IS_FORK } from "@/lib/config";
import type { PoolApiResponse } from "@/lib/poolState";
import { poolState } from "@/lib/server/poolCache";
import { allow, clientIp } from "@/lib/server/rateLimit";

const MAX_REQUESTS_PER_MINUTE = 60;
const CACHE_CONTROL = "private, max-age=2";

/** Changes exactly when the block, the ASP root or any event count does. */
function etagOf(state: PoolApiResponse): string {
  const counts = Object.values(state.pools).map((p) => `${p.leaves.length}.${p.deposits.length}.${p.withdrawals.length}.${p.ragequits.length}`);
  return `"${state.block}-${state.asp.root}-${state.asp.labels.length}-${counts.join("-")}"`;
}

// Public pool state for the browser, which can't scan Monad itself (eth_getLogs is capped at 100 blocks).
// Serving it also runs the ASP postman, so every poll approves new deposits.
export async function GET(request: Request) {
  await connection();
  // A local fork has no abuse to guard against, and the e2e suite polls in tight loops.
  if (!IS_FORK && !allow(`pool:${clientIp(request)}`, MAX_REQUESTS_PER_MINUTE, 60_000)) {
    return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }
  try {
    if (/^0x0+$/.test(ENTRYPOINT)) throw new Error("not deployed");
    const state = await poolState();
    const etag = etagOf(state);
    const headers = { ETag: etag, "Cache-Control": CACHE_CONTROL };
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    return Response.json(state, { headers });
  } catch (e) {
    console.error("pool state failed:", e instanceof Error ? e.message.split("\n")[0].slice(0, 200) : "unknown");
    return Response.json({ error: "Pool data is unavailable right now." }, { status: 502 });
  }
}
