-- AlterTable: Add shareToken column to Quote
ALTER TABLE "Quote" ADD COLUMN "shareToken" TEXT;

-- Backfill existing quotes with unique tokens (gen_random_uuid is built-in on PG 13+)
UPDATE "Quote" SET "shareToken" = gen_random_uuid()::text WHERE "shareToken" IS NULL;

-- CreateIndex: unique constraint to prevent collisions and allow efficient lookups
CREATE UNIQUE INDEX "Quote_shareToken_key" ON "Quote"("shareToken");
