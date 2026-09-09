import { useEffect, useState } from "react";
import { getRun } from "../api/client";
import type { Run } from "../types";

export function useRunPolling(runId: string | null, intervalMs = 2000) {
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) {
      setRun(null);
      setError(null);
      return;
    }

    let cancelled = false;

    async function poll() {
      try {
        const next = await getRun(runId!);
        if (!cancelled) {
          setRun(next);
          setError(null);
        }
        if (next.status === "queued" || next.status === "running") {
          window.setTimeout(poll, intervalMs);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [runId, intervalMs]);

  return { run, error };
}
