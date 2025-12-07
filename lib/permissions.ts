export type UserRole = "basic" | "manager" | "admin";

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  allowedWriteTableIds: number[];
  permissions?: Record<string, boolean>; // JSON field in DB
}

export const USER_FLAGS = [
  { key: "canViewAutomations", label: "גישה לאוטומציות" },
  { key: "canViewAnalytics", label: "גישה לניתוח נתונים" },
] as const;

export type UserFlagKey = (typeof USER_FLAGS)[number]["key"];

export function hasUserFlag(user: User, flag: UserFlagKey): boolean {
  if (user.role === "admin") return true; // Admins have all flags implicitly
  return !!user.permissions?.[flag];
}

/**
 * Check if user has read access to a table
 * All roles have read access to all tables
 */
export function canReadTable(user: User, tableId: number): boolean {
  return true; // All users can read all tables
}

/**
 * Check if user has write access to a table
 * - admin: can write to all tables
 * - manager: can write to tables in allowedWriteTableIds
 * - basic: cannot write to any table
 */
export function canWriteTable(user: User, tableId: number): boolean {
  if (user.role === "admin") {
    return true;
  }
  if (user.role === "manager") {
    return user.allowedWriteTableIds.includes(tableId);
  }
  return false; // basic users have no write access
}

/**
 * Check if user can manage other users
 * Only admin can manage users
 */
export function canManageUsers(user: User): boolean {
  return user.role === "admin";
}

/**
 * Check if user can create/delete tables
 * Only admin can manage tables
 */
export function canManageTables(user: User): boolean {
  return user.role === "admin";
}
