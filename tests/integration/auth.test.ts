import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  authenticate,
  createSessionToken,
  EmailInUseError,
  InvalidCredentialsError,
  reauthenticate,
  registerUser,
  verifySessionToken,
} from "@/lib/auth";
import { createBusinessForUser } from "@/lib/merchants/service";

const email = `auth-test-${Date.now()}@example.com`;
const password = "correct-horse-battery";
let userId: string;
let merchantId: string | null = null;

afterAll(async () => {
  if (merchantId) {
    await prisma.merchant.delete({ where: { id: merchantId } }).catch(() => {});
  }
  await prisma.user.deleteMany({ where: { email } });
});

describe("registration and sessions", () => {
  it("signs up a user with a hashed password", async () => {
    const { payload } = await registerUser({
      name: "Auth Tester",
      email,
      password,
    });
    userId = payload.userId;
    expect(payload.merchantId).toBeNull();

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).not.toContain(password);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt
  });

  it("rejects duplicate emails", async () => {
    await expect(
      registerUser({ name: "Copycat", email, password: "another-pass-123" })
    ).rejects.toThrow(EmailInUseError);
  });

  it("logs in with correct credentials and rejects wrong ones", async () => {
    const { payload } = await authenticate(email, password);
    expect(payload.userId).toBe(userId);
    await expect(authenticate(email, "wrong-password")).rejects.toThrow(
      InvalidCredentialsError
    );
    await expect(
      authenticate("nobody@example.com", password)
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("session tokens round-trip and tampered tokens fail", async () => {
    const token = await createSessionToken({
      userId,
      email,
      merchantId: null,
    });
    const payload = await verifySessionToken(token);
    expect(payload?.userId).toBe(userId);
    expect(await verifySessionToken(token.slice(0, -2) + "xx")).toBeNull();
  });

  it("reauthentication verifies the password for sensitive changes", async () => {
    expect(await reauthenticate(userId, password)).toBe(true);
    expect(await reauthenticate(userId, "nope")).toBe(false);
  });

  it("business registration creates an explicit membership and store code", async () => {
    const merchant = await createBusinessForUser(userId, {
      name: `Auth Test Shop ${Date.now().toString(36)}`,
      category: "Testing",
    });
    merchantId = merchant.id;
    expect(merchant.storeCode).toMatch(/^[A-Z0-9]{3,16}$/);

    const membership = await prisma.merchantMembership.findUnique({
      where: { userId_merchantId: { userId, merchantId: merchant.id } },
    });
    expect(membership?.role).toBe("OWNER");

    const { payload } = await authenticate(email, password);
    expect(payload.merchantId).toBe(merchant.id);
  });
});
