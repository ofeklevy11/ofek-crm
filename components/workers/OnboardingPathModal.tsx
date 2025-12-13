"use client";

import { useState } from "react";
import {
  X,
  GraduationCap,
  Building2,
  Plus,
  Trash2,
  Star,
  Clock,
  FileText,
  Video,
  Calendar,
  ClipboardList,
  ListTodo,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";
import {
  createOnboardingPath,
  updateOnboardingPath,
  createOnboardingStep,
  updateOnboardingStep,
  deleteOnboardingStep,
  reorderOnboardingSteps,
} from "@/app/actions/workers";
import TaskItemAutomations from "@/components/tasks/TaskItemAutomations";

interface OnCompleteAction {
  actionType:
    | "UPDATE_RECORD"
    | "CREATE_TASK"
    | "UPDATE_TASK"
    | "CREATE_FINANCE"
    | "SEND_NOTIFICATION";
  config: Record<string, unknown>;
}

interface OnboardingStep {
  id: number;
  pathId: number;
  title: string;
  description: string | null;
  type: string;
  order: number;
  estimatedMinutes: number | null;
  resourceUrl: string | null;
  resourceType: string | null;
  isRequired: boolean;
  onCompleteActions?: OnCompleteAction[];
}

interface OnboardingPath {
  id: number;
  name: string;
  description: string | null;
  departmentId: number | null;
  isDefault: boolean;
  isActive: boolean;
  estimatedDays: number | null;
  steps: OnboardingStep[];
}

interface Department {
  id: number;
  name: string;
  color: string | null;
}

interface Props {
  path: OnboardingPath | null;
  departments: Department[];
  users: Array<{ id: number; name: string }>;
  tables: Array<{ id: number; name: string }>;
  onClose: () => void;
  onSave: (path: OnboardingPath) => void;
}

const stepTypes = [
  { value: "TASK", label: "משימה", icon: ListTodo },
  { value: "TRAINING", label: "הדרכה", icon: Video },
  { value: "DOCUMENT", label: "מסמך", icon: FileText },
  { value: "MEETING", label: "פגישה", icon: Calendar },
  { value: "CHECKLIST", label: "רשימה", icon: ClipboardList },
];

export default function OnboardingPathModal({
  path,
  departments,
  users,
  tables,
  onClose,
  onSave,
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState<"details" | "steps">(
    "details"
  );
  const [formData, setFormData] = useState({
    name: path?.name ?? "",
    description: path?.description ?? "",
    departmentId: path?.departmentId ?? null,
    isDefault: path?.isDefault ?? false,
    isActive: path?.isActive ?? true,
    estimatedDays: path?.estimatedDays ?? null,
  });
  const [steps, setSteps] = useState<OnboardingStep[]>(path?.steps ?? []);
  const [editingStepId, setEditingStepId] = useState<number | null>(null);
  const [editingStepData, setEditingStepData] =
    useState<Partial<OnboardingStep> | null>(null);
  const [newStep, setNewStep] = useState<Partial<OnboardingStep> | null>(null);

  // Start editing a step - copy data to local editing state
  const startEditing = (step: OnboardingStep) => {
    setEditingStepId(step.id);
    setEditingStepData({
      title: step.title,
      description: step.description,
      type: step.type,
      estimatedMinutes: step.estimatedMinutes,
      resourceUrl: step.resourceUrl,
      resourceType: step.resourceType,
      isRequired: step.isRequired,
      onCompleteActions: step.onCompleteActions as
        | OnCompleteAction[]
        | undefined,
    });
  };

  // Save editing and close
  const saveEditing = async () => {
    if (!editingStepId || !editingStepData) return;

    // Update local steps
    setSteps((currentSteps) =>
      currentSteps.map((s) =>
        s.id === editingStepId ? { ...s, ...editingStepData } : s
      )
    );

    // Save to server
    if (path && editingStepId > 0) {
      const cleanUpdates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(editingStepData)) {
        if (value !== null && value !== undefined) {
          cleanUpdates[key] = value;
        }
      }
      if (Object.keys(cleanUpdates).length > 0) {
        await updateOnboardingStep(
          editingStepId,
          cleanUpdates as Parameters<typeof updateOnboardingStep>[1]
        );
      }
    }

    setEditingStepId(null);
    setEditingStepData(null);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingStepId(null);
    setEditingStepData(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert("יש להזין שם למסלול");
      return;
    }

    setIsSubmitting(true);

    try {
      const data = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        departmentId: formData.departmentId || undefined,
        isDefault: formData.isDefault,
        isActive: formData.isActive,
        estimatedDays: formData.estimatedDays || undefined,
      };

      let result;
      if (path) {
        result = await updateOnboardingPath(path.id, data);
      } else {
        result = await createOnboardingPath(data);
      }

      // If new path, need to add steps
      if (!path && steps.length > 0) {
        for (const step of steps) {
          await createOnboardingStep({
            pathId: result.id,
            title: step.title,
            description: step.description || undefined,
            type: step.type,
            order: step.order,
            estimatedMinutes: step.estimatedMinutes || undefined,
            resourceUrl: step.resourceUrl || undefined,
            resourceType: step.resourceType || undefined,
            isRequired: step.isRequired,
          });
        }
      }

      const savedPath = { ...result, steps } as OnboardingPath;
      onSave(savedPath);
    } catch (error) {
      console.error("Error saving onboarding path:", error);
      alert("שגיאה בשמירת מסלול הקליטה");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddStep = () => {
    setNewStep({
      title: "",
      description: "",
      type: "TASK",
      order: steps.length,
      estimatedMinutes: 30,
      isRequired: true,
    });
  };

  const handleSaveNewStep = async () => {
    if (!newStep?.title?.trim()) {
      alert("יש להזין כותרת לשלב");
      return;
    }

    if (path) {
      const savedStep = await createOnboardingStep({
        pathId: path.id,
        title: newStep.title.trim(),
        description: newStep.description || undefined,
        type: newStep.type ?? "TASK",
        order: steps.length,
        estimatedMinutes: newStep.estimatedMinutes || undefined,
        isRequired: newStep.isRequired ?? true,
      });
      setSteps([...steps, savedStep]);
    } else {
      const tempStep: OnboardingStep = {
        id: -Date.now(),
        pathId: 0,
        title: newStep.title.trim(),
        description: newStep.description ?? null,
        type: newStep.type ?? "TASK",
        order: steps.length,
        estimatedMinutes: newStep.estimatedMinutes ?? null,
        resourceUrl: null,
        resourceType: null,
        isRequired: newStep.isRequired ?? true,
      };
      setSteps([...steps, tempStep]);
    }

    setNewStep(null);
  };

  const handleUpdateStep = async (
    stepId: number,
    updates: Partial<OnboardingStep>
  ) => {
    if (path && stepId > 0) {
      const cleanUpdates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updates)) {
        if (value !== null && value !== undefined) {
          cleanUpdates[key] = value;
        }
      }
      if (Object.keys(cleanUpdates).length > 0) {
        await updateOnboardingStep(
          stepId,
          cleanUpdates as Parameters<typeof updateOnboardingStep>[1]
        );
      }
    }
    setSteps(steps.map((s) => (s.id === stepId ? { ...s, ...updates } : s)));
    setEditingStepId(null);
  };

  // Update step field without closing editing mode (for select/checkbox onChange)
  // Using a ref to avoid re-renders during editing
  const updateStepFieldInline = async (
    stepId: number,
    updates: Partial<OnboardingStep>
  ) => {
    // Update local steps state
    setSteps((currentSteps) =>
      currentSteps.map((s) => (s.id === stepId ? { ...s, ...updates } : s))
    );

    // Save to server if this is a saved path
    if (path && stepId > 0) {
      const cleanUpdates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updates)) {
        if (value !== null && value !== undefined) {
          cleanUpdates[key] = value;
        }
      }
      if (Object.keys(cleanUpdates).length > 0) {
        await updateOnboardingStep(
          stepId,
          cleanUpdates as Parameters<typeof updateOnboardingStep>[1]
        );
      }
    }
    // Don't close editing mode
  };

  const handleDeleteStep = async (stepId: number) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק שלב זה?")) return;

    if (path && stepId > 0) {
      await deleteOnboardingStep(stepId);
    }
    setSteps(steps.filter((s) => s.id !== stepId));
  };

  const handleMoveStep = async (index: number, direction: "up" | "down") => {
    const newSteps = [...steps];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= steps.length) return;

    [newSteps[index], newSteps[targetIndex]] = [
      newSteps[targetIndex],
      newSteps[index],
    ];
    newSteps.forEach((step, i) => (step.order = i));

    setSteps(newSteps);

    if (path) {
      await reorderOnboardingSteps(
        path.id,
        newSteps.map((s) => s.id)
      );
    }
  };

  const getStepIcon = (type: string) => {
    const stepType = stepTypes.find((t) => t.value === type);
    return stepType?.icon ?? ListTodo;
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {path ? "עריכת מסלול קליטה" : "מסלול קליטה חדש"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {path
                ? "עדכן את המסלול והשלבים שלו"
                : "צור מסלול קליטה חדש לעובדים"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6 shrink-0">
          <button
            onClick={() => setActiveSection("details")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
              activeSection === "details"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            פרטי המסלול
          </button>
          <button
            onClick={() => setActiveSection("steps")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
              activeSection === "steps"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            שלבי הקליטה ({steps.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeSection === "details" ? (
            <div className="space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <GraduationCap className="h-4 w-4 inline ml-1" />
                  שם המסלול *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  placeholder='למשל: "קליטת עובד חדש - מכירות"'
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <FileText className="h-4 w-4 inline ml-1" />
                  תיאור
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none"
                  rows={3}
                  placeholder="תאר את מטרת המסלול..."
                />
              </div>

              {/* Department & Duration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Building2 className="h-4 w-4 inline ml-1" />
                    מחלקה
                  </label>
                  <select
                    value={formData.departmentId ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        departmentId: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  >
                    <option value="">כל המחלקות (כללי)</option>
                    {departments.map((dep) => (
                      <option key={dep.id} value={dep.id}>
                        {dep.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Clock className="h-4 w-4 inline ml-1" />
                    משך מוערך (ימים)
                  </label>
                  <input
                    type="number"
                    value={formData.estimatedDays ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        estimatedDays: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    placeholder="למשל: 7"
                    min={1}
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="isDefault"
                    checked={formData.isDefault}
                    onChange={(e) =>
                      setFormData({ ...formData, isDefault: e.target.checked })
                    }
                    className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label
                    htmlFor="isDefault"
                    className="text-sm font-medium text-gray-700 flex items-center gap-1"
                  >
                    <Star className="h-4 w-4 text-amber-500" />
                    מסלול ברירת מחדל למחלקה
                  </label>
                </div>
                {path && (
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={formData.isActive}
                      onChange={(e) =>
                        setFormData({ ...formData, isActive: e.target.checked })
                      }
                      className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label
                      htmlFor="isActive"
                      className="text-sm font-medium text-gray-700"
                    >
                      מסלול פעיל
                    </label>
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Steps Section
            <div className="space-y-4">
              {steps.length === 0 && !newStep ? (
                <div className="text-center py-8 text-gray-500">
                  <ListTodo className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">אין שלבים במסלול</p>
                  <p className="text-sm">
                    הוסף שלבים כדי לבנות את מסלול הקליטה
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {steps
                    .sort((a, b) => a.order - b.order)
                    .map((step, index) => {
                      const StepIcon = getStepIcon(step.type);
                      const isEditing = editingStepId === step.id;

                      return (
                        <div
                          key={step.id}
                          className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100"
                        >
                          {/* Order Controls */}
                          <div className="flex flex-col gap-0.5">
                            <button
                              onClick={() => handleMoveStep(index, "up")}
                              disabled={index === 0}
                              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleMoveStep(index, "down")}
                              disabled={index === steps.length - 1}
                              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </button>
                          </div>

                          {/* Order Number */}
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-semibold text-sm">
                            {index + 1}
                          </div>

                          {/* Icon */}
                          <StepIcon className="h-5 w-5 text-gray-400" />

                          {/* Content */}
                          {isEditing && editingStepData ? (
                            <div
                              className="flex-1 p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 space-y-4"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* Step Title */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  כותרת השלב{" "}
                                  <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={editingStepData.title ?? ""}
                                  onChange={(e) =>
                                    setEditingStepData({
                                      ...editingStepData,
                                      title: e.target.value,
                                    })
                                  }
                                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                  autoFocus
                                />
                              </div>

                              {/* Step Description */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  תיאור השלב
                                </label>
                                <textarea
                                  value={editingStepData.description ?? ""}
                                  onChange={(e) =>
                                    setEditingStepData({
                                      ...editingStepData,
                                      description: e.target.value,
                                    })
                                  }
                                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                                  placeholder="תאר את מטרת השלב ומה העובד צריך לבצע..."
                                  rows={2}
                                />
                              </div>

                              {/* Type and Time Row */}
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    סוג שלב
                                  </label>
                                  <select
                                    value={editingStepData.type ?? "TASK"}
                                    onChange={(e) =>
                                      setEditingStepData({
                                        ...editingStepData,
                                        type: e.target.value,
                                      })
                                    }
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                  >
                                    {stepTypes.map((t) => (
                                      <option key={t.value} value={t.value}>
                                        {t.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    זמן משוער (דקות)
                                  </label>
                                  <input
                                    type="number"
                                    value={
                                      editingStepData.estimatedMinutes ?? ""
                                    }
                                    onChange={(e) =>
                                      setEditingStepData({
                                        ...editingStepData,
                                        estimatedMinutes: e.target.value
                                          ? Number(e.target.value)
                                          : null,
                                      })
                                    }
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    placeholder="30"
                                    min={1}
                                  />
                                </div>
                              </div>

                              {/* Resource Section - Shown for TRAINING, DOCUMENT types */}
                              {(editingStepData.type === "TRAINING" ||
                                editingStepData.type === "DOCUMENT") && (
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="col-span-2 md:col-span-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      קישור לחומר
                                    </label>
                                    <input
                                      type="url"
                                      value={editingStepData.resourceUrl ?? ""}
                                      onChange={(e) =>
                                        setEditingStepData({
                                          ...editingStepData,
                                          resourceUrl: e.target.value,
                                        })
                                      }
                                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                      placeholder="https://..."
                                      dir="ltr"
                                    />
                                  </div>
                                  <div className="col-span-2 md:col-span-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      סוג החומר
                                    </label>
                                    <select
                                      value={editingStepData.resourceType ?? ""}
                                      onChange={(e) =>
                                        setEditingStepData({
                                          ...editingStepData,
                                          resourceType: e.target.value,
                                        })
                                      }
                                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    >
                                      <option value="">בחר סוג...</option>
                                      <option value="VIDEO">סרטון</option>
                                      <option value="PDF">קובץ PDF</option>
                                      <option value="PRESENTATION">מצגת</option>
                                      <option value="DOCUMENT">מסמך</option>
                                      <option value="LINK">קישור חיצוני</option>
                                    </select>
                                  </div>
                                </div>
                              )}

                              {/* Options Row */}
                              <div className="flex flex-wrap items-center gap-6 pt-2">
                                <label className="flex items-center gap-2.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={editingStepData.isRequired ?? true}
                                    onChange={(e) =>
                                      setEditingStepData({
                                        ...editingStepData,
                                        isRequired: e.target.checked,
                                      })
                                    }
                                    className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                  />
                                  <span className="text-sm font-medium text-gray-700">
                                    שלב חובה
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    (נדרש להשלמה)
                                  </span>
                                </label>
                              </div>

                              {/* Automations Section */}
                              <div className="border-t border-indigo-100 pt-4">
                                <div className="flex items-center gap-2 mb-3">
                                  <Zap className="h-4 w-4 text-amber-500" />
                                  <p className="text-sm font-medium text-gray-700">
                                    אוטומציות בהשלמת השלב
                                  </p>
                                </div>
                                <p className="text-xs text-gray-500 mb-3">
                                  הגדר פעולות אוטומטיות שיופעלו כאשר העובד משלים
                                  את השלב
                                </p>
                                <TaskItemAutomations
                                  actions={
                                    (editingStepData.onCompleteActions as OnCompleteAction[]) ??
                                    []
                                  }
                                  onChange={(actions) =>
                                    setEditingStepData({
                                      ...editingStepData,
                                      onCompleteActions:
                                        actions as unknown as OnCompleteAction[],
                                    })
                                  }
                                  users={users}
                                  tables={tables}
                                />
                              </div>

                              {/* Action Buttons */}
                              <div className="flex gap-3 pt-2 border-t border-indigo-100">
                                <button
                                  type="button"
                                  onClick={saveEditing}
                                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition"
                                >
                                  שמור שינויים
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditing}
                                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl text-sm font-medium transition"
                                >
                                  ביטול
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteStep(step.id)}
                                  className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-xl text-sm font-medium transition"
                                >
                                  <Trash2 className="h-4 w-4 inline-block ml-1" />
                                  מחק שלב
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-gray-900 truncate">
                                {step.title}
                              </h4>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span>
                                  {
                                    stepTypes.find((t) => t.value === step.type)
                                      ?.label
                                  }
                                </span>
                                {step.estimatedMinutes && (
                                  <span>• {step.estimatedMinutes}ד׳</span>
                                )}
                                {step.isRequired && (
                                  <span className="text-red-500">• חובה</span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Actions - Hidden when editing (buttons are inside the edit form) */}
                          {!isEditing && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => startEditing(step)}
                                className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition text-xs"
                              >
                                ערוך
                              </button>
                              <button
                                onClick={() => handleDeleteStep(step.id)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}

              {/* New Step Form */}
              {newStep ? (
                <div className="p-5 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-indigo-900 text-lg">
                      שלב חדש
                    </h4>
                    <button
                      onClick={() => setNewStep(null)}
                      className="p-1 text-gray-400 hover:text-gray-600 hover:bg-white/50 rounded transition"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Step Title */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      כותרת השלב <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newStep.title ?? ""}
                      onChange={(e) =>
                        setNewStep({ ...newStep, title: e.target.value })
                      }
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="לדוגמה: מילוי טפסי קבלה"
                      autoFocus
                    />
                  </div>

                  {/* Step Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      תיאור השלב
                    </label>
                    <textarea
                      value={newStep.description ?? ""}
                      onChange={(e) =>
                        setNewStep({ ...newStep, description: e.target.value })
                      }
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                      placeholder="תאר את מטרת השלב ומה העובד צריך לבצע..."
                      rows={2}
                    />
                  </div>

                  {/* Type and Time Row */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        סוג שלב
                      </label>
                      <select
                        value={newStep.type ?? "TASK"}
                        onChange={(e) =>
                          setNewStep({ ...newStep, type: e.target.value })
                        }
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      >
                        {stepTypes.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        זמן משוער (דקות)
                      </label>
                      <input
                        type="number"
                        value={newStep.estimatedMinutes ?? ""}
                        onChange={(e) =>
                          setNewStep({
                            ...newStep,
                            estimatedMinutes: Number(e.target.value) || null,
                          })
                        }
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="30"
                        min={1}
                      />
                    </div>
                  </div>

                  {/* Resource Section - Shown for TRAINING, DOCUMENT types */}
                  {(newStep.type === "TRAINING" ||
                    newStep.type === "DOCUMENT") && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2 md:col-span-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          קישור לחומר
                        </label>
                        <input
                          type="url"
                          value={newStep.resourceUrl ?? ""}
                          onChange={(e) =>
                            setNewStep({
                              ...newStep,
                              resourceUrl: e.target.value,
                            })
                          }
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          placeholder="https://..."
                          dir="ltr"
                        />
                      </div>
                      <div className="col-span-2 md:col-span-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          סוג החומר
                        </label>
                        <select
                          value={newStep.resourceType ?? ""}
                          onChange={(e) =>
                            setNewStep({
                              ...newStep,
                              resourceType: e.target.value,
                            })
                          }
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                          <option value="">בחר סוג...</option>
                          <option value="VIDEO">סרטון</option>
                          <option value="PDF">קובץ PDF</option>
                          <option value="PRESENTATION">מצגת</option>
                          <option value="DOCUMENT">מסמך</option>
                          <option value="LINK">קישור חיצוני</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Options Row */}
                  <div className="flex flex-wrap items-center gap-6 pt-2">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newStep.isRequired ?? true}
                        onChange={(e) =>
                          setNewStep({
                            ...newStep,
                            isRequired: e.target.checked,
                          })
                        }
                        className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        שלב חובה
                      </span>
                      <span className="text-xs text-gray-500">
                        (נדרש להשלמה)
                      </span>
                    </label>
                  </div>

                  {/* Quick Templates */}
                  <div className="border-t border-indigo-100 pt-4">
                    <p className="text-xs font-medium text-gray-500 mb-2">
                      תבניות מהירות:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setNewStep({
                            ...newStep,
                            title: "מילוי טפסי קבלה לעבודה",
                            description:
                              "מילוי כל טפסי הקבלה הנדרשים למשאבי אנוש",
                            type: "DOCUMENT",
                            estimatedMinutes: 45,
                            isRequired: true,
                          })
                        }
                        className="px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg hover:border-indigo-400 hover:text-indigo-600 transition"
                      >
                        📝 טפסי קבלה
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setNewStep({
                            ...newStep,
                            title: "הכרת הצוות והמחלקה",
                            description:
                              "פגישת היכרות עם חברי הצוות והמנהל הישיר",
                            type: "MEETING",
                            estimatedMinutes: 60,
                            isRequired: true,
                          })
                        }
                        className="px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg hover:border-indigo-400 hover:text-indigo-600 transition"
                      >
                        👋 הכרת הצוות
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setNewStep({
                            ...newStep,
                            title: "הדרכת בטיחות",
                            description:
                              "צפייה בסרטון הדרכת הבטיחות ומעבר מבחן",
                            type: "TRAINING",
                            estimatedMinutes: 30,
                            isRequired: true,
                          })
                        }
                        className="px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg hover:border-indigo-400 hover:text-indigo-600 transition"
                      >
                        🦺 הדרכת בטיחות
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setNewStep({
                            ...newStep,
                            title: "הגדרת סביבת עבודה",
                            description: "הגדרת מחשב, אימייל, וגישות למערכות",
                            type: "CHECKLIST",
                            estimatedMinutes: 120,
                            isRequired: true,
                          })
                        }
                        className="px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg hover:border-indigo-400 hover:text-indigo-600 transition"
                      >
                        💻 הגדרת סביבה
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setNewStep({
                            ...newStep,
                            title: "סיור במשרד",
                            description: "סיור והכרת חללי העבודה והשירותים",
                            type: "TASK",
                            estimatedMinutes: 30,
                            isRequired: false,
                          })
                        }
                        className="px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg hover:border-indigo-400 hover:text-indigo-600 transition"
                      >
                        🏢 סיור במשרד
                      </button>
                    </div>
                  </div>

                  {/* Automations Section */}
                  <div className="border-t border-indigo-100 pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className="h-4 w-4 text-amber-500" />
                      <p className="text-sm font-medium text-gray-700">
                        אוטומציות בהשלמת השלב
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">
                      הגדר פעולות אוטומטיות שיופעלו כאשר העובד משלים את השלב
                    </p>
                    <TaskItemAutomations
                      actions={
                        (newStep.onCompleteActions as OnCompleteAction[]) ?? []
                      }
                      onChange={(actions) =>
                        setNewStep({ ...newStep, onCompleteActions: actions })
                      }
                      users={users}
                      tables={tables}
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleSaveNewStep}
                      disabled={!newStep.title?.trim()}
                      className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="h-4 w-4 inline-block ml-1" />
                      הוסף שלב
                    </button>
                    <button
                      onClick={() => setNewStep(null)}
                      className="px-4 py-2.5 text-gray-600 hover:bg-white/50 rounded-xl text-sm font-medium transition"
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleAddStep}
                  className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                >
                  <Plus className="h-5 w-5" />
                  הוסף שלב
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100 bg-gray-50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition font-medium"
          >
            ביטול
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "שומר..." : path ? "שמור שינויים" : "צור מסלול"}
          </button>
        </div>
      </div>
    </div>
  );
}
