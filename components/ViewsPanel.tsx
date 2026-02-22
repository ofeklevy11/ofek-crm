"use client";

import { useState, useEffect } from "react";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import Link from "next/link";

import AsyncViewWrapper from "./AsyncViewWrapper";
import AddViewModal from "./AddViewModal";
import SortableView from "./SortableView";
import { reorderViews, getUserRefreshUsage } from "@/app/actions/views";
import type { ViewConfig } from "@/app/actions/views";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";

interface ViewsPanelProps {
  tableId: number;
  tableSlug: string;
  schema: Array<{
    name: string;
    type: string;
    label: string;
    options?: string[];
    relationTableId?: number;
    displayField?: string;
  }>;
  views: Array<{
    id: number;
    name: string;
    slug: string;
    config: any;
    isEnabled: boolean;
  }>;
  isPremium: string;
}

export default function ViewsPanel({
  tableId,
  tableSlug,
  schema,
  views: initialViews,
  isPremium,
}: ViewsPanelProps) {
  const router = useRouter();
  const [showAddModal, setShowAddModal] = useState(false);
  const [views, setViews] = useState(initialViews);
  const [isReordering, setIsReordering] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [refreshUsage, setRefreshUsage] = useState(0);
  const [nextResetTime, setNextResetTime] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const fetchUsageStats = () => {
    getUserRefreshUsage().then((res) => {
      if (res.success) {
        setRefreshUsage(res.usage);
        setNextResetTime(res.nextResetTime || null);
      }
    });
  };

  useEffect(() => {
    if (isOpen) {
      fetchUsageStats();
    }
  }, [isOpen]);

  // Determine limits based on plan
  const plan = isPremium || "basic";
  let maxViews = 3;
  let planLabel = "משתמש רגיל";

  if (plan === "premium") {
    maxViews = 10;
    planLabel = "משתמש פרימיום";
  } else if (plan === "super") {
    maxViews = 9999;
    planLabel = "משתמש סופר";
  }

  const reachedLimit = views.length >= maxViews;

  // Ensure component only renders DnD on client-side to avoid hydration issues
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Sync state with server data after refresh
  useEffect(() => {
    setViews(initialViews);
  }, [initialViews]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Requires 8px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = views.findIndex((v) => v.id === active.id);
    const newIndex = views.findIndex((v) => v.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Save original order for rollback
    const originalViews = views;

    // Optimistic update
    const newViews = arrayMove(views, oldIndex, newIndex);
    setViews(newViews);

    // Update order in database
    setIsReordering(true);
    const viewOrders = newViews.map((view: any, index: number) => ({
      id: view.id,
      order: index,
    }));

    const result = await reorderViews(tableId, viewOrders);

    if (!result.success) {
      // Revert on error
      console.error("Failed to save order:", result.error);
      toast.error(getUserFriendlyError(result.error));
      setViews(originalViews);
    } else {
      // Refresh to ensure sync
      router.refresh();
    }

    setIsReordering(false);
  };

  const viewIds = views.map((v) => v.id);
  const [hasBeenOpened, setHasBeenOpened] = useState(false);

  // Track if sidebar has ever been opened to enable lazy loading
  useEffect(() => {
    if (isOpen && !hasBeenOpened) {
      setHasBeenOpened(true);
    }
  }, [isOpen, hasBeenOpened]);

  return (
    <>
      {/* Toggle button - always visible */}
      {!isOpen && (
        <div className="shrink-0">
          <Button
            onClick={() => setIsOpen(true)}
            className="gap-2 bg-linear-to-r from-[#4f95ff] to-[#a24ec1] text-white hover:opacity-90"
          >
            <PanelLeftOpen className="h-4 w-4" />
            פתח תצוגות טבלה
          </Button>
        </div>
      )}

      {/* Sidebar content - hidden when closed but stays mounted after first open */}
      <div
        className={`w-full lg:w-80 shrink-0 space-y-4 ${isOpen ? "" : "hidden"}`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">תצוגות</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
            title="סגור תצוגות"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-2">
          <Button
            onClick={() => !reachedLimit && setShowAddModal(true)}
            disabled={reachedLimit}
            className="w-full gap-2 bg-linear-to-r from-primary to-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" /> הוסף תצוגה
          </Button>
          {reachedLimit && (
            <p className="text-xs text-center text-muted-foreground bg-muted/50 p-2 rounded-md border border-muted">
              {planLabel} מוגבל ל-{maxViews} תצוגות בלבד.
            </p>
          )}
          {!reachedLimit && views.length > 0 && plan !== "super" && (
            <p className="text-xs text-center text-muted-foreground pt-1">
              נותרו לך {maxViews - views.length} תצוגות נוספות לטבלה זאת (
              {planLabel})
            </p>
          )}

          {plan !== "super" && views.length > 0 && (
            <div className="text-[12px] text-muted-foreground text-center mt-2 px-1 leading-tight space-y-0.5 bg-gray-50/50 p-1.5 rounded border border-gray-100/50">
              <div>
                משתמש {plan === "premium" ? "פרימיום" : "רגיל"} מוגבל ל-
                {plan === "premium" ? 10 : 3} רענונים ב-4 שעות
              </div>
              <div
                className={
                  (plan === "premium" ? 10 : 3) - refreshUsage <= 0
                    ? "text-red-500 font-bold"
                    : ""
                }
              >
                (נותרו לך{" "}
                {Math.max(0, (plan === "premium" ? 10 : 3) - refreshUsage)})
              </div>
              <div className="mt-1 pt-1 border-t border-gray-200/50 text-gray-400">
                הנתונים מתרעננים אוטומטית כל 4 שעות
                {nextResetTime && (
                  <span>
                    {" "}
                    (רענון הבא:{" "}
                    {new Date(nextResetTime).toLocaleTimeString("he-IL", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    )
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Only render views after sidebar has been opened at least once */}
        {hasBeenOpened && (
          <>
            {!isMounted ? (
              <div className="space-y-4">
                {views.map((view) => (
                  <div key={view.id}>
                    <AsyncViewWrapper
                      view={view}
                      tableId={tableId}
                      tableSlug={tableSlug}
                      schema={schema}
                      onAfterRefresh={fetchUsageStats}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={viewIds}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-4">
                    {views.map((view) => (
                      <SortableView key={view.id} id={view.id}>
                        <AsyncViewWrapper
                          view={view}
                          tableId={tableId}
                          tableSlug={tableSlug}
                          schema={schema}
                          onAfterRefresh={fetchUsageStats}
                        />
                      </SortableView>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </>
        )}

        {isReordering && (
          <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
            <span className="animate-spin duration-1000">⟳</span>
            שומר את הסדר החדש...
          </div>
        )}

        {views.length === 0 && (
          <div className="bg-muted/30 border border-dashed border-muted rounded-xl p-8 text-center">
            <div className="text-muted-foreground text-4xl mb-2 opacity-30">
              📊
            </div>
            <p className="text-sm text-muted-foreground">
              עדיין אין תצוגות. צור את התצוגה הראשונה שלך כדי לקבל תובנות
              מהנתונים.
            </p>
          </div>
        )}

        {showAddModal && (
          <AddViewModal
            tableId={tableId}
            tableSlug={tableSlug}
            schema={schema}
            onClose={() => setShowAddModal(false)}
          />
        )}
      </div>
    </>
  );
}
