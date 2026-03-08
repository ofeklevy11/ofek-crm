import { describe, it, expect } from "vitest";
import {
  getAutomationCategoryLimit,
  getActionsPerAutomationLimit,
  getCategoryForTriggerType,
  getTriggerTypesForCategory,
  AUTOMATION_CATEGORY_LIMITS,
  ACTIONS_PER_AUTOMATION_LIMITS,
  MAX_RULES_PER_COMPANY,
  MAX_PER_MEETING_AUTOMATIONS,
} from "@/lib/plan-limits";

describe("plan-limits", () => {
  describe("getAutomationCategoryLimit", () => {
    it("returns 2 for basic", () => {
      expect(getAutomationCategoryLimit("basic")).toBe(2);
    });

    it("returns 6 for premium", () => {
      expect(getAutomationCategoryLimit("premium")).toBe(6);
    });

    it("returns Infinity for super", () => {
      expect(getAutomationCategoryLimit("super")).toBe(Infinity);
    });

    it("falls back to basic for null", () => {
      expect(getAutomationCategoryLimit(null)).toBe(2);
    });

    it("falls back to basic for undefined", () => {
      expect(getAutomationCategoryLimit(undefined)).toBe(2);
    });

    it("falls back to basic for unknown tier", () => {
      expect(getAutomationCategoryLimit("enterprise")).toBe(2);
    });
  });

  describe("getActionsPerAutomationLimit", () => {
    it("returns 2 for basic", () => {
      expect(getActionsPerAutomationLimit("basic")).toBe(2);
    });

    it("returns 6 for premium", () => {
      expect(getActionsPerAutomationLimit("premium")).toBe(6);
    });

    it("returns Infinity for super", () => {
      expect(getActionsPerAutomationLimit("super")).toBe(Infinity);
    });

    it("falls back to basic for unknown tier", () => {
      expect(getActionsPerAutomationLimit("unknown")).toBe(2);
    });
  });

  describe("getCategoryForTriggerType", () => {
    it("maps TASK_STATUS_CHANGE to general", () => {
      expect(getCategoryForTriggerType("TASK_STATUS_CHANGE")).toBe("general");
    });

    it("maps RECORD_CREATE to general", () => {
      expect(getCategoryForTriggerType("RECORD_CREATE")).toBe("general");
    });

    it("maps SLA_BREACH to general", () => {
      expect(getCategoryForTriggerType("SLA_BREACH")).toBe("general");
    });

    it("maps MEETING_BOOKED to meeting", () => {
      expect(getCategoryForTriggerType("MEETING_BOOKED")).toBe("meeting");
    });

    it("maps MEETING_CANCELLED to meeting", () => {
      expect(getCategoryForTriggerType("MEETING_CANCELLED")).toBe("meeting");
    });

    it("maps MEETING_REMINDER to meeting", () => {
      expect(getCategoryForTriggerType("MEETING_REMINDER")).toBe("meeting");
    });

    it("maps EVENT_TIME to event", () => {
      expect(getCategoryForTriggerType("EVENT_TIME")).toBe("event");
    });

    it("defaults unknown trigger types to general", () => {
      expect(getCategoryForTriggerType("UNKNOWN_TYPE")).toBe("general");
    });
  });

  describe("getTriggerTypesForCategory", () => {
    it("returns meeting trigger types", () => {
      const types = getTriggerTypesForCategory("meeting");
      expect(types).toContain("MEETING_BOOKED");
      expect(types).toContain("MEETING_CANCELLED");
      expect(types).toContain("MEETING_REMINDER");
    });

    it("returns event trigger types", () => {
      const types = getTriggerTypesForCategory("event");
      expect(types).toContain("EVENT_TIME");
    });

    it("returns general trigger types", () => {
      const types = getTriggerTypesForCategory("general");
      expect(types).toContain("TASK_STATUS_CHANGE");
      expect(types).toContain("MANUAL");
      expect(types).toContain("SLA_BREACH");
    });
  });

  describe("constants", () => {
    it("MAX_RULES_PER_COMPANY is 500", () => {
      expect(MAX_RULES_PER_COMPANY).toBe(500);
    });

    it("MAX_PER_MEETING_AUTOMATIONS is 10", () => {
      expect(MAX_PER_MEETING_AUTOMATIONS).toBe(10);
    });
  });
});
