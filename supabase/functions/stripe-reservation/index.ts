// ============================================================
// Edge Function: stripe-reservation
//
// Crée une SetupIntent Stripe pour prendre l'empreinte bancaire
// d'une réservation de table (anti no-show).
//
// Le client saisit sa carte → SetupIntent confirmé → on stocke
// le payment_method_id sur la résa. Aucun débit n'est fait tant
// que le commerçant ne marque pas 'no_show'.
//
// Actions (POST body { action }):
//   - create   : crée résa + SetupIntent + retourne client_secret
//   - confirm  : marque la résa comme confirmée après confirm carte
//   - release  : libère l'empreinte (client arrivé)
//   - capture  : débite l'empreinte (no-show)
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

const MONTANT_PAR_COUVERT_CENTS = 1500; // 15€/couvert

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const body = await req.json();
    const action = body.action;

    if (action === 'create') {
      const { commercant_id, nb_couverts, date_reservation, heure_reservation, nom_client, prenom_client, telephone, email, notes, occasion } = body;
      if (!commercant_id || !nb_couverts || !date_reservation || !heure_reservation || !nom_client || !telephone) {
        return json({ error: 'Champs requis manquants' }, 400);
      }

      const montant_cents = MONTANT_PAR_COUVERT_CENTS * Number(nb_couverts);

      const customer = await stripe.customers.create({
        email: email || undefined,
        name: (prenom_client ? prenom_client + ' ' : '') + nom_client,
        phone: telephone,
        metadata: { commercant_id, type: 'reservation' },
      });

      const setupIntent = await stripe.setupIntents.create({
        customer: customer.id,
        payment_method_types: ['card'],
        usage: 'off_session',
        metadata: { commercant_id, nb_couverts: String(nb_couverts), date_reservation, heure_reservation, type: 'reservation_empreinte' },
      });

      const { data: reservation, error } = await supabase.from('reservations').insert({
        commercant_id,
        nom_client, prenom_client, telephone, email,
        date_reservation, heure_reservation,
        nb_couverts: Number(nb_couverts),
        notes: notes || null,
        occasion: occasion || null,
        statut: 'nouvelle',
        empreinte_montant_cents: montant_cents,
        empreinte_status: 'pending',
        stripe_customer_id: customer.id,
      }).select().single();

      if (error) {
        console.error('[reservation] insert err:', error);
        return json({ error: 'Erreur DB' }, 500);
      }

      return json({
        client_secret: setupIntent.client_secret,
        setup_intent_id: setupIntent.id,
        reservation_id: reservation.id,
        montant_cents,
      });
    }

    if (action === 'confirm') {
      const { reservation_id, setup_intent_id } = body;
      if (!reservation_id || !setup_intent_id) return json({ error: 'reservation_id + setup_intent_id requis' }, 400);

      const setupIntent = await stripe.setupIntents.retrieve(setup_intent_id);
      if (setupIntent.status !== 'succeeded') return json({ error: 'SetupIntent non confirmé' }, 400);

      await supabase.from('reservations').update({
        statut: 'confirmee',
        date_confirmation: new Date().toISOString(),
        stripe_payment_intent_id: setupIntent.payment_method as string,
      }).eq('id', reservation_id);

      return json({ ok: true });
    }

    if (action === 'release') {
      const { reservation_id } = body;
      if (!reservation_id) return json({ error: 'reservation_id requis' }, 400);

      await supabase.from('reservations').update({
        statut: 'arrivee',
        empreinte_status: 'released',
        date_arrivee: new Date().toISOString(),
      }).eq('id', reservation_id);

      return json({ ok: true });
    }

    if (action === 'capture') {
      const { reservation_id } = body;
      if (!reservation_id) return json({ error: 'reservation_id requis' }, 400);

      const { data: r } = await supabase.from('reservations').select('*').eq('id', reservation_id).single();
      if (!r || !r.stripe_customer_id || !r.stripe_payment_intent_id) return json({ error: 'Empreinte non trouvée' }, 404);

      const pi = await stripe.paymentIntents.create({
        amount: r.empreinte_montant_cents,
        currency: 'eur',
        customer: r.stripe_customer_id,
        payment_method: r.stripe_payment_intent_id,
        off_session: true,
        confirm: true,
        description: 'Empreinte no-show — Réservation ' + r.nb_couverts + ' couverts du ' + r.date_reservation,
        metadata: { reservation_id, type: 'no_show_capture' },
      });

      await supabase.from('reservations').update({
        statut: 'no_show',
        empreinte_status: pi.status === 'succeeded' ? 'captured' : 'failed',
        date_no_show: new Date().toISOString(),
      }).eq('id', reservation_id);

      return json({ ok: true, captured: pi.status === 'succeeded', amount: r.empreinte_montant_cents });
    }

    return json({ error: 'Action inconnue' }, 400);
  } catch (e: any) {
    console.error('[stripe-reservation] error:', e);
    return json({ error: e.message || 'Erreur serveur' }, 500);
  }
});
