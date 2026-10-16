# @core/billing

[![genpm](https://api.genpm.net/v1/badge/@core/billing.svg)](https://genpm.net/p/@core/billing) ![license](https://img.shields.io/badge/license-MIT-blue)

> Stripe subscriptions: checkout, portal and idempotent webhooks with Drizzle

A [GenPM](https://genpm.net) module: **source code + AI rules + MCP config**, injected into your project instead of hidden in `node_modules`. The code lands in `src/lib/billing`, pinned to a verified commit, and you own it.

## Install

```bash
genpm add @core/billing
```

No genpm yet? `curl -fsSL https://genpm.net/install.sh | sh` (macOS/Linux), `irm https://genpm.net/install.ps1 | iex` (Windows), or one-off with `npx @genpm-net/cli add @core/billing`.

Or let your AI agent do it: run `genpm mcp setup` once, then ask *"add @core/billing with genpm"* in Claude Code, Cursor, VS Code, Windsurf, Codex or Gemini CLI. It shows you a dry-run plan before writing anything.

## What it does

Stripe subscriptions: checkout, customer portal, an idempotent webhook handler that mirrors subscriptions into the
database, and `hasEntitlement(user, feature)` for gating. Stripe is the source of truth. No usage-based billing,
invoices UI or taxes logic (configure those in Stripe).

## Setup

After `genpm add`, follow these steps (your AI agent finds the same steps in `src/lib/billing/AGENTS.md` and can do them for you):

1. Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Use test-mode keys in development.
2. Use the Stripe MCP server (if the user enabled it) to list real products and prices; otherwise ask the user for price ids.
   Put them in `plans.ts`: `FEATURES_BY_PRICE['price_123'] = ['pro']`.
3. Generate and apply migrations (see `src/lib/db/AGENTS.md`).
4. Mount routes after `@core/auth`'s `sessionMiddleware`:
   - Hono: `app.route('/billing', billingRoutes())` from `./lib/billing/adapters/hono.js`.
   - Next.js: `app/billing/{checkout,portal,webhook}/route.ts` exporting `checkoutRoute`/`portalRoute`/`webhookRoute` as `POST`.
   Delete the adapter of the framework you don't use.
5. Webhook endpoint in Stripe: `<origin>/billing/webhook` with events `checkout.session.completed` and
   `customer.subscription.created|updated|deleted`. Locally: `stripe listen --forward-to localhost:3000/billing/webhook`.
6. Gate features: `if (!(await hasEntitlement(user, 'pro'))) return c.json({ error: 'upgrade' }, 402)`.
7. Frontend: `POST /billing/checkout {priceId}` returns `{url}`; redirect the browser there.

### Upgrading from 1.x
2.0 depends on @core/stripe, which now owns the Stripe client, the webhook verification and the `stripe_events`
table (same name and columns: no data migration). Install @core/stripe, keep your existing `/billing/webhook` route
(it delegates to @core/stripe) or point Stripe to `/api/stripe/webhook`; both process each event once. Other modules
(e.g. @core/checkout) receive their events through the same endpoint.

## What's inside

Paths are relative to `src/lib/billing`.

- `index.ts` — public API: `createCheckoutSession`, `createPortalSession`, `handleStripeWebhook`, `hasEntitlement`, `activeSubscriptions`.
- `plans.ts` — **your config**: Stripe price id → features. Edit this file.
- `schema.ts` — `billing_customers`, `subscriptions`, `stripe_events`. Depends on `../auth` and `../db`.
- `adapters/hono.ts`, `adapters/next.ts` — `POST /billing/checkout`, `/billing/portal`, `/billing/webhook`.

## At a glance

- **GenPM dependencies** (installed with it): [@core/db](https://genpm.net/p/@core/db), [@core/auth](https://genpm.net/p/@core/auth), [@core/stripe](https://genpm.net/p/@core/stripe)
- **npm dependencies** (proposed, never installed without asking): `stripe`
- **Environment variables** (added to `.env.example`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- **MCP servers** (only added with your consent): `stripe`
- **AI rules**: [`AGENTS.md`](AGENTS.md), loaded by your agent only when it works in `src/lib/billing`

## Security

GenPM installs a 40-character commit SHA (never a branch), verifies an Ed25519-signed manifest, never runs install scripts and scans AI rules for prompt injection. Details: [genpm.net/docs/security](https://genpm.net/docs/security).

## License

MIT — see [LICENSE](LICENSE). Browse the full catalog at [genpm.net](https://genpm.net).
