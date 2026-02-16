import { inngest } from "../client";
import {
  executeSingleAction,
  type OnCompleteAction,
  type AutomationItem,
  type AutomationUser,
} from "@/lib/task-sheet-automations";
import { createLogger } from "@/lib/logger";

const log = createLogger("TaskSheetJobs");

/**
 * Background job for processing task sheet item automations.
 * Fired when a task sheet item is completed — replaces the synchronous inline call
 * in toggleTaskSheetItemCompletion() so the checkbox UX is never blocked.
 *
 * Each action runs in its own step.run() so that if one fails, only that
 * action is retried — not the entire batch.
 */
export const processTaskSheetItemCompletion = inngest.createFunction(
  {
    id: "process-task-sheet-item-completion",
    name: "Process Task Sheet Item Automations",
    retries: 3,
    timeouts: { finish: "30s" },
    concurrency: {
      limit: 3,
      key: "event.data.companyId",
    },
  },
  { event: "task-sheet/item-completed" },
  async ({ event, step }) => {
    const { actions, item, user } = event.data as {
      actions: OnCompleteAction[];
      item: AutomationItem;
      user: AutomationUser;
      companyId: number;
    };
    const eventCompanyId = (event.data as any).companyId as number;

    // BB13: Cross-validate companyId to prevent cross-tenant execution
    if (!eventCompanyId) {
      log.error("Missing companyId in event data");
      return { success: false, skipped: true, reason: "missing-companyId" };
    }
    if ((user as any).companyId && (user as any).companyId !== eventCompanyId) {
      log.error("companyId mismatch between event and user", { eventCompanyId, userCompanyId: (user as any).companyId });
      return { success: false, skipped: true, reason: "company-mismatch" };
    }
    if ((item as any).companyId && (item as any).companyId !== eventCompanyId) {
      log.error("companyId mismatch between event and item", { eventCompanyId, itemCompanyId: (item as any).companyId });
      return { success: false, skipped: true, reason: "company-mismatch" };
    }

    if (!actions || !Array.isArray(actions) || actions.length === 0) {
      return { success: true, skipped: true };
    }

    log.info("Executing automations for item", { actionCount: actions.length, itemId: item.id });

    // TT: Track failures so we can return accurate success status
    let failedCount = 0;

    for (const [i, action] of actions.entries()) {
      try {
        await step.run(`action-${i}-${action.actionType}`, async () => {
          await executeSingleAction(action, item, user);
        });
      } catch (actionError) {
        failedCount++;
        log.error("Action failed after retries", { actionIndex: i, actionType: action.actionType, itemId: item.id, error: String(actionError) });
      }
    }

    // Trigger background analytics refresh (debounced per company)
    if (eventCompanyId) {
      try {
        await inngest.send({
          id: `analytics-refresh-${eventCompanyId}-${Math.floor(Date.now() / 60000)}`,
          name: "analytics/refresh-company",
          data: { companyId: eventCompanyId },
        });
      } catch (err) {
        log.error("Failed to trigger analytics refresh", { error: String(err) });
      }
    }

    return {
      success: failedCount === 0,
      itemId: item.id,
      actionsCount: actions.length,
      failedCount,
    };
  },
);
