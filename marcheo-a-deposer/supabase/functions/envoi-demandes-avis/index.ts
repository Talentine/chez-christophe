// ============================================================
// Edge Function: envoi-demandes-avis
// Envoie une demande d'avis au client après qu'une commande a
// été remise (commandes.remise_le IS NOT NULL — c'est le même
// critère que `eligible` dans la RPC get_commande_review).
//
// Lien envoyé : {SITE_URL}/avis/{review_token}  → page avis.html.
// Après envoi, on tamponne commandes.avis_demande_envoyee_at
// pour ne jamais renvoyer deux fois.
//
// ⚠️ review_token a été BACKFILLÉ sur toutes les commandes
// passées : sans garde-fou, le premier run enverrait un email à
// tout l'historique. On limite donc aux commandes remises dans
// les LOOKBACK_DAYS derniers jours (défaut 14).
//
// Actions (POST body { action }) :
//   - 'cron'  → traite les commandes éligibles (Schedule `0 9 * * *`)
//   - 'send'  → { commande_id } : (re)envoie pour une commande précise (test)
//
// Variables d'env requises :
//   RESEND_API_KEY
//   RESEND_FROM         (optionnel, défaut: 'Marchéo <onboarding@resend.dev>')
//   SITE_URL            (optionnel, défaut: 'https://xn--marcho-fva.fr')
//   AVIS_LOOKBACK_DAYS  (optionnel, défaut: 14)
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const RESEND_FROM = Deno.env.get('RESEND_FROM') || 'Marchéo <onboarding@resend.dev>';
const SITE_URL = (Deno.env.get('SITE_URL') || 'https://xn--marcho-fva.fr').replace(/\/$/, '');
const LOOKBACK_DAYS = Number(Deno.env.get('AVIS_LOOKBACK_DAYS') || '14');

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
    const { action, ...payload } = await req.json().catch(() => ({ action: 'cron' }));
    if (action === 'send') return await actionSend(payload);
    return await actionCron();
  } catch (e) {
    console.error('[envoi-demandes-avis]', e);
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});

// ── HELPERS ─────────────────────────────────────────────────

const SELECT = '*, clients(prenom, email), commercants(nom_boutique, slug)';

async function sendMail(to: string, subject: string, html: string) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error('Resend error: ' + (data.message || JSON.stringify(data)));
  return data;
}

interface Cmd {
  id: string;
  numero: string;
  review_token: string | null;
  remise_le: string | null;
  avis_demande_envoyee_at: string | null;
  clients?: { prenom?: string; email?: string } | null;
  commercants?: { nom_boutique?: string; slug?: string } | null;
}

function buildAvisHtml(c: Cmd) {
  const boutique = c.commercants?.nom_boutique || 'votre commerçant';
  const lien = `${SITE_URL}/avis/${c.review_token}`;
  const etoiles = `<div style="font-size:30px;letter-spacing:6px;margin:6px 0 18px;">⭐️⭐️⭐️⭐️⭐️</div>`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Votre avis compte</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#FAF7F0;color:#1f3028;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F0;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.04);">
        <tr><td style="background:#2A4535;color:#fff;padding:24px 28px;">
          <div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:0.7;">${boutique}</div>
          <div style="font-size:22px;font-weight:600;margin-top:4px;">Comment s'est passée votre commande ?</div>
        </td></tr>
        <tr><td style="padding:28px;line-height:1.6;font-size:15px;text-align:center;">
          <p style="margin:0 0 6px;">Bonjour ${c.clients?.prenom || ''},</p>
          <p style="margin:0 0 4px;">Merci d'avoir commandé chez <b>${boutique}</b> !</p>
          <p style="margin:0;color:#7a8a82;">Votre retour aide les autres clients et encourage l'artisan.</p>
          ${etoiles}
          <a href="${lien}" style="background:#B8832A;color:#fff;padding:14px 30px;border-radius:50px;text-decoration:none;font-weight:600;display:inline-block;">Laisser un avis</a>
          <p style="color:#7a8a82;font-size:12px;margin-top:22px;">Cela prend moins d'une minute. Merci 🙏</p>
        </td></tr>
        <tr><td style="padding:18px 28px;background:#FAF7F0;color:#7a8a82;font-size:12px;text-align:center;">
          Email envoyé par Marchéo · click & collect artisan
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendForCommande(c: Cmd) {
  const email = c.clients?.email;
  if (!email) return { skipped: 'no email' };
  if (!c.review_token) return { skipped: 'no token' };
  const boutique = c.commercants?.nom_boutique || 'Marchéo';
  await sendMail(email, `Votre avis sur la commande ${c.numero} — ${boutique}`, buildAvisHtml(c));
  await supabase.from('commandes')
    .update({ avis_demande_envoyee_at: new Date().toISOString() })
    .eq('id', c.id);
  return { sent: true };
}

// ── ACTION : send (test ciblé) ──────────────────────────────
async function actionSend({ commande_id }: { commande_id?: string }) {
  if (!commande_id) return json({ error: 'commande_id requis' }, 400);
  const { data, error } = await supabase.from('commandes').select(SELECT).eq('id', commande_id).single();
  if (error) return json({ error: error.message }, 404);
  return json(await sendForCommande(data as Cmd));
}

// ── ACTION : cron quotidien ─────────────────────────────────
async function actionCron() {
  const depuis = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString();
  const { data: rows, error } = await supabase
    .from('commandes')
    .select(SELECT)
    .not('remise_le', 'is', null)            // commande remise (= eligible)
    .gte('remise_le', depuis)                // garde-fou anti-backfill
    .is('avis_demande_envoyee_at', null)     // pas déjà sollicité
    .not('review_token', 'is', null);
  if (error) throw new Error('commandes: ' + error.message);

  let sent = 0, skipped = 0;
  for (const c of (rows || []) as Cmd[]) {
    try {
      const res = await sendForCommande(c);
      if ((res as { sent?: boolean }).sent) sent++; else skipped++;
    } catch (e) {
      console.error('avis fail', c.id, (e as Error).message);
    }
  }
  return json({ sent_count: sent, skipped_count: skipped, lookback_days: LOOKBACK_DAYS });
}
