import { NextRequest, NextResponse } from "next/server";
import { sharedSubscriber } from "@/lib/redis-subscriber";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("SSE");

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Derive userId entirely from session — never from query params
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Rate limit SSE connections per user
  const rateLimited = await checkRateLimit(String(user.id), RATE_LIMITS.sse);
  if (rateLimited) return rateLimited;

  const userId = String(user.id);
  const companyId = String(user.companyId);

  const encoder = new TextEncoder();

  // Shared cleanup state accessible by both start() and cancel()
  let unsubscribe: (() => void) | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;

  const cleanup = () => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      // Wrapper to safely write to controller
      const safeEnqueue = (data: string) => {
        if (req.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // Controller might be closed
        }
      };

      // Subscribe via shared subscriber (single Redis connection for all SSE clients)
      // Company-prefixed channels for defense-in-depth tenant isolation
      const channels = [
        `company:${companyId}:user:${userId}:notifications`,
        `company:${companyId}:user:${userId}:chat`,
      ];

      try {
        unsubscribe = await sharedSubscriber.subscribe(
          channels,
          (channel, message) => {
            if (req.signal.aborted) return;

            const data = JSON.stringify({
              channel,
              data: JSON.parse(message),
            });

            // SSE formatting: "data: ... \n\n"
            safeEnqueue(`data: ${data}\n\n`);
          },
        );
      } catch (err) {
        log.error("Redis subscribe failed", { userId, companyId, error: String(err) });
        controller.close();
        return;
      }

      // Keep alive heartbeat
      interval = setInterval(() => {
        if (req.signal.aborted) {
          cleanup();
          return;
        }
        safeEnqueue(":keepalive\n\n");
      }, 15000);

      // Cleanup on close
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      // Safety net: if abort signal doesn't fire (e.g. forceful disconnect on Vercel)
      cleanup();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
