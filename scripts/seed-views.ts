import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Migration script to convert hardcoded views to database-driven views
 * This creates the original "leads" and "digital-marketing" views in the database
 */
async function seedViews() {
  console.log("Starting views migration...");

  // Find the "leads" table
  const leadsTable = await prisma.tableMeta.findUnique({
    where: { slug: "leads" },
  });

  if (leadsTable) {
    console.log(`Found leads table (ID: ${leadsTable.id})`);

    // Create views for leads table
    const leadsViews = [
      {
        tableId: leadsTable.id,
        name: "New Leads",
        slug: "leads_new_leads",
        config: {
          type: "stats",
          title: "New Leads",
          timeRange: "week",
        },
        isEnabled: true,
      },
      {
        tableId: leadsTable.id,
        name: "Lead Status Stats",
        slug: "leads_status_stats",
        config: {
          type: "aggregation",
          title: "Lead Status Stats",
          aggregationType: "group",
          groupByField: "status",
        },
        isEnabled: true,
      },
      {
        tableId: leadsTable.id,
        name: "Lead Sources",
        slug: "leads_sources",
        config: {
          type: "aggregation",
          title: "Lead Sources",
          aggregationType: "group",
          groupByField: "source",
        },
        isEnabled: true,
      },
      {
        tableId: leadsTable.id,
        name: "Legend",
        slug: "leads_legend",
        config: {
          type: "legend",
          title: "Legend",
          legendItems: [
            { color: "#ffffff", label: "Regular Lead" },
            { color: "#dcfce7", label: "Hot Lead" },
            { color: "#fef3c7", label: "Cold Lead" },
            { color: "#dbeafe", label: "Closed Lead" },
            { color: "#fed7aa", label: "Unclosed Lead" },
            { color: "#fee2e2", label: "Irrelevant" },
          ],
        },
        isEnabled: true,
      },
    ];

    for (const viewData of leadsViews) {
      const existing = await prisma.view.findUnique({
        where: {
          tableId_slug: {
            tableId: viewData.tableId,
            slug: viewData.slug,
          },
        },
      });

      if (!existing) {
        await prisma.view.create({ data: viewData });
        console.log(`✓ Created view: ${viewData.name}`);
      } else {
        console.log(`- View already exists: ${viewData.name}`);
      }
    }
  }

  // Find the "digital-marketing" table
  const dmTable = await prisma.tableMeta.findUnique({
    where: { slug: "digital-marketing" },
  });

  if (dmTable) {
    console.log(`Found digital-marketing table (ID: ${dmTable.id})`);

    // Create views for digital-marketing table
    const dmViews = [
      {
        tableId: dmTable.id,
        name: "New Clients",
        slug: "dm_new_clients",
        config: {
          type: "stats",
          title: "New Clients",
          timeRange: "week",
        },
        isEnabled: true,
      },
      {
        tableId: dmTable.id,
        name: "Revenue Stats",
        slug: "dm_revenue",
        config: {
          type: "aggregation",
          title: "Revenue Stats",
          aggregationType: "sum",
          targetField: "amount", // Adjust this based on your actual field name
          filters: [],
        },
        isEnabled: true,
      },
      {
        tableId: dmTable.id,
        name: "Client Types",
        slug: "dm_client_types",
        config: {
          type: "aggregation",
          title: "Client Types",
          aggregationType: "group",
          groupByField: "payment_type", // Adjust based on your actual field name
        },
        isEnabled: true,
      },
      {
        tableId: dmTable.id,
        name: "Services Breakdown",
        slug: "dm_services",
        config: {
          type: "aggregation",
          title: "Services Breakdown",
          aggregationType: "group",
          groupByField: "service", // Adjust based on your actual field name
        },
        isEnabled: true,
      },
      {
        tableId: dmTable.id,
        name: "Legend",
        slug: "dm_legend",
        config: {
          type: "legend",
          title: "Legend",
          legendItems: [
            { color: "#dcfce7", label: "Retainer" },
            { color: "#fef3c7", label: "One-Time Payment" },
            { color: "#fee2e2", label: "Inactive Client" },
          ],
        },
        isEnabled: true,
      },
    ];

    for (const viewData of dmViews) {
      const existing = await prisma.view.findUnique({
        where: {
          tableId_slug: {
            tableId: viewData.tableId,
            slug: viewData.slug,
          },
        },
      });

      if (!existing) {
        await prisma.view.create({ data: viewData });
        console.log(`✓ Created view: ${viewData.name}`);
      } else {
        console.log(`- View already exists: ${viewData.name}`);
      }
    }
  }

  console.log("Views migration completed!");
}

seedViews()
  .catch((e) => {
    console.error("Error during views migration:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
