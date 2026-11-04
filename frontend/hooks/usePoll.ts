"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Polls an async loader; keeps the last good value on transient errors. Pass null to pause.
 * Data is scoped to `key`, so switching e.g. markets never shows the previous market's values.
 */
export function usePoll<T>(load: (() => Promise<T>) | null, intervalMs: number, key = "") {
  const [state, setState] = useState<{ key: string; data: T } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  });

  const refresh = useCallback(async () => {
    const current = loadRef.current;
    if (!current) return;
    try {
      const data = await current();
      setState({ key, data });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load data.");
    }
  }, [key]);

  const enabled = load !== null;
  useEffect(() => {
    if (!enabled) return;
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, refresh]);

  return { data: enabled && state?.key === key ? state.data : null, error, refresh };
}
