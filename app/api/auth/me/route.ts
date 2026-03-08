import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("AuthMe");

async function handleGET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const rl = await checkRateLimit(String(user.id), RATE_LIMITS.api);
    if (rl) return rl;

    return NextResponse.json(user);
  } catch (error) {
    log.error("Failed to fetch current user", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const GET = withMetrics("/api/auth/me", handleGET);
