import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { compare, hash } from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { requireEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export const SESSION_COOKIE = "confirmly_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  userId: string;
  email: string;
  /** Active merchant (null until business onboarding creates one). */
  merchantId: string | null;
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
      typeof payload.email === "string" &&
      (typeof payload.merchantId === "string" || payload.merchantId === null)
    ) {
      return {
        userId: payload.userId,
        email: payload.email,
        merchantId: (payload.merchantId as string | null) ?? null,
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

/**
 * Session with a verified merchant membership. The merchant id inside the
 * signed JWT is convenient, but sensitive paths re-verify membership in the
 * database so a stale or forged claim can never cross tenants.
 */
export async function getMerchantSession(): Promise<
  (SessionPayload & { merchantId: string }) | null
> {
  const session = await getSession();
  if (!session?.merchantId) return null;
  const membership = await prisma.merchantMembership.findUnique({
    where: {
      userId_merchantId: {
        userId: session.userId,
        merchantId: session.merchantId,
      },
    },
  });
  if (!membership) return null;
  return { ...session, merchantId: session.merchantId };
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password");
    this.name = "InvalidCredentialsError";
  }
}

export class EmailInUseError extends Error {
  constructor() {
    super("An account with this email already exists");
    this.name = "EmailInUseError";
  }
}

const DUMMY_HASH =
  "$2b$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpUXn3mJd0mE1v0T1F3T8x1M9bXcW";

/** Resolves the merchant this user acts for (first membership wins). */
async function resolveMerchantId(userId: string): Promise<string | null> {
  const membership = await prisma.merchantMembership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return membership?.merchantId ?? null;
}

export async function authenticate(
  email: string,
  password: string
): Promise<{ token: string; payload: SessionPayload }> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  const ok = await compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!ok || !user) throw new InvalidCredentialsError();

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    merchantId: await resolveMerchantId(user.id),
  };
  const token = await createSessionToken(payload);
  logger.info("user login", { userId: user.id });
  return { token, payload };
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ token: string; payload: SessionPayload }> {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new EmailInUseError();

  const user = await prisma.user.create({
    data: {
      name: input.name.trim().slice(0, 100),
      email,
      passwordHash: await hash(input.password, 12),
      lastLoginAt: new Date(),
    },
  });
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    merchantId: null,
  };
  const token = await createSessionToken(payload);
  logger.info("user registered", { userId: user.id });
  return { token, payload };
}

/** Re-checks the password for sensitive changes (settlement account). */
export async function reauthenticate(
  userId: string,
  password: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return compare(password, user?.passwordHash ?? DUMMY_HASH);
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
