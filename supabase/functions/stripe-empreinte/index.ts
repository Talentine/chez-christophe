// ============================================================
// Edge Function: stripe-empreinte
// Gère le cycle de vie de l'empreinte bancaire
//
// Actions (POST body { action, ... }) :
//   - 'create'     → crée PaymentIntent capture_method=manual
//                    body: { commande_id, montant_cents, email, nom }
//                    return: { client_secret, payment_intent_id, customer_id }
//   - 'capture'    → débite l'empreinte (no-show, litige)
//                    body: { commande_id }
//                    return: { ok }
//   - 'release'    → libère l'empreinte (client venu)
//                    body: { commande_id }
//                    return: { ok }
//   - 'auto-release' → libère toutes les empreintes expirées (cron)
//                    return: { released_count }
//
// Variables d'environnement requises :
//   STRIPE_SECRET_KEY          (sk_test_... ou sk_live_...)
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  (côté serveur, full access)
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.0.0?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { action, ...payload } = await req.json();

    if (action === 'create')        return await actionCreate(payload);
    if (action === 'capture')       return await actionCapture(payload);
    if (action === 'release')       return await actionRelease(payload);
    if (action === 'auto-release')  return await actionAutoRelease();

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('[stripe-empreinte]', e);
    return json({ error: e.message || String(e) }, 500);
  }
});

// ── CREATE ─────────────────────────────────────────────────
async function actionCreate({ commande_id, montant_cents, email, nom }: any) {
  if (!commande_id || !montant_cents) return json({ error: 'Missing params' }, 400);
  if (montant_cents < 50) return json({ error: 'Montant trop faible (min 0.50€)' }, 400);

  // Find or create Stripe customer
  let customer;
  const existing = await stripe.customers.list({ email, limit: 1 });
  customer = existing.data[0] ?? await stripe.customers.create({ email, name: nom });

  // PaymentIntent with manual capture
  const intent = await stripe.paymentIntents.create({
    amount: montant_cents,
    currency: 'eur',
    customer: customer.id,
    capture_method: 'manual',
    automatic_payment_methods: { enabled: true },
    metadata: { commande_id: String(commande_id) },
    description: `Empreinte commande ${commande_id}`,
  });

  // Save on commande
  await supabase.from('commandes').update({
    stripe_payment_intent_id: intent.id,
    stripe_customer_id: customer.id,
    empreinte_montant_cents: montant_cents,
    empreinte_status: 'pending',
  }).eq('id', commande_id);

  return json({
    client_secret: intent.client_secret,
    payment_intent_id: intent.id,
    customer_id: customer.id,
  });
}

// ── CAPTURE (no-show, litige) ──────────────────────────────
async function actionCapture({ commande_id }: any) {
  const { data: cmd, error } = await supabase
    .from('commandes').select('stripe_payment_intent_id, empreinte_status').eq('id', commande_id).single();
  if (error || !cmd?.stripe_payment_intent_id) return json({ error: 'Commande introuvable' }, 404);
  if (cmd.empreinte_status !== 'pending') return json({ error: `Empreinte état: ${cmd.empreinte_status}` }, 400);

  await stripe.paymentIntents.capture(cmd.stripe_payment_intent_id);

  await supabase.from('commandes').update({
    empreinte_status: 'captured',
    empreinte_capturee_at: new Date().toISOString(),
  }).eq('id', commande_id);

  return json({ ok: true });
}

// ── RELEASE (client venu, ou manuel) ───────────────────────
async function actionRelease({ commande_id }: any) {
  const { data: cmd, error } = await supabase
    .from('commandes').select('stripe_payment_intent_id, empreinte_status').eq('id', commande_id).single();
  if (error || !cmd?.stripe_payment_intent_id) return json({ error: 'Commande introuvable' }, 404);
  if (cmd.empreinte_status !== 'pending') return json({ ok: true, skipped: true });

  await stripe.paymentIntents.cancel(cmd.stripe_payment_intent_id);

  await supabase.from('commandes').update({
    empreinte_status: 'released',
  }).eq('id', commande_id);

  return json({ ok: true });
}

// ── AUTO-RELEASE (cron — toutes les commandes expirées) ────
async function actionAutoRelease() {
  const { data: rows } = await supabase
    .from('commandes_empreintes_a_liberer')
    .select('id, stripe_payment_intent_id');

  let released = 0;
  for (const r of rows || []) {
    try {
      await stripe.paymentIntents.cancel(r.stripe_payment_intent_id);
      await supabase.from('commandes').update({ empreinte_status: 'released' }).eq('id', r.id);
      released++;
    } catch (e) {
      console.error('auto-release fail', r.id, e.message);
    }
  }

  return json({ released_count: released });
}
