import { describe, it, expect } from "vitest";
import {
  validateAutomationInput,
  validateId,
  MAX_RULES_PER_COMPANY,
} from "@/lib/security/automation-validation";

// --- Helpers ---
const validInput = () => ({
  name: "Test Rule",
  triggerType: "MANUAL",
  triggerConfig: {},
  actionType: "SEND_NOTIFICATION",
  actionConfig: {},
});

// ─── validateAutomationInput ─────────────────────────────────────────────

describe("validateAutomationInput", () => {
  // --- Name validation ---
  describe("name", () => {
    it("rejects missing name", () => {
      const data = { ...validInput(), name: "" };
      expect(validateAutomationInput(data)).toBe("Name is required");
    });

    it("rejects null name", () => {
      const data = { ...validInput(), name: null as any };
      expect(validateAutomationInput(data)).toBe("Name is required");
    });

    it("rejects non-string name", () => {
      const data = { ...validInput(), name: 123 as any };
      expect(validateAutomationInput(data)).toBe("Name is required");
    });

    it("rejects whitespace-only name", () => {
      const data = { ...validInput(), name: "   " };
      expect(validateAutomationInput(data)).toBe("Name cannot be empty");
    });

    it("rejects name over 200 chars", () => {
      const data = { ...validInput(), name: "a".repeat(201) };
      expect(validateAutomationInput(data)).toBe("Name must be 200 characters or less");
    });

    it("accepts name at exactly 200 chars", () => {
      const data = { ...validInput(), name: "a".repeat(200) };
      expect(validateAutomationInput(data)).toBeNull();
    });

    it("accepts valid name with trim", () => {
      const data = { ...validInput(), name: "  Valid Name  " };
      expect(validateAutomationInput(data)).toBeNull();
    });
  });

  // --- Trigger type validation ---
  describe("triggerType", () => {
    it("rejects invalid trigger type", () => {
      const data = { ...validInput(), triggerType: "INVALID_TYPE" };
      expect(validateAutomationInput(data)).toBe("Invalid trigger type");
    });

    it.each([
      "MANUAL",
      "TASK_STATUS_CHANGE",
      "RECORD_CREATE",
      "NEW_RECORD",
      "RECORD_FIELD_CHANGE",
      "MULTI_EVENT_DURATION",
      "DIRECT_DIAL",
      "VIEW_METRIC_THRESHOLD",
      "TIME_SINCE_CREATION",
      "TICKET_STATUS_CHANGE",
      "SLA_BREACH",
      "EVENT_TIME",
    ])("accepts valid trigger type: %s", (type) => {
      const data = { ...validInput(), triggerType: type };
      expect(validateAutomationInput(data)).toBeNull();
    });
  });

  // --- Action type validation ---
  describe("actionType", () => {
    it("rejects invalid action type", () => {
      const data = { ...validInput(), actionType: "INVALID_ACTION" };
      expect(validateAutomationInput(data)).toBe("Invalid action type");
    });

    it.each([
      "SEND_NOTIFICATION",
      "CALCULATE_DURATION",
      "CALCULATE_MULTI_EVENT_DURATION",
      "UPDATE_RECORD_FIELD",
      "SEND_WHATSAPP",
      "WEBHOOK",
      "ADD_TO_NURTURE_LIST",
      "CREATE_TASK",
      "CREATE_RECORD",
      "CREATE_CALENDAR_EVENT",
      "MULTI_ACTION",
    ])("accepts valid action type: %s", (type) => {
      const data = { ...validInput(), actionType: type };
      expect(validateAutomationInput(data)).toBeNull();
    });
  });

  // --- Config size validation ---
  describe("config size", () => {
    it("rejects trigger config over 50KB", () => {
      const data = { ...validInput(), triggerConfig: { big: "x".repeat(51 * 1024) } };
      expect(validateAutomationInput(data)).toBe("Trigger configuration is too large");
    });

    it("rejects action config over 50KB", () => {
      const data = { ...validInput(), actionConfig: { big: "x".repeat(51 * 1024) } };
      expect(validateAutomationInput(data)).toBe("Action configuration is too large");
    });

    it("handles non-serializable trigger config (circular ref)", () => {
      const obj: any = {};
      obj.self = obj;
      const data = { ...validInput(), triggerConfig: obj };
      expect(validateAutomationInput(data)).toBe("Invalid trigger configuration");
    });

    it("handles non-serializable action config (circular ref)", () => {
      const obj: any = {};
      obj.self = obj;
      const data = { ...validInput(), actionConfig: obj };
      expect(validateAutomationInput(data)).toBe("Invalid action configuration");
    });

    it("handles null config gracefully", () => {
      const data = { ...validInput(), triggerConfig: null, actionConfig: null };
      expect(validateAutomationInput(data)).toBeNull();
    });

    it("handles undefined config gracefully", () => {
      const data = { ...validInput(), triggerConfig: undefined, actionConfig: undefined };
      expect(validateAutomationInput(data)).toBeNull();
    });
  });

  // --- Config depth validation ---
  describe("config depth", () => {
    it("rejects trigger config deeper than 5 levels", () => {
      const deep = { a: { b: { c: { d: { e: { f: "too deep" } } } } } };
      const data = { ...validInput(), triggerConfig: deep };
      expect(validateAutomationInput(data)).toBe("Trigger configuration is too deeply nested");
    });

    it("rejects action config deeper than 5 levels", () => {
      const deep = { a: { b: { c: { d: { e: { f: "too deep" } } } } } };
      const data = { ...validInput(), actionConfig: deep };
      expect(validateAutomationInput(data)).toBe("Action configuration is too deeply nested");
    });

    it("accepts config at exactly depth 5", () => {
      const atLimit = { a: { b: { c: { d: { e: "ok" } } } } };
      const data = { ...validInput(), triggerConfig: atLimit, actionConfig: atLimit };
      expect(validateAutomationInput(data)).toBeNull();
    });

    it("handles arrays in depth check", () => {
      const deep = { a: [{ b: { c: { d: { e: { f: "deep" } } } } }] };
      const data = { ...validInput(), triggerConfig: deep };
      expect(validateAutomationInput(data)).toBe("Trigger configuration is too deeply nested");
    });
  });
});

// ─── validateId ──────────────────────────────────────────────────────────

describe("validateId", () => {
  it.each([
    [0, "Invalid ID"],
    [-1, "Invalid ID"],
    [1.5, "Invalid ID"],
    ["abc" as any, "Invalid ID"],
    [null as any, "Invalid ID"],
    [undefined as any, "Invalid ID"],
    [NaN, "Invalid ID"],
    [Infinity, "Invalid ID"],
  ])("rejects invalid id: %s", (id, expected) => {
    expect(validateId(id)).toBe(expected);
  });

  it("accepts positive integer 1", () => {
    expect(validateId(1)).toBeNull();
  });

  it("accepts large positive integer", () => {
    expect(validateId(999999)).toBeNull();
  });
});

// ─── MAX_RULES_PER_COMPANY ──────────────────────────────────────────────

describe("MAX_RULES_PER_COMPANY", () => {
  it("equals 500", () => {
    expect(MAX_RULES_PER_COMPANY).toBe(500);
  });
});
