"use client";

import { useState, useEffect, useRef } from "react";
import UserModal from "@/components/UserModal";
import { showConfirm } from "@/hooks/use-modal";
import { apiFetch } from "@/lib/api-fetch";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";
import RateLimitFallback from "@/components/RateLimitFallback";
import { Spinner } from "@/components/ui/spinner";
import { USER_FLAGS } from "@/lib/permissions";

interface User {
  id: number;
  name: string;
  email: string;
  role: "basic" | "manager" | "admin";
  allowedWriteTableIds: number[];
  permissions?: Record<string, boolean>;
  tablePermissions?: Record<string, "read" | "write" | "none">;
  createdAt: string;
  updatedAt: string;
}

interface Table {
  id: number;
  name: string;
  slug: string;
}

const FLAG_LABELS: Record<string, { icon: string; className: string }> = {
  canViewAutomations: { icon: "⚡", className: "bg-purple-50 text-purple-700 border-purple-200" },
  canViewAnalytics: { icon: "📊", className: "bg-blue-50 text-blue-700 border-blue-200" },
  canViewCalendar: { icon: "📅", className: "bg-red-50 text-red-700 border-red-200" },
  canViewFinance: { icon: "💰", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  canViewTasks: { icon: "✅", className: "bg-teal-50 text-teal-700 border-teal-200" },
  canViewNurtureHub: { icon: "🌱", className: "bg-green-50 text-green-700 border-green-200" },
  canViewWorkflows: { icon: "🔀", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  canViewServices: { icon: "🏷️", className: "bg-orange-50 text-orange-700 border-orange-200" },
  canViewServiceCalls: { icon: "🎧", className: "bg-rose-50 text-rose-700 border-rose-200" },
  canViewQuotes: { icon: "📜", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  canViewFiles: { icon: "📁", className: "bg-gray-50 text-gray-700 border-gray-200" },
  canViewChat: { icon: "💬", className: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  canViewWorkers: { icon: "👷", className: "bg-blue-50 text-blue-700 border-blue-200" },
  canViewUsers: { icon: "👥", className: "bg-purple-50 text-purple-700 border-purple-200" },
  canViewDashboard: { icon: "🏠", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  canViewTables: { icon: "🗃️", className: "bg-pink-50 text-pink-700 border-pink-200" },
  canCreateTasks: { icon: "✓", className: "bg-green-50 text-green-700 border-green-200" },
  canViewAllTasks: { icon: "👁", className: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  canManageTables: { icon: "🗂", className: "bg-orange-50 text-orange-700 border-orange-200" },
  canManageAnalytics: { icon: "📈", className: "bg-pink-50 text-pink-700 border-pink-200" },
  canSearchTables: { icon: "🔍", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  canFilterTables: { icon: "🔎", className: "bg-teal-50 text-teal-700 border-teal-200" },
  canExportTables: { icon: "⬇", className: "bg-amber-50 text-amber-700 border-amber-200" },
  canViewGoals: { icon: "🎯", className: "bg-green-50 text-green-700 border-green-200" },
  canViewDashboardData: { icon: "📋", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasChangedPage, setHasChangedPage] = useState(false);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const pageSize = 30;

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchUsers(), fetchTables()]);
      setIsLoading(false);
    };
    loadData();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/users");
      if (response.status === 429) { setRateLimited(true); return; }
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error(getUserFriendlyError(error));
    }
  };

  const fetchTables = async () => {
    try {
      const response = await fetch("/api/tables");
      if (response.status === 429) { setRateLimited(true); return; }
      if (response.ok) {
        const json = await response.json();
        setTables(json.data ?? json);
      }
    } catch (error) {
      console.error("Error fetching tables:", error);
      toast.error(getUserFriendlyError(error));
    }
  };

  const handleCreateUser = () => {
    setEditingUser(null);
    setIsModalOpen(true);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setIsModalOpen(true);
  };

  const handleDeleteClick = async (userId: number) => {
    if (!(await showConfirm({ message: "האם אתה בטוח שברצונך למחוק משתמש זה? פעולה זו לא ניתנת לביטול.", variant: "destructive" }))) return;

    try {
      const response = await apiFetch(`/api/users/${userId}`, {
        method: "DELETE",
      });

      if (response.status === 429) { setRateLimited(true); return; }
      if (response.ok) {
        setUsers(prev => prev.filter((u) => u.id !== userId));
        toast.success("המשתמש נמחק בהצלחה");
        createButtonRef.current?.focus();
      } else {
        toast.error("שגיאה במחיקת המשתמש");
      }
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    }
  };

  const handleUserSaved = () => {
    toast.success(editingUser ? "המשתמש עודכן בהצלחה" : "המשתמש נוצר בהצלחה");
    fetchUsers();
    setIsModalOpen(false);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-purple-100 text-purple-800 border-purple-300";
      case "manager":
        return "bg-blue-100 text-blue-800 border-blue-300";
      case "basic":
        return "bg-gray-100 text-gray-800 border-gray-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "admin":
        return "אדמין";
      case "manager":
        return "מנהל";
      case "basic":
        return "בסיסי";
      default:
        return role;
    }
  };

  if (rateLimited) {
    return <RateLimitFallback />;
  }

  // Calculate pagination
  const totalPages = Math.ceil(users.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedUsers = users.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setHasChangedPage(true);
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "instant" : "smooth" });
  };

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxPagesToShow = 7;

    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      if (currentPage > 3) {
        pages.push("...");
      }

      const startPage = Math.max(2, currentPage - 1);
      const endPage = Math.min(totalPages - 1, currentPage + 1);

      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push("...");
      }

      pages.push(totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              ניהול משתמשים
            </h1>
            <p className="text-gray-600">ניהול משתמשים והרשאות גישה למערכת</p>
          </div>
          <button
            ref={createButtonRef}
            onClick={handleCreateUser}
            className="bg-linear-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-xl hover:from-blue-700 hover:to-blue-800 transition shadow-lg font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            + משתמש חדש
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <Spinner size="xl" />
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl shadow-md overflow-x-auto">
              <table className="w-full">
                <caption className="sr-only">טבלת משתמשים</caption>
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th scope="col" className="px-6 py-4 text-right text-sm font-semibold text-gray-900">
                      שם
                    </th>
                    <th scope="col" className="px-6 py-4 text-right text-sm font-semibold text-gray-900">
                      אימייל
                    </th>
                    <th scope="col" className="px-6 py-4 text-right text-sm font-semibold text-gray-900">
                      תפקיד
                    </th>
                    <th scope="col" className="px-6 py-4 text-right text-sm font-semibold text-gray-900">
                      הרשאות נוספות
                    </th>
                    <th scope="col" className="px-6 py-4 text-right text-sm font-semibold text-gray-900">
                      פעולות
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedUsers.map((user) => {
                    // Count active permissions
                    const activePermissions = user.permissions
                      ? Object.values(user.permissions).filter(Boolean).length
                      : 0;

                    return (
                      <tr key={user.id} className="hover:bg-gray-50 transition">
                        <td className="px-6 py-4 text-black">{user.name}</td>
                        <td className="px-6 py-4 text-black">{user.email}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor(
                              user.role,
                            )}`}
                          >
                            {getRoleLabel(user.role)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {user.role === "admin" ? (
                            <span className="text-purple-600 font-medium flex items-center gap-2">
                              <svg
                                className="w-4 h-4"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                                aria-hidden="true"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              כל ההרשאות
                            </span>
                          ) : activePermissions > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-md">
                              {user.permissions &&
                                Object.entries(user.permissions)
                                  .filter(([_, value]) => value)
                                  .slice(0, 3)
                                  .map(([key]) => {
                                    const flag = FLAG_LABELS[key] || {
                                      icon: "•",
                                      className: "bg-gray-50 text-gray-700 border-gray-200",
                                    };
                                    const flagLabel = USER_FLAGS.find((f) => f.key === key)?.label || key;

                                    return (
                                      <span
                                        key={key}
                                        role="img"
                                        aria-label={flagLabel}
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${flag.className}`}
                                        title={flagLabel}
                                      >
                                        <span>{flag.icon}</span>
                                      </span>
                                    );
                                  })}
                              {activePermissions > 3 && (
                                <span role="img" className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs border border-gray-200" aria-label={`ו-${activePermissions - 3} הרשאות נוספות`}>
                                  +{activePermissions - 3}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-500 text-xs">
                              אין הרשאות נוספות
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditUser(user)}
                              aria-label={`ערוך משתמש ${user.name}`}
                              className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                            >
                              ערוך
                            </button>
                            <button
                              onClick={() => handleDeleteClick(user.id)}
                              aria-label={`מחק משתמש ${user.name}`}
                              className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                            >
                              מחק
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {users.length === 0 && (
                <div className="text-center py-16">
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">
                    אין משתמשים
                  </h2>
                  <p className="text-gray-600 mb-6">
                    צור את המשתמש הראשון במערכת
                  </p>
                  <button
                    onClick={handleCreateUser}
                    className="inline-block bg-linear-to-r from-blue-600 to-blue-700 text-white py-3 px-8 rounded-xl hover:from-blue-700 hover:to-blue-800 transition shadow-lg font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    + צור משתמש ראשון
                  </button>
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <nav aria-label="ניווט עמודים" className="flex flex-col items-center gap-4 mt-8 mb-6">
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  {/* First Page Button */}
                  <button
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage <= 1}
                    aria-label="עמוד ראשון"
                    className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300 text-gray-700 font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    title="עמוד ראשון"
                  >
                    ⏮ ראשון
                  </button>

                  {/* Previous Button */}
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                    aria-label="עמוד קודם"
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300 text-gray-700 font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    title="עמוד קודם"
                  >
                    ← הקודם
                  </button>

                  {/* Page Numbers */}
                  <div className="flex items-center gap-1">
                    {pageNumbers.map((page, index) => {
                      if (page === "...") {
                        return (
                          <span
                            key={`ellipsis-${index}`}
                            className="px-2 text-gray-500"
                            aria-hidden="true"
                          >
                            ...
                          </span>
                        );
                      }

                      const pageNum = page as number;
                      const isActive = pageNum === currentPage;

                      return (
                        <button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          aria-label={`עמוד ${pageNum}`}
                          aria-current={isActive ? "page" : undefined}
                          className={`min-w-10 px-3 py-2 rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                            isActive
                              ? "bg-blue-600 text-white shadow-md scale-105"
                              : "border border-gray-300 text-gray-700 hover:bg-blue-50 hover:border-blue-400"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  {/* Next Button */}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    aria-label="עמוד הבא"
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300 text-gray-700 font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    title="עמוד הבא"
                  >
                    הבא →
                  </button>

                  {/* Last Page Button */}
                  <button
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage >= totalPages}
                    aria-label="עמוד אחרון"
                    className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300 text-gray-700 font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    title="עמוד אחרון"
                  >
                    אחרון ⏭
                  </button>
                </div>

                {/* Page Info / Live Region */}
                <div aria-live="polite" className="text-sm text-gray-600 font-medium">
                  {hasChangedPage && `מציג משתמשים ${startIndex + 1} עד ${Math.min(endIndex, users.length)} מתוך ${users.length}`}
                </div>
              </nav>
            )}
          </>
        )}
      </div>

      {isModalOpen && (
        <UserModal
          user={editingUser}
          tables={tables}
          onClose={() => setIsModalOpen(false)}
          onSave={handleUserSaved}
        />
      )}

    </div>
  );
}
