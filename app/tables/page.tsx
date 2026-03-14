import { prisma } from "@/lib/prisma";
import TablesDashboard from "@/components/TablesDashboard";

import { getCurrentUser } from "@/lib/permissions-server";
import { canManageTables } from "@/lib/permissions";
import { buildTablePermissionWhere } from "@/lib/table-permissions";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "טבלאות" };

export default async function TablesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const canManage = canManageTables(user);

  // Permission-aware WHERE — uses shared helper
  const where = buildTablePermissionWhere(user);

  const [tables, categories] = await Promise.all([
    prisma.tableMeta.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true, name: true, slug: true, categoryId: true, order: true,
        createdAt: true, updatedAt: true,
        _count: { select: { records: true } },
        creator: { select: { name: true } },
      },
    }),
    // CRITICAL: Filter by companyId
    prisma.tableCategory.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <TablesDashboard
      initialTables={tables}
      initialCategories={categories}
      canManage={canManage}
    />
  );
}
