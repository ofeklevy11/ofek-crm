import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { processImportJob } from "@/lib/inngest/functions/import-job";

console.log("Inngest route loaded, functions:", [processImportJob.id]);

// This is the Inngest serve handler for Next.js App Router
// It handles both GET (dashboard) and POST (event handling) requests
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processImportJob],
  // Explicit path for dev server discovery
  servePath: "/api/inngest",
});
