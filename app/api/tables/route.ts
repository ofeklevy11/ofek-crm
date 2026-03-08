import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { canManageTables } from "@/lib/permissions";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import { withMetrics } from "@/lib/with-metrics";

const log = createLogger("TablesAPI");

// Input constraints
const MAX_NAME_LENGTH = 200;
const MAX_SLUG_LENGTH = 100;
const MAX_SCHEMA_JSON_SIZE = 200_000; // 200KB max for schemaJson
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

async function handleGET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limiting
    const rlResponse = await checkRateLimit(
      String(user.id),
      RATE_LIMITS.api
    );
    if (rlResponse) return rlResponse;

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor");
    const cursorId = cursor ? parseInt(cursor, 10) : null;
    if (cursor && (!Number.isFinite(cursorId) || cursorId! <= 0)) {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);
    if (!Number.isInteger(limit) || limit <= 0) {
      return NextResponse.json({ error: "Invalid limit" }, { status: 400 });
    }

    // P2: Permission-aware WHERE — basic users only see tables they have access to
    const where: any = { companyId: user.companyId, deletedAt: null };
    if (user.role !== "admin" && user.role !== "manager") {
      const allowedIds = user.tablePermissions
        ? Object.entries(user.tablePermissions)
            .filter(([, p]) => p === "read" || p === "write")
            .map(([id]) => parseInt(id))
        : [];
      where.id = { in: allowedIds };
    }

    // P3: Cursor-based pagination
    const tables = await prisma.tableMeta.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true, name: true, slug: true, schemaJson: true,
        tabsConfig: true, displayConfig: true,
        categoryId: true, order: true, createdAt: true, updatedAt: true,
      },
    });

    const hasMore = tables.length > limit;
    const data = hasMore ? tables.slice(0, limit) : tables;

    return NextResponse.json({
      data,
      hasMore,
      nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null,
    });
  } catch (error) {
    log.error("Failed to fetch tables", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to fetch tables" },
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
      return NextResponse.json(
        { error: "אין לך הרשאה ליצור טבלאות" },
        { status: 403 }
      );
    }

    // Rate limiting — stricter for mutations
    const rlResponse = await checkRateLimit(
      String(user.id),
      RATE_LIMITS.bulk
    );
    if (rlResponse) return rlResponse;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { name, slug, schemaJson, tabsConfig, displayConfig } = body;

    // Input validation
    if (!name || !slug) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (typeof name !== "string" || name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Name must be a string of at most ${MAX_NAME_LENGTH} characters` },
        { status: 400 }
      );
    }

    if (typeof slug !== "string" || slug.length > MAX_SLUG_LENGTH) {
      return NextResponse.json(
        { error: `Slug must be a string of at most ${MAX_SLUG_LENGTH} characters` },
        { status: 400 }
      );
    }

    if (!SLUG_PATTERN.test(slug)) {
      return NextResponse.json(
        { error: "Slug must start with a letter or number and contain only lowercase letters, numbers, hyphens, and underscores" },
        { status: 400 }
      );
    }

    if (schemaJson !== undefined) {
      if (typeof schemaJson !== "object" || schemaJson === null) {
        return NextResponse.json(
          { error: "schemaJson must be a JSON object" },
          { status: 400 }
        );
      }
      const schemaSize = JSON.stringify(schemaJson).length;
      if (schemaSize > MAX_SCHEMA_JSON_SIZE) {
        return NextResponse.json(
          { error: `schemaJson exceeds maximum size of ${MAX_SCHEMA_JSON_SIZE} bytes` },
          { status: 400 }
        );
      }
    }

    // SECURITY: Validate categoryId belongs to user's company
    let validatedCategoryId: number | undefined;
    if (body.categoryId) {
      const categoryIdNum = Number(body.categoryId);
      if (!Number.isFinite(categoryIdNum) || categoryIdNum <= 0) {
        return NextResponse.json(
          { error: "Invalid category ID" },
          { status: 400 }
        );
      }
      const category = await prisma.tableCategory.findFirst({
        where: { id: categoryIdNum, companyId: user.companyId },
        select: { id: true },
      });
      if (!category) {
        return NextResponse.json(
          { error: "Invalid category" },
          { status: 400 }
        );
      }
      validatedCategoryId = category.id;
    }

    const table = await prisma.tableMeta.create({
      data: {
        name: name.trim(),
        slug: slug.trim(),
        schemaJson: schemaJson || {},
        tabsConfig: tabsConfig ?? undefined,
        displayConfig: displayConfig ?? undefined,
        companyId: user.companyId,
        createdBy: user.id,
        categoryId: validatedCategoryId,
      },
      select: {
        id: true, name: true, slug: true, schemaJson: true,
        tabsConfig: true, displayConfig: true,
        categoryId: true, order: true, createdAt: true, updatedAt: true,
      },
    });

    return NextResponse.json(table);
  } catch (error: any) {
    // P6: Handle duplicate slug with a clear 409 instead of generic 500
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "slug כבר קיים בחברה זו" },
        { status: 409 }
      );
    }
    log.error("Failed to create table", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to create table" },
      { status: 500 }
    );
  }
}

export const GET = withMetrics("/api/tables", handleGET);
export const POST = withMetrics("/api/tables", handlePOST);
