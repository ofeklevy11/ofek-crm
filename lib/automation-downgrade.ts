import { prisma } from "@/lib/prisma";
import {
  getAutomationCategoryLimit,
  getTriggerTypesForCategory,
  type AutomationCategory,
} from "@/lib/plan-limits";

/**
 * Deactivate excess automations when a company downgrades their plan.
 * Deactivates the newest rules (by createdAt DESC) that exceed the new limit.
 *
 * IMPORTANT: Call this whenever `isPremium` is updated on a user/company.
 * Since there is no Stripe integration, this must be called manually when the plan changes.
 */
export async function enforceAutomationLimitsOnDowngrade(
  companyId: number,
  newTier: string,
): Promise<{ deactivated: { category: AutomationCategory; count: number }[] }> {
  const limit = getAutomationCategoryLimit(newTier);

  // Super tier has no limit — nothing to enforce
  if (limit === Infinity) {
    return { deactivated: [] };
  }

  const categories: AutomationCategory[] = ["general", "meeting", "event"];
  const deactivated: { category: AutomationCategory; count: number }[] = [];

  for (const category of categories) {
    const triggerTypes = getTriggerTypesForCategory(category);

    const count = await prisma.automationRule.count({
      where: { companyId, triggerType: { in: triggerTypes as any } },
    });

    if (count <= limit) continue;

    const excess = count - limit;

    // Find the newest rules that exceed the limit
    const excessRules = await prisma.automationRule.findMany({
      where: { companyId, triggerType: { in: triggerTypes as any } },
      orderBy: { createdAt: "desc" },
      take: excess,
      select: { id: true },
    });

    if (excessRules.length > 0) {
      await prisma.automationRule.updateMany({
        where: { id: { in: excessRules.map((r) => r.id) }, companyId },
        data: { isActive: false },
      });

      deactivated.push({ category, count: excessRules.length });
    }
  }

  return { deactivated };
}
