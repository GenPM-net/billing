// @core/billing — API pública. Configura los precios en plans.ts; rutas en adapters/hono.ts y adapters/next.ts.
export {
  activeSubscriptions,
  createCheckoutSession,
  createPortalSession,
  ensureCustomer,
  handleStripeWebhook,
  hasEntitlement,
  syncSubscription,
  WebhookSignatureError,
  type WebhookResult,
} from './billing.js';
export { ACTIVE_STATUSES, FEATURES_BY_PRICE } from './plans.js';
export { billingCustomers, type Subscription, stripeEvents, subscriptions } from './schema.js';
export { getStripe, setStripe } from './stripe.js';
