import { prisma } from "@/lib/prisma";
import TablesDashboard from "@/components/TablesDashboard";

import { getCurrentUser } from "@/lib/permissions-server";
import { canManageTables, canReadTable } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function TablesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const canManage = canManageTables(user);

  // Permission-aware WHERE — basic users only see tables they have access to
  const where: any = { companyId: user.companyId, deletedAt: null };
  if (user.role !== "admin" && user.role !== "manager") {
    const allowedIds = user.tablePermissions
      ? Object.entries(user.tablePermissions)
          .filter(([, p]) => p === "read" || p === "write")
          .map(([id]) => parseInt(id))
      : [];
    where.id = { in: allowedIds };
  }

  const tables = await prisma.tableMeta.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      _count: {
        select: { records: true },
      },
      creator: {
        select: { name: true },
      },
    },
  });

  // CRITICAL: Filter by companyId
  const categories = await prisma.tableCategory.findMany({
    where: { companyId: user.companyId },
    orderBy: { createdAt: "asc" },
  });

  return (
    <TablesDashboard
      initialTables={tables}
      initialCategories={categories}
      canManage={canManage}
    />
  );
}
