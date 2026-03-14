"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { normalizeToE164 } from "@/lib/utils/phone";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/permissions-server";
import { validateStringLength, validateJsonValue, MAX_LENGTHS } from "@/lib/server-action-utils";
import { logSecurityEvent, SEC_NURTURE_CAMPAIGN_SENT, SEC_NURTURE_BULK_IMPORT, SEC_NURTURE_CONFIG_CHANGED, SEC_NURTURE_BULK_DELETE } from "@/lib/security/audit-security";

const VALID_NURTURE_SLUGS = new Set(["birthday", "renewal", "winback", "review", "referral", "upsell"]);

function validateNurtureSlug(slug: string): boolean {
  return VALID_NURTURE_SLUGS.has(slug);
}

function handleNurtureError(error: unknown, context: string): { success: false; error: string } {
  console.error(`[NurtureHub] ${context}:`, error);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return { success: false, error: "פריט עם פרטים אלו כבר קיים במערכת" };
    if (error.code === "P2025") return { success: false, error: "הפריט המבוקש לא נמצא" };
  }
  return { success: false, error: "אירעה שגיאה. אנא נסו שוב מאוחר יותר" };
}

export type DataSource = {
  id: string; // "clients" | "users" | tableId
  name: string;
  type: "system" | "table";
};

export type DataRecord = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  source: string;
};

export async function getDataSources(): Promise<DataSource[]> {
  const sources: DataSource[] = [
    { id: "clients", name: "לקוחות (Clients)", type: "system" },
    { id: "users", name: "משתמשי מערכת (Users)", type: "system" },
  ];

  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return sources; // Return only system sources if not authenticated
    }
    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.nurtureRead);
    if (limited) return [];

    // CRITICAL: Filter tables by companyId for multi-tenancy
    const tables = await prisma.tableMeta.findMany({
      where: { companyId: currentUser.companyId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    tables.forEach((table) => {
      sources.push({
        id: table.id.toString(),
        name: table.name,
        type: "table",
      });
    });
  } catch (error) {
    console.error("Failed to fetch dynamic tables:", error);
  }

  return sources;
}

export async function getDataSourceRecords(
  sourceId: string,
  query: string = "",
  skip: number = 0,
  take: number = 20
): Promise<{ records: DataRecord[]; hasMore: boolean }> {
  let records: DataRecord[] = [];

  // Get current user for multi-tenancy filtering
  const { getCurrentUser } = await import("@/lib/permissions-server");
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return { records, hasMore: false };
  }
  const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.nurtureRead);
  if (limited) return { records: [], hasMore: false };

  if (sourceId === "clients") {
    try {
      // CRITICAL: Filter clients by companyId for multi-tenancy
      const clients = await prisma.client.findMany({
        where: {
          companyId: currentUser.companyId,
          ...(query
            ? {
                OR: [
                  { name: { contains: query, mode: "insensitive" } },
                  { email: { contains: query, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        select: { id: true, name: true, email: true, phone: true },
        skip,
        take,
      });

      records = clients.map((c) => ({
        id: c.id.toString(),
        name: c.name,
        email: c.email || "",
        phone: c.phone || "",
        source: "Clients",
      }));
    } catch (e) {
      console.error("Error fetching clients", e);
    }
  } else if (sourceId === "users") {
    try {
      // CRITICAL: Filter users by companyId for multi-tenancy
      const users = await prisma.user.findMany({
        where: {
          companyId: currentUser.companyId,
          ...(query
            ? {
                OR: [
                  { name: { contains: query, mode: "insensitive" } },
                  { email: { contains: query, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        select: { id: true, name: true, email: true },
        skip,
        take,
      });
      records = users.map((u) => ({
        id: u.id.toString(),
        name: u.name,
        email: u.email,
        source: "Users",
      }));
    } catch (e) {
      console.error("Error fetching users", e);
    }
  } else {
    // Dynamic Table
    const tableId = parseInt(sourceId);
    if (!isNaN(tableId)) {
      try {
        // CRITICAL: Filter records by companyId for multi-tenancy
        const dbRecords = await prisma.record.findMany({
          where: {
            tableId,
            companyId: currentUser.companyId,
          },
          skip,
          take,
        });

        // Simple heuristic mapping
        // We filter in-memory because querying JSONB loosely is complex without knowing schema
        records = dbRecords
          .map((r) => {
            const data = r.data as any;

            const name =
              data.name ||
              data.Name ||
              data.title ||
              data.Title ||
              data["שם"] ||
              data["שם מלא"] ||
              `Record #${r.id}`;
            const email =
              data.email || data.Email || data["מייל"] || data["אימייל"] || "";
            const phone =
              data.phone || data.Phone || data["טלפון"] || data["נייד"] || "";

            return {
              id: r.id.toString(),
              name: typeof name === "string" ? name : JSON.stringify(name),
              email: typeof email === "string" ? email : "",
              phone: typeof phone === "string" ? phone : "",
              source: sourceId,
            };
          })
          .filter((r) => {
            if (!query) return true;
            const q = query.toLowerCase();
            return (
              r.name.toLowerCase().includes(q) ||
              r.email.toLowerCase().includes(q)
            );
          });
      } catch (e) {
        console.error("Error fetching table records", e);
      }
    }
  }

  return { records, hasMore: records.length === take };
}

// Lightweight query: returns only IDs (no payload) for "select all in table"
export async function getAllRecordIds(sourceId: string): Promise<string[]> {
  const { getCurrentUser } = await import("@/lib/permissions-server");
  const currentUser = await getCurrentUser();
  if (!currentUser) return [];
  const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.nurtureRead);
  if (limited) return [];

  if (sourceId === "clients") {
    const rows = await prisma.client.findMany({
      where: { companyId: currentUser.companyId },
      select: { id: true },
      take: 10000,
    });
    return rows.map((r) => r.id.toString());
  } else if (sourceId === "users") {
    const rows = await prisma.user.findMany({
      where: { companyId: currentUser.companyId },
      select: { id: true },
      take: 10000,
    });
    return rows.map((r) => r.id.toString());
  } else {
    const tableId = parseInt(sourceId);
    if (isNaN(tableId)) return [];
    const rows = await prisma.record.findMany({
      where: { tableId, companyId: currentUser.companyId },
      select: { id: true },
      take: 10000,
    });
    return rows.map((r) => r.id.toString());
  }
}

// Fetch full records by specific IDs (for importing unloaded "select all" records)
export async function getRecordsByIds(
  sourceId: string,
  ids: string[]
): Promise<any[]> {
  const { getCurrentUser } = await import("@/lib/permissions-server");
  const currentUser = await getCurrentUser();
  if (!currentUser || ids.length === 0) return [];
  const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.nurtureRead);
  if (limited) return [];

  if (sourceId === "clients") {
    const clients = await prisma.client.findMany({
      where: { id: { in: ids.map(Number) }, companyId: currentUser.companyId },
      select: { id: true, name: true, email: true, phone: true },
    });
    return clients.map((c) => ({
      id: c.id.toString(),
      name: c.name,
      email: c.email || "",
      phone: c.phone || "",
      source: "Clients",
    }));
  } else if (sourceId === "users") {
    const users = await prisma.user.findMany({
      where: { id: { in: ids.map(Number) }, companyId: currentUser.companyId },
      select: { id: true, name: true, email: true },
    });
    return users.map((u) => ({
      id: u.id.toString(),
      name: u.name,
      email: u.email,
      source: "Users",
    }));
  } else {
    const tableId = parseInt(sourceId);
    if (isNaN(tableId)) return [];
    const records = await prisma.record.findMany({
      where: { id: { in: ids.map(Number) }, tableId, companyId: currentUser.companyId },
    });
    return records.map((r) => {
      const safeData = validateJsonValue(r.data, 3, 51200, "record data") as Record<string, unknown> ?? {};
      return {
        id: r.id.toString(),
        ...(typeof safeData === "object" && safeData !== null ? safeData : {}),
        _rawData: r.data,
      };
    });
  }
}

export type FieldDefinition = {
  key: string;
  name: string;
  type: string;
  options?: string[]; // For select/status fields
};

export async function getTableFields(
  tableId: string
): Promise<FieldDefinition[]> {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser) return [];
    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.nurtureRead);
    if (limited) return [];

    const id = parseInt(tableId);
    if (isNaN(id)) return [];

    const table = await prisma.tableMeta.findFirst({
      where: { id, companyId: currentUser.companyId },
      select: { schemaJson: true },
    });

    if (!table || !table.schemaJson) return [];

    // Assuming schemaJson is an array of columns or an object with 'columns'
    // This depends on the actual JSON structure used in the app.
    // I will try to support a generic shape [ { id/key, name, type, options } ]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = table.schemaJson as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const columns = Array.isArray(schema) ? schema : schema.columns || [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return columns.map((col: any) => ({
      key: col.id || col.key || col.name,
      name: col.name || col.title || col.label,
      type: col.type || "text",
      options: col.options || [], // For singleSelect / status
    }));
  } catch (error) {
    console.error("Error fetching table fields:", error);
    return [];
  }
}

// Get raw records from a dynamic table (for custom field mapping in import)
export async function getRawTableRecords(
  tableId: string,
  skip: number = 0,
  take: number = 20
): Promise<{ records: any[]; hasMore: boolean }> {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return { records: [], hasMore: false };
    }
    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.nurtureRead);
    if (limited) return { records: [], hasMore: false };

    const id = parseInt(tableId);
    if (isNaN(id)) return { records: [], hasMore: false };

    // CRITICAL: Filter records by companyId for multi-tenancy
    const dbRecords = await prisma.record.findMany({
      where: {
        tableId: id,
        companyId: currentUser.companyId,
      },
      skip,
      take,
    });

    // Return records with flattened data for easy access
    const records = dbRecords.map((r) => {
      const safeData = validateJsonValue(r.data, 3, 51200, "record data") as Record<string, unknown> ?? {};
      return {
        id: r.id.toString(),
        ...(typeof safeData === "object" && safeData !== null ? safeData : {}),
        _rawData: r.data,
      };
    });

    return { records, hasMore: records.length === take };
  } catch (error) {
    console.error("Error fetching raw table records:", error);
    return { records: [], hasMore: false };
  }
}

export type NurtureSubscriberFilter = {
  field: string;      // 'name' | 'email' | 'phone' | 'sourceType' | 'triggerDate' | 'phoneActive'
  operator: string;   // 'contains' | 'equals' | 'before' | 'after' | 'is'
  value: string;
};

export type NurtureSubscriberResult = {
  id: string;
  name: string;
  email: string;
  phone: string;
  emailActive: boolean;
  phoneActive: boolean;
  triggerDate: string | null;
  source: string;
  sourceTableId?: number;
  sourceTableName?: string | null;
  createdAt: Date;
};

export async function getNurtureSubscribers(
  slug: string,
  options?: {
    skip?: number;
    take?: number;
    search?: string;
    filters?: NurtureSubscriberFilter[];
    cursor?: string; // subscriber ID for cursor-based pagination
  }
): Promise<{ subscribers: NurtureSubscriberResult[]; total: number; hasMore: boolean }> {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser) return { subscribers: [], total: 0, hasMore: false };
    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.nurtureRead);
    if (limited) return { subscribers: [], total: 0, hasMore: false };
    if (!validateNurtureSlug(slug)) return { subscribers: [], total: 0, hasMore: false };

    const list = await prisma.nurtureList.findFirst({
      where: { slug, companyId: currentUser.companyId },
      select: { id: true },
    });
    if (!list) return { subscribers: [], total: 0, hasMore: false };

    const skip = Math.max(0, options?.skip ?? 0);
    const take = Math.min(100, Math.max(1, options?.take ?? 20));

    // Build where clause
    const where: any = { nurtureListId: list.id };
    const andConditions: any[] = [];

    // General search: OR across name/email/phone
    if (options?.search?.trim()) {
      const q = options.search.trim();
      andConditions.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    // Smart filters
    const VALID_FILTER_FIELDS = new Set(["name", "email", "phone", "sourceType", "triggerDate", "phoneActive"]);
    const VALID_FILTER_OPERATORS = new Set(["contains", "equals", "before", "after", "is"]);
    if (options?.filters?.length) {
      for (const f of options.filters) {
        if (!VALID_FILTER_FIELDS.has(f.field) || !VALID_FILTER_OPERATORS.has(f.operator)) continue;
        if (f.value) validateStringLength(f.value, 500, "filter value");
        if (!f.value && f.field !== "phoneActive") continue;
        switch (f.field) {
          case "name":
          case "email":
          case "phone":
            andConditions.push({ [f.field]: { contains: f.value, mode: "insensitive" } });
            break;
          case "sourceType": {
            // Map Hebrew labels to DB values
            const valueMap: Record<string, string> = {
              "ידני": "MANUAL", "MANUAL": "MANUAL",
              "אוטומציה": "TABLE", "TABLE": "TABLE",
              "Webhook": "WEBHOOK", "WEBHOOK": "WEBHOOK",
            };
            const mapped = valueMap[f.value] || f.value;
            andConditions.push({ sourceType: mapped });
            break;
          }
          case "triggerDate":
            if (f.operator === "before") {
              andConditions.push({ triggerDate: { lte: new Date(f.value) } });
            } else if (f.operator === "after") {
              andConditions.push({ triggerDate: { gte: new Date(f.value) } });
            }
            break;
          case "phoneActive":
            andConditions.push({ phoneActive: f.value === "true" });
            break;
        }
      }
    }

    if (andConditions.length > 0) where.AND = andConditions;

    // Use cursor-based pagination when cursor is provided (O(1) seek vs O(n) offset)
    const cursorId = options?.cursor ? parseInt(options.cursor, 10) : undefined;
    const useCursor = cursorId && !isNaN(cursorId) && !options?.search?.trim();

    // Parallel count + find
    const [total, subscribers] = await Promise.all([
      prisma.nurtureSubscriber.count({ where }),
      prisma.nurtureSubscriber.findMany({
        where: useCursor
          ? { ...where, id: { lt: cursorId } }
          : where,
        orderBy: { createdAt: "desc" },
        ...(useCursor ? {} : { skip }),
        take,
      }),
    ]);

    // Resolve table names in bulk (cached — table names rarely change)
    const tableIds = [...new Set(
      subscribers.filter((sub: any) => sub.sourceTableId).map((sub: any) => sub.sourceTableId)
    )];
    let tableMap = new Map<number, string>();
    if (tableIds.length > 0) {
      const { getCachedMetric } = await import("@/lib/services/cache-service");
      const tableNames = await getCachedMetric(
        currentUser.companyId,
        ["table-names"],
        async () => {
          const tables = await prisma.tableMeta.findMany({
            where: { companyId: currentUser.companyId },
            select: { id: true, name: true },
          });
          return Object.fromEntries(tables.map((t) => [t.id, t.name]));
        },
        600 // 10-min TTL
      );
      tableMap = new Map(Object.entries(tableNames).map(([k, v]) => [Number(k), v]));
    }

    const mapped = subscribers.map((sub: any) => ({
      id: sub.id.toString(),
      name: sub.name,
      email: sub.email || "",
      phone: sub.phone || "",
      emailActive: sub.emailActive ?? true,
      phoneActive: sub.phoneActive ?? true,
      triggerDate: sub.triggerDate ? sub.triggerDate.toISOString() : null,
      source:
        sub.sourceType === "TABLE"
          ? "Table Automation"
          : sub.sourceType === "WEBHOOK"
          ? "Webhook"
          : sub.sourceType || "Manual",
      sourceTableId: sub.sourceTableId,
      sourceTableName: sub.sourceTableId ? tableMap.get(sub.sourceTableId) : null,
      createdAt: sub.createdAt,
    }));

    return { subscribers: mapped, total, hasMore: skip + take < total };
  } catch (error) {
    console.error("Error fetching nurture subscribers:", error);
    return { subscribers: [], total: 0, hasMore: false };
  }
}

// Helper: dispatch auto-send Inngest event if the list is configured for it
async function dispatchAutoSendIfConfigured(
  list: { id: number; configJson: any; isEnabled: boolean; slug: string },
  subscriber: { id: number; phone: string | null; phoneActive: boolean; email?: string | null; emailActive?: boolean; name: string },
  companyId: number
): Promise<{ dispatched: boolean; channels?: { sms: boolean; whatsappGreen: boolean; whatsappCloud: boolean; email: boolean }; timing?: string; reason?: string; error?: boolean }> {
  try {
    if (!list.configJson) {
      console.log("[AutoSend] skip: no configJson on list", list.id);
      return { dispatched: false, reason: "no_config" };
    }
    const config = list.configJson as any;
    const hasPhone = subscriber.phone && subscriber.phoneActive;
    const hasEmail = subscriber.email && subscriber.emailActive;
    if (!hasPhone && !hasEmail) {
      console.log("[AutoSend] skip: subscriber has no active contact method", { phone: subscriber.phone, phoneActive: subscriber.phoneActive, email: subscriber.email });
      return { dispatched: false, reason: "no_contact_method" };
    }
    if (config.timing === "manual" || !config.timing) {
      console.log("[AutoSend] skip: timing is manual or unset", config.timing);
      return { dispatched: false, reason: "manual" };
    }

    const channels = config.channels || {};
    if (!channels.sms && !channels.whatsappGreen && !channels.whatsappCloud && !channels.email) {
      console.log("[AutoSend] skip: no channels enabled", channels);
      return { dispatched: false, reason: "no_channels" };
    }

    const { migrateConfigMessages, getActiveMessage, NURTURE_TIMING_MAP } = await import("@/lib/nurture-messages");
    const activeMsg = getActiveMessage(migrateConfigMessages(config));
    if (!activeMsg) {
      console.log("[AutoSend] skip: no active message found");
      return { dispatched: false, reason: "no_active_message" };
    }

    const delayMs = NURTURE_TIMING_MAP[config.timing] ?? 0;
    const { inngest } = await import("@/lib/inngest/client");

    console.log("[AutoSend] dispatching nurture/delayed-send", {
      subscriberId: subscriber.id, slug: list.slug, delayMs, timing: config.timing,
    });

    await inngest.send({
      name: "nurture/delayed-send",
      data: {
        companyId,
        subscriberId: subscriber.id,
        nurtureListId: list.id,
        subscriberPhone: subscriber.phone || "",
        subscriberName: subscriber.name,
        channels: { ...channels, email: !!channels.email },
        smsBody: activeMsg.smsBody || "",
        whatsappGreenBody: activeMsg.whatsappGreenBody || "",
        whatsappCloudTemplateName: activeMsg.whatsappCloudTemplateName || "",
        whatsappCloudLanguageCode: activeMsg.whatsappCloudLanguageCode || "he",
        subscriberEmail: subscriber.email || "",
        emailSubject: activeMsg.emailSubject || "",
        emailBody: activeMsg.emailBody || "",
        slug: list.slug,
        delayMs,
        triggerKey: `manual-${list.slug}-${Date.now()}`,
      },
    });
    console.log("[AutoSend] event dispatched successfully", { channels, timing: config.timing });
    return {
      dispatched: true,
      channels: {
        sms: !!channels.sms,
        whatsappGreen: !!channels.whatsappGreen,
        whatsappCloud: !!channels.whatsappCloud,
        email: !!channels.email,
      },
      timing: String(config.timing),
    };
  } catch (err) {
    console.error("[NurtureHub] dispatchAutoSendIfConfigured failed (non-fatal):", err);
    return { dispatched: false, error: true };
  }
}

// Add a subscriber manually
export async function addNurtureSubscriberManual(
  slug: string,
  data: { name: string; email?: string; phone?: string; triggerDate?: string }
) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return { success: false, error: "Authentication required" };
    }
    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.nurtureMutation);
    if (limited) return { success: false, error: "בוצעו יותר מדי פניות. אנא המתינו ונסו שוב" };
    if (!validateNurtureSlug(slug)) return { success: false, error: "קטגוריה לא תקינה" };
    validateStringLength(data.name, MAX_LENGTHS.name, "name");
    if (data.email) validateStringLength(data.email, MAX_LENGTHS.email, "email");
    if (data.phone) validateStringLength(data.phone, MAX_LENGTHS.phone, "phone");

    if (!data.email && !data.phone) {
      return { success: false, error: "Email or phone is required" };
    }

    // Find or create the list
    let list = await prisma.nurtureList.findFirst({
      where: { slug, companyId: currentUser.companyId },
    });

    if (!list) {
        list = await prisma.nurtureList.create({
        data: {
          companyId: currentUser.companyId,
          slug,
          name: slug.charAt(0).toUpperCase() + slug.slice(1).replace("-", " "),
        },
      });
    }

    // Check for duplicates
    const conditions: any[] = [];
    if (data.email) conditions.push({ email: data.email });
    if (data.phone) conditions.push({ phone: data.phone });

    const existing = await prisma.nurtureSubscriber.findFirst({
      where: {
        nurtureListId: list.id,
        OR: conditions,
      },
    });

    if (existing) {
      return { success: false, error: "מנוי עם פרטים אלו כבר קיים ברשימה" };
    }

    // Parse triggerDate if provided
    let triggerDate: Date | null = null;
    if (data.triggerDate) {
      const parsed = new Date(data.triggerDate);
      if (!isNaN(parsed.getTime())) triggerDate = parsed;
    }

    const normalizedPhone = data.phone ? normalizeToE164(data.phone) : null;
    const newSub = await prisma.nurtureSubscriber.create({
      data: {
        nurtureListId: list.id,
        name: data.name,
        email: data.email || null,
        phone: normalizedPhone || data.phone || null,
        phoneActive: !!normalizedPhone,
        triggerDate,
        sourceType: "MANUAL",
      },
    });

    // Dispatch auto-send if configured
    const autoSend = await dispatchAutoSendIfConfigured(
      list,
      { id: newSub.id, phone: newSub.phone, phoneActive: newSub.phoneActive, email: newSub.email, emailActive: newSub.emailActive, name: newSub.name },
      currentUser.companyId
    );

    // Consume quota at dispatch time so it's charged immediately
    if (autoSend.dispatched && autoSend.channels) {
      const channelCount = [autoSend.channels.sms, autoSend.channels.whatsappGreen, autoSend.channels.whatsappCloud].filter(Boolean).length;
      if (channelCount > 0) {
        const { consumeNurtureQuota } = await import("@/lib/nurture-rate-limit");
        const tier = (currentUser.isPremium as "basic" | "premium" | "super") || "basic";
        await consumeNurtureQuota(currentUser.id, tier, channelCount);
      }
    }

    return {
      success: true,
      autoSendDispatched: autoSend.dispatched,
      autoSendChannels: autoSend.channels,
      autoSendTiming: autoSend.timing,
    };
  } catch (error) {
    return handleNurtureError(error, "addNurtureSubscriberManual");
  }
}

// Bulk import subscribers from a data source in a single server call
export async function bulkImportNurtureSubscribers(
  listSlug: string,
  sourceId: string,
  selectedIds: string[],
  mapping?: { name: string; email: string; phone: string; triggerDate?: string }
): Promise<{
  success: boolean;
  successCount?: number;
  duplicateCount?: number;
  missingContactCount?: number;
  duplicateNames?: string[];
  missingContactNames?: string[];
  autoSendCount?: number;
  autoSendChannels?: { sms: boolean; whatsappGreen: boolean; whatsappCloud: boolean };
  autoSendTiming?: string;
  error?: string;
}> {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser) return { success: false, error: "Authentication required" };
    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.nurtureBulk);
    if (limited) return { success: false, error: "בוצעו יותר מדי פניות. אנא המתינו ונסו שוב" };
    if (!validateNurtureSlug(listSlug)) return { success: false, error: "קטגוריה לא תקינה" };
    if (selectedIds.length === 0) return { success: true, successCount: 0, duplicateCount: 0, missingContactCount: 0 };
    if (selectedIds.length > 10000) return { success: false, error: "Too many IDs (max 10,000)" };

    // Find or create list (once)
    let list = await prisma.nurtureList.findFirst({
      where: { slug: listSlug, companyId: currentUser.companyId },
    });
    if (!list) {
      list = await prisma.nurtureList.create({
        data: {
          companyId: currentUser.companyId,
          slug: listSlug,
          name: listSlug.charAt(0).toUpperCase() + listSlug.slice(1).replace("-", " "),
        },
      });
    }

    // Resolve records from source in batches of 2000 (with up to 3 concurrent batches)
    const numericIds = selectedIds.map(Number);
    type MappedRecord = { name: string; email: string | null; phone: string | null; triggerDate: string | null };
    const mapped: MappedRecord[] = [];
    const BATCH = 2000;
    const CONCURRENT_SOURCE_BATCHES = 3;

    // Build batch queries
    const sourceQueries: (() => Promise<MappedRecord[]>)[] = [];
    for (let i = 0; i < numericIds.length; i += BATCH) {
      const batchIds = numericIds.slice(i, i + BATCH);

      if (sourceId === "clients") {
        sourceQueries.push(async () => {
          const clients = await prisma.client.findMany({
            where: { id: { in: batchIds }, companyId: currentUser.companyId },
            select: { id: true, name: true, email: true, phone: true },
          });
          return clients.map((c) => ({ name: c.name, email: c.email || null, phone: c.phone || null, triggerDate: null }));
        });
      } else if (sourceId === "users") {
        sourceQueries.push(async () => {
          const users = await prisma.user.findMany({
            where: { id: { in: batchIds }, companyId: currentUser.companyId },
            select: { id: true, name: true, email: true },
          });
          return users.map((u) => ({ name: u.name, email: u.email || null, phone: null, triggerDate: null }));
        });
      } else {
        const tableId = parseInt(sourceId);
        if (isNaN(tableId)) return { success: false, error: "Invalid source" };
        sourceQueries.push(async () => {
          const records = await prisma.record.findMany({
            where: { id: { in: batchIds }, tableId, companyId: currentUser.companyId },
          });
          return records.map((r) => {
            const data = r.data as any;
            if (mapping) {
              return {
                name: String(data[mapping.name] || `Record #${r.id}`),
                email: data[mapping.email] ? String(data[mapping.email]) : null,
                phone: data[mapping.phone] ? String(data[mapping.phone]) : null,
                triggerDate: mapping.triggerDate && data[mapping.triggerDate] ? String(data[mapping.triggerDate]) : null,
              };
            }
            // Heuristic fallback (same as getDataSourceRecords)
            const name = data.name || data.Name || data.title || data.Title || data["שם"] || data["שם מלא"] || `Record #${r.id}`;
            const email = data.email || data.Email || data["מייל"] || data["אימייל"] || null;
            const phone = data.phone || data.Phone || data["טלפון"] || data["נייד"] || null;
            return {
              name: typeof name === "string" ? name : JSON.stringify(name),
              email: typeof email === "string" ? email : null,
              phone: typeof phone === "string" ? phone : null,
              triggerDate: null,
            };
          });
        });
      }
    }

    // Run source queries with bounded concurrency (3 concurrent)
    for (let i = 0; i < sourceQueries.length; i += CONCURRENT_SOURCE_BATCHES) {
      const chunk = sourceQueries.slice(i, i + CONCURRENT_SOURCE_BATCHES);
      const results = await Promise.all(chunk.map((fn) => fn()));
      for (const batch of results) mapped.push(...batch);
    }

    // Classify: missing contact vs to-check
    const missingContactNames: string[] = [];
    const toCheck: MappedRecord[] = [];
    for (const rec of mapped) {
      if (!rec.email && !rec.phone) {
        missingContactNames.push(rec.name);
      } else {
        toCheck.push(rec);
      }
    }

    // Bulk duplicate check — one query
    const emails = toCheck.map((r) => r.email).filter(Boolean) as string[];
    const phones = toCheck.map((r) => r.phone).filter(Boolean) as string[];
    const orConditions: any[] = [];
    if (emails.length > 0) orConditions.push({ email: { in: emails } });
    if (phones.length > 0) orConditions.push({ phone: { in: phones } });

    const existingSet = new Set<string>();
    if (orConditions.length > 0) {
      const existing = await prisma.nurtureSubscriber.findMany({
        where: { nurtureListId: list.id, OR: orConditions },
        select: { email: true, phone: true },
      });
      for (const e of existing) {
        if (e.email) existingSet.add(`e:${e.email}`);
        if (e.phone) existingSet.add(`p:${e.phone}`);
      }
    }

    // Filter duplicates + intra-batch dedup
    const seenInBatch = new Set<string>();
    const duplicateNames: string[] = [];
    let autoSendCount = 0;
    let autoSendChannels: { sms: boolean; whatsappGreen: boolean; whatsappCloud: boolean } | undefined;
    let autoSendTiming: string | undefined;
    const toInsert: {
      nurtureListId: number;
      name: string;
      email: string | null;
      phone: string | null;
      phoneActive: boolean;
      triggerDate: Date | null;
      sourceType: string;
    }[] = [];

    for (const rec of toCheck) {
      const isDup =
        (rec.email && existingSet.has(`e:${rec.email}`)) ||
        (rec.phone && existingSet.has(`p:${rec.phone}`)) ||
        (rec.email && seenInBatch.has(`e:${rec.email}`)) ||
        (rec.phone && seenInBatch.has(`p:${rec.phone}`));

      if (isDup) {
        duplicateNames.push(rec.name);
        continue;
      }

      if (rec.email) seenInBatch.add(`e:${rec.email}`);
      if (rec.phone) seenInBatch.add(`p:${rec.phone}`);

      let triggerDate: Date | null = null;
      if (rec.triggerDate) {
        const parsed = new Date(rec.triggerDate);
        if (!isNaN(parsed.getTime())) triggerDate = parsed;
      }

      const normalizedPhone = rec.phone ? normalizeToE164(rec.phone) : null;
      toInsert.push({
        nurtureListId: list.id,
        name: rec.name,
        email: rec.email,
        phone: normalizedPhone || rec.phone,
        phoneActive: !!normalizedPhone,
        triggerDate,
        sourceType: "MANUAL",
      });
    }

    // Bulk insert in chunks of 2000 to avoid memory spikes
    const INSERT_CHUNK = 2000;
    if (toInsert.length > 0) {
      for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
        await prisma.nurtureSubscriber.createMany({ data: toInsert.slice(i, i + INSERT_CHUNK) });
      }

      // Dispatch auto-send for newly created subscribers with active contact methods
      const config = list.configJson as any;
      if (config?.timing && config.timing !== "manual") {
        const contactsWithAutoSend = toInsert
          .filter((r) => (r.phone && r.phoneActive) || r.email)
          .map((r) => r.phone || r.email!);

        if (contactsWithAutoSend.length > 0) {
          const channels = config.channels || {};
          if (channels.sms || channels.whatsappGreen || channels.whatsappCloud || channels.email) {
            const { migrateConfigMessages, getActiveMessage, NURTURE_TIMING_MAP } = await import("@/lib/nurture-messages");
            const activeMsg = getActiveMessage(migrateConfigMessages(config));
            if (activeMsg) {
              const delayMs = NURTURE_TIMING_MAP[config.timing] ?? 0;
              // Query back created subscribers to get their IDs in larger batches
              const DISPATCH_BATCH = 200;
              const CONCURRENT_BATCHES = 3;
              const allEvents: any[] = [];

              // Build batch queries
              const batchQueries: Promise<any[]>[] = [];
              for (let i = 0; i < contactsWithAutoSend.length; i += DISPATCH_BATCH) {
                const batchContacts = contactsWithAutoSend.slice(i, i + DISPATCH_BATCH);
                batchQueries.push(
                  prisma.nurtureSubscriber.findMany({
                    where: {
                      nurtureListId: list.id,
                      OR: [
                        { phone: { in: batchContacts.filter(c => c.startsWith("+") || /^\d/.test(c)) } },
                        { email: { in: batchContacts.filter(c => c.includes("@")) } },
                      ],
                    },
                    select: { id: true, phone: true, phoneActive: true, email: true, emailActive: true, name: true },
                  })
                );
              }

              // Run batch queries with bounded concurrency (3 concurrent)
              for (let i = 0; i < batchQueries.length; i += CONCURRENT_BATCHES) {
                const chunk = batchQueries.slice(i, i + CONCURRENT_BATCHES);
                const results = await Promise.all(chunk);
                for (const createdSubs of results) {
                  for (const sub of createdSubs) {
                    const hasPhone = sub.phone && sub.phoneActive;
                    const hasEmail = sub.email && sub.emailActive;
                    if (!hasPhone && !hasEmail) continue;
                    allEvents.push({
                      name: "nurture/delayed-send" as const,
                      data: {
                        companyId: currentUser.companyId,
                        subscriberId: sub.id,
                        nurtureListId: list.id,
                        subscriberPhone: sub.phone || "",
                        subscriberName: sub.name,
                        channels: { ...channels, email: !!channels.email },
                        smsBody: activeMsg.smsBody || "",
                        whatsappGreenBody: activeMsg.whatsappGreenBody || "",
                        whatsappCloudTemplateName: activeMsg.whatsappCloudTemplateName || "",
                        whatsappCloudLanguageCode: activeMsg.whatsappCloudLanguageCode || "he",
                        subscriberEmail: sub.email || "",
                        emailSubject: activeMsg.emailSubject || "",
                        emailBody: activeMsg.emailBody || "",
                        slug: list.slug,
                        delayMs,
                        triggerKey: `manual-${list.slug}-${Date.now()}`,
                      },
                    });
                  }
                }
              }
              // Batch send all events in a single Inngest call
              if (allEvents.length > 0) {
                const { inngest } = await import("@/lib/inngest/client");
                await inngest.send(allEvents);
                autoSendCount = allEvents.length;
                autoSendChannels = {
                  sms: !!channels.sms,
                  whatsappGreen: !!channels.whatsappGreen,
                  whatsappCloud: !!channels.whatsappCloud,
                };
                autoSendTiming = config.timing;
              }
            }
          }
        }
      }

      // Consume quota for all dispatched auto-sends
      if (autoSendCount > 0 && autoSendChannels) {
        const channelCount = [autoSendChannels.sms, autoSendChannels.whatsappGreen, autoSendChannels.whatsappCloud].filter(Boolean).length;
        if (channelCount > 0) {
          const { consumeNurtureQuota } = await import("@/lib/nurture-rate-limit");
          const tier = (currentUser.isPremium as "basic" | "premium" | "super") || "basic";
          await consumeNurtureQuota(currentUser.id, tier, channelCount * autoSendCount);
        }
      }
    }

    logSecurityEvent({
      action: SEC_NURTURE_BULK_IMPORT,
      companyId: currentUser.companyId,
      userId: currentUser.id,
      details: { slug: listSlug, count: toInsert.length },
    });

    return {
      success: true,
      successCount: toInsert.length,
      duplicateCount: duplicateNames.length,
      missingContactCount: missingContactNames.length,
      duplicateNames,
      missingContactNames,
      autoSendCount,
      autoSendChannels,
      autoSendTiming,
    };
  } catch (error) {
    return handleNurtureError(error, "bulkImportNurtureSubscribers");
  }
}

// Get automation rules for nurture lists
export async function getNurtureRules(slug: string) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return [];
    }
    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.nurtureRead);
    if (limited) return [];
    if (!validateNurtureSlug(slug)) return [];

    const rules = await prisma.automationRule.findMany({
      where: {
        companyId: currentUser.companyId,
        actionType: "ADD_TO_NURTURE_LIST",
        actionConfig: { path: ['listId'], equals: slug },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return rules;
  } catch (error) {
    console.error("Error fetching nurture rules:", error);
    return [];
  }
}

// Update a subscriber - only updates channel preferences (emailActive, phoneActive)
export async function updateNurtureSubscriber(
  id: string,
  data: {
    emailActive?: boolean;
    phoneActive?: boolean;
    phone?: string;
    email?: string;
    name?: string;
    triggerDate?: string | null;
  }
) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.nurtureMutation);
    if (limited) return { success: false, error: "בוצעו יותר מדי פניות. אנא המתינו ונסו שוב" };
    if (data.name !== undefined) validateStringLength(data.name, MAX_LENGTHS.name, "name");
    if (data.email !== undefined) validateStringLength(data.email, MAX_LENGTHS.email, "email");
    if (data.phone !== undefined) validateStringLength(data.phone, MAX_LENGTHS.phone, "phone");

    const subscriberId = parseInt(id);
    if (isNaN(subscriberId)) {
      return { success: false, error: "Invalid subscriber ID" };
    }

    // Verify subscriber belongs to user's company via nurtureList relation
    const subscriber = await prisma.nurtureSubscriber.findFirst({
      where: { id: subscriberId, nurtureList: { companyId: user.companyId } },
      select: { id: true },
    });
    if (!subscriber) return { success: false, error: "Not found" };

    const updateData: any = {};
    if (data.emailActive !== undefined) updateData.emailActive = data.emailActive;
    if (data.phoneActive !== undefined) updateData.phoneActive = data.phoneActive;
    if (data.phone !== undefined) {
      const normalizedPhone = data.phone ? normalizeToE164(data.phone) : null;
      updateData.phone = normalizedPhone || data.phone || null;
    }
    if (data.email !== undefined) updateData.email = data.email || null;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.triggerDate !== undefined) {
      updateData.triggerDate = data.triggerDate ? new Date(data.triggerDate) : null;
    }

    await prisma.nurtureSubscriber.update({
      where: { id: subscriberId },
      data: updateData,
    });

    return { success: true };
  } catch (error) {
    return handleNurtureError(error, "updateNurtureSubscriber");
  }
}

// Delete a subscriber
export async function deleteNurtureSubscriber(id: string) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.nurtureMutation);
    if (limited) return { success: false, error: "בוצעו יותר מדי פניות. אנא המתינו ונסו שוב" };

    const subscriberId = parseInt(id);
    if (isNaN(subscriberId)) {
      return { success: false, error: "Invalid subscriber ID" };
    }

    // Verify subscriber belongs to user's company via nurtureList relation
    const subscriber = await prisma.nurtureSubscriber.findFirst({
      where: { id: subscriberId, nurtureList: { companyId: user.companyId } },
      select: { id: true },
    });
    if (!subscriber) return { success: false, error: "Not found" };

    await prisma.nurtureSubscriber.delete({
      where: { id: subscriberId },
    });

    return { success: true };
  } catch (error) {
    return handleNurtureError(error, "deleteNurtureSubscriber");
  }
}

// Bulk delete subscribers
export async function deleteNurtureSubscribers(ids: string[]) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS.nurtureBulk);
    if (limited) return { success: false, error: "בוצעו יותר מדי פניות. אנא המתינו ונסו שוב" };
    if (ids.length > 10000) return { success: false, error: "Too many IDs" };

    const numericIds = ids.map((id) => parseInt(id)).filter((id) => !isNaN(id));
    if (numericIds.length === 0) return { success: false, error: "No valid IDs" };

    // Only delete subscribers belonging to user's company
    const { count } = await prisma.nurtureSubscriber.deleteMany({
      where: {
        id: { in: numericIds },
        nurtureList: { companyId: user.companyId },
      },
    });

    logSecurityEvent({
      action: SEC_NURTURE_BULK_DELETE,
      companyId: user.companyId,
      userId: user.id,
      details: { count, slug: "bulk-delete" },
    });

    return { success: true, count };
  } catch (error) {
    return handleNurtureError(error, "deleteNurtureSubscribers");
  }
}

// Save nurture campaign configuration
export async function saveNurtureConfig(
  slug: string,
  configJson: any,
  isEnabled: boolean
) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser) return { success: false, error: "Authentication required" };
    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.nurtureMutation);
    if (limited) return { success: false, error: "בוצעו יותר מדי פניות. אנא המתינו ונסו שוב" };
    if (!validateNurtureSlug(slug)) return { success: false, error: "קטגוריה לא תקינה" };
    validateJsonValue(configJson, 5, 102400, "configJson");

    // Validate individual message body lengths
    if (typeof configJson === "object" && configJson !== null) {
      const c = configJson as Record<string, unknown>;
      const messages = Array.isArray(c.messages) ? c.messages : [];
      for (const msg of messages) {
        if (typeof msg !== "object" || msg === null) continue;
        const m = msg as Record<string, unknown>;
        if (typeof m.smsBody === "string" && m.smsBody.length > 1600)
          return { success: false, error: "הודעת SMS ארוכה מדי (מקסימום 1600 תווים)" };
        if (typeof m.whatsappGreenBody === "string" && m.whatsappGreenBody.length > 4096)
          return { success: false, error: "הודעת WhatsApp ארוכה מדי (מקסימום 4096 תווים)" };
        if (typeof m.emailBody === "string" && m.emailBody.length > 50000)
          return { success: false, error: "תוכן האימייל ארוך מדי (מקסימום 50000 תווים)" };
      }
    }

    await prisma.nurtureList.upsert({
      where: {
        companyId_slug: {
          companyId: currentUser.companyId,
          slug,
        },
      },
      update: {
        configJson,
        isEnabled,
      },
      create: {
        companyId: currentUser.companyId,
        slug,
        name: slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " "),
        configJson,
        isEnabled,
      },
    });

    logSecurityEvent({
      action: SEC_NURTURE_CONFIG_CHANGED,
      companyId: currentUser.companyId,
      userId: currentUser.id,
      details: { slug },
    });

    return { success: true };
  } catch (error) {
    return handleNurtureError(error, "saveNurtureConfig");
  }
}

// Get nurture campaign configuration
export async function getNurtureConfig(slug: string) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser) return null;
    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.nurtureRead);
    if (limited) return null;
    if (!validateNurtureSlug(slug)) return null;

    const list = await prisma.nurtureList.findFirst({
      where: { slug, companyId: currentUser.companyId },
      select: { configJson: true, isEnabled: true },
    });

    if (!list) return null;
    return { config: list.configJson, isEnabled: list.isEnabled };
  } catch (error) {
    console.error("Error fetching nurture config:", error);
    return null;
  }
}

// Check which channels are available for the company
export async function getAvailableChannels() {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser) return { sms: false, whatsappGreen: false, whatsappCloud: false, email: false };
    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.nurtureRead);
    if (limited) return { sms: false, whatsappGreen: false, whatsappCloud: false, email: false };

    const { getCachedMetric } = await import("@/lib/services/cache-service");
    return getCachedMetric(
      currentUser.companyId,
      ["nurture-available-channels"],
      async () => {
        const [smsIntegration, company, waAccount] = await Promise.all([
          prisma.smsIntegration.findFirst({
            where: { companyId: currentUser.companyId, status: "READY" },
            select: { id: true },
          }),
          prisma.company.findUnique({
            where: { id: currentUser.companyId },
            select: { greenApiInstanceId: true, greenApiToken: true },
          }),
          // phoneNumbers relation
          (prisma.whatsAppAccount as any).findFirst({
            where: { companyId: currentUser.companyId, status: "ACTIVE" },
            include: { phoneNumbers: { where: { isActive: true }, take: 1 } },
          }),
        ]);

        return {
          sms: !!smsIntegration,
          whatsappGreen: !!(company?.greenApiInstanceId && company?.greenApiToken),
          whatsappCloud: !!(waAccount && (waAccount as any).phoneNumbers?.length > 0),
          email: true,
        };
      },
      300 // 5-min TTL
    );
  } catch (error) {
    console.error("Error checking available channels:", error);
    return { sms: false, whatsappGreen: false, whatsappCloud: false, email: false };
  }
}

// Get recent send logs for a nurture list
export async function getNurtureSendLogs(slug: string) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser) return [];
    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.nurtureRead);
    if (limited) return [];
    if (!validateNurtureSlug(slug)) return [];

    const list = await prisma.nurtureList.findFirst({
      where: { slug, companyId: currentUser.companyId },
      select: { id: true },
    });
    if (!list) return [];

    const logs = await prisma.nurtureSendLog.findMany({
      where: { nurtureListId: list.id },
      orderBy: { sentAt: "desc" },
      take: 100,
      include: {
        subscriber: { select: { name: true, phone: true } },
      },
    });

    return logs.map((l) => ({
      id: l.id,
      subscriberId: l.subscriberId,
      subscriberName: l.subscriber.name,
      subscriberPhone: l.subscriber.phone,
      triggerKey: l.triggerKey,
      channel: l.channel,
      status: l.status,
      sentAt: l.sentAt,
    }));
  } catch (error) {
    console.error("Error fetching nurture send logs:", error);
    return [];
  }
}

// Get last-sent date per subscriber for a nurture list
export async function getSubscriberLastSentMap(slug: string): Promise<Record<string, string>> {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser) return {};
    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.nurtureRead);
    if (limited) return {};
    if (!validateNurtureSlug(slug)) return {};

    const list = await prisma.nurtureList.findFirst({
      where: { slug, companyId: currentUser.companyId },
      select: { id: true },
    });
    if (!list) return {};

    const { getCachedMetric } = await import("@/lib/services/cache-service");
    return getCachedMetric(
      currentUser.companyId,
      ["nurture-last-sent", String(list.id)],
      async () => {
        const groups = await prisma.nurtureSendLog.groupBy({
          by: ["subscriberId"],
          where: { nurtureListId: list.id, status: "SENT" },
          _max: { sentAt: true },
        });

        const result: Record<string, string> = {};
        for (const g of groups) {
          if (g._max.sentAt) {
            result[String(g.subscriberId)] = g._max.sentAt.toISOString();
          }
        }
        return result;
      },
      120 // 2-min TTL — short because send activity changes it
    );
  } catch (error) {
    console.error("Error fetching subscriber last sent map:", error);
    return {};
  }
}

// Get current nurture quota status for UI display
export async function getNurtureQuotaAction() {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser) return null;
    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.nurtureRead);
    if (limited) return null;

    const { getNurtureQuotaStatus } = await import("@/lib/nurture-rate-limit");
    const tier = (currentUser.isPremium as "basic" | "premium" | "super") || "basic";
    return await getNurtureQuotaStatus(currentUser.id, tier);
  } catch (error) {
    console.error("[NurtureHub] getNurtureQuotaAction:", error);
    return null;
  }
}

// Get recent auto-send activity for live preview indicator
export async function getRecentAutoSendActivity(slug: string) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser) return null;
    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.nurtureRead);
    if (limited) return null;
    if (!validateNurtureSlug(slug)) return null;

    const list = await prisma.nurtureList.findFirst({
      where: { slug, companyId: currentUser.companyId },
      select: { id: true },
    });
    if (!list) return null;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [pendingCount, totalSentToday, lastSend] = await Promise.all([
      prisma.nurtureSendLog.count({
        where: { nurtureListId: list.id, status: "DISPATCHED" },
      }),
      prisma.nurtureSendLog.count({
        where: { nurtureListId: list.id, status: "SENT", sentAt: { gte: todayStart } },
      }),
      prisma.nurtureSendLog.findFirst({
        where: { nurtureListId: list.id, status: "SENT" },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true },
      }),
    ]);

    return {
      pendingCount,
      totalSentToday,
      lastSendAt: lastSend?.sentAt?.toISOString() ?? null,
    };
  } catch (error) {
    console.error("[NurtureHub] getRecentAutoSendActivity:", error);
    return null;
  }
}

// Get individual auto-send queue items for the floating queue panel
export async function getAutoSendQueue(slug: string): Promise<{
  items: { id: number; name: string; phone: string; status: string; sentAt: string }[];
  channels: { sms: boolean; whatsappGreen: boolean; whatsappCloud: boolean; email: boolean };
} | null> {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser) return null;
    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.nurtureRead);
    if (limited) return null;
    if (!validateNurtureSlug(slug)) return null;

    const list = await prisma.nurtureList.findFirst({
      where: { slug, companyId: currentUser.companyId },
      select: { id: true, configJson: true },
    });
    if (!list) return null;

    const config = list.configJson as any;
    const channels = config?.channels || {};
    const recentCutoff = new Date(Date.now() - 5 * 60 * 1000);

    const logs = await prisma.nurtureSendLog.findMany({
      where: {
        nurtureListId: list.id,
        sentAt: { gte: recentCutoff },
        triggerKey: { startsWith: "manual-" },
      },
      include: {
        subscriber: { select: { name: true, phone: true } },
      },
      orderBy: { sentAt: "desc" },
      take: 20,
    });

    return {
      items: logs.map((l) => ({
        id: l.id,
        name: l.subscriber.name,
        phone: l.subscriber.phone || "",
        status: l.status,
        sentAt: l.sentAt.toISOString(),
      })),
      channels: {
        sms: !!channels.sms,
        whatsappGreen: !!channels.whatsappGreen,
        whatsappCloud: !!channels.whatsappCloud,
        email: !!channels.email,
      },
    };
  } catch (error) {
    console.error("[NurtureHub] getAutoSendQueue:", error);
    return null;
  }
}

// Send nurture campaign to all subscribers or a specific one
export async function sendNurtureCampaign(
  slug: string,
  subscriberId?: string,
  channelOverrides?: { sms?: boolean; whatsappGreen?: boolean; whatsappCloud?: boolean; email?: boolean },
  subscriberIds?: string[]
): Promise<{ success: boolean; error?: string; count?: number; totalSubscribers?: number; quotaLimited?: boolean; truncated?: boolean; resetInSeconds?: number; channelsSent?: { sms: boolean; whatsappGreen: boolean; whatsappCloud: boolean; email: boolean }; batchId?: string }> {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser) return { success: false, error: "נדרשת התחברות" };
    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.nurtureSend);
    if (limited) return { success: false, error: "בוצעו יותר מדי פניות. אנא המתינו ונסו שוב" };
    if (!validateNurtureSlug(slug)) return { success: false, error: "קטגוריה לא תקינה" };

    // Fetch list metadata only (no subscribers) to avoid loading all subscribers into memory
    const list = await prisma.nurtureList.findFirst({
      where: { slug, companyId: currentUser.companyId },
      select: { id: true, slug: true, companyId: true, configJson: true, isEnabled: true },
    });

    if (!list) return { success: false, error: "קמפיין לא נמצא" };
    if (!list.configJson) return { success: false, error: "יש לשמור את ההגדרות לפני שליחה" };

    const config = list.configJson as any;
    const configChannels = config.channels || {};
    const channels = channelOverrides
      ? {
          sms: !!channelOverrides.sms,
          whatsappGreen: !!channelOverrides.whatsappGreen,
          whatsappCloud: !!channelOverrides.whatsappCloud,
          email: !!channelOverrides.email,
        }
      : { ...configChannels, email: !!configChannels.email };

    if (!channels.sms && !channels.whatsappGreen && !channels.whatsappCloud && !channels.email) {
      return { success: false, error: "יש לבחור לפחות ערוץ שליחה אחד" };
    }

    const channelCount = (channels.sms ? 1 : 0) + (channels.whatsappGreen ? 1 : 0) + (channels.whatsappCloud ? 1 : 0) + (channels.email ? 1 : 0);

    // Rate limit both individual and bulk sends
    const tier = (currentUser.isPremium as "basic" | "premium" | "super") || "basic";
    if (subscriberId) {
      if (tier !== "super") {
        const { consumeNurtureQuota } = await import("@/lib/nurture-rate-limit");
        const quota = await consumeNurtureQuota(currentUser.id, tier, channelCount);
        if (!quota.allowed) {
          return {
            success: false,
            error: `חרגת ממגבלת ההודעות (${tier === "basic" ? 3 : 6}/דקה). נסה שוב בעוד ${quota.resetInSeconds} שניות.`,
            resetInSeconds: quota.resetInSeconds,
          };
        }
      }
    }

    // Resolve active message from templates array (backward compat with flat fields)
    const { migrateConfigMessages, getActiveMessage } = await import("@/lib/nurture-messages");
    const messages = migrateConfigMessages(config);
    const activeMsg = getActiveMessage(messages);
    if (!activeMsg) {
      return { success: false, error: "אין תבנית הודעה פעילה" };
    }

    if (channels.sms && !activeMsg.smsBody?.trim()) {
      return { success: false, error: "תוכן הודעת SMS חסר בתבנית הפעילה" };
    }
    if (channels.whatsappGreen && !activeMsg.whatsappGreenBody?.trim()) {
      return { success: false, error: "תוכן הודעת WhatsApp חסר בתבנית הפעילה" };
    }
    if (channels.email && !activeMsg.emailBody?.trim()) {
      return { success: false, error: "תוכן האימייל חסר בתבנית הפעילה" };
    }

    // Build subscriber query with active contact method filters (instead of loading all into memory)
    const emailOnlyChannel = channels.email && !channels.sms && !channels.whatsappGreen && !channels.whatsappCloud;
    const subscriberWhere: any = {
      nurtureListId: list.id,
      ...(emailOnlyChannel
        ? { emailActive: true, email: { not: null } }
        : { OR: [
            { phoneActive: true, phone: { not: null } },
            { emailActive: true, email: { not: null } },
          ] }),
    };

    // If subscriberId provided, filter to only that subscriber
    if (subscriberId) {
      const subId = parseInt(subscriberId);
      if (isNaN(subId)) {
        return { success: false, error: "המנוי לא נמצא או שאין לו מספר טלפון פעיל" };
      }
      subscriberWhere.id = subId;
    }

    // Filter to specific subscriber IDs if provided (bulk dialog selection)
    if (!subscriberId && subscriberIds && subscriberIds.length > 0) {
      subscriberWhere.id = { in: subscriberIds.map(Number) };
    }

    let activeSubscribers = await prisma.nurtureSubscriber.findMany({
      where: subscriberWhere,
      select: { id: true, name: true, phone: true, phoneActive: true, email: true, emailActive: true },
      take: 10000,
    });

    // Warn if subscriber query hit the limit — some subscribers may be silently excluded
    const subscribersTruncated = activeSubscribers.length === 10000;

    if (subscriberId && activeSubscribers.length === 0) {
      return { success: false, error: "המנוי לא נמצא או שאין לו מספר טלפון פעיל" };
    }

    if (activeSubscribers.length === 0) {
      return { success: false, error: "אין מנויים פעילים עם מספרי טלפון" };
    }

    // Bulk rate limiting (not for individual sends — already handled above)
    const totalSubscribers = activeSubscribers.length;
    let quotaLimited = false;
    if (!subscriberId && tier !== "super") {
      const totalUnitsNeeded = activeSubscribers.length * channelCount;
      const { consumeNurtureQuotaBulk } = await import("@/lib/nurture-rate-limit");
      const bulk = await consumeNurtureQuotaBulk(currentUser.id, tier, totalUnitsNeeded);

      if (bulk.consumed === 0) {
        return {
          success: false,
          error: `אין מכסת הודעות זמינה. נסה שוב בעוד ${bulk.resetInSeconds} שניות.`,
          resetInSeconds: bulk.resetInSeconds,
        };
      }

      if (bulk.consumed < totalUnitsNeeded) {
        activeSubscribers = activeSubscribers.slice(0, Math.floor(bulk.consumed / channelCount));
        quotaLimited = true;
      }
    }

    // Validate integrations
    const available = await getAvailableChannels();
    if (channels.sms && !available.sms) {
      return { success: false, error: "חיבור SMS לא מוגדר" };
    }
    if (channels.whatsappGreen && !available.whatsappGreen) {
      return { success: false, error: "חיבור WhatsApp Green API לא מוגדר" };
    }
    if (channels.whatsappCloud && !available.whatsappCloud) {
      return { success: false, error: "חיבור WhatsApp Cloud API לא מוגדר" };
    }
    if (channels.whatsappCloud && !activeMsg.whatsappCloudTemplateName) {
      return { success: false, error: "WhatsApp Cloud template name is required" };
    }

    const { inngest } = await import("@/lib/inngest/client");
    const { createLogger } = await import("@/lib/logger");
    const log = createLogger("NurtureCampaign");

    // Generate batch ID for queue tracking (bulk sends only)
    const batchId = !subscriberId ? crypto.randomUUID() : undefined;

    if (subscribersTruncated) {
      log.warn("Subscriber query truncated at 10000 limit", {
        companyId: currentUser.companyId,
        listId: list.id,
        slug,
      });
    }

    log.info("Dispatching nurture campaign", {
      slug,
      channels,
      smsBody: !!activeMsg.smsBody,
      subscriberCount: activeSubscribers.length,
      phones: activeSubscribers.map((s: any) => s.phone?.substring(0, 6) + "***"),
      batchId,
      quotaLimited,
    });

    // Init batch queue in Redis (bulk sends only)
    if (batchId) {
      const { initBatchQueue } = await import("@/lib/nurture-queue");
      await initBatchQueue(
        batchId,
        currentUser.id,
        slug,
        activeSubscribers.map((s: any) => ({ phone: s.phone, name: s.name })),
        channels,
        activeMsg.smsBody || activeMsg.whatsappGreenBody || activeMsg.whatsappCloudTemplateName || ""
      );
    }

    // Create send logs for manual sends with DISPATCHED status (Inngest worker updates to SENT/FAILED)
    const triggerKey = `manual-${Date.now()}`;
    const LOG_CHUNK = 2000;
    const sendLogData = activeSubscribers.map((sub: any) => ({
      subscriberId: sub.id,
      nurtureListId: list.id,
      triggerKey,
      status: "DISPATCHED",
    }));
    for (let i = 0; i < sendLogData.length; i += LOG_CHUNK) {
      await prisma.nurtureSendLog.createMany({
        data: sendLogData.slice(i, i + LOG_CHUNK),
        skipDuplicates: true,
      });
    }

    // Enqueue a message event for each subscriber
    const events = activeSubscribers.map((sub: any) => ({
      name: "nurture/send-campaign-message" as const,
      data: {
        companyId: currentUser.companyId,
        subscriberPhone: sub.phone || "",
        subscriberName: sub.name,
        channels,
        smsBody: activeMsg.smsBody || "",
        whatsappGreenBody: activeMsg.whatsappGreenBody || "",
        whatsappCloudTemplateName: activeMsg.whatsappCloudTemplateName || "",
        whatsappCloudLanguageCode: activeMsg.whatsappCloudLanguageCode || "he",
        subscriberEmail: sub.email || "",
        emailSubject: activeMsg.emailSubject || "",
        emailBody: activeMsg.emailBody || "",
        slug,
        batchId,
      },
    }));

    const EVENT_CHUNK = 1000;
    for (let i = 0; i < events.length; i += EVENT_CHUNK) {
      await inngest.send(events.slice(i, i + EVENT_CHUNK));
    }

    // Invalidate lastSentMap cache after campaign dispatch
    try {
      const { redis } = await import("@/lib/redis");
      await redis.del(`cache:metric:${currentUser.companyId}:nurture-last-sent:${list.id}`);
    } catch (e) { console.warn("[NurtureHub] cache invalidation failed", String(e)); }

    logSecurityEvent({
      action: SEC_NURTURE_CAMPAIGN_SENT,
      companyId: currentUser.companyId,
      userId: currentUser.id,
      details: { slug, count: activeSubscribers.length, batchId },
    });

    return {
      success: true,
      count: activeSubscribers.length,
      totalSubscribers,
      quotaLimited,
      truncated: subscribersTruncated,
      batchId,
      channelsSent: {
        sms: !!channels.sms,
        whatsappGreen: !!channels.whatsappGreen,
        whatsappCloud: !!channels.whatsappCloud,
        email: !!channels.email,
      },
    };
  } catch (error) {
    return handleNurtureError(error, "sendNurtureCampaign");
  }
}

// Get live batch queue status for polling
export async function getNurtureBatchStatus(batchId: string) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();
    if (!currentUser) return null;
    const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.nurtureRead);
    if (limited) return null;

    const { getBatchQueueStatus } = await import("@/lib/nurture-queue");
    const status = await getBatchQueueStatus(batchId);
    if (!status) return null;

    // Verify ownership
    if (status.meta.userId !== currentUser.id) return null;

    return status;
  } catch (error) {
    console.error("[NurtureHub] getNurtureBatchStatus:", error);
    return null;
  }
}

export async function normalizeExistingSubscriberPhones(): Promise<{ updated: number }> {
  const { getCurrentUser } = await import("@/lib/permissions-server");
  const currentUser = await getCurrentUser();
  if (!currentUser) return { updated: 0 };
  const limited = await checkActionRateLimit(String(currentUser.id), RATE_LIMITS.nurtureBulk);
  if (limited) return { updated: 0 };

  let updated = 0;
  const BATCH_SIZE = 5000;
  const UPDATE_CHUNK = 50;
  let cursor: number | undefined;

  while (true) {
    const subscribers = await prisma.nurtureSubscriber.findMany({
      where: {
        nurtureList: { companyId: currentUser.companyId },
        phone: { not: null },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: { id: true, phone: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
    });

    if (subscribers.length === 0) break;
    cursor = subscribers[subscribers.length - 1].id;

    // Collect updates
    const toNormalize: { id: number; phone: string }[] = [];
    const toDeactivate: number[] = [];

    for (const sub of subscribers) {
      if (!sub.phone) continue;
      const normalized = normalizeToE164(sub.phone);
      if (normalized && normalized !== sub.phone) {
        toNormalize.push({ id: sub.id, phone: normalized });
      } else if (!normalized) {
        toDeactivate.push(sub.id);
      }
    }

    // Batch normalize updates with bounded concurrency
    for (let i = 0; i < toNormalize.length; i += UPDATE_CHUNK) {
      const chunk = toNormalize.slice(i, i + UPDATE_CHUNK);
      await Promise.all(
        chunk.map(({ id, phone }) =>
          prisma.nurtureSubscriber.update({ where: { id }, data: { phone } })
        )
      );
      updated += chunk.length;
    }

    // Batch deactivate with updateMany
    if (toDeactivate.length > 0) {
      const result = await prisma.nurtureSubscriber.updateMany({
        where: { id: { in: toDeactivate } },
        data: { phoneActive: false },
      });
      updated += result.count;
    }

    if (subscribers.length < BATCH_SIZE) break;
  }

  return { updated };
}
