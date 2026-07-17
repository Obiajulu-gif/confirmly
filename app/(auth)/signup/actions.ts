"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  EmailInUseError,
  registerUser,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export interface SignupState {
  error: string | null;
}

const signupSchema = z
  .object({
    name: z.string().min(2, "Enter your full name").max(100),
    email: z.string().email("Enter a valid work email"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(100),
    confirmPassword: z.string(),
    terms: z.literal("on", {
      errorMap: () => ({ message: "Please accept the Terms and Privacy Policy" }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function signupAction(
  _prev: SignupState,
  formData: FormData
): Promise<SignupState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    terms: formData.get("terms"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details" };
  }

  const limited = rateLimit(`signup:${parsed.data.email.toLowerCase()}`, {
    limit: 5,
    windowMs: 10 * 60_000,
  });
  if (!limited.ok) {
    return { error: `Too many attempts. Try again in ${limited.retryAfterSeconds}s.` };
  }

  try {
    const { token } = await registerUser({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
    });
    const store = await cookies();
    store.set(SESSION_COOKIE, token, sessionCookieOptions());
  } catch (err) {
    if (err instanceof EmailInUseError) {
      return { error: "An account with this email already exists. Try logging in." };
    }
    return { error: "Sign-up is temporarily unavailable. Please try again." };
  }
  redirect("/onboarding");
}
