import { describe, it, expect } from "vitest";
import { getMonthlySmsLimit, MONTHLY_SMS_LIMITS } from "@/lib/plan-limits";

describe("SMS plan limits", () => {
  it("returns correct limits for each tier", () => {
    expect(getMonthlySmsLimit("basic")).toBe(100);
    expect(getMonthlySmsLimit("premium")).toBe(500);
    expect(getMonthlySmsLimit("super")).toBe(Infinity);
  });

  it("defaults to basic for null/undefined", () => {
    expect(getMonthlySmsLimit(null)).toBe(100);
    expect(getMonthlySmsLimit(undefined)).toBe(100);
  });

  it("defaults to basic for unknown tier", () => {
    expect(getMonthlySmsLimit("enterprise")).toBe(100);
    expect(getMonthlySmsLimit("")).toBe(100);
  });

  it("has all tiers defined in MONTHLY_SMS_LIMITS", () => {
    expect(MONTHLY_SMS_LIMITS).toHaveProperty("basic");
    expect(MONTHLY_SMS_LIMITS).toHaveProperty("premium");
    expect(MONTHLY_SMS_LIMITS).toHaveProperty("super");
  });
});
