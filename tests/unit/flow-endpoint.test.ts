import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  constants,
  createCipheriv,
  createDecipheriv,
  createHmac,
  generateKeyPairSync,
  publicEncrypt,
  randomBytes,
} from "node:crypto";
import { resetEnvCache } from "@/lib/env";
import {
  isFlowSessionUsable,
  type FlowOrderState,
} from "@/lib/whatsapp/flow-session";

// Mock only the two Flow-specific modules so no database is touched. The route
// still runs its real signature check, decryption, and status-code logic.
const { getValidFlowSession, resolveFlowScreen } = vi.hoisted(() => ({
  getValidFlowSession: vi.fn(),
  resolveFlowScreen: vi.fn(),
}));
vi.mock("@/lib/whatsapp/flow-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/whatsapp/flow-session")>();
  return { ...actual, getValidFlowSession };
});
vi.mock("@/lib/whatsapp/flow-screens", () => ({ resolveFlowScreen }));

import { POST } from "@/app/api/whatsapp/flow/route";

const APP_SECRET = "test-app-secret";
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function encryptAsMeta(body: unknown) {
  const aesKey = randomBytes(16);
  const iv = randomBytes(16);
  const encryptedAesKey = publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    aesKey
  );
  const cipher = createCipheriv("aes-128-gcm", aesKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(body), "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return {
    envelope: {
      encrypted_flow_data: ciphertext.toString("base64"),
      encrypted_aes_key: encryptedAesKey.toString("base64"),
      initial_vector: iv.toString("base64"),
    },
    aesKey,
    iv,
  };
}

function decryptAsMeta(base64: string, aesKey: Buffer, iv: Buffer) {
  const flippedIv = Buffer.from(iv.map((byte) => byte ^ 0xff));
  const payload = Buffer.from(base64, "base64");
  const tag = payload.subarray(payload.length - 16);
  const decipher = createDecipheriv("aes-128-gcm", aesKey, flippedIv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([
    decipher.update(payload.subarray(0, payload.length - 16)),
    decipher.final(),
  ]);
  return JSON.parse(plain.toString("utf8"));
}

function makeRequest(envelope: unknown, secret = APP_SECRET) {
  const rawBody = JSON.stringify(envelope);
  const signature = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  return new NextRequest("https://confirmly.test/api/whatsapp/flow", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signature,
    },
    body: rawBody,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WHATSAPP_FLOW_PRIVATE_KEY = privateKey;
  delete process.env.WHATSAPP_FLOW_PRIVATE_KEY_PASSPHRASE;
  process.env.WHATSAPP_APP_SECRET = APP_SECRET;
  resetEnvCache();
});

describe("flow endpoint", () => {
  it("answers the health-check ping without touching a session", async () => {
    const { envelope, aesKey, iv } = encryptAsMeta({
      version: "3.0",
      action: "ping",
    });

    const res = await POST(makeRequest(envelope));

    expect(res.status).toBe(200);
    expect(decryptAsMeta(await res.text(), aesKey, iv)).toEqual({
      data: { status: "active" },
    });
    expect(getValidFlowSession).not.toHaveBeenCalled();
  });

  it("returns 421 when the request cannot be decrypted", async () => {
    const { envelope } = encryptAsMeta({ version: "3.0", action: "ping" });
    const corrupted = {
      ...envelope,
      encrypted_aes_key: randomBytes(256).toString("base64"),
    };

    const res = await POST(makeRequest(corrupted));

    expect(res.status).toBe(421);
  });

  it("returns 432 when the request signature is invalid", async () => {
    const { envelope } = encryptAsMeta({ version: "3.0", action: "ping" });

    const res = await POST(makeRequest(envelope, "wrong-secret"));

    expect(res.status).toBe(432);
  });

  it("returns 427 for an unknown or expired flow_token", async () => {
    getValidFlowSession.mockResolvedValue(null); // expired/unknown → null
    const { envelope } = encryptAsMeta({
      version: "3.0",
      action: "data_exchange",
      screen: "START",
      data: { entry_point: "search" },
      flow_token: "expired-token",
    });

    const res = await POST(makeRequest(envelope));

    expect(res.status).toBe(427);
    expect(getValidFlowSession).toHaveBeenCalledWith("expired-token");
    expect(resolveFlowScreen).not.toHaveBeenCalled();
  });

  it("advances a screen for a valid session (happy path)", async () => {
    const session = { id: "sess_1", currentScreen: "SEARCH" };
    getValidFlowSession.mockResolvedValue(session);
    const nextScreen = {
      screen: "STORE",
      data: { store_name: "Ada Styles", products: [] },
    };
    resolveFlowScreen.mockResolvedValue(nextScreen);

    const { envelope, aesKey, iv } = encryptAsMeta({
      version: "3.0",
      action: "data_exchange",
      screen: "SEARCH",
      data: { store_id: "m1" },
      flow_token: "good-token",
    });

    const res = await POST(makeRequest(envelope));

    expect(res.status).toBe(200);
    expect(decryptAsMeta(await res.text(), aesKey, iv)).toEqual(nextScreen);
    expect(resolveFlowScreen).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "data_exchange",
        screen: "SEARCH",
        flowToken: "good-token",
        session,
      })
    );
  });
});

describe("isFlowSessionUsable", () => {
  const base: Pick<
    { completedAt: Date | null; expiresAt: Date },
    "completedAt" | "expiresAt"
  > = { completedAt: null, expiresAt: new Date(Date.now() + 60_000) };

  it("accepts a fresh, uncompleted session", () => {
    expect(isFlowSessionUsable(base)).toBe(true);
  });

  it("rejects an expired session", () => {
    expect(
      isFlowSessionUsable({ ...base, expiresAt: new Date(Date.now() - 1_000) })
    ).toBe(false);
  });

  it("rejects an already-completed session", () => {
    expect(isFlowSessionUsable({ ...base, completedAt: new Date() })).toBe(false);
  });
});

// Compile-time guard: the endpoint's state contract stays in sync.
const _stateSample: FlowOrderState = { merchantId: "m", productId: "p", quantity: 1 };
void _stateSample;
