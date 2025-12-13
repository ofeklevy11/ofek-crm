"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  User,
  Mail,
  Phone,
  Building2,
  Briefcase,
  Calendar,
  Hash,
  Clock,
  CheckCircle2,
  Circle,
  PlayCircle,
  SkipForward,
  GraduationCap,
  ChevronDown,
  ChevronUp,
  FileText,
  Video,
  ClipboardList,
  ListTodo,
  ExternalLink,
  Plus,
  X,
  Zap,
  Bell,
  Table,
  CheckSquare,
  DollarSign,
} from "lucide-react";
import {
  updateStepProgress,
  assignOnboardingPath,
} from "@/app/actions/workers";

interface OnboardingPath {
  id: number;
  name: string;
  departmentId: number | null;
  isDefault: boolean;
  isActive: boolean;
  description?: string | null;
  estimatedDays?: number | null;
  _count?: { steps: number };
}

interface Worker {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  position: string | null;
  employeeId: string | null;
  status: string;
  startDate: Date;
  endDate: Date | null;
  notes: string | null;
  departmentId: number;
  department: {
    id: number;
    name: string;
    color: string | null;
  };
  onboardingProgress: {
    id: number;
    pathId: number;
    status: string;
    path: {
      id: number;
      name: string;
      description: string | null;
      estimatedDays: number | null;
      steps: {
        id: number;
        title: string;
        description: string | null;
        type: string;
        order: number;
        estimatedMinutes: number | null;
        resourceUrl: string | null;
        resourceType: string | null;
        isRequired: boolean;
        onCompleteActions?: unknown;
      }[];
    };
    stepProgress: {
      stepId: number;
      status: string;
      completedAt: Date | null;
      notes: string | null;
      score: number | null;
    }[];
  }[];
  assignedTasks: {
    id: number;
    title: string;
    description: string | null;
    priority: string;
    status: string;
    dueDate: Date | null;
    completedAt: Date | null;
  }[];
}

interface Props {
  worker: Worker;
  availablePaths?: OnboardingPath[];
}

export default function WorkerDetails({ worker, availablePaths = [] }: Props) {
  const [expandedOnboardingId, setExpandedOnboardingId] = useState<
    number | null
  >(
    worker.onboardingProgress.find((op) => op.status === "IN_PROGRESS")?.id ??
      null
  );
  const [updatingStep, setUpdatingStep] = useState<number | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedPathId, setSelectedPathId] = useState<number | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  // Get paths available for this worker's department
  const departmentPaths = availablePaths.filter(
    (p) =>
      p.isActive &&
      (p.departmentId === null || p.departmentId === worker.departmentId)
  );

  // Filter out already assigned paths
  const assignedPathIds = worker.onboardingProgress.map((op) => op.pathId);
  const unassignedPaths = departmentPaths.filter(
    (p) => !assignedPathIds.includes(p.id)
  );

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "ONBOARDING":
        return { color: "text-amber-600", bg: "bg-amber-100", label: "בקליטה" };
      case "ACTIVE":
        return {
          color: "text-emerald-600",
          bg: "bg-emerald-100",
          label: "פעיל",
        };
      case "ON_LEAVE":
        return { color: "text-blue-600", bg: "bg-blue-100", label: "בחופשה" };
      case "TERMINATED":
        return { color: "text-red-600", bg: "bg-red-100", label: "סיום עבודה" };
      default:
        return { color: "text-gray-600", bg: "bg-gray-100", label: status };
    }
  };

  const getStepStatusIcon = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
      case "IN_PROGRESS":
        return <PlayCircle className="h-5 w-5 text-blue-500" />;
      case "SKIPPED":
        return <SkipForward className="h-5 w-5 text-gray-400" />;
      default:
        return <Circle className="h-5 w-5 text-gray-300" />;
    }
  };

  const getStepTypeIcon = (type: string) => {
    switch (type) {
      case "TRAINING":
        return Video;
      case "DOCUMENT":
        return FileText;
      case "MEETING":
        return Calendar;
      case "CHECKLIST":
        return ClipboardList;
      default:
        return ListTodo;
    }
  };

  const handleUpdateStepStatus = async (
    onboardingId: number,
    stepId: number,
    newStatus: string
  ) => {
    setUpdatingStep(stepId);
    try {
      await updateStepProgress(onboardingId, stepId, { status: newStatus });
      // Refresh would happen via revalidatePath
      window.location.reload();
    } catch (error) {
      console.error("Error updating step:", error);
      alert("שגיאה בעדכון השלב");
    } finally {
      setUpdatingStep(null);
    }
  };

  const handleAssignPath = async () => {
    if (!selectedPathId) return;

    setIsAssigning(true);
    try {
      await assignOnboardingPath(worker.id, selectedPathId);
      setShowAssignModal(false);
      setSelectedPathId(null);
      window.location.reload();
    } catch (error) {
      console.error("Error assigning path:", error);
      alert("שגיאה בהקצאת המסלול");
    } finally {
      setIsAssigning(false);
    }
  };

  const status = getStatusConfig(worker.status);

  const activeOnboarding = worker.onboardingProgress.find(
    (op) => op.status === "IN_PROGRESS"
  );

  const getOnboardingProgress = (
    onboarding: (typeof worker.onboardingProgress)[0]
  ) => {
    const totalSteps = onboarding.path.steps.length;
    const completedSteps = onboarding.stepProgress.filter(
      (sp) => sp.status === "COMPLETED"
    ).length;
    const progress =
      totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
    return { progress, completedSteps, totalSteps };
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      {/* Back Button */}
      <Link
        href="/workers"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-indigo-600 mb-6 transition"
      >
        <ArrowRight className="h-4 w-4" />
        חזרה לרשימת העובדים
      </Link>

      {/* Header Card */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden mb-6">
        <div
          className="h-24"
          style={{
            background: `linear-gradient(135deg, ${
              worker.department.color ?? "#6366F1"
            } 0%, ${worker.department.color ?? "#6366F1"}80 100%)`,
          }}
        />
        <div className="px-6 pb-6 -mt-12">
          <div className="flex flex-col md:flex-row items-start md:items-end gap-4">
            {/* Avatar */}
            {worker.avatar ? (
              <img
                src={worker.avatar}
                alt={`${worker.firstName} ${worker.lastName}`}
                className="h-24 w-24 rounded-xl object-cover border-4 border-white shadow-lg"
              />
            ) : (
              <div
                className="h-24 w-24 rounded-xl flex items-center justify-center text-white text-2xl font-bold border-4 border-white shadow-lg"
                style={{
                  backgroundColor: worker.department.color ?? "#6366F1",
                }}
              >
                {worker.firstName[0]}
                {worker.lastName[0]}
              </div>
            )}

            {/* Info */}
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-gray-900">
                  {worker.firstName} {worker.lastName}
                </h1>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${status.bg} ${status.color}`}
                >
                  {status.label}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-gray-600">
                <span className="flex items-center gap-1">
                  <Building2 className="h-4 w-4" />
                  {worker.department.name}
                </span>
                {worker.position && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-4 w-4" />
                    {worker.position}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  החל מ-{new Date(worker.startDate).toLocaleDateString("he-IL")}
                </span>
              </div>
            </div>

            {/* Quick Stats */}
            {activeOnboarding && (
              <div className="bg-indigo-50 rounded-xl p-4 min-w-[200px]">
                <div className="flex items-center gap-2 text-indigo-700 font-medium mb-2">
                  <GraduationCap className="h-5 w-5" />
                  התקדמות קליטה
                </div>
                <div className="w-full bg-indigo-200 rounded-full h-2 mb-2">
                  <div
                    className="bg-indigo-600 h-2 rounded-full transition-all"
                    style={{
                      width: `${
                        getOnboardingProgress(activeOnboarding).progress
                      }%`,
                    }}
                  />
                </div>
                <p className="text-sm text-indigo-600">
                  {getOnboardingProgress(activeOnboarding).progress}% הושלם
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Contact & Details */}
        <div className="space-y-6">
          {/* Contact Info */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <User className="h-4 w-4 text-indigo-500" />
              פרטי קשר
            </h3>
            <div className="space-y-3">
              {worker.email && (
                <a
                  href={`mailto:${worker.email}`}
                  className="flex items-center gap-3 text-gray-600 hover:text-indigo-600 transition"
                >
                  <Mail className="h-4 w-4 text-gray-400" />
                  {worker.email}
                </a>
              )}
              {worker.phone && (
                <a
                  href={`tel:${worker.phone}`}
                  className="flex items-center gap-3 text-gray-600 hover:text-indigo-600 transition"
                >
                  <Phone className="h-4 w-4 text-gray-400" />
                  {worker.phone}
                </a>
              )}
              {worker.employeeId && (
                <div className="flex items-center gap-3 text-gray-600">
                  <Hash className="h-4 w-4 text-gray-400" />
                  מס׳ עובד: {worker.employeeId}
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {worker.notes && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">הערות</h3>
              <p className="text-gray-600 text-sm whitespace-pre-wrap">
                {worker.notes}
              </p>
            </div>
          )}

          {/* Tasks */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-indigo-500" />
              משימות ({worker.assignedTasks.length})
            </h3>
            {worker.assignedTasks.length === 0 ? (
              <p className="text-gray-500 text-sm">אין משימות</p>
            ) : (
              <div className="space-y-2">
                {worker.assignedTasks.slice(0, 5).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition"
                  >
                    {task.status === "COMPLETED" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Circle className="h-4 w-4 text-gray-300" />
                    )}
                    <span
                      className={`text-sm ${
                        task.status === "COMPLETED"
                          ? "text-gray-400 line-through"
                          : "text-gray-700"
                      }`}
                    >
                      {task.title}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Onboarding Progress */}
        <div className="lg:col-span-2 space-y-6">
          {/* Assign Path Button - Always show if there are unassigned paths */}
          {unassignedPaths.length > 0 && (
            <button
              onClick={() => setShowAssignModal(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition font-medium"
            >
              <Plus className="h-5 w-5" />
              הקצה מסלול קליטה חדש
            </button>
          )}

          {worker.onboardingProgress.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
              <GraduationCap className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                אין מסלול קליטה
              </h3>
              <p className="text-gray-500 mb-4">
                לא הוקצה מסלול קליטה לעובד זה
              </p>
              {unassignedPaths.length > 0 ? (
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition font-medium"
                >
                  <GraduationCap className="h-5 w-5" />
                  הקצה מסלול קליטה
                </button>
              ) : (
                <p className="text-sm text-gray-400">
                  אין מסלולי קליטה זמינים למחלקה זו
                </p>
              )}
            </div>
          ) : (
            worker.onboardingProgress.map((onboarding) => {
              const { progress, completedSteps, totalSteps } =
                getOnboardingProgress(onboarding);
              const isExpanded = expandedOnboardingId === onboarding.id;

              return (
                <div
                  key={onboarding.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
                >
                  {/* Header */}
                  <div
                    className="p-5 cursor-pointer hover:bg-gray-50 transition"
                    onClick={() =>
                      setExpandedOnboardingId(isExpanded ? null : onboarding.id)
                    }
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-lg bg-indigo-100 text-indigo-600">
                          <GraduationCap className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            {onboarding.path.name}
                          </h3>
                          <p className="text-sm text-gray-500">
                            {completedSteps} מתוך {totalSteps} שלבים הושלמו
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-left">
                          <div className="text-2xl font-bold text-indigo-600">
                            {progress}%
                          </div>
                          <div className="text-xs text-gray-500">הושלם</div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-gray-400" />
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-4 w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Steps */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 p-5">
                      {onboarding.path.description && (
                        <p className="text-sm text-gray-600 mb-4">
                          {onboarding.path.description}
                        </p>
                      )}

                      <div className="space-y-3">
                        {onboarding.path.steps
                          .sort((a, b) => a.order - b.order)
                          .map((step) => {
                            const stepProgress = onboarding.stepProgress.find(
                              (sp) => sp.stepId === step.id
                            );
                            const stepStatus =
                              stepProgress?.status ?? "PENDING";
                            const StepTypeIcon = getStepTypeIcon(step.type);

                            return (
                              <div
                                key={step.id}
                                className={`flex items-start gap-4 p-4 rounded-xl border transition ${
                                  stepStatus === "COMPLETED"
                                    ? "bg-emerald-50/50 border-emerald-100"
                                    : stepStatus === "IN_PROGRESS"
                                    ? "bg-blue-50/50 border-blue-100"
                                    : "bg-gray-50/50 border-gray-100"
                                }`}
                              >
                                {/* Status Icon */}
                                <div className="pt-0.5">
                                  {getStepStatusIcon(stepStatus)}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-medium text-gray-900">
                                      {step.title}
                                    </h4>
                                    <StepTypeIcon className="h-4 w-4 text-gray-400" />
                                    {step.isRequired && (
                                      <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-600 rounded">
                                        חובה
                                      </span>
                                    )}
                                  </div>
                                  {step.description && (
                                    <p className="text-sm text-gray-500 mb-2">
                                      {step.description}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-4 text-xs text-gray-500">
                                    {step.estimatedMinutes && (
                                      <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {step.estimatedMinutes} דקות
                                      </span>
                                    )}
                                    {step.resourceUrl && (
                                      <a
                                        href={step.resourceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-indigo-600 hover:underline"
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                        צפה בחומר
                                      </a>
                                    )}
                                  </div>

                                  {/* Automations Display */}
                                  {step.onCompleteActions &&
                                  Array.isArray(step.onCompleteActions) &&
                                  step.onCompleteActions.length > 0 ? (
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                      <span className="flex items-center gap-1 text-xs text-amber-600">
                                        <Zap className="h-3 w-3" />
                                        אוטומציות:
                                      </span>
                                      {(
                                        step.onCompleteActions as Array<{
                                          actionType: string;
                                          config?: Record<string, unknown>;
                                        }>
                                      ).map((action, idx) => {
                                        const getActionLabel = (
                                          type: string
                                        ) => {
                                          switch (type) {
                                            case "SEND_NOTIFICATION":
                                              return {
                                                icon: Bell,
                                                label: "שליחת התראה",
                                                color:
                                                  "bg-orange-100 text-orange-700",
                                              };
                                            case "CREATE_TASK":
                                              return {
                                                icon: CheckSquare,
                                                label: "יצירת משימה",
                                                color:
                                                  "bg-emerald-100 text-emerald-700",
                                              };
                                            case "UPDATE_TASK":
                                              return {
                                                icon: CheckSquare,
                                                label: "עדכון משימה",
                                                color:
                                                  "bg-purple-100 text-purple-700",
                                              };
                                            case "UPDATE_RECORD":
                                              return {
                                                icon: Table,
                                                label: "עדכון רשומה",
                                                color:
                                                  "bg-blue-100 text-blue-700",
                                              };
                                            case "CREATE_FINANCE":
                                              return {
                                                icon: DollarSign,
                                                label: "רשומת פיננסים",
                                                color:
                                                  "bg-yellow-100 text-yellow-700",
                                              };
                                            default:
                                              return {
                                                icon: Zap,
                                                label: type,
                                                color:
                                                  "bg-gray-100 text-gray-700",
                                              };
                                          }
                                        };
                                        const actionInfo = getActionLabel(
                                          action.actionType
                                        );
                                        const ActionIcon = actionInfo.icon;
                                        return (
                                          <span
                                            key={idx}
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${actionInfo.color}`}
                                          >
                                            <ActionIcon className="h-3 w-3" />
                                            {actionInfo.label}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </div>

                                {/* Toggle Checkbox */}
                                <div className="flex flex-col items-end gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (stepStatus === "COMPLETED") {
                                        // If already completed, mark as pending
                                        handleUpdateStepStatus(
                                          onboarding.id,
                                          step.id,
                                          "PENDING"
                                        );
                                      } else {
                                        // Mark as completed
                                        handleUpdateStepStatus(
                                          onboarding.id,
                                          step.id,
                                          "COMPLETED"
                                        );
                                      }
                                    }}
                                    disabled={updatingStep === step.id}
                                    className={`relative w-14 h-8 rounded-full transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                                      stepStatus === "COMPLETED"
                                        ? "bg-gradient-to-r from-emerald-400 to-emerald-600 focus:ring-emerald-500 shadow-lg shadow-emerald-200"
                                        : "bg-gray-200 hover:bg-gray-300 focus:ring-gray-400"
                                    }`}
                                  >
                                    {/* Toggle circle */}
                                    <span
                                      className={`absolute top-1 transition-all duration-300 ease-in-out flex items-center justify-center w-6 h-6 rounded-full shadow-md ${
                                        stepStatus === "COMPLETED"
                                          ? "right-1 bg-white"
                                          : "left-1 bg-white"
                                      }`}
                                    >
                                      {updatingStep === step.id ? (
                                        <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                      ) : stepStatus === "COMPLETED" ? (
                                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                      ) : (
                                        <Circle className="h-4 w-4 text-gray-300" />
                                      )}
                                    </span>
                                  </button>

                                  {/* Skip button for non-required steps */}
                                  {!step.isRequired &&
                                    stepStatus !== "COMPLETED" &&
                                    stepStatus !== "SKIPPED" && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleUpdateStepStatus(
                                            onboarding.id,
                                            step.id,
                                            "SKIPPED"
                                          );
                                        }}
                                        disabled={updatingStep === step.id}
                                        className="text-xs text-gray-400 hover:text-gray-600 transition"
                                      >
                                        דלג
                                      </button>
                                    )}

                                  {/* Completion date */}
                                  {stepStatus === "COMPLETED" &&
                                    stepProgress?.completedAt && (
                                      <span className="text-xs text-emerald-600">
                                        {new Date(
                                          stepProgress.completedAt
                                        ).toLocaleDateString("he-IL")}
                                      </span>
                                    )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Assign Onboarding Path Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  הקצאת מסלול קליטה
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  בחר מסלול קליטה עבור {worker.firstName} {worker.lastName}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedPathId(null);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {unassignedPaths.length === 0 ? (
                <div className="text-center py-6">
                  <GraduationCap className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">אין מסלולים זמינים להקצאה</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {unassignedPaths.map((path) => (
                    <label
                      key={path.id}
                      className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition ${
                        selectedPathId === path.id
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-gray-200 hover:border-indigo-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="path"
                        value={path.id}
                        checked={selectedPathId === path.id}
                        onChange={() => setSelectedPathId(path.id)}
                        className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {path.name}
                          </span>
                          {path.isDefault && (
                            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                              ברירת מחדל
                            </span>
                          )}
                        </div>
                        {path.description && (
                          <p className="text-sm text-gray-500 mt-1">
                            {path.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                          {path._count?.steps !== undefined && (
                            <span>{path._count.steps} שלבים</span>
                          )}
                          {path.estimatedDays && (
                            <span>{path.estimatedDays} ימים מוערכים</span>
                          )}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedPathId(null);
                }}
                className="px-5 py-2.5 text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition font-medium"
              >
                ביטול
              </button>
              <button
                onClick={handleAssignPath}
                disabled={!selectedPathId || isAssigning}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAssigning ? "מקצה..." : "הקצה מסלול"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
