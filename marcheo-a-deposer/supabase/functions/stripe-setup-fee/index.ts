// ============================================================
// Edge Function: stripe-setup-fee
//
// Combine en UNE SEULE session Stripe Checkout :
//   - Frais d'installation one-shot (249/399/549€)
//   - Abonnement mensuel récurrent (19/39/59€/mois)
//
// Le 1er paiement = setup fee + 1er mois (ex: 399 + 39 = 438€)
// Les paiements suivants = abonnement mensuel uniquement
//
// Endpoints (POST) :
//   /                  → crée la session Checkout subscription + invoice item
//   /webhook           → reçoit les events Stripe :
//                        - checkout.session.completed → active abonnement
//                        - customer.subscription.deleted → désactive
//                        - invoice.payment_failed → log (Stripe retry auto)
//
// Variables d'environnement requises :
//   STRIPE_SECRET_KEY                (sk_test_... ou sk_live_...)
//   STRIPE_WEBHOOK_SECRET_SETUP_FEE  (whsec_... du endpoint webhook)
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

// ── Tarifs par offre (en centimes) ──────────────────────────────
const OFFRES: Record<string, {
  name: string;
  setup_fee: number;
  monthly_fee: number;
  setup_description: string;
  monthly_description: string;
}> = {
  vitrine: {
    name: 'Marchéo · Vitrine',
    setup_fee: 24900,    // 249€ one-shot
    monthly_fee: 1900,   // 19€/mois
    setup_description: 'Frais d\'installation — Page boutique, galerie, QR code, SEO local.',
    monthly_description: 'Abonnement Marchéo Vitrine — Sans engagement, résiliable à tout moment.',
  },
  clickcollect: {
    name: 'Marchéo · Click & Collect',
    setup_fee: 39900,    // 399€ one-shot
    monthly_fee: 3900,   // 39€/mois
    setup_description: 'Frais d\'installation — Catalogue, commandes, anti no-show 75%, paiements.',
    monthly_description: 'Abonnement Marchéo Click & Collect — Sans engagement, 0% de commission.',
  },
  livraison: {
    name: 'Marchéo · Click & Collect + Livraison',
    setup_fee: 54900,    // 549€ one-shot
    monthly_fee: 5900,   // 59€/mois
    setup_description: 'Frais d\'installation — Click & Collect + livraison à domicile + assistance VIP.',
    monthly_description: 'Abonnement Marchéo Livraison — Sans engagement, 0% de commission.',
  },
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const url = new URL(req.url);
  const path = url.pathname.split('/').filter(Boolean).pop() || '';

  if (path === 'webhook') return handleWebhook(req);

  // ── Création de la session Checkout : setup + subscription combinés ──
  try {
    const body = await req.json();
    const { commercant_id, offre, return_url, cancel_url } = body || {};

    if (!commercant_id || !offre) return json({ error: 'commercant_id et offre requis' }, 400);
    const config = OFFRES[offre];
    if (!config) return json({ error: 'Offre invalide' }, 400);

    const { data: commercant, error: errC } = await supabase
      .from('commercants')
      .select('id, slug, nom_boutique, email, stripe_customer_id, stripe_subscription_id, abonnement_actif')
      .eq('id', commercant_id).single();

    if (errC || !commercant) return json({ error: 'Commerçant introuvable' }, 404);
    if (commercant.abonnement_actif === true && commercant.stripe_subscription_id) {
      return json({ error: 'Tu as déjà un abonnement actif. Connecte-toi à ton dashboard.' }, 409);
    }

    // ── 1. Customer Stripe : réutiliser ou créer ──
    let customerId = commercant.stripe_customer_id;
    if (!customerId && commercant.email) {
      const customer = await stripe.customers.create({
        email: commercant.email,
        name: commercant.nom_boutique || undefined,
        metadata: { commercant_id, slug: commercant.slug || '' },
      });
      customerId = customer.id;
      await supabase.from('commercants').update({ stripe_customer_id: customerId }).eq('id', commercant_id);
    }
    if (!customerId) {
      return json({ error: 'Impossible de créer le client Stripe (email manquant)' }, 400);
    }

    // ── 2. Ajouter le setup fee comme InvoiceItem (sera facturé sur la 1re facture) ──
    await stripe.invoiceItems.create({
      customer: customerId,
      amount: config.setup_fee,
      currency: 'eur',
      description: config.name + ' — ' + config.setup_description,
      metadata: { commercant_id, offre, type: 'setup_fee' },
    });

    // ── 3. Créer la Checkout Session en mode subscription ──
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          // L'abonnement mensuel récurrent
          price_data: {
            currency: 'eur',
            product_data: {
              name: config.name + ' — Abonnement mensuel',
              description: config.monthly_description,
            },
            unit_amount: config.monthly_fee,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        description: config.name + ' — Abonnement sans engagement',
        metadata: {
          commercant_id,
          offre,
          slug: commercant.slug || '',
          type: 'subscription',
        },
      },
      success_url: (return_url || 'https://www.xn--marcho-fva.fr/' + (commercant.slug || ''))
                 + (return_url && return_url.includes('?') ? '&' : '?')
                 + 'session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancel_url || ('https://www.xn--marcho-fva.fr/' + (commercant.slug || '')),
      metadata: {
        commercant_id,
        offre,
        slug: commercant.slug || '',
        type: 'setup_and_subscription',
      },
      // Le client doit accepter les CGV
      consent_collection: { terms_of_service: 'required' },
      custom_text: {
        terms_of_service_acceptance: {
          message:
            'En cochant cette case, j\'accepte les [CGV Marchéo](https://www.xn--marcho-fva.fr/cgv). ' +
            'Le 1er paiement = frais d\'installation + 1er mois d\'abonnement. ' +
            'Ensuite, l\'abonnement se prélève chaque mois et reste résiliable à tout moment depuis le dashboard.',
        },
      },
    });

    return json({ url: session.url, session_id: session.id });
  } catch (e: any) {
    console.error('[stripe-setup-fee] error:', e);
    return json({ error: e.message || 'Erreur serveur' }, 500);
  }
});

// ── Handler Webhook ──────────────────────────────────────────────
async function handleWebhook(req: Request): Promise<Response> {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET_SETUP_FEE');

  if (!sig || !webhookSecret) return json({ error: 'Signature ou secret manquant' }, 400);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err: any) {
    console.error('[webhook] signature invalide:', err.message);
    return json({ error: 'Signature invalide' }, 400);
  }

  // ── checkout.session.completed → activer l'abonnement ──
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const meta = session.metadata || {};
    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;

    if (meta.type !== 'setup_and_subscription' || !meta.commercant_id || !meta.offre) {
      return json({ ok: true, ignored: 'Pas un paiement Marchéo' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from('commercants')
      .update({
        abonnement_actif: true,
        offre: meta.offre,
        abonnement_debut: today,
        abonnement_fin: null,
        stripe_setup_session_id: session.id,
        stripe_subscription_id: subscriptionId || null,
      })
      .eq('id', meta.commercant_id);

    if (error) {
      console.error('[webhook] erreur update commercant:', error);
      return json({ error: 'Erreur DB' }, 500);
    }

    console.log('[webhook] abonnement activé pour', meta.slug || meta.commercant_id, '| sub:', subscriptionId);
    return json({ ok: true, activated: meta.slug || meta.commercant_id, subscription_id: subscriptionId });
  }

  // ── customer.subscription.deleted → désactiver l'abonnement ──
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    const meta = sub.metadata || {};
    if (!meta.commercant_id) {
      return json({ ok: true, ignored: 'Pas de commercant_id dans metadata' });
    }
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from('commercants')
      .update({
        abonnement_actif: false,
        abonnement_fin: today,
      })
      .eq('id', meta.commercant_id);

    if (error) {
      console.error('[webhook] erreur unsubscribe:', error);
      return json({ error: 'Erreur DB' }, 500);
    }
    console.log('[webhook] abonnement résilié pour', meta.commercant_id);
    return json({ ok: true, deactivated: meta.commercant_id });
  }

  // ── invoice.payment_failed → log (Stripe retentera automatiquement) ──
  if (event.type === 'invoice.payment_failed') {
    const inv = event.data.object as Stripe.Invoice;
    console.warn('[webhook] paiement échoué pour customer', inv.customer, 'subscription', inv.subscription);
    // TODO: notifier le commerçant par email/push
    return json({ ok: true, payment_failed: inv.id });
  }

  // Autres events ignorés
  return json({ ok: true, ignored: event.type });
}
