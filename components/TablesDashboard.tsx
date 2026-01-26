"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AITableCreator from "@/components/AITableCreator";
import { Pencil, Plus, Sparkles, GripVertical } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

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
  const [openModalsCount, setOpenModalsCount] = useState(0);

  const onModalOpen = () => setOpenModalsCount((c) => c + 1);
  const onModalClose = () => setOpenModalsCount((c) => Math.max(0, c - 1));

  // Sort tables by order initially
  const [tables, setTables] = useState<Table[]>(
    [...initialTables].sort((a, b) => (a.order || 0) - (b.order || 0)),
  );

  // Sync state when props change (e.g. after router.refresh())
  useEffect(() => {
    setTables(
      [...initialTables].sort((a, b) => (a.order || 0) - (b.order || 0)),
    );
  }, [initialTables]);

  const [categories, setCategories] = useState<Category[]>(initialCategories);

  useEffect(() => {
    setCategories(initialCategories);
  }, [initialCategories]);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);

  const isAnyModalOpen =
    openModalsCount > 0 || isCategoryModalOpen || isAIModalOpen;
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
    }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!canManage) return;

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
      const updates = newTables.map((t, index) => ({
        id: t.id,
        order: index,
      }));

      await updateTablesOrder(updates);
    } catch (error) {
      console.error("Failed to save order", error);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    setCreatingCategory(true);
    try {
      if (editingCategory) {
        if (editingCategory.id === -1) {
          const { convertUncategorizedToCategory } =
            await import("@/app/actions");
          const result = await convertUncategorizedToCategory(newCategoryName);

          if (!result.success) {
            throw new Error(
              result.error || "Failed to convert uncategorized tables",
            );
          }

          setCategories([...categories, result.data!]);
        } else {
          const { updateCategory } = await import("@/app/actions");
          const result = await updateCategory(
            editingCategory.id,
            newCategoryName,
          );

          if (!result.success) {
            throw new Error(result.error || "Failed to update category");
          }

          setCategories(
            categories.map((c) =>
              c.id === editingCategory.id ? result.data! : c,
            ),
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
      alert("שגיאה בשמירת קטגוריה");
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

  const getCategoryTables = (catId?: number | null) => {
    if (catId === undefined) return [];
    if (catId === null) {
      return tables.filter(
        (t) => t.categoryId === null || t.categoryId === undefined,
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
      <div className="min-h-screen bg-muted/30 p-4 md:p-8" dir="rtl">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-foreground mb-2">
                טבלאות
              </h1>
              <p className="text-muted-foreground">נהל את טבלאות הנתונים שלך</p>
            </div>
            {canManage && (
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => setIsAIModalOpen(true)}
                  variant="outline"
                  className="gap-2"
                >
                  <Sparkles className="h-4 w-4 text-indigo-500" />
                  צור עם AI
                </Button>
                <Button
                  onClick={() => setIsCategoryModalOpen(true)}
                  variant="outline"
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  קטגוריה חדשה
                </Button>
                <Button asChild>
                  <Link href="/tables/new" prefetch={false} className="gap-2">
                    <Plus className="h-4 w-4" />
                    צור טבלה
                  </Link>
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-12">
            {categories.map((category) => {
              const catTables = getCategoryTables(category.id);
              return (
                <div key={category.id} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      <span className="w-1.5 h-6 bg-primary rounded-full"></span>
                      {category.name}
                      <span className="text-sm font-normal text-muted-foreground mr-1">
                        ({catTables.length})
                      </span>
                    </h2>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditModal(category)}
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        title="ערוך שם קטגוריה"
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">ערוך</span>
                      </Button>
                    )}
                  </div>

                  <SortableContext
                    items={catTables.map((t) => t.id)}
                    strategy={rectSortingStrategy}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {catTables.map((table) => (
                        <SortableTableCard
                          key={table.id}
                          table={table}
                          canDelete={canManage}
                          canEdit={canManage}
                          disabled={!canManage || isAnyModalOpen}
                          onModalOpen={onModalOpen}
                          onModalClose={onModalClose}
                        />
                      ))}
                      {catTables.length === 0 && (
                        <div className="col-span-full py-12 text-muted-foreground bg-muted/50 border-2 border-dashed border-muted rounded-xl flex items-center justify-center text-sm">
                          אין טבלאות בקטגוריה זו
                        </div>
                      )}
                    </div>
                  </SortableContext>
                </div>
              );
            })}

            {uncategorizedTables.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <span className="w-1.5 h-6 bg-muted-foreground/30 rounded-full"></span>
                    ללא קטגוריה
                    <span className="text-sm font-normal text-muted-foreground mr-1">
                      ({uncategorizedTables.length})
                    </span>
                  </h2>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        openEditModal({ id: -1, name: "Uncategorized" })
                      }
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      title="שנה שם לקבוצה ללא קטגוריה"
                    >
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">ערוך</span>
                    </Button>
                  )}
                </div>
                <SortableContext
                  items={uncategorizedTables.map((t) => t.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {uncategorizedTables.map((table) => (
                      <SortableTableCard
                        key={table.id}
                        table={table}
                        canDelete={canManage}
                        canEdit={canManage}
                        disabled={!canManage || isAnyModalOpen}
                        onModalOpen={onModalOpen}
                        onModalClose={onModalClose}
                      />
                    ))}
                  </div>
                </SortableContext>
              </div>
            )}

            {initialTables.length === 0 && (
              <div className="col-span-full text-center py-20 bg-background rounded-2xl border-2 border-dashed border-muted shadow-sm">
                <div className="max-w-md mx-auto space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold">עדיין אין טבלאות</h3>
                    <p className="text-muted-foreground">
                      צור את הטבלה הראשונה שלך כדי להתחיל לנהל את הנתונים שלך
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                      <Button
                        onClick={() => setIsAIModalOpen(true)}
                        variant="outline"
                        className="gap-2 h-11"
                      >
                        <Sparkles className="h-4 w-4 text-indigo-500" />
                        צור עם AI
                      </Button>
                      <Button asChild className="h-11">
                        <Link
                          href="/tables/new"
                          prefetch={false}
                          className="gap-2"
                        >
                          <Plus className="h-4 w-4" />
                          צור טבלה חדשה
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <Dialog
          open={isCategoryModalOpen}
          onOpenChange={setIsCategoryModalOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? "ערוך קטגוריה" : "קטגוריה חדשה"}
              </DialogTitle>
              <DialogDescription>
                {editingCategory
                  ? "שנה את שם הקטגוריה"
                  : "צור קטגוריה חדשה לארגון הטבלאות שלך"}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="categoryName">שם הקטגוריה</Label>
                <Input
                  id="categoryName"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="לדוגמה: לקוחות, מכירות"
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeCategoryModal}
                >
                  ביטול
                </Button>
                <Button
                  type="submit"
                  disabled={creatingCategory || !newCategoryName.trim()}
                >
                  {creatingCategory
                    ? "שומר..."
                    : editingCategory
                      ? "עדכן"
                      : "צור"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AITableCreator
          isOpen={isAIModalOpen}
          onClose={() => setIsAIModalOpen(false)}
        />
      </div>
    </DndContext>
  );
}
