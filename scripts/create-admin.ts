import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@crm.com";
  const password = "password123";
  const hashedPassword = await bcrypt.hash(password, 10);

  console.log(`Updating/Creating admin user: ${email}...`);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash: hashedPassword,
      role: "admin",
    },
    create: {
      email,
      name: "Admin User",
      passwordHash: hashedPassword,
      role: "admin",
      allowedWriteTableIds: [],
    },
  });

  console.log(`Success! User: ${user.email}`);
  console.log(`Password: ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
