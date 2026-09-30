import "server-only";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Transactional email via Resend's HTTP API (no SDK needed). Email is
 * optional: when RESEND_API_KEY / EMAIL_FROM are unset, `sendEmail` reports
 * `not_configured` and callers fall back to showing the link in the UI.
 */

export type EmailResult =
  | { status: "sent"; id: string }
  | { status: "not_configured" }
  | { status: "failed"; reason: string };

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

export function isEmailConfigured(): boolean {
  const e = env();
  return Boolean(e.RESEND_API_KEY && e.EMAIL_FROM);
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<EmailResult> {
  const { RESEND_API_KEY, EMAIL_FROM } = env();
  if (!RESEND_API_KEY || !EMAIL_FROM) return { status: "not_configured" };

  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok || !data.id) {
      const reason = data.message ?? `HTTP ${response.status}`;
      logger.warn("email send failed", { reason });
      return { status: "failed", reason };
    }
    return { status: "sent", id: data.id };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "network error";
    logger.warn("email send failed", { reason });
    return { status: "failed", reason };
  }
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Invitation for a Branch Agent. The link carries the one-time token. */
export function agentInvitationEmail(input: {
  businessName: string;
  branchName: string;
  inviterName: string | null;
  link: string;
  expiresAt: Date;
}): { subject: string; html: string; text: string } {
  const expires = input.expiresAt.toLocaleDateString("en-NG", { dateStyle: "long" });
  const who = input.inviterName ? `${input.inviterName} from ${input.businessName}` : input.businessName;
  const subject = `You're invited to manage ${input.branchName} on Confirmly`;

  const text = [
    `${who} has invited you to manage the ${input.branchName} branch on Confirmly.`,
    "",
    "As a Branch Agent you can handle orders, chats and products for that branch.",
    "",
    `Accept the invitation: ${input.link}`,
    "",
    `This link works once and expires on ${expires}. If you weren't expecting it, you can ignore this email.`,
  ].join("\n");

  const b = escapeHtml(input.branchName);
  const html = `<!doctype html>
<html><body style="margin:0;background:#f8faf9;font-family:Arial,Helvetica,sans-serif;color:#111827">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px">
        <tr><td>
          <p style="margin:0 0 20px;font-size:18px;font-weight:bold;color:#17c19a">Confirmly</p>
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3">You're invited to manage ${b}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151">
            ${escapeHtml(who)} has invited you to join as a <strong>Branch Agent</strong> for
            <strong>${b}</strong>. You'll be able to handle orders, chats and products for that branch.
          </p>
          <p style="margin:24px 0">
            <a href="${escapeHtml(input.link)}" style="display:inline-block;background:#17c19a;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:999px">Accept invitation</a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6b7280">
            Or paste this link into your browser:<br>
            <span style="word-break:break-all;color:#0d8067">${escapeHtml(input.link)}</span>
          </p>
          <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#6b7280">
            This link works once and expires on ${escapeHtml(expires)}. If you weren't expecting it, you can ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html, text };
}
