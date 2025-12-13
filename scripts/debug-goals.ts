import { prisma } from "./lib/prisma";

async function checkData() {
  console.log("Checking data...");

  const user = await prisma.user.findFirst();
  if (!user) {
    console.log("No user found");
    return;
  }
  console.log("User company:", user.companyId);

  // Check Retainers
  const retainers = await prisma.retainer.findMany({
    where: { client: { companyId: user.companyId } },
    select: { id: true, status: true, amount: true, frequency: true },
  });
  console.log("Retainers found:", retainers.length);
  if (retainers.length > 0) {
    console.log("Example retainers:", retainers.slice(0, 3));
    const statuses = [...new Set(retainers.map((r) => r.status))];
    console.log("Unique Retainer Statuses:", statuses);
    const frequencies = [...new Set(retainers.map((r) => r.frequency))];
    console.log("Unique Retainer Frequencies:", frequencies);
  }

  // Check Transactions
  const transactions = await prisma.transaction.findMany({
    where: { client: { companyId: user.companyId } },
    select: { id: true, status: true, amount: true, type: true },
  });
  console.log("Transactions found:", transactions.length);
  if (transactions.length > 0) {
    console.log("Example transactions:", transactions.slice(0, 3));
    const statuses = [...new Set(transactions.map((t) => t.status))];
    console.log("Unique Transaction Statuses:", statuses);
  }

  // Check Goals
  const goals = await prisma.goal.findMany({
    where: { companyId: user.companyId },
  });
  console.log("Goals found:", goals);
}

checkData()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
