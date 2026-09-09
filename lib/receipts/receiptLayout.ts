import { ReceiptLayoutConfig } from "./receiptTypes";

/**
 * Receipt Template Coordinates (1024 × 1536)
 * Derived from exact measurement against the Confirmly receipt template artwork
 * as specified in Section 10 of the PRD.
 */
export const defaultReceiptLayout: ReceiptLayoutConfig = {
  width: 1024,
  height: 1536,
  fields: {
    store: {
      x: 975,
      y: 355,
      align: "right",
      fontSize: 36,
      maxWidth: 520,
      fontWeight: "600",
      color: "#000000",
    },
    orderReference: {
      x: 975,
      y: 468,
      align: "right",
      fontSize: 38,
      maxWidth: 450,
      fontWeight: "600",
      color: "#000000",
    },
    customer: {
      x: 975,
      y: 558,
      align: "right",
      fontSize: 38,
      maxWidth: 450,
      fontWeight: "600",
      color: "#000000",
    },
    paidOn: {
      x: 975,
      y: 647,
      align: "right",
      fontSize: 36,
      maxWidth: 450,
      fontWeight: "600",
      color: "#000000",
    },
    paymentMethod: {
      x: 975,
      y: 742,
      align: "right",
      fontSize: 38,
      maxWidth: 400,
      fontWeight: "600",
      color: "#000000",
    },
    providerReference: {
      x: 975,
      y: 826,
      align: "right",
      fontSize: 38,
      maxWidth: 400,
      fontWeight: "600",
      color: "#000000",
    },
    settlement: {
      x: 975,
      y: 918,
      align: "right",
      fontSize: 38,
      maxWidth: 400,
      fontWeight: "600",
      color: "#000000",
    },
    totalPaid: {
      x: 975,
      y: 1258,
      align: "right",
      fontSize: 40,
      maxWidth: 400,
      fontWeight: "700",
      color: "#000000",
    },
  },
  items: {
    startY: 1045,
    lineHeight: 62,
    maxVisibleRows: 5,
    leftX: 52,
    rightX: 975,
    fontSize: 34,
    maxWidthLeft: 600,
  },
  pickupDelivery: {
    fontSize: 34,
    leftX: 52,
    rightX: 975,
  },
  qrCode: {
    left: 303,
    top: 1336,
    width: 175,
    height: 175,
  },
};
