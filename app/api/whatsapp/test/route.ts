import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMerchantSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { sendTemplate, sendText, WhatsAppSendError } from "@/lib/whatsapp/client";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const bodySchema = z.object({
  to: z
    .string()
    .regex(/^\+?[0-9]{10,15}$/, "to must be an international phone number"),
  mode: z.enum(["template", "text"]).default("template"),
  text: z.string().max(500).optional(),
});

/**
 * Merchant-only test send. Note: Meta's test number can only message
 * recipients added as verified test numbers in the Meta dashboard.
 */
export async function POST(request: NextRequest) {
  const session = await getMerchantSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const limited = rateLimit(`wa-test:${session.userId}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate limited", retryAfterSeconds: limited.retryAfterSeconds },
      { status: 429 }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid body" },
      { status: 400 }
    );
  }
  const { to, mode, text } = parsed.data;
  const normalizedTo = to.replace(/^\+/, "");

  try {
    const result =
      mode === "text" && text
        ? await sendText(normalizedTo, text)
        : await sendTemplate(normalizedTo);
    logger.info("whatsapp test message sent", { mode });
    return NextResponse.json({
      ok: true,
      providerMessageId: result.providerMessageId,
      note: "Meta test numbers can only send to verified test recipients.",
    });
  } catch (err) {
    if (err instanceof WhatsAppSendError) {
      if (err.errorCode === 131030) {
        return NextResponse.json(
          {
            ok: false,
            error: "recipient_not_allowed",
            providerMessage: err.message,
            code: err.errorCode,
            action:
              "In Meta Developers, open WhatsApp > API Setup, add this phone number under the recipient 'To' list, complete OTP verification, then retry.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { ok: false, error: err.message, status: err.status, code: err.errorCode },
        { status: 502 }
      );
    }
    throw err;
  }
}
