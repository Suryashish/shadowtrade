import { cacheLife } from "next/cache";

// Kuru's REST API has no CORS headers. This proxies its public per-market data endpoints only
// (market, candles, trades), with a short shared cache so many viewers don't multiply upstream requests.
const UPSTREAM = "https://api.testnet.kuru.io/api/v1/markets";
const ALLOWED = /^0x[0-9a-fA-F]{40}(\/(candles|trades))?$/;
const INTERVAL = /^(1m|5m|1h|1d)$/;
const DIGITS = /^\d{1,12}$/;

async function fetchUpstream(url: string) {
  "use cache";
  cacheLife("seconds");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kuru API returned ${res.status}`);
  return (await res.json()) as unknown;
}

export async function GET(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  if (!ALLOWED.test(joined)) return Response.json({ error: "Unknown market-data path." }, { status: 404 });
  const query = new URL(request.url).searchParams;
  const forwarded = new URLSearchParams();
  const interval = query.get("interval");
  const from = query.get("from");
  const limit = query.get("limit");
  if (interval && INTERVAL.test(interval)) forwarded.set("interval", interval);
  if (from && DIGITS.test(from)) forwarded.set("from", from);
  if (limit && DIGITS.test(limit)) forwarded.set("limit", limit);
  const qs = forwarded.toString();
  try {
    return Response.json(await fetchUpstream(`${UPSTREAM}/${joined.toLowerCase()}${qs ? `?${qs}` : ""}`));
  } catch {
    return Response.json({ error: "Kuru market data is unavailable right now." }, { status: 502 });
  }
}
