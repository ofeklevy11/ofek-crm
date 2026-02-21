import { useCallback, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api-fetch";

const MAX_POLLS = 40;
const INITIAL_INTERVAL = 500; // ms
const MAX_INTERVAL = 3000; // ms

interface AIJobResult<T> {
  status: "completed" | "failed" | "pending" | "processing" | "not_found";
  result?: T;
  error?: string;
}

/**
 * Hook that dispatches an AI generation request (returns 202 + jobId),
 * then polls for the result until completed/failed.
 * Uses exponential backoff: 500ms -> 750ms -> 1125ms -> ... -> 3000ms cap
 */
export function useAIJob() {
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  // Cleanup on unmount - cancel any in-flight polling
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const dispatch = useCallback(async <T>(
    url: string,
    body: Record<string, any>
  ): Promise<T> => {
    // Cancel any existing poll
    cancel();
    const controller = new AbortController();
    abortRef.current = controller;

    // Step 1: Dispatch the job
    const res = await apiFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await res.json();

    if (res.status === 429) {
      throw new Error("RATE_LIMITED");
    }
    if (res.status !== 202 || !data.jobId) {
      throw new Error(data.error || "Failed to dispatch AI job");
    }

    const { jobId } = data;

    // Step 2: Poll for result with exponential backoff
    let interval = INITIAL_INTERVAL;
    let consecutive429s = 0;
    for (let i = 0; i < MAX_POLLS; i++) {
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");

      await new Promise<void>((resolve, reject) => {
        // Check if already aborted before setting up timer (B4: race fix)
        if (controller.signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        const timer = setTimeout(resolve, interval);
        controller.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      });

      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");

      const pollRes = await fetch(`/api/ai/jobs/${jobId}`, {
        signal: controller.signal,
      });

      if (!pollRes.ok) {
        if (pollRes.status === 404) {
          // Job not in Redis yet — back off and continue
          interval = Math.min(interval * 1.5, MAX_INTERVAL);
          continue;
        }
        if (pollRes.status === 429) {
          consecutive429s++;
          if (consecutive429s >= 3) {
            throw new Error("RATE_LIMITED");
          }
          interval = Math.min(interval * 1.5, MAX_INTERVAL);
          continue;
        }
        // Auth errors (401/403) or server errors — stop polling immediately
        throw new Error("Polling request failed");
      }

      consecutive429s = 0; // Reset on successful response
      const jobData: AIJobResult<T> = await pollRes.json();

      if (jobData.status === "completed" && jobData.result) {
        return jobData.result as T;
      }

      if (jobData.status === "failed") {
        throw new Error(jobData.error || "AI generation failed");
      }

      // Still pending/processing - increase interval and continue
      interval = Math.min(interval * 1.5, MAX_INTERVAL);
    }

    throw new Error("AI generation timed out");
  }, [cancel]);

  return { dispatch, cancel };
}
