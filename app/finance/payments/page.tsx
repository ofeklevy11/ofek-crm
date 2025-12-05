import { prisma } from "@/lib/prisma";
import { ArrowLeft, Calendar, CheckCircle, XCircle, Clock } from "lucide-react";
import Link from "next/link";
import Pagination from "@/components/Pagination";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const currentPage = Number(page) || 1;
  const pageSize = 30;

  const totalPayments = await prisma.oneTimePayment.count();
  const totalPages = Math.ceil(totalPayments / pageSize);

  const payments = await prisma.oneTimePayment.findMany({
    include: {
      client: true,
    },
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
  });

  const pendingPayments = payments.filter((p) => p.status === "pending");
  const paidPayments = payments.filter((p) => p.status === "paid");
  const overduePayments = payments.filter((p) => p.status === "overdue");

  const totalOutstanding = payments
    .filter((p) => p.status === "pending" || p.status === "overdue")
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "paid":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "overdue":
        return <XCircle className="w-4 h-4 text-red-600" />;
      case "pending":
        return <Clock className="w-4 h-4 text-yellow-600" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-green-100 text-green-800";
      case "overdue":
        return "bg-red-100 text-red-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "cancelled":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

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
              One-Time Payments
            </h1>
            <p className="text-gray-500 mt-1">
              Manage all one-time payment requests
            </p>
          </div>
          <Link
            href="/finance/payments/new"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + New Payment
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500">Pending</div>
          <div className="text-3xl font-bold text-yellow-600 mt-2">
            {pendingPayments.length}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500">Overdue</div>
          <div className="text-3xl font-bold text-red-600 mt-2">
            {overduePayments.length}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500">Paid</div>
          <div className="text-3xl font-bold text-green-600 mt-2">
            {paidPayments.length}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500">Total Outstanding</div>
          <div className="text-2xl font-bold text-red-600 mt-2">
            ₪{totalOutstanding.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Client
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Title
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Due Date
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Paid Date
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {payments.map((payment) => (
              <tr
                key={payment.id}
                className="hover:bg-gray-50 transition-colors"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <Link
                    href={`/finance/clients/${payment.clientId}`}
                    className="text-sm font-medium text-blue-600 hover:text-blue-900"
                  >
                    {payment.client.name}
                  </Link>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 text-right">
                  {payment.title}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                  ₪{Number(payment.amount).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <Calendar className="w-3 h-3" />
                    {new Date(payment.dueDate).toLocaleDateString("he-IL")}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                  {payment.paidDate ? (
                    <div className="flex items-center gap-1 justify-end text-green-600">
                      <Calendar className="w-3 h-3" />
                      {new Date(payment.paidDate).toLocaleDateString("he-IL")}
                    </div>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                      payment.status
                    )}`}
                  >
                    {getStatusIcon(payment.status)}
                    {payment.status}
                  </span>
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  No one-time payments found. Create your first payment to get
                  started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination totalPages={totalPages} />
    </div>
  );
}
