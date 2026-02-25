import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// --- Mocks ---
vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: { create: vi.fn() },
    user: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/make-auth", () => ({
  validateMakeApiKey: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  RATE_LIMITS: {
    webhook: { prefix: "webhook", max: 60, windowSeconds: 60 },
  },
}));
vi.mock("@/lib/webhook-auth", () => ({
  checkIdempotencyKey: vi.fn(),
  setIdempotencyResult: vi.fn(),
}));

import { POST } from "@/app/api/make/tasks/route";
import { prisma } from "@/lib/prisma";
import { validateMakeApiKey } from "@/lib/make-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkIdempotencyKey, setIdempotencyResult } from "@/lib/webhook-auth";

// --- Fixtures ---
const keyRecord = { companyId: 100, isActive: true, createdBy: 1 };

function makeReq(body?: unknown, headers?: Record<string, string>) {
  const init: RequestInit = { method: "POST" };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  init.headers = { "Content-Type": "application/json", "x-company-api-key": "key-123", ...headers };
  return new Request("http://localhost/api/make/tasks", init);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(validateMakeApiKey).mockResolvedValue({ success: true, keyRecord } as any);
  vi.mocked(checkRateLimit).mockResolvedValue(null);
  vi.mocked(checkIdempotencyKey).mockResolvedValue({ key: null, cachedResponse: null });
  vi.mocked(setIdempotencyResult).mockResolvedValue(undefined);
});

describe("POST /api/make/tasks", () => {
  // ── Auth ──
  it("returns 401 when API key is missing/invalid", async () => {
    const authResp = NextResponse.json({ error: "Unauthorized: Missing API key" }, { status: 401 });
    vi.mocked(validateMakeApiKey).mockResolvedValue({ success: false, response: authResp } as any);

    const res = await POST(makeReq({ title: "T" }));
    expect(res.status).toBe(401);
  });

  // ── Rate limit ──
  it("returns 429 when rate limited", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(
      NextResponse.json({ error: "RL" }, { status: 429 }),
    );
    const res = await POST(makeReq({ title: "T" }));
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(
      String(keyRecord.companyId),
      expect.objectContaining({ prefix: "webhook" }),
    );
  });

  // ── Idempotency ──
  it("returns cached response when idempotency key already processed", async () => {
    const cached = new Response(JSON.stringify({ success: true, task: { id: "t1" } }), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Idempotent-Replayed": "true" },
    });
    vi.mocked(checkIdempotencyKey).mockResolvedValue({ key: "idem-1", cachedResponse: cached });

    const res = await POST(makeReq({ title: "T" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Idempotent-Replayed")).toBe("true");
    // Should NOT call prisma.task.create
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  // ── Validation ──
  it("returns 400 for invalid JSON body", async () => {
    const res = await POST(makeReq("not json{{{"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns 400 on Zod validation failure (empty title)", async () => {
    const res = await POST(makeReq({ title: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  // ── Email resolution ──
  it("returns 400 when assignee email not found in company", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    const res = await POST(makeReq({ title: "T", email: "nobody@x.com" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid request" });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: "nobody@x.com", companyId: 100 },
      select: { id: true },
    });
  });

  // ── Happy path (no email) ──
  it("creates task scoped to company from keyRecord", async () => {
    const task = { id: "t1", title: "Webhook Task", companyId: 100 };
    vi.mocked(prisma.task.create).mockResolvedValue(task as any);

    const res = await POST(makeReq({ title: "Webhook Task" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, task });
    expect(prisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: 100, title: "Webhook Task" }),
    });
  });

  // ── Happy path (with email) ──
  it("resolves email to assigneeId and creates task", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 42 } as any);
    vi.mocked(prisma.task.create).mockResolvedValue({ id: "t2" } as any);

    const res = await POST(makeReq({ title: "T", email: "user@test.com" }));
    expect(res.status).toBe(200);
    expect(prisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ assigneeId: 42, companyId: 100 }),
    });
  });

  // ── Idempotency key set after success ──
  it("stores idempotency result when key is present", async () => {
    vi.mocked(checkIdempotencyKey).mockResolvedValue({ key: "idem-2", cachedResponse: null });
    const task = { id: "t3", title: "T" };
    vi.mocked(prisma.task.create).mockResolvedValue(task as any);

    await POST(makeReq({ title: "T" }, { "x-idempotency-key": "idem-2" }));
    expect(setIdempotencyResult).toHaveBeenCalledWith("tasks", "idem-2", 200, { success: true, task });
  });

  it("does NOT store idempotency result when no key header", async () => {
    vi.mocked(prisma.task.create).mockResolvedValue({ id: "t4" } as any);

    await POST(makeReq({ title: "T" }));
    expect(setIdempotencyResult).not.toHaveBeenCalled();
  });

  // ── Defaults ──
  it("applies default status and priority from Zod schema", async () => {
    vi.mocked(prisma.task.create).mockResolvedValue({ id: "t5" } as any);

    const res = await POST(makeReq({ title: "Defaults Test" }));
    expect(res.status).toBe(200);
    expect(prisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 100,
        title: "Defaults Test",
        status: "todo",
        priority: "medium",
      }),
    });
  });

  // ── Error ──
  it("returns 500 on DB error", async () => {
    vi.mocked(prisma.task.create).mockRejectedValue(new Error("DB"));

    const res = await POST(makeReq({ title: "T" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal Server Error" });
  });
});
