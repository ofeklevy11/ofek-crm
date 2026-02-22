import { Prisma } from "@prisma/client";

/** Shared WHERE clause for permission-aware table listing. */
export function buildTablePermissionWhere(user: { companyId: number; role: string; tablePermissions?: any }): Prisma.TableMetaWhereInput {
  const where: Prisma.TableMetaWhereInput = { companyId: user.companyId, deletedAt: null };
  if (user.role !== "admin" && user.role !== "manager") {
    const allowedIds = user.tablePermissions
      ? Object.entries(user.tablePermissions as Record<string, string>)
          .filter(([, p]) => p === "read" || p === "write")
          .map(([id]) => parseInt(id))
      : [];
    where.id = { in: allowedIds };
  }
  return where;
}
