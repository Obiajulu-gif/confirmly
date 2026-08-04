"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  authenticate,
  InvalidCredentialsError,
  isAdminEmail,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export interface LoginState {
  error: string | null;
  /** Echoed back so the email field survives a failed submit. */
  email?: string;
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().startsWith("/").catch("/dashboard"),
});

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  // Echoed back on any failure so the typed email survives the re-render.
  const rawEmail = String(formData.get("email") ?? "").slice(0, 200);
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? "/dashboard",
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password.", email: rawEmail };
  }
  const { email, password, next } = parsed.data;

  const limited = rateLimit(`login:${email.toLowerCase()}`, {
    limit: 8,
    windowMs: 5 * 60_000,
  });
  if (!limited.ok) {
    return {
      error: `Too many attempts. Try again in ${limited.retryAfterSeconds}s.`,
      email: rawEmail,
    };
  }

  let hasMerchant = false;
  try {
    const { token, payload } = await authenticate(email, password);
    hasMerchant = payload.merchantId !== null;
    const store = await cookies();
    store.set(SESSION_COOKIE, token, sessionCookieOptions());
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      return { error: "Invalid email or password.", email: rawEmail };
    }
    return {
      error: "Sign-in is temporarily unavailable. Try again shortly.",
      email: rawEmail,
    };
  }
  // A platform admin with no store of their own lands on the admin console
  // rather than being pushed through merchant onboarding.
  if (!hasMerchant && isAdminEmail(email)) redirect("/admin");
  if (!hasMerchant) redirect("/onboarding");
  redirect(next.startsWith("/dashboard") || next === "/" ? next : "/dashboard");
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
