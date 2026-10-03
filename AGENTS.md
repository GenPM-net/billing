# @core/billing — rules for AI agents

## Purpose
Stripe subscriptions: checkout, customer portal, an idempotent webhook handler that mirrors subscriptions into the
database, and `hasEntitlement(user, feature)` for gating. Stripe is the source of truth. No usage-based billing,
invoices UI or taxes logic (configure those in Stripe).

## Map
- `index.ts` — public API: `createCheckoutSession`, `createPortalSession`, `handleStripeWebhook`, `hasEntitlement`, `activeSubscriptions`.
- `plans.ts` — **your config**: Stripe price id → features. Edit this file.
- `schema.ts` — `billing_customers`, `subscriptions`, `stripe_events`. Depends on `../auth` and `../db`.
- `adapters/hono.ts`, `adapters/next.ts` — `POST /billing/checkout`, `/billing/portal`, `/billing/webhook`.

## Integration
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

## Conventions
- Read subscription state from the database (`hasEntitlement`, `activeSubscriptions`), never from Stripe on each request.
- All Stripe writes go through this module; keep amounts and prices in Stripe, not in code.
- The webhook must receive the raw body; do not put a JSON body parser in front of it.

## Don't
- Don't skip webhook signature verification or process events outside `handleStripeWebhook`.
- Don't grant access from the checkout success page: wait for the webhook.
- Don't log card data, full webhook payloads or `STRIPE_SECRET_KEY`.
- Don't use live keys in tests or with the MCP server unless the user asks.
