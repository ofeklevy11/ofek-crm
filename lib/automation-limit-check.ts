import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  getAutomationCategoryLimit,
  getCategoryForTriggerType,
  getTriggerTypesForCategory,
  MAX_RULES_PER_COMPANY,
  type AutomationCategory,
} from "@/lib/plan-limits";

type CreateResult =
  | { allowed: true; rule: any }
  | { allowed: false; error: string };

/**
 * Atomically check the per-category plan limit and create the automation rule.
 * Uses a Serializable transaction to prevent race conditions.
 */
export async function checkCategoryLimitAndCreate(
  companyId: number,
  userTier: string,
  triggerType: string,
  createData: Prisma.AutomationRuleUncheckedCreateInput,
): Promise<CreateResult> {
  const limit = getAutomationCategoryLimit(userTier);

  // Super users skip category count — only check global safety cap
  if (limit === Infinity) {
    const totalCount = await prisma.automationRule.count({
      where: { companyId },
    });
    if (totalCount >= MAX_RULES_PER_COMPANY) {
      return { allowed: false, error: `מקסימום ${MAX_RULES_PER_COMPANY} אוטומציות לחברה` };
    }
    const rule = await prisma.automationRule.create({ data: createData });
    return { allowed: true, rule };
  }

  const category = getCategoryForTriggerType(triggerType);
  const categoryTriggers = getTriggerTypesForCategory(category);

  // Serializable transaction: count + create atomically
  try {
    const rule = await prisma.$transaction(async (tx) => {
      const [categoryCount, totalCount] = await Promise.all([
        tx.automationRule.count({
          where: {
            companyId,
            triggerType: { in: categoryTriggers as any },
          },
        }),
        tx.automationRule.count({
          where: { companyId },
        }),
      ]);

      if (categoryCount >= limit) {
        throw new LimitExceededError(
          `הגעת למגבלת האוטומציות (${limit}) בקטגוריה זו. שדרג את התוכנית להוספת אוטומציות נוספות.`
        );
      }

      if (totalCount >= MAX_RULES_PER_COMPANY) {
        throw new LimitExceededError(
          `מקסימום ${MAX_RULES_PER_COMPANY} אוטומציות לחברה`
        );
      }

      return tx.automationRule.create({ data: createData });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    return { allowed: true, rule };
  } catch (error) {
    if (error instanceof LimitExceededError) {
      return { allowed: false, error: error.message };
    }
    throw error;
  }
}

class LimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LimitExceededError";
  }
}

/**
 * Count automations in a specific category for a company.
 * Used by frontend to display usage counters.
 */
export async function countCategoryAutomations(
  companyId: number,
  category: AutomationCategory,
): Promise<number> {
  const categoryTriggers = getTriggerTypesForCategory(category);
  return prisma.automationRule.count({
    where: {
      companyId,
      triggerType: { in: categoryTriggers as any },
    },
  });
}
