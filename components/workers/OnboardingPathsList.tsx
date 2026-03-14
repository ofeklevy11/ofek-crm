"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  GraduationCap,
  Building2,
  Clock,
  Users,
  MoreVertical,
  Edit2,
  Trash2,
  CheckCircle2,
  ListTodo,
  ChevronDown,
  ChevronUp,
  Star,
  Video,
  FileText,
  Calendar,
  ClipboardList,
  Loader2,
  X,
  User,
  PlayCircle,
} from "lucide-react";
import {
  deleteOnboardingPath,
  getWorkersByOnboardingPath,
} from "@/app/actions/workers";
import { toast } from "sonner";
import { showDestructiveConfirm } from "@/hooks/use-modal";
import { getUserFriendlyError } from "@/lib/errors";
import { useFocusTrap } from "@/hooks/use-focus-trap";

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
}

interface OnboardingPath {
  id: number;
  name: string;
  description: string | null;
  departmentId: number | null;
  department: { id: number; name: string; color: string | null } | null;
  isDefault: boolean;
  isActive: boolean;
  estimatedDays: number | null;
  steps: OnboardingStep[];
  _count?: { workerProgress: number };
}

interface Department {
  id: number;
  name: string;
  color: string | null;
}

interface WorkerProgress {
  id: number;
  workerId: number;
  worker: {
    id: number;
    firstName: string;
    lastName: string;
    avatar: string | null;
    position: string | null;
    department: { name: string; color: string | null };
  };
  status: string;
  progress: number;
  completedSteps: number;
  totalSteps: number;
  startedAt: Date;
  completedAt: Date | null;
}

interface Props {
  paths: OnboardingPath[];
  departments: Department[];
  onEdit: (path: OnboardingPath) => void;
  onDelete: (id: number) => void;
}

export default function OnboardingPathsList({
  paths,
  departments,
  onEdit,
  onDelete,
}: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Focus first menuitem when menu opens
  useEffect(() => {
    if (menuOpenId !== null && menuRef.current) {
      const firstItem = menuRef.current.querySelector<HTMLElement>('[role="menuitem"]');
      firstItem?.focus();
    }
  }, [menuOpenId]);

  // Modal states
  const [modalPathId, setModalPathId] = useState<number | null>(null);
  const [modalType, setModalType] = useState<"completed" | "inProgress" | null>(
    null,
  );
  const [workersData, setWorkersData] = useState<WorkerProgress[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(false);

  const handleDelete = async (path: OnboardingPath) => {
    if (!(await showDestructiveConfirm({ title: "מחיקת מסלול קליטה", message: `האם אתה בטוח שברצונך למחוק את מסלול הקליטה "${path.name}"?`, confirmationPhrase: "מחק" })))
      return;

    setDeletingId(path.id);
    try {
      await deleteOnboardingPath(path.id);
      toast.success("מסלול הכשרה נמחק בהצלחה");
      onDelete(path.id);
    } catch (error) {
      console.error("Error deleting path:", error);
      toast.error(getUserFriendlyError(error));
    } finally {
      setDeletingId(null);
    }
  };

  const openWorkersModal = async (
    pathId: number,
    type: "completed" | "inProgress",
  ) => {
    setModalPathId(pathId);
    setModalType(type);
    setLoadingWorkers(true);

    try {
      const data = await getWorkersByOnboardingPath(pathId);
      setWorkersData(data as WorkerProgress[]);
    } catch (error) {
      console.error("Error loading workers:", error);
      setWorkersData([]);
    } finally {
      setLoadingWorkers(false);
    }
  };

  const closeModal = () => {
    setModalPathId(null);
    setModalType(null);
    setWorkersData([]);
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

  const getStepTypeLabel = (type: string) => {
    switch (type) {
      case "TRAINING":
        return "הדרכה";
      case "DOCUMENT":
        return "מסמך";
      case "MEETING":
        return "פגישה";
      case "CHECKLIST":
        return "רשימה";
      default:
        return "משימה";
    }
  };

  // Filter workers for the modal
  const filteredWorkers = workersData.filter((wp) => {
    if (modalType === "completed") return wp.status === "COMPLETED";
    if (modalType === "inProgress") return wp.status === "IN_PROGRESS";
    return true;
  });

  const currentPath = paths.find((p) => p.id === modalPathId);

  if (paths.length === 0) {
    return (
      <div className="text-center py-16">
        <GraduationCap className="h-16 w-16 text-gray-300 mx-auto mb-4" aria-hidden="true" />
        <h3 className="text-xl font-semibold text-gray-700 mb-2">
          אין מסלולי קליטה
        </h3>
        <p className="text-gray-500">
          לחץ על &apos;מסלול חדש&apos; להוספת מסלול הקליטה הראשון
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-gray-100">
        {paths.map((path) => {
          const isExpanded = expandedId === path.id;
          const totalMinutes = path.steps.reduce(
            (sum, step) => sum + (step.estimatedMinutes ?? 0),
            0,
          );
          const requiredSteps = path.steps.filter((s) => s.isRequired).length;

          return (
            <div
              key={path.id}
              className={`transition-all ${isExpanded ? "bg-gray-50/50" : ""}`}
            >
              {/* Main Row */}
              <div className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50/30 transition">
                {/* Icon */}
                <div className="shrink-0">
                  <div
                    className="p-3 rounded-xl"
                    style={{
                      backgroundColor: path.department
                        ? `${path.department.color ?? "#6366F1"}20`
                        : "#EEF2FF",
                      color: path.department?.color ?? "#6366F1",
                    }}
                  >
                    <GraduationCap className="h-6 w-6" aria-hidden="true" />
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{path.name}</h3>
                    {path.isDefault && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                        <Star className="h-3 w-3" aria-hidden="true" />
                        ברירת מחדל
                      </span>
                    )}
                    {!path.isActive && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                        לא פעיל
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    {path.department && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {path.department.name}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <ListTodo className="h-3.5 w-3.5" aria-hidden="true" />
                      {path.steps.length} שלבים ({requiredSteps} חובה)
                    </span>
                    {totalMinutes > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        {Math.floor(totalMinutes / 60)}ש׳ {totalMinutes % 60}ד׳
                      </span>
                    )}
                  </div>
                </div>

                {/* Workers Count */}
                <div className="hidden md:flex items-center gap-2 text-sm text-gray-600 min-w-[100px]">
                  <Users className="h-4 w-4 text-gray-400" aria-hidden="true" />
                  <span>{path._count?.workerProgress ?? 0} עוברים מסלול</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : path.id)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? "כווץ פרטים" : "הרחב פרטים"}
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
                        setMenuOpenId(menuOpenId === path.id ? null : path.id)
                      }
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                      aria-label="פעולות נוספות"
                      aria-haspopup="true"
                      aria-expanded={menuOpenId === path.id}
                    >
                      <MoreVertical className="h-5 w-5" />
                    </button>
                    {menuOpenId === path.id && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setMenuOpenId(null)}
                        />
                        <div
                          ref={menuRef}
                          role="menu"
                          className="absolute left-0 top-full mt-1 bg-white rounded-lg shadow-lg border z-50 min-w-[120px]"
                          onKeyDown={(e) => {
                            const items = e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])');
                            const current = Array.from(items).indexOf(e.target as HTMLElement);
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              items[(current + 1) % items.length]?.focus();
                            } else if (e.key === "ArrowUp") {
                              e.preventDefault();
                              items[(current - 1 + items.length) % items.length]?.focus();
                            } else if (e.key === "Home") {
                              e.preventDefault();
                              items[0]?.focus();
                            } else if (e.key === "End") {
                              e.preventDefault();
                              items[items.length - 1]?.focus();
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              const trigger = e.currentTarget.parentElement?.querySelector<HTMLElement>('button[aria-haspopup]');
                              setMenuOpenId(null);
                              trigger?.focus();
                            }
                          }}
                        >
                          <button
                            role="menuitem"
                            onClick={() => {
                              setMenuOpenId(null);
                              onEdit(path);
                            }}
                            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <Edit2 className="h-4 w-4" />
                            עריכה
                          </button>
                          <button
                            role="menuitem"
                            onClick={() => {
                              setMenuOpenId(null);
                              handleDelete(path);
                            }}
                            disabled={deletingId === path.id}
                            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
                            {deletingId === path.id ? "מוחק..." : "מחיקה"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded - Steps List + Workers Buttons */}
              {isExpanded && (
                <div className="px-6 pb-6 border-t border-gray-100">
                  {path.description && (
                    <p className="text-sm text-gray-600 mt-4 mb-4">
                      {path.description}
                    </p>
                  )}

                  {/* Workers Progress Buttons */}
                  <div className="flex items-center gap-3 mt-4 mb-4">
                    <button
                      onClick={() => openWorkersModal(path.id, "completed")}
                      className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 transition font-medium text-sm"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      מסיימי מסלול הקליטה
                    </button>
                    <button
                      onClick={() => openWorkersModal(path.id, "inProgress")}
                      className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition font-medium text-sm"
                    >
                      <PlayCircle className="h-4 w-4" />
                      באמצע מסלול הקליטה
                    </button>
                  </div>

                  {path.steps.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <ListTodo className="h-8 w-8 mx-auto mb-2 text-gray-300" aria-hidden="true" />
                      <p>אין שלבים במסלול זה</p>
                      <p className="text-sm">ערוך את המסלול להוספת שלבים</p>
                    </div>
                  ) : (
                    <div className="space-y-2 mt-4">
                      {path.steps
                        .sort((a, b) => a.order - b.order)
                        .map((step, index) => {
                          const StepIcon = getStepTypeIcon(step.type);

                          return (
                            <div
                              key={step.id}
                              className="flex items-center gap-4 p-3 bg-white rounded-lg border border-gray-100"
                            >
                              <div className="shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-semibold text-sm">
                                {index + 1}
                              </div>
                              <StepIcon className="h-5 w-5 text-gray-400" />
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-gray-900">
                                  {step.title}
                                </h4>
                                {step.description && (
                                  <p className="text-sm text-gray-500 truncate">
                                    {step.description}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-sm">
                                <span className="text-gray-500">
                                  {getStepTypeLabel(step.type)}
                                </span>
                                {step.estimatedMinutes && (
                                  <span className="text-gray-400">
                                    {step.estimatedMinutes}ד׳
                                  </span>
                                )}
                                {step.isRequired ? (
                                  <span className="px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-600">
                                    חובה
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-xs bg-gray-50 text-gray-500">
                                    אופציונלי
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Workers Modal */}
      {modalPathId && modalType && (
        <WorkersProgressModal
          modalType={modalType}
          currentPath={currentPath ?? null}
          filteredWorkers={filteredWorkers}
          loadingWorkers={loadingWorkers}
          onClose={closeModal}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-component: WorkersProgressModal                                */
/* ------------------------------------------------------------------ */

function WorkersProgressModal({
  modalType,
  currentPath,
  filteredWorkers,
  loadingWorkers,
  onClose,
}: {
  modalType: "completed" | "inProgress";
  currentPath: OnboardingPath | null;
  filteredWorkers: WorkerProgress[];
  loadingWorkers: boolean;
  onClose: () => void;
}) {
  const dialogRef = useFocusTrap(onClose);

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workers-progress-modal-title"
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl max-h-[80vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2
              id="workers-progress-modal-title"
              className="text-xl font-bold text-gray-900 flex items-center gap-2"
            >
              {modalType === "completed" ? (
                <>
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  מסיימי מסלול הקליטה
                </>
              ) : (
                <>
                  <PlayCircle className="h-6 w-6 text-blue-500" />
                  באמצע מסלול הקליטה
                </>
              )}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {currentPath?.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
            aria-label="סגור"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loadingWorkers ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
            </div>
          ) : filteredWorkers.length === 0 ? (
            <div className="text-center py-12">
              <User className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">
                {modalType === "completed"
                  ? "אין עובדים שסיימו את מסלול הקליטה"
                  : "אין עובדים באמצע מסלול הקליטה"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredWorkers.map((wp) => (
                <Link
                  key={wp.id}
                  href={`/workers/${wp.workerId}`}
                  prefetch={false}
                  className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition group"
                >
                  {/* Avatar */}
                  {wp.worker.avatar ? (
                    <img
                      src={wp.worker.avatar}
                      alt={`${wp.worker.firstName} ${wp.worker.lastName}`}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="h-12 w-12 rounded-full flex items-center justify-center text-white font-semibold"
                      style={{
                        backgroundColor:
                          wp.worker.department.color ?? "#6366F1",
                      }}
                    >
                      {wp.worker.firstName[0]}
                      {wp.worker.lastName[0]}
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 group-hover:text-indigo-600 transition">
                      {wp.worker.firstName} {wp.worker.lastName}
                    </h4>
                    <div className="flex items-center gap-3 text-sm text-gray-500">
                      <span>{wp.worker.department.name}</span>
                      {wp.worker.position && (
                        <>
                          <span>•</span>
                          <span>{wp.worker.position}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="text-left">
                    {modalType === "completed" ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        <span className="text-sm font-medium text-emerald-600">
                          הושלם
                        </span>
                      </div>
                    ) : (
                      <div className="w-32">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-gray-500">התקדמות</span>
                          <span className="font-medium text-indigo-600">
                            {wp.progress}%
                          </span>
                        </div>
                        <div
                          className="w-full bg-gray-200 rounded-full h-2"
                          role="progressbar"
                          aria-valuenow={wp.progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label="התקדמות קליטה"
                        >
                          <div
                            className="bg-indigo-500 h-2 rounded-full transition-all"
                            style={{ width: `${wp.progress}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {wp.completedSteps}/{wp.totalSteps} שלבים
                        </p>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <span className="text-sm text-gray-500">
            {filteredWorkers.length} עובדים
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition font-medium"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}
