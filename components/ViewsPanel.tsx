"use client";

import { useState } from "react";
import DynamicViewCard from "./DynamicViewCard";
import DynamicViewRenderer from "./DynamicViewRenderer";
import AddViewModal from "./AddViewModal";
import { processView } from "@/lib/viewProcessor";
import type { ViewConfig } from "@/app/actions/views";

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
  views,
}: ViewsPanelProps) {
  const [showAddModal, setShowAddModal] = useState(false);

  return (
    <div className="w-full lg:w-80 shrink-0 space-y-4">
      {/* Add View Button */}
      <button
        onClick={() => setShowAddModal(true)}
        className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-purple-700 transition shadow-sm"
      >
        + Add View
      </button>

      {/* Render all views */}
      {views.map((view) => {
        const processedData = processView(
          view.config as ViewConfig,
          records,
          schema
        );

        return (
          <DynamicViewCard
            key={view.id}
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
        );
      })}

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
