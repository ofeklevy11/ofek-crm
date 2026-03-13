import { inngest } from "../client";
import { NonRetriableError } from "inngest";
import { createLogger } from "@/lib/logger";

const log = createLogger("EmailJobs");

// ─── Automation Send Email Job ──────────────────────────────────

export const sendEmailAutomationJob = inngest.createFunction(
  {
    id: "automation-send-email",
    name: "Automation Send Email",
    retries: 3,
    timeouts: { finish: "60s" },
    concurrency: [{ limit: 5, key: "event.data.companyId" }],
  },
  { event: "automation/send-email" },
  async ({ event, step }) => {
    const { companyId, to, subject, body, delay } = event.data;

    // Optional delay for automation scheduling
    if (delay && delay > 0) {
      await step.sleep("automation-delay", `${Math.min(delay, 3600)}s`);
    }

    // Basic email validation
    if (!to || !to.includes("@")) {
      log.warn("Invalid email in automation", { companyId, to });
      throw new NonRetriableError(`Invalid email address: ${to}`);
    }

    await step.run("send-email", async () => {
      const { sendAutomationEmail } = await import("@/lib/email");
      await sendAutomationEmail(to, subject, body);
      log.info("Automation email sent", { companyId, to: to.replace(/(.{3}).*(@.*)/, "$1***$2") });
    });
  },
);
