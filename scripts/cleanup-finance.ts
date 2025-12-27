import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

// Initialize Prisma with Adapter (Standard for this project)
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set in environment variables");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function cleanupOrphans() {
  console.log("Starting cleanup of orphaned records...");

  // 1. Cleanup FinanceRecords
  const financeRecords = await prisma.financeRecord.findMany({
    select: { id: true, clientId: true, client: { select: { id: true } } },
  });

  console.log(`Scanned ${financeRecords.length} FinanceRecords.`);

  const orphanedFinanceRecordIds = financeRecords
    .filter((r) => r.clientId !== null && r.client === null)
    .map((r) => r.id);

  if (orphanedFinanceRecordIds.length > 0) {
    console.log(
      `Found ${orphanedFinanceRecordIds.length} orphaned FinanceRecords. Deleting...`
    );
    await prisma.financeRecord.deleteMany({
      where: { id: { in: orphanedFinanceRecordIds } },
    });
    console.log("Deleted orphaned FinanceRecords.");
  } else {
    console.log("No orphaned FinanceRecords found.");
  }

  // 2. Cleanup OneTimePayments
  const payments = await prisma.oneTimePayment.findMany({
    select: { id: true, clientId: true, client: { select: { id: true } } },
  });

  console.log(`Scanned ${payments.length} Payments.`);

  const orphanedPaymentIds = payments
    .filter((p) => p.clientId !== null && p.client === null)
    .map((p) => p.id);

  if (orphanedPaymentIds.length > 0) {
    console.log(
      `Found ${orphanedPaymentIds.length} orphaned Payments. Deleting...`
    );
    await prisma.oneTimePayment.deleteMany({
      where: { id: { in: orphanedPaymentIds } },
    });
    console.log("Deleted orphaned Payments.");
  } else {
    console.log("No orphaned Payments found.");
  }

  console.log("Cleanup complete.");
}

cleanupOrphans()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
