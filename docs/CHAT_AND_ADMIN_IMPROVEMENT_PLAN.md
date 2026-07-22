# Confirmly — Chat UX, Search & Admin Dashboard Improvement Plan

**Author:** Engineering
**Status:** Proposed
**Scope:** WhatsApp chat experience, in-chat search, dashboard search, and a new platform admin console.

This plan is grounded in a read of the actual code. Key files referenced:

- `lib/orders/engine.ts` — the AI conversation engine (free text → order)
- `lib/whatsapp/commerce-menu.ts` — deterministic menu navigation (stores, catalogue, products)
- `app/api/webhooks/whatsapp/route.ts` — inbound webhook that wires the two together
- `lib/orders/summary.ts` — message/`HELP_TEXT` builders
- `prisma/schema.prisma` — data model
- `lib/auth.ts`, `middleware.ts` — session + route protection
- `app/dashboard/*` — the existing merchant dashboard

---

## 1. Executive summary

The chat is already solid: a deterministic menu layer (`preprocessCommerceMessage`) handles taps and greetings, and anything else falls through to a catalogue-grounded AI engine (`processInboundMessage`). Store selection, in-chat onboarding, one-question-at-a-time clarification, and HUMAN-mode auto-resume all work.

Three gaps remain:

1. **Discovery doesn't scale.** Both the store directory and the product catalogue are hard-capped (`take: 10` stores, `take: 9` products) with **no search**. WhatsApp interactive lists themselves cap at 10 rows, so beyond a handful of stores/products a customer literally cannot reach the rest.
2. **Edge cases dead-end to a human.** Business questions ("do you have this in red?", "how long is delivery?"), product photos, and "show me my past orders" all route to handover or a generic fallback instead of being answered.
3. **No platform oversight.** There is no admin role or admin console. `User` only has per-merchant `MerchantMembership` (OWNER/STAFF); `middleware.ts` only checks that a JWT is valid. There is no way to see platform-wide numbers (orders placed, WhatsApp numbers registered) or to do cross-tenant CRUD.

This plan addresses all three, phased so each phase ships independently.

---

## 2. How the chat works today (grounded map)

```
Inbound WhatsApp webhook  (app/api/webhooks/whatsapp/route.ts)
        │  verify signature → dedupe via WebhookEvent → defer()
        ▼
preprocessCommerceMessage()           (lib/whatsapp/commerce-menu.ts)
        │  handles: store:<id> taps, commerce:* taps, greetings/"browse",
        │           location shares, WhatsApp Flow replies
        │  returns { handled } OR { forwardedMessage } (a rewritten text order)
        ▼ (if not handled)
processInboundMessage()               (lib/orders/engine.ts)
        │  resolves WaSession.activeMerchantId (the current store)
        │  START <code> / "stores" switch stores
        ▼
processScopedMessage()  →  handleText() / handleInteractiveReply()
        │  deterministic commands (human/cancel/help/check payment/resume)
        │  in-chat onboarding (name, default delivery zone)
        │  free text → extractOrderIntent() (NVIDIA NIM, catalogue-grounded)
        ▼
recalcAndRespond()  → one clarification at a time → summary → confirm → Monnify
```

**State lives in:** `WaSession` (which store a WhatsApp user is in), `Conversation` (`state`, `automationMode`, `draft` JSON, `pendingQuestion`), `Customer` (name, `defaultAddress`).

---

## 3. Part A — Chat UX improvements (edge cases)

Each item below names the trigger, the current behaviour, the target behaviour, and where it changes.

### A1. Business/product questions shouldn't dead-end to a human
- **Trigger:** "do you have the polo in red?", "what sizes do you have?", "how much is delivery to Lekki?", "how long does delivery take?"
- **Today:** `intent === "BUSINESS_QUESTION"` replies "I'm the ordering assistant… reply human" (`engine.ts` ~L606). Every such question becomes a handover.
- **Target:** Answer catalogue-answerable questions directly from the DB before falling back to human:
  - Variant/availability questions → look up the product's variants and stock and answer ("Yes — the Classic Polo comes in Black, White, Navy; sizes S–XL").
  - Delivery-fee/area questions → read `DeliveryZone` and answer with the fee.
  - Price questions → answer from `priceKobo`.
  - Only genuinely unknowable questions (hours, returns policy) fall through to human — and even then, offer the merchant's `supportEmail`/`description` if present.
- **Where:** new `answerBusinessQuestion(ctx, intent)` in `engine.ts`, called from the `BUSINESS_QUESTION` case. Extend the AI schema so `BUSINESS_QUESTION` can carry a `topic` hint (`price` | `variants` | `delivery` | `stock` | `other`).

### A2. "My orders" / order history + re-order
- **Trigger:** "my orders", "order history", "where is my order", "reorder".
- **Today:** `check payment` (`checkPaymentStatus`, `engine.ts` L1363) only ever inspects the **single most recent** order. There's no way to list past orders or re-order.
- **Target:** New deterministic command `orders`/`my orders` → send an interactive list of the last N orders (reference, total, state). Selecting one shows its status + receipt link (if paid) and a "Reorder" button that clones its items into a fresh draft.
- **Where:** new `COMMAND_MY_ORDERS` regex + `listCustomerOrders(ctx)` in `engine.ts`; a `reorder:<orderId>` interactive id in `handleInteractiveReply`.

### A3. Product photo / unsupported media handled usefully
- **Trigger:** customer sends an image ("do you have this?"), audio, or a document.
- **Today:** `message.kind === "unsupported"` → generic "I can only read text" (`engine.ts` L465).
- **Target:** Differentiate: for an **image**, reply "I can't read photos yet, but tell me the item name or tap Browse to see the catalogue" and attach the Browse button; for audio, same with a gentler nudge. Keep it a warm dead-simple redirect, not a wall.
- **Where:** `processScopedMessage` unsupported branch; the parser already distinguishes types in `lib/whatsapp/types.ts`.

### A4. Abandoned-order re-engagement (opt-in, respectful)
- **Trigger:** a `Conversation` sits in `AWAITING_CONFIRMATION` or `PAYMENT_PENDING` with no inbound for N hours.
- **Today:** nothing re-engages; the order silently rots.
- **Target:** A scheduled job (reuse the cron pattern already in `app/api/payments/reconcile`) sends **one** gentle nudge inside the 24-hour WhatsApp service window ("Your order for ₦X is still waiting — tap to pay, or say cancel"). Never more than one; respects `Customer.optedIn`; never sends outside the 24h window (Meta policy).
- **Where:** new `app/api/conversations/nudge/route.ts` (cron) + `lib/orders/nudge.ts`. Add `lastNudgeAt` to `Conversation`.

### A5. "View cart" mid-order
- **Trigger:** "what's in my order?", "view cart".
- **Today:** the draft is only shown at the confirmation summary. Mid-build there's no way to see current items.
- **Target:** deterministic `cart`/`view order` command that renders the current `draft` as a summary (reuse `buildOrderSummaryText`) with Edit/Confirm buttons if the draft is complete.
- **Where:** `COMMAND_VIEW_CART` in `handleText`.

### A6. Smarter global fallback (`OTHER`) + discoverability
- **Today:** `OTHER` replies with `HELP_TEXT`. Fine, but `HELP_TEXT` (`summary.ts`) doesn't mention **search** or **my orders** — it will after A2/B1/B2 land. Add a "🔎 search" and "📦 my orders" line.
- **Where:** `summary.ts` `HELP_TEXT`.

### A7. Delivery address that doesn't match a zone
- **Trigger:** customer types an address in an area the merchant doesn't serve.
- **Today:** `recalcAndRespond` (engine.ts ~L879) silently falls back to the zone picker with "I don't deliver to X yet."
- **Target:** keep that, but also offer **Pickup** and **Talk to merchant** as buttons in the same message so the customer isn't stuck re-guessing areas.
- **Where:** the `!draft.deliveryZoneId` branch in `recalcAndRespond`.

### A8. Consistent "expired button" recovery
- **Today:** several handlers reply "that button has expired" then stop (`handleInteractiveReply` tail). The customer is left with no next action.
- **Target:** every expired-button path should re-offer the relevant menu (catalogue or store list) instead of a dead reply.
- **Where:** `handleInteractiveReply` in `engine.ts`.

---

## 4. Part B — Search

### B1. Store search in chat (the big one)
- **Today:** `sendStoreList` (engine.ts L253) and `sendStoreDirectory` (commerce-menu.ts L51) both `take: 10`, no filter. WhatsApp lists max out at 10 rows — beyond 10 live stores, the rest are unreachable.
- **Target:** a **search-first** directory.
  - New deterministic command: `find <query>` / `search <query>` (and when a customer with no active store sends free text that isn't a greeting, treat it as a store search).
  - `searchStores(query)` ranks `Merchant` by name/category/`storeCode` using the existing `scoreMatch` util already imported in `commerce-menu.ts` (from `lib/orders/matching.ts`) — no new dependency.
  - Return the top ~9 as an interactive list plus a "Type another name to search" hint. If one clear match, offer it directly.
  - The store directory message gains a persistent "🔎 Search by name" affordance in its copy.
- **Where:** `commerce-menu.ts` (new `searchStores` + wire into `preprocessCommerceMessage` before `sendStoreDirectory`); mirror the command in `engine.ts` for the no-active-store path.

### B2. Product search within a store
- **Today:** catalogue browse only (`sendCatalogue` → categories, `sendProducts` `take: 9`). Typing a product name works via AI extraction, but there's no explicit search affordance and no way to page past 9 products.
- **Target:** a "🔎 Search products" row in the catalogue menu and a `search <query>` handler scoped to the active store that ranks `Product` via `scoreMatch` and returns the top matches with price + an "Add" button. This reuses `previewProductSelection` for the tap-through.
- **Where:** `commerce-menu.ts` — add `commerce:search` row + `searchProducts(context, query)`.

### B3. Order/payment search in the dashboard
- **Today:** `app/dashboard/orders/page.tsx` and `payments/page.tsx` render lists with no search/filter (confirmed by structure). The user's note "also in the payment side" points here.
- **Target:** add a search box + status filter to both pages:
  - Orders: search by reference, customer name/number; filter by `OrderState`; date range.
  - Payments: search by reference/`paymentReference`; filter by `PaymentState`; settled vs pending.
  - Server-side filtering via `searchParams` (Next.js App Router pattern already used elsewhere), merchant-scoped through `getMerchantSession()`.
- **Where:** both dashboard pages + a small shared `<SearchFilterBar>` component.

---

## 5. Part C — Admin dashboard

### C1. The authorization model (must come first)
There is **no platform admin today**. Two ways to add one:

| Option | Change | Pros | Cons |
|---|---|---|---|
| **A. Env allowlist** (recommended for v1) | `ADMIN_EMAILS` env (comma-separated); `getAdminSession()` checks the session email against it | No migration; instant; easy to revoke | Not self-service; tied to known emails |
| **B. Schema flag** | `User.isPlatformAdmin Boolean @default(false)` | Proper, queryable, grantable in-app | Migration + a way to grant it |

**Recommendation:** ship **A** now (zero schema risk), add **B** later if admin membership needs to be managed in-app. Both gate a new `/admin` route tree.

New pieces:
- `getAdminSession()` in `lib/auth.ts` — returns the session only if `session.email` ∈ `ADMIN_EMAILS`.
- Extend `middleware.ts` matcher to `"/admin/:path*"` and, inside, redirect non-admins (decode the email claim already in the JWT; the page-level `getAdminSession()` is the real gate since middleware can't hit the DB/env allowlist cheaply — do a defence-in-depth check in both).
- `app/admin/layout.tsx` — its own shell, visually distinct from the merchant dashboard so it's obvious you're in platform mode.

### C2. Metrics the user explicitly asked for
"See the number of users making orders and registering their WhatsApp number."

Direct mappings in the schema:
- **WhatsApp numbers registered** = `WaSession` count (one row per unique `waId`). Trend: group by `createdAt::date`.
- **Customers** = `Customer` count (per-merchant rows; distinct people ≈ `WaSession`).
- **Users making orders** = distinct `Order.customerId` count, plus total `Order` count by `OrderState`.
- **Revenue / GMV** = `sum(totalKobo)` on orders in `PAID`/`COMPLETED`; pending vs settled from `Payment`/`Settlement`.

**Overview cards:** Total WhatsApp registrations · Customers who ordered · Orders (by state) · GMV · Settled vs pending. Plus a simple 30-day line (registrations & orders) and a "recent activity" feed from `AuditEvent`.

### C3. CRUD surfaces (cross-tenant)
All read-scoped platform-wide, all writes audited via `AuditEvent`.

| Entity | Read | Create | Update | Delete/Deactivate |
|---|---|---|---|---|
| **Merchants** | list + detail | (via merchant onboarding) | edit name/category/active | deactivate (`active=false`) — soft, never hard-delete (orders reference them) |
| **Products** | list across stores | ✓ | edit price/stock/active | deactivate |
| **Customers** | list + detail | — | toggle `optedIn` | — (PII; deactivate opt-in only) |
| **WhatsApp sessions** | list (waId, profileName, active store, createdAt) | — | reset active store | clear session |
| **Orders** | list + detail (read-only mostly) | — | force state / cancel (audited) | — |
| **Payments/Settlements** | list + detail | — | trigger re-verify / reconcile (reuse existing endpoints) | — |

**Delete policy:** prefer **soft-deactivate** everywhere — the schema uses `onDelete: Restrict` on `Order.customer` and cascades elsewhere, so hard deletes are dangerous. Hard delete only for truly orphan rows, behind a confirm.

### C4. Routes
```
app/admin/
  layout.tsx                     admin shell + getAdminSession() gate
  page.tsx                       metrics overview (C2)
  merchants/page.tsx  + [id]/    list, detail, activate/deactivate, edit
  products/page.tsx              cross-store product table + CRUD
  customers/page.tsx             customers + WhatsApp registrations
  sessions/page.tsx              WaSession table (WhatsApp numbers)
  orders/page.tsx  + [id]/       platform order search + detail
  payments/page.tsx              platform payments/settlements
  actions.ts                     server actions (all re-check getAdminSession + audit)
```
Server actions follow the existing pattern (`app/dashboard/products/actions.ts`): `"use server"`, Zod-validate, re-check the session **inside** the action (never trust the page), `revalidatePath`, write an `AuditEvent`.

---

## 6. Data model changes (minimal)

| Change | Model | Why | Migration risk |
|---|---|---|---|
| `lastNudgeAt DateTime?` | `Conversation` | A4 abandoned-order nudge throttle | trivial (nullable add) |
| `BUSINESS_QUESTION.topic` | AI schema only (`lib/ai/schema.ts`), **not** DB | A1 answer routing | none (no DB) |
| *(optional)* `isPlatformAdmin Boolean @default(false)` | `User` | C1 Option B | trivial, but pick A first |

Everything else uses existing columns. No destructive migrations.

---

## 7. Phased delivery

Each phase is independently shippable and testable.

### Phase 1 — Chat quick wins (no schema change) ~0.5–1 day
- A1 (answer business questions), A3 (media redirect), A5 (view cart), A6 (help text), A7 (delivery fallback buttons), A8 (expired-button recovery).
- Pure `engine.ts` + `summary.ts` edits; covered by unit tests on the engine.

### Phase 2 — Search ~1–1.5 days
- B1 store search, B2 product search (`commerce-menu.ts`, reuse `scoreMatch`).
- B3 dashboard order/payment search.
- This is the highest-value scale fix.

### Phase 3 — Order history & re-order ~0.5 day
- A2 (`my orders`, reorder). Small schema-free additions to the engine.

### Phase 4 — Admin console ~2–3 days
- C1 auth (Option A) → C2 metrics overview → C3/C4 CRUD surfaces incrementally (merchants → products → customers/sessions → orders/payments).

### Phase 5 — Re-engagement ~0.5 day
- A4 nudge job (needs the `lastNudgeAt` migration + a cron entry). Ship last; it's outbound-message-sensitive (Meta 24h window, opt-in).

---

## 8. Testing

- **Engine unit tests** (`tests/` already exists with Vitest): assert A1 answers from a seeded catalogue, A2 lists orders, cart rendering, search ranking order.
- **Search:** table-driven tests on `searchStores`/`searchProducts` ranking (exact > alias > fuzzy).
- **Admin:** integration tests that a non-allowlisted email gets 401/redirect on every `/admin` route and every admin server action; that metrics counts match seeded fixtures.
- **Regression:** the existing WhatsApp flow tests must stay green — Phase 1/2 must not change the happy-path order flow.
- Gates already in place: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `npm run secrets:scan`.

## 9. Risks & guardrails

- **WhatsApp 10-row list limit** is the root cause behind B1/B2 — search is the fix, not bigger lists. Always keep results ≤ 9 + a "refine" hint.
- **Outbound policy (A4):** never message outside the 24h customer-service window; one nudge max; honour `optedIn`. This is the only phase that can annoy real users — ship it cautiously and behind a flag.
- **Admin is cross-tenant:** every read and write must re-check `getAdminSession()` inside the server action, and every mutation must write an `AuditEvent`. Prefer soft-deactivate over delete given the FK constraints (`onDelete: Restrict` on orders).
- **PII:** the admin customer view exposes phone numbers — keep it behind the allowlist, mask where full numbers aren't needed, and don't add PII to URL query strings.

---

## 10. Recommendation

Start with **Phase 1 + Phase 2** — they're schema-free (except none), fix the most visible customer pain (discovery at scale + smarter answers), and de-risk the rest. Then build the **admin console (Phase 4)** since that's a distinct, high-value deliverable you asked for. Phases 3 and 5 slot in around them.

I can begin implementing Phase 1 immediately on approval.
