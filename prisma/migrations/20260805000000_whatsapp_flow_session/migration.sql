-- Native WhatsApp Flow ordering session (additive).

-- CreateTable
CREATE TABLE "WhatsAppFlowSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "merchantId" TEXT,
    "customerId" TEXT,
    "currentScreen" TEXT NOT NULL DEFAULT 'START',
    "state" JSONB,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppFlowSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppFlowSession_tokenHash_key" ON "WhatsAppFlowSession"("tokenHash");

-- CreateIndex
CREATE INDEX "WhatsAppFlowSession_waId_idx" ON "WhatsAppFlowSession"("waId");

-- CreateIndex
CREATE INDEX "WhatsAppFlowSession_expiresAt_idx" ON "WhatsAppFlowSession"("expiresAt");

