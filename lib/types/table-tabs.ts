// ============================================
// Multi-Tab Table System — Shared Types & Helpers
// ============================================

export interface TabDefinition {
  id: string;
  label: string;
  order: number;
}

export interface TabsConfig {
  enabled: boolean;
  tabs: TabDefinition[];
}

export interface DisplayConfig {
  visibleColumns: string[];  // field names to show in table overview
  columnOrder: string[];     // field names in display order
}

/** SchemaField extended with optional tab assignment */
export interface SchemaFieldWithTab {
  name: string;
  type: string;
  label: string;
  options?: string[];
  optionColors?: Record<string, string>;
  relationTableId?: number;
  displayField?: string;
  min?: number;
  max?: number;
  tab?: string; // tab ID this field belongs to
  [key: string]: unknown;
}

// ============================================
// Helpers
// ============================================

/** Generate a short random tab ID */
export function generateTabId(): string {
  return `tab_${Math.random().toString(36).substring(2, 8)}`;
}

/** Get fields assigned to a specific tab (or unassigned fields if tabId is null) */
export function getFieldsForTab(
  fields: SchemaFieldWithTab[],
  tabId: string | null,
): SchemaFieldWithTab[] {
  if (tabId === null) {
    return fields.filter((f) => !f.tab);
  }
  return fields.filter((f) => f.tab === tabId);
}

/** Max data columns visible in table overview (excludes ID, checkbox, files, dates) */
const MAX_VISIBLE_DATA_COLUMNS = 12;

/**
 * Compute which fields should be visible in the table overview.
 * Uses displayConfig if set, otherwise returns first MAX_VISIBLE_DATA_COLUMNS fields.
 */
export function getVisibleColumns(
  allFields: SchemaFieldWithTab[],
  displayConfig: DisplayConfig | null,
): SchemaFieldWithTab[] {
  if (displayConfig && displayConfig.visibleColumns.length > 0) {
    const nameSet = new Set(displayConfig.visibleColumns);
    // Build ordered list: use columnOrder if provided, else preserve visibleColumns order
    const orderList = displayConfig.columnOrder.length > 0
      ? displayConfig.columnOrder
      : displayConfig.visibleColumns;
    const ordered: SchemaFieldWithTab[] = [];
    for (const name of orderList) {
      if (nameSet.has(name)) {
        const field = allFields.find((f) => f.name === name);
        if (field) ordered.push(field);
      }
    }
    // Add any visible columns not in orderList (safety net)
    for (const name of displayConfig.visibleColumns) {
      if (!ordered.some((f) => f.name === name)) {
        const field = allFields.find((f) => f.name === name);
        if (field) ordered.push(field);
      }
    }
    return ordered.slice(0, MAX_VISIBLE_DATA_COLUMNS);
  }
  // Default: first N fields
  return allFields.slice(0, MAX_VISIBLE_DATA_COLUMNS);
}

// ============================================
// Safe Parsers (handle null / malformed JSON)
// ============================================

export function parseTabsConfig(raw: unknown): TabsConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.enabled !== "boolean") return null;
  if (!Array.isArray(obj.tabs)) return null;
  const tabs: TabDefinition[] = [];
  for (const t of obj.tabs) {
    if (
      t && typeof t === "object" &&
      typeof (t as any).id === "string" &&
      typeof (t as any).label === "string" &&
      typeof (t as any).order === "number"
    ) {
      tabs.push({ id: (t as any).id, label: (t as any).label, order: (t as any).order });
    }
  }
  return { enabled: obj.enabled as boolean, tabs: tabs.sort((a, b) => a.order - b.order) };
}

export function parseDisplayConfig(raw: unknown): DisplayConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.visibleColumns)) return null;
  const visibleColumns = (obj.visibleColumns as unknown[]).filter(
    (v): v is string => typeof v === "string",
  );
  const columnOrder = Array.isArray(obj.columnOrder)
    ? (obj.columnOrder as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  if (visibleColumns.length === 0) return null;
  return { visibleColumns, columnOrder };
}

// ============================================
// Validation Constants
// ============================================

export const MAX_TABS = 20;
export const MAX_VISIBLE_COLUMNS = 12;
export const MAX_COLUMNS_PER_TABLE = 50;
export const MAX_TABS_CONFIG_SIZE = 10_000;   // 10KB
export const MAX_DISPLAY_CONFIG_SIZE = 5_000; // 5KB
