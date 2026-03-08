"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";
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
  Pencil,
} from "lucide-react";
import {
  createOnboardingPath,
  updateOnboardingPath,
  createOnboardingStep,
  updateOnboardingStep,
  deleteOnboardingStep,
  reorderOnboardingSteps,
} from "@/app/actions/workers";
import { showAlert, showConfirm } from "@/hooks/use-modal";
import OnboardingAutomationBuilder, {
  OnCompleteAction,
} from "./OnboardingAutomationBuilder";
import { AUTOMATION_CATEGORY_LIMITS } from "@/lib/plan-limits";

// OnCompleteAction removed as it is imported now

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
  userPlan?: string;
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
  userPlan = "basic",
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState<"details" | "steps">(
    "details",
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
  const [editError, setEditError] = useState<string | null>(null);

  // Automation Builder State
  const [automationBuilderState, setAutomationBuilderState] = useState<{
    isOpen: boolean;
    editingIndex: number | null;
  }>({ isOpen: false, editingIndex: null });

  // Limits Logic
  const limits = AUTOMATION_CATEGORY_LIMITS;
  const planLabels: Record<string, string> = {
    basic: "משתמש רגיל",
    premium: "משתמש פרימיום",
    super: "משתמש Super",
  };
  const globalLimit = limits[userPlan] ?? 2;

  // Calculate total automations across ALL steps in the path
  const getTotalAutomationsCount = () => {
    let total = 0;
    for (const step of steps) {
      // If this step is being edited, use the editing data instead
      if (step.id === editingStepId && editingStepData) {
        total += editingStepData.onCompleteActions?.length || 0;
      } else {
        total += step.onCompleteActions?.length || 0;
      }
    }
    return total;
  };

  const totalAutomationsCount = getTotalAutomationsCount();
  const currentStepAutomationCount =
    editingStepData?.onCompleteActions?.length || 0;

  // Start editing a step - copy data to local editing state
  const startEditing = (step: OnboardingStep) => {
    setEditingStepId(step.id);
    setEditError(null);
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

  // Validation function for automations
  const validateAutomation = (action: OnCompleteAction): string | null => {
    const config = action.config as any;

    // Check for empty config
    if (!config || Object.keys(config).length === 0) {
      return "יש להגדיר את פרטי האוטומציה (לחץ על גלגל השיניים)";
    }

    switch (action.actionType) {
      case "SEND_NOTIFICATION":
        if (!config.recipientId) return "יש לבחור נמען להתראה";
        if (!config.title) return "יש להזין כותרת להתראה";
        break;
      case "SEND_WHATSAPP":
        // Check if phone source is from table or manual
        if (config.phoneSource === "table") {
          // When using table as phone source, validate table and column selection
          if (!config.waTableId) return "יש לבחור טבלה עבור וואטספ";
          if (!config.waPhoneColumn) return "יש לבחור שדה טלפון עבור וואטספ";
        } else {
          // Manual phone entry
          if (!config.phone) return "יש להזין מספר טלפון לוואטספ";
        }
        // Message is always required
        if (!config.message) return "יש להזין תוכן הודעה לוואטספ";
        break;
      case "SEND_WEBHOOK":
        if (!config.url) return "יש להזין כתובת Webhook";
        break;
      case "CREATE_TASK":
        if (!config.title) return "יש להזין כותרת למשימה";
        break;
      case "UPDATE_TASK":
        if (!config.taskId) return "יש להזין מספר משימה לעדכון";
        if (!config.updates || Object.keys(config.updates).length === 0)
          return "יש לבחור לפחות שדה אחד לעדכון במשימה";
        break;
      case "CREATE_FINANCE":
        if (!config.title) return "יש להזין כותרת לרשומה הפיננסית";
        if (!config.amount) return "יש להזין סכום";
        break;
      case "UPDATE_RECORD":
        if (!config.tableId) return "יש לבחור טבלה";
        if (!config.recordId) return "יש להזין מספר רשומה";
        break;
      case "CREATE_RECORD":
        if (!config.tableId) return "יש לבחור טבלה";
        break;
      case "CREATE_CALENDAR_EVENT":
        if (!config.title) return "יש להזין כותרת לאירוע";
        if (!config.startTime) return "יש להזין שעת התחלה";
        if (!config.endTime) return "יש להזין שעת סיום";
        break;
    }
    return null;
  };

  // Save editing and close
  const saveEditing = async () => {
    if (!editingStepId || !editingStepData) return;

    setEditError(null);

    // Validate Automations
    if (
      editingStepData.onCompleteActions &&
      editingStepData.onCompleteActions.length > 0
    ) {
      for (const action of editingStepData.onCompleteActions as OnCompleteAction[]) {
        const error = validateAutomation(action);
        if (error) {
          setEditError(`שגיאה באוטומציה: ${error}`);
          return;
        }
      }
    }

    // Update local steps
    setSteps((currentSteps) =>
      currentSteps.map((s) =>
        s.id === editingStepId ? { ...s, ...editingStepData } : s,
      ),
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
          cleanUpdates as Parameters<typeof updateOnboardingStep>[1],
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
      showAlert("יש להזין שם למסלול");
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
        // Create path + steps atomically in a single transaction
        result = await createOnboardingPath({
          ...data,
          steps: steps.length > 0
            ? steps.map((step) => ({
                title: step.title,
                description: step.description || undefined,
                type: step.type,
                order: step.order,
                estimatedMinutes: step.estimatedMinutes || undefined,
                resourceUrl: step.resourceUrl || undefined,
                resourceType: step.resourceType || undefined,
                isRequired: step.isRequired,
                onCompleteActions: step.onCompleteActions?.length ? step.onCompleteActions : undefined,
              }))
            : undefined,
        });
      }

      toast.success(path ? "מסלול הכשרה עודכן בהצלחה" : "מסלול הכשרה נוצר בהצלחה");
      const savedPath = { ...result, steps } as OnboardingPath;
      onSave(savedPath);
    } catch (error) {
      console.error("Error saving onboarding path:", error);
      toast.error(getUserFriendlyError(error));
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
      showAlert("יש להזין כותרת לשלב");
      return;
    }

    if (path) {
      try {
        const savedStep = await createOnboardingStep({
          pathId: path.id,
          title: newStep.title.trim(),
          description: newStep.description || undefined,
          type: newStep.type ?? "TASK",
          order: steps.length,
          estimatedMinutes: newStep.estimatedMinutes || undefined,
          isRequired: newStep.isRequired ?? true,
        });
        toast.success("השלב נוסף בהצלחה");
        setSteps([
          ...steps,
          {
            ...savedStep,
            onCompleteActions: savedStep.onCompleteActions as unknown as
              | OnCompleteAction[]
              | undefined,
          },
        ]);
      } catch (error) {
        console.error("Error creating onboarding step:", error);
        toast.error(getUserFriendlyError(error));
        return;
      }
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
        onCompleteActions: newStep.onCompleteActions as OnCompleteAction[] | undefined,
      };
      setSteps([...steps, tempStep]);
    }

    setNewStep(null);
  };

  const handleUpdateStep = async (
    stepId: number,
    updates: Partial<OnboardingStep>,
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
          cleanUpdates as Parameters<typeof updateOnboardingStep>[1],
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
    updates: Partial<OnboardingStep>,
  ) => {
    // Update local steps state
    setSteps((currentSteps) =>
      currentSteps.map((s) => (s.id === stepId ? { ...s, ...updates } : s)),
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
          cleanUpdates as Parameters<typeof updateOnboardingStep>[1],
        );
      }
    }
    // Don't close editing mode
  };

  const handleDeleteStep = async (stepId: number) => {
    if (!(await showConfirm("האם אתה בטוח שברצונך למחוק שלב זה?"))) return;

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
        newSteps.map((s) => s.id),
      );
    }
  };

  const getStepIcon = (type: string) => {
    const stepType = stepTypes.find((t) => t.value === type);
    return stepType?.icon ?? ListTodo;
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
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

                                {/* Plan Limit Disclaimer */}
                                <div
                                  className={`flex items-start gap-3 p-3 mb-3 rounded-lg border text-sm ${
                                    userPlan === "super"
                                      ? "bg-purple-50 border-purple-200 text-purple-800"
                                      : totalAutomationsCount >= globalLimit
                                        ? "bg-amber-50 border-amber-200 text-amber-800"
                                        : "bg-blue-50 border-blue-200 text-blue-800"
                                  }`}
                                >
                                  <Zap className="h-4 w-4 shrink-0 mt-0.5" />
                                  <div>
                                    <p className="font-semibold mb-0.5">
                                      {userPlan === "super"
                                        ? "ללא הגבלה"
                                        : `ניצול אוטומציות במסלול: ${totalAutomationsCount} מתוך ${globalLimit}`}
                                    </p>
                                    <p className="opacity-90 text-xs">
                                      אתה מוגדר כ
                                      {planLabels[userPlan] || userPlan}. ניתן
                                      להוסיף עד{" "}
                                      {globalLimit === Infinity
                                        ? "אינסוף"
                                        : globalLimit}{" "}
                                      אוטומציות{" "}
                                      <strong>
                                        בכל המסלול (כל השלבים ביחד)
                                      </strong>
                                      .
                                      {currentStepAutomationCount > 0 && (
                                        <span className="block mt-1">
                                          שלב נוכחי:{" "}
                                          {currentStepAutomationCount} אוטומציות
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  {editingStepData.onCompleteActions &&
                                  editingStepData.onCompleteActions.length >
                                    0 ? (
                                    editingStepData.onCompleteActions.map(
                                      (action, idx) => (
                                        <div
                                          key={idx}
                                          className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl shadow-sm group hover:border-indigo-300 transition-all"
                                        >
                                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                            <Zap className="h-4 w-4" />
                                          </div>
                                          <div className="flex-1">
                                            <p className="text-sm font-medium text-gray-900">
                                              {
                                                {
                                                  CREATE_TASK: "יצירת משימה",
                                                  SEND_NOTIFICATION:
                                                    "שליחת התראה",
                                                  SEND_WHATSAPP: "שליחת וואטספ",
                                                  UPDATE_RECORD: "עדכון רשומה",
                                                  CREATE_RECORD:
                                                    "יצירת רשומה בטבלה",
                                                  CREATE_CALENDAR_EVENT:
                                                    "יצירת אירוע",
                                                  UPDATE_TASK: "עדכון משימה",
                                                  CREATE_FINANCE:
                                                    "יצירת רשומה פיננסית",
                                                  SEND_WEBHOOK: "Webhook",
                                                }[action.actionType]
                                              }
                                            </p>
                                            <p className="text-xs text-gray-500">
                                              {action.actionType ===
                                              "CREATE_RECORD"
                                                ? `טבלה: ${
                                                    tables.find(
                                                      (t) =>
                                                        t.id ===
                                                        (action.config as any)
                                                          .tableId,
                                                    )?.name || "לא נבחרה"
                                                  }`
                                                : (action.config
                                                    .title as string) ||
                                                  (action.config
                                                    .message as string) ||
                                                  "ללא כותרת"}
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                              onClick={() =>
                                                setAutomationBuilderState({
                                                  isOpen: true,
                                                  editingIndex: idx,
                                                })
                                              }
                                              className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                                            >
                                              <Pencil className="h-4 w-4" />
                                            </button>
                                            <button
                                              onClick={() => {
                                                const newActions = [
                                                  ...(editingStepData.onCompleteActions ||
                                                    []),
                                                ];
                                                newActions.splice(idx, 1);
                                                setEditingStepData({
                                                  ...editingStepData,
                                                  onCompleteActions: newActions,
                                                });
                                              }}
                                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </button>
                                          </div>
                                        </div>
                                      ),
                                    )
                                  ) : (
                                    <div className="text-center py-6 bg-gray-50 border border-dashed border-gray-200 rounded-xl text-gray-500">
                                      <Zap className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                                      <p className="text-sm">
                                        לא הוגדרו אוטומציות
                                      </p>
                                    </div>
                                  )}

                                  <button
                                    onClick={() =>
                                      setAutomationBuilderState({
                                        isOpen: true,
                                        editingIndex: null,
                                      })
                                    }
                                    disabled={
                                      userPlan !== "super" &&
                                      totalAutomationsCount >= globalLimit
                                    }
                                    className="w-full py-3 flex items-center justify-center gap-2 border border-dashed border-indigo-300 bg-indigo-50/50 text-indigo-600 rounded-xl hover:bg-indigo-50 hover:border-indigo-400 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 disabled:border-gray-200"
                                  >
                                    <Plus className="h-4 w-4" />
                                    {userPlan !== "super" &&
                                    totalAutomationsCount >= globalLimit
                                      ? "הגעת למגבלת האוטומציות במסלול"
                                      : "הוסף אוטומציה חדשה"}
                                  </button>
                                </div>
                                {editError && (
                                  <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded-lg mt-2 text-sm">
                                    <Zap className="h-4 w-4" />{" "}
                                    {/* Reusing Zap icon or import AlertTriangle if preferred, Zap is already imported */}
                                    {editError}
                                  </div>
                                )}
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
                    <div className="space-y-3">
                      {newStep.onCompleteActions &&
                      newStep.onCompleteActions.length > 0 ? (
                        newStep.onCompleteActions.map((action, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl shadow-sm group hover:border-indigo-300 transition-all"
                          >
                            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                              <Zap className="h-4 w-4" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">
                                {
                                  {
                                    CREATE_TASK: "יצירת משימה",
                                    SEND_NOTIFICATION: "שליחת התראה",
                                    SEND_WHATSAPP: "שליחת וואטספ",
                                    UPDATE_RECORD: "עדכון רשומה",
                                    CREATE_RECORD: "יצירת רשומה בטבלה",
                                    CREATE_CALENDAR_EVENT: "יצירת אירוע",
                                    UPDATE_TASK: "עדכון משימה",
                                    CREATE_FINANCE: "יצירת רשומה פיננסית",
                                    SEND_WEBHOOK: "Webhook",
                                  }[action.actionType]
                                }
                              </p>
                              <p className="text-xs text-gray-500">
                                {action.actionType === "CREATE_RECORD"
                                  ? `טבלה: ${
                                      tables.find(
                                        (t) =>
                                          t.id ===
                                          (action.config as any).tableId,
                                      )?.name || "לא נבחרה"
                                    }`
                                  : (action.config.title as string) ||
                                    (action.config.message as string) ||
                                    "ללא כותרת"}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() =>
                                  setAutomationBuilderState({
                                    isOpen: true,
                                    editingIndex: idx,
                                  })
                                }
                                className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => {
                                  const newActions = [
                                    ...(newStep.onCompleteActions || []),
                                  ];
                                  newActions.splice(idx, 1);
                                  setNewStep({
                                    ...newStep,
                                    onCompleteActions: newActions,
                                  });
                                }}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-6 bg-gray-50 border border-dashed border-gray-200 rounded-xl text-gray-500">
                          <Zap className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                          <p className="text-sm">לא הוגדרו אוטומציות</p>
                        </div>
                      )}

                      <button
                        onClick={() =>
                          setAutomationBuilderState({
                            isOpen: true,
                            editingIndex: -1, // -1 indicates we are editing 'newStep'
                          })
                        }
                        className="w-full py-3 flex items-center justify-center gap-2 border border-dashed border-indigo-300 bg-indigo-50/50 text-indigo-600 rounded-xl hover:bg-indigo-50 hover:border-indigo-400 transition-colors font-medium text-sm"
                      >
                        <Plus className="h-4 w-4" />
                        הוסף אוטומציה חדשה
                      </button>
                    </div>
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
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? <><Spinner size="sm" /> שומר...</> : path ? "שמור שינויים" : "צור מסלול"}
          </button>
        </div>
      </div>

      {/* Automation Builder Modal */}
      <OnboardingAutomationBuilder
        isOpen={automationBuilderState.isOpen}
        onClose={() =>
          setAutomationBuilderState({ isOpen: false, editingIndex: null })
        }
        users={users}
        tables={tables}
        initialAction={
          automationBuilderState.editingIndex !== null &&
          automationBuilderState.editingIndex >= 0
            ? newStep
              ? newStep.onCompleteActions?.[automationBuilderState.editingIndex]
              : editingStepData?.onCompleteActions?.[
                  automationBuilderState.editingIndex
                ]
            : null
        }
        onSave={(action) => {
          // If we are editing 'newStep' (the step being created primarily)
          if (newStep) {
            // We are in the "New Step" context
            const currentActions = [...(newStep.onCompleteActions || [])];

            if (automationBuilderState.editingIndex === -1) {
              // Adding NEW automation to New Step
              setNewStep({
                ...newStep,
                onCompleteActions: [
                  ...currentActions,
                  action,
                ] as OnCompleteAction[],
              });
            } else if (
              automationBuilderState.editingIndex !== null &&
              automationBuilderState.editingIndex >= 0
            ) {
              // Editing EXISTING automation in New Step (IF ENABLED)
              // Note: I left the edit button hidden for new steps above because it requires extra state logic I can't fully inject safely right now without 'source' prop.
              // But valid logic would be:
              currentActions[automationBuilderState.editingIndex] = action;
              setNewStep({
                ...newStep,
                onCompleteActions: currentActions as OnCompleteAction[],
              });
            }
          }
          // Default: Editing an EXISTING existing step (editingStepData)
          else if (editingStepData) {
            const currentActions = [
              ...(editingStepData.onCompleteActions || []),
            ];

            if (automationBuilderState.editingIndex === null) {
              // Adding NEW automation to Existing Step
              setEditingStepData({
                ...editingStepData,
                onCompleteActions: [
                  ...currentActions,
                  action,
                ] as OnCompleteAction[],
              });
            } else {
              // Editing EXISTING automation in Existing Step
              if (automationBuilderState.editingIndex >= 0) {
                currentActions[automationBuilderState.editingIndex] = action;
                setEditingStepData({
                  ...editingStepData,
                  onCompleteActions: currentActions as OnCompleteAction[],
                });
              }
            }
          }
        }}
      />
    </div>
  );
}
