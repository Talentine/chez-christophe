// ============================================================
// Edge Function: stripe-connect
// Gère l'onboarding Stripe Connect Express des commerçants
//
// Actions (POST body { action, ... }) :
//   - 'onboarding'      → crée/récupère le compte Express + lien d'onboarding
//                         body: { commercant_id }
//                         return: { url } (redirect vers Stripe)
//   - 'dashboard-link'  → lien vers le dashboard Stripe Express du commerçant
//                         body: { commercant_id }
//                         return: { url }
//   - 'status'          → retourne l'état du compte Connect
//                         body: { commercant_id }
//                         return: { actif, charges_enabled, payouts_enabled, details_submitted }
//
// Variables d'environnement requises :
//   STRIPE_SECRET_KEY
//   STRIPE_CONNECT_REFRESH_URL   (ex: https://xn--marcho-fva.fr/app?stripe=refresh)
//   STRIPE_CONNECT_RETURN_URL    (ex: https://xn--marcho-fva.fr/app?stripe=success)
//   PUBLIC_BASE_URL              (ex: https://xn--marcho-fva.fr)
//   SUPABASE_URL                 (auto-injecté)
//   SUPABASE_SERVICE_ROLE_KEY    (auto-injecté)
//
// ⚠️  IMPORTANT : Stripe REFUSE les URLs avec caractères non-ASCII.
//     Le domaine canonique côté pages/UI est "marchéo.fr" (avec accent),
//     mais TOUTES les URLs passées à l'API Stripe doivent utiliser la forme
//     punycode "xn--marcho-fva.fr" (sinon : "Non-ASCII characters in URLs
//     must be percent-encoded"). Le navigateur ré-affiche automatiquement
//     en "marchéo.fr" lors du retour utilisateur. Aucun impact UX.
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

// ⚠️  Punycode obligatoire pour Stripe (rejette les URLs avec caractères non-ASCII).
//     L'utilisateur final voit "marchéo.fr" dans son navigateur — ces URLs servent
//     uniquement aux appels API Stripe et au retour d'onboarding.
const REFRESH_URL = Deno.env.get('STRIPE_CONNECT_REFRESH_URL') || 'https://xn--marcho-fva.fr/app?stripe=refresh';
const RETURN_URL  = Deno.env.get('STRIPE_CONNECT_RETURN_URL')  || 'https://xn--marcho-fva.fr/app?stripe=success';
const PUBLIC_BASE = Deno.env.get('PUBLIC_BASE_URL')             || 'https://xn--marcho-fva.fr';

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
    if (action === 'onboarding')     return await actionOnboarding(payload);
    if (action === 'dashboard-link') return await actionDashboardLink(payload);
    if (action === 'status')         return await actionStatus(payload);
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('[stripe-connect]', e);
    return json({ error: e.message || String(e) }, 500);
  }
});

// ── Charger le commerçant depuis Supabase ──────────────────
async function loadCommercant(commercant_id: string) {
  const { data, error } = await supabase
    .from('commercants')
    .select('id, nom_boutique, email, slug, stripe_connect_id, stripe_connect_actif, business_type')
    .eq('id', commercant_id)
    .single();
  if (error || !data) throw new Error('Commerçant introuvable: ' + (error?.message || commercant_id));
  return data;
}

// ── ONBOARDING ─────────────────────────────────────────────
async function actionOnboarding({ commercant_id }: any) {
  if (!commercant_id) return json({ error: 'commercant_id requis' }, 400);

  const c = await loadCommercant(commercant_id);

  // Créer ou réutiliser le compte Express
  let accountId = c.stripe_connect_id;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'FR',
      email: c.email,
      business_type: 'individual', // sera mis à jour pendant l'onboarding Stripe
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_profile: {
        name: c.nom_boutique,
        url: `${PUBLIC_BASE}/${c.slug}`,
        mcc: getMCC(c.business_type), // code MCC selon le métier
      },
      metadata: {
        commercant_id,
        slug: c.slug,
        plateforme: 'marcheo',
      },
    });

    accountId = account.id;

    // Sauvegarder l'ID dans Supabase
    await supabase.from('commercants').update({
      stripe_connect_id: accountId,
      stripe_connect_actif: false,
    }).eq('id', commercant_id);
  }

  // Générer le lien d'onboarding
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: REFRESH_URL,
    return_url: RETURN_URL,
    type: 'account_onboarding',
    collect: 'eventually_due',
  });

  return json({ url: accountLink.url, account_id: accountId });
}

// ── DASHBOARD LINK ─────────────────────────────────────────
async function actionDashboardLink({ commercant_id }: any) {
  if (!commercant_id) return json({ error: 'commercant_id requis' }, 400);

  const c = await loadCommercant(commercant_id);
  if (!c.stripe_connect_id) return json({ error: 'Compte Stripe non créé' }, 400);

  const loginLink = await stripe.accounts.createLoginLink(c.stripe_connect_id);
  return json({ url: loginLink.url });
}

// ── STATUS ─────────────────────────────────────────────────
async function actionStatus({ commercant_id }: any) {
  if (!commercant_id) return json({ error: 'commercant_id requis' }, 400);

  const c = await loadCommercant(commercant_id);
  if (!c.stripe_connect_id) {
    return json({
      actif: false,
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
      requirements: null,
    });
  }

  const account = await stripe.accounts.retrieve(c.stripe_connect_id);

  const actif = account.charges_enabled && account.payouts_enabled;

  // Synchroniser tous les flags en base — chaque appel /status met à jour la DB
  // (utilisé pour la vue admin v_stripe_connect_status et bloquer les checkout
  //  côté serveur si le compte n'est pas pleinement actif)
  await supabase.from('commercants').update({
    stripe_connect_actif: actif,
    stripe_connect_charges_enabled: !!account.charges_enabled,
    stripe_connect_payouts_enabled: !!account.payouts_enabled,
    stripe_connect_details_submitted: !!account.details_submitted,
    stripe_connect_updated_at: new Date().toISOString(),
  }).eq('id', commercant_id);

  return json({
    actif,
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
    details_submitted: account.details_submitted,
    account_id: c.stripe_connect_id,
    // Liste des champs encore manquants côté Stripe (utile pour debugger côté merchant)
    requirements: {
      currently_due: account.requirements?.currently_due || [],
      eventually_due: account.requirements?.eventually_due || [],
      past_due: account.requirements?.past_due || [],
      disabled_reason: account.requirements?.disabled_reason || null,
    },
  });
}

// ── MCC par métier ─────────────────────────────────────────
// Merchant Category Code Stripe selon le type de commerce
function getMCC(businessType: string): string {
  const map: Record<string, string> = {
    boulangerie:  '5462', // Bakeries
    boucherie:    '5411', // Grocery Stores / Supermarkets
    poissonnerie: '5411',
    primeur:      '5411',
    fromagerie:   '5411',
    traiteur:     '5812', // Eating Places, Restaurants
    fleuriste:    '5992', // Florists
    pizzeria:     '5812', // Eating Places, Restaurants
    restaurant:   '5812', // Eating Places, Restaurants
    fastfood:     '5814', // Fast Food Restaurants
  };
  return map[businessType] || '5411';
}
