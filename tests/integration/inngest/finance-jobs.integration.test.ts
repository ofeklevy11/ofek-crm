import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { createMockStep, createMockEvent } from "../helpers/inngest-test-utils";
import { prisma } from "@/lib/prisma";

// ── Capture handlers ───────────────────────────────────────────────
const handlers: Record<string, Function> = {};

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn(),
    createFunction: vi.fn((config: any, _trigger: any, handler: any) => {
      handlers[config.id] = handler;
      return { id: config.id, fn: handler };
    }),
  },
}));

vi.mock("@/lib/prisma-background", async () => {
  const { prisma } = await import("@/lib/prisma");
  return { prismaBg: prisma };
});

const mockExecuteSyncRule = vi.fn().mockResolvedValue({ created: 5, updated: 2, deleted: 0 });
const mockProcessFixedExpensesInternal = vi.fn().mockResolvedValue(3);

vi.mock("@/lib/finance-sync-internal", () => ({
  executeSyncRule: (...args: any[]) => mockExecuteSyncRule(...args),
  processFixedExpensesInternal: (...args: any[]) => mockProcessFixedExpensesInternal(...args),
}));

// ── State ──────────────────────────────────────────────────────────
let companyId: number;
let userId: number;

beforeAll(async () => {
  // Register handlers
  await import("@/lib/inngest/functions/finance-sync-job");
  await import("@/lib/inngest/functions/fixed-expense-jobs");

  // Seed base data
  const company = await prisma.company.create({
    data: { name: "Finance Test Co", slug: `finance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
  });
  companyId = company.id;

  const user = await prisma.user.create({
    data: {
      companyId,
      name: "Finance User",
      email: `finance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`,
      passwordHash: "not-a-real-hash",
      role: "admin",
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.financeSyncJob.deleteMany({ where: { companyId } });
  await prisma.financeSyncRule.deleteMany({ where: { companyId } });
  await prisma.fixedExpense.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── processFinanceSyncJob ─────────────────────────────────────────

describe("processFinanceSyncJob", () => {
  it("loads rule, runs sync, and marks job COMPLETED", async () => {
    const rule = await prisma.financeSyncRule.create({
      data: {
        companyId,
        name: "Test Sync Rule",
        targetType: "INCOME",
        sourceType: "TABLE",
        sourceId: 1,
        fieldMapping: { amountField: "price", dateField: "date" },
        isActive: true,
      },
    });

    const job = await prisma.financeSyncJob.create({
      data: {
        companyId,
        syncRuleId: rule.id,
        status: "QUEUED",
      },
    });

    const event = createMockEvent("finance-sync/job.started", {
      jobId: job.id,
      syncRuleId: rule.id,
      companyId,
    });
    const step = createMockStep();
    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

    const result = await handlers["process-finance-sync-job"]({ event, step, logger });

    expect(result.success).toBe(true);
    expect(result.jobId).toBe(job.id);
    expect(mockExecuteSyncRule).toHaveBeenCalledWith(rule.id, companyId);

    // Verify job is COMPLETED in DB
    const updatedJob = await prisma.financeSyncJob.findUnique({ where: { id: job.id } });
    expect(updatedJob!.status).toBe("COMPLETED");
    expect(updatedJob!.summary).toBeTruthy();

    // Verify lastRunAt updated on rule
    const updatedRule = await prisma.financeSyncRule.findUnique({ where: { id: rule.id } });
    expect(updatedRule!.lastRunAt).toBeTruthy();

    // Cleanup
    await prisma.financeSyncJob.delete({ where: { id: job.id } });
    await prisma.financeSyncRule.delete({ where: { id: rule.id } });
  });

  it("marks job RUNNING before executing sync", async () => {
    const rule = await prisma.financeSyncRule.create({
      data: {
        companyId,
        name: "Test Sync Rule 2",
        targetType: "EXPENSE",
        sourceType: "TRANSACTIONS",
        fieldMapping: {},
        isActive: true,
      },
    });

    const job = await prisma.financeSyncJob.create({
      data: {
        companyId,
        syncRuleId: rule.id,
        status: "QUEUED",
      },
    });

    // Capture the job status during sync execution
    let statusDuringSync: string | null = null;
    mockExecuteSyncRule.mockImplementationOnce(async () => {
      const j = await prisma.financeSyncJob.findUnique({ where: { id: job.id } });
      statusDuringSync = j!.status;
      return { created: 0, updated: 0, deleted: 0 };
    });

    const event = createMockEvent("finance-sync/job.started", {
      jobId: job.id,
      syncRuleId: rule.id,
      companyId,
    });
    const step = createMockStep();
    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

    await handlers["process-finance-sync-job"]({ event, step, logger });

    expect(statusDuringSync).toBe("RUNNING");

    // Cleanup
    await prisma.financeSyncJob.delete({ where: { id: job.id } });
    await prisma.financeSyncRule.delete({ where: { id: rule.id } });
  });

  it("throws when job is not found", async () => {
    const event = createMockEvent("finance-sync/job.started", {
      jobId: "nonexistent-job-id",
      syncRuleId: 999999,
      companyId,
    });
    const step = createMockStep();
    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

    await expect(
      handlers["process-finance-sync-job"]({ event, step, logger }),
    ).rejects.toThrow();
  });

  it("throws when job is already COMPLETED", async () => {
    const rule = await prisma.financeSyncRule.create({
      data: {
        companyId,
        name: "Test Sync Rule 3",
        targetType: "INCOME",
        sourceType: "RETAINERS",
        fieldMapping: {},
        isActive: true,
      },
    });

    const job = await prisma.financeSyncJob.create({
      data: {
        companyId,
        syncRuleId: rule.id,
        status: "COMPLETED",
        summary: { completedAt: new Date().toISOString() },
      },
    });

    const event = createMockEvent("finance-sync/job.started", {
      jobId: job.id,
      syncRuleId: rule.id,
      companyId,
    });
    const step = createMockStep();
    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

    await expect(
      handlers["process-finance-sync-job"]({ event, step, logger }),
    ).rejects.toThrow("Job already completed");

    // Cleanup
    await prisma.financeSyncJob.delete({ where: { id: job.id } });
    await prisma.financeSyncRule.delete({ where: { id: rule.id } });
  });
});

// ── processFixedExpensesCron ──────────────────────────────────────

describe("processFixedExpensesCron", () => {
  it("finds companies with active fixed expenses and processes them", async () => {
    // Seed an active fixed expense
    const expense = await prisma.fixedExpense.create({
      data: {
        companyId,
        title: "Monthly Rent",
        amount: 5000,
        frequency: "MONTHLY",
        startDate: new Date("2025-01-01"),
        status: "ACTIVE",
      },
    });

    const step = createMockStep();
    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

    const result = await handlers["process-fixed-expenses-cron"]({ step, logger });

    // find-companies step should return our company
    expect(result.companies).toBeGreaterThanOrEqual(1);
    // processFixedExpensesInternal mock returns 3
    expect(result.created).toBeGreaterThanOrEqual(3);

    // Verify processFixedExpensesInternal was called with our companyId
    expect(mockProcessFixedExpensesInternal).toHaveBeenCalledWith(
      companyId,
      expect.anything(), // prisma instance
    );

    // Cleanup
    await prisma.fixedExpense.delete({ where: { id: expense.id } });
  });

  it("returns 0 processed when no active fixed expenses exist", async () => {
    // Ensure no active fixed expenses for this company
    await prisma.fixedExpense.deleteMany({ where: { companyId } });

    const step = createMockStep();
    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

    const result = await handlers["process-fixed-expenses-cron"]({ step, logger });

    expect(result.processed).toBe(0);
    expect(mockProcessFixedExpensesInternal).not.toHaveBeenCalled();
  });

  it("handles PAUSED fixed expenses (should not process them)", async () => {
    const expense = await prisma.fixedExpense.create({
      data: {
        companyId,
        title: "Paused Expense",
        amount: 1000,
        frequency: "MONTHLY",
        startDate: new Date("2025-01-01"),
        status: "PAUSED",
      },
    });

    // Also ensure no ACTIVE expenses
    await prisma.fixedExpense.deleteMany({
      where: { companyId, status: "ACTIVE" },
    });

    const step = createMockStep();
    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

    const result = await handlers["process-fixed-expenses-cron"]({ step, logger });

    // PAUSED expenses should not cause the company to be selected
    expect(result.processed).toBe(0);

    // Cleanup
    await prisma.fixedExpense.delete({ where: { id: expense.id } });
  });
});
