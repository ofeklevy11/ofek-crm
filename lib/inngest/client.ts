import { Inngest, EventSchemas } from "inngest";
import { metricsMiddleware } from "./metrics-middleware";
import type { Events } from "./events";

// Create a client to send and receive events
// EventSchemas enforce companyId on all tenant-scoped events at compile time
export const inngest = new Inngest({
  id: "ofek-business-crm",
  middleware: [metricsMiddleware],
  schemas: new EventSchemas().fromRecord<Events>(),
  // In production, set INNGEST_EVENT_KEY environment variable
});
