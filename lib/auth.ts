import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { compare } from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { requireEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export const SESSION_COOKIE = "confirmly_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  userId: string;
  merchantId: string;
  email: string;
}

function secretKey(): Uint8Array {
  const { AUTH_SECRET } = requireEnv("AUTH_SECRET");
  return new TextEncoder().encode(AUTH_SECRET);
}

export async function createSessionToken(
  payload: SessionPayload
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("confirmly")
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: "confirmly",
    });
    if (
      typeof payload.userId === "string" &&
      typeof payload.merchantId === "string" &&
      typeof payload.email === "string"
    ) {
      return {
        userId: payload.userId,
        merchantId: payload.merchantId,
        email: payload.email,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Reads and verifies the session cookie. Returns null when signed out. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password");
    this.name = "InvalidCredentialsError";
  }
}

/**
 * Verifies credentials and returns a signed session token.
 * Uses a constant-shape flow so missing users and bad passwords are
 * indistinguishable to the caller.
 */
export async function authenticate(
  email: string,
  password: string
): Promise<{ token: string; payload: SessionPayload }> {
  const user = await prisma.merchantUser.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  const hash =
    user?.passwordHash ??
    // Dummy hash keeps timing comparable when the user doesn't exist.
    "$2b$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpUXn3mJd0mE1v0T1F3T8x1M9bXcW";
  const ok = await compare(password, hash);
  if (!ok || !user) throw new InvalidCredentialsError();

  await prisma.merchantUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  const payload: SessionPayload = {
    userId: user.id,
    merchantId: user.merchantId,
    email: user.email,
  };
  const token = await createSessionToken(payload);
  logger.info("merchant login", { userId: user.id });
  return { token, payload };
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
