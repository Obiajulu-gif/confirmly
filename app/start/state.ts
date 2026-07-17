export interface OnboardingState {
  ok: boolean;
  error: string | null;
  waLink: string | null;
  merchantName: string | null;
  knownZone: string | null;
  customerName: string | null;
}

export const INITIAL_ONBOARDING_STATE: OnboardingState = {
  ok: false,
  error: null,
  waLink: null,
  merchantName: null,
  knownZone: null,
  customerName: null,
};
