// Qué desbloquea cada precio de Stripe. EDITA este archivo: es configuración de tu app, no del módulo.
// Las claves son IDs de precio (`price_…`); usa variables de entorno si cambian entre test y producción.
export const FEATURES_BY_PRICE: Record<string, readonly string[]> = {
  // [process.env.STRIPE_PRICE_PRO ?? 'price_pro']: ['pro', 'export'],
};

/** Estados de Stripe que dan acceso. `past_due` mantiene el acceso durante los reintentos de cobro. */
export const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'] as const;
