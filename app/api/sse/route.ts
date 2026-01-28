import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis"; // Using the subscriber instance setup would be better but reusing logic is fine for now

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return new NextResponse("Missing userId", { status: 400 });
  }

  const encoder = new TextEncoder();

  // Create a dedicated subscriber client for this connection
  // We cannot reuse the global one for blocking subscription operations in a unique stream per user effectively
  // or we need a cleaner way.
  // Standard pattern: Create a new connection for subscription to avoid blocking other ops if sharing clients.
  // BUT: Vercel serverless has limits.
  // Optimization: In a real heavy prod, you'd use a shared subscriber process or Ably.
  // Since we are strictly asked for Redis on Vercel:
  // We MUST create a new redis client for this subscription or use a multiplexer.
  // Let's create a specialized duplicate for this request to ensure isolation.
  const subscriber = redis.duplicate();
  // Prevent crash on connection error (common when closing)
  subscriber.on("error", (err) => {
    // console.error("Redis Subscriber Error (Ignored):", err);
  });

  const stream = new ReadableStream({
    async start(controller) {
      // 1. Connect and Subscribe
      await subscriber.subscribe(
        `user:${userId}:notifications`,
        `user:${userId}:chat`,
      );

      // Wrapper to safely write to controller
      const safeEnqueue = (data: string) => {
        if (req.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(data));
        } catch (e) {
          // Controller might be closed
          // console.error("SSE Controller closed", e);
        }
      };

      // 2. Handle messages
      subscriber.on("message", (channel, message) => {
        if (req.signal.aborted) {
          // Ensure we quit if we get message after abort but before cleanup listener fired
          subscriber.quit();
          return;
        }

        const data = JSON.stringify({
          channel,
          data: JSON.parse(message),
        });

        // SSE formatting: "data: ... \n\n"
        safeEnqueue(`data: ${data}\n\n`);
      });

      // Keep alive heartbeat
      const interval = setInterval(() => {
        if (req.signal.aborted) {
          clearInterval(interval);
          return;
        }
        safeEnqueue(":keepalive\n\n");
      }, 15000);

      // 3. Cleanup on close
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        subscriber.quit();
      });
    },
    cancel() {
      subscriber.quit();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
