import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { canManageTables, canReadTable } from "@/lib/permissions";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("TableAPI");

// Input constraints
const MAX_NAME_LENGTH = 200;
const MAX_SLUG_LENGTH = 100;
const MAX_SCHEMA_JSON_SIZE = 200_000; // 200KB max for schemaJson
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

// P7: Validate and parse route param early — reject NaN before hitting DB
function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const tableId = parseId(id);
    if (!tableId) {
      return NextResponse.json({ error: "Invalid table ID" }, { status: 400 });
    }

    // P2: Check read permission before querying
    if (!canReadTable(user, tableId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // P8: Exclude soft-deleted tables
    const table = await prisma.tableMeta.findFirst({
      where: {
        id: tableId,
        companyId: user.companyId,
        deletedAt: null,
      },
      select: {
        id: true, name: true, slug: true, schemaJson: true,
        categoryId: true, order: true, createdAt: true, updatedAt: true,
        _count: {
          select: { records: true },
        },
      },
    });

    if (!table) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    return NextResponse.json(table);
  } catch (error) {
    log.error("Failed to fetch table", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to fetch table" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canManageTables(user)) {
      return NextResponse.json(
        { error: "Forbidden: Only admins can update tables" },
        { status: 403 }
      );
    }

    // Rate limiting — stricter for mutations
    const rlResponse = await checkRateLimit(
      String(user.id),
      RATE_LIMITS.bulk
    );
    if (rlResponse) return rlResponse;

    const { id } = await params;
    const tableId = parseId(id);
    if (!tableId) {
      return NextResponse.json({ error: "Invalid table ID" }, { status: 400 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { name, slug, schemaJson, updatedAt: expectedUpdatedAt } = body;

    // Input validation
    if (name !== undefined) {
      if (typeof name !== "string" || name.length === 0 || name.length > MAX_NAME_LENGTH) {
        return NextResponse.json(
          { error: `Name must be a non-empty string of at most ${MAX_NAME_LENGTH} characters` },
          { status: 400 }
        );
      }
    }

    if (slug !== undefined) {
      if (typeof slug !== "string" || slug.length === 0 || slug.length > MAX_SLUG_LENGTH) {
        return NextResponse.json(
          { error: `Slug must be a non-empty string of at most ${MAX_SLUG_LENGTH} characters` },
          { status: 400 }
        );
      }
      if (!SLUG_PATTERN.test(slug)) {
        return NextResponse.json(
          { error: "Slug must start with a letter or number and contain only lowercase letters, numbers, hyphens, and underscores" },
          { status: 400 }
        );
      }
    }

    if (schemaJson !== undefined) {
      if (typeof schemaJson !== "object" || schemaJson === null || Array.isArray(schemaJson)) {
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

    if (expectedUpdatedAt !== undefined) {
      if (typeof expectedUpdatedAt !== "string" || isNaN(Date.parse(expectedUpdatedAt))) {
        return NextResponse.json(
          { error: "Invalid updatedAt timestamp" },
          { status: 400 }
        );
      }
    }

    // P9: Only select id — full row not needed for existence check
    if (body.categoryId !== undefined && body.categoryId !== null) {
      const catId = Number(body.categoryId);
      if (!Number.isFinite(catId) || catId <= 0) {
        return NextResponse.json({ error: "Invalid category ID" }, { status: 400 });
      }
      const category = await prisma.tableCategory.findFirst({
        where: { id: catId, companyId: user.companyId },
        select: { id: true },
      });
      if (!category) {
        return NextResponse.json({ error: "Category not found" }, { status: 400 });
      }
    }

    // P4 + P5: Use updateMany with optimistic concurrency check in a single query
    //   — eliminates the redundant findFirst while supporting updatedAt guard
    const where: any = {
      id: tableId,
      companyId: user.companyId,
      deletedAt: null,
    };
    if (expectedUpdatedAt) {
      where.updatedAt = new Date(expectedUpdatedAt);
    }

    const { count } = await prisma.tableMeta.updateMany({
      where,
      data: {
        ...(name && { name: name.trim() }),
        ...(slug && { slug: slug.trim() }),
        ...(schemaJson && { schemaJson }),
        ...(body.categoryId !== undefined && { categoryId: body.categoryId }),
        updatedAt: new Date(),  // updateMany doesn't auto-set @updatedAt
      },
    });

    if (count === 0) {
      // Distinguish between not-found and optimistic-concurrency conflict
      if (expectedUpdatedAt) {
        const exists = await prisma.tableMeta.findFirst({
          where: { id: tableId, companyId: user.companyId, deletedAt: null },
          select: { id: true },
        });
        if (exists) {
          return NextResponse.json(
            { error: "Conflict: the table was modified by another user. Please refresh and try again." },
            { status: 409 }
          );
        }
      }
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    // Return the updated record
    const updatedTable = await prisma.tableMeta.findFirst({
      where: { id: tableId, companyId: user.companyId, deletedAt: null },
      select: {
        id: true, name: true, slug: true, schemaJson: true,
        categoryId: true, order: true, createdAt: true, updatedAt: true,
      },
    });

    return NextResponse.json(updatedTable);
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "slug כבר קיים בחברה זו" },
        { status: 409 }
      );
    }
    log.error("Failed to update table", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to update table" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canManageTables(user)) {
      return NextResponse.json(
        { error: "Forbidden: Only admins can delete tables" },
        { status: 403 }
      );
    }

    // Rate limiting — stricter for destructive mutations
    const rlResponse = await checkRateLimit(
      String(user.id),
      RATE_LIMITS.bulk
    );
    if (rlResponse) return rlResponse;

    const { id } = await params;
    const tableId = parseId(id);
    if (!tableId) {
      return NextResponse.json({ error: "Invalid table ID" }, { status: 400 });
    }

    // P1 + P8: All checks and soft-delete inside a single transaction
    await prisma.$transaction(async (tx) => {
      const existingTable = await tx.tableMeta.findFirst({
        where: { id: tableId, companyId: user.companyId, deletedAt: null },
        select: { id: true, companyId: true, slug: true },
      });

      if (!existingTable) {
        throw new Error("TABLE_NOT_FOUND");
      }

      // P1: File check INSIDE the transaction — no race window
      const fileCount = await tx.file.count({
        where: {
          record: {
            tableId,
            companyId: existingTable.companyId,
          },
        },
      });

      if (fileCount > 0) {
        throw new Error("HAS_FILES");
      }

      // P8: Soft delete — mangle slug to free the unique constraint
      await tx.tableMeta.update({
        where: { id: tableId, companyId: user.companyId },
        data: {
          deletedAt: new Date(),
          slug: `${existingTable.slug}_deleted_${Date.now()}`,
        },
      });
    }, { maxWait: 5000, timeout: 60000 });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "TABLE_NOT_FOUND") {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }
    if (error.message === "HAS_FILES") {
      return NextResponse.json(
        {
          error:
            "לא ניתן למחוק את הטבלה כיוון שיש רשומות עם קבצים מצורפים. יש למחוק את הקבצים תחילה (מספריית הקבצים או מהרשומות).",
        },
        { status: 400 }
      );
    }
    if (error.code === "P2003") {
      return NextResponse.json(
        {
          error:
            "לא ניתן למחוק את הטבלה כיוון שיש לה קבצים מצורפים / לינקים  או מידע מקושר אחר. יש למחוק את הלינקים והרשומות באופן ידני לפני מחיקת הטבלה.",
        },
        { status: 400 }
      );
    }

    log.error("Failed to delete table", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to delete table" },
      { status: 500 }
    );
  }
}
