import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { processImportJob } from "@/lib/inngest/functions/import-job";
import {
  processNewRecordAutomation,
  processRecordUpdateAutomation,
  processTaskStatusAutomation,
  processDirectDialAutomation,
} from "@/lib/inngest/functions/automation-jobs";
import {
  slaScan,
  slaBreachHandler,
} from "@/lib/inngest/functions/sla-jobs";
import { processFinanceSyncJob } from "@/lib/inngest/functions/finance-sync-job";

const functions = [
  processImportJob,
  processNewRecordAutomation,
  processRecordUpdateAutomation,
  processTaskStatusAutomation,
  processDirectDialAutomation,
  slaScan,
  slaBreachHandler,
  processFinanceSyncJob,
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
