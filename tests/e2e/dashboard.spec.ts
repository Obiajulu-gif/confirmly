import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Browser tests: landing, login, dashboard navigation, products, orders,
 * receipt verification, mobile layout. Demo credentials come from .env.local
 * (never hardcoded).
 */

function envLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  const file = path.join(process.cwd(), ".env.local");
  const text = readFileSync(file, "utf8").replace(/^﻿/, "");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m && m[1]) out[m[1]] = (m[2] ?? "").trim().replace(/^"(.*)"$/, "$1");
  }
  return out;
}

const creds = envLocal();

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(creds.DEMO_MERCHANT_EMAIL ?? "");
  await page.getByLabel("Password").fill(creds.DEMO_MERCHANT_PASSWORD ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();
  // First hit compiles the action route and opens a cold TLS connection to
  // the remote database — allow generous time.
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test("landing page shows the headline and CTAs without emoji", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Turn WhatsApp orders into verified payments.",
    })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create business account" }).first()
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View product flow" })
  ).toBeVisible();

  // Fintech rule: the landing page contains no emoji.
  const text = await page.evaluate(() => document.body.innerText);
  const emoji = text.match(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu);
  expect(emoji ?? []).toEqual([]);
});

test("merchant signup creates an account and lands on onboarding", async ({
  page,
}) => {
  const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Playwright Merchant");
  await page.getByLabel("Work email").fill(`e2e-${unique}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("playwright-pass-1");
  await page.getByLabel("Confirm password").fill("playwright-pass-1");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create business account" }).click();
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: "Set up your business" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Tell us about your business" })
  ).toBeVisible();
});

test("unauthenticated dashboard access redirects to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("wrong credentials are rejected", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Filter out Next.js's route announcer, which also has role="alert".
  await expect(
    page.getByRole("alert").filter({ hasText: "Invalid" })
  ).toContainText("Invalid", { timeout: 30_000 });
});

test("merchant can log in and navigate the dashboard", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Integration health")).toBeVisible();

  await page.getByRole("link", { name: "Orders" }).first().click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();

  await page.getByRole("link", { name: "Products" }).first().click();
  await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  await expect(page.getByText("Classic Polo Shirt").first()).toBeVisible();
  await expect(page.getByText("Delivery zones")).toBeVisible();

  await page.getByRole("link", { name: "Conversations" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Conversations" })
  ).toBeVisible();

  await page.getByRole("link", { name: "Settings" }).first().click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("/api/webhooks/whatsapp")).toBeVisible();
  await expect(page.getByText("/api/webhooks/monnify")).toBeVisible();
});

test("customer onboarding captures a profile and offers the WhatsApp handoff", async ({
  page,
}) => {
  await page.goto("/start");
  await expect(page.getByText("First, let's meet you")).toBeVisible();
  await page.getByLabel(/Your name/).fill("Playwright Tester");
  await page.getByLabel(/WhatsApp number/).fill("0803 555 0100");
  await page.getByRole("button", { name: "Continue →" }).click();

  await expect(page.getByText("Where do orders go?")).toBeVisible();
  await page.getByRole("button", { name: /Yaba/ }).click();
  await page.getByRole("button", { name: /Save & open WhatsApp/ }).click();

  await expect(page.getByText(/You're all set/)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Try saying")).toBeVisible();
});

test("an invalid receipt token shows RECEIPT NOT VALID", async ({ page }) => {
  await page.goto("/verify/receipt/this-token-does-not-exist-123456789");
  await expect(page.getByText("RECEIPT NOT VALID")).toBeVisible();
});

test("health endpoint responds", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  const data = (await response.json()) as { database: { connected: boolean } };
  expect(data.database.connected).toBe(true);
});

test("webhook GET rejects a wrong verify token (not redirected to login)", async ({
  request,
}) => {
  const response = await request.get(
    "/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x"
  );
  expect(response.status()).toBe(403);
});
