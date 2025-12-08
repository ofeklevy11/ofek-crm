"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AITableCreator from "@/components/AITableCreator";
import { Pencil } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import SortableTableCard from "@/components/SortableTableCard";

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
  order: number;
  _count: { records: number };
  creator: { name: string };
}

interface TablesDashboardProps {
  initialTables: Table[];
  initialCategories: Category[];
  canManage?: boolean;
}

export default function TablesDashboard({
  initialTables,
  initialCategories,
  canManage = false,
}: TablesDashboardProps) {
  const router = useRouter();

  // Sort tables by order initially
  const [tables, setTables] = useState<Table[]>(
    [...initialTables].sort((a, b) => (a.order || 0) - (b.order || 0))
  );

  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!canManage) return; // Prevent drag if no permission (though UI shouldn't allow it if we disable dnd)

    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = tables.findIndex((t) => t.id === active.id);
    const newIndex = tables.findIndex((t) => t.id === over.id);

    // Optimistic update
    const newTables = arrayMove(tables, oldIndex, newIndex);
    setTables(newTables);

    // Server update
    try {
      const { updateTablesOrder } = await import("@/app/actions/tables");
      // We only need to update the order of the affected range, or all of them.
      // For simplicity and correctness, let's update all tables in the category with new indices.
      // Actually, since we have a global list of tables but partitioned by category,
      // we should only reorder if they are in the same category.

      // Wait, if we just swap them in the main list, their relative order changes.
      // We need to persist the 'order' field.
      const updates = newTables.map((t, index) => ({
        id: t.id,
        order: index,
      }));

      await updateTablesOrder(updates);
    } catch (error) {
      console.error("Failed to save order", error);
      // Revert on error?
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    setCreatingCategory(true);
    try {
      if (editingCategory) {
        if (editingCategory.id === -1) {
          const { convertUncategorizedToCategory } = await import(
            "@/app/actions"
          );
          const result = await convertUncategorizedToCategory(newCategoryName);

          if (!result.success) {
            throw new Error(
              result.error || "Failed to convert uncategorized tables"
            );
          }

          setCategories([...categories, result.data!]);
        } else {
          const { updateCategory } = await import("@/app/actions");
          const result = await updateCategory(
            editingCategory.id,
            newCategoryName
          );

          if (!result.success) {
            throw new Error(result.error || "Failed to update category");
          }

          setCategories(
            categories.map((c) =>
              c.id === editingCategory.id ? result.data! : c
            )
          );
        }
      } else {
        const { createCategory } = await import("@/app/actions");
        const result = await createCategory(newCategoryName);

        if (!result.success) {
          throw new Error(result.error || "Failed to create category");
        }

        setCategories([...categories, result.data!]);
      }

      setNewCategoryName("");
      setEditingCategory(null);
      setIsCategoryModalOpen(false);
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("Error saving category");
    } finally {
      setCreatingCategory(false);
    }
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setIsCategoryModalOpen(true);
  };

  const closeCategoryModal = () => {
    setIsCategoryModalOpen(false);
    setEditingCategory(null);
    setNewCategoryName("");
  };

  // Group tables by category
  // We need to group them based on the CURRENT 'tables' state which has the correct order
  const getCategoryTables = (catId?: number | null) => {
    if (catId === undefined) return []; // Should not happen
    if (catId === null) {
      return tables.filter(
        (t) => t.categoryId === null || t.categoryId === undefined
      );
    }
    return tables.filter((t) => t.categoryId === catId);
  };

  const uncategorizedTables = getCategoryTables(null);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Tables</h1>
              <p className="text-gray-600">Manage your custom data tables</p>
            </div>
            {canManage && (
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
                  className="bg-linear-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-xl hover:from-blue-700 hover:to-blue-800 transition shadow-lg font-medium"
                >
                  + Create Table
                </Link>
              </div>
            )}
          </div>

          <div className="space-y-12">
            {/* Categories */}
            {categories.map((category) => {
              const catTables = getCategoryTables(category.id);
              return (
                <div key={category.id}>
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                      <span className="w-2 h-8 bg-blue-500 rounded-full"></span>
                      {category.name}
                      <span className="text-sm font-normal text-gray-500 ml-2">
                        ({catTables.length})
                      </span>
                    </h2>
                    {canManage && (
                      <button
                        onClick={() => openEditModal(category)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        title="Edit category name"
                      >
                        <Pencil size={16} />
                      </button>
                    )}
                  </div>

                  <SortableContext
                    items={catTables.map((t) => t.id)}
                    strategy={rectSortingStrategy}
                    disabled={!canManage}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pl-4">
                      {catTables.map((table) => (
                        <SortableTableCard
                          key={table.id}
                          table={table}
                          canDelete={canManage}
                          canEdit={canManage}
                        />
                      ))}
                      {catTables.length === 0 && (
                        <div className="col-span-full py-8 text-gray-400 italic text-sm border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center">
                          No tables in this category
                        </div>
                      )}
                    </div>
                  </SortableContext>
                </div>
              );
            })}

            {/* Uncategorized */}
            {uncategorizedTables.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <span className="w-2 h-8 bg-gray-300 rounded-full"></span>
                    Uncategorized
                    <span className="text-sm font-normal text-gray-500 ml-2">
                      ({uncategorizedTables.length})
                    </span>
                  </h2>
                  {canManage && (
                    <button
                      onClick={() =>
                        openEditModal({ id: -1, name: "Uncategorized" })
                      }
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      title="Rename Uncategorized Group"
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                </div>
                <SortableContext
                  items={uncategorizedTables.map((t) => t.id)}
                  strategy={rectSortingStrategy}
                  disabled={!canManage}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pl-4">
                    {uncategorizedTables.map((table) => (
                      <SortableTableCard
                        key={table.id}
                        table={table}
                        canDelete={canManage}
                        canEdit={canManage}
                      />
                    ))}
                  </div>
                </SortableContext>
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
                  {canManage && (
                    <div className="flex justify-center gap-4">
                      <button
                        onClick={() => setIsAIModalOpen(true)}
                        className="bg-white text-indigo-600 py-3 px-6 rounded-xl hover:bg-indigo-50 transition shadow-sm border border-indigo-200 font-medium flex items-center gap-2"
                      >
                        <span className="text-lg">✨</span> Create with AI
                      </button>
                      <Link
                        href="/tables/new"
                        className="inline-block bg-linear-to-r from-blue-600 to-blue-700 text-white py-3 px-8 rounded-xl hover:from-blue-700 hover:to-blue-800 transition shadow-lg font-medium"
                      >
                        + Create Your First Table
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Create/Edit Category Modal */}
        {isCategoryModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                {editingCategory ? "Edit Category" : "New Category"}
              </h3>
              <form onSubmit={handleSaveCategory}>
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
                    onClick={closeCategoryModal}
                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingCategory || !newCategoryName.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                  >
                    {creatingCategory
                      ? "Saving..."
                      : editingCategory
                      ? "Update Category"
                      : "Create Category"}
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
    </DndContext>
  );
}
