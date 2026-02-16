"use server";

// Only auth-protected CRUD server actions are exposed here.
// Internal processing functions live in automations-core.ts
// and are NOT server actions (cannot be called from the client).
import * as core from "./automations-core";

export async function getAutomationRules(...args: Parameters<typeof core.getAutomationRules>) {
  return core.getAutomationRules(...args);
}

export async function createAutomationRule(...args: Parameters<typeof core.createAutomationRule>) {
  return core.createAutomationRule(...args);
}

export async function updateAutomationRule(...args: Parameters<typeof core.updateAutomationRule>) {
  return core.updateAutomationRule(...args);
}

export async function deleteAutomationRule(...args: Parameters<typeof core.deleteAutomationRule>) {
  return core.deleteAutomationRule(...args);
}

export async function toggleAutomationRule(...args: Parameters<typeof core.toggleAutomationRule>) {
  return core.toggleAutomationRule(...args);
}

export async function getViewAutomations(...args: Parameters<typeof core.getViewAutomations>) {
  return core.getViewAutomations(...args);
}

export async function getAnalyticsAutomationsActionCount() {
  return core.getAnalyticsAutomationsActionCount();
}
