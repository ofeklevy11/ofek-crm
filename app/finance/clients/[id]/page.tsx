import TransactionsTable from "@/components/finance/TransactionsTable";
import { ArrowLeft, ArrowRight, Mail, Phone, Building } from "lucide-react";
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
      financeRecords: {
        where: { type: "INCOME" },
        orderBy: { date: "desc" },
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
    (p) => p.status === "pending" || p.status === "overdue",
  );
  const outstanding = outstandingPayments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  );

  // Calculate total paid
  const totalPaidTransactions = client.transactions
    .filter((t) => t.status === "manual-marked-paid")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalPaidFinanceRecords = client.financeRecords
    .filter((r) => r.status === "COMPLETED" && r.type === "INCOME")
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const totalPaid = totalPaidTransactions + totalPaidFinanceRecords;

  const stats = {
    totalPaid,
    outstanding,
  };

  // Format transactions for the table
  const formattedTransactions = client.transactions.map((t) => ({
    id: t.id,
    client: { id: client.id, name: client.name },
    relatedType: t.relatedType,
    title: t.notes || `${t.relatedType === "retainer" ? "ריטיינר" : "תשלום"}`,
    amount: Number(t.amount),
    dueDate: t.attemptDate.toISOString().split("T")[0],
    status: t.status,
    paidDate: t.paidDate?.toISOString().split("T")[0],
  }));

  const formattedFinanceRecords = client.financeRecords.map((r) => ({
    id: 1000000 + r.id, // Offset ID to avoid collision
    client: { id: client.id, name: client.name },
    relatedType: "income",
    title: r.title || "הכנסה",
    amount: Number(r.amount),
    dueDate: r.date.toISOString().split("T")[0],
    status: r.status === "COMPLETED" ? "paid" : r.status.toLowerCase(),
    paidDate: r.date.toISOString().split("T")[0],
  }));

  const allTransactions = [...formattedTransactions, ...formattedFinanceRecords]
    .sort(
      (a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime(),
    )
    .slice(0, 50);

  const getFrequencyLabel = (freq: string) => {
    switch (freq) {
      case "monthly":
        return "חודשי";
      case "quarterly":
        return "רבעוני";
      case "annually":
        return "שנתי";
      default:
        return freq;
    }
  };

  return (
    <div
      className="p-8 space-y-8 bg-[#f4f8f8] min-h-screen text-right"
      dir="rtl"
    >
      <div>
        <Link
          href="/finance/clients"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 mb-4"
        >
          <ArrowRight className="w-4 h-4 ml-1" /> חזרה ללקוחות
        </Link>
        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
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
          <div className="flex flex-col md:flex-row items-end gap-6 bg-white p-4 rounded-2xl shadow-sm border border-gray-200 w-full md:w-auto">
            <div className="text-left px-2">
              <div className="text-sm font-medium text-gray-500 mb-1">
                חוב פתוח
              </div>
              <div className="text-3xl font-bold text-[#a24ec1]">
                ₪{stats.outstanding.toLocaleString()}
              </div>
            </div>
            <div className="h-10 w-px bg-gray-200 hidden md:block" />
            <div className="flex gap-3 w-full md:w-auto">
              <Link
                href={`/finance/retainers/new?clientId=${client.id}`}
                className="flex-1 md:flex-none inline-flex justify-center items-center px-5 py-3 border border-gray-200 bg-white text-gray-700 shadow-sm text-sm font-bold rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4f95ff]"
              >
                + ריטיינר חדש
              </Link>
              <Link
                href={`/finance/payments/new?clientId=${client.id}`}
                className="flex-1 md:flex-none inline-flex justify-center items-center px-5 py-3 border border-transparent shadow-sm text-sm font-bold rounded-xl text-white bg-[#4f95ff] hover:bg-[#3d84ff] transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4f95ff]"
              >
                + תשלום חדש
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Retainers & Info */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">
              ריטיינרים פעילים
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
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#4f95ff]/10 text-[#4f95ff]">
                      {retainer.status === "active" ? "פעיל" : retainer.status}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">
                      {getFrequencyLabel(retainer.frequency)}
                    </span>
                    <span className="font-semibold text-gray-900">
                      ₪{Number(retainer.amount).toLocaleString()}
                    </span>
                  </div>
                  {retainer.nextDueDate && (
                    <div className="mt-2 text-xs text-gray-500">
                      תשלום הבא:{" "}
                      {new Date(retainer.nextDueDate).toLocaleDateString(
                        "he-IL",
                      )}
                    </div>
                  )}
                </div>
              ))}
              {activeRetainers.length === 0 && (
                <p className="text-sm text-gray-500">אין ריטיינרים פעילים.</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">הערות לקוח</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">
              {client.notes || "אין הערות זמינות."}
            </p>
          </div>
        </div>

        {/* Right Column: Transaction History */}
        <div className="lg:col-span-2">
          <TransactionsTable transactions={allTransactions} />
        </div>
      </div>
    </div>
  );
}
