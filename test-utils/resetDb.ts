import { prisma } from "../lib/prisma";

export async function resetDb() {
  const tablenames = await prisma.$queryRaw<
    { tablename: string }[]
  >`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname='public'
  `;

  for (const { tablename } of tablenames) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "${tablename}" RESTART IDENTITY CASCADE;`
    );
  }
}
