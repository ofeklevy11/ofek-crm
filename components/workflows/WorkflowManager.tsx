"use client";

import { useState } from "react";
import { Workflow, WorkflowStage } from "@prisma/client";
import {
  Plus,
  Layout,
  Settings,
  PlayCircle,
  CheckSquare,
  List,
  Trash2,
} from "lucide-react";
import { WorkflowBoard } from "./WorkflowBoard";
import { WorkflowDemo } from "./WorkflowDemo";
import { WorkflowInstancesBoard } from "./WorkflowInstancesBoard";
import { createWorkflow, deleteWorkflow } from "@/app/actions/workflows";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";
import { showConfirm, showPrompt } from "@/hooks/use-modal";

interface WorkflowWithStages extends Workflow {
  stages: WorkflowStage[];
}

interface WorkflowManagerProps {
  initialWorkflows: WorkflowWithStages[];
  initialInstances: any[]; // Typed as any to avoid build errors until Prisma generates
  users: { id: number; name: string }[];
  currentUser: any; // We use 'any' or import the User type from permissions
}

type Tab = "active" | "templates";

export function WorkflowManager({
  initialWorkflows,
  initialInstances,
  users,
  currentUser,
}: WorkflowManagerProps) {
  const [activeTab, setActiveTab] = useState<Tab>("active");

  // Templates State
  const [workflows, setWorkflows] =
    useState<WorkflowWithStages[]>(initialWorkflows);
  const [activeWorkflowId, setActiveWorkflowId] = useState<number | null>(
    initialWorkflows.length > 0 ? initialWorkflows[0].id : null,
  );

  const activeWorkflow = workflows.find((w) => w.id === activeWorkflowId);

  const handleCreateWorkflow = async () => {
    const name = await showPrompt({ message: "שם התהליך החדש:" });
    if (!name) return;

    try {
      // @ts-ignore
      const newWorkflow = await createWorkflow({
        name,
        color: "blue",
        icon: "GitBranch",
      });
      setWorkflows([...workflows, { ...newWorkflow, stages: [] } as any]);
      setActiveWorkflowId(newWorkflow.id);
      toast.success("תהליך העבודה נוצר בהצלחה");
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            תהליכי עבודה
          </h1>
          <p className="text-gray-500 mt-1">
            נהל את הפייפליינים ותהליכי העבודה של הארגון
          </p>
        </div>
      </div>

      {/* Main Mode Toggle */}
      <div className="flex p-1 bg-gray-200/50 rounded-xl w-fit" role="tablist" aria-label="תצוגת תהליכי עבודה">
        <button
          role="tab"
          id="tab-active"
          aria-selected={activeTab === "active"}
          aria-controls="tabpanel-active"
          onClick={() => setActiveTab("active")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "active"
              ? "bg-white text-indigo-600 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <CheckSquare size={16} aria-hidden="true" />
          תהליכים פעילים (Checklists)
        </button>
        <button
          role="tab"
          id="tab-templates"
          aria-selected={activeTab === "templates"}
          aria-controls="tabpanel-templates"
          onClick={() => setActiveTab("templates")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "templates"
              ? "bg-white text-indigo-600 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Settings size={16} aria-hidden="true" />
          הגדרת תבניות
        </button>
      </div>

      {activeTab === "active" ? (
        // ACTIVE INSTANCES VIEW
        <div id="tabpanel-active" role="tabpanel" aria-labelledby="tab-active" className="h-[750px] bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <WorkflowInstancesBoard
            instances={initialInstances}
            workflows={workflows}
            users={users}
          />
        </div>
      ) : (
        // TEMPLATES VIEW
        <div id="tabpanel-templates" role="tabpanel" aria-labelledby="tab-templates">
          {/* Workflow Tabs */}
          <div className="flex items-center justify-between border-b border-gray-200 pb-2">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar" role="tablist" aria-label="תבניות תהליכי עבודה">
              {workflows.map((workflow) => (
                <button
                  key={workflow.id}
                  role="tab"
                  id={`tab-workflow-${workflow.id}`}
                  aria-selected={activeWorkflowId === workflow.id}
                  aria-controls={`tabpanel-workflow-${workflow.id}`}
                  onClick={() => setActiveWorkflowId(workflow.id)}
                  className={`
                        flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition-all relative
                        ${
                          activeWorkflowId === workflow.id
                            ? "text-indigo-600 bg-white border-x border-t border-gray-200"
                            : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                        }
                        `}
                >
                  <Layout size={16} aria-hidden="true" />
                  {workflow.name}
                  {activeWorkflowId === workflow.id && (
                    <span className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-white" />
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={handleCreateWorkflow}
              className="flex items-center gap-2 text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus size={16} aria-hidden="true" />
              <span>תבנית חדשה</span>
            </button>
          </div>

          {/* Template Board */}
          <div id={activeWorkflow ? `tabpanel-workflow-${activeWorkflow.id}` : undefined} role="tabpanel" aria-labelledby={activeWorkflow ? `tab-workflow-${activeWorkflow.id}` : undefined} className="bg-white min-h-[600px] border border-gray-200 rounded-xl rounded-tl-none p-6 shadow-sm relative overflow-hidden">
            {activeWorkflow ? (
              <div className="space-y-12">
                {/* Workflow Actions Header */}
                <div className="flex justify-end border-b border-gray-100 pb-4 mb-4">
                  <button
                    onClick={async () => {
                      if (
                        await showConfirm(
                          `האם אתה בטוח שברצונך למחוק את התבנית "${activeWorkflow.name}"?`,
                        )
                      ) {
                        try {
                          await deleteWorkflow(activeWorkflow.id);
                          setActiveWorkflowId(
                            workflows.find((w) => w.id !== activeWorkflow.id)
                              ?.id || null,
                          );
                          // Optimistic update
                          setWorkflows(
                            workflows.filter((w) => w.id !== activeWorkflow.id),
                          );
                          toast.success("התבנית נמחקה בהצלחה");
                        } catch (error) {
                          toast.error(getUserFriendlyError(error));
                        }
                      }
                    }}
                    className="flex items-center gap-2 text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    מחק תבנית
                  </button>
                </div>

                <WorkflowBoard
                  workflow={activeWorkflow}
                  currentUser={currentUser}
                  onStageCreated={(newStage: WorkflowStage) => {
                    setWorkflows((prev) =>
                      prev.map((w) =>
                        w.id === newStage.workflowId
                          ? { ...w, stages: [...w.stages, newStage] }
                          : w,
                      ),
                    );
                  }}
                  onStageUpdated={(updatedStage: WorkflowStage) => {
                    setWorkflows((prev) =>
                      prev.map((w) =>
                        w.id === updatedStage.workflowId
                          ? {
                              ...w,
                              stages: w.stages.map((s) =>
                                s.id === updatedStage.id ? updatedStage : s,
                              ),
                            }
                          : w,
                      ),
                    );
                  }}
                  onStageDeleted={(stageId: number) => {
                    setWorkflows((prev) =>
                      prev.map((w) =>
                        w.id === activeWorkflow.id
                          ? {
                              ...w,
                              stages: w.stages.filter((s) => s.id !== stageId),
                            }
                          : w,
                      ),
                    );
                  }}
                />

                {/* Demo section kept for reference but could be removed */}
                {/* <div className="border-t border-gray-100 pt-8">
                        <WorkflowDemo workflow={activeWorkflow} />
                    </div> */}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-20 text-gray-400">
                <Layout size={48} className="mb-4 opacity-20" aria-hidden="true" />
                <p className="text-lg">בחר תבנית לעריכה או צור חדשה</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
