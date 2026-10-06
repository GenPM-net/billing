// @core/billing 2.0 — API pública. Configura los precios en plans.ts; rutas en adapters/hono.ts y adapters/next.ts.
export {
  activeSubscriptions,
  createCheckoutSession,
  createPortalSession,
  ensureCustomer,
  hasEntitlement,
  syncSubscription,
} from './billing.js';
// Compatibilidad con 1.x: el webhook y su tabla viven ahora en @core/stripe.
export { handleStripeWebhook, stripeEvents, type WebhookResult, WebhookSignatureError } from '../stripe/index.js';
export { ACTIVE_STATUSES, FEATURES_BY_PRICE } from './plans.js';
export { billingCustomers, type Subscription, subscriptions } from './schema.js';
export { getStripe, setStripe } from './stripe.js';
