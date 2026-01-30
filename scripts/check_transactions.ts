import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Fetching recent transactions...");
  const transactions = await prisma.transaction.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      amount: true,
      status: true,
      relatedType: true,
      paidDate: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  console.log("Transactions found:", transactions.length);
  transactions.forEach((t) => {
    console.log(JSON.stringify(t, null, 2));
  });

  // Check specific one-time payment related types
  const oneTimeCounts = await prisma.transaction.groupBy({
    by: ["relatedType"],
    _count: true,
  });
  console.log("Counts by relatedType:", oneTimeCounts);

  // Check specific status
  const statusCounts = await prisma.transaction.groupBy({
    by: ["status"],
    _count: true,
  });
  console.log("Counts by status:", statusCounts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
