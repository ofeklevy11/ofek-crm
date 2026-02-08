-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "sku" TEXT;

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'ILS',
ADD COLUMN     "discountType" TEXT,
ADD COLUMN     "discountValue" DECIMAL(10,2),
ADD COLUMN     "exchangeRate" DECIMAL(10,4);
