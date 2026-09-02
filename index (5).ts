// ============================================================
// Edge Function: stripe-portal
//
// Crée une session Stripe Customer Portal pour qu'un commerçant puisse :
//   - Mettre à jour son moyen de paiement
//   - Voir ses factures
//   - Résilier son abonnement
//
// Le portail est entièrement géré par Stripe (page hostée).
// La résiliation déclenche customer.subscription.deleted, géré par
// l'edge function stripe-setup-fee/webhook.
//
// Configuration prérequise dans Stripe :
//   1. Activer le Customer Portal sur :
//      https://dashboard.stripe.com/test/settings/billing/portal
//   2. Activer "Cancel subscriptions" dans les options
//
// POST body : { commercant_id, return_url? }
// Return    : { url } → rediriger le commerçant vers cette URL
//
// Variables d'env :
//   STRIPE_SECRET_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
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
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const body = await req.json();
    const { commercant_id, return_url } = body || {};
    if (!commercant_id) return json({ error: 'commercant_id requis' }, 400);

    const { data: commercant, error: errC } = await supabase
      .from('commercants')
      .select('id, slug, nom_boutique, email, stripe_customer_id, abonnement_actif')
      .eq('id', commercant_id).single();
    if (errC || !commercant) return json({ error: 'Commerçant introuvable' }, 404);
    if (!commercant.stripe_customer_id) {
      return json({ error: 'Aucun customer Stripe lié à ce compte. Souscris d\'abord à une offre.' }, 400);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: commercant.stripe_customer_id,
      return_url: return_url || 'https://www.xn--marcho-fva.fr/app-commercant.html',
    });

    return json({ url: session.url });
  } catch (e: any) {
    console.error('[stripe-portal] error:', e);
    return json({ error: e.message || 'Erreur serveur' }, 500);
  }
});
