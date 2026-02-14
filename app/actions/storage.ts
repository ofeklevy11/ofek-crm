"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
import { UTApi } from "uploadthing/server";

let _utapi: UTApi | null = null;
function getUtapi() {
  if (!_utapi) _utapi = new UTApi();
  return _utapi;
}

export async function getAllFiles() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const files = await prisma.file.findMany({
    where: { companyId: user.companyId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, type: true },
    take: 5000,
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
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Verify file belongs to user's company
  const file = await prisma.file.findFirst({
    where: { id: fileId, companyId: user.companyId },
  });

  if (!file) throw new Error("File not found");

  // If moving to a folder, verify folder belongs to user's company
  if (targetFolderId !== null) {
    const folder = await prisma.folder.findFirst({
      where: { id: targetFolderId, companyId: user.companyId },
    });
    if (!folder) throw new Error("Folder not found");
  }

  await prisma.file.update({
    where: { id: fileId, companyId: user.companyId },
    data: { folderId: targetFolderId },
  });

  revalidatePath("/files");
}

export async function getStorageData(folderId: number | null) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const [folders, files, allFilesStats, currentFolder] = await Promise.all([
    prisma.folder.findMany({
      where: {
        companyId: user.companyId,
        parentId: folderId,
      },
      include: {
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
      include: {
        record: {
          include: {
            table: true,
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

  // Build breadcrumbs
  let breadcrumbs: { id: number; name: string }[] = [];
  let current = currentFolder;
  if (current) {
    const crumbs: { id: number; name: string }[] = [];
    while (current) {
      crumbs.unshift({ id: current.id, name: current.name });
      if (current.parentId) {
        current = await prisma.folder.findFirst({
          where: { id: current.parentId, companyId: user.companyId },
        });
      } else {
        current = null;
      }
    }
    // Optimization: This could be N+1, but folder depth is usually shallow.
    // For a real prod app, use a recursive CTE or materialized path.
    // Given constraints, this is fine for now.
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
      totalSize, // Add total size of files in folder
    };
  });

  const serializedFiles = files.map(({ url, key, ...f }: any) => ({
    ...f,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
    downloadUrl: `/api/files/${f.id}/download`,
    // Keep record info if exists, or null for manually uploaded files
    record: f.record
      ? {
          id: f.record.id,
          tableId: f.record.tableId,
          tableName: f.record.table?.name,
          recordNumber: f.record.id, // Use record ID as the record number for display
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
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // SECURITY: Validate parentId belongs to same company
  if (parentId) {
    const parent = await prisma.folder.findFirst({
      where: { id: parentId, companyId: user.companyId },
      select: { id: true },
    });
    if (!parent) throw new Error("Parent folder not found");
  }

  await prisma.folder.create({
    data: {
      name,
      parentId,
      companyId: user.companyId,
    },
  });

  revalidatePath("/files");
}

export async function renameFolder(folderId: number, newName: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Verify folder belongs to user's company
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, companyId: user.companyId },
  });

  if (!folder) throw new Error("Folder not found");

  await prisma.folder.update({
    where: { id: folderId, companyId: user.companyId },
    data: { name: newName },
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
  console.log("Saving file metadata start:", fileData.name);
  const user = await getCurrentUser();
  if (!user) {
    console.error("Unauthorized saveFileMetadata");
    throw new Error("Unauthorized");
  }

  try {
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
    const existing = await prisma.file.findFirst({ where: { key: fileData.key, companyId: user.companyId } });
    if (existing) {
      console.log("File already exists in DB:", existing.id);
      revalidatePath("/files");
      const { url: _u, key: _k, ...safeExisting } = existing as any;
      return { ...safeExisting, downloadUrl: `/api/files/${existing.id}/download` };
    }

    const newFile = await prisma.file.create({
      data: {
        name: fileData.name,
        url: fileData.url,
        key: fileData.key,
        size: fileData.size,
        type: fileData.type,
        displayName: fileData.displayName || null,
        source: fileData.source || null,
        folderId,
        recordId,
        companyId: user.companyId,
      },
    });
    console.log("File saved to DB:", newFile.id);
    revalidatePath("/files");
    const { url: _u, key: _k, ...safeFile } = newFile as any;
    return { ...safeFile, downloadUrl: `/api/files/${newFile.id}/download` };
  } catch (error) {
    console.error("Error saving to DB:", error);
    throw error;
  }
}

export async function updateFile(
  fileId: number,
  data: { displayName?: string | null },
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Verify file belongs to user's company
  const file = await prisma.file.findFirst({
    where: { id: fileId, companyId: user.companyId },
  });

  if (!file) throw new Error("File not found");

  await prisma.file.update({
    where: { id: fileId, companyId: user.companyId },
    data: {
      displayName: data.displayName?.trim() || null,
    },
  });

  revalidatePath("/files");
}

export async function deleteFolder(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Prisma cascade delete should handle children if configured,
  // but we didn't strictly configure cascade on the self-relation `children`.
  // We should manually check or enforce cascade.
  // For now, let's assume we can just delete.
  // NOTE: If folder has files, we need to decide.
  // For safety, let's delete recursively manually or rely on onDelete: Cascade if we added it?
  // We didn't add onDelete: Cascade to the schema for self-relation.
  // Let's just delete the folder and let Prisma error if there are constraints, or handle it.
  // Actually, we should probably recursively delete or only allow delete if empty.
  // Let's implement delete if empty for safety first, or just bulk delete.

  // Checking files and subfolders
  const hasChildren = await prisma.folder.findFirst({
    where: { parentId: id, companyId: user.companyId },
  });
  const hasFiles = await prisma.file.findFirst({
    where: { folderId: id, companyId: user.companyId },
  });

  if (hasChildren || hasFiles) {
    // For this MVP, let's just delete them.
    // We need to fetch all files to delete them from Uploadthing too?
    // Step 1: Delete all files in this folder (and subfolders ideally).
    // This is getting complex for a simple delete.
    // Let's just `deleteMany` files in this folder.

    // Collect file keys before deleting from DB
    const filesToDelete = await prisma.file.findMany({
      where: { folderId: id, companyId: user.companyId },
      select: { key: true },
    });
    await prisma.file.deleteMany({
      where: { folderId: id, companyId: user.companyId },
    });
    // Clean up from UploadThing storage (best-effort)
    const keys = filesToDelete.map((f) => f.key).filter(Boolean);
    if (keys.length > 0) {
      try {
        await getUtapi().deleteFiles(keys);
      } catch (e) {
        console.error("Failed to delete files from UploadThing:", e);
      }
    }
    // Children folders? Recursion?
    // Let's keeping it simple: Only delete if no subfolders.
    if (hasChildren) {
      throw new Error("Folder must be empty of subfolders to delete.");
    }
  }

  await prisma.folder.delete({
    where: { id, companyId: user.companyId },
  });

  revalidatePath("/files");
}

export async function deleteFile(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const file = await prisma.file.findFirst({
    where: { id, companyId: user.companyId },
  });

  if (file) {
    await prisma.file.delete({
      where: { id, companyId: user.companyId },
    });
    // Clean up from UploadThing storage (best-effort, don't block on failure)
    if (file.key) {
      try {
        await getUtapi().deleteFiles(file.key);
      } catch (e) {
        console.error("Failed to delete file from UploadThing:", e);
      }
    }
  }

  revalidatePath("/files");
}
