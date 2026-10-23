// ============================================================
// Edge Function: relances-demo
// Suit les commerçants qui ont créé une démo gratuite sans encore mettre leur boutique en ligne.
//
//   J0 (≈ 15 min après la création)  → e-mail « Votre boutique est prête »
//   J1                               → e-mail « Ajoutez vos produits phares »
//   J1 → J2, à 8 h                   → récapitulatif « À appeler aujourd'hui » envoyé à l'équipe Marchéo
//   J3                               → e-mail « Une question ? On vous rappelle »
//   J7                               → e-mail « Mettez votre boutique en ligne »
//
// Appelée chaque heure par pg_cron : POST { "action": "cron" }.
// Lien de désinscription : GET ?stop=<commercant_id>&k=<signature>.
// Chaque étape est notée dans commercants.relances_demo : rien n'est envoyé deux fois, et tout s'arrête
// dès que la boutique a un abonnement actif. Ne concerne que les démos créées à partir du DEBUT_SUIVI.
//
// Variables d'env : RESEND_API_KEY, RESEND_FROM, REPLY_TO_EMAIL (opt.), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const RESEND_FROM = Deno.env.get('RESEND_FROM') || 'Marchéo <onboarding@resend.dev>';
const REPLY_TO = Deno.env.get('REPLY_TO_EMAIL') || 'marcheo.contact@gmail.com';
const EQUIPE = Deno.env.get('RELANCES_EQUIPE_EMAIL') || REPLY_TO;
const SECRET = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const HOST = 'https://www.xn--marcho-fva.fr';
const FN_URL = (Deno.env.get('SUPABASE_URL') || '') + '/functions/v1/relances-demo';
const DEBUT_SUIVI = '2026-10-23T00:00:00Z';
const H = 3600_000;

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, SECRET);

const METIERS: Record<string, string> = {
  primeur: 'primeur', boucherie: 'boucherie', boulangerie: 'boulangerie', poissonnerie: 'poissonnerie',
  fromagerie: 'fromagerie', traiteur: 'traiteur', fleuriste: 'fleuriste', pizzeria: 'pizzeria',
  restaurant: 'restaurant', fastfood: 'fast-food',
};
const OFFRES: Record<string, { installation: string; mensuel: string; moisOffert: boolean }> = {
  vitrine: { installation: '249 €', mensuel: '19 €/mois', moisOffert: false },
  clickcollect: { installation: '399 €', mensuel: '39 €/mois', moisOffert: true },
  livraison: { installation: '549 €', mensuel: '59 €/mois', moisOffert: true },
};

serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === 'GET' && url.searchParams.get('stop')) return await desinscrire(url.searchParams.get('stop')!, url.searchParams.get('k') || '');
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const { action } = await req.json().catch(() => ({}));
    if (action === 'cron') return json(await cron());
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('[relances-demo]', e);
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function signature(id: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('relances:' + id));
  return Array.from(new Uint8Array(sig)).slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function heureParis(d = new Date()) {
  return Number(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }).format(d));
}

async function envoyer(to: string, subject: string, html: string) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html, reply_to: REPLY_TO }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error('Resend: ' + (data.message || JSON.stringify(data)));
}

function gabarit(contenu: string, stopUrl: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F7F2E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#0F2C52;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F2E8;padding:28px 14px;"><tr><td align="center">
<table width="100%" style="max-width:560px;background:#fff;border-radius:18px;overflow:hidden;">
<tr><td style="padding:22px 28px 0;font-size:20px;font-weight:800;color:#5BBE3A;">Marchéo</td></tr>
<tr><td style="padding:14px 28px 26px;font-size:17px;line-height:1.6;">${contenu}</td></tr>
<tr><td style="padding:16px 28px;background:#F7F2E8;color:#5A6478;font-size:12.5px;line-height:1.5;text-align:center;">
Une question ? Répondez simplement à cet e-mail.<br>
<a href="${stopUrl}" style="color:#5A6478;">Ne plus recevoir ces conseils</a></td></tr>
</table></td></tr></table></body></html>`;
}

const bouton = (href: string, texte: string) =>
  `<p style="margin:24px 0;"><a href="${href}" style="display:inline-block;background:#5BBE3A;color:#fff;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:50px;font-size:17px;">${texte}</a></p>`;

function messages(c: any) {
  const nom = c.nom_boutique || 'votre boutique';
  const metier = METIERS[c.business_type] || 'commerce';
  const boutique = `${HOST}/${c.slug || ''}`;
  const espace = `${HOST}/app-commercant.html`;
  const o = OFFRES[c.offre] || OFFRES.clickcollect;
  const prix = o.moisOffert
    ? `<b>${o.installation}</b> d'installation, une seule fois, puis <b>le 1er mois offert</b> et ${o.mensuel}. Sans engagement, 0 % de commission.`
    : `<b>${o.installation}</b> d'installation, une seule fois, puis ${o.mensuel}. Sans engagement, 0 % de commission.`;
  return {
    j0: {
      sujet: `${nom} : votre boutique en ligne est prête`,
      html: `<p>Bonjour,</p><p>Votre boutique <b>${nom}</b> est créée. Le catalogue ${metier} est déjà rempli : il ne reste qu'à ajuster vos produits et vos prix.</p>
${bouton(boutique, 'Voir ma boutique')}
<p>Pour la modifier, ouvrez votre espace commerçant depuis votre téléphone : <a href="${espace}" style="color:#46A02A;">${espace.replace('https://', '')}</a></p>
<p>Pour l'instant, c'est une démo gratuite : rien n'est payé et rien n'est visible par vos clients tant que vous ne l'avez pas mise en ligne.</p>`,
    },
    j1: {
      sujet: `${nom} : ajoutez vos 3 produits phares`,
      html: `<p>Bonjour,</p><p>Le plus simple pour démarrer : mettez en avant <b>les 3 produits que vos clients vous demandent le plus</b>, avec votre prix du jour.</p>
<p>Dans votre espace commerçant, touchez un produit, changez le prix, ajoutez une photo prise avec votre téléphone. Une minute par produit.</p>
${bouton(espace, 'Ouvrir mon espace')}
<p>Vos clients pourront ensuite commander à l'avance et passer chercher leur commande à l'heure choisie.</p>`,
    },
    j3: {
      sujet: `${nom} : une question ? On vous rappelle`,
      html: `<p>Bonjour,</p><p>Vous avez créé la boutique <b>${nom}</b> il y a quelques jours. Si quelque chose n'est pas clair, ou si vous préférez qu'on la prépare avec vous, <b>répondez à cet e-mail avec le meilleur moment pour vous appeler</b>.</p>
<p>Un quart d'heure au téléphone suffit en général pour mettre vos produits, vos horaires et vos créneaux de retrait.</p>
${bouton(boutique, 'Revoir ma boutique')}`,
    },
    j7: {
      sujet: `${nom} : mettez votre boutique en ligne`,
      html: `<p>Bonjour,</p><p>Votre boutique <b>${nom}</b> est prête depuis une semaine. Pour qu'elle soit visible par vos clients et qu'ils puissent commander :</p>
<p style="background:#F7F2E8;border-radius:12px;padding:14px 16px;">${prix}</p>
${bouton(boutique, 'Mettre ma boutique en ligne')}
<p>Ensuite : un QR code à poser sur le comptoir, un lien pour Facebook et Instagram, et vos clients commandent depuis leur téléphone.</p>`,
    },
  };
}

async function cron() {
  const { data: demos, error } = await supabase
    .from('commercants')
    .select('id, nom_boutique, slug, email, telephone, ville, business_type, offre, abonnement_actif, is_fixture, created_at, relances_demo')
    .gte('created_at', DEBUT_SUIVI)
    .not('email', 'is', null);
  if (error) throw new Error(error.message);

  const maintenant = Date.now();
  const heure = heureParis();
  const journee = heure >= 8 && heure < 20;
  const envoyes: string[] = [];
  const aAppeler: any[] = [];

  for (const c of demos || []) {
    if (c.is_fixture === true || c.abonnement_actif === true) continue;
    const r = c.relances_demo || {};
    if (r.stop) continue;
    const age = maintenant - new Date(c.created_at).getTime();
    const msg = messages(c);
    const etape =
      !r.j0 && age >= 0.25 * H && age < 24 * H ? 'j0' :
      !r.j1 && journee && age >= 24 * H && age < 72 * H ? 'j1' :
      !r.j3 && journee && age >= 72 * H && age < 168 * H ? 'j3' :
      !r.j7 && journee && age >= 168 * H && age < 240 * H ? 'j7' : null;
    const maj: Record<string, string> = {};
    if (etape) {
      const stopUrl = `${FN_URL}?stop=${c.id}&k=${await signature(c.id)}`;
      try {
        const m = (msg as any)[etape];
        await envoyer(c.email, m.sujet, gabarit(m.html, stopUrl));
        maj[etape] = new Date().toISOString();
        envoyes.push(`${etape}:${c.slug}`);
      } catch (e) {
        console.error('relance', etape, c.id, (e as Error).message);
      }
    }
    if (heure === 8 && !r.appel && age >= 24 * H && age < 168 * H) aAppeler.push({ ...c, relances_demo: { ...r, ...maj } });
    if (Object.keys(maj).length) await supabase.from('commercants').update({ relances_demo: { ...r, ...maj } }).eq('id', c.id);
  }

  // Récapitulatif « à appeler » : une fois par jour, à 8 h (heure de Paris)
  let recap = 0;
  if (heure === 8 && aAppeler.length) {
    const lignes = aAppeler.map((c) => `<tr><td style="padding:8px 6px;border-bottom:1px solid #EEE;"><b>${c.nom_boutique || c.slug}</b><br>
<span style="color:#5A6478;font-size:13px;">${METIERS[c.business_type] || c.business_type || ''} · ${c.ville || ''}</span></td>
<td style="padding:8px 6px;border-bottom:1px solid #EEE;">${c.telephone ? `<a href="tel:${c.telephone}">${c.telephone}</a>` : '—'}<br>
<a href="mailto:${c.email}" style="font-size:13px;">${c.email}</a></td>
<td style="padding:8px 6px;border-bottom:1px solid #EEE;"><a href="${HOST}/${c.slug}">voir</a></td></tr>`).join('');
    await envoyer(EQUIPE, `À appeler aujourd'hui : ${aAppeler.length} démo${aAppeler.length > 1 ? 's' : ''} Marchéo`,
      `<div style="font-family:Arial,sans-serif;color:#0F2C52;"><p>Démos créées depuis plus d'un jour, pas encore en ligne :</p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">${lignes}</table>
<p style="color:#5A6478;font-size:13px;">Chaque commerçant n'apparaît qu'une fois dans ce récapitulatif.</p></div>`);
    recap = aAppeler.length;
    const t = new Date().toISOString();
    for (const c of aAppeler) await supabase.from('commercants').update({ relances_demo: { ...c.relances_demo, appel: t } }).eq('id', c.id);
  }
  return { envoyes, recap };
}

async function desinscrire(id: string, k: string) {
  const page = (t: string) => new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;background:#F7F2E8;color:#0F2C52;display:flex;align-items:center;justify-content:center;min-height:90vh;margin:0;padding:20px;">
<div style="background:#fff;border-radius:16px;padding:28px;max-width:420px;text-align:center;font-size:17px;">${t}</div></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  if (!/^[0-9a-f-]{36}$/.test(id) || k !== (await signature(id))) return page('Lien invalide.');
  const { data: c } = await supabase.from('commercants').select('relances_demo').eq('id', id).single();
  await supabase.from('commercants').update({ relances_demo: { ...(c?.relances_demo || {}), stop: new Date().toISOString() } }).eq('id', id);
  return page('C\'est noté : vous ne recevrez plus ces conseils.<br><br>Votre boutique reste disponible.');
}
