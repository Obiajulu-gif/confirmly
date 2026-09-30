# Native WhatsApp ordering Flow

Confirmly can present ordering as a single native **WhatsApp Flow** — a
first-party commerce sheet — instead of a chain of interactive-list messages.
The interactive-list path in [`lib/whatsapp/commerce-menu.ts`](../lib/whatsapp/commerce-menu.ts)
remains the fallback and is used verbatim whenever the Flow is disabled,
unconfigured, or fails to send. The Flow is **off by default**.

- **Flow JSON**: [`flows/order-flow.template.json`](../flows/order-flow.template.json)
  → built to `flows/order-flow.json` by `npm run flow:build`.
- **Data-exchange endpoint**: [`app/api/whatsapp/flow/route.ts`](../app/api/whatsapp/flow/route.ts)
  (`POST /api/whatsapp/flow`).
- **Send + completion wiring**: [`lib/whatsapp/flow.ts`](../lib/whatsapp/flow.ts)
  and `handleFlowReply` in `commerce-menu.ts`.

## Screens

Flow JSON **version 7.1**, `data_api_version` **3.0**. Every screen after the
static `START` is data-driven through the endpoint and resolved from PostgreSQL.

| Screen     | Purpose                                                            | Key components                                                   |
| ---------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| `START`    | Static entry — browse stores                                     | `Image` banner, `TextHeading`, `Footer`                        |
| `ONBOARDING` | First-time customer name, email and optional referral          | `TextInput`, `Footer`                                         |
| `SEARCH`   | Choose an active store with available products                   | Standalone `NavigationList` (`${data.store_items}`)            |
| `SHOP`     | Catalogue, product options and cart; same-screen updates         | `RadioButtonsGroup`, `Dropdown`, conditional images and text   |
| `DELIVERY` | Delivery zone + address                                           | `Dropdown` (zones), `TextArea`                                  |
| `REVIEW`   | Summary + server-computed total; confirm the order                | `TextBody`, `Footer` (`data_exchange`)                         |
| `PAYMENT`  | Checkout link; **terminal**                                      | `EmbeddedLink`, `Footer` (`complete`)                          |

**Component-choice note.** WhatsApp's components reference documents
`RadioButtonsGroup` and `Dropdown` for single-select but does **not** document a
`ChipsSelector` or a numeric "stepper". Size/colour therefore use
`RadioButtonsGroup` (single-select) and quantity uses a bounded `Dropdown`
(1…min(10, stock)). This was verified against Meta's components reference rather
than guessed.

## Security model

The endpoint **never trusts a value echoed back by the client**. The client may
only pick an `id` from a list the endpoint previously served, and every id
(store, product, variant, delivery zone) is re-validated against the database
before the order advances. All prices, fees, stock and totals are read from
PostgreSQL. See [`lib/whatsapp/flow-screens.ts`](../lib/whatsapp/flow-screens.ts).

- The raw `flow_token` is a bearer secret. Only its SHA-256 is stored
  (`WhatsAppFlowSession.tokenHash`); the endpoint validates the presented token
  against the hash **and** the 30-minute expiry before resolving any screen.
- On decryption failure the endpoint returns **HTTP 421** so Meta refreshes our
  public key; an unknown/expired token returns **427**; a bad signature **432**.
- On completion the submitted payload carries only the `flow_token`. The order is
  rebuilt from the server-resolved session state and handed to the existing order
  engine, so the Monnify checkout path is unchanged. The session is marked
  consumed so a replayed token cannot re-submit.

## Environment variables

Set these locally in `.env.local` (see [`.env.example`](../.env.example)) and in
Vercel via `npm run vercel:env`.

| Variable                              | Purpose                                                        |
| ------------------------------------- | -------------------------------------------------------------- |
| `WHATSAPP_FLOW_ENABLED`               | `true` to launch the Flow; anything else keeps the list path.  |
| `WHATSAPP_ORDER_FLOW_ID`              | The published Flow's ID (from WhatsApp Manager / Graph API).    |
| `WHATSAPP_FLOW_PRIVATE_KEY`           | RSA **private** key (PEM). Use literal `\n` on one line, or a real multi-line value. |
| `WHATSAPP_FLOW_PRIVATE_KEY_PASSPHRASE`| Passphrase, only if the key is encrypted.                      |

When `WHATSAPP_FLOW_ENABLED` is false **or** `WHATSAPP_ORDER_FLOW_ID` is unset,
`maybeSendOrderFlow` returns without sending and the customer gets the
interactive store directory exactly as before.

## Building the Flow JSON

Images inside Flow JSON must be Base64. `npm run flow:build` encodes the banner
and injects it into `flows/order-flow.json`.

```bash
npm run flow:build     # writes flows/order-flow.json
npm run flow:check     # CI: fails if the committed JSON is stale
```

To use real artwork, drop `banner.jpg` or `banner.png` into `flows/assets/`.
Otherwise a small brand-emerald PNG is generated. Store logos are supplied by
the data endpoint; their last-resort PNG lives in
`lib/whatsapp/flow-image-fallback.ts` and must decode successfully even when
the database, native image library, or fonts are unavailable.

## Generating the encryption key pair

Meta encrypts each request with a one-time AES key wrapped by **our** RSA public
key. Generate a 2048-bit key pair:

```bash
# Private key (keep secret — this becomes WHATSAPP_FLOW_PRIVATE_KEY)
openssl genrsa -out flow-private.pem 2048
# Public key (upload this to the WhatsApp phone number)
openssl rsa -in flow-private.pem -pubout -out flow-public.pem
```

To store the private key on one line for an env var, replace newlines with `\n`
(the app converts them back). Never commit either file.

## Upload, publish, and rotate

All calls use the WhatsApp Business phone number ID and a system-user token.

1. **Register the public key on the phone number** (required before the endpoint
   can decrypt):

   ```bash
   curl -X POST "https://graph.facebook.com/v23.0/<PHONE_NUMBER_ID>/whatsapp_business_encryption" \
     -H "Authorization: Bearer <TOKEN>" \
     --data-urlencode "business_public_key=$(cat flow-public.pem)"
   ```

2. **Create the Flow** and note the returned `id` → `WHATSAPP_ORDER_FLOW_ID`:

   ```bash
   curl -X POST "https://graph.facebook.com/v23.0/<WABA_ID>/flows" \
     -H "Authorization: Bearer <TOKEN>" \
     -F "name=Confirmly order" -F "categories=[\"OTHER\"]"
   ```

3. **Upload the Flow JSON** as an asset:

   ```bash
   curl -X POST "https://graph.facebook.com/v23.0/<FLOW_ID>/assets" \
     -H "Authorization: Bearer <TOKEN>" \
     -F "name=flow.json" -F "asset_type=FLOW_JSON" \
     -F "file=@flows/order-flow.json;type=application/json"
   ```

4. **Set the endpoint URI** to `https://<your-domain>/api/whatsapp/flow` (in
   WhatsApp Manager, or via the Flow's `endpoint_uri`). Meta sends a `ping`
   health check; the endpoint answers `{ "data": { "status": "active" } }`.

5. **Publish** once the health check passes:

   ```bash
   curl -X POST "https://graph.facebook.com/v23.0/<FLOW_ID>/publish" \
     -H "Authorization: Bearer <TOKEN>"
   ```

6. Set `WHATSAPP_FLOW_ENABLED=true` and `WHATSAPP_ORDER_FLOW_ID=<FLOW_ID>`, then
   `npm run vercel:env` to push.

### Rotating keys

Register the **new** public key with the same
`.../whatsapp_business_encryption` call (it overwrites the stored key), update
`WHATSAPP_FLOW_PRIVATE_KEY` in `.env.local` and Vercel, redeploy, then confirm
Meta's next `ping` returns 200. If a request arrives while the keys are briefly
mismatched, the endpoint returns 421 and Meta re-fetches the current public key,
so no customer order is lost — they simply retry.

## Tests

- [`tests/unit/flow-crypto.test.ts`](../tests/unit/flow-crypto.test.ts) — RSA/AES
  round-trip, flipped-IV response, decryption failure.
- [`tests/unit/flow-endpoint.test.ts`](../tests/unit/flow-endpoint.test.ts) —
  health-check ping, 421 on decryption failure, 432 on bad signature, 427 on
  unknown/expired token, happy-path screen transition, and the
  `isFlowSessionUsable` expiry/replay guard.
- [`tests/unit/flow-store-picker.test.ts`](../tests/unit/flow-store-picker.test.ts) —
  real image decoding for empty/error store lists, generated logos and the Flow
  preview; selecting a store and loading its catalogue with mocked database
  reads; image-library failure; and recovery payloads checked against the
  committed Flow JSON fields.

## Store picker shows “Something went wrong”

The WhatsApp sheet uses two independently deployed pieces: the app's data
endpoint and the Flow JSON published in Meta. Updating only one does not update
the other. Published Flows are immutable: create a replacement Flow when the
JSON changes, validate it, publish it, and set `WHATSAPP_ORDER_FLOW_ID` to its ID.

For the store-picker fix:

1. Deploy the endpoint and image-handling changes from this repository.
2. Run `npm run flow:build` and `npm run flow:check`. Upload
   `flows/order-flow.json` to a new draft Flow and keep the endpoint URI pointing
   to the deployed `/api/whatsapp/flow` route. Do not upload the template.
3. In Meta's Flow preview, check that the JSON has no validation errors and
   exercise the data endpoint with a valid session. Confirm Browse stores →
   onboarding (new customers only) → Choose a store → Shop.
4. Publish the validated replacement, update `WHATSAPP_ORDER_FLOW_ID` in the
   deployment environment, and redeploy. Start a fresh WhatsApp conversation
   action to receive a new Shop now card; an old card still references its old
   Flow ID and its session expires after 30 minutes.

Keep `NavigationList.name` (`store_nav`) and each card's literal
`on-click-action.payload.store_id`. The list must remain a direct, standalone
layout child. Error messages therefore use a card with “Tap to retry”.

The fix replaces an invalid fallback PNG, prevents failed product-image decoding
from returning the original corrupt bytes, and supplies every current SHOP field
on recovery. Session database failures now stay inside the encrypted error
handler. The Flow tests decode image pixels because reading a PNG header alone
did not detect the broken image.

When diagnosing production, inspect the `/api/whatsapp/flow` logs. Client error
notifications record `screen`, `error`, and `errorMessage`; server failures record
the session/screen resolution error. Check that the deployed commit and published
Flow match before changing keys. Local tests exercise the data contract; they do
not replace the final check inside WhatsApp with the published Flow.
