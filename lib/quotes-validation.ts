import { z } from "zod";

// ── CUID format (Prisma default IDs) ────────────────────────────────
export const cuidSchema = z.string().regex(/^c[a-z0-9]{24,}$/, "Invalid ID format");

// ── Shared field schemas ────────────────────────────────────────────
const clientName = z.string().min(1, "Client name is required").max(200);
const clientEmail = z.string().email().max(254).optional().or(z.literal(""));
const clientPhone = z.string().max(50).optional();
const clientTaxId = z.string().max(50).optional();
const clientAddress = z.string().max(500).optional();
const title = z.string().max(300).optional();
const currency = z.enum(["ILS", "USD", "EUR", "GBP"]).optional();
const discountType = z.enum(["percent", "fixed"]).optional().nullable();

const quoteItemSchema = z.object({
  id: z.number().int().positive().optional(),
  productId: z.number().int().positive().optional(),
  description: z.string().min(1, "Item description is required").max(2000),
  quantity: z.number().int().positive().max(1_000_000),
  unitPrice: z.number().min(0).max(99_999_999.99),
  unitCost: z.number().min(0).max(99_999_999.99).optional(),
});

// ── Create quote schema ─────────────────────────────────────────────
export const createQuoteSchema = z
  .object({
    clientId: z.number().int().positive().optional(),
    clientName,
    clientEmail,
    clientPhone,
    clientTaxId,
    clientAddress,
    validUntil: z.coerce.date().optional(),
    title,
    items: z.array(quoteItemSchema).min(1, "At least one item is required").max(200),
    isPriceWithVat: z.boolean().optional(),
    currency,
    exchangeRate: z.number().positive().max(999_999).optional(),
    discountType,
    discountValue: z.number().min(0).max(99_999_999.99).optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.discountType === "percent" && data.discountValue != null) {
        return data.discountValue <= 100;
      }
      return true;
    },
    { message: "Percent discount cannot exceed 100", path: ["discountValue"] },
  );

// ── Update quote schema ─────────────────────────────────────────────
export const updateQuoteSchema = z
  .object({
    clientId: z.number().int().positive().optional(),
    clientName,
    clientEmail,
    clientPhone,
    clientTaxId,
    clientAddress,
    validUntil: z.coerce.date().optional(),
    status: z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED"]).optional(),
    title,
    items: z.array(quoteItemSchema).min(0).max(200),
    isPriceWithVat: z.boolean().optional(),
    currency,
    exchangeRate: z.number().positive().max(999_999).optional(),
    discountType,
    discountValue: z.number().min(0).max(99_999_999.99).optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.discountType === "percent" && data.discountValue != null) {
        return data.discountValue <= 100;
      }
      return true;
    },
    { message: "Percent discount cannot exceed 100", path: ["discountValue"] },
  );
