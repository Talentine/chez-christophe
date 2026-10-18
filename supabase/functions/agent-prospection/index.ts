// ============================================================
// Edge Function: agent-prospection
// Agent de prospection Marchéo : trouve les associations de
// commerçants de chaque département + les propriétaires de
// plusieurs boutiques alimentaires, trouve leurs coordonnées
// publiques, envoie les mails (initial + 2 relances), répond
// aux réponses, publie sur LinkedIn et envoie chaque matin la
// liste des invitations LinkedIn à faire.
//
// Actions (POST body { action, ... }, header x-agent-secret) :
//   - 'sourcer'       → ajoute les prospects du département suivant
//                       (API publique recherche-entreprises.api.gouv.fr)
//   - 'enrichir'      → site, email pro public, contact, LinkedIn (Claude + recherche web)
//   - 'envoyer'       → mails initiaux et relances (jours ouvrés 9h-18h, quota/jour)
//   - 'reponse'       → webhook des mails entrants : classe, répond, désinscrit
//                       body { from, subject, text } ou événement Resend 'email.received'
//   - 'linkedin-post' → publie le post du jour sur le profil LinkedIn
//   - 'digest'        → mail du matin : stats + invitations LinkedIn à faire
//   - 'apercu'        → { n } : génère les mails des n prochains prospects sans rien envoyer
//   - 'apercu-post'   → génère un post LinkedIn sans le publier
// GET ?action=desinscription&t=<token> → page de désinscription (lien des mails)
//
// Variables d'env :
//   ANTHROPIC_API_KEY, RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   AGENT_SECRET          secret partagé avec pg_cron et le webhook entrant
//   AGENT_MODE            'live' pour envoyer/publier ; tout autre valeur = pause
//   PROSPECTION_FROM      ex. 'Paul Merieult — Marchéo <paul@xn--marcho-fva.fr>'
//   PROSPECTION_REPLY_TO  boîte qui reçoit les réponses (inbound)
//   OWNER_EMAIL           reçoit le digest et les alertes « prospect intéressé »
//   SIGNATURE_NOM, SIGNATURE_ROLE, SIGNATURE_TEL
//   BOOKING_URL           (optionnel) lien de prise de rendez-vous
//   QUOTA_JOUR            (optionnel, défaut 40) mails initiaux par jour
//   LINKEDIN_ACCESS_TOKEN, LINKEDIN_PERSON_URN ('urn:li:person:xxxx')
//   LINKEDIN_POSTS_PAR_JOUR (optionnel, défaut 1, max 2)
//   CLAUDE_MODEL          (optionnel, défaut 'claude-opus-5-5')
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

const env = (k: string, d = '') => Deno.env.get(k) ?? d;

const LIVE = env('AGENT_MODE') === 'live';
const AGENT_SECRET = env('AGENT_SECRET');
const RESEND_API_KEY = env('RESEND_API_KEY');
const FROM = env('PROSPECTION_FROM', 'Marchéo <onboarding@resend.dev>');
const REPLY_TO = env('PROSPECTION_REPLY_TO');
const OWNER_EMAIL = env('OWNER_EMAIL');
const SIGNATURE_NOM = env('SIGNATURE_NOM', 'Paul Merieult');
const SIGNATURE_ROLE = env('SIGNATURE_ROLE', 'Fondateur');
const SIGNATURE_TEL = env('SIGNATURE_TEL');
const BOOKING_URL = env('BOOKING_URL');
const QUOTA_JOUR = Number(env('QUOTA_JOUR', '40'));
const MODEL = env('CLAUDE_MODEL', 'claude-opus-5-5');
const LINKEDIN_TOKEN = env('LINKEDIN_ACCESS_TOKEN');
const LINKEDIN_URN = env('LINKEDIN_PERSON_URN');
const POSTS_PAR_JOUR = Math.min(2, Number(env('LINKEDIN_POSTS_PAR_JOUR', '1')));
const SITE = 'https://marchéo.fr';
const FUNCTION_URL = env('SUPABASE_URL') + '/functions/v1/agent-prospection';

const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const anthropic = new Anthropic();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

serve(async (req) => {
  const url = new URL(req.url);
  try {
    if (req.method === 'GET' && url.searchParams.get('action') === 'desinscription') {
      return await pageDesinscription(url.searchParams.get('t') || '', url.searchParams.get('ok') === '1');
    }
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const secret = req.headers.get('x-agent-secret') || url.searchParams.get('k');
    if (!AGENT_SECRET || secret !== AGENT_SECRET) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const action = body.action || url.searchParams.get('action') || (body.type === 'email.received' ? 'reponse' : '');
    if (action === 'sourcer')       return json(await actionSourcer());
    if (action === 'enrichir')      return json(await actionEnrichir(body.limite ?? 2));
    if (action === 'envoyer')       return json(await actionEnvoyer());
    if (action === 'reponse')       return json(await actionReponse(body));
    if (action === 'linkedin-post') return json(await actionLinkedinPost(!!body.forcer));
    if (action === 'digest')        return json(await actionDigest(!!body.forcer));
    if (action === 'apercu')        return json(await actionApercu(body.n ?? 3));
    if (action === 'apercu-post')   return json({ post: await genererPost() });
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('[agent-prospection]', e);
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});

// ── OFFRE ────────────────────────────────────────────────────
// Seule source des prix et conditions : Claude n'invente jamais un chiffre,
// il ne peut citer que ce qui est ici.

const FAITS_MARCHEO = `
Marchéo (marchéo.fr) : boutique en ligne au nom du commerçant pour les commerces de bouche et artisans indépendants
(boulangeries-pâtisseries, boucheries-charcuteries, primeurs, poissonneries, traiteurs, fromageries, épiceries, fleuristes,
pizzerias, restaurants). Click & collect, livraison locale organisée par le commerçant (Marchéo ne livre pas, pas de coursiers),
réservation de table. Les clients commandent en 30 secondes sans créer de compte.
0 % de commission sur les ventes. Le fichier client appartient au commerçant. Données hébergées en Europe, paiements Stripe.
Empreinte bancaire anti no-show optionnelle : jusqu'à 75 % du panier, libérée 24 h après le retrait.
Formules (sans engagement) :
- Vitrine : 19 €/mois, installation 249 €
- Click & Collect + Réservation : 39 €/mois, installation 399 €
- Tout-en-un + Livraison : 59 €/mois, installation 549 €
Tarif partenaire pour les adhérents d'une association / union de commerçants (code adhérent, aucune convention lourde) :
- Vitrine : installation 149 € au lieu de 249 €
- Click & Collect : installation 199 € au lieu de 399 €
- Tout-en-un : installation 299 € au lieu de 549 €
- audit digital offert à chaque commerce signé, point d'étape trimestriel avec l'association
Tarif plusieurs boutiques (même propriétaire) : ${OFFRE_MULTI_TEXTE()}
Exemple de boutique en ligne : ${SITE}/chez-christophe
Démo gratuite en 30 secondes : ${SITE}/inscription
Fondateur : Paul Merieult.`.trim();

// À ajuster si besoin : condition commerciale proposée aux propriétaires de plusieurs boutiques.
function OFFRE_MULTI_TEXTE() {
  return "à partir de la 2e boutique, frais d'installation au tarif partenaire (149 / 199 / 299 €) et une seule interface pour gérer toutes les boutiques";
}

// ── SOURCING (registre public des entreprises) ───────────────

const DEPARTEMENTS = [
  ...Array.from({ length: 95 }, (_, i) => String(i + 1).padStart(2, '0')).filter((d) => d !== '20'),
  '2A', '2B', '971', '972', '973', '974', '976',
];

// Codes NAF des commerces de bouche ciblés.
const NAF_BOUCHE = [
  '10.71C', // boulangerie-pâtisserie
  '10.71D', // pâtisserie
  '10.13B', // charcuterie
  '47.22Z', // boucherie
  '47.21Z', // fruits et légumes
  '47.23Z', // poissonnerie
  '47.24Z', // pain, pâtisserie, confiserie
  '47.29Z', // autres commerces alimentaires (fromagerie, épicerie fine)
  '47.11B', // commerce d'alimentation générale
  '47.11C', // supérettes
  '56.21Z', // traiteur
];

const RE_ASSO = /commer[cç]ant|commerce|artisan|vitrine|boutique|union commerciale|march[ée]s?\b|centre[- ]ville|c[oœ]ur de ville/i;

async function rechercheEntreprises(params: Record<string, string>) {
  const qs = new URLSearchParams({ per_page: '25', etat_administratif: 'A', ...params });
  const r = await fetch(`https://recherche-entreprises.api.gouv.fr/search?${qs}`);
  if (r.status === 429) { await sleep(2000); return rechercheEntreprises(params); }
  if (!r.ok) throw new Error(`recherche-entreprises ${r.status}`);
  await sleep(200); // limite de 7 requêtes/s
  return await r.json() as { results: any[]; total_pages: number };
}

function dirigeantPrincipal(e: any) {
  const d = (e.dirigeants || []).find((x: any) => x.type_dirigeant === 'personne physique');
  if (!d) return null;
  return [d.prenoms?.split(' ')[0], d.nom].filter(Boolean).join(' ') + (d.qualite ? ` (${d.qualite})` : '');
}

async function actionSourcer() {
  // Assez de stock à enrichir : on ne source pas plus.
  const { count } = await supabase.from('prospects').select('id', { count: 'exact', head: true }).eq('statut', 'a_enrichir');
  if ((count ?? 0) >= 60) return { skip: 'stock suffisant', a_enrichir: count };

  const { data: etat } = await supabase.from('prospection_etat').select('valeur').eq('cle', 'sourcing').maybeSingle();
  const index = (etat?.valeur?.index ?? 0) % DEPARTEMENTS.length;
  const dep = DEPARTEMENTS[index];
  const lignes: any[] = [];

  // 1. Associations / unions de commerçants du département
  for (const q of ['association commercants', 'union commerciale', 'commercants artisans', 'vitrines']) {
    for (let page = 1; page <= 3; page++) {
      const r = await rechercheEntreprises({ q, departement: dep, activite_principale: '94.99Z', page: String(page) });
      for (const e of r.results) {
        if (!RE_ASSO.test(e.nom_complet || '')) continue;
        lignes.push(ligneProspect(e, 'association', dep));
      }
      if (page >= r.total_pages) break;
    }
  }

  // 2. Propriétaires de plusieurs boutiques alimentaires
  for (let page = 1; page <= 8; page++) {
    const r = await rechercheEntreprises({ activite_principale: NAF_BOUCHE.join(','), departement: dep, page: String(page) });
    for (const e of r.results) {
      const n = e.nombre_etablissements_ouverts ?? 0;
      if (n < 2) continue;
      lignes.push(ligneProspect(e, n >= 5 ? 'groupe' : 'multi_boutiques', dep));
    }
    if (page >= r.total_pages) break;
  }

  const uniques = [...new Map(lignes.map((l) => [l.siren, l])).values()];
  if (uniques.length) {
    const { error } = await supabase.from('prospects').upsert(uniques, { onConflict: 'siren', ignoreDuplicates: true });
    if (error) throw error;
  }
  await supabase.from('prospection_etat').upsert({ cle: 'sourcing', valeur: { index: index + 1, dernier: dep }, maj_at: new Date().toISOString() });
  return { departement: dep, trouves: uniques.length };
}

function ligneProspect(e: any, type: string, dep: string) {
  return {
    type,
    siren: e.siren,
    nom: e.nom_complet,
    naf: e.activite_principale,
    nb_etablissements: e.nombre_etablissements_ouverts ?? null,
    ville: e.siege?.libelle_commune ?? null,
    code_postal: e.siege?.code_postal ?? null,
    departement: dep,
    dirigeant: dirigeantPrincipal(e),
  };
}

// ── ENRICHISSEMENT (Claude + recherche web) ──────────────────

const OUTIL_RESULTAT = {
  name: 'enregistrer_resultat',
  description: 'Enregistre les coordonnées trouvées pour ce prospect. Appeler une seule fois, à la fin des recherches.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      trouve: { type: 'boolean', description: "false si l'organisation est introuvable, dissoute ou hors cible" },
      site_web: { type: ['string', 'null'] },
      email: { type: ['string', 'null'], description: 'Email professionnel lu tel quel sur une page publique, sinon null' },
      email_source: { type: ['string', 'null'], description: "URL de la page où l'email apparaît" },
      telephone: { type: ['string', 'null'] },
      linkedin_url: { type: ['string', 'null'], description: 'Profil LinkedIn du contact ou page LinkedIn de la structure' },
      contact_nom: { type: ['string', 'null'] },
      contact_role: { type: ['string', 'null'], description: 'ex. Président, Gérant, Présidente de l\'union commerciale' },
      notes: { type: 'string', description: '1 à 3 faits concrets et récents pour personnaliser le mail (événement, nombre d\'adhérents, boutiques, actualité). Vide si rien.' },
    },
    required: ['trouve', 'site_web', 'email', 'email_source', 'telephone', 'linkedin_url', 'contact_nom', 'contact_role', 'notes'],
    additionalProperties: false,
  },
} as const;

async function claude(params: Record<string, unknown>) {
  // Fallback serveur en cas de refus des classifieurs.
  const res: any = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    ...params,
  } as any);
  if (res.stop_reason === 'refusal') throw new Error('Claude a refusé la requête');
  return res;
}

const texte = (res: any) => res.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();

async function actionEnrichir(limite: number) {
  const { count } = await supabase.from('prospects').select('id', { count: 'exact', head: true }).eq('statut', 'pret');
  if ((count ?? 0) >= 150) return { skip: 'stock prêt suffisant', pret: count };

  const { data: lot } = await supabase.from('prospects').select('*').eq('statut', 'a_enrichir')
    .order('type').order('nb_etablissements', { ascending: false, nullsFirst: false }).limit(limite);
  const resultats = [];
  for (const p of lot ?? []) {
    try {
      const r = await enrichir(p);
      const email = r?.trouve && r.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email) ? r.email.toLowerCase() : null;
      await supabase.from('prospects').update({
        site_web: r?.site_web ?? null,
        email,
        telephone: r?.telephone ?? null,
        linkedin_url: r?.linkedin_url ?? null,
        contact_nom: r?.contact_nom ?? null,
        contact_role: r?.contact_role ?? null,
        notes: r?.notes || null,
        statut: email ? 'pret' : 'introuvable',
        enrichi_at: new Date().toISOString(),
      }).eq('id', p.id);
      resultats.push({ nom: p.nom, email });
    } catch (e) {
      console.error('[enrichir]', p.nom, e);
      resultats.push({ nom: p.nom, erreur: (e as Error).message });
    }
  }
  return { enrichis: resultats };
}

async function enrichir(p: any) {
  const description = p.type === 'association'
    ? `Association / union de commerçants « ${p.nom} » (${p.ville ?? ''} ${p.code_postal ?? ''}).`
    : `Entreprise « ${p.nom} » (${p.ville ?? ''} ${p.code_postal ?? ''}), code NAF ${p.naf}, ${p.nb_etablissements} établissements ouverts. Dirigeant au registre : ${p.dirigeant ?? 'inconnu'}.`;
  const messages: any[] = [{
    role: 'user',
    content: `${description}

Trouve sur le web les coordonnées publiques de cette structure pour une prise de contact commerciale B2B :
site officiel, email de contact professionnel, téléphone, la personne à contacter (président(e) de l'association ou gérant(e)),
son profil LinkedIn ou la page LinkedIn de la structure, et 1 à 3 faits récents utiles pour personnaliser un mail.
Sources utiles : site officiel (contact, mentions légales), page Facebook, annuaire de la CCI ou de la mairie, Pages Jaunes, presse locale.

Règles :
- L'email doit apparaître tel quel sur une page que tu as consultée. N'en déduis jamais un (pas de prenom.nom@ supposé).
- Pas d'email personnel d'un particulier sans lien avec l'activité.
- Si la structure est dissoute, introuvable ou n'est pas une association de commerçants / un commerce alimentaire, trouve = false.
Termine en appelant l'outil enregistrer_resultat.`,
  }];
  const tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6, user_location: { type: 'approximate', country: 'FR' } }, OUTIL_RESULTAT];

  for (let tour = 0; tour < 4; tour++) {
    const res = await claude({ messages, tools, output_config: { effort: 'low' } });
    const appel = res.content.find((b: any) => b.type === 'tool_use' && b.name === 'enregistrer_resultat');
    if (appel) return appel.input as any;
    if (res.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: res.content });
  }
  return null;
}

// ── ENVOI DES MAILS ──────────────────────────────────────────

function heureParis(d = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d).map((p) => [p.type, p.value]));
  return {
    ouvre: !['sam.', 'dim.'].includes(parts.weekday),
    h: Number(parts.hour) + Number(parts.minute) / 60,
    jour: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function debutJourParis() {
  const off = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', timeZoneName: 'shortOffset' })
    .formatToParts(new Date()).find((x) => x.type === 'timeZoneName')?.value ?? 'GMT+1';
  const heures = Number(off.replace('GMT', '') || '0');
  return new Date(Date.parse(`${heureParis().jour}T00:00:00Z`) - heures * 3600_000).toISOString();
}

async function actionEnvoyer() {
  if (!LIVE) return { skip: 'AGENT_MODE != live' };
  const t = heureParis();
  if (!t.ouvre || t.h < 9 || t.h >= 18) return { skip: 'hors heures ouvrées' };

  const { count: envoyesAujourdhui } = await supabase.from('prospection_messages').select('id', { count: 'exact', head: true })
    .eq('canal', 'email').eq('sens', 'sortant').eq('etape', 'initial').gte('created_at', debutJourParis());
  // Étalé sur la journée : ~36 passages de 15 min entre 9h et 18h.
  const reste = Math.max(0, QUOTA_JOUR - (envoyesAujourdhui ?? 0));
  const parPassage = Math.max(1, Math.ceil(QUOTA_JOUR / 36));
  const bilan: any[] = [];

  // Relances d'abord (J+7 puis J+14), elles ne comptent pas dans le quota.
  const { data: relances } = await supabase.rpc('claim_prospects', { p_statuts: ['contacte', 'relance_1'], n: 3 });
  for (const p of relances ?? []) bilan.push(await envoyerRelance(p));

  if (reste > 0) {
    const { data: nouveaux } = await supabase.rpc('claim_prospects', { p_statuts: ['pret'], n: Math.min(reste, parPassage) });
    for (const p of nouveaux ?? []) bilan.push(await envoyerInitial(p));
  }
  return { envoyes: bilan };
}

async function redigerInitial(p: any) {
  const cible = p.type === 'association'
    ? "le responsable d'une association / union de commerçants : proposer un partenariat avec un tarif préférentiel pour ses adhérents"
    : `le propriétaire de ${p.nb_etablissements ?? 'plusieurs'} boutiques alimentaires : proposer Marchéo pour toutes ses boutiques avec le tarif plusieurs boutiques`;
  const res = await claude({
    output_config: {
      effort: 'medium',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            sujet: { type: 'string' },
            salutation: { type: 'string' },
            corps: { type: 'string' },
          },
          required: ['sujet', 'salutation', 'corps'],
          additionalProperties: false,
        },
      },
    },
    system: `Tu écris les mails de prospection de ${SIGNATURE_NOM}, ${SIGNATURE_ROLE} de Marchéo. Faits autorisés (n'invente aucun autre chiffre, client, témoignage ou résultat) :
${FAITS_MARCHEO}

Style : français, vouvoiement, ton direct d'entrepreneur à commerçant, phrases courtes, aucun jargon marketing, pas d'emoji.
Le corps fait 90 à 150 mots en texte brut, paragraphes séparés par une ligne vide, liste à tirets autorisée pour l'offre.
Il commence par une accroche liée au destinataire (en s'appuyant sur les notes si elles sont utiles), présente l'offre adaptée,
et finit par une seule question : 15 minutes d'échange cette semaine ou la suivante. Pas de signature, pas de formule de politesse finale.
Sujet : 4 à 9 mots, personnalisé avec le nom de la structure ou la ville, sans majuscules partout ni point d'exclamation.`,
    messages: [{
      role: 'user',
      content: `Destinataire : ${cible}.
Structure : ${p.nom} — ${p.ville ?? ''} (${p.code_postal ?? ''})
Contact : ${p.contact_nom ?? 'inconnu'}${p.contact_role ? `, ${p.contact_role}` : ''}
Notes : ${p.notes ?? 'aucune'}`,
    }],
  });
  return JSON.parse(texte(res)) as { sujet: string; salutation: string; corps: string };
}

function lienDesinscription(p: any) {
  return `${FUNCTION_URL}?action=desinscription&t=${p.unsubscribe_token}`;
}

function signatureTexte() {
  return [`${SIGNATURE_NOM} — ${SIGNATURE_ROLE}, Marchéo`, SIGNATURE_TEL, 'marchéo.fr'].filter(Boolean).join('\n');
}

function versHtml(texteBrut: string, p: any) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paras = texteBrut.split(/\n{2,}/).map((b) => `<p style="margin:0 0 14px">${esc(b).replace(/\n/g, '<br>')}</p>`).join('');
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222;max-width:600px">${paras}
<p style="margin:24px 0 0;font-size:12px;color:#888">Vous recevez ce message car vos coordonnées professionnelles sont publiées en ligne.
<a href="${lienDesinscription(p)}" style="color:#888">Ne plus recevoir de messages de Marchéo</a> ou répondez « stop ».</p></div>`;
}

function piedTexte(p: any) {
  return `\n\n—\nVous recevez ce message car vos coordonnées professionnelles sont publiées en ligne. Pour ne plus rien recevoir : ${lienDesinscription(p)} ou répondez « stop ».`;
}

async function envoyerMail(p: any, sujet: string, corps: string, etape: string) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [p.email],
      reply_to: REPLY_TO || undefined,
      subject: sujet,
      text: corps + piedTexte(p),
      html: versHtml(corps, p),
      headers: {
        'List-Unsubscribe': `<${lienDesinscription(p)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Resend ${r.status}: ${JSON.stringify(data)}`);
  await supabase.from('prospection_messages').insert({
    prospect_id: p.id, canal: 'email', sens: 'sortant', etape, sujet, corps, resend_id: data.id ?? null,
  });
}

const dansJours = (j: number) => new Date(Date.now() + j * 86400_000).toISOString();

async function envoyerInitial(p: any) {
  try {
    const m = await redigerInitial(p);
    const corps = `${m.salutation}\n\n${m.corps}\n\nBien cordialement,\n${signatureTexte()}`;
    await envoyerMail(p, m.sujet, corps, 'initial');
    await supabase.from('prospects').update({
      statut: 'contacte', sujet_initial: m.sujet, dernier_envoi_at: new Date().toISOString(), prochaine_action_at: dansJours(7),
    }).eq('id', p.id);
    return { nom: p.nom, etape: 'initial' };
  } catch (e) {
    await supabase.from('prospects').update({ statut: 'pret', prochaine_action_at: dansJours(1) }).eq('id', p.id);
    return { nom: p.nom, erreur: (e as Error).message };
  }
}

async function envoyerRelance(p: any) {
  // L'étape se déduit des relances déjà envoyées (le statut est passé à 'en_cours' au claim).
  const { count } = await supabase.from('prospection_messages').select('id', { count: 'exact', head: true })
    .eq('prospect_id', p.id).eq('sens', 'sortant').in('etape', ['relance_1', 'relance_2']);
  const n = (count ?? 0) + 1;
  const sujet = `Re: ${p.sujet_initial ?? 'partenariat Marchéo'}`;
  const corps = n === 1
    ? `Bonjour,\n\nJe me permets de revenir vers vous au sujet de mon message de la semaine dernière. ${p.type === 'association'
        ? "Le tarif partenaire pour vos adhérents ne demande aucune convention de votre côté : un simple code adhérent, et jusqu'à 250 € de remise sur l'installation pour chaque commerce."
        : "Pour plusieurs boutiques, tout se gère depuis une seule interface, sans commission sur les ventes."}\n\nUn exemple de boutique en ligne : ${SITE}/chez-christophe\n\nAuriez-vous 15 minutes pour en parler ?${BOOKING_URL ? ` Vous pouvez aussi choisir un créneau ici : ${BOOKING_URL}` : ''}\n\nBien cordialement,\n${signatureTexte()}`
    : `Bonjour,\n\nDernier message de ma part pour ne pas encombrer votre boîte. Si ce n'est pas le bon moment ou pas la bonne personne, une réponse d'une ligne me suffit et je ne vous relancerai plus.\n\nBien cordialement,\n${signatureTexte()}`;
  const etape = n === 1 ? 'relance_1' : 'relance_2';
  try {
    await envoyerMail(p, sujet, corps, etape);
    await supabase.from('prospects').update({
      statut: n === 1 ? 'relance_1' : 'termine', dernier_envoi_at: new Date().toISOString(), prochaine_action_at: n === 1 ? dansJours(7) : null,
    }).eq('id', p.id);
    return { nom: p.nom, etape };
  } catch (e) {
    await supabase.from('prospects').update({ statut: n === 1 ? 'contacte' : 'relance_1', prochaine_action_at: dansJours(1) }).eq('id', p.id);
    return { nom: p.nom, erreur: (e as Error).message };
  }
}

async function actionApercu(n: number) {
  const { data } = await supabase.from('prospects').select('*').eq('statut', 'pret').limit(Math.min(n, 5));
  const out = [];
  for (const p of data ?? []) {
    const m = await redigerInitial(p);
    out.push({ a: p.email, structure: p.nom, sujet: m.sujet, corps: `${m.salutation}\n\n${m.corps}\n\nBien cordialement,\n${signatureTexte()}` });
  }
  return { apercus: out };
}

// ── RÉPONSES ENTRANTES ───────────────────────────────────────

async function lireEntrant(body: any) {
  if (body.type === 'email.received' && body.data) {
    const d = body.data;
    let text = d.text ?? '';
    if (!text && d.email_id) {
      const r = await fetch(`https://api.resend.com/emails/receiving/${d.email_id}`, { headers: { Authorization: `Bearer ${RESEND_API_KEY}` } });
      if (r.ok) { const full = await r.json(); text = full.text || (full.html ?? '').replace(/<[^>]+>/g, ' '); }
    }
    return { from: d.from as string, subject: d.subject as string, text };
  }
  return { from: body.from as string, subject: body.subject as string, text: body.text as string };
}

const adresse = (from: string) => (from?.match(/<([^>]+)>/)?.[1] ?? from ?? '').trim().toLowerCase();

async function actionReponse(body: any) {
  const m = await lireEntrant(body);
  const email = adresse(m.from);
  if (!email) return { error: 'expéditeur manquant' };

  let { data: p } = await supabase.from('prospects').select('*').ilike('email', email).limit(1).maybeSingle();
  if (!p) {
    // Réponse depuis une autre adresse du même domaine
    const domaine = email.split('@')[1];
    if (domaine && !/gmail|yahoo|hotmail|outlook|orange|free|wanadoo|laposte|sfr|icloud/.test(domaine)) {
      ({ data: p } = await supabase.from('prospects').select('*').ilike('email', `%@${domaine}`).limit(1).maybeSingle());
    }
  }
  if (!p) {
    await alerterOwner(`Réponse d'un expéditeur inconnu : ${m.from}`, `${m.subject}\n\n${m.text}`);
    return { inconnu: email };
  }

  const { data: historique } = await supabase.from('prospection_messages').select('sens, sujet, corps, created_at')
    .eq('prospect_id', p.id).order('created_at').limit(10);

  const res = await claude({
    output_config: {
      effort: 'medium',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            classification: { type: 'string', enum: ['interesse', 'question', 'pas_interesse', 'stop', 'absence', 'autre'] },
            reponse: { type: ['string', 'null'], description: 'Texte de la réponse à envoyer, sans signature. null pour stop, absence et autre.' },
            resume: { type: 'string' },
          },
          required: ['classification', 'reponse', 'resume'],
          additionalProperties: false,
        },
      },
    },
    system: `Tu gères les réponses aux mails de prospection de ${SIGNATURE_NOM}, ${SIGNATURE_ROLE} de Marchéo. Faits autorisés (n'invente rien d'autre : ni prix, ni remise, ni fonctionnalité, ni client) :
${FAITS_MARCHEO}

Classe le message entrant :
- interesse : veut échanger, demande un rendez-vous, une démo ou un devis
- question : pose une question à laquelle les faits ci-dessus répondent
- pas_interesse : refuse poliment ou dit que ce n'est pas le moment
- stop : demande de ne plus être contacté (stop, désinscription, RGPD, colère)
- absence : réponse automatique d'absence ou de changement d'adresse
- autre : tout le reste, ou une question dont la réponse n'est pas dans les faits (négociation, conditions particulières, juridique)

Rédige la réponse pour interesse, question et pas_interesse uniquement : français, vouvoiement, 40 à 120 mots, texte brut.
interesse → remercier, proposer deux créneaux à préciser par le prospect ${BOOKING_URL ? `ou le lien de réservation ${BOOKING_URL}` : 'ou demander son numéro et ses disponibilités'}, dire que ${SIGNATURE_NOM} le rappellera.
question → répondre précisément avec les faits, puis proposer 15 minutes d'échange.
pas_interesse → remercier en une ou deux phrases, ne pas insister.`,
    messages: [{
      role: 'user',
      content: `Prospect : ${p.nom} (${p.type}, ${p.ville ?? ''})
Historique :
${(historique ?? []).map((h) => `[${h.sens}] ${h.sujet ?? ''}\n${h.corps ?? ''}`).join('\n---\n')}

Message reçu de ${m.from} — objet : ${m.subject}
${(m.text ?? '').slice(0, 6000)}`,
    }],
  });
  const r = JSON.parse(texte(res)) as { classification: string; reponse: string | null; resume: string };

  await supabase.from('prospection_messages').insert({
    prospect_id: p.id, canal: 'email', sens: 'entrant', etape: 'entrant', sujet: m.subject, corps: m.text, classification: r.classification,
  });

  const statut: Record<string, string> = {
    interesse: 'interesse', question: 'repondu', pas_interesse: 'pas_interesse', stop: 'desinscrit', autre: 'repondu',
  };
  if (r.classification === 'absence') {
    // On décale la prochaine action d'une semaine, sans répondre.
    await supabase.from('prospects').update({ prochaine_action_at: dansJours(7) }).eq('id', p.id);
  } else {
    await supabase.from('prospects').update({ statut: statut[r.classification], prochaine_action_at: null }).eq('id', p.id);
  }

  // Au-delà de 3 réponses automatiques dans un même échange, la main passe à l'humain.
  const { count: dejaRepondu } = await supabase.from('prospection_messages').select('id', { count: 'exact', head: true })
    .eq('prospect_id', p.id).eq('etape', 'reponse_auto');
  const repondre = !!r.reponse && LIVE && (dejaRepondu ?? 0) < 3 && ['interesse', 'question', 'pas_interesse'].includes(r.classification);
  if (repondre) {
    const sujet = m.subject?.toLowerCase().startsWith('re:') ? m.subject : `Re: ${m.subject ?? p.sujet_initial ?? 'Marchéo'}`;
    await envoyerMail({ ...p, email }, sujet, `${r.reponse}\n\nBien cordialement,\n${signatureTexte()}`, 'reponse_auto');
  }
  if (['interesse', 'question', 'autre'].includes(r.classification)) {
    await alerterOwner(`[${r.classification}] ${p.nom} (${p.ville ?? ''})`,
      `${r.resume}\n\nDe : ${m.from}\nTél. trouvé : ${p.telephone ?? '—'}\nLinkedIn : ${p.linkedin_url ?? '—'}\n\nMessage :\n${m.text}\n\n${repondre ? `Réponse envoyée automatiquement :\n${r.reponse}` : 'Pas de réponse automatique : à traiter.'}`);
  }
  return { prospect: p.nom, classification: r.classification, repondu: repondre };
}

async function alerterOwner(sujet: string, corps: string) {
  if (!OWNER_EMAIL || !RESEND_API_KEY) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [OWNER_EMAIL], subject: `[Agent] ${sujet}`, text: corps }),
  });
}

// ── DÉSINSCRIPTION ───────────────────────────────────────────

async function pageDesinscription(token: string, dejaFait: boolean) {
  let ok = false;
  if (/^[0-9a-f-]{36}$/i.test(token)) {
    const { data } = await supabase.from('prospects').update({ statut: 'desinscrit', prochaine_action_at: null })
      .eq('unsubscribe_token', token).select('id');
    ok = (data?.length ?? 0) > 0 || dejaFait;
  }
  const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Désinscription</title><body style="font-family:Arial,sans-serif;max-width:520px;margin:60px auto;padding:0 16px;color:#222">
<h1 style="font-size:22px">${ok ? 'C\'est fait.' : 'Lien invalide'}</h1>
<p>${ok ? 'Vous ne recevrez plus aucun message de prospection de Marchéo.' : 'Répondez simplement « stop » au mail reçu et nous vous retirons de notre liste.'}</p></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ── LINKEDIN : POSTS ─────────────────────────────────────────

const THEMES_POSTS = [
  "Ce que coûte vraiment une commission de 25-30 % à une boulangerie ou une pizzeria sur un an (calcul simple, sans chiffre inventé sur un client)",
  "Message aux présidents d'unions commerciales : comment aider les commerçants du centre-ville à vendre en ligne sans projet lourd",
  "Les précommandes de fêtes (Noël, galette, Pâques) : pourquoi le cahier papier coûte des ventes",
  "No-show sur les commandes et réservations : comment fonctionne une empreinte bancaire, en clair",
  "Le fichier client : pourquoi un commerçant doit garder ses clients au lieu de les louer à une plateforme",
  "Primeurs et maraîchers : le panier de la semaine commandé en ligne",
  "Boucherie : commandes à la découpe et vente au poids en ligne, comment ajuster à la pesée",
  "Plusieurs boutiques, un seul outil : ce qu'un propriétaire de 3 ou 4 commerces devrait centraliser",
  "La fiche Google Business, premier réglage avant même un site",
  "Coulisses : pourquoi j'ai créé Marchéo (histoire de fondateur, sobre et sincère)",
  "Question ouverte aux commerçants : qu'est-ce qui vous freine pour prendre des commandes en ligne ?",
  "Livraison locale sans coursiers de plateforme : zone, créneaux, minimum de commande",
  "Poissonnerie : annoncer les arrivages du matin et réserver le poisson du week-end",
  "Associations de commerçants : 3 actions concrètes pour dynamiser un centre-ville face aux zones commerciales",
  "Fromagerie et épicerie fine : plateaux sur mesure et commandes de fêtes",
  "Click & collect : ce que le client veut vraiment (30 secondes, pas de compte, une heure de retrait)",
  "Traiteur : acomptes, planning des retraits et fin des oublis",
  "Erreurs fréquentes quand un commerçant se lance en ligne (et comment les éviter)",
  "Offre partenaire pour les adhérents d'associations de commerçants : comment ça marche",
  "Le commerce de proximité a un avantage que les plateformes n'auront jamais : la relation. Comment la prolonger en ligne",
];

async function genererPost() {
  const { data: derniers } = await supabase.from('linkedin_posts').select('theme, contenu').eq('statut', 'publie')
    .order('created_at', { ascending: false }).limit(12);
  const { count } = await supabase.from('linkedin_posts').select('id', { count: 'exact', head: true });
  const theme = THEMES_POSTS[(count ?? 0) % THEMES_POSTS.length];

  const res = await claude({
    output_config: { effort: 'medium' },
    system: `Tu écris les posts LinkedIn de ${SIGNATURE_NOM}, fondateur de Marchéo, à la première personne.
Audience : présidents d'associations et d'unions de commerçants, propriétaires de plusieurs boutiques alimentaires
(boulangeries, boucheries, primeurs, poissonneries, épiceries), dirigeants de petits groupes alimentaires.
Faits autorisés (n'invente aucun client, témoignage, statistique, chiffre d'affaires ou résultat) :
${FAITS_MARCHEO}

Format : français, 700 à 1300 caractères. Première ligne = accroche courte qui donne envie de cliquer sur « voir plus ».
Lignes courtes, une idée par paragraphe, aération. Concret, terrain, utile même sans acheter. Pas plus de 2 emojis.
Termine par une question ou un appel à l'échange en commentaire ou en message privé, varié d'un post à l'autre.
Ne mets un lien que si c'est vraiment utile (au plus un). 3 à 5 hashtags à la fin (#commerce #commercedeproximite #artisan…).
Réponds uniquement avec le texte du post.`,
    messages: [{
      role: 'user',
      content: `Thème du jour : ${theme}

Derniers posts publiés (ne répète ni l'accroche, ni la structure, ni les exemples) :
${(derniers ?? []).map((d) => `- ${d.contenu.split('\n')[0]}`).join('\n') || 'aucun'}`,
    }],
  });
  return { theme, contenu: texte(res) };
}

function versionLinkedin() {
  // Les versions de l'API LinkedIn sont mensuelles (YYYYMM) ; on prend celle d'il y a 2 mois.
  const d = new Date(); d.setUTCMonth(d.getUTCMonth() - 2);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Le texte « commentary » de l'API Posts est en « little text » : ces caractères doivent être échappés.
// Les hashtags passent au format {hashtag|\#|mot}.
const echapperLinkedin = (s: string) => s
  .replace(/[\\|{}@\[\]()<>#*_~]/g, (c) => `\\${c}`)
  .replace(/\\#([\p{L}\p{N}]+)/gu, '{hashtag|\\#|$1}');

async function actionLinkedinPost(forcer: boolean) {
  if (!LIVE && !forcer) return { skip: 'AGENT_MODE != live' };
  if (!LINKEDIN_TOKEN || !LINKEDIN_URN) return { skip: 'LINKEDIN_ACCESS_TOKEN / LINKEDIN_PERSON_URN manquants' };
  const t = heureParis();
  const creneaux = POSTS_PAR_JOUR >= 2 ? [8.5, 12.5] : [8.5];
  const { count: faitsAujourdhui } = await supabase.from('linkedin_posts').select('id', { count: 'exact', head: true })
    .eq('statut', 'publie').gte('created_at', debutJourParis());
  const { count: erreursAujourdhui } = await supabase.from('linkedin_posts').select('id', { count: 'exact', head: true })
    .eq('statut', 'erreur').gte('created_at', debutJourParis());
  const du = creneaux.filter((h) => t.h >= h).length;
  if (!forcer && (!t.ouvre || (faitsAujourdhui ?? 0) >= du)) return { skip: 'pas de créneau' };
  if (!forcer && (erreursAujourdhui ?? 0) >= 3) return { skip: '3 erreurs aujourd\'hui, on réessaie demain' };

  const post = await genererPost();
  const r = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LINKEDIN_TOKEN}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': env('LINKEDIN_VERSION', versionLinkedin()),
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: LINKEDIN_URN,
      commentary: echapperLinkedin(post.contenu),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!r.ok) {
    const erreur = `${r.status} ${await r.text()}`;
    await supabase.from('linkedin_posts').insert({ theme: post.theme, contenu: post.contenu, statut: 'erreur', erreur });
    if (r.status === 401) await alerterOwner('Jeton LinkedIn expiré', 'Le jeton LinkedIn (valable 60 jours) doit être renouvelé : voir docs/AGENT-PROSPECTION.md.');
    return { erreur };
  }
  const urn = r.headers.get('x-restli-id');
  await supabase.from('linkedin_posts').insert({ theme: post.theme, contenu: post.contenu, statut: 'publie', linkedin_urn: urn });
  return { publie: urn, theme: post.theme };
}

// ── DIGEST DU MATIN (dont les actions LinkedIn manuelles) ────

async function actionDigest(forcer: boolean) {
  const t = heureParis();
  if (!forcer) {
    if (!t.ouvre || t.h < 7.5 || t.h >= 8) return { skip: 'pas l\'heure' };
    const { data: etat } = await supabase.from('prospection_etat').select('valeur').eq('cle', 'digest').maybeSingle();
    if (etat?.valeur?.jour === t.jour) return { skip: 'déjà envoyé' };
  }
  const hier = dansJours(-1);
  const compte = async (q: any) => (await q).count ?? 0;
  const stats = {
    envoyes: await compte(supabase.from('prospection_messages').select('id', { count: 'exact', head: true }).eq('sens', 'sortant').gte('created_at', hier)),
    recus: await compte(supabase.from('prospection_messages').select('id', { count: 'exact', head: true }).eq('sens', 'entrant').gte('created_at', hier)),
    interesses: await compte(supabase.from('prospects').select('id', { count: 'exact', head: true }).eq('statut', 'interesse')),
    prets: await compte(supabase.from('prospects').select('id', { count: 'exact', head: true }).eq('statut', 'pret')),
    total: await compte(supabase.from('prospects').select('id', { count: 'exact', head: true })),
  };

  // 15 invitations LinkedIn du jour : prospects déjà contactés par mail (le nom leur dira quelque chose).
  const { data: aInviter } = await supabase.from('prospects').select('id, nom, ville, type, contact_nom, contact_role, linkedin_url, notes')
    .not('linkedin_url', 'is', null).eq('linkedin_fait', false).in('statut', ['contacte', 'relance_1', 'relance_2', 'interesse', 'repondu'])
    .order('dernier_envoi_at', { ascending: false }).limit(15);

  const lignes: string[] = [];
  for (const p of aInviter ?? []) {
    const note = await noteInvitation(p);
    lignes.push(`• ${p.contact_nom ?? p.nom} — ${p.nom} (${p.ville ?? ''})\n  ${p.linkedin_url}\n  Note d'invitation : ${note}`);
    await supabase.from('prospection_messages').insert({ prospect_id: p.id, canal: 'linkedin', sens: 'sortant', etape: 'invitation', corps: note });
    await supabase.from('prospects').update({ linkedin_fait: true }).eq('id', p.id);
  }

  const corps = `Bonjour,

Dernières 24 h : ${stats.envoyes} mails envoyés, ${stats.recus} réponses reçues.
Prospects intéressés à rappeler : ${stats.interesses}. Prêts à contacter : ${stats.prets}. Base totale : ${stats.total}.
Mode : ${LIVE ? 'live' : 'PAUSE (rien n\'est envoyé ni publié)'}

À faire sur LinkedIn (10 minutes) — ouvrir chaque lien, « Se connecter », « Ajouter une note », coller la note :

${lignes.join('\n\n') || 'Aucun profil LinkedIn trouvé aujourd\'hui.'}

Pensez aussi à répondre aux commentaires du post du jour : l'API LinkedIn ne permet pas de les lire automatiquement.`;
  await alerterOwner(`Digest du ${t.jour}`, corps);
  await supabase.from('prospection_etat').upsert({ cle: 'digest', valeur: { jour: t.jour }, maj_at: new Date().toISOString() });
  return { stats, invitations: lignes.length };
}

async function noteInvitation(p: any) {
  const res = await claude({
    output_config: { effort: 'low' },
    system: `Tu écris des notes d'invitation LinkedIn pour ${SIGNATURE_NOM}, fondateur de Marchéo (boutique en ligne sans commission pour commerces de bouche).
Moins de 280 caractères, français, vouvoiement, aucun argumentaire commercial ni lien : une raison sincère et précise de se connecter.
Réponds uniquement avec la note.`,
    messages: [{ role: 'user', content: `${p.contact_nom ?? ''} ${p.contact_role ? `(${p.contact_role})` : ''} — ${p.nom}, ${p.ville ?? ''}. Type : ${p.type}. Notes : ${p.notes ?? 'aucune'}. Un mail lui a déjà été envoyé.` }],
  });
  return texte(res).slice(0, 295);
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
