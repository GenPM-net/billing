// Adaptador Next.js (App Router), Request/Response estándar:
//   app/billing/checkout/route.ts → export const POST = checkoutRoute;
//   app/billing/portal/route.ts   → export const POST = portalRoute;
//   app/billing/webhook/route.ts  → export const POST = webhookRoute;
import { getUserFromCookieHeader } from '../../auth/index.ts';
import { createCheckoutSession, createPortalSession, handleStripeWebhook, WebhookSignatureError } from '../index.ts';

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function checkoutRoute(req: Request): Promise<Response> {
  const user = await getUserFromCookieHeader(req.headers.get('cookie'));
  if (!user) return json({ error: 'unauthorized' }, 401);
  const { priceId } = (await req.json().catch(() => ({}))) as { priceId?: string };
  if (!priceId) return json({ error: 'priceId required' }, 400);
  const { origin } = new URL(req.url);
  return json(await createCheckoutSession({ user, priceId, successUrl: `${origin}/billing/success`, cancelUrl: `${origin}/pricing` }));
}

export async function portalRoute(req: Request): Promise<Response> {
  const user = await getUserFromCookieHeader(req.headers.get('cookie'));
  if (!user) return json({ error: 'unauthorized' }, 401);
  return json(await createPortalSession(user, `${new URL(req.url).origin}/account`));
}

export async function webhookRoute(req: Request): Promise<Response> {
  try {
    return json(await handleStripeWebhook(await req.text(), req.headers.get('stripe-signature')));
  } catch (e) {
    if (e instanceof WebhookSignatureError) return json({ error: e.message }, 400);
    throw e;
  }
}
