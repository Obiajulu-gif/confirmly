/**
 * All money in Confirmly is stored as integer kobo (NGN minor unit).
 * NGN 26,500 = 2,650,000 kobo.
 *
 * The AI never produces money values; every amount flowing through these
 * functions must originate from the database or the payment provider.
 */

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export const MAX_QUANTITY = 999;

export function assertKobo(value: number, label = "amount"): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new MoneyError(`${label} must be a finite number`);
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} must be an integer number of kobo`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} exceeds the safe integer range`);
  }
  if (value < 0) {
    throw new MoneyError(`${label} must not be negative`);
  }
  return value;
}

export function assertQuantity(value: number, label = "quantity"): number {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} must be an integer`);
  }
  if (value < 1 || value > MAX_QUANTITY) {
    throw new MoneyError(`${label} must be between 1 and ${MAX_QUANTITY}`);
  }
  return value;
}

export interface OrderLineInput {
  unitPriceKobo: number;
  quantity: number;
  /** When provided, must equal unitPriceKobo * quantity. */
  lineTotalKobo?: number;
}

export interface OrderTotalInput {
  items: OrderLineInput[];
  deliveryFeeKobo?: number;
  discountKobo?: number;
}

export interface OrderTotal {
  subtotalKobo: number;
  deliveryFeeKobo: number;
  discountKobo: number;
  totalKobo: number;
  lineTotalsKobo: number[];
}

/**
 * Pure order-total calculation. Rejects negative values, unsafe integers,
 * invalid quantities, and line totals that do not match their line items.
 */
export function calculateOrderTotal(input: OrderTotalInput): OrderTotal {
  if (!input.items.length) {
    throw new MoneyError("order must contain at least one item");
  }
  const lineTotalsKobo: number[] = [];
  let subtotalKobo = 0;
  input.items.forEach((item, i) => {
    const unit = assertKobo(item.unitPriceKobo, `items[${i}].unitPriceKobo`);
    const qty = assertQuantity(item.quantity, `items[${i}].quantity`);
    const line = unit * qty;
    if (!Number.isSafeInteger(line)) {
      throw new MoneyError(`items[${i}] line total exceeds safe integer range`);
    }
    if (item.lineTotalKobo !== undefined && item.lineTotalKobo !== line) {
      throw new MoneyError(
        `items[${i}].lineTotalKobo does not match unit price × quantity`
      );
    }
    lineTotalsKobo.push(line);
    subtotalKobo += line;
    if (!Number.isSafeInteger(subtotalKobo)) {
      throw new MoneyError("subtotal exceeds safe integer range");
    }
  });

  const deliveryFeeKobo = assertKobo(
    input.deliveryFeeKobo ?? 0,
    "deliveryFeeKobo"
  );
  const discountKobo = assertKobo(input.discountKobo ?? 0, "discountKobo");
  if (discountKobo > subtotalKobo + deliveryFeeKobo) {
    throw new MoneyError("discount exceeds order value");
  }
  const totalKobo = subtotalKobo + deliveryFeeKobo - discountKobo;
  if (!Number.isSafeInteger(totalKobo) || totalKobo < 0) {
    throw new MoneyError("total is out of range");
  }
  return { subtotalKobo, deliveryFeeKobo, discountKobo, totalKobo, lineTotalsKobo };
}

/** Formats kobo for humans: 2650000 → "NGN 26,500". */
export function formatNaira(kobo: number): string {
  assertKobo(kobo, "kobo");
  const naira = kobo / 100;
  const formatted = naira.toLocaleString("en-NG", {
    minimumFractionDigits: naira % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `NGN ${formatted}`;
}

/**
 * Converts kobo to a decimal naira amount at the provider boundary only.
 * Returns a number with at most 2 decimal places (e.g. 2650000 → 26500).
 */
export function koboToNairaAmount(kobo: number): number {
  assertKobo(kobo, "kobo");
  return Math.round(kobo) / 100;
}

/** Converts a provider naira amount (e.g. 26500 or "26500.00") to kobo. */
export function nairaAmountToKobo(naira: number | string): number {
  const n = typeof naira === "string" ? Number(naira) : naira;
  if (!Number.isFinite(n) || n < 0) {
    throw new MoneyError("invalid naira amount from provider");
  }
  const kobo = Math.round(n * 100);
  return assertKobo(kobo, "converted kobo");
}
