// Checkout, portal, webhooks idempotentes y entitlements. Sin framework: los adaptadores solo traducen HTTP.
import { and, eq, inArray } from 'drizzle-orm';
import type Stripe from 'stripe';
import type { User } from '../auth/index.js';
import { type Executor, getDb, withTransaction } from '../db/index.js';
import { ACTIVE_STATUSES, FEATURES_BY_PRICE } from './plans.js';
import { billingCustomers, type Subscription, stripeEvents, subscriptions } from './schema.js';
import { getStripe } from './stripe.js';

/** Cliente de Stripe del usuario; lo crea la primera vez (con `metadata.userId` para poder volver al usuario). */
export async function ensureCustomer(user: Pick<User, 'id' | 'email' | 'name'>, db: Executor = getDb()): Promise<string> {
  const [row] = await db.select().from(billingCustomers).where(eq(billingCustomers.userId, user.id));
  if (row) return row.stripeCustomerId;
  const customer = await getStripe().customers.create(
    { email: user.email ?? undefined, name: user.name ?? undefined, metadata: { userId: user.id } },
    { idempotencyKey: `customer-${user.id}` },
  );
  await db.insert(billingCustomers).values({ userId: user.id, stripeCustomerId: customer.id }).onConflictDoNothing();
  const [saved] = await db.select().from(billingCustomers).where(eq(billingCustomers.userId, user.id));
  return saved!.stripeCustomerId;
}

export async function createCheckoutSession(opts: {
  user: Pick<User, 'id' | 'email' | 'name'>;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  if (!(opts.priceId in FEATURES_BY_PRICE)) throw new Error(`Unknown price ${opts.priceId}: add it to plans.ts`);
  const customer = await ensureCustomer(opts.user);
  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: opts.user.id,
    line_items: [{ price: opts.priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    subscription_data: { metadata: { userId: opts.user.id } },
    allow_promotion_codes: true,
  });
  if (!session.url) throw new Error('Stripe did not return a checkout URL');
  return { url: session.url };
}

export async function createPortalSession(user: Pick<User, 'id' | 'email' | 'name'>, returnUrl: string): Promise<{ url: string }> {
  const customer = await ensureCustomer(user);
  const s = await getStripe().billingPortal.sessions.create({ customer, return_url: returnUrl });
  return { url: s.url };
}

async function userIdFor(sub: Stripe.Subscription, db: Executor): Promise<string | null> {
  if (sub.metadata?.userId) return sub.metadata.userId;
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const [row] = await db.select().from(billingCustomers).where(eq(billingCustomers.stripeCustomerId, customer));
  return row?.userId ?? null;
}

/** Copia el estado de una suscripción de Stripe a la tabla `subscriptions`. */
export async function syncSubscription(sub: Stripe.Subscription, db: Executor = getDb()): Promise<void> {
  const userId = await userIdFor(sub, db);
  if (!userId) return;
  const item = sub.items.data[0];
  const values = {
    userId,
    status: sub.status,
    priceId: item?.price.id ?? '',
    currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };
  await db
    .insert(subscriptions)
    .values({ id: sub.id, ...values })
    .onConflictDoUpdate({ target: subscriptions.id, set: values });
}

export type WebhookResult = { received: true; duplicate: boolean; type: string };

/**
 * Verifica la firma del webhook y procesa el evento UNA vez: el registro en `stripe_events` y los cambios van en la
 * misma transacción, así que si algo falla Stripe reintenta y se vuelve a procesar.
 */
export async function handleStripeWebhook(rawBody: string, signature: string | null): Promise<WebhookResult> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  if (!signature) throw new WebhookSignatureError('missing stripe-signature header');
  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(rawBody, signature, secret);
  } catch {
    throw new WebhookSignatureError('invalid signature');
  }
  return withTransaction(async (tx) => {
    const inserted = await tx
      .insert(stripeEvents)
      .values({ id: event.id, type: event.type })
      .onConflictDoNothing()
      .returning({ id: stripeEvents.id });
    if (inserted.length === 0) return { received: true, duplicate: true, type: event.type };
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        // Stripe no garantiza el orden de entrega: se guarda el estado actual, no la instantánea del evento, para que
        // un evento viejo que llegue tarde no pise uno más nuevo.
        await syncSubscription(await getStripe().subscriptions.retrieve(event.data.object.id), tx);
        break;
      case 'checkout.session.completed': {
        const s = event.data.object;
        if (s.mode === 'subscription' && s.subscription) {
          const id = typeof s.subscription === 'string' ? s.subscription : s.subscription.id;
          await syncSubscription(await getStripe().subscriptions.retrieve(id), tx);
        }
        break;
      }
    }
    return { received: true, duplicate: false, type: event.type };
  });
}

export class WebhookSignatureError extends Error {}

export async function activeSubscriptions(userId: string, db: Executor = getDb()): Promise<Subscription[]> {
  return db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, [...ACTIVE_STATUSES])));
}

/** ¿Tiene el usuario una suscripción activa cuyo precio desbloquea `feature` (según plans.ts)? */
export async function hasEntitlement(user: Pick<User, 'id'>, feature: string, db: Executor = getDb()): Promise<boolean> {
  const subs = await activeSubscriptions(user.id, db);
  return subs.some((s) => FEATURES_BY_PRICE[s.priceId]?.includes(feature));
}
