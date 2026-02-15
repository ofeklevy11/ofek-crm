"use server";

import { prisma as db } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";

export async function getProducts() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

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

export async function getProductsForDropdown() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

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

export async function createProduct(data: {
  name: string;
  description?: string;
  sku?: string;
  type: string;
  price: number;
  cost?: number;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const product = await db.product.create({
    data: {
      companyId: user.companyId,
      name: data.name,
      description: data.description,
      sku: data.sku,
      type: data.type,
      price: data.price,
      cost: data.cost,
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
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const product = await db.product.update({
    where: { id, companyId: user.companyId },
    data,
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
}

export async function deleteProduct(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  try {
    await db.product.delete({
      where: { id, companyId: user.companyId },
    });
  } catch (e: any) {
    // P2003 = foreign key constraint failed (product referenced by quote items)
    if (e?.code === "P2003") {
      throw new Error(
        "Cannot delete product: it is referenced by quote items. Deactivate it instead."
      );
    }
    // P2025 = record not found (wrong id or wrong company)
    if (e?.code === "P2025") {
      throw new Error("Product not found.");
    }
    throw e;
  }

  revalidatePath("/services");
}
