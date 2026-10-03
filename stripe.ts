// Cliente de Stripe perezoso desde STRIPE_SECRET_KEY. `setStripe` permite inyectar otro en tests.
import Stripe from 'stripe';

let current: Stripe | null = null;

export function getStripe(): Stripe {
  if (!current) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set (see .env.example)');
    current = new Stripe(key);
  }
  return current;
}

export function setStripe(stripe: Stripe): void {
  current = stripe;
}
