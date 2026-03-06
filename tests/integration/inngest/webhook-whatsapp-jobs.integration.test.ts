/**
 * Integration tests for webhook and WhatsApp Inngest jobs.
 *
 * REAL: Prisma (test DB), company/user/automationRule/file seeding, crypto HMAC.
 * MOCKED: @/lib/inngest/client (handler capture), @/lib/services/green-api,
 *         @/lib/security/ssrf, global fetch, @/lib/logger (global mock).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { createMockStep, createMockEvent } from "../helpers/inngest-test-utils";
import { prisma } from "@/lib/prisma";

// ── Handler capture ───────────────────────────────────────────────
const handlers: Record<string, Function> = {};
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn(),
    createFunction: vi.fn((config: any, _trigger: any, handler: any) => {
      handlers[config.id] = handler;
      return { fn: handler };
    }),
  },
}));

// ── Mock Green API ────────────────────────────────────────────────
const mockSendGreenApiMessage = vi.fn().mockResolvedValue({ sent: true });
const mockSendGreenApiFile = vi.fn().mockResolvedValue({ sent: true });
vi.mock("@/lib/services/green-api", () => ({
  sendGreenApiMessage: (...args: any[]) => mockSendGreenApiMessage(...args),
  sendGreenApiFile: (...args: any[]) => mockSendGreenApiFile(...args),
}));

// ── Mock SSRF check ──────────────────────────────────────────────
const mockIsPrivateUrl = vi.fn().mockReturnValue(false);
vi.mock("@/lib/security/ssrf", () => ({
  isPrivateUrl: (...args: any[]) => mockIsPrivateUrl(...args),
}));

// ── Test data ─────────────────────────────────────────────────────
let companyId: number;
let userId: number;
let ruleId: number;
let fileId: number;
let tableId: number;

beforeAll(async () => {
  await import("@/lib/inngest/functions/webhook-whatsapp-jobs");

  const company = await prisma.company.create({
    data: {
      name: "Webhook Test Co",
      slug: `wh-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
  companyId = company.id;

  const user = await prisma.user.create({
    data: {
      companyId,
      name: "WH User",
      email: `wh-user-${Date.now()}@test.com`,
      passwordHash: "not-a-real-hash",
    },
  });
  userId = user.id;

  const table = await prisma.tableMeta.create({
    data: {
      companyId,
      createdBy: userId,
      name: "Test Table",
      slug: `test-table-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      schemaJson: {},
    },
  });
  tableId = table.id;

  const rule = await prisma.automationRule.create({
    data: {
      companyId,
      name: "Test Webhook Rule",
      triggerType: "MANUAL",
      actionType: "WEBHOOK",
      isActive: true,
      createdBy: userId,
    },
  });
  ruleId = rule.id;

  const file = await prisma.file.create({
    data: {
      companyId,
      name: "test-media.pdf",
      url: "https://example.com/media/test.pdf",
      key: `file-key-${Date.now()}`,
      size: 2048,
      type: "application/pdf",
    },
  });
  fileId = file.id;
});

afterAll(async () => {
  await prisma.file.deleteMany({ where: { companyId } });
  await prisma.automationRule.deleteMany({ where: { companyId } });
  await prisma.tableMeta.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

beforeEach(() => {
  mockSendGreenApiMessage.mockClear();
  mockSendGreenApiFile.mockClear();
  mockIsPrivateUrl.mockClear().mockReturnValue(false);
});

// ── sendWhatsAppJob ───────────────────────────────────────────────
describe("sendWhatsAppJob (send-whatsapp-message)", () => {
  it("normalizes phone by stripping non-digit chars", async () => {
    const step = createMockStep();
    const event = createMockEvent("automation/send-whatsapp", {
      companyId,
      phone: "050-123-4567",
      content: "Hello!",
      messageType: "text",
    });

    const result = await handlers["send-whatsapp-message"]({ event, step });

    expect(mockSendGreenApiMessage).toHaveBeenCalledTimes(1);
    expect(mockSendGreenApiMessage).toHaveBeenCalledWith(
      companyId,
      "0501234567",
      "Hello!",
    );
    expect(result).toEqual({
      success: true,
      phone: "050****67",
    });
  });

  it("throws NonRetriableError when phone is empty", async () => {
    const step = createMockStep();
    const event = createMockEvent("automation/send-whatsapp", {
      companyId,
      phone: "",
      content: "Hello!",
      messageType: "text",
    });

    await expect(
      handlers["send-whatsapp-message"]({ event, step }),
    ).rejects.toThrow("No phone number provided");
  });

  it("throws NonRetriableError when phone is only dashes/spaces", async () => {
    const step = createMockStep();
    const event = createMockEvent("automation/send-whatsapp", {
      companyId,
      phone: "---  ---",
      content: "Hello!",
      messageType: "text",
    });

    await expect(
      handlers["send-whatsapp-message"]({ event, step }),
    ).rejects.toThrow("No phone number provided");
  });

  it("sends file when messageType is media with valid mediaFileId", async () => {
    const step = createMockStep();
    const event = createMockEvent("automation/send-whatsapp", {
      companyId,
      phone: "0501234567",
      content: "See attachment",
      messageType: "media",
      mediaFileId: fileId,
    });

    const result = await handlers["send-whatsapp-message"]({ event, step });

    expect(mockSendGreenApiFile).toHaveBeenCalledTimes(1);
    expect(mockSendGreenApiFile).toHaveBeenCalledWith(
      companyId,
      "0501234567",
      "https://example.com/media/test.pdf",
      "test-media.pdf",
      "See attachment",
    );
    expect(result.success).toBe(true);
  });
});

// ── sendWebhookJob ────────────────────────────────────────────────
describe("sendWebhookJob (send-webhook)", () => {
  it("blocks private URLs", async () => {
    mockIsPrivateUrl.mockReturnValue(true);

    const step = createMockStep();
    const event = createMockEvent("automation/send-webhook", {
      url: "http://169.254.169.254/latest/meta-data",
      payload: { test: true },
      ruleId,
      companyId,
    });

    await expect(
      handlers["send-webhook"]({ event, step }),
    ).rejects.toThrow("private/internal address");

    expect(mockIsPrivateUrl).toHaveBeenCalledWith(
      "http://169.254.169.254/latest/meta-data",
    );
  });

  it("validates rule belongs to company", async () => {
    const otherCompany = await prisma.company.create({
      data: {
        name: "Other Webhook Co",
        slug: `other-wh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    });

    const step = createMockStep();
    const event = createMockEvent("automation/send-webhook", {
      url: "https://example.com/webhook",
      payload: { test: true },
      ruleId,
      companyId: otherCompany.id, // rule belongs to companyId, not otherCompany
    });

    await expect(
      handlers["send-webhook"]({ event, step }),
    ).rejects.toThrow("does not belong to company");

    // Cleanup
    await prisma.company.delete({ where: { id: otherCompany.id } });
  });

  it("sends webhook with HMAC signature headers", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    });
    vi.stubGlobal("fetch", mockFetch);

    const step = createMockStep();
    const event = createMockEvent("automation/send-webhook", {
      url: "https://example.com/webhook",
      payload: { lead: "test" },
      ruleId,
      companyId,
    });

    const result = await handlers["send-webhook"]({ event, step });

    expect(result).toEqual({ success: true, status: 200 });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [fetchUrl, fetchOpts] = mockFetch.mock.calls[0];
    expect(fetchUrl).toBe("https://example.com/webhook");
    expect(fetchOpts.method).toBe("POST");
    expect(fetchOpts.headers["Content-Type"]).toBe("application/json");
    expect(fetchOpts.headers["X-Webhook-Signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(fetchOpts.headers["X-Webhook-Timestamp"]).toBeDefined();

    // Verify the body contains the payload with added timestamp
    const body = JSON.parse(fetchOpts.body);
    expect(body.lead).toBe("test");
    expect(body.timestamp).toBeDefined();

    vi.unstubAllGlobals();
  });

  it("throws NonRetriableError when URL is missing", async () => {
    const step = createMockStep();
    const event = createMockEvent("automation/send-webhook", {
      url: "",
      payload: { test: true },
      ruleId,
      companyId,
    });

    await expect(
      handlers["send-webhook"]({ event, step }),
    ).rejects.toThrow("No URL provided");
  });

  it("throws NonRetriableError when companyId is missing", async () => {
    const step = createMockStep();
    const event = createMockEvent("automation/send-webhook", {
      url: "https://example.com/webhook",
      payload: { test: true },
      ruleId,
      companyId: undefined,
    });

    await expect(
      handlers["send-webhook"]({ event, step }),
    ).rejects.toThrow("Missing companyId");
  });
});
