import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Fetching tables schema...");
  const tables = await prisma.tableMeta.findMany({
    take: 5,
  });

  for (const table of tables) {
    if (!table.schemaJson) continue;

    const schema = table.schemaJson as any[];
    if (!Array.isArray(schema)) continue;

    const relationFields = schema.filter((f) => f.type === "relation");

    if (relationFields.length > 0) {
      console.log(`\nTable: ${table.name} (ID: ${table.id})`);
      console.log("Relation Fields Found:");
      console.log(JSON.stringify(relationFields, null, 2));

      // Let's check one record to see how the data is stored
      const record = await prisma.record.findFirst({
        where: { tableId: table.id },
      });

      if (record) {
        console.log("Sample Record Data for these fields:");
        relationFields.forEach((f) => {
          console.log(`${f.name}:`, record.data[f.name]);
        });
      }
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
