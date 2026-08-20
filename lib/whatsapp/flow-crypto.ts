import "server-only";
import {
  constants,
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  privateDecrypt,
  type KeyObject,
} from "node:crypto";

/**
 * Encryption for the WhatsApp Flow data-exchange endpoint, per Meta's spec:
 *
 *  - Meta encrypts a per-request AES key with our RSA public key (RSA-OAEP,
 *    SHA-256) and the request body with AES-GCM under that key.
 *  - We decrypt the AES key with our RSA private key, then the body with the
 *    supplied IV (the GCM tag is the last 16 bytes of the ciphertext).
 *  - The response is AES-GCM encrypted under the SAME key with the IV bitwise
 *    inverted ("flipped"), returned base64 as ciphertext||tag.
 *
 * A decryption failure must surface as HTTP 421 so Meta refreshes the key.
 */

const TAG_LENGTH = 16;

/** Thrown when the AES key cannot be decrypted — caller returns HTTP 421. */
export class FlowDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlowDecryptionError";
  }
}

export interface EncryptedFlowRequest {
  encrypted_flow_data: string;
  encrypted_aes_key: string;
  initial_vector: string;
}

export interface DecryptedFlowRequest {
  decryptedBody: Record<string, unknown>;
  aesKey: Buffer;
  initialVector: Buffer;
}

function loadPrivateKey(pem: string, passphrase?: string): KeyObject {
  try {
    return createPrivateKey({
      key: pem,
      ...(passphrase ? { passphrase } : {}),
    });
  } catch (err) {
    throw new FlowDecryptionError(
      `invalid flow private key: ${err instanceof Error ? err.message : "unknown"}`
    );
  }
}

/** AES-GCM cipher name from the decrypted key length (Meta uses 128-bit). */
function gcmAlgorithm(aesKey: Buffer): "aes-128-gcm" | "aes-192-gcm" | "aes-256-gcm" {
  switch (aesKey.length) {
    case 16:
      return "aes-128-gcm";
    case 24:
      return "aes-192-gcm";
    case 32:
      return "aes-256-gcm";
    default:
      throw new FlowDecryptionError(`unexpected AES key length ${aesKey.length}`);
  }
}

/** Decrypts an encrypted Flow request. Throws FlowDecryptionError on failure. */
export function decryptFlowRequest(
  body: EncryptedFlowRequest,
  privateKeyPem: string,
  passphrase?: string
): DecryptedFlowRequest {
  const privateKey = loadPrivateKey(privateKeyPem, passphrase);

  let aesKey: Buffer;
  try {
    aesKey = privateDecrypt(
      {
        key: privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(body.encrypted_aes_key, "base64")
    );
  } catch (err) {
    throw new FlowDecryptionError(
      `failed to decrypt AES key: ${err instanceof Error ? err.message : "unknown"}`
    );
  }

  const initialVector = Buffer.from(body.initial_vector, "base64");
  const flowData = Buffer.from(body.encrypted_flow_data, "base64");
  const ciphertext = flowData.subarray(0, flowData.length - TAG_LENGTH);
  const authTag = flowData.subarray(flowData.length - TAG_LENGTH);

  let decryptedJson: string;
  try {
    const decipher = createDecipheriv(gcmAlgorithm(aesKey), aesKey, initialVector, {
      authTagLength: TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);
    decryptedJson = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch (err) {
    // A body/tag failure is not a key problem — surface as a generic error, not 421.
    throw new Error(
      `failed to decrypt flow body: ${err instanceof Error ? err.message : "unknown"}`
    );
  }

  let decryptedBody: Record<string, unknown>;
  try {
    decryptedBody = JSON.parse(decryptedJson) as Record<string, unknown>;
  } catch {
    throw new Error("decrypted flow body was not valid JSON");
  }

  return { decryptedBody, aesKey, initialVector };
}

/** Encrypts the response under the same AES key with the IV bitwise-flipped. */
export function encryptFlowResponse(
  response: unknown,
  aesKey: Buffer,
  initialVector: Buffer
): string {
  const flippedIv = Buffer.from(initialVector.map((byte) => byte ^ 0xff));
  const cipher = createCipheriv(gcmAlgorithm(aesKey), aesKey, flippedIv, {
    authTagLength: TAG_LENGTH,
  });
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(response), "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return encrypted.toString("base64");
}
