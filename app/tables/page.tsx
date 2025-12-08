import { prisma } from "@/lib/prisma";
import TablesDashboard from "@/components/TablesDashboard";

import { getCurrentUser } from "@/lib/permissions-server";
import { canManageTables } from "@/lib/permissions";

export default async function TablesPage() {
  const user = await getCurrentUser();
  const canManage = user ? canManageTables(user) : false;

  const tables = await prisma.tableMeta.findMany({
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

  const categories = await prisma.tableCategory.findMany({
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
