// Adaptador Hono. Requiere `sessionMiddleware` de @core/auth antes: `app.route('/billing', billingRoutes())`.
import type { Context } from 'hono';
import { Hono } from 'hono';
import type { AuthVariables } from '../../auth/adapters/hono.js';
import { createCheckoutSession, createPortalSession, handleStripeWebhook, WebhookSignatureError } from '../index.js';

type Env = { Variables: AuthVariables };

const origin = (c: Context) => new URL(c.req.url).origin;

/** POST /checkout {priceId} → {url} · POST /portal → {url} · POST /webhook (Stripe). */
export function billingRoutes() {
  return new Hono<Env>()
    .post('/checkout', async (c) => {
      const user = c.get('user');
      if (!user) return c.json({ error: 'unauthorized' }, 401);
      const { priceId } = await c.req.json<{ priceId?: string }>().catch(() => ({ priceId: undefined }));
      if (!priceId) return c.json({ error: 'priceId required' }, 400);
      return c.json(
        await createCheckoutSession({
          user,
          priceId,
          successUrl: `${origin(c)}/billing/success`,
          cancelUrl: `${origin(c)}/pricing`,
        }),
      );
    })
    .post('/portal', async (c) => {
      const user = c.get('user');
      if (!user) return c.json({ error: 'unauthorized' }, 401);
      return c.json(await createPortalSession(user, `${origin(c)}/account`));
    })
    .post('/webhook', async (c) => {
      try {
        // Cuerpo en bruto: la firma de Stripe se calcula sobre los bytes exactos.
        return c.json(await handleStripeWebhook(await c.req.text(), c.req.header('stripe-signature') ?? null));
      } catch (e) {
        if (e instanceof WebhookSignatureError) return c.json({ error: e.message }, 400);
        throw e;
      }
    });
}
