import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { agentInvitationEmail, isEmailConfigured, sendEmail } from "@/lib/email";

const message = { to: "agent@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" };

describe("sendEmail", () => {
  const saved = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM };

  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    resetEnvCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (saved.key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = saved.key;
    if (saved.from === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = saved.from;
    resetEnvCache();
  });

  it("reports not_configured without calling the provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(isEmailConfigured()).toBe(false);
    await expect(sendEmail(message)).resolves.toEqual({ status: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to Resend and returns the message id", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "Confirmly <invites@example.com>";
    resetEnvCache();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email_123" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendEmail({ ...message, replyTo: "owner@example.com" })).resolves.toEqual({
      status: "sent",
      id: "email_123",
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      from: "Confirmly <invites@example.com>",
      to: ["agent@example.com"],
      reply_to: "owner@example.com",
    });
  });

  it("returns failed with the provider's reason when rejected", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "Confirmly <invites@example.com>";
    resetEnvCache();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 })
      )
    );
    await expect(sendEmail(message)).resolves.toEqual({
      status: "failed",
      reason: "domain not verified",
    });
  });
});

describe("agentInvitationEmail", () => {
  const base = {
    businessName: "Ada Styles",
    branchName: "Yaba",
    inviterName: "Ada",
    link: "https://confirmly.example/invite/abc123",
    expiresAt: new Date("2026-10-07T12:00:00Z"),
  };

  it("names the branch and carries the one-time link", () => {
    const email = agentInvitationEmail(base);
    expect(email.subject).toContain("Yaba");
    expect(email.text).toContain(base.link);
    expect(email.html).toContain(`href="${base.link}"`);
    expect(email.text).toContain("Ada from Ada Styles");
  });

  it("escapes merchant-supplied names in the HTML body", () => {
    const email = agentInvitationEmail({ ...base, branchName: `<script>alert("x")</script>` });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});
