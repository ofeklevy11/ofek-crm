"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";

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

interface ChangeLogEntry {
  fieldName: string;
  fieldLabel: string;
  oldValue: string | null;
  newValue: string | null;
  oldLabel: string | null;
  newLabel: string | null;
}

// Create activity logs for ticket changes
export async function createTicketActivityLogs(
  ticketId: number,
  userId: number,
  oldTicket: any,
  newData: any,
  userLookup: Map<number, string> | undefined, // For caching user names
  clientLookup: Map<number, string> | undefined, // For caching client names
  companyId: number, // SECURITY: Required for ownership verification (Issue B)
) {
  // SECURITY: Verify ticket belongs to the expected company
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, companyId },
    select: { id: true },
  });
  if (!ticket) throw new Error("Ticket not found or access denied");

  const changes: ChangeLogEntry[] = [];

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

  for (const field of trackableFields) {
    // Check if field exists in newData (including null values) and is different from old
    const hasField = field in newData;
    const isDifferent = newData[field] !== oldTicket[field];

    if (hasField && isDifferent) {
      const oldValue = oldTicket[field];
      const newValue = newData[field];

      let oldLabel: string | null = null;
      let newLabel: string | null = null;

      // Special handling for relation fields (assignee and client)
      if (field === "assigneeId") {
        if (oldValue && userLookup?.has(oldValue)) {
          oldLabel = userLookup.get(oldValue) || null;
        } else if (oldValue) {
          const user = await prisma.user.findUnique({
            where: { id: oldValue },
            select: { name: true },
          });
          oldLabel = user?.name || "לא ידוע";
        }

        if (newValue && userLookup?.has(newValue)) {
          newLabel = userLookup.get(newValue) || null;
        } else if (newValue) {
          const user = await prisma.user.findUnique({
            where: { id: newValue },
            select: { name: true },
          });
          newLabel = user?.name || "לא ידוע";
        }

        if (!oldValue) oldLabel = "לא משויך";
        if (!newValue) newLabel = "לא משויך";
      } else if (field === "clientId") {
        if (oldValue && clientLookup?.has(oldValue)) {
          oldLabel = clientLookup.get(oldValue) || null;
        } else if (oldValue) {
          const client = await prisma.client.findUnique({
            where: { id: oldValue },
            select: { name: true },
          });
          oldLabel = client?.name || "לא ידוע";
        }

        if (newValue && clientLookup?.has(newValue)) {
          newLabel = clientLookup.get(newValue) || null;
        } else if (newValue) {
          const client = await prisma.client.findUnique({
            where: { id: newValue },
            select: { name: true },
          });
          newLabel = client?.name || "לא ידוע";
        }

        if (!oldValue) oldLabel = "אין לקוח";
        if (!newValue) newLabel = "אין לקוח";
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

// Get activity logs for a ticket
export async function getTicketActivityLogs(ticketId: number) {
  const user = await getCurrentUser();
  if (!user) return [];

  // First verify the ticket belongs to the user's company
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, companyId: user.companyId },
    select: { id: true },
  });

  if (!ticket) {
    return [];
  }

  return await prisma.ticketActivityLog.findMany({
    where: { ticketId },
    include: {
      user: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

// Delete an activity log (admin only)
export async function deleteTicketActivityLog(logId: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Only admin can delete activity logs
  if (user.role !== "admin") {
    throw new Error("רק מנהל יכול למחוק לוגים");
  }

  // Find the log to verify it belongs to the user's company
  const log = await prisma.ticketActivityLog.findFirst({
    where: { id: logId, ticket: { companyId: user.companyId } },
  });

  if (!log) {
    throw new Error("Unauthorized");
  }

  // SECURITY: Scope delete via ticket companyId join to prevent TOCTOU
  await prisma.ticketActivityLog.deleteMany({
    where: { id: logId, ticket: { companyId: user.companyId } },
  });

  revalidatePath("/service");
  revalidatePath("/service/archive");
}
