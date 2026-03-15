"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Check,
  Calendar,
  CheckSquare,
  FileText,
  Users,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { getUsers } from "@/app/actions/users";
import { getMeetingTypes } from "@/app/actions/meetings";
import { getGoogleCalendarStatus } from "@/app/actions/google-calendar";

// ── Types ──────────────────────────────────────────────────────────

type MiniWidgetType = "MINI_CALENDAR" | "MINI_TASKS" | "MINI_QUOTES" | "MINI_MEETINGS";

interface MiniWidgetConfigModalProps {
  widgetType: MiniWidgetType;
  currentSettings?: any;
  onConfirm: (settings: any) => void;
  onClose: () => void;
  canViewAllTasks?: boolean;
}

// ── Theme per type ────────────────────────────────────────────────

const THEME: Record<MiniWidgetType, {
  label: string;
  icon: typeof Calendar;
  gradient: string;
  ring: string;
  bg: string;
  text: string;
  btn: string;
  btnHover: string;
  badge: string;
}> = {
  MINI_CALENDAR: {
    label: "מיני יומן",
    icon: Calendar,
    gradient: "from-cyan-400 to-blue-500",
    ring: "ring-cyan-400",
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    btn: "bg-cyan-600",
    btnHover: "hover:bg-cyan-700",
    badge: "bg-cyan-100 text-cyan-700",
  },
  MINI_TASKS: {
    label: "מיני משימות",
    icon: CheckSquare,
    gradient: "from-orange-400 to-amber-500",
    ring: "ring-orange-400",
    bg: "bg-orange-50",
    text: "text-orange-700",
    btn: "bg-orange-600",
    btnHover: "hover:bg-orange-700",
    badge: "bg-orange-100 text-orange-700",
  },
  MINI_QUOTES: {
    label: "מיני הצעות מחיר",
    icon: FileText,
    gradient: "from-indigo-400 to-violet-500",
    ring: "ring-indigo-400",
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    btn: "bg-indigo-600",
    btnHover: "hover:bg-indigo-700",
    badge: "bg-indigo-100 text-indigo-700",
  },
  MINI_MEETINGS: {
    label: "מיני פגישות",
    icon: Users,
    gradient: "from-violet-400 to-purple-500",
    ring: "ring-violet-400",
    bg: "bg-violet-50",
    text: "text-violet-700",
    btn: "bg-violet-600",
    btnHover: "hover:bg-violet-700",
    badge: "bg-violet-100 text-violet-700",
  },
};

// ── Preset definitions ─────────────────────────────────────────────

interface PresetDef { id: string; label: string; icon: string; }

const CALENDAR_PRESETS: PresetDef[] = [
  { id: "today", label: "היום", icon: "📅" },
  { id: "this_week", label: "השבוע", icon: "🗓️" },
  { id: "7d", label: "7 ימים", icon: "📆" },
  { id: "14d", label: "14 ימים", icon: "🗃️" },
  { id: "this_month", label: "החודש", icon: "📋" },
];

const TASKS_PRESETS: PresetDef[] = [
  { id: "overdue", label: "באיחור", icon: "🔴" },
  { id: "my_active", label: "המשימות שלי", icon: "👤" },
  { id: "all_active", label: "כל הפעילות", icon: "📋" },
  { id: "due_this_week", label: "לשבוע", icon: "🗓️" },
];

const MEETINGS_PRESETS: PresetDef[] = [
  { id: "today", label: "היום", icon: "📅" },
  { id: "this_week", label: "השבוע", icon: "🗓️" },
  { id: "7d", label: "7 ימים", icon: "📆" },
  { id: "14d", label: "14 ימים", icon: "🗃️" },
  { id: "this_month", label: "החודש", icon: "📋" },
];

const QUOTES_PRESETS: PresetDef[] = [
  { id: "recent", label: "אחרונות", icon: "🕐" },
  { id: "this_month", label: "החודש", icon: "📅" },
  { id: "pending", label: "ממתינות", icon: "⏳" },
  { id: "closed", label: "עסקאות סגורות", icon: "✅" },
];

// ── Default settings builders ──────────────────────────────────────

function getDefaultCalendarSettings(preset = "14d") {
  return { preset, maxEvents: 15 };
}

function getDefaultTasksSettings(preset = "my_active") {
  return {
    preset,
    statusFilter: [] as string[],
    priorityFilter: [] as string[],
    assigneeFilter: "mine",
    dueDatePreset: "all",
    sortBy: "priority",
    maxTasks: 20,
    showCompleted: false,
  };
}

function getDefaultMeetingsSettings(preset = "today") {
  return {
    preset,
    statusFilter: [] as string[],
    meetingTypeFilter: [] as number[],
    sortBy: "startTime",
    maxMeetings: 15,
  };
}

function getDefaultQuotesSettings(preset = "recent") {
  return {
    preset,
    statusFilter: [] as string[],
    datePreset: "all",
    currencyFilter: [] as string[],
    sortBy: "createdAt",
    maxQuotes: 15,
  };
}

// ── Populate advanced from preset ──────────────────────────────────

function advancedFromCalendarPreset(preset: string) {
  return { maxEvents: 15 };
}

function advancedFromTasksPreset(preset: string) {
  const base = getDefaultTasksSettings(preset);
  switch (preset) {
    case "overdue":
      return { ...base, dueDatePreset: "overdue" };
    case "my_active":
      return { ...base, assigneeFilter: "mine" };
    case "all_active":
      return { ...base, assigneeFilter: "all" };
    case "due_this_week":
      return { ...base, dueDatePreset: "this_week" };
    default:
      return base;
  }
}

function advancedFromMeetingsPreset(preset: string) {
  return getDefaultMeetingsSettings(preset);
}

function advancedFromQuotesPreset(preset: string) {
  const base = getDefaultQuotesSettings(preset);
  switch (preset) {
    case "this_month":
      return { ...base, datePreset: "this_month" };
    case "pending":
      return { ...base, statusFilter: ["DRAFT", "SENT"] };
    case "closed":
      return { ...base, statusFilter: ["ACCEPTED", "REJECTED"] };
    default:
      return base;
  }
}

// ── Segmented Control ──────────────────────────────────────────────

function SegmentedControl({
  options,
  value,
  onChange,
  themeColor,
}: {
  options: { value: string | number; label: string }[];
  value: string | number;
  onChange: (val: any) => void;
  themeColor?: string;
}) {
  return (
    <div className="flex bg-gray-100 p-0.5 rounded-lg gap-0.5" role="radiogroup">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={String(value) === String(opt.value)}
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-all ${
            String(value) === String(opt.value)
              ? `bg-white shadow text-gray-900`
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Toggle Chip ────────────────────────────────────────────────────

function ToggleChip({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all ${
        active
          ? `${color || "bg-blue-100 text-blue-700 border-blue-200"}`
          : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
      }`}
    >
      {label}
    </button>
  );
}

// ── Date Picker Field ──────────────────────────────────────────────

function DatePickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (val: string | undefined) => void;
}) {
  const dateVal = value ? new Date(value) : undefined;
  return (
    <div className="flex-1">
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-full text-right px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:border-gray-300 transition bg-white"
          >
            {dateVal
              ? dateVal.toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" })
              : "בחר תאריך"}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <CalendarPicker
            mode="single"
            selected={dateVal}
            onSelect={(d) => onChange(d ? d.toISOString() : undefined)}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export default function MiniWidgetConfigModal({
  widgetType,
  currentSettings,
  onConfirm,
  onClose,
  canViewAllTasks = false,
}: MiniWidgetConfigModalProps) {
  const theme = THEME[widgetType];
  const Icon = theme.icon;
  const isEdit = !!currentSettings;

  // ── State ──────────────────────────────────────────────────────

  // Calendar state
  const [calPreset, setCalPreset] = useState(
    currentSettings?.preset || "14d"
  );
  const [calMaxEvents, setCalMaxEvents] = useState(
    currentSettings?.maxEvents ?? 15
  );
  const [calCustomFrom, setCalCustomFrom] = useState<string | undefined>(
    currentSettings?.customFrom
  );
  const [calCustomTo, setCalCustomTo] = useState<string | undefined>(
    currentSettings?.customTo
  );
  const [calSource, setCalSource] = useState<"crm" | "google" | "all">(
    currentSettings?.calendarSource || "crm"
  );
  const [googleCalConnected, setGoogleCalConnected] = useState<boolean | null>(null);

  // Tasks state
  const [taskPreset, setTaskPreset] = useState(
    currentSettings?.preset || "my_active"
  );
  const [taskStatusFilter, setTaskStatusFilter] = useState<string[]>(
    currentSettings?.statusFilter || []
  );
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<string[]>(
    currentSettings?.priorityFilter || []
  );
  const [taskAssignee, setTaskAssignee] = useState(
    currentSettings?.assigneeFilter || "mine"
  );
  const [taskDueDatePreset, setTaskDueDatePreset] = useState(
    currentSettings?.dueDatePreset || "all"
  );
  const [taskDueDateFrom, setTaskDueDateFrom] = useState<string | undefined>(
    currentSettings?.dueDateFrom
  );
  const [taskDueDateTo, setTaskDueDateTo] = useState<string | undefined>(
    currentSettings?.dueDateTo
  );
  const [taskSortBy, setTaskSortBy] = useState(
    currentSettings?.sortBy || "priority"
  );
  const [taskMaxTasks, setTaskMaxTasks] = useState(
    currentSettings?.maxTasks ?? 20
  );
  const [taskShowCompleted, setTaskShowCompleted] = useState(
    currentSettings?.showCompleted ?? false
  );
  const [taskSpecificUserId, setTaskSpecificUserId] = useState<number | undefined>(
    currentSettings?.specificUserId
  );
  const [users, setUsers] = useState<{ id: number; name: string }[]>([]);

  // Quotes state
  const [quotePreset, setQuotePreset] = useState(
    currentSettings?.preset || "recent"
  );
  const [quoteStatusFilter, setQuoteStatusFilter] = useState<string[]>(
    currentSettings?.statusFilter || []
  );
  const [quoteDatePreset, setQuoteDatePreset] = useState(
    currentSettings?.datePreset || "all"
  );
  const [quoteDateFrom, setQuoteDateFrom] = useState<string | undefined>(
    currentSettings?.dateFrom
  );
  const [quoteDateTo, setQuoteDateTo] = useState<string | undefined>(
    currentSettings?.dateTo
  );
  const [quoteCurrencyFilter, setQuoteCurrencyFilter] = useState<string[]>(
    currentSettings?.currencyFilter || []
  );
  const [quoteSortBy, setQuoteSortBy] = useState(
    currentSettings?.sortBy || "createdAt"
  );
  const [quoteMaxQuotes, setQuoteMaxQuotes] = useState(
    currentSettings?.maxQuotes ?? 15
  );

  // Meetings state
  const [meetPreset, setMeetPreset] = useState(
    currentSettings?.preset || "today"
  );
  const [meetStatusFilter, setMeetStatusFilter] = useState<string[]>(
    currentSettings?.statusFilter || []
  );
  const [meetTypeFilter, setMeetTypeFilter] = useState<number[]>(
    currentSettings?.meetingTypeFilter || []
  );
  const [meetSortBy, setMeetSortBy] = useState(
    currentSettings?.sortBy || "startTime"
  );
  const [meetMaxMeetings, setMeetMaxMeetings] = useState(
    currentSettings?.maxMeetings ?? 15
  );
  const [meetDateFrom, setMeetDateFrom] = useState<string | undefined>(
    currentSettings?.dateFrom
  );
  const [meetDateTo, setMeetDateTo] = useState<string | undefined>(
    currentSettings?.dateTo
  );
  const [meetingTypes, setMeetingTypes] = useState<{ id: number; name: string; color?: string | null }[]>([]);

  // Meetings source state
  const [meetSource, setMeetSource] = useState<"crm" | "google_meet" | "all">(
    currentSettings?.meetingSource || "crm"
  );

  // ── Preset selection handlers ──────────────────────────────────

  const handleCalendarPreset = useCallback((preset: string) => {
    setCalPreset(preset);
    const adv = advancedFromCalendarPreset(preset);
    setCalMaxEvents(adv.maxEvents);
    setCalCustomFrom(undefined);
    setCalCustomTo(undefined);
  }, []);

  const handleTasksPreset = useCallback((preset: string) => {
    setTaskPreset(preset);
    const adv = advancedFromTasksPreset(preset);
    setTaskStatusFilter(adv.statusFilter);
    setTaskPriorityFilter(adv.priorityFilter);
    setTaskAssignee(adv.assigneeFilter);
    setTaskDueDatePreset(adv.dueDatePreset);
    setTaskDueDateFrom(undefined);
    setTaskDueDateTo(undefined);
    setTaskSortBy(adv.sortBy);
    setTaskMaxTasks(adv.maxTasks);
    setTaskShowCompleted(adv.showCompleted);
  }, []);

  const handleQuotesPreset = useCallback((preset: string) => {
    setQuotePreset(preset);
    const adv = advancedFromQuotesPreset(preset);
    setQuoteStatusFilter(adv.statusFilter);
    setQuoteDatePreset(adv.datePreset);
    setQuoteDateFrom(undefined);
    setQuoteDateTo(undefined);
    setQuoteCurrencyFilter(adv.currencyFilter);
    setQuoteSortBy(adv.sortBy);
    setQuoteMaxQuotes(adv.maxQuotes);
  }, []);

  const handleMeetingsPreset = useCallback((preset: string) => {
    setMeetPreset(preset);
    const adv = advancedFromMeetingsPreset(preset);
    setMeetStatusFilter(adv.statusFilter);
    setMeetTypeFilter(adv.meetingTypeFilter);
    setMeetDateFrom(undefined);
    setMeetDateTo(undefined);
    setMeetSortBy(adv.sortBy);
    setMeetMaxMeetings(adv.maxMeetings);
  }, []);

  // Fetch users for "specific user" filter
  useEffect(() => {
    if (canViewAllTasks) {
      getUsers().then((res) => {
        if (res.success && res.data) setUsers(res.data);
      });
    }
  }, [canViewAllTasks]);

  // Fetch meeting types for meetings widget
  useEffect(() => {
    if (widgetType === "MINI_MEETINGS") {
      getMeetingTypes().then((res) => {
        if (res.success && res.data) setMeetingTypes(res.data as any);
      });
    }
  }, [widgetType]);

  // Check Google Calendar connection status
  useEffect(() => {
    if (widgetType === "MINI_CALENDAR" || widgetType === "MINI_MEETINGS") {
      getGoogleCalendarStatus().then((res) => {
        setGoogleCalConnected(res.connected);
      });
    }
  }, [widgetType]);

  // Switch to custom when advanced field changes
  const goCustom = useCallback(() => {
    if (widgetType === "MINI_CALENDAR") setCalPreset("custom");
    else if (widgetType === "MINI_TASKS") setTaskPreset("custom");
    else if (widgetType === "MINI_MEETINGS") setMeetPreset("custom");
    else setQuotePreset("custom");
  }, [widgetType]);

  // ── Build result settings ──────────────────────────────────────

  const buildSettings = () => {
    if (widgetType === "MINI_CALENDAR") {
      return {
        collapsed: currentSettings?.collapsed ?? false,
        preset: calPreset,
        ...(calPreset === "custom" ? { customFrom: calCustomFrom, customTo: calCustomTo } : {}),
        maxEvents: calMaxEvents,
        calendarSource: calSource,
      };
    }
    if (widgetType === "MINI_TASKS") {
      return {
        collapsed: currentSettings?.collapsed ?? false,
        preset: taskPreset,
        statusFilter: taskStatusFilter,
        priorityFilter: taskPriorityFilter,
        assigneeFilter: taskAssignee,
        specificUserId: taskAssignee === "specific" ? taskSpecificUserId : undefined,
        dueDatePreset: taskDueDatePreset,
        ...(taskDueDatePreset === "custom" ? { dueDateFrom: taskDueDateFrom, dueDateTo: taskDueDateTo } : {}),
        sortBy: taskSortBy,
        maxTasks: taskMaxTasks,
        showCompleted: taskShowCompleted,
      };
    }
    if (widgetType === "MINI_MEETINGS") {
      return {
        collapsed: currentSettings?.collapsed ?? false,
        preset: meetPreset,
        statusFilter: meetStatusFilter,
        meetingTypeFilter: meetTypeFilter,
        ...(meetPreset === "custom" ? { dateFrom: meetDateFrom, dateTo: meetDateTo } : {}),
        sortBy: meetSortBy,
        maxMeetings: meetMaxMeetings,
        meetingSource: meetSource,
      };
    }
    // MINI_QUOTES
    return {
      collapsed: currentSettings?.collapsed ?? false,
      preset: quotePreset,
      statusFilter: quoteStatusFilter,
      datePreset: quoteDatePreset,
      ...(quoteDatePreset === "custom" ? { dateFrom: quoteDateFrom, dateTo: quoteDateTo } : {}),
      currencyFilter: quoteCurrencyFilter,
      sortBy: quoteSortBy,
      maxQuotes: quoteMaxQuotes,
    };
  };

  // ── Helpers ────────────────────────────────────────────────────

  const toggleArrayItem = (arr: string[], item: string) =>
    arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item];

  const presets =
    widgetType === "MINI_CALENDAR"
      ? CALENDAR_PRESETS
      : widgetType === "MINI_TASKS"
        ? TASKS_PRESETS
        : widgetType === "MINI_MEETINGS"
          ? MEETINGS_PRESETS
          : QUOTES_PRESETS;

  const activePreset =
    widgetType === "MINI_CALENDAR"
      ? calPreset
      : widgetType === "MINI_TASKS"
        ? taskPreset
        : widgetType === "MINI_MEETINGS"
          ? meetPreset
          : quotePreset;

  const handlePresetSelect = (id: string) => {
    if (widgetType === "MINI_CALENDAR") handleCalendarPreset(id);
    else if (widgetType === "MINI_TASKS") handleTasksPreset(id);
    else if (widgetType === "MINI_MEETINGS") handleMeetingsPreset(id);
    else handleQuotesPreset(id);
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col p-0" showCloseButton>
        {/* Themed Header */}
        <div className={`h-2 w-full bg-linear-to-r ${theme.gradient}`} aria-hidden="true" />
        <div className="p-5 pb-0">
          <DialogHeader className="mb-5">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-xl ${theme.bg}`} aria-hidden="true">
                <Icon size={20} className={theme.text} />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-gray-900">
                  {isEdit ? "עריכת הגדרות" : "הגדרת ווידג׳ט"}
                </DialogTitle>
                <DialogDescription className="text-xs text-gray-500">{theme.label}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Quick Presets */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-500 mb-2">
              בחר תצורה מהירה
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {presets.map((p) => {
                const isActive = activePreset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePresetSelect(p.id)}
                    className={`relative flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                      isActive
                        ? `${theme.bg} border-current ${theme.text} shadow-sm`
                        : "bg-white border-gray-100 hover:border-gray-200 text-gray-600 hover:shadow-sm"
                    }`}
                  >
                    {isActive && (
                      <div className={`absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full ${theme.btn} flex items-center justify-center`}>
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                    <span className="text-lg">{p.icon}</span>
                    <span className="text-sm font-medium">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {/* Separator */}
          <div className="border-t border-gray-100 mb-4" />

          {/* Filter Settings */}
          <div className="space-y-4">
              {/* ── Calendar Advanced ─────────────────── */}
              {widgetType === "MINI_CALENDAR" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      מקור יומן
                    </label>
                    <SegmentedControl
                      options={[
                        { value: "crm", label: "יומן מערכת" },
                        { value: "google", label: "Google Calendar" },
                        { value: "all", label: "הכל" },
                      ]}
                      value={calSource}
                      onChange={(v: string) => setCalSource(v as "crm" | "google" | "all")}
                    />
                    {googleCalConnected === false && calSource !== "crm" && (
                      <p className="mt-1.5 text-xs text-amber-600">
                        יש לחבר Google Calendar בהגדרות היומן —{" "}
                        <a href="/calendar" className="underline hover:text-amber-700">
                          לחץ כאן
                        </a>
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      טווח תאריכים מותאם
                    </label>
                    <div className="flex gap-2">
                      <DatePickerField
                        label="מתאריך"
                        value={calCustomFrom}
                        onChange={(v) => { setCalCustomFrom(v); goCustom(); }}
                      />
                      <DatePickerField
                        label="עד תאריך"
                        value={calCustomTo}
                        onChange={(v) => { setCalCustomTo(v); goCustom(); }}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      מקסימום אירועים
                    </label>
                    <SegmentedControl
                      options={[
                        { value: 5, label: "5" },
                        { value: 10, label: "10" },
                        { value: 15, label: "15" },
                        { value: 25, label: "25" },
                        { value: 50, label: "50" },
                      ]}
                      value={calMaxEvents}
                      onChange={(v: number) => { setCalMaxEvents(v); goCustom(); }}
                    />
                  </div>
                </>
              )}

              {/* ── Tasks Advanced ────────────────────── */}
              {widgetType === "MINI_TASKS" && (
                <>
                  {/* Status Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      סינון סטטוס
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      <ToggleChip
                        label="הכל"
                        active={taskStatusFilter.length === 0}
                        color="bg-gray-100 text-gray-700 border-gray-300"
                        onClick={() => { setTaskStatusFilter([]); goCustom(); }}
                      />
                      {[
                        { id: "todo", label: "משימות", color: "bg-slate-100 text-slate-700 border-slate-200" },
                        { id: "in_progress", label: "משימות בטיפול", color: "bg-blue-100 text-blue-700 border-blue-200" },
                        { id: "waiting_client", label: "ממתינים לאישור לקוח", color: "bg-amber-100 text-amber-700 border-amber-200" },
                        { id: "on_hold", label: "משימות בהשהייה", color: "bg-gray-100 text-gray-600 border-gray-200" },
                        { id: "completed_month", label: "בוצעו החודש", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
                        { id: "done", label: "משימות שבוצעו", color: "bg-purple-100 text-purple-700 border-purple-200" },
                      ].map((s) => (
                        <ToggleChip
                          key={s.id}
                          label={s.label}
                          active={taskStatusFilter.includes(s.id)}
                          color={s.color}
                          onClick={() => {
                            setTaskStatusFilter(toggleArrayItem(taskStatusFilter, s.id));
                            goCustom();
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Priority Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      סינון עדיפות
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      <ToggleChip
                        label="הכל"
                        active={taskPriorityFilter.length === 0}
                        color="bg-gray-100 text-gray-700 border-gray-300"
                        onClick={() => { setTaskPriorityFilter([]); goCustom(); }}
                      />
                      {[
                        { id: "high", label: "גבוהה", color: "bg-red-100 text-red-700 border-red-200" },
                        { id: "medium", label: "בינונית", color: "bg-amber-100 text-amber-700 border-amber-200" },
                        { id: "low", label: "נמוכה", color: "bg-gray-100 text-gray-600 border-gray-200" },
                      ].map((p) => (
                        <ToggleChip
                          key={p.id}
                          label={p.label}
                          active={taskPriorityFilter.includes(p.id)}
                          color={p.color}
                          onClick={() => {
                            setTaskPriorityFilter(toggleArrayItem(taskPriorityFilter, p.id));
                            goCustom();
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Due Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      תאריך יעד
                    </label>
                    <SegmentedControl
                      options={[
                        { value: "all", label: "הכל" },
                        { value: "overdue", label: "באיחור" },
                        { value: "today", label: "היום" },
                        { value: "this_week", label: "השבוע" },
                        { value: "this_month", label: "החודש" },
                        { value: "custom", label: "מותאם" },
                      ]}
                      value={taskDueDatePreset}
                      onChange={(v: string) => {
                        setTaskDueDatePreset(v);
                        goCustom();
                      }}
                    />
                    {taskDueDatePreset === "custom" && (
                      <div className="flex gap-2 mt-2">
                        <DatePickerField
                          label="מתאריך"
                          value={taskDueDateFrom}
                          onChange={(v) => { setTaskDueDateFrom(v); goCustom(); }}
                        />
                        <DatePickerField
                          label="עד תאריך"
                          value={taskDueDateTo}
                          onChange={(v) => { setTaskDueDateTo(v); goCustom(); }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Assignee */}
                  {canViewAllTasks && (
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-2">
                        הצגת משימות
                      </label>
                      <SegmentedControl
                        options={[
                          { value: "mine", label: "המשימות שלי" },
                          { value: "all", label: "כל המשימות" },
                          { value: "specific", label: "לפי משתמש ספציפי" },
                        ]}
                        value={taskAssignee}
                        onChange={(v: string) => { setTaskAssignee(v); goCustom(); }}
                      />
                      {taskAssignee === "specific" && (
                        <div className="mt-2">
                          <Select
                            value={taskSpecificUserId !== undefined ? String(taskSpecificUserId) : undefined}
                            onValueChange={(v) => { setTaskSpecificUserId(Number(v)); goCustom(); }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="בחר משתמש" />
                            </SelectTrigger>
                            <SelectContent>
                              {users.map((u) => (
                                <SelectItem key={u.id} value={String(u.id)}>
                                  {u.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sort */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      מיון לפי
                    </label>
                    <SegmentedControl
                      options={[
                        { value: "priority", label: "עדיפות" },
                        { value: "dueDate", label: "תאריך יעד" },
                        { value: "createdAt", label: "תאריך יצירה" },
                      ]}
                      value={taskSortBy}
                      onChange={(v: string) => { setTaskSortBy(v); goCustom(); }}
                    />
                  </div>

                  {/* Max Tasks */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      מקסימום משימות
                    </label>
                    <SegmentedControl
                      options={[
                        { value: 5, label: "5" },
                        { value: 10, label: "10" },
                        { value: 20, label: "20" },
                        { value: 50, label: "50" },
                      ]}
                      value={taskMaxTasks}
                      onChange={(v: number) => { setTaskMaxTasks(v); goCustom(); }}
                    />
                  </div>

                  {/* Show Completed */}
                  <div className="flex items-center justify-between py-2">
                    <label className="text-sm font-medium text-gray-600">
                      הצג משימות שהושלמו
                    </label>
                    <Switch
                      checked={taskShowCompleted}
                      onCheckedChange={(v) => { setTaskShowCompleted(v); goCustom(); }}
                    />
                  </div>
                </>
              )}

              {/* ── Meetings Advanced ──────────────────── */}
              {widgetType === "MINI_MEETINGS" && (
                <>
                  {/* Meeting Source */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      מקור פגישות
                    </label>
                    <SegmentedControl
                      options={[
                        { value: "crm", label: "פגישות מערכת" },
                        { value: "google_meet", label: "Google Meet" },
                        { value: "all", label: "הכל" },
                      ]}
                      value={meetSource}
                      onChange={(v: string) => setMeetSource(v as "crm" | "google_meet" | "all")}
                    />
                    {googleCalConnected === false && meetSource !== "crm" && (
                      <p className="mt-1.5 text-xs text-amber-600">
                        יש לחבר Google Calendar בהגדרות היומן —{" "}
                        <a href="/calendar" className="underline hover:text-amber-700">
                          לחץ כאן
                        </a>
                      </p>
                    )}
                  </div>

                  {/* Status Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      סינון סטטוס
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      <ToggleChip
                        label="הכל"
                        active={meetStatusFilter.length === 0}
                        color="bg-gray-100 text-gray-700 border-gray-300"
                        onClick={() => setMeetStatusFilter([])}
                      />
                      {[
                        { id: "PENDING", label: "ממתין", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
                        { id: "CONFIRMED", label: "מאושר", color: "bg-blue-100 text-blue-700 border-blue-200" },
                        { id: "COMPLETED", label: "הושלם", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
                        { id: "CANCELLED", label: "בוטל", color: "bg-red-100 text-red-700 border-red-200" },
                        { id: "NO_SHOW", label: "לא הגיע", color: "bg-gray-100 text-gray-600 border-gray-200" },
                      ].map((s) => (
                        <ToggleChip
                          key={s.id}
                          label={s.label}
                          active={meetStatusFilter.includes(s.id)}
                          color={s.color}
                          onClick={() => {
                            setMeetStatusFilter(toggleArrayItem(meetStatusFilter, s.id));
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Meeting Type Filter */}
                  {meetingTypes.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-2">
                        סוג פגישה
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        <ToggleChip
                          label="הכל"
                          active={meetTypeFilter.length === 0}
                          color="bg-gray-100 text-gray-700 border-gray-300"
                          onClick={() => setMeetTypeFilter([])}
                        />
                        {meetingTypes.map((mt) => (
                          <ToggleChip
                            key={mt.id}
                            label={mt.name}
                            active={meetTypeFilter.includes(mt.id)}
                            color="bg-violet-100 text-violet-700 border-violet-200"
                            onClick={() => {
                              setMeetTypeFilter(
                                meetTypeFilter.includes(mt.id)
                                  ? meetTypeFilter.filter((id) => id !== mt.id)
                                  : [...meetTypeFilter, mt.id]
                              );
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Custom Date Range */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      טווח תאריכים מותאם
                    </label>
                    <div className="flex gap-2">
                      <DatePickerField
                        label="מתאריך"
                        value={meetDateFrom}
                        onChange={(v) => { setMeetDateFrom(v); goCustom(); }}
                      />
                      <DatePickerField
                        label="עד תאריך"
                        value={meetDateTo}
                        onChange={(v) => { setMeetDateTo(v); goCustom(); }}
                      />
                    </div>
                  </div>

                  {/* Sort */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      מיון לפי
                    </label>
                    <SegmentedControl
                      options={[
                        { value: "startTime", label: "זמן פגישה" },
                        { value: "createdAt", label: "תאריך יצירה" },
                      ]}
                      value={meetSortBy}
                      onChange={(v: string) => setMeetSortBy(v)}
                    />
                  </div>

                  {/* Max Meetings */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      מקסימום פגישות
                    </label>
                    <SegmentedControl
                      options={[
                        { value: 5, label: "5" },
                        { value: 10, label: "10" },
                        { value: 15, label: "15" },
                        { value: 25, label: "25" },
                      ]}
                      value={meetMaxMeetings}
                      onChange={(v: number) => setMeetMaxMeetings(v)}
                    />
                  </div>
                </>
              )}

              {/* ── Quotes Advanced ───────────────────── */}
              {widgetType === "MINI_QUOTES" && (
                <>
                  {/* Status Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      סינון סטטוס
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      <ToggleChip
                        label="הכל"
                        active={quoteStatusFilter.length === 0}
                        color="bg-gray-100 text-gray-700 border-gray-300"
                        onClick={() => { setQuoteStatusFilter([]); goCustom(); }}
                      />
                      {[
                        { id: "DRAFT", label: "טיוטה", color: "bg-slate-100 text-slate-700 border-slate-200" },
                        { id: "SENT", label: "נשלחה", color: "bg-blue-100 text-blue-700 border-blue-200" },
                        { id: "ACCEPTED", label: "אושרה", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
                        { id: "REJECTED", label: "נדחתה", color: "bg-red-100 text-red-700 border-red-200" },
                      ].map((s) => (
                        <ToggleChip
                          key={s.id}
                          label={s.label}
                          active={quoteStatusFilter.includes(s.id)}
                          color={s.color}
                          onClick={() => {
                            setQuoteStatusFilter(toggleArrayItem(quoteStatusFilter, s.id));
                            goCustom();
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Date Range */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      טווח תאריכים
                    </label>
                    <SegmentedControl
                      options={[
                        { value: "all", label: "הכל" },
                        { value: "this_week", label: "השבוע" },
                        { value: "this_month", label: "החודש" },
                        { value: "30d", label: "30 יום" },
                        { value: "quarter", label: "הרבעון" },
                        { value: "custom", label: "מותאם" },
                      ]}
                      value={quoteDatePreset}
                      onChange={(v: string) => { setQuoteDatePreset(v); goCustom(); }}
                    />
                    {quoteDatePreset === "custom" && (
                      <div className="flex gap-2 mt-2">
                        <DatePickerField
                          label="מתאריך"
                          value={quoteDateFrom}
                          onChange={(v) => { setQuoteDateFrom(v); goCustom(); }}
                        />
                        <DatePickerField
                          label="עד תאריך"
                          value={quoteDateTo}
                          onChange={(v) => { setQuoteDateTo(v); goCustom(); }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Currency Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      מטבע
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      <ToggleChip
                        label="הכל"
                        active={quoteCurrencyFilter.length === 0}
                        color="bg-gray-100 text-gray-700 border-gray-300"
                        onClick={() => { setQuoteCurrencyFilter([]); goCustom(); }}
                      />
                      {[
                        { id: "ILS", label: "₪ ILS", color: "bg-blue-100 text-blue-700 border-blue-200" },
                        { id: "USD", label: "$ USD", color: "bg-green-100 text-green-700 border-green-200" },
                        { id: "EUR", label: "€ EUR", color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
                        { id: "GBP", label: "£ GBP", color: "bg-purple-100 text-purple-700 border-purple-200" },
                      ].map((c) => (
                        <ToggleChip
                          key={c.id}
                          label={c.label}
                          active={quoteCurrencyFilter.includes(c.id)}
                          color={c.color}
                          onClick={() => {
                            setQuoteCurrencyFilter(toggleArrayItem(quoteCurrencyFilter, c.id));
                            goCustom();
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Sort */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      מיון לפי
                    </label>
                    <SegmentedControl
                      options={[
                        { value: "createdAt", label: "תאריך" },
                        { value: "total", label: "סכום" },
                        { value: "quoteNumber", label: "מספר הצעה" },
                      ]}
                      value={quoteSortBy}
                      onChange={(v: string) => { setQuoteSortBy(v); goCustom(); }}
                    />
                  </div>

                  {/* Max Quotes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      מקסימום הצעות
                    </label>
                    <SegmentedControl
                      options={[
                        { value: 5, label: "5" },
                        { value: 10, label: "10" },
                        { value: 15, label: "15" },
                        { value: 25, label: "25" },
                      ]}
                      value={quoteMaxQuotes}
                      onChange={(v: number) => { setQuoteMaxQuotes(v); goCustom(); }}
                    />
                  </div>
                </>
              )}
            </div>
        </div>

        {/* Footer */}
        <div className="p-5 pt-3 border-t border-gray-100 flex gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 font-medium transition text-sm"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={() => onConfirm(buildSettings())}
            className={`flex-1 py-2.5 text-white rounded-xl font-medium transition text-sm shadow-md ${theme.btn} ${theme.btnHover}`}
          >
            {isEdit ? "שמור שינויים" : "הוסף ווידג׳ט"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}