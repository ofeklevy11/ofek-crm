// Canonical status values for all finance models.
// DB CHECK constraints should mirror these (see migration notes).

export const PAYMENT_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  OVERDUE: "overdue",
  CANCELLED: "cancelled",
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export const VALID_PAYMENT_STATUSES = Object.values(PAYMENT_STATUS);

/** Normalizes legacy/variant payment status strings to canonical lowercase values. */
export function normalizePaymentStatus(raw: string): PaymentStatus | null {
  const lower = raw.trim().toLowerCase();
  if (lower === "paid" || lower === "pd" || lower === "manual-marked-paid" || lower === "completed") return PAYMENT_STATUS.PAID;
  if (lower === "pending") return PAYMENT_STATUS.PENDING;
  if (lower === "overdue") return PAYMENT_STATUS.OVERDUE;
  if (lower === "cancelled" || lower === "canceled") return PAYMENT_STATUS.CANCELLED;
  return null;
}

/** All status strings that mean "paid" — for DB queries on legacy data. */
export const PAID_STATUS_VARIANTS = ["paid", "Pd", "PAID", "manual-marked-paid", "completed", "COMPLETED"] as const;

export const RETAINER_STATUS = {
  ACTIVE: "active",
  PAUSED: "paused",
  CANCELLED: "cancelled",
} as const;

export type RetainerStatus = (typeof RETAINER_STATUS)[keyof typeof RETAINER_STATUS];

export const VALID_RETAINER_STATUSES = Object.values(RETAINER_STATUS);

export const FINANCE_RECORD_STATUS = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

export type FinanceRecordStatus = (typeof FINANCE_RECORD_STATUS)[keyof typeof FINANCE_RECORD_STATUS];

export const VALID_FINANCE_RECORD_STATUSES = Object.values(FINANCE_RECORD_STATUS);

export const FIXED_EXPENSE_STATUS = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
} as const;

export type FixedExpenseStatus = (typeof FIXED_EXPENSE_STATUS)[keyof typeof FIXED_EXPENSE_STATUS];

export const VALID_FIXED_EXPENSE_STATUSES = Object.values(FIXED_EXPENSE_STATUS);

export const SYNC_JOB_STATUS = {
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

export type SyncJobStatus = (typeof SYNC_JOB_STATUS)[keyof typeof SYNC_JOB_STATUS];
