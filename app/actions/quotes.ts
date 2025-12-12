"use server";

import { prisma as db } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";

export async function getQuotes() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const quotes = await db.quote.findMany({
    where: { companyId: user.companyId },
    include: {
      client: true,
      items: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return quotes.map((quote) => ({
    ...quote,
    total: quote.total.toNumber(),
    items: quote.items.map((item) => ({
      ...item,
      unitPrice: item.unitPrice.toNumber(),
      unitCost: item.unitCost ? item.unitCost.toNumber() : null,
    })),
  }));
}

export async function getQuoteById(id: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const quote = await db.quote.findUnique({
    where: { id, companyId: user.companyId },
    include: {
      client: true,
      items: {
        include: {
          product: true,
        },
      },
      company: true,
    },
  });

  if (!quote) return null;

  return {
    ...quote,
    total: quote.total.toNumber(),
    items: quote.items.map((item) => ({
      ...item,
      unitPrice: item.unitPrice.toNumber(),
      unitCost: item.unitCost ? item.unitCost.toNumber() : null,
      product: item.product
        ? {
            ...item.product,
            price: item.product.price.toNumber(),
            cost: item.product.cost ? item.product.cost.toNumber() : null,
          }
        : null,
    })),
  };
}

export async function createQuote(data: {
  clientId?: number;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientTaxId?: string;
  clientAddress?: string;
  validUntil?: Date;
  items: {
    productId?: number;
    description: string;
    quantity: number;
    unitPrice: number;
    unitCost?: number;
  }[];
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Calculate total
  const total = data.items.reduce(
    (acc, item) => acc + item.quantity * item.unitPrice,
    0
  );

  const quote = await db.quote.create({
    data: {
      companyId: user.companyId,
      clientId: data.clientId,
      clientName: data.clientName,
      clientEmail: data.clientEmail,
      clientPhone: data.clientPhone,
      clientTaxId: data.clientTaxId,
      clientAddress: data.clientAddress,
      validUntil: data.validUntil,
      total,
      status: "DRAFT",
      items: {
        create: data.items.map((item) => ({
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unitCost: item.unitCost,
        })),
      },
    },
    include: {
      items: true,
    },
  });

  revalidatePath("/quotes");

  return {
    ...quote,
    total: quote.total.toNumber(),
    items: quote.items.map((item) => ({
      ...item,
      unitPrice: item.unitPrice.toNumber(),
      unitCost: item.unitCost ? item.unitCost.toNumber() : null,
    })),
  };
}

export async function updateQuote(
  id: string,
  data: {
    clientId?: number;
    clientName: string;
    clientEmail?: string;
    clientPhone?: string;
    clientTaxId?: string;
    clientAddress?: string;
    validUntil?: Date;
    status?: string;
    items: {
      id?: number; // If present, update. If not, create.
      productId?: number;
      description: string;
      quantity: number;
      unitPrice: number;
      unitCost?: number;
    }[];
  }
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Calculate total
  const total = data.items.reduce(
    (acc, item) => acc + item.quantity * item.unitPrice,
    0
  );

  // Transaction to update quote and replace items safely?
  // Or just delete all and recreate. Deleting all is safer for order and cleanup.

  const quote = await db.$transaction(async (tx) => {
    // 1. Update basic info
    const updated = await tx.quote.update({
      where: { id, companyId: user.companyId },
      data: {
        clientId: data.clientId,
        clientName: data.clientName,
        clientEmail: data.clientEmail,
        clientPhone: data.clientPhone,
        clientTaxId: data.clientTaxId,
        clientAddress: data.clientAddress,
        validUntil: data.validUntil,
        status: data.status,
        total,
      },
    });

    // 2. Handle items: simple strategy -> delete all, recreate all
    // Use deleteMany with quoteId
    await tx.quoteItem.deleteMany({
      where: { quoteId: id },
    });

    // 3. Create new items
    if (data.items.length > 0) {
      await tx.quoteItem.createMany({
        data: data.items.map((item) => ({
          quoteId: id,
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unitCost: item.unitCost,
        })),
      });
    }

    // 4. Fetch the full, fresh quote to return
    const fullQuote = await tx.quote.findUnique({
      where: { id: updated.id },
      include: { items: true },
    });

    return fullQuote;
  });

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);

  if (!quote) throw new Error("Failed to update quote");

  return {
    ...quote,
    total: quote.total.toNumber(),
    items: quote.items.map((item) => ({
      ...item,
      unitPrice: item.unitPrice.toNumber(),
      unitCost: item.unitCost ? item.unitCost.toNumber() : null,
    })),
  };
}

export async function deleteQuote(id: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  await db.quote.delete({
    where: { id, companyId: user.companyId },
  });

  revalidatePath("/quotes");
}

export async function getClientsForDropdown() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  return db.client.findMany({
    where: { companyId: user.companyId },
    select: { id: true, name: true, email: true, phone: true, company: true },
    orderBy: { name: "asc" },
  });
}
