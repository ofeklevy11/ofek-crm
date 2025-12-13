import { prisma } from "../lib/prisma";

async function main() {
  const tables = await prisma.tableMeta.findMany({
    take: 3,
    include: {
      records: {
        take: 1,
      },
    },
  });

  console.log("--- Tables and First Record Data ---");
  for (const table of tables) {
    console.log(`\nTable ID: ${table.id}, Name: ${table.name}`);
    console.log("Schema:", JSON.stringify(table.schemaJson, null, 2));
    if (table.records.length > 0) {
      console.log(
        "First Record Data:",
        JSON.stringify(table.records[0].data, null, 2)
      );
    } else {
      console.log("No records.");
    }
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
