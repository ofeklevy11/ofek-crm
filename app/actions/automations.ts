"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { sendNotification } from "./notifications";

export async function getAutomationRules() {
  try {
    const rules = await prisma.automationRule.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        creator: {
          select: { name: true },
        },
      },
    });
    return { success: true, data: rules };
  } catch (error) {
    console.error("Error fetching automation rules:", error);
    return { success: false, error: "Failed to fetch automation rules" };
  }
}

export async function createAutomationRule(data: {
  name: string;
  triggerType: string;
  triggerConfig: any;
  actionType: string;
  actionConfig: any;
  createdBy: number;
}) {
  try {
    const rule = await prisma.automationRule.create({
      data: {
        name: data.name,
        triggerType: data.triggerType,
        triggerConfig: data.triggerConfig,
        actionType: data.actionType,
        actionConfig: data.actionConfig,
        createdBy: data.createdBy,
      },
    });
    revalidatePath("/automations");
    return { success: true, data: rule };
  } catch (error) {
    console.error("Error creating automation rule:", error);
    return { success: false, error: "Failed to create automation rule" };
  }
}

export async function updateAutomationRule(
  id: number,
  data: {
    name: string;
    triggerType: string;
    triggerConfig: any;
    actionType: string;
    actionConfig: any;
  }
) {
  try {
    const rule = await prisma.automationRule.update({
      where: { id },
      data: {
        name: data.name,
        triggerType: data.triggerType,
        triggerConfig: data.triggerConfig,
        actionType: data.actionType,
        actionConfig: data.actionConfig,
      },
    });
    revalidatePath("/automations");
    return { success: true, data: rule };
  } catch (error) {
    console.error("Error updating automation rule:", error);
    return { success: false, error: "Failed to update automation rule" };
  }
}

export async function deleteAutomationRule(id: number) {
  try {
    await prisma.automationRule.delete({
      where: { id },
    });
    revalidatePath("/automations");
    return { success: true };
  } catch (error) {
    console.error("Error deleting automation rule:", error);
    return { success: false, error: "Failed to delete automation rule" };
  }
}

export async function toggleAutomationRule(id: number, isActive: boolean) {
  try {
    await prisma.automationRule.update({
      where: { id },
      data: { isActive },
    });
    revalidatePath("/automations");
    return { success: true };
  } catch (error) {
    console.error("Error toggling automation rule:", error);
    return { success: false, error: "Failed to toggle automation rule" };
  }
}

// Ensure triggerConfig and actionConfig types are safely handled
interface TriggerConfig {
  fromStatus?: string;
  toStatus?: string;
  [key: string]: any;
}

interface ActionConfig {
  recipientId?: number;
  messageTemplate?: string;
  titleTemplate?: string;
  [key: string]: any;
}

export async function processTaskStatusChange(
  taskTitle: string,
  fromStatus: string,
  toStatus: string
) {
  try {
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        triggerType: "TASK_STATUS_CHANGE",
      },
    });

    for (const rule of rules) {
      const triggerConfig = rule.triggerConfig as TriggerConfig;

      // Check if rule matches the status change
      // If config has fromStatus, it must match. If null/undefined, it applies to any.
      if (triggerConfig.fromStatus && triggerConfig.fromStatus !== fromStatus)
        continue;
      if (triggerConfig.toStatus && triggerConfig.toStatus !== toStatus)
        continue;

      // Execute Action
      if (rule.actionType === "SEND_NOTIFICATION") {
        const actionConfig = rule.actionConfig as ActionConfig;
        if (actionConfig.recipientId) {
          await sendNotification({
            userId: actionConfig.recipientId,
            title: actionConfig.titleTemplate || "Task Updated",
            message: (
              actionConfig.messageTemplate ||
              "Task {taskTitle} moved to {toStatus}"
            )
              .replace("{taskTitle}", taskTitle)
              .replace("{fromStatus}", fromStatus)
              .replace("{toStatus}", toStatus),
            link: "/tasks",
          });
        }
      }
    }
  } catch (error) {
    console.error("Error processing task status automations:", error);
    // Don't throw, just log, so we don't block the main flow
  }
}

export async function processNewRecordTrigger(
  tableId: number,
  tableName: string,
  recordId: number
) {
  try {
    const rules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        triggerType: "NEW_RECORD",
      },
    });

    for (const rule of rules) {
      const triggerConfig = rule.triggerConfig as TriggerConfig;

      // Check if rule matches the table
      if (triggerConfig.tableId && parseInt(triggerConfig.tableId) !== tableId)
        continue;

      // Execute Action
      if (rule.actionType === "SEND_NOTIFICATION") {
        const actionConfig = rule.actionConfig as ActionConfig;
        if (actionConfig.recipientId) {
          await sendNotification({
            userId: actionConfig.recipientId,
            title: actionConfig.titleTemplate || "New Record Created",
            message: (
              actionConfig.messageTemplate ||
              "New record created in table {tableName}"
            ).replace("{tableName}", tableName),
            link: `/tables/${tableId}`,
          });
        }
      }
    }
  } catch (error) {
    console.error("Error processing new record automations:", error);
  }
}
