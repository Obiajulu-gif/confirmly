# Contributing to Confirmly

Thanks for taking a look! This project was built for a hackathon, but PRs and
issues are welcome.

## Getting started

1. Fork and clone the repository.
2. `npm install`
3. Copy `.env.example` to `.env.local` and fill in your own sandbox
   credentials (see the README for provider setup).
4. `npm run db:migrate` (or `npx prisma migrate deploy` against an existing
   database) and `npm run db:seed`.
5. `npm run dev`

## Ground rules

- **Money is integer kobo everywhere.** Never introduce floats into money
  math; convert to naira only at the Monnify boundary
  (`lib/money.ts`).
- **Only verified Monnify responses may change payment state.** If your
  change touches payments, it must go through
  `applyVerifiedTransaction()` — no exceptions, no shortcuts for demos.
- **The AI proposes, the server decides.** Anything the model returns must be
  validated with Zod and grounded against the catalogue.
- **Webhooks must stay idempotent.** Unique provider keys are load-bearing.
- Keep TypeScript strict; `npm run lint`, `npm run typecheck` and
  `npm run test` must pass before you push.
- Run `npm run secrets:scan` before pushing — it fails on any leaked secret.

## Commit style

Conventional commits, e.g. `feat: add delivery-zone editor`,
`fix: reject expired invoice reuse`, `docs: clarify Meta setup`.

## Tests

- Unit tests: `tests/unit` (money, matching, signatures, schema, parsers).
- Integration tests: `tests/integration` (real database, mocked providers).
- Browser tests: `tests/e2e` via Playwright (`npm run test:e2e`).

If you add behaviour to payments, webhooks or the conversation engine, add a
test that fails without your change.
