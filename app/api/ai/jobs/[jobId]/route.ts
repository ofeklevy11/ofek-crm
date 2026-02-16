import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("AiJobs");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(String(user.id), RATE_LIMITS.api);
  if (rl) return rl;

  const { jobId } = await params;

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const raw = await redis.get(`ai-job:${jobId}`);

  if (!raw) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  try {
    const data = JSON.parse(raw);
    if (!data.companyId || data.companyId !== user.companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Return only necessary fields — strip companyId and sanitize error details
    return NextResponse.json({
      status: data.status,
      result: data.result,
      error: data.status === "failed" ? "AI generation failed" : undefined,
    });
  } catch (err) {
    log.error("Corrupted job data", { jobId, error: String(err) });
    return NextResponse.json({ status: "failed", error: "Corrupted job data" });
  }
}
