#!/usr/bin/env node
// =============================================================================
// generate.js — Génération catalogues produits Marchéo + photos IA (DALL-E 3)
//
// USAGE :
//   node generate.js                → tous les métiers (5)
//   node generate.js primeur        → seulement le primeur
//   node generate.js boucherie      → seulement la boucherie
//   node generate.js fromagerie     → seulement la fromagerie
//   node generate.js poissonnerie   → seulement la poissonnerie
//   node generate.js boulangerie    → seulement la boulangerie
//   node generate.js primeur --skip-images   → catalogue sans générer les photos
//   node generate.js --reset        → efface la progression et recommence
//
// VARIABLES D'ENVIRONNEMENT (fichier .env ou export) :
//   OPENAI_API_KEY          — votre clé OpenAI
//   SUPABASE_SERVICE_KEY    — service_role key (accès total)
//   SUPABASE_URL            — (optionnel, déjà codé en dur)
// =============================================================================

'use strict';

const https   = require('https');
const http    = require('http');
const fs      = require('fs');
const path    = require('path');

// ── Charger .env si présent ──────────────────────────────────────
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .replace(/^﻿/, '')   // supprimer BOM éventuel
    .split('\n')
    .forEach(line => {
      const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    });
}

// ── Config ───────────────────────────────────────────────────────
const OPENAI_KEY           = process.env.OPENAI_API_KEY;
const SUPABASE_URL         = process.env.SUPABASE_URL || 'https://epvdzhzwfmtnioedyfgm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET               = 'produits-media';
const PROGRESS_FILE        = path.join(__dirname, '.progress.json');

// Rate limiting DALL-E 3 : max 5 images/min sur Tier 1 → on prend 13s de marge
const DELAY_BETWEEN_IMAGES = 13000;

// ── Validation ───────────────────────────────────────────────────
if (!OPENAI_KEY) {
  console.error('\n❌  OPENAI_API_KEY manquant. Ajoutez-le dans .env ou exportez-le.\n');
  process.exit(1);
}
if (!SUPABASE_SERVICE_KEY) {
  console.error('\n❌  SUPABASE_SERVICE_KEY manquant. Ajoutez-le dans .env ou exportez-le.\n');
  process.exit(1);
}

// ── Args CLI ─────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const skipImages  = args.includes('--skip-images');
const resetMode   = args.includes('--reset');
const targetMetier = args.find(a => !a.startsWith('--')) || null;

// ── Métiers cibles ───────────────────────────────────────────────
const TOUS_METIERS = ['primeur', 'boucherie', 'poissonnerie', 'fromagerie', 'boulangerie'];
const METIERS_LABELS = {
  primeur:      'Primeur — fruits & légumes',
  boucherie:    'Boucherie / Charcuterie artisanale',
  poissonnerie: 'Poissonnerie — marée fraîche',
  fromagerie:   'Fromagerie / Crèmerie affinée',
  boulangerie:  'Boulangerie / Pâtisserie artisanale',
};
const metiersATraiter = targetMetier ? [targetMetier] : TOUS_METIERS;

if (targetMetier && !TOUS_METIERS.includes(targetMetier)) {
  console.error(`\n❌  Métier inconnu : "${targetMetier}"`);
  console.error(`   Valeurs valides : ${TOUS_METIERS.join(', ')}\n`);
  process.exit(1);
}

// ── Couleurs terminal ─────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',  bold:   '\x1b[1m',
  green:  '\x1b[32m', yellow: '\x1b[33m',
  blue:   '\x1b[34m', cyan:   '\x1b[36m',
  red:    '\x1b[31m', gray:   '\x1b[90m',
  magenta:'\x1b[35m',
};
const log  = (...a) => console.log(...a);
const ok   = (s) => log(`  ${C.green}✓${C.reset} ${s}`);
const warn = (s) => log(`  ${C.yellow}⚠${C.reset} ${s}`);
const err  = (s) => log(`  ${C.red}✗${C.reset} ${s}`);
const info = (s) => log(`  ${C.blue}→${C.reset} ${s}`);
const dim  = (s) => log(`  ${C.gray}${s}${C.reset}`);

// ── Utilitaires ───────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function slugify(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[œ]/g, 'oe').replace(/[æ]/g, 'ae')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// ── Progression (reprise si interruption) ────────────────────────
function loadProgress() {
  if (resetMode && fs.existsSync(PROGRESS_FILE)) {
    fs.unlinkSync(PROGRESS_FILE);
    log(`${C.yellow}⚠ Progression effacée (--reset)${C.reset}\n`);
  }
  if (!fs.existsSync(PROGRESS_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
  catch { return {}; }
}

function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

// ── HTTP helpers (sans dépendance externe autre que openai/supabase) ─
function fetchJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   opts.method || 'GET',
      headers:  opts.headers || {},
    };
    const req = lib.request(options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    lib.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadBuffer(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── Supabase helpers ──────────────────────────────────────────────
const SB_HEADERS = {
  'apikey':        SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type':  'application/json',
  'Prefer':        'return=representation',
};

async function sbGet(table, params = '') {
  const getHeaders = Object.fromEntries(
    Object.entries(SB_HEADERS).filter(([k]) => k !== 'Content-Type' && k !== 'Prefer')
  );
  const r = await fetchJson(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: getHeaders,
  });
  return r.data;
}

async function sbInsert(table, row) {
  const r = await fetchJson(`${SUPABASE_URL}/rest/v1/${table}`, {
    method:  'POST',
    headers: SB_HEADERS,
    body:    JSON.stringify(row),
  });
  if (r.status >= 300) throw new Error(`sbInsert ${table}: ${JSON.stringify(r.data)}`);
  return Array.isArray(r.data) ? r.data[0] : r.data;
}

async function sbUpsert(table, row, onConflict = 'slug,categorie_id') {
  const r = await fetchJson(
    `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
    {
      method:  'POST',
      headers: { ...SB_HEADERS, 'Prefer': 'return=representation,resolution=merge-duplicates' },
      body:    JSON.stringify(row),
    }
  );
  if (r.status >= 300) throw new Error(`sbUpsert ${table}: ${JSON.stringify(r.data)}`);
  return Array.isArray(r.data) ? r.data[0] : r.data;
}

async function uploadToStorage(buffer, storagePath, contentType = 'image/jpeg') {
  return new Promise((resolve, reject) => {
    const parsed = new URL(SUPABASE_URL);
    const postPath = `/storage/v1/object/${BUCKET}/${storagePath}`;
    const options = {
      hostname: parsed.hostname,
      port:     443,
      path:     postPath,
      method:   'POST',
      headers: {
        'apikey':          SUPABASE_SERVICE_KEY,
        'Authorization':   `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type':    contentType,
        'Content-Length':  buffer.length,
        'x-upsert':        'true',
        'Cache-Control':   'public, max-age=31536000',
      },
    };
    const req = https.request(options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
          resolve(publicUrl);
        } else {
          reject(new Error(`Storage upload ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

// ── OpenAI helpers ────────────────────────────────────────────────
async function callGPT4(systemPrompt, userPrompt) {
  const r = await fetchJson('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model:       'gpt-4o',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
    }),
  });
  if (r.status !== 200) throw new Error(`GPT-4o: ${JSON.stringify(r.data)}`);
  return JSON.parse(r.data.choices[0].message.content);
}

async function generateImageDALLE3(prompt, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetchJson('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          model:   'dall-e-3',
          prompt:  prompt,
          n:       1,
          size:    '1024x1024',
          quality: 'standard',
          style:   'natural',
          response_format: 'url',
        }),
      });
      if (r.status === 200) return r.data.data[0].url;
      if (r.status === 429) {
        warn(`Rate limit DALL-E 3 — attente 60s (tentative ${attempt+1}/${retries+1})`);
        await sleep(60000);
        continue;
      }
      throw new Error(`DALL-E 3 ${r.status}: ${JSON.stringify(r.data)}`);
    } catch (e) {
      if (attempt === retries) throw e;
      warn(`Erreur image (tentative ${attempt+1}): ${e.message} — retry dans 10s`);
      await sleep(10000);
    }
  }
}

// ── Prompt système GPT-4o ─────────────────────────────────────────
const SYSTEM_PROMPT = `Tu es un expert en commerce alimentaire français et en merchandising produit pour le e-commerce (click & collect haut de gamme).

Tu dois générer un catalogue produit COMPLET et RÉALISTE pour un commerce artisanal français de qualité.

RÈGLES IMPORTANTES :
- Produits typiques et réalistes du commerce français (pas de produits fantaisistes)
- Prix en euros réalistes du marché français 2024
- Descriptions courtes (1-2 phrases), style commerçant premium, sensorielles et appétissantes
- Varier les gammes : produits du quotidien + produits premium
- Pour la boucherie : varier les découpes (entrecôte, bavette, côte de bœuf, faux-filet...)
- Pour la fromagerie : varier les affinages et les laits
- Pour la boulangerie : inclure pains tradition, spéciaux, viennoiseries, pâtisseries
- Pour la poissonnerie : poissons entiers + filets + crustacés + coquillages
- Pour le primeur : saisons implicites, produits locaux et exotiques
- Minimum 5 produits par catégorie, maximum 12
- Unités réalistes : "à la pièce", "le kg", "le filet ~200g", "la tranche", "les 6", "la botte"...

PROMPT IMAGE :
Pour chaque produit, génère un prompt DALL-E 3 précis basé sur ce modèle :

Photo packshot ultra-réaliste d'alimentaire pour e-commerce français premium.
[Décrire le produit de façon précise : couleur, texture, aspect]
[Choisir automatiquement la mise en scène selon le produit :]
  - Produit unitaire (artichaut, citron, pain...) → 1 seul exemplaire centré
  - Petite quantité (3-6 pièces) → disposition harmonieuse
  - Volume/vrac (noix, pommes de terre...) → petit tas naturel généreux
  - Tranches/filets → disposition soignée sur planche ou ardoise
Fond blanc pur ou gris très légèrement beige, ombre portée douce.
Éclairage studio diffus, couleurs naturelles légèrement vibrantes.
Netteté maximale, pas de texte, pas d'emballage, cadrage centré.
Style minimaliste packshot marché haut de gamme, rendu photographique professionnel.

Retourne UNIQUEMENT un JSON valide avec cette structure :
{
  "produits": [
    {
      "categorie_slug": "slug-de-la-categorie",
      "nom": "Nom du produit",
      "slug": "nom-du-produit",
      "unite": "format de vente",
      "description": "Description courte et appétissante",
      "prix": 0.00,
      "tva_pct": 5.5,
      "badge_bio": false,
      "badge_local": false,
      "badge_nouveau": false,
      "provenance": "Région ou pays d'origine",
      "saisonnier": false,
      "image_prompt": "prompt DALL-E 3 complet et précis"
    }
  ]
}`;

// ── Prompt utilisateur par métier ─────────────────────────────────
function buildUserPrompt(businessType, categories) {
  const catList = categories
    .map(c => `  - "${c.slug}" (${c.nom})`)
    .join('\n');

  const specs = {
    primeur: `
Génère le catalogue complet d'un PRIMEUR de centre-ville français de qualité.
Catégories disponibles :
${catList}

Inclure impérativement :
• Fruits classiques : pomme, poire, banane, orange, raisin, kiwi, citron...
• Fruits de saison : fraise, cerise, pêche, abricot, figue, melon...
• Fruits exotiques : mangue, ananas, papaye, grenade, fruits de la passion...
• Légumes frais : tomate, courgette, haricot vert, poivron, aubergine, salade, épinards...
• Légumes racines & anciens : carotte, pomme de terre, navet, panais, betterave, céleri-rave...
• Salades & herbes : mesclun, roquette, persil, basilic, coriandre, thym, romarin...
• Champignons : champignon de Paris, shiitake, pleurote, girolles (saison), cèpes (saison)...
• Épicerie & crèmerie : oeufs fermiers, miel local, confiture artisanale...
• Paniers : panier de saison, panier bio, panier soupe...
Proposer aussi quelques produits BIO et LOCAL.`,

    boucherie: `
Génère le catalogue complet d'une BOUCHERIE-CHARCUTERIE artisanale française de qualité.
Catégories disponibles :
${catList}

Inclure impérativement :
• Bœuf : entrecôte, côte de bœuf, faux-filet, bavette, rumsteak, onglet, paleron, pot-au-feu, bœuf haché...
• Veau : escalope, côtelette, rôti de veau, tendrons, blanquette, foie de veau...
• Porc : côtelette de porc, rôti de porc, filet mignon, travers, jarret, poitrine...
• Agneau : gigot d'agneau, côtelettes d'agneau, épaule, souris d'agneau, carré d'agneau...
• Volaille : poulet fermier entier, cuisse, blanc de poulet, pintade, canard, dinde, lapin...
• Charcuterie : jambon blanc, jambon sec, saucisson sec, pâté de campagne, rillettes, lardons, boudin noir...
• Préparations : brochettes maison, merguez maison, chipolatas, saucisses de Toulouse, burger façon boucherie...
• Plats cuisinés : bœuf bourguignon, blanquette de veau, pot-au-feu, rôti du dimanche...`,

    poissonnerie: `
Génère le catalogue complet d'un POISSONNIER de marché français — marée fraîche quotidienne.
Catégories disponibles :
${catList}

Inclure impérativement :
• Poissons frais (entiers) : sardine, maquereau, rouget, daurade, bar, lieu noir, merlan...
• Poissons nobles : sole, turbot, saint-pierre, pageot, loup de mer, dorade royale...
• Crustacés : crevettes grises, crevettes roses, homard, langoustine, tourteau, araignée de mer...
• Coquillages : huîtres (N°2, N°3), moules de bouchot, palourdes, coques, bulots, coquilles Saint-Jacques...
• Fumés & marinés : saumon fumé, truite fumée, hareng mariné, anchois en filet, tarama maison...
• Plateaux : plateau de fruits de mer, plateau crustacés, plateau huîtres...
• Préparations : filets de sole, dos de cabillaud, pavé de saumon, darnes de thon, poulpe préparé, calamars nettoyés...`,

    fromagerie: `
Génère le catalogue complet d'une FROMAGERIE / CRÈMERIE affinée française de qualité.
Catégories disponibles :
${catList}

Inclure impérativement :
• Pâtes molles : Brie de Meaux, Camembert de Normandie, Coulommiers, Chaource, Munster, Époisses, Livarot...
• Pâtes pressées : Comté 12 mois, Comté 24 mois, Beaufort d'été, Cantal, Saint-Nectaire, Morbier, Tomme de Savoie...
• Pâtes persillées : Roquefort AOP, Bleu d'Auvergne, Fourme d'Ambert, Bleu de Gex...
• Chèvres : Crottin de Chavignol, Sainte-Maure de Touraine, Valençay, Picodon, chèvre frais, buchette de chèvre...
• Brebis : Ossau-Iraty, Brebis des Pyrénées, Pecorino affiné, fromage de brebis frais...
• AOP (grands classiques) : Reblochon, Raclette de Savoie, Vacherin Mont-d'Or (saison), Abondance...
• Crèmerie : beurre demi-sel artisanal, crème fraîche épaisse, yaourt fermier, fromage blanc, faisselle...
• Plateaux : plateau apéro, plateau 3 fromages, plateau régional, plateau AOP, plateau fête...`,

    boulangerie: `
Génère le catalogue complet d'une BOULANGERIE / PÂTISSERIE artisanale française de qualité.
Catégories disponibles :
${catList}

Inclure impérativement :
• Pains : baguette tradition, baguette classique, flûte, ficelle, pain de mie, pain de campagne 500g...
• Pains spéciaux : pain aux céréales, pain de seigle, pain aux noix, pain aux olives, pain complet, pain au levain, pain épeautre, fougasse...
• Viennoiseries : croissant au beurre, pain au chocolat, pain aux raisins, chausson aux pommes, brioche tranchée, brioche tressée...
• Pâtisseries : éclair chocolat, éclair café, mille-feuille, Paris-Brest, choux crème, religieuse, opéra, macaron...
• Tartes : tarte aux fraises, tarte citron meringuée, tarte aux pommes, tarte tatin, tarte aux abricots...
• Sandwichs : sandwich jambon-beurre, sandwich poulet-avocat, sandwich saumon-cream cheese...
• Salés : quiche lorraine, quiche saumon-poireaux, pizza boulangère, flan courgette-chèvre...`,
  };

  return specs[businessType] || `Génère le catalogue pour: ${businessType}\nCatégories:\n${catList}`;
}

// ── Fonction principale ───────────────────────────────────────────
async function main() {
  log(`\n${C.bold}${C.magenta}╔══════════════════════════════════════════════╗${C.reset}`);
  log(`${C.bold}${C.magenta}║   Marchéo — Générateur de catalogues IA     ║${C.reset}`);
  log(`${C.bold}${C.magenta}╚══════════════════════════════════════════════╝${C.reset}\n`);

  if (skipImages) warn('Mode --skip-images : photos non générées\n');

  const progress = loadProgress();
  const stats = { produits: 0, images: 0, erreurs: 0, skip: 0 };

  // Récupérer toutes les catégories
  info('Chargement des catégories Supabase…');
  const allCats = await sbGet('categories', 'select=id,nom,slug,business_type,ordre&order=ordre');
  if (!Array.isArray(allCats) || allCats.length === 0) {
    err('Aucune catégorie trouvée. Vérifiez SUPABASE_SERVICE_KEY.');
    process.exit(1);
  }
  ok(`${allCats.length} catégories chargées\n`);

  // ── Boucle sur les métiers
  for (const metier of metiersATraiter) {
    const label = METIERS_LABELS[metier] || metier;
    log(`\n${C.bold}${C.cyan}▶ ${label.toUpperCase()}${C.reset}`);
    log(`${'─'.repeat(50)}`);

    const categories = allCats.filter(c => c.business_type === metier);
    if (!categories.length) {
      warn(`Aucune catégorie pour ${metier} — ignoré`);
      continue;
    }
    info(`${categories.length} catégories : ${categories.map(c => c.nom).join(', ')}`);

    // ── Générer les données produits via GPT-4o
    let produits = [];
    const progressKey = `gpt_${metier}`;

    if (progress[progressKey]) {
      produits = progress[progressKey];
      ok(`Données GPT-4o déjà générées (${produits.length} produits) — chargées depuis la progression`);
    } else {
      info('Génération des données produits via GPT-4o…');
      try {
        const result = await callGPT4(SYSTEM_PROMPT, buildUserPrompt(metier, categories));
        produits = result.produits || [];
        if (!produits.length) throw new Error('Tableau produits vide dans la réponse');
        progress[progressKey] = produits;
        saveProgress(progress);
        ok(`${produits.length} produits générés par GPT-4o`);
      } catch (e) {
        err(`Erreur GPT-4o pour ${metier}: ${e.message}`);
        stats.erreurs++;
        continue;
      }
    }

    // ── Construire un index des catégories par slug
    const catBySlug = {};
    categories.forEach(c => { catBySlug[c.slug] = c; });

    // ── Traiter chaque produit
    let prodIndex = 0;
    for (const p of produits) {
      prodIndex++;
      const prefix = `  [${String(prodIndex).padStart(3,'0')}/${String(produits.length).padStart(3,'0')}]`;
      const prodLabel = `${p.nom} (${p.categorie_slug})`;

      // Vérifier catégorie
      const cat = catBySlug[p.categorie_slug];
      if (!cat) {
        warn(`${prefix} Catégorie introuvable "${p.categorie_slug}" pour "${p.nom}" — ignoré`);
        stats.erreurs++;
        continue;
      }

      // Vérifier si déjà traité
      const progressProdKey = `prod_${metier}_${p.slug || slugify(p.nom)}`;
      if (progress[progressProdKey]) {
        dim(`${prefix} ${p.nom} — déjà dans la DB (skip)`);
        stats.skip++;
        continue;
      }

      // ── Générer l'image DALL-E 3
      let photoUrl = null;
      const storagePath = `${metier}/${slugify(p.nom)}.jpg`;

      if (!skipImages && p.image_prompt) {
        log(`\n${prefix} ${C.bold}${p.nom}${C.reset}`);
        info('Génération image DALL-E 3…');
        try {
          const imgUrl = await generateImageDALLE3(p.image_prompt);
          info('Téléchargement de l\'image…');
          const imgBuffer = await downloadBuffer(imgUrl);
          info('Upload vers Supabase Storage…');
          photoUrl = await uploadToStorage(imgBuffer, storagePath, 'image/jpeg');
          ok(`Photo uploadée : ${storagePath}`);
          stats.images++;
        } catch (e) {
          warn(`Image échouée pour "${p.nom}": ${e.message}`);
          stats.erreurs++;
          // On continue sans photo plutôt que d'abandonner le produit
        }
        // Respecter le rate limit DALL-E 3
        await sleep(DELAY_BETWEEN_IMAGES);
      } else {
        log(`${prefix} ${p.nom} ${skipImages ? C.gray+'(sans image)'+C.reset : ''}`);
      }

      // ── Insérer dans produits_base
      try {
        const row = {
          categorie_id:          cat.id,
          nom:                   p.nom,
          slug:                  p.slug || slugify(p.nom),
          unite:                 p.unite || 'à la pièce',
          description:           p.description || null,
          prix_marche_indicatif: parseFloat(p.prix) || null,
          tva_pct:               parseFloat(p.tva_pct) || 5.5,
          badge_bio:             !!p.badge_bio,
          badge_local:           !!p.badge_local,
          badge_nouveau:         !!p.badge_nouveau,
          saisonnier:            !!p.saisonnier,
          provenance:            p.provenance || null,
          actif:                 true,
          photo_url:             photoUrl,
          photo_url_medium:      photoUrl,
          photo_url_full:        photoUrl,
        };

        await sbUpsert('produits_base', row, 'slug,categorie_id');
        ok(`Inséré : ${p.nom} — ${p.prix}€ ${p.unite}`);
        stats.produits++;

        // Marquer comme traité
        progress[progressProdKey] = { nom: p.nom, done: true };
        saveProgress(progress);

      } catch (e) {
        err(`DB error pour "${p.nom}": ${e.message}`);
        stats.erreurs++;
      }
    }

    log(`\n${C.green}✓ ${label} terminé${C.reset}`);
  }

  // ── Résumé final
  log(`\n${C.bold}${'═'.repeat(50)}${C.reset}`);
  log(`${C.bold}${C.green}  RÉSUMÉ FINAL${C.reset}`);
  log(`${'═'.repeat(50)}`);
  log(`  ${C.green}✓${C.reset} Produits insérés/mis à jour : ${C.bold}${stats.produits}${C.reset}`);
  log(`  ${C.blue}→${C.reset} Images générées              : ${C.bold}${stats.images}${C.reset}`);
  log(`  ${C.gray}⏭${C.reset}  Produits déjà existants      : ${C.bold}${stats.skip}${C.reset}`);
  if (stats.erreurs > 0)
    log(`  ${C.red}✗${C.reset} Erreurs                      : ${C.bold}${stats.erreurs}${C.reset}`);
  log(`${'═'.repeat(50)}\n`);

  if (stats.erreurs === 0) {
    ok('Catalogue généré avec succès ! 🎉');
    // Nettoyer la progression si tout est bon
    if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
  } else {
    warn('Certains produits ont eu des erreurs. Relancez la commande pour reprendre.');
    warn(`Fichier de progression conservé : ${PROGRESS_FILE}`);
  }
  log('');
}

main().catch(e => {
  console.error(`\n${C.red}ERREUR FATALE :${C.reset}`, e.message, '\n');
  process.exit(1);
});
