const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main() {
  console.log("=== DATA DIAGNOSTIC & FIX TOOL ===");

  // 1. Show Users and Companies
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, companyId: true, role: true },
  });
  console.log("\n--- Users ---");
  console.table(users);

  const companies = await prisma.company.findMany();
  console.log("\n--- Companies ---");
  console.table(companies);

  // 2. Show Data Distribution
  const tables = await prisma.tableMeta.findMany({
    select: { id: true, companyId: true, name: true },
  });
  const tableCounts = tables.reduce((acc, t) => {
    acc[t.companyId] = (acc[t.companyId] || 0) + 1;
    return acc;
  }, {});

  console.log("\n--- Tables by Company ID ---");
  console.log(tableCounts);

  const events = await prisma.calendarEvent.count();
  console.log(`\nTotal Calendar Events: ${events}`);

  // 3. Prompt for action
  console.log(
    "\nIf you see your data belonging to a different Company ID than your User,"
  );
  console.log(
    "we can migrate 'orphaned' or 'wrong company' data to your target company."
  );

  rl.question(
    "\nEnter target Company ID to migrate ALL tables/events/finance TO (or press Enter to skip): ",
    async (targetIdStr) => {
      if (!targetIdStr) {
        console.log("Skipping migration.");
        process.exit(0);
      }

      const targetId = parseInt(targetIdStr);
      if (isNaN(targetId)) {
        console.error("Invalid ID");
        process.exit(1);
      }

      console.log(`\nMigrating ALL data to Company ID: ${targetId}...`);

      try {
        // Tables
        const t = await prisma.tableMeta.updateMany({
          data: { companyId: targetId },
        });
        console.log(`Updated ${t.count} tables.`);

        // Table Categories
        const tc = await prisma.tableCategory.updateMany({
          data: { companyId: targetId },
        });
        console.log(`Updated ${tc.count} categories.`);

        // Records
        const r = await prisma.record.updateMany({
          data: { companyId: targetId },
        });
        console.log(`Updated ${r.count} records.`);

        // Calendar
        const c = await prisma.calendarEvent.updateMany({
          data: { companyId: targetId },
        });
        console.log(`Updated ${c.count} calendar events.`);

        // Automation
        const a = await prisma.automationRule.updateMany({
          data: { companyId: targetId },
        });
        console.log(`Updated ${a.count} automations.`);

        // Clients
        const cl = await prisma.client.updateMany({
          data: { companyId: targetId },
        });
        console.log(`Updated ${cl.count} clients.`);

        // Analytics
        const an = await prisma.analyticsView.updateMany({
          data: { companyId: targetId },
        });
        console.log(`Updated ${an.count} analytics views.`);

        // Users (Optional? No, let's keep users as is, or ask? Assume we fix data only)
        // Check if current user is in target company
        // const u = await prisma.user.updateMany({ where: { }, data: { companyId: targetId } });
        // We probably shouldn't move ALL users blindly.

        console.log("\n✅ MIGRATION COMPLETE. Please refresh your dashboard.");
      } catch (e) {
        console.error("Error during migration:", e);
      } finally {
        process.exit(0);
      }
    }
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
