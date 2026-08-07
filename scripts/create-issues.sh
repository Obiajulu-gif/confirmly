#!/usr/bin/env bash
#
# Creates the Confirmly roadmap issues on GitHub.
#
# Usage:
#   gh auth login          # once, if you haven't
#   bash scripts/create-issues.sh
#
# Or with a PAT (never commit it):
#   GH_TOKEN=ghp_xxx bash scripts/create-issues.sh
#
# Safe to delete this file after running.

set -euo pipefail

REPO="devfoma/confirmly"

command -v gh >/dev/null || { echo "gh CLI not found: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Not authenticated. Run: gh auth login"; exit 1; }

# --- labels (created once, ignore if they already exist) --------------------
ensure_label() {
  gh label create "$1" --repo "$REPO" --color "$2" --description "$3" 2>/dev/null || true
}

ensure_label "P0"             "b60205" "Blocks production readiness"
ensure_label "P1"             "d93f0b" "Important, not blocking launch"
ensure_label "P2"             "fbca04" "Nice to have"
ensure_label "infrastructure" "0e8a16" "Platform, scaling, reliability"
ensure_label "payments"       "1d76db" "Monnify, settlement, money handling"
ensure_label "whatsapp"       "5319e7" "Meta Cloud API / conversation engine"
ensure_label "ai"             "c2e0c6" "NVIDIA NIM / intent extraction"
ensure_label "observability"  "bfd4f2" "Logging, metrics, alerting"
ensure_label "testing"        "d4c5f9" "Test coverage and correctness"

create() {
  local title="$1" labels="$2" body="$3"
  echo "→ $title"
  gh issue create --repo "$REPO" --title "$title" --label "$labels" --body "$body"
}

# ---------------------------------------------------------------------------

create "Route inbound WhatsApp webhooks by phone_number_id (bring-your-own-number)" \
  "P0,whatsapp,infrastructure" \
'## Problem

One shared WhatsApp number serves every merchant. Customers disambiguate with `START <STORECODE>`, and `app/api/webhooks/whatsapp/route.ts:77` logs and drops any unknown `phone_number_id`. A merchant cannot use their own WhatsApp Business number.

This is the main gap between the current build and a product merchants would pay for — their customers already know their number.

## Proposal

- Add `whatsappPhoneNumberId String? @unique` to `Merchant`.
- In the webhook, resolve the merchant from `value.metadata.phone_number_id` (already parsed in `lib/whatsapp/types.ts:165`) before falling back to the shared-number `WaSession` path.
- Store per-merchant `WHATSAPP_ACCESS_TOKEN` (encrypted, reuse `lib/crypto.ts`) so outbound sends use the right sender.
- Keep the shared number working for merchants who have not onboarded their own.

## Acceptance criteria

- [ ] A message to a merchant-owned number resolves directly to that merchant, no `START` required
- [ ] Unknown `phone_number_id` still returns 200 and logs (never 5xx back to Meta)
- [ ] The shared-number `START <CODE>` flow is unchanged and still green in tests
- [ ] Merchant WhatsApp tokens are encrypted at rest and never logged

## Files

`app/api/webhooks/whatsapp/route.ts` · `lib/whatsapp/client.ts` · `prisma/schema.prisma`'

create "Move rate limiting to Redis — the in-memory limiter does not work on Vercel" \
  "P0,infrastructure" \
'## Problem

`lib/rate-limit.ts` stores buckets in a module-level `Map`. On Vercel every lambda instance holds its own copy, so the effective limit is `limit × instances` and resets on every cold start. The file already acknowledges this in its header comment.

For a payments surface this is a real exposure: webhook and invoice endpoints are effectively unthrottled under load.

## Proposal

Swap the store for Upstash Redis (`@upstash/ratelimit`) behind the existing `rateLimit()` signature so no call site changes. Keep the in-memory implementation as the fallback when `UPSTASH_REDIS_REST_URL` is unset, so local dev and tests need no external service.

## Acceptance criteria

- [ ] `rateLimit()` keeps its current signature and return shape
- [ ] Limits hold across instances when Redis is configured
- [ ] Falls back to in-memory with a startup warning when unconfigured
- [ ] `resetRateLimits()` still works for tests

## Files

`lib/rate-limit.ts`'

create "Replace after() with a durable queue — dropped replies are currently silent" \
  "P0,infrastructure,whatsapp" \
'## Problem

`lib/defer.ts` wraps Next.js `after()`. It has no retry, no dead-letter, and no visibility. If NVIDIA NIM times out or Meta returns a 5xx while processing an inbound message, the customer simply never gets a reply and nothing surfaces it.

The webhook itself is safely idempotent (`WebhookEvent` dedupe), so the durable-retry layer is the missing half.

## Proposal

Introduce a queue (QStash or Inngest) for post-response work: message processing, outbound sends, image generation. Keep `defer()` as the interface so call sites are untouched; change the implementation.

- At-least-once delivery with exponential backoff
- Dead-letter after N attempts, surfaced in the dashboard health page
- Reuse the existing `WebhookEvent` dedupe as the idempotency guard

## Acceptance criteria

- [ ] A failed NIM call is retried and eventually delivers the reply
- [ ] Permanent failures land in a dead-letter view, not `/dev/null`
- [ ] Duplicate deliveries do not double-send WhatsApp messages
- [ ] Tests still run tasks synchronously

## Files

`lib/defer.ts` · `app/api/webhooks/whatsapp/route.ts` · `app/dashboard/health/page.tsx`'

create "Implement refunds and chargebacks" \
  "P0,payments" \
'## Problem

There is no refund path anywhere in `lib/` — zero matches for `refund`. Meanwhile `LedgerEntryType` already declares `REFUND_DEBIT` and `CHARGEBACK_DEBIT` and nothing ever writes them. The wallet ledger is structurally ready; the feature is not built.

Merchants need this from day one. A cancelled order after payment currently has no resolution path.

## Proposal

- `lib/payments/refund.ts` — full and partial refunds via the Monnify refund API, mirroring the discipline in `lib/payments/service.ts` (server-side verification is the only source of truth).
- New `PaymentState` transitions and a `Refund` model, or extend `Payment` with refund fields.
- Write `REFUND_DEBIT` ledger entries; never mutate existing entries (the ledger is append-only).
- Merchant dashboard action on the order detail page, gated to OWNER, fully audited.
- Handle Monnify reversal webhook events → `CHARGEBACK_DEBIT`.

## Acceptance criteria

- [ ] Full and partial refunds work end to end against the Monnify sandbox
- [ ] Ledger balances reconcile after refund (credits − debits = expected)
- [ ] Refunds cannot exceed the paid amount
- [ ] Customer receives a WhatsApp notification and the receipt is marked revoked
- [ ] Every refund writes an `AuditEvent` with the acting user

## Files

`lib/payments/` · `prisma/schema.prisma` · `app/dashboard/orders/[id]/`'

create "Production Monnify: real settlement events, not just reconciliation" \
  "P1,payments" \
'## Problem

Everything runs against the Monnify sandbox. `Settlement` rows are created `PENDING` and only the reconciliation pass moves them. In production, Monnify emits actual settlement events that should drive `PENDING → SETTLED` directly, with reconciliation as the safety net rather than the primary mechanism.

## Scope

- KYC-approved Monnify account and production contract code
- Subscribe to and handle the settlement-completion webhook (`SUCCESSFUL_DISBURSEMENT` / settlement event) with the same HMAC verification as transactions
- Enable `MONNIFY_SUBACCOUNT_ENABLED=true` once the Sub Account feature is live, and verify no payment routes to the platform account (`Payment.routedToPlatform` should stay false)
- Set `MONNIFY_PLATFORM_FEE_PERCENT` deliberately rather than leaving the MVP default of 0
- Production runbook: key rotation, sandbox→prod cutover, rollback

## Acceptance criteria

- [ ] Settlement webhook is signature-verified and idempotent
- [ ] `Settlement.settledAt` and `reference` are populated from the provider event
- [ ] Reconciliation only catches genuinely missed events
- [ ] A dashboard alert fires on any `routedToPlatform=true` payment

## Files

`app/api/webhooks/monnify/route.ts` · `lib/monnify/settlements.ts`'

create "Add observability: Sentry, correlation IDs, and payment alerting" \
  "P1,observability" \
'## Problem

`lib/logger.ts` writes to console and `/api/health` is a liveness probe. For a system that moves money that is thin — there is no way to answer "did anything break last night?" without reading Vercel logs by hand.

## Proposal

**Error tracking:** Sentry on both server and client, with secrets scrubbed (must stay green under `npm run secrets:scan`).

**Correlation IDs:** one id per conversation turn, threaded from inbound webhook → NIM call → DB writes → outbound send, so a single customer complaint is one log query.

**Alerts on the metrics that actually matter:**
- Monnify verification failures (the money is at risk)
- Any payment with `routedToPlatform=true` (settlement is misconfigured)
- Orders stuck in `PAYMENT_PENDING` beyond a threshold
- **NIM fallback-parser activation rate** — this is the silent AI-quality signal. `lib/ai/fallback.ts` catching a rising share of traffic means extraction is degrading and nothing currently reports it.
- Webhook signature-mismatch rate (possible attack)

## Acceptance criteria

- [ ] Unhandled errors reach Sentry with no PII or secrets in the payload
- [ ] A conversation is traceable end to end by one id
- [ ] Fallback-parser rate is a queryable metric with an alert threshold

## Files

`lib/logger.ts` · `lib/ai/nvidia.ts` · `app/api/health/route.ts`'

create "Reduce AI cost and latency: cache extractions, short-circuit obvious cases" \
  "P1,ai" \
'## Problem

Every free-text message hits NVIDIA NIM — 20s timeout, two retries, one JSON-repair attempt. Many of those calls are unnecessary: repeated phrasings, single product names, and bare quantity edits ("make it 3") are all handled deterministically by `lib/orders/matching.ts` without any model call.

Each avoided call is both cheaper and roughly a second faster in chat, which is the thing customers actually feel.

## Proposal

1. **Cache** extraction results keyed by `sha256(normalizedText + merchantId + catalogueVersion)`. Same message + same catalogue = same intent, so this is safe. Redis with a TTL, invalidated on catalogue change.
2. **Short-circuit** before calling NIM:
   - Text that exactly matches a product name or alias → build the intent directly
   - Pure quantity/variant edits against an existing draft → deterministic
   - Already covered by `preprocessCommerceMessage`? → never reaches NIM anyway
3. **Instrument** cache hit rate and short-circuit rate so the saving is measurable.

## Acceptance criteria

- [ ] Cache hit rate visible in metrics
- [ ] Cache invalidates when the merchant edits their catalogue
- [ ] Extraction accuracy unchanged — existing engine tests stay green
- [ ] Measurable reduction in NIM calls per order on the demo script

## Files

`lib/ai/nvidia.ts` · `lib/orders/engine.ts` · `lib/orders/matching.ts`'

create "Test the money edge cases: overpayment, partial payment, and confirm/pay races" \
  "P1,testing,payments" \
'## Problem

~79 tests is respectable, but the risk is concentrated in paths that are declared and probably under-tested. `PaymentState` includes `PARTIALLY_PAID`, `OVERPAID` and `REVERSED` — are all three handled end to end, or just declared in the enum?

## Scope

**Property tests on kobo arithmetic** — subtotal + delivery − discount = total must hold for all generated inputs. Integer math should never round, but prove it rather than assume it.

**Webhook replay suite** — same event twice, out-of-order delivery, event arriving before invoice creation, malformed but correctly-signed payloads.

**Payment amount mismatches**
- Customer pays less than expected → `PARTIALLY_PAID`, order does NOT become `PAID`
- Customer pays more → `OVERPAID`, flagged for merchant attention
- Monnify reverses → `REVERSED`, receipt revoked

**Concurrency** — customer taps Confirm twice; webhook lands while a merchant-triggered verify is in flight; two agents take over one conversation simultaneously.

**Cross-tenant isolation** — every dashboard and admin query, asserting merchant A can never read merchant B data.

## Acceptance criteria

- [ ] Each `PaymentState` value has an end-to-end test or is removed from the enum
- [ ] No double-charge or double-fulfil under concurrent operations
- [ ] Replayed webhooks are provably no-ops

## Files

`tests/integration/` · `lib/payments/`'

create "Ship the growth features the schema already supports" \
  "P2,whatsapp" \
'## Problem

Several features are one small step away because the data model already accommodates them. Most notably `Order.discountKobo` exists, is included in the total calculation, and is never set by anything.

## Scope

**Discounts and promo codes** — `discountKobo` is already wired into the math. Needs a `PromoCode` model, chat redemption (`use CODE10`), and merchant CRUD. Smallest effort, most direct revenue impact.

**Multi-item cart editing** — `cart` shows the draft, but a customer cannot remove line 2 or change one quantity without starting over. Add `remove <item>` / `change <item> to N`.

**Low-stock alerts** — `Product.stockQuantity` and `ProductVariant.stockQuantity` are tracked but nothing notifies the merchant. Threshold per product, WhatsApp or dashboard notification.

**Public web catalogue** — a read-only `/store/[storeCode]` page. Product images already generate and are served via `/api/public/products/[productId]/image`; this gives customers something to browse and merchants something to link in a bio.

Each is independently shippable — happy to split into separate issues if that suits the board better.

## Files

`lib/orders/engine.ts` · `lib/whatsapp/commerce-menu.ts` · `prisma/schema.prisma` · `app/`'

echo
echo "Done. https://github.com/$REPO/issues"
