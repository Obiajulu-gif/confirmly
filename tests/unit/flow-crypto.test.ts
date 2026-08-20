import { describe, it, expect } from "vitest";
import {
  constants,
  createCipheriv,
  createDecipheriv,
  generateKeyPairSync,
  publicEncrypt,
  randomBytes,
} from "node:crypto";
import {
  decryptFlowRequest,
  encryptFlowResponse,
  FlowDecryptionError,
} from "@/lib/whatsapp/flow-crypto";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

/** Builds the encrypted envelope exactly as Meta's servers would. */
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

/** Decrypts our response the way Meta's client does (IV bitwise-flipped). */
function decryptAsMeta(base64: string, aesKey: Buffer, iv: Buffer) {
  const flippedIv = Buffer.from(iv.map((byte) => byte ^ 0xff));
  const payload = Buffer.from(base64, "base64");
  const tag = payload.subarray(payload.length - 16);
  const ciphertext = payload.subarray(0, payload.length - 16);
  const decipher = createDecipheriv("aes-128-gcm", aesKey, flippedIv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plain.toString("utf8"));
}

describe("flow-crypto", () => {
  it("decrypts a Meta-encrypted request body", () => {
    const body = { version: "3.0", action: "data_exchange", flow_token: "abc" };
    const { envelope, aesKey, iv } = encryptAsMeta(body);

    const result = decryptFlowRequest(envelope, privateKey);

    expect(result.decryptedBody).toEqual(body);
    expect(result.aesKey.equals(aesKey)).toBe(true);
    expect(result.initialVector.equals(iv)).toBe(true);
  });

  it("encrypts a response Meta can read with the flipped IV", () => {
    const { envelope, aesKey, iv } = encryptAsMeta({ action: "ping" });
    const { aesKey: k, initialVector } = decryptFlowRequest(envelope, privateKey);

    const encrypted = encryptFlowResponse(
      { data: { status: "active" } },
      k,
      initialVector
    );

    expect(decryptAsMeta(encrypted, aesKey, iv)).toEqual({
      data: { status: "active" },
    });
  });

  it("throws FlowDecryptionError (→ HTTP 421) when the AES key is unreadable", () => {
    const { envelope } = encryptAsMeta({ action: "ping" });
    const corrupted = {
      ...envelope,
      encrypted_aes_key: randomBytes(256).toString("base64"),
    };

    expect(() => decryptFlowRequest(corrupted, privateKey)).toThrow(
      FlowDecryptionError
    );
  });

  it("rejects a wrong private key with FlowDecryptionError", () => {
    const { envelope } = encryptAsMeta({ action: "ping" });
    const other = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    }).privateKey;

    expect(() => decryptFlowRequest(envelope, other)).toThrow(
      FlowDecryptionError
    );
  });
});
