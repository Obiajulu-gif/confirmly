import { describe, expect, it } from "vitest";
import {
  assertSplitConfig,
  buildIncomeSplitConfig,
  SplitConfigError,
} from "@/lib/monnify/checkout";

describe("income split configuration", () => {
  it("builds the MVP merchant split: 100 percent, merchant bears fees", () => {
    const config = buildIncomeSplitConfig("SUB_ABC123");
    expect(config).toHaveLength(1);
    expect(config[0]).toEqual({
      subAccountCode: "SUB_ABC123",
      splitPercentage: 100,
      feeBearer: true,
      feePercentage: 100,
    });
  });

  it("rejects a split that does not total exactly 100", () => {
    expect(() => buildIncomeSplitConfig("SUB_ABC123", 90)).toThrow(
      SplitConfigError
    );
    expect(() =>
      assertSplitConfig([
        { subAccountCode: "SUB_A", splitPercentage: 60, feeBearer: true, feePercentage: 100 },
        { subAccountCode: "SUB_B", splitPercentage: 30, feeBearer: false, feePercentage: 0 },
      ])
    ).toThrow(/total exactly 100/);
  });

  it("accepts multi-way splits that total exactly 100", () => {
    const config = assertSplitConfig([
      { subAccountCode: "SUB_A", splitPercentage: 70, feeBearer: true, feePercentage: 100 },
      { subAccountCode: "SUB_B", splitPercentage: 30, feeBearer: false, feePercentage: 0 },
    ]);
    expect(config).toHaveLength(2);
  });

  it("rejects empty or malformed subaccount codes", () => {
    expect(() =>
      assertSplitConfig([
        { subAccountCode: "", splitPercentage: 100, feeBearer: true, feePercentage: 100 },
      ])
    ).toThrow(SplitConfigError);
  });
});
