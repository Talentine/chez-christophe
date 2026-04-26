// ============================================================
// Edge Function: send-email
// Envoie un email transactionnel via Resend.
//
// Actions (POST body { action, ... }) :
//   - 'commande-confirmee' → email après commande validée
//      body: { commande_id }
//   - 'rappel-j-1' → email J-1 avant retrait
//      body: { commande_id }
//   - 'empreinte-capturee' → email transparence si litige déclenché
//      body: { commande_id }
//   - 'cron-rappels' → cron : envoie les rappels J-1 du jour suivant
//      (pas de body requis)
//
// Variables d'env requises :
//   RESEND_API_KEY
//   RESEND_FROM         (optionnel, défaut: 'onboarding@resend.dev')
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const RESEND_FROM = Deno.env.get('RESEND_FROM') || 'Marchéo <onboarding@resend.dev>';

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
    if (action === 'commande-confirmee')  return await actionConfirmee(payload);
    if (action === 'rappel-j-1')          return await actionRappelJ1(payload);
    if (action === 'empreinte-capturee')  return await actionEmpreinteCapturee(payload);
    if (action === 'cron-rappels')        return await actionCronRappels();
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('[send-email]', e);
    return json({ error: e.message || String(e) }, 500);
  }
});

// ── HELPERS ─────────────────────────────────────────────────

async function loadCommande(id: string) {
  const { data, error } = await supabase
    .from('commandes')
    .select('*, clients(prenom, nom, email), commercants(nom_boutique, slug), commande_lignes(nom_produit, quantite, unite, total_ligne)')
    .eq('id', id)
    .single();
  if (error) throw new Error('Commande introuvable: ' + error.message);
  return data;
}

async function sendMail(to: string, subject: string, html: string) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error('Resend error: ' + (data.message || JSON.stringify(data)));
  return data;
}

function fmtMontant(cents: number) {
  return (cents / 100).toFixed(2).replace('.', ',') + ' €';
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

function buildLayout(title: string, body: string, boutique: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#FAF7F0;color:#1f3028;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F0;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.04);">
        <tr><td style="background:#2A4535;color:#fff;padding:24px 28px;">
          <div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:0.7;">${boutique}</div>
          <div style="font-size:22px;font-weight:600;margin-top:4px;">${title}</div>
        </td></tr>
        <tr><td style="padding:28px;line-height:1.6;font-size:15px;">${body}</td></tr>
        <tr><td style="padding:18px 28px;background:#FAF7F0;color:#7a8a82;font-size:12px;text-align:center;">
          Email envoyé par Marchéo · click & collect artisan
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ── ACTION : commande confirmée ─────────────────────────────
async function actionConfirmee({ commande_id }: any) {
  const c = await loadCommande(commande_id);
  const email = c.clients?.email;
  if (!email) return json({ skipped: 'no email' });

  const boutique = c.commercants?.nom_boutique || 'Boutique';
  const lignes = (c.commande_lignes || [])
    .map((l: any) => `<tr><td style="padding:6px 0;">${l.nom_produit} · ${l.quantite} ${l.unite}</td><td align="right">${fmtMontant((l.total_ligne || 0) * 100)}</td></tr>`)
    .join('');

  const empreinteBlock = c.empreinte_status === 'pending'
    ? `<div style="background:#FFF8E7;border:1px solid #F0D690;border-radius:10px;padding:14px;margin:18px 0;font-size:13px;">
         🔒 <b>Empreinte bancaire :</b> ${fmtMontant(c.empreinte_montant_cents || 0)} bloqués sur votre carte.<br>
         Aucun débit. Libérée automatiquement 24h après votre retrait.
       </div>` : '';

  const body = `
    <p>Bonjour ${c.clients?.prenom || ''},</p>
    <p>Votre commande <b>${c.numero}</b> est bien enregistrée chez <b>${boutique}</b>. 🎉</p>
    <div style="background:#FAF7F0;border-radius:10px;padding:14px 16px;margin:16px 0;">
      <div style="font-size:12px;color:#7a8a82;text-transform:uppercase;letter-spacing:0.5px;">Retrait</div>
      <div style="font-size:16px;font-weight:600;margin-top:2px;text-transform:capitalize;">${fmtDate(c.date_retrait)}</div>
    </div>
    <table width="100%" style="border-top:1px solid #EAE4D6;border-bottom:1px solid #EAE4D6;margin:14px 0;">
      ${lignes}
      <tr><td style="padding:10px 0 0;font-weight:600;">Total</td><td align="right" style="font-weight:600;">${fmtMontant((c.total_ttc || 0) * 100)}</td></tr>
    </table>
    ${empreinteBlock}
    <p style="color:#7a8a82;font-size:13px;">À très vite chez ${boutique} !</p>
  `;

  await sendMail(email, `Commande ${c.numero} confirmée — ${boutique}`, buildLayout('Commande confirmée', body, boutique));
  return json({ ok: true });
}

// ── ACTION : rappel J-1 ─────────────────────────────────────
async function actionRappelJ1({ commande_id }: any) {
  const c = await loadCommande(commande_id);
  const email = c.clients?.email;
  if (!email) return json({ skipped: 'no email' });

  const boutique = c.commercants?.nom_boutique || 'Boutique';
  const body = `
    <p>Bonjour ${c.clients?.prenom || ''},</p>
    <p>Petit rappel : votre commande <b>${c.numero}</b> est à retirer demain chez <b>${boutique}</b>.</p>
    <div style="background:#FAF7F0;border-radius:10px;padding:14px 16px;margin:16px 0;">
      <div style="font-size:12px;color:#7a8a82;text-transform:uppercase;letter-spacing:0.5px;">Retrait</div>
      <div style="font-size:16px;font-weight:600;margin-top:2px;text-transform:capitalize;">${fmtDate(c.date_retrait)}</div>
    </div>
    <p style="color:#7a8a82;font-size:13px;">À demain !</p>
  `;
  await sendMail(email, `Rappel : retrait demain — ${boutique}`, buildLayout('Rappel retrait', body, boutique));

  // Marque la commande comme "rappel envoyé" pour ne pas envoyer 2x
  await supabase.from('commandes').update({ rappel_j1_envoye_at: new Date().toISOString() }).eq('id', commande_id);
  return json({ ok: true });
}

// ── ACTION : empreinte capturée (litige) ────────────────────
async function actionEmpreinteCapturee({ commande_id }: any) {
  const c = await loadCommande(commande_id);
  const email = c.clients?.email;
  if (!email) return json({ skipped: 'no email' });

  const boutique = c.commercants?.nom_boutique || 'Boutique';
  const body = `
    <p>Bonjour ${c.clients?.prenom || ''},</p>
    <p>Votre commande <b>${c.numero}</b> chez <b>${boutique}</b> n'a pas été retirée. Conformément à nos conditions, nous avons procédé au prélèvement de l'empreinte bancaire :</p>
    <div style="background:#FDF0EF;border:1px solid #F3C8C4;border-radius:10px;padding:14px 16px;margin:16px 0;">
      <div style="font-size:12px;color:#9a2d24;text-transform:uppercase;letter-spacing:0.5px;">Montant débité</div>
      <div style="font-size:20px;font-weight:600;margin-top:2px;color:#9a2d24;">${fmtMontant(c.empreinte_montant_cents || 0)}</div>
    </div>
    <p style="color:#7a8a82;font-size:13px;">Pour toute réclamation, contactez directement <b>${boutique}</b>.</p>
  `;
  await sendMail(email, `Empreinte débitée — commande ${c.numero}`, buildLayout('Empreinte débitée', body, boutique));
  return json({ ok: true });
}

// ── ACTION : cron rappels J-1 ───────────────────────────────
// Envoie un email à toutes les commandes dont la date de retrait est entre dans
// 20h et 28h (fenêtre 24h ± 4h pour gérer le cron horaire), pas encore rappelées.
async function actionCronRappels() {
  const now = new Date();
  const debut = new Date(now.getTime() + 20 * 3600_000).toISOString();
  const fin   = new Date(now.getTime() + 28 * 3600_000).toISOString();

  const { data: rows } = await supabase
    .from('commandes')
    .select('id')
    .gte('date_retrait', debut)
    .lt('date_retrait', fin)
    .is('rappel_j1_envoye_at', null)
    .neq('statut', 'annulee');

  let sent = 0;
  for (const r of rows || []) {
    try {
      await actionRappelJ1({ commande_id: r.id });
      sent++;
    } catch (e) {
      console.error('rappel-j1 fail', r.id, e.message);
    }
  }
  return json({ sent_count: sent });
}
