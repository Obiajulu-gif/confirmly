import { NextRequest, NextResponse } from "next/server";
import { env, requireEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { verifyMetaSignature } from "@/lib/whatsapp/signature";
import {
  decryptFlowRequest,
  encryptFlowResponse,
  FlowDecryptionError,
  type EncryptedFlowRequest,
} from "@/lib/whatsapp/flow-crypto";
import { getValidFlowSession } from "@/lib/whatsapp/flow-session";
import { resolveFlowScreen } from "@/lib/whatsapp/flow-screens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WhatsApp Flow data-exchange endpoint.
 *
 * Meta encrypts each request with a one-time AES key wrapped by our RSA public
 * key. We: verify the request signature, decrypt the AES key and body, answer
 * the health-check ping, validate the flow_token against a stored session, and
 * return an AES-GCM response encrypted under the same key with the IV flipped.
 *
 * Status codes follow Meta's contract:
 *   421 — cannot decrypt (Meta refreshes our public key)
 *   427 — flow_token is unknown/expired (client marks the flow as done)
 *   432 — request signature failed
 */

function isEncryptedRequest(value: unknown): value is EncryptedFlowRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.encrypted_flow_data === "string" &&
    typeof body.encrypted_aes_key === "string" &&
    typeof body.initial_vector === "string"
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // 1. Private key must be configured to decrypt anything.
  let privateKey: string;
  let passphrase: string | undefined;
  try {
    const settings = requireEnv("WHATSAPP_FLOW_PRIVATE_KEY");
    privateKey = settings.WHATSAPP_FLOW_PRIVATE_KEY;
    passphrase = settings.WHATSAPP_FLOW_PRIVATE_KEY_PASSPHRASE;
  } catch {
    logger.error("flow endpoint hit but WHATSAPP_FLOW_PRIVATE_KEY is unset");
    return new NextResponse("Not configured", { status: 503 });
  }

  // 2. Verify Meta's signature over the raw body (same app secret as webhooks).
  const appSecret = env().WHATSAPP_APP_SECRET;
  if (appSecret) {
    const signature = request.headers.get("x-hub-signature-256");
    if (!verifyMetaSignature(rawBody, signature, appSecret)) {
      logger.warn("flow endpoint rejected: invalid signature");
      return new NextResponse("Invalid signature", { status: 432 });
    }
  }

  // 3. Parse the encrypted envelope.
  let envelope: unknown;
  try {
    envelope = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }
  if (!isEncryptedRequest(envelope)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  // 4. Decrypt. A key failure must surface as 421 so Meta refreshes the key.
  let decrypted;
  try {
    decrypted = decryptFlowRequest(envelope, privateKey, passphrase);
  } catch (error) {
    if (error instanceof FlowDecryptionError) {
      logger.warn("flow endpoint decryption failed; returning 421", {
        reason: error.message,
      });
      return new NextResponse("Failed to decrypt", { status: 421 });
    }
    logger.error("flow endpoint request body could not be decrypted", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return new NextResponse("Bad request", { status: 400 });
  }

  const { decryptedBody, aesKey, initialVector } = decrypted;
  const action = typeof decryptedBody.action === "string" ? decryptedBody.action : "";
  const encrypt = (payload: unknown) =>
    new NextResponse(encryptFlowResponse(payload, aesKey, initialVector), {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });

  // 5. Health check — Meta pings a live endpoint before publishing.
  if (action === "ping") {
    return encrypt({ data: { status: "active" } });
  }

  // 6. Error notification acknowledgement (client-reported data error).
  if (action === "data_exchange" && decryptedBody.data && typeof decryptedBody.data === "object") {
    const data = decryptedBody.data as Record<string, unknown>;
    if (data.error || data.error_message) {
      logger.warn("flow endpoint received client error", {
        error: String(data.error ?? data.error_message).slice(0, 200),
      });
      return encrypt({ data: { acknowledged: true } });
    }
  }

  // 7. Validate the flow_token against a stored, unexpired session.
  const flowToken =
    typeof decryptedBody.flow_token === "string" ? decryptedBody.flow_token : "";
  const session = await getValidFlowSession(flowToken);
  if (!session) {
    logger.warn("flow endpoint rejected: unknown or expired flow_token");
    return new NextResponse("Flow token invalid", { status: 427 });
  }

  // 8. Resolve the next screen entirely from PostgreSQL.
  try {
    const response = await resolveFlowScreen({
      action,
      screen: typeof decryptedBody.screen === "string" ? decryptedBody.screen : "",
      data:
        decryptedBody.data && typeof decryptedBody.data === "object"
          ? (decryptedBody.data as Record<string, unknown>)
          : {},
      flowToken,
      session,
    });
    return encrypt(response);
  } catch (error) {
    logger.error("flow endpoint screen resolution failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    // Still return an encrypted, well-formed error the client can render.
    return encrypt({
      screen: session.currentScreen || "SEARCH",
      data: { error_message: "Something went wrong. Please try again." },
    });
  }
}
