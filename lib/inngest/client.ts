import { Inngest } from "inngest";

// Create a client to send and receive events
export const inngest = new Inngest({
  id: "ofek-business-crm",
  // In production, set INNGEST_EVENT_KEY environment variable
});
