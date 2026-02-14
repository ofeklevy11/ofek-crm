import { inngest } from "../client";

/**
 * Background job for processing automations on new records.
 * Fired when a record is created — replaces the synchronous inline call.
 */
export const processNewRecordAutomation = inngest.createFunction(
  {
    id: "process-new-record-automation",
    name: "Process New Record Automation",
    retries: 3,
    timeouts: { finish: "60s" },
    concurrency: {
      limit: 5,
      key: "event.data.companyId",
    },
  },
  { event: "automation/new-record" },
  async ({ event }) => {
    const { tableId, tableName, recordId, companyId } = event.data;
    const { processNewRecordTrigger } = await import(
      "@/app/actions/automations"
    );
    await processNewRecordTrigger(tableId, tableName, recordId, companyId);

    // Trigger background analytics refresh (debounced per company)
    if (companyId) {
      try {
        await inngest.send({ id: `analytics-refresh-${companyId}-${Math.floor(Date.now() / 60000)}`, name: "analytics/refresh-company", data: { companyId } });
      } catch (err) {
        console.warn("[automation] Failed to trigger analytics refresh:", err);
      }
    }

    return { success: true, recordId };
  },
);

/**
 * Background job for processing automations on record updates.
 * Fired when a record is updated — replaces the synchronous inline call.
 */
export const processRecordUpdateAutomation = inngest.createFunction(
  {
    id: "process-record-update-automation",
    name: "Process Record Update Automation",
    retries: 3,
    timeouts: { finish: "60s" },
    concurrency: {
      limit: 5,
      key: "event.data.companyId",
    },
  },
  { event: "automation/record-update" },
  async ({ event }) => {
    const { tableId, recordId, oldData, newData, companyId } = event.data;
    const { processRecordUpdate } = await import("@/app/actions/automations");
    await processRecordUpdate(tableId, recordId, oldData, newData, companyId);

    // Trigger background analytics refresh (debounced per company)
    if (companyId) {
      try {
        await inngest.send({ id: `analytics-refresh-${companyId}-${Math.floor(Date.now() / 60000)}`, name: "analytics/refresh-company", data: { companyId } });
      } catch (err) {
        console.warn("[automation] Failed to trigger analytics refresh:", err);
      }
    }

    return { success: true, recordId };
  },
);

/**
 * Background job for processing automations on task status changes.
 * Fired when a task's status is updated — replaces the synchronous inline call.
 */
export const processTaskStatusAutomation = inngest.createFunction(
  {
    id: "process-task-status-automation",
    name: "Process Task Status Automation",
    retries: 3,
    timeouts: { finish: "60s" },
    concurrency: {
      limit: 5,
      key: "event.data.companyId",
    },
  },
  { event: "automation/task-status-change" },
  async ({ event }) => {
    const { taskId, taskTitle, fromStatus, toStatus, companyId } = event.data;
    const { processTaskStatusChange } = await import(
      "@/app/actions/automations"
    );
    await processTaskStatusChange(taskId, taskTitle, fromStatus, toStatus, companyId);

    // Trigger background analytics refresh (debounced per company)
    if (companyId) {
      try {
        await inngest.send({ id: `analytics-refresh-${companyId}-${Math.floor(Date.now() / 60000)}`, name: "analytics/refresh-company", data: { companyId } });
      } catch (err) {
        console.warn("[automation] Failed to trigger analytics refresh:", err);
      }
    }

    return { success: true, taskId };
  },
);

/**
 * Background job for processing automations on direct dial actions.
 * Fired when a user dials a record — replaces the synchronous inline call.
 */
export const processDirectDialAutomation = inngest.createFunction(
  {
    id: "process-direct-dial-automation",
    name: "Process Direct Dial Automation",
    retries: 3,
    timeouts: { finish: "60s" },
    concurrency: {
      limit: 5,
      key: "event.data.companyId",
    },
  },
  { event: "automation/direct-dial" },
  async ({ event }) => {
    const { tableId, recordId, companyId, previousDialedAt } = event.data;
    const { processDirectDialTrigger } = await import(
      "@/app/actions/automations"
    );
    await processDirectDialTrigger(tableId, recordId, companyId, previousDialedAt);

    // Trigger background analytics refresh (debounced per company)
    if (companyId) {
      try {
        await inngest.send({ id: `analytics-refresh-${companyId}-${Math.floor(Date.now() / 60000)}`, name: "analytics/refresh-company", data: { companyId } });
      } catch (err) {
        console.warn("[automation] Failed to trigger analytics refresh:", err);
      }
    }

    return { success: true, recordId };
  },
);

/**
 * P129: Background job for processing time-based automations per company.
 * Offloaded from cron route to avoid Vercel timeout on sequential company processing.
 */
export const processTimeBasedAutomationJob = inngest.createFunction(
  {
    id: "process-time-based-automation",
    name: "Process Time-Based Automation",
    retries: 2,
    timeouts: { finish: "60s" },
    concurrency: {
      limit: 3,
      key: "event.data.companyId",
    },
  },
  { event: "automation/time-based" },
  async ({ event }) => {
    const { companyId } = event.data;
    const { processTimeBasedAutomations } = await import(
      "@/app/actions/automations"
    );
    await processTimeBasedAutomations(companyId);
    return { success: true, companyId };
  },
);

/**
 * Background job for processing event-based (calendar) automations per company.
 * Offloaded from cron route to avoid Vercel timeout.
 */
export const processEventAutomationJob = inngest.createFunction(
  {
    id: "process-event-automation",
    name: "Process Event-Based Automation",
    retries: 2,
    timeouts: { finish: "60s" },
    concurrency: {
      limit: 3,
      key: "event.data.companyId",
    },
  },
  { event: "automation/event-based" },
  async ({ event }) => {
    const { companyId } = event.data;
    const { processEventAutomations } = await import(
      "@/app/actions/event-automations"
    );
    await processEventAutomations(companyId);
    return { success: true, companyId };
  },
);
