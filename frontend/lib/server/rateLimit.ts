// Best-effort sliding-window limits. State is per server instance (lost on restart / not shared
// across serverless instances), so callers keep on-chain backstops for anything that costs funds.
const MAX_WINDOW_MS = 10 * 60_000;
const hits = new Map<string, number[]>();

/** Records a hit and returns true while `bucket` is under `limit` within `windowMs`; a refused hit is not recorded. */
export function allow(bucket: string, limit: number, windowMs = MAX_WINDOW_MS): boolean {
  const now = Date.now();
  const recent = (hits.get(bucket) ?? []).filter((t) => now - t < windowMs);
  const ok = recent.length < limit;
  if (ok) recent.push(now);
  hits.set(bucket, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= MAX_WINDOW_MS)) hits.delete(k);
  return ok;
}

/**
 * Forwarding headers are client-controlled unless a trusted proxy appends them. TRUSTED_PROXY_HOPS is the number of
 * proxies in front of the app: the client is then the Nth entry from the right of x-forwarded-for. With 0 (default)
 * headers are ignored and all callers share one bucket, which is safe but coarse.
 */
export function clientIp(request: Request): string {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 0);
  if (!Number.isInteger(hops) || hops < 1) return "unknown";
  const chain = request.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return chain[chain.length - hops] ?? request.headers.get("x-real-ip") ?? "unknown";
}
