/**
 * Pure eligibility policy for the abandoned-order nudge. No DB, no server-only
 * imports, so it is unit-testable in isolation and is the single source of
 * truth for the timing rules (mirrored by the DB query in nudge.ts and applied
 * again per-row as a guard).
 */

export const MIN_IDLE_MINUTES = 60;
export const WINDOW_HOURS = 24;

export interface NudgeCandidate {
  state: string;
  automationMode: string;
  lastInboundAt: Date | null;
  lastNudgeAt: Date | null;
  optedIn: boolean;
}

/**
 * True when a conversation should receive its one nudge: automated, stalled at
 * confirmation/payment, opted in, never nudged, idle past the minimum, and
 * still inside WhatsApp's 24-hour customer-service window.
 */
export function isNudgeEligible(
  candidate: NudgeCandidate,
  now: number = Date.now()
): boolean {
  if (candidate.automationMode !== "AUTO") return false;
  if (
    candidate.state !== "AWAITING_CONFIRMATION" &&
    candidate.state !== "PAYMENT_PENDING"
  ) {
    return false;
  }
  if (candidate.lastNudgeAt) return false;
  if (!candidate.optedIn) return false;
  if (!candidate.lastInboundAt) return false;

  const idleMs = now - candidate.lastInboundAt.getTime();
  return (
    idleMs >= MIN_IDLE_MINUTES * 60_000 &&
    idleMs <= WINDOW_HOURS * 60 * 60_000
  );
}
