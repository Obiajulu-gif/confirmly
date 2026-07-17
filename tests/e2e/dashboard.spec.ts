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

test("landing page shows the headline and CTAs", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "From chat to confirmed payment." })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open merchant dashboard" }).first()
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "See how it works" })
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
