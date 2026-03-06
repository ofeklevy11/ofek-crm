/**
 * Integration tests for AI generation Inngest job.
 *
 * REAL: createMockStep execution flow.
 * MOCKED: @/lib/inngest/client (handler capture), @/lib/redis,
 *         @/lib/env, global fetch (OpenRouter API),
 *         @/lib/logger (global mock in tests/setup.ts).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { createMockStep, createMockEvent } from "../helpers/inngest-test-utils";

// ── Handler capture ───────────────────────────────────────────────
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

// ── Mock Redis ────────────────────────────────────────────────────
const mockRedisGet = vi.fn().mockResolvedValue(null);
const mockRedisSet = vi.fn().mockResolvedValue("OK");
const mockRedisSetex = vi.fn().mockResolvedValue("OK");

vi.mock("@/lib/redis", () => ({
  redis: {
    get: (...args: any[]) => mockRedisGet(...args),
    set: (...args: any[]) => mockRedisSet(...args),
    setex: (...args: any[]) => mockRedisSetex(...args),
    del: vi.fn().mockResolvedValue(null),
  },
  redisPublisher: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(null),
  },
}));

// ── Mock env ──────────────────────────────────────────────────────
vi.mock("@/lib/env", () => ({
  env: {
    OPENROUTER_API_KEY: "test-openrouter-key",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    DATABASE_URL: "postgres://test",
    REDIS_URL: "redis://test",
    SESSION_SECRET: "test-secret",
    CRON_SECRET: "test-cron",
    UPLOADTHING_TOKEN: "test-upload",
    NODE_ENV: "test",
  },
}));

// ── Test data ─────────────────────────────────────────────────────
let mockFetch: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  await import("@/lib/inngest/functions/ai-generation-jobs");
});

beforeEach(() => {
  mockRedisGet.mockClear().mockResolvedValue(null);
  mockRedisSet.mockClear().mockResolvedValue("OK");
  mockRedisSetex.mockClear().mockResolvedValue("OK");

  // Default mock fetch for OpenRouter - returns a valid schema response
  mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              tableName: "Leads",
              slug: "leads",
              description: "Lead tracking table",
              categoryId: null,
              fields: [
                { name: "name", label: "Name", type: "text" },
                { name: "email", label: "Email", type: "text" },
                { name: "status", label: "Status", type: "select", options: ["New", "Contacted"] },
                { name: "phone", label: "Phone", type: "phone" },
                { name: "notes", label: "Notes", type: "textarea" },
              ],
              displayConfig: {
                visibleColumns: ["name", "email", "status", "phone"],
                columnOrder: ["name", "email", "status", "phone"],
              },
            }),
          },
        },
      ],
    }),
  });
  vi.stubGlobal("fetch", mockFetch);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// ── processAIGeneration ───────────────────────────────────────────
describe("processAIGeneration (process-ai-generation)", () => {
  it("calls OpenRouter API with correct headers", async () => {
    const step = createMockStep();
    const event = createMockEvent("ai/generation.requested", {
      jobId: "test-job-1",
      type: "schema",
      prompt: "Create a leads table",
      context: { existingTables: [] },
      companyId: 1,
    });

    await handlers["process-ai-generation"]({ event, step });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [fetchUrl, fetchOpts] = mockFetch.mock.calls[0];
    expect(fetchUrl).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(fetchOpts.method).toBe("POST");
    expect(fetchOpts.headers["Content-Type"]).toBe("application/json");
    expect(fetchOpts.headers["Authorization"]).toBe("Bearer test-openrouter-key");
    expect(fetchOpts.headers["X-Title"]).toBe("CRM AI Generator");
  });

  it("stores result in Redis with TTL", async () => {
    const step = createMockStep();
    const event = createMockEvent("ai/generation.requested", {
      jobId: "test-job-2",
      type: "schema",
      prompt: "Create a leads table",
      context: { existingTables: [] },
      companyId: 1,
    });

    await handlers["process-ai-generation"]({ event, step });

    // The function does: redis.set(key, JSON.stringify({status:"processing",...}), "EX", 600, "NX")
    // for the check-status step, then redis.set(key, JSON.stringify({status:"completed",...}), "EX", 600)
    // for the store-result step

    // Check that set was called for check-status (NX claim) and store-result
    expect(mockRedisSet).toHaveBeenCalled();

    // Find the store-result call (status: "completed")
    const storeCall = mockRedisSet.mock.calls.find((call: any[]) => {
      try {
        const parsed = JSON.parse(call[1]);
        return parsed.status === "completed";
      } catch {
        return false;
      }
    });

    expect(storeCall).toBeDefined();
    const stored = JSON.parse(storeCall![1]);
    expect(stored.status).toBe("completed");
    expect(stored.companyId).toBe(1);
    expect(stored.result).toBeDefined();
    // TTL parameter is "EX", 600
    expect(storeCall![2]).toBe("EX");
    expect(storeCall![3]).toBe(600);
  });

  it("returns cached result when job is already completed", async () => {
    // Simulate that redis.set NX fails (key exists), and redis.get returns completed
    mockRedisSet.mockResolvedValueOnce(null); // NX fails
    mockRedisGet.mockResolvedValueOnce(
      JSON.stringify({
        status: "completed",
        result: { tableName: "Cached Table" },
        companyId: 1,
      }),
    );

    const step = createMockStep();
    const event = createMockEvent("ai/generation.requested", {
      jobId: "test-job-cached",
      type: "schema",
      prompt: "Create something",
      context: {},
      companyId: 1,
    });

    const result = await handlers["process-ai-generation"]({ event, step });

    // Should return the cached result directly, not call fetch
    expect(result).toEqual({ tableName: "Cached Table" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("handles API errors gracefully by throwing", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "Server error",
    });

    const step = createMockStep();
    const event = createMockEvent("ai/generation.requested", {
      jobId: "test-job-error",
      type: "schema",
      prompt: "Create a leads table",
      context: { existingTables: [] },
      companyId: 1,
    });

    // The function should throw when OpenRouter returns an error
    await expect(
      handlers["process-ai-generation"]({ event, step }),
    ).rejects.toThrow();
  });

  it("sets processing status in Redis before calling API", async () => {
    const step = createMockStep();
    const event = createMockEvent("ai/generation.requested", {
      jobId: "test-job-processing",
      type: "schema",
      prompt: "Create a leads table",
      context: { existingTables: [] },
      companyId: 1,
    });

    await handlers["process-ai-generation"]({ event, step });

    // The first redis.set call should be for "processing" status with NX
    const firstSetCall = mockRedisSet.mock.calls[0];
    expect(firstSetCall[0]).toBe("ai-job:test-job-processing");
    const processingValue = JSON.parse(firstSetCall[1]);
    expect(processingValue.status).toBe("processing");
    expect(processingValue.companyId).toBe(1);
  });
});
