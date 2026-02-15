import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | "error"> = { db: "error", redis: "error" };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = "ok";
  } catch {}

  try {
    await redis.ping();
    checks.redis = "ok";
  } catch {}

  const healthy = checks.db === "ok" && checks.redis === "ok";

  return Response.json(
    { status: healthy ? "ok" : "degraded", ...checks },
    { status: healthy ? 200 : 503 },
  );
}
