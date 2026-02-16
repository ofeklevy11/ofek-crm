import { z } from "zod";

export const MAX_PRODUCTS_PER_COMPANY = 5000;

const MAX_PRICE = 99_999_999.99; // Decimal(10,2) max

const name = z.string().trim().min(1).max(200);
const description = z.string().trim().max(2000).optional();
const sku = z.string().trim().max(100).optional();
const productType = z.enum(["SERVICE", "PRODUCT", "PACKAGE"]);
const price = z.number().finite().min(0).max(MAX_PRICE);
const cost = z.number().finite().min(0).max(MAX_PRICE).optional();

export const createProductSchema = z.object({ name, description, sku, type: productType, price, cost });
export const updateProductSchema = z.object({ name, description, sku, type: productType, price, cost, isActive: z.boolean().optional() });
