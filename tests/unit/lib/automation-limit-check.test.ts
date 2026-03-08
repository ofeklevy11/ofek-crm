import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockTx = {
  automationRule: {
    count: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    automationRule: {
      count: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn((fn: any) => fn(mockTx)),
  },
}));

import { checkCategoryLimitAndCreate, countCategoryAutomations } from "@/lib/automation-limit-check";
import { prisma } from "@/lib/prisma";

beforeEach(() => {
  vi.clearAllMocks();
  // Default: $transaction calls fn with mockTx
  vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(mockTx));
});

describe("checkCategoryLimitAndCreate", () => {
  const baseCreateData = {
    companyId: 100,
    name: "Test Rule",
    triggerType: "TASK_STATUS_CHANGE" as any,
    triggerConfig: {},
    actionType: "SEND_NOTIFICATION" as any,
    actionConfig: { recipientId: 1 },
    createdBy: 1,
  };

  it("blocks basic user at category limit (2 rules)", async () => {
    mockTx.automationRule.count.mockResolvedValueOnce(2); // category count
    mockTx.automationRule.count.mockResolvedValueOnce(10); // total count

    const result = await checkCategoryLimitAndCreate(100, "basic", "TASK_STATUS_CHANGE", baseCreateData);

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.error).toContain("2");
    }
  });

  it("allows basic user below limit", async () => {
    const createdRule = { id: 1, ...baseCreateData };
    mockTx.automationRule.count.mockResolvedValueOnce(1); // category count
    mockTx.automationRule.count.mockResolvedValueOnce(10); // total count
    mockTx.automationRule.create.mockResolvedValue(createdRule);

    const result = await checkCategoryLimitAndCreate(100, "basic", "TASK_STATUS_CHANGE", baseCreateData);

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.rule.id).toBe(1);
    }
  });

  it("blocks premium user at limit (6 rules)", async () => {
    mockTx.automationRule.count.mockResolvedValueOnce(6); // category count
    mockTx.automationRule.count.mockResolvedValueOnce(10); // total count

    const result = await checkCategoryLimitAndCreate(100, "premium", "TASK_STATUS_CHANGE", baseCreateData);

    expect(result.allowed).toBe(false);
  });

  it("allows premium user below limit", async () => {
    const createdRule = { id: 2, ...baseCreateData };
    mockTx.automationRule.count.mockResolvedValueOnce(5); // category count
    mockTx.automationRule.count.mockResolvedValueOnce(10); // total count
    mockTx.automationRule.create.mockResolvedValue(createdRule);

    const result = await checkCategoryLimitAndCreate(100, "premium", "TASK_STATUS_CHANGE", baseCreateData);

    expect(result.allowed).toBe(true);
  });

  it("allows super user with 100 rules (no category limit)", async () => {
    const createdRule = { id: 3, ...baseCreateData };
    vi.mocked(prisma.automationRule.count).mockResolvedValue(100);
    vi.mocked(prisma.automationRule.create).mockResolvedValue(createdRule as any);

    const result = await checkCategoryLimitAndCreate(100, "super", "TASK_STATUS_CHANGE", baseCreateData);

    expect(result.allowed).toBe(true);
    // Super user bypasses transaction — uses direct prisma calls
    expect(prisma.automationRule.count).toHaveBeenCalled();
  });

  it("blocks super user at global safety cap (500)", async () => {
    vi.mocked(prisma.automationRule.count).mockResolvedValue(500);

    const result = await checkCategoryLimitAndCreate(100, "super", "TASK_STATUS_CHANGE", baseCreateData);

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.error).toContain("500");
    }
  });

  it("enforces category isolation (general full, meeting allowed)", async () => {
    // General category: at limit
    mockTx.automationRule.count.mockResolvedValueOnce(2); // category count
    mockTx.automationRule.count.mockResolvedValueOnce(10); // total count

    const generalResult = await checkCategoryLimitAndCreate(100, "basic", "TASK_STATUS_CHANGE", baseCreateData);
    expect(generalResult.allowed).toBe(false);

    // Meeting category: empty
    const meetingData = { ...baseCreateData, triggerType: "MEETING_BOOKED" as any };
    const createdRule = { id: 4, ...meetingData };
    mockTx.automationRule.count.mockResolvedValueOnce(0); // category count
    mockTx.automationRule.count.mockResolvedValueOnce(10); // total count
    mockTx.automationRule.create.mockResolvedValue(createdRule);

    const meetingResult = await checkCategoryLimitAndCreate(100, "basic", "MEETING_BOOKED", meetingData);
    expect(meetingResult.allowed).toBe(true);
  });

  it("defaults unknown tier to basic limit", async () => {
    mockTx.automationRule.count.mockResolvedValueOnce(2); // category count
    mockTx.automationRule.count.mockResolvedValueOnce(10); // total count

    const result = await checkCategoryLimitAndCreate(100, "unknown_tier", "TASK_STATUS_CHANGE", baseCreateData);

    expect(result.allowed).toBe(false);
  });

  it("blocks when global safety cap reached even under category limit", async () => {
    mockTx.automationRule.count.mockResolvedValueOnce(1); // category count — under limit
    mockTx.automationRule.count.mockResolvedValueOnce(500); // total count — at safety cap

    const result = await checkCategoryLimitAndCreate(100, "basic", "TASK_STATUS_CHANGE", baseCreateData);

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.error).toContain("500");
    }
  });
});

describe("countCategoryAutomations", () => {
  it("counts rules by category trigger types", async () => {
    vi.mocked(prisma.automationRule.count).mockResolvedValue(3);

    const count = await countCategoryAutomations(100, "general");

    expect(count).toBe(3);
    expect(prisma.automationRule.count).toHaveBeenCalledWith({
      where: {
        companyId: 100,
        triggerType: { in: expect.arrayContaining(["TASK_STATUS_CHANGE", "MANUAL"]) },
      },
    });
  });
});
