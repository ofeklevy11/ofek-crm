"use server";

import { prisma } from "@/lib/prisma";

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
  query: string = ""
): Promise<DataRecord[]> {
  let records: DataRecord[] = [];

  // Get current user for multi-tenancy filtering
  const { getCurrentUser } = await import("@/lib/permissions-server");
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return records; // Return empty if not authenticated
  }

  // Helper to filter by query
  // Note: Prisma string filter 'contains' is case-insensitive with mode: 'insensitive' (Postgres)

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
        take: 50,
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
        take: 50,
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
          take: 100,
        });

        // Simple heuristic mapping
        // We filter in-memory because querying JSONB loosely is complex without knowing schema
        records = dbRecords
          .map((r) => {
            const data = r.data as any;

            // Try to identify name/email fields
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
              source: sourceId, // We could look up table name but overhead
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

  return records;
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
    const id = parseInt(tableId);
    if (isNaN(id)) return [];

    const table = await prisma.tableMeta.findUnique({
      where: { id },
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
export async function getRawTableRecords(tableId: string) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return []; // Return empty if not authenticated
    }

    const id = parseInt(tableId);
    if (isNaN(id)) return [];

    // CRITICAL: Filter records by companyId for multi-tenancy
    const dbRecords = await prisma.record.findMany({
      where: {
        tableId: id,
        companyId: currentUser.companyId,
      },
      take: 100,
    });

    // Return records with flattened data for easy access
    return dbRecords.map((r) => ({
      id: r.id.toString(),

      ...(r.data as any), // Spread all data fields
      _rawData: r.data, // Keep reference to raw data
    }));
  } catch (error) {
    console.error("Error fetching raw table records:", error);
    return [];
  }
}

export async function getNurtureSubscribers(slug: string) {
  try {
    // @ts-ignore
    const list = await prisma.nurtureList.findFirst({
      where: {
        slug,
      },
      include: {
        subscribers: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!list) return [];

    // Get all unique table IDs from subscribers
    // @ts-ignore
    const tableIds = [
      ...new Set(
        list.subscribers
          .filter((sub: any) => sub.sourceTableId)
          .map((sub: any) => sub.sourceTableId)
      ),
    ];

    // Fetch table names in bulk
    const tables =
      tableIds.length > 0
        ? await prisma.tableMeta.findMany({
            where: { id: { in: tableIds as number[] } },
            select: { id: true, name: true },
          })
        : [];

    const tableMap = new Map(tables.map((t) => [t.id, t.name]));

    // @ts-ignore
    return list.subscribers.map((sub: any) => ({
      id: sub.id.toString(),
      name: sub.name,
      email: sub.email || "",
      phone: sub.phone || "",
      emailActive: sub.emailActive ?? true,
      phoneActive: sub.phoneActive ?? true,
      source:
        sub.sourceType === "TABLE"
          ? "Table Automation"
          : sub.sourceType || "Manual",
      sourceTableId: sub.sourceTableId,
      sourceTableName: sub.sourceTableId
        ? tableMap.get(sub.sourceTableId)
        : null,
      createdAt: sub.createdAt,
    }));
  } catch (error) {
    console.error("Error fetching nurture subscribers:", error);
    return [];
  }
}

// Add a subscriber manually
export async function addNurtureSubscriberManual(
  slug: string,
  data: { name: string; email?: string; phone?: string }
) {
  try {
    const { getCurrentUser } = await import("@/lib/permissions-server");
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return { success: false, error: "Authentication required" };
    }

    if (!data.email && !data.phone) {
      return { success: false, error: "Email or phone is required" };
    }

    // Find or create the list
    // @ts-ignore
    let list = await prisma.nurtureList.findFirst({
      where: { slug, companyId: currentUser.companyId },
    });

    if (!list) {
      // @ts-ignore
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

    // @ts-ignore
    const existing = await prisma.nurtureSubscriber.findFirst({
      where: {
        nurtureListId: list.id,
        OR: conditions,
      },
    });

    if (existing) {
      return { success: false, error: "Subscriber already exists" };
    }

    // @ts-ignore
    await prisma.nurtureSubscriber.create({
      data: {
        nurtureListId: list.id,
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        sourceType: "MANUAL",
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Error adding subscriber:", error);
    return { success: false, error: "Failed to add subscriber" };
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

    const rules = await prisma.automationRule.findMany({
      where: {
        companyId: currentUser.companyId,
        actionType: "ADD_TO_NURTURE_LIST",
      },
      orderBy: { createdAt: "desc" },
    });

    // Filter by listId matching slug
    return rules.filter((rule) => {
      const actionConfig = rule.actionConfig as any;
      return actionConfig?.listId === slug;
    });
  } catch (error) {
    console.error("Error fetching nurture rules:", error);
    return [];
  }
}

// Update a subscriber - only updates channel preferences (emailActive, phoneActive)
export async function updateNurtureSubscriber(
  id: string,
  data: { emailActive?: boolean; phoneActive?: boolean }
) {
  try {
    const subscriberId = parseInt(id);
    if (isNaN(subscriberId)) {
      return { success: false, error: "Invalid subscriber ID" };
    }

    // @ts-ignore
    await prisma.nurtureSubscriber.update({
      where: { id: subscriberId },
      data: {
        emailActive: data.emailActive,
        phoneActive: data.phoneActive,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Error updating subscriber:", error);
    return { success: false, error: "Failed to update subscriber" };
  }
}

// Delete a subscriber
export async function deleteNurtureSubscriber(id: string) {
  try {
    const subscriberId = parseInt(id);
    if (isNaN(subscriberId)) {
      return { success: false, error: "Invalid subscriber ID" };
    }

    // @ts-ignore
    await prisma.nurtureSubscriber.delete({
      where: { id: subscriberId },
    });

    return { success: true };
  } catch (error) {
    console.error("Error deleting subscriber:", error);
    return { success: false, error: "Failed to delete subscriber" };
  }
}
