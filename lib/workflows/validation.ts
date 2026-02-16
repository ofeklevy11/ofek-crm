import { z } from "zod";

// ── String limits ──────────────────────────────────────────────────────
const name = z.string().min(1).max(200);
const description = z.string().max(2000).optional();
const color = z.string().max(30).optional();
const icon = z.string().max(50).optional();
const positiveInt = z.number().int().positive();

// ── Details JSON — cap total serialized size and ban __proto__ keys ───
const MAX_DETAILS_SIZE = 64_000; // 64 KB

function safeDetails(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  const json = JSON.stringify(val);
  if (json.length > MAX_DETAILS_SIZE) return false;
  if (/"(__proto__|constructor|prototype)"\s*:/.test(json)) return false;
  // Depth check: simple recursive walk — bail at depth 10
  function depth(obj: unknown, d: number): boolean {
    if (d > 10) return false;
    if (Array.isArray(obj)) return obj.every((v) => depth(v, d + 1));
    if (obj && typeof obj === "object") return Object.values(obj).every((v) => depth(v, d + 1));
    return true;
  }
  return depth(val, 0);
}

const details = z.any().optional().refine(safeDetails, {
  message: "details too large, too deeply nested, or contains forbidden keys",
});

// ── Schemas ────────────────────────────────────────────────────────────

export const createWorkflowSchema = z.object({
  name,
  description,
  color,
  icon,
});

export const updateWorkflowSchema = z.object({
  name: name.optional(),
  description,
  color,
  icon,
});

export const createStageSchema = z.object({
  name,
  description,
  color,
  icon,
  details,
});

export const updateStageSchema = z.object({
  name: name.optional(),
  description,
  color,
  icon,
  details,
  order: z.number().int().min(0).optional(),
});

export const reorderStagesSchema = z.object({
  workflowId: positiveInt,
  orderedIds: z.array(positiveInt).min(1).max(500),
});

export const createWorkflowInstanceSchema = z.object({
  workflowId: positiveInt,
  name,
  assigneeId: positiveInt.optional(),
});

export const updateWorkflowInstanceSchema = z.object({
  name: name.optional(),
  assigneeId: z.union([positiveInt, z.null()]).optional(),
});

export const VALID_INSTANCE_STATUSES = ["active", "completed"] as const;
export const instanceStatusSchema = z.enum(VALID_INSTANCE_STATUSES).optional();
