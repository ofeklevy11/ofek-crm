"use client";

import { GoalWithProgress } from "@/app/actions/goals";
import {
  Table,
  FileText,
  CheckSquare,
  Calendar,
  DollarSign,
  Wallet,
  Database,
  Search,
  Users,
  Briefcase,
  Hash,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface GoalContextExplanationProps {
  goal: GoalWithProgress;
  tables: { id: number; name: string; columns?: any[] }[];
  mode?: "card" | "table";
}

export default function GoalContextExplanation({
  goal,
  tables,
  mode = "card",
}: GoalContextExplanationProps) {
  const { metricType, filters, targetType } = goal;

  const DetailRow = ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <div
      className={cn(
        "flex items-start gap-2 text-gray-600",
        mode === "table" ? "text-xs" : "text-sm",
      )}
    >
      <span
        className={cn(
          "font-medium text-gray-500 pt-0.5",
          mode === "table" ? "min-w-[70px]" : "min-w-[80px]",
        )}
      >
        {label}:
      </span>
      <div className="flex flex-wrap gap-1.5 flex-1">{children}</div>
    </div>
  );

  const Badge = ({
    children,
    className,
    variant = "gray",
  }: {
    children: React.ReactNode;
    className?: string;
    variant?: "gray" | "blue" | "purple" | "yellow" | "red";
  }) => {
    const variants = {
      gray: "bg-gray-100 text-gray-700 border-gray-200",
      blue: "bg-[#4f95ff]/10 text-[#4f95ff] border-[#4f95ff]/20",
      purple: "bg-[#a24ec1]/10 text-[#a24ec1] border-[#a24ec1]/20",
      yellow: "bg-orange-50 text-orange-700 border-orange-200",
      red: "bg-red-50 text-red-700 border-red-200",
    };

    return (
      <span
        className={cn(
          "px-2.5 py-0.5 rounded-md border flex items-center gap-1.5 font-medium text-xs shadow-sm",
          variants[variant],
          className,
        )}
      >
        {children}
      </span>
    );
  };

  const getColumnLabel = (
    tableId: number | undefined,
    columnKey: string | undefined,
  ) => {
    if (!tableId || !columnKey) return columnKey;
    const table = tables.find((t) => t.id === Number(tableId));
    if (!table || !table.columns) return columnKey;

    // Find column by key
    const column = table.columns.find(
      (c: any) => c.key === columnKey || c.id === columnKey,
    );
    return column ? column.name : columnKey;
  };

  const renderContent = () => {
    switch (metricType) {
      case "REVENUE":
      case "SALES":
        // Sub-case 1: Finance Record
        if (filters.source === "FINANCE_RECORD") {
          return (
            <div
              className={cn(
                "flex flex-col",
                mode === "table" ? "gap-1.5" : "gap-2.5",
              )}
            >
              <DetailRow label="מקור נתונים">
                <Badge variant="gray">
                  <Wallet className="w-3 h-3" />
                  מודול כספים (תזרים)
                </Badge>
              </DetailRow>
              <DetailRow label="סוג חישוב">
                <Badge variant="purple">
                  {metricType === "REVENUE"
                    ? "סיכום הכנסות (₪)"
                    : "ספירת עסקאות"}
                </Badge>
              </DetailRow>
              {filters.columnKey && filters.columnKey !== "all" && (
                <DetailRow label="קטגוריה">
                  <Badge variant="blue">{filters.columnKey}</Badge>
                </DetailRow>
              )}
            </div>
          );
        }
        // Sub-case 2: Custom Table
        if (filters.source === "TABLE" && filters.tableId) {
          const tableName =
            tables.find((t) => t.id === Number(filters.tableId))?.name ||
            "טבלה לא ידועה";

          const columnLabel = getColumnLabel(
            filters.tableId,
            filters.columnKey,
          );

          return (
            <div
              className={cn(
                "flex flex-col",
                mode === "table" ? "gap-1.5" : "gap-2.5",
              )}
            >
              <DetailRow label="מקור נתונים">
                <Badge variant="gray">
                  <Database className="w-3 h-3" />
                  טבלה: {tableName}
                </Badge>
              </DetailRow>
              <DetailRow label="סוג חישוב">
                <Badge variant="purple">
                  {metricType === "REVENUE" ? "סיכום ערך כספי" : "ספירת רשומות"}
                </Badge>
              </DetailRow>
              {filters.columnKey && (
                <DetailRow label="עמודת סיכום">
                  <Badge variant="blue">{columnLabel}</Badge>
                </DetailRow>
              )}
            </div>
          );
        }
        // Sub-case 3: Transactions / Payments System
        if (filters.source === "TRANSACTIONS_RETAINER") {
          return (
            <div
              className={cn(
                "flex flex-col",
                mode === "table" ? "gap-1.5" : "gap-2.5",
              )}
            >
              <DetailRow label="מקור נתונים">
                <Badge variant="gray">
                  <Briefcase className="w-3 h-3" />
                  גביית ריטיינרים בלבד
                </Badge>
              </DetailRow>
              <DetailRow label="סוג חישוב">
                <Badge variant="blue">
                  סיכום תשלומים מריטיינרים בסטטוס שולם
                </Badge>
              </DetailRow>
              <DetailRow label="סטטוס">
                <Badge variant="purple">הושלם / שולם (Paid)</Badge>
              </DetailRow>
            </div>
          );
        }

        // Default: One-time payments
        return (
          <div
            className={cn(
              "flex flex-col",
              mode === "table" ? "gap-1.5" : "gap-2.5",
            )}
          >
            <DetailRow label="מקור נתונים">
              <Badge variant="gray">
                <DollarSign className="w-3 h-3" />
                גביית תשלומים חד פעמיים
              </Badge>
            </DetailRow>
            <DetailRow label="סוג חישוב">
              <Badge variant="blue">סיכום עסקאות חד פעמיות בסטטוס שולם</Badge>
            </DetailRow>
            <DetailRow label="סטטוס">
              <Badge variant="purple">הושלם / שולם (Paid)</Badge>
            </DetailRow>
          </div>
        );

      case "RECORDS":
        if (filters.tableId) {
          const tableName =
            tables.find((t) => t.id === Number(filters.tableId))?.name ||
            "טבלה לא ידועה";

          const isSum = targetType === "SUM";
          const columnLabel = getColumnLabel(
            filters.tableId,
            filters.columnKey,
          );

          return (
            <div
              className={cn(
                "flex flex-col",
                mode === "table" ? "gap-1.5" : "gap-2.5",
              )}
            >
              <DetailRow label="מקור הנתונים">
                <Badge variant="gray">
                  <Table className="w-3 h-3" />
                  טבלה: {tableName}
                </Badge>
              </DetailRow>

              <DetailRow label="שיטת חישוב">
                <Badge variant="purple">
                  <Hash className="w-3 h-3" />
                  {isSum ? "סיכום ערכים מספריים" : "ספירת כמות רשומות"}
                </Badge>
              </DetailRow>

              {isSum && filters.columnKey && (
                <DetailRow label="עמודה לחישוב">
                  <Badge variant="blue">{columnLabel}</Badge>
                </DetailRow>
              )}
            </div>
          );
        }
        return null;

      case "TASKS":
        const isReduce = filters.taskGoalMode === "REDUCE";
        const statusMap: Record<string, string> = {
          TODO: "לביצוע",
          IN_PROGRESS: "בטיפול",
          WAITING_CLIENT: "ממתין ללקוח",
          ON_HOLD: "מושהה",
          COMPLETED: "הושלם",
        };
        const statusLabel = filters.status
          ? statusMap[filters.status] || filters.status
          : isReduce
            ? "משימות פתוחות (לביצוע)"
            : "משימות שהושלמו";

        return (
          <div
            className={cn(
              "flex flex-col",
              mode === "table" ? "gap-1.5" : "gap-2.5",
            )}
          >
            <DetailRow label="סוג היעד">
              <Badge variant={isReduce ? "purple" : "blue"}>
                <CheckSquare className="w-3 h-3" />
                {isReduce
                  ? "צמצום עומס (הורדת כמות)"
                  : "תפוקת עבודה (הגדלת כמות)"}
              </Badge>
            </DetailRow>
            <DetailRow label="סטטוס משימות">
              <Badge variant="gray">{statusLabel}</Badge>
            </DetailRow>
            {isReduce && (
              <DetailRow label="משמעות">
                <span className="text-xs text-gray-500 mt-0.5">
                  הצלחה = פחות משימות מהיעד
                </span>
              </DetailRow>
            )}
          </div>
        );

      case "CALENDAR":
        return (
          <div
            className={cn(
              "flex flex-col",
              mode === "table" ? "gap-1.5" : "gap-2.5",
            )}
          >
            <DetailRow label="מקור נתונים">
              <Badge variant="gray">
                <Calendar className="w-3 h-3" />
                יומן פגישות מערכת
              </Badge>
            </DetailRow>

            <DetailRow label="סינון אירועים">
              {filters.searchQuery ? (
                <Badge variant="yellow">
                  <Filter className="w-3 h-3" />
                  שם/תיאור מכיל: "{filters.searchQuery}"
                </Badge>
              ) : (
                <Badge variant="gray">כל הפגישות והאירועים</Badge>
              )}
            </DetailRow>

            <DetailRow label="אופן חישוב">
              <span className="text-xs text-gray-500 mt-0.5">
                ספירת כמות האירועים המתקיימים בטווח התאריכים
              </span>
            </DetailRow>
          </div>
        );

      case "CUSTOMERS":
        return (
          <div
            className={cn(
              "flex flex-col",
              mode === "table" ? "gap-1.5" : "gap-2.5",
            )}
          >
            <DetailRow label="מקור נתונים">
              <Badge variant="gray">
                <Users className="w-3 h-3" />
                לקוחות פעילים
              </Badge>
            </DetailRow>
            <DetailRow label="שיטת חישוב">
              <Badge variant="blue">ספירת לקוחות חדשים שנוספו</Badge>
            </DetailRow>
          </div>
        );

      case "QUOTES":
        const quoteStatusMap: Record<string, string> = {
          DRAFT: "טיוטה",
          SENT: "נשלחה",
          ACCEPTED: "אושרה",
          REJECTED: "נדחתה",
        };
        const quoteStatusLabel =
          filters.status && filters.status !== "all"
            ? quoteStatusMap[filters.status] || filters.status
            : "כל הצעות המחיר";

        return (
          <div
            className={cn(
              "flex flex-col",
              mode === "table" ? "gap-1.5" : "gap-2.5",
            )}
          >
            <DetailRow label="מקור נתונים">
              <Badge variant="gray">
                <FileText className="w-3 h-3" />
                הצעות מחיר
              </Badge>
            </DetailRow>

            <DetailRow label="סינון סטטוס">
              <Badge
                variant={
                  filters.status && filters.status !== "all" ? "purple" : "gray"
                }
              >
                {quoteStatusLabel}
              </Badge>
            </DetailRow>

            <DetailRow label="סוג יעד">
              <Badge variant="blue">
                {targetType === "SUM" ? "ערך כספי (סכום)" : "כמות הצעות מחיר"}
              </Badge>
            </DetailRow>
          </div>
        );

      case "RETAINERS":
        return (
          <div
            className={cn(
              "flex flex-col",
              mode === "table" ? "gap-1.5" : "gap-2.5",
            )}
          >
            <DetailRow label="מקור נתונים">
              <Badge variant="gray">
                <Briefcase className="w-3 h-3" />
                מודול ריטיינרים
              </Badge>
            </DetailRow>
            {filters.frequency && filters.frequency !== "all" && (
              <DetailRow label="תדירות חיוב">
                <Badge variant="purple">
                  {{
                    monthly: "חודשי",
                    quarterly: "רבעוני",
                    yearly: "שנתי",
                  }[filters.frequency] || filters.frequency}
                </Badge>
              </DetailRow>
            )}
            <DetailRow label="יעד">
              <Badge variant="blue">שווי ריטיינרים חודשי (MRR)</Badge>
            </DetailRow>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className={cn(
        mode === "card" &&
          "mt-4 pt-4 border-t border-gray-100 bg-gray-50/50 -mx-6 px-6 pb-4",
        mode === "table" && "mt-2 pt-1 pb-1",
      )}
    >
      {renderContent()}
    </div>
  );
}
