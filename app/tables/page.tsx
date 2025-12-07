import { prisma } from "@/lib/prisma";
import TablesDashboard from "@/components/TablesDashboard";

export default async function TablesPage() {
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
    <TablesDashboard initialTables={tables} initialCategories={categories} />
  );
}
