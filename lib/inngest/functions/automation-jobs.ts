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
    concurrency: {
      limit: 5,
      key: "event.data.companyId",
    },
  },
  { event: "automation/new-record" },
  async ({ event }) => {
    const { tableId, tableName, recordId } = event.data;
    const { processNewRecordTrigger } = await import(
      "@/app/actions/automations"
    );
    await processNewRecordTrigger(tableId, tableName, recordId);
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
    concurrency: {
      limit: 5,
      key: "event.data.companyId",
    },
  },
  { event: "automation/record-update" },
  async ({ event }) => {
    const { tableId, recordId, oldData, newData } = event.data;
    const { processRecordUpdate } = await import("@/app/actions/automations");
    await processRecordUpdate(tableId, recordId, oldData, newData);
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
    concurrency: {
      limit: 5,
      key: "event.data.companyId",
    },
  },
  { event: "automation/task-status-change" },
  async ({ event }) => {
    const { taskId, taskTitle, fromStatus, toStatus } = event.data;
    const { processTaskStatusChange } = await import(
      "@/app/actions/automations"
    );
    await processTaskStatusChange(taskId, taskTitle, fromStatus, toStatus);
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
    concurrency: {
      limit: 5,
      key: "event.data.companyId",
    },
  },
  { event: "automation/direct-dial" },
  async ({ event }) => {
    const { tableId, recordId, companyId } = event.data;
    const { processDirectDialTrigger } = await import(
      "@/app/actions/automations"
    );
    await processDirectDialTrigger(tableId, recordId, companyId);
    return { success: true, recordId };
  },
);
