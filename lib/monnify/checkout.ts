import { z } from "zod";

/**
 * Income-split configuration for merchant-routed checkouts. The subaccount
 * code is ALWAYS loaded server-side from the order-owned merchant payment
 * profile — nothing from a browser or webhook ever selects it.
 */

export interface IncomeSplit {
  subAccountCode: string;
  splitPercentage: number;
  feeBearer: boolean;
  feePercentage: number;
}

const splitSchema = z
  .array(
    z.object({
      subAccountCode: z.string().min(3),
      splitPercentage: z.number().min(0).max(100),
      feeBearer: z.boolean(),
      feePercentage: z.number().min(0).max(100),
    })
  )
  .min(1)
  .superRefine((splits, ctx) => {
    const total = splits.reduce((sum, s) => sum + s.splitPercentage, 0);
    if (Math.round(total * 100) / 100 !== 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `split percentages must total exactly 100 (got ${total})`,
      });
    }
  });

export class SplitConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitConfigError";
  }
}

/**
 * Builds the validated incomeSplitConfig for a merchant checkout.
 * MVP policy: platform fee 0, merchant receives 100%, merchant bears fees.
 */
export function buildIncomeSplitConfig(
  subAccountCode: string,
  splitPercentage = 100
): IncomeSplit[] {
  const config: IncomeSplit[] = [
    {
      subAccountCode,
      splitPercentage,
      feeBearer: true,
      feePercentage: 100,
    },
  ];
  const parsed = splitSchema.safeParse(config);
  if (!parsed.success) {
    throw new SplitConfigError(
      parsed.error.issues[0]?.message ?? "invalid income split configuration"
    );
  }
  return config;
}

/** Validates an arbitrary split config (used by tests and future multi-way splits). */
export function assertSplitConfig(config: IncomeSplit[]): IncomeSplit[] {
  const parsed = splitSchema.safeParse(config);
  if (!parsed.success) {
    throw new SplitConfigError(
      parsed.error.issues[0]?.message ?? "invalid income split configuration"
    );
  }
  return config;
}
