# Security

Confirmly moves real money signals around, so the security posture is
deliberately conservative.

## The non-negotiable payment rule

**Nothing a customer or browser does can mark an order paid.**

- A screenshot, a WhatsApp claim ("I have paid"), a redirect back from
  checkout, or a visit to the success page never changes payment state.
- The only code path that sets a payment to `PAID` is
  `applyVerifiedTransaction()` in `lib/payments/service.ts`, and it only
  consumes the response of a **server-to-server verification call to
  Monnify** (`GET /api/v2/transactions/{reference}`).
- Webhook payloads are treated as *hints*: they trigger verification, they
  are never trusted as the source of truth.

## Webhook authentication

| Provider | Header | Algorithm |
|---|---|---|
| Meta (WhatsApp) | `X-Hub-Signature-256` | HMAC-SHA256 of the raw body with the app secret |
| Monnify | `monnify-signature` | HMAC-SHA512 of the raw body with the secret key |

Both routes read the **raw request body before JSON parsing**, compare
signatures in constant time (`crypto.timingSafeEqual`), return **401** on any
mismatch, and are excluded from the auth middleware so they can never be
redirected to a login page.

## Idempotency

- Inbound WhatsApp messages are unique on the provider message id — duplicate
  webhook deliveries cannot create duplicate orders or replies.
- Monnify events are unique on `(eventType, transactionReference)` — duplicate
  deliveries cannot create duplicate receipts or WhatsApp confirmations.
- A `PAID` payment is final; late or contradictory events cannot downgrade it.
- Every payment attempt gets a fresh unique invoice reference; references are
  never reused after failure/expiry.

## Secrets

- All provider credentials live in environment variables; `.env.local` is
  git-ignored and `.env.example` contains names only.
- `scripts/verify-no-secrets.mjs` scans the working tree, staged files, the
  full git history and client bundles for literal secret values and common
  token patterns. Run it before every push; it fails the push on a hit.
- No secret is ever prefixed `NEXT_PUBLIC_`, referenced in a client
  component, or sent to a different provider (e.g. Monnify keys never go to
  NVIDIA).
- Diagnostics (dashboard settings, `/api/health`) report *names* of missing
  variables, never values.
- The structured logger redacts known secret values and masks phone numbers
  before anything is written.

## Authentication & tenancy

- Merchant sessions are HTTP-only, `SameSite=Lax`, `Secure` (in production)
  cookies containing a short-lived HS256 JWT signed with `AUTH_SECRET`.
- Passwords are stored as bcrypt hashes (cost 12). Login uses a dummy-hash
  compare so user enumeration by timing is not possible, plus rate limiting.
- Every dashboard query and mutation is scoped by `merchantId` from the
  session — cross-tenant reads return nothing.

## Receipts

- Receipt URLs contain a 256-bit random token (base64url). There is no
  sequential id to enumerate, no database ids on the page, and no raw
  provider payloads. Receipts can be revoked (`revokedAt`).

## AI boundaries

- The model extracts *intent only*. The Zod schema has no money fields, so an
  AI-invented price is structurally impossible to accept.
- Prices, delivery fees, stock and payment status come exclusively from
  PostgreSQL; product matches are validated against the catalogue.
- Payment claims are classified as unverified questions and answered by
  querying Monnify — never by believing the customer.

## Reporting a vulnerability

This is a hackathon project. If you find a vulnerability, please open a
GitHub issue with the label `security` (do not include exploit details in the
public issue; ask for a private channel).
