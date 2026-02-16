"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api-fetch";

import { USER_FLAGS } from "@/lib/permissions";

interface UserModalProps {
  user: {
    id: number;
    name: string;
    email: string;
    role: "basic" | "manager" | "admin";
    allowedWriteTableIds: number[];
    permissions?: Record<string, boolean>;
    tablePermissions?: Record<string, "read" | "write" | "none">;
  } | null;
  tables: {
    id: number;
    name: string;
    slug: string;
  }[];
  onClose: () => void;
  onSave: () => void;
}

export default function UserModal({
  user,
  tables,
  onClose,
  onSave,
}: UserModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "basic" as "basic" | "manager" | "admin",
    allowedWriteTableIds: [] as number[],
    permissions: {} as Record<string, boolean>,
    tablePermissions: {} as Record<string, "read" | "write" | "none">,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name,
        email: user.email,
        password: "", // Don't pre-fill password
        role: user.role,
        allowedWriteTableIds: user.allowedWriteTableIds,
        permissions: user.permissions || {},
        tablePermissions: user.tablePermissions || {},
      });
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!formData.name || !formData.email) {
      setError("שם ואימייל הם שדות חובה");
      return;
    }

    if (!user && !formData.password) {
      setError("סיסמה נדרשת ליצירת משתמש חדש");
      return;
    }

    setIsSaving(true);

    try {
      const url = user ? `/api/users/${user.id}` : "/api/users";
      const method = user ? "PATCH" : "POST";

      const body: any = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        allowedWriteTableIds: formData.allowedWriteTableIds,
        permissions: formData.permissions,
        tablePermissions: formData.tablePermissions,
      };

      // Only include password if it's set
      if (formData.password) {
        body.password = formData.password;
      }

      const response = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save user");
      }

      onSave();
    } catch (err: any) {
      setError(err.message || "שגיאה בשמירת המשתמש");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTableToggle = (tableId: number) => {
    setFormData((prev) => ({
      ...prev,
      allowedWriteTableIds: prev.allowedWriteTableIds.includes(tableId)
        ? prev.allowedWriteTableIds.filter((id) => id !== tableId)
        : [...prev.allowedWriteTableIds, tableId],
    }));
  };

  const handlePermissionToggle = (key: string) => {
    setFormData((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key],
      },
    }));
  };

  const handleTablePermissionChange = (
    tableId: number,
    permission: "read" | "write" | "none"
  ) => {
    setFormData((prev) => ({
      ...prev,
      tablePermissions: {
        ...prev.tablePermissions,
        [tableId]: permission,
      },
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            {user ? "ערוך משתמש" : "משתמש חדש"}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              שם <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
              placeholder="שם מלא"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              אימייל <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
              placeholder="email@example.com"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              סיסמה {!user && <span className="text-red-500">*</span>}
              {user && (
                <span className="text-gray-500 text-xs mr-2">
                  (השאר ריק כדי לא לשנות)
                </span>
              )}
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
              placeholder="••••••••"
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              תפקיד
            </label>
            <div className="space-y-3">
              <label className="flex items-start gap-3 p-4 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition">
                <input
                  type="radio"
                  name="role"
                  value="basic"
                  checked={formData.role === "basic"}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      role: e.target.value as any,
                      allowedWriteTableIds: [],
                    })
                  }
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-gray-900">בסיסי (Basic)</div>
                  <div className="text-sm text-gray-600">
                    קריאה בלבד לכל הטבלאות, ללא הרשאות כתיבה
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition">
                <input
                  type="radio"
                  name="role"
                  value="manager"
                  checked={formData.role === "manager"}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      role: e.target.value as any,
                    })
                  }
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-gray-900">
                    מנהל (Manager)
                  </div>
                  <div className="text-sm text-gray-600">
                    קריאה לכל הטבלאות, כתיבה לטבלאות נבחרות
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition">
                <input
                  type="radio"
                  name="role"
                  value="admin"
                  checked={formData.role === "admin"}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      role: e.target.value as any,
                      allowedWriteTableIds: [],
                    })
                  }
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-gray-900">אדמין (Admin)</div>
                  <div className="text-sm text-gray-600">
                    גישה מלאה לכל הטבלאות - קריאה וכתיבה
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Flags / Permissions - Only for non-admins */}
          {formData.role !== "admin" && (
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-3">
                הרשאות נוספות
              </label>
              <div className="space-y-4 bg-gray-50 p-5 rounded-lg border border-gray-200">
                {/* Navigation Permissions */}
                <div className="bg-white p-4 rounded-lg border border-blue-100">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <span className="text-blue-600">🧭</span>
                    הרשאות ניווט וגישה למודולים
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      "canViewTables",
                      "canViewAutomations",
                      "canViewAnalytics",
                      "canViewCalendar",
                      "canViewFinance",
                      "canViewTasks",
                      "canViewNurtureHub",
                      "canViewWorkflows",
                      "canViewServices",
                      "canViewServiceCalls",
                      "canViewQuotes",
                      "canViewFiles",
                      "canViewChat",
                      "canViewWorkers",
                      "canViewUsers",
                      "canViewDashboard",
                      "canViewGoals",
                      "canViewDashboardData",
                    ].map((key) => {
                      const flag = USER_FLAGS.find((f) => f.key === key);
                      if (!flag) return null;
                      return (
                        <label
                          key={flag.key}
                          className="flex items-start gap-3 cursor-pointer hover:bg-blue-50 p-2 rounded transition"
                        >
                          <input
                            type="checkbox"
                            checked={!!formData.permissions[flag.key]}
                            onChange={() => handlePermissionToggle(flag.key)}
                            className="rounded w-4 h-4 text-blue-600 mt-0.5"
                          />
                          <span className="text-gray-900 text-sm">
                            {flag.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Management Permissions */}
                <div className="bg-white p-4 rounded-lg border border-green-100">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <span className="text-green-600">⚙️</span>
                    הרשאות ניהול ותפעול
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {[
                      "canCreateTasks",
                      "canViewAllTasks",
                      "canManageTables",
                      "canManageAnalytics",
                    ].map((key) => {
                      const flag = USER_FLAGS.find((f) => f.key === key);
                      if (!flag) return null;
                      return (
                        <label
                          key={flag.key}
                          className="flex items-start gap-3 cursor-pointer hover:bg-green-50 p-2 rounded transition"
                        >
                          <input
                            type="checkbox"
                            checked={!!formData.permissions[flag.key]}
                            onChange={() => handlePermissionToggle(flag.key)}
                            className="rounded w-4 h-4 text-green-600 mt-0.5"
                          />
                          <span className="text-gray-900 text-sm">
                            {flag.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Table Operations */}
                <div className="bg-white p-4 rounded-lg border border-purple-100">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <span className="text-purple-600">🔧</span>
                    פעולות בטבלאות (שהמשתמש מורשה לצפות בהן)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {[
                      "canSearchTables",
                      "canFilterTables",
                      "canExportTables",
                    ].map((key) => {
                      const flag = USER_FLAGS.find((f) => f.key === key);
                      if (!flag) return null;
                      return (
                        <label
                          key={flag.key}
                          className="flex items-start gap-3 cursor-pointer hover:bg-purple-50 p-2 rounded transition"
                        >
                          <input
                            type="checkbox"
                            checked={!!formData.permissions[flag.key]}
                            onChange={() => handlePermissionToggle(flag.key)}
                            className="rounded w-4 h-4 text-purple-600 mt-0.5"
                          />
                          <span className="text-gray-900 text-sm">
                            {flag.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Table Permissions (for managers) */}
          {formData.role === "manager" && (
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                הרשאות כתיבה לטבלאות
              </label>
              <div className="border border-gray-300 rounded-lg p-4 max-h-64 overflow-y-auto space-y-2">
                {tables.length === 0 ? (
                  <p className="text-gray-500 text-sm">אין טבלאות זמינות</p>
                ) : (
                  tables.map((table) => (
                    <label
                      key={table.id}
                      className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={formData.allowedWriteTableIds.includes(
                          table.id
                        )}
                        onChange={() => handleTableToggle(table.id)}
                        className="rounded"
                      />
                      <div className="flex-1">
                        <div className="text-black font-medium">
                          {table.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {table.slug}
                        </div>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Table Permissions (for basic users) */}
          {formData.role === "basic" && (
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                הרשאות לטבלאות
              </label>
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <div className="bg-gray-50 border-b border-gray-200 grid grid-cols-12 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <div className="col-span-6">שם טבלה</div>
                  <div className="col-span-2 text-center">ללא גישה</div>
                  <div className="col-span-2 text-center">קריאה בלבד</div>
                  <div className="col-span-2 text-center">קריאה וכתיבה</div>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-gray-200">
                  {tables.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      אין טבלאות זמינות
                    </div>
                  ) : (
                    tables.map((table) => {
                      const perm =
                        formData.tablePermissions[table.id] || "none";
                      return (
                        <div
                          key={table.id}
                          className="grid grid-cols-12 items-center px-4 py-2 hover:bg-gray-50 transition"
                        >
                          <div className="col-span-6">
                            <div className="text-sm font-medium text-gray-900">
                              {table.name}
                            </div>
                            <div className="text-xs text-gray-500">
                              {table.slug}
                            </div>
                          </div>
                          <div className="col-span-2 flex justify-center">
                            <input
                              type="radio"
                              name={`perm-${table.id}`}
                              checked={perm === "none"}
                              onChange={() =>
                                handleTablePermissionChange(table.id, "none")
                              }
                              className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300"
                            />
                          </div>
                          <div className="col-span-2 flex justify-center">
                            <input
                              type="radio"
                              name={`perm-${table.id}`}
                              checked={perm === "read"}
                              onChange={() =>
                                handleTablePermissionChange(table.id, "read")
                              }
                              className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300"
                            />
                          </div>
                          <div className="col-span-2 flex justify-center">
                            <input
                              type="radio"
                              name={`perm-${table.id}`}
                              checked={perm === "write"}
                              onChange={() =>
                                handleTablePermissionChange(table.id, "write")
                              }
                              className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300"
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium disabled:opacity-50"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 px-6 py-3 bg-linear-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition shadow-lg font-medium disabled:opacity-50"
            >
              {isSaving ? "שומר..." : user ? "עדכן" : "צור"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
