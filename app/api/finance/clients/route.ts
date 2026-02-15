import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { withRetry } from "@/lib/db-retry";
import { z } from "zod";

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

    // P4: Cursor-based pagination
    const searchParams = request.nextUrl.searchParams;
    const cursorParam = searchParams.get("cursor");
    const takeParam = searchParams.get("take");
    const take = Math.min(parseInt(takeParam || "500") || 500, 5000);
    const cursor = cursorParam ? parseInt(cursorParam) : undefined;

    const clients = await withRetry(() => prisma.client.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      orderBy: { name: "asc" },
      take: take + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    }));

    const hasMore = clients.length > take;
    const data = clients.slice(0, take);
    const nextCursor = hasMore ? data[data.length - 1]?.id : undefined;

    return NextResponse.json({ data, nextCursor, hasMore });
  } catch (error) {
    console.error("Error fetching clients:", error);
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
    }));

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    console.error("Error creating client:", error);
    return NextResponse.json(
      { error: "Failed to create client" },
      { status: 500 }
    );
  }
}
