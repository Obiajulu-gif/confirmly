#!/usr/bin/env node
/**
 * Production smoke test. Usage:
 *   node scripts/smoke-test.mjs https://your-deployment.vercel.app
 */
const base = (process.argv[2] ?? process.env.APP_URL ?? "http://localhost:3000")
  .replace(/\/$/, "");

const checks = [];

async function check(name, fn) {
  try {
    const ok = await fn();
    checks.push([name, ok ? "PASS" : "FAIL"]);
  } catch (err) {
    checks.push([name, `ERROR: ${err.message}`]);
  }
}

await check("landing page renders", async () => {
  const r = await fetch(`${base}/`);
  if (!r.ok) return false;
  // The headline spans styled elements — check both fragments.
  const html = await r.text();
  return html.includes("From chat to") && html.includes("confirmed payment.");
});

await check("onboarding page renders", async () => {
  const r = await fetch(`${base}/start`);
  return r.ok && (await r.text()).includes("let&#x27;s meet you");
});

await check("health endpoint ok + database connected", async () => {
  const r = await fetch(`${base}/api/health`);
  if (!r.ok) return false;
  const data = await r.json();
  return data.database?.connected === true;
});

await check("login page renders", async () => {
  const r = await fetch(`${base}/login`);
  return r.ok && (await r.text()).includes("Merchant login");
});

await check("dashboard redirects to login when signed out", async () => {
  const r = await fetch(`${base}/dashboard`, { redirect: "manual" });
  return r.status >= 300 && r.status < 400;
});

await check("WhatsApp webhook GET rejects wrong token with 403 (no auth redirect)", async () => {
  const r = await fetch(
    `${base}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x`,
    { redirect: "manual" }
  );
  return r.status === 403;
});

await check("WhatsApp webhook POST rejects unsigned payloads (401)", async () => {
  const r = await fetch(`${base}/api/webhooks/whatsapp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ object: "whatsapp_business_account", entry: [] }),
    redirect: "manual",
  });
  return r.status === 401 || r.status === 503;
});

await check("Monnify webhook POST rejects unsigned payloads (401)", async () => {
  const r = await fetch(`${base}/api/webhooks/monnify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventType: "X", eventData: {} }),
    redirect: "manual",
  });
  return r.status === 401 || r.status === 503;
});

await check("unknown receipt shows RECEIPT NOT FOUND", async () => {
  const r = await fetch(`${base}/verify/receipt/not-a-real-token-1234567890`);
  return r.ok && (await r.text()).includes("RECEIPT NOT FOUND");
});

let failed = 0;
console.log(`\nSmoke test against ${base}\n`);
for (const [name, result] of checks) {
  if (result !== "PASS") failed++;
  console.log(`  ${result === "PASS" ? "✓" : "✗"} ${name}${result === "PASS" ? "" : ` — ${result}`}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed.`);
process.exit(failed ? 1 : 0);
