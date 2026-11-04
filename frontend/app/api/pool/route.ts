import { isPoolVenue } from "@/lib/config";
import { encodePoolState } from "@/lib/notes";
import { poolState } from "@/lib/poolIndex.server";

/** Public pool history plus the ASP's approved label set. Syncing also approves new deposits. */
export async function GET(request: Request) {
  const venue = new URL(request.url).searchParams.get("venue");
  if (!isPoolVenue(venue)) return Response.json({ error: "Unknown venue." }, { status: 400 });
  try {
    return new Response(encodePoolState(await poolState(venue)), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (e) {
    console.error("pool sync failed:", e instanceof Error ? e.name : "unknown");
    return Response.json({ error: "Couldn't read the privacy pool. Try again." }, { status: 503 });
  }
}
