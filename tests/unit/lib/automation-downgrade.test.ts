import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    automationRule: {
      count: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { enforceAutomationLimitsOnDowngrade } from "@/lib/automation-downgrade";
import { prisma } from "@/lib/prisma";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enforceAutomationLimitsOnDowngrade", () => {
  it("does nothing for super tier", async () => {
    const result = await enforceAutomationLimitsOnDowngrade(100, "super");

    expect(result.deactivated).toEqual([]);
    expect(prisma.automationRule.count).not.toHaveBeenCalled();
  });

  it("does nothing when count is at or under limit", async () => {
    vi.mocked(prisma.automationRule.count).mockResolvedValue(2);

    const result = await enforceAutomationLimitsOnDowngrade(100, "basic");

    expect(result.deactivated).toEqual([]);
    expect(prisma.automationRule.findMany).not.toHaveBeenCalled();
    expect(prisma.automationRule.updateMany).not.toHaveBeenCalled();
  });

  it("deactivates newest excess rules on downgrade super -> basic with 5 rules", async () => {
    // First call for general: 5 rules (over basic limit of 2)
    // Second call for meeting: 0 rules
    // Third call for event: 0 rules
    vi.mocked(prisma.automationRule.count)
      .mockResolvedValueOnce(5)  // general
      .mockResolvedValueOnce(0)  // meeting
      .mockResolvedValueOnce(0); // event

    vi.mocked(prisma.automationRule.findMany).mockResolvedValueOnce([
      { id: 5 }, { id: 4 }, { id: 3 },
    ] as any);

    vi.mocked(prisma.automationRule.updateMany).mockResolvedValue({ count: 3 });

    const result = await enforceAutomationLimitsOnDowngrade(100, "basic");

    expect(result.deactivated).toEqual([
      { category: "general", count: 3 },
    ]);

    expect(prisma.automationRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
        take: 3,
      }),
    );

    expect(prisma.automationRule.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [5, 4, 3] }, companyId: 100 },
      data: { isActive: false },
    });
  });

  it("handles multiple categories needing deactivation", async () => {
    vi.mocked(prisma.automationRule.count)
      .mockResolvedValueOnce(4)  // general: 4, limit 2 => deactivate 2
      .mockResolvedValueOnce(3)  // meeting: 3, limit 2 => deactivate 1
      .mockResolvedValueOnce(1); // event: 1, limit 2 => ok

    vi.mocked(prisma.automationRule.findMany)
      .mockResolvedValueOnce([{ id: 10 }, { id: 9 }] as any)   // general excess
      .mockResolvedValueOnce([{ id: 20 }] as any);              // meeting excess

    vi.mocked(prisma.automationRule.updateMany).mockResolvedValue({ count: 1 });

    const result = await enforceAutomationLimitsOnDowngrade(100, "basic");

    expect(result.deactivated).toEqual([
      { category: "general", count: 2 },
      { category: "meeting", count: 1 },
    ]);
  });

  it("respects premium limit of 6", async () => {
    vi.mocked(prisma.automationRule.count)
      .mockResolvedValueOnce(8)  // general: 8, limit 6 => deactivate 2
      .mockResolvedValueOnce(3)  // meeting: 3 => ok
      .mockResolvedValueOnce(6); // event: 6 => ok (at limit, not over)

    vi.mocked(prisma.automationRule.findMany).mockResolvedValueOnce([
      { id: 100 }, { id: 99 },
    ] as any);

    vi.mocked(prisma.automationRule.updateMany).mockResolvedValue({ count: 2 });

    const result = await enforceAutomationLimitsOnDowngrade(100, "premium");

    expect(result.deactivated).toEqual([
      { category: "general", count: 2 },
    ]);
  });
});
