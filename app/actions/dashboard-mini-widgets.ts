"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { checkActionRateLimit, DASHBOARD_RATE_LIMITS } from "@/lib/rate-limit-action";
import { getGoogleCalendarEvents } from "@/app/actions/google-calendar";
import {
  getValidAccessToken,
  fetchGoogleMeetEvents,
  TokenRevokedError,
} from "@/lib/services/google-calendar";
import { createLogger } from "@/lib/logger";

const log = createLogger("MiniGoogleMeet");

// ── Helpers ─────────────────────────────────────────────────────────

function parseDate(val: unknown): Date | null {
  if (typeof val !== "string" || !val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = d.getDate() - day;
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), diff));
}

function endOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() + (6 - day);
  return endOfDay(new Date(d.getFullYear(), d.getMonth(), diff));
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ── Mini Calendar ───────────────────────────────────────────────────

export interface CalendarFilters {
  preset?: string;
  customFrom?: string;
  customTo?: string;
  maxEvents?: number;
  calendarSource?: "crm" | "google" | "all";
}

export async function getMiniCalendarData(filters?: CalendarFilters) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (!hasUserFlag(user, "canViewCalendar"))
    return { success: false, error: "Forbidden" };

  const rl = await checkActionRateLimit(String(user.id), DASHBOARD_RATE_LIMITS.read);
  if (rl) return { success: false, error: rl.error };

  const now = new Date();
  let rangeStart: Date = now;
  let rangeEnd: Date = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const preset = filters?.preset || "14d";
  const validPresets = ["today", "this_week", "7d", "14d", "this_month", "custom"];
  const safePreset = validPresets.includes(preset) ? preset : "14d";

  switch (safePreset) {
    case "today":
      rangeStart = startOfDay(now);
      rangeEnd = endOfDay(now);
      break;
    case "this_week":
      rangeStart = startOfWeek(now);
      rangeEnd = endOfWeek(now);
      break;
    case "7d":
      rangeEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    case "14d":
      rangeEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      break;
    case "this_month":
      rangeStart = startOfMonth(now);
      rangeEnd = endOfMonth(now);
      break;
    case "custom": {
      const from = parseDate(filters?.customFrom);
      const to = parseDate(filters?.customTo);
      if (from) rangeStart = startOfDay(from);
      if (to) rangeEnd = endOfDay(to);
      break;
    }
  }

  const maxEvents = clamp(filters?.maxEvents ?? 15, 1, 50);
  const validSources = ["crm", "google", "all"];
  const source = validSources.includes(filters?.calendarSource || "") ? filters!.calendarSource! : "crm";

  const fetchCrm = async () => {
    const rows = await prisma.calendarEvent.findMany({
      where: {
        companyId: user.companyId,
        endTime: { gte: rangeStart },
        startTime: { lte: rangeEnd },
      },
      orderBy: { startTime: "asc" },
      take: maxEvents,
      select: { id: true, title: true, description: true, startTime: true, endTime: true, color: true },
    });
    return rows.map((e) => ({
      id: String(e.id),
      title: e.title,
      description: e.description,
      startTime: e.startTime instanceof Date ? e.startTime.toISOString() : String(e.startTime),
      endTime: e.endTime instanceof Date ? e.endTime.toISOString() : String(e.endTime),
      color: e.color,
      source: "crm" as const,
    }));
  };

  const fetchGoogle = async () => {
    const res = await getGoogleCalendarEvents(rangeStart.toISOString(), rangeEnd.toISOString());
    if (!res.success || !res.data) return { events: [] as any[], connected: res.connected ?? false };
    const events = res.data.map((e) => ({
      id: String(e.id),
      title: e.title,
      description: e.description ?? null,
      startTime: e.startTime instanceof Date ? e.startTime.toISOString() : String(e.startTime),
      endTime: e.endTime instanceof Date ? e.endTime.toISOString() : String(e.endTime),
      color: e.color ?? "#1a73e8",
      source: "google" as const,
    }));
    return { events, connected: res.connected ?? true };
  };

  if (source === "crm") {
    const events = await fetchCrm();
    return { success: true, data: events };
  }

  if (source === "google") {
    const { events, connected } = await fetchGoogle();
    return { success: true, data: events.slice(0, maxEvents), googleConnected: connected };
  }

  // "all" — fetch both in parallel
  const [crmEvents, googleResult] = await Promise.all([fetchCrm(), fetchGoogle()]);
  const merged = [...crmEvents, ...googleResult.events]
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, maxEvents);
  return { success: true, data: merged, googleConnected: googleResult.connected };
}

// ── Mini Tasks ──────────────────────────────────────────────────────

export interface TasksFilters {
  preset?: string;
  statusFilter?: string[];
  priorityFilter?: string[];
  assigneeFilter?: string;
  specificUserId?: number;
  dueDatePreset?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  sortBy?: string;
  maxTasks?: number;
  showCompleted?: boolean;
}

const VALID_TASK_STATUSES = ["todo", "in_progress", "waiting_client", "on_hold", "completed_month", "done"];
const VALID_PRIORITIES = ["high", "medium", "low"];
const VALID_TASK_SORTS = ["priority", "dueDate", "createdAt"];

export async function getMiniTasksData(filters?: TasksFilters) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (!hasUserFlag(user, "canViewTasks"))
    return { success: false, error: "Forbidden" };

  const rl = await checkActionRateLimit(String(user.id), DASHBOARD_RATE_LIMITS.read);
  if (rl) return { success: false, error: rl.error };

  const canViewAll = hasUserFlag(user, "canViewAllTasks");
  const now = new Date();

  // Assignee filter
  let assigneeWhere: any;
  if (filters?.assigneeFilter === "specific" && canViewAll && typeof filters?.specificUserId === "number") {
    assigneeWhere = { assigneeId: filters.specificUserId };
  } else if (filters?.assigneeFilter === "all" && canViewAll) {
    assigneeWhere = {};
  } else {
    assigneeWhere = { assigneeId: user.id };
  }

  // Status filter
  let statusIn: string[] | undefined;
  if (filters?.statusFilter && Array.isArray(filters.statusFilter) && filters.statusFilter.length > 0) {
    statusIn = filters.statusFilter.filter((s) => VALID_TASK_STATUSES.includes(s));
    if (statusIn.length === 0) statusIn = undefined;
  }

  // Apply preset logic
  const preset = filters?.preset || "my_active";
  const validPresets = ["my_active", "overdue", "all_active", "due_this_week", "custom"];
  const safePreset = validPresets.includes(preset) ? preset : "my_active";

  let dueDateWhere: any = {};

  if (safePreset !== "custom") {
    // Presets auto-configure filters
    switch (safePreset) {
      case "my_active":
        if (!statusIn) statusIn = VALID_TASK_STATUSES;
        break;
      case "overdue":
        if (!statusIn) statusIn = VALID_TASK_STATUSES;
        dueDateWhere = { dueDate: { lt: startOfDay(now) } };
        break;
      case "all_active":
        if (!statusIn) statusIn = VALID_TASK_STATUSES;
        break;
      case "due_this_week":
        if (!statusIn) statusIn = VALID_TASK_STATUSES;
        dueDateWhere = { dueDate: { gte: startOfDay(now), lte: endOfWeek(now) } };
        break;
    }
  } else {
    // Custom mode — apply due date preset
    const dueDatePreset = filters?.dueDatePreset || "all";
    switch (dueDatePreset) {
      case "overdue":
        dueDateWhere = { dueDate: { lt: startOfDay(now) } };
        break;
      case "today":
        dueDateWhere = { dueDate: { gte: startOfDay(now), lte: endOfDay(now) } };
        break;
      case "this_week":
        dueDateWhere = { dueDate: { gte: startOfDay(now), lte: endOfWeek(now) } };
        break;
      case "this_month":
        dueDateWhere = { dueDate: { gte: startOfDay(now), lte: endOfMonth(now) } };
        break;
      case "custom": {
        const from = parseDate(filters?.dueDateFrom);
        const to = parseDate(filters?.dueDateTo);
        if (from || to) {
          dueDateWhere = {
            dueDate: {
              ...(from ? { gte: startOfDay(from) } : {}),
              ...(to ? { lte: endOfDay(to) } : {}),
            },
          };
        }
        break;
      }
      // "all" — no filter
    }
    if (!statusIn) {
      statusIn = VALID_TASK_STATUSES;
    }
  }

  // Priority filter
  let priorityWhere: any = {};
  if (filters?.priorityFilter && Array.isArray(filters.priorityFilter) && filters.priorityFilter.length > 0) {
    const validP = filters.priorityFilter.filter((p) => VALID_PRIORITIES.includes(p));
    if (validP.length > 0) {
      priorityWhere = { priority: { in: validP } };
    }
  }

  const listStatusIn = statusIn;

  // Sort
  const sortBy = VALID_TASK_SORTS.includes(filters?.sortBy || "") ? filters!.sortBy! : "priority";
  const orderBy: any =
    sortBy === "priority"
      ? [{ priority: "desc" }, { dueDate: "asc" }]
      : sortBy === "dueDate"
        ? [{ dueDate: "asc" }, { priority: "desc" }]
        : [{ createdAt: "desc" }];

  const maxTasks = clamp(filters?.maxTasks ?? 20, 1, 50);

  const baseWhere = {
    companyId: user.companyId,
    ...assigneeWhere,
  };

  const listWhere = {
    ...baseWhere,
    ...(listStatusIn ? { status: { in: listStatusIn } } : {}),
    ...priorityWhere,
    ...dueDateWhere,
  };

  const [tasks, statusCounts] = await Promise.all([
    prisma.task.findMany({
      where: listWhere,
      orderBy,
      take: maxTasks,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        tags: true,
        assignee: { select: { name: true } },
      },
    }),
    prisma.task.groupBy({
      by: ["status"],
      where: listWhere,
      _count: { status: true },
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const g of statusCounts) {
    counts[g.status] = g._count.status;
  }

  return { success: true, data: { tasks, counts } };
}

// ── Mini Meetings ───────────────────────────────────────────────────

export interface MeetingsFilters {
  preset?: string;
  statusFilter?: string[];
  meetingTypeFilter?: number[];
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  maxMeetings?: number;
  meetingSource?: "crm" | "google_meet" | "all";
}

const VALID_MEETING_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];
const VALID_MEETING_SORTS = ["startTime", "createdAt"];

export async function getMiniMeetingsData(filters?: MeetingsFilters) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (!hasUserFlag(user, "canViewMeetings"))
    return { success: false, error: "Forbidden" };

  const rl = await checkActionRateLimit(String(user.id), DASHBOARD_RATE_LIMITS.read);
  if (rl) return { success: false, error: rl.error };

  const now = new Date();
  let rangeStart: Date = startOfDay(now);
  let rangeEnd: Date = endOfDay(now);

  const preset = filters?.preset || "today";
  const validPresets = ["today", "this_week", "7d", "14d", "this_month", "custom"];
  const safePreset = validPresets.includes(preset) ? preset : "today";

  switch (safePreset) {
    case "today":
      rangeStart = startOfDay(now);
      rangeEnd = endOfDay(now);
      break;
    case "this_week":
      rangeStart = startOfWeek(now);
      rangeEnd = endOfWeek(now);
      break;
    case "7d":
      rangeStart = startOfDay(now);
      rangeEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    case "14d":
      rangeStart = startOfDay(now);
      rangeEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      break;
    case "this_month":
      rangeStart = startOfMonth(now);
      rangeEnd = endOfMonth(now);
      break;
    case "custom": {
      const from = parseDate(filters?.dateFrom);
      const to = parseDate(filters?.dateTo);
      if (from) rangeStart = startOfDay(from);
      if (to) rangeEnd = endOfDay(to);
      break;
    }
  }

  // Status filter
  let statusWhere: any = {};
  if (filters?.statusFilter && Array.isArray(filters.statusFilter) && filters.statusFilter.length > 0) {
    const valid = filters.statusFilter.filter((s) => VALID_MEETING_STATUSES.includes(s));
    if (valid.length > 0) statusWhere = { status: { in: valid } };
  }

  // Meeting type filter
  let typeWhere: any = {};
  if (filters?.meetingTypeFilter && Array.isArray(filters.meetingTypeFilter) && filters.meetingTypeFilter.length > 0) {
    typeWhere = { meetingTypeId: { in: filters.meetingTypeFilter } };
  }

  // Sort
  const sortBy = VALID_MEETING_SORTS.includes(filters?.sortBy || "") ? filters!.sortBy! : "startTime";
  const orderBy: any = sortBy === "createdAt" ? { createdAt: "desc" } : { startTime: "asc" };

  const maxMeetings = clamp(filters?.maxMeetings ?? 15, 1, 50);
  const source = filters?.meetingSource || "crm";

  const filterWhere = {
    companyId: user.companyId,
    startTime: { lte: rangeEnd },
    endTime: { gte: rangeStart },
    ...statusWhere,
    ...typeWhere,
  };

  // ── CRM meetings fetcher ──
  async function fetchCrm() {
    const [meetings, statusCounts] = await Promise.all([
      prisma.meeting.findMany({
        where: filterWhere,
        orderBy,
        take: maxMeetings,
        select: {
          id: true,
          participantName: true,
          participantEmail: true,
          startTime: true,
          endTime: true,
          status: true,
          tags: true,
          meetingType: { select: { name: true, color: true } },
          client: { select: { name: true } },
        },
      }),
      prisma.meeting.groupBy({
        by: ["status"],
        where: filterWhere,
        _count: { status: true },
      }),
    ]);

    const counts: Record<string, number> = {};
    for (const g of statusCounts) {
      counts[g.status] = g._count.status;
    }

    const items = meetings.map((m) => ({
      ...m,
      id: String(m.id),
      source: "crm" as const,
      meetLink: undefined as string | undefined,
      attendeesCount: undefined as number | undefined,
    }));

    return { items, counts };
  }

  // ── Google Meet fetcher ──
  async function fetchGoogleMeet(): Promise<{
    items: Array<{
      id: string;
      participantName: string;
      participantEmail: string | null;
      startTime: Date;
      endTime: Date;
      status: string;
      tags: string[];
      meetingType: { name: string; color: string | null };
      client: null;
      source: "google_meet";
      meetLink?: string;
      attendeesCount?: number;
    }>;
    connected: boolean;
  }> {
    const connection = await prisma.googleCalendarConnection.findUnique({
      where: {
        companyId_userId: {
          companyId: user.companyId,
          userId: user.id,
        },
      },
    });

    if (!connection || !connection.isActive) {
      return { items: [], connected: false };
    }

    try {
      const accessToken = await getValidAccessToken(connection);
      const result = await fetchGoogleMeetEvents(
        accessToken,
        rangeStart.toISOString(),
        rangeEnd.toISOString(),
      );

      const items = result.events.map((ge) => {
        let startTime: Date;
        let endTime: Date;

        if (ge.start.dateTime) {
          startTime = new Date(ge.start.dateTime);
        } else if (ge.start.date) {
          startTime = new Date(ge.start.date + "T00:00:00");
        } else {
          startTime = new Date();
        }

        if (ge.end.dateTime) {
          endTime = new Date(ge.end.dateTime);
        } else if (ge.end.date) {
          endTime = new Date(ge.end.date + "T00:00:00");
        } else {
          endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
        }

        const meetLink =
          ge.hangoutLink ||
          ge.conferenceData?.entryPoints?.find(
            (ep) => ep.entryPointType === "video",
          )?.uri;

        return {
          id: `gmeet:${ge.id}`,
          participantName: ge.summary || "(ללא כותרת)",
          participantEmail: null,
          startTime,
          endTime,
          status: "CONFIRMED",
          tags: [] as string[],
          meetingType: { name: "Google Meet", color: "#1a73e8" as string | null },
          client: null,
          source: "google_meet" as const,
          meetLink,
          attendeesCount: ge.attendees?.length,
        };
      });

      return { items, connected: true };
    } catch (error) {
      if (error instanceof TokenRevokedError) {
        log.warn("Google Calendar token revoked for mini meetings widget", { userId: user.id });
        return { items: [], connected: false };
      }
      log.error("Failed to fetch Google Meet events for mini widget", {
        error: String(error),
        userId: user.id,
      });
      return { items: [], connected: true };
    }
  }

  // ── Source routing ──
  if (source === "crm") {
    const { items, counts } = await fetchCrm();
    return { success: true, data: { meetings: items, counts } };
  }

  if (source === "google_meet") {
    const { items, connected } = await fetchGoogleMeet();
    return {
      success: true,
      data: { meetings: items.slice(0, maxMeetings), counts: {} },
      googleConnected: connected,
    };
  }

  // "all" — fetch both in parallel
  const [crmResult, googleResult] = await Promise.all([fetchCrm(), fetchGoogleMeet()]);
  const merged = [...crmResult.items, ...googleResult.items]
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, maxMeetings);

  return {
    success: true,
    data: { meetings: merged, counts: crmResult.counts },
    googleConnected: googleResult.connected,
  };
}

// ── Mini Quotes ─────────────────────────────────────────────────────

export interface QuotesFilters {
  preset?: string;
  statusFilter?: string[];
  datePreset?: string;
  dateFrom?: string;
  dateTo?: string;
  currencyFilter?: string[];
  sortBy?: string;
  maxQuotes?: number;
}

const VALID_QUOTE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED"];
const VALID_CURRENCIES = ["ILS", "USD", "EUR", "GBP"];
const VALID_QUOTE_SORTS = ["createdAt", "total", "quoteNumber"];

export async function getMiniQuotesData(filters?: QuotesFilters) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (!hasUserFlag(user, "canViewQuotes"))
    return { success: false, error: "Forbidden" };

  const rl = await checkActionRateLimit(String(user.id), DASHBOARD_RATE_LIMITS.read);
  if (rl) return { success: false, error: rl.error };

  const now = new Date();
  let dateWhere: any = {};
  let statusWhere: any = {};
  let currencyWhere: any = {};

  // Status filter
  if (filters?.statusFilter && Array.isArray(filters.statusFilter) && filters.statusFilter.length > 0) {
    const valid = filters.statusFilter.filter((s) => VALID_QUOTE_STATUSES.includes(s));
    if (valid.length > 0) statusWhere = { status: { in: valid } };
  }

  // Currency filter
  if (filters?.currencyFilter && Array.isArray(filters.currencyFilter) && filters.currencyFilter.length > 0) {
    const valid = filters.currencyFilter.filter((c) => VALID_CURRENCIES.includes(c));
    if (valid.length > 0) currencyWhere = { currency: { in: valid } };
  }

  // Preset logic
  const preset = filters?.preset || "recent";
  const validPresets = ["recent", "this_month", "pending", "closed", "custom"];
  const safePreset = validPresets.includes(preset) ? preset : "recent";

  switch (safePreset) {
    case "recent":
      // Last 30 days by default
      dateWhere = { createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } };
      break;
    case "this_month":
      dateWhere = { createdAt: { gte: startOfMonth(now), lte: endOfMonth(now) } };
      break;
    case "pending":
      statusWhere = { status: { in: ["DRAFT", "SENT"] } };
      break;
    case "closed":
      statusWhere = { status: { in: ["ACCEPTED", "REJECTED"] } };
      break;
    case "custom": {
      // Date range
      const datePreset = filters?.datePreset || "all";
      switch (datePreset) {
        case "this_week":
          dateWhere = { createdAt: { gte: startOfWeek(now), lte: endOfWeek(now) } };
          break;
        case "this_month":
          dateWhere = { createdAt: { gte: startOfMonth(now), lte: endOfMonth(now) } };
          break;
        case "30d":
          dateWhere = { createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } };
          break;
        case "quarter": {
          const qMonth = Math.floor(now.getMonth() / 3) * 3;
          dateWhere = {
            createdAt: {
              gte: new Date(now.getFullYear(), qMonth, 1),
              lte: endOfMonth(new Date(now.getFullYear(), qMonth + 2, 1)),
            },
          };
          break;
        }
        case "custom": {
          const from = parseDate(filters?.dateFrom);
          const to = parseDate(filters?.dateTo);
          if (from || to) {
            dateWhere = {
              createdAt: {
                ...(from ? { gte: startOfDay(from) } : {}),
                ...(to ? { lte: endOfDay(to) } : {}),
              },
            };
          }
          break;
        }
        // "all" — no date filter
      }
      break;
    }
  }

  // Sort
  const sortBy = VALID_QUOTE_SORTS.includes(filters?.sortBy || "") ? filters!.sortBy! : "createdAt";
  const orderBy: any =
    sortBy === "total"
      ? { total: "desc" }
      : sortBy === "quoteNumber"
        ? { quoteNumber: "desc" }
        : { createdAt: "desc" };

  const maxQuotes = clamp(filters?.maxQuotes ?? 15, 1, 25);

  const filterWhere = {
    companyId: user.companyId,
    isTrashed: false,
    ...statusWhere,
    ...dateWhere,
    ...currencyWhere,
  };

  const [quotes, statusSummary] = await Promise.all([
    prisma.quote.findMany({
      where: filterWhere,
      orderBy,
      take: maxQuotes,
      select: {
        id: true,
        quoteNumber: true,
        clientName: true,
        title: true,
        total: true,
        status: true,
        currency: true,
        createdAt: true,
        validUntil: true,
        items: {
          select: {
            description: true,
            product: { select: { name: true } },
          },
          take: 3,
        },
      },
    }),
    prisma.quote.groupBy({
      by: ["status"],
      where: filterWhere,
      _count: { status: true },
      _sum: { total: true },
    }),
  ]);

  // Convert Decimal to Number and dates for serialization
  const serializedQuotes = quotes.map((q) => ({
    ...q,
    total: Number(q.total),
    items: q.items.map((item) => ({
      description: item.description,
      product: item.product ? { name: item.product.name } : null,
    })),
  }));

  const summary: Record<string, { count: number; total: number }> = {};
  for (const g of statusSummary) {
    summary[g.status] = {
      count: g._count.status,
      total: Number(g._sum.total ?? 0),
    };
  }

  return { success: true, data: { quotes: serializedQuotes, summary } };
}

