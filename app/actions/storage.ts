"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
import { UTApi } from "uploadthing/server";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const log = createLogger("Storage");

// ── Resource caps ──────────────────────────────────────────────────────
const MAX_NAME_LENGTH = 255;
const MAX_FOLDER_DEPTH = 10;
const MAX_FOLDERS_PER_COMPANY = 500;
const MAX_FILES_PER_COMPANY = 5000;

// ── Zod schemas ────────────────────────────────────────────────────────
const positiveIntSchema = z.number().int().positive();
const folderIdSchema = z.number().int().positive().nullable();
const nameSchema = z.string().min(1).max(MAX_NAME_LENGTH).trim();
const displayNameSchema = z.string().max(MAX_NAME_LENGTH).trim().nullable().optional();

const saveFileMetadataSchema = z.object({
  name: z.string().min(1).max(1000),
  url: z.string().url().max(2048),
  key: z.string().min(1).max(1000),
  size: z.number().int().nonnegative().max(100_000_000), // 100MB max
  type: z.string().min(1).max(255),
  displayName: z.string().max(MAX_NAME_LENGTH).trim().optional(),
  source: z.string().max(255).optional(),
});

// ── Helpers ────────────────────────────────────────────────────────────

let _utapi: UTApi | null = null;
function getUtapi() {
  if (!_utapi) _utapi = new UTApi();
  return _utapi;
}

/** Authenticate + authorize + rate-limit (returns user or throws) */
async function requireFilesUser(rateLimitKey: "fileRead" | "fileMutation") {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user, "canViewFiles")) throw new Error("Forbidden");

  const limited = await checkActionRateLimit(
    String(user.id),
    RATE_LIMITS[rateLimitKey],
  ).catch(() => true); // Fail closed: reject if Redis is unavailable
  if (limited) throw new Error("Rate limit exceeded");

  return user;
}

/** Compute folder depth by walking up parentId chain */
async function getFolderDepth(
  folderId: number,
  companyId: number,
): Promise<number> {
  let depth = 0;
  let currentId: number | null = folderId;
  while (currentId && depth < MAX_FOLDER_DEPTH + 1) {
    const folder = await prisma.folder.findFirst({
      where: { id: currentId, companyId },
      select: { parentId: true },
    });
    if (!folder) break;
    depth++;
    currentId = folder.parentId;
  }
  return depth;
}

// ── Server Actions ─────────────────────────────────────────────────────

export async function getAllFiles() {
  const user = await requireFilesUser("fileRead");

  const files = await prisma.file.findMany({
    where: { companyId: user.companyId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, type: true },
    take: MAX_FILES_PER_COMPANY,
  });
  return files.map((f) => ({
    ...f,
    url: `/api/files/${f.id}/download`,
  }));
}

export async function moveFileToFolder(
  fileId: number,
  targetFolderId: number | null,
) {
  const parsedFileId = positiveIntSchema.safeParse(fileId);
  if (!parsedFileId.success) throw new Error("Invalid file ID");
  const parsedFolderId = folderIdSchema.safeParse(targetFolderId);
  if (!parsedFolderId.success) throw new Error("Invalid folder ID");

  const user = await requireFilesUser("fileMutation");

  // Verify file belongs to user's company
  const file = await prisma.file.findFirst({
    where: { id: parsedFileId.data, companyId: user.companyId },
  });

  if (!file) throw new Error("File not found");

  // If moving to a folder, verify folder belongs to user's company
  if (parsedFolderId.data !== null) {
    const folder = await prisma.folder.findFirst({
      where: { id: parsedFolderId.data, companyId: user.companyId },
    });
    if (!folder) throw new Error("Folder not found");
  }

  await prisma.file.update({
    where: { id: parsedFileId.data, companyId: user.companyId },
    data: { folderId: parsedFolderId.data },
  });

  revalidatePath("/files");
}

export async function getStorageData(folderId: number | null) {
  // Validate folderId if provided
  if (folderId !== null) {
    const parsed = folderIdSchema.safeParse(folderId);
    if (!parsed.success) throw new Error("Invalid folder ID");
  }

  const user = await requireFilesUser("fileRead");

  const [folders, files, allFilesStats, currentFolder] = await Promise.all([
    prisma.folder.findMany({
      where: {
        companyId: user.companyId,
        parentId: folderId,
      },
      select: {
        id: true, name: true, parentId: true, createdAt: true, updatedAt: true,
        _count: { select: { files: true } },
        files: { select: { size: true } },
      },
      orderBy: { name: "asc" },
      take: 500,
    }),
    prisma.file.findMany({
      where: {
        companyId: user.companyId,
        folderId: folderId,
      },
      select: {
        id: true, name: true, displayName: true, url: true, size: true, type: true,
        folderId: true, recordId: true,
        createdAt: true, updatedAt: true,
        record: {
          select: {
            id: true, tableId: true,
            table: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
    prisma.file.aggregate({
      where: { companyId: user.companyId },
      _sum: { size: true },
    }),
    folderId
      ? prisma.folder.findFirst({ where: { id: folderId, companyId: user.companyId } })
      : Promise.resolve(null),
  ]);

  // Build breadcrumbs with depth guard
  let breadcrumbs: { id: number; name: string }[] = [];
  let current = currentFolder;
  if (current) {
    const crumbs: { id: number; name: string }[] = [];
    let depth = 0;
    while (current && depth < MAX_FOLDER_DEPTH) {
      crumbs.unshift({ id: current.id, name: current.name });
      if (current.parentId) {
        current = await prisma.folder.findFirst({
          where: { id: current.parentId, companyId: user.companyId },
        });
      } else {
        current = null;
      }
      depth++;
    }
    breadcrumbs = crumbs;
  }

  // Serialize dates and calculate folder sizes
  const serializedFolders = folders.map((f) => {
    const totalSize = f.files.reduce((sum, file) => sum + file.size, 0);
    const { files: _files, ...folderWithoutFiles } = f;
    return {
      ...folderWithoutFiles,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
      totalSize,
    };
  });

  const serializedFiles = files.map((f) => ({
    ...f,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
    downloadUrl: `/api/files/${f.id}/download`,
    record: f.record
      ? {
          id: f.record.id,
          tableId: f.record.tableId,
          tableName: f.record.table?.name,
          recordNumber: f.record.id,
        }
      : null,
  }));

  return {
    folders: serializedFolders,
    files: serializedFiles,
    totalUsage: allFilesStats._sum.size || 0,
    breadcrumbs,
  };
}

export async function createFolder(name: string, parentId: number | null) {
  const parsedName = nameSchema.safeParse(name);
  if (!parsedName.success) throw new Error("Invalid folder name");
  if (parentId !== null) {
    const parsed = folderIdSchema.safeParse(parentId);
    if (!parsed.success) throw new Error("Invalid parent folder ID");
  }

  const user = await requireFilesUser("fileMutation");

  // Resource cap: folder count
  const folderCount = await prisma.folder.count({
    where: { companyId: user.companyId },
  });
  if (folderCount >= MAX_FOLDERS_PER_COMPANY) {
    throw new Error("Folder limit reached");
  }

  // SECURITY: Validate parentId belongs to same company + check depth
  if (parentId) {
    const parent = await prisma.folder.findFirst({
      where: { id: parentId, companyId: user.companyId },
      select: { id: true },
    });
    if (!parent) throw new Error("Parent folder not found");

    const depth = await getFolderDepth(parentId, user.companyId);
    if (depth >= MAX_FOLDER_DEPTH) {
      throw new Error("Maximum folder depth reached");
    }
  }

  await prisma.folder.create({
    data: {
      name: parsedName.data,
      parentId,
      companyId: user.companyId,
    },
  });

  revalidatePath("/files");
}

export async function renameFolder(folderId: number, newName: string) {
  const parsedId = positiveIntSchema.safeParse(folderId);
  if (!parsedId.success) throw new Error("Invalid folder ID");
  const parsedName = nameSchema.safeParse(newName);
  if (!parsedName.success) throw new Error("Invalid folder name");

  const user = await requireFilesUser("fileMutation");

  // Verify folder belongs to user's company
  const folder = await prisma.folder.findFirst({
    where: { id: parsedId.data, companyId: user.companyId },
  });

  if (!folder) throw new Error("Folder not found");

  await prisma.folder.update({
    where: { id: parsedId.data, companyId: user.companyId },
    data: { name: parsedName.data },
  });

  revalidatePath("/files");
}

export async function saveFileMetadata(
  fileData: {
    name: string;
    url: string;
    key: string;
    size: number;
    type: string;
    displayName?: string;
    source?: string;
  },
  folderId: number | null,
  recordId?: number,
) {
  const parsed = saveFileMetadataSchema.safeParse(fileData);
  if (!parsed.success) throw new Error("Invalid file data");
  if (folderId !== null) {
    const parsedFolder = folderIdSchema.safeParse(folderId);
    if (!parsedFolder.success) throw new Error("Invalid folder ID");
  }
  if (recordId !== undefined) {
    const parsedRecord = positiveIntSchema.safeParse(recordId);
    if (!parsedRecord.success) throw new Error("Invalid record ID");
  }

  const user = await requireFilesUser("fileMutation");

  // Resource cap: file count
  const fileCount = await prisma.file.count({
    where: { companyId: user.companyId },
  });
  if (fileCount >= MAX_FILES_PER_COMPANY) {
    throw new Error("File limit reached");
  }

  // SECURITY: Validate folderId belongs to user's company
  if (folderId) {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, companyId: user.companyId },
      select: { id: true },
    });
    if (!folder) throw new Error("Invalid folder");
  }

  // SECURITY: Validate recordId belongs to user's company
  if (recordId) {
    const record = await prisma.record.findFirst({
      where: { id: recordId, companyId: user.companyId },
      select: { id: true },
    });
    if (!record) throw new Error("Invalid record");
  }

  // Check if file with same key already exists for this company (avoid duplicates)
  const existing = await prisma.file.findFirst({ where: { key: parsed.data.key, companyId: user.companyId } });
  if (existing) {
    revalidatePath("/files");
    const { url: _u, key: _k, ...safeExisting } = existing as any;
    return { ...safeExisting, downloadUrl: `/api/files/${existing.id}/download` };
  }

  const newFile = await prisma.file.create({
    data: {
      name: parsed.data.name,
      url: parsed.data.url,
      key: parsed.data.key,
      size: parsed.data.size,
      type: parsed.data.type,
      displayName: parsed.data.displayName || null,
      source: parsed.data.source || null,
      folderId,
      recordId,
      companyId: user.companyId,
    },
    select: {
      id: true, name: true, size: true, type: true, displayName: true,
      source: true, folderId: true, recordId: true,
      createdAt: true, updatedAt: true,
    },
  });
  revalidatePath("/files");
  const safeFile = newFile;
  return { ...safeFile, downloadUrl: `/api/files/${newFile.id}/download` };
}

export async function updateFile(
  fileId: number,
  data: { displayName?: string | null },
) {
  const parsedId = positiveIntSchema.safeParse(fileId);
  if (!parsedId.success) throw new Error("Invalid file ID");
  const parsedDisplayName = displayNameSchema.safeParse(data.displayName);
  if (!parsedDisplayName.success) throw new Error("Invalid display name");

  const user = await requireFilesUser("fileMutation");

  // Verify file belongs to user's company
  const file = await prisma.file.findFirst({
    where: { id: parsedId.data, companyId: user.companyId },
  });

  if (!file) throw new Error("File not found");

  await prisma.file.update({
    where: { id: parsedId.data, companyId: user.companyId },
    data: {
      displayName: parsedDisplayName.data?.trim() || null,
    },
  });

  revalidatePath("/files");
}

export async function deleteFolder(id: number) {
  const parsedId = positiveIntSchema.safeParse(id);
  if (!parsedId.success) throw new Error("Invalid folder ID");

  const user = await requireFilesUser("fileMutation");

  const folderId = parsedId.data;

  // Checking files and subfolders
  const hasChildren = await prisma.folder.findFirst({
    where: { parentId: folderId, companyId: user.companyId },
  });
  const hasFiles = await prisma.file.findFirst({
    where: { folderId: folderId, companyId: user.companyId },
  });

  // Check subfolders FIRST to avoid deleting files when folder can't be removed
  if (hasChildren) {
    throw new Error("Folder must be empty of subfolders to delete.");
  }

  if (hasFiles) {
    // Safe to delete files since no subfolders exist
    const filesToDelete = await prisma.file.findMany({
      where: { folderId: folderId, companyId: user.companyId },
      select: { key: true },
    });
    await prisma.file.deleteMany({
      where: { folderId: folderId, companyId: user.companyId },
    });
    // Clean up from UploadThing storage (best-effort)
    const keys = filesToDelete.map((f) => f.key).filter(Boolean);
    if (keys.length > 0) {
      try {
        await getUtapi().deleteFiles(keys);
      } catch (e) {
        log.error("Failed to delete files from UploadThing", { error: String(e) });
      }
    }
  }

  await prisma.folder.delete({
    where: { id: folderId, companyId: user.companyId },
  });

  revalidatePath("/files");
}

export async function deleteFile(id: number) {
  const parsedId = positiveIntSchema.safeParse(id);
  if (!parsedId.success) throw new Error("Invalid file ID");

  const user = await requireFilesUser("fileMutation");

  const file = await prisma.file.findFirst({
    where: { id: parsedId.data, companyId: user.companyId },
  });

  if (file) {
    await prisma.file.delete({
      where: { id: parsedId.data, companyId: user.companyId },
    });
    // Clean up from UploadThing storage (best-effort, don't block on failure)
    if (file.key) {
      try {
        await getUtapi().deleteFiles(file.key);
      } catch (e) {
        log.error("Failed to delete file from UploadThing", { error: String(e) });
      }
    }
  }

  revalidatePath("/files");
}
