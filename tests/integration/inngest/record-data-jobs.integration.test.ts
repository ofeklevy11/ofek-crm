import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { createMockStep, createMockEvent } from "../helpers/inngest-test-utils";
import { prisma } from "@/lib/prisma";

// ── Capture handlers ───────────────────────────────────────────────
const handlers: Record<string, (...args: any[]) => any> = {};
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn(),
    createFunction: vi.fn((config: any, _trigger: any, handler: any) => {
      handlers[config.id] = handler;
      return { fn: handler };
    }),
  },
}));

// ── Mock prisma-background → use real prisma ─────────────────────
vi.mock("@/lib/prisma-background", async () => {
  const { prisma } = await import("@/lib/prisma");
  return { prismaBg: prisma };
});

// ── Mock import-service ──────────────────────────────────────────
const mockProcessImportFile = vi.fn();
vi.mock("@/lib/import-service", () => ({
  processImportFile: (...args: any[]) => mockProcessImportFile(...args),
}));

// ── Mock uploadthing-utils ───────────────────────────────────────
vi.mock("@/lib/uploadthing-utils", () => ({
  buildUploadThingUrl: vi.fn(() => "https://mock-storage.test/fake-file.csv"),
}));

// ── Mock audit ───────────────────────────────────────────────────
const mockCreateAuditLogsBatch = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/audit", () => ({
  createAuditLogsBatch: (...args: any[]) => mockCreateAuditLogsBatch(...args),
}));

// ── Mock record-cleanup ──────────────────────────────────────────
vi.mock("@/lib/record-cleanup", () => ({
  cleanupBeforeRecordDelete: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock task-sheet-automations ──────────────────────────────────
const mockExecuteSingleAction = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/task-sheet-automations", () => ({
  executeSingleAction: (...args: any[]) => mockExecuteSingleAction(...args),
}));

// ── Global fetch mock for import-job (ReadableStream body) ───────
const originalFetch = globalThis.fetch;
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as any;

// ── Shared state ─────────────────────────────────────────────────
let companyId: number;
let userId: number;
let tableId: number;

const TEST_SCHEMA = [
  { name: "name", type: "text" },
  { name: "amount", type: "number" },
];

// ── Setup / teardown ─────────────────────────────────────────────
beforeAll(async () => {
  // Import function modules → triggers createFunction → captures handlers
  await import("@/lib/inngest/functions/import-job");
  await import("@/lib/inngest/functions/bulk-record-jobs");
  await import("@/lib/inngest/functions/task-sheet-jobs");

  // Seed company
  const company = await prisma.company.create({
    data: { name: "RecordData Test Co", slug: `recdata-test-${Date.now()}` },
  });
  companyId = company.id;

  // Seed user
  const user = await prisma.user.create({
    data: {
      companyId,
      name: "RecordData Admin",
      email: `recdata-admin-${Date.now()}@test.com`,
      passwordHash: "h",
      role: "admin",
    },
  });
  userId = user.id;

  // Seed tableMeta
  const table = await prisma.tableMeta.create({
    data: {
      companyId,
      name: "RecordData Test Table",
      slug: `recdata-table-${Date.now()}`,
      createdBy: userId,
      schemaJson: TEST_SCHEMA,
    },
  });
  tableId = table.id;
}, 15000);

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  // Restore global fetch
  globalThis.fetch = originalFetch;

  // Clean up in dependency order
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.record.deleteMany({ where: { companyId } });
  await prisma.importJob.deleteMany({ where: { companyId } });
  await prisma.tableMeta.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
}, 15000);

// =====================================================================
// processImportJob
// =====================================================================
describe("processImportJob", () => {
  it(
    "loads metadata, parses CSV, inserts records, marks job IMPORTED",
    async () => {
      // Create an ImportJob with status PENDING
      const importJob = await prisma.importJob.create({
        data: {
          companyId,
          tableId,
          userId,
          fileKey: "test-key",
          fileUrl: "https://utfs.io/f/test-key.csv",
          status: "UPLOADED",
        },
      });

      // Mock fetch → returns a ReadableStream body
      const csvContent = "name,amount\nTest,100";
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(csvContent));
          controller.close();
        },
      });
      mockFetch.mockResolvedValueOnce({ ok: true, body: stream });

      // Mock processImportFile → calls onBatch with sample records
      mockProcessImportFile.mockImplementationOnce(
        async (
          _body: any,
          _schema: any,
          _isDryRun: boolean,
          onBatch?: (records: any[]) => Promise<void>,
          _batchSize?: number,
        ) => {
          if (onBatch) {
            await onBatch([{ name: "Test", amount: "100" }]);
          }
          return {
            summary: {
              totalRows: 5,
              invalidRows: 0,
              errors: [],
              headers: ["name", "amount"],
            },
            validRecords: [],
          };
        },
      );

      const step = createMockStep();
      const event = createMockEvent("import/job.started", {
        importJobId: importJob.id,
        tableId,
        userId,
        companyId,
      });

      const handler = handlers["process-import-job"];
      expect(handler).toBeDefined();

      const result = await handler({ event, step, logger: console });

      // Verify success
      expect(result.success).toBe(true);

      // Verify ImportJob status is IMPORTED in DB
      const updatedJob = await prisma.importJob.findUnique({
        where: { id: importJob.id },
      });
      expect(updatedJob!.status).toBe("IMPORTED");

      // Verify records were created in the Record table
      const records = await prisma.record.findMany({
        where: { tableId, companyId },
      });
      expect(records.length).toBeGreaterThanOrEqual(1);
    },
    15000,
  );

  it(
    "throws when import job not found",
    async () => {
      const step = createMockStep();
      const event = createMockEvent("import/job.started", {
        importJobId: "nonexistent-id-999",
        tableId,
        userId,
        companyId,
      });

      const handler = handlers["process-import-job"];
      expect(handler).toBeDefined();

      await expect(
        handler({ event, step, logger: console }),
      ).rejects.toThrow();
    },
    15000,
  );
});

// =====================================================================
// processBulkDeleteRecords
// =====================================================================
describe("processBulkDeleteRecords", () => {
  it(
    "deletes records in batches and creates audit logs",
    async () => {
      // Create 3 records
      const created = await Promise.all(
        [1, 2, 3].map((i) =>
          prisma.record.create({
            data: {
              companyId,
              tableId,
              data: { name: `BulkDel ${i}`, amount: i * 10 },
              createdBy: userId,
            },
          }),
        ),
      );
      const recordIds = created.map((r) => r.id);

      const step = createMockStep();
      const event = createMockEvent("records/bulk-delete", {
        recordIds,
        companyId,
        tableId,
        userId,
      });

      const handler = handlers["process-bulk-delete-records"];
      expect(handler).toBeDefined();

      const result = await handler({ event, step });

      expect(result.deletedCount).toBe(3);

      // Verify records are gone from DB
      const remaining = await prisma.record.findMany({
        where: { id: { in: recordIds } },
      });
      expect(remaining.length).toBe(0);

      // Verify createAuditLogsBatch was called
      expect(mockCreateAuditLogsBatch).toHaveBeenCalled();
    },
    15000,
  );

  it(
    "only deletes records matching companyId",
    async () => {
      // Create records in the test company
      const created = await Promise.all(
        [1, 2].map((i) =>
          prisma.record.create({
            data: {
              companyId,
              tableId,
              data: { name: `WrongCo ${i}`, amount: i },
              createdBy: userId,
            },
          }),
        ),
      );
      const recordIds = created.map((r) => r.id);

      const step = createMockStep();
      const event = createMockEvent("records/bulk-delete", {
        recordIds,
        companyId: 999999, // wrong companyId
        tableId,
        userId,
      });

      const handler = handlers["process-bulk-delete-records"];
      expect(handler).toBeDefined();

      const result = await handler({ event, step });

      // No records should have been deleted because companyId doesn't match
      expect(result.deletedCount).toBe(0);

      // Records should still exist in DB
      const remaining = await prisma.record.findMany({
        where: { id: { in: recordIds } },
      });
      expect(remaining.length).toBe(2);
    },
    15000,
  );
});

// =====================================================================
// processTaskSheetItemCompletion
// =====================================================================
describe("processTaskSheetItemCompletion", () => {
  it(
    "executes all actions and returns success",
    async () => {
      const step = createMockStep();
      const event = createMockEvent("task-sheet/item-completed", {
        actions: [
          { actionType: "CREATE_TASK", config: {} },
          { actionType: "SEND_NOTIFICATION", config: {} },
        ],
        item: { id: 1, title: "Test Item", sheet: { title: "Sheet", companyId } },
        user: { id: userId, companyId, name: "Test User" },
        companyId,
      });

      const handler = handlers["process-task-sheet-item-completion"];
      expect(handler).toBeDefined();

      const result = await handler({ event, step });

      expect(mockExecuteSingleAction).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.actionsCount).toBe(2);
    },
    15000,
  );

  it("returns skipped when no actions", async () => {
    const step = createMockStep();
    const event = createMockEvent("task-sheet/item-completed", {
      actions: [],
      item: { id: 1, title: "Test Item", sheet: { title: "Sheet", companyId } },
      user: { id: userId, companyId, name: "Test User" },
      companyId,
    });

    const handler = handlers["process-task-sheet-item-completion"];
    expect(handler).toBeDefined();

    const result = await handler({ event, step });

    expect(result.skipped).toBe(true);
  });

  it("returns skipped when companyId is missing", async () => {
    const step = createMockStep();
    const event = createMockEvent("task-sheet/item-completed", {
      actions: [{ actionType: "CREATE_TASK", config: {} }],
      item: { id: 1, title: "Test Item", sheet: { title: "Sheet", companyId } },
      user: { id: userId, companyId, name: "Test User" },
      companyId: 0,
    });

    const handler = handlers["process-task-sheet-item-completion"];
    expect(handler).toBeDefined();

    const result = await handler({ event, step });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("missing-companyId");
  });
});
