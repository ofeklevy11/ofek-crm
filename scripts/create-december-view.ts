import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Script to create a December sales view with date filter
 * Run: npx tsx scripts/create-december-view.ts
 */
async function createDecemberView() {
  console.log("Creating December sales view...");

  // Find the table by slug
  const table = await prisma.tableMeta.findFirst({
    where: { slug: "ebodot-bniat-atrim" }, // adjust this to your table slug
  });

  if (!table) {
    console.error("❌ Table not found! Update the slug in the script.");
    return;
  }

  console.log(`✓ Found table: ${table.name} (ID: ${table.id})`);

  // Delete old views with similar name
  const oldViews = await prisma.view.findMany({
    where: {
      tableId: table.id,
      name: {
        contains: "מכירות",
      },
    },
  });

  if (oldViews.length > 0) {
    console.log(`🗑️  Deleting ${oldViews.length} old views...`);
    for (const view of oldViews) {
      await prisma.view.delete({ where: { id: view.id } });
      console.log(`   - Deleted: ${view.name}`);
    }
  }

  // Create new view with date filter
  const newView = await prisma.view.create({
    data: {
      tableId: table.id,
      name: "מכירות חודש דצמבר",
      slug: `${table.slug}_sales_december_2025`,
      isEnabled: true,
      config: {
        type: "aggregation",
        title: "מכירות חודש דצמבר",
        aggregationType: "sum",
        targetField: "money",
        dateFilter: {
          field: "createdAt",
          type: "custom",
          startDate: "2025-12-01",
          endDate: "2025-12-31",
        },
      },
    },
  });

  console.log("✅ Created view:");
  console.log({
    id: newView.id,
    name: newView.name,
    slug: newView.slug,
    config: newView.config,
  });

  console.log("\n🎉 Done! Refresh your browser to see the view.");
}

createDecemberView()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
