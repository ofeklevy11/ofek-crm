import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import Pagination from "@/components/Pagination";
import ClientsTable from "@/components/finance/ClientsTable";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "לקוחות" };

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

  const [totalClients, clients] = await Promise.all([
    prisma.client.count({
      where: { companyId: user.companyId, deletedAt: null },
    }),
    prisma.client.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      include: {
        retainers: {
          where: { status: "active", deletedAt: null },
          select: { id: true, amount: true, nextDueDate: true },
        },
        oneTimePayments: {
          where: { status: { in: ["pending", "overdue"] }, deletedAt: null },
          select: { id: true, amount: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const totalPages = Math.ceil(totalClients / pageSize);

  return (
    <div className="p-8 space-y-8 bg-[#f4f8f8] min-h-screen" dir="rtl">
      <div>
        <Link
          href="/finance"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 mb-4"
        >
          <ArrowRight className="w-4 h-4 ml-1" /> חזרה למרכז הפיננסי
        </Link>
        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
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
