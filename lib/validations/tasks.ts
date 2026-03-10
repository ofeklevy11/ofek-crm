import { z } from "zod";

export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_TAG_LENGTH = 100;
export const MAX_TAGS_COUNT = 30;

export const VALID_TASK_STATUSES = [
  "todo",
  "in_progress",
  "waiting_client",
  "on_hold",
  "completed_month",
  "done",
] as const;

export const VALID_TASK_PRIORITIES = ["low", "medium", "high"] as const;

const STATUS_LABEL_MAP: Record<string, string> = {
  "to do": "todo",
  "in progress": "in_progress",
  "waiting client": "waiting_client",
  "on hold": "on_hold",
  "completed month": "completed_month",
  "done": "done",
};

const PRIORITY_LABEL_MAP: Record<string, string> = {
  "low": "low",
  "medium": "medium",
  "high": "high",
};

const title = z.string().trim().min(1).max(MAX_TITLE_LENGTH);
const description = z.string().max(MAX_DESCRIPTION_LENGTH).nullable().optional();
const status = z.enum(VALID_TASK_STATUSES);
const priority = z.enum(VALID_TASK_PRIORITIES).nullable().optional();
const tags = z.array(z.string().max(MAX_TAG_LENGTH)).max(MAX_TAGS_COUNT).optional();
const assigneeId = z.number().int().positive().nullable().optional();
const dueDate = z
  .string()
  .nullable()
  .optional()
  .transform((val) => {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? undefined : d;
  })
  .refine((val) => val !== undefined, { message: "Invalid date format" });

export const createTaskSchema = z.object({
  title,
  description,
  status: status.default("todo"),
  assigneeId,
  priority,
  tags,
  dueDate,
});

export const updateTaskSchema = z.object({
  title: title.optional(),
  description,
  status: status.optional(),
  assigneeId,
  priority,
  tags,
  dueDate,
});

export const makeCreateTaskSchema = z.object({
  title,
  description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
  email: z.string().email().optional(),
  status: z.preprocess(
    (val) => {
      if (typeof val !== "string") return val;
      const lower = val.toLowerCase().trim();
      return STATUS_LABEL_MAP[lower] ?? lower;
    },
    status
  ).default("todo"),
  priority: z.preprocess(
    (val) => {
      if (typeof val !== "string") return val;
      const lower = val.toLowerCase().trim();
      return PRIORITY_LABEL_MAP[lower] ?? lower;
    },
    z.enum(VALID_TASK_PRIORITIES)
  ).default("medium"),
  due_date: z
    .string()
    .nullable()
    .optional()
    .transform((val) => {
      if (!val || val === "YYYY-MM-DD") return undefined;
      const d = new Date(val);
      return isNaN(d.getTime()) ? undefined : d;
    }),
});
