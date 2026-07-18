-- Product image upload and AI-generation metadata.
CREATE TYPE "ProductImageSource" AS ENUM ('MERCHANT_UPLOAD', 'AI_GENERATED', 'EXTERNAL_URL');
CREATE TYPE "ProductImageStatus" AS ENUM ('NONE', 'PROCESSING', 'READY', 'FAILED');

ALTER TABLE "Product"
  ADD COLUMN "imageSource" "ProductImageSource",
  ADD COLUMN "imageStatus" "ProductImageStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "imageAltText" TEXT,
  ADD COLUMN "imagePrompt" TEXT,
  ADD COLUMN "imageGeneratedAt" TIMESTAMP(3),
  ADD COLUMN "imageApprovedAt" TIMESTAMP(3),
  ADD COLUMN "imageFailureReason" TEXT,
  ADD COLUMN "imageContentHash" TEXT;

UPDATE "Product"
SET
  "imageSource" = 'EXTERNAL_URL',
  "imageStatus" = 'READY',
  "imageApprovedAt" = CURRENT_TIMESTAMP
WHERE "imageUrl" IS NOT NULL AND "imageUrl" <> '';

CREATE TABLE "ProductImageAsset" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "bytes" BYTEA NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductImageAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductImageAsset_productId_key" ON "ProductImageAsset"("productId");
CREATE INDEX "ProductImageAsset_merchantId_idx" ON "ProductImageAsset"("merchantId");

ALTER TABLE "ProductImageAsset"
ADD CONSTRAINT "ProductImageAsset_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
