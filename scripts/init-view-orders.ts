import "dotenv/config";
import { prisma } from "../lib/prisma";

async function initializeViewOrders() {
  try {
    console.log("🔧 Initializing view orders...");

    // Get all tables
    const tables = await prisma.tableMeta.findMany({
      include: {
        views: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    console.log(`📊 Found ${tables.length} tables`);

    for (const table of tables) {
      if (table.views.length === 0) {
        console.log(`  ⏭️ Table "${table.name}" has no views, skipping`);
        continue;
      }

      console.log(
        `  📋 Processing table "${table.name}" with ${table.views.length} views`
      );

      // Update each view with its index as order
      for (let i = 0; i < table.views.length; i++) {
        const view = table.views[i];
        await prisma.view.update({
          where: { id: view.id },
          data: { order: i },
        });
        console.log(`    ✅ Updated view "${view.name}" to order ${i}`);
      }
    }

    console.log("✅ All view orders initialized successfully!");
  } catch (error) {
    console.error("❌ Error initializing view orders:", error);
  } finally {
    await prisma.$disconnect();
  }
}

initializeViewOrders();
