"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
import { createLogger } from "@/lib/logger";

const log = createLogger("FinanceSetup");

/**
 * Creates a standard "Unified Finance Ledger" table in the user's system
 * if it doesn't already exist.
 */
export async function createUnifiedFinanceTable() {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (user.role !== "admin") return { success: false, error: "Only admins can set up finance tables" };

  const tableName = "הכנסות והוצאות (מאוחד)";

  // Check if already exists
  const existing = await prisma.tableMeta.findFirst({
    where: {
      companyId: user.companyId,
      name: tableName,
    },
  });

  if (existing) {
    return { success: true, id: existing.id, message: "Table already exists" };
  }

  // Define schema for a robust financial ledger
  const schemaJson = {
    columns: [
      {
        id: "col_date",
        name: "תאריך",
        type: "date",
        key: "date",
        order: 0,
      },
      {
        id: "col_amount",
        name: "סכום",
        type: "currency",
        key: "amount",
        order: 1,
      },
      {
        id: "col_type",
        name: "סוג תנועה",
        type: "select", // Income / Expense
        key: "type",
        options: ["הכנסה", "הוצאה"],
        order: 2,
      },
      {
        id: "col_category",
        name: "קטגוריה",
        type: "text",
        key: "category",
        order: 3,
      },
      {
        id: "col_source",
        name: "מקור",
        type: "text", // e.g. "Bank Transfer", "Credit Card"
        key: "source",
        order: 4,
      },
      {
        id: "col_desc",
        name: "תיאור",
        type: "text",
        key: "description",
        order: 5,
      },
    ],
  };

  // Generate a unique slug
  const slug = `finance-ledger-${Date.now()}`;

  try {
    const newTable = await prisma.tableMeta.create({
      data: {
        companyId: user.companyId,
        name: tableName,
        slug: slug,
        createdBy: user.id,
        schemaJson: schemaJson,
      },
    });

    revalidatePath("/finance");
    revalidatePath("/finance/goals");

    return { success: true, id: newTable.id };
  } catch (error) {
    log.error("Failed to create finance table", { error: String(error) });
    return { success: false, error: "Database error" };
  }
}
