import { z } from "zod";

const WIDGET_TYPES = [
  "ANALYTICS",
  "TABLE",
  "GOAL",
  "TABLE_VIEWS_DASHBOARD",
  "GOALS_TABLE",
  "ANALYTICS_TABLE",
  "MINI_CALENDAR",
  "MINI_TASKS",
  "MINI_QUOTES",
] as const;

/** Max JSON size for settings field (10 KB) */
const MAX_SETTINGS_SIZE = 10_240;
const MAX_SETTINGS_DEPTH = 10;

/** Check for prototype pollution keys recursively + enforce max depth */
function hasUnsafeKeys(val: unknown, depth = 0): boolean {
  if (depth > MAX_SETTINGS_DEPTH) return true;
  if (val === null || val === undefined || typeof val !== "object") return false;
  if (Array.isArray(val)) {
    return val.some((item) => hasUnsafeKeys(item, depth + 1));
  }
  for (const key of Object.keys(val as Record<string, unknown>)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") return true;
    if (hasUnsafeKeys((val as Record<string, unknown>)[key], depth + 1)) return true;
  }
  return false;
}

const settingsSchema = z
  .any()
  .refine(
    (val) => val === undefined || val === null || JSON.stringify(val).length <= MAX_SETTINGS_SIZE,
    { message: `Settings must be under ${MAX_SETTINGS_SIZE / 1024}KB` },
  )
  .refine(
    (val) => !hasUnsafeKeys(val),
    { message: "Settings contain disallowed keys" },
  );

// ── Widget schemas ──────────────────────────────────────────────────

export const addWidgetSchema = z.object({
  widgetType: z.enum(WIDGET_TYPES),
  referenceId: z.string().max(200).optional(),
  tableId: z.number().int().positive().optional(),
  settings: settingsSchema.optional(),
});

export const updateWidgetSchema = z.object({
  referenceId: z.string().max(200).optional(),
  tableId: z.number().int().positive().optional(),
  settings: settingsSchema.optional(),
});

export const widgetIdSchema = z.string().min(1).max(100);

export const widgetIdsOrderSchema = z.array(z.string().min(1).max(100)).max(200);

export const MAX_WIDGETS_PER_USER = 50;

export const migrateWidgetsSchema = z
  .array(
    z.object({
      widgetType: z.enum(WIDGET_TYPES),
      referenceId: z.string().max(200).optional(),
      tableId: z.number().int().positive().optional(),
      settings: settingsSchema.optional(),
    }),
  )
  .max(MAX_WIDGETS_PER_USER);

// ── Table data schemas ──────────────────────────────────────────────

export const tableViewDataSchema = z.object({
  tableId: z.number().int().positive(),
  viewId: z.union([z.number().int(), z.string().max(200)]),
  bypassCache: z.boolean().optional(),
});

export const customTableSettingsSchema = z.object({
  columns: z.array(z.string().max(200)).max(50).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  sortBy: z.string().max(200).optional(),
});

export const batchTableDataSchema = z.object({
  requests: z
    .array(
      z.object({
        widgetId: z.string().min(1).max(100),
        tableId: z.number().int().positive(),
        viewId: z.union([z.number().int(), z.string().max(200)]),
        settings: customTableSettingsSchema.optional(),
      }),
    )
    .max(50),
  bypassCache: z.boolean().optional(),
});
