"use client";

import { useState } from "react";
import { Workflow, WorkflowStage, User } from "@prisma/client";
import {
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  User as UserIcon,
  MoreVertical,
  Trash2,
  PlayCircle,
  FileText,
  ArrowLeft,
  Check,
  Calendar,
  Zap,
  X,
  Edit2,
  Trash,
  RotateCcw,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import {
  createWorkflowInstance,
  updateWorkflowInstanceStage,
  resetWorkflowInstance,
} from "@/app/actions/workflow-instances";
import {
  deleteWorkflowInstance,
  updateWorkflowInstance,
} from "@/app/actions/workflows";

// @ts-ignore
type WorkflowInstance = any; // Temporary unti migration run

interface Props {
  instances: (WorkflowInstance & {
    workflow: Workflow & { stages: WorkflowStage[] };
    assignee: User | null;
  })[];
  workflows: (Workflow & { stages: WorkflowStage[] })[]; // For creating new instances
  users: User[]; // For assignment
}

export function WorkflowInstancesBoard({ instances, workflows, users }: Props) {
  const [selectedInstance, setSelectedInstance] = useState<any>(null); // Detail view
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<any | null>(null);

  // New Instance Form State
  const [newForm, setNewForm] = useState({
    workflowId: "",
    name: "",
    assigneeId: "",
  });

  const calculateProgress = (instance: any) => {
    const stages = instance.workflow.stages || [];
    if (stages.length === 0) return 0;

    // Filter completed stages to only include those that actually exist in the workflow description
    // This handles "phantom" completed stages (e.g. if a stage was deleted from the workflow)
    const stageIds = new Set(stages.map((s: any) => s.id));
    const validCompletedCount = instance.completedStages.filter((id: number) =>
      stageIds.has(id),
    ).length;

    return Math.round((validCompletedCount / stages.length) * 100);
  };

  const handleCreate = async () => {
    if (!newForm.workflowId || !newForm.name) return;
    try {
      await createWorkflowInstance({
        workflowId: Number(newForm.workflowId),
        name: newForm.name,
        assigneeId: newForm.assigneeId ? Number(newForm.assigneeId) : undefined,
      });
      setIsCreateModalOpen(false);
      setNewForm({ workflowId: "", name: "", assigneeId: "" });
    } catch (e) {
      console.error(e);
      alert("שגיאה ביצירת תהליך");
    }
  };

  const handleStageToggle = async (
    instanceId: number,
    stageId: number,
    isCompleted: boolean,
  ) => {
    // Optimistic update could happen here, but for now relying on server revalidate
    await updateWorkflowInstanceStage(instanceId, stageId, isCompleted);

    // Update local state for immediate feedback if inside detail view
    if (selectedInstance && selectedInstance.id === instanceId) {
      const newCompleted = isCompleted
        ? [...selectedInstance.completedStages, stageId]
        : selectedInstance.completedStages.filter(
            (id: number) => id !== stageId,
          );

      setSelectedInstance({
        ...selectedInstance,
        completedStages: newCompleted,
      });
    }
  };

  const handleDeleteInstance = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (
      confirm("האם אתה בטוח שברצונך למחוק תהליך זה? פעולה זו היא בלתי הפיכה.")
    ) {
      try {
        await deleteWorkflowInstance(id);
        if (selectedInstance?.id === id) setSelectedInstance(null);
      } catch (error) {
        console.error("Failed to delete instance:", error);
        alert("שגיאה במחיקת התהליך");
      }
    }
  };

  const handleEditClick = (e: React.MouseEvent, inst: any) => {
    e.stopPropagation();
    setEditingInstance({ ...inst });
  };

  const handleUpdateInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInstance) return;

    try {
      await updateWorkflowInstance(editingInstance.id, {
        name: editingInstance.name,
        assigneeId: editingInstance.assigneeId
          ? parseInt(editingInstance.assigneeId)
          : null,
      });
      setEditingInstance(null);
    } catch (error) {
      console.error("Failed to update instance:", error);
      alert("שגיאה בעדכון התהליך");
    }
  };

  const formatDate = (date: Date | string) => {
    if (!date) return "";
    return new Date(date).toLocaleDateString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const handleReset = async () => {
    if (!selectedInstance) return;
    if (
      confirm(
        "האם אתה בטוח שברצונך לאפס את תהליך העבודה? כל השלבים יסומנו כלא הושלמו.",
      )
    ) {
      try {
        await resetWorkflowInstance(selectedInstance.id);

        // Update local state to reflect reset
        setSelectedInstance({
          ...selectedInstance,
          completedStages: [],
          status: "active",
        });
      } catch (error) {
        console.error("Failed to reset workflow:", error);
        alert("שגיאה באיפוס התהליך");
      }
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">תהליכים פעילים</h2>
          <p className="text-gray-500 text-sm">
            ניהול ומעקב אחר ביצוע תהליכי עבודה שוטפים
          </p>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 shadow-sm transition-all"
          >
            <PlayCircle size={18} />
            התחל תהליך חדש
          </button>
          {selectedInstance && (
            <button
              onClick={handleReset}
              className="flex items-center gap-2 bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-xl hover:bg-gray-50 hover:border-gray-300 shadow-sm transition-all text-sm"
            >
              <RotateCcw size={16} />
              אפס את תהליך העבודה
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {selectedInstance ? (
        // DETAIL VIEW (CHECKLIST)
        <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          {/* Detail Header */}
          <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelectedInstance(null)}
                className="p-2 hover:bg-white rounded-full border border-transparent hover:border-gray-200 transition-all text-gray-500"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {selectedInstance.name}
                </h1>
                <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                  <span className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-medium">
                    {selectedInstance.workflow.name}
                  </span>
                  <span className="flex items-center gap-1">
                    <UserIcon size={14} />
                    {selectedInstance.assignee?.name || "ללא משויך"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar size={14} />
                    {formatDate(selectedInstance.createdAt)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Progress Ring or Bar could go here */}
              <div className="text-right">
                <div className="text-2xl font-bold text-indigo-600">
                  {calculateProgress(selectedInstance)}%
                </div>
                <div className="text-xs text-gray-400">הושלם</div>
              </div>
            </div>
          </div>

          {/* Checklist Body */}
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
            <div className="max-w-3xl mx-auto space-y-4">
              {selectedInstance.workflow.stages.map(
                (stage: WorkflowStage, index: number) => {
                  const isCompleted = (
                    selectedInstance.completedStages as number[]
                  ).includes(stage.id);
                  // Heuristic for current stage: First non-completed stage
                  const isCurrent =
                    !isCompleted &&
                    (index === 0 ||
                      (selectedInstance.completedStages as number[]).includes(
                        selectedInstance.workflow.stages[index - 1].id,
                      ));

                  // @ts-ignore
                  const Icon = LucideIcons[stage.icon] || Circle;

                  return (
                    <div
                      key={stage.id}
                      className={`
                                    relative flex items-start gap-4 p-4 rounded-xl border transition-all duration-300
                                    ${
                                      isCompleted
                                        ? "bg-gray-100 border-gray-200 opacity-70"
                                        : "bg-white border-gray-200 shadow-sm"
                                    }
                                    ${
                                      isCurrent
                                        ? "ring-2 ring-indigo-500 border-transparent shadow-md scale-[1.01] opacity-100 z-10"
                                        : ""
                                    }
                                `}
                    >
                      {/* Connector Line */}
                      {index < selectedInstance.workflow.stages.length - 1 && (
                        <div
                          className={`absolute top-12 right-[27px] w-0.5 h-full -z-10 ${
                            isCompleted ? "bg-green-200" : "bg-gray-200"
                          }`}
                        />
                      )}

                      {/* Checkbox / Status Icon */}
                      <button
                        onClick={() =>
                          handleStageToggle(
                            selectedInstance.id,
                            stage.id,
                            !isCompleted,
                          )
                        }
                        className={`
                                      shrink-0 w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all mt-1
                                      ${
                                        isCompleted
                                          ? "bg-green-500 border-green-500 text-white"
                                          : isCurrent
                                            ? "bg-white border-indigo-500 text-indigo-500 animate-pulse"
                                            : "bg-white border-gray-300 text-transparent hover:border-gray-400"
                                      }
                                  `}
                      >
                        <Check size={16} strokeWidth={3} />
                      </button>

                      <div className="flex-1 pt-1">
                        <div className="flex justify-between items-start">
                          <h3
                            className={`font-bold text-lg ${
                              isCompleted
                                ? "text-gray-500 line-through"
                                : "text-gray-900"
                            }`}
                          >
                            {stage.name}
                          </h3>
                          <div
                            className={`p-1.5 rounded-lg bg-${stage.color}-50 text-${stage.color}-600`}
                          >
                            <Icon size={18} />
                          </div>
                        </div>

                        {stage.description && (
                          <p
                            className={`text-sm mt-1 ${
                              isCompleted ? "text-gray-400" : "text-gray-600"
                            }`}
                          >
                            {stage.description}
                          </p>
                        )}

                        {/* Automation Badges */}
                        {/* @ts-ignore */}
                        {stage.details?.systemActions?.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3 mr-11">
                            {/* @ts-ignore */}
                            {stage.details.systemActions.map(
                              (action: any, i: number) => {
                                const isLegacy = typeof action === "string";
                                const type = isLegacy ? "legacy" : action.type;
                                const label = isLegacy
                                  ? action
                                  : action.summary || action.type;

                                let badgeColor = "bg-gray-100 text-gray-600";
                                if (type === "create_task")
                                  badgeColor =
                                    "bg-blue-50 text-blue-600 border border-blue-100";
                                else if (type === "notification")
                                  badgeColor =
                                    "bg-yellow-50 text-yellow-600 border border-yellow-100";
                                else if (type === "create_record")
                                  badgeColor =
                                    "bg-purple-50 text-purple-600 border border-purple-100";

                                return (
                                  <div
                                    key={i}
                                    className={`text-xs px-2 py-1 rounded-md flex items-center gap-1 ${badgeColor}`}
                                  >
                                    <Zap size={12} />
                                    <span className="truncate max-w-[200px]">
                                      {label}
                                    </span>
                                  </div>
                                );
                              },
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                },
              )}

              {selectedInstance.status === "completed" && (
                <div className="text-center py-8">
                  <div className="inline-flex p-4 bg-green-100 text-green-600 rounded-full mb-4">
                    <CheckCircle2 size={48} />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900">
                    התהליך הושלם בהצלחה!
                  </h3>
                  <p className="text-gray-500">כל השלבים בוצעו.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        // LIST VIEW (GRID)
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto p-1">
          {instances.length === 0 ? (
            <div className="col-span-full text-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
              <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 mb-4">
                <FileText size={32} />
              </div>
              {workflows.length === 0 ? (
                <>
                  <h3 className="text-lg font-medium text-gray-900">
                    לא קיימות תבניות תהליך
                  </h3>
                  <p className="text-gray-500 mt-1 max-w-sm mx-auto">
                    על מנת ליצור תהליך, יש לבנות תחילה תבנית תהליך בלשונית
                    "הגדרת תבניות"
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-medium text-gray-900">
                    אין תהליכים פעילים
                  </h3>
                  <p className="text-gray-500 mt-1">
                    התחל תהליך חדש כדי לראות אותו כאן
                  </p>
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="mt-4 text-indigo-600 font-medium hover:underline"
                  >
                    צור תהליך עכשיו
                  </button>
                </>
              )}
            </div>
          ) : (
            instances.map((inst) => (
              <div
                key={inst.id}
                onClick={() => setSelectedInstance(inst)}
                className="group bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-indigo-200 transition-all cursor-pointer relative"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
                      {inst.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {inst.workflow.name}
                    </p>
                  </div>
                  <div
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      inst.status === "completed"
                        ? "bg-green-100 text-green-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {inst.status === "completed" ? "הושלם" : "פעיל"}
                  </div>
                </div>

                {/* Actions */}
                <div className="absolute top-4 left-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleEditClick(e, inst)}
                    className="p-1.5 bg-white text-indigo-600 rounded-lg shadow-sm border border-gray-200 hover:bg-indigo-50"
                    title="ערוך תהליך"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={(e) => handleDeleteInstance(e, inst.id)}
                    className="p-1.5 bg-white text-red-500 rounded-lg shadow-sm border border-gray-200 hover:bg-red-50"
                    title="מחק תהליך"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>התקדמות</span>
                    <span>{calculateProgress(inst)}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                      style={{
                        width: `${calculateProgress(inst)}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <UserIcon size={12} />
                    {inst.assignee?.name || "ללא"}
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar size={12} />
                    {formatDate(inst.createdAt)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsCreateModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-900">תהליך חדש</h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 hover:bg-gray-200 rounded-full text-gray-400"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  סוג תהליך
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {workflows.map((w) => {
                    const isEmpty = w.stages.length === 0;
                    return (
                      <button
                        key={w.id}
                        disabled={isEmpty}
                        onClick={() =>
                          !isEmpty &&
                          setNewForm({
                            ...newForm,
                            workflowId: w.id.toString(),
                          })
                        }
                        className={`p-3 rounded-lg border text-right transition-all flex flex-col justify-center ${
                          isEmpty
                            ? "opacity-50 cursor-not-allowed bg-gray-100 border-gray-200"
                            : newForm.workflowId === w.id.toString()
                              ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500"
                              : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="font-medium text-sm">{w.name}</div>
                        {isEmpty && (
                          <span className="text-xs text-red-500 mt-1">
                            (תבנית ריקה)
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  שם התהליך (לזיהוי)
                </label>
                <input
                  required
                  placeholder="לדוגמה: אונבורדינג ללקוח X"
                  className="w-full p-2 border rounded-md"
                  value={newForm.name}
                  onChange={(e) =>
                    setNewForm({ ...newForm, name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  אחראי ראשי (אופציונלי)
                </label>
                <select
                  className="w-full p-2 border rounded-md"
                  value={newForm.assigneeId}
                  onChange={(e) =>
                    setNewForm({ ...newForm, assigneeId: e.target.value })
                  }
                >
                  <option value="">בחר משתמש...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-4 bg-gray-50 flex justify-end gap-2">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm"
              >
                ביטול
              </button>
              <button
                onClick={handleCreate}
                disabled={!newForm.workflowId || !newForm.name}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                צור והתחל
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Instance Modal */}
      {editingInstance && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setEditingInstance(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-900">עריכת תהליך</h3>
              <button
                onClick={() => setEditingInstance(null)}
                className="p-1 hover:bg-gray-200 rounded-full text-gray-400"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleUpdateInstance} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  שם התהליך
                </label>
                <input
                  required
                  value={editingInstance.name}
                  onChange={(e) =>
                    setEditingInstance({
                      ...editingInstance,
                      name: e.target.value,
                    })
                  }
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  משויך ל...
                </label>
                <select
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  value={editingInstance.assigneeId || ""}
                  onChange={(e) =>
                    setEditingInstance({
                      ...editingInstance,
                      assigneeId: e.target.value,
                    })
                  }
                >
                  <option value="">ללא שיוך</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingInstance(null)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium shadow-sm shadow-indigo-200"
                >
                  שמור שינויים
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
