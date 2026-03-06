import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";

// ── MOCK (infrastructure only — keep everything else real) ──────────────
vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkActionRateLimit: vi.fn().mockResolvedValue(false),
  RATE_LIMITS: {
    workflowRead: { prefix: "wf-read", max: 60, windowSeconds: 60 },
    workflowMutation: { prefix: "wf-mut", max: 30, windowSeconds: 60 },
  },
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/notifications-internal", () => ({
  createNotificationForCompany: vi.fn().mockResolvedValue({ success: true }),
}));

// ── REAL: prisma, validation, helpers, company-validation, db-retry, audit ─
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { checkActionRateLimit } from "@/lib/rate-limit";
import { inngest } from "@/lib/inngest/client";
import { revalidatePath } from "next/cache";
import { createNotificationForCompany } from "@/lib/notifications-internal";
import type { User } from "@/lib/permissions";

// ── Server actions under test ──────────────────────────────────────────
import {
  getWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  createStage,
  updateStage,
  deleteStage,
  reorderStages,
  getWorkflowStagesDetails,
  updateWorkflowInstance,
  deleteWorkflowInstance,
} from "@/app/actions/workflows";
import {
  getWorkflowInstances,
  createWorkflowInstance,
  updateWorkflowInstanceStage,
  resetWorkflowInstance,
} from "@/app/actions/workflow-instances";
import { sanitizeError } from "@/lib/workflows/helpers";

// ── Helpers ────────────────────────────────────────────────────────────

function mockUser(user: User | null) {
  vi.mocked(getCurrentUser).mockResolvedValue(user);
}

/** Retry-poll helper for fire-and-forget operations (e.g. audit log). */
async function waitFor(
  fn: () => Promise<boolean>,
  { timeout = 2000, interval = 100 } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error("waitFor timed out");
}

const SLUG_A = `test-wf-a-${Date.now()}`;
const SLUG_B = `test-wf-b-${Date.now()}`;

// ── Test state ─────────────────────────────────────────────────────────

let companyA: { id: number };
let companyB: { id: number };
let adminA: User;
let workflowUserA: User;
let noPermsUserA: User;
let adminB: User;
let assigneeA: User;

// ── Setup / Teardown ───────────────────────────────────────────────────

describe("Workflows Integration", () => {
  beforeAll(async () => {
    // Create companies
    companyA = await prisma.company.create({ data: { name: "Acme Legal Services", slug: SLUG_A } });
    companyB = await prisma.company.create({ data: { name: "Globex Consulting", slug: SLUG_B } });

    // Create users
    const dbAdminA = await prisma.user.create({
      data: {
        companyId: companyA.id,
        name: "Sarah Cohen",
        email: `wf-admin-a-${Date.now()}@test.com`,
        passwordHash: "hashed",
        role: "admin",
        permissions: {},
      },
    });
    adminA = {
      id: dbAdminA.id,
      companyId: companyA.id,
      name: "Sarah Cohen",
      email: dbAdminA.email,
      role: "admin",
      allowedWriteTableIds: [],
      permissions: {},
    };

    const dbWorkflowUserA = await prisma.user.create({
      data: {
        companyId: companyA.id,
        name: "David Levi",
        email: `wf-user-a-${Date.now()}@test.com`,
        passwordHash: "hashed",
        role: "basic",
        permissions: { canViewWorkflows: true },
      },
    });
    workflowUserA = {
      id: dbWorkflowUserA.id,
      companyId: companyA.id,
      name: "David Levi",
      email: dbWorkflowUserA.email,
      role: "basic",
      allowedWriteTableIds: [],
      permissions: { canViewWorkflows: true },
    };

    const dbNoPermsUserA = await prisma.user.create({
      data: {
        companyId: companyA.id,
        name: "Noa Kaplan",
        email: `wf-noperms-a-${Date.now()}@test.com`,
        passwordHash: "hashed",
        role: "basic",
        permissions: {},
      },
    });
    noPermsUserA = {
      id: dbNoPermsUserA.id,
      companyId: companyA.id,
      name: "Noa Kaplan",
      email: dbNoPermsUserA.email,
      role: "basic",
      allowedWriteTableIds: [],
      permissions: {},
    };

    const dbAdminB = await prisma.user.create({
      data: {
        companyId: companyB.id,
        name: "Eli Rosen",
        email: `wf-admin-b-${Date.now()}@test.com`,
        passwordHash: "hashed",
        role: "admin",
        permissions: {},
      },
    });
    adminB = {
      id: dbAdminB.id,
      companyId: companyB.id,
      name: "Eli Rosen",
      email: dbAdminB.email,
      role: "admin",
      allowedWriteTableIds: [],
      permissions: {},
    };

    const dbAssigneeA = await prisma.user.create({
      data: {
        companyId: companyA.id,
        name: "Maya Stern",
        email: `wf-assignee-a-${Date.now()}@test.com`,
        passwordHash: "hashed",
        role: "basic",
        permissions: { canViewWorkflows: true },
      },
    });
    assigneeA = {
      id: dbAssigneeA.id,
      companyId: companyA.id,
      name: "Maya Stern",
      email: dbAssigneeA.email,
      role: "basic",
      allowedWriteTableIds: [],
      permissions: { canViewWorkflows: true },
    };
  });

  afterEach(async () => {
    // Delete in FK-safe order scoped to test companies
    const companyIds = [companyA.id, companyB.id];
    await prisma.workflowInstance.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.workflowStage.deleteMany({ where: { workflow: { companyId: { in: companyIds } } } });
    await prisma.workflow.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.auditLog.deleteMany({ where: { companyId: { in: companyIds } } });

    vi.clearAllMocks();
    // Re-default mocks
    vi.mocked(checkActionRateLimit).mockResolvedValue(false);
    vi.mocked(inngest.send).mockResolvedValue(undefined as any);
    vi.mocked(createNotificationForCompany).mockResolvedValue({ success: true } as any);
  });

  afterAll(async () => {
    const companyIds = [companyA.id, companyB.id];
    await prisma.workflowInstance.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.workflowStage.deleteMany({ where: { workflow: { companyId: { in: companyIds } } } });
    await prisma.workflow.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.auditLog.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.$disconnect();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 1. Auth & Authorization
  // ═══════════════════════════════════════════════════════════════════════

  describe("Auth & Authorization", () => {
    it("throws Unauthorized when getCurrentUser returns null", async () => {
      mockUser(null);
      await expect(getWorkflows()).rejects.toThrow("Unauthorized");
      await expect(createWorkflow({ name: "Client Onboarding" })).rejects.toThrow("Unauthorized");
      await expect(getWorkflowInstances()).rejects.toThrow("Unauthorized");
    });

    it("throws Forbidden for user without canViewWorkflows", async () => {
      mockUser(noPermsUserA);
      await expect(getWorkflows()).rejects.toThrow("Forbidden");
      await expect(createWorkflow({ name: "Client Onboarding" })).rejects.toThrow("Forbidden");
    });

    it("throws Rate limit exceeded when rate-limited on read", async () => {
      vi.mocked(checkActionRateLimit).mockResolvedValue(true);
      mockUser(adminA);
      await expect(getWorkflows()).rejects.toThrow("Rate limit exceeded");
    });

    it("throws Rate limit exceeded when rate-limited on mutation", async () => {
      vi.mocked(checkActionRateLimit).mockResolvedValue(true);
      mockUser(adminA);
      await expect(createWorkflow({ name: "Client Onboarding" })).rejects.toThrow("Rate limit exceeded");
    });

    it("admin user succeeds (implicit canViewWorkflows)", async () => {
      mockUser(adminA);
      const result = await getWorkflows();
      expect(Array.isArray(result)).toBe(true);
    });

    it("basic user with canViewWorkflows succeeds", async () => {
      mockUser(workflowUserA);
      const result = await getWorkflows();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 2. Workflow CRUD
  // ═══════════════════════════════════════════════════════════════════════

  describe("Workflow CRUD", () => {
    // ── getWorkflows ─────────────────────────────────────────────────

    describe("getWorkflows", () => {
      it("returns workflows for user's company ordered by createdAt desc", async () => {
        mockUser(adminA);
        const w1 = await createWorkflow({ name: "Client Onboarding" });
        mockUser(adminA);
        const w2 = await createWorkflow({ name: "Due Diligence Review" });

        mockUser(adminA);
        const list = await getWorkflows();
        expect(list.length).toBe(2);
        expect(list[0].name).toBe("Due Diligence Review");
        expect(list[1].name).toBe("Client Onboarding");
      });

      it("includes nested stages ordered by order asc", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Employee Onboarding" });

        mockUser(adminA);
        await createStage(wf!.id, { name: "Background Check" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "IT Setup" });

        mockUser(adminA);
        const list = await getWorkflows();
        const found = list.find((w: any) => w.id === wf!.id);
        expect(found!.stages).toHaveLength(2);
        expect(found!.stages[0].order).toBeLessThan(found!.stages[1].order);
      });

      it("response contract: stages omit details field", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Contract Approval" });
        mockUser(adminA);
        await createStage(wf!.id, {
          name: "Legal Review",
          details: { systemActions: [{ type: "notification" }] },
        });

        mockUser(adminA);
        const list = await getWorkflows();
        const found = list.find((w: any) => w.id === wf!.id);
        expect(found!.stages).toHaveLength(1);
        // `details` must NOT be present in nested stages (lazy-loaded separately)
        expect("details" in found!.stages[0]).toBe(false);
        // Expected fields must be present
        expect(found!.stages[0]).toHaveProperty("id");
        expect(found!.stages[0]).toHaveProperty("name");
        expect(found!.stages[0]).toHaveProperty("order");
        expect(found!.stages[0]).toHaveProperty("workflowId");
        expect(found!.stages[0]).toHaveProperty("color");
        expect(found!.stages[0]).toHaveProperty("icon");
        expect(found!.stages[0]).toHaveProperty("createdAt");
        expect(found!.stages[0]).toHaveProperty("updatedAt");
        expect(found!.stages[0]).toHaveProperty("description");
        // Verify exact shape: 9 keys (id, workflowId, name, description, color, icon, order, createdAt, updatedAt)
        expect(Object.keys(found!.stages[0])).toHaveLength(9);
      });

      it("returns empty array when no workflows", async () => {
        mockUser(adminA);
        const list = await getWorkflows();
        expect(list).toEqual([]);
      });

      it("does not return other company's workflows (multi-tenancy)", async () => {
        mockUser(adminB);
        await createWorkflow({ name: "Globex Hiring Pipeline" });

        mockUser(adminA);
        const list = await getWorkflows();
        expect(list.every((w: any) => w.name !== "Globex Hiring Pipeline")).toBe(true);
      });

      it("cursor pagination works", async () => {
        mockUser(adminA);
        const w1 = await createWorkflow({ name: "Vendor Assessment" });
        mockUser(adminA);
        const w2 = await createWorkflow({ name: "Risk Evaluation" });

        mockUser(adminA);
        const page2 = await getWorkflows(w2!.id);
        expect(page2.length).toBe(1);
        expect(page2[0].id).toBe(w1!.id);
      });
    });

    // ── createWorkflow ───────────────────────────────────────────────

    describe("createWorkflow", () => {
      it("creates with defaults (color: blue, icon: GitBranch)", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Client Intake" });
        expect(wf).toBeDefined();
        expect(wf!.name).toBe("Client Intake");

        // Verify in DB
        const db = await prisma.workflow.findUnique({ where: { id: wf!.id } });
        expect(db!.color).toBe("blue");
        expect(db!.icon).toBe("GitBranch");
      });

      it("creates with all fields", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({
          name: "Insurance Claim Processing",
          description: "End-to-end claim review and approval workflow",
          color: "red",
          icon: "Zap",
        });
        expect(wf!.name).toBe("Insurance Claim Processing");
        expect(wf!.description).toBe("End-to-end claim review and approval workflow");
        expect(wf!.color).toBe("red");
        expect(wf!.icon).toBe("Zap");

        const db = await prisma.workflow.findUnique({ where: { id: wf!.id } });
        expect(db!.color).toBe("red");
        expect(db!.icon).toBe("Zap");
        expect(db!.description).toBe("End-to-end claim review and approval workflow");
      });

      it("validates name required", async () => {
        mockUser(adminA);
        await expect(createWorkflow({ name: "" })).rejects.toThrow();
      });

      it("validates name max 200 chars", async () => {
        mockUser(adminA);
        await expect(createWorkflow({ name: "x".repeat(201) })).rejects.toThrow();
      });

      it("throws when 100 workflows reached (resource cap)", async () => {
        await prisma.workflow.createMany({
          data: Array.from({ length: 100 }, (_, i) => ({
            companyId: companyA.id,
            name: `Workflow Template ${i + 1}`,
          })),
        });

        mockUser(adminA);
        await expect(createWorkflow({ name: "Overflow Workflow" })).rejects.toThrow(
          "Maximum of 100 workflows reached",
        );
      });

      it("verifies DB state with prisma.workflow.findUnique", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({
          name: "Document Review Pipeline",
          description: "Review and approve legal documents",
        });
        const db = await prisma.workflow.findUnique({ where: { id: wf!.id } });
        expect(db).not.toBeNull();
        expect(db!.name).toBe("Document Review Pipeline");
        expect(db!.description).toBe("Review and approve legal documents");
        expect(db!.companyId).toBe(companyA.id);
      });

      it("calls revalidatePath after creation", async () => {
        mockUser(adminA);
        await createWorkflow({ name: "Cache Test Workflow" });
        expect(revalidatePath).toHaveBeenCalledWith("/workflows");
      });
    });

    // ── updateWorkflow ───────────────────────────────────────────────

    describe("updateWorkflow", () => {
      it("updates name, description, color, icon", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Original Process" });

        mockUser(adminA);
        const updated = await updateWorkflow(wf!.id, {
          name: "Revised Client Process",
          description: "Updated workflow for Q2",
          color: "green",
          icon: "Star",
        });
        expect(updated!.name).toBe("Revised Client Process");
        expect(updated!.description).toBe("Updated workflow for Q2");
        expect(updated!.color).toBe("green");
        expect(updated!.icon).toBe("Star");

        const db = await prisma.workflow.findUnique({ where: { id: wf!.id } });
        expect(db!.name).toBe("Revised Client Process");
        expect(db!.description).toBe("Updated workflow for Q2");
        expect(db!.color).toBe("green");
        expect(db!.icon).toBe("Star");
      });

      it("verifies DB state independently after update", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Before Update" });

        mockUser(adminA);
        await updateWorkflow(wf!.id, { name: "After Update", description: "verified" });

        const db = await prisma.workflow.findUnique({ where: { id: wf!.id } });
        expect(db!.name).toBe("After Update");
        expect(db!.description).toBe("verified");
      });

      it("@updatedAt changes after update", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Timestamp Test" });
        const before = await prisma.workflow.findUnique({ where: { id: wf!.id } });

        // Small delay to ensure timestamp difference
        await new Promise((r) => setTimeout(r, 50));

        mockUser(adminA);
        await updateWorkflow(wf!.id, { name: "Timestamp Updated" });
        const after = await prisma.workflow.findUnique({ where: { id: wf!.id } });

        expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
      });

      it("throws on non-integer id", async () => {
        mockUser(adminA);
        await expect(updateWorkflow(1.5, { name: "Invalid" })).rejects.toThrow("Invalid id");
      });

      it("throws on id <= 0", async () => {
        mockUser(adminA);
        await expect(updateWorkflow(0, { name: "Invalid" })).rejects.toThrow("Invalid id");
        mockUser(adminA);
        await expect(updateWorkflow(-1, { name: "Invalid" })).rejects.toThrow("Invalid id");
      });

      it("returns sanitized Not found for non-existent workflow", async () => {
        mockUser(adminA);
        await expect(updateWorkflow(999999, { name: "Ghost" })).rejects.toThrow("Not found");
      });

      it("returns sanitized Not found for other company's workflow", async () => {
        mockUser(adminB);
        const wfB = await createWorkflow({ name: "Globex Internal" });

        mockUser(adminA);
        await expect(updateWorkflow(wfB!.id, { name: "Hacked" })).rejects.toThrow("Not found");
      });

      it("calls revalidatePath after update", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Revalidate Test" });
        vi.mocked(revalidatePath).mockClear();

        mockUser(adminA);
        await updateWorkflow(wf!.id, { name: "Revalidated" });
        expect(revalidatePath).toHaveBeenCalledWith("/workflows");
      });

      it("partial update preserves unmentioned fields", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({
          name: "Preserve Fields",
          description: "Original description",
          color: "red",
          icon: "Zap",
        });

        mockUser(adminA);
        await updateWorkflow(wf!.id, { name: "New Name Only" });

        const db = await prisma.workflow.findUnique({ where: { id: wf!.id } });
        expect(db!.name).toBe("New Name Only");
        expect(db!.description).toBe("Original description");
        expect(db!.color).toBe("red");
        expect(db!.icon).toBe("Zap");
      });

      it("allows empty description (no Zod min on description)", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Description Edge", description: "Original" });

        mockUser(adminA);
        const updated = await updateWorkflow(wf!.id, { description: "" });
        expect(updated!.description).toBe("");

        const db = await prisma.workflow.findUnique({ where: { id: wf!.id } });
        expect(db!.description).toBe("");
      });
    });

    // ── deleteWorkflow ───────────────────────────────────────────────

    describe("deleteWorkflow", () => {
      it("deletes workflow and cascades to stages and instances", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Termination Process" });
        mockUser(adminA);
        const stage = await createStage(wf!.id, { name: "Exit Interview" });
        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "John Doe Termination" });

        mockUser(adminA);
        await deleteWorkflow(wf!.id);

        // Verify cascade
        expect(await prisma.workflow.findUnique({ where: { id: wf!.id } })).toBeNull();
        expect(await prisma.workflowStage.findUnique({ where: { id: stage!.id } })).toBeNull();
        expect(await prisma.workflowInstance.findUnique({ where: { id: inst!.id } })).toBeNull();
      });

      it("creates audit log entry (SEC_WORKFLOW_DELETED) — retry-poll", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Audit Trail Workflow" });

        mockUser(adminA);
        await deleteWorkflow(wf!.id);

        // Retry-poll instead of fragile setTimeout
        await waitFor(async () => {
          const log = await prisma.auditLog.findFirst({
            where: { companyId: companyA.id, action: "SEC_WORKFLOW_DELETED" },
            orderBy: { timestamp: "desc" },
          });
          return log !== null && (log.diffJson as any)?.workflowId === wf!.id;
        });

        const log = await prisma.auditLog.findFirst({
          where: { companyId: companyA.id, action: "SEC_WORKFLOW_DELETED" },
          orderBy: { timestamp: "desc" },
        });
        expect(log).not.toBeNull();
        expect((log!.diffJson as any).workflowId).toBe(wf!.id);
      });

      it("returns sanitized Not found for non-existent or other company", async () => {
        mockUser(adminA);
        await expect(deleteWorkflow(999999)).rejects.toThrow("Not found");

        mockUser(adminB);
        const wfB = await createWorkflow({ name: "Globex Delete Target" });
        mockUser(adminA);
        await expect(deleteWorkflow(wfB!.id)).rejects.toThrow("Not found");
      });

      it("calls revalidatePath after deletion", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Delete Revalidate" });
        vi.mocked(revalidatePath).mockClear();

        mockUser(adminA);
        await deleteWorkflow(wf!.id);
        expect(revalidatePath).toHaveBeenCalledWith("/workflows");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 3. Stage CRUD
  // ═══════════════════════════════════════════════════════════════════════

  describe("Stage CRUD", () => {
    // ── createStage ──────────────────────────────────────────────────

    describe("createStage", () => {
      it("creates with auto-calculated order (first stage gets 0)", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Loan Approval" });

        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "Application Received" });
        expect(s1!.order).toBe(0);

        const dbS1 = await prisma.workflowStage.findUnique({ where: { id: s1!.id } });
        expect(dbS1!.order).toBe(0);
      });

      it("auto-calculates order as max + 1", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Compliance Check" });

        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "Document Collection" });
        mockUser(adminA);
        const s2 = await createStage(wf!.id, { name: "Risk Assessment" });
        expect(s2!.order).toBe(s1!.order + 1);

        const dbS2 = await prisma.workflowStage.findUnique({ where: { id: s2!.id } });
        expect(dbS2!.order).toBe(s1!.order + 1);
      });

      it("validates details JSON (max 64KB)", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Large Details Workflow" });

        mockUser(adminA);
        const bigDetails = { data: "x".repeat(65000) };
        await expect(createStage(wf!.id, { name: "Oversized", details: bigDetails })).rejects.toThrow();
      });

      it("validates details JSON (max depth 10)", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Deep Nesting Workflow" });

        let deep: any = { val: "end" };
        for (let i = 0; i < 11; i++) deep = { nested: deep };

        mockUser(adminA);
        await expect(createStage(wf!.id, { name: "Too Deep", details: deep })).rejects.toThrow();
      });

      it("validates details JSON (no __proto__)", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Proto Injection Workflow" });

        mockUser(adminA);
        await expect(
          createStage(wf!.id, { name: "Malicious", details: JSON.parse('{"__proto__":"evil"}') }),
        ).rejects.toThrow();
      });

      it("rejects constructor key in details", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Constructor Injection" });

        mockUser(adminA);
        await expect(
          createStage(wf!.id, { name: "Bad", details: { constructor: "evil" } }),
        ).rejects.toThrow();
      });

      it("rejects prototype key in details", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Prototype Injection" });

        mockUser(adminA);
        await expect(
          createStage(wf!.id, { name: "Bad", details: { prototype: "evil" } }),
        ).rejects.toThrow();
      });

      it("resource cap: 50 stages max per workflow", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Stage Cap Workflow" });

        await prisma.workflowStage.createMany({
          data: Array.from({ length: 50 }, (_, i) => ({
            workflowId: wf!.id,
            name: `Review Phase ${i + 1}`,
            order: i,
          })),
        });

        mockUser(adminA);
        await expect(createStage(wf!.id, { name: "Overflow Stage" })).rejects.toThrow(
          "Maximum of 50 stages per workflow reached",
        );
      });

      it("throws Workflow not found for non-existent workflow", async () => {
        mockUser(adminA);
        await expect(createStage(999999, { name: "Orphaned Stage" })).rejects.toThrow("Workflow not found");
      });

      it("throws Workflow not found for other company's workflow", async () => {
        mockUser(adminB);
        const wfB = await createWorkflow({ name: "Globex Process" });

        mockUser(adminA);
        await expect(createStage(wfB!.id, { name: "Infiltration" })).rejects.toThrow("Workflow not found");
      });

      it("throws Invalid workflowId for non-integer", async () => {
        mockUser(adminA);
        await expect(createStage(1.5, { name: "Bad ID" })).rejects.toThrow("Invalid workflowId");
      });

      it("throws Invalid workflowId for zero", async () => {
        mockUser(adminA);
        await expect(createStage(0, { name: "Bad ID" })).rejects.toThrow("Invalid workflowId");
      });

      it("calls revalidatePath after creation", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Stage Revalidate" });
        vi.mocked(revalidatePath).mockClear();

        mockUser(adminA);
        await createStage(wf!.id, { name: "New Stage" });
        expect(revalidatePath).toHaveBeenCalledWith("/workflows");
      });

      it("rejects empty stage name (Zod min 1)", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Stage Name Validation" });

        mockUser(adminA);
        await expect(createStage(wf!.id, { name: "" })).rejects.toThrow(/too small/i);
      });

      it("rejects stage name > 200 chars (Zod max 200)", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Stage Name Max" });

        mockUser(adminA);
        await expect(createStage(wf!.id, { name: "x".repeat(201) })).rejects.toThrow(/too big/i);
      });

      it("stage without color/icon gets null (no @default unlike Workflow)", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Stage Null Defaults" });

        mockUser(adminA);
        const stage = await createStage(wf!.id, { name: "Plain Stage" });
        expect(stage!.color).toBeNull();
        expect(stage!.icon).toBeNull();

        const db = await prisma.workflowStage.findUnique({ where: { id: stage!.id } });
        expect(db!.color).toBeNull();
        expect(db!.icon).toBeNull();
      });
    });

    // ── updateStage ──────────────────────────────────────────────────

    describe("updateStage", () => {
      it("updates name, description, color, icon, details, order", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Update Stage Workflow" });
        mockUser(adminA);
        const stage = await createStage(wf!.id, { name: "Initial Review" });

        mockUser(adminA);
        const updated = await updateStage(stage!.id, {
          name: "Final Review",
          description: "Complete legal review of all documents",
          color: "red",
          icon: "Star",
          details: { systemActions: [{ type: "notification" }] },
          order: 5,
        });
        expect(updated!.name).toBe("Final Review");
        expect(updated!.description).toBe("Complete legal review of all documents");
        expect(updated!.color).toBe("red");
        expect(updated!.icon).toBe("Star");
        expect(updated!.details).toEqual({ systemActions: [{ type: "notification" }] });
        expect(updated!.order).toBe(5);

        const db = await prisma.workflowStage.findUnique({ where: { id: stage!.id } });
        expect(db!.name).toBe("Final Review");
        expect(db!.color).toBe("red");
        expect(db!.order).toBe(5);
        expect(db!.details).toEqual({ systemActions: [{ type: "notification" }] });
      });

      it("verifies DB state independently after update", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Stage DB Verify" });
        mockUser(adminA);
        const stage = await createStage(wf!.id, { name: "Before" });

        mockUser(adminA);
        await updateStage(stage!.id, { name: "After", color: "purple" });

        const db = await prisma.workflowStage.findUnique({ where: { id: stage!.id } });
        expect(db!.name).toBe("After");
        expect(db!.color).toBe("purple");
      });

      it("@updatedAt changes after update", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Stage Timestamp" });
        mockUser(adminA);
        const stage = await createStage(wf!.id, { name: "Timestamped" });
        const before = await prisma.workflowStage.findUnique({ where: { id: stage!.id } });

        await new Promise((r) => setTimeout(r, 50));

        mockUser(adminA);
        await updateStage(stage!.id, { name: "Updated Timestamp" });
        const after = await prisma.workflowStage.findUnique({ where: { id: stage!.id } });

        expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
      });

      it("throws for other company's stage", async () => {
        mockUser(adminB);
        const wfB = await createWorkflow({ name: "Globex Stage Workflow" });
        mockUser(adminB);
        const stageB = await createStage(wfB!.id, { name: "Globex Stage" });

        mockUser(adminA);
        await expect(updateStage(stageB!.id, { name: "Hacked" })).rejects.toThrow(
          "Unauthorized or not found",
        );
      });

      it("@@unique([workflowId, order]) → P2002 Duplicate entry", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Duplicate Order Workflow" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "First Step" }); // order 0
        mockUser(adminA);
        const s2 = await createStage(wf!.id, { name: "Second Step" }); // order 1

        // Set s2's order to match s1's order → triggers @@unique constraint
        mockUser(adminA);
        await expect(updateStage(s2!.id, { order: s1!.order })).rejects.toThrow("Duplicate entry");
      });

      it("calls revalidatePath after update", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Stage Revalidate Update" });
        mockUser(adminA);
        const stage = await createStage(wf!.id, { name: "To Revalidate" });
        vi.mocked(revalidatePath).mockClear();

        mockUser(adminA);
        await updateStage(stage!.id, { name: "Revalidated" });
        expect(revalidatePath).toHaveBeenCalledWith("/workflows");
      });

      it("throws Unauthorized or not found for non-existent stage", async () => {
        mockUser(adminA);
        await expect(updateStage(999999, { name: "Ghost" })).rejects.toThrow(
          "Unauthorized or not found",
        );
      });

      it("partial update preserves unmentioned fields", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Partial Stage Update" });
        mockUser(adminA);
        const stage = await createStage(wf!.id, {
          name: "Original Stage",
          description: "Important description",
          color: "blue",
          icon: "Star",
          details: { note: "keep me" },
        });

        mockUser(adminA);
        await updateStage(stage!.id, { color: "red" });

        const db = await prisma.workflowStage.findUnique({ where: { id: stage!.id } });
        expect(db!.name).toBe("Original Stage");
        expect(db!.description).toBe("Important description");
        expect(db!.color).toBe("red");
        expect(db!.icon).toBe("Star");
        expect(db!.details).toEqual({ note: "keep me" });
      });

      it("rejects negative order (Zod min 0)", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Negative Order Validation" });
        mockUser(adminA);
        const stage = await createStage(wf!.id, { name: "Order Edge" });

        mockUser(adminA);
        await expect(updateStage(stage!.id, { order: -1 })).rejects.toThrow();
      });
    });

    // ── deleteStage ──────────────────────────────────────────────────

    describe("deleteStage", () => {
      it("removes stage", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Delete Stage Workflow" });
        mockUser(adminA);
        const stage = await createStage(wf!.id, { name: "Expendable Phase" });

        mockUser(adminA);
        await deleteStage(stage!.id);

        expect(await prisma.workflowStage.findUnique({ where: { id: stage!.id } })).toBeNull();
      });

      it("cleans orphaned stageId from instances completedStages", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Orphan Cleanup Workflow" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "Preliminary Check" });
        mockUser(adminA);
        const s2 = await createStage(wf!.id, { name: "Final Approval" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Acme Corp Application" });

        // Complete s1 to put it in completedStages
        mockUser(adminA);
        await updateWorkflowInstanceStage(inst!.id, s1!.id, true);

        const before = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect((before!.completedStages as number[]).includes(s1!.id)).toBe(true);

        // Delete s1 — should clean from completedStages
        mockUser(adminA);
        await deleteStage(s1!.id);

        const after = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect((after!.completedStages as number[]).includes(s1!.id)).toBe(false);
      });

      it("advances instances stuck at deleted stage to next stage", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Stage Advancement Workflow" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "Initial Screening" });
        mockUser(adminA);
        const s2 = await createStage(wf!.id, { name: "Detailed Review" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Case #2024-001" });
        expect(inst!.currentStageId).toBe(s1!.id);

        // Delete s1 — instance should advance to s2
        mockUser(adminA);
        await deleteStage(s1!.id);

        const updated = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect(updated!.currentStageId).toBe(s2!.id);
        expect(updated!.status).toBe("active");
        expect(updated!.completedStages).toEqual([]);
      });

      it("marks instance as completed if no next stage after deletion", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Solo Stage Workflow" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "Single Review" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Case #2024-002" });

        // Delete the only stage
        mockUser(adminA);
        await deleteStage(s1!.id);

        const updated = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect(updated!.currentStageId).toBeNull();
        expect(updated!.status).toBe("completed");
      });

      it("throws Unauthorized or not found for non-existent stage", async () => {
        mockUser(adminA);
        await expect(deleteStage(999999)).rejects.toThrow("Unauthorized or not found");
      });

      it("calls revalidatePath after deletion", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Stage Delete Revalidate" });
        mockUser(adminA);
        const stage = await createStage(wf!.id, { name: "Temporary Stage" });
        vi.mocked(revalidatePath).mockClear();

        mockUser(adminA);
        await deleteStage(stage!.id);
        expect(revalidatePath).toHaveBeenCalledWith("/workflows");
      });
    });

    // ── reorderStages ────────────────────────────────────────────────

    describe("reorderStages", () => {
      it("updates order for all stages", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Reorder Workflow" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "Document Intake" });
        mockUser(adminA);
        const s2 = await createStage(wf!.id, { name: "Verification" });
        mockUser(adminA);
        const s3 = await createStage(wf!.id, { name: "Sign-off" });

        // Reverse order: s3, s2, s1
        mockUser(adminA);
        await reorderStages(wf!.id, [s3!.id, s2!.id, s1!.id]);

        const stages = await prisma.workflowStage.findMany({
          where: { workflowId: wf!.id },
          orderBy: { order: "asc" },
        });
        expect(stages[0].id).toBe(s3!.id);
        expect(stages[1].id).toBe(s2!.id);
        expect(stages[2].id).toBe(s1!.id);
      });

      it("validates orderedIds covers ALL stages (no partial reorder)", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Partial Reorder Workflow" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "Step A" });
        mockUser(adminA);
        const s2 = await createStage(wf!.id, { name: "Step B" });

        mockUser(adminA);
        await expect(reorderStages(wf!.id, [s1!.id])).rejects.toThrow(
          "orderedIds must include every stage",
        );
      });

      it("throws Workflow not found for non-existent workflow", async () => {
        mockUser(adminA);
        await expect(reorderStages(999999, [1])).rejects.toThrow("Workflow not found");
      });

      it("rejects orderedIds with duplicates", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Duplicate IDs Reorder" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "Step One" });
        mockUser(adminA);
        const s2 = await createStage(wf!.id, { name: "Step Two" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Step Three" });

        // [s1, s1] has length 2 but workflow has 3 stages → count mismatch triggers guard
        mockUser(adminA);
        await expect(reorderStages(wf!.id, [s1!.id, s1!.id])).rejects.toThrow(
          "orderedIds must include every stage",
        );
      });

      it("rejects orderedIds with IDs from another workflow", async () => {
        mockUser(adminA);
        const wf1 = await createWorkflow({ name: "Source Workflow" });
        mockUser(adminA);
        const s1 = await createStage(wf1!.id, { name: "Source Step A" });
        mockUser(adminA);
        const s2 = await createStage(wf1!.id, { name: "Source Step B" });

        mockUser(adminA);
        const wf2 = await createWorkflow({ name: "Target Workflow" });
        mockUser(adminA);
        const s3 = await createStage(wf2!.id, { name: "Target Step A" });
        mockUser(adminA);
        const s4 = await createStage(wf2!.id, { name: "Target Step B" });

        // Pass wf1's stage IDs to reorder wf2 (same count, foreign IDs)
        mockUser(adminA);
        await expect(reorderStages(wf2!.id, [s1!.id, s2!.id])).rejects.toThrow(
          "orderedIds must include every stage",
        );
      });

      it("throws Workflow not found for other company's workflow (cross-tenant)", async () => {
        mockUser(adminB);
        const wfB = await createWorkflow({ name: "Globex Reorder Target" });
        mockUser(adminB);
        const sB1 = await createStage(wfB!.id, { name: "Globex Step A" });
        mockUser(adminB);
        const sB2 = await createStage(wfB!.id, { name: "Globex Step B" });

        mockUser(adminA);
        await expect(reorderStages(wfB!.id, [sB2!.id, sB1!.id])).rejects.toThrow("Workflow not found");
      });

      it("calls revalidatePath after reorder", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Reorder Revalidate" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "A" });
        mockUser(adminA);
        const s2 = await createStage(wf!.id, { name: "B" });
        vi.mocked(revalidatePath).mockClear();

        mockUser(adminA);
        await reorderStages(wf!.id, [s2!.id, s1!.id]);
        expect(revalidatePath).toHaveBeenCalledWith("/workflows");
      });
    });

    // ── getWorkflowStagesDetails ─────────────────────────────────────

    describe("getWorkflowStagesDetails", () => {
      it("returns stage details for lazy loading", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Lazy Load Workflow" });
        mockUser(adminA);
        await createStage(wf!.id, {
          name: "Automated Review",
          details: { systemActions: [{ type: "notification" }] },
        });

        mockUser(adminA);
        const details = await getWorkflowStagesDetails(wf!.id);
        expect(details).toHaveLength(1);
        expect(details[0].details).toEqual({ systemActions: [{ type: "notification" }] });
        // Only id and details should be returned
        expect(details[0]).toHaveProperty("id");
        expect(details[0]).toHaveProperty("details");
        expect(Object.keys(details[0])).toHaveLength(2);
      });

      it("returns empty array for other company's workflow", async () => {
        mockUser(adminB);
        const wfB = await createWorkflow({ name: "Globex Details Workflow" });
        mockUser(adminB);
        await createStage(wfB!.id, { name: "Globex Stage" });

        mockUser(adminA);
        const details = await getWorkflowStagesDetails(wfB!.id);
        expect(details).toEqual([]);
      });

      it("throws Invalid workflowId for non-integer", async () => {
        mockUser(adminA);
        await expect(getWorkflowStagesDetails(1.5)).rejects.toThrow("Invalid workflowId");
      });

      it("throws Invalid workflowId for zero", async () => {
        mockUser(adminA);
        await expect(getWorkflowStagesDetails(0)).rejects.toThrow("Invalid workflowId");
      });

      it("throws Invalid workflowId for negative", async () => {
        mockUser(adminA);
        await expect(getWorkflowStagesDetails(-1)).rejects.toThrow("Invalid workflowId");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 4. Instance CRUD
  // ═══════════════════════════════════════════════════════════════════════

  describe("Instance CRUD", () => {
    // ── getWorkflowInstances ─────────────────────────────────────────

    describe("getWorkflowInstances", () => {
      it("lists instances ordered by updatedAt desc", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Instance Listing" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Intake" });

        mockUser(adminA);
        const i1 = await createWorkflowInstance({ workflowId: wf!.id, name: "Acme Corp Deal" });

        // Touch i1 via DB update to ensure deterministic ordering
        await prisma.workflowInstance.update({
          where: { id: i1!.id },
          data: { updatedAt: new Date(Date.now() - 10000) },
        });

        mockUser(adminA);
        const i2 = await createWorkflowInstance({ workflowId: wf!.id, name: "Beta Inc Deal" });

        mockUser(adminA);
        const list = await getWorkflowInstances();
        expect(list.length).toBe(2);
        // Most recently updated first
        expect(list[0].id).toBe(i2!.id);
      });

      it("filters by status", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Status Filter Workflow" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "Review" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Completed Case" });

        await prisma.workflowInstance.update({
          where: { id: inst!.id },
          data: { status: "completed" },
        });

        mockUser(adminA);
        const i2 = await createWorkflowInstance({ workflowId: wf!.id, name: "Active Case" });

        mockUser(adminA);
        const activeList = await getWorkflowInstances("active");
        expect(activeList.every((i: any) => i.status === "active")).toBe(true);
        expect(activeList.length).toBe(1);

        mockUser(adminA);
        const completedList = await getWorkflowInstances("completed");
        expect(completedList.every((i: any) => i.status === "completed")).toBe(true);
        expect(completedList.length).toBe(1);
      });

      it("filters by workflowId", async () => {
        mockUser(adminA);
        const wf1 = await createWorkflow({ name: "Onboarding Pipeline" });
        mockUser(adminA);
        await createStage(wf1!.id, { name: "Welcome" });
        mockUser(adminA);
        const wf2 = await createWorkflow({ name: "Offboarding Pipeline" });
        mockUser(adminA);
        await createStage(wf2!.id, { name: "Exit Interview" });

        mockUser(adminA);
        await createWorkflowInstance({ workflowId: wf1!.id, name: "New Hire - Alice" });
        mockUser(adminA);
        await createWorkflowInstance({ workflowId: wf2!.id, name: "Departure - Bob" });

        mockUser(adminA);
        const list = await getWorkflowInstances(undefined, { workflowId: wf1!.id });
        expect(list.length).toBe(1);
        expect(list[0].workflowId).toBe(wf1!.id);
      });

      it("includes creator and assignee names", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Names Verification" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Review" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({
          workflowId: wf!.id,
          name: "Named Instance",
          assigneeId: assigneeA.id,
        });

        mockUser(adminA);
        const list = await getWorkflowInstances();
        const found = list.find((i: any) => i.id === inst!.id);
        expect(found!.creator).toBeDefined();
        expect(found!.creator.name).toBe("Sarah Cohen");
        expect(found!.assignee).toBeDefined();
        expect(found!.assignee!.name).toBe("Maya Stern");
      });

      it("response contract: creator/assignee only have id + name", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Contract Check" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Review" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({
          workflowId: wf!.id,
          name: "Contract Instance",
          assigneeId: assigneeA.id,
        });

        mockUser(adminA);
        const list = await getWorkflowInstances();
        const found = list.find((i: any) => i.id === inst!.id);

        // creator should only have id and name — no email, passwordHash, etc.
        const creatorKeys = Object.keys(found!.creator);
        expect(creatorKeys).toContain("id");
        expect(creatorKeys).toContain("name");
        expect(creatorKeys).not.toContain("email");
        expect(creatorKeys).not.toContain("passwordHash");
        expect(creatorKeys).not.toContain("role");
        expect(creatorKeys).toHaveLength(2);

        // assignee should only have id and name
        const assigneeKeys = Object.keys(found!.assignee!);
        expect(assigneeKeys).toContain("id");
        expect(assigneeKeys).toContain("name");
        expect(assigneeKeys).not.toContain("email");
        expect(assigneeKeys).not.toContain("passwordHash");
        expect(assigneeKeys).toHaveLength(2);
      });

      it("cursor pagination works", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Paginated Workflow" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Step" });

        mockUser(adminA);
        const i1 = await createWorkflowInstance({ workflowId: wf!.id, name: "Page 1 Item" });
        mockUser(adminA);
        const i2 = await createWorkflowInstance({ workflowId: wf!.id, name: "Page 2 Item" });

        mockUser(adminA);
        const page2 = await getWorkflowInstances(undefined, { cursor: i2!.id });
        expect(page2.length).toBe(1);
        expect(page2[0].id).toBe(i1!.id);
      });

      it("throws Invalid workflowId for non-integer", async () => {
        mockUser(adminA);
        await expect(getWorkflowInstances(undefined, { workflowId: 1.5 })).rejects.toThrow("Invalid workflowId");
      });

      it("throws Invalid workflowId for zero", async () => {
        mockUser(adminA);
        await expect(getWorkflowInstances(undefined, { workflowId: 0 })).rejects.toThrow("Invalid workflowId");
      });

      it("throws Invalid cursor for non-integer", async () => {
        mockUser(adminA);
        await expect(getWorkflowInstances(undefined, { cursor: 1.5 })).rejects.toThrow("Invalid cursor");
      });

      it("throws Invalid cursor for zero", async () => {
        mockUser(adminA);
        await expect(getWorkflowInstances(undefined, { cursor: 0 })).rejects.toThrow("Invalid cursor");
      });

      it("throws Invalid cursor for negative", async () => {
        mockUser(adminA);
        await expect(getWorkflowInstances(undefined, { cursor: -5 })).rejects.toThrow("Invalid cursor");
      });

      it("throws Invalid workflowId for negative", async () => {
        mockUser(adminA);
        await expect(getWorkflowInstances(undefined, { workflowId: -1 })).rejects.toThrow("Invalid workflowId");
      });

      it("returns empty array when no instances exist", async () => {
        mockUser(adminA);
        const list = await getWorkflowInstances();
        expect(list).toEqual([]);
      });
    });

    // ── createWorkflowInstance ───────────────────────────────────────

    describe("createWorkflowInstance", () => {
      it("sets currentStageId to first stage, status active, completedStages []", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "New Instance Workflow" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "Kickoff Meeting" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Requirements Gathering" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Project Alpha" });
        expect(inst!.currentStageId).toBe(s1!.id);
        expect(inst!.status).toBe("active");
        expect(inst!.completedStages).toEqual([]);

        const db = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect(db!.currentStageId).toBe(s1!.id);
        expect(db!.status).toBe("active");
        expect(db!.completedStages).toEqual([]);
      });

      it("sets creatorId to current user", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Creator Tracking" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Init" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Creator Test" });
        expect(inst!.creatorId).toBe(adminA.id);

        const db = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect(db!.creatorId).toBe(adminA.id);
      });

      it("instance on workflow with 0 stages — currentStageId is null", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Empty Workflow" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "No Stages Case" });
        expect(inst!.currentStageId).toBeNull();
        expect(inst!.status).toBe("active");
        expect(inst!.completedStages).toEqual([]);

        // Verify DB state independently
        const db = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect(db!.currentStageId).toBeNull();
        expect(db!.status).toBe("active");
        expect(db!.completedStages).toEqual([]);
      });

      it("validates assigneeId belongs to same company", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Assignee Validation" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Review" });

        // Assign to same-company user — OK
        mockUser(adminA);
        const inst = await createWorkflowInstance({
          workflowId: wf!.id,
          name: "Valid Assignment",
          assigneeId: assigneeA.id,
        });
        expect(inst!.assigneeId).toBe(assigneeA.id);
      });

      it("cross-company assignee throws Invalid assignee", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Cross-Company Guard" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Review" });

        mockUser(adminA);
        await expect(
          createWorkflowInstance({
            workflowId: wf!.id,
            name: "Cross Tenant",
            assigneeId: adminB.id,
          }),
        ).rejects.toThrow("Invalid assignee");
      });

      it("resource cap: 500 instances max per workflow", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Instance Cap Workflow" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Review" });

        await prisma.workflowInstance.createMany({
          data: Array.from({ length: 500 }, (_, i) => ({
            companyId: companyA.id,
            workflowId: wf!.id,
            name: `Case #${String(i + 1).padStart(4, "0")}`,
            status: "active" as const,
            creatorId: adminA.id,
            completedStages: [],
          })),
        });

        mockUser(adminA);
        await expect(
          createWorkflowInstance({ workflowId: wf!.id, name: "Overflow Case" }),
        ).rejects.toThrow("Maximum of 500 instances per workflow reached");
      });

      it("throws Workflow not found for non-existent workflow", async () => {
        mockUser(adminA);
        await expect(
          createWorkflowInstance({ workflowId: 999999, name: "Ghost Instance" }),
        ).rejects.toThrow("Workflow not found or access denied");
      });

      it("throws Workflow not found for other company's workflow (multi-tenancy)", async () => {
        mockUser(adminB);
        const wfB = await createWorkflow({ name: "Globex Instance Target" });

        mockUser(adminA);
        await expect(
          createWorkflowInstance({ workflowId: wfB!.id, name: "Cross-Tenant Instance" }),
        ).rejects.toThrow("Workflow not found or access denied");
      });

      it("calls revalidatePath after creation", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Instance Revalidate" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Step" });
        vi.mocked(revalidatePath).mockClear();

        mockUser(adminA);
        await createWorkflowInstance({ workflowId: wf!.id, name: "Cache Test" });
        expect(revalidatePath).toHaveBeenCalledWith("/workflows");
      });

      it("throws on empty name (Zod validation)", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Zod Name Validation" });

        mockUser(adminA);
        await expect(
          createWorkflowInstance({ workflowId: wf!.id, name: "" }),
        ).rejects.toThrow(/too small/i);
      });

      it("rejects non-integer workflowId (Zod positiveInt)", async () => {
        mockUser(adminA);
        await expect(
          createWorkflowInstance({ workflowId: 1.5, name: "Float WF ID" }),
        ).rejects.toThrow(/expected int/i);
      });

      it("rejects name > 200 chars (Zod max 200)", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Instance Name Max" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Step" });

        mockUser(adminA);
        await expect(
          createWorkflowInstance({ workflowId: wf!.id, name: "x".repeat(201) }),
        ).rejects.toThrow();
      });

      it("rejects assigneeId: 0 (Zod positiveInt)", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "AssigneeId Zero Guard" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Step" });

        mockUser(adminA);
        await expect(
          createWorkflowInstance({ workflowId: wf!.id, name: "Zero Assignee", assigneeId: 0 }),
        ).rejects.toThrow();
      });
    });

    // ── updateWorkflowInstanceStage ──────────────────────────────────

    describe("updateWorkflowInstanceStage", () => {
      it("complete stage: adds to completedStages and advances currentStageId", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Stage Advancement" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "Document Collection" });
        mockUser(adminA);
        const s2 = await createStage(wf!.id, { name: "Compliance Review" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Case #100" });

        mockUser(adminA);
        await updateWorkflowInstanceStage(inst!.id, s1!.id, true);

        const updated = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect((updated!.completedStages as number[]).includes(s1!.id)).toBe(true);
        expect(updated!.currentStageId).toBe(s2!.id);
        expect(updated!.status).toBe("active");
      });

      it("complete last stage: status completed, currentStageId null", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Final Stage Workflow" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "Only Step" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Single Step Case" });

        mockUser(adminA);
        await updateWorkflowInstanceStage(inst!.id, s1!.id, true);

        const updated = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect(updated!.status).toBe("completed");
        expect(updated!.currentStageId).toBeNull();
      });

      it("uncomplete stage: removes from completedStages, sets currentStageId back", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Uncomplete Workflow" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "Initial Assessment" });
        mockUser(adminA);
        const s2 = await createStage(wf!.id, { name: "Deep Dive" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Rollback Case" });

        // Complete s1
        mockUser(adminA);
        await updateWorkflowInstanceStage(inst!.id, s1!.id, true);

        // Uncomplete s1
        mockUser(adminA);
        await updateWorkflowInstanceStage(inst!.id, s1!.id, false);

        const updated = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect((updated!.completedStages as number[]).includes(s1!.id)).toBe(false);
        expect(updated!.currentStageId).toBe(s1!.id);
        expect(updated!.status).toBe("active");
      });

      it("idempotent stage completion — does not duplicate in completedStages", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Idempotent Completion" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "Review" });
        mockUser(adminA);
        const s2 = await createStage(wf!.id, { name: "Approve" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Double Complete" });

        // Complete s1 twice
        mockUser(adminA);
        await updateWorkflowInstanceStage(inst!.id, s1!.id, true);
        mockUser(adminA);
        await updateWorkflowInstanceStage(inst!.id, s1!.id, true);

        const updated = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        const completed = updated!.completedStages as number[];
        const s1Count = completed.filter((id) => id === s1!.id).length;
        expect(s1Count).toBe(1);
      });

      it("throws when stage not in workflow", async () => {
        mockUser(adminA);
        const wf1 = await createWorkflow({ name: "Workflow Alpha" });
        mockUser(adminA);
        await createStage(wf1!.id, { name: "Alpha Step" });
        mockUser(adminA);
        const wf2 = await createWorkflow({ name: "Workflow Beta" });
        mockUser(adminA);
        const s2 = await createStage(wf2!.id, { name: "Beta Step" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf1!.id, name: "Mixed Case" });

        mockUser(adminA);
        await expect(
          updateWorkflowInstanceStage(inst!.id, s2!.id, true),
        ).rejects.toThrow("Stage does not belong to this workflow");
      });

      it("triggers inngest.send when stage has systemActions in details", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Automation Trigger" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, {
          name: "Auto-Notification Stage",
          details: { systemActions: [{ type: "notification" }] },
        });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Auto Case" });

        mockUser(adminA);
        await updateWorkflowInstanceStage(inst!.id, s1!.id, true);

        expect(inngest.send).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "workflow/execute-stage-automations",
            data: expect.objectContaining({
              stageId: s1!.id,
              instanceId: inst!.id,
              companyId: companyA.id,
              userId: adminA.id,
              stageName: "Auto-Notification Stage",
              instanceName: "Auto Case",
              stageDetails: { systemActions: [{ type: "notification" }] },
            }),
          }),
        );

        const db = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect((db!.completedStages as number[]).includes(s1!.id)).toBe(true);
        expect(db!.status).toBe("completed");
        expect(db!.currentStageId).toBeNull();
      });

      it("does not trigger inngest when stage has no systemActions", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "No Automation" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "Manual Stage" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Manual Case" });

        mockUser(adminA);
        await updateWorkflowInstanceStage(inst!.id, s1!.id, true);

        expect(inngest.send).not.toHaveBeenCalled();

        const updated = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect((updated!.completedStages as number[]).includes(s1!.id)).toBe(true);
      });

      it("inngest.send failure — action still succeeds and notification fallback fires", async () => {
        vi.mocked(inngest.send).mockRejectedValueOnce(new Error("Inngest down"));

        mockUser(adminA);
        const wf = await createWorkflow({ name: "Inngest Failure" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, {
          name: "Failing Auto Stage",
          details: { systemActions: [{ type: "notification" }] },
        });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Resilient Case" });

        // Should NOT throw despite inngest failure
        mockUser(adminA);
        await updateWorkflowInstanceStage(inst!.id, s1!.id, true);

        // Verify the stage was still completed
        const updated = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect((updated!.completedStages as number[]).includes(s1!.id)).toBe(true);

        // Verify notification fallback was called
        expect(createNotificationForCompany).toHaveBeenCalledWith(
          expect.objectContaining({
            companyId: companyA.id,
            userId: adminA.id,
            title: "אוטומציות תהליך עבודה לא נשלחו",
            link: "/workflows",
          }),
        );
      });

      it("throws Invalid instanceId for non-integer", async () => {
        mockUser(adminA);
        await expect(updateWorkflowInstanceStage(1.5, 1, true)).rejects.toThrow("Invalid instanceId");
      });

      it("throws Invalid instanceId for zero", async () => {
        mockUser(adminA);
        await expect(updateWorkflowInstanceStage(0, 1, true)).rejects.toThrow("Invalid instanceId");
      });

      it("throws Invalid stageId for non-integer", async () => {
        mockUser(adminA);
        await expect(updateWorkflowInstanceStage(1, 1.5, true)).rejects.toThrow("Invalid stageId");
      });

      it("throws Invalid stageId for zero", async () => {
        mockUser(adminA);
        await expect(updateWorkflowInstanceStage(1, 0, true)).rejects.toThrow("Invalid stageId");
      });

      it("throws for non-existent instance (valid integer ID)", async () => {
        mockUser(adminA);
        await expect(
          updateWorkflowInstanceStage(999999, 1, true),
        ).rejects.toThrow("Instance not found or access denied");
      });

      it("throws Invalid completed flag for non-boolean", async () => {
        mockUser(adminA);
        await expect(
          updateWorkflowInstanceStage(1, 1, "true" as any),
        ).rejects.toThrow("Invalid completed flag");
        mockUser(adminA);
        await expect(
          updateWorkflowInstanceStage(1, 1, 1 as any),
        ).rejects.toThrow("Invalid completed flag");
      });

      it("uncomplete a never-completed stage — sets currentStageId, no crash", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Never Completed Uncomplete" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "First Step" });
        mockUser(adminA);
        const s2 = await createStage(wf!.id, { name: "Second Step" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Uncomplete Virgin" });
        expect(inst!.currentStageId).toBe(s1!.id);

        // Uncomplete s1 even though it was never completed
        mockUser(adminA);
        await updateWorkflowInstanceStage(inst!.id, s1!.id, false);

        const updated = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect(updated!.completedStages).toEqual([]);
        expect(updated!.currentStageId).toBe(s1!.id);
        expect(updated!.status).toBe("active");
      });

      it("does not trigger inngest when stage has empty systemActions array", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Empty Actions Workflow" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, {
          name: "Empty Actions Stage",
          details: { systemActions: [] },
        });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Empty Actions Case" });

        mockUser(adminA);
        await updateWorkflowInstanceStage(inst!.id, s1!.id, true);

        expect(inngest.send).not.toHaveBeenCalled();

        const updated = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect((updated!.completedStages as number[]).includes(s1!.id)).toBe(true);
      });

      it("inngest + notification double-failure — action still succeeds silently", async () => {
        vi.mocked(inngest.send).mockRejectedValueOnce(new Error("Inngest down"));
        vi.mocked(createNotificationForCompany).mockRejectedValueOnce(new Error("Notification down"));

        mockUser(adminA);
        const wf = await createWorkflow({ name: "Double Failure Workflow" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, {
          name: "Double Failure Stage",
          details: { systemActions: [{ type: "notification" }] },
        });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Double Failure Case" });

        // Should NOT throw despite both inngest and notification failing
        mockUser(adminA);
        await updateWorkflowInstanceStage(inst!.id, s1!.id, true);

        // Verify the stage was still completed in DB
        const updated = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect((updated!.completedStages as number[]).includes(s1!.id)).toBe(true);
      });

      it("calls revalidatePath after stage completion", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Revalidate Stage Complete" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "Step" });
        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Revalidate Case" });
        vi.mocked(revalidatePath).mockClear();

        mockUser(adminA);
        await updateWorkflowInstanceStage(inst!.id, s1!.id, true);
        expect(revalidatePath).toHaveBeenCalledWith("/workflows");
      });

      it("out-of-order completion: completing s2 while currentStage is s1", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Out of Order Completion" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "Step One" });
        mockUser(adminA);
        const s2 = await createStage(wf!.id, { name: "Step Two" });
        mockUser(adminA);
        const s3 = await createStage(wf!.id, { name: "Step Three" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Skip Ahead Case" });
        expect(inst!.currentStageId).toBe(s1!.id);

        // Complete s2 while currentStage is still s1
        mockUser(adminA);
        await updateWorkflowInstanceStage(inst!.id, s2!.id, true);

        const db = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect((db!.completedStages as number[]).includes(s2!.id)).toBe(true);
        expect((db!.completedStages as number[]).includes(s1!.id)).toBe(false);
        // Source: findIndex of s2 (index 1) → nextStage = stages[2] = s3
        expect(db!.currentStageId).toBe(s3!.id);
        expect(db!.status).toBe("active");
      });

      it("out-of-order: completing last stage marks instance completed with earlier stages incomplete", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Skip to End" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "Step One" });
        mockUser(adminA);
        const s2 = await createStage(wf!.id, { name: "Step Two" });
        mockUser(adminA);
        const s3 = await createStage(wf!.id, { name: "Step Three" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Jump to End" });

        // Complete s3 (last) while s1 and s2 are incomplete
        mockUser(adminA);
        await updateWorkflowInstanceStage(inst!.id, s3!.id, true);

        const db = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect(db!.status).toBe("completed");
        expect(db!.currentStageId).toBeNull();
        expect((db!.completedStages as number[]).includes(s3!.id)).toBe(true);
        expect((db!.completedStages as number[]).includes(s1!.id)).toBe(false);
        expect((db!.completedStages as number[]).includes(s2!.id)).toBe(false);
      });
    });

    // ── resetWorkflowInstance ────────────────────────────────────────

    describe("resetWorkflowInstance", () => {
      it("resets completedStages, currentStageId, status to active", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Reset Workflow" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "Single Step" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Reset Target" });

        // Complete the only stage
        mockUser(adminA);
        await updateWorkflowInstanceStage(inst!.id, s1!.id, true);

        const completed = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect(completed!.status).toBe("completed");

        // Reset
        mockUser(adminA);
        await resetWorkflowInstance(inst!.id);

        const reset = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect(reset!.completedStages).toEqual([]);
        expect(reset!.currentStageId).toBe(s1!.id);
        expect(reset!.status).toBe("active");
      });

      it("throws for non-existent instance", async () => {
        mockUser(adminA);
        await expect(resetWorkflowInstance(999999)).rejects.toThrow(
          "Instance not found or access denied",
        );
      });

      it("throws Invalid instanceId for non-integer", async () => {
        mockUser(adminA);
        await expect(resetWorkflowInstance(1.5)).rejects.toThrow("Invalid instanceId");
      });

      it("throws Invalid instanceId for zero", async () => {
        mockUser(adminA);
        await expect(resetWorkflowInstance(0)).rejects.toThrow("Invalid instanceId");
      });

      it("resets instance on workflow with 0 stages — currentStageId null, status active", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Zero Stage Reset" });

        // Create instance on 0-stage workflow
        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "No Stages Reset Case" });

        // Mark completed via DB to simulate a state where it needs resetting
        await prisma.workflowInstance.update({
          where: { id: inst!.id },
          data: { status: "completed" },
        });

        // Reset
        mockUser(adminA);
        await resetWorkflowInstance(inst!.id);

        const reset = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect(reset!.completedStages).toEqual([]);
        expect(reset!.currentStageId).toBeNull();
        expect(reset!.status).toBe("active");
      });

      it("calls revalidatePath after reset", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Revalidate Reset" });
        mockUser(adminA);
        const s1 = await createStage(wf!.id, { name: "Step" });
        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Reset Revalidate" });
        mockUser(adminA);
        await updateWorkflowInstanceStage(inst!.id, s1!.id, true);
        vi.mocked(revalidatePath).mockClear();

        mockUser(adminA);
        await resetWorkflowInstance(inst!.id);
        expect(revalidatePath).toHaveBeenCalledWith("/workflows");
      });
    });

    // ── updateWorkflowInstance (from workflows.ts) ───────────────────

    describe("updateWorkflowInstance", () => {
      it("updates name and assigneeId", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Instance Update Workflow" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Review" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Original Name" });

        mockUser(adminA);
        await updateWorkflowInstance(inst!.id, {
          name: "Renamed Instance",
          assigneeId: assigneeA.id,
        });

        const updated = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect(updated!.name).toBe("Renamed Instance");
        expect(updated!.assigneeId).toBe(assigneeA.id);
      });

      it("can set assigneeId to null (unassign)", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Unassign Workflow" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Step" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({
          workflowId: wf!.id,
          name: "Assigned Case",
          assigneeId: assigneeA.id,
        });

        mockUser(adminA);
        await updateWorkflowInstance(inst!.id, { assigneeId: null });

        const updated = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect(updated!.assigneeId).toBeNull();
      });

      it("cross-company assignee throws Invalid assignee", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Cross Company Update" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Step" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Guarded Case" });

        mockUser(adminA);
        await expect(
          updateWorkflowInstance(inst!.id, { assigneeId: adminB.id }),
        ).rejects.toThrow("Invalid assignee");
      });

      it("calls revalidatePath after update", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Instance Revalidate Update" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Step" });
        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Revalidate Target" });
        vi.mocked(revalidatePath).mockClear();

        mockUser(adminA);
        await updateWorkflowInstance(inst!.id, { name: "Updated" });
        expect(revalidatePath).toHaveBeenCalledWith("/workflows");
      });

      it("rejects empty name (Zod min 1)", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Empty Name Update" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Step" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Valid Name" });

        mockUser(adminA);
        await expect(
          updateWorkflowInstance(inst!.id, { name: "" }),
        ).rejects.toThrow(/too small/i);
      });

      it("name-only update preserves assigneeId", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Preserve Assignee" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Step" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({
          workflowId: wf!.id,
          name: "Assigned Case",
          assigneeId: assigneeA.id,
        });

        mockUser(adminA);
        await updateWorkflowInstance(inst!.id, { name: "Renamed Case" });

        const db = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
        expect(db!.name).toBe("Renamed Case");
        expect(db!.assigneeId).toBe(assigneeA.id);
      });

      it("rejects name > 200 chars (Zod max 200)", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Instance Name Max Update" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Step" });
        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Valid" });

        mockUser(adminA);
        await expect(
          updateWorkflowInstance(inst!.id, { name: "x".repeat(201) }),
        ).rejects.toThrow();
      });

      it("rejects assigneeId: 0 (Zod positiveInt)", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "AssigneeId Zero Update" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Step" });
        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Valid" });

        mockUser(adminA);
        await expect(
          updateWorkflowInstance(inst!.id, { assigneeId: 0 }),
        ).rejects.toThrow();
      });
    });

    // ── deleteWorkflowInstance ───────────────────────────────────────

    describe("deleteWorkflowInstance", () => {
      it("removes instance", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Instance Deletion" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Step" });

        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Doomed Case" });

        mockUser(adminA);
        await deleteWorkflowInstance(inst!.id);

        expect(await prisma.workflowInstance.findUnique({ where: { id: inst!.id } })).toBeNull();
      });

      it("non-existent throws sanitized Not found", async () => {
        mockUser(adminA);
        await expect(deleteWorkflowInstance(999999)).rejects.toThrow("Not found");
      });

      it("calls revalidatePath after deletion", async () => {
        mockUser(adminA);
        const wf = await createWorkflow({ name: "Delete Revalidate Instance" });
        mockUser(adminA);
        await createStage(wf!.id, { name: "Step" });
        mockUser(adminA);
        const inst = await createWorkflowInstance({ workflowId: wf!.id, name: "Delete Target" });
        vi.mocked(revalidatePath).mockClear();

        mockUser(adminA);
        await deleteWorkflowInstance(inst!.id);
        expect(revalidatePath).toHaveBeenCalledWith("/workflows");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 5. Multi-tenancy isolation
  // ═══════════════════════════════════════════════════════════════════════

  describe("Multi-tenancy isolation", () => {
    it("company A admin cannot read company B workflows", async () => {
      mockUser(adminB);
      await createWorkflow({ name: "Globex Confidential Process" });

      mockUser(adminA);
      const list = await getWorkflows();
      expect(list.every((w: any) => w.name !== "Globex Confidential Process")).toBe(true);
    });

    it("company A admin cannot update company B workflow", async () => {
      mockUser(adminB);
      const wfB = await createWorkflow({ name: "Globex HR Pipeline" });

      mockUser(adminA);
      await expect(updateWorkflow(wfB!.id, { name: "Hacked" })).rejects.toThrow("Not found");
    });

    it("company A admin cannot delete company B workflow", async () => {
      mockUser(adminB);
      const wfB = await createWorkflow({ name: "Globex Retention" });

      mockUser(adminA);
      await expect(deleteWorkflow(wfB!.id)).rejects.toThrow("Not found");
    });

    it("company A admin cannot update company B stage", async () => {
      mockUser(adminB);
      const wfB = await createWorkflow({ name: "Globex Stage WF" });
      mockUser(adminB);
      const sB = await createStage(wfB!.id, { name: "Globex Internal Stage" });

      mockUser(adminA);
      await expect(updateStage(sB!.id, { name: "Hacked" })).rejects.toThrow(
        "Unauthorized or not found",
      );
    });

    it("company A admin cannot delete company B stage", async () => {
      mockUser(adminB);
      const wfB = await createWorkflow({ name: "Globex Delete Stage WF" });
      mockUser(adminB);
      const sB = await createStage(wfB!.id, { name: "Protected Stage" });

      mockUser(adminA);
      await expect(deleteStage(sB!.id)).rejects.toThrow("Unauthorized or not found");
    });

    it("company A cannot read company B instances", async () => {
      mockUser(adminB);
      const wfB = await createWorkflow({ name: "Globex Instance WF" });
      mockUser(adminB);
      await createStage(wfB!.id, { name: "Step" });
      mockUser(adminB);
      await createWorkflowInstance({ workflowId: wfB!.id, name: "Globex Case #001" });

      mockUser(adminA);
      const list = await getWorkflowInstances();
      expect(list.every((i: any) => i.name !== "Globex Case #001")).toBe(true);
    });

    it("company A cannot complete stage on company B instance", async () => {
      mockUser(adminB);
      const wfB = await createWorkflow({ name: "Globex Stage Complete Target" });
      mockUser(adminB);
      const sB = await createStage(wfB!.id, { name: "Globex Stage" });
      mockUser(adminB);
      const instB = await createWorkflowInstance({ workflowId: wfB!.id, name: "Globex Instance" });

      mockUser(adminA);
      await expect(
        updateWorkflowInstanceStage(instB!.id, sB!.id, true),
      ).rejects.toThrow("Instance not found or access denied");
    });

    it("company A cannot reset company B instance", async () => {
      mockUser(adminB);
      const wfB = await createWorkflow({ name: "Globex Reset Target" });
      mockUser(adminB);
      const sB = await createStage(wfB!.id, { name: "Globex Step" });
      mockUser(adminB);
      const instB = await createWorkflowInstance({ workflowId: wfB!.id, name: "Globex Reset Instance" });

      mockUser(adminA);
      await expect(resetWorkflowInstance(instB!.id)).rejects.toThrow(
        "Instance not found or access denied",
      );
    });

    it("company A cannot delete company B instance", async () => {
      mockUser(adminB);
      const wfB = await createWorkflow({ name: "Globex Delete Instance Target" });
      mockUser(adminB);
      await createStage(wfB!.id, { name: "Globex Step" });
      mockUser(adminB);
      const instB = await createWorkflowInstance({ workflowId: wfB!.id, name: "Globex Doomed Instance" });

      mockUser(adminA);
      await expect(deleteWorkflowInstance(instB!.id)).rejects.toThrow("Not found");
    });

    it("company A cannot update company B instance", async () => {
      mockUser(adminB);
      const wfB = await createWorkflow({ name: "Globex Update Instance Target" });
      mockUser(adminB);
      await createStage(wfB!.id, { name: "Globex Step" });
      mockUser(adminB);
      const instB = await createWorkflowInstance({ workflowId: wfB!.id, name: "Globex Update Target" });

      mockUser(adminA);
      await expect(
        updateWorkflowInstance(instB!.id, { name: "Hacked Name" }),
      ).rejects.toThrow("Not found");
    });

    it("creating instance with cross-company assignee fails", async () => {
      mockUser(adminA);
      const wf = await createWorkflow({ name: "Cross-Tenant Assignment" });
      mockUser(adminA);
      await createStage(wf!.id, { name: "Step" });

      mockUser(adminA);
      await expect(
        createWorkflowInstance({
          workflowId: wf!.id,
          name: "Cross Assignment",
          assigneeId: adminB.id,
        }),
      ).rejects.toThrow("Invalid assignee");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 6. Validation edge cases
  // ═══════════════════════════════════════════════════════════════════════

  describe("Validation edge cases", () => {
    it("empty name → Zod error", async () => {
      mockUser(adminA);
      await expect(createWorkflow({ name: "" })).rejects.toThrow(/too small/i);
    });

    it("name > 200 chars → Zod error", async () => {
      mockUser(adminA);
      await expect(createWorkflow({ name: "x".repeat(201) })).rejects.toThrow(/too big/i);
    });

    it("description > 2000 chars → Zod error", async () => {
      mockUser(adminA);
      await expect(
        createWorkflow({ name: "Valid Name", description: "d".repeat(2001) }),
      ).rejects.toThrow(/too big/i);
    });

    it("color > 30 chars → Zod error", async () => {
      mockUser(adminA);
      await expect(
        createWorkflow({ name: "Valid Name", color: "c".repeat(31) }),
      ).rejects.toThrow(/too big/i);
    });

    it("icon > 50 chars → Zod error", async () => {
      mockUser(adminA);
      await expect(
        createWorkflow({ name: "Valid Name", icon: "i".repeat(51) }),
      ).rejects.toThrow(/too big/i);
    });

    it("invalid cursor (0) → throws", async () => {
      mockUser(adminA);
      await expect(getWorkflows(0)).rejects.toThrow("Invalid cursor");
    });

    it("invalid cursor (negative) → throws", async () => {
      mockUser(adminA);
      await expect(getWorkflows(-5)).rejects.toThrow("Invalid cursor");
    });

    it("invalid cursor (float) → throws", async () => {
      mockUser(adminA);
      await expect(getWorkflows(1.5)).rejects.toThrow("Invalid cursor");
    });

    it("details JSON with __proto__ key → Zod refine error", async () => {
      mockUser(adminA);
      const wf = await createWorkflow({ name: "Proto Edge Case" });
      mockUser(adminA);
      await expect(
        createStage(wf!.id, { name: "Bad Stage", details: JSON.parse('{"__proto__":{}}') }),
      ).rejects.toThrow(/forbidden keys/i);
    });

    it("details JSON with constructor key → Zod refine error", async () => {
      mockUser(adminA);
      const wf = await createWorkflow({ name: "Constructor Edge" });
      mockUser(adminA);
      await expect(
        createStage(wf!.id, { name: "Bad Stage", details: { constructor: {} } }),
      ).rejects.toThrow(/forbidden keys/i);
    });

    it("details JSON with prototype key → Zod refine error", async () => {
      mockUser(adminA);
      const wf = await createWorkflow({ name: "Prototype Edge" });
      mockUser(adminA);
      await expect(
        createStage(wf!.id, { name: "Bad Stage", details: { prototype: {} } }),
      ).rejects.toThrow(/forbidden keys/i);
    });

    it("details JSON > 64KB → Zod refine error", async () => {
      mockUser(adminA);
      const wf = await createWorkflow({ name: "Size Edge Case" });
      mockUser(adminA);
      await expect(
        createStage(wf!.id, { name: "Huge Stage", details: { huge: "x".repeat(65000) } }),
      ).rejects.toThrow(/too large/i);
    });

    it("details JSON nested > 10 levels → Zod refine error", async () => {
      mockUser(adminA);
      const wf = await createWorkflow({ name: "Depth Edge Case" });
      let deep: any = { val: "end" };
      for (let i = 0; i < 11; i++) deep = { nested: deep };

      mockUser(adminA);
      await expect(createStage(wf!.id, { name: "Nested Stage", details: deep })).rejects.toThrow(/too deeply nested/i);
    });

    it("invalid status enum value → Zod error", async () => {
      mockUser(adminA);
      await expect(getWorkflowInstances("invalid_status" as any)).rejects.toThrow();
    });

    it("non-integer IDs → throws", async () => {
      mockUser(adminA);
      await expect(updateWorkflow(1.5, { name: "x" })).rejects.toThrow("Invalid id");
      mockUser(adminA);
      await expect(deleteWorkflow(1.5)).rejects.toThrow("Invalid id");
      mockUser(adminA);
      await expect(deleteWorkflowInstance(1.5)).rejects.toThrow("Invalid id");
    });

    it("updateStage non-integer id → throws", async () => {
      mockUser(adminA);
      await expect(updateStage(1.5, { name: "x" })).rejects.toThrow("Invalid id");
    });

    it("deleteStage non-integer id → throws", async () => {
      mockUser(adminA);
      await expect(deleteStage(1.5)).rejects.toThrow("Invalid id");
    });

    it("updateWorkflowInstance non-integer id → throws", async () => {
      mockUser(adminA);
      await expect(updateWorkflowInstance(1.5, { name: "x" })).rejects.toThrow("Invalid id");
    });

    it("updateWorkflowInstanceStage non-integer instanceId → throws", async () => {
      mockUser(adminA);
      await expect(updateWorkflowInstanceStage(1.5, 1, true)).rejects.toThrow("Invalid instanceId");
    });

    it("resetWorkflowInstance non-integer instanceId → throws", async () => {
      mockUser(adminA);
      await expect(resetWorkflowInstance(1.5)).rejects.toThrow("Invalid instanceId");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 7. Full lifecycle flow
  // ═══════════════════════════════════════════════════════════════════════

  describe("Full lifecycle flow", () => {
    it("create → stages → instance → advance → complete → reset → delete", async () => {
      // 1. Create workflow
      mockUser(adminA);
      const wf = await createWorkflow({ name: "Client Onboarding Pipeline", color: "green" });
      expect(wf).toBeDefined();

      // 2. Create stages
      mockUser(adminA);
      const s1 = await createStage(wf!.id, { name: "Initial Contact" });
      mockUser(adminA);
      const s2 = await createStage(wf!.id, { name: "Document Review" });
      mockUser(adminA);
      const s3 = await createStage(wf!.id, { name: "Final Approval" });

      // 3. Create instance
      mockUser(adminA);
      const inst = await createWorkflowInstance({
        workflowId: wf!.id,
        name: "Acme Corporation Onboarding",
        assigneeId: assigneeA.id,
      });
      expect(inst!.currentStageId).toBe(s1!.id);
      expect(inst!.status).toBe("active");
      expect(inst!.completedStages).toEqual([]);

      // 4. Advance through stages
      mockUser(adminA);
      await updateWorkflowInstanceStage(inst!.id, s1!.id, true);
      let db = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
      expect(db!.currentStageId).toBe(s2!.id);
      expect((db!.completedStages as number[])).toContain(s1!.id);

      mockUser(adminA);
      await updateWorkflowInstanceStage(inst!.id, s2!.id, true);
      db = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
      expect(db!.currentStageId).toBe(s3!.id);

      mockUser(adminA);
      await updateWorkflowInstanceStage(inst!.id, s3!.id, true);

      // 5. Verify completion
      db = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
      expect(db!.status).toBe("completed");
      expect(db!.currentStageId).toBeNull();
      expect((db!.completedStages as number[])).toEqual([s1!.id, s2!.id, s3!.id]);

      // 6. Reset
      mockUser(adminA);
      await resetWorkflowInstance(inst!.id);

      db = await prisma.workflowInstance.findUnique({ where: { id: inst!.id } });
      expect(db!.status).toBe("active");
      expect(db!.currentStageId).toBe(s1!.id);
      expect(db!.completedStages).toEqual([]);

      // 7. Delete workflow (cascades everything)
      mockUser(adminA);
      await deleteWorkflow(wf!.id);

      expect(await prisma.workflow.findUnique({ where: { id: wf!.id } })).toBeNull();
      expect(await prisma.workflowStage.findMany({ where: { workflowId: wf!.id } })).toEqual([]);
      expect(await prisma.workflowInstance.findMany({ where: { workflowId: wf!.id } })).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 8. Error sanitization
  // ═══════════════════════════════════════════════════════════════════════

  describe("Error sanitization", () => {
    it("P2025 (record not found) → Not found (never leaks Prisma error code)", async () => {
      try {
        mockUser(adminA);
        await updateWorkflow(999999, { name: "Ghost" });
        expect.unreachable("updateWorkflow should have thrown");
      } catch (e: any) {
        expect(e.message).toBe("Not found");
        expect(e.message).not.toContain("P2025");
      }
    });

    it("non-existent instance delete → Not found", async () => {
      mockUser(adminA);
      await expect(deleteWorkflowInstance(999999)).rejects.toThrow("Not found");
    });

    it("non-existent instance update → Not found", async () => {
      mockUser(adminA);
      await expect(updateWorkflowInstance(999999, { name: "Ghost" })).rejects.toThrow("Not found");
    });

    it("sanitizeError default path → An unexpected error occurred (no Prisma leak)", () => {
      expect(() => sanitizeError({ code: "P9999", message: "Some internal Prisma error" })).toThrow(
        "An unexpected error occurred",
      );
      try {
        sanitizeError({ code: "P9999", message: "Internal details" });
        expect.unreachable("sanitizeError should always throw");
      } catch (e: any) {
        expect(e.message).toBe("An unexpected error occurred");
        expect(e.message).not.toContain("P9999");
        expect(e.message).not.toContain("Internal details");
      }
    });
  });
});
