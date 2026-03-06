import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  const expected = `Bearer ${secret}`;
  const isAuthorized =
    secret &&
    authHeader &&
    authHeader.length === expected.length &&
    timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));

  const checks: Record<string, "ok" | "error"> = {
    db: "error",
    redis: "error",
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = "ok";
  } catch {}

  try {
    await redis.ping();
    checks.redis = "ok";
  } catch {}

  const healthy = checks.db === "ok" && checks.redis === "ok";

  if (!isAuthorized) {
    return Response.json(
      { status: healthy ? "ok" : "degraded" },
      { status: healthy ? 200 : 503 },
    );
  }

  return Response.json(
    { status: healthy ? "ok" : "degraded", ...checks },
    { status: healthy ? 200 : 503 },
  );
}
