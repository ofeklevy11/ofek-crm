import { prisma } from "@/lib/prisma";

// Field labels in Hebrew
const fieldLabels: Record<string, string> = {
  status: "סטטוס",
  priority: "עדיפות",
  type: "סוג קריאה",
  assigneeId: "נציג מטפל",
  clientId: "לקוח",
  title: "כותרת",
  description: "תיאור",
};

// Status labels in Hebrew
const statusLabels: Record<string, string> = {
  OPEN: "פתוח",
  IN_PROGRESS: "בטיפול",
  WAITING: "ממתין",
  RESOLVED: "טופל",
  CLOSED: "סגור",
};

// Priority labels in Hebrew
const priorityLabels: Record<string, string> = {
  LOW: "נמוך",
  MEDIUM: "בינוני",
  HIGH: "גבוה",
  CRITICAL: "קריטי",
};

// Type labels in Hebrew
const typeLabels: Record<string, string> = {
  SERVICE: "שירות",
  COMPLAINT: "תלונה",
  RETENTION: "שימור",
  OTHER: "אחר",
};

// Get Hebrew label for a field value
function getValueLabel(fieldName: string, value: any): string | null {
  if (value === null || value === undefined) return null;

  switch (fieldName) {
    case "status":
      return statusLabels[value] || value;
    case "priority":
      return priorityLabels[value] || value;
    case "type":
      return typeLabels[value] || value;
    default:
      return String(value);
  }
}

export interface ChangeLogEntry {
  fieldName: string;
  fieldLabel: string;
  oldValue: string | null;
  newValue: string | null;
  oldLabel: string | null;
  newLabel: string | null;
}

// Create activity logs for ticket changes (server-side only utility — NOT a server action)
export async function createTicketActivityLogs(
  ticketId: number,
  userId: number,
  oldTicket: any,
  newData: any,
  userLookup: Map<number, string> | undefined, // For caching user names
  clientLookup: Map<number, string> | undefined, // For caching client names
  companyId: number, // SECURITY: Required for ownership verification
) {
  // SECURITY: Verify ticket belongs to the expected company
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, companyId },
    select: { id: true },
  });
  if (!ticket) throw new Error("Ticket not found or access denied");

  // Fields to track
  const trackableFields = [
    "status",
    "priority",
    "type",
    "assigneeId",
    "clientId",
    "title",
    "description",
  ];

  // Collect all user/client IDs needed for label resolution in a single pass
  const userIds = new Set<number>();
  const clientIds = new Set<number>();

  for (const field of trackableFields) {
    if (!(field in newData) || newData[field] === oldTicket[field]) continue;
    if (field === "assigneeId") {
      if (oldTicket[field]) userIds.add(oldTicket[field]);
      if (newData[field]) userIds.add(newData[field]);
    } else if (field === "clientId") {
      if (oldTicket[field]) clientIds.add(oldTicket[field]);
      if (newData[field]) clientIds.add(newData[field]);
    }
  }

  // Remove IDs already in the provided lookup maps
  if (userLookup) userIds.forEach((id) => { if (userLookup.has(id)) userIds.delete(id); });
  if (clientLookup) clientIds.forEach((id) => { if (clientLookup.has(id)) clientIds.delete(id); });

  // Batch-fetch missing names in parallel (max 2 queries instead of up to 4 sequential)
  const [userRows, clientRows] = await Promise.all([
    userIds.size > 0
      ? prisma.user.findMany({ where: { id: { in: [...userIds] }, companyId }, select: { id: true, name: true } })
      : [],
    clientIds.size > 0
      ? prisma.client.findMany({ where: { id: { in: [...clientIds] }, companyId }, select: { id: true, name: true } })
      : [],
  ]);

  // Merge fetched names into lookup maps
  const mergedUserLookup = new Map<number, string>(userLookup || []);
  for (const row of userRows) mergedUserLookup.set(row.id, row.name);

  const mergedClientLookup = new Map<number, string>(clientLookup || []);
  for (const row of clientRows) mergedClientLookup.set(row.id, row.name);

  const changes: ChangeLogEntry[] = [];

  for (const field of trackableFields) {
    const hasField = field in newData;
    const isDifferent = newData[field] !== oldTicket[field];

    if (hasField && isDifferent) {
      const oldValue = oldTicket[field];
      const newValue = newData[field];

      let oldLabel: string | null = null;
      let newLabel: string | null = null;

      if (field === "assigneeId") {
        oldLabel = oldValue ? (mergedUserLookup.get(oldValue) || "לא ידוע") : "לא משויך";
        newLabel = newValue ? (mergedUserLookup.get(newValue) || "לא ידוע") : "לא משויך";
      } else if (field === "clientId") {
        oldLabel = oldValue ? (mergedClientLookup.get(oldValue) || "לא ידוע") : "אין לקוח";
        newLabel = newValue ? (mergedClientLookup.get(newValue) || "לא ידוע") : "אין לקוח";
      } else {
        oldLabel = getValueLabel(field, oldValue);
        newLabel = getValueLabel(field, newValue);
      }

      changes.push({
        fieldName: field,
        fieldLabel: fieldLabels[field] || field,
        oldValue:
          oldValue !== null && oldValue !== undefined ? String(oldValue) : null,
        newValue:
          newValue !== null && newValue !== undefined ? String(newValue) : null,
        oldLabel,
        newLabel,
      });
    }
  }

  // Create all activity log entries
  if (changes.length > 0) {
    await prisma.ticketActivityLog.createMany({
      data: changes.map((change) => ({
        ticketId,
        userId,
        ...change,
      })),
    });
  }

  return changes;
}
