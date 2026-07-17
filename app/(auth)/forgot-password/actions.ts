"use server";

import { createHash, randomBytes } from "crypto";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

export interface ForgotState {
  message: string | null;
  error: string | null;
  done: boolean;
}

const RESET_TTL_MS = 30 * 60_000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function requestResetAction(
  _prev: ForgotState,
  formData: FormData
): Promise<ForgotState> {
  const email = z
    .string()
    .email()
    .safeParse(formData.get("email"));
  if (!email.success) {
    return { message: null, error: "Enter a valid email address.", done: false };
  }
  const limited = rateLimit(`reset:${email.data.toLowerCase()}`, {
    limit: 3,
    windowMs: 15 * 60_000,
  });
  if (!limited.ok) {
    return {
      message: null,
      error: `Too many requests. Try again in ${limited.retryAfterSeconds}s.`,
      done: false,
    };
  }

  const user = await prisma.user.findUnique({
    where: { email: email.data.toLowerCase() },
  });
  if (user) {
    const token = randomBytes(32).toString("base64url");
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    // No email provider is configured in this build — the reset link is
    // written to the server log for the operator to relay.
    logger.info("password reset link issued", {
      resetUrl: `${env().APP_URL}/forgot-password?token=${token}`,
    });
  }
  return {
    message:
      "If an account exists for that email, a reset link has been issued. This demo has no email service — the operator can find the link in the server logs.",
    error: null,
    done: false,
  };
}

const resetSchema = z
  .object({
    token: z.string().min(20),
    password: z.string().min(8).max(100),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
  });

export async function resetPasswordAction(
  _prev: ForgotState,
  formData: FormData
): Promise<ForgotState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return {
      message: null,
      error: parsed.error.issues[0]?.message ?? "Check your input.",
      done: false,
    };
  }
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return {
      message: null,
      error: "This reset link is invalid or has expired. Request a new one.",
      done: false,
    };
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hash(parsed.data.password, 12) },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);
  return {
    message: "Password updated. You can now log in with your new password.",
    error: null,
    done: true,
  };
}
