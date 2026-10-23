// stripe-setup-fee v13 - codes promo appliques au paiement (remise sur l'installation + mois offerts), verifies cote serveur
// v12 : lien d'activation direct (slug) + checkout adapte Belgique (TVA BE obligatoire, adresse de facturation, locale fr)
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.0.0?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2023-10-16', httpClient: Stripe.createFetchHttpClient() });
const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

async function dbg(step, data) { try { await supabase.from('webhook_debug_logs').insert({ source: 'stripe-setup-fee', step, data }); } catch (_) {} }

const OFFRES = {
  vitrine: { name: 'Marcheo Vitrine', setup_fee: 24900, monthly_fee: 1900, setup_description: 'Frais installation - Page boutique, galerie, QR code, SEO local.', monthly_description: 'Abonnement Marcheo Vitrine - Sans engagement.', first_month_free: false },
  clickcollect: { name: 'Marcheo Click and Collect', setup_fee: 39900, monthly_fee: 3900, setup_description: 'Frais installation - Catalogue, commandes, anti no-show 75%.', monthly_description: 'Abonnement Marcheo Click and Collect - 1er mois offert puis 39 EUR/mois.', first_month_free: true },
  livraison: { name: 'Marcheo Click and Collect + Livraison', setup_fee: 54900, monthly_fee: 5900, setup_description: 'Frais installation - Click and Collect + livraison + assistance VIP.', monthly_description: 'Abonnement Marcheo Livraison - 1er mois offert puis 59 EUR/mois.', first_month_free: true },
};
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Resout le code promo a appliquer au paiement. Tout est verifie ici, cote serveur :
// le montant envoye par le navigateur n'est jamais utilise.
// - code saisi au moment du paiement (body.code_promo) : doit etre valable maintenant ;
// - sinon, code enregistre a l'inscription (commercants.code_promo_id) : doit avoir ete valable le jour de l'inscription
//   (le commercant qui s'inscrit le 20/11 garde sa remise s'il paie quelques jours plus tard).
async function resoudreCodePromo(codeSaisi, commercant) {
  const now = Date.now();
  let row = null; let reference = now;
  if (codeSaisi && typeof codeSaisi === 'string' && codeSaisi.trim()) {
    const { data } = await supabase.from('codes_promo').select('*').eq('code', codeSaisi.trim().toUpperCase()).eq('actif', true).maybeSingle();
    if (!data) return { erreur: 'Code promo inconnu ou desactive' };
    row = data;
  } else if (commercant.code_promo_id) {
    const { data } = await supabase.from('codes_promo').select('*').eq('id', commercant.code_promo_id).maybeSingle();
    if (!data) return null;
    row = data;
    reference = commercant.created_at ? new Date(commercant.created_at).getTime() : now;
  } else {
    return null;
  }
  if (row.type === 'test_gratuit') return null;
  if (row.valide_depuis && new Date(row.valide_depuis).getTime() > reference) return { erreur: 'Ce code n est pas encore valable' };
  if (row.valide_jusque && new Date(row.valide_jusque).getTime() < reference) return { erreur: 'Ce code a expire' };
  if (codeSaisi && row.max_utilisations != null && (row.utilisations || 0) >= row.max_utilisations) return { erreur: 'Ce code est epuise' };
  const pct = row.type === 'frais_acquisition_pct' ? Math.min(Math.max(Number(row.valeur) || 0, 0), 100) : 0;
  let mois = 0;
  if (row.type === 'mois_offert') mois = parseInt(row.valeur || 0, 10) || 0;
  if (row.mois_offerts) mois = Math.max(mois, parseInt(row.mois_offerts, 10) || 0);
  mois = Math.min(mois, 12);
  return { id: row.id, code: String(row.code).toUpperCase(), pct, mois, saisi: !!codeSaisi };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const url = new URL(req.url);
  const path = url.pathname.split('/').filter(Boolean).pop() || '';
  if (path === 'webhook') return handleWebhook(req);
  try {
    const body = await req.json();
    const { commercant_id: idIn, slug: slugIn, offre, return_url, cancel_url, referral_code, client_ip, fingerprint, user_agent, code_promo, simulation } = body || {};
    if ((!idIn && !slugIn) || !offre) return json({ error: 'commercant_id (ou slug) et offre requis' }, 400);
    const config = OFFRES[offre];
    if (!config) return json({ error: 'Offre invalide' }, 400);
    let q = supabase.from('commercants').select('id, slug, nom_boutique, email, pays, stripe_customer_id, stripe_subscription_id, abonnement_actif, code_promo_id, created_at');
    q = idIn ? q.eq('id', idIn) : q.eq('slug', String(slugIn).toLowerCase());
    const { data: commercant, error: errC } = await q.single();
    if (errC || !commercant) return json({ error: 'Commercant introuvable' }, 404);
    const commercant_id = commercant.id;
    if (commercant.abonnement_actif === true && commercant.stripe_subscription_id) return json({ error: 'Abonnement deja actif', deja_actif: true, slug: commercant.slug }, 409);

    // ── Code promo (remise installation + mois offerts)
    const promo = await resoudreCodePromo(code_promo, commercant);
    if (promo && promo.erreur) return json({ error: promo.erreur, code_promo_invalide: true }, 400);
    // Prix remise arrondi a l'euro inferieur (ex. 399 EUR -30 % = 279 EUR)
    const setupFee = promo && promo.pct ? Math.floor(config.setup_fee * (100 - promo.pct) / 100 / 100) * 100 : config.setup_fee;
    const moisOfferts = promo && promo.mois ? promo.mois : (config.first_month_free ? 1 : 0);
    const trialDays = moisOfferts * 30;
    const avecEssai = trialDays > 0;
    const libelleMois = moisOfferts > 1 ? moisOfferts + ' mois d abonnement OFFERTS' : '1er mois d abonnement OFFERT';
    const libellePromo = promo ? (' - Code ' + promo.code + (promo.pct ? ' (-' + promo.pct + ' %)' : '')) : '';

    // Simulation (verification sans creer de paiement)
    if (simulation === true) return json({ simulation: true, offre, setup_fee: setupFee, setup_fee_normal: config.setup_fee, mois_offerts: moisOfferts, trial_days: trialDays, code: promo ? promo.code : null });

    let resolved_referral_code = null;
    if (referral_code && typeof referral_code === 'string') {
      const { data: amb } = await supabase.from('ambassadeurs').select('user_id, code_referral, bloque_at').eq('code_referral', referral_code.toUpperCase()).maybeSingle();
      if (amb && !amb.bloque_at) { resolved_referral_code = amb.code_referral; await dbg('referral_resolved', { code: resolved_referral_code, amb_user_id: amb.user_id }); }
      else { await dbg('referral_invalid', { code: referral_code, found: !!amb, bloque: !!(amb && amb.bloque_at) }); }
    }

    let customerId = commercant.stripe_customer_id;
    if (!customerId && commercant.email) {
      const customer = await stripe.customers.create({ email: commercant.email, name: commercant.nom_boutique || undefined, metadata: { commercant_id, slug: commercant.slug || '' } });
      customerId = customer.id;
      await supabase.from('commercants').update({ stripe_customer_id: customerId }).eq('id', commercant_id);
    }
    if (!customerId) return json({ error: 'Email manquant pour creer customer Stripe' }, 400);

    const successUrl = (return_url || 'https://www.xn--marcho-fva.fr/' + (commercant.slug || '')) + (return_url && return_url.includes('?') ? '&' : '?') + 'session_id={CHECKOUT_SESSION_ID}';
    const cancelUrl = cancel_url || ('https://www.xn--marcho-fva.fr/' + (commercant.slug || ''));

    const baseMeta = { commercant_id, offre, slug: commercant.slug || '', pays: commercant.pays || 'FR' };
    if (resolved_referral_code) baseMeta.referral_code = resolved_referral_code;
    if (client_ip) baseMeta.client_ip = String(client_ip).slice(0, 64);
    if (fingerprint) baseMeta.fingerprint = String(fingerprint).slice(0, 128);
    if (user_agent) baseMeta.user_agent = String(user_agent).slice(0, 200);
    if (promo) { baseMeta.code_promo = promo.code; baseMeta.code_promo_id = promo.id; baseMeta.code_promo_saisi = promo.saisi ? '1' : '0'; }
    baseMeta.setup_fee_paye = String(setupFee);

    // Adresse de facturation + numero de TVA, page en francais.
    // Commerce belge : le numero de TVA (BE0...) est OBLIGATOIRE des que le pays de facturation est la Belgique
    // (necessaire pour la facture en autoliquidation). Commerce francais : facultatif.
    const estBelge = (commercant.pays || 'FR') === 'BE';
    const facturation = {
      locale: 'fr',
      billing_address_collection: 'required',
      tax_id_collection: estBelge ? { enabled: true, required: 'if_supported' } : { enabled: true },
      customer_update: { name: 'auto', address: 'auto' },
    };

    const prixMensuel = (config.monthly_fee / 100) + ' EUR/mois';
    let session;
    if (avecEssai) {
      // Frais d'installation payes aujourd'hui, abonnement cree par le webhook avec la periode offerte
      session = await stripe.checkout.sessions.create({
        mode: 'payment', customer: customerId, payment_method_types: ['card'],
        ...facturation,
        payment_intent_data: { setup_future_usage: 'off_session' },
        line_items: [{ price_data: { currency: 'eur', product_data: { name: config.name + ' - Frais d installation' + libellePromo, description: config.setup_description + ' ' + libelleMois + ', puis ' + prixMensuel + '.' }, unit_amount: setupFee }, quantity: 1 }],
        success_url: successUrl, cancel_url: cancelUrl,
        metadata: { ...baseMeta, type: 'setup_then_trial', trial_days: String(trialDays), monthly_fee: config.monthly_fee.toString(), monthly_name: config.name + ' - Abonnement mensuel', monthly_description: config.monthly_description },
        invoice_creation: { enabled: true },
        consent_collection: { terms_of_service: 'required' },
        custom_text: { terms_of_service_acceptance: { message: 'J accepte les [CGV Marcheo](https://www.xn--marcho-fva.fr/cgv). Je paie aujourd hui uniquement les frais d installation. ' + libelleMois + ' (' + trialDays + ' jours). Ensuite, l abonnement mensuel de ' + prixMensuel + ' est preleve automatiquement et reste resiliable a tout moment, sans engagement.' } },
      });
    } else {
      await stripe.invoiceItems.create({ customer: customerId, amount: setupFee, currency: 'eur', description: config.name + ' - ' + config.setup_description + libellePromo, metadata: { commercant_id, offre, type: 'setup_fee' } });
      session = await stripe.checkout.sessions.create({
        mode: 'subscription', customer: customerId, payment_method_types: ['card'],
        ...facturation,
        line_items: [{ price_data: { currency: 'eur', product_data: { name: config.name + ' - Abonnement mensuel', description: config.monthly_description }, unit_amount: config.monthly_fee, recurring: { interval: 'month' } }, quantity: 1 }],
        subscription_data: { description: config.name + ' - Abonnement sans engagement', metadata: { ...baseMeta, type: 'subscription' } },
        success_url: successUrl, cancel_url: cancelUrl,
        metadata: { ...baseMeta, type: 'setup_and_subscription' },
        consent_collection: { terms_of_service: 'required' },
        custom_text: { terms_of_service_acceptance: { message: 'J accepte les [CGV Marcheo](https://www.xn--marcho-fva.fr/cgv). 1er paiement = frais d installation + 1er mois. Ensuite, abonnement preleve chaque mois et resiliable a tout moment.' } },
      });
    }
    return json({ url: session.url, session_id: session.id, referral_attached: !!resolved_referral_code, code_promo: promo ? promo.code : null, setup_fee: setupFee, mois_offerts: moisOfferts });
  } catch (e) { await dbg('checkout_create_error', { msg: e.message, stack: e.stack }); return json({ error: e.message || 'Erreur serveur' }, 500); }
});

async function traiterReferralPourCheckout(meta, session) {
  const code = meta.referral_code; const commercant_id = meta.commercant_id; const offre = meta.offre;
  if (!code || !commercant_id || !offre) { await dbg('referral_skip_no_meta', { meta }); return; }
  const { data: amb } = await supabase.from('ambassadeurs').select('user_id, code_referral, bloque_at').eq('code_referral', code).maybeSingle();
  if (!amb) { await dbg('referral_amb_not_found', { code }); return; }
  let pmFingerprint = null;
  try {
    let paymentIntentId = null;
    if (session.payment_intent) { paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id; }
    else if (session.subscription) {
      const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId, { expand: ['latest_invoice.payment_intent'] });
        const li = sub.latest_invoice;
        if (li && li.payment_intent) { paymentIntentId = typeof li.payment_intent === 'string' ? li.payment_intent : li.payment_intent.id; }
      }
    }
    if (paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['payment_method'] });
      const pm = pi.payment_method;
      if (pm && pm.card && pm.card.fingerprint) pmFingerprint = pm.card.fingerprint;
    }
  } catch (e) { await dbg('referral_pm_fingerprint_error', { msg: e.message }); }

  const { data: existingRef } = await supabase.from('referrals').select('id').eq('commercant_id', commercant_id).maybeSingle();
  let referralId = existingRef ? existingRef.id : null;
  if (!referralId) {
    const { data: ins, error: insErr } = await supabase.from('referrals').insert({
      ambassadeur_id: amb.user_id, commercant_id, code_utilise: code, source: 'lien_direct',
      ip_inscription: meta.client_ip || null, user_agent_inscription: meta.user_agent || null,
      fingerprint_inscription: meta.fingerprint || null, payment_method_fingerprint: pmFingerprint,
    }).select('id').single();
    if (insErr) { await dbg('referral_insert_error', { error: insErr.message }); return; }
    referralId = ins.id;
  } else if (pmFingerprint) {
    await supabase.from('referrals').update({ payment_method_fingerprint: pmFingerprint }).eq('id', referralId);
  }

  const { data: rpcRes, error: rpcErr } = await supabase.rpc('fn_traiter_paiement_referral', {
    p_commercant_id: commercant_id, p_offre: offre, p_stripe_session_id: session.id,
    p_payment_method_fp: pmFingerprint, p_ip_paiement: meta.client_ip || null, p_user_agent: meta.user_agent || null,
  });
  if (rpcErr) await dbg('referral_rpc_error', { error: rpcErr.message });
  else await dbg('referral_payout_cree', { result: rpcRes, code, commercant_id });
}

// Enregistre le code promo utilise au paiement sur la fiche commercant (+ compteur d'utilisations si saisi au paiement)
async function enregistrerCodePromoPaye(meta) {
  if (!meta.code_promo_id || !meta.commercant_id) return;
  try {
    const maj = { code_promo_id: meta.code_promo_id, code_promo_utilise: meta.code_promo || null };
    if (meta.setup_fee_paye) maj.frais_acquisition_paye = parseInt(meta.setup_fee_paye, 10) / 100;
    if (meta.trial_days) maj.mois_offerts = Math.round(parseInt(meta.trial_days, 10) / 30);
    await supabase.from('commercants').update(maj).eq('id', meta.commercant_id);
    if (meta.code_promo_saisi === '1') {
      const { data: cp } = await supabase.from('codes_promo').select('utilisations').eq('id', meta.code_promo_id).maybeSingle();
      if (cp) await supabase.from('codes_promo').update({ utilisations: (cp.utilisations || 0) + 1 }).eq('id', meta.code_promo_id);
    }
    await dbg('code_promo_paye', { commercant_id: meta.commercant_id, code: meta.code_promo, setup_fee_paye: meta.setup_fee_paye, trial_days: meta.trial_days });
  } catch (e) { await dbg('code_promo_paye_error', { msg: e.message }); }
}

async function handleWebhook(req) {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET_SETUP_FEE');
  if (!sig || !webhookSecret) { await dbg('missing_sig_or_secret', { sig: !!sig, secret: !!webhookSecret }); return json({ error: 'Signature ou secret manquant' }, 400); }
  let event;
  try { event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret); }
  catch (err) { await dbg('signature_invalide', { msg: err.message }); return json({ error: 'Signature invalide: ' + err.message }, 400); }
  await dbg('event_recu', { type: event.type, id: event.id });

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const meta = session.metadata || {};
      const today = new Date().toISOString().slice(0, 10);
      await dbg('checkout_completed', { meta, session_id: session.id, customer: session.customer, payment_intent: session.payment_intent, subscription: session.subscription });

      if ((meta.type === 'setup_and_subscription' || meta.type === 'setup_then_trial') && meta.commercant_id) {
        const subscriptionIdFromSession = typeof session.subscription === 'string' ? session.subscription : (session.subscription && session.subscription.id);
        const { error: updErr } = await supabase.from('commercants').update({
          abonnement_actif: true, offre: meta.offre, abonnement_debut: today, abonnement_fin: null,
          stripe_setup_session_id: session.id, stripe_subscription_id: subscriptionIdFromSession || null,
        }).eq('id', meta.commercant_id);
        if (updErr) { await dbg('db_update_failed', { commercant_id: meta.commercant_id, error: updErr.message }); return json({ error: 'DB update failed: ' + updErr.message }, 500); }
        await dbg('boutique_activee', { commercant_id: meta.commercant_id, slug: meta.slug, tax_ids: (session.customer_details && session.customer_details.tax_ids) || [] });
        await enregistrerCodePromoPaye(meta);
      }

      if (meta.type === 'setup_then_trial' && meta.commercant_id) {
        try {
          const customerId = typeof session.customer === 'string' ? session.customer : (session.customer && session.customer.id);
          if (customerId) {
            let defaultPM = null;
            if (session.payment_intent) {
              try {
                const pi = typeof session.payment_intent === 'string' ? await stripe.paymentIntents.retrieve(session.payment_intent) : session.payment_intent;
                if (pi && pi.payment_method) {
                  defaultPM = typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method.id;
                  await stripe.paymentMethods.attach(defaultPM, { customer: customerId }).catch((e) => dbg('attach_pm_warn', { msg: e.message }));
                  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: defaultPM } }).catch((e) => dbg('set_default_pm_warn', { msg: e.message }));
                }
              } catch (e) { await dbg('pi_retrieve_warn', { msg: e.message }); }
            }
            const monthlyFee = parseInt(meta.monthly_fee || '0', 10);
            const trialDays = Math.min(Math.max(parseInt(meta.trial_days || '30', 10) || 30, 1), 730);
            const product = await stripe.products.create({ name: meta.monthly_name || 'Abonnement Marcheo', metadata: { commercant_id: meta.commercant_id, offre: meta.offre } });
            const price = await stripe.prices.create({ product: product.id, unit_amount: monthlyFee, currency: 'eur', recurring: { interval: 'month' } });
            const subOpts = { customer: customerId, items: [{ price: price.id }], trial_period_days: trialDays, metadata: { commercant_id: meta.commercant_id, offre: meta.offre, slug: meta.slug || '', type: 'subscription', referral_code: meta.referral_code || '', code_promo: meta.code_promo || '' } };
            if (defaultPM) subOpts.default_payment_method = defaultPM;
            const subscription = await stripe.subscriptions.create(subOpts);
            await supabase.from('commercants').update({ stripe_subscription_id: subscription.id }).eq('id', meta.commercant_id);
            await dbg('sub_creee', { sub_id: subscription.id, trial_end: subscription.trial_end, trial_days: trialDays });
          }
        } catch (e) { await dbg('sub_create_failed', { msg: e.message, type: e.type, code: e.code }); }
      }

      if (meta.referral_code && meta.commercant_id && meta.offre) {
        try { await traiterReferralPourCheckout(meta, session); }
        catch (e) { await dbg('referral_handler_error', { msg: e.message }); }
      }
      return json({ ok: true, activated: meta.slug || meta.commercant_id });
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const meta = sub.metadata || {};
      if (!meta.commercant_id) return json({ ok: true, ignored: 'Pas de commercant_id' });
      const today = new Date().toISOString().slice(0, 10);
      await supabase.from('commercants').update({ abonnement_actif: false, abonnement_fin: today }).eq('id', meta.commercant_id);
      const { data: cb } = await supabase.rpc('fn_clawback_payout', { p_commercant_id: meta.commercant_id, p_motif: 'subscription_deleted' });
      await dbg('sub_deleted', { commercant_id: meta.commercant_id, clawback_count: cb });
      return json({ ok: true, deactivated: meta.commercant_id, clawback: cb });
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object;
      const meta = charge.metadata || {};
      const customerId = typeof charge.customer === 'string' ? charge.customer : null;
      let commercantId = meta.commercant_id;
      if (!commercantId && customerId) {
        const { data: c } = await supabase.from('commercants').select('id').eq('stripe_customer_id', customerId).maybeSingle();
        if (c) commercantId = c.id;
      }
      if (commercantId) {
        const { data: cb } = await supabase.rpc('fn_clawback_payout', { p_commercant_id: commercantId, p_motif: 'charge_refunded' });
        await dbg('charge_refunded', { commercant_id: commercantId, clawback_count: cb, charge_id: charge.id });
      }
      return json({ ok: true, refunded: charge.id });
    }

    if (event.type === 'invoice.payment_failed') {
      const inv = event.data.object;
      await dbg('payment_failed', { customer: inv.customer, invoice: inv.id });
      return json({ ok: true, payment_failed: inv.id });
    }
    return json({ ok: true, ignored: event.type });
  } catch (e) { await dbg('uncaught_webhook', { msg: e && e.message, stack: e && e.stack }); return json({ error: 'Webhook crash: ' + (e && e.message ? e.message : 'unknown') }, 500); }
}
