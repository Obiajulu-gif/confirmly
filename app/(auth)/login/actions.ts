"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  authenticate,
  InvalidCredentialsError,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export interface LoginState {
  error: string | null;
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
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? "/dashboard",
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }
  const { email, password, next } = parsed.data;

  const limited = rateLimit(`login:${email.toLowerCase()}`, {
    limit: 8,
    windowMs: 5 * 60_000,
  });
  if (!limited.ok) {
    return {
      error: `Too many attempts. Try again in ${limited.retryAfterSeconds}s.`,
    };
  }

  try {
    const { token } = await authenticate(email, password);
    const store = await cookies();
    store.set(SESSION_COOKIE, token, sessionCookieOptions());
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      return { error: "Invalid email or password." };
    }
    return { error: "Sign-in is temporarily unavailable. Try again shortly." };
  }
  redirect(next.startsWith("/dashboard") || next === "/" ? next : "/dashboard");
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
