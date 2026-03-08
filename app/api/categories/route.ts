import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { canManageTables } from "@/lib/permissions";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("CategoriesAPI");

async function handleGET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await checkRateLimit(String(user.id), RATE_LIMITS.api);
    if (rl) return rl;

    // CRITICAL: Filter by companyId
    const categories = await prisma.tableCategory.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        tables: {
          select: { id: true },
          where: { companyId: user.companyId },
        },
      },
    });
    return NextResponse.json(categories);
  } catch (error) {
    log.error("Failed to fetch categories", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

async function handlePOST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canManageTables(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rl = await checkRateLimit(String(user.id), RATE_LIMITS.api);
    if (rl) return rl;

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0 || name.length > 200) {
      return NextResponse.json({ error: "Name is required and must be at most 200 characters" }, { status: 400 });
    }

    const category = await prisma.tableCategory.create({
      data: {
        name,
        companyId: user.companyId, // CRITICAL: Attribute to company
      },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json(category);
  } catch (error) {
    log.error("Failed to create category", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to create category" },
      { status: 500 }
    );
  }
}

export const GET = withMetrics("/api/categories", handleGET);
export const POST = withMetrics("/api/categories", handlePOST);
