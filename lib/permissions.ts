export type UserRole = "basic" | "manager" | "admin";

export interface User {
  id: number;
  companyId: number;
  name: string;
  email: string;
  role: UserRole;
  isPremium?: string;
  allowedWriteTableIds: number[];
  permissions?: Record<string, boolean>; // JSON field in DB
  tablePermissions?: Record<string, "read" | "write" | "none">; // JSON field in DB
  company?: {
    name: string;
    slug: string;
  };
}

export const USER_FLAGS = [
  { key: "canViewDashboard", label: "גישה לדאשבורד ראשי" },
  { key: "canViewAutomations", label: "גישה לאוטומציות" },
  { key: "canViewTables", label: "גישה לטבלאות (CRM)" },
  { key: "canViewAnalytics", label: "גישה לניתוח נתונים" },
  { key: "canViewCalendar", label: "גישה ליומן" },
  { key: "canViewFinance", label: "גישה לכספים" },
  { key: "canViewTasks", label: "גישה למשימות" },
  { key: "canViewNurtureHub", label: "גישה לטיפוח לקוחות (CRM)" },
  { key: "canViewWorkflows", label: "גישה לתהליכים" },
  { key: "canViewServices", label: "גישה למוצרים ושירותים" },
  { key: "canViewServiceCalls", label: "גישה לקריאות שירות" },
  { key: "canViewQuotes", label: "גישה להצעות מחיר" },
  { key: "canViewFiles", label: "גישה לקבצים" },
  { key: "canViewChat", label: "גישה לצ׳אט" },
  { key: "canViewWorkers", label: "גישה לניהול עובדים" },
  { key: "canViewUsers", label: "גישה לניהול משתמשים" },
  { key: "canViewGuides", label: "גישה למדריכים" },

  { key: "canCreateTasks", label: "יצירת משימות" },
  { key: "canViewAllTasks", label: "צפייה בכל המשימות" },
  { key: "canManageTables", label: "ניהול טבלאות (יצירה/עריכה/מחיקה)" },
  { key: "canManageAnalytics", label: "ניהול דוחות (יצירה/עריכה/מחיקה)" },
  { key: "canSearchTables", label: "חיפוש בטבלאות" },
  { key: "canFilterTables", label: "שימוש בפילטרים" },
  { key: "canExportTables", label: "ייצוא נתונים לקבצים" },
] as const;

export type UserFlagKey = (typeof USER_FLAGS)[number]["key"];

export function hasUserFlag(user: User, flag: UserFlagKey): boolean {
  if (user.role === "admin") return true; // Admins have all flags implicitly
  return !!user.permissions?.[flag];
}

/**
 * Check if user has read access to a table
 * - admin: can read all tables
 * - manager: can read all tables
 * - basic: can read if tablePermissions[tableId] is 'read' or 'write'
 */
export function canReadTable(user: User, tableId: number): boolean {
  if (user.role === "admin" || user.role === "manager") return true;

  const perm = user.tablePermissions?.[tableId.toString()];
  return perm === "read" || perm === "write";
}

/**
 * Check if user has write access to a table
 * - admin: can write to all tables
 * - manager: can write to tables in allowedWriteTableIds
 * - basic: can write if tablePermissions[tableId] is 'write'
 */
export function canWriteTable(user: User, tableId: number): boolean {
  if (user.role === "admin") {
    return true;
  }
  if (user.role === "manager") {
    return user.allowedWriteTableIds.includes(tableId);
  }

  const perm = user.tablePermissions?.[tableId.toString()];
  return perm === "write";
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
 * Admin or user with canManageTables flag
 */
export function canManageTables(user: User): boolean {
  return hasUserFlag(user, "canManageTables");
}

/**
 * Check if user can create/delete analytics views
 * Admin or user with canManageAnalytics flag
 */
export function canManageAnalytics(user: User): boolean {
  return hasUserFlag(user, "canManageAnalytics");
}
