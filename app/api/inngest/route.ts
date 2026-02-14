import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { processImportJob } from "@/lib/inngest/functions/import-job";
import {
  processNewRecordAutomation,
  processRecordUpdateAutomation,
  processTaskStatusAutomation,
  processDirectDialAutomation,
  processTimeBasedAutomationJob,
  processEventAutomationJob,
} from "@/lib/inngest/functions/automation-jobs";
import {
  slaScan,
  slaBreachHandler,
} from "@/lib/inngest/functions/sla-jobs";
import { processFinanceSyncJob } from "@/lib/inngest/functions/finance-sync-job";
import {
  refreshCompanyAnalytics,
  refreshAnalyticsItemJob,
} from "@/lib/inngest/functions/analytics-jobs";
import { processMultiEventDuration } from "@/lib/inngest/functions/multi-event-jobs";
import { processTaskSheetItemCompletion } from "@/lib/inngest/functions/task-sheet-jobs";
import { processBulkDeleteRecords } from "@/lib/inngest/functions/bulk-record-jobs";
import {
  sendWhatsAppJob,
  sendWebhookJob,
} from "@/lib/inngest/functions/webhook-whatsapp-jobs";
import { broadcastNotifications, cleanupOldNotifications } from "@/lib/inngest/functions/notification-jobs";
import { generateQuotePdf } from "@/lib/inngest/functions/pdf-jobs";
import {
  processTicketNotificationJob,
  processTicketStatusChangeJob,
  processTicketActivityLogJob,
} from "@/lib/inngest/functions/ticket-jobs";
import {
  refreshDashboardWidgets,
  refreshDashboardGoals,
} from "@/lib/inngest/functions/dashboard-jobs";
import { processAIGeneration } from "@/lib/inngest/functions/ai-generation-jobs";
import { processFixedExpensesCron } from "@/lib/inngest/functions/fixed-expense-jobs";

const functions = [
  processImportJob,
  processNewRecordAutomation,
  processRecordUpdateAutomation,
  processTaskStatusAutomation,
  processDirectDialAutomation,
  processTimeBasedAutomationJob,
  processEventAutomationJob,
  slaScan,
  slaBreachHandler,
  processFinanceSyncJob,
  refreshCompanyAnalytics,
  refreshAnalyticsItemJob,
  processMultiEventDuration,
  processTaskSheetItemCompletion,
  processBulkDeleteRecords,
  sendWhatsAppJob,
  sendWebhookJob,
  broadcastNotifications,
  cleanupOldNotifications,
  processTicketNotificationJob,
  processTicketStatusChangeJob,
  processTicketActivityLogJob,
  refreshDashboardWidgets,
  refreshDashboardGoals,
  generateQuotePdf,
  processAIGeneration,
  processFixedExpensesCron,
];

console.log(
  "Inngest route loaded, functions:",
  functions.map((f) => f.id),
);

// This is the Inngest serve handler for Next.js App Router
// It handles both GET (dashboard) and POST (event handling) requests
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
  // Explicit path for dev server discovery
  servePath: "/api/inngest",
});
