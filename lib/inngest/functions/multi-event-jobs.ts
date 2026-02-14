import { inngest } from "../client";

/**
 * Background job for multi-event duration calculations.
 *
 * Offloads the expensive recursive relation lookups, audit-log scanning,
 * and event-chain matching out of the request path.
 *
 * Triggered by: "automation/multi-event-duration"
 */
export const processMultiEventDuration = inngest.createFunction(
  {
    id: "process-multi-event-duration",
    name: "Process Multi-Event Duration",
    retries: 3,
    timeouts: { finish: "60s" },
    concurrency: [
      {
        limit: 3,
        key: "event.data.companyId",
      },
      {
        limit: 15,
      },
    ],
  },
  { event: "automation/multi-event-duration" },
  async ({ event, step }) => {
    const { tableId, recordId, companyId } = event.data;

    // Step 1 — fetch oldData/newData fresh from DB instead of receiving via payload
    const recordSnapshot = await step.run("fetch-record-data", async () => {
      const { prisma } = await import("@/lib/prisma");

      const record = await prisma.record.findFirst({
        where: { id: recordId, companyId },
        select: { data: true },
      });

      // Fix E: guard against deleted records
      if (!record) {
        return { skipped: true as const, oldData: {}, newData: {} };
      }

      // Get the most recent audit log for this record to reconstruct oldData
      const latestLog = await prisma.auditLog.findFirst({
        where: { recordId, companyId, action: "UPDATE" },
        orderBy: { timestamp: "desc" },
      });

      const newData = (record.data as Record<string, unknown>) || {};
      // Fix C (improved): reconstruct oldData by reverting changed keys to their previous values.
      // diffJson stores NEW values, so for each changed key we scan backwards through audit logs
      // to find the most recent log that touched that key. This handles non-adjacent changes correctly.
      let oldData: Record<string, unknown> = { ...newData };
      if (latestLog?.diffJson && typeof latestLog.diffJson === "object") {
        const changedKeys = Object.keys(latestLog.diffJson as Record<string, unknown>);

        // Fetch previous logs to scan for old values of each changed key
        // Increased from 50 to 200 to handle rarely-changed fields
        const previousLogs = await prisma.auditLog.findMany({
          where: {
            recordId,
            companyId,
            action: { in: ["UPDATE", "CREATE"] },
            timestamp: { lt: latestLog.timestamp },
          },
          orderBy: { timestamp: "desc" },
          take: 200,
          select: { diffJson: true },
        });

        for (const key of changedKeys) {
          let foundOldValue = false;
          // Walk backwards through logs to find the most recent one that touched this key
          for (const prevLog of previousLogs) {
            const prevDiff = prevLog.diffJson as Record<string, unknown> | null;
            if (prevDiff && typeof prevDiff === "object" && key in prevDiff) {
              oldData[key] = prevDiff[key];
              foundOldValue = true;
              break;
            }
          }
          if (!foundOldValue) {
            // No previous log ever set this key — field was set for the first time
            delete oldData[key];
          }
        }
      }

      return { skipped: false as const, oldData, newData };
    });

    // Fix E: skip processing if record was deleted (with logging for debuggability)
    if (recordSnapshot.skipped) {
      console.log(`[Multi-Event] Skipping record ${recordId} — not found (likely deleted)`);
      return { recordId, skipped: true };
    }

    // Issue M: Step 2 — find matching rules + shared data (lightweight step)
    const matchResult = await step.run("find-matching-rules", async () => {
      const { findMatchingRulesAndSharedData } = await import(
        "@/app/actions/multi-event-automations"
      );
      return findMatchingRulesAndSharedData(
        tableId,
        recordId,
        recordSnapshot.oldData,
        recordSnapshot.newData,
        companyId,
      );
    });

    // Issue Q: Guard against null shared data instead of non-null assertion
    if (!matchResult.shared) {
      return { recordId, skipped: true, reason: "no-shared-data" };
    }

    // NN: Pre-fetch audit logs once for all rules (instead of N separate queries)
    // III-2: Guard against exceeding Inngest's 4MB step output limit
    const prefetchedLogsRaw = await step.run("fetch-audit-logs", async () => {
      const { fetchSharedAuditLogs } = await import(
        "@/app/actions/multi-event-automations"
      );
      const logs = await fetchSharedAuditLogs(matchResult.shared!);

      // BB6: Use byte length (not char length) — Hebrew text is 2-3x larger in bytes
      const serialized = JSON.stringify(logs);
      const byteSize = Buffer.byteLength(serialized, "utf8");
      if (byteSize > 3_500_000) {
        console.warn(
          `[Multi-Event] Pre-fetched audit logs too large (${(byteSize / 1_000_000).toFixed(1)}MB), falling back to per-rule fetching`,
        );
        return null;
      }

      return logs;
    });
    const prefetchedLogs = prefetchedLogsRaw ?? undefined;

    // Issue M: Step 3 — calculate each rule in its own step to avoid timeout
    const allPendingActions: any[] = [];

    for (let i = 0; i < matchResult.matchingRules.length; i++) {
      const { ruleId, eventChain, ruleSnapshot } = matchResult.matchingRules[i];

      const ruleResult = await step.run(`calculate-rule-${ruleId}`, async () => {
        const { calculateSingleRule } = await import(
          "@/app/actions/multi-event-automations"
        );
        return calculateSingleRule(
          tableId,
          recordId,
          ruleId,
          eventChain,
          recordSnapshot.oldData,
          matchResult.resolvedCompanyId,
          matchResult.shared!,
          ruleSnapshot,
          prefetchedLogs,
        );
      });

      if (ruleResult.pendingActions?.length) {
        allPendingActions.push(...ruleResult.pendingActions);
      }
    }

    const results = { success: true, pendingActions: allPendingActions };

    // Fix A: Execute delayed WhatsApp actions with per-action step.sleep
    if (results.pendingActions && results.pendingActions.length > 0) {
      // Sort by delay so shorter delays execute first
      const sorted = [...results.pendingActions].sort((a: any, b: any) => a.delay - b.delay);
      let elapsedDelay = 0;

      for (let i = 0; i < sorted.length; i++) {
        const action = sorted[i] as any;
        const neededSleep = action.delay - elapsedDelay;

        if (neededSleep > 0) {
          await step.sleep(`whatsapp-delay-${i}`, `${neededSleep}s`);
          elapsedDelay = action.delay;
        } else if (i > 0) {
          // Inter-message gap to avoid Green API rate limits
          await step.sleep(`whatsapp-gap-${i}`, "2s");
          elapsedDelay += 2;
        }

        // Dispatch to dedicated Inngest WhatsApp job with retry + rate limiting
        await step.run(`enqueue-delayed-wa-${i}`, async () => {
          const ruleSnapshot = action.ruleSnapshot;
          const config = ruleSnapshot.actionConfig || {};
          const contextData = action.contextData || {};

          const phoneColumnId = config.phoneColumnId;
          let phone = "";
          if (phoneColumnId?.startsWith("manual:")) {
            phone = phoneColumnId.replace("manual:", "");
          } else if (phoneColumnId) {
            phone = contextData[phoneColumnId] || "";
          }
          let waContent = config.content || "";
          for (const key in contextData) {
            waContent = waContent.split(`{${key}}`).join(String(contextData[key] || ""));
          }

          if (phone) {
            await inngest.send({
              id: `wa-delayed-${action.companyId}-${phone}-${ruleSnapshot.id}-${Math.floor(Date.now() / 5000)}`,
              name: "automation/send-whatsapp",
              data: {
                companyId: action.companyId,
                phone: String(phone),
                content: waContent,
                messageType: config.messageType,
                mediaFileId: config.mediaFileId,
              },
            });
            console.log(`[Multi-Event] Delayed WhatsApp job enqueued after ${action.delay}s delay`);
          } else {
            console.error(`[Multi-Event] Delayed WhatsApp: No phone resolved from ${phoneColumnId}`);
          }
        });
      }
    }

    // Step 3 — refresh analytics for the company (debounced by Inngest)
    if (companyId) {
      await step.run("trigger-analytics-refresh", async () => {
        await inngest.send({
          id: `analytics-refresh-${companyId}-${Math.floor(Date.now() / 60000)}`,
          name: "analytics/refresh-company",
          data: { companyId },
        });
      });
    }

    return { recordId, ...results };
  },
);
