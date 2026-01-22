"use client";

import { useState } from "react";
import Link from "next/link";
import {
  User,
  Mail,
  Phone,
  Briefcase,
  MoreVertical,
  Edit2,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  PauseCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Building2,
  GraduationCap,
  Eye,
  Plus,
} from "lucide-react";
import { deleteWorker } from "@/app/actions/workers";

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
      name: string;
      _count?: { steps: number };
    };
    stepProgress: { stepId: number; status: string }[];
  }[];
  _count: { assignedTasks: number };
}

interface Department {
  id: number;
  name: string;
  color: string | null;
}

interface Props {
  workers: Worker[];
  departments: Department[];
  searchQuery: string;
  statusFilter: string;
  departmentFilter: number | null;
  onEdit: (worker: Worker) => void;
  onDelete: (id: number) => void;
  onAdd: () => void;
}

export default function WorkersList({
  workers,
  departments,
  searchQuery,
  statusFilter,
  departmentFilter,
  onEdit,
  onDelete,
  onAdd,
}: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

  // Filter workers
  const filteredWorkers = workers.filter((worker) => {
    const matchesSearch =
      !searchQuery ||
      `${worker.firstName} ${worker.lastName}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      worker.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      worker.position?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || worker.status === statusFilter;
    const matchesDepartment =
      !departmentFilter || worker.departmentId === departmentFilter;

    return matchesSearch && matchesStatus && matchesDepartment;
  });

  const handleDelete = async (id: number) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק עובד זה?")) return;

    setDeletingId(id);
    try {
      await deleteWorker(id);
      onDelete(id);
    } catch (error) {
      console.error("Error deleting worker:", error);
      alert("שגיאה במחיקת העובד");
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "ONBOARDING":
        return {
          icon: Clock,
          color: "text-amber-600",
          bg: "bg-amber-100",
          label: "בקליטה",
        };
      case "ACTIVE":
        return {
          icon: CheckCircle2,
          color: "text-emerald-600",
          bg: "bg-emerald-100",
          label: "פעיל",
        };
      case "ON_LEAVE":
        return {
          icon: PauseCircle,
          color: "text-blue-600",
          bg: "bg-blue-100",
          label: "בחופשה",
        };
      case "TERMINATED":
        return {
          icon: XCircle,
          color: "text-red-600",
          bg: "bg-red-100",
          label: "סיום עבודה",
        };
      default:
        return {
          icon: AlertCircle,
          color: "text-gray-600",
          bg: "bg-gray-100",
          label: status,
        };
    }
  };

  const getOnboardingProgress = (worker: Worker) => {
    // Check if onboardingProgress exists
    if (!worker.onboardingProgress || worker.onboardingProgress.length === 0) {
      return null;
    }

    const activeOnboarding = worker.onboardingProgress.find(
      (op) => op.status === "IN_PROGRESS",
    );
    if (!activeOnboarding) return null;

    // Check if stepProgress exists
    const stepProgress = activeOnboarding.stepProgress ?? [];
    // Use path._count.steps for accurate total, fallback to stepProgress.length
    const totalSteps =
      activeOnboarding.path._count?.steps ?? stepProgress.length;
    const completedSteps = stepProgress.filter(
      (sp) => sp.status === "COMPLETED",
    ).length;
    const progress =
      totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    return {
      ...activeOnboarding,
      progress,
      completedSteps,
      totalSteps,
      stepProgress,
    };
  };

  // Get all onboarding paths for a worker (including completed)
  const getAllOnboardingPaths = (worker: Worker) => {
    if (!worker.onboardingProgress || worker.onboardingProgress.length === 0) {
      return [];
    }
    return worker.onboardingProgress.map((op) => {
      const stepProgress = op.stepProgress ?? [];
      // Use path._count.steps for accurate total, fallback to stepProgress.length
      const totalSteps = op.path._count?.steps ?? stepProgress.length;
      const completedSteps = stepProgress.filter(
        (sp) => sp.status === "COMPLETED",
      ).length;
      const progress =
        totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

      // isCompleted should be based on actual progress, not just status
      // Status might not be updated correctly, so we check both
      const isCompleted =
        op.status === "COMPLETED" ||
        (totalSteps > 0 && completedSteps === totalSteps);

      return {
        ...op,
        progress,
        completedSteps,
        totalSteps,
        stepProgress,
        isCompleted,
      };
    });
  };

  if (filteredWorkers.length === 0) {
    return (
      <div className="text-center py-16">
        <User className="h-16 w-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-700 mb-2">אין עובדים</h3>
        <p className="text-gray-500 mb-6">
          {workers.length === 0
            ? "לחץ על 'עובד חדש' להוספת העובד הראשון"
            : "לא נמצאו עובדים התואמים לסינון"}
        </p>

        {workers.length === 0 && (
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-2 bg-linear-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl font-medium hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl hover:scale-[1.02]"
          >
            <Plus className="h-5 w-5" />
            עובד חדש
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {filteredWorkers.map((worker) => {
        const status = getStatusConfig(worker.status);
        const StatusIcon = status.icon;
        const isExpanded = expandedId === worker.id;
        const onboardingProgress = getOnboardingProgress(worker);

        return (
          <div
            key={worker.id}
            className={`transition-all ${
              isExpanded ? "bg-gray-50/50" : "hover:bg-gray-50/30"
            }`}
          >
            {/* Main Row */}
            <div className="px-6 py-4 flex items-center gap-4">
              {/* Avatar */}
              <div className="flex-shrink-0">
                {worker.avatar ? (
                  <img
                    src={worker.avatar}
                    alt={`${worker.firstName} ${worker.lastName}`}
                    className="h-12 w-12 rounded-full object-cover border-2 border-white shadow"
                  />
                ) : (
                  <div
                    className="h-12 w-12 rounded-full flex items-center justify-center text-white font-semibold shadow"
                    style={{
                      backgroundColor: worker.department.color ?? "#6366F1",
                    }}
                  >
                    {worker.firstName[0]}
                    {worker.lastName[0]}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900">
                    {worker.firstName} {worker.lastName}
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.color}`}
                  >
                    <StatusIcon className="h-3 w-3" />
                    {status.label}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    {worker.department.name}
                  </span>
                  {worker.position && (
                    <span className="flex items-center gap-1">
                      <Briefcase className="h-3.5 w-3.5" />
                      {worker.position}
                    </span>
                  )}
                  {/* Onboarding paths badges */}
                  {getAllOnboardingPaths(worker).map((path) => (
                    <span
                      key={path.id}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        path.isCompleted
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-indigo-100 text-indigo-700"
                      }`}
                    >
                      {path.isCompleted ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <GraduationCap className="h-3 w-3" />
                      )}
                      {path.path.name}
                      {!path.isCompleted && ` (${path.progress}%)`}
                    </span>
                  ))}
                </div>
              </div>

              {/* Onboarding Progress */}
              {onboardingProgress && (
                <div className="hidden md:flex flex-col items-end min-w-[160px]">
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                    <GraduationCap className="h-4 w-4 text-indigo-500" />
                    <span>{onboardingProgress.path.name}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all"
                      style={{ width: `${onboardingProgress.progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 mt-1">
                    {onboardingProgress.completedSteps}/
                    {onboardingProgress.totalSteps} שלבים
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : worker.id)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </button>
                <div className="relative">
                  <button
                    onClick={() =>
                      setMenuOpenId(menuOpenId === worker.id ? null : worker.id)
                    }
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                  >
                    <MoreVertical className="h-5 w-5" />
                  </button>
                  {menuOpenId === worker.id && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setMenuOpenId(null)}
                      />
                      <div className="absolute left-0 top-full mt-1 bg-white rounded-lg shadow-lg border z-50 min-w-[120px]">
                        <Link
                          href={`/workers/${worker.id}`}
                          prefetch={false}
                          onClick={() => setMenuOpenId(null)}
                          className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Eye className="h-4 w-4" />
                          צפייה
                        </Link>
                        <button
                          onClick={() => {
                            setMenuOpenId(null);
                            onEdit(worker);
                          }}
                          className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Edit2 className="h-4 w-4" />
                          עריכה
                        </button>
                        <button
                          onClick={() => {
                            setMenuOpenId(null);
                            handleDelete(worker.id);
                          }}
                          disabled={deletingId === worker.id}
                          className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          {deletingId === worker.id ? "מוחק..." : "מחיקה"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="px-6 pb-4 border-t border-gray-100 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  {/* Contact Info */}
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">פרטי קשר</h4>
                    <div className="space-y-2 text-sm">
                      {worker.email && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <Mail className="h-4 w-4 text-gray-400" />
                          <a
                            href={`mailto:${worker.email}`}
                            className="hover:text-indigo-600"
                          >
                            {worker.email}
                          </a>
                        </div>
                      )}
                      {worker.phone && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <Phone className="h-4 w-4 text-gray-400" />
                          <a
                            href={`tel:${worker.phone}`}
                            className="hover:text-indigo-600"
                          >
                            {worker.phone}
                          </a>
                        </div>
                      )}
                      {worker.employeeId && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <span className="text-gray-400">מס׳ עובד:</span>
                          {worker.employeeId}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Employment Info */}
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">
                      פרטי העסקה
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-gray-600">
                        <span className="text-gray-400">תאריך התחלה:</span>
                        {new Date(worker.startDate).toLocaleDateString("he-IL")}
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <span className="text-gray-400">מחלקה:</span>
                        <span
                          className="px-2 py-0.5 rounded-full text-xs"
                          style={{
                            backgroundColor: `${worker.department.color}20`,
                            color: worker.department.color ?? "#6366F1",
                          }}
                        >
                          {worker.department.name}
                        </span>
                      </div>
                      {worker.position && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <span className="text-gray-400">תפקיד:</span>
                          {worker.position}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Onboarding Progress - Full Checklist */}
                  <div className="md:col-span-2">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-gray-900">
                        מסלולי קליטה
                      </h4>
                      <Link
                        href={`/workers/${worker.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-200 transition"
                      >
                        <GraduationCap className="h-3.5 w-3.5" />
                        נהל מסלולי קליטה
                      </Link>
                    </div>
                    {getAllOnboardingPaths(worker).length > 0 ? (
                      <div className="space-y-4">
                        {getAllOnboardingPaths(worker).map((path) => (
                          <div
                            key={path.id}
                            className={`rounded-xl p-4 border ${
                              path.isCompleted
                                ? "bg-emerald-50 border-emerald-200"
                                : "bg-gray-50 border-gray-200"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                {path.isCompleted ? (
                                  <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center">
                                    <CheckCircle2 className="h-4 w-4 text-white" />
                                  </div>
                                ) : (
                                  <GraduationCap className="h-5 w-5 text-indigo-500" />
                                )}
                                <span
                                  className={`font-medium ${
                                    path.isCompleted
                                      ? "text-emerald-700"
                                      : "text-gray-900"
                                  }`}
                                >
                                  {path.path.name}
                                </span>
                                {path.isCompleted && (
                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                                    הושלם ✓
                                  </span>
                                )}
                              </div>
                              <span
                                className={`text-sm font-medium ${
                                  path.isCompleted
                                    ? "text-emerald-600"
                                    : "text-indigo-600"
                                }`}
                              >
                                {path.progress}%
                              </span>
                            </div>

                            {/* Progress Bar */}
                            <div
                              className={`w-full h-2 rounded-full mb-3 ${
                                path.isCompleted
                                  ? "bg-emerald-200"
                                  : "bg-gray-200"
                              }`}
                            >
                              <div
                                className={`h-2 rounded-full transition-all ${
                                  path.isCompleted
                                    ? "bg-emerald-500"
                                    : "bg-gradient-to-r from-indigo-500 to-purple-500"
                                }`}
                                style={{ width: `${path.progress}%` }}
                              />
                            </div>

                            {/* Steps Checklist */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                              {path.stepProgress.map((sp, idx) => {
                                const isCompleted = sp.status === "COMPLETED";
                                const isSkipped = sp.status === "SKIPPED";
                                return (
                                  <div
                                    key={sp.stepId}
                                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs ${
                                      isCompleted
                                        ? "bg-emerald-100 text-emerald-700"
                                        : isSkipped
                                          ? "bg-gray-200 text-gray-500 line-through"
                                          : "bg-white text-gray-600 border border-gray-200"
                                    }`}
                                  >
                                    {isCompleted ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                    ) : isSkipped ? (
                                      <XCircle className="h-3.5 w-3.5 shrink-0" />
                                    ) : (
                                      <div className="h-3.5 w-3.5 rounded-full border-2 border-gray-300 shrink-0" />
                                    )}
                                    <span className="truncate">
                                      שלב {idx + 1}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            <p className="text-xs text-gray-500 mt-2">
                              הושלמו {path.completedSteps} מתוך{" "}
                              {path.totalSteps} שלבים
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 bg-gray-50 rounded-xl">
                        <GraduationCap className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">
                          אין מסלול קליטה פעיל
                        </p>
                        <Link
                          href={`/workers/${worker.id}`}
                          className="inline-flex items-center gap-1 mt-3 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition"
                        >
                          הקצה מסלול קליטה
                        </Link>
                      </div>
                    )}
                  </div>
                </div>

                {/* Notes */}
                {worker.notes && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <h4 className="font-medium text-gray-900 mb-2">הערות</h4>
                    <p className="text-sm text-gray-600">{worker.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
