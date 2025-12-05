import { prisma } from "@/lib/prisma";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import Pagination from "@/components/Pagination";
import ClientsTable from "@/components/finance/ClientsTable";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const currentPage = Number(page) || 1;
  const pageSize = 30;

  const totalClients = await prisma.client.count();
  const totalPages = Math.ceil(totalClients / pageSize);

  const clients = await prisma.client.findMany({
    include: {
      retainers: {
        where: { status: "active" },
      },
      oneTimePayments: {
        where: { status: { in: ["pending", "overdue"] } },
      },
      transactions: true,
    },
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
  });

  return (
    <div className="p-8 space-y-8 bg-gray-50/50 min-h-screen">
      <div>
        <Link
          href="/finance"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Financial Hub
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
              All Clients
            </h1>
            <p className="text-gray-500 mt-1">
              Manage all your financial clients
            </p>
          </div>
          <Link
            href="/finance/clients/new"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + New Client
          </Link>
        </div>
      </div>

      <ClientsTable clients={clients} />

      <Pagination totalPages={totalPages} />
    </div>
  );
}
