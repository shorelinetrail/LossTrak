"use client";

import { useCallback, useEffect, useRef } from "react";

interface PendingSave {
  timer: ReturnType<typeof setTimeout>;
  run: () => void;
}

/**
 * Debounces async save callbacks keyed by field, so rapid typing produces a
 * single write. Re-scheduling a key replaces its pending save with the
 * latest value. Pending saves are flushed on unmount so nothing is lost
 * when the user navigates away mid-debounce.
 */
export function useDebouncedSaves(delay = 600) {
  const pending = useRef(new Map<string, PendingSave>());

  const schedule = useCallback(
    (key: string, run: () => void) => {
      const existing = pending.current.get(key);
      if (existing) clearTimeout(existing.timer);
      const timer = setTimeout(() => {
        pending.current.delete(key);
        run();
      }, delay);
      pending.current.set(key, { timer, run });
    },
    [delay]
  );

  const flush = useCallback((key?: string) => {
    if (key !== undefined) {
      const entry = pending.current.get(key);
      if (entry) {
        clearTimeout(entry.timer);
        pending.current.delete(key);
        entry.run();
      }
      return;
    }
    for (const [, entry] of pending.current) {
      clearTimeout(entry.timer);
      entry.run();
    }
    pending.current.clear();
  }, []);

  /** Drops pending saves whose key starts with the prefix (no write). */
  const cancel = useCallback((keyPrefix: string) => {
    for (const [key, entry] of pending.current) {
      if (key.startsWith(keyPrefix)) {
        clearTimeout(entry.timer);
        pending.current.delete(key);
      }
    }
  }, []);

  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  return { schedule, flush, cancel };
}
