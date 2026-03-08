import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { withMetrics } from "@/lib/with-metrics";
import { buildAuthUrl } from "@/lib/services/google-calendar";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("GoogleCalConnect");

async function handleGET() {
  try {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
      return NextResponse.json(
        { error: "Google Calendar integration is not configured" },
        { status: 400 },
      );
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await checkRateLimit(
      String(user.id),
      RATE_LIMITS.googleCalOAuth,
    );
    if (rl) return rl;

    const url = buildAuthUrl(user.id, user.companyId);
    return NextResponse.json({ url });
  } catch (error) {
    log.error("Failed to build auth URL", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to initiate Google connection" },
      { status: 500 },
    );
  }
}

export const GET = withMetrics(
  "/api/integrations/google/calendar/connect",
  handleGET,
);
