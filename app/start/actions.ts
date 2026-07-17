"use server";

import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import {
  OnboardingError,
  saveCustomerProfile,
} from "@/lib/orders/onboarding";
import { INITIAL_ONBOARDING_STATE, type OnboardingState } from "./state";

const schema = z.object({
  name: z.string().min(2).max(80),
  phone: z.string().min(7).max(24),
  area: z.string().max(60).optional().or(z.literal("")),
  address: z.string().max(200).optional().or(z.literal("")),
  storeCode: z.string().max(24).optional().or(z.literal("")),
});

export async function startOrderAction(
  _prev: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    area: formData.get("area") ?? "",
    address: formData.get("address") ?? "",
    storeCode: formData.get("storeCode") ?? "",
  });
  if (!parsed.success) {
    return {
      ...INITIAL_ONBOARDING_STATE,
      error: "Please check your name and WhatsApp number.",
    };
  }

  const limited = rateLimit(`onboard:${parsed.data.phone.replace(/\D/g, "")}`, {
    limit: 6,
    windowMs: 5 * 60_000,
  });
  if (!limited.ok) {
    return {
      ...INITIAL_ONBOARDING_STATE,
      error: `Too many attempts — try again in ${limited.retryAfterSeconds}s.`,
    };
  }

  try {
    const result = await saveCustomerProfile({
      name: parsed.data.name,
      phone: parsed.data.phone,
      area: parsed.data.area || null,
      address: parsed.data.address || null,
      storeCode: parsed.data.storeCode || null,
    });
    return {
      ok: true,
      error: null,
      waLink: result.waLink,
      merchantName: result.merchantName,
      knownZone: result.knownZone,
      customerName: parsed.data.name.trim(),
    };
  } catch (err) {
    return {
      ...INITIAL_ONBOARDING_STATE,
      error:
        err instanceof OnboardingError
          ? err.message
          : "Something went wrong saving your details. Please try again.",
    };
  }
}
