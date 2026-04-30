// ============================================================
// Edge Function: stripe-setup-fee
//
// Gère le paiement des FRAIS D'ACQUISITION (setup fee) lorsqu'un
// commerçant choisit son offre depuis le mode démo de sa boutique.
//
// Endpoints (POST) :
//   /                  → crée une session Stripe Checkout (one-shot payment)
//                        body: { commercant_id, offre, return_url, cancel_url }
//                        return: { url }
//   /webhook           → reçoit les events Stripe (checkout.session.completed)
//                        → active l'abonnement du commerçant
//
// Variables d'environnement requises :
//   STRIPE_SECRET_KEY                (sk_test_... ou sk_live_...)
//   STRIPE_WEBHOOK_SECRET_SETUP_FEE  (whsec_... du endpoint webhook configuré)
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
const OFFRES: Record<string, { name: string; setup_fee: number; monthly_fee: number; description: string }> = {
  vitrine: {
    name: 'Marchéo · Vitrine',
    setup_fee: 24900,    // 249€
    monthly_fee: 1900,   // 19€/mois (info, créé séparément)
    description: 'Frais d\'installation Marchéo Vitrine — Page boutique, galerie, QR code, SEO local.',
  },
  clickcollect: {
    name: 'Marchéo · Click & Collect',
    setup_fee: 39900,    // 399€
    monthly_fee: 3900,   // 39€/mois
    description: 'Frais d\'installation Marchéo Click & Collect — Catalogue, commandes, anti no-show, paiement en ligne.',
  },
  livraison: {
    name: 'Marchéo · Click & Collect + Livraison',
    setup_fee: 54900,    // 549€
    monthly_fee: 5900,   // 59€/mois
    description: 'Frais d\'installation Marchéo Livraison — Tout Click & Collect + livraison à domicile + assistance VIP.',
  },
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const url = new URL(req.url);
  const path = url.pathname.split('/').filter(Boolean).pop() || '';

  // ── Webhook Stripe : checkout.session.completed → activer l'abonnement ──
  if (path === 'webhook') {
    return handleWebhook(req);
  }

  // ── Création de la session Checkout pour les setup fees ──
  try {
    const body = await req.json();
    const { commercant_id, offre, return_url, cancel_url } = body || {};

    if (!commercant_id || !offre) {
      return json({ error: 'commercant_id et offre requis' }, 400);
    }
    const config = OFFRES[offre];
    if (!config) {
      return json({ error: 'Offre invalide. Utilisez : vitrine, clickcollect, livraison' }, 400);
    }

    // Récupérer le commerçant pour pré-remplir e-mail + nom
    const { data: commercant, error: errCommercant } = await supabase
      .from('commercants')
      .select('id, slug, nom_boutique, email, stripe_customer_id, abonnement_actif')
      .eq('id', commercant_id)
      .single();

    if (errCommercant || !commercant) {
      return json({ error: 'Commerçant introuvable' }, 404);
    }
    if (commercant.abonnement_actif === true) {
      return json({ error: 'Cette boutique est déjà active. Connecte-toi à ton dashboard.' }, 409);
    }

    // Réutiliser le customer Stripe s'il existe, sinon en créer un
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

    // Créer la session Checkout (mode payment = one-shot pour les frais d'installation)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId || undefined,
      customer_email: !customerId ? commercant.email : undefined,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: config.name + ' — Frais d\'installation',
              description: config.description,
            },
            unit_amount: config.setup_fee,
          },
          quantity: 1,
        },
      ],
      success_url: (return_url || 'https://www.xn--marcho-fva.fr/' + (commercant.slug || '')) + '&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancel_url || ('https://www.xn--marcho-fva.fr/' + (commercant.slug || '')),
      metadata: {
        commercant_id,
        offre,
        slug: commercant.slug || '',
        type: 'setup_fee',
      },
      // Activer la création automatique d'une facture pour le commerçant
      invoice_creation: { enabled: true },
      // CGV + lien vers les CGV Marchéo
      consent_collection: { terms_of_service: 'required' },
      custom_text: {
        terms_of_service_acceptance: {
          message: 'En cochant cette case, vous acceptez les [CGV Marchéo](https://www.xn--marcho-fva.fr/cgv) et reconnaissez que les frais d\'installation sont non remboursables après mise en ligne de la boutique.',
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

  if (!sig || !webhookSecret) {
    return json({ error: 'Signature ou secret manquant' }, 400);
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err: any) {
    console.error('[webhook] signature invalide:', err.message);
    return json({ error: 'Signature invalide' }, 400);
  }

  // Seul l'event qui nous intéresse : paiement réussi
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const meta = session.metadata || {};

    if (meta.type !== 'setup_fee' || !meta.commercant_id || !meta.offre) {
      return json({ ok: true, ignored: 'Pas un paiement setup_fee' });
    }

    // Activer l'abonnement du commerçant
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from('commercants')
      .update({
        abonnement_actif: true,
        offre: meta.offre,
        abonnement_debut: today,
        // Stocker la session pour traçabilité
        stripe_setup_session_id: session.id,
      })
      .eq('id', meta.commercant_id);

    if (error) {
      console.error('[webhook] erreur update commercant:', error);
      return json({ error: 'Erreur DB' }, 500);
    }

    console.log('[webhook] abonnement activé pour', meta.slug || meta.commercant_id);
    return json({ ok: true, activated: meta.slug || meta.commercant_id });
  }

  // Autres events ignorés
  return json({ ok: true, ignored: event.type });
}
