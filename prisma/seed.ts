import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Seed cannot run in production");
  }

  console.log("🌱 Starting seed...");

  // בדיקה אם כבר קיימת חברה
  const existingCompany = await prisma.company.findFirst();

  if (existingCompany) {
    console.log("⚠️  חברה כבר קיימת במערכת");

    // בדיקה אם קיים משתמש אדמין
    const adminUser = await prisma.user.findFirst({
      where: {
        role: "admin",
      },
    });

    if (adminUser) {
      console.log("✅ משתמש אדמין כבר קיים:");
      console.log(`   📧 Email: ${adminUser.email}`);
      console.log(`   👤 Name: ${adminUser.name}`);
      return;
    }
  }

  // יצירת חברה ראשונית
  let company = existingCompany;

  if (!company) {
    console.log("📦 יוצר חברה ראשונית...");
    company = await prisma.company.create({
      data: {
        name: "חברה ראשית",
        slug: "main-company",
      },
    });
    console.log(`✅ נוצרה חברה: ${company.name}`);
  }

  // יצירת משתמש אדמין ראשוני
  console.log("👤 יוצר משתמש אדמין ראשוני...");

  const generatedPassword = crypto.randomBytes(16).toString("hex");
  const hashedPassword = await bcrypt.hash(generatedPassword, 10);

  const adminUser = await prisma.user.create({
    data: {
      companyId: company.id,
      name: "Admin",
      email: "admin@example.com",
      passwordHash: hashedPassword,
      role: "admin",
      permissions: {
        canManageUsers: true,
        canManageTables: true,
        canManageAutomations: true,
        canManageClients: true,
        canManageFinances: true,
      },
      tablePermissions: {},
      allowedWriteTableIds: [],
    },
  });

  console.log("✅ נוצר משתמש אדמין בהצלחה!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📧 Email: admin@example.com");
  console.log(`🔑 Password: ${generatedPassword}`);
  console.log("👤 Name: Admin");
  console.log("🏢 Company: " + company.name);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("⚠️  חשוב! שנה את הסיסמה לאחר ההתחברות הראשונה");
}

main()
  .catch((e) => {
    console.error("❌ שגיאה בהרצת ה-seed:");
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
