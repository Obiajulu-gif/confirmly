-- CreateEnum
CREATE TYPE "PaymentProfileStatus" AS ENUM ('PENDING_VALIDATION', 'VALIDATED', 'VALIDATION_FAILED');

-- CreateEnum
CREATE TYPE "SubaccountStatus" AS ENUM ('NOT_CREATED', 'ACTIVE', 'ACTIVATION_REQUIRED', 'FAILED', 'REPLACED');

-- CreateEnum
CREATE TYPE "SettlementState" AS ENUM ('PENDING', 'SETTLED', 'FAILED');

-- DropForeignKey
ALTER TABLE "MerchantUser" DROP CONSTRAINT "MerchantUser_merchantId_fkey";

-- AlterTable (storeCode is added nullable, backfilled from slug, then locked)
ALTER TABLE "Merchant" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'Nigeria',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "onboardedAt" TIMESTAMP(3),
ADD COLUMN     "stateRegion" TEXT,
ADD COLUMN     "storeCode" TEXT,
ADD COLUMN     "supportEmail" TEXT;

UPDATE "Merchant" SET "storeCode" = UPPER(REPLACE("slug", '-', '')), "onboardedAt" = "createdAt" WHERE "storeCode" IS NULL;

ALTER TABLE "Merchant" ALTER COLUMN "storeCode" SET NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "routedToPlatform" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "splitPercentageSnapshot" INTEGER,
ADD COLUMN     "subAccountCodeSnapshot" TEXT;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "role" "MerchantUserRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantPaymentProfile" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumberEnc" TEXT NOT NULL,
    "accountNumberMasked" TEXT NOT NULL,
    "accountName" TEXT,
    "validationStatus" "PaymentProfileStatus" NOT NULL DEFAULT 'PENDING_VALIDATION',
    "subAccountCode" TEXT,
    "subaccountStatus" "SubaccountStatus" NOT NULL DEFAULT 'NOT_CREATED',
    "splitPercentage" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "lastValidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantPaymentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaSession" (
    "id" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "activeMerchantId" TEXT,
    "profileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "grossAmountKobo" INTEGER NOT NULL,
    "feeKobo" INTEGER NOT NULL DEFAULT 0,
    "netAmountKobo" INTEGER NOT NULL,
    "reference" TEXT,
    "state" "SettlementState" NOT NULL DEFAULT 'PENDING',
    "destinationMasked" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "MerchantMembership_merchantId_idx" ON "MerchantMembership"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantMembership_userId_merchantId_key" ON "MerchantMembership"("userId", "merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantPaymentProfile_subAccountCode_key" ON "MerchantPaymentProfile"("subAccountCode");

-- CreateIndex
CREATE INDEX "MerchantPaymentProfile_merchantId_active_idx" ON "MerchantPaymentProfile"("merchantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "WaSession_waId_key" ON "WaSession"("waId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_paymentId_key" ON "Settlement"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_reference_key" ON "Settlement"("reference");

-- CreateIndex
CREATE INDEX "Settlement_merchantId_state_idx" ON "Settlement"("merchantId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_storeCode_key" ON "Merchant"("storeCode");

-- Data migration: every existing merchant user becomes a User with an
-- OWNER membership (name derived from the email local part).
INSERT INTO "User" ("id", "name", "email", "passwordHash", "lastLoginAt", "createdAt", "updatedAt")
SELECT "id", split_part("email", '@', 1), "email", "passwordHash", "lastLoginAt", "createdAt", "updatedAt"
FROM "MerchantUser";

INSERT INTO "MerchantMembership" ("id", "userId", "merchantId", "role", "createdAt")
SELECT 'mm_' || "id", "id", "merchantId", "role", "createdAt"
FROM "MerchantUser";

-- DropTable
DROP TABLE "MerchantUser";

-- AddForeignKey
ALTER TABLE "MerchantMembership" ADD CONSTRAINT "MerchantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantMembership" ADD CONSTRAINT "MerchantMembership_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantPaymentProfile" ADD CONSTRAINT "MerchantPaymentProfile_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

