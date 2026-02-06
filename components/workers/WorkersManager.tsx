"use client";

import { useState } from "react";
import {
  Users,
  Building2,
  GraduationCap,
  UserPlus,
  Search,
  Filter,
  BarChart3,
  ChevronDown,
  Briefcase,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
} from "lucide-react";
import WorkersList from "./WorkersList";
import DepartmentsList from "./DepartmentsList";
import OnboardingPathsList from "./OnboardingPathsList";
import WorkerModal from "./WorkerModal";
import DepartmentModal from "./DepartmentModal";
import OnboardingPathModal from "./OnboardingPathModal";

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
  department: Department;
  onboardingProgress: OnboardingProgress[];
  _count: { assignedTasks: number };
}

interface Department {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  managerId: number | null;
  isActive: boolean;
  _count?: { workers: number; onboardingPaths: number };
}

interface OnboardingPath {
  id: number;
  name: string;
  description: string | null;
  departmentId: number | null;
  department: Department | null;
  isDefault: boolean;
  isActive: boolean;
  estimatedDays: number | null;
  steps: OnboardingStep[];
  _count?: { workerProgress: number; steps: number };
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
}

interface OnboardingProgress {
  id: number;
  pathId: number;
  status: string;
  path: OnboardingPath;
  stepProgress: { stepId: number; status: string }[];
}

interface Stats {
  totalWorkers: number;
  onboardingWorkers: number;
  activeWorkers: number;
  departments: number;
  onboardingPaths: number;
}

interface User {
  id: number;
  name: string;
  email: string;
}

interface Props {
  initialWorkers: Worker[];
  initialDepartments: Department[];
  initialOnboardingPaths: OnboardingPath[];
  stats: Stats;
  users: User[];
  tables: Array<{ id: number; name: string }>;
  userPlan?: string;
}

export default function WorkersManager({
  initialWorkers,
  initialDepartments,
  initialOnboardingPaths,
  stats,
  users,
  tables,
  userPlan = "basic",
}: Props) {
  const [activeTab, setActiveTab] = useState<
    "workers" | "departments" | "onboarding"
  >("workers");
  const [workers, setWorkers] = useState(initialWorkers);
  const [departments, setDepartments] = useState(initialDepartments);
  const [onboardingPaths, setOnboardingPaths] = useState(
    initialOnboardingPaths,
  );

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<number | null>(null);

  // Modals
  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);
  const [isDepModalOpen, setIsDepModalOpen] = useState(false);
  const [isPathModalOpen, setIsPathModalOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(
    null,
  );
  const [editingPath, setEditingPath] = useState<OnboardingPath | null>(null);

  const tabs = [
    {
      id: "workers" as const,
      label: "עובדים",
      icon: Users,
      count: stats.totalWorkers,
    },
    {
      id: "departments" as const,
      label: "מחלקות",
      icon: Building2,
      count: stats.departments,
    },
    {
      id: "onboarding" as const,
      label: "מסלולי קליטה",
      icon: GraduationCap,
      count: stats.onboardingPaths,
    },
  ];

  const statusOptions = [
    { value: "all", label: "כל הסטטוסים" },
    { value: "ONBOARDING", label: "בקליטה" },
    { value: "ACTIVE", label: "פעיל" },
    { value: "ON_LEAVE", label: "בחופשה" },
    { value: "TERMINATED", label: "סיום עבודה" },
  ];

  const handleWorkerSaved = (worker: Worker) => {
    // Ensure worker has all required fields with defaults
    const completeWorker: Worker = {
      ...worker,
      onboardingProgress: worker.onboardingProgress ?? [],
      _count: worker._count ?? { assignedTasks: 0 },
      department: worker.department ??
        departments.find((d) => d.id === worker.departmentId) ?? {
          id: worker.departmentId,
          name: "מחלקה",
          description: null,
          color: "#6366F1",
          icon: null,
          managerId: null,
          isActive: true,
        },
    };

    if (editingWorker) {
      setWorkers(
        workers.map((w) => (w.id === completeWorker.id ? completeWorker : w)),
      );
    } else {
      setWorkers([...workers, completeWorker]);
    }
    setIsWorkerModalOpen(false);
    setEditingWorker(null);
  };

  const handleDepartmentSaved = (department: Department) => {
    if (editingDepartment) {
      setDepartments(
        departments.map((d) => (d.id === department.id ? department : d)),
      );
    } else {
      setDepartments([...departments, department]);
    }
    setIsDepModalOpen(false);
    setEditingDepartment(null);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlePathSaved = (path: any) => {
    const typedPath = path as OnboardingPath;
    if (editingPath) {
      setOnboardingPaths(
        onboardingPaths.map((p) => (p.id === typedPath.id ? typedPath : p)),
      );
    } else {
      setOnboardingPaths([...onboardingPaths, typedPath]);
    }
    setIsPathModalOpen(false);
    setEditingPath(null);
  };

  const handleNewClick = () => {
    if (activeTab === "workers") {
      if (departments.length === 0) {
        setEditingDepartment(null);
        setIsDepModalOpen(true);
        return;
      }
      setEditingWorker(null);
      setIsWorkerModalOpen(true);
    } else if (activeTab === "departments") {
      setEditingDepartment(null);
      setIsDepModalOpen(true);
    } else {
      setEditingPath(null);
      setIsPathModalOpen(true);
    }
  };

  const getNewButtonLabel = () => {
    switch (activeTab) {
      case "workers":
        return departments.length === 0 ? "מחלקה חדשה" : "עובד חדש";
      case "departments":
        return "מחלקה חדשה";
      case "onboarding":
        return "מסלול חדש";
    }
  };

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold bg-linear-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            ניהול עובדים
          </h1>
          <p className="text-gray-600 mt-1">
            גיוס, קליטה, הדרכה ומעקב אחר עובדים
          </p>
        </div>
        <button
          onClick={handleNewClick}
          className="flex items-center gap-2 bg-linear-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl font-medium hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl hover:scale-[1.02]"
        >
          <Plus className="h-5 w-5" />
          {getNewButtonLabel()}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Users}
          label="סה״כ עובדים"
          value={stats.totalWorkers}
          color="indigo"
        />
        <StatCard
          icon={Clock}
          label="בקליטה"
          value={stats.onboardingWorkers}
          color="amber"
        />
        <StatCard
          icon={CheckCircle2}
          label="פעילים"
          value={stats.activeWorkers}
          color="emerald"
        />
        <StatCard
          icon={Building2}
          label="מחלקות"
          value={stats.departments}
          color="purple"
        />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all ${
              activeTab === tab.id
                ? "bg-linear-to-r from-indigo-600 to-purple-600 text-white shadow-md"
                : "bg-white/80 text-gray-700 hover:bg-white hover:shadow-md border border-gray-200"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
            <span
              className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === tab.id ? "bg-white/20" : "bg-gray-100"
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filters (only for workers tab) */}
      {activeTab === "workers" && (
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="חיפוש עובד..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-10 pl-4 py-2.5 bg-white/80 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 bg-white/80 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition min-w-[150px]"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={departmentFilter ?? ""}
            onChange={(e) =>
              setDepartmentFilter(
                e.target.value ? Number(e.target.value) : null,
              )
            }
            className="px-4 py-2.5 bg-white/80 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition min-w-[150px]"
          >
            <option value="">כל המחלקות</option>
            {departments.map((dep) => (
              <option key={dep.id} value={dep.id}>
                {dep.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Content */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/50 overflow-visible">
        {activeTab === "workers" &&
          (departments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="bg-purple-100 p-4 rounded-full mb-6 relative">
                <div className="absolute inset-0 bg-purple-200 blur-xl opacity-50 rounded-full"></div>
                <Building2 className="h-12 w-12 text-purple-600 relative z-10" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                טרם נוצרו מחלקות
              </h3>
              <p className="text-gray-600 max-w-md mb-8">
                לפני שניתן להוסיף עובדים, יש ליצור מחלקה אחת לפחות. עובדים
                מקושרים למחלקות ולכן שלב זה הכרחי.
              </p>
              <button
                onClick={() => {
                  setEditingDepartment(null);
                  setIsDepModalOpen(true);
                }}
                className="flex items-center gap-2 bg-linear-to-r from-purple-600 to-indigo-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1"
              >
                <Plus className="h-6 w-6" />
                צור מחלקה חדשה
              </button>
            </div>
          ) : (
            <WorkersList
              workers={workers}
              departments={departments}
              searchQuery={searchQuery}
              statusFilter={statusFilter}
              departmentFilter={departmentFilter}
              onEdit={(worker) => {
                setEditingWorker(worker as Worker);
                setIsWorkerModalOpen(true);
              }}
              onDelete={(id) => {
                setWorkers(workers.filter((w) => w.id !== id));
              }}
              onAdd={() => {
                setEditingWorker(null);
                setIsWorkerModalOpen(true);
              }}
            />
          ))}
        {activeTab === "departments" && (
          <DepartmentsList
            departments={departments}
            onEdit={(dep) => {
              setEditingDepartment(dep);
              setIsDepModalOpen(true);
            }}
            onDelete={(id) => {
              setDepartments(departments.filter((d) => d.id !== id));
            }}
          />
        )}
        {activeTab === "onboarding" && (
          <OnboardingPathsList
            paths={onboardingPaths}
            departments={departments}
            onEdit={(path) => {
              setEditingPath(path as OnboardingPath);
              setIsPathModalOpen(true);
            }}
            onDelete={(id) => {
              setOnboardingPaths(onboardingPaths.filter((p) => p.id !== id));
            }}
          />
        )}
      </div>

      {/* Modals */}
      {isWorkerModalOpen && (
        <WorkerModal
          worker={editingWorker}
          departments={departments}
          users={users}
          onboardingPaths={onboardingPaths}
          onClose={() => {
            setIsWorkerModalOpen(false);
            setEditingWorker(null);
          }}
          onSave={handleWorkerSaved}
        />
      )}

      {isDepModalOpen && (
        <DepartmentModal
          department={editingDepartment}
          users={users}
          onClose={() => {
            setIsDepModalOpen(false);
            setEditingDepartment(null);
          }}
          onSave={handleDepartmentSaved}
        />
      )}

      {isPathModalOpen && (
        <OnboardingPathModal
          path={editingPath}
          departments={departments}
          users={users.map((u) => ({ id: u.id, name: u.name }))}
          tables={tables}
          userPlan={userPlan}
          onClose={() => {
            setIsPathModalOpen(false);
            setEditingPath(null);
          }}
          onSave={handlePathSaved}
        />
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  color: "indigo" | "amber" | "emerald" | "purple";
}) {
  const colors = {
    indigo: "from-indigo-500 to-indigo-600",
    amber: "from-amber-500 to-amber-600",
    emerald: "from-emerald-500 to-emerald-600",
    purple: "from-purple-500 to-purple-600",
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-white/50 shadow-md hover:shadow-lg transition-all">
      <div className="flex items-center gap-3">
        <div
          className={`p-2.5 rounded-lg bg-linear-to-br ${colors[color]} text-white`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-600">{label}</p>
        </div>
      </div>
    </div>
  );
}
