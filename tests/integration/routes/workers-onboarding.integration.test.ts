import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";

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
} from "@/app/actions/workers";

import {
  seedCompany,
  seedUser,
  seedDepartment,
  seedWorker,
  seedOnboardingPath,
  seedOnboardingStep,
  seedWorkerOnboarding,
  makeAdminUser,
  cleanupWorkers,
} from "./workers-helpers";

// ── State ───────────────────────────────────────────────────────────
let companyA: { id: number };
let companyB: { id: number };
let adminA: { id: number };
let userB: { id: number };
let deptA: { id: number };
let deptB: { id: number };

function authAdmin() {
  mockGetCurrentUser.mockResolvedValue(makeAdminUser(adminA.id, companyA.id));
}

// ── Lifecycle ───────────────────────────────────────────────────────
beforeAll(async () => {
  companyA = await seedCompany();
  companyB = await seedCompany();
  adminA = await seedUser(companyA.id, { role: "admin" });
  userB = await seedUser(companyB.id, { role: "admin" });
  deptA = await seedDepartment(companyA.id, { name: "מחלקת קליטה" });
  deptB = await seedDepartment(companyB.id, { name: "מחלקת חברה ב" });
}, 30_000);

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await cleanupWorkers([companyA?.id, companyB?.id].filter(Boolean));
  await prisma.$disconnect();
}, 15_000);

// ══════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════

describe("Auth", () => {
  it("should throw 'Not authenticated' for getOnboardingPaths when user is null", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    await expect(getOnboardingPaths()).rejects.toThrow("Not authenticated");
  });
});

// ══════════════════════════════════════════════════════════════════════
// ONBOARDING PATHS
// ══════════════════════════════════════════════════════════════════════

describe("getOnboardingPaths", () => {
  let pathA: { id: number };
  let pathB: { id: number };
  let pathOther: { id: number };

  beforeAll(async () => {
    pathA = await seedOnboardingPath(companyA.id, { name: "מסלול אלפא", departmentId: deptA.id });
    pathB = await seedOnboardingPath(companyA.id, { name: "מסלול בטא" });
    pathOther = await seedOnboardingPath(companyB.id, { name: "מסלול חיצוני" });
    await seedOnboardingStep(companyA.id, pathA.id, { title: "שלב 1" });
  });

  afterAll(async () => {
    await prisma.onboardingStep.deleteMany({ where: { companyId: companyA.id } });
    await prisma.onboardingPath.deleteMany({
      where: { id: { in: [pathA.id, pathB.id, pathOther.id] } },
    });
  });

  it("should return all paths with steps, department, and counts", async () => {
    authAdmin();
    const paths = await getOnboardingPaths();
    expect(paths.length).toBeGreaterThanOrEqual(2);
    const p = paths.find((p: any) => p.id === pathA.id);
    expect(p).toBeDefined();
    expect(p.steps.length).toBeGreaterThanOrEqual(1);
    expect(p._count).toHaveProperty("steps");
    expect(p._count).toHaveProperty("workerProgress");
  });

  it("should filter by departmentId when provided", async () => {
    authAdmin();
    const paths = await getOnboardingPaths(deptA.id);
    const ids = paths.map((p: any) => p.id);
    expect(ids).toContain(pathA.id);
    expect(ids).not.toContain(pathB.id);
  });

  it("should return paths from all departments when no filter", async () => {
    authAdmin();
    const paths = await getOnboardingPaths();
    const ids = paths.map((p: any) => p.id);
    expect(ids).toContain(pathA.id);
    expect(ids).toContain(pathB.id);
  });

  it("should not return paths from other companies", async () => {
    authAdmin();
    const paths = await getOnboardingPaths();
    const ids = paths.map((p: any) => p.id);
    expect(ids).not.toContain(pathOther.id);
  });

  it("should return exact response contract keys for each path entry", async () => {
    authAdmin();
    const paths = await getOnboardingPaths();
    const p = paths.find((p: any) => p.id === pathA.id);
    expect(p).toBeDefined();
    const expectedKeys = [
      "id", "name", "description", "departmentId",
      "isDefault", "isActive", "estimatedDays",
      "createdAt", "updatedAt", "department", "steps", "_count",
    ];
    expect(Object.keys(p).sort()).toEqual(expectedKeys.sort());
  });
});

describe("getOnboardingPath", () => {
  let path: { id: number };
  let pathOther: { id: number };

  beforeAll(async () => {
    path = await seedOnboardingPath(companyA.id, { name: "פרטי מסלול", departmentId: deptA.id });
    pathOther = await seedOnboardingPath(companyB.id, { name: "מסלול חיצוני" });
    await seedOnboardingStep(companyA.id, path.id, { title: "שלב א", order: 0 });
    await seedOnboardingStep(companyA.id, path.id, { title: "שלב ב", order: 1 });
  });

  afterAll(async () => {
    await prisma.onboardingStep.deleteMany({ where: { pathId: path.id } });
    await prisma.onboardingPath.deleteMany({
      where: { id: { in: [path.id, pathOther.id] } },
    });
  });

  it("should return path with steps (ordered by order), worker progress, and department", async () => {
    authAdmin();
    const result = await getOnboardingPath(path.id);
    expect(result).not.toBeNull();
    expect(result!.steps.length).toBe(2);
    expect(result!.steps[0].title).toBe("שלב א");
    expect(result!.steps[1].title).toBe("שלב ב");
    expect(result).toHaveProperty("department");
    expect(result).toHaveProperty("workerProgress");
  });

  it("should return null for non-existent path", async () => {
    authAdmin();
    const result = await getOnboardingPath(999999);
    expect(result).toBeNull();
  });

  it("should return null for path in different company", async () => {
    authAdmin();
    const result = await getOnboardingPath(pathOther.id);
    expect(result).toBeNull();
  });
});

describe("createOnboardingPath", () => {
  const createdIds: number[] = [];

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.onboardingStep.deleteMany({
        where: { pathId: { in: createdIds } },
      });
      await prisma.onboardingPath.deleteMany({
        where: { id: { in: createdIds } },
      });
    }
  });

  it("should create path with steps in a single transaction", async () => {
    authAdmin();
    const path = await createOnboardingPath({
      name: "מסלול מלא",
      description: "מסלול עם שלבים",
      departmentId: deptA.id,
      steps: [
        { title: "שלב ראשון", type: "TASK", order: 0 },
        { title: "שלב שני", type: "TRAINING", order: 1 },
      ],
    });
    createdIds.push(path!.id);
    const steps = await prisma.onboardingStep.findMany({
      where: { pathId: path!.id },
      orderBy: { order: "asc" },
    });
    expect(steps.length).toBe(2);
    expect(steps[0].title).toBe("שלב ראשון");
    expect(steps[1].title).toBe("שלב שני");
  });

  it("should create path without steps", async () => {
    authAdmin();
    const path = await createOnboardingPath({ name: "בלי שלבים" });
    createdIds.push(path!.id);
    const steps = await prisma.onboardingStep.findMany({ where: { pathId: path!.id } });
    expect(steps.length).toBe(0);
  });

  it("should use @default values (isDefault=false, isActive=true) when not specified", async () => {
    authAdmin();
    const path = await createOnboardingPath({ name: "ברירות מחדל" });
    createdIds.push(path!.id);
    const dbPath = await prisma.onboardingPath.findUnique({ where: { id: path!.id } });
    expect(dbPath!.isDefault).toBe(false);
    expect(dbPath!.isActive).toBe(true);
  });

  it("should unset previous default path for same department when isDefault=true", async () => {
    authAdmin();
    const p1 = await createOnboardingPath({
      name: "ברירת מחדל 1",
      departmentId: deptA.id,
      isDefault: true,
    });
    createdIds.push(p1!.id);

    const p2 = await createOnboardingPath({
      name: "ברירת מחדל 2",
      departmentId: deptA.id,
      isDefault: true,
    });
    createdIds.push(p2!.id);

    const oldDefault = await prisma.onboardingPath.findUnique({ where: { id: p1!.id } });
    expect(oldDefault!.isDefault).toBe(false);
    const newDefault = await prisma.onboardingPath.findUnique({ where: { id: p2!.id } });
    expect(newDefault!.isDefault).toBe(true);
  });

  it("should validate departmentId belongs to same company", async () => {
    authAdmin();
    await expect(
      createOnboardingPath({ name: "מחלקה שגויה", departmentId: deptB.id }),
    ).rejects.toThrow("Department not found or access denied");
  });

  it("should throw 'Path name is required' for empty name", async () => {
    authAdmin();
    await expect(createOnboardingPath({ name: "" })).rejects.toThrow("Path name is required");
  });

  it("should throw 'הטקסט ארוך מדי, מותר עד 200 תווים' for path name > 200 chars", async () => {
    authAdmin();
    await expect(
      createOnboardingPath({ name: "א".repeat(201) }),
    ).rejects.toThrow("הטקסט ארוך מדי, מותר עד 200 תווים");
  });

  it("should validate each step type against VALID_STEP_TYPES enum", async () => {
    authAdmin();
    await expect(
      createOnboardingPath({
        name: "סוג שלב שגוי",
        steps: [{ title: "שגוי", type: "INVALID" }],
      }),
    ).rejects.toThrow("Invalid step type");
  });

  it("should throw for more than 200 steps", async () => {
    authAdmin();
    const steps = Array.from({ length: 201 }, (_, i) => ({ title: `שלב ${i}` }));
    await expect(
      createOnboardingPath({ name: "יותר מדי", steps }),
    ).rejects.toThrow("Onboarding path can have at most 200 steps");
  });

  it("should throw 'הערך חייב להיות מספר חיובי' for negative estimatedDays", async () => {
    authAdmin();
    await expect(
      createOnboardingPath({ name: "ימים שליליים", estimatedDays: -1 }),
    ).rejects.toThrow("הערך חייב להיות מספר חיובי");
  });

  it("should throw 'הטקסט ארוך מדי, מותר עד 5000 תווים' for description > 5000 chars", async () => {
    authAdmin();
    await expect(
      createOnboardingPath({ name: "בדיקת תיאור", description: "א".repeat(5001) }),
    ).rejects.toThrow("הטקסט ארוך מדי, מותר עד 5000 תווים");
  });
});

describe("updateOnboardingPath", () => {
  let path: { id: number };

  beforeAll(async () => {
    path = await seedOnboardingPath(companyA.id, {
      name: "מסלול לעדכון",
      departmentId: deptA.id,
    });
  });

  afterAll(async () => {
    await prisma.onboardingPath.deleteMany({ where: { id: path.id } });
  });

  it("should update path fields and verify DB state", async () => {
    authAdmin();
    const updated = await updateOnboardingPath(path.id, { name: "מסלול מעודכן" });
    expect(updated!.name).toBe("מסלול מעודכן");
    const dbPath = await prisma.onboardingPath.findUnique({ where: { id: path.id } });
    expect(dbPath!.name).toBe("מסלול מעודכן");
  });

  it("should update @updatedAt timestamp after update", async () => {
    const before = await prisma.onboardingPath.findUnique({
      where: { id: path.id },
      select: { updatedAt: true },
    });
    await new Promise((r) => setTimeout(r, 50));
    authAdmin();
    await updateOnboardingPath(path.id, { name: "חותמת זמן" });
    const after = await prisma.onboardingPath.findUnique({
      where: { id: path.id },
      select: { updatedAt: true },
    });
    expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
  });

  it("should unset other default paths when setting isDefault=true", async () => {
    authAdmin();
    const other = await seedOnboardingPath(companyA.id, {
      departmentId: deptA.id,
      isDefault: true,
    });
    await updateOnboardingPath(path.id, { isDefault: true });
    const otherRefreshed = await prisma.onboardingPath.findUnique({ where: { id: other.id } });
    expect(otherRefreshed!.isDefault).toBe(false);
    await prisma.onboardingPath.delete({ where: { id: other.id } });
  });

  it("should throw 'הטקסט ארוך מדי, מותר עד 5000 תווים' for description > 5000 chars on update", async () => {
    authAdmin();
    await expect(
      updateOnboardingPath(path.id, { description: "א".repeat(5001) }),
    ).rejects.toThrow("הטקסט ארוך מדי, מותר עד 5000 תווים");
  });

  it("should update isActive to false and verify DB state", async () => {
    authAdmin();
    const updated = await updateOnboardingPath(path.id, { isActive: false });
    expect(updated!.isActive).toBe(false);
    const dbPath = await prisma.onboardingPath.findUnique({ where: { id: path.id } });
    expect(dbPath!.isActive).toBe(false);
    await updateOnboardingPath(path.id, { isActive: true });
  });

  it("should update estimatedDays and verify DB state", async () => {
    authAdmin();
    const updated = await updateOnboardingPath(path.id, { estimatedDays: 14 });
    expect(updated!.estimatedDays).toBe(14);
    const dbPath = await prisma.onboardingPath.findUnique({ where: { id: path.id } });
    expect(dbPath!.estimatedDays).toBe(14);
  });

  it("should throw 'הפריט המבוקש לא נמצא' for non-existent path (P2025)", async () => {
    authAdmin();
    await expect(
      updateOnboardingPath(999999, { name: "לא קיים" }),
    ).rejects.toThrow("הפריט המבוקש לא נמצא");
  });

  it("should throw 'הטקסט ארוך מדי, מותר עד 200 תווים' for name > 200 chars on update", async () => {
    authAdmin();
    await expect(
      updateOnboardingPath(path.id, { name: "א".repeat(201) }),
    ).rejects.toThrow("הטקסט ארוך מדי, מותר עד 200 תווים");
  });

  it("should throw 'הערך חייב להיות מספר חיובי' for negative estimatedDays on update", async () => {
    authAdmin();
    await expect(
      updateOnboardingPath(path.id, { estimatedDays: -5 }),
    ).rejects.toThrow("הערך חייב להיות מספר חיובי");
  });

  it("should throw 'Department not found or access denied' for cross-company departmentId on update", async () => {
    authAdmin();
    await expect(
      updateOnboardingPath(path.id, { departmentId: deptB.id }),
    ).rejects.toThrow("Department not found or access denied");
  });
});

describe("deleteOnboardingPath", () => {
  it("should hard-delete path and cascade-delete associated workerOnboarding records", async () => {
    authAdmin();
    const path = await seedOnboardingPath(companyA.id, { name: "למחיקה" });
    const step = await seedOnboardingStep(companyA.id, path.id);
    const worker = await seedWorker(companyA.id, deptA.id);
    const onboarding = await seedWorkerOnboarding(companyA.id, worker.id, path.id);

    const result = await deleteOnboardingPath(path.id);
    expect(result).toEqual({ success: true });

    const dbPath = await prisma.onboardingPath.findUnique({ where: { id: path.id } });
    expect(dbPath).toBeNull();
    const dbOnboarding = await prisma.workerOnboarding.findFirst({ where: { pathId: path.id } });
    expect(dbOnboarding).toBeNull();

    await prisma.worker.delete({ where: { id: worker.id } });
  });

  it("should cascade-delete OnboardingStep records when path is deleted", async () => {
    authAdmin();
    const path = await seedOnboardingPath(companyA.id, { name: "מחיקה מדורגת" });
    const step1 = await seedOnboardingStep(companyA.id, path.id, { title: "שלב 1" });
    const step2 = await seedOnboardingStep(companyA.id, path.id, { title: "שלב 2" });

    await deleteOnboardingPath(path.id);

    // Steps should be cascade-deleted
    const dbStep1 = await prisma.onboardingStep.findUnique({ where: { id: step1.id } });
    const dbStep2 = await prisma.onboardingStep.findUnique({ where: { id: step2.id } });
    expect(dbStep1).toBeNull();
    expect(dbStep2).toBeNull();
  });

  it("should throw 'הפריט המבוקש לא נמצא' for non-existent path (P2025)", async () => {
    authAdmin();
    await expect(deleteOnboardingPath(999999)).rejects.toThrow("הפריט המבוקש לא נמצא");
  });
});

// ══════════════════════════════════════════════════════════════════════
// ONBOARDING STEPS
// ══════════════════════════════════════════════════════════════════════

describe("createOnboardingStep", () => {
  let path: { id: number };
  let pathOther: { id: number };
  const createdIds: number[] = [];

  beforeAll(async () => {
    path = await seedOnboardingPath(companyA.id, { name: "מסלול שלבים" });
    pathOther = await seedOnboardingPath(companyB.id, { name: "מסלול חיצוני" });
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.onboardingStep.deleteMany({ where: { id: { in: createdIds } } });
    }
    await prisma.onboardingPath.deleteMany({
      where: { id: { in: [path.id, pathOther.id] } },
    });
  });

  it("should create step with auto-assigned order when not specified", async () => {
    authAdmin();
    const step = await createOnboardingStep({
      pathId: path.id,
      title: "סדר אוטומטי",
    });
    createdIds.push(step!.id);
    expect(step!.order).toBe(0);

    const step2 = await createOnboardingStep({
      pathId: path.id,
      title: "סדר אוטומטי 2",
    });
    createdIds.push(step2!.id);
    expect(step2!.order).toBe(1);
  });

  it("should create step with explicit order", async () => {
    authAdmin();
    const step = await createOnboardingStep({
      pathId: path.id,
      title: "סדר מפורש",
      order: 5,
    });
    createdIds.push(step!.id);
    expect(step!.order).toBe(5);
  });

  it("should use @default values (type=TASK, isRequired=true) when not specified", async () => {
    authAdmin();
    const step = await createOnboardingStep({
      pathId: path.id,
      title: "ברירות מחדל",
    });
    createdIds.push(step!.id);
    const dbStep = await prisma.onboardingStep.findUnique({ where: { id: step!.id } });
    expect(dbStep!.type).toBe("TASK");
    expect(dbStep!.isRequired).toBe(true);
  });

  it("should create step with type DOCUMENT", async () => {
    authAdmin();
    const step = await createOnboardingStep({
      pathId: path.id,
      title: "מסמך לעיון",
      type: "DOCUMENT",
    });
    createdIds.push(step!.id);
    expect(step!.type).toBe("DOCUMENT");
  });

  it("should create step with type MEETING", async () => {
    authAdmin();
    const step = await createOnboardingStep({
      pathId: path.id,
      title: "פגישת היכרות",
      type: "MEETING",
    });
    createdIds.push(step!.id);
    expect(step!.type).toBe("MEETING");
  });

  it("should create step with type CHECKLIST", async () => {
    authAdmin();
    const step = await createOnboardingStep({
      pathId: path.id,
      title: "רשימת בדיקה",
      type: "CHECKLIST",
    });
    createdIds.push(step!.id);
    expect(step!.type).toBe("CHECKLIST");
  });

  it("should throw 'כתובת ה-URL אינה תקינה' for invalid resourceUrl", async () => {
    authAdmin();
    await expect(
      createOnboardingStep({
        pathId: path.id,
        title: "קישור שגוי",
        resourceUrl: "not-a-valid-url",
      }),
    ).rejects.toThrow("כתובת ה-URL אינה תקינה");
  });

  it("should validate pathId belongs to same company", async () => {
    authAdmin();
    await expect(
      createOnboardingStep({ pathId: pathOther.id, title: "מסלול שגוי" }),
    ).rejects.toThrow("Onboarding path not found or access denied");
  });

  it("should throw for invalid step type enum", async () => {
    authAdmin();
    await expect(
      createOnboardingStep({ pathId: path.id, title: "סוג שגוי", type: "INVALID" }),
    ).rejects.toThrow("Invalid step type");
  });

  it("should throw 'Step title is required' for empty title", async () => {
    authAdmin();
    await expect(
      createOnboardingStep({ pathId: path.id, title: "" }),
    ).rejects.toThrow("Step title is required");
  });

  it("should throw 'הטקסט ארוך מדי, מותר עד 200 תווים' for step title > 200 chars", async () => {
    authAdmin();
    await expect(
      createOnboardingStep({ pathId: path.id, title: "א".repeat(201) }),
    ).rejects.toThrow("הטקסט ארוך מדי, מותר עד 200 תווים");
  });

  it("should throw 'הטקסט ארוך מדי, מותר עד 5000 תווים' for description > 5000 chars", async () => {
    authAdmin();
    await expect(
      createOnboardingStep({ pathId: path.id, title: "בדיקה", description: "א".repeat(5001) }),
    ).rejects.toThrow("הטקסט ארוך מדי, מותר עד 5000 תווים");
  });

  it("should throw 'הערך חייב להיות מספר חיובי' for negative estimatedMinutes on create", async () => {
    authAdmin();
    await expect(
      createOnboardingStep({ pathId: path.id, title: "דקות שליליות", estimatedMinutes: -10 }),
    ).rejects.toThrow("הערך חייב להיות מספר חיובי");
  });

  it("should accept valid resourceUrl and persist to DB on create", async () => {
    authAdmin();
    const step = await createOnboardingStep({
      pathId: path.id,
      title: "שלב עם קישור",
      resourceUrl: "https://example.com/guide",
    });
    createdIds.push(step!.id);
    expect(step!.resourceUrl).toBe("https://example.com/guide");
    const dbStep = await prisma.onboardingStep.findUnique({ where: { id: step!.id } });
    expect(dbStep!.resourceUrl).toBe("https://example.com/guide");
  });

  it("should persist valid estimatedMinutes to DB on create", async () => {
    authAdmin();
    const step = await createOnboardingStep({
      pathId: path.id,
      title: "שלב עם דקות",
      estimatedMinutes: 45,
    });
    createdIds.push(step!.id);
    expect(step!.estimatedMinutes).toBe(45);
    const dbStep = await prisma.onboardingStep.findUnique({ where: { id: step!.id } });
    expect(dbStep!.estimatedMinutes).toBe(45);
  });

  it("should persist valid resourceType to DB on create", async () => {
    authAdmin();
    const step = await createOnboardingStep({
      pathId: path.id,
      title: "שלב עם סוג משאב",
      resourceType: "PDF",
    });
    createdIds.push(step!.id);
    expect(step!.resourceType).toBe("PDF");
    const dbStep = await prisma.onboardingStep.findUnique({ where: { id: step!.id } });
    expect(dbStep!.resourceType).toBe("PDF");
  });

  it("should throw 'הטקסט ארוך מדי, מותר עד 100 תווים' for resourceType > 100 chars on create", async () => {
    authAdmin();
    await expect(
      createOnboardingStep({
        pathId: path.id,
        title: "סוג משאב ארוך",
        resourceType: "א".repeat(101),
      }),
    ).rejects.toThrow("הטקסט ארוך מדי, מותר עד 100 תווים");
  });

  it("should persist isRequired=false to DB when explicitly set on create", async () => {
    authAdmin();
    const step = await createOnboardingStep({
      pathId: path.id,
      title: "שלב לא חובה",
      isRequired: false,
    });
    createdIds.push(step!.id);
    expect(step!.isRequired).toBe(false);
    const dbStep = await prisma.onboardingStep.findUnique({ where: { id: step!.id } });
    expect(dbStep!.isRequired).toBe(false);
  });
});

describe("updateOnboardingStep", () => {
  let path: { id: number };
  let step: { id: number };
  let pathOther: { id: number };
  let stepOther: { id: number };

  beforeAll(async () => {
    path = await seedOnboardingPath(companyA.id);
    step = await seedOnboardingStep(companyA.id, path.id, { title: "שלב מקורי" });
    pathOther = await seedOnboardingPath(companyB.id);
    stepOther = await seedOnboardingStep(companyB.id, pathOther.id);
  });

  afterAll(async () => {
    await prisma.onboardingStep.deleteMany({
      where: { id: { in: [step.id, stepOther.id] } },
    });
    await prisma.onboardingPath.deleteMany({
      where: { id: { in: [path.id, pathOther.id] } },
    });
  });

  it("should update step fields and verify DB state", async () => {
    authAdmin();
    const updated = await updateOnboardingStep(step.id, { title: "שלב מעודכן" });
    expect(updated!.title).toBe("שלב מעודכן");
    const dbStep = await prisma.onboardingStep.findUnique({ where: { id: step.id } });
    expect(dbStep!.title).toBe("שלב מעודכן");
  });

  it("should throw 'Step not found or access denied' for step in different company", async () => {
    authAdmin();
    await expect(
      updateOnboardingStep(stepOther.id, { title: "חברה אחרת" }),
    ).rejects.toThrow("Step not found or access denied");
  });

  it("should throw 'כתובת ה-URL אינה תקינה' for invalid resourceUrl", async () => {
    authAdmin();
    await expect(
      updateOnboardingStep(step.id, { resourceUrl: "not-valid" }),
    ).rejects.toThrow("כתובת ה-URL אינה תקינה");
  });

  it("should accept valid onCompleteActions and persist to DB", async () => {
    authAdmin();
    const updated = await updateOnboardingStep(step.id, {
      onCompleteActions: [{ actionType: "CREATE_TASK", config: {} }],
    });
    expect(updated!.onCompleteActions).toBeDefined();
    const dbStep = await prisma.onboardingStep.findUnique({ where: { id: step.id } });
    expect(Array.isArray(dbStep!.onCompleteActions)).toBe(true);
    expect((dbStep!.onCompleteActions as any[])[0].actionType).toBe("CREATE_TASK");
  });

  it("should throw 'onCompleteActions must be an array' for non-array value", async () => {
    authAdmin();
    await expect(
      updateOnboardingStep(step.id, { onCompleteActions: "bad" as any }),
    ).rejects.toThrow("onCompleteActions must be an array");
  });

  it("should throw error containing 'is invalid' for invalid actionType", async () => {
    authAdmin();
    await expect(
      updateOnboardingStep(step.id, {
        onCompleteActions: [{ actionType: "INVALID" }],
      }),
    ).rejects.toThrow("is invalid");
  });

  it("should throw 'הטקסט ארוך מדי, מותר עד 200 תווים' for title > 200 chars on update", async () => {
    authAdmin();
    await expect(
      updateOnboardingStep(step.id, { title: "א".repeat(201) }),
    ).rejects.toThrow("הטקסט ארוך מדי, מותר עד 200 תווים");
  });

  it("should accept valid resourceUrl and persist to DB", async () => {
    authAdmin();
    const updated = await updateOnboardingStep(step.id, { resourceUrl: "https://example.com" });
    expect(updated!.resourceUrl).toBe("https://example.com");
    const dbStep = await prisma.onboardingStep.findUnique({ where: { id: step.id } });
    expect(dbStep!.resourceUrl).toBe("https://example.com");
  });

  it("should throw 'הטקסט ארוך מדי, מותר עד 5000 תווים' for description > 5000 chars on update", async () => {
    authAdmin();
    await expect(
      updateOnboardingStep(step.id, { description: "א".repeat(5001) }),
    ).rejects.toThrow("הטקסט ארוך מדי, מותר עד 5000 תווים");
  });

  it("should update type field and verify DB state", async () => {
    authAdmin();
    const updated = await updateOnboardingStep(step.id, { type: "MEETING" });
    expect(updated!.type).toBe("MEETING");
    const dbStep = await prisma.onboardingStep.findUnique({ where: { id: step.id } });
    expect(dbStep!.type).toBe("MEETING");
  });

  it("should toggle isRequired to false and verify DB state", async () => {
    authAdmin();
    const updated = await updateOnboardingStep(step.id, { isRequired: false });
    expect(updated!.isRequired).toBe(false);
    const dbStep = await prisma.onboardingStep.findUnique({ where: { id: step.id } });
    expect(dbStep!.isRequired).toBe(false);
  });

  it("should update order field and verify DB state", async () => {
    authAdmin();
    const updated = await updateOnboardingStep(step.id, { order: 7 });
    expect(updated!.order).toBe(7);
    const dbStep = await prisma.onboardingStep.findUnique({ where: { id: step.id } });
    expect(dbStep!.order).toBe(7);
  });

  it("should throw 'הערך חייב להיות מספר חיובי' for negative order on update", async () => {
    authAdmin();
    await expect(
      updateOnboardingStep(step.id, { order: -1 }),
    ).rejects.toThrow("הערך חייב להיות מספר חיובי");
  });

  it("should update estimatedMinutes field and verify DB state", async () => {
    authAdmin();
    const updated = await updateOnboardingStep(step.id, { estimatedMinutes: 30 });
    expect(updated!.estimatedMinutes).toBe(30);
    const dbStep = await prisma.onboardingStep.findUnique({ where: { id: step.id } });
    expect(dbStep!.estimatedMinutes).toBe(30);
  });

  it("should throw 'הערך חייב להיות מספר חיובי' for negative estimatedMinutes on update", async () => {
    authAdmin();
    await expect(
      updateOnboardingStep(step.id, { estimatedMinutes: -5 }),
    ).rejects.toThrow("הערך חייב להיות מספר חיובי");
  });

  it("should update resourceType field and verify DB state", async () => {
    authAdmin();
    const updated = await updateOnboardingStep(step.id, { resourceType: "VIDEO" });
    expect(updated!.resourceType).toBe("VIDEO");
    const dbStep = await prisma.onboardingStep.findUnique({ where: { id: step.id } });
    expect(dbStep!.resourceType).toBe("VIDEO");
  });

  it("should throw 'הטקסט ארוך מדי, מותר עד 100 תווים' for resourceType > 100 chars on update", async () => {
    authAdmin();
    await expect(
      updateOnboardingStep(step.id, { resourceType: "א".repeat(101) }),
    ).rejects.toThrow("הטקסט ארוך מדי, מותר עד 100 תווים");
  });
});

describe("deleteOnboardingStep", () => {
  it("should hard-delete step", async () => {
    authAdmin();
    const path = await seedOnboardingPath(companyA.id);
    const step = await seedOnboardingStep(companyA.id, path.id);
    const result = await deleteOnboardingStep(step.id);
    expect(result).toEqual({ success: true });
    const dbStep = await prisma.onboardingStep.findUnique({ where: { id: step.id } });
    expect(dbStep).toBeNull();
    await prisma.onboardingPath.delete({ where: { id: path.id } });
  });

  it("should throw 'Step not found or access denied' for step in different company", async () => {
    authAdmin();
    const pathB = await seedOnboardingPath(companyB.id);
    const stepB = await seedOnboardingStep(companyB.id, pathB.id);
    await expect(deleteOnboardingStep(stepB.id)).rejects.toThrow(
      "Step not found or access denied",
    );
    await prisma.onboardingStep.delete({ where: { id: stepB.id } });
    await prisma.onboardingPath.delete({ where: { id: pathB.id } });
  });
});

describe("reorderOnboardingSteps", () => {
  let path: { id: number };
  let s1: { id: number };
  let s2: { id: number };
  let s3: { id: number };

  beforeAll(async () => {
    path = await seedOnboardingPath(companyA.id);
    s1 = await seedOnboardingStep(companyA.id, path.id, { order: 0, title: "ר1" });
    s2 = await seedOnboardingStep(companyA.id, path.id, { order: 1, title: "ר2" });
    s3 = await seedOnboardingStep(companyA.id, path.id, { order: 2, title: "ר3" });
  });

  afterAll(async () => {
    await prisma.onboardingStep.deleteMany({ where: { pathId: path.id } });
    await prisma.onboardingPath.delete({ where: { id: path.id } });
  });

  it("should reorder steps using raw SQL CASE statement and verify new order", async () => {
    authAdmin();
    const result = await reorderOnboardingSteps(path.id, [s3.id, s2.id, s1.id]);
    expect(result).toEqual({ success: true });

    const steps = await prisma.onboardingStep.findMany({
      where: { pathId: path.id },
      orderBy: { order: "asc" },
    });
    expect(steps[0].id).toBe(s3.id);
    expect(steps[0].order).toBe(0);
    expect(steps[1].id).toBe(s2.id);
    expect(steps[1].order).toBe(1);
    expect(steps[2].id).toBe(s1.id);
    expect(steps[2].order).toBe(2);
  });

  it("should validate pathId belongs to same company", async () => {
    authAdmin();
    const pathB = await seedOnboardingPath(companyB.id);
    await expect(reorderOnboardingSteps(pathB.id, [1, 2])).rejects.toThrow(
      "Path not found or access denied",
    );
    await prisma.onboardingPath.delete({ where: { id: pathB.id } });
  });

  it("should throw for more than 200 step IDs", async () => {
    authAdmin();
    const ids = Array.from({ length: 201 }, (_, i) => i);
    await expect(reorderOnboardingSteps(path.id, ids)).rejects.toThrow(
      "Too many steps to reorder",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════
// WORKER ONBOARDING PROGRESS
// ══════════════════════════════════════════════════════════════════════

describe("assignOnboardingPath", () => {
  let path: { id: number };
  let worker: { id: number };

  beforeAll(async () => {
    path = await seedOnboardingPath(companyA.id, { name: "מסלול הקצאה" });
    await seedOnboardingStep(companyA.id, path.id, { title: "שלב הקצאה 1" });
    worker = await seedWorker(companyA.id, deptA.id);
  });

  afterAll(async () => {
    await prisma.workerOnboardingStep.deleteMany({
      where: { onboarding: { workerId: worker.id } },
    });
    await prisma.workerOnboarding.deleteMany({ where: { workerId: worker.id } });
    await prisma.worker.delete({ where: { id: worker.id } });
    await prisma.onboardingStep.deleteMany({ where: { pathId: path.id } });
    await prisma.onboardingPath.delete({ where: { id: path.id } });
  });

  it("should create WorkerOnboarding + WorkerOnboardingStep records", async () => {
    authAdmin();
    const onboarding = await assignOnboardingPath(worker.id, path.id);
    expect(onboarding).toHaveProperty("id");
    expect(onboarding!.status).toBe("IN_PROGRESS");

    const stepProgress = await prisma.workerOnboardingStep.findMany({
      where: { onboardingId: onboarding!.id },
    });
    expect(stepProgress.length).toBeGreaterThanOrEqual(1);
    expect(stepProgress[0].status).toBe("PENDING");
  });

  it("should throw 'Worker not found or access denied' for invalid workerId", async () => {
    authAdmin();
    await expect(assignOnboardingPath(999999, path.id)).rejects.toThrow(
      "Worker not found or access denied",
    );
  });

  it("should throw 'Onboarding path not found' for invalid pathId", async () => {
    authAdmin();
    await expect(assignOnboardingPath(worker.id, 999999)).rejects.toThrow(
      "Onboarding path not found",
    );
  });

  it("should throw 'פריט עם פרטים אלו כבר קיים במערכת' when assigning same path twice (P2002)", async () => {
    authAdmin();
    // Path was already assigned in first test — set up own state
    const w2 = await seedWorker(companyA.id, deptA.id);
    await assignOnboardingPath(w2.id, path.id);
    await expect(assignOnboardingPath(w2.id, path.id)).rejects.toThrow(
      "פריט עם פרטים אלו כבר קיים במערכת",
    );
    // cleanup
    await prisma.workerOnboardingStep.deleteMany({
      where: { onboarding: { workerId: w2.id } },
    });
    await prisma.workerOnboarding.deleteMany({ where: { workerId: w2.id } });
    await prisma.worker.delete({ where: { id: w2.id } });
  });
});

describe("updateStepProgress", () => {
  // Each test that depends on state sets up its own
  let path: { id: number };
  let step1: { id: number };
  let step2: { id: number };
  let worker: { id: number };
  let onboarding: { id: number };

  beforeAll(async () => {
    path = await seedOnboardingPath(companyA.id, { name: "מסלול התקדמות" });
    step1 = await seedOnboardingStep(companyA.id, path.id, {
      title: "שלב התקדמות 1",
      order: 0,
      isRequired: true,
    });
    step2 = await seedOnboardingStep(companyA.id, path.id, {
      title: "שלב התקדמות 2",
      order: 1,
      isRequired: true,
    });
    worker = await seedWorker(companyA.id, deptA.id, { status: "ONBOARDING" });
    onboarding = await seedWorkerOnboarding(companyA.id, worker.id, path.id);
    await prisma.workerOnboardingStep.createMany({
      data: [
        { companyId: companyA.id, onboardingId: onboarding.id, stepId: step1.id, status: "PENDING" },
        { companyId: companyA.id, onboardingId: onboarding.id, stepId: step2.id, status: "PENDING" },
      ],
    });
  });

  afterAll(async () => {
    await prisma.workerOnboardingStep.deleteMany({ where: { onboardingId: onboarding.id } });
    await prisma.workerOnboarding.delete({ where: { id: onboarding.id } });
    await prisma.worker.delete({ where: { id: worker.id } });
    await prisma.onboardingStep.deleteMany({ where: { pathId: path.id } });
    await prisma.onboardingPath.delete({ where: { id: path.id } });
  });

  it("should upsert step progress with status, notes, score, feedback", async () => {
    authAdmin();
    const result = await updateStepProgress(onboarding.id, step1.id, {
      status: "IN_PROGRESS",
      notes: "בעבודה",
      score: 50,
      feedback: "התחלה טובה",
    });
    expect(result!.status).toBe("IN_PROGRESS");
    expect(result!.notes).toBe("בעבודה");
    expect(result!.score).toBe(50);
    expect(result!.feedback).toBe("התחלה טובה");
  });

  it("should set completedAt when status=COMPLETED", async () => {
    authAdmin();
    const result = await updateStepProgress(onboarding.id, step1.id, {
      status: "COMPLETED",
    });
    expect(result!.completedAt).not.toBeNull();
  });

  it("should clear completedAt when status changes away from COMPLETED", async () => {
    authAdmin();
    // First complete the step
    await updateStepProgress(onboarding.id, step1.id, { status: "COMPLETED" });
    // Then revert
    const result = await updateStepProgress(onboarding.id, step1.id, {
      status: "IN_PROGRESS",
    });
    expect(result!.completedAt).toBeNull();
  });

  it("should auto-complete onboarding when all required steps are COMPLETED", async () => {
    authAdmin();
    await updateStepProgress(onboarding.id, step1.id, { status: "COMPLETED" });
    await updateStepProgress(onboarding.id, step2.id, { status: "COMPLETED" });

    const dbOnboarding = await prisma.workerOnboarding.findUnique({
      where: { id: onboarding.id },
    });
    expect(dbOnboarding!.status).toBe("COMPLETED");
    expect(dbOnboarding!.completedAt).not.toBeNull();
  });

  it("should transition worker status ONBOARDING → ACTIVE on onboarding completion", async () => {
    authAdmin();
    // Ensure both steps are completed (own setup)
    await updateStepProgress(onboarding.id, step1.id, { status: "COMPLETED" });
    await updateStepProgress(onboarding.id, step2.id, { status: "COMPLETED" });
    const dbWorker = await prisma.worker.findUnique({ where: { id: worker.id } });
    expect(dbWorker!.status).toBe("ACTIVE");
  });

  it("should revert onboarding to IN_PROGRESS if a completed step is uncompleted", async () => {
    authAdmin();
    // Complete both first
    await updateStepProgress(onboarding.id, step1.id, { status: "COMPLETED" });
    await updateStepProgress(onboarding.id, step2.id, { status: "COMPLETED" });
    // Then uncomplete one
    await updateStepProgress(onboarding.id, step1.id, { status: "IN_PROGRESS" });

    const dbOnboarding = await prisma.workerOnboarding.findUnique({
      where: { id: onboarding.id },
    });
    expect(dbOnboarding!.status).toBe("IN_PROGRESS");
    expect(dbOnboarding!.completedAt).toBeNull();
  });

  it("should revert worker status to ONBOARDING when onboarding reverted", async () => {
    authAdmin();
    // Complete both then uncomplete
    await updateStepProgress(onboarding.id, step1.id, { status: "COMPLETED" });
    await updateStepProgress(onboarding.id, step2.id, { status: "COMPLETED" });
    await updateStepProgress(onboarding.id, step1.id, { status: "IN_PROGRESS" });

    const dbWorker = await prisma.worker.findUnique({ where: { id: worker.id } });
    expect(dbWorker!.status).toBe("ONBOARDING");
  });

  it("should not block completion when non-required steps are incomplete", async () => {
    authAdmin();
    // Create a path with required + non-required steps
    const testPath = await seedOnboardingPath(companyA.id, { name: "מסלול לא חובה" });
    const reqStep = await seedOnboardingStep(companyA.id, testPath.id, {
      title: "חובה", order: 0, isRequired: true,
    });
    const optStep = await seedOnboardingStep(companyA.id, testPath.id, {
      title: "רשות", order: 1, isRequired: false,
    });
    const testWorker = await seedWorker(companyA.id, deptA.id, { status: "ONBOARDING" });
    const testOnboarding = await seedWorkerOnboarding(companyA.id, testWorker.id, testPath.id);
    await prisma.workerOnboardingStep.createMany({
      data: [
        { companyId: companyA.id, onboardingId: testOnboarding.id, stepId: reqStep.id, status: "PENDING" },
        { companyId: companyA.id, onboardingId: testOnboarding.id, stepId: optStep.id, status: "PENDING" },
      ],
    });

    // Complete only the required step
    await updateStepProgress(testOnboarding.id, reqStep.id, { status: "COMPLETED" });

    const dbOnboarding = await prisma.workerOnboarding.findUnique({
      where: { id: testOnboarding.id },
    });
    expect(dbOnboarding!.status).toBe("COMPLETED");

    // cleanup
    await prisma.workerOnboardingStep.deleteMany({ where: { onboardingId: testOnboarding.id } });
    await prisma.workerOnboarding.delete({ where: { id: testOnboarding.id } });
    await prisma.worker.delete({ where: { id: testWorker.id } });
    await prisma.onboardingStep.deleteMany({ where: { pathId: testPath.id } });
    await prisma.onboardingPath.delete({ where: { id: testPath.id } });
  });

  it("should NOT complete onboarding when required step has SKIPPED status", async () => {
    authAdmin();
    const testPath = await seedOnboardingPath(companyA.id, { name: "מסלול דילוג" });
    const reqStep1 = await seedOnboardingStep(companyA.id, testPath.id, {
      title: "חובה 1", order: 0, isRequired: true,
    });
    const reqStep2 = await seedOnboardingStep(companyA.id, testPath.id, {
      title: "חובה 2", order: 1, isRequired: true,
    });
    const testWorker = await seedWorker(companyA.id, deptA.id, { status: "ONBOARDING" });
    const testOnboarding = await seedWorkerOnboarding(companyA.id, testWorker.id, testPath.id);
    await prisma.workerOnboardingStep.createMany({
      data: [
        { companyId: companyA.id, onboardingId: testOnboarding.id, stepId: reqStep1.id, status: "PENDING" },
        { companyId: companyA.id, onboardingId: testOnboarding.id, stepId: reqStep2.id, status: "PENDING" },
      ],
    });

    // Complete one, SKIP the other
    await updateStepProgress(testOnboarding.id, reqStep1.id, { status: "COMPLETED" });
    await updateStepProgress(testOnboarding.id, reqStep2.id, { status: "SKIPPED" });

    const dbOnboarding = await prisma.workerOnboarding.findUnique({
      where: { id: testOnboarding.id },
    });
    // SKIPPED ≠ COMPLETED, so onboarding should remain IN_PROGRESS
    expect(dbOnboarding!.status).toBe("IN_PROGRESS");

    // cleanup
    await prisma.workerOnboardingStep.deleteMany({ where: { onboardingId: testOnboarding.id } });
    await prisma.workerOnboarding.delete({ where: { id: testOnboarding.id } });
    await prisma.worker.delete({ where: { id: testWorker.id } });
    await prisma.onboardingStep.deleteMany({ where: { pathId: testPath.id } });
    await prisma.onboardingPath.delete({ where: { id: testPath.id } });
  });

  it("should throw for invalid step status enum", async () => {
    authAdmin();
    await expect(
      updateStepProgress(onboarding.id, step1.id, { status: "INVALID" }),
    ).rejects.toThrow("Invalid step status");
  });

  it("should throw 'Score must be between 0 and 100' for score > 100", async () => {
    authAdmin();
    await expect(
      updateStepProgress(onboarding.id, step1.id, { status: "IN_PROGRESS", score: 101 }),
    ).rejects.toThrow("Score must be between 0 and 100");
  });

  it("should throw 'Score must be between 0 and 100' for score < 0", async () => {
    authAdmin();
    await expect(
      updateStepProgress(onboarding.id, step1.id, { status: "IN_PROGRESS", score: -1 }),
    ).rejects.toThrow("Score must be between 0 and 100");
  });

  it("should throw 'Onboarding not found or access denied' for non-existent onboarding", async () => {
    authAdmin();
    await expect(
      updateStepProgress(999999, step1.id, { status: "IN_PROGRESS" }),
    ).rejects.toThrow("Onboarding not found or access denied");
  });

  it("should throw 'Step not found or access denied' for non-existent step", async () => {
    authAdmin();
    await expect(
      updateStepProgress(onboarding.id, 999999, { status: "IN_PROGRESS" }),
    ).rejects.toThrow("Step not found or access denied");
  });
});

describe("getWorkersByOnboardingPath", () => {
  let path: { id: number };
  let worker: { id: number };
  let deletedWorker: { id: number };

  beforeAll(async () => {
    path = await seedOnboardingPath(companyA.id, { name: "עובדים לפי מסלול" });
    const step = await seedOnboardingStep(companyA.id, path.id);
    worker = await seedWorker(companyA.id, deptA.id);
    deletedWorker = await seedWorker(companyA.id, deptA.id, { deletedAt: new Date() });
    await seedWorkerOnboarding(companyA.id, worker.id, path.id);
    await seedWorkerOnboarding(companyA.id, deletedWorker.id, path.id);
  });

  afterAll(async () => {
    await prisma.workerOnboarding.deleteMany({ where: { pathId: path.id } });
    await prisma.worker.deleteMany({ where: { id: { in: [worker.id, deletedWorker.id] } } });
    await prisma.onboardingStep.deleteMany({ where: { pathId: path.id } });
    await prisma.onboardingPath.delete({ where: { id: path.id } });
  });

  it("should calculate progress percentage: 0% when no steps completed", async () => {
    authAdmin();
    const result = await getWorkersByOnboardingPath(path.id);
    const entry = result.find((r: any) => r.workerId === worker.id);
    expect(entry).toBeDefined();
    expect(entry!.progress).toBe(0);
    expect(entry!.completedSteps).toBe(0);
    expect(entry!.totalSteps).toBeGreaterThanOrEqual(1);
    expect(entry).toHaveProperty("worker");
  });

  it("should calculate progress percentage: 50% with 1 of 2 steps completed", async () => {
    authAdmin();
    // Create a dedicated path with 2 steps for exact calculation test
    const calcPath = await seedOnboardingPath(companyA.id, { name: "מסלול חישוב" });
    const calcStep1 = await seedOnboardingStep(companyA.id, calcPath.id, { title: "חישוב 1", order: 0 });
    const calcStep2 = await seedOnboardingStep(companyA.id, calcPath.id, { title: "חישוב 2", order: 1 });
    const calcWorker = await seedWorker(companyA.id, deptA.id);
    const calcOnboarding = await seedWorkerOnboarding(companyA.id, calcWorker.id, calcPath.id);
    // Create step progress: one COMPLETED, one PENDING
    await prisma.workerOnboardingStep.createMany({
      data: [
        { companyId: companyA.id, onboardingId: calcOnboarding.id, stepId: calcStep1.id, status: "COMPLETED" },
        { companyId: companyA.id, onboardingId: calcOnboarding.id, stepId: calcStep2.id, status: "PENDING" },
      ],
    });

    const result = await getWorkersByOnboardingPath(calcPath.id);
    const entry = result.find((r: any) => r.workerId === calcWorker.id);
    expect(entry).toBeDefined();
    expect(entry!.progress).toBe(50);
    expect(entry!.completedSteps).toBe(1);
    expect(entry!.totalSteps).toBe(2);

    // cleanup
    await prisma.workerOnboardingStep.deleteMany({ where: { onboardingId: calcOnboarding.id } });
    await prisma.workerOnboarding.delete({ where: { id: calcOnboarding.id } });
    await prisma.worker.delete({ where: { id: calcWorker.id } });
    await prisma.onboardingStep.deleteMany({ where: { pathId: calcPath.id } });
    await prisma.onboardingPath.delete({ where: { id: calcPath.id } });
  });

  it("should calculate progress percentage: 100% with all steps completed", async () => {
    authAdmin();
    const calcPath = await seedOnboardingPath(companyA.id, { name: "מסלול 100%" });
    const calcStep1 = await seedOnboardingStep(companyA.id, calcPath.id, { title: "מלא 1", order: 0 });
    const calcStep2 = await seedOnboardingStep(companyA.id, calcPath.id, { title: "מלא 2", order: 1 });
    const calcWorker = await seedWorker(companyA.id, deptA.id);
    const calcOnboarding = await seedWorkerOnboarding(companyA.id, calcWorker.id, calcPath.id);
    await prisma.workerOnboardingStep.createMany({
      data: [
        { companyId: companyA.id, onboardingId: calcOnboarding.id, stepId: calcStep1.id, status: "COMPLETED" },
        { companyId: companyA.id, onboardingId: calcOnboarding.id, stepId: calcStep2.id, status: "COMPLETED" },
      ],
    });

    const result = await getWorkersByOnboardingPath(calcPath.id);
    const entry = result.find((r: any) => r.workerId === calcWorker.id);
    expect(entry).toBeDefined();
    expect(entry!.progress).toBe(100);
    expect(entry!.completedSteps).toBe(2);
    expect(entry!.totalSteps).toBe(2);

    // cleanup
    await prisma.workerOnboardingStep.deleteMany({ where: { onboardingId: calcOnboarding.id } });
    await prisma.workerOnboarding.delete({ where: { id: calcOnboarding.id } });
    await prisma.worker.delete({ where: { id: calcWorker.id } });
    await prisma.onboardingStep.deleteMany({ where: { pathId: calcPath.id } });
    await prisma.onboardingPath.delete({ where: { id: calcPath.id } });
  });

  it("should exclude soft-deleted workers", async () => {
    authAdmin();
    const result = await getWorkersByOnboardingPath(path.id);
    const workerIds = result.map((r: any) => r.workerId);
    expect(workerIds).toContain(worker.id);
    expect(workerIds).not.toContain(deletedWorker.id);
  });

  it("should throw 'Path not found or access denied' for invalid pathId", async () => {
    authAdmin();
    await expect(getWorkersByOnboardingPath(999999)).rejects.toThrow(
      "Path not found or access denied",
    );
  });
});

describe("getWorkerStepProgress", () => {
  let path: { id: number };
  let step: { id: number };
  let worker: { id: number };
  let onboarding: { id: number };

  beforeAll(async () => {
    path = await seedOnboardingPath(companyA.id);
    step = await seedOnboardingStep(companyA.id, path.id);
    worker = await seedWorker(companyA.id, deptA.id);
    onboarding = await seedWorkerOnboarding(companyA.id, worker.id, path.id);
    await prisma.workerOnboardingStep.create({
      data: {
        companyId: companyA.id,
        onboardingId: onboarding.id,
        stepId: step.id,
        status: "COMPLETED",
      },
    });
  });

  afterAll(async () => {
    await prisma.workerOnboardingStep.deleteMany({ where: { onboardingId: onboarding.id } });
    await prisma.workerOnboarding.delete({ where: { id: onboarding.id } });
    await prisma.worker.delete({ where: { id: worker.id } });
    await prisma.onboardingStep.deleteMany({ where: { pathId: path.id } });
    await prisma.onboardingPath.delete({ where: { id: path.id } });
  });

  it("should return step progress for an onboarding", async () => {
    authAdmin();
    const result = await getWorkerStepProgress(onboarding.id);
    expect(result.length).toBe(1);
    expect(result[0].stepId).toBe(step.id);
    expect(result[0].status).toBe("COMPLETED");
  });

  it("should only return progress for workers in authenticated user's company", async () => {
    const pathB = await seedOnboardingPath(companyB.id);
    const stepB = await seedOnboardingStep(companyB.id, pathB.id);
    const workerB = await seedWorker(companyB.id, deptB.id);
    const onboardingB = await seedWorkerOnboarding(companyB.id, workerB.id, pathB.id);
    await prisma.workerOnboardingStep.create({
      data: {
        companyId: companyB.id,
        onboardingId: onboardingB.id,
        stepId: stepB.id,
        status: "PENDING",
      },
    });

    authAdmin(); // companyA admin
    const result = await getWorkerStepProgress(onboardingB.id);
    expect(result.length).toBe(0);

    await prisma.workerOnboardingStep.deleteMany({ where: { onboardingId: onboardingB.id } });
    await prisma.workerOnboarding.delete({ where: { id: onboardingB.id } });
    await prisma.worker.delete({ where: { id: workerB.id } });
    await prisma.onboardingStep.delete({ where: { id: stepB.id } });
    await prisma.onboardingPath.delete({ where: { id: pathB.id } });
  });
});
