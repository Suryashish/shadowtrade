"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePoll } from "./usePoll";
import type { ShadowTrade } from "./useShadowTrade";
import { poolForToken, TOKENS, type Venue } from "@/lib/config";
import { formatToken } from "@/lib/format";
import { loadPendingNotes, ragequit, type PendingNote } from "@/lib/ragequit";

/** The ASP posts a new root every ~15s, so anything pending longer than this is not just waiting for a batch. */
const PENDING_THRESHOLD_MS = 45_000;
const POLL_MS = 8000;

/** Deposits from the connected wallet that the ASP has not approved, with a public exit back to that wallet. */
export function useRagequit(app: ShadowTrade, venue: Venue) {
  const { wallet, keys, run } = app;
  const address = wallet?.account?.address ?? null;
  const symbol = poolForToken(TOKENS[venue].address).symbol;
  const firstSeen = useRef(new Map<string, number>());
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!address || !keys) return [];
    const notes = await loadPendingNotes(keys, address);
    const seen = new Map(notes.map((n) => [n.label.toString(), firstSeen.current.get(n.label.toString()) ?? Date.now()]));
    firstSeen.current = seen;
    return notes.map((note) => ({ note, since: seen.get(note.label.toString()) ?? Date.now() }));
  }, [address, keys]);
  const poll = usePoll(address && keys ? load : null, POLL_MS, address ?? "");

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const stuck = (poll.data ?? []).filter((p) => p.note.pool.symbol === symbol && now - p.since >= PENDING_THRESHOLD_MS).map((p) => p.note);

  const exit = useCallback(
    (note: PendingNote) =>
      run(async (onStep) => {
        if (!wallet) throw new Error("Connect your wallet first.");
        const token = TOKENS[venue];
        await ragequit(wallet, note, {}, (stage) =>
          onStep({ index: stage === "proving" ? 1 : 2, total: 2, label: stage === "proving" ? "Generating proof" : "Returning funds" }),
        );
        poll.refresh().catch(() => undefined);
        return `Returned ${formatToken(note.value, token.decimals)} ${token.symbol} to your wallet.`;
      }),
    [run, wallet, venue, poll],
  );

  return { stuck, exit };
}
