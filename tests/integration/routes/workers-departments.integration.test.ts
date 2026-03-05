import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import type { User } from "@/lib/permissions";

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockGetCurrentUser } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
}));

vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/server-action-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server-action-utils")>();
  return { ...actual, checkServerActionRateLimit: vi.fn() };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/redis", () => {
  const noop = vi.fn().mockResolvedValue(null);
  return {
    redis: {
      get: noop,
      set: noop,
      del: noop,
      scan: noop.mockResolvedValue(["0", []]),
      pipeline: vi.fn(() => ({
        del: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      })),
      options: { keyPrefix: "" },
    },
  };
});

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue({ ids: [] }) },
}));

// ── Import server actions AFTER mocks ───────────────────────────────
import {
  getDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from "@/app/actions/workers";

import {
  seedCompany,
  seedUser,
  seedDepartment,
  seedWorker,
  seedOnboardingPath,
  makeAdminUser,
  makeBasicUserWithWorkerPerms,
  makeBasicUserViewOnly,
  makeBasicUserNoPerms,
  cleanupWorkers,
} from "./workers-helpers";

// ── State ───────────────────────────────────────────────────────────
let companyA: { id: number };
let companyB: { id: number };
let adminUserA: { id: number };
let basicUserPerms: { id: number };
let basicUserView: { id: number };
let basicUserNone: { id: number };
let userB: { id: number };

function authAdmin() {
  mockGetCurrentUser.mockResolvedValue(makeAdminUser(adminUserA.id, companyA.id));
}
function authManage() {
  mockGetCurrentUser.mockResolvedValue(makeBasicUserWithWorkerPerms(basicUserPerms.id, companyA.id));
}
function authView() {
  mockGetCurrentUser.mockResolvedValue(makeBasicUserViewOnly(basicUserView.id, companyA.id));
}
function authNone() {
  mockGetCurrentUser.mockResolvedValue(makeBasicUserNoPerms(basicUserNone.id, companyA.id));
}
function authNull() {
  mockGetCurrentUser.mockResolvedValue(null);
}

// ── Lifecycle ───────────────────────────────────────────────────────
beforeAll(async () => {
  companyA = await seedCompany();
  companyB = await seedCompany();
  adminUserA = await seedUser(companyA.id, { role: "admin" });
  basicUserPerms = await seedUser(companyA.id, {
    role: "basic",
    permissions: { canViewWorkers: true, canManageWorkers: true },
  });
  basicUserView = await seedUser(companyA.id, {
    role: "basic",
    permissions: { canViewWorkers: true },
  });
  basicUserNone = await seedUser(companyA.id, { role: "basic", permissions: {} });
  userB = await seedUser(companyB.id, { role: "admin" });
}, 30_000);

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await cleanupWorkers([companyA?.id, companyB?.id].filter(Boolean));
  await prisma.$disconnect();
}, 15_000);

// ── Tests ───────────────────────────────────────────────────────────

describe("Auth & Permissions", () => {
  it("should throw 'Not authenticated' when getCurrentUser returns null", async () => {
    authNull();
    await expect(getDepartments()).rejects.toThrow("Not authenticated");
  });

  it("should throw 'Permission denied' for basic user without canViewWorkers (getDepartments)", async () => {
    authNone();
    await expect(getDepartments()).rejects.toThrow("Permission denied");
  });

  it("should throw 'Permission denied' for basic user without canManageWorkers (createDepartment)", async () => {
    authView();
    await expect(createDepartment({ name: "Test" })).rejects.toThrow("Permission denied");
  });

  it("should succeed for admin user", async () => {
    authAdmin();
    const result = await getDepartments();
    expect(Array.isArray(result)).toBe(true);
  });

  it("should succeed for basic user with canViewWorkers (read ops)", async () => {
    authView();
    const result = await getDepartments();
    expect(Array.isArray(result)).toBe(true);
  });

  it("should succeed for basic user with canManageWorkers (write ops)", async () => {
    authManage();
    const dept = await createDepartment({ name: "הרשאות כתיבה" });
    expect(dept).toHaveProperty("id");
    await prisma.department.delete({ where: { id: dept!.id } });
  });
});

describe("getDepartments", () => {
  let deptA1: { id: number };
  let deptA2: { id: number };
  let deletedDept: { id: number };
  let deptB: { id: number };

  beforeAll(async () => {
    deptA1 = await seedDepartment(companyA.id, { name: "מכירות" });
    deptA2 = await seedDepartment(companyA.id, { name: "שיווק" });
    deletedDept = await seedDepartment(companyA.id, {
      name: "מחלקה שנמחקה",
      deletedAt: new Date(),
    });
    deptB = await seedDepartment(companyB.id, { name: "מחלקת חברה ב" });
    await seedWorker(companyA.id, deptA1.id);
    await seedOnboardingPath(companyA.id, { departmentId: deptA1.id });
  });

  afterAll(async () => {
    await prisma.onboardingPath.deleteMany({ where: { companyId: companyA.id } });
    await prisma.worker.deleteMany({ where: { companyId: companyA.id } });
    await prisma.department.deleteMany({
      where: { id: { in: [deptA1.id, deptA2.id, deletedDept.id, deptB.id] } },
    });
  });

  it("should return all non-deleted departments for company", async () => {
    authAdmin();
    const depts = await getDepartments();
    const ids = depts.map((d: any) => d.id);
    expect(ids).toContain(deptA1.id);
    expect(ids).toContain(deptA2.id);
  });

  it("should exclude soft-deleted departments", async () => {
    authAdmin();
    const depts = await getDepartments();
    const ids = depts.map((d: any) => d.id);
    expect(ids).not.toContain(deletedDept.id);
  });

  it("should not return departments from other companies (multi-tenancy)", async () => {
    authAdmin();
    const depts = await getDepartments();
    const ids = depts.map((d: any) => d.id);
    expect(ids).not.toContain(deptB.id);
  });

  it("should include worker count and onboarding path count", async () => {
    authAdmin();
    const depts = await getDepartments();
    const dept = depts.find((d: any) => d.id === deptA1.id);
    expect(dept._count.workers).toBeGreaterThanOrEqual(1);
    expect(dept._count.onboardingPaths).toBeGreaterThanOrEqual(1);
  });

  it("should return empty array when no departments exist (isolated company)", async () => {
    // Use a fresh isolated company instead of deleting companyB data
    const emptyCompany = await seedCompany();
    const emptyUser = await seedUser(emptyCompany.id);
    mockGetCurrentUser.mockResolvedValue(makeAdminUser(emptyUser.id, emptyCompany.id));
    const depts = await getDepartments();
    expect(depts).toEqual([]);
    // cleanup
    await prisma.user.delete({ where: { id: emptyUser.id } });
    await prisma.company.delete({ where: { id: emptyCompany.id } });
  });

  it("should return correct response contract shape for each department", async () => {
    authAdmin();
    const depts = await getDepartments();
    const dept = depts.find((d: any) => d.id === deptA1.id);
    expect(dept).toBeDefined();
    const expectedKeys = [
      "id", "name", "description", "color", "icon",
      "managerId", "isActive", "createdAt", "updatedAt", "_count",
    ];
    expect(Object.keys(dept).sort()).toEqual(expectedKeys.sort());
  });
});

describe("getDepartment", () => {
  let dept: { id: number };
  let deletedDept: { id: number };
  let deptB: { id: number };

  beforeAll(async () => {
    dept = await seedDepartment(companyA.id, { name: "פרטי מחלקה" });
    deletedDept = await seedDepartment(companyA.id, {
      name: "מחלקה שנמחקה",
      deletedAt: new Date(),
    });
    deptB = await seedDepartment(companyB.id, { name: "מחלקת חברה ב" });
    await seedWorker(companyA.id, dept.id);
    await seedWorker(companyA.id, dept.id, { deletedAt: new Date() });
    await seedOnboardingPath(companyA.id, { departmentId: dept.id });
  });

  afterAll(async () => {
    await prisma.onboardingPath.deleteMany({ where: { companyId: companyA.id } });
    await prisma.worker.deleteMany({ where: { companyId: companyA.id } });
    await prisma.department.deleteMany({
      where: { id: { in: [dept.id, deletedDept.id, deptB.id] } },
    });
  });

  it("should return department with nested workers and onboarding paths", async () => {
    authAdmin();
    const result = await getDepartment(dept.id);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(dept.id);
    expect(Array.isArray(result!.workers)).toBe(true);
    expect(Array.isArray(result!.onboardingPaths)).toBe(true);
  });

  it("should exclude soft-deleted workers from nested results", async () => {
    authAdmin();
    const result = await getDepartment(dept.id);
    expect(result!.workers.length).toBe(1);
  });

  it("should return null for non-existent department", async () => {
    authAdmin();
    const result = await getDepartment(999999);
    expect(result).toBeNull();
  });

  it("should return null for department in different company", async () => {
    authAdmin();
    const result = await getDepartment(deptB.id);
    expect(result).toBeNull();
  });

  it("should return null for soft-deleted department", async () => {
    authAdmin();
    const result = await getDepartment(deletedDept.id);
    expect(result).toBeNull();
  });
});

describe("createDepartment", () => {
  const createdIds: number[] = [];

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.department.deleteMany({ where: { id: { in: createdIds } } });
    }
  });

  it("should create department with all fields and verify DB state", async () => {
    authAdmin();
    const dept = await createDepartment({
      name: "מכירות",
      description: "צוות מכירות",
      color: "#FF0000",
      icon: "Users",
      managerId: adminUserA.id,
    });
    createdIds.push(dept!.id);
    expect(dept).toMatchObject({
      name: "מכירות",
      description: "צוות מכירות",
      color: "#FF0000",
      icon: "Users",
      managerId: adminUserA.id,
    });
    const dbDept = await prisma.department.findUnique({ where: { id: dept!.id } });
    expect(dbDept!.companyId).toBe(companyA.id);
    expect(dbDept!.name).toBe("מכירות");
  });

  it("should create department with minimal fields (name only) and use @default values", async () => {
    authAdmin();
    const dept = await createDepartment({ name: "מינימלי" });
    createdIds.push(dept!.id);
    expect(dept!.name).toBe("מינימלי");
    // Verify @default values from schema via DB
    const dbDept = await prisma.department.findUnique({ where: { id: dept!.id } });
    expect(dbDept!.color).toBe("#3B82F6");
    expect(dbDept!.icon).toBe("Building2");
    expect(dbDept!.isActive).toBe(true);
  });

  it("should throw 'Department name is required' for empty name", async () => {
    authAdmin();
    await expect(createDepartment({ name: "" })).rejects.toThrow("Department name is required");
  });

  it("should throw Hebrew max-length error for name exceeding 200 chars", async () => {
    authAdmin();
    const longName = "a".repeat(201);
    await expect(createDepartment({ name: longName })).rejects.toThrow(
      "הטקסט ארוך מדי, מותר עד 200 תווים",
    );
  });

  it("should validate managerId belongs to same company", async () => {
    authAdmin();
    const dept = await createDepartment({
      name: "עם מנהל",
      managerId: adminUserA.id,
    });
    createdIds.push(dept!.id);
    expect(dept!.managerId).toBe(adminUserA.id);
  });

  it("should throw 'Invalid manager' for manager from different company", async () => {
    authAdmin();
    await expect(
      createDepartment({ name: "מנהל לא תקין", managerId: userB.id }),
    ).rejects.toThrow("Invalid manager");
  });

  it("should trim whitespace from name and description", async () => {
    authAdmin();
    const dept = await createDepartment({
      name: "  מחלקה חתוכה  ",
      description: "  תיאור חתוך  ",
    });
    createdIds.push(dept!.id);
    expect(dept!.name).toBe("מחלקה חתוכה");
    expect(dept!.description).toBe("תיאור חתוך");
  });

  it("should return correct response contract shape", async () => {
    authAdmin();
    const dept = await createDepartment({ name: "בדיקת חוזה" });
    createdIds.push(dept!.id);
    const expectedKeys = [
      "id", "name", "description", "color", "icon",
      "managerId", "isActive", "createdAt", "updatedAt",
    ];
    expect(Object.keys(dept!).sort()).toEqual(expectedKeys.sort());
  });
});

describe("updateDepartment", () => {
  let dept: { id: number; updatedAt?: Date };

  beforeAll(async () => {
    dept = await seedDepartment(companyA.id, {
      name: "מחלקה לעדכון",
      description: "מקורי",
      color: "#000000",
    });
  });

  afterAll(async () => {
    await prisma.department.deleteMany({ where: { id: dept.id } });
  });

  it("should update single field and verify other fields unchanged", async () => {
    authAdmin();
    const updated = await updateDepartment(dept.id, { name: "שם חדש" });
    expect(updated!.name).toBe("שם חדש");
    expect(updated!.description).toBe("מקורי");
    expect(updated!.color).toBe("#000000");
  });

  it("should update multiple fields simultaneously", async () => {
    authAdmin();
    const updated = await updateDepartment(dept.id, {
      name: "עדכון מרובה",
      description: "תיאור חדש",
      color: "#FFFFFF",
    });
    expect(updated!.name).toBe("עדכון מרובה");
    expect(updated!.description).toBe("תיאור חדש");
    expect(updated!.color).toBe("#FFFFFF");
  });

  it("should verify DB state matches response after update", async () => {
    authAdmin();
    const updated = await updateDepartment(dept.id, { name: "אימות דאטאבייס" });
    const dbDept = await prisma.department.findUnique({ where: { id: dept.id } });
    expect(dbDept!.name).toBe("אימות דאטאבייס");
    expect(dbDept!.name).toBe(updated!.name);
  });

  it("should update @updatedAt timestamp after update", async () => {
    const before = await prisma.department.findUnique({
      where: { id: dept.id },
      select: { updatedAt: true },
    });
    // Small delay to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 50));
    authAdmin();
    await updateDepartment(dept.id, { name: "בדיקת חותמת זמן" });
    const after = await prisma.department.findUnique({
      where: { id: dept.id },
      select: { updatedAt: true },
    });
    expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
  });

  it("should validate managerId on update", async () => {
    authAdmin();
    await expect(
      updateDepartment(dept.id, { managerId: userB.id }),
    ).rejects.toThrow("Invalid manager");
  });

  it("should throw 'הפריט המבוקש לא נמצא' for non-existent department", async () => {
    authAdmin();
    await expect(
      updateDepartment(999999, { name: "לא קיים" }),
    ).rejects.toThrow("הפריט המבוקש לא נמצא");
  });

  it("should throw 'הפריט המבוקש לא נמצא' for department in different company", async () => {
    authAdmin();
    const otherDept = await seedDepartment(companyB.id);
    await expect(
      updateDepartment(otherDept.id, { name: "חברה אחרת" }),
    ).rejects.toThrow("הפריט המבוקש לא נמצא");
    await prisma.department.delete({ where: { id: otherDept.id } });
  });

  it("should allow setting isActive to false", async () => {
    authAdmin();
    const updated = await updateDepartment(dept.id, { isActive: false });
    expect(updated!.isActive).toBe(false);
    await updateDepartment(dept.id, { isActive: true });
  });

  it("should allow removing manager by setting managerId to null", async () => {
    authAdmin();
    await updateDepartment(dept.id, { managerId: adminUserA.id });
    const updated = await updateDepartment(dept.id, { managerId: null as any });
    expect(updated!.managerId).toBeNull();
  });
});

describe("deleteDepartment", () => {
  it("should soft-delete department (set deletedAt) and verify DB", async () => {
    authAdmin();
    const dept = await seedDepartment(companyA.id, { name: "למחיקה" });
    const result = await deleteDepartment(dept.id);
    expect(result).toEqual({ success: true });
    const dbDept = await prisma.department.findUnique({ where: { id: dept.id } });
    expect(dbDept!.deletedAt).not.toBeNull();
    await prisma.department.delete({ where: { id: dept.id } });
  });

  it("should throw 'Cannot delete department with active workers'", async () => {
    authAdmin();
    const dept = await seedDepartment(companyA.id, { name: "עם עובדים" });
    await seedWorker(companyA.id, dept.id);
    await expect(deleteDepartment(dept.id)).rejects.toThrow(
      "Cannot delete department with active workers",
    );
    await prisma.worker.deleteMany({ where: { departmentId: dept.id } });
    await prisma.department.delete({ where: { id: dept.id } });
  });

  it("should allow deleting department with zero non-deleted workers", async () => {
    authAdmin();
    const dept = await seedDepartment(companyA.id, { name: "עם עובדים מחוקים" });
    await seedWorker(companyA.id, dept.id, { deletedAt: new Date() });
    const result = await deleteDepartment(dept.id);
    expect(result).toEqual({ success: true });
    await prisma.worker.deleteMany({ where: { departmentId: dept.id } });
    await prisma.department.delete({ where: { id: dept.id } });
  });

  it("should throw 'הפריט המבוקש לא נמצא' for non-existent department", async () => {
    authAdmin();
    await expect(deleteDepartment(999999)).rejects.toThrow("הפריט המבוקש לא נמצא");
  });

  it("should return { success: true } on successful delete", async () => {
    authAdmin();
    const dept = await seedDepartment(companyA.id, { name: "מחיקה מוצלחת" });
    const result = await deleteDepartment(dept.id);
    expect(result).toEqual({ success: true });
    await prisma.department.delete({ where: { id: dept.id } });
  });
});
