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
  workflow: { findFirst: vi.fn() },
  workflowInstance: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflowInstance: { findMany: vi.fn() },
    workflowStage: { findUnique: vi.fn() },
    $transaction: vi.fn((fn: any) => fn(mockTx)),
  },
}));
vi.mock("@/lib/db-retry", () => ({
  withRetry: vi.fn((fn: any) => fn()),
}));
vi.mock("@/lib/company-validation", () => ({
  validateUserInCompany: vi.fn(),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));
vi.mock("@/lib/notifications-internal", () => ({
  createNotificationForCompany: vi.fn(),
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
  getWorkflowInstances,
  createWorkflowInstance,
  updateWorkflowInstanceStage,
  resetWorkflowInstance,
} from "@/app/actions/workflow-instances";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { checkActionRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { validateUserInCompany } from "@/lib/company-validation";
import { inngest } from "@/lib/inngest/client";
import { createNotificationForCompany } from "@/lib/notifications-internal";
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
  vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any);
  vi.mocked(hasUserFlag).mockReturnValue(true);
  vi.mocked(checkActionRateLimit).mockResolvedValue(false);
  vi.mocked(validateUserInCompany).mockResolvedValue(true);
  vi.mocked(inngest.send).mockResolvedValue(undefined as any);
  vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(mockTx));
});

// ═══════════════════════════════════════════════════════════════════════
// getWorkflowInstances
// ═══════════════════════════════════════════════════════════════════════

describe("getWorkflowInstances", () => {
  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(getWorkflowInstances()).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when lacking flag", async () => {
    vi.mocked(hasUserFlag).mockReturnValue(false);
    await expect(getWorkflowInstances()).rejects.toThrow("Forbidden");
  });

  it("throws Rate limit exceeded when rate limited", async () => {
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    await expect(getWorkflowInstances()).rejects.toThrow("Rate limit exceeded");
  });

  it("proceeds when rate limit check throws (fail-open)", async () => {
    vi.mocked(checkActionRateLimit).mockRejectedValue(new Error("Redis down"));
    vi.mocked(prisma.workflowInstance.findMany).mockResolvedValue([]);
    const result = await getWorkflowInstances();
    expect(result).toEqual([]);
  });

  it("throws ZodError for invalid status string", async () => {
    await expect(getWorkflowInstances("invalid")).rejects.toThrow(ZodError);
  });

  it("succeeds with status active", async () => {
    vi.mocked(prisma.workflowInstance.findMany).mockResolvedValue([]);
    await getWorkflowInstances("active");
    expect(prisma.workflowInstance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 100, status: "active" }),
      }),
    );
  });

  it("succeeds with status completed", async () => {
    vi.mocked(prisma.workflowInstance.findMany).mockResolvedValue([]);
    await getWorkflowInstances("completed");
    expect(prisma.workflowInstance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "completed" }),
      }),
    );
  });

  it("succeeds with undefined status (no status filter)", async () => {
    vi.mocked(prisma.workflowInstance.findMany).mockResolvedValue([]);
    await getWorkflowInstances();
    expect(prisma.workflowInstance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 100 },
      }),
    );
  });

  it("throws Invalid workflowId for non-integer in opts", async () => {
    await expect(getWorkflowInstances(undefined, { workflowId: 1.5 })).rejects.toThrow(
      "Invalid workflowId",
    );
  });

  it("throws Invalid workflowId for value <= 0 in opts", async () => {
    await expect(getWorkflowInstances(undefined, { workflowId: 0 })).rejects.toThrow(
      "Invalid workflowId",
    );
  });

  it("throws Invalid cursor for non-integer in opts", async () => {
    await expect(getWorkflowInstances(undefined, { cursor: 1.5 })).rejects.toThrow(
      "Invalid cursor",
    );
  });

  it("throws Invalid cursor for value <= 0 in opts", async () => {
    await expect(getWorkflowInstances(undefined, { cursor: 0 })).rejects.toThrow(
      "Invalid cursor",
    );
  });

  it("returns instances with workflowId filter", async () => {
    const instances = [{ id: 1 }];
    vi.mocked(prisma.workflowInstance.findMany).mockResolvedValue(instances as any);
    const result = await getWorkflowInstances("active", { workflowId: 5 });
    expect(result).toEqual(instances);
    expect(prisma.workflowInstance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workflowId: 5 }),
      }),
    );
  });

  it("returns instances with cursor pagination", async () => {
    vi.mocked(prisma.workflowInstance.findMany).mockResolvedValue([]);
    await getWorkflowInstances(undefined, { cursor: 10 });
    expect(prisma.workflowInstance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 1, cursor: { id: 10 } }),
    );
  });

  it("queries with correct select fields and orderBy", async () => {
    vi.mocked(prisma.workflowInstance.findMany).mockResolvedValue([]);
    await getWorkflowInstances();
    expect(prisma.workflowInstance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          id: true,
          workflowId: true,
          name: true,
          status: true,
          currentStageId: true,
          completedStages: true,
          creatorId: true,
          assigneeId: true,
          createdAt: true,
          updatedAt: true,
          assignee: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true } },
        }),
        orderBy: { updatedAt: "desc" },
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// createWorkflowInstance
// ═══════════════════════════════════════════════════════════════════════

describe("createWorkflowInstance", () => {
  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(
      createWorkflowInstance({ workflowId: 1, name: "I" }),
    ).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when lacking flag", async () => {
    vi.mocked(hasUserFlag).mockReturnValue(false);
    await expect(
      createWorkflowInstance({ workflowId: 1, name: "I" }),
    ).rejects.toThrow("Forbidden");
  });

  it("throws Rate limit exceeded when rate limited", async () => {
    vi.mocked(checkActionRateLimit).mockResolvedValue(true);
    await expect(
      createWorkflowInstance({ workflowId: 1, name: "I" }),
    ).rejects.toThrow("Rate limit exceeded");
  });

  it("throws ZodError for empty name", async () => {
    await expect(
      createWorkflowInstance({ workflowId: 1, name: "" }),
    ).rejects.toThrow(ZodError);
  });

  it("throws ZodError for invalid workflowId", async () => {
    await expect(
      createWorkflowInstance({ workflowId: -1, name: "I" }),
    ).rejects.toThrow(ZodError);
  });

  it("throws Invalid assignee for cross-company assignee", async () => {
    vi.mocked(validateUserInCompany).mockResolvedValue(false);
    await expect(
      createWorkflowInstance({ workflowId: 1, name: "I", assigneeId: 999 }),
    ).rejects.toThrow("Invalid assignee");
  });

  it("skips company validation when no assigneeId", async () => {
    mockTx.workflow.findFirst.mockResolvedValue({
      id: 1,
      stages: [],
      _count: { instances: 0 },
    });
    mockTx.workflowInstance.create.mockResolvedValue({ id: 1 });

    await createWorkflowInstance({ workflowId: 1, name: "I" });
    expect(validateUserInCompany).not.toHaveBeenCalled();
  });

  it("throws when workflow not found", async () => {
    mockTx.workflow.findFirst.mockResolvedValue(null);
    await expect(
      createWorkflowInstance({ workflowId: 1, name: "I" }),
    ).rejects.toThrow("Workflow not found or access denied");
  });

  it("throws resource cap error at 500 instances", async () => {
    mockTx.workflow.findFirst.mockResolvedValue({
      id: 1,
      stages: [{ id: 10 }],
      _count: { instances: 500 },
    });
    await expect(
      createWorkflowInstance({ workflowId: 1, name: "I" }),
    ).rejects.toThrow("Maximum of 500 instances per workflow reached");
  });

  it("assigns first stage as currentStageId", async () => {
    mockTx.workflow.findFirst.mockResolvedValue({
      id: 1,
      stages: [{ id: 10 }],
      _count: { instances: 0 },
    });
    mockTx.workflowInstance.create.mockResolvedValue({ id: 1 });

    await createWorkflowInstance({ workflowId: 1, name: "I" });
    expect(mockTx.workflowInstance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentStageId: 10 }),
      }),
    );
  });

  it("passes assigneeId to create data when provided", async () => {
    mockTx.workflow.findFirst.mockResolvedValue({
      id: 1,
      stages: [{ id: 10 }],
      _count: { instances: 0 },
    });
    mockTx.workflowInstance.create.mockResolvedValue({ id: 1 });

    await createWorkflowInstance({ workflowId: 1, name: "I", assigneeId: 5 });
    expect(mockTx.workflowInstance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assigneeId: 5 }),
      }),
    );
  });

  it("sets currentStageId to null when no stages", async () => {
    mockTx.workflow.findFirst.mockResolvedValue({
      id: 1,
      stages: [],
      _count: { instances: 0 },
    });
    mockTx.workflowInstance.create.mockResolvedValue({ id: 1 });

    await createWorkflowInstance({ workflowId: 1, name: "I" });
    expect(mockTx.workflowInstance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentStageId: null }),
      }),
    );
  });

  it("creates instance with correct data and revalidates", async () => {
    mockTx.workflow.findFirst.mockResolvedValue({
      id: 1,
      stages: [{ id: 10 }],
      _count: { instances: 0 },
    });
    const created = { id: 1, name: "I", status: "active" };
    mockTx.workflowInstance.create.mockResolvedValue(created);

    const result = await createWorkflowInstance({ workflowId: 1, name: "I" });
    expect(result).toEqual(created);
    expect(mockTx.workflowInstance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 100,
          workflowId: 1,
          name: "I",
          creatorId: 1,
          status: "active",
          completedStages: [],
        }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/workflows");
  });

  it("sanitizeError maps P2025 to Not found", async () => {
    mockTx.workflow.findFirst.mockResolvedValue({
      id: 1,
      stages: [],
      _count: { instances: 0 },
    });
    mockTx.workflowInstance.create.mockRejectedValue({ code: "P2025" });
    await expect(
      createWorkflowInstance({ workflowId: 1, name: "I" }),
    ).rejects.toThrow("Not found");
  });

  it("sanitizeError maps unknown error to generic message", async () => {
    mockTx.workflow.findFirst.mockResolvedValue({
      id: 1,
      stages: [],
      _count: { instances: 0 },
    });
    mockTx.workflowInstance.create.mockRejectedValue(new Error("DB"));
    await expect(
      createWorkflowInstance({ workflowId: 1, name: "I" }),
    ).rejects.toThrow("An unexpected error occurred");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// updateWorkflowInstanceStage
// ═══════════════════════════════════════════════════════════════════════

describe("updateWorkflowInstanceStage", () => {
  const mockInstance = {
    id: 1,
    name: "Test Instance",
    completedStages: [] as number[],
    workflow: {
      stages: [
        { id: 10, name: "Stage 1", order: 0 },
        { id: 11, name: "Stage 2", order: 1 },
        { id: 12, name: "Stage 3", order: 2 },
      ],
    },
  };

  beforeEach(() => {
    // Deep clone to prevent mutation across tests
    mockTx.workflowInstance.findFirst.mockResolvedValue(
      JSON.parse(JSON.stringify(mockInstance)),
    );
    mockTx.workflowInstance.update.mockResolvedValue({});
  });

  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(updateWorkflowInstanceStage(1, 10, true)).rejects.toThrow(
      "Unauthorized",
    );
  });

  it("throws Forbidden when lacking flag", async () => {
    vi.mocked(hasUserFlag).mockReturnValue(false);
    await expect(updateWorkflowInstanceStage(1, 10, true)).rejects.toThrow("Forbidden");
  });

  it("throws Invalid instanceId for non-integer", async () => {
    await expect(updateWorkflowInstanceStage(1.5, 10, true)).rejects.toThrow(
      "Invalid instanceId",
    );
  });

  it("throws Invalid instanceId for value <= 0", async () => {
    await expect(updateWorkflowInstanceStage(0, 10, true)).rejects.toThrow(
      "Invalid instanceId",
    );
  });

  it("throws Invalid stageId for non-integer", async () => {
    await expect(updateWorkflowInstanceStage(1, 10.5, true)).rejects.toThrow(
      "Invalid stageId",
    );
  });

  it("throws Invalid stageId for value <= 0", async () => {
    await expect(updateWorkflowInstanceStage(1, 0, true)).rejects.toThrow(
      "Invalid stageId",
    );
  });

  it("throws Invalid completed flag for non-boolean", async () => {
    await expect(
      updateWorkflowInstanceStage(1, 10, "yes" as any),
    ).rejects.toThrow("Invalid completed flag");
  });

  it("throws when instance not found", async () => {
    mockTx.workflowInstance.findFirst.mockResolvedValue(null);
    await expect(updateWorkflowInstanceStage(1, 10, true)).rejects.toThrow(
      "Instance not found or access denied",
    );
  });

  it("throws when stage does not belong to this workflow", async () => {
    await expect(updateWorkflowInstanceStage(1, 999, true)).rejects.toThrow(
      "Stage does not belong to this workflow",
    );
  });

  // ── completed = true ────────────────────────────────────────────────

  it("completed=true: adds stageId to completedStages and advances to next stage", async () => {
    // No existing stage details for simplicity (no automation triggered)
    vi.mocked(prisma.workflowStage.findUnique).mockResolvedValue(
      { id: 10, name: "Stage 1", details: null } as any,
    );

    await updateWorkflowInstanceStage(1, 10, true);

    expect(mockTx.workflowInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          completedStages: [10],
          currentStageId: 11,
          status: "active",
        }),
      }),
    );
  });

  it("completed=true: advances to next stage when completing middle stage", async () => {
    vi.mocked(prisma.workflowStage.findUnique).mockResolvedValue(
      { id: 11, name: "Stage 2", details: null } as any,
    );

    await updateWorkflowInstanceStage(1, 11, true);

    expect(mockTx.workflowInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          completedStages: [11],
          currentStageId: 12,
          status: "active",
        }),
      }),
    );
  });

  it("completed=true: marks completed when completing last stage", async () => {
    vi.mocked(prisma.workflowStage.findUnique).mockResolvedValue(
      { id: 12, name: "Stage 3", details: null } as any,
    );

    await updateWorkflowInstanceStage(1, 12, true);

    expect(mockTx.workflowInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          completedStages: [12],
          currentStageId: null,
          status: "completed",
        }),
      }),
    );
  });

  it("completed=true: does not duplicate stageId already in completedStages", async () => {
    mockTx.workflowInstance.findFirst.mockResolvedValue({
      ...JSON.parse(JSON.stringify(mockInstance)),
      completedStages: [10],
    });
    vi.mocked(prisma.workflowStage.findUnique).mockResolvedValue(
      { id: 10, name: "Stage 1", details: null } as any,
    );

    await updateWorkflowInstanceStage(1, 10, true);

    expect(mockTx.workflowInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          completedStages: [10], // not [10, 10]
        }),
      }),
    );
  });

  it("completed=true: sends inngest event when stage has systemActions", async () => {
    vi.mocked(prisma.workflowStage.findUnique).mockResolvedValue({
      id: 10,
      name: "Stage 1",
      details: { systemActions: [{ type: "notify" }] },
    } as any);

    await updateWorkflowInstanceStage(1, 10, true);

    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "workflow/execute-stage-automations",
        data: expect.objectContaining({
          stageDetails: { systemActions: [{ type: "notify" }] },
          stageName: "Stage 1",
          instanceName: "Test Instance",
          stageId: 10,
          instanceId: 1,
          companyId: 100,
          userId: 1,
        }),
      }),
    );
  });

  it("completed=true: skips inngest when no systemActions", async () => {
    vi.mocked(prisma.workflowStage.findUnique).mockResolvedValue({
      id: 10,
      name: "Stage 1",
      details: { systemActions: [] },
    } as any);

    await updateWorkflowInstanceStage(1, 10, true);
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("completed=true: skips inngest when details is null", async () => {
    vi.mocked(prisma.workflowStage.findUnique).mockResolvedValue({
      id: 10,
      name: "Stage 1",
      details: null,
    } as any);

    await updateWorkflowInstanceStage(1, 10, true);
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("completed=true: skips inngest when findUnique returns null (stage deleted after tx)", async () => {
    vi.mocked(prisma.workflowStage.findUnique).mockResolvedValue(null);

    await updateWorkflowInstanceStage(1, 10, true);
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("completed=true: skips inngest when details has no systemActions key", async () => {
    vi.mocked(prisma.workflowStage.findUnique).mockResolvedValue({
      id: 10,
      name: "Stage 1",
      details: { custom: true },
    } as any);

    await updateWorkflowInstanceStage(1, 10, true);
    expect(inngest.send).not.toHaveBeenCalled();
  });

  // ── completed = false ───────────────────────────────────────────────

  it("completed=false: removes stageId from completedStages", async () => {
    mockTx.workflowInstance.findFirst.mockResolvedValue({
      ...JSON.parse(JSON.stringify(mockInstance)),
      completedStages: [10, 11],
    });

    await updateWorkflowInstanceStage(1, 10, false);

    expect(mockTx.workflowInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          completedStages: [11],
          currentStageId: 10,
          status: "active",
        }),
      }),
    );
  });

  it("completed=false: sets currentStageId to the unchecked stage", async () => {
    await updateWorkflowInstanceStage(1, 11, false);

    expect(mockTx.workflowInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentStageId: 11 }),
      }),
    );
  });

  it("completed=false: does not trigger automation", async () => {
    await updateWorkflowInstanceStage(1, 10, false);
    expect(inngest.send).not.toHaveBeenCalled();
    expect(createNotificationForCompany).not.toHaveBeenCalled();
  });

  it("completed=false: revalidates path", async () => {
    await updateWorkflowInstanceStage(1, 10, false);
    expect(revalidatePath).toHaveBeenCalledWith("/workflows");
  });

  // ── Inngest fallback ───────────────────────────────────────────────

  it("falls back to createNotificationForCompany when inngest fails", async () => {
    vi.mocked(prisma.workflowStage.findUnique).mockResolvedValue({
      id: 10,
      name: "Stage 1",
      details: { systemActions: [{ type: "notify" }] },
    } as any);
    vi.mocked(inngest.send).mockRejectedValue(new Error("Inngest down"));

    await updateWorkflowInstanceStage(1, 10, true);

    expect(createNotificationForCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 100,
        userId: 1,
        link: "/workflows",
      }),
    );
  });

  it("notification fallback includes stage and instance names in title and message", async () => {
    vi.mocked(prisma.workflowStage.findUnique).mockResolvedValue({
      id: 10,
      name: "Stage 1",
      details: { systemActions: [{ type: "notify" }] },
    } as any);
    vi.mocked(inngest.send).mockRejectedValue(new Error("Inngest down"));

    await updateWorkflowInstanceStage(1, 10, true);

    expect(createNotificationForCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("אוטומציות"),
        message: expect.stringMatching(/Stage 1.*Test Instance/),
      }),
    );
  });

  it("succeeds even when both inngest and notification fail", async () => {
    vi.mocked(prisma.workflowStage.findUnique).mockResolvedValue({
      id: 10,
      name: "Stage 1",
      details: { systemActions: [{ type: "notify" }] },
    } as any);
    vi.mocked(inngest.send).mockRejectedValue(new Error("Inngest down"));
    vi.mocked(createNotificationForCompany).mockRejectedValue(
      new Error("Notification failed"),
    );

    // Should not throw
    await updateWorkflowInstanceStage(1, 10, true);
    expect(revalidatePath).toHaveBeenCalledWith("/workflows");
  });

  it("does not call notification when inngest succeeds", async () => {
    vi.mocked(prisma.workflowStage.findUnique).mockResolvedValue({
      id: 10,
      name: "Stage 1",
      details: { systemActions: [{ type: "notify" }] },
    } as any);

    await updateWorkflowInstanceStage(1, 10, true);
    expect(createNotificationForCompany).not.toHaveBeenCalled();
  });

  // ── sanitizeError ─────────────────────────────────────────────────

  it("sanitizeError maps P2025 to Not found", async () => {
    mockTx.workflowInstance.update.mockRejectedValue({ code: "P2025" });
    // Need to trigger a code path that hits sanitizeError, not the business-logic re-throw
    // The update inside the transaction rejects with P2025
    // The catch checks: e.message includes "not found" / "access denied" / "Stage does not belong"
    // { code: "P2025" } has no .message, so it falls through to sanitizeError
    await expect(updateWorkflowInstanceStage(1, 10, true)).rejects.toThrow("Not found");
  });

  it("sanitizeError maps unknown error to generic message", async () => {
    mockTx.workflowInstance.update.mockRejectedValue(new Error("DB"));
    await expect(updateWorkflowInstanceStage(1, 10, true)).rejects.toThrow(
      "An unexpected error occurred",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// resetWorkflowInstance
// ═══════════════════════════════════════════════════════════════════════

describe("resetWorkflowInstance", () => {
  it("throws Unauthorized when no user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(resetWorkflowInstance(1)).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when lacking flag", async () => {
    vi.mocked(hasUserFlag).mockReturnValue(false);
    await expect(resetWorkflowInstance(1)).rejects.toThrow("Forbidden");
  });

  it("throws Invalid instanceId for non-integer", async () => {
    await expect(resetWorkflowInstance(1.5)).rejects.toThrow("Invalid instanceId");
  });

  it("throws Invalid instanceId for value <= 0", async () => {
    await expect(resetWorkflowInstance(0)).rejects.toThrow("Invalid instanceId");
  });

  it("throws when instance not found", async () => {
    mockTx.workflowInstance.findFirst.mockResolvedValue(null);
    await expect(resetWorkflowInstance(1)).rejects.toThrow(
      "Instance not found or access denied",
    );
  });

  it("resets to first stage with empty completedStages", async () => {
    mockTx.workflowInstance.findFirst.mockResolvedValue({
      id: 1,
      workflow: { stages: [{ id: 10 }] },
    });
    mockTx.workflowInstance.update.mockResolvedValue({});

    await resetWorkflowInstance(1);

    expect(mockTx.workflowInstance.update).toHaveBeenCalledWith({
      where: { id: 1, companyId: 100 },
      data: {
        completedStages: [],
        currentStageId: 10,
        status: "active",
      },
    });
  });

  it("sets currentStageId to null when workflow has no stages", async () => {
    mockTx.workflowInstance.findFirst.mockResolvedValue({
      id: 1,
      workflow: { stages: [] },
    });
    mockTx.workflowInstance.update.mockResolvedValue({});

    await resetWorkflowInstance(1);

    expect(mockTx.workflowInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentStageId: null }),
      }),
    );
  });

  it("sets status to active", async () => {
    mockTx.workflowInstance.findFirst.mockResolvedValue({
      id: 1,
      workflow: { stages: [{ id: 10 }] },
    });
    mockTx.workflowInstance.update.mockResolvedValue({});

    await resetWorkflowInstance(1);

    expect(mockTx.workflowInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "active" }),
      }),
    );
  });

  it("revalidates /workflows on success", async () => {
    mockTx.workflowInstance.findFirst.mockResolvedValue({
      id: 1,
      workflow: { stages: [{ id: 10 }] },
    });
    mockTx.workflowInstance.update.mockResolvedValue({});

    await resetWorkflowInstance(1);
    expect(revalidatePath).toHaveBeenCalledWith("/workflows");
  });

  it("sanitizeError maps P2025 to Not found", async () => {
    mockTx.workflowInstance.findFirst.mockResolvedValue({
      id: 1,
      workflow: { stages: [] },
    });
    mockTx.workflowInstance.update.mockRejectedValue({ code: "P2025" });
    await expect(resetWorkflowInstance(1)).rejects.toThrow("Not found");
  });

  it("sanitizeError maps unknown error to generic message", async () => {
    mockTx.workflowInstance.findFirst.mockResolvedValue({
      id: 1,
      workflow: { stages: [] },
    });
    mockTx.workflowInstance.update.mockRejectedValue(new Error("DB"));
    await expect(resetWorkflowInstance(1)).rejects.toThrow(
      "An unexpected error occurred",
    );
  });
});
