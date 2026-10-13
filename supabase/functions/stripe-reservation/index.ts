// ============================================================
// Edge Function: stripe-reservation
//
// Crée une SetupIntent Stripe pour prendre l'empreinte bancaire
// d'une réservation de table (anti no-show).
// Boutique démo (abonnement non actif) : réservation de test confirmée
// directement, sans carte ni Stripe.
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

// Fallback si le commerçant n'a rien configuré (commercants.empreinte_couvert_cents IS NULL)
const MONTANT_PAR_COUVERT_CENTS_FALLBACK = 1000; // 10€/couvert

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// ── Auth : résout l'utilisateur réel depuis le JWT (null si clé anon / absent)
async function getAuthUser(req: Request) {
  const h = req.headers.get('Authorization') || '';
  const jwt = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!jwt) return null;
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data?.user) return null;
  return data.user;
}

// ── Ownership : l'utilisateur est-il le commerçant propriétaire (ou admin) de la réservation ?
async function ownsReservation(userId: string, reservation_id: string): Promise<boolean> {
  if (!reservation_id) return false;
  const { data: r } = await supabase.from('reservations').select('commercant_id').eq('id', reservation_id).single();
  if (!r?.commercant_id) return false;
  const { data: owner } = await supabase.from('commercants')
    .select('id').eq('id', r.commercant_id).eq('auth_user_id', userId).maybeSingle();
  if (owner) return true;
  const { data: admin } = await supabase.from('roles_utilisateurs')
    .select('user_id').eq('user_id', userId).eq('role', 'admin').maybeSingle();
  return !!admin;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const body = await req.json();
    const action = body.action;

    // Actions sensibles (débit / libération / geste commercial) : réservées au
    // commerçant propriétaire. create/confirm/cancel_by_client restent ouverts
    // (checkout invité + annulation client via cancel_token non devinable).
    if (action === 'capture' || action === 'release' || action === 'commercial_gesture') {
      const user = await getAuthUser(req);
      if (!user) return json({ error: 'Authentification requise' }, 401);
      if (!(await ownsReservation(user.id, body.reservation_id))) return json({ error: 'Accès refusé' }, 403);
    }

    if (action === 'create') {
      const { commercant_id, nb_couverts, date_reservation, heure_reservation, nom_client, prenom_client, telephone, email, notes, occasion } = body;
      if (!commercant_id || !nb_couverts || !date_reservation || !heure_reservation || !nom_client || !telephone) {
        return json({ error: 'Champs requis manquants' }, 400);
      }

      // ── Lit les paramètres du commerçant : montant par couvert + politique d'annulation
      const { data: biz, error: bizErr } = await supabase
        .from('commercants')
        .select('empreinte_couvert_cents, cancellation_policy_hours, abonnement_actif')
        .eq('id', commercant_id)
        .single();
      if (bizErr || !biz) {
        console.error('[reservation] biz lookup err:', bizErr);
        return json({ error: 'Commerçant introuvable' }, 404);
      }
      const cancellation_policy_hours = Number(biz.cancellation_policy_hours) || 24;

      // ── Boutique démo : réservation de test, aucune carte demandée, aucun débit possible
      if (biz.abonnement_actif !== true) {
        const { data: resaDemo, error: demoErr } = await supabase.from('reservations').insert({
          commercant_id,
          nom_client, prenom_client, telephone, email,
          date_reservation, heure_reservation,
          nb_couverts: Number(nb_couverts),
          notes: notes || null,
          occasion: occasion || null,
          statut: 'confirmee',
          date_confirmation: new Date().toISOString(),
          empreinte_montant_cents: 0,
          empreinte_status: 'none',
        }).select().single();
        if (demoErr) {
          console.error('[reservation] demo insert err:', demoErr);
          return json({ error: 'Erreur DB' }, 500);
        }
        return json({
          demo: true,
          reservation_id: resaDemo.id,
          cancel_token: resaDemo.cancel_token,
          montant_cents: 0,
          cancellation_policy_hours,
        });
      }

      const montantParCouvertCents = Number(biz.empreinte_couvert_cents) > 0
        ? Number(biz.empreinte_couvert_cents)
        : MONTANT_PAR_COUVERT_CENTS_FALLBACK;

      const montant_cents = montantParCouvertCents * Number(nb_couverts);

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
        cancel_token: reservation.cancel_token,
        montant_cents,
        montant_par_couvert_cents: montantParCouvertCents,
        cancellation_policy_hours,
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

    // ── Annulation par le client (via cancel_token non devinable, sans auth).
    // Dans les délais (peut_annuler_gratuit, calculé côté serveur par la vue) :
    // aucun débit. Hors délai : on débite l'empreinte sur la carte enregistrée
    // (le client accepte explicitement via le bouton "annuler quand même").
    if (action === 'cancel_by_client') {
      const { cancel_token } = body;
      if (!cancel_token) return json({ error: 'cancel_token requis' }, 400);

      const { data: r, error: rErr } = await supabase
        .from('reservations_avec_deadline')
        .select('id, statut, empreinte_status, empreinte_montant_cents, stripe_customer_id, stripe_payment_intent_id, peut_annuler_gratuit')
        .eq('cancel_token', cancel_token)
        .maybeSingle();
      if (rErr || !r) return json({ error: 'Réservation introuvable' }, 404);

      if (r.statut === 'annulee') return json({ error: 'Réservation déjà annulée' }, 400);
      if (r.statut === 'arrivee' || r.statut === 'no_show') {
        return json({ error: 'Réservation déjà traitée par le restaurant' }, 400);
      }

      const fmtEur = (c: number) => (Number(c || 0) / 100).toFixed(0) + '€';
      const nowIso = new Date().toISOString();

      // Dans les délais → annulation gratuite, aucun débit
      if (r.peut_annuler_gratuit) {
        await supabase.from('reservations').update({
          statut: 'annulee',
          empreinte_status: 'released',
          date_annulation: nowIso,
          annule_par: 'client',
        }).eq('id', r.id);
        return json({ ok: true, libere: true, message: 'Réservation annulée. Aucun montant ne sera débité.' });
      }

      // Hors délai : débit possible seulement si une carte est enregistrée et l'empreinte encore pending
      const peutDebiter = !!r.stripe_customer_id && !!r.stripe_payment_intent_id
        && Number(r.empreinte_montant_cents) > 0 && r.empreinte_status === 'pending';

      if (!peutDebiter) {
        await supabase.from('reservations').update({
          statut: 'annulee',
          empreinte_status: r.empreinte_status === 'pending' ? 'released' : r.empreinte_status,
          date_annulation: nowIso,
          annule_par: 'client',
        }).eq('id', r.id);
        return json({ ok: true, libere: true, message: 'Réservation annulée.' });
      }

      let captured = false;
      try {
        const pi = await stripe.paymentIntents.create({
          amount: Number(r.empreinte_montant_cents),
          currency: 'eur',
          customer: r.stripe_customer_id as string,
          payment_method: r.stripe_payment_intent_id as string,
          off_session: true,
          confirm: true,
          description: 'Empreinte annulation hors délai — Réservation ' + r.id,
          metadata: { reservation_id: r.id, type: 'late_cancel_capture' },
        });
        captured = pi.status === 'succeeded';
      } catch (e: any) {
        console.error('[reservation] late-cancel charge failed:', e?.message || e);
        captured = false;
      }

      await supabase.from('reservations').update({
        statut: 'annulee',
        empreinte_status: captured ? 'captured' : 'failed',
        date_annulation: nowIso,
        annule_par: 'client',
      }).eq('id', r.id);

      return json({
        ok: true,
        libere: false,
        captured,
        message: captured
          ? 'Réservation annulée. L\'empreinte de ' + fmtEur(Number(r.empreinte_montant_cents)) + ' a été débitée (annulation hors délai).'
          : 'Réservation annulée. Le débit de l\'empreinte n\'a pas pu être traité — le restaurant vous recontactera.',
      });
    }

    // ── Geste commercial (commerçant) : annule la réservation SANS débit et
    // enregistre la raison. Empreinte (carte off_session) simplement libérée.
    if (action === 'commercial_gesture') {
      const { reservation_id, raison } = body;
      if (!reservation_id) return json({ error: 'reservation_id requis' }, 400);

      await supabase.from('reservations').update({
        statut: 'annulee',
        empreinte_status: 'released',
        date_annulation: new Date().toISOString(),
        annule_par: 'geste_commercial',
        geste_commercial_raison: raison || null,
      }).eq('id', reservation_id);

      return json({ ok: true, libere: true });
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
