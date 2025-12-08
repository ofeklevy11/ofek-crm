import { prisma } from "@/lib/prisma";
import TablesDashboard from "@/components/TablesDashboard";

import { getCurrentUser } from "@/lib/permissions-server";
import { canManageTables } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function TablesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const canManage = canManageTables(user);

  // CRITICAL: Filter by companyId
  const tables = await prisma.tableMeta.findMany({
    where: { companyId: user.companyId },
    orderBy: { createdAt: "desc" },
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
