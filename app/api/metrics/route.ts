import { register } from "@/lib/metrics";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  const expected = `Bearer ${secret}`;

  if (
    !secret ||
    !authHeader ||
    authHeader.length !== expected.length ||
    !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const metrics = await register.metrics();
  return new Response(metrics, {
    headers: { "Content-Type": register.contentType },
  });
}
