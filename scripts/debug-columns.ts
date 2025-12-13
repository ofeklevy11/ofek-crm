import { prisma } from "../lib/prisma";

async function main() {
  console.log("Fetching tables...");
  const table = await prisma.tableMeta.findFirst({
    where: {
      schemaJson: { not: Prisma.DbNull },
    },
  });

  if (!table) {
    console.log("No tables found with schemaJson");
    return;
  }

  console.log("--- TABLE FOUND: " + table.name + " ---");
  console.log("Raw schemaJson:", JSON.stringify(table.schemaJson, null, 2));
}

import { Prisma } from "@prisma/client";

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
