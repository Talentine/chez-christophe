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

// ── Auth : résout l'utilisateur réel depuis le JWT (null si clé anon / absent)
async function getAuthUser(req: Request) {
  const h = req.headers.get('Authorization') || '';
  const jwt = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!jwt) return null;
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data?.user) return null;
  return data.user;
}

// ── Ownership : l'utilisateur est-il le commerçant propriétaire (ou admin) de la commande ?
async function ownsCommande(userId: string, commande_id: string): Promise<boolean> {
  if (!commande_id) return false;
  const { data: cmd } = await supabase.from('commandes').select('commercant_id').eq('id', commande_id).single();
  if (!cmd?.commercant_id) return false;
  const { data: owner } = await supabase.from('commercants')
    .select('id').eq('id', cmd.commercant_id).eq('auth_user_id', userId).maybeSingle();
  if (owner) return true;
  const { data: admin } = await supabase.from('roles_utilisateurs')
    .select('user_id').eq('user_id', userId).eq('role', 'admin').maybeSingle();
  return !!admin;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { action, ...payload } = await req.json();

    // Actions sensibles (débit / libération d'empreinte) : réservées au commerçant
    // propriétaire de la commande. Le cron (auto-release) et le checkout (create) restent ouverts.
    if (action === 'capture' || action === 'release') {
      const user = await getAuthUser(req);
      if (!user) return json({ error: 'Authentification requise' }, 401);
      if (!(await ownsCommande(user.id, payload.commande_id))) return json({ error: 'Accès refusé' }, 403);
    }

    if (action === 'create')        return await actionCreate(payload);
    if (action === 'finalize')      return await actionFinalize(payload);
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

  // Récupérer le stripe_connect_id du commerçant + total pour borner l'empreinte
  const { data: cmd } = await supabase
    .from('commandes')
    .select('commercant_id, total_ttc, commercants(stripe_connect_id, stripe_connect_actif)')
    .eq('id', commande_id)
    .single();

  if (!cmd?.commercant_id) return json({ error: 'Commande introuvable' }, 404);

  // Garde-fou : on ne pré-autorise jamais plus que le total du panier (l'empreinte = 75% du total)
  const maxCents = Math.round(Number(cmd.total_ttc || 0) * 100);
  if (maxCents > 0 && montant_cents > maxCents) return json({ error: 'Montant empreinte invalide' }, 400);

  const connectId = (cmd?.commercants as any)?.stripe_connect_id;
  const connectActif = (cmd?.commercants as any)?.stripe_connect_actif;

  // Find or create Stripe customer
  // Si Connect actif → customer sur le compte connecté, sinon sur le compte plateforme
  let customer;
  if (connectId && connectActif) {
    const existing = await stripe.customers.list({ email, limit: 1 }, { stripeAccount: connectId });
    customer = existing.data[0] ?? await stripe.customers.create({ email, name: nom }, { stripeAccount: connectId });
  } else {
    const existing = await stripe.customers.list({ email, limit: 1 });
    customer = existing.data[0] ?? await stripe.customers.create({ email, name: nom });
  }

  // PaymentIntent with manual capture
  // Si le commerçant a un compte Connect actif → on_behalf_of pour router les fonds
  const intentParams: any = {
    amount: montant_cents,
    currency: 'eur',
    customer: customer.id,
    capture_method: 'manual',
    automatic_payment_methods: { enabled: true },
    metadata: { commande_id: String(commande_id) },
    description: `Empreinte commande ${commande_id}`,
  };

  if (connectId && connectActif) {
    intentParams.on_behalf_of = connectId;
    intentParams.transfer_data = { destination: connectId };
    // 0% commission — application_fee_amount non défini
  }

  const intent = await stripe.paymentIntents.create(intentParams);

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

// ── FINALIZE ───────────────────────────────────────────────
// Appelé par le panier après la confirmation de la carte côté navigateur.
// Bascule le statut de la commande d'après le VRAI statut du PaymentIntent
// (le PATCH commandes en anon est bloqué par RLS owner-only).
async function actionFinalize({ commande_id }: any) {
  if (!commande_id) return json({ error: 'Missing commande_id' }, 400);
  const { data: cmd, error } = await supabase
    .from('commandes').select('stripe_payment_intent_id, statut, empreinte_status').eq('id', commande_id).single();
  if (error || !cmd) return json({ error: 'Commande introuvable' }, 404);

  // Idempotent : n'agir que sur une commande encore en attente d'empreinte
  if (cmd.statut !== 'empreinte_pending') {
    return json({ ok: cmd.statut !== 'annulee', statut: cmd.statut, skipped: true });
  }

  // Aucune empreinte enregistrée = actionCreate a échoué (montant sous le
  // minimum Stripe, carte refusée avant PaymentIntent, appel interrompu...).
  // Sans ce cas, la commande restait en 'empreinte_pending' et s'affichait
  // dans le dashboard du commerçant comme une commande à préparer.
  if (!cmd.stripe_payment_intent_id) {
    await supabase.from('commandes').update({
      statut: 'annulee',
      empreinte_status: 'failed',
    }).eq('id', commande_id);
    return json({ ok: false, statut: 'annulee', raison: 'empreinte jamais créée' });
  }

  const pi = await stripe.paymentIntents.retrieve(cmd.stripe_payment_intent_id);

  if (pi.status === 'requires_capture') {
    await supabase.from('commandes').update({
      statut: 'nouvelle',
      empreinte_status: 'pending',
    }).eq('id', commande_id);
    return json({ ok: true, statut: 'nouvelle' });
  }

  // Tout autre statut = empreinte non autorisée → on annule la commande
  await supabase.from('commandes').update({
    statut: 'annulee',
    empreinte_status: 'failed',
  }).eq('id', commande_id);
  return json({ ok: false, statut: 'annulee', pi_status: pi.status });
}

// ── CAPTURE (no-show, litige) ──────────────────────────────
async function actionCapture({ commande_id }: any) {
  const { data: cmd, error } = await supabase
    .from('commandes').select('stripe_payment_intent_id, empreinte_status').eq('id', commande_id).single();
  if (error || !cmd?.stripe_payment_intent_id) return json({ error: 'Commande introuvable' }, 404);
  if (cmd.empreinte_status !== 'pending') return json({ error: `Empreinte état: ${cmd.empreinte_status}` }, 400);

  await stripe.paymentIntents.capture(cmd.stripe_payment_intent_id);

  await supabase.from('commandes').update({
    statut: 'terminee',
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
