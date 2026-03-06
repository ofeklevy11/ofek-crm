import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { withRetry } from "@/lib/db-retry";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const log = createLogger("FinanceClientsAPI");

const createClientSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(200).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  businessName: z.string().max(200).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasUserFlag(user, "canViewFinance")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // P4: Cursor-based pagination
    const searchParams = request.nextUrl.searchParams;
    const cursorParam = searchParams.get("cursor");
    const takeParam = searchParams.get("take");
    const limited = await checkRateLimit(String(user.id), RATE_LIMITS.api);
    if (limited) return limited;

    const take = Math.min(parseInt(takeParam || "500", 10) || 500, 500);
    const cursor = cursorParam ? parseInt(cursorParam, 10) : undefined;

    const clients = await withRetry(() => prisma.client.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        businessName: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: take + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    }));

    const hasMore = clients.length > take;
    const data = clients.slice(0, take);
    const nextCursor = hasMore ? data[data.length - 1]?.id ?? null : null;

    return NextResponse.json({ data, nextCursor, hasMore });
  } catch (error) {
    log.error("Failed to fetch clients", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to fetch clients" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasUserFlag(user, "canViewFinance")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const limited = await checkRateLimit(String(user.id), RATE_LIMITS.api);
    if (limited) return limited;

    const raw = await request.json();
    const parsed = createClientSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const client = await withRetry(() => prisma.client.create({
      data: {
        companyId: user.companyId, // CRITICAL: Set companyId for multi-tenancy
        name: parsed.data.name,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        businessName: parsed.data.businessName ?? null,
        notes: parsed.data.notes ?? null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        businessName: true,
        notes: true,
        createdAt: true,
      },
    }));

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    log.error("Failed to create client", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to create client" },
      { status: 500 }
    );
  }
}
