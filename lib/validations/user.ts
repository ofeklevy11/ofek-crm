import { z } from "zod";
import { USER_FLAGS } from "@/lib/permissions";

const validFlagKeys = new Set<string>(USER_FLAGS.map((f) => f.key));

export const registerSchema = z.object({
  name: z.string().min(1, "Name is required").max(200).trim(),
  email: z.string().email("Invalid email").max(254).trim().toLowerCase(),
  password: z.string().min(10, "Password must be at least 10 characters").max(128),
  companyName: z.string().min(1, "Company name is required").max(200).trim(),
  isNewCompany: z.boolean(),
}).strict();

export const createUserSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Invalid email").max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  role: z.enum(["basic", "manager", "admin"]).optional(),
  permissions: z
    .record(z.string(), z.boolean())
    .optional()
    .refine(
      (val) =>
        !val || Object.keys(val).every((k) => validFlagKeys.has(k)),
      { message: "Unknown permission key" },
    ),
  tablePermissions: z
    .record(z.string(), z.enum(["read", "write", "none"]))
    .optional()
    .refine(
      (val) =>
        !val || Object.keys(val).every((k) => /^\d+$/.test(k)),
      { message: "Table permission keys must be numeric table IDs" },
    )
    .refine(
      (val) => !val || Object.keys(val).length <= 500,
      { message: "Too many table permission entries (max 500)" },
    ),
  allowedWriteTableIds: z
    .array(z.number().int().nonnegative())
    .max(500)
    .optional(),
}).strict();

export const patchUserSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email("Invalid email").max(254).optional(),
  password: z.string().min(10).max(128).optional(),
  currentPassword: z.string().min(1).max(128).optional(),
  role: z.enum(["basic", "manager", "admin"]).optional(),
  permissions: z
    .record(z.string(), z.boolean())
    .optional()
    .refine(
      (val) =>
        !val || Object.keys(val).every((k) => validFlagKeys.has(k)),
      { message: "Unknown permission key" },
    ),
  tablePermissions: z
    .record(z.string(), z.enum(["read", "write", "none"]))
    .optional()
    .refine(
      (val) =>
        !val || Object.keys(val).every((k) => /^\d+$/.test(k)),
      { message: "Table permission keys must be numeric table IDs" },
    )
    .refine(
      (val) => !val || Object.keys(val).length <= 500,
      { message: "Too many table permission entries (max 500)" },
    ),
  allowedWriteTableIds: z
    .array(z.number().int().nonnegative())
    .max(500)
    .optional(),
}).strict();
