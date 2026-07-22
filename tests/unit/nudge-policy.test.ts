import { describe, expect, it } from "vitest";
import {
  isNudgeEligible,
  MIN_IDLE_MINUTES,
  WINDOW_HOURS,
  type NudgeCandidate,
} from "@/lib/orders/nudge-policy";

const NOW = Date.parse("2026-07-22T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000);
const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60_000);

const base: NudgeCandidate = {
  state: "AWAITING_CONFIRMATION",
  automationMode: "AUTO",
  lastInboundAt: hoursAgo(3),
  lastNudgeAt: null,
  optedIn: true,
};

describe("isNudgeEligible", () => {
  it("nudges a stalled, in-window, opted-in, never-nudged conversation", () => {
    expect(isNudgeEligible(base, NOW)).toBe(true);
    expect(
      isNudgeEligible({ ...base, state: "PAYMENT_PENDING" }, NOW)
    ).toBe(true);
  });

  it("skips conversations in a human handover", () => {
    expect(isNudgeEligible({ ...base, automationMode: "HUMAN" }, NOW)).toBe(false);
  });

  it("skips states other than confirmation/payment", () => {
    for (const state of ["NEW", "COLLECTING_ORDER", "PAID", "CANCELLED"]) {
      expect(isNudgeEligible({ ...base, state }, NOW)).toBe(false);
    }
  });

  it("never nudges twice (lastNudgeAt already set)", () => {
    expect(
      isNudgeEligible({ ...base, lastNudgeAt: minutesAgo(90) }, NOW)
    ).toBe(false);
  });

  it("respects opt-out", () => {
    expect(isNudgeEligible({ ...base, optedIn: false }, NOW)).toBe(false);
  });

  it("does not nudge before the minimum idle time", () => {
    expect(
      isNudgeEligible(
        { ...base, lastInboundAt: minutesAgo(MIN_IDLE_MINUTES - 1) },
        NOW
      )
    ).toBe(false);
  });

  it("does not nudge outside WhatsApp's 24-hour window", () => {
    expect(
      isNudgeEligible(
        { ...base, lastInboundAt: hoursAgo(WINDOW_HOURS + 1) },
        NOW
      )
    ).toBe(false);
  });

  it("requires a last inbound timestamp", () => {
    expect(isNudgeEligible({ ...base, lastInboundAt: null }, NOW)).toBe(false);
  });
});
