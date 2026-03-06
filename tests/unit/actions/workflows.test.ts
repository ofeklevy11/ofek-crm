import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (before imports) ──────────────────────────────────────────────

vi.mock("@/lib/permissions-server", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/permissions", () => ({
  hasUserFlag: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkActionRateLimit: vi.fn(),
  RATE_LIMITS: {
    workflowRead: { prefix: "wf-read", max: 60, windowSeconds: 60 },
    workflowMutation: { prefix: "wf-mut", max: 30, windowSeconds: 60 },
  },
}));

const mockTx = {
  workflow: {
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  workflowStage: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  workflowInstance: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  $executeRaw: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflow: { findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    workflowStage: { findMany: vi.fn() },
    workflowInstance: { update: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn((fn: any) => fn(mockTx)),
  },
}));
vi.mock("@/lib/db-retry", () => ({
  withRetry: vi.fn((fn: any) => fn()),
}));
vi.mock("@/lib/company-validation", () => ({
  validateUserInCompany: vi.fn(),
}));
vi.mock("@/lib/security/audit-security", () => ({
  logSecurityEvent: vi.fn(),
  SEC_WORKFLOW_DELETED: "SEC_WORKFLOW_DELETED",
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ── Imports (after mocks) ───────────────────────────────────────────────

import {
  getWorkflows,
  getWorkflowStagesDetails,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  createStage,
  updateStage,
  deleteStage,
  reorderStages,
  updateWorkflowInstance,
  deleteWorkflowInstance,
} from "@/app/actions/workflows";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { checkActionRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { validateUserInCompany } from "@/lib/company-validation";
import { logSecurityEvent } from "@/lib/security/audit-security";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

// ── Fixtures ────────────────────────────────────────────────────────────

const adminUser = {
  id: 1,
  companyId: 100,
  name: "Admin",
  email: "admin@test.com",
  role: "admin" as const,
  permissions: {} as Record<string, boolean>,
};

// ── Setup ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: authorized admin user
  vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
  vi.mocked(hasUserFlag).mockReturnValue(true);
  vi.mocked(checkActionRateLimit).mockResolvedValue(false);
  vi.mocked(validateUserInCompany).mockResolvedValue(true);
  vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(mockTx));
});

// ═══════════════════════════════════════════════════════════════════════
// getWorkflows
// ═══════════════════════════════════════════════════════════════════════

describe("getWorkflows", () => {
  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(getWorkflows()).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when user lacks canViewWorkflows", async () => {
    vi.mocked(hasUserFlag).mockReturnValue(false);
    await expect(getWorkflows()).rejects.toThrow("Forbidden");
  });

  it("throws Rate limit exceeded when rate limited", async () => {
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    await expect(getWorkflows()).rejects.toThrow("Rate limit exceeded");
  });

  it("proceeds when checkActionRateLimit throws (fail-open)", async () => {
    vi.mocked(checkActionRateLimit).mockRejectedValue(new Error("Redis down"));
    vi.mocked(prisma.workflow.findMany).mockResolvedValue([]);
    const result = await getWorkflows();
    expect(result).toEqual([]);
  });

  it("passes workflowRead rate limit key", async () => {
    vi.mocked(prisma.workflow.findMany).mockResolvedValue([]);
    await getWorkflows();
    expect(checkActionRateLimit).toHaveBeenCalledWith(
      String(adminUser.id),
      expect.objectContaining({ prefix: "wf-read" }),
    );
  });

  it("throws Invalid cursor for non-integer cursor", async () => {
    await expect(getWorkflows(1.5)).rejects.toThrow("Invalid cursor");
  });

  it("throws Invalid cursor for cursor <= 0", async () => {
    await expect(getWorkflows(0)).rejects.toThrow("Invalid cursor");
    await expect(getWorkflows(-1)).rejects.toThrow("Invalid cursor");
  });

  it("returns workflows without cursor", async () => {
    const workflows = [{ id: 1, name: "WF1" }];
    vi.mocked(prisma.workflow.findMany).mockResolvedValue(workflows as any);
    const result = await getWorkflows();
    expect(result).toEqual(workflows);
    expect(prisma.workflow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 100 },
        take: 200,
      }),
    );
  });

  it("returns workflows with cursor pagination", async () => {
    vi.mocked(prisma.workflow.findMany).mockResolvedValue([]);
    await getWorkflows(5);
    expect(prisma.workflow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 1,
        cursor: { id: 5 },
      }),
    );
  });

  it("queries with correct select fields and orderBy", async () => {
    vi.mocked(prisma.workflow.findMany).mockResolvedValue([]);
    await getWorkflows();
    expect(prisma.workflow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          id: true,
          name: true,
          description: true,
          color: true,
          icon: true,
          createdAt: true,
          updatedAt: true,
          stages: expect.objectContaining({
            select: expect.objectContaining({
              id: true,
              workflowId: true,
              name: true,
              description: true,
              color: true,
              icon: true,
              order: true,
              createdAt: true,
              updatedAt: true,
            }),
            orderBy: { order: "asc" },
          }),
        }),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 200,
        where: expect.objectContaining({ companyId: expect.any(Number) }),
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getWorkflowStagesDetails
// ═══════════════════════════════════════════════════════════════════════

describe("getWorkflowStagesDetails", () => {
  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(getWorkflowStagesDetails(1)).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when lacking flag", async () => {
    vi.mocked(hasUserFlag).mockReturnValue(false);
    await expect(getWorkflowStagesDetails(1)).rejects.toThrow("Forbidden");
  });

  it("throws Invalid workflowId for non-integer", async () => {
    await expect(getWorkflowStagesDetails(1.5)).rejects.toThrow("Invalid workflowId");
  });

  it("throws Invalid workflowId for value <= 0", async () => {
    await expect(getWorkflowStagesDetails(0)).rejects.toThrow("Invalid workflowId");
    await expect(getWorkflowStagesDetails(-1)).rejects.toThrow("Invalid workflowId");
  });

  it("returns stage details scoped to user company", async () => {
    const stages = [{ id: 10, details: {} }];
    vi.mocked(prisma.workflowStage.findMany).mockResolvedValue(stages as any);
    const result = await getWorkflowStagesDetails(1);
    expect(result).toEqual(stages);
    expect(prisma.workflowStage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workflowId: 1, workflow: { companyId: 100 } },
      }),
    );
  });

  it("queries with select { id, details } and orderBy { order: asc }", async () => {
    vi.mocked(prisma.workflowStage.findMany).mockResolvedValue([]);
    await getWorkflowStagesDetails(1);
    expect(prisma.workflowStage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, details: true },
        orderBy: { order: "asc" },
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// createWorkflow
// ═══════════════════════════════════════════════════════════════════════

describe("createWorkflow", () => {
  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(createWorkflow({ name: "W" })).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when lacking flag", async () => {
    vi.mocked(hasUserFlag).mockReturnValue(false);
    await expect(createWorkflow({ name: "W" })).rejects.toThrow("Forbidden");
  });

  it("throws Rate limit exceeded when rate limited", async () => {
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    await expect(createWorkflow({ name: "W" })).rejects.toThrow("Rate limit exceeded");
  });

  it("passes workflowMutation rate limit key", async () => {
    mockTx.workflow.count.mockResolvedValue(0);
    mockTx.workflow.create.mockResolvedValue({ id: 1 });

    await createWorkflow({ name: "W" });
    expect(checkActionRateLimit).toHaveBeenCalledWith(
      String(adminUser.id),
      expect.objectContaining({ prefix: "wf-mut" }),
    );
  });

  it("throws ZodError for empty name", async () => {
    await expect(createWorkflow({ name: "" })).rejects.toThrow(ZodError);
  });

  it("throws ZodError for name exceeding max length", async () => {
    await expect(createWorkflow({ name: "x".repeat(201) })).rejects.toThrow(ZodError);
  });

  it("throws resource cap error at 100 workflows", async () => {
    mockTx.workflow.count.mockResolvedValue(100);
    await expect(createWorkflow({ name: "W" })).rejects.toThrow(
      "Maximum of 100 workflows reached",
    );
  });

  it("creates workflow with correct data and revalidates", async () => {
    mockTx.workflow.count.mockResolvedValue(5);
    const created = { id: 1, name: "W", description: null, color: null, icon: null };
    mockTx.workflow.create.mockResolvedValue(created);

    const result = await createWorkflow({ name: "W" });
    expect(result).toEqual(created);
    expect(mockTx.workflow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 100, name: "W" }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/workflows");
  });

  it("passes optional fields through Zod to create", async () => {
    mockTx.workflow.count.mockResolvedValue(0);
    mockTx.workflow.create.mockResolvedValue({ id: 1 });

    await createWorkflow({ name: "W", description: "desc", color: "#fff", icon: "star" });
    expect(mockTx.workflow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: "desc",
          color: "#fff",
          icon: "star",
        }),
      }),
    );
  });

  it("sanitizeError maps P2025 to Not found", async () => {
    mockTx.workflow.count.mockResolvedValue(0);
    mockTx.workflow.create.mockRejectedValue({ code: "P2025" });
    await expect(createWorkflow({ name: "W" })).rejects.toThrow("Not found");
  });

  it("sanitizeError maps P2002 to Duplicate entry", async () => {
    mockTx.workflow.count.mockResolvedValue(0);
    mockTx.workflow.create.mockRejectedValue({ code: "P2002" });
    await expect(createWorkflow({ name: "W" })).rejects.toThrow("Duplicate entry");
  });

  it("sanitizeError maps unknown error to generic message", async () => {
    mockTx.workflow.count.mockResolvedValue(0);
    mockTx.workflow.create.mockRejectedValue(new Error("DB"));
    await expect(createWorkflow({ name: "W" })).rejects.toThrow(
      "An unexpected error occurred",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// updateWorkflow
// ═══════════════════════════════════════════════════════════════════════

describe("updateWorkflow", () => {
  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(updateWorkflow(1, { name: "X" })).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when lacking flag", async () => {
    vi.mocked(hasUserFlag).mockReturnValue(false);
    await expect(updateWorkflow(1, { name: "X" })).rejects.toThrow("Forbidden");
  });

  it("throws Invalid id for non-integer", async () => {
    await expect(updateWorkflow(1.5, { name: "X" })).rejects.toThrow("Invalid id");
  });

  it("throws Invalid id for id <= 0", async () => {
    await expect(updateWorkflow(0, { name: "X" })).rejects.toThrow("Invalid id");
  });

  it("throws ZodError for empty name", async () => {
    await expect(updateWorkflow(1, { name: "" })).rejects.toThrow(ZodError);
  });

  it("updates workflow and revalidates", async () => {
    const updated = { id: 1, name: "Updated" };
    vi.mocked(prisma.workflow.update).mockResolvedValue(updated as any);

    const result = await updateWorkflow(1, { name: "Updated" });
    expect(result).toEqual(updated);
    expect(prisma.workflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, companyId: 100 },
        data: { name: "Updated" },
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/workflows");
  });

  it("sanitizeError maps P2025 to Not found", async () => {
    vi.mocked(prisma.workflow.update).mockRejectedValue({ code: "P2025" });
    await expect(updateWorkflow(1, { name: "X" })).rejects.toThrow("Not found");
  });

  it("sanitizeError maps P2002 to Duplicate entry", async () => {
    vi.mocked(prisma.workflow.update).mockRejectedValue({ code: "P2002" });
    await expect(updateWorkflow(1, { name: "X" })).rejects.toThrow("Duplicate entry");
  });

  it("sanitizeError maps unknown error to generic message", async () => {
    vi.mocked(prisma.workflow.update).mockRejectedValue(new Error("DB"));
    await expect(updateWorkflow(1, { name: "X" })).rejects.toThrow(
      "An unexpected error occurred",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// deleteWorkflow
// ═══════════════════════════════════════════════════════════════════════

describe("deleteWorkflow", () => {
  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(deleteWorkflow(1)).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when lacking flag", async () => {
    vi.mocked(hasUserFlag).mockReturnValue(false);
    await expect(deleteWorkflow(1)).rejects.toThrow("Forbidden");
  });

  it("throws Invalid id for non-integer", async () => {
    await expect(deleteWorkflow(1.5)).rejects.toThrow("Invalid id");
  });

  it("throws Invalid id for id <= 0", async () => {
    await expect(deleteWorkflow(0)).rejects.toThrow("Invalid id");
  });

  it("deletes workflow scoped to company and revalidates", async () => {
    vi.mocked(prisma.workflow.delete).mockResolvedValue({} as any);
    await deleteWorkflow(1);
    expect(prisma.workflow.delete).toHaveBeenCalledWith({
      where: { id: 1, companyId: 100 },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/workflows");
  });

  it("calls logSecurityEvent with correct params", async () => {
    vi.mocked(prisma.workflow.delete).mockResolvedValue({} as any);
    await deleteWorkflow(42);
    expect(logSecurityEvent).toHaveBeenCalledWith({
      action: "SEC_WORKFLOW_DELETED",
      companyId: 100,
      userId: 1,
      details: { workflowId: 42 },
    });
  });

  it("does not call logSecurityEvent when delete fails", async () => {
    vi.mocked(prisma.workflow.delete).mockRejectedValue({ code: "P2025" });
    await expect(deleteWorkflow(1)).rejects.toThrow("Not found");
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });

  it("sanitizeError maps P2025 to Not found", async () => {
    vi.mocked(prisma.workflow.delete).mockRejectedValue({ code: "P2025" });
    await expect(deleteWorkflow(1)).rejects.toThrow("Not found");
  });

  it("sanitizeError maps unknown error to generic message", async () => {
    vi.mocked(prisma.workflow.delete).mockRejectedValue(new Error("DB"));
    await expect(deleteWorkflow(1)).rejects.toThrow("An unexpected error occurred");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// createStage
// ═══════════════════════════════════════════════════════════════════════

describe("createStage", () => {
  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(createStage(1, { name: "S" })).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when lacking flag", async () => {
    vi.mocked(hasUserFlag).mockReturnValue(false);
    await expect(createStage(1, { name: "S" })).rejects.toThrow("Forbidden");
  });

  it("throws Invalid workflowId for non-integer", async () => {
    await expect(createStage(1.5, { name: "S" })).rejects.toThrow("Invalid workflowId");
  });

  it("throws Invalid workflowId for value <= 0", async () => {
    await expect(createStage(0, { name: "S" })).rejects.toThrow("Invalid workflowId");
  });

  it("throws ZodError for empty name", async () => {
    await expect(createStage(1, { name: "" })).rejects.toThrow(ZodError);
  });

  it("throws ZodError when details contains __proto__ key", async () => {
    // Use JSON.parse to create an object with a literal __proto__ own property
    // (object literal syntax sets the prototype instead of creating an own key)
    const malicious = JSON.parse('{"__proto__": {}}');
    await expect(
      createStage(1, { name: "S", details: malicious }),
    ).rejects.toThrow(ZodError);
  });

  it("throws ZodError when details contains constructor key", async () => {
    const malicious = JSON.parse('{"constructor": {"prototype": {}}}');
    await expect(
      createStage(1, { name: "S", details: malicious }),
    ).rejects.toThrow(ZodError);
  });

  it("throws ZodError when details exceeds 64KB", async () => {
    const huge = { data: "x".repeat(65_000) };
    await expect(
      createStage(1, { name: "S", details: huge }),
    ).rejects.toThrow(ZodError);
  });

  it("throws ZodError when details nesting exceeds depth 10", async () => {
    let nested: any = { val: true };
    for (let i = 0; i < 12; i++) nested = { child: nested };
    await expect(
      createStage(1, { name: "S", details: nested }),
    ).rejects.toThrow(ZodError);
  });

  it("throws Workflow not found when workflow does not exist", async () => {
    mockTx.workflow.findFirst.mockResolvedValue(null);
    await expect(createStage(1, { name: "S" })).rejects.toThrow("Workflow not found");
  });

  it("throws resource cap error at 50 stages", async () => {
    mockTx.workflow.findFirst.mockResolvedValue({
      id: 1,
      stages: [{ order: 49 }],
      _count: { stages: 50 },
    });
    await expect(createStage(1, { name: "S" })).rejects.toThrow(
      "Maximum of 50 stages per workflow reached",
    );
  });

  it("calculates order from highest existing stage", async () => {
    mockTx.workflow.findFirst.mockResolvedValue({
      id: 1,
      stages: [{ order: 5 }],
      _count: { stages: 3 },
    });
    mockTx.workflowStage.create.mockResolvedValue({ id: 10 });

    await createStage(1, { name: "S" });
    expect(mockTx.workflowStage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ order: 6 }),
      }),
    );
  });

  it("calculates order as 0 when no existing stages", async () => {
    mockTx.workflow.findFirst.mockResolvedValue({
      id: 1,
      stages: [],
      _count: { stages: 0 },
    });
    mockTx.workflowStage.create.mockResolvedValue({ id: 10 });

    await createStage(1, { name: "S" });
    expect(mockTx.workflowStage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ order: 0 }),
      }),
    );
  });

  it("creates stage with correct data and revalidates", async () => {
    mockTx.workflow.findFirst.mockResolvedValue({
      id: 1,
      stages: [],
      _count: { stages: 0 },
    });
    const created = { id: 10, workflowId: 1, name: "S", order: 0 };
    mockTx.workflowStage.create.mockResolvedValue(created);

    const result = await createStage(1, { name: "S", description: "desc" });
    expect(result).toEqual(created);
    expect(mockTx.workflowStage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowId: 1,
          name: "S",
          description: "desc",
        }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/workflows");
  });

  it("passes valid details through to create", async () => {
    mockTx.workflow.findFirst.mockResolvedValue({
      id: 1,
      stages: [],
      _count: { stages: 0 },
    });
    mockTx.workflowStage.create.mockResolvedValue({ id: 10 });

    await createStage(1, { name: "S", details: { systemActions: [{ type: "email" }] } });
    expect(mockTx.workflowStage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: { systemActions: [{ type: "email" }] },
        }),
      }),
    );
  });

  it("sanitizeError maps P2025 to Not found", async () => {
    mockTx.workflow.findFirst.mockResolvedValue({
      id: 1,
      stages: [],
      _count: { stages: 0 },
    });
    mockTx.workflowStage.create.mockRejectedValue({ code: "P2025" });
    await expect(createStage(1, { name: "S" })).rejects.toThrow("Not found");
  });

  it("sanitizeError maps unknown error to generic message", async () => {
    mockTx.workflow.findFirst.mockResolvedValue({
      id: 1,
      stages: [],
      _count: { stages: 0 },
    });
    mockTx.workflowStage.create.mockRejectedValue(new Error("DB"));
    await expect(createStage(1, { name: "S" })).rejects.toThrow(
      "An unexpected error occurred",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// updateStage
// ═══════════════════════════════════════════════════════════════════════

describe("updateStage", () => {
  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(updateStage(1, { name: "X" })).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when lacking flag", async () => {
    vi.mocked(hasUserFlag).mockReturnValue(false);
    await expect(updateStage(1, { name: "X" })).rejects.toThrow("Forbidden");
  });

  it("throws Invalid id for non-integer", async () => {
    await expect(updateStage(1.5, { name: "X" })).rejects.toThrow("Invalid id");
  });

  it("throws Invalid id for id <= 0", async () => {
    await expect(updateStage(0, { name: "X" })).rejects.toThrow("Invalid id");
  });

  it("throws ZodError for empty name", async () => {
    await expect(updateStage(1, { name: "" })).rejects.toThrow(ZodError);
  });

  it("throws ZodError for negative order value", async () => {
    await expect(updateStage(1, { order: -1 })).rejects.toThrow(ZodError);
  });

  it("throws when stage not found (Unauthorized or not found)", async () => {
    mockTx.workflowStage.findFirst.mockResolvedValue(null);
    await expect(updateStage(1, { name: "X" })).rejects.toThrow(
      "Unauthorized or not found",
    );
  });

  it("updates stage and revalidates", async () => {
    mockTx.workflowStage.findFirst.mockResolvedValue({ id: 10, workflowId: 1 });
    const updated = { id: 10, name: "Updated" };
    mockTx.workflowStage.update.mockResolvedValue(updated);

    const result = await updateStage(10, { name: "Updated" });
    expect(result).toEqual(updated);
    expect(mockTx.workflowStage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10, workflowId: 1 },
        data: { name: "Updated" },
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/workflows");
  });

  it("passes details and order fields to update", async () => {
    mockTx.workflowStage.findFirst.mockResolvedValue({ id: 10, workflowId: 1 });
    mockTx.workflowStage.update.mockResolvedValue({ id: 10 });

    await updateStage(10, { details: { systemActions: [] }, order: 3 });
    expect(mockTx.workflowStage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: { systemActions: [] },
          order: 3,
        }),
      }),
    );
  });

  it("sanitizeError maps P2025 to Not found", async () => {
    mockTx.workflowStage.findFirst.mockResolvedValue({ id: 10, workflowId: 1 });
    mockTx.workflowStage.update.mockRejectedValue({ code: "P2025" });
    await expect(updateStage(10, { name: "X" })).rejects.toThrow("Not found");
  });

  it("sanitizeError maps unknown error to generic message", async () => {
    mockTx.workflowStage.findFirst.mockResolvedValue({ id: 10, workflowId: 1 });
    mockTx.workflowStage.update.mockRejectedValue(new Error("DB"));
    await expect(updateStage(10, { name: "X" })).rejects.toThrow(
      "An unexpected error occurred",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// deleteStage
// ═══════════════════════════════════════════════════════════════════════

describe("deleteStage", () => {
  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(deleteStage(1)).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when lacking flag", async () => {
    vi.mocked(hasUserFlag).mockReturnValue(false);
    await expect(deleteStage(1)).rejects.toThrow("Forbidden");
  });

  it("throws Invalid id for non-integer", async () => {
    await expect(deleteStage(1.5)).rejects.toThrow("Invalid id");
  });

  it("throws Invalid id for id <= 0", async () => {
    await expect(deleteStage(0)).rejects.toThrow("Invalid id");
  });

  it("throws when stage not found", async () => {
    mockTx.workflowStage.findFirst.mockResolvedValue(null);
    await expect(deleteStage(1)).rejects.toThrow("Unauthorized or not found");
  });

  it("deletes stage and runs raw SQL cleanup", async () => {
    mockTx.workflowStage.findFirst.mockResolvedValue({ id: 10, workflowId: 1 });
    mockTx.workflowStage.delete.mockResolvedValue({});
    mockTx.$executeRaw.mockResolvedValue(0);
    mockTx.workflowInstance.findMany.mockResolvedValue([]);

    await deleteStage(10);
    expect(mockTx.workflowStage.delete).toHaveBeenCalledWith({
      where: { id: 10, workflowId: 1 },
    });
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/workflows");
  });

  it("advances stuck instances to next stage", async () => {
    mockTx.workflowStage.findFirst
      .mockResolvedValueOnce({ id: 10, workflowId: 1 }) // stage to delete
      .mockResolvedValueOnce({ id: 11 }); // next stage
    mockTx.workflowStage.delete.mockResolvedValue({});
    mockTx.$executeRaw.mockResolvedValue(0);
    mockTx.workflowInstance.findMany.mockResolvedValue([{ id: 100 }, { id: 101 }]);
    mockTx.workflowInstance.updateMany.mockResolvedValue({ count: 2 });

    await deleteStage(10);
    expect(mockTx.workflowInstance.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [100, 101] } },
      data: { currentStageId: 11, status: "active" },
    });
  });

  it("marks stuck instances as completed when no next stage", async () => {
    mockTx.workflowStage.findFirst
      .mockResolvedValueOnce({ id: 10, workflowId: 1 })
      .mockResolvedValueOnce(null); // no next stage
    mockTx.workflowStage.delete.mockResolvedValue({});
    mockTx.$executeRaw.mockResolvedValue(0);
    mockTx.workflowInstance.findMany.mockResolvedValue([{ id: 100 }]);
    mockTx.workflowInstance.updateMany.mockResolvedValue({ count: 1 });

    await deleteStage(10);
    expect(mockTx.workflowInstance.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [100] } },
      data: { currentStageId: null, status: "completed" },
    });
  });

  it("skips updateMany when no stuck instances", async () => {
    mockTx.workflowStage.findFirst.mockResolvedValue({ id: 10, workflowId: 1 });
    mockTx.workflowStage.delete.mockResolvedValue({});
    mockTx.$executeRaw.mockResolvedValue(0);
    mockTx.workflowInstance.findMany.mockResolvedValue([]);

    await deleteStage(10);
    expect(mockTx.workflowInstance.updateMany).not.toHaveBeenCalled();
  });

  it("sanitizeError maps P2025 to Not found", async () => {
    mockTx.workflowStage.findFirst.mockResolvedValue({ id: 10, workflowId: 1 });
    mockTx.workflowStage.delete.mockRejectedValue({ code: "P2025" });
    await expect(deleteStage(10)).rejects.toThrow("Not found");
  });

  it("sanitizeError maps unknown error to generic message", async () => {
    mockTx.workflowStage.findFirst.mockResolvedValue({ id: 10, workflowId: 1 });
    mockTx.workflowStage.delete.mockRejectedValue(new Error("DB"));
    await expect(deleteStage(10)).rejects.toThrow("An unexpected error occurred");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// reorderStages
// ═══════════════════════════════════════════════════════════════════════

describe("reorderStages", () => {
  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(reorderStages(1, [1, 2])).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when lacking flag", async () => {
    vi.mocked(hasUserFlag).mockReturnValue(false);
    await expect(reorderStages(1, [1, 2])).rejects.toThrow("Forbidden");
  });

  it("throws ZodError for empty orderedIds", async () => {
    await expect(reorderStages(1, [])).rejects.toThrow(ZodError);
  });

  it("throws Workflow not found when workflow missing", async () => {
    mockTx.workflow.findFirst.mockResolvedValue(null);
    await expect(reorderStages(1, [10, 11])).rejects.toThrow("Workflow not found");
  });

  it("throws when orderedIds do not match workflow stages", async () => {
    mockTx.workflow.findFirst.mockResolvedValue({
      id: 1,
      stages: [{ id: 10 }, { id: 11 }],
    });
    await expect(reorderStages(1, [10, 99])).rejects.toThrow(
      "orderedIds must include every stage in the workflow",
    );
  });

  it("throws when orderedIds has fewer IDs than workflow stages", async () => {
    mockTx.workflow.findFirst.mockResolvedValue({
      id: 1,
      stages: [{ id: 10 }, { id: 11 }, { id: 12 }],
    });
    await expect(reorderStages(1, [10, 11])).rejects.toThrow(
      "orderedIds must include every stage in the workflow",
    );
  });

  it("executes raw SQL reorder on success", async () => {
    mockTx.workflow.findFirst.mockResolvedValue({
      id: 1,
      stages: [{ id: 10 }, { id: 11 }],
    });
    mockTx.$executeRaw.mockResolvedValue(2);

    await reorderStages(1, [11, 10]);
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith("/workflows");
  });

  it("sanitizeError maps unknown error to generic message", async () => {
    mockTx.workflow.findFirst.mockResolvedValue({
      id: 1,
      stages: [{ id: 10 }],
    });
    mockTx.$executeRaw.mockRejectedValue(new Error("DB"));
    await expect(reorderStages(1, [10])).rejects.toThrow("An unexpected error occurred");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// updateWorkflowInstance
// ═══════════════════════════════════════════════════════════════════════

describe("updateWorkflowInstance", () => {
  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(updateWorkflowInstance(1, { name: "X" })).rejects.toThrow(
      "Unauthorized",
    );
  });

  it("throws Forbidden when lacking flag", async () => {
    vi.mocked(hasUserFlag).mockReturnValue(false);
    await expect(updateWorkflowInstance(1, { name: "X" })).rejects.toThrow("Forbidden");
  });

  it("throws Invalid id for non-integer", async () => {
    await expect(updateWorkflowInstance(1.5, { name: "X" })).rejects.toThrow(
      "Invalid id",
    );
  });

  it("throws Invalid id for id <= 0", async () => {
    await expect(updateWorkflowInstance(0, { name: "X" })).rejects.toThrow("Invalid id");
  });

  it("throws ZodError for empty name", async () => {
    await expect(updateWorkflowInstance(1, { name: "" })).rejects.toThrow(ZodError);
  });

  it("throws Invalid assignee when cross-company", async () => {
    vi.mocked(validateUserInCompany).mockResolvedValue(false);
    await expect(updateWorkflowInstance(1, { assigneeId: 999 })).rejects.toThrow(
      "Invalid assignee",
    );
  });

  it("skips company validation when no assigneeId", async () => {
    vi.mocked(prisma.workflowInstance.update).mockResolvedValue({} as any);
    await updateWorkflowInstance(1, { name: "X" });
    expect(validateUserInCompany).not.toHaveBeenCalled();
  });

  it("skips company validation when assigneeId is null", async () => {
    vi.mocked(prisma.workflowInstance.update).mockResolvedValue({} as any);
    await updateWorkflowInstance(1, { assigneeId: null });
    expect(validateUserInCompany).not.toHaveBeenCalled();
  });

  it("updates instance scoped to company and revalidates", async () => {
    vi.mocked(prisma.workflowInstance.update).mockResolvedValue({} as any);
    await updateWorkflowInstance(1, { name: "Updated" });
    expect(prisma.workflowInstance.update).toHaveBeenCalledWith({
      where: { id: 1, companyId: 100 },
      data: { name: "Updated" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/workflows");
  });

  it("passes valid assigneeId to update data", async () => {
    vi.mocked(prisma.workflowInstance.update).mockResolvedValue({} as any);
    await updateWorkflowInstance(1, { assigneeId: 5 });
    expect(prisma.workflowInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assigneeId: 5 }),
      }),
    );
  });

  it("sanitizeError maps P2025 to Not found", async () => {
    vi.mocked(prisma.workflowInstance.update).mockRejectedValue({ code: "P2025" });
    await expect(updateWorkflowInstance(1, { name: "X" })).rejects.toThrow("Not found");
  });

  it("sanitizeError maps unknown error to generic message", async () => {
    vi.mocked(prisma.workflowInstance.update).mockRejectedValue(new Error("DB"));
    await expect(updateWorkflowInstance(1, { name: "X" })).rejects.toThrow(
      "An unexpected error occurred",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// deleteWorkflowInstance
// ═══════════════════════════════════════════════════════════════════════

describe("deleteWorkflowInstance", () => {
  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(deleteWorkflowInstance(1)).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when lacking flag", async () => {
    vi.mocked(hasUserFlag).mockReturnValue(false);
    await expect(deleteWorkflowInstance(1)).rejects.toThrow("Forbidden");
  });

  it("throws Invalid id for non-integer", async () => {
    await expect(deleteWorkflowInstance(1.5)).rejects.toThrow("Invalid id");
  });

  it("throws Invalid id for id <= 0", async () => {
    await expect(deleteWorkflowInstance(0)).rejects.toThrow("Invalid id");
  });

  it("deletes instance scoped to company and revalidates", async () => {
    vi.mocked(prisma.workflowInstance.delete).mockResolvedValue({} as any);
    await deleteWorkflowInstance(1);
    expect(prisma.workflowInstance.delete).toHaveBeenCalledWith({
      where: { id: 1, companyId: 100 },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/workflows");
  });

  it("sanitizeError maps P2025 to Not found", async () => {
    vi.mocked(prisma.workflowInstance.delete).mockRejectedValue({ code: "P2025" });
    await expect(deleteWorkflowInstance(1)).rejects.toThrow("Not found");
  });

  it("sanitizeError maps unknown error to generic message", async () => {
    vi.mocked(prisma.workflowInstance.delete).mockRejectedValue(new Error("DB"));
    await expect(deleteWorkflowInstance(1)).rejects.toThrow(
      "An unexpected error occurred",
    );
  });
});
