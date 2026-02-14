"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import UserModal from "@/components/UserModal";
import AlertDialog from "@/components/AlertDialog";

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

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 30;

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    try {
      const response = await fetch("/api/auth/me");
      if (response.ok) {
        const user = await response.json();
        if (user.role === "admin") {
          setIsAuthorized(true);
          fetchUsers();
          fetchTables();
        } else {
          router.push("/");
        }
      } else {
        router.push("/");
      }
    } catch (error) {
      console.error("Error checking permissions:", error);
      router.push("/");
    }
  };

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/users");
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTables = async () => {
    try {
      const response = await fetch("/api/tables");
      if (response.ok) {
        const data = await response.json();
        setTables(data);
      }
    } catch (error) {
      console.error("Error fetching tables:", error);
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

  const handleDeleteClick = (userId: number) => {
    setDeleteUserId(userId);
  };

  const handleConfirmDelete = async () => {
    if (!deleteUserId) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/users/${deleteUserId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setUsers(users.filter((u) => u.id !== deleteUserId));
        setDeleteUserId(null);
      } else {
        alert("Failed to delete user");
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Error deleting user");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUserSaved = () => {
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

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  // Calculate pagination
  const totalPages = Math.ceil(users.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedUsers = users.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
            onClick={handleCreateUser}
            className="bg-linear-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-xl hover:from-blue-700 hover:to-blue-800 transition shadow-lg font-medium"
          >
            + משתמש חדש
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl shadow-md overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">
                      שם
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">
                      אימייל
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">
                      תפקיד
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">
                      הרשאות נוספות
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">
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
                                  .map(([key]) => {
                                    // Get label from USER_FLAGS
                                    const flagLabels: Record<
                                      string,
                                      { icon: string; color: string }
                                    > = {
                                      canViewAutomations: {
                                        icon: "⚡",
                                        color: "purple",
                                      },
                                      canViewAnalytics: {
                                        icon: "📊",
                                        color: "blue",
                                      },
                                      canViewCalendar: {
                                        icon: "📅",
                                        color: "red",
                                      },
                                      canViewFinance: {
                                        icon: "💰",
                                        color: "emerald",
                                      },
                                      canViewTasks: {
                                        icon: "✅",
                                        color: "teal",
                                      },
                                      canViewNurtureHub: {
                                        icon: "🌱",
                                        color: "green",
                                      },
                                      canViewWorkflows: {
                                        icon: "🔀",
                                        color: "indigo",
                                      },
                                      canViewServices: {
                                        icon: "🏷️",
                                        color: "orange",
                                      },
                                      canViewServiceCalls: {
                                        icon: "🎧",
                                        color: "rose",
                                      },
                                      canViewQuotes: {
                                        icon: "📜",
                                        color: "yellow",
                                      },
                                      canViewFiles: {
                                        icon: "📁",
                                        color: "gray",
                                      },
                                      canViewChat: {
                                        icon: "💬",
                                        color: "cyan",
                                      },
                                      canViewWorkers: {
                                        icon: "👷",
                                        color: "blue",
                                      },
                                      canViewUsers: {
                                        icon: "👥",
                                        color: "purple",
                                      },
                                      canViewDashboard: {
                                        icon: "🏠",
                                        color: "indigo",
                                      },
                                      canViewTables: {
                                        icon: "🗃️",
                                        color: "pink",
                                      },
                                      canCreateTasks: {
                                        icon: "✓",
                                        color: "green",
                                      },
                                      canViewAllTasks: {
                                        icon: "👁",
                                        color: "cyan",
                                      },
                                      canManageTables: {
                                        icon: "🗂",
                                        color: "orange",
                                      },
                                      canManageAnalytics: {
                                        icon: "📈",
                                        color: "pink",
                                      },
                                      canSearchTables: {
                                        icon: "🔍",
                                        color: "indigo",
                                      },
                                      canFilterTables: {
                                        icon: "🔎",
                                        color: "teal",
                                      },
                                      canExportTables: {
                                        icon: "⬇",
                                        color: "amber",
                                      },
                                      canViewGoals: {
                                        icon: "🎯",
                                        color: "green",
                                      },
                                      canViewDashboardData: {
                                        icon: "📋",
                                        color: "indigo",
                                      },
                                    };

                                    const flag = flagLabels[key] || {
                                      icon: "•",
                                      color: "gray",
                                    };

                                    return (
                                      <span
                                        key={key}
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 bg-${flag.color}-50 text-${flag.color}-700 rounded text-xs border border-${flag.color}-200`}
                                        title={key}
                                      >
                                        <span>{flag.icon}</span>
                                      </span>
                                    );
                                  })}
                              {activePermissions > 3 && (
                                <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs border border-gray-200">
                                  +{activePermissions - 3}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">
                              אין הרשאות נוספות
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditUser(user)}
                              className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 transition"
                            >
                              ערוך
                            </button>
                            <button
                              onClick={() => handleDeleteClick(user.id)}
                              className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-700 transition"
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
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    אין משתמשים
                  </h3>
                  <p className="text-gray-600 mb-6">
                    צור את המשתמש הראשון במערכת
                  </p>
                  <button
                    onClick={handleCreateUser}
                    className="inline-block bg-linear-to-r from-blue-600 to-blue-700 text-white py-3 px-8 rounded-xl hover:from-blue-700 hover:to-blue-800 transition shadow-lg font-medium"
                  >
                    + צור משתמש ראשון
                  </button>
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-col items-center gap-4 mt-8 mb-6">
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  {/* First Page Button */}
                  <button
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage <= 1}
                    className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300 text-gray-700 font-medium transition-all duration-200"
                    title="עמוד ראשון"
                  >
                    ⏮ ראשון
                  </button>

                  {/* Previous Button */}
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300 text-gray-700 font-medium transition-all duration-200"
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
                          className={`min-w-10 px-3 py-2 rounded-lg font-medium transition-all duration-200 ${
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
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300 text-gray-700 font-medium transition-all duration-200"
                    title="עמוד הבא"
                  >
                    הבא →
                  </button>

                  {/* Last Page Button */}
                  <button
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage >= totalPages}
                    className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300 text-gray-700 font-medium transition-all duration-200"
                    title="עמוד אחרון"
                  >
                    אחרון ⏭
                  </button>
                </div>

                {/* Page Info */}
                <div className="text-sm text-gray-600 font-medium">
                  עמוד {currentPage} מתוך {totalPages}
                </div>
              </div>
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

      <AlertDialog
        isOpen={deleteUserId !== null}
        onClose={() => setDeleteUserId(null)}
        onConfirm={handleConfirmDelete}
        title="מחק משתמש"
        description="האם אתה בטוח שברצונך למחוק משתמש זה? פעולה זו לא ניתנת לביטול."
        confirmText="מחק"
        cancelText="ביטול"
        isDestructive
      />
    </div>
  );
}
