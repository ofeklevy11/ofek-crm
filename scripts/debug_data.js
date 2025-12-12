const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("--- USERS ---");
  const users = await prisma.user.findMany();
  console.log(
    users.map((u) => ({ id: u.id, name: u.name, companyId: u.companyId }))
  );

  console.log("\n--- TABLES ---");
  const tables = await prisma.tableMeta.findMany();
  console.log(
    tables.map((t) => ({ id: t.id, name: t.name, companyId: t.companyId }))
  );

  console.log("\n--- AUTOMATIONS ---");
  try {
    const automations = await prisma.automationRule.findMany();
    console.log(
      automations.map((a) => ({
        id: a.id,
        name: a.name,
        companyId: a.companyId,
      }))
    );
  } catch (e) {
    console.log("No AutomationRule table or error");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
