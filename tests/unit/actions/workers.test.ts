import { describe, it, expect, vi, beforeEach } from "vitest";

// ══════════════════════════════════════════════════════════════════
// MOCKS — must be defined before any imports from the module under test
// ══════════════════════════════════════════════════════════════════

vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  hasUserFlag: vi.fn(),
}));

// Transaction mock — separate from main prisma so we can track tx calls independently
const mockTx = {
  department: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  worker: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
  onboardingPath: {
    create: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
    findFirst: vi.fn(), delete: vi.fn(),
  },
  onboardingStep: {
    create: vi.fn(), createMany: vi.fn(), update: vi.fn(),
    findFirst: vi.fn(), delete: vi.fn(), aggregate: vi.fn(),
  },
  workerOnboarding: {
    create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn(),
  },
  workerOnboardingStep: {
    createMany: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(),
  },
  $executeRawUnsafe: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    department: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    worker: {
      findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(),
      update: vi.fn(), count: vi.fn(), groupBy: vi.fn(),
    },
    onboardingPath: {
      findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(),
      update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), count: vi.fn(),
    },
    onboardingStep: {
      findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(),
      update: vi.fn(), aggregate: vi.fn(),
    },
    workerOnboarding: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    workerOnboardingStep: {
      findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), createMany: vi.fn(),
    },
    workerTask: {
      findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(),
      update: vi.fn(), delete: vi.fn(),
    },
    user: { findMany: vi.fn(), findUnique: vi.fn() },
    tableMeta: { findMany: vi.fn(), findFirst: vi.fn() },
    record: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    task: { create: vi.fn(), update: vi.fn() },
    financeRecord: { create: vi.fn() },
    client: { findFirst: vi.fn() },
    $transaction: vi.fn((fn: any) => fn(mockTx)),
  },
}));

const mockPipeline = { del: vi.fn(), exec: vi.fn().mockResolvedValue([]) };

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    scan: vi.fn().mockResolvedValue(["0", []]),
    pipeline: vi.fn(() => mockPipeline),
    options: { keyPrefix: "" },
  },
}));

vi.mock("@/lib/server-action-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server-action-utils")>();
  return {
    ...actual,
    checkServerActionRateLimit: vi.fn(),
  };
});

vi.mock("@/lib/company-validation", () => ({
  validateUserInCompany: vi.fn().mockResolvedValue(true),
  validateWorkerInCompany: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/db-retry", () => ({
  withRetry: vi.fn((fn: any) => fn()),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/notifications-internal", () => ({
  createNotificationForCompany: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/app/actions/calendar", () => ({
  createCalendarEvent: vi.fn().mockResolvedValue(undefined),
}));

// ══════════════════════════════════════════════════════════════════
// IMPORTS
// ══════════════════════════════════════════════════════════════════

import {
  getDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getWorkers,
  getWorker,
  createWorker,
  updateWorker,
  deleteWorker,
  getOnboardingPaths,
  getOnboardingPath,
  createOnboardingPath,
  updateOnboardingPath,
  deleteOnboardingPath,
  createOnboardingStep,
  updateOnboardingStep,
  deleteOnboardingStep,
  reorderOnboardingSteps,
  assignOnboardingPath,
  updateStepProgress,
  getWorkersByOnboardingPath,
  getWorkerStepProgress,
  getWorkerTasks,
  createWorkerTask,
  updateWorkerTask,
  deleteWorkerTask,
  getWorkersStats,
  getOnboardingPathSummaries,
  getCompanyUsers,
  getCompanyTables,
} from "@/app/actions/workers";

import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { checkServerActionRateLimit } from "@/lib/server-action-utils";
import { validateUserInCompany, validateWorkerInCompany } from "@/lib/company-validation";
import { revalidatePath } from "next/cache";

// ══════════════════════════════════════════════════════════════════
// FIXTURES
// ══════════════════════════════════════════════════════════════════

const adminUser = {
  id: 1, companyId: 100, name: "Admin", email: "admin@test.com",
  role: "admin" as const, allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
};

const viewerUser = {
  id: 2, companyId: 100, name: "Viewer", email: "viewer@test.com",
  role: "basic" as const, allowedWriteTableIds: [] as number[],
  permissions: { canViewWorkers: true } as Record<string, boolean>,
};

const managerUser = {
  id: 3, companyId: 100, name: "Manager", email: "manager@test.com",
  role: "basic" as const, allowedWriteTableIds: [] as number[],
  permissions: { canViewWorkers: true, canManageWorkers: true } as Record<string, boolean>,
};

const noPermsUser = {
  id: 4, companyId: 100, name: "NoPerms", email: "none@test.com",
  role: "basic" as const, allowedWriteTableIds: [] as number[],
  permissions: {} as Record<string, boolean>,
};

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════

function setupAuth(user: any = adminUser) {
  vi.mocked(getCurrentUser).mockResolvedValue(user);
  // Delegate to real permission logic: admin always true, basic checks permissions map
  vi.mocked(hasUserFlag).mockImplementation((_u: any, flag: string) => {
    if (user.role === "admin") return true;
    return !!user.permissions?.[flag];
  });
  vi.mocked(checkServerActionRateLimit).mockResolvedValue(undefined);
}

function setupNoAuth() {
  vi.mocked(getCurrentUser).mockResolvedValue(null);
}

function setupRateLimited() {
  vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
  vi.mocked(hasUserFlag).mockReturnValue(true);
  vi.mocked(checkServerActionRateLimit).mockRejectedValue(
    new Error("בוצעו יותר מדי פניות. אנא המתינו ונסו שוב"),
  );
}

// ══════════════════════════════════════════════════════════════════
// GLOBAL RESET
// ══════════════════════════════════════════════════════════════════

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(mockTx));
  vi.mocked(validateUserInCompany).mockResolvedValue(true);
  vi.mocked(validateWorkerInCompany).mockResolvedValue(true);
  vi.mocked(redis.get).mockResolvedValue(null);
  vi.mocked(redis.set).mockResolvedValue("OK" as any);
  vi.mocked(redis.del).mockResolvedValue(1 as any);
  vi.mocked(redis.scan).mockResolvedValue(["0", []] as any);
  vi.mocked(redis.pipeline).mockReturnValue(mockPipeline as any);
  mockPipeline.del.mockReturnValue(mockPipeline);
  mockPipeline.exec.mockResolvedValue([]);
});

// ══════════════════════════════════════════════════════════════════
// A. DEPARTMENTS
// ══════════════════════════════════════════════════════════════════

describe("getDepartments", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(getDepartments()).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied for user without canViewWorkers", async () => {
    setupAuth(noPermsUser);
    await expect(getDepartments()).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(getDepartments()).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("returns cached data from Redis on cache hit", async () => {
    setupAuth();
    const cached = [{ id: 1, name: "Dept A" }];
    vi.mocked(redis.get).mockResolvedValue(JSON.stringify(cached));

    const result = await getDepartments();
    expect(result).toEqual(cached);
    expect(prisma.department.findMany).not.toHaveBeenCalled();
  });

  it("fetches from DB on cache miss and stores in Redis", async () => {
    setupAuth();
    vi.mocked(redis.get).mockResolvedValue(null);
    const depts = [{ id: 1, name: "Dept A" }];
    vi.mocked(prisma.department.findMany).mockResolvedValue(depts as any);

    const result = await getDepartments();
    expect(result).toEqual(depts);
    expect(prisma.department.findMany).toHaveBeenCalled();
    expect(redis.set).toHaveBeenCalledWith(
      `workers:100:departments`,
      JSON.stringify(depts),
      "EX",
      60,
    );
  });

  it("falls back to DB when Redis throws", async () => {
    setupAuth();
    vi.mocked(redis.get).mockRejectedValue(new Error("Redis down"));
    const depts = [{ id: 2, name: "Dept B" }];
    vi.mocked(prisma.department.findMany).mockResolvedValue(depts as any);

    const result = await getDepartments();
    expect(result).toEqual(depts);
  });

  it("scopes query to user companyId", async () => {
    setupAuth();
    vi.mocked(prisma.department.findMany).mockResolvedValue([]);

    await getDepartments();
    expect(prisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 100 }),
      }),
    );
  });

  it("allows viewer user with canViewWorkers", async () => {
    setupAuth(viewerUser);
    vi.mocked(prisma.department.findMany).mockResolvedValue([]);
    await expect(getDepartments()).resolves.toEqual([]);
  });
});

describe("getDepartment", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(getDepartment(1)).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied for user without canViewWorkers", async () => {
    setupAuth(noPermsUser);
    await expect(getDepartment(1)).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(getDepartment(1)).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("returns null when department not found", async () => {
    setupAuth();
    vi.mocked(prisma.department.findFirst).mockResolvedValue(null);
    const result = await getDepartment(999);
    expect(result).toBeNull();
  });

  it("returns department with workers and paths", async () => {
    setupAuth();
    const dept = { id: 1, name: "Dept", workers: [], onboardingPaths: [], _count: { workers: 0 } };
    vi.mocked(prisma.department.findFirst).mockResolvedValue(dept as any);
    const result = await getDepartment(1);
    expect(result).toEqual(dept);
  });
});

describe("createDepartment", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(createDepartment({ name: "X" })).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied for viewer user", async () => {
    setupAuth(viewerUser);
    await expect(createDepartment({ name: "X" })).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(createDepartment({ name: "X" })).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("throws when name is empty", async () => {
    setupAuth();
    await expect(createDepartment({ name: "   " })).rejects.toThrow("Department name is required");
  });

  it("throws when name exceeds max length", async () => {
    setupAuth();
    await expect(createDepartment({ name: "a".repeat(201) })).rejects.toThrow("ארוך מדי");
  });

  it("throws when managerId is invalid", async () => {
    setupAuth();
    vi.mocked(validateUserInCompany).mockResolvedValue(false);
    await expect(createDepartment({ name: "Dept", managerId: 999 })).rejects.toThrow("Invalid manager");
  });

  it("creates department and invalidates cache on happy path", async () => {
    setupAuth();
    const created = { id: 1, name: "NewDept" };
    vi.mocked(prisma.department.create).mockResolvedValue(created as any);

    const result = await createDepartment({ name: "NewDept" });
    expect(result).toEqual(created);
    expect(prisma.department.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "NewDept", companyId: 100 }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/workers");
    expect(redis.del).toHaveBeenCalledWith("workers:100:departments");
  });

  it("wraps Prisma unique constraint error", async () => {
    setupAuth();
    vi.mocked(prisma.department.create).mockRejectedValue({ code: "P2002" });
    await expect(createDepartment({ name: "Dup" })).rejects.toThrow("פריט עם פרטים אלו כבר קיים");
  });

  it("allows manager user with canManageWorkers", async () => {
    setupAuth(managerUser);
    vi.mocked(prisma.department.create).mockResolvedValue({ id: 2, name: "D" } as any);
    await expect(createDepartment({ name: "D" })).resolves.toBeDefined();
  });
});

describe("updateDepartment", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(updateDepartment(1, { name: "X" })).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied for viewer user", async () => {
    setupAuth(viewerUser);
    await expect(updateDepartment(1, { name: "X" })).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(updateDepartment(1, { name: "X" })).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("throws when managerId is invalid", async () => {
    setupAuth();
    vi.mocked(validateUserInCompany).mockResolvedValue(false);
    await expect(updateDepartment(1, { managerId: 999 })).rejects.toThrow("Invalid manager");
  });

  it("does partial update with only provided fields", async () => {
    setupAuth();
    const updated = { id: 1, name: "Updated", isActive: true };
    vi.mocked(prisma.department.update).mockResolvedValue(updated as any);

    await updateDepartment(1, { name: "Updated" });
    expect(prisma.department.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: "Updated" },
      }),
    );
  });

  it("updates department on happy path", async () => {
    setupAuth();
    const updated = { id: 1, name: "Updated" };
    vi.mocked(prisma.department.update).mockResolvedValue(updated as any);

    const result = await updateDepartment(1, { name: "Updated", isActive: false });
    expect(result).toEqual(updated);
    expect(revalidatePath).toHaveBeenCalledWith("/workers");
  });
});

describe("deleteDepartment", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(deleteDepartment(1)).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied for viewer user", async () => {
    setupAuth(viewerUser);
    await expect(deleteDepartment(1)).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(deleteDepartment(1)).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("throws when department has active workers", async () => {
    setupAuth();
    mockTx.worker.count.mockResolvedValue(5);
    await expect(deleteDepartment(1)).rejects.toThrow("Cannot delete department with active workers");
  });

  it("soft-deletes department and returns success", async () => {
    setupAuth();
    mockTx.worker.count.mockResolvedValue(0);
    mockTx.department.update.mockResolvedValue({});

    const result = await deleteDepartment(1);
    expect(result).toEqual({ success: true });
    expect(mockTx.department.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/workers");
  });

  it("wraps P2003 FK constraint error", async () => {
    setupAuth();
    mockTx.worker.count.mockResolvedValue(0);
    mockTx.department.update.mockRejectedValue({ code: "P2003" });
    await expect(deleteDepartment(1)).rejects.toThrow("לא ניתן למחוק פריט זה כיוון שקיימים פריטים הקשורים אליו");
  });

  it("wraps unknown Prisma error with generic message", async () => {
    setupAuth();
    mockTx.worker.count.mockResolvedValue(0);
    mockTx.department.update.mockRejectedValue({ code: "P9999" });
    await expect(deleteDepartment(1)).rejects.toThrow("אירעה שגיאה בעיבוד הבקשה");
  });

  it("rethrows non-Prisma errors unchanged", async () => {
    setupAuth();
    mockTx.worker.count.mockResolvedValue(0);
    const origError = new Error("Connection timeout");
    mockTx.department.update.mockRejectedValue(origError);
    await expect(deleteDepartment(1)).rejects.toBe(origError);
  });
});

// ══════════════════════════════════════════════════════════════════
// B. WORKERS
// ══════════════════════════════════════════════════════════════════

describe("getWorkers", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(getWorkers()).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied without canViewWorkers", async () => {
    setupAuth(noPermsUser);
    await expect(getWorkers()).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(getWorkers()).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("throws on invalid status filter", async () => {
    setupAuth();
    await expect(getWorkers({ status: "INVALID" })).rejects.toThrow('Invalid worker status filter');
  });

  it("applies departmentId and status filters", async () => {
    setupAuth();
    vi.mocked(prisma.worker.findMany).mockResolvedValue([]);
    vi.mocked(prisma.worker.count).mockResolvedValue(0);

    await getWorkers({ departmentId: 5, status: "ACTIVE" });
    expect(prisma.worker.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 100,
          departmentId: 5,
          status: "ACTIVE",
        }),
      }),
    );
  });

  it("clamps pageSize to range [1, 500]", async () => {
    setupAuth();
    vi.mocked(prisma.worker.findMany).mockResolvedValue([]);
    vi.mocked(prisma.worker.count).mockResolvedValue(0);

    await getWorkers({ pageSize: 0 });
    expect(prisma.worker.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1 }),
    );
  });

  it("clamps pageSize max to 500", async () => {
    setupAuth();
    vi.mocked(prisma.worker.findMany).mockResolvedValue([]);
    vi.mocked(prisma.worker.count).mockResolvedValue(0);

    await getWorkers({ pageSize: 999 });
    expect(prisma.worker.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 }),
    );
  });

  it("clamps page to minimum 1", async () => {
    setupAuth();
    vi.mocked(prisma.worker.findMany).mockResolvedValue([]);
    vi.mocked(prisma.worker.count).mockResolvedValue(0);

    await getWorkers({ page: -5 });
    expect(prisma.worker.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0 }),
    );
  });

  it("returns { data, total, hasMore }", async () => {
    setupAuth();
    const workers = [{ id: 1 }];
    vi.mocked(prisma.worker.findMany).mockResolvedValue(workers as any);
    vi.mocked(prisma.worker.count).mockResolvedValue(10);

    const result = await getWorkers({ pageSize: 1, page: 1 });
    expect(result).toEqual({ data: workers, total: 10, hasMore: true });
  });

  it("hasMore is false when no more data", async () => {
    setupAuth();
    const workers = [{ id: 1 }];
    vi.mocked(prisma.worker.findMany).mockResolvedValue(workers as any);
    vi.mocked(prisma.worker.count).mockResolvedValue(1);

    const result = await getWorkers({ pageSize: 10, page: 1 });
    expect(result).toEqual({ data: workers, total: 1, hasMore: false });
  });
});

describe("getWorker", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(getWorker(1)).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied without canViewWorkers", async () => {
    setupAuth(noPermsUser);
    await expect(getWorker(1)).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(getWorker(1)).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("returns null when worker not found", async () => {
    setupAuth();
    vi.mocked(prisma.worker.findFirst).mockResolvedValue(null);
    const result = await getWorker(999);
    expect(result).toBeNull();
  });

  it("returns full worker detail", async () => {
    setupAuth();
    const worker = { id: 1, firstName: "John", department: {}, onboardingProgress: [], assignedTasks: [] };
    vi.mocked(prisma.worker.findFirst).mockResolvedValue(worker as any);
    const result = await getWorker(1);
    expect(result).toEqual(worker);
  });
});

describe("createWorker", () => {
  const validData = {
    firstName: "John",
    lastName: "Doe",
    departmentId: 10,
  };

  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(createWorker(validData)).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied for viewer", async () => {
    setupAuth(viewerUser);
    await expect(createWorker(validData)).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(createWorker(validData)).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("throws when firstName is missing", async () => {
    setupAuth();
    await expect(createWorker({ ...validData, firstName: "  " })).rejects.toThrow("First name is required");
  });

  it("throws when lastName is missing", async () => {
    setupAuth();
    vi.mocked(prisma.department.findFirst).mockResolvedValue(null); // won't reach this
    await expect(createWorker({ ...validData, lastName: "  " })).rejects.toThrow("Last name is required");
  });

  it("throws when departmentId is invalid", async () => {
    setupAuth();
    vi.mocked(prisma.department.findFirst).mockResolvedValue(null);
    await expect(createWorker(validData)).rejects.toThrow("Department not found or access denied");
  });

  it("throws when linkedUserId is invalid", async () => {
    setupAuth();
    vi.mocked(prisma.department.findFirst).mockResolvedValue({ id: 10 } as any);
    vi.mocked(validateUserInCompany).mockResolvedValue(false);
    await expect(createWorker({ ...validData, linkedUserId: 999 })).rejects.toThrow("Invalid linked user");
  });

  it("creates worker with ONBOARDING status and auto-assigns default path", async () => {
    setupAuth();
    vi.mocked(prisma.department.findFirst).mockResolvedValue({ id: 10 } as any);
    const createdWorker = { id: 1, firstName: "John", lastName: "Doe", status: "ONBOARDING" };
    mockTx.worker.create.mockResolvedValue(createdWorker);
    mockTx.onboardingPath.findFirst.mockResolvedValue({
      id: 5, steps: [{ id: 101 }, { id: 102 }],
    });
    mockTx.workerOnboarding.create.mockResolvedValue({ id: 50 });
    mockTx.workerOnboardingStep.createMany.mockResolvedValue({ count: 2 });

    const result = await createWorker(validData);
    expect(result).toEqual(createdWorker);
    expect(mockTx.worker.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ONBOARDING", companyId: 100 }),
      }),
    );
    expect(mockTx.workerOnboarding.create).toHaveBeenCalled();
    expect(mockTx.workerOnboardingStep.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ stepId: 101, status: "PENDING" }),
          expect.objectContaining({ stepId: 102, status: "PENDING" }),
        ]),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/workers");
  });

  it("skips onboarding assignment when no default path exists", async () => {
    setupAuth();
    vi.mocked(prisma.department.findFirst).mockResolvedValue({ id: 10 } as any);
    const createdWorker = { id: 1, firstName: "John", lastName: "Doe" };
    mockTx.worker.create.mockResolvedValue(createdWorker);
    mockTx.onboardingPath.findFirst.mockResolvedValue(null);

    await createWorker(validData);
    expect(mockTx.workerOnboarding.create).not.toHaveBeenCalled();
  });

  it("handles default path with zero steps", async () => {
    setupAuth();
    vi.mocked(prisma.department.findFirst).mockResolvedValue({ id: 10 } as any);
    mockTx.worker.create.mockResolvedValue({ id: 1 });
    mockTx.onboardingPath.findFirst.mockResolvedValue({ id: 5, steps: [] });
    mockTx.workerOnboarding.create.mockResolvedValue({ id: 50 });

    await createWorker(validData);
    expect(mockTx.workerOnboarding.create).toHaveBeenCalled();
    expect(mockTx.workerOnboardingStep.createMany).not.toHaveBeenCalled();
  });
});

describe("updateWorker", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(updateWorker(1, { firstName: "X" })).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied for viewer", async () => {
    setupAuth(viewerUser);
    await expect(updateWorker(1, { firstName: "X" })).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(updateWorker(1, { firstName: "X" })).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("throws on invalid status", async () => {
    setupAuth();
    await expect(updateWorker(1, { status: "INVALID" })).rejects.toThrow("Invalid worker status");
  });

  it("validates customFields JSON depth", async () => {
    setupAuth();
    const deep = { a: { b: { c: { d: "too deep" } } } };
    await expect(updateWorker(1, { customFields: deep })).rejects.toThrow("מבנה הנתונים מורכב מדי");
  });

  it("throws when departmentId is not in company", async () => {
    setupAuth();
    vi.mocked(prisma.department.findFirst).mockResolvedValue(null);
    await expect(updateWorker(1, { departmentId: 999 })).rejects.toThrow("Department not found or access denied");
  });

  it("throws when linkedUserId is invalid", async () => {
    setupAuth();
    vi.mocked(validateUserInCompany).mockResolvedValue(false);
    await expect(updateWorker(1, { linkedUserId: 999 })).rejects.toThrow("Invalid linked user");
  });

  it("throws when worker not found during optimistic lock check", async () => {
    setupAuth();
    mockTx.worker.findFirst.mockResolvedValue(null);

    await expect(
      updateWorker(1, { firstName: "X", expectedUpdatedAt: "2024-01-01T00:00:00.000Z" }),
    ).rejects.toThrow("Worker not found or access denied");
  });

  it("performs optimistic locking — mismatch throws CONFLICT", async () => {
    setupAuth();
    mockTx.worker.findFirst.mockResolvedValue({
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    });

    await expect(
      updateWorker(1, { firstName: "X", expectedUpdatedAt: "2024-01-02T00:00:00.000Z" }),
    ).rejects.toThrow("CONFLICT");
  });

  it("performs optimistic locking — match proceeds", async () => {
    setupAuth();
    const updated = { id: 1, firstName: "X" };
    mockTx.worker.findFirst.mockResolvedValue({
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    });
    mockTx.worker.update.mockResolvedValue(updated);

    const result = await updateWorker(1, {
      firstName: "X",
      expectedUpdatedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(result).toEqual(updated);
  });

  it("skips optimistic lock check when expectedUpdatedAt is not provided", async () => {
    setupAuth();
    const updated = { id: 1, firstName: "Y" };
    mockTx.worker.update.mockResolvedValue(updated);

    const result = await updateWorker(1, { firstName: "Y" });
    expect(result).toEqual(updated);
    expect(mockTx.worker.findFirst).not.toHaveBeenCalled();
  });

  it("updates worker on happy path", async () => {
    setupAuth();
    const updated = { id: 1, status: "ACTIVE" };
    mockTx.worker.update.mockResolvedValue(updated);

    const result = await updateWorker(1, { status: "ACTIVE" });
    expect(result).toEqual(updated);
    expect(revalidatePath).toHaveBeenCalledWith("/workers");
  });
});

describe("deleteWorker", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(deleteWorker(1)).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied for viewer", async () => {
    setupAuth(viewerUser);
    await expect(deleteWorker(1)).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(deleteWorker(1)).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("soft-deletes worker and returns success", async () => {
    setupAuth();
    vi.mocked(prisma.worker.update).mockResolvedValue({} as any);

    const result = await deleteWorker(1);
    expect(result).toEqual({ success: true });
    expect(prisma.worker.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 1, companyId: 100 }),
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/workers");
  });
});

// ══════════════════════════════════════════════════════════════════
// C. ONBOARDING PATHS
// ══════════════════════════════════════════════════════════════════

describe("getOnboardingPaths", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(getOnboardingPaths()).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied without canViewWorkers", async () => {
    setupAuth(noPermsUser);
    await expect(getOnboardingPaths()).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(getOnboardingPaths()).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("returns cached paths", async () => {
    setupAuth();
    const cached = [{ id: 1, name: "Path" }];
    vi.mocked(redis.get).mockResolvedValue(JSON.stringify(cached));

    const result = await getOnboardingPaths();
    expect(result).toEqual(cached);
    expect(prisma.onboardingPath.findMany).not.toHaveBeenCalled();
  });

  it("uses different cache keys for departmentId", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingPath.findMany).mockResolvedValue([]);

    await getOnboardingPaths(5);
    expect(redis.get).toHaveBeenCalledWith("workers:100:paths:5");
  });

  it("uses cache key without departmentId suffix when none", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingPath.findMany).mockResolvedValue([]);

    await getOnboardingPaths();
    expect(redis.get).toHaveBeenCalledWith("workers:100:paths");
  });

  it("returns paths with steps and counts from DB", async () => {
    setupAuth();
    const paths = [{ id: 1, name: "P", steps: [], _count: { workerProgress: 3, steps: 5 } }];
    vi.mocked(prisma.onboardingPath.findMany).mockResolvedValue(paths as any);

    const result = await getOnboardingPaths();
    expect(result).toEqual(paths);
  });
});

describe("getOnboardingPath", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(getOnboardingPath(1)).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied without canViewWorkers", async () => {
    setupAuth(noPermsUser);
    await expect(getOnboardingPath(1)).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(getOnboardingPath(1)).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("returns null when path not found", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingPath.findFirst).mockResolvedValue(null);
    const result = await getOnboardingPath(999);
    expect(result).toBeNull();
  });

  it("returns full path with steps and worker progress", async () => {
    setupAuth();
    const path = { id: 1, name: "P", steps: [], workerProgress: [], department: {} };
    vi.mocked(prisma.onboardingPath.findFirst).mockResolvedValue(path as any);
    const result = await getOnboardingPath(1);
    expect(result).toEqual(path);
  });
});

describe("createOnboardingPath", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(createOnboardingPath({ name: "P" })).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied for viewer", async () => {
    setupAuth(viewerUser);
    await expect(createOnboardingPath({ name: "P" })).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(createOnboardingPath({ name: "P" })).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("throws when name is empty", async () => {
    setupAuth();
    await expect(createOnboardingPath({ name: "   " })).rejects.toThrow("Path name is required");
  });

  it("throws when departmentId is not in company", async () => {
    setupAuth();
    vi.mocked(prisma.department.findFirst).mockResolvedValue(null);
    await expect(createOnboardingPath({ name: "P", departmentId: 999 })).rejects.toThrow("Department not found");
  });

  it("throws when steps exceed 200", async () => {
    setupAuth();
    const steps = Array.from({ length: 201 }, (_, i) => ({ title: `Step ${i}` }));
    await expect(createOnboardingPath({ name: "P", steps })).rejects.toThrow("at most 200 steps");
  });

  it("throws on invalid step type", async () => {
    setupAuth();
    await expect(
      createOnboardingPath({ name: "P", steps: [{ title: "S", type: "INVALID" }] }),
    ).rejects.toThrow("Invalid step type");
  });

  it("unsets other defaults when isDefault=true", async () => {
    setupAuth();
    vi.mocked(prisma.department.findFirst).mockResolvedValue({ id: 5 } as any);
    mockTx.onboardingPath.updateMany.mockResolvedValue({ count: 1 });
    mockTx.onboardingPath.create.mockResolvedValue({ id: 1, name: "P" });

    await createOnboardingPath({ name: "P", isDefault: true, departmentId: 5 });
    expect(mockTx.onboardingPath.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ departmentId: 5, isDefault: true }),
        data: { isDefault: false },
      }),
    );
  });

  it("skips unsetting defaults when isDefault=true but no departmentId", async () => {
    setupAuth();
    mockTx.onboardingPath.create.mockResolvedValue({ id: 1, name: "P" });

    await createOnboardingPath({ name: "P", isDefault: true });
    // The guard `if (data.isDefault && data.departmentId)` should prevent updateMany
    expect(mockTx.onboardingPath.updateMany).not.toHaveBeenCalled();
  });

  it("creates path with steps via createMany", async () => {
    setupAuth();
    mockTx.onboardingPath.create.mockResolvedValue({ id: 10 });
    mockTx.onboardingStep.createMany.mockResolvedValue({ count: 2 });

    await createOnboardingPath({
      name: "P",
      steps: [
        { title: "Step A", type: "TASK" },
        { title: "Step B", type: "TRAINING" },
      ],
    });
    expect(mockTx.onboardingStep.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ title: "Step A", pathId: 10, companyId: 100 }),
        ]),
      }),
    );
  });

  it("creates path without steps when none provided", async () => {
    setupAuth();
    mockTx.onboardingPath.create.mockResolvedValue({ id: 11 });

    await createOnboardingPath({ name: "Empty" });
    expect(mockTx.onboardingStep.createMany).not.toHaveBeenCalled();
  });
});

describe("updateOnboardingPath", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(updateOnboardingPath(1, { name: "X" })).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied for viewer", async () => {
    setupAuth(viewerUser);
    await expect(updateOnboardingPath(1, { name: "X" })).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(updateOnboardingPath(1, { name: "X" })).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("throws when departmentId is not in company", async () => {
    setupAuth();
    vi.mocked(prisma.department.findFirst).mockResolvedValue(null);
    await expect(updateOnboardingPath(1, { departmentId: 999 })).rejects.toThrow("Department not found");
  });

  it("toggles default — unsets others using current path departmentId", async () => {
    setupAuth();
    mockTx.onboardingPath.findFirst.mockResolvedValue({ departmentId: 5 });
    mockTx.onboardingPath.updateMany.mockResolvedValue({ count: 1 });
    mockTx.onboardingPath.update.mockResolvedValue({ id: 1 });

    await updateOnboardingPath(1, { isDefault: true });
    expect(mockTx.onboardingPath.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ departmentId: 5, isDefault: true, NOT: { id: 1 } }),
      }),
    );
  });

  it("uses provided departmentId over current when toggling default", async () => {
    setupAuth();
    vi.mocked(prisma.department.findFirst).mockResolvedValue({ id: 8 } as any);
    mockTx.onboardingPath.findFirst.mockResolvedValue({ departmentId: 5 });
    mockTx.onboardingPath.updateMany.mockResolvedValue({ count: 0 });
    mockTx.onboardingPath.update.mockResolvedValue({ id: 1 });

    await updateOnboardingPath(1, { isDefault: true, departmentId: 8 });
    // Should use departmentId 8 (provided), not 5 (current)
    expect(mockTx.onboardingPath.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ departmentId: 8 }),
      }),
    );
  });

  it("throws when path not found during default toggle", async () => {
    setupAuth();
    mockTx.onboardingPath.findFirst.mockResolvedValue(null);
    await expect(updateOnboardingPath(1, { isDefault: true })).rejects.toThrow("not found");
  });

  it("updates path on happy path", async () => {
    setupAuth();
    const updated = { id: 1, name: "Updated" };
    mockTx.onboardingPath.update.mockResolvedValue(updated);

    const result = await updateOnboardingPath(1, { name: "Updated" });
    expect(result).toEqual(updated);
    expect(revalidatePath).toHaveBeenCalledWith("/workers");
  });
});

describe("deleteOnboardingPath", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(deleteOnboardingPath(1)).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied for viewer", async () => {
    setupAuth(viewerUser);
    await expect(deleteOnboardingPath(1)).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(deleteOnboardingPath(1)).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("cascade deletes workerOnboarding then path", async () => {
    setupAuth();
    mockTx.workerOnboarding.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.onboardingPath.delete.mockResolvedValue({});

    const result = await deleteOnboardingPath(1);
    expect(result).toEqual({ success: true });
    expect(mockTx.workerOnboarding.deleteMany).toHaveBeenCalled();
    expect(mockTx.onboardingPath.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1, companyId: 100 } }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/workers");
  });
});

// ══════════════════════════════════════════════════════════════════
// D. ONBOARDING STEPS
// ══════════════════════════════════════════════════════════════════

describe("createOnboardingStep", () => {
  const validStep = { pathId: 1, title: "Step 1" };

  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(createOnboardingStep(validStep)).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied for viewer", async () => {
    setupAuth(viewerUser);
    await expect(createOnboardingStep(validStep)).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(createOnboardingStep(validStep)).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("throws when title is empty", async () => {
    setupAuth();
    await expect(createOnboardingStep({ pathId: 1, title: "  " })).rejects.toThrow("Step title is required");
  });

  it("throws on invalid step type", async () => {
    setupAuth();
    await expect(
      createOnboardingStep({ pathId: 1, title: "S", type: "BOGUS" }),
    ).rejects.toThrow("Invalid step type");
  });

  it("throws when pathId is not in company", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingPath.findFirst).mockResolvedValue(null);
    await expect(createOnboardingStep(validStep)).rejects.toThrow("Onboarding path not found");
  });

  it("auto-orders using max+1 when order not specified", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingPath.findFirst).mockResolvedValue({ id: 1 } as any);
    vi.mocked(prisma.onboardingStep.aggregate).mockResolvedValue({ _max: { order: 4 } } as any);
    vi.mocked(prisma.onboardingStep.create).mockResolvedValue({ id: 10 } as any);

    await createOnboardingStep(validStep);
    expect(prisma.onboardingStep.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ order: 5 }),
      }),
    );
  });

  it("uses 0 when max order is null (first step)", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingPath.findFirst).mockResolvedValue({ id: 1 } as any);
    vi.mocked(prisma.onboardingStep.aggregate).mockResolvedValue({ _max: { order: null } } as any);
    vi.mocked(prisma.onboardingStep.create).mockResolvedValue({ id: 10 } as any);

    await createOnboardingStep(validStep);
    expect(prisma.onboardingStep.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ order: 0 }),
      }),
    );
  });

  it("uses provided order when specified", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingPath.findFirst).mockResolvedValue({ id: 1 } as any);
    vi.mocked(prisma.onboardingStep.create).mockResolvedValue({ id: 10 } as any);

    await createOnboardingStep({ ...validStep, order: 3 });
    expect(prisma.onboardingStep.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ order: 3 }),
      }),
    );
    // Should NOT call aggregate when order is provided
    expect(prisma.onboardingStep.aggregate).not.toHaveBeenCalled();
  });

  it("validates resourceUrl format", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingPath.findFirst).mockResolvedValue({ id: 1 } as any);
    await expect(
      createOnboardingStep({ ...validStep, resourceUrl: "javascript:alert(1)" }),
    ).rejects.toThrow("חייבת להשתמש");
  });
});

describe("updateOnboardingStep", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(updateOnboardingStep(1, { title: "X" })).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied for viewer", async () => {
    setupAuth(viewerUser);
    await expect(updateOnboardingStep(1, { title: "X" })).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(updateOnboardingStep(1, { title: "X" })).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("throws on invalid step type", async () => {
    setupAuth();
    await expect(updateOnboardingStep(1, { type: "BAD" })).rejects.toThrow("Invalid step type");
  });

  it("throws when step not found in transaction", async () => {
    setupAuth();
    mockTx.onboardingStep.findFirst.mockResolvedValue(null);
    await expect(updateOnboardingStep(1, { title: "X" })).rejects.toThrow("Step not found");
  });

  it("validates onCompleteActions", async () => {
    setupAuth();
    await expect(
      updateOnboardingStep(1, { onCompleteActions: "not-array" as any }),
    ).rejects.toThrow("onCompleteActions must be an array");
  });

  it("updates step via transaction on happy path", async () => {
    setupAuth();
    mockTx.onboardingStep.findFirst.mockResolvedValue({ id: 1 });
    const updated = { id: 1, title: "Updated" };
    mockTx.onboardingStep.update.mockResolvedValue(updated);

    const result = await updateOnboardingStep(1, { title: "Updated" });
    expect(result).toEqual(updated);
    expect(revalidatePath).toHaveBeenCalledWith("/workers");
  });
});

describe("deleteOnboardingStep", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(deleteOnboardingStep(1)).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied for viewer", async () => {
    setupAuth(viewerUser);
    await expect(deleteOnboardingStep(1)).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(deleteOnboardingStep(1)).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("throws when step not found", async () => {
    setupAuth();
    mockTx.onboardingStep.findFirst.mockResolvedValue(null);
    await expect(deleteOnboardingStep(999)).rejects.toThrow("Step not found");
  });

  it("deletes step via transaction and returns success", async () => {
    setupAuth();
    mockTx.onboardingStep.findFirst.mockResolvedValue({ id: 1 });
    mockTx.onboardingStep.delete.mockResolvedValue({});

    const result = await deleteOnboardingStep(1);
    expect(result).toEqual({ success: true });
    expect(mockTx.onboardingStep.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(revalidatePath).toHaveBeenCalledWith("/workers");
  });
});

describe("reorderOnboardingSteps", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(reorderOnboardingSteps(1, [1, 2])).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied for viewer", async () => {
    setupAuth(viewerUser);
    await expect(reorderOnboardingSteps(1, [1, 2])).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(reorderOnboardingSteps(1, [1, 2])).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("throws when stepIds exceed 200", async () => {
    setupAuth();
    const ids = Array.from({ length: 201 }, (_, i) => i);
    await expect(reorderOnboardingSteps(1, ids)).rejects.toThrow("Too many steps");
  });

  it("throws when path not found", async () => {
    setupAuth();
    mockTx.onboardingPath.findFirst.mockResolvedValue(null);
    await expect(reorderOnboardingSteps(999, [1])).rejects.toThrow("Path not found");
  });

  it("executes raw SQL for reordering with correct parameters", async () => {
    setupAuth();
    mockTx.onboardingPath.findFirst.mockResolvedValue({ id: 1 });
    mockTx.$executeRawUnsafe.mockResolvedValue(0);

    const result = await reorderOnboardingSteps(1, [10, 20]);
    expect(result).toEqual({ success: true });
    const call = mockTx.$executeRawUnsafe.mock.calls[0];
    expect(call[0]).toContain('UPDATE "OnboardingStep"');
    expect(call[0]).toContain("CASE");
    // Positional assertions: params = [stepId1, order0, stepId2, order1, pathId, companyId]
    expect(call[1]).toBe(10);  // first stepId
    expect(call[2]).toBe(0);   // first order
    expect(call[3]).toBe(20);  // second stepId
    expect(call[4]).toBe(1);   // second order
    expect(call[5]).toBe(1);   // pathId
    expect(call[6]).toBe(100); // companyId
  });

  it("skips SQL execution when stepIds is empty", async () => {
    setupAuth();
    mockTx.onboardingPath.findFirst.mockResolvedValue({ id: 1 });

    const result = await reorderOnboardingSteps(1, []);
    expect(result).toEqual({ success: true });
    expect(mockTx.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════
// E. ONBOARDING PROGRESS
// ══════════════════════════════════════════════════════════════════

describe("assignOnboardingPath", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(assignOnboardingPath(1, 1)).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied for viewer", async () => {
    setupAuth(viewerUser);
    await expect(assignOnboardingPath(1, 1)).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(assignOnboardingPath(1, 1)).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("throws when path not found", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingPath.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.worker.findFirst).mockResolvedValue({ id: 1 } as any);
    await expect(assignOnboardingPath(1, 999)).rejects.toThrow("Onboarding path not found");
  });

  it("throws when worker not found", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingPath.findFirst).mockResolvedValue({ id: 1, steps: [] } as any);
    vi.mocked(prisma.worker.findFirst).mockResolvedValue(null);
    await expect(assignOnboardingPath(999, 1)).rejects.toThrow("Worker not found");
  });

  it("creates workerOnboarding + step records", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingPath.findFirst).mockResolvedValue({
      id: 5, steps: [{ id: 101 }, { id: 102 }],
    } as any);
    vi.mocked(prisma.worker.findFirst).mockResolvedValue({ id: 1 } as any);
    mockTx.workerOnboarding.create.mockResolvedValue({ id: 50 });
    mockTx.workerOnboardingStep.createMany.mockResolvedValue({ count: 2 });

    const result = await assignOnboardingPath(1, 5);
    expect(result).toEqual({ id: 50 });
    expect(mockTx.workerOnboarding.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "IN_PROGRESS", workerId: 1, pathId: 5 }),
      }),
    );
    expect(mockTx.workerOnboardingStep.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ stepId: 101, status: "PENDING" }),
        ]),
      }),
    );
  });

  it("handles path with zero steps", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingPath.findFirst).mockResolvedValue({
      id: 5, steps: [],
    } as any);
    vi.mocked(prisma.worker.findFirst).mockResolvedValue({ id: 1 } as any);
    mockTx.workerOnboarding.create.mockResolvedValue({ id: 50 });

    await assignOnboardingPath(1, 5);
    expect(mockTx.workerOnboardingStep.createMany).not.toHaveBeenCalled();
  });
});

describe("updateStepProgress", () => {
  const validData = { status: "COMPLETED" };

  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(updateStepProgress(1, 1, validData)).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied for viewer", async () => {
    setupAuth(viewerUser);
    await expect(updateStepProgress(1, 1, validData)).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(updateStepProgress(1, 1, validData)).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  // Phase 1 - Validation
  it("throws on invalid step status", async () => {
    setupAuth();
    await expect(updateStepProgress(1, 1, { status: "BOGUS" })).rejects.toThrow("Invalid step status");
  });

  it("throws when notes too long", async () => {
    setupAuth();
    await expect(
      updateStepProgress(1, 1, { status: "COMPLETED", notes: "a".repeat(5001) }),
    ).rejects.toThrow("ארוך מדי");
  });

  it("throws when feedback too long", async () => {
    setupAuth();
    await expect(
      updateStepProgress(1, 1, { status: "COMPLETED", feedback: "b".repeat(5001) }),
    ).rejects.toThrow("ארוך מדי");
  });

  it("throws when score < 0", async () => {
    setupAuth();
    await expect(
      updateStepProgress(1, 1, { status: "COMPLETED", score: -1 }),
    ).rejects.toThrow("Score must be between 0 and 100");
  });

  it("throws when score > 100", async () => {
    setupAuth();
    await expect(
      updateStepProgress(1, 1, { status: "COMPLETED", score: 101 }),
    ).rejects.toThrow("Score must be between 0 and 100");
  });

  it("throws when score is NaN", async () => {
    setupAuth();
    await expect(
      updateStepProgress(1, 1, { status: "COMPLETED", score: NaN }),
    ).rejects.toThrow("Score must be between 0 and 100");
  });

  it("accepts score of 0 as valid", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "S", onCompleteActions: null, path: { name: "P", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst).mockResolvedValue({ id: 1, workerId: 10 } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1 });

    await updateStepProgress(1, 1, { status: "PENDING", score: 0 });
    expect(mockTx.workerOnboardingStep.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ score: 0 }),
        update: expect.objectContaining({ score: 0 }),
      }),
    );
  });

  it("accepts score of 100 as valid", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "S", onCompleteActions: null, path: { name: "P", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst).mockResolvedValue({ id: 1, workerId: 10 } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1 });

    await updateStepProgress(1, 1, { status: "PENDING", score: 100 });
    expect(mockTx.workerOnboardingStep.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ score: 100 }),
        update: expect.objectContaining({ score: 100 }),
      }),
    );
  });

  // Phase 2 - Ownership
  it("throws when step not found", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.workerOnboarding.findFirst).mockResolvedValue({ id: 1, workerId: 10 } as any);
    await expect(updateStepProgress(1, 999, validData)).rejects.toThrow("Step not found");
  });

  it("throws when onboarding not found", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "S", onCompleteActions: null, path: { name: "P", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst).mockResolvedValue(null);
    await expect(updateStepProgress(999, 1, validData)).rejects.toThrow("Onboarding not found");
  });

  // Phase 3 - Upsert
  it("creates step progress if not exists", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "S", onCompleteActions: null, path: { name: "P", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst).mockResolvedValue({ id: 1, workerId: 10 } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    const sp = { id: 1, status: "COMPLETED", completedAt: new Date() };
    mockTx.workerOnboardingStep.upsert.mockResolvedValue(sp);

    // statusChanged = true (COMPLETED && !wasAlreadyCompleted)
    // Mock the Redis lock and onboarding check
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    // For the onboarding fetch after lock
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any) // ownership check
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D" },
        path: { id: 5, name: "P", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    const result = await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(result).toEqual(sp);
    expect(mockTx.workerOnboardingStep.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { onboardingId_stepId: { onboardingId: 1, stepId: 1 } },
        create: expect.objectContaining({ status: "COMPLETED", onboardingId: 1, stepId: 1 }),
        update: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
  });

  it("sets completedAt on COMPLETED status", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "S", onCompleteActions: null, path: { name: "P", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst).mockResolvedValue({ id: 1, workerId: 10 } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1 });

    // Need to also mock the post-status-change flow
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any) // ownership check
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10 },
        path: { id: 5, name: "P", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(mockTx.workerOnboardingStep.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ completedAt: expect.any(Date) }),
        create: expect.objectContaining({ completedAt: expect.any(Date) }),
      }),
    );
  });

  it("clears completedAt for non-COMPLETED status", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "S", onCompleteActions: null, path: { name: "P", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst).mockResolvedValue({ id: 1, workerId: 10 } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue({ status: "COMPLETED" });
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1 });

    await updateStepProgress(1, 1, { status: "IN_PROGRESS" });
    expect(mockTx.workerOnboardingStep.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ completedAt: null }),
      }),
    );
  });

  it("detects statusChanged=false when already COMPLETED", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "S", onCompleteActions: null, path: { name: "P", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst).mockResolvedValue({ id: 1, workerId: 10 } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue({ status: "COMPLETED" });
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1 });

    // When already COMPLETED and setting to COMPLETED, statusChanged = false
    // Should NOT attempt Redis lock
    await updateStepProgress(1, 1, { status: "COMPLETED" });
    // The redis.set for the lock should not be called with NX
    expect(redis.set).not.toHaveBeenCalledWith(
      expect.stringContaining("step-lock"),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      "NX",
    );
  });

  // Phase 4 - Lock + Automations
  it("skips automations when Redis lock already held", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "S", onCompleteActions: [{ actionType: "CREATE_TASK", config: { title: "Bug catcher" } }],
      path: { name: "P", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst).mockResolvedValue({ id: 1, workerId: 10 } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1 });
    vi.mocked(redis.set).mockResolvedValue(null as any); // lock NOT acquired

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    // Since lock not acquired, should not fetch onboarding for automations
    // The second call to prisma.workerOnboarding.findFirst (for automations) should not happen
    expect(prisma.workerOnboarding.findFirst).toHaveBeenCalledTimes(1); // only ownership check
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("proceeds when Redis is down for lock", async () => {
    setupAuth();
    const { createNotificationForCompany } = await import("@/lib/notifications-internal");

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "S", onCompleteActions: [
        { actionType: "SEND_NOTIFICATION", config: { recipientId: 1, title: "T", message: "M" } },
      ],
      path: { name: "P", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any) // ownership check
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "P", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockRejectedValue(new Error("Redis down"));
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    // Should proceed (lockAcquired = true on Redis failure) and fire automations
    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(prisma.workerOnboarding.findFirst).toHaveBeenCalledTimes(2);
    expect(createNotificationForCompany).toHaveBeenCalledWith({
      companyId: 100,
      userId: 1,
      title: "T",
      message: "M",
      link: "/workers",
    });
  });

  // Phase 5 - Completion detection
  it("marks onboarding COMPLETED and worker ACTIVE when all required steps done", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "S", onCompleteActions: null, path: { name: "P", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any) // ownership
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D" },
        path: { id: 5, name: "P", companyId: 100, steps: [{ id: 1, isRequired: true }] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);

    // For the completion check transaction
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([{ stepId: 1, status: "COMPLETED" }]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });
    mockTx.workerOnboarding.update.mockResolvedValue({});
    mockTx.worker.update.mockResolvedValue({});

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(mockTx.workerOnboarding.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED", completedAt: expect.any(Date) }),
      }),
    );
    expect(mockTx.worker.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "ACTIVE" },
      }),
    );
  });

  it("reverts to IN_PROGRESS when step uncompleted", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "S", onCompleteActions: null, path: { name: "P", companyId: 100 },
    } as any);
    // For the uncomplete case: was PENDING -> now we set to COMPLETED -> statusChanged is true
    // but we need the completion check to show NOT all required done
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any) // ownership
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10 },
        path: {
          id: 5, name: "P", companyId: 100,
          steps: [{ id: 1, isRequired: true }, { id: 2, isRequired: true }],
        },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);

    // Completion check: only step 1 completed, step 2 still pending -> COMPLETED status should revert
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([
      { stepId: 1, status: "COMPLETED" },
      { stepId: 2, status: "PENDING" },
    ]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "COMPLETED" });
    mockTx.workerOnboarding.update.mockResolvedValue({});
    mockTx.worker.update.mockResolvedValue({});

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(mockTx.workerOnboarding.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "IN_PROGRESS", completedAt: null }),
      }),
    );
    expect(mockTx.worker.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "ONBOARDING" },
      }),
    );
  });

  it("does nothing when no required steps exist", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "S", onCompleteActions: null, path: { name: "P", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10 },
        path: { id: 5, name: "P", companyId: 100, steps: [{ id: 1, isRequired: false }] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1 });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);

    mockTx.workerOnboardingStep.findMany.mockResolvedValue([{ stepId: 1, status: "COMPLETED" }]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    // No required steps -> allRequiredCompleted = false (since requiredSteps.length === 0)
    // So it should NOT update onboarding status
    expect(mockTx.workerOnboarding.update).not.toHaveBeenCalled();
  });

  it("skips automations when status did not change (non-COMPLETED)", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "S", onCompleteActions: null, path: { name: "P", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst).mockResolvedValue({ id: 1, workerId: 10 } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue({ status: "PENDING" });
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1 });

    // Setting to IN_PROGRESS (not COMPLETED) so statusChanged = false
    await updateStepProgress(1, 1, { status: "IN_PROGRESS" });
    expect(redis.set).not.toHaveBeenCalledWith(
      expect.stringContaining("step-lock"),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      "NX",
    );
  });

  // Phase 4b - Automation execution
  it("fires SEND_NOTIFICATION automation when onCompleteActions present and step completed", async () => {
    setupAuth();
    const { createNotificationForCompany } = await import("@/lib/notifications-internal");

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Orientation", onCompleteActions: [
        { actionType: "SEND_NOTIFICATION", config: { recipientId: 1, title: "Done", message: "Step done" } },
      ],
      path: { name: "New Hire", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any) // ownership
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "New Hire", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(createNotificationForCompany).toHaveBeenCalledWith({
      companyId: 100,
      userId: 1,
      title: "Done",
      message: "Step done",
      link: "/workers",
    });
  });

  it("individual automation failures don't crash step update (Promise.allSettled)", async () => {
    setupAuth();
    const { createNotificationForCompany } = await import("@/lib/notifications-internal");
    vi.mocked(createNotificationForCompany).mockRejectedValueOnce(new Error("Notification service down"));

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "S", onCompleteActions: [
        { actionType: "SEND_NOTIFICATION", config: { recipientId: 1, title: "T", message: "M" } },
      ],
      path: { name: "P", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any) // ownership
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "P", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    const sp = { id: 1, status: "COMPLETED" };
    mockTx.workerOnboardingStep.upsert.mockResolvedValue(sp);
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    // Should NOT throw — the try/catch around automations absorbs the error
    const result = await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(result).toEqual(sp);
    expect(createNotificationForCompany).toHaveBeenCalledTimes(1);
  });

  it("skips automation execution when onCompleteActions is null", async () => {
    setupAuth();
    const { createNotificationForCompany } = await import("@/lib/notifications-internal");

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "S", onCompleteActions: null, path: { name: "P", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any) // ownership
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10 },
        path: { id: 5, name: "P", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1 });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    // createNotificationForCompany should NOT have been called (no onCompleteActions)
    expect(createNotificationForCompany).not.toHaveBeenCalled();
  });

  it("fires CREATE_TASK automation and creates task with correct data", async () => {
    setupAuth();

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Setup", onCompleteActions: [
        { actionType: "CREATE_TASK", config: { title: "Follow up", assigneeId: 1, description: "Check onboarding", priority: "high" } },
      ],
      path: { name: "New Hire", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "New Hire", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });
    vi.mocked(prisma.task.create).mockResolvedValue({ id: 99 } as any);

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(prisma.task.create).toHaveBeenCalledWith({
      data: {
        companyId: 100,
        title: "Follow up",
        description: "Check onboarding",
        status: "todo",
        priority: "high",
        assigneeId: 1,
        dueDate: null,
      },
    });
  });

  it("fires WEBHOOK automation and sends inngest event with payload", async () => {
    setupAuth();
    const { inngest } = await import("@/lib/inngest/client");

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Final Step", onCompleteActions: [
        { actionType: "WEBHOOK", config: { webhookUrl: "https://example.com/hook" } },
      ],
      path: { name: "Onboard", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Onboard", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(inngest.send).toHaveBeenCalledWith({
      id: expect.stringMatching(/^webhook-worker-100-1-\d+$/),
      name: "automation/send-webhook",
      data: {
        url: "https://example.com/hook",
        companyId: 100,
        ruleId: 0,
        payload: {
          ruleId: 0,
          ruleName: "Onboarding: Final Step",
          triggerType: "ONBOARDING_STEP_COMPLETED",
          companyId: 100,
          data: expect.objectContaining({
            stepId: 1,
            stepTitle: "Final Step",
            pathName: "Onboard",
            actorName: "Admin",
          }),
        },
      },
    });
  });

  it("fires SEND_NOTIFICATION with template placeholders replaced", async () => {
    setupAuth();
    const { createNotificationForCompany } = await import("@/lib/notifications-internal");

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Safety Training", onCompleteActions: [
        { actionType: "SEND_NOTIFICATION", config: { recipientId: 1, title: "Step {stepTitle} done by {userName}", message: "{pathName} progress: {stepTitle} completed" } },
      ],
      path: { name: "New Hire", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "New Hire", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(createNotificationForCompany).toHaveBeenCalledWith({
      companyId: 100,
      userId: 1,
      title: "Step Safety Training done by Admin",
      message: "New Hire progress: Safety Training completed",
      link: "/workers",
    });
  });

  it("fires CREATE_TASK with assigneeId null when validateUserInCompany returns false", async () => {
    setupAuth();
    // The only validateUserInCompany call in this path is for the assigneeId in CREATE_TASK
    vi.mocked(validateUserInCompany).mockResolvedValueOnce(false);

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Setup", onCompleteActions: [
        { actionType: "CREATE_TASK", config: { title: "Follow up", assigneeId: 999, description: "Check onboarding", priority: "high" } },
      ],
      path: { name: "New Hire", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "New Hire", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });
    vi.mocked(prisma.task.create).mockResolvedValue({ id: 99 } as any);

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(prisma.task.create).toHaveBeenCalledWith({
      data: {
        companyId: 100,
        title: "Follow up",
        description: "Check onboarding",
        status: "todo",
        priority: "high",
        assigneeId: null,
        dueDate: null,
      },
    });
  });

  // ── Automation action type coverage ──────────────────────────────

  it("fires SEND_WHATSAPP automation with direct phone", async () => {
    setupAuth();
    const { inngest } = await import("@/lib/inngest/client");

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "SEND_WHATSAPP", config: { phone: "0501234567", message: "Welcome", messageType: "text" } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(inngest.send).toHaveBeenCalledWith({
      id: expect.stringMatching(/^wa-worker-100-0501234567-1-\d+$/),
      name: "automation/send-whatsapp",
      data: {
        companyId: 100,
        phone: "0501234567",
        content: "Welcome",
        messageType: "text",
        mediaFileId: undefined,
        delay: undefined,
      },
    });
    expect(prisma.record.findFirst).not.toHaveBeenCalled();
  });

  it("fires SEND_WHATSAPP automation with table phone lookup by recordId", async () => {
    setupAuth();
    const { inngest } = await import("@/lib/inngest/client");

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "SEND_WHATSAPP", config: { phoneSource: "table", waTableId: 1, waPhoneColumn: "phone", waRecordId: 5, message: "Hi" } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });
    vi.mocked(prisma.record.findFirst).mockResolvedValue({ data: { phone: "0501234567" } } as any);

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(prisma.record.findFirst).toHaveBeenCalledWith({
      where: { id: 5, tableId: 1, companyId: 100 },
      select: { data: true },
    });
    expect(inngest.send).toHaveBeenCalledWith({
      id: expect.stringMatching(/^wa-worker-100-0501234567-1-\d+$/),
      name: "automation/send-whatsapp",
      data: {
        companyId: 100,
        phone: "0501234567",
        content: "Hi",
        messageType: undefined,
        mediaFileId: undefined,
        delay: undefined,
      },
    });
  });

  it("fires CREATE_FINANCE automation with hardcoded status COMPLETED", async () => {
    setupAuth();

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "CREATE_FINANCE", config: { title: "Payment", amount: 500, type: "INCOME", category: "Services", clientId: 1 } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });
    vi.mocked(prisma.client.findFirst).mockResolvedValue({ id: 1 } as any);
    vi.mocked(prisma.financeRecord.create).mockResolvedValue({ id: 1 } as any);

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(prisma.financeRecord.create).toHaveBeenCalledWith({
      data: {
        companyId: 100,
        title: "Payment",
        amount: 500,
        type: "INCOME",
        category: "Services",
        clientId: 1,
        description: null,
        status: "COMPLETED",
      },
    });
  });

  it("fires CREATE_FINANCE with clientId null when client not found", async () => {
    setupAuth();

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "CREATE_FINANCE", config: { title: "Payment", amount: 500, type: "INCOME", clientId: 999 } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });
    vi.mocked(prisma.client.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.financeRecord.create).mockResolvedValue({ id: 1 } as any);

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(prisma.financeRecord.create).toHaveBeenCalledWith({
      data: {
        companyId: 100,
        title: "Payment",
        amount: 500,
        type: "INCOME",
        category: null,
        clientId: null,
        description: null,
        status: "COMPLETED",
      },
    });
  });

  it("fires UPDATE_RECORD automation and merges data", async () => {
    setupAuth();

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "UPDATE_RECORD", config: { tableId: 1, recordId: 5, updates: { status: "done" } } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });
    vi.mocked(prisma.record.findFirst).mockResolvedValue({ id: 5, data: { name: "John" } } as any);
    vi.mocked(prisma.record.update).mockResolvedValue({} as any);

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(prisma.record.findFirst).toHaveBeenCalledWith({
      where: { id: 5, tableId: 1, companyId: 100 },
      select: { id: true, data: true },
    });
    expect(prisma.record.update).toHaveBeenCalledWith({
      where: { id: 5, companyId: 100 },
      data: { data: { name: "John", status: "done" } },
    });
  });

  it("skips UPDATE_RECORD when record not found", async () => {
    setupAuth();

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "UPDATE_RECORD", config: { tableId: 1, recordId: 5, updates: { status: "done" } } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });
    vi.mocked(prisma.record.findFirst).mockResolvedValue(null);

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(prisma.record.update).not.toHaveBeenCalled();
  });

  it("fires CREATE_RECORD automation after validating table", async () => {
    setupAuth();

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "CREATE_RECORD", config: { tableId: 1, values: { name: "New" } } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });
    vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue({ id: 1 } as any);
    vi.mocked(prisma.record.create).mockResolvedValue({} as any);

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(prisma.tableMeta.findFirst).toHaveBeenCalledWith({
      where: { id: 1, companyId: 100 },
      select: { id: true },
    });
    expect(prisma.record.create).toHaveBeenCalledWith({
      data: {
        tableId: 1,
        companyId: 100,
        data: { name: "New" },
      },
    });
  });

  it("fires UPDATE_TASK automation with whitelisted fields", async () => {
    setupAuth();

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "UPDATE_TASK", config: { taskId: "abc", updates: { status: "done", title: "Updated", badField: "ignored" } } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });
    vi.mocked(prisma.task.update).mockResolvedValue({} as any);

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: "abc", companyId: 100 },
      data: { status: "done", title: "Updated" },
    });
  });

  it("fires CREATE_CALENDAR_EVENT automation with valid fields", async () => {
    setupAuth();
    const { createCalendarEvent } = await import("@/app/actions/calendar");

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "CREATE_CALENDAR_EVENT", config: { title: "Orientation", startTime: "2026-03-01T09:00:00Z", endTime: "2026-03-01T10:00:00Z" } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(createCalendarEvent).toHaveBeenCalledWith({
      title: "Orientation",
      description: undefined,
      startTime: "2026-03-01T09:00:00Z",
      endTime: "2026-03-01T10:00:00Z",
      color: undefined,
    });
  });

  it("skips CREATE_CALENDAR_EVENT when required fields are missing", async () => {
    setupAuth();
    const { createCalendarEvent } = await import("@/app/actions/calendar");

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "CREATE_CALENDAR_EVENT", config: { title: "Orientation" } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(createCalendarEvent).not.toHaveBeenCalled();
  });

  it("skips SEND_NOTIFICATION when recipientId is missing", async () => {
    setupAuth();
    const { createNotificationForCompany } = await import("@/lib/notifications-internal");

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "SEND_NOTIFICATION", config: { title: "T", message: "M" } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(createNotificationForCompany).not.toHaveBeenCalled();
  });

  it("skips SEND_NOTIFICATION when recipient validation fails", async () => {
    setupAuth();
    const { createNotificationForCompany } = await import("@/lib/notifications-internal");
    vi.mocked(validateUserInCompany).mockResolvedValue(false);

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "SEND_NOTIFICATION", config: { recipientId: 999, title: "T", message: "M" } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(createNotificationForCompany).not.toHaveBeenCalled();
  });

  it("skips SEND_WHATSAPP when workerData is absent", async () => {
    setupAuth();
    const { inngest } = await import("@/lib/inngest/client");

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "SEND_WHATSAPP", config: { phone: "0501234567", message: "Welcome" } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: null,
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("fires SEND_WHATSAPP with table phone lookup without recordId (latest record)", async () => {
    setupAuth();
    const { inngest } = await import("@/lib/inngest/client");

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "SEND_WHATSAPP", config: { phoneSource: "table", waTableId: 1, waPhoneColumn: "phone", message: "Hi" } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });
    vi.mocked(prisma.record.findFirst).mockResolvedValue({ data: { phone: "0509999999" } } as any);

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(prisma.record.findFirst).toHaveBeenCalledWith({
      where: { tableId: 1, companyId: 100 },
      orderBy: { createdAt: "desc" },
      select: { data: true },
    });
    expect(inngest.send).toHaveBeenCalledWith({
      id: expect.stringMatching(/^wa-worker-100-0509999999-1-\d+$/),
      name: "automation/send-whatsapp",
      data: {
        companyId: 100,
        phone: "0509999999",
        content: "Hi",
        messageType: undefined,
        mediaFileId: undefined,
        delay: undefined,
      },
    });
  });

  it("skips WEBHOOK when workerData is absent", async () => {
    setupAuth();
    const { inngest } = await import("@/lib/inngest/client");

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "WEBHOOK", config: { webhookUrl: "https://example.com/hook" } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: null,
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("skips CREATE_RECORD when table validation fails", async () => {
    setupAuth();

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "CREATE_RECORD", config: { tableId: 999, values: { name: "X" } } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });
    vi.mocked(prisma.tableMeta.findFirst).mockResolvedValue(null);

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(prisma.tableMeta.findFirst).toHaveBeenCalledWith({
      where: { id: 999, companyId: 100 },
      select: { id: true },
    });
    expect(prisma.record.create).not.toHaveBeenCalled();
  });

  // ── B1: WEBHOOK config.url fallback ─────────────────────────────

  it("fires WEBHOOK using config.url when webhookUrl is absent", async () => {
    setupAuth();
    const { inngest } = await import("@/lib/inngest/client");

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Final Step", onCompleteActions: [
        { actionType: "WEBHOOK", config: { url: "https://example.com/alt" } },
      ],
      path: { name: "Onboard", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Onboard", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(inngest.send).toHaveBeenCalledWith({
      id: expect.stringMatching(/^webhook-worker-100-1-\d+$/),
      name: "automation/send-webhook",
      data: {
        url: "https://example.com/alt",
        companyId: 100,
        ruleId: 0,
        payload: {
          ruleId: 0,
          ruleName: "Onboarding: Final Step",
          triggerType: "ONBOARDING_STEP_COMPLETED",
          companyId: 100,
          data: expect.objectContaining({
            stepId: 1,
            stepTitle: "Final Step",
            pathName: "Onboard",
            actorName: "Admin",
          }),
        },
      },
    });
  });

  // ── B2: WEBHOOK skips when no URL configured ────────────────────

  it("skips WEBHOOK when no URL is configured", async () => {
    setupAuth();
    const { inngest } = await import("@/lib/inngest/client");

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "WEBHOOK", config: {} },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(inngest.send).not.toHaveBeenCalled();
  });

  // ── B3: SEND_WHATSAPP phone field missing from record data ──────

  it("skips SEND_WHATSAPP when phone field missing from record data", async () => {
    setupAuth();
    const { inngest } = await import("@/lib/inngest/client");

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "SEND_WHATSAPP", config: { phoneSource: "table", waTableId: 1, waPhoneColumn: "phone", waRecordId: 5, message: "Hi" } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });
    vi.mocked(prisma.record.findFirst).mockResolvedValue({ data: { name: "John" } } as any);

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(inngest.send).not.toHaveBeenCalled();
  });

  // ── B4: CREATE_TASK guard — title missing ───────────────────────

  it("skips CREATE_TASK when title is missing", async () => {
    setupAuth();

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "CREATE_TASK", config: { description: "something" } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  // ── B5: CREATE_FINANCE guard — required fields missing ──────────

  it("skips CREATE_FINANCE when required fields are missing", async () => {
    setupAuth();

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "CREATE_FINANCE", config: { title: "X" } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(prisma.financeRecord.create).not.toHaveBeenCalled();
  });

  // ── B6: UPDATE_RECORD guard — missing recordId/updates ──────────

  it("skips UPDATE_RECORD when config fields are missing", async () => {
    setupAuth();

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "UPDATE_RECORD", config: { tableId: 1 } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(prisma.record.findFirst).not.toHaveBeenCalled();
    expect(prisma.record.update).not.toHaveBeenCalled();
  });

  // ── B7: UPDATE_TASK guard — taskId missing ──────────────────────

  it("skips UPDATE_TASK when taskId is missing", async () => {
    setupAuth();

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "UPDATE_TASK", config: { updates: { status: "done" } } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  // ── B8: CREATE_RECORD guard — tableId missing ──────────────────

  it("skips CREATE_RECORD when tableId is missing", async () => {
    setupAuth();

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "CREATE_RECORD", config: { values: { name: "X" } } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(prisma.tableMeta.findFirst).not.toHaveBeenCalled();
    expect(prisma.record.create).not.toHaveBeenCalled();
  });

  // ── B9: SEND_WHATSAPP table fetch throws (catch branch) ────────

  it("skips SEND_WHATSAPP when table fetch throws", async () => {
    setupAuth();
    const { inngest } = await import("@/lib/inngest/client");

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "SEND_WHATSAPP", config: { phoneSource: "table", waTableId: 1, waPhoneColumn: "phone", waRecordId: 5, message: "Hi" } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });
    vi.mocked(prisma.record.findFirst).mockRejectedValue(new Error("DB connection lost"));

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(inngest.send).not.toHaveBeenCalled();
  });

  // ── B10: WEBHOOK validateWebhookUrl rejects non-HTTPS URL ──────

  it("skips WEBHOOK when validateWebhookUrl rejects non-HTTPS URL", async () => {
    setupAuth();
    const { inngest } = await import("@/lib/inngest/client");

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "WEBHOOK", config: { webhookUrl: "http://example.com/hook" } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    const result = await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(inngest.send).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 1, status: "COMPLETED" });
  });

  // ── B11: SEND_WHATSAPP phoneSource=table with missing waTableId ─

  it("skips SEND_WHATSAPP table lookup when waTableId is missing", async () => {
    setupAuth();
    const { inngest } = await import("@/lib/inngest/client");

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "SEND_WHATSAPP", config: { phoneSource: "table", waPhoneColumn: "phone", message: "Hi" } },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    mockTx.workerOnboardingStep.upsert.mockResolvedValue({ id: 1, status: "COMPLETED" });
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(prisma.record.findFirst).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("handles unknown action type without crashing", async () => {
    setupAuth();

    vi.mocked(prisma.onboardingStep.findFirst).mockResolvedValue({
      id: 1, title: "Step", onCompleteActions: [
        { actionType: "DOES_NOT_EXIST", config: {} },
      ],
      path: { name: "Path", companyId: 100 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findFirst)
      .mockResolvedValueOnce({ id: 1, workerId: 10 } as any)
      .mockResolvedValueOnce({
        id: 1, status: "IN_PROGRESS",
        worker: { id: 10, firstName: "J", lastName: "D", email: null, phone: null, position: null, status: "ONBOARDING", departmentId: 5 },
        path: { id: 5, name: "Path", companyId: 100, steps: [] },
      } as any);
    mockTx.workerOnboardingStep.findUnique.mockResolvedValue(null);
    const sp = { id: 1, status: "COMPLETED" };
    mockTx.workerOnboardingStep.upsert.mockResolvedValue(sp);
    vi.mocked(redis.set).mockResolvedValue("OK" as any);
    mockTx.workerOnboardingStep.findMany.mockResolvedValue([]);
    mockTx.workerOnboarding.findFirst.mockResolvedValue({ status: "IN_PROGRESS" });

    const result = await updateStepProgress(1, 1, { status: "COMPLETED" });
    expect(result).toEqual(sp);
    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(prisma.record.create).not.toHaveBeenCalled();
    expect(prisma.financeRecord.create).not.toHaveBeenCalled();
    const { inngest } = await import("@/lib/inngest/client");
    expect(inngest.send).not.toHaveBeenCalled();
  });
});

describe("getWorkersByOnboardingPath", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(getWorkersByOnboardingPath(1)).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied without canViewWorkers", async () => {
    setupAuth(noPermsUser);
    await expect(getWorkersByOnboardingPath(1)).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(getWorkersByOnboardingPath(1)).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("throws when path not found", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingPath.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.workerOnboarding.findMany).mockResolvedValue([]);
    await expect(getWorkersByOnboardingPath(999)).rejects.toThrow("Path not found");
  });

  it("calculates progress percentage", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingPath.findFirst).mockResolvedValue({
      _count: { steps: 4 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findMany).mockResolvedValue([
      {
        id: 1, status: "IN_PROGRESS", completedAt: null, createdAt: new Date(),
        worker: { id: 10, firstName: "J", lastName: "D", avatar: null, position: null, department: null },
        stepProgress: [{ stepId: 1 }, { stepId: 2 }],
      },
    ] as any);

    const result = await getWorkersByOnboardingPath(1);
    expect(result[0].progress).toBe(50); // 2/4 = 50%
    expect(result[0].completedSteps).toBe(2);
    expect(result[0].totalSteps).toBe(4);
  });

  it("caps completedSteps at totalSteps", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingPath.findFirst).mockResolvedValue({
      _count: { steps: 2 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findMany).mockResolvedValue([
      {
        id: 1, status: "IN_PROGRESS", completedAt: null, createdAt: new Date(),
        worker: { id: 10, firstName: "J", lastName: "D", avatar: null, position: null, department: null },
        stepProgress: [{ stepId: 1 }, { stepId: 2 }, { stepId: 3 }], // more completed than total
      },
    ] as any);

    const result = await getWorkersByOnboardingPath(1);
    expect(result[0].completedSteps).toBe(2); // capped at totalSteps
    expect(result[0].progress).toBe(100);
  });

  it("returns 0% when totalSteps is 0", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingPath.findFirst).mockResolvedValue({
      _count: { steps: 0 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findMany).mockResolvedValue([
      {
        id: 1, status: "IN_PROGRESS", completedAt: null, createdAt: new Date(),
        worker: { id: 10, firstName: "J", lastName: "D", avatar: null, position: null, department: null },
        stepProgress: [],
      },
    ] as any);

    const result = await getWorkersByOnboardingPath(1);
    expect(result[0].progress).toBe(0);
  });

  it("derives COMPLETED status when all steps are done", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingPath.findFirst).mockResolvedValue({
      _count: { steps: 2 },
    } as any);
    vi.mocked(prisma.workerOnboarding.findMany).mockResolvedValue([
      {
        id: 1, status: "IN_PROGRESS", completedAt: null, createdAt: new Date(),
        worker: { id: 10, firstName: "J", lastName: "D", avatar: null, position: null, department: null },
        stepProgress: [{ stepId: 1 }, { stepId: 2 }],
      },
    ] as any);

    const result = await getWorkersByOnboardingPath(1);
    expect(result[0].status).toBe("COMPLETED");
  });
});

describe("getWorkerStepProgress", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(getWorkerStepProgress(1)).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied without canViewWorkers", async () => {
    setupAuth(noPermsUser);
    await expect(getWorkerStepProgress(1)).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(getWorkerStepProgress(1)).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("returns scoped step progress", async () => {
    setupAuth();
    const progress = [{ stepId: 1, status: "COMPLETED" }];
    vi.mocked(prisma.workerOnboardingStep.findMany).mockResolvedValue(progress as any);

    const result = await getWorkerStepProgress(1);
    expect(result).toEqual(progress);
    expect(prisma.workerOnboardingStep.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          onboardingId: 1,
          onboarding: { worker: { companyId: 100, deletedAt: null } },
        }),
      }),
    );
  });
});

// ══════════════════════════════════════════════════════════════════
// F. WORKER TASKS
// ══════════════════════════════════════════════════════════════════

describe("getWorkerTasks", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(getWorkerTasks()).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied without canViewWorkers", async () => {
    setupAuth(noPermsUser);
    await expect(getWorkerTasks()).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(getWorkerTasks()).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("filters by workerId when provided", async () => {
    setupAuth();
    vi.mocked(prisma.workerTask.findMany).mockResolvedValue([]);

    await getWorkerTasks(5);
    expect(prisma.workerTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workerId: 5, companyId: 100 }),
      }),
    );
  });

  it("returns all tasks when no workerId", async () => {
    setupAuth();
    const tasks = [{ id: 1, title: "T" }];
    vi.mocked(prisma.workerTask.findMany).mockResolvedValue(tasks as any);

    const result = await getWorkerTasks();
    expect(result).toEqual(tasks);
    expect(prisma.workerTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 100, worker: { deletedAt: null } },
      }),
    );
  });
});

describe("createWorkerTask", () => {
  const validTask = { workerId: 1, title: "Task A" };

  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(createWorkerTask(validTask)).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied for viewer", async () => {
    setupAuth(viewerUser);
    await expect(createWorkerTask(validTask)).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(createWorkerTask(validTask)).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("throws on invalid priority", async () => {
    setupAuth();
    await expect(
      createWorkerTask({ ...validTask, priority: "INVALID" }),
    ).rejects.toThrow("Invalid task priority");
  });

  it("throws when title is empty", async () => {
    setupAuth();
    await expect(
      createWorkerTask({ workerId: 1, title: "   " }),
    ).rejects.toThrow("Task title is required");
  });

  it("throws when worker not in company", async () => {
    setupAuth();
    vi.mocked(validateWorkerInCompany).mockResolvedValue(false);
    await expect(createWorkerTask(validTask)).rejects.toThrow("Worker not found");
  });

  it("creates task on happy path", async () => {
    setupAuth();
    const created = { id: 1, title: "Task A" };
    vi.mocked(prisma.workerTask.create).mockResolvedValue(created as any);

    const result = await createWorkerTask(validTask);
    expect(result).toEqual(created);
    expect(prisma.workerTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: "Task A", companyId: 100, workerId: 1 }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/workers");
  });
});

describe("updateWorkerTask", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(updateWorkerTask(1, { title: "X" })).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied for viewer", async () => {
    setupAuth(viewerUser);
    await expect(updateWorkerTask(1, { title: "X" })).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(updateWorkerTask(1, { title: "X" })).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("throws on invalid task status", async () => {
    setupAuth();
    await expect(updateWorkerTask(1, { status: "INVALID" })).rejects.toThrow("Invalid task status");
  });

  it("throws on invalid task priority", async () => {
    setupAuth();
    await expect(updateWorkerTask(1, { priority: "INVALID" })).rejects.toThrow("Invalid task priority");
  });

  it("auto-sets completedAt when status is COMPLETED", async () => {
    setupAuth();
    vi.mocked(prisma.workerTask.update).mockResolvedValue({ id: 1, status: "COMPLETED" } as any);

    await updateWorkerTask(1, { status: "COMPLETED" });
    expect(prisma.workerTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ completedAt: expect.any(Date) }),
      }),
    );
  });

  it("uses provided completedAt when status is COMPLETED", async () => {
    setupAuth();
    const customDate = new Date("2024-06-01");
    vi.mocked(prisma.workerTask.update).mockResolvedValue({ id: 1 } as any);

    await updateWorkerTask(1, { status: "COMPLETED", completedAt: customDate });
    expect(prisma.workerTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ completedAt: customDate }),
      }),
    );
  });

  it("wraps Prisma not found error", async () => {
    setupAuth();
    vi.mocked(prisma.workerTask.update).mockRejectedValue({ code: "P2025" });
    await expect(updateWorkerTask(1, { title: "X" })).rejects.toThrow("הפריט המבוקש לא נמצא");
  });

  it("updates task on happy path", async () => {
    setupAuth();
    const updated = { id: 1, title: "Updated" };
    vi.mocked(prisma.workerTask.update).mockResolvedValue(updated as any);

    const result = await updateWorkerTask(1, { title: "Updated" });
    expect(result).toEqual(updated);
    expect(revalidatePath).toHaveBeenCalledWith("/workers");
  });
});

describe("deleteWorkerTask", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(deleteWorkerTask(1)).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied for viewer", async () => {
    setupAuth(viewerUser);
    await expect(deleteWorkerTask(1)).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(deleteWorkerTask(1)).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("deletes task scoped to companyId and returns success", async () => {
    setupAuth();
    vi.mocked(prisma.workerTask.delete).mockResolvedValue({} as any);

    const result = await deleteWorkerTask(1);
    expect(result).toEqual({ success: true });
    expect(prisma.workerTask.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, companyId: 100 },
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/workers");
  });
});

// ══════════════════════════════════════════════════════════════════
// G. STATS & UTILITY
// ══════════════════════════════════════════════════════════════════

describe("getWorkersStats", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(getWorkersStats()).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied without canViewWorkers", async () => {
    setupAuth(noPermsUser);
    await expect(getWorkersStats()).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(getWorkersStats()).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("returns aggregated stats", async () => {
    setupAuth();
    vi.mocked(prisma.worker.groupBy).mockResolvedValue([
      { status: "ONBOARDING", _count: 3 },
      { status: "ACTIVE", _count: 10 },
    ] as any);
    vi.mocked(prisma.department.count).mockResolvedValue(5);
    vi.mocked(prisma.onboardingPath.count).mockResolvedValue(2);

    const result = await getWorkersStats();
    expect(result).toEqual({
      totalWorkers: 13,
      onboardingWorkers: 3,
      activeWorkers: 10,
      departments: 5,
      onboardingPaths: 2,
    });
  });

  it("returns 0 for missing status counts", async () => {
    setupAuth();
    vi.mocked(prisma.worker.groupBy).mockResolvedValue([] as any);
    vi.mocked(prisma.department.count).mockResolvedValue(0);
    vi.mocked(prisma.onboardingPath.count).mockResolvedValue(0);

    const result = await getWorkersStats();
    expect(result).toEqual({
      totalWorkers: 0,
      onboardingWorkers: 0,
      activeWorkers: 0,
      departments: 0,
      onboardingPaths: 0,
    });
  });
});

describe("getOnboardingPathSummaries", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(getOnboardingPathSummaries()).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied without canViewWorkers", async () => {
    setupAuth(noPermsUser);
    await expect(getOnboardingPathSummaries()).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(getOnboardingPathSummaries()).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("filters by isActive and optional departmentId", async () => {
    setupAuth();
    vi.mocked(prisma.onboardingPath.findMany).mockResolvedValue([]);

    await getOnboardingPathSummaries(5);
    expect(prisma.onboardingPath.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true, departmentId: 5 }),
      }),
    );
  });

  it("returns summaries without departmentId filter", async () => {
    setupAuth();
    const summaries = [{ id: 1, name: "P", _count: { steps: 3 } }];
    vi.mocked(prisma.onboardingPath.findMany).mockResolvedValue(summaries as any);

    const result = await getOnboardingPathSummaries();
    expect(result).toEqual(summaries);
  });
});

describe("getCompanyUsers", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(getCompanyUsers()).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied without canViewWorkers", async () => {
    setupAuth(noPermsUser);
    await expect(getCompanyUsers()).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(getCompanyUsers()).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("returns users scoped to companyId", async () => {
    setupAuth();
    const users = [{ id: 1, name: "Admin", email: "a@b.com" }];
    vi.mocked(prisma.user.findMany).mockResolvedValue(users as any);

    const result = await getCompanyUsers();
    expect(result).toEqual(users);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 100 },
      }),
    );
  });
});

describe("getCompanyTables", () => {
  it("throws Not authenticated when no user", async () => {
    setupNoAuth();
    await expect(getCompanyTables()).rejects.toThrow("Not authenticated");
  });

  it("throws Permission denied without canViewWorkers", async () => {
    setupAuth(noPermsUser);
    await expect(getCompanyTables()).rejects.toThrow("Permission denied");
  });

  it("throws rate limit error", async () => {
    setupRateLimited();
    await expect(getCompanyTables()).rejects.toThrow("בוצעו יותר מדי פניות");
  });

  it("returns tables scoped to companyId", async () => {
    setupAuth();
    const tables = [{ id: 1, name: "Contacts" }];
    vi.mocked(prisma.tableMeta.findMany).mockResolvedValue(tables as any);

    const result = await getCompanyTables();
    expect(result).toEqual(tables);
    expect(prisma.tableMeta.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 100 },
      }),
    );
  });
});

// ══════════════════════════════════════════════════════════════════
// H. CACHE INVALIDATION
// ══════════════════════════════════════════════════════════════════

describe("invalidatePathsCache (via deleteOnboardingPath)", () => {
  it("scans and deletes matching cache keys via pipeline", async () => {
    setupAuth();
    mockTx.workerOnboarding.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.onboardingPath.delete.mockResolvedValue({});

    // redis.scan returns keys matching the pattern
    vi.mocked(redis.scan).mockResolvedValue([
      "0",
      ["workers:100:paths", "workers:100:paths:5"],
    ] as any);

    await deleteOnboardingPath(1);

    expect(redis.scan).toHaveBeenCalledWith("0", "MATCH", "workers:100:paths*", "COUNT", 100);
    expect(mockPipeline.del).toHaveBeenCalledWith("workers:100:paths");
    expect(mockPipeline.del).toHaveBeenCalledWith("workers:100:paths:5");
    expect(mockPipeline.exec).toHaveBeenCalled();
  });
});
