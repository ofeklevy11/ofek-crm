"use server";

import { prisma as db } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
import { inngest } from "@/lib/inngest/client";

export async function getQuotes(showTrashed: boolean = false) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // P118: Add take limit to prevent OOM with large quote lists
  const quotes = await db.quote.findMany({
    where: {
      companyId: user.companyId,
      isTrashed: showTrashed,
    },
    include: {
      client: true,
      items: true,
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
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
  title?: string;
  items: {
    productId?: number;
    description: string;
    quantity: number;
    unitPrice: number;
    unitCost?: number;
  }[];
  isPriceWithVat?: boolean;
  currency?: string;
  exchangeRate?: number;
  discountType?: string;
  discountValue?: number;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  if (data.items.length > 200) throw new Error("Too many items (max 200)");

  // SECURITY: Validate clientId belongs to user's company
  if (data.clientId) {
    const client = await db.client.findFirst({
      where: { id: data.clientId, companyId: user.companyId },
      select: { id: true },
    });
    if (!client) throw new Error("Invalid client");
  }

  // Calculate total
  const total = data.items.reduce(
    (acc, item) => acc + item.quantity * item.unitPrice,
    0,
  );

  // P124: Use serializable transaction to prevent race condition on quote number
  const quote = await db.$transaction(async (tx) => {
    const lastQuote = await tx.quote.findFirst({
      where: {
        companyId: user.companyId,
        quoteNumber: { not: null },
      },
      orderBy: { quoteNumber: "desc" },
      select: { quoteNumber: true },
    });

    const nextQuoteNumber = (lastQuote?.quoteNumber ?? 0) + 1;

    return tx.quote.create({
      data: {
        companyId: user.companyId,
        quoteNumber: nextQuoteNumber,
        clientId: data.clientId,
        clientName: data.clientName,
        clientEmail: data.clientEmail,
        clientPhone: data.clientPhone,
        clientTaxId: data.clientTaxId,
        clientAddress: data.clientAddress,
        validUntil: data.validUntil,
        title: data.title,
        total,
        status: "DRAFT",
        shareToken: crypto.randomUUID(),
        items: {
          create: data.items.map((item) => ({
            productId: item.productId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unitCost: item.unitCost,
          })),
        },
        isPriceWithVat: data.isPriceWithVat ?? false,
        currency: data.currency || "ILS",
        exchangeRate: data.exchangeRate,
        discountType: data.discountType || null,
        discountValue: data.discountValue || null,
      },
      include: {
        items: true,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  // Pre-generate PDF in background so it's ready when user downloads
  inngest.send({
    id: `pdf-quote-${user.companyId}-${quote.id}-${Math.floor(Date.now() / 5000)}`,
    name: "pdf/generate-quote",
    data: { quoteId: quote.id, companyId: user.companyId },
  }).catch((err) => console.error("[quotes] Failed to trigger PDF generation:", err));

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
    title?: string;
    items: {
      id?: number; // If present, update. If not, create.
      productId?: number;
      description: string;
      quantity: number;
      unitPrice: number;
      unitCost?: number;
    }[];
    isPriceWithVat?: boolean;
    currency?: string;
    exchangeRate?: number;
    discountType?: string;
    discountValue?: number;
  },
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  if (data.items.length > 200) throw new Error("Too many items (max 200)");

  // SECURITY: Validate clientId belongs to user's company
  if (data.clientId) {
    const client = await db.client.findFirst({
      where: { id: data.clientId, companyId: user.companyId },
      select: { id: true },
    });
    if (!client) throw new Error("Invalid client");
  }

  // Calculate total
  const total = data.items.reduce(
    (acc, item) => acc + item.quantity * item.unitPrice,
    0,
  );

  // Transaction to update quote and replace items safely?
  // Or just delete all and recreate. Deleting all is safer for order and cleanup.

  let oldPdfUrl: string | null = null;

  const quote = await db.$transaction(async (tx) => {
    // Read current pdfUrl before nulling so Inngest job can delete the old file
    const current = await tx.quote.findUnique({
      where: { id, companyId: user.companyId },
      select: { pdfUrl: true },
    });
    oldPdfUrl = current?.pdfUrl || null;

    // 1. Update basic info
    // NOTE: shareToken is intentionally preserved — do not reset on update
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
        title: data.title,
        total,
        isPriceWithVat: data.isPriceWithVat,
        currency: data.currency || "ILS",
        exchangeRate: data.exchangeRate,
        discountType: data.discountType || null,
        discountValue: data.discountValue || null,
        pdfUrl: null, // Reset cached PDF on update
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

  // Re-generate PDF in background after update
  inngest.send({
    id: `pdf-quote-${user.companyId}-${id}-${Math.floor(Date.now() / 5000)}`,
    name: "pdf/generate-quote",
    data: { quoteId: id, companyId: user.companyId, oldPdfUrl },
  }).catch((err) => console.error("[quotes] Failed to trigger PDF generation:", err));

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

export async function trashQuote(id: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Read current pdfUrl so we can delete the UploadThing file
  const quote = await db.quote.findUnique({
    where: { id, companyId: user.companyId },
    select: { pdfUrl: true },
  });

  await db.quote.update({
    where: { id, companyId: user.companyId },
    data: { isTrashed: true, pdfUrl: null },
  });

  // Delete UploadThing file in background (non-blocking)
  if (quote?.pdfUrl) {
    import("uploadthing/server").then(({ UTApi }) => {
      const utapi = new UTApi();
      try {
        const url = new URL(quote.pdfUrl!);
        const fileKey = url.pathname.split("/").pop();
        if (fileKey) utapi.deleteFiles([fileKey]);
      } catch (err) {
        console.error("[quotes] Failed to delete trashed quote PDF:", err);
      }
    }).catch((err) => console.error("[quotes] Failed to import UTApi for cleanup:", err));
  }

  revalidatePath("/quotes");
}

export async function restoreQuote(id: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  await db.quote.update({
    where: { id, companyId: user.companyId },
    data: { isTrashed: false },
  });

  // Regenerate PDF since it was deleted on trash
  inngest.send({
    id: `pdf-quote-${user.companyId}-${id}-${Math.floor(Date.now() / 5000)}`,
    name: "pdf/generate-quote",
    data: { quoteId: id, companyId: user.companyId },
  }).catch((err) => console.error("[quotes] Failed to trigger PDF generation on restore:", err));

  revalidatePath("/quotes");
}

export async function getClientsForDropdown() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // EEE: Add take limit to prevent massive payloads for companies with thousands of clients
  return db.client.findMany({
    where: { companyId: user.companyId },
    select: { id: true, name: true, email: true, phone: true, company: true },
    orderBy: { name: "asc" },
    take: 500,
  });
}
