import { describe, it, expect } from "vitest";
import { isValidE164, normalizeToE164 } from "@/lib/utils/phone";

describe("isValidE164", () => {
  it("accepts valid E.164 numbers", () => {
    expect(isValidE164("+15551234567")).toBe(true);
    expect(isValidE164("+972501234567")).toBe(true);
    expect(isValidE164("+44207123456")).toBe(true);
    expect(isValidE164("+1234567890")).toBe(true);
  });

  it("rejects numbers without + prefix", () => {
    expect(isValidE164("15551234567")).toBe(false);
    expect(isValidE164("972501234567")).toBe(false);
  });

  it("rejects numbers starting with +0", () => {
    expect(isValidE164("+0501234567")).toBe(false);
  });

  it("rejects numbers that are too short", () => {
    expect(isValidE164("+12345")).toBe(false);
    expect(isValidE164("+1")).toBe(false);
  });

  it("rejects numbers that are too long", () => {
    expect(isValidE164("+1234567890123456")).toBe(false);
  });

  it("rejects empty strings", () => {
    expect(isValidE164("")).toBe(false);
  });

  it("rejects numbers with non-digit characters", () => {
    expect(isValidE164("+1-555-123-4567")).toBe(false);
    expect(isValidE164("+1 555 1234567")).toBe(false);
  });
});

describe("normalizeToE164", () => {
  it("normalizes Israeli local numbers (0xx → +972xx)", () => {
    expect(normalizeToE164("0501234567")).toBe("+972501234567");
    expect(normalizeToE164("0521234567")).toBe("+972521234567");
    expect(normalizeToE164("0771234567")).toBe("+972771234567");
  });

  it("strips common formatting characters", () => {
    expect(normalizeToE164("+1-555-123-4567")).toBe("+15551234567");
    expect(normalizeToE164("+972 50-123-4567")).toBe("+972501234567");
    expect(normalizeToE164("(050) 123-4567")).toBe("+972501234567");
  });

  it("passes through valid E.164 numbers unchanged", () => {
    expect(normalizeToE164("+15551234567")).toBe("+15551234567");
    expect(normalizeToE164("+972501234567")).toBe("+972501234567");
  });

  it("adds + prefix for long digit-only strings", () => {
    expect(normalizeToE164("15551234567")).toBe("+15551234567");
    expect(normalizeToE164("972501234567")).toBe("+972501234567");
  });

  it("returns null for invalid numbers", () => {
    expect(normalizeToE164("abc")).toBeNull();
    expect(normalizeToE164("")).toBeNull();
    expect(normalizeToE164("123")).toBeNull();
  });

  it("handles 9-digit Israeli numbers", () => {
    expect(normalizeToE164("050123456")).toBe("+97250123456");
  });
});
