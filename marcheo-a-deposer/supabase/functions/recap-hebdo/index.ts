// ============================================================
// Edge Function: recap-hebdo
// Récap hebdomadaire envoyé chaque lundi au commerçant.
// S'appuie sur la vue `v_recap_hebdo` (CA 7j + delta semaine
// précédente, commandes, nouveaux clients, avis, réservations,
// top 3 produits ; exclut déjà fixtures et démos ambassadeur).
//
// Actions (POST body { action }) :
//   - 'cron'  → envoie le récap à tous les commerçants éligibles
//      (recap_hebdo_actif = true + au moins une activité sur 7j).
//      C'est l'action déclenchée par le Schedule `0 6 * * 1`.
//   - 'preview' → { commercant_id } : renvoie le HTML sans envoyer
//      (pratique pour tester avant de scheduler).
//
// Variables d'env requises :
//   RESEND_API_KEY
//   RESEND_FROM         (optionnel, défaut: 'Marchéo <onboarding@resend.dev>')
//   SITE_URL            (optionnel, défaut: 'https://xn--marcho-fva.fr')
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const RESEND_FROM = Deno.env.get('RESEND_FROM') || 'Marchéo <onboarding@resend.dev>';
const SITE_URL = (Deno.env.get('SITE_URL') || 'https://xn--marcho-fva.fr').replace(/\/$/, '');

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
    if (action === 'preview') return await actionPreview(payload);
    return await actionCron(); // défaut = cron
  } catch (e) {
    console.error('[recap-hebdo]', e);
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});

// ── HELPERS ─────────────────────────────────────────────────

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

// CA stocké en euros (total_ttc) → on formate directement.
function fmtEuros(n: number) {
  return (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}

// Delta % entre semaine courante et précédente (badge couleur).
function deltaBadge(cur: number, prev: number) {
  cur = Number(cur) || 0; prev = Number(prev) || 0;
  if (prev === 0 && cur === 0) return '<span style="color:#7a8a82;">—</span>';
  if (prev === 0) return '<span style="color:#2f7d4f;font-weight:600;">nouveau</span>';
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return '<span style="color:#7a8a82;">=</span>';
  const up = pct > 0;
  const color = up ? '#2f7d4f' : '#b4452f';
  return `<span style="color:${color};font-weight:600;">${up ? '▲' : '▼'} ${Math.abs(pct)} %</span>`;
}

interface RecapRow {
  commercant_id: string;
  nom_boutique: string;
  email: string;
  slug: string;
  nb_commandes_7j: number;
  ca_7j: number;
  nb_commandes_7j_prec: number;
  ca_7j_prec: number;
  nouveaux_clients_7j: number;
  nouveaux_avis_7j: number;
  reservations_7j: number;
  top_produits_7j: Array<{ nom?: string; nom_produit?: string; qte?: number; quantite?: number }> | null;
}

function hasActivity(r: RecapRow) {
  return (r.nb_commandes_7j || 0) > 0
    || (Number(r.ca_7j) || 0) > 0
    || (r.nouveaux_clients_7j || 0) > 0
    || (r.nouveaux_avis_7j || 0) > 0
    || (r.reservations_7j || 0) > 0;
}

function buildRecapHtml(r: RecapRow) {
  const stat = (label: string, value: string, extra = '') => `
    <td style="padding:14px 10px;text-align:center;border:1px solid #EAE4D6;">
      <div style="font-size:24px;font-weight:700;color:#2A4535;">${value}</div>
      <div style="font-size:12px;color:#7a8a82;text-transform:uppercase;letter-spacing:0.4px;margin-top:2px;">${label}</div>
      ${extra ? `<div style="font-size:12px;margin-top:4px;">${extra}</div>` : ''}
    </td>`;

  const top = (r.top_produits_7j || []).slice(0, 3).map((p, i) => {
    const nom = p.nom || p.nom_produit || '—';
    const qte = p.qte ?? p.quantite ?? '';
    return `<tr><td style="padding:6px 0;color:#1f3028;">${['🥇', '🥈', '🥉'][i] || '•'} ${nom}</td>
            <td align="right" style="color:#7a8a82;">${qte ? qte + ' vendus' : ''}</td></tr>`;
  }).join('');

  const boutiqueUrl = `${SITE_URL}/${r.slug}`;
  const appUrl = `${SITE_URL}/app`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Votre récap de la semaine</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#FAF7F0;color:#1f3028;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F0;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.04);">
        <tr><td style="background:#2A4535;color:#fff;padding:24px 28px;">
          <div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:0.7;">${r.nom_boutique}</div>
          <div style="font-size:22px;font-weight:600;margin-top:4px;">📊 Votre semaine en bref</div>
        </td></tr>
        <tr><td style="padding:28px;line-height:1.6;font-size:15px;">
          <p style="margin:0 0 18px;">Voici le récap de vos 7 derniers jours sur Marchéo.</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:8px;">
            <tr>
              ${stat('Chiffre d\'affaires', fmtEuros(r.ca_7j), deltaBadge(r.ca_7j, r.ca_7j_prec))}
              ${stat('Commandes', String(r.nb_commandes_7j || 0), deltaBadge(r.nb_commandes_7j, r.nb_commandes_7j_prec))}
            </tr>
            <tr>
              ${stat('Nouveaux clients', String(r.nouveaux_clients_7j || 0))}
              ${stat('Nouveaux avis', String(r.nouveaux_avis_7j || 0))}
            </tr>
            ${(r.reservations_7j || 0) > 0 ? `<tr>${stat('Réservations', String(r.reservations_7j))}<td style="border:1px solid #EAE4D6;"></td></tr>` : ''}
          </table>

          ${top ? `
          <div style="margin-top:22px;">
            <div style="font-size:13px;color:#7a8a82;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Top produits de la semaine</div>
            <table width="100%" style="border-top:1px solid #EAE4D6;">${top}</table>
          </div>` : ''}

          <div style="text-align:center;margin-top:28px;">
            <a href="${appUrl}" style="background:#2A4535;color:#fff;padding:12px 26px;border-radius:50px;text-decoration:none;font-weight:600;display:inline-block;">Ouvrir mon tableau de bord</a>
          </div>
          <p style="color:#7a8a82;font-size:13px;text-align:center;margin-top:18px;">
            <a href="${boutiqueUrl}" style="color:#7a8a82;">Voir ma boutique</a>
          </p>
        </td></tr>
        <tr><td style="padding:18px 28px;background:#FAF7F0;color:#7a8a82;font-size:12px;text-align:center;">
          Récap hebdomadaire Marchéo · Vous pouvez le désactiver depuis vos réglages.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ── ACTION : preview (pas d'envoi) ──────────────────────────
async function actionPreview({ commercant_id }: { commercant_id?: string }) {
  if (!commercant_id) return json({ error: 'commercant_id requis' }, 400);
  const { data, error } = await supabase
    .from('v_recap_hebdo').select('*').eq('commercant_id', commercant_id).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ skipped: 'aucune ligne pour ce commerçant (inactif ou exclu)' });
  return new Response(buildRecapHtml(data as RecapRow), { headers: { ...cors, 'Content-Type': 'text/html' } });
}

// ── ACTION : cron lundi ─────────────────────────────────────
async function actionCron() {
  // 1. Récap de tous les commerçants visibles dans la vue.
  const { data: rows, error } = await supabase.from('v_recap_hebdo').select('*');
  if (error) throw new Error('v_recap_hebdo: ' + error.message);

  // 2. Commerçants ayant gardé le récap actif (défaut true).
  const { data: optIn } = await supabase
    .from('commercants').select('id').eq('recap_hebdo_actif', true);
  const actifs = new Set((optIn || []).map((c: { id: string }) => c.id));

  let sent = 0, skipped = 0;
  for (const r of (rows || []) as RecapRow[]) {
    if (!actifs.has(r.commercant_id)) { skipped++; continue; }   // récap désactivé
    if (!r.email) { skipped++; continue; }
    if (!hasActivity(r)) { skipped++; continue; }                // aucune activité → on n'envoie rien
    try {
      await sendMail(r.email, `📊 ${r.nom_boutique} — votre semaine sur Marchéo`, buildRecapHtml(r));
      sent++;
    } catch (e) {
      console.error('recap fail', r.commercant_id, (e as Error).message);
    }
  }
  return json({ sent_count: sent, skipped_count: skipped });
}
