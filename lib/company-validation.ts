import { prisma } from "@/lib/prisma";

/**
 * Multi-tenancy validation helpers.
 * Each function verifies that a referenced ID belongs to the given company.
 * Uses `select: { id: true }` for minimal data transfer.
 */

export async function validateUserInCompany(
  userId: number | undefined | null,
  companyId: number,
): Promise<boolean> {
  if (!userId) return true; // null/undefined means "no assignment" — not a violation
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return row?.companyId === companyId;
}

export async function validateWorkerInCompany(
  workerId: number | undefined | null,
  companyId: number,
): Promise<boolean> {
  if (!workerId) return true;
  const row = await prisma.worker.findFirst({
    where: { id: workerId, companyId, deletedAt: null },
    select: { id: true },
  });
  return !!row;
}

export async function validateTableInCompany(
  tableId: number | undefined | null,
  companyId: number,
): Promise<boolean> {
  if (!tableId) return true;
  const row = await prisma.tableMeta.findFirst({
    where: { id: tableId, companyId },
    select: { id: true },
  });
  return !!row;
}

export async function validateCategoryInCompany(
  categoryId: number | undefined | null,
  companyId: number,
): Promise<boolean> {
  if (!categoryId) return true;
  const row = await prisma.tableCategory.findFirst({
    where: { id: categoryId, companyId },
    select: { id: true },
  });
  return !!row;
}

export async function validateFolderInCompany(
  folderId: number | undefined | null,
  companyId: number,
): Promise<boolean> {
  if (!folderId) return true;
  const row = await prisma.folder.findFirst({
    where: { id: folderId, companyId },
    select: { id: true },
  });
  return !!row;
}

export async function validateViewFolderInCompany(
  folderId: number | undefined | null,
  companyId: number,
): Promise<boolean> {
  if (!folderId) return true;
  const row = await prisma.viewFolder.findFirst({
    where: { id: folderId, companyId },
    select: { id: true },
  });
  return !!row;
}

export async function validateClientInCompany(
  clientId: number | undefined | null,
  companyId: number,
): Promise<boolean> {
  if (!clientId) return true;
  const row = await prisma.client.findFirst({
    where: { id: clientId, companyId },
    select: { id: true },
  });
  return !!row;
}
