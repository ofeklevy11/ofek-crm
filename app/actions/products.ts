"use server";

import { prisma as db } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";

export async function getProducts() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  return db.product.findMany({
    where: { companyId: user.companyId },
    orderBy: { name: "asc" },
  });
}

export async function createProduct(data: {
  name: string;
  description?: string;
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
      type: data.type,
      price: data.price,
      cost: data.cost,
    },
  });

  revalidatePath("/services");
  return product;
}

export async function updateProduct(
  id: number,
  data: {
    name: string;
    description?: string;
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
  });

  revalidatePath("/services");
  return product;
}

export async function deleteProduct(id: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  await db.product.delete({
    where: { id, companyId: user.companyId },
  });

  revalidatePath("/services");
}
