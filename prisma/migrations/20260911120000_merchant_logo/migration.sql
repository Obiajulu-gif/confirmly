-- CreateTable
CREATE TABLE "MerchantImageAsset" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantImageAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantImageAsset_merchantId_key" ON "MerchantImageAsset"("merchantId");

-- AddForeignKey
ALTER TABLE "MerchantImageAsset" ADD CONSTRAINT "MerchantImageAsset_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
