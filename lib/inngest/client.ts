import { Inngest } from "inngest";
import { metricsMiddleware } from "./metrics-middleware";

// Create a client to send and receive events
export const inngest = new Inngest({
  id: "ofek-business-crm",
  middleware: [metricsMiddleware],
  // In production, set INNGEST_EVENT_KEY environment variable
});
