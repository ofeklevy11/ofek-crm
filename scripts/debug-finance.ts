import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    include: { company: true },
  });

  if (!user) {
    console.log("No user found");
    return;
  }

  console.log(
    `Checking finance data for User: ${user.email}, Company: ${user.company.name} (ID: ${user.companyId})`
  );

  // Check OneTimePayments (Pending/Overdue)
  const pendingPayments = await prisma.oneTimePayment.findMany({
    where: {
      client: { companyId: user.companyId },
      status: { in: ["pending", "overdue"] },
    },
    select: { id: true, amount: true, status: true, title: true },
  });

  console.log("\n--- Pending Payments (Outstanding Debt) ---");
  let totalPending = 0;
  pendingPayments.forEach((p) => {
    console.log(`Payment #${p.id}: ${p.amount} (${p.status}) - ${p.title}`);
    totalPending += Number(p.amount);
  });
  console.log(`Total Pending: ${totalPending}`);

  // Check OneTimePayments (Paid)
  const paidPayments = await prisma.oneTimePayment.findMany({
    where: {
      client: { companyId: user.companyId },
      status: {
        in: ["paid", "completed", "PAID", "COMPLETED", "manual-marked-paid"],
      }, // Adding variations just in case
    },
    select: { id: true, amount: true, status: true, title: true },
  });

  console.log("\n--- Paid Payments ---");
  let totalPaid = 0;
  paidPayments.forEach((p) => {
    console.log(`Payment #${p.id}: ${p.amount} (${p.status}) - ${p.title}`);
    totalPaid += Number(p.amount);
  });
  console.log(`Total Paid: ${totalPaid}`);

  // Check Transactions
  const transactions = await prisma.transaction.findMany({
    where: {
      client: { companyId: user.companyId },
    },
    select: {
      id: true,
      amount: true,
      status: true,
      relatedType: true,
      relatedId: true,
    },
  });

  console.log("\n--- Transactions ---");
  let totalTransactions = 0;
  transactions.forEach((t) => {
    console.log(
      `Tx #${t.id}: ${t.amount} (${t.status}) - Related: ${t.relatedType} #${t.relatedId}`
    );
    if (["COMPLETED", "PAID", "manual-marked-paid"].includes(t.status)) {
      totalTransactions += Number(t.amount);
    }
  });
  console.log(`Total Transactions (valid): ${totalTransactions}`);

  // Calculate Rate
  const totalExpected = totalPaid + totalPending;
  const rate = totalExpected > 0 ? (totalPaid / totalExpected) * 100 : 0;

  console.log(`\n\n--- Stats ---`);
  console.log(`Total Paid (OneTimePayment): ${totalPaid}`);
  console.log(`Total Pending (OneTimePayment): ${totalPending}`);
  console.log(`Calculated Rate: ${rate.toFixed(2)}%`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
