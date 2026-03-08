import { withMetrics } from "@/lib/with-metrics";
import { NextResponse } from "next/server";

async function handleGET() {
  return NextResponse.json(
    { error: "Endpoint removed for security reasons" },
    { status: 404 }
  );
}

export const GET = withMetrics("/api/debug/sla-status", handleGET);
