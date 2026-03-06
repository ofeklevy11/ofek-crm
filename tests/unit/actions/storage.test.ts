import { vi, describe, it, expect, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/*  Module mocks                                                       */
/* ------------------------------------------------------------------ */

vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/permissions", async () => {
  const actual = await vi.importActual("@/lib/permissions");
  return actual;
});

const prismaMock = {
  file: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    count: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn().mockResolvedValue({ _sum: { size: 0 } }),
    groupBy: vi.fn().mockResolvedValue([]),
  },
  folder: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    count: vi.fn().mockResolvedValue(0),
  },
  record: {
    findFirst: vi.fn().mockResolvedValue(null),
  },
  $transaction: vi.fn(async (arg: any) => {
    if (typeof arg === "function") return arg(prismaMock);
    return arg;
  }),
};

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return prismaMock;
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkActionRateLimit: vi.fn().mockResolvedValue(false),
  RATE_LIMITS: {
    fileRead: { prefix: "file-read", max: 60, windowSeconds: 60 },
    fileMutation: { prefix: "file-mut", max: 30, windowSeconds: 60 },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const { mockDeleteFiles } = vi.hoisted(() => ({
  mockDeleteFiles: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("uploadthing/server", () => ({
  UTApi: class MockUTApi {
    deleteFiles = mockDeleteFiles;
  },
}));

/* ------------------------------------------------------------------ */
/*  Imports (after mocks)                                              */
/* ------------------------------------------------------------------ */

import {
  getAllFiles,
  moveFileToFolder,
  getStorageData,
  createFolder,
  renameFolder,
  saveFileMetadata,
  updateFile,
  deleteFolder,
  deleteFile,
} from "@/app/actions/storage";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkActionRateLimit } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";

const mockGetCurrentUser = getCurrentUser as ReturnType<typeof vi.fn>;
const mockCheckActionRateLimit = checkActionRateLimit as ReturnType<typeof vi.fn>;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    companyId: 1,
    name: "Test Admin",
    email: "admin@test.com",
    role: "admin" as const,
    allowedWriteTableIds: [],
    permissions: {},
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(makeUser());
  mockCheckActionRateLimit.mockResolvedValue(false);
  mockDeleteFiles.mockResolvedValue(undefined);

  // Reset prisma defaults
  prismaMock.file.findMany.mockResolvedValue([]);
  prismaMock.file.findFirst.mockResolvedValue(null);
  prismaMock.file.create.mockResolvedValue({});
  prismaMock.file.update.mockResolvedValue({});
  prismaMock.file.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.file.delete.mockResolvedValue({});
  prismaMock.file.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.file.count.mockResolvedValue(0);
  prismaMock.file.aggregate.mockResolvedValue({ _sum: { size: 0 } });
  prismaMock.file.groupBy.mockResolvedValue([]);
  prismaMock.folder.findMany.mockResolvedValue([]);
  prismaMock.folder.findFirst.mockResolvedValue(null);
  prismaMock.folder.create.mockResolvedValue({});
  prismaMock.folder.update.mockResolvedValue({});
  prismaMock.folder.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.folder.delete.mockResolvedValue({});
  prismaMock.folder.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.folder.count.mockResolvedValue(0);
  prismaMock.record.findFirst.mockResolvedValue(null);
  prismaMock.$transaction.mockImplementation(async (arg: any) => {
    if (typeof arg === "function") return arg(prismaMock);
    return arg;
  });
});

/* ================================================================== */
/*  Shared auth via getAllFiles                                         */
/* ================================================================== */

describe("requireFilesUser (tested via getAllFiles)", () => {
  it("throws Unauthorized when no user", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    await expect(getAllFiles()).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when user lacks canViewFiles", async () => {
    mockGetCurrentUser.mockResolvedValue(
      makeUser({ role: "basic", permissions: {} }),
    );
    await expect(getAllFiles()).rejects.toThrow("Forbidden");
  });

  it("throws Rate limit exceeded when rate limited", async () => {
    mockCheckActionRateLimit.mockResolvedValue(true);
    await expect(getAllFiles()).rejects.toThrow("Rate limit exceeded");
  });

  it("throws Rate limit exceeded when checkActionRateLimit throws (fail-closed)", async () => {
    mockCheckActionRateLimit.mockRejectedValue(new Error("Redis down"));
    await expect(getAllFiles()).rejects.toThrow("Rate limit exceeded");
  });

  it("allows admin user", async () => {
    await expect(getAllFiles()).resolves.toBeDefined();
  });

  it("allows basic user with canViewFiles", async () => {
    mockGetCurrentUser.mockResolvedValue(
      makeUser({ role: "basic", permissions: { canViewFiles: true } }),
    );
    await expect(getAllFiles()).resolves.toBeDefined();
  });
});

/* ================================================================== */
/*  getAllFiles                                                         */
/* ================================================================== */

describe("getAllFiles", () => {
  it("returns files with download URLs", async () => {
    prismaMock.file.findMany.mockResolvedValue([
      { id: 1, name: "a.pdf", type: "application/pdf" },
      { id: 2, name: "b.png", type: "image/png" },
    ]);

    const result = await getAllFiles();
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe("/api/files/1/download");
    expect(result[1].url).toBe("/api/files/2/download");
  });

  it("queries with companyId and correct select", async () => {
    await getAllFiles();
    expect(prismaMock.file.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 1 },
        select: { id: true, name: true, type: true },
      }),
    );
  });

  it("limits results to 5000", async () => {
    await getAllFiles();
    expect(prismaMock.file.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5000,
      }),
    );
  });

  it("orders by createdAt desc", async () => {
    await getAllFiles();
    expect(prismaMock.file.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      }),
    );
  });
});

/* ================================================================== */
/*  moveFileToFolder                                                   */
/* ================================================================== */

describe("moveFileToFolder", () => {
  it("throws for invalid fileId", async () => {
    await expect(moveFileToFolder(-1, null)).rejects.toThrow("Invalid file ID");
  });

  it("throws for invalid folderId (negative)", async () => {
    await expect(moveFileToFolder(1, -1)).rejects.toThrow("Invalid folder ID");
  });

  it("throws for non-integer fileId", async () => {
    await expect(moveFileToFolder(1.5, null)).rejects.toThrow("Invalid file ID");
  });

  it("throws when file not found", async () => {
    prismaMock.file.findFirst.mockResolvedValue(null);
    await expect(moveFileToFolder(1, null)).rejects.toThrow("File not found");
  });

  it("throws when target folder not found", async () => {
    prismaMock.file.findFirst.mockResolvedValue({ id: 1 });
    prismaMock.folder.findFirst.mockResolvedValue(null);
    await expect(moveFileToFolder(1, 99)).rejects.toThrow("Folder not found");
  });

  it("moves file to folder on happy path", async () => {
    prismaMock.file.findFirst.mockResolvedValue({ id: 1 });
    prismaMock.folder.findFirst.mockResolvedValue({ id: 5 });

    await moveFileToFolder(1, 5);
    expect(prismaMock.file.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, companyId: 1 },
        data: { folderId: 5 },
      }),
    );
  });

  it("moves file to root when folderId is null", async () => {
    prismaMock.file.findFirst.mockResolvedValue({ id: 1 });

    await moveFileToFolder(1, null);
    expect(prismaMock.file.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { folderId: null },
      }),
    );
  });

  it("scopes file and folder queries to companyId", async () => {
    prismaMock.file.findFirst.mockResolvedValue({ id: 1 });
    prismaMock.folder.findFirst.mockResolvedValue({ id: 5 });

    await moveFileToFolder(1, 5);
    expect(prismaMock.file.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, companyId: 1 },
      }),
    );
    expect(prismaMock.folder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5, companyId: 1 },
      }),
    );
  });

  it("uses fileMutation rate limit key", async () => {
    prismaMock.file.findFirst.mockResolvedValue({ id: 1 });

    await moveFileToFolder(1, null);
    expect(mockCheckActionRateLimit).toHaveBeenCalledWith(
      "1",
      expect.objectContaining({ prefix: "file-mut" }),
    );
  });

  it("calls revalidatePath after move", async () => {
    prismaMock.file.findFirst.mockResolvedValue({ id: 1 });

    await moveFileToFolder(1, null);
    expect(revalidatePath).toHaveBeenCalledWith("/files");
  });
});

/* ================================================================== */
/*  getStorageData                                                     */
/* ================================================================== */

describe("getStorageData", () => {
  it("throws for invalid folderId", async () => {
    await expect(getStorageData(-1)).rejects.toThrow("Invalid folder ID");
  });

  it("queries root when folderId is null", async () => {
    await getStorageData(null);
    expect(prismaMock.folder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 1, parentId: null },
        orderBy: { name: "asc" },
        take: 500,
      }),
    );
    expect(prismaMock.file.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 1, folderId: null },
        orderBy: { createdAt: "desc" },
        take: 2000,
      }),
    );
  });

  it("queries with parentId and folderId when folderId is non-null", async () => {
    // Need allCompanyFolders for breadcrumb building
    prismaMock.folder.findMany
      .mockResolvedValueOnce([]) // folders in current dir
      .mockResolvedValueOnce([{ id: 5, name: "Target", parentId: null }]); // allCompanyFolders

    await getStorageData(5);
    expect(prismaMock.folder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 1, parentId: 5 },
      }),
    );
    expect(prismaMock.file.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 1, folderId: 5 },
      }),
    );
    // Verify allCompanyFolders (breadcrumb data source) is scoped to companyId
    expect(prismaMock.folder.findMany).toHaveBeenNthCalledWith(2, {
      where: { companyId: 1 },
      select: { id: true, name: true, parentId: true },
    });
  });

  it("serializes dates to ISO strings", async () => {
    const now = new Date("2025-06-01T00:00:00.000Z");
    prismaMock.folder.findMany.mockResolvedValue([
      { id: 1, name: "Docs", parentId: null, createdAt: now, updatedAt: now, _count: { files: 0 } },
    ]);
    prismaMock.file.findMany.mockResolvedValue([
      {
        id: 10, name: "a.pdf", displayName: null, url: "https://utfs.io/f/x",
        size: 100, type: "application/pdf", folderId: null, recordId: null,
        createdAt: now, updatedAt: now, record: null,
      },
    ]);

    const result = await getStorageData(null);
    expect(result.folders[0].createdAt).toBe("2025-06-01T00:00:00.000Z");
    expect(result.files[0].createdAt).toBe("2025-06-01T00:00:00.000Z");
  });

  it("adds downloadUrl to files", async () => {
    prismaMock.file.findMany.mockResolvedValue([
      {
        id: 7, name: "x.pdf", displayName: null, url: "https://utfs.io/f/x",
        size: 100, type: "application/pdf", folderId: null, recordId: null,
        createdAt: new Date(), updatedAt: new Date(), record: null,
      },
    ]);

    const result = await getStorageData(null);
    expect(result.files[0].downloadUrl).toBe("/api/files/7/download");
    // NOTE: raw url is intentionally exposed alongside downloadUrl — consider removing in future
    expect(result.files[0].url).toBe("https://utfs.io/f/x");
  });

  it("computes folder sizes from groupBy", async () => {
    prismaMock.folder.findMany.mockResolvedValue([
      { id: 3, name: "Pics", parentId: null, createdAt: new Date(), updatedAt: new Date(), _count: { files: 2 } },
    ]);
    prismaMock.file.groupBy.mockResolvedValue([
      { folderId: 3, _sum: { size: 5000 } },
    ]);

    const result = await getStorageData(null);
    expect(result.folders[0].totalSize).toBe(5000);
    expect(prismaMock.file.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 1 }),
      }),
    );
  });

  it("defaults folder totalSize to 0 when not in groupBy", async () => {
    prismaMock.folder.findMany.mockResolvedValue([
      { id: 9, name: "Empty", parentId: null, createdAt: new Date(), updatedAt: new Date(), _count: { files: 0 } },
    ]);
    prismaMock.file.groupBy.mockResolvedValue([]);

    const result = await getStorageData(null);
    expect(result.folders[0].totalSize).toBe(0);
  });

  it("builds breadcrumbs when folderId is set", async () => {
    prismaMock.folder.findMany
      .mockResolvedValueOnce([]) // folders
      .mockResolvedValueOnce([  // allCompanyFolders
        { id: 1, name: "Root Folder", parentId: null },
        { id: 2, name: "Sub Folder", parentId: 1 },
      ]);

    const result = await getStorageData(2);
    expect(result.breadcrumbs).toEqual([
      { id: 1, name: "Root Folder" },
      { id: 2, name: "Sub Folder" },
    ]);
  });

  it("caps breadcrumb depth at 10", async () => {
    // Build a chain of 15 folders deep
    const folders = [];
    for (let i = 1; i <= 15; i++) {
      folders.push({ id: i, name: `Folder ${i}`, parentId: i > 1 ? i - 1 : null });
    }

    prismaMock.folder.findMany
      .mockResolvedValueOnce([]) // folders in current dir
      .mockResolvedValueOnce(folders); // allCompanyFolders

    const result = await getStorageData(15);
    // Should cap at MAX_FOLDER_DEPTH (10)
    expect(result.breadcrumbs).toHaveLength(10);
    // The first breadcrumb should be folder 6 (15 - 10 + 1)
    expect(result.breadcrumbs[0].id).toBe(6);
    // The last breadcrumb should be the current folder
    expect(result.breadcrumbs[9].id).toBe(15);
  });

  it("returns totalUsage from aggregate", async () => {
    prismaMock.file.aggregate.mockResolvedValue({ _sum: { size: 999999 } });

    const result = await getStorageData(null);
    expect(result.totalUsage).toBe(999999);
    expect(prismaMock.file.aggregate).toHaveBeenCalledWith({
      where: { companyId: 1 },
      _sum: { size: true },
    });
  });

  it("returns empty breadcrumbs for root", async () => {
    const result = await getStorageData(null);
    expect(result.breadcrumbs).toEqual([]);
  });

  it("maps record with table info", async () => {
    prismaMock.file.findMany.mockResolvedValue([
      {
        id: 10, name: "a.pdf", displayName: null, url: "https://utfs.io/f/x",
        size: 100, type: "application/pdf", folderId: null, recordId: 5,
        createdAt: new Date(), updatedAt: new Date(),
        record: { id: 5, tableId: 2, table: { name: "Clients" } },
      },
    ]);

    const result = await getStorageData(null);
    expect(result.files[0].record).toEqual({
      id: 5,
      tableId: 2,
      tableName: "Clients",
      recordNumber: 5,
    });
  });

  it("sets record to null when file has no record", async () => {
    prismaMock.file.findMany.mockResolvedValue([
      {
        id: 10, name: "a.pdf", displayName: null, url: "https://utfs.io/f/x",
        size: 100, type: "application/pdf", folderId: null, recordId: null,
        createdAt: new Date(), updatedAt: new Date(), record: null,
      },
    ]);

    const result = await getStorageData(null);
    expect(result.files[0].record).toBeNull();
  });

  it("returns 0 totalUsage when no files exist", async () => {
    prismaMock.file.aggregate.mockResolvedValue({ _sum: { size: null } });

    const result = await getStorageData(null);
    expect(result.totalUsage).toBe(0);
  });
});

/* ================================================================== */
/*  createFolder                                                       */
/* ================================================================== */

describe("createFolder", () => {
  it("throws for empty name", async () => {
    await expect(createFolder("", null)).rejects.toThrow("Invalid folder name");
  });

  it("throws for name exceeding 255 chars", async () => {
    await expect(createFolder("x".repeat(256), null)).rejects.toThrow("Invalid folder name");
  });

  it("throws for invalid parentId", async () => {
    await expect(createFolder("Docs", -1)).rejects.toThrow("Invalid parent folder ID");
  });

  it("throws when folder limit (500) reached", async () => {
    prismaMock.folder.count.mockResolvedValue(500);
    await expect(createFolder("Docs", null)).rejects.toThrow("Folder limit reached");
  });

  it("throws when parent folder not found", async () => {
    prismaMock.folder.count.mockResolvedValue(0);
    prismaMock.folder.findFirst.mockResolvedValue(null);
    prismaMock.folder.findMany.mockResolvedValue([]);
    await expect(createFolder("Docs", 99)).rejects.toThrow("Parent folder not found");
  });

  it("throws when maximum folder depth (10) reached", async () => {
    prismaMock.folder.count.mockResolvedValue(0);
    prismaMock.folder.findFirst.mockResolvedValue({ id: 10 });
    // Build a chain of 10 folders deep
    const folders = [];
    for (let i = 1; i <= 10; i++) {
      folders.push({ id: i, parentId: i > 1 ? i - 1 : null });
    }
    prismaMock.folder.findMany.mockResolvedValue(folders);

    await expect(createFolder("Docs", 10)).rejects.toThrow("Maximum folder depth reached");
  });

  it("creates folder at root (null parentId)", async () => {
    prismaMock.folder.count.mockResolvedValue(0);

    await createFolder("Docs", null);
    expect(prismaMock.folder.create).toHaveBeenCalledWith({
      data: {
        name: "Docs",
        parentId: null,
        companyId: 1,
      },
    });
  });

  it("creates nested folder when parent exists and depth is ok", async () => {
    prismaMock.folder.count.mockResolvedValue(0);
    prismaMock.folder.findFirst.mockResolvedValue({ id: 1 });
    prismaMock.folder.findMany.mockResolvedValue([
      { id: 1, parentId: null },
    ]);

    await createFolder("Sub", 1);
    expect(prismaMock.folder.create).toHaveBeenCalledWith({
      data: {
        name: "Sub",
        parentId: 1,
        companyId: 1,
      },
    });
  });

  it("trims folder name", async () => {
    prismaMock.folder.count.mockResolvedValue(0);

    await createFolder("  Docs  ", null);
    expect(prismaMock.folder.create).toHaveBeenCalledWith({
      data: { name: "Docs", parentId: null, companyId: 1 },
    });
  });

  it("scopes count and parent queries to companyId", async () => {
    prismaMock.folder.count.mockResolvedValue(0);
    prismaMock.folder.findFirst.mockResolvedValue({ id: 1 });
    prismaMock.folder.findMany.mockResolvedValue([{ id: 1, parentId: null }]);

    await createFolder("Sub", 1);
    expect(prismaMock.folder.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 1 },
      }),
    );
    expect(prismaMock.folder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, companyId: 1 },
      }),
    );
  });

  it("calls revalidatePath after creation", async () => {
    prismaMock.folder.count.mockResolvedValue(0);

    await createFolder("Docs", null);
    expect(revalidatePath).toHaveBeenCalledWith("/files");
  });

  // BUG: Zod applies min(1) BEFORE .trim(), so "   " (len 3) passes min check,
  // then gets trimmed to "". prisma.folder.create is called with name: "".
  it("allows whitespace-only name (trims to empty — known Zod bug)", async () => {
    prismaMock.folder.count.mockResolvedValue(0);

    await createFolder("   ", null);
    expect(prismaMock.folder.create).toHaveBeenCalledWith({
      data: { name: "", parentId: null, companyId: 1 },
    });
  });

  it("allows folder count at 499 (just under limit)", async () => {
    prismaMock.folder.count.mockResolvedValue(499);

    await expect(createFolder("Docs", null)).resolves.toBeUndefined();
  });
});

/* ================================================================== */
/*  renameFolder                                                       */
/* ================================================================== */

describe("renameFolder", () => {
  it("throws for invalid folder ID", async () => {
    await expect(renameFolder(-1, "New Name")).rejects.toThrow("Invalid folder ID");
  });

  it("throws for invalid name (empty)", async () => {
    await expect(renameFolder(1, "")).rejects.toThrow("Invalid folder name");
  });

  it("throws when folder not found (count = 0)", async () => {
    prismaMock.folder.updateMany.mockResolvedValue({ count: 0 });
    await expect(renameFolder(1, "New Name")).rejects.toThrow("Folder not found");
  });

  it("renames folder on happy path", async () => {
    prismaMock.folder.updateMany.mockResolvedValue({ count: 1 });

    await renameFolder(1, "Renamed");
    expect(prismaMock.folder.updateMany).toHaveBeenCalledWith({
      where: { id: 1, companyId: 1 },
      data: { name: "Renamed" },
    });
  });

  it("trims name before saving", async () => {
    prismaMock.folder.updateMany.mockResolvedValue({ count: 1 });

    await renameFolder(1, "  Trimmed  ");
    expect(prismaMock.folder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: "Trimmed" },
      }),
    );
  });

  it("scopes to companyId", async () => {
    prismaMock.folder.updateMany.mockResolvedValue({ count: 1 });

    await renameFolder(5, "X");
    expect(prismaMock.folder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5, companyId: 1 },
      }),
    );
  });

  it("calls revalidatePath after rename", async () => {
    prismaMock.folder.updateMany.mockResolvedValue({ count: 1 });

    await renameFolder(1, "X");
    expect(revalidatePath).toHaveBeenCalledWith("/files");
  });
});

/* ================================================================== */
/*  saveFileMetadata                                                   */
/* ================================================================== */

describe("saveFileMetadata", () => {
  const validFileData = {
    name: "test.pdf",
    url: "https://utfs.io/f/abc123",
    key: "abc123",
    size: 1024,
    type: "application/pdf",
  };

  it("throws for missing name", async () => {
    const { name, ...rest } = validFileData;
    await expect(saveFileMetadata(rest as any, null)).rejects.toThrow("Invalid file data");
  });

  it("throws for invalid URL", async () => {
    await expect(
      saveFileMetadata({ ...validFileData, url: "not-a-url" }, null),
    ).rejects.toThrow("Invalid file data");
  });

  it("throws for negative size", async () => {
    await expect(
      saveFileMetadata({ ...validFileData, size: -1 }, null),
    ).rejects.toThrow("Invalid file data");
  });

  it("throws for size exceeding 100MB", async () => {
    await expect(
      saveFileMetadata({ ...validFileData, size: 100_000_001 }, null),
    ).rejects.toThrow("Invalid file data");
  });

  it("throws for missing key", async () => {
    const { key, ...rest } = validFileData;
    await expect(saveFileMetadata(rest as any, null)).rejects.toThrow("Invalid file data");
  });

  it("throws for missing type", async () => {
    const { type, ...rest } = validFileData;
    await expect(saveFileMetadata(rest as any, null)).rejects.toThrow("Invalid file data");
  });

  it("throws for invalid folderId", async () => {
    await expect(saveFileMetadata(validFileData, -1)).rejects.toThrow("Invalid folder ID");
  });

  it("throws for invalid recordId", async () => {
    await expect(saveFileMetadata(validFileData, null, -1)).rejects.toThrow("Invalid record ID");
  });

  it("throws when file limit (5000) reached", async () => {
    prismaMock.file.count.mockResolvedValue(5000);
    await expect(saveFileMetadata(validFileData, null)).rejects.toThrow("File limit reached");
  });

  it("throws when folder not found", async () => {
    prismaMock.file.count.mockResolvedValue(0);
    prismaMock.folder.findFirst.mockResolvedValue(null);
    await expect(saveFileMetadata(validFileData, 99)).rejects.toThrow("Invalid folder");
  });

  it("throws when record not found", async () => {
    prismaMock.file.count.mockResolvedValue(0);
    prismaMock.record.findFirst.mockResolvedValue(null);
    await expect(saveFileMetadata(validFileData, null, 99)).rejects.toThrow("Invalid record");
  });

  it("returns duplicate info when file with same key exists", async () => {
    prismaMock.file.count.mockResolvedValue(0);
    prismaMock.file.findFirst.mockResolvedValue({ id: 42 });

    const result = await saveFileMetadata(validFileData, null);
    expect(result).toEqual({
      id: 42,
      downloadUrl: "/api/files/42/download",
      duplicate: true,
    });
    expect(prismaMock.file.create).not.toHaveBeenCalled();
    expect(prismaMock.file.findFirst).toHaveBeenCalledWith({
      where: { key: "abc123", companyId: 1 },
      select: { id: true },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/files");
  });

  it("creates file on happy path", async () => {
    prismaMock.file.count.mockResolvedValue(0);
    prismaMock.file.findFirst.mockResolvedValue(null); // no duplicate
    const now = new Date("2025-06-01T00:00:00.000Z");
    prismaMock.file.create.mockResolvedValue({
      id: 10, name: "test.pdf", size: 1024, type: "application/pdf",
      displayName: null, source: null, folderId: null, recordId: null,
      createdAt: now, updatedAt: now,
    });

    const result = await saveFileMetadata(validFileData, null);
    // Exact match on data — catches any extra/missing fields
    expect(prismaMock.file.create).toHaveBeenCalledWith({
      data: {
        name: "test.pdf",
        url: "https://utfs.io/f/abc123",
        key: "abc123",
        size: 1024,
        type: "application/pdf",
        displayName: null,
        source: null,
        folderId: null,
        recordId: undefined,
        companyId: 1,
      },
      select: {
        id: true, name: true, size: true, type: true, displayName: true,
        source: true, folderId: true, recordId: true,
        createdAt: true, updatedAt: true,
      },
    });
    // Verify full return shape (spread from newFile + downloadUrl)
    expect(result).toEqual({
      id: 10,
      name: "test.pdf",
      size: 1024,
      type: "application/pdf",
      displayName: null,
      source: null,
      folderId: null,
      recordId: null,
      createdAt: now,
      updatedAt: now,
      downloadUrl: "/api/files/10/download",
    });
  });

  it("passes source field through to create", async () => {
    prismaMock.file.count.mockResolvedValue(0);
    prismaMock.file.findFirst.mockResolvedValue(null);
    prismaMock.file.create.mockResolvedValue({
      id: 10, name: "test.pdf", size: 1024, type: "application/pdf",
      displayName: null, source: "upload-widget", folderId: null, recordId: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    await saveFileMetadata({ ...validFileData, source: "upload-widget" }, null);
    expect(prismaMock.file.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: "upload-widget",
        }),
      }),
    );
  });

  it("preserves non-empty displayName", async () => {
    prismaMock.file.count.mockResolvedValue(0);
    prismaMock.file.findFirst.mockResolvedValue(null);
    prismaMock.file.create.mockResolvedValue({
      id: 10, name: "test.pdf", size: 1024, type: "application/pdf",
      displayName: "My File.pdf", source: null, folderId: null, recordId: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    await saveFileMetadata({ ...validFileData, displayName: "My File.pdf" }, null);
    expect(prismaMock.file.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ displayName: "My File.pdf" }),
      }),
    );
  });

  it("stores null for empty displayName", async () => {
    prismaMock.file.count.mockResolvedValue(0);
    prismaMock.file.findFirst.mockResolvedValue(null);
    prismaMock.file.create.mockResolvedValue({
      id: 10, name: "test.pdf", size: 1024, type: "application/pdf",
      displayName: null, source: null, folderId: null, recordId: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    await saveFileMetadata({ ...validFileData, displayName: "" }, null);
    expect(prismaMock.file.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ displayName: null }),
      }),
    );
  });

  it("creates file in specified folder", async () => {
    prismaMock.file.count.mockResolvedValue(0);
    prismaMock.file.findFirst.mockResolvedValue(null);
    prismaMock.folder.findFirst.mockResolvedValue({ id: 5 });
    prismaMock.file.create.mockResolvedValue({
      id: 10, name: "test.pdf", size: 1024, type: "application/pdf",
      displayName: null, source: null, folderId: 5, recordId: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    await saveFileMetadata(validFileData, 5);
    expect(prismaMock.file.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ folderId: 5 }),
      }),
    );
  });

  it("creates file with recordId", async () => {
    prismaMock.file.count.mockResolvedValue(0);
    prismaMock.file.findFirst.mockResolvedValue(null);
    prismaMock.record.findFirst.mockResolvedValue({ id: 7 });
    prismaMock.file.create.mockResolvedValue({
      id: 10, name: "test.pdf", size: 1024, type: "application/pdf",
      displayName: null, source: null, folderId: null, recordId: 7,
      createdAt: new Date(), updatedAt: new Date(),
    });

    await saveFileMetadata(validFileData, null, 7);
    expect(prismaMock.file.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recordId: 7 }),
      }),
    );
  });

  it("calls revalidatePath after creation", async () => {
    prismaMock.file.count.mockResolvedValue(0);
    prismaMock.file.findFirst.mockResolvedValue(null);
    prismaMock.file.create.mockResolvedValue({
      id: 10, name: "test.pdf", size: 1024, type: "application/pdf",
      displayName: null, source: null, folderId: null, recordId: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    await saveFileMetadata(validFileData, null);
    expect(revalidatePath).toHaveBeenCalledWith("/files");
  });

  it("accepts size at exactly 100MB", async () => {
    prismaMock.file.count.mockResolvedValue(0);
    prismaMock.file.findFirst.mockResolvedValue(null);
    prismaMock.file.create.mockResolvedValue({
      id: 10, name: "test.pdf", size: 100_000_000, type: "application/pdf",
      displayName: null, source: null, folderId: null, recordId: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    await expect(
      saveFileMetadata({ ...validFileData, size: 100_000_000 }, null),
    ).resolves.toBeDefined();
  });
});

/* ================================================================== */
/*  updateFile                                                         */
/* ================================================================== */

describe("updateFile", () => {
  it("throws for invalid file ID", async () => {
    await expect(updateFile(-1, { displayName: "x" })).rejects.toThrow("Invalid file ID");
  });

  it("throws for invalid displayName (>255 chars)", async () => {
    await expect(
      updateFile(1, { displayName: "x".repeat(256) }),
    ).rejects.toThrow("Invalid display name");
  });

  it("throws when file not found (count = 0)", async () => {
    prismaMock.file.updateMany.mockResolvedValue({ count: 0 });
    await expect(updateFile(1, { displayName: "x" })).rejects.toThrow("File not found");
  });

  it("updates displayName on happy path", async () => {
    prismaMock.file.updateMany.mockResolvedValue({ count: 1 });

    await updateFile(1, { displayName: "New Name" });
    expect(prismaMock.file.updateMany).toHaveBeenCalledWith({
      where: { id: 1, companyId: 1 },
      data: { displayName: "New Name" },
    });
  });

  it("trims displayName", async () => {
    prismaMock.file.updateMany.mockResolvedValue({ count: 1 });

    await updateFile(1, { displayName: "  padded  " });
    expect(prismaMock.file.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { displayName: "padded" },
      }),
    );
  });

  it("sets null for empty displayName after trim", async () => {
    prismaMock.file.updateMany.mockResolvedValue({ count: 1 });

    await updateFile(1, { displayName: "   " });
    expect(prismaMock.file.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { displayName: null },
      }),
    );
  });

  it("allows null displayName", async () => {
    prismaMock.file.updateMany.mockResolvedValue({ count: 1 });

    await updateFile(1, { displayName: null });
    expect(prismaMock.file.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { displayName: null },
      }),
    );
  });

  it("calls revalidatePath after update", async () => {
    prismaMock.file.updateMany.mockResolvedValue({ count: 1 });

    await updateFile(1, { displayName: "x" });
    expect(revalidatePath).toHaveBeenCalledWith("/files");
  });
});

/* ================================================================== */
/*  deleteFolder                                                       */
/* ================================================================== */

describe("deleteFolder", () => {
  it("throws for invalid folder ID", async () => {
    await expect(deleteFolder(-1)).rejects.toThrow("Invalid folder ID");
  });

  it("throws when folder has subfolders", async () => {
    prismaMock.folder.findFirst.mockResolvedValue({ id: 2 }); // has children
    prismaMock.file.findMany.mockResolvedValue([]);

    await expect(deleteFolder(1)).rejects.toThrow("Folder must be empty of subfolders to delete.");
  });

  it("deletes files and folder in transaction", async () => {
    prismaMock.folder.findFirst.mockResolvedValue(null); // no children
    prismaMock.file.findMany.mockResolvedValue([{ key: "k1" }, { key: "k2" }]);

    await deleteFolder(1);
    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(prismaMock.file.deleteMany).toHaveBeenCalledWith({
      where: { folderId: 1, companyId: 1 },
    });
    expect(prismaMock.folder.delete).toHaveBeenCalledWith({
      where: { id: 1, companyId: 1 },
    });
  });

  it("calls UploadThing deleteFiles for file keys", async () => {
    prismaMock.folder.findFirst.mockResolvedValue(null);
    prismaMock.file.findMany.mockResolvedValue([{ key: "k1" }, { key: "k2" }]);

    await deleteFolder(1);
    expect(mockDeleteFiles).toHaveBeenCalledWith(["k1", "k2"]);
  });

  it("skips UploadThing cleanup when no files", async () => {
    prismaMock.folder.findFirst.mockResolvedValue(null);
    prismaMock.file.findMany.mockResolvedValue([]);

    await deleteFolder(1);
    expect(mockDeleteFiles).not.toHaveBeenCalled();
  });

  it("swallows UploadThing cleanup errors", async () => {
    prismaMock.folder.findFirst.mockResolvedValue(null);
    prismaMock.file.findMany.mockResolvedValue([{ key: "k1" }]);
    mockDeleteFiles.mockRejectedValue(new Error("UT down"));

    // Should not throw
    await expect(deleteFolder(1)).resolves.toBeUndefined();
    expect(mockDeleteFiles).toHaveBeenCalled();
  });

  it("filters out falsy keys", async () => {
    prismaMock.folder.findFirst.mockResolvedValue(null);
    prismaMock.file.findMany.mockResolvedValue([
      { key: "k1" },
      { key: "" },
      { key: null },
      { key: "k2" },
    ]);

    await deleteFolder(1);
    expect(mockDeleteFiles).toHaveBeenCalledWith(["k1", "k2"]);
  });

  it("scopes queries to companyId", async () => {
    prismaMock.folder.findFirst.mockResolvedValue(null);
    prismaMock.file.findMany.mockResolvedValue([]);

    await deleteFolder(5);
    expect(prismaMock.folder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { parentId: 5, companyId: 1 },
      }),
    );
  });

  it("propagates $transaction failure", async () => {
    prismaMock.folder.findFirst.mockResolvedValue(null);
    prismaMock.file.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockRejectedValue(new Error("DB transaction failed"));

    await expect(deleteFolder(1)).rejects.toThrow("DB transaction failed");
  });

  it("calls revalidatePath after deletion", async () => {
    prismaMock.folder.findFirst.mockResolvedValue(null);
    prismaMock.file.findMany.mockResolvedValue([]);

    await deleteFolder(1);
    expect(revalidatePath).toHaveBeenCalledWith("/files");
  });
});

/* ================================================================== */
/*  deleteFile                                                         */
/* ================================================================== */

describe("deleteFile", () => {
  it("throws for invalid file ID", async () => {
    await expect(deleteFile(-1)).rejects.toThrow("Invalid file ID");
  });

  it("deletes file and calls UT cleanup on happy path", async () => {
    prismaMock.file.findFirst.mockResolvedValue({ id: 1, key: "abc123" });

    await deleteFile(1);
    expect(prismaMock.file.delete).toHaveBeenCalledWith({
      where: { id: 1, companyId: 1 },
    });
    expect(mockDeleteFiles).toHaveBeenCalledWith(["abc123"]);
  });

  it("does not call delete when file not found", async () => {
    prismaMock.file.findFirst.mockResolvedValue(null);

    await deleteFile(1);
    expect(prismaMock.file.delete).not.toHaveBeenCalled();
    expect(mockDeleteFiles).not.toHaveBeenCalled();
  });

  it("skips UT cleanup when file has no key", async () => {
    prismaMock.file.findFirst.mockResolvedValue({ id: 1, key: null });

    await deleteFile(1);
    expect(prismaMock.file.delete).toHaveBeenCalled();
    expect(mockDeleteFiles).not.toHaveBeenCalled();
  });

  it("swallows UT cleanup errors", async () => {
    prismaMock.file.findFirst.mockResolvedValue({ id: 1, key: "abc123" });
    mockDeleteFiles.mockRejectedValue(new Error("UT failure"));

    await expect(deleteFile(1)).resolves.toBeUndefined();
    expect(mockDeleteFiles).toHaveBeenCalled();
  });

  it("scopes find query to companyId", async () => {
    prismaMock.file.findFirst.mockResolvedValue(null);

    await deleteFile(5);
    expect(prismaMock.file.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5, companyId: 1 },
      }),
    );
  });

  it("calls revalidatePath even when file not found", async () => {
    prismaMock.file.findFirst.mockResolvedValue(null);

    await deleteFile(1);
    expect(revalidatePath).toHaveBeenCalledWith("/files");
  });

  it("skips UT when key is empty string", async () => {
    prismaMock.file.findFirst.mockResolvedValue({ id: 1, key: "" });

    await deleteFile(1);
    expect(prismaMock.file.delete).toHaveBeenCalled();
    expect(mockDeleteFiles).not.toHaveBeenCalled();
  });

  it("propagates prisma.file.delete failure", async () => {
    prismaMock.file.findFirst.mockResolvedValue({ id: 1, key: "abc123" });
    prismaMock.file.delete.mockRejectedValue(new Error("DB delete failed"));

    await expect(deleteFile(1)).rejects.toThrow("DB delete failed");
  });
});
