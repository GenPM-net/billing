import { Hono } from 'hono';
import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionMiddleware } from '../auth/adapters/hono.js';
import { createSession, generateSessionToken, upsertOAuthUser } from '../auth/index.js';
import * as authSchema from '../auth/schema.js';
import { testDb } from '../db/__fixtures__/pglite.js';
import { billingRoutes } from './adapters/hono.js';
import { webhookRoute } from './adapters/next.js';
import {
  createCheckoutSession,
  FEATURES_BY_PRICE,
  handleStripeWebhook,
  hasEntitlement,
  setStripe,
  WebhookSignatureError,
} from './index.js';
import * as schema from './schema.js';
import * as stripeSchema from '../stripe/schema.js';

const SECRET = 'whsec_test';
let stripe: Stripe;
let user: authSchema.User;

const subscription = (id: string, status: string, price = 'price_pro', userId = user.id) =>
  ({
    id,
    object: 'subscription',
    status,
    customer: 'cus_1',
    metadata: { userId },
    cancel_at_period_end: false,
    items: { data: [{ price: { id: price }, current_period_end: 1_900_000_000 }] },
  }) as unknown as Stripe.Subscription;

// Estado "actual" en Stripe: el webhook lo consulta en vez de fiarse de la instantánea del evento.
const current = new Map<string, Stripe.Subscription>();

function signed(event: { id: string; type: string; data: { object: unknown } }) {
  const obj = event.data.object as Stripe.Subscription;
  if (obj?.object === 'subscription') current.set(obj.id, obj);
  const payload = JSON.stringify({ object: 'event', api_version: '2026-09-30', ...event });
  return { payload, header: stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) };
}

beforeEach(async () => {
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  await testDb(authSchema, stripeSchema, schema);
  stripe = new Stripe('sk_test_123');
  setStripe(stripe);
  current.clear();
  vi.spyOn(stripe.subscriptions, 'retrieve').mockImplementation((async (id: string) => current.get(id)) as never);
  user = await upsertOAuthUser('github', { id: '1', email: 'a@x.dev', emailVerified: true, name: 'A', avatarUrl: null });
  for (const k of Object.keys(FEATURES_BY_PRICE)) delete FEATURES_BY_PRICE[k];
  FEATURES_BY_PRICE['price_pro'] = ['pro', 'export'];
});

describe('checkout', () => {
  it('creates the Stripe customer once and a subscription checkout', async () => {
    const createCustomer = vi.spyOn(stripe.customers, 'create').mockResolvedValue({ id: 'cus_1' } as never);
    const createSession = vi
      .spyOn(stripe.checkout.sessions, 'create')
      .mockResolvedValue({ url: 'https://checkout.stripe.com/c/1' } as never);
    const opts = { user, priceId: 'price_pro', successUrl: 'https://a/s', cancelUrl: 'https://a/c' };
    expect(await createCheckoutSession(opts)).toEqual({ url: 'https://checkout.stripe.com/c/1' });
    await createCheckoutSession(opts);
    expect(createCustomer).toHaveBeenCalledTimes(1);
    expect(createCustomer.mock.calls[0]![0]).toMatchObject({ metadata: { userId: user.id } });
    expect(createSession.mock.calls[0]![0]).toMatchObject({
      mode: 'subscription',
      customer: 'cus_1',
      client_reference_id: user.id,
      line_items: [{ price: 'price_pro', quantity: 1 }],
    });
    await expect(createCheckoutSession({ ...opts, priceId: 'price_unknown' })).rejects.toThrow(/plans.ts/);
  });
});

describe('webhooks', () => {
  it('rejects bad signatures', async () => {
    const { payload } = signed({ id: 'evt_0', type: 'customer.subscription.created', data: { object: subscription('sub_1', 'active') } });
    await expect(handleStripeWebhook(payload, 't=1,v1=bad')).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(handleStripeWebhook(payload, null)).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it('syncs subscriptions, ignores duplicates and drives entitlements', async () => {
    expect(await hasEntitlement(user, 'pro')).toBe(false);
    const created = signed({ id: 'evt_1', type: 'customer.subscription.created', data: { object: subscription('sub_1', 'active') } });
    expect(await handleStripeWebhook(created.payload, created.header)).toMatchObject({ duplicate: false });
    expect(await handleStripeWebhook(created.payload, created.header)).toMatchObject({ duplicate: true });
    expect(await hasEntitlement(user, 'pro')).toBe(true);
    expect(await hasEntitlement(user, 'enterprise')).toBe(false);

    const deleted = signed({ id: 'evt_2', type: 'customer.subscription.deleted', data: { object: subscription('sub_1', 'canceled') } });
    await handleStripeWebhook(deleted.payload, deleted.header);
    expect(await hasEntitlement(user, 'pro')).toBe(false);
  });

  it('rolls back the event when processing fails, so the retry reprocesses it', async () => {
    const retrieve = vi.spyOn(stripe.subscriptions, 'retrieve').mockRejectedValueOnce(new Error('stripe down'));
    const done = signed({
      id: 'evt_3',
      type: 'checkout.session.completed',
      data: { object: { object: 'checkout.session', mode: 'subscription', subscription: 'sub_9' } },
    });
    await expect(handleStripeWebhook(done.payload, done.header)).rejects.toThrow('stripe down');
    retrieve.mockResolvedValueOnce(subscription('sub_9', 'trialing') as never);
    expect(await handleStripeWebhook(done.payload, done.header)).toMatchObject({ duplicate: false });
    expect(await hasEntitlement(user, 'export')).toBe(true);
  });
});

describe('adapters', () => {
  it('Hono: checkout needs a session; webhook reads the raw body', async () => {
    vi.spyOn(stripe.customers, 'create').mockResolvedValue({ id: 'cus_1' } as never);
    vi.spyOn(stripe.checkout.sessions, 'create').mockResolvedValue({ url: 'https://checkout.stripe.com/c/2' } as never);
    const app = new Hono().use(sessionMiddleware).route('/billing', billingRoutes());
    const post = (path: string, init: RequestInit = {}) => app.request(path, { method: 'POST', ...init });
    expect((await post('/billing/checkout', { body: '{"priceId":"price_pro"}' })).status).toBe(401);
    const token = generateSessionToken();
    await createSession(token, user.id);
    const res = await post('/billing/checkout', { body: '{"priceId":"price_pro"}', headers: { cookie: `session=${token}` } });
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/c/2' });

    const ev = signed({ id: 'evt_4', type: 'customer.subscription.updated', data: { object: subscription('sub_2', 'active') } });
    const hook = await post('/billing/webhook', { body: ev.payload, headers: { 'stripe-signature': ev.header } });
    expect(hook.status).toBe(200);
    expect((await post('/billing/webhook', { body: ev.payload, headers: { 'stripe-signature': 'x' } })).status).toBe(400);
  });

  it('Next: webhook route', async () => {
    const ev = signed({ id: 'evt_5', type: 'customer.subscription.created', data: { object: subscription('sub_3', 'active') } });
    const res = await webhookRoute(new Request('https://a/billing/webhook', { method: 'POST', body: ev.payload, headers: { 'stripe-signature': ev.header } }));
    expect(await res.json()).toMatchObject({ received: true, duplicate: false });
  });
});

describe('webhooks fuera de orden', () => {
  it('un evento viejo que llega tarde no pisa el estado actual', async () => {
    const created = signed({ id: 'evt_a', type: 'customer.subscription.created', data: { object: subscription('sub_9', 'active') } });
    const deleted = signed({ id: 'evt_b', type: 'customer.subscription.deleted', data: { object: subscription('sub_9', 'canceled') } });
    await handleStripeWebhook(deleted.payload, deleted.header);
    await handleStripeWebhook(created.payload, created.header);
    expect(await hasEntitlement(user, 'pro')).toBe(false);
  });
});
