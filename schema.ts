// Tablas de @core/billing. Stripe es la fuente de verdad; aquí hay una copia sincronizada por webhooks.
import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from '../auth/schema.js';
import { timestamps } from '../db/index.js';

export const billingCustomers = pgTable('billing_customers', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id').notNull().unique(),
  ...timestamps,
});

/** Una fila por suscripción de Stripe (`sub_…`), actualizada por los webhooks `customer.subscription.*`. */
export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  priceId: text('price_id').notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true, mode: 'date' }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  ...timestamps,
});

/** Idempotencia: cada evento de Stripe se procesa una sola vez aunque llegue repetido. */
export const stripeEvents = pgTable('stripe_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type Subscription = typeof subscriptions.$inferSelect;
