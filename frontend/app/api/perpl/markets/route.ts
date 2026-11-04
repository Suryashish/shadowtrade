import { cacheLife } from "next/cache";
import { PERPL_CONTEXT_URL, toPerpMarkets, type PerplContext } from "@/lib/perpl";

// Perpl's API doesn't send CORS headers, so the browser reads market metadata through here.
// Only static config is used from it; live prices are always read on-chain.
async function loadMarkets() {
  "use cache";
  cacheLife("minutes");
  const res = await fetch(PERPL_CONTEXT_URL);
  if (!res.ok) throw new Error(`Perpl API returned ${res.status}`);
  return toPerpMarkets((await res.json()) as PerplContext);
}

export async function GET() {
  try {
    return Response.json(await loadMarkets());
  } catch {
    return Response.json({ error: "Perpl market data is unavailable right now." }, { status: 502 });
  }
}
