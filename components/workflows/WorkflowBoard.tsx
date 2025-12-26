"use client";

import { useState } from "react";
import { Workflow, WorkflowStage } from "@prisma/client";
import { Plus, ArrowRight, Settings2 } from "lucide-react";
import { StageCard } from "./StageCard";
import { StageDetailModal } from "./StageDetailModal";
import { createStage } from "@/app/actions/workflows";
import { useRouter } from "next/navigation";

interface WorkflowBoardProps {
  workflow: Workflow & { stages: WorkflowStage[] };
  onStageCreated?: (stage: WorkflowStage) => void;
  onStageUpdated?: (stage: WorkflowStage) => void;
  onStageDeleted?: (stageId: number) => void;
}

export function WorkflowBoard({
  workflow,
  onStageCreated,
  onStageUpdated,
  onStageDeleted,
}: WorkflowBoardProps) {
  const [selectedStage, setSelectedStage] = useState<WorkflowStage | null>(
    null
  );
  const [isCreatingStage, setIsCreatingStage] = useState(false);
  const router = useRouter();

  const handleCreateStage = () => {
    setIsCreatingStage(true);
  };

  const handleSaveNewStage = async (stageData: any) => {
    try {
      // @ts-ignore
      const newStage = await createStage(workflow.id, {
        name: stageData.name,
        color: stageData.color,
        icon: stageData.icon,
        description: stageData.description,
        details: stageData.details,
      });

      if (onStageCreated) {
        onStageCreated(newStage);
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error(error);
      alert("שגיאה ביצירת שלב");
    }
  };

  return (
    <div className="relative">
      {/* Scrollable Pipeline Area */}
      <div className="overflow-x-auto pb-4 pt-2 px-2 no-scrollbar">
        <div className="flex items-start min-w-max space-x-4 space-x-reverse rtl:space-x-reverse">
          {workflow.stages.map((stage, index) => (
            <div key={stage.id} className="flex items-center">
              <StageCard
                stage={stage}
                onClick={() => setSelectedStage(stage)}
                index={index}
                isLast={index === workflow.stages.length - 1}
              />

              {/* Connector Arrow (if not last) */}
              {index < workflow.stages.length - 1 && (
                <div className="flex items-center justify-center w-12 text-gray-300 mx-2">
                  <ArrowRight
                    size={24}
                    strokeWidth={1.5}
                    className="text-gray-400 rotate-180"
                  />{" "}
                  {/* RTL arrow */}
                </div>
              )}
            </div>
          ))}

          {/* Add New Stage Button */}
          <div className="flex items-center h-full min-h-[160px]">
            {workflow.stages.length > 0 && (
              <div className="flex items-center justify-center w-12 text-gray-300 mx-2">
                <ArrowRight
                  size={24}
                  strokeWidth={1.5}
                  className="text-gray-400 rotate-180"
                />
              </div>
            )}
            <button
              onClick={handleCreateStage}
              className="group flex flex-col items-center justify-center w-[200px] h-[160px] border-2 border-dashed border-gray-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all duration-300"
            >
              <div className="w-10 h-10 rounded-full bg-gray-50 group-hover:bg-indigo-100 flex items-center justify-center text-gray-400 group-hover:text-indigo-600 mb-2 transition-colors">
                <Plus size={20} />
              </div>
              <span className="text-sm font-medium text-gray-500 group-hover:text-indigo-600">
                הוסף שלב
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Info / Legend */}
      <div className="mt-8 flex gap-6 text-sm text-gray-500 border-t border-gray-100 pt-6">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span>פעיל</span>
        </div>
        <div className="flex items-center gap-2">
          <Settings2 size={16} />
          <span>לחיצה על כרטיס פותחת הגדרות מתקדמות</span>
        </div>
      </div>

      {/* Detail Slide-over / Modal */}
      <StageDetailModal
        stage={selectedStage}
        isOpen={!!selectedStage}
        onClose={() => setSelectedStage(null)}
        onUpdate={onStageUpdated}
        onDelete={onStageDeleted}
      />

      <StageDetailModal
        stage={null}
        isOpen={isCreatingStage}
        onClose={() => setIsCreatingStage(false)}
        isCreating={true}
        onSave={handleSaveNewStage}
      />
    </div>
  );
}
