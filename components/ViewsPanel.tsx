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
import DynamicViewCard from "./DynamicViewCard";
import DynamicViewRenderer from "./DynamicViewRenderer";
import AddViewModal from "./AddViewModal";
import SortableView from "./SortableView";
import { processView } from "@/lib/viewProcessor";
import { reorderViews } from "@/app/actions/views";
import type { ViewConfig } from "@/app/actions/views";
import { useRouter } from "next/navigation";

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
  records: any[];
  views: Array<{
    id: number;
    name: string;
    slug: string;
    config: any;
    isEnabled: boolean;
  }>;
}

export default function ViewsPanel({
  tableId,
  tableSlug,
  schema,
  records,
  views: initialViews,
}: ViewsPanelProps) {
  const router = useRouter();
  const [showAddModal, setShowAddModal] = useState(false);
  const [views, setViews] = useState(initialViews);
  const [isReordering, setIsReordering] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

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
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    console.log("🎯 Drag ended:", { activeId: active.id, overId: over?.id });

    if (!over || active.id === over.id) {
      console.log("⏭️ No change needed");
      return;
    }

    const oldIndex = views.findIndex((v) => v.id === active.id);
    const newIndex = views.findIndex((v) => v.id === over.id);

    console.log("📍 Moving from index", oldIndex, "to", newIndex);

    if (oldIndex === -1 || newIndex === -1) {
      console.log("❌ Invalid index");
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

    console.log("💾 Saving new order to DB:", viewOrders);

    const result = await reorderViews(tableId, viewOrders);

    if (!result.success) {
      // Revert on error
      console.error("❌ Failed to save order:", result.error);
      alert(`שגיאה: ${result.error}`);
      setViews(originalViews);
    } else {
      console.log("✅ Order saved successfully, refreshing...");
      // Refresh to ensure sync
      router.refresh();
    }

    setIsReordering(false);
  };

  const viewIds = views.map((v) => v.id);

  return (
    <div className="w-full lg:w-80 shrink-0 space-y-4">
      {/* Add View Button */}
      <button
        onClick={() => setShowAddModal(true)}
        className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-purple-700 transition shadow-sm"
      >
        + Add View
      </button>

      {/* Render all views with drag-and-drop */}
      {!isMounted ? (
        // Server-side / before hydration: render views without drag-and-drop
        <div className="space-y-4">
          {views.map((view) => {
            const processedData = processView(
              view.config as ViewConfig,
              records,
              schema
            );

            return (
              <div key={view.id}>
                <DynamicViewCard
                  viewId={view.id}
                  viewName={view.name}
                  viewSlug={view.slug}
                  title={view.name}
                  isEnabled={view.isEnabled}
                  config={view.config as ViewConfig}
                  tableSlug={tableSlug}
                  schema={schema}
                >
                  <DynamicViewRenderer viewData={processedData} />
                </DynamicViewCard>
              </div>
            );
          })}
        </div>
      ) : (
        // Client-side: render with drag-and-drop
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
              {views.map((view) => {
                const processedData = processView(
                  view.config as ViewConfig,
                  records,
                  schema
                );

                return (
                  <SortableView key={view.id} id={view.id}>
                    <DynamicViewCard
                      viewId={view.id}
                      viewName={view.name}
                      viewSlug={view.slug}
                      title={view.name}
                      isEnabled={view.isEnabled}
                      config={view.config as ViewConfig}
                      tableSlug={tableSlug}
                      schema={schema}
                    >
                      <DynamicViewRenderer viewData={processedData} />
                    </DynamicViewCard>
                  </SortableView>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {isReordering && (
        <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg">
          שומר את הסדר החדש...
        </div>
      )}

      {views.length === 0 && (
        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
          <div className="text-gray-400 text-4xl mb-2">📊</div>
          <p className="text-sm text-gray-500">
            No views yet. Create your first view to get insights from your data.
          </p>
        </div>
      )}

      {/* Add View Modal */}
      {showAddModal && (
        <AddViewModal
          tableId={tableId}
          tableSlug={tableSlug}
          schema={schema}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
