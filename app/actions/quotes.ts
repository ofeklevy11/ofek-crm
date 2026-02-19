"use server";

import { prisma as db } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/permissions-server";
import { hasUserFlag } from "@/lib/permissions";
import { checkActionRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
import { inngest } from "@/lib/inngest/client";
import { withRetry } from "@/lib/db-retry";
import {
  createQuoteSchema,
  updateQuoteSchema,
  cuidSchema,
} from "@/lib/quotes-validation";
import { createLogger } from "@/lib/logger";

const log = createLogger("Quotes");

async function requireQuoteAccess(rateKey: "quoteRead" | "quoteMutation") {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!hasUserFlag(user, "canViewQuotes")) throw new Error("Forbidden");
  const limited = await checkActionRateLimit(String(user.id), RATE_LIMITS[rateKey]);
  if (limited) throw new Error("Rate limit exceeded. Please try again later.");
  return user;
}

export async function getQuotes(showTrashed: boolean = false, cursor?: string) {
  const user = await requireQuoteAccess("quoteRead");

  if (cursor != null) {
    const cursorResult = cuidSchema.safeParse(cursor);
    if (!cursorResult.success) throw new Error("Invalid cursor format");
  }

  const pageSize = 50;

  const quotes = await withRetry(() => db.quote.findMany({
    where: {
      companyId: user.companyId,
      isTrashed: showTrashed,
    },
    select: {
      id: true,
      quoteNumber: true,
      clientName: true,
      total: true,
      currency: true,
      status: true,
      createdAt: true,
      validUntil: true,
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
    take: pageSize + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  }));

  const hasMore = quotes.length > pageSize;
  if (hasMore) quotes.pop();

  return {
    quotes: quotes.map((quote) => ({
      ...quote,
      total: quote.total.toNumber(),
    })),
    nextCursor: hasMore ? quotes[quotes.length - 1]?.id ?? null : null,
  };
}

export async function getQuoteById(id: string) {
  const user = await requireQuoteAccess("quoteRead");

  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) throw new Error("Invalid quote ID format");

  const quote = await withRetry(() => db.quote.findUnique({
    where: { id, companyId: user.companyId },
    select: {
      id: true, quoteNumber: true, clientId: true, clientName: true, clientEmail: true,
      clientPhone: true, clientTaxId: true, clientAddress: true, total: true, status: true,
      pdfUrl: true, validUntil: true, createdAt: true, updatedAt: true,
      isPriceWithVat: true, title: true, currency: true, exchangeRate: true,
      discountType: true, discountValue: true,
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              price: true,
              cost: true,
              sku: true,
            },
          },
        },
      },
      company: {
        select: {
          name: true,
          businessType: true,
          taxId: true,
          businessAddress: true,
          businessEmail: true,
          businessWebsite: true,
          logoUrl: true,
        },
      },
    },
  }));

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
  const user = await requireQuoteAccess("quoteMutation");

  const parsed = createQuoteSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((e) => e.message).join(", "));
  }
  const valid = parsed.data;

  // Calculate total
  const total = valid.items.reduce(
    (acc, item) => acc + item.quantity * item.unitPrice,
    0,
  );

  // P124: Use serializable transaction to prevent race condition on quote number.
  // Retry up to 2 times on serialization conflict (P2034) from concurrent creates.
  const MAX_RETRIES = 2;
  let quote;
  for (let attempt = 0; ; attempt++) {
    try {
      quote = await withRetry(() => db.$transaction(async (tx) => {
        // SECURITY: Validate clientId inside transaction to prevent TOCTOU race
        if (valid.clientId) {
          const client = await tx.client.findFirst({
            where: { id: valid.clientId, companyId: user.companyId, deletedAt: null },
            select: { id: true },
          });
          if (!client) throw new Error("Invalid client");
        }

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
            clientId: valid.clientId,
            clientName: valid.clientName,
            clientEmail: valid.clientEmail,
            clientPhone: valid.clientPhone,
            clientTaxId: valid.clientTaxId,
            clientAddress: valid.clientAddress,
            validUntil: valid.validUntil,
            title: valid.title,
            total,
            status: "DRAFT",
            shareToken: crypto.randomUUID(),
            items: {
              create: valid.items.map((item) => ({
                productId: item.productId,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                unitCost: item.unitCost,
              })),
            },
            isPriceWithVat: valid.isPriceWithVat ?? false,
            currency: valid.currency || "ILS",
            exchangeRate: valid.exchangeRate,
            discountType: valid.discountType || null,
            discountValue: valid.discountValue || null,
          },
          select: { id: true },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }));
      break; // Success — exit retry loop
    } catch (err: any) {
      if (err?.code === "P2034" && attempt < MAX_RETRIES) {
        continue; // Serialization conflict — retry
      }
      log.error("createQuote transaction error", { error: String(err) });
      throw new Error("Failed to create quote");
    }
  }

  // Pre-generate PDF in background so it's ready when user downloads
  inngest.send({
    id: `pdf-quote-${user.companyId}-${quote.id}-${Math.floor(Date.now() / 5000)}`,
    name: "pdf/generate-quote",
    data: { quoteId: quote.id, companyId: user.companyId },
  }).catch((err) => log.error("Failed to trigger PDF generation after create", { error: String(err) }));

  revalidatePath("/quotes");

  return { id: quote.id };
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
  const user = await requireQuoteAccess("quoteMutation");

  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) throw new Error("Invalid quote ID format");

  const parsed = updateQuoteSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((e) => e.message).join(", "));
  }
  const valid = parsed.data;

  // Calculate total
  const total = valid.items.reduce(
    (acc, item) => acc + item.quantity * item.unitPrice,
    0,
  );

  // Transaction to update quote and replace items safely.
  // Deleting all and recreating is safer for order and cleanup.

  let oldPdfUrl: string | null = null;

  try {
    await withRetry(() => db.$transaction(async (tx) => {
      // SECURITY: Validate clientId inside transaction to prevent TOCTOU race
      if (valid.clientId) {
        const client = await tx.client.findFirst({
          where: { id: valid.clientId, companyId: user.companyId, deletedAt: null },
          select: { id: true },
        });
        if (!client) throw new Error("Invalid client");
      }

      // Read current pdfUrl before nulling so Inngest job can delete the old file
      const current = await tx.quote.findUnique({
        where: { id, companyId: user.companyId },
        select: { pdfUrl: true },
      });
      oldPdfUrl = current?.pdfUrl || null;

      // 1. Update basic info
      // NOTE: shareToken is intentionally preserved — do not reset on update
      await tx.quote.update({
        where: { id, companyId: user.companyId },
        data: {
          clientId: valid.clientId,
          clientName: valid.clientName,
          clientEmail: valid.clientEmail,
          clientPhone: valid.clientPhone,
          clientTaxId: valid.clientTaxId,
          clientAddress: valid.clientAddress,
          validUntil: valid.validUntil,
          status: valid.status,
          title: valid.title,
          total,
          isPriceWithVat: valid.isPriceWithVat,
          currency: valid.currency || "ILS",
          exchangeRate: valid.exchangeRate,
          discountType: valid.discountType || null,
          discountValue: valid.discountValue || null,
          pdfUrl: null, // Reset cached PDF on update
        },
      });

      // 2. Handle items: simple strategy -> delete all, recreate all
      await tx.quoteItem.deleteMany({
        where: { quoteId: id },
      });

      // 3. Create new items
      if (valid.items.length > 0) {
        await tx.quoteItem.createMany({
          data: valid.items.map((item) => ({
            quoteId: id,
            productId: item.productId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unitCost: item.unitCost,
          })),
        });
      }
    }, { maxWait: 5000, timeout: 30000 }));
  } catch (err) {
    log.error("updateQuote transaction error", { error: String(err) });
    throw new Error("Failed to update quote");
  }

  // Re-generate PDF in background after update
  inngest.send({
    id: `pdf-quote-${user.companyId}-${id}-${Math.floor(Date.now() / 5000)}`,
    name: "pdf/generate-quote",
    data: { quoteId: id, companyId: user.companyId, oldPdfUrl },
  }).catch((err) => log.error("Failed to trigger PDF generation after update", { error: String(err) }));

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
}

export async function trashQuote(id: string) {
  const user = await requireQuoteAccess("quoteMutation");

  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) throw new Error("Invalid quote ID format");

  // Atomically read old pdfUrl and trash to prevent race with PDF job
  let oldPdfUrl: string | null = null;
  await withRetry(() => db.$transaction(async (tx) => {
    const current = await tx.quote.findUnique({
      where: { id, companyId: user.companyId },
      select: { pdfUrl: true },
    });
    oldPdfUrl = current?.pdfUrl || null;
    await tx.quote.update({
      where: { id, companyId: user.companyId },
      data: { isTrashed: true, pdfUrl: null },
    });
  }, { maxWait: 5000, timeout: 10000 }));

  // Delete UploadThing file in background (non-blocking)
  if (oldPdfUrl) {
    import("uploadthing/server").then(({ UTApi }) => {
      const utapi = new UTApi();
      try {
        const url = new URL(oldPdfUrl!);
        const fileKey = url.pathname.split("/").pop();
        if (fileKey) utapi.deleteFiles([fileKey]);
      } catch (err) {
        log.error("Failed to delete trashed quote PDF", { error: String(err) });
      }
    }).catch((err) => log.error("Failed to import UTApi for cleanup", { error: String(err) }));
  }

  revalidatePath("/quotes");
}

export async function restoreQuote(id: string) {
  const user = await requireQuoteAccess("quoteMutation");

  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) throw new Error("Invalid quote ID format");

  await db.quote.update({
    where: { id, companyId: user.companyId },
    data: { isTrashed: false },
  });

  // Regenerate PDF since it was deleted on trash
  inngest.send({
    id: `pdf-quote-${user.companyId}-${id}-${Math.floor(Date.now() / 5000)}`,
    name: "pdf/generate-quote",
    data: { quoteId: id, companyId: user.companyId },
  }).catch((err) => log.error("Failed to trigger PDF generation on restore", { error: String(err) }));

  revalidatePath("/quotes");
}

export async function getClientsForDropdown() {
  const user = await requireQuoteAccess("quoteRead");

  // EEE: Add take limit to prevent massive payloads for companies with thousands of clients
  return withRetry(() => db.client.findMany({
    where: { companyId: user.companyId },
    select: { id: true, name: true, email: true, phone: true, businessName: true },
    orderBy: { name: "asc" },
    take: 500,
  }));
}
