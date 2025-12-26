import { prisma } from "@/lib/prisma";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import Pagination from "@/components/Pagination";
import ClientsTable from "@/components/finance/ClientsTable";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { page } = await searchParams;
  const currentPage = Number(page) || 1;
  const pageSize = 30;

  // CRITICAL: Filter by companyId
  const totalClients = await prisma.client.count({
    where: { companyId: user.companyId },
  });
  const totalPages = Math.ceil(totalClients / pageSize);

  // CRITICAL: Filter by companyId
  const clients = await prisma.client.findMany({
    where: { companyId: user.companyId },
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
    <div className="p-8 space-y-8 bg-[#f4f8f8] min-h-screen" dir="rtl">
      <div>
        <Link
          href="/finance"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 mb-4"
        >
          <ArrowRight className="w-4 h-4 ml-1" /> חזרה למרכז הפיננסי
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
              כל הלקוחות
            </h1>
            <p className="text-gray-500 mt-1">ניהול כל הלקוחות הפיננסיים שלך</p>
          </div>
          <Link
            href="/finance/clients/new"
            className="inline-flex items-center px-4 py-2 bg-[#4f95ff] text-white rounded-lg hover:bg-blue-600 transition-colors shadow-sm"
          >
            + לקוח חדש
          </Link>
        </div>
      </div>

      <ClientsTable clients={clients} />

      <Pagination totalPages={totalPages} />
    </div>
  );
}
