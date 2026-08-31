-- CreateEnum
CREATE TYPE "FulfilmentStatus" AS ENUM ('AWAITING_PAYMENT', 'RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "fulfilmentStatus" "FulfilmentStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT';

-- CreateTable
CREATE TABLE "FulfilmentEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "FulfilmentStatus" NOT NULL,
    "note" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'MERCHANT',
    "actorId" TEXT,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FulfilmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FulfilmentEvent_orderId_createdAt_idx" ON "FulfilmentEvent"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "FulfilmentEvent" ADD CONSTRAINT "FulfilmentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill existing orders to a sensible fulfilment status.
UPDATE "Order" SET "fulfilmentStatus" = 'DELIVERED' WHERE "state" = 'COMPLETED';
UPDATE "Order" SET "fulfilmentStatus" = 'PREPARING' WHERE "state" = 'FULFILLING';
UPDATE "Order" SET "fulfilmentStatus" = 'RECEIVED' WHERE "state" = 'PAID';
