import Link from "next/link";
import { prisma } from "@/lib/prisma";
import TableCard from "@/components/TableCard";


export default async function TablesPage() {
  const tables = await prisma.tableMeta.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { records: true },
      },
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Tables</h1>
            <p className="text-gray-600">Manage your custom data tables</p>
          </div>
          <Link
            href="/tables/new"
            className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-xl hover:from-blue-700 hover:to-blue-800 transition shadow-lg font-medium"
          >
            + Create Table
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tables.map((table) => (
            <TableCard key={table.id} table={table} />
          ))}

          {tables.length === 0 && (
            <div className="col-span-full text-center py-16 bg-white rounded-2xl border-2 border-dashed border-gray-300">
              <div className="max-w-md mx-auto">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  No tables yet
                </h3>
                <p className="text-gray-600 mb-6">
                  Create your first table to start managing your data
                </p>
                <Link
                  href="/tables/new"
                  className="inline-block bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-8 rounded-xl hover:from-blue-700 hover:to-blue-800 transition shadow-lg font-medium"
                >
                  + Create Your First Table
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
