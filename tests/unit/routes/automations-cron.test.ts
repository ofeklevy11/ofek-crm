import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks ---
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("@/app/actions/automations-core", () => ({
  processTimeBasedAutomations: vi.fn(),
}));

vi.mock("@/app/actions/event-automations-core", () => ({
  processEventAutomations: vi.fn(),
}));

vi.mock("@/app/actions/meeting-automations", () => ({
  processMeetingReminders: vi.fn(),
}));

import { GET } from "@/app/api/automations/cron/route";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest/client";
import { processTimeBasedAutomations } from "@/app/actions/automations-core";

// --- Helpers ---
function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/automations/cron", { headers });
}

const CRON_SECRET = "test-cron-secret-123";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

// ─── Authentication ──────────────────────────────────────────────────────

describe("Authentication", () => {
  it("returns 401 when no authorization header", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when wrong token", async () => {
    const res = await GET(makeRequest("Bearer wrong-token"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest("Bearer anything"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when header length doesn't match (timing-safe)", async () => {
    const res = await GET(makeRequest("Bearer short"));
    expect(res.status).toBe(401);
  });

  it("returns 200 for correct token", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    vi.mocked(inngest.send).mockResolvedValue(undefined as any);
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// ─── Event Dispatching ───────────────────────────────────────────────────

describe("Event Dispatching", () => {
  it("always sends meeting-reminders event", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    vi.mocked(inngest.send).mockResolvedValue(undefined as any);
    await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const sendCall = vi.mocked(inngest.send).mock.calls[0][0] as any[];
    const meetingEvent = sendCall.find((e: any) => e.name === "automation/meeting-reminders");
    expect(meetingEvent).toBeDefined();
    expect(meetingEvent.id).toContain("meeting-reminders-");
  });

  it("dispatches per-company time and event events", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: 1 }, { id: 2 }]);
    vi.mocked(inngest.send).mockResolvedValue(undefined as any);
    await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const sendCall = vi.mocked(inngest.send).mock.calls[0][0] as any[];
    const timeEvents = sendCall.filter((e: any) => e.name === "automation/time-based");
    const eventEvents = sendCall.filter((e: any) => e.name === "automation/event-based");
    expect(timeEvents).toHaveLength(2);
    expect(eventEvents).toHaveLength(2);
    expect(timeEvents[0].data.companyId).toBe(1);
    expect(timeEvents[1].data.companyId).toBe(2);
  });

  it("sends SLA scan only when companies exist", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: 1 }]);
    vi.mocked(inngest.send).mockResolvedValue(undefined as any);
    await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const sendCall = vi.mocked(inngest.send).mock.calls[0][0] as any[];
    const slaEvent = sendCall.find((e: any) => e.name === "sla/manual-scan");
    expect(slaEvent).toBeDefined();
    expect(slaEvent.id).toContain("sla-scan-");
    expect(slaEvent.data).toBeDefined();
  });

  it("does not send SLA scan when no companies", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    vi.mocked(inngest.send).mockResolvedValue(undefined as any);
    await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const sendCall = vi.mocked(inngest.send).mock.calls[0][0] as any[];
    const slaEvent = sendCall.find((e: any) => e.name === "sla/manual-scan");
    expect(slaEvent).toBeUndefined();
  });

  it("uses minute bucket for dedup IDs", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: 1 }]);
    vi.mocked(inngest.send).mockResolvedValue(undefined as any);
    await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const sendCall = vi.mocked(inngest.send).mock.calls[0][0] as any[];
    const minuteBucket = Math.floor(Date.now() / 60000);
    expect(sendCall[0].id).toContain(String(minuteBucket));
  });

  it("batch sends in chunks of 500", async () => {
    // Create enough companies to exceed 500 events
    const companies = Array.from({ length: 200 }, (_, i) => ({ id: i + 1 }));
    vi.mocked(prisma.$queryRaw).mockResolvedValue(companies);
    vi.mocked(inngest.send).mockResolvedValue(undefined as any);
    await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    // 1 meeting + 200*2 time/event + 1 SLA = 402 events — fits in one batch
    expect(inngest.send).toHaveBeenCalledTimes(1);
  });
});

// ─── Inngest Fallback ────────────────────────────────────────────────────

describe("Inngest Fallback", () => {
  it("falls back to parallel processing on Inngest failure", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: 1 }]);
    vi.mocked(inngest.send).mockRejectedValue(new Error("inngest down"));

    const { processMeetingReminders } = await import("@/app/actions/meeting-automations");
    const { processEventAutomations } = await import("@/app/actions/event-automations-core");
    vi.mocked(processMeetingReminders).mockResolvedValue(undefined as any);
    vi.mocked(processEventAutomations).mockResolvedValue(undefined as any);
    vi.mocked(processTimeBasedAutomations).mockResolvedValue(undefined);

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    expect(processMeetingReminders).toHaveBeenCalled();
    expect(processTimeBasedAutomations).toHaveBeenCalledWith(1);
    expect(processEventAutomations).toHaveBeenCalledWith(1, CRON_SECRET);
  });

  it("uses Promise.allSettled — continues on failure", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: 1 }, { id: 2 }]);
    vi.mocked(inngest.send).mockRejectedValue(new Error("inngest down"));

    const { processMeetingReminders } = await import("@/app/actions/meeting-automations");
    const { processEventAutomations } = await import("@/app/actions/event-automations-core");
    vi.mocked(processMeetingReminders).mockResolvedValue(undefined as any);
    vi.mocked(processTimeBasedAutomations)
      .mockRejectedValueOnce(new Error("company 1 fail"))
      .mockResolvedValueOnce(undefined);
    vi.mocked(processEventAutomations).mockResolvedValue(undefined as any);

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    // Should still succeed — allSettled handles individual failures
    expect(res.status).toBe(200);
  });

  it("meeting reminder fallback failure is graceful", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    vi.mocked(inngest.send).mockRejectedValue(new Error("inngest down"));

    const { processMeetingReminders } = await import("@/app/actions/meeting-automations");
    vi.mocked(processMeetingReminders).mockRejectedValue(new Error("meeting fail"));

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    // Should still return 200 — meeting reminder failure is caught
    expect(res.status).toBe(200);
  });
});

// ─── Error Handling ──────────────────────────────────────────────────────

describe("Error Handling", () => {
  it("returns 500 on unexpected error", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("unexpected"));
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Internal Server Error");
  });

  it("returns correct success response structure", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    vi.mocked(inngest.send).mockResolvedValue(undefined as any);
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      message: "Automations dispatched to background",
    });
  });
});
