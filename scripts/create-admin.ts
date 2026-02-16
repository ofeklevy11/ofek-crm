import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@crm.com";
  const password = crypto.randomBytes(16).toString("hex");
  const hashedPassword = await bcrypt.hash(password, 10);

  console.log(`Updating/Creating admin user: ${email}...`);

  // Ensure a default company exists
  const company = await prisma.company.upsert({
    where: { slug: "default" },
    update: {},
    create: {
      name: "Default Company",
      slug: "default",
    },
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash: hashedPassword,
      role: "admin",
      companyId: company.id,
    },
    create: {
      email,
      name: "Admin User",
      passwordHash: hashedPassword,
      role: "admin",
      allowedWriteTableIds: [],
      companyId: company.id,
    },
  });

  process.stdout.write(`Success! User: ${user.email}\n`);
  process.stdout.write(`Password: ${password}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
