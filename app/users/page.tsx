"use client";

import { useState, useEffect } from "react";
import UserModal from "@/components/UserModal";
import AlertDialog from "@/components/AlertDialog";

interface User {
  id: number;
  name: string;
  email: string;
  role: "basic" | "manager" | "admin";
  allowedWriteTableIds: number[];
  createdAt: string;
  updatedAt: string;
}

interface Table {
  id: number;
  name: string;
  slug: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchTables();
  }, []);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              ניהול משתמשים
            </h1>
            <p className="text-gray-600">ניהול משתמשים והרשאות גישה למערכת</p>
          </div>
          <button
            onClick={handleCreateUser}
            className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-xl hover:from-blue-700 hover:to-blue-800 transition shadow-lg font-medium"
          >
            + משתמש חדש
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-md overflow-hidden">
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
                    הרשאות כתיבה
                  </th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">
                    פעולות
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 text-black">{user.name}</td>
                    <td className="px-6 py-4 text-black">{user.email}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor(
                          user.role
                        )}`}
                      >
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-black text-sm">
                      {user.role === "admin" ? (
                        <span className="text-purple-600 font-medium">
                          גישה מלאה לכל הטבלאות
                        </span>
                      ) : user.role === "manager" ? (
                        user.allowedWriteTableIds.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {user.allowedWriteTableIds.map((tableId) => {
                              const table = tables.find(
                                (t) => t.id === tableId
                              );
                              return (
                                <span
                                  key={tableId}
                                  className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs border border-blue-200"
                                >
                                  {table?.name || `#${tableId}`}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-gray-500">
                            אין הרשאות כתיבה
                          </span>
                        )
                      ) : (
                        <span className="text-gray-500">קריאה בלבד</span>
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
                ))}
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
                  className="inline-block bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-8 rounded-xl hover:from-blue-700 hover:to-blue-800 transition shadow-lg font-medium"
                >
                  + צור משתמש ראשון
                </button>
              </div>
            )}
          </div>
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
