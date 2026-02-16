"use server";

import { prisma as db } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  createProductSchema,
  updateProductSchema,
  MAX_PRODUCTS_PER_COMPANY,
} from "@/lib/security/product-validation";
import { createLogger } from "@/lib/logger";

const log = createLogger("Products");

// ── Helpers ────────────────────────────────────────────────────────────

/** Authenticate + authorize + rate-limit (returns user or throws) */
async function requireProductUser(rateLimitKey: "productRead" | "productMutation") {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user, "canViewServices")) throw new Error("Forbidden");

  const limited = await checkActionRateLimit(
    String(user.id),
    RATE_LIMITS[rateLimitKey],
  ).catch(() => false); // Redis down → allow
  if (limited) throw new Error("Rate limit exceeded");

  return user;
}

/** Sanitize Prisma errors so internals never leak to the client */
function sanitizeError(e: unknown): never {
  const err = e as any;
  if (err?.code === "P2003") throw new Error("Cannot delete product: it is referenced by quote items. Deactivate it instead.");
  if (err?.code === "P2025") throw new Error("Product not found.");
  if (err?.code === "P2002") throw new Error("Duplicate entry");
  log.error("Unexpected error", { error: String(e) });
  throw new Error("An unexpected error occurred");
}

// ── Queries ────────────────────────────────────────────────────────────

export async function getProducts() {
  const user = await requireProductUser("productRead");

  const products = await db.product.findMany({
    where: { companyId: user.companyId },
    orderBy: { name: "asc" },
    take: 1000,
    select: {
      id: true,
      name: true,
      description: true,
      sku: true,
      type: true,
      price: true,
      cost: true,
      isActive: true,
    },
  });

  return products.map((p) => ({
    ...p,
    price: Number(p.price),
    cost: p.cost ? Number(p.cost) : null,
  }));
}

/** Dropdown used by /quotes — auth-only, no canViewServices check */
export async function getProductsForDropdown() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const limited = await checkActionRateLimit(
    String(user.id),
    RATE_LIMITS.productRead,
  ).catch(() => false);
  if (limited) throw new Error("Rate limit exceeded");

  const products = await db.product.findMany({
    where: { companyId: user.companyId, isActive: true },
    select: { id: true, name: true, description: true, price: true, cost: true, type: true },
    orderBy: { name: "asc" },
    take: 1000,
  });

  return products.map((p) => ({
    ...p,
    price: Number(p.price),
    cost: p.cost ? Number(p.cost) : null,
  }));
}

// ── Mutations ──────────────────────────────────────────────────────────

export async function createProduct(data: {
  name: string;
  description?: string;
  sku?: string;
  type: string;
  price: number;
  cost?: number;
}) {
  const user = await requireProductUser("productMutation");
  const parsed = createProductSchema.parse(data);

  // Resource cap
  const count = await db.product.count({ where: { companyId: user.companyId } });
  if (count >= MAX_PRODUCTS_PER_COMPANY) {
    throw new Error(`Maximum of ${MAX_PRODUCTS_PER_COMPANY} products reached`);
  }

  try {
    const product = await db.product.create({
      data: {
        companyId: user.companyId,
        name: parsed.name.trim(),
        description: parsed.description?.trim(),
        sku: parsed.sku?.trim(),
        type: parsed.type,
        price: parsed.price,
        cost: parsed.cost,
      },
      select: {
        id: true,
        name: true,
        description: true,
        sku: true,
        type: true,
        price: true,
        cost: true,
        isActive: true,
      },
    });

    revalidatePath("/services");
    return {
      ...product,
      price: Number(product.price),
      cost: product.cost ? Number(product.cost) : null,
    };
  } catch (e) {
    sanitizeError(e);
  }
}

export async function updateProduct(
  id: number,
  data: {
    name: string;
    description?: string;
    sku?: string;
    type: string;
    price: number;
    cost?: number;
    isActive?: boolean;
  }
) {
  const user = await requireProductUser("productMutation");
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid id");
  const parsed = updateProductSchema.parse(data);

  try {
    const product = await db.product.update({
      where: { id, companyId: user.companyId },
      data: {
        name: parsed.name.trim(),
        description: parsed.description?.trim(),
        sku: parsed.sku?.trim(),
        type: parsed.type,
        price: parsed.price,
        cost: parsed.cost,
        isActive: parsed.isActive,
      },
      select: {
        id: true,
        name: true,
        description: true,
        sku: true,
        type: true,
        price: true,
        cost: true,
        isActive: true,
      },
    });

    revalidatePath("/services");
    return {
      ...product,
      price: Number(product.price),
      cost: product.cost ? Number(product.cost) : null,
    };
  } catch (e) {
    sanitizeError(e);
  }
}

export async function deleteProduct(id: number) {
  const user = await requireProductUser("productMutation");
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid id");

  try {
    await db.product.delete({
      where: { id, companyId: user.companyId },
    });
  } catch (e) {
    sanitizeError(e);
  }

  revalidatePath("/services");
}
