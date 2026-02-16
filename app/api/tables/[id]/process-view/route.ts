import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions-server";
import { canReadTable } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { processViewServer } from "@/lib/viewProcessorServer";
import { ViewConfig } from "@/app/actions/views";
import { createLogger } from "@/lib/logger";

const log = createLogger("ProcessView");

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { id } = await params;
    const tableId = parseInt(id);
    if (isNaN(tableId)) {
      return new NextResponse("Invalid table ID", { status: 400 });
    }

    const body = await request.json();
    // Validate body config
    if (!body || typeof body !== "object") {
      return new NextResponse("Invalid config", { status: 400 });
    }

    // Support both legacy (body=config) and new ({config, viewId}) formats
    const config = (body.config || body) as ViewConfig;
    const viewId = body.viewId ? parseInt(body.viewId) : undefined;

    // Check permissions
    // First check if table exists and belongs to company
    const table = await prisma.tableMeta.findFirst({
      where: {
        id: tableId,
        companyId: user.companyId,
      },
    });

    if (!table) {
      return new NextResponse("Table not found", { status: 404 });
    }

    if (!canReadTable(user, table.id)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("force") === "true";

    // Rate Limit Logic for Force Refresh
    // Rate Limit Logic for Force Refresh
    if (forceRefresh) {
      const plan = user.isPremium || "basic";
      let limit = 3; // Basic
      if (plan === "premium") limit = 10;
      if (plan === "super") limit = 999999; // Effectively unlimited

      if (limit < 999999) {
        const windowStart = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4 hours ago

        // Check usage - specific to USER only (global limit), not per view
        try {
          if (!(prisma as any).viewRefreshLog) {
            log.warn("ViewRefreshLog model not found in Prisma Client, skipping rate limit check");
          } else {
            const usageCount = await (prisma as any).viewRefreshLog.count({
              where: {
                userId: user.id,
                // viewId: viewId, // REMOVED: We want a global limit per user
                timestamp: { gt: windowStart },
              },
            });

            if (usageCount >= limit) {
              return new NextResponse(
                `הגעת למגבלת הרענונים (${limit} רענונים ב-4 שעות). נסה שוב מאוחר יותר.`,
                { status: 429 },
              );
            }

            // Log usage
            await (prisma as any).viewRefreshLog.create({
              data: {
                userId: user.id,
                viewId: viewId ?? null, // Log viewId if available, but it's not used for the limit
              },
            });
          }
        } catch (e) {
          log.error("Rate limit check failed, allowing view process", { error: String(e) });
          // We fail open - allow the refresh if the check fails
        }
      }
    }

    // Process view server-side
    const result = await processViewServer({
      tableId,
      companyId: user.companyId,
      config,
      forceRefresh,
    });

    return NextResponse.json(result);
  } catch (error) {
    log.error("View processing error", { error: String(error) });
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
