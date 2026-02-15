import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/** Creates a calendar event + copies global automation rules in a single transaction.
 *  Does NOT call getCurrentUser — caller must provide companyId/createdBy.
 *  This file intentionally has NO "use server" directive to prevent client invocation. */
export async function createCalendarEventForCompany(
  companyId: number,
  createdBy: number,
  data: {
    title: string;
    description?: string | null;
    startTime: Date;
    endTime: Date;
    color?: string;
  },
) {
  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.calendarEvent.create({
      data: {
        companyId,
        title: data.title,
        description: data.description,
        startTime: data.startTime,
        endTime: data.endTime,
        color: data.color,
      },
      select: {
        id: true,
        title: true,
        description: true,
        startTime: true,
        endTime: true,
        color: true,
      },
    });

    // Apply Global Automations within the same transaction
    const globalRules = await tx.automationRule.findMany({
      where: {
        companyId,
        triggerType: "EVENT_TIME",
        calendarEventId: null,
        isActive: true,
      },
      select: {
        name: true,
        triggerType: true,
        triggerConfig: true,
        actionType: true,
        actionConfig: true,
      },
      take: 200,
    });

    if (globalRules.length > 0) {
      await tx.automationRule.createMany({
        data: globalRules.map((rule) => ({
          companyId,
          name: rule.name,
          triggerType: rule.triggerType,
          triggerConfig: JSON.parse(JSON.stringify(rule.triggerConfig ?? {})),
          actionType: rule.actionType,
          actionConfig: JSON.parse(JSON.stringify(rule.actionConfig ?? {})),
          calendarEventId: created.id,
          createdBy,
          isActive: true,
        })),
      });
    }

    return created;
  });

  revalidatePath("/calendar");
  revalidatePath("/");

  return event;
}
