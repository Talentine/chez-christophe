// ============================================================
// Edge Function: expedition
// Option « Expédition France » : paiement en ligne de la commande,
// étiquette Chronopost / Chronofresh, suivi du colis, remboursement.
//
// Actions (POST body { action, ... }) :
//   Côté client (panier) — ouvertes, comme stripe-empreinte create/finalize :
//   - 'payer'       → crée le PaymentIntent du total de la commande
//                     body: { commande_id }            return: { client_secret }
//   - 'finaliser'   → vérifie le paiement, publie la commande, envoie l'e-mail
//                     body: { commande_id }            return: { ok, statut }
//
//   Côté commerçant — JWT du gérant de la boutique (ou admin) obligatoire :
//   - 'demander-activation' → prévient Marchéo   body: { commercant_id }
//   - 'tester-compte'  → vérifie les identifiants Chronopost et liste les
//                        services du contrat     body: { commercant_id }
//   - 'etiquette'      → crée l'étiquette        body: { commande_id, poids_kg?, dlc? }
//   - 'etiquette-pdf'  → renvoie le PDF          body: { commande_id }
//   - 'annuler-etiquette' → annule l'étiquette   body: { commande_id }
//   - 'expedier'       → colis remis au transporteur : ajuste le paiement au
//                        poids réel, clôt la commande, e-mail de suivi
//                        body: { commande_id, suivi?, transporteur? }
//   - 'suivi'          → rafraîchit le suivi     body: { commande_id }
//   - 'rembourser'     → annule + rembourse      body: { commande_id }
//
//   - 'cron-suivi'     → suivi de tous les colis en cours (pg_cron)
//
// Variables d'environnement :
//   STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   RESEND_API_KEY, RESEND_FROM, REPLY_TO_EMAIL, SITE_URL   (comme send-email)
//   EXPEDITION_FRAIS_BANCAIRES  (optionnel, défaut "1.5,25")
//       Frais bancaires Stripe refacturés au commerçant, au coût : pourcentage
//       puis part fixe en centimes. "0,0" = Marchéo les prend à sa charge.
//   EXPEDITION_ALERTE_EMAIL     (optionnel) destinataire des demandes d'activation
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.0.0?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { annulerEtiquette, creerEtiquette, produitsDuContrat, suivreColis, COMPTE_TEST, lienSuivi } from './chronopost.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const RESEND_FROM = Deno.env.get('RESEND_FROM') || 'Marchéo <onboarding@resend.dev>';
const REPLY_TO = Deno.env.get('REPLY_TO_EMAIL') || 'marcheo.contact@gmail.com';
const ALERTE_EMAIL = Deno.env.get('EXPEDITION_ALERTE_EMAIL') || REPLY_TO;
const SITE_URL = (Deno.env.get('SITE_URL') || 'https://xn--marcho-fva.fr').replace(/\/$/, '');

const [FRAIS_PCT, FRAIS_FIXE_CENTS] = (() => {
  const brut = (Deno.env.get('EXPEDITION_FRAIS_BANCAIRES') || '1.5,25').split(',');
  const pct = Number(brut[0]);
  const fixe = Number(brut[1]);
  return [isFinite(pct) && pct >= 0 ? pct : 1.5, isFinite(fixe) && fixe >= 0 ? fixe : 25];
})();

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Erreur « métier » : message destiné à l'utilisateur, renvoyé tel quel.
class Refus extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const ACTIONS_GERANT = new Set([
  'demander-activation', 'tester-compte', 'etiquette', 'etiquette-pdf',
  'annuler-etiquette', 'expedier', 'suivi', 'rembourser',
]);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { action, ...payload } = await req.json();

    if (ACTIONS_GERANT.has(action)) {
      const user = await getAuthUser(req);
      if (!user) throw new Refus('Authentification requise', 401);
      let commercantId = payload.commercant_id as string | undefined;
      if (payload.commande_id) {
        const { data: cmd } = await supabase.from('commandes')
          .select('commercant_id').eq('id', payload.commande_id).maybeSingle();
        if (!cmd) throw new Refus('Commande introuvable', 404);
        commercantId = cmd.commercant_id;
      }
      if (!commercantId || !(await estGerant(user.id, commercantId))) throw new Refus('Accès refusé', 403);
      payload.commercant_id = commercantId;
    }

    if (action === 'payer')               return json(await actionPayer(payload));
    if (action === 'finaliser')           return json(await actionFinaliser(payload));
    if (action === 'demander-activation') return json(await actionDemanderActivation(payload));
    if (action === 'tester-compte')       return json(await actionTesterCompte(payload));
    if (action === 'etiquette')           return json(await actionEtiquette(payload));
    if (action === 'etiquette-pdf')       return json(await actionEtiquettePdf(payload));
    if (action === 'annuler-etiquette')   return json(await actionAnnulerEtiquette(payload));
    if (action === 'expedier')            return json(await actionExpedier(payload));
    if (action === 'suivi')               return json(await actionSuivi(payload));
    if (action === 'rembourser')          return json(await actionRembourser(payload));
    if (action === 'cron-suivi')          return json(await actionCronSuivi());

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    if (e instanceof Refus) return json({ error: e.message, code: e.code }, e.status);
    console.error('[expedition]', e);
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});

// ── AUTH ────────────────────────────────────────────────────
async function getAuthUser(req: Request) {
  const h = req.headers.get('Authorization') || '';
  const jwt = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!jwt) return null;
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data?.user) return null;
  return data.user;
}

async function estGerant(userId: string, commercantId: string): Promise<boolean> {
  const { data: owner } = await supabase.from('commercants')
    .select('id').eq('id', commercantId).eq('auth_user_id', userId).maybeSingle();
  if (owner) return true;
  const { data: roles } = await supabase.from('roles_utilisateurs')
    .select('role, commercant_id').eq('user_id', userId);
  return (roles || []).some((r: any) =>
    r.role === 'admin' || (r.role === 'commercant' && r.commercant_id === commercantId));
}

// ── HELPERS ─────────────────────────────────────────────────
const COLS_COMMANDE = '*, clients(prenom, nom, email, telephone), ' +
  'commercants(id, nom_boutique, slug, email, telephone, adresse, code_postal, ville, abonnement_actif, ' +
  'stripe_connect_id, stripe_connect_actif, stripe_connect_charges_enabled), ' +
  'commande_lignes(nom_produit, quantite, unite, total_ligne)';

async function chargerCommande(id: string): Promise<any> {
  if (!id) throw new Refus('commande_id manquant');
  const { data, error } = await supabase.from('commandes').select(COLS_COMMANDE).eq('id', id).maybeSingle();
  if (error || !data) throw new Refus('Commande introuvable', 404);
  if (data.type !== 'expedition') throw new Refus('Cette commande n\'est pas une expédition');
  return data;
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (ch) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[ch]);

const euros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',') + ' €';

function dateLongue(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('fr-FR',
    { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

function lendemain(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, 12)).toISOString().slice(0, 10);
}

// Date du jour à Paris (AAAA-MM-JJ)
function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

async function envoyerMail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY || !to) return;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html, reply_to: REPLY_TO }),
  });
  if (!r.ok) console.error('[expedition] mail', r.status, await r.text());
}

function gabarit(titre: string, corps: string, boutique: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(titre)}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#FAF7F0;color:#1f3028;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F0;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.04);">
        <tr><td style="background:#2A4535;color:#fff;padding:24px 28px;">
          <div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:0.7;">${esc(boutique)}</div>
          <div style="font-size:22px;font-weight:600;margin-top:4px;">${esc(titre)}</div>
        </td></tr>
        <tr><td style="padding:28px;line-height:1.6;font-size:15px;">${corps}</td></tr>
        <tr><td style="padding:18px 28px;background:#FAF7F0;color:#7a8a82;font-size:12px;text-align:center;">
          Email envoyé par Marchéo pour le compte de ${esc(boutique)}<br>
          Une question ? <a href="mailto:${esc(REPLY_TO)}" style="color:#2A4535;">${esc(REPLY_TO)}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function blocAdresse(c: any): string {
  const d = c.expedition_destinataire || {};
  return `<div style="background:#FAF7F0;border-radius:10px;padding:14px 16px;margin:16px 0;">
    <div style="font-size:12px;color:#7a8a82;text-transform:uppercase;letter-spacing:0.5px;">Adresse de livraison</div>
    <div style="margin-top:4px;"><b>${esc(d.nom)}</b><br>${esc(d.adresse)}${d.complement ? '<br>' + esc(d.complement) : ''}<br>${esc(d.code_postal)} ${esc(d.ville)}</div>
  </div>`;
}

function tableauLignes(c: any, totalCents: number): string {
  const lignes = (c.commande_lignes || []).map((l: any) =>
    `<tr><td style="padding:6px 0;">${esc(l.nom_produit)} · ${esc(l.quantite)} ${esc(l.unite)}</td><td align="right">${euros(Math.round((l.total_ligne || 0) * 100))}</td></tr>`).join('');
  const frais = Math.round((c.frais_livraison || 0) * 100);
  return `<table width="100%" style="border-top:1px solid #EAE4D6;border-bottom:1px solid #EAE4D6;margin:14px 0;">
    ${lignes}
    <tr><td style="padding:6px 0;">📦 Expédition</td><td align="right">${frais > 0 ? euros(frais) : 'Offerte'}</td></tr>
    <tr><td style="padding:10px 0;font-weight:600;">Total</td><td align="right" style="font-weight:600;">${euros(totalCents)}</td></tr>
  </table>`;
}

// ── PAYER ───────────────────────────────────────────────────
// Le montant vient de la commande (recalculée par checkout_create_order),
// jamais du navigateur.
async function actionPayer({ commande_id }: any) {
  const c = await chargerCommande(commande_id);
  if (c.statut !== 'paiement_pending' || c.paiement_status !== 'pending') {
    throw new Refus('Cette commande n\'attend pas de paiement', 409);
  }
  const shop = c.commercants || {};
  if (shop.abonnement_actif !== true) throw new Refus('Boutique de démonstration : aucun paiement', 409);
  if (!shop.stripe_connect_id || !shop.stripe_connect_actif || !shop.stripe_connect_charges_enabled) {
    throw new Refus('Le paiement en ligne n\'est pas activé pour cette boutique', 409);
  }

  const montant = Math.round(Number(c.total_ttc || 0) * 100);
  if (montant < 50) throw new Refus('Montant trop faible');

  // Reprise : le client a rechargé la page pendant le paiement
  if (c.stripe_payment_intent_id) {
    const existant = await stripe.paymentIntents.retrieve(c.stripe_payment_intent_id);
    if (existant.amount === montant && ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(existant.status)) {
      return { client_secret: existant.client_secret, montant_cents: montant };
    }
    if (existant.status === 'succeeded') return { deja_paye: true, montant_cents: montant };
  }

  const email = c.clients?.email || undefined;
  const nom = [c.clients?.prenom, c.clients?.nom].filter(Boolean).join(' ') || undefined;
  let customerId: string | undefined;
  if (email) {
    const trouves = await stripe.customers.list({ email, limit: 1 });
    customerId = (trouves.data[0] ?? await stripe.customers.create({ email, name: nom })).id;
  }

  // Fonds versés au commerçant. Les frais bancaires Stripe, facturés à la
  // plateforme sur ce type de paiement, lui sont refacturés au coût : ce
  // n'est pas une commission.
  const fraisBancaires = Math.min(montant - 1, Math.round(montant * FRAIS_PCT / 100) + FRAIS_FIXE_CENTS);
  const intent = await stripe.paymentIntents.create({
    amount: montant,
    currency: 'eur',
    customer: customerId,
    receipt_email: email,
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    on_behalf_of: shop.stripe_connect_id,
    transfer_data: { destination: shop.stripe_connect_id },
    ...(fraisBancaires > 0 ? { application_fee_amount: fraisBancaires } : {}),
    metadata: { commande_id: String(commande_id), numero: String(c.numero || ''), type: 'expedition' },
    description: `Commande ${c.numero} — ${shop.nom_boutique || ''} (expédition)`,
  });

  await supabase.from('commandes').update({
    stripe_payment_intent_id: intent.id,
    stripe_customer_id: customerId || null,
    paiement_montant_cents: montant,
  }).eq('id', commande_id);

  return { client_secret: intent.client_secret, montant_cents: montant };
}

// ── FINALISER ───────────────────────────────────────────────
// Appelée par le panier après la confirmation de la carte. Lit le VRAI statut
// du paiement chez Stripe, puis rend la commande visible au commerçant.
async function actionFinaliser({ commande_id }: any) {
  const c = await chargerCommande(commande_id);

  // Boutique de démonstration : commande de test, sans paiement
  if (c.paiement_status === 'none') {
    if (c.statut !== 'annulee') await confirmerAuClient(c);
    return { ok: c.statut !== 'annulee', statut: c.statut, test: true };
  }

  if (c.paiement_status === 'paid') {
    return { ok: true, statut: c.statut, deja: true };
  }

  if (!c.stripe_payment_intent_id) {
    if (c.statut === 'paiement_pending') {
      await supabase.from('commandes').update({
        statut: 'annulee', annulee_le: new Date().toISOString(), paiement_status: 'failed',
      }).eq('id', commande_id);
    }
    return { ok: false, statut: 'annulee', raison: 'paiement jamais créé' };
  }

  const pi = await stripe.paymentIntents.retrieve(c.stripe_payment_intent_id);

  if (pi.status === 'succeeded') {
    // Payé alors que la commande a été annulée entre-temps (paiement très
    // tardif) : on rembourse plutôt que de ressusciter une commande dont le
    // stock a déjà été rendu.
    if (c.statut !== 'paiement_pending') {
      await stripe.refunds.create({ payment_intent: pi.id, reverse_transfer: true, refund_application_fee: true });
      await supabase.from('commandes').update({
        paiement_status: 'refunded', paiement_montant_cents: pi.amount, paiement_rembourse_cents: pi.amount,
      }).eq('id', commande_id);
      return { ok: false, statut: c.statut, rembourse: true };
    }
    await supabase.from('commandes').update({
      statut: 'nouvelle', paiement_status: 'paid', paiement_montant_cents: pi.amount,
    }).eq('id', commande_id);
    c.statut = 'nouvelle';
    c.paiement_status = 'paid';
    c.paiement_montant_cents = pi.amount;
    await confirmerAuClient(c);
    return { ok: true, statut: 'nouvelle' };
  }

  // Paiement encore en cours de validation (3-D Secure…) : on ne touche à rien
  if (pi.status === 'processing' || pi.status === 'requires_action') {
    return { ok: false, statut: c.statut, en_cours: true, pi_status: pi.status };
  }

  // Refusé : la commande reste en attente, le client peut retenter avec une
  // autre carte. Sans nouvel essai, le ménage horaire l'annule au bout de 2 h.
  return { ok: false, statut: c.statut, pi_status: pi.status };
}

async function confirmerAuClient(c: any) {
  if (c.expedition_confirmation_le) return;
  // Verrou : un seul e-mail même si « finaliser » est appelée deux fois
  const { data: pris } = await supabase.from('commandes')
    .update({ expedition_confirmation_le: new Date().toISOString() })
    .eq('id', c.id).is('expedition_confirmation_le', null).select('id');
  if (!pris || pris.length === 0) return;

  const boutique = c.commercants?.nom_boutique || 'Boutique';
  const email = c.clients?.email;
  if (!email) return;
  const total = Math.round(Number(c.total_ttc || 0) * 100);
  const test = c.paiement_status === 'none';
  const corps = `
    <p>Bonjour ${esc(c.clients?.prenom || '')},</p>
    <p>Votre commande <b>${esc(c.numero)}</b> chez <b>${esc(boutique)}</b> est bien enregistrée${test ? '' : ' et payée'}. 🎉</p>
    ${test ? `<p style="background:#FFF8E7;border:1px solid #F0D690;border-radius:10px;padding:12px 14px;font-size:13px;">Boutique en démonstration : ceci est une commande de test, aucun paiement n'a été effectué et aucun colis ne sera envoyé.</p>` : ''}
    <div style="background:#FAF7F0;border-radius:10px;padding:14px 16px;margin:16px 0;">
      <div style="font-size:12px;color:#7a8a82;text-transform:uppercase;letter-spacing:0.5px;">Expédition prévue</div>
      <div style="font-size:16px;font-weight:600;margin-top:2px;text-transform:capitalize;">${esc(dateLongue(c.expedition_date))}</div>
      <div style="font-size:13px;color:#5a6a62;margin-top:4px;">Livraison le lendemain, <span style="text-transform:none;">${esc(dateLongue(lendemain(c.expedition_date)))}</span>, par Chronopost.</div>
    </div>
    ${blocAdresse(c)}
    ${tableauLignes(c, total)}
    <p style="font-size:14px;">Vous recevrez un e-mail avec le <b>numéro de suivi</b> dès que votre colis sera remis au transporteur. Pensez à être présent le jour de la livraison : les produits frais ne peuvent pas attendre.</p>
    <p style="color:#7a8a82;font-size:13px;">Merci pour votre commande !</p>`;
  await envoyerMail(email, `Commande ${c.numero} confirmée — ${boutique}`, gabarit('Commande confirmée', corps, boutique));
}

// ── DEMANDE D'ACTIVATION ────────────────────────────────────
async function actionDemanderActivation({ commercant_id }: any) {
  const { data: shop } = await supabase.from('commercants')
    .select('nom_boutique, slug, email, ville').eq('id', commercant_id).maybeSingle();
  if (!shop) throw new Refus('Boutique introuvable', 404);

  const { data: reg } = await supabase.from('expedition_reglages')
    .select('active, demandee_le').eq('commercant_id', commercant_id).maybeSingle();
  if (reg?.active) return { ok: true, deja_active: true };

  const maintenant = new Date().toISOString();
  await supabase.from('expedition_reglages')
    .upsert({ commercant_id, demandee_le: maintenant }, { onConflict: 'commercant_id' });

  // Un seul e-mail par jour et par boutique
  const recent = reg?.demandee_le && (Date.now() - new Date(reg.demandee_le).getTime()) < 24 * 3600_000;
  if (!recent) {
    await envoyerMail(ALERTE_EMAIL, `📦 Demande d'activation Expédition France — ${shop.nom_boutique}`,
      gabarit('Demande d\'activation', `
        <p><b>${esc(shop.nom_boutique)}</b>${shop.ville ? ' (' + esc(shop.ville) + ')' : ''} demande l'activation de l'option <b>Expédition France</b>.</p>
        <p>Contact : ${esc(shop.email || '—')}<br>Boutique : <a href="${SITE_URL}/${esc(shop.slug)}">${SITE_URL}/${esc(shop.slug)}</a></p>
        <p>Pour l'activer : Admin → menu ⋯ de la boutique → « Expédition France ».</p>`, 'Marchéo'));
  }
  return { ok: true, demandee_le: maintenant };
}

// ── COMPTE CHRONOPOST ───────────────────────────────────────
async function chargerCompte(commercantId: string): Promise<any> {
  const { data } = await supabase.from('expedition_comptes').select('*').eq('commercant_id', commercantId).maybeSingle();
  return data || null;
}

async function actionTesterCompte({ commercant_id }: any) {
  const compte = await chargerCompte(commercant_id);
  if (!compte?.chrono_compte || !compte?.chrono_mot_de_passe) {
    throw new Refus('Renseignez d\'abord votre numéro de compte et votre mot de passe Chronopost', 400, 'COMPTE_MANQUANT');
  }
  if (!compte.exp_code_postal) throw new Refus('Renseignez d\'abord le code postal d\'enlèvement', 400, 'ADRESSE_MANQUANTE');

  const res = await produitsDuContrat({
    compte: compte.chrono_compte, motDePasse: compte.chrono_mot_de_passe,
  }, compte.exp_code_postal);

  if (!res.ok) {
    await supabase.from('expedition_comptes').update({ verifie_le: null, produits_contrat: null }).eq('commercant_id', commercant_id);
    return { ok: false, message: res.message || 'Chronopost a refusé ces identifiants' };
  }
  await supabase.from('expedition_comptes').update({
    verifie_le: new Date().toISOString(), produits_contrat: res.codes,
  }).eq('commercant_id', commercant_id);
  // La liste renvoyée par Chronopost ne mentionne pas Chronofresh, même quand
  // il est ouvert (constaté sur le compte de test) : on valide ici les
  // identifiants, pas le service. Chronofresh se vérifie à la 1re étiquette.
  return { ok: true, codes: res.codes };
}

// ── ÉTIQUETTE ───────────────────────────────────────────────
async function actionEtiquette({ commande_id, poids_kg, dlc }: any) {
  const c = await chargerCommande(commande_id);
  if (c.statut === 'annulee') throw new Refus('Cette commande est annulée');
  if (c.statut === 'paiement_pending') throw new Refus('Cette commande n\'est pas encore payée');
  if (c.paiement_status !== 'paid' && !c.expedition_test) throw new Refus('Cette commande n\'est pas payée');
  if (c.expedition_suivi) throw new Refus('Une étiquette existe déjà pour cette commande', 409, 'DEJA');

  const shop = c.commercants || {};
  const { data: reg } = await supabase.from('expedition_reglages').select('*').eq('commercant_id', shop.id).maybeSingle();
  if (!reg?.active) throw new Refus('L\'option Expédition France n\'est pas activée pour cette boutique', 403);

  const compte = await chargerCompte(shop.id);
  // Commande de test (boutique en démonstration) : étiquette spécimen émise
  // sur le compte de test public de Chronopost — jamais sur un vrai contrat.
  const test = !!c.expedition_test;
  if (!test && (!compte?.chrono_compte || !compte?.chrono_mot_de_passe)) {
    throw new Refus('Renseignez votre compte Chronopost dans Réglages → Expédition France', 400, 'COMPTE_MANQUANT');
  }
  const expediteur = {
    nom: compte?.exp_nom || shop.nom_boutique || 'Boutique',
    contact: compte?.exp_contact || shop.nom_boutique || '',
    adresse: compte?.exp_adresse || shop.adresse || '',
    adresse2: compte?.exp_adresse2 || '',
    codePostal: compte?.exp_code_postal || shop.code_postal || '',
    ville: compte?.exp_ville || shop.ville || '',
    telephone: compte?.exp_telephone || shop.telephone || '',
    email: compte?.exp_email || shop.email || '',
  };
  if (!expediteur.adresse || !expediteur.codePostal || !expediteur.ville) {
    throw new Refus('Renseignez l\'adresse d\'enlèvement des colis dans Réglages → Expédition France', 400, 'ADRESSE_MANQUANTE');
  }

  const poids = Number(poids_kg) > 0 ? Number(poids_kg) : Math.max(0.1, Number(c.expedition_poids_g || 1000) / 1000);
  if (poids > 30) throw new Refus('Un colis Chronopost ne peut pas dépasser 30 kg');

  const auj = aujourdhuiParis();
  const dateEnvoi = c.expedition_date && c.expedition_date > auj ? c.expedition_date : auj;
  const froid = reg.mode_froid !== false;
  let dateDlc: string | null = null;
  if (froid) {
    dateDlc = /^\d{4}-\d{2}-\d{2}$/.test(String(dlc || '')) ? String(dlc) : null;
    if (!dateDlc) {
      const [y, m, d] = dateEnvoi.split('-').map(Number);
      dateDlc = new Date(Date.UTC(y, m - 1, d + Number(reg.dlc_jours || 7), 12)).toISOString().slice(0, 10);
    }
    if (dateDlc <= dateEnvoi) throw new Refus('La date limite de consommation doit être postérieure à la date d\'expédition');
  }

  const dest = c.expedition_destinataire || {};
  const res = await creerEtiquette({
    identifiants: test ? COMPTE_TEST : {
      compte: compte.chrono_compte, motDePasse: compte.chrono_mot_de_passe, sousCompte: compte.chrono_sous_compte || '',
    },
    produit: froid ? '2R' : '01',
    expediteur,
    destinataire: {
      nom: dest.nom || [c.clients?.prenom, c.clients?.nom].filter(Boolean).join(' '),
      adresse: dest.adresse || '',
      adresse2: dest.complement || '',
      codePostal: dest.code_postal || '',
      ville: dest.ville || '',
      telephone: dest.telephone || c.clients?.telephone || '',
      email: c.clients?.email || '',
    },
    reference: String(c.numero || ''),
    contenu: 'Produits alimentaires',
    poidsKg: poids,
    dateEnvoi,
    dlc: dateDlc,
  });

  if (!res.ok) {
    throw new Refus('Chronopost a refusé la création de l\'étiquette : ' + (res.message || 'erreur ' + res.code), 502, 'CHRONOPOST');
  }

  const maintenant = new Date().toISOString();
  await supabase.from('expedition_etiquettes').upsert({
    commande_id, commercant_id: shop.id, pdf_base64: res.pdfBase64, created_at: maintenant,
  }, { onConflict: 'commande_id' });
  await supabase.from('commandes').update({
    expedition_suivi: res.numero,
    expedition_transporteur: 'chronopost',
    expedition_produit: froid ? 'Chronofresh' : 'Chrono 13',
    expedition_etiquette_le: maintenant,
    expedition_poids_g: Math.round(poids * 1000),
    expedition_suivi_etat: null,
    statut: c.statut === 'nouvelle' || c.statut === 'en_preparation' ? 'prete' : c.statut,
    prete_le: c.prete_le || maintenant,
  }).eq('id', commande_id);

  return { ok: true, suivi: res.numero, produit: froid ? 'Chronofresh' : 'Chrono 13', pdf_base64: res.pdfBase64, test, service: res.service };
}

async function actionEtiquettePdf({ commande_id }: any) {
  const { data } = await supabase.from('expedition_etiquettes').select('pdf_base64').eq('commande_id', commande_id).maybeSingle();
  if (!data) throw new Refus('Aucune étiquette enregistrée pour cette commande', 404);
  return { ok: true, pdf_base64: data.pdf_base64 };
}

async function actionAnnulerEtiquette({ commande_id }: any) {
  const c = await chargerCommande(commande_id);
  if (!c.expedition_suivi) throw new Refus('Aucune étiquette à annuler');
  if (c.expedition_expediee_le) throw new Refus('Ce colis est déjà marqué comme expédié');

  let annuleeChezChronopost = false;
  if (c.expedition_transporteur === 'chronopost') {
    const compte = await chargerCompte(c.commercant_id);
    const ids = c.expedition_test ? COMPTE_TEST : (compte?.chrono_compte ? {
      compte: compte.chrono_compte, motDePasse: compte.chrono_mot_de_passe,
    } : null);
    if (ids) {
      const res = await annulerEtiquette(ids, c.expedition_suivi);
      annuleeChezChronopost = res.ok;
    }
  }
  await supabase.from('expedition_etiquettes').delete().eq('commande_id', commande_id);
  await supabase.from('commandes').update({
    expedition_suivi: null, expedition_transporteur: null, expedition_produit: null,
    expedition_etiquette_le: null, expedition_suivi_etat: null,
    statut: c.statut === 'prete' ? 'nouvelle' : c.statut,
  }).eq('id', commande_id);
  return { ok: true, annulee_chez_chronopost: annuleeChezChronopost };
}

// ── EXPÉDIER ────────────────────────────────────────────────
async function actionExpedier({ commande_id, suivi, transporteur }: any) {
  const c = await chargerCommande(commande_id);
  if (c.statut === 'annulee') throw new Refus('Cette commande est annulée');
  if (c.expedition_expediee_le) return { ok: true, deja: true };
  if (c.paiement_status !== 'paid' && !c.expedition_test) throw new Refus('Cette commande n\'est pas payée');

  // Numéro de suivi saisi à la main (étiquette faite sur le site du transporteur)
  const numero = String(c.expedition_suivi || suivi || '').trim().toUpperCase().replace(/\s/g, '');
  if (!numero) throw new Refus('Indiquez le numéro de suivi du colis', 400, 'SUIVI_MANQUANT');
  if (!/^[A-Z0-9]{8,30}$/.test(numero)) throw new Refus('Numéro de suivi invalide');

  // Ajustement du paiement : si le total final (après pesée des produits au
  // poids, ou récompense fidélité) est inférieur à ce qui a été payé, la
  // différence est remboursée. L'inverse n'est jamais débité.
  let rembourse = 0;
  const totalReel = Math.max(0, Math.round(Number(c.total_ttc || 0) * 100) - Number(c.remise_fidelite_cents || 0));
  const paye = Number(c.paiement_montant_cents || 0) - Number(c.paiement_rembourse_cents || 0);
  if (c.paiement_status === 'paid' && c.stripe_payment_intent_id && totalReel > 0 && paye - totalReel >= 1) {
    rembourse = paye - totalReel;
    await stripe.refunds.create({
      payment_intent: c.stripe_payment_intent_id, amount: rembourse, reverse_transfer: true,
      metadata: { commande_id: String(commande_id), motif: 'ajustement au poids réel' },
    });
  }

  const maintenant = new Date().toISOString();
  await supabase.from('commandes').update({
    statut: 'terminee',
    remise_le: c.remise_le || maintenant,
    prete_le: c.prete_le || maintenant,
    expedition_expediee_le: maintenant,
    expedition_suivi: numero,
    expedition_transporteur: c.expedition_transporteur || String(transporteur || 'chronopost').toLowerCase().slice(0, 30),
    paiement_rembourse_cents: Number(c.paiement_rembourse_cents || 0) + rembourse,
  }).eq('id', commande_id);

  const boutique = c.commercants?.nom_boutique || 'Boutique';
  const email = c.clients?.email;
  if (email && !c.expedition_test) {
    const lien = lienSuivi(numero);
    const corps = `
      <p>Bonjour ${esc(c.clients?.prenom || '')},</p>
      <p>Bonne nouvelle : votre commande <b>${esc(c.numero)}</b> chez <b>${esc(boutique)}</b> vient d'être remise à Chronopost. 📦</p>
      <div style="background:#FAF7F0;border-radius:10px;padding:14px 16px;margin:16px 0;text-align:center;">
        <div style="font-size:12px;color:#7a8a82;text-transform:uppercase;letter-spacing:0.5px;">Numéro de suivi</div>
        <div style="font-size:20px;font-weight:700;letter-spacing:1px;font-family:monospace;margin:4px 0 12px;">${esc(numero)}</div>
        <a href="${lien}" style="background:#2A4535;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;display:inline-block;">Suivre mon colis</a>
      </div>
      ${blocAdresse(c)}
      <p style="font-size:14px;"><b>Livraison prévue le lendemain de l'expédition.</b> Chronopost vous prévient par e-mail ou SMS du créneau de passage. Soyez présent : à réception, placez les produits au réfrigérateur sans attendre.</p>
      ${rembourse > 0 ? `<p style="font-size:14px;">Le montant final de votre commande est de <b>${euros(totalReel)}</b> : nous vous remboursons la différence de <b>${euros(rembourse)}</b> sur votre carte.</p>` : ''}
      <p style="color:#7a8a82;font-size:13px;">Un souci à la réception ? Répondez à cet e-mail dans les 24 heures avec une photo du colis et des produits.</p>`;
    await envoyerMail(email, `Votre colis est parti — commande ${c.numero}`, gabarit('Votre colis est parti', corps, boutique));
  }
  return { ok: true, suivi: numero, rembourse_cents: rembourse };
}

// ── SUIVI ───────────────────────────────────────────────────
async function rafraichirSuivi(c: any) {
  if (!c.expedition_suivi || (c.expedition_transporteur && c.expedition_transporteur !== 'chronopost')) {
    return { ok: false, message: 'Suivi automatique indisponible pour ce transporteur' };
  }
  const res = await suivreColis(c.expedition_suivi);
  if (!res.ok) return { ok: false, message: res.message || 'Suivi indisponible' };
  const patch: any = { expedition_suivi_maj: new Date().toISOString() };
  if (res.dernier) patch.expedition_suivi_etat = res.dernier.libelle.slice(0, 200);
  if (res.livre && !c.expedition_livree_le) patch.expedition_livree_le = res.dernier?.date || new Date().toISOString();
  await supabase.from('commandes').update(patch).eq('id', c.id);
  return { ok: true, etat: patch.expedition_suivi_etat || c.expedition_suivi_etat || null, livre: res.livre, evenements: res.evenements };
}

async function actionSuivi({ commande_id }: any) {
  const c = await chargerCommande(commande_id);
  return await rafraichirSuivi(c);
}

async function actionCronSuivi() {
  const depuis = new Date(Date.now() - 12 * 86400_000).toISOString();
  const { data: rows } = await supabase.from('commandes')
    .select('id, expedition_suivi, expedition_transporteur, expedition_livree_le, expedition_suivi_etat')
    .eq('type', 'expedition').not('expedition_suivi', 'is', null)
    .not('expedition_expediee_le', 'is', null).is('expedition_livree_le', null)
    .eq('expedition_test', false)
    .gte('expedition_expediee_le', depuis).limit(60);
  let maj = 0;
  for (const c of rows || []) {
    try { if ((await rafraichirSuivi(c)).ok) maj++; } catch (e) { console.error('suivi', c.id, (e as Error).message); }
  }
  return { suivis: (rows || []).length, mis_a_jour: maj };
}

// ── ANNULER + REMBOURSER ────────────────────────────────────
async function actionRembourser({ commande_id }: any) {
  const c = await chargerCommande(commande_id);
  if (c.statut === 'annulee') return { ok: true, deja: true };
  if (c.expedition_expediee_le) {
    throw new Refus('Ce colis est déjà parti : contactez le client pour convenir d\'un remboursement', 409);
  }

  let rembourse = 0;
  if (c.paiement_status === 'paid' && c.stripe_payment_intent_id) {
    const reste = Number(c.paiement_montant_cents || 0) - Number(c.paiement_rembourse_cents || 0);
    if (reste > 0) {
      await stripe.refunds.create({
        payment_intent: c.stripe_payment_intent_id, amount: reste,
        reverse_transfer: true, refund_application_fee: true,
        metadata: { commande_id: String(commande_id), motif: 'commande annulée' },
      });
      rembourse = reste;
    }
  }

  // Étiquette déjà émise : on l'annule chez Chronopost (sans bloquer si ça échoue)
  if (c.expedition_suivi && c.expedition_transporteur === 'chronopost') {
    try {
      const compte = await chargerCompte(c.commercant_id);
      const ids = c.expedition_test ? COMPTE_TEST : (compte?.chrono_compte ? {
        compte: compte.chrono_compte, motDePasse: compte.chrono_mot_de_passe,
      } : null);
      if (ids) await annulerEtiquette(ids, c.expedition_suivi);
    } catch (e) { console.error('annulation étiquette', (e as Error).message); }
  }

  await supabase.from('commandes').update({
    statut: 'annulee', annulee_le: new Date().toISOString(),
    paiement_status: rembourse > 0 ? 'refunded' : c.paiement_status,
    paiement_rembourse_cents: Number(c.paiement_rembourse_cents || 0) + rembourse,
  }).eq('id', commande_id);

  const boutique = c.commercants?.nom_boutique || 'Boutique';
  if (c.clients?.email && !c.expedition_test) {
    await envoyerMail(c.clients.email, `Commande ${c.numero} annulée — ${boutique}`, gabarit('Commande annulée', `
      <p>Bonjour ${esc(c.clients?.prenom || '')},</p>
      <p>Votre commande <b>${esc(c.numero)}</b> chez <b>${esc(boutique)}</b> a été annulée par la boutique.</p>
      ${rembourse > 0 ? `<p>Vous êtes remboursé de <b>${euros(rembourse)}</b> sur la carte utilisée lors du paiement. Le remboursement apparaît sous 5 à 10 jours selon votre banque.</p>` : ''}
      <p style="color:#7a8a82;font-size:13px;">Une question ? Répondez simplement à cet e-mail.</p>`, boutique));
  }
  return { ok: true, rembourse_cents: rembourse };
}
