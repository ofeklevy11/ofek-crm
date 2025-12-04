import TransactionsTable from "@/components/finance/TransactionsTable";
import { ArrowLeft, Mail, Phone, Building } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export default async function ClientOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clientId = parseInt(id);

  // Fetch client data from database
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      retainers: {
        where: { status: "active" },
      },
      oneTimePayments: true,
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!client) {
    notFound();
  }

  const activeRetainers = client.retainers;

  // Calculate outstanding debt
  const outstandingPayments = client.oneTimePayments.filter(
    (p) => p.status === "pending" || p.status === "overdue"
  );
  const outstanding = outstandingPayments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0
  );

  // Calculate total paid
  const totalPaid = client.transactions
    .filter((t) => t.status === "manual-marked-paid")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const stats = {
    totalPaid,
    outstanding,
  };

  // Format transactions for the table
  const formattedTransactions = client.transactions.map((t) => ({
    id: t.id,
    client: { id: client.id, name: client.name },
    relatedType: t.relatedType,
    title: t.notes || `${t.relatedType} payment`,
    amount: Number(t.amount),
    dueDate: t.attemptDate.toISOString().split("T")[0],
    status: t.status,
    paidDate: t.paidDate?.toISOString().split("T")[0],
  }));

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
              {client.name}
            </h1>
            <div className="flex gap-4 mt-2 text-sm text-gray-500">
              {client.company && (
                <div className="flex items-center gap-1">
                  <Building className="w-4 h-4" /> {client.company}
                </div>
              )}
              {client.email && (
                <div className="flex items-center gap-1">
                  <Mail className="w-4 h-4" /> {client.email}
                </div>
              )}
              {client.phone && (
                <div className="flex items-center gap-1">
                  <Phone className="w-4 h-4" /> {client.phone}
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Outstanding Debt</div>
            <div className="text-2xl font-bold text-red-600">
              ₪{stats.outstanding.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Retainers & Info */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">
              Active Retainers
            </h3>
            <div className="space-y-4">
              {activeRetainers.map((retainer) => (
                <div
                  key={retainer.id}
                  className="p-4 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-medium text-gray-900">
                      {retainer.title}
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      {retainer.status}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{retainer.frequency}</span>
                    <span className="font-semibold text-gray-900">
                      ₪{Number(retainer.amount).toLocaleString()}
                    </span>
                  </div>
                  {retainer.nextDueDate && (
                    <div className="mt-2 text-xs text-gray-500">
                      Next due:{" "}
                      {new Date(retainer.nextDueDate).toLocaleDateString(
                        "he-IL"
                      )}
                    </div>
                  )}
                </div>
              ))}
              {activeRetainers.length === 0 && (
                <p className="text-sm text-gray-500">No active retainers.</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Client Notes</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">
              {client.notes || "No notes available."}
            </p>
          </div>
        </div>

        {/* Right Column: Transaction History */}
        <div className="lg:col-span-2">
          <TransactionsTable transactions={formattedTransactions} />
        </div>
      </div>
    </div>
  );
}
