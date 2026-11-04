import { cacheLife } from "next/cache";
import { PERPL } from "@/lib/config";

// Perpl's REST API has no CORS headers. This proxies its public market-data endpoints only,
// with a short shared cache so many viewers don't multiply upstream requests.
const ALLOWED = /^(ticker|\d+\/ticker|\d+\/book|\d+\/candles\/\d+\/\d+-\d+)$/;

async function fetchUpstream(path: string) {
  "use cache";
  cacheLife("seconds");
  const res = await fetch(`${PERPL.api}/v1/market-data/${path}`);
  if (!res.ok) throw new Error(`Perpl API returned ${res.status}`);
  return (await res.json()) as unknown;
}

export async function GET(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  if (!ALLOWED.test(joined)) return Response.json({ error: "Unknown market-data path." }, { status: 404 });
  const levels = new URL(request.url).searchParams.get("levels");
  const upstream = levels && /^\d{1,3}$/.test(levels) ? `${joined}?levels=${levels}` : joined;
  try {
    return Response.json(await fetchUpstream(upstream));
  } catch {
    return Response.json({ error: "Perpl market data is unavailable right now." }, { status: 502 });
  }
}
