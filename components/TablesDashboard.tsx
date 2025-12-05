"use client";

import { useState } from "react";
import Link from "next/link";
import TableCard from "@/components/TableCard";
import { useRouter } from "next/navigation";
import AITableCreator from "@/components/AITableCreator";

interface Category {
  id: number;
  name: string;
}

interface Table {
  id: number;
  name: string;
  slug: string;
  createdAt: Date;
  categoryId: number | null;
  _count: { records: number };
}

interface TablesDashboardProps {
  initialTables: Table[];
  initialCategories: Category[];
}

export default function TablesDashboard({
  initialTables,
  initialCategories,
}: TablesDashboardProps) {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    setCreatingCategory(true);
    try {
      const { createCategory } = await import("@/app/actions");
      const result = await createCategory(newCategoryName);

      if (!result.success) {
        throw new Error(result.error || "Failed to create category");
      }

      setCategories([...categories, result.data!]);
      setNewCategoryName("");
      setIsCategoryModalOpen(false);
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("Error creating category");
    } finally {
      setCreatingCategory(false);
    }
  };

  // Group tables by category
  const groupedTables = categories.map((category) => ({
    ...category,
    tables: initialTables.filter((t) => t.categoryId === category.id),
  }));

  const uncategorizedTables = initialTables.filter(
    (t) => t.categoryId === null || t.categoryId === undefined
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Tables</h1>
            <p className="text-gray-600">Manage your custom data tables</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setIsAIModalOpen(true)}
              className="bg-white text-indigo-600 py-3 px-6 rounded-xl hover:bg-indigo-50 transition shadow-sm border border-indigo-200 font-medium flex items-center gap-2"
            >
              <span className="text-lg">✨</span> Create with AI
            </button>
            <button
              onClick={() => setIsCategoryModalOpen(true)}
              className="bg-white text-gray-700 py-3 px-6 rounded-xl hover:bg-gray-50 transition shadow-sm border border-gray-200 font-medium"
            >
              + New Category
            </button>
            <Link
              href="/tables/new"
              className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-xl hover:from-blue-700 hover:to-blue-800 transition shadow-lg font-medium"
            >
              + Create Table
            </Link>
          </div>
        </div>

        <div className="space-y-12">
          {/* Categories */}
          {groupedTables.map((category) => (
            <div key={category.id}>
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span className="w-2 h-8 bg-blue-500 rounded-full"></span>
                {category.name}
                <span className="text-sm font-normal text-gray-500 ml-2">
                  ({category.tables.length})
                </span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pl-4">
                {category.tables.map((table) => (
                  <TableCard key={table.id} table={table} />
                ))}
                {category.tables.length === 0 && (
                  <div className="col-span-full py-8 text-gray-400 italic text-sm border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center">
                    No tables in this category
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Uncategorized */}
          {uncategorizedTables.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span className="w-2 h-8 bg-gray-300 rounded-full"></span>
                Uncategorized
                <span className="text-sm font-normal text-gray-500 ml-2">
                  ({uncategorizedTables.length})
                </span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pl-4">
                {uncategorizedTables.map((table) => (
                  <TableCard key={table.id} table={table} />
                ))}
              </div>
            </div>
          )}

          {initialTables.length === 0 && (
            <div className="col-span-full text-center py-16 bg-white rounded-2xl border-2 border-dashed border-gray-300">
              <div className="max-w-md mx-auto">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  No tables yet
                </h3>
                <p className="text-gray-600 mb-6">
                  Create your first table to start managing your data
                </p>
                <div className="flex justify-center gap-4">
                  <button
                    onClick={() => setIsAIModalOpen(true)}
                    className="bg-white text-indigo-600 py-3 px-6 rounded-xl hover:bg-indigo-50 transition shadow-sm border border-indigo-200 font-medium flex items-center gap-2"
                  >
                    <span className="text-lg">✨</span> Create with AI
                  </button>
                  <Link
                    href="/tables/new"
                    className="inline-block bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-8 rounded-xl hover:from-blue-700 hover:to-blue-800 transition shadow-lg font-medium"
                  >
                    + Create Your First Table
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Category Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              New Category
            </h3>
            <form onSubmit={handleCreateCategory}>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Category Name"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none mb-6"
                autoFocus
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingCategory || !newCategoryName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                >
                  {creatingCategory ? "Creating..." : "Create Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Table Creator Modal */}
      <AITableCreator
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
      />
    </div>
  );
}
