/**
 * Receipt Data Model and Types
 * Follows Confirmly Dynamic Digital Receipt Generation PRD (Sections 8, 9, 18, 22).
 */

export type ReceiptSettlementStatus = "PENDING" | "SETTLED" | "FAILED";
export type ReceiptPaymentMethod = "CARD" | "BANK_TRANSFER" | "USSD" | "WALLET" | string;
export type ReceiptStatus = "GENERATED" | "SENT" | "DELIVERED" | "REVOKED";

export interface ReceiptItem {
  name: string;
  quantity: number;
  amountKobo: number;
  variant?: string | null;
}

export interface ReceiptData {
  transactionId: string; // Order ID or payment reference

  store: {
    name: string;
    code?: string;
    supportEmail?: string | null;
  };

  order: {
    id: string;
    reference: string;
    state: string;
    deliveryMethod?: string | null;
    deliveryZone?: string | null;
  };

  customer: {
    name: string;
    phoneNumber?: string | null;
    waId?: string | null;
  };

  payment: {
    paidAt: Date | string;
    method: ReceiptPaymentMethod;
    providerReference: string;
    settlementStatus: ReceiptSettlementStatus;
  };

  items: ReceiptItem[];

  totals: {
    subtotalKobo: number;
    deliveryFeeKobo: number;
    totalPaidKobo: number;
    currency?: string;
  };

  verification: {
    receiptId: string;
    verificationUrl: string;
    revoked?: boolean;
  };

  metadata?: {
    templateVersion?: string;
    generatedAt?: Date | string;
  };
}

export interface ReceiptFieldLayout {
  x: number;
  y: number;
  align: "left" | "right" | "center";
  fontSize: number;
  maxWidth?: number;
  fontWeight?: "normal" | "bold" | "600" | "700";
  color?: string;
}

export interface ReceiptLayoutConfig {
  width: number;
  height: number;
  fields: {
    store: ReceiptFieldLayout;
    orderReference: ReceiptFieldLayout;
    customer: ReceiptFieldLayout;
    paidOn: ReceiptFieldLayout;
    paymentMethod: ReceiptFieldLayout;
    providerReference: ReceiptFieldLayout;
    settlement: ReceiptFieldLayout;
    totalPaid: ReceiptFieldLayout;
  };
  items: {
    startY: number;
    lineHeight: number;
    maxVisibleRows: number;
    leftX: number;
    rightX: number;
    fontSize: number;
    maxWidthLeft: number;
  };
  pickupDelivery: {
    fontSize: number;
    leftX: number;
    rightX: number;
  };
  qrCode: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export interface GeneratedReceiptResult {
  receiptId: string;
  orderId: string;
  token: string;
  imageBuffer: Buffer;
  templateVersion: string;
  verificationUrl: string;
  generatedAt: Date;
}
