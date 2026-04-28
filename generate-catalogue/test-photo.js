#!/usr/bin/env node
// test-photo.js — Génère UNE seule photo test pour valider la qualité DALL-E 3
'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// Charger .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .replace(/^﻿/, '')
    .split('\n')
    .forEach(line => {
      const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    });
}

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://epvdzhzwfmtnioedyfgm.supabase.co';
const SUPA_KEY    = process.env.SUPABASE_SERVICE_KEY;

const C = {
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  blue: '\x1b[34m', bold: '\x1b[1m', reset: '\x1b[0m',
  gray: '\x1b[90m', cyan: '\x1b[36m',
};

if (!OPENAI_KEY) {
  console.error(`\n${C.red}ERREUR : OPENAI_API_KEY manquante dans .env${C.reset}\n`);
  process.exit(1);
}

// Produits de test — un par métier
// Style HYBRIDE : packshot e-commerce propre + food photography authentique
const COMMON_STYLE = `Photo de produit alimentaire premium pour e-commerce. Style hybride : packshot studio propre ET food photography authentique. Éclairage studio softbox doux avec une touche de chaleur naturelle, ombres portées douces et présentes mais pas dramatiques. Fond clair épuré — blanc cassé très légèrement crème — pas pur clinique, pas trop texturé. Produit entièrement net, fond très légèrement flou. Couleurs naturelles fidèles, légèrement vibrantes sans être saturées. Texture du produit nette et détaillée (pores, grain, peau, fibres visibles) sans imperfections marquées. Cadrage 3/4 légèrement plongeant 15-30°, produit occupant 60-75% du cadre. Composition lisible immédiatement. Style référence : sites e-commerce premium La Grande Épicerie de Paris, boucheries artisanales haut de gamme. Mi-chemin entre packshot pro et food magazine. Aucun texte, aucun logo, aucun emballage.`;

const TESTS = [
  {
    label:   'Primeur — Tomates cerises',
    metier:  'primeur',
    prompt:  `${COMMON_STYLE} SUJET : une douzaine de tomates cerises rouge mûr sur la branche verte avec quelques feuilles, disposition harmonieuse légèrement asymétrique sur fond blanc cassé crème. Tomates brillantes avec micro-reflets de lumière, peau lisse et ferme, tiges vertes encore attachées. Très légères variations de teinte entre les pièces (rouge plus clair / plus foncé) pour rendre l'aspect naturel. Une ou deux gouttes d'eau subtiles sur la peau (fraîcheur). Pas d'imperfections marquées.`,
  },
  {
    label:   'Boucherie — Entrecôte',
    metier:  'boucherie',
    prompt:  `${COMMON_STYLE} SUJET : une entrecôte de bœuf persillée d'environ 350g posée à plat sur fond blanc cassé crème (ou très légère planche en bois clair à peine visible). Vue 3/4 légèrement plongeante. Marbrure (gras intramusculaire) blanc-crème nettement visible dans la chair rouge profond fraîche non oxydée. Bord de gras crème naturel propre sur le côté. Texture de la viande nette : fibres musculaires détaillées. La pièce doit donner envie : couleur rouge appétissante, marbrure régulière, présentation soignée. Aucun élément distrayant.`,
  },
  {
    label:   'Poissonnerie — Saumon',
    metier:  'poissonnerie',
    prompt:  `${COMMON_STYLE} SUJET : un pavé de saumon frais atlantique d'environ 200g posé sur fond blanc cassé légèrement froid avec subtiles paillettes de glace pilée propre autour (juste quelques cristaux). Vue 3/4 légèrement plongeante. Chair rose-orangé naturelle avec stries blanches du gras nettement visibles (motifs caractéristiques), peau argentée brillante propre avec écailles visibles sur un côté. Aspect frais et brillant, légères micro-gouttes d'eau pour la fraîcheur. Pas de glace excessive qui distrait. Présentation premium, lisible.`,
  },
  {
    label:   'Fromagerie — Camembert',
    metier:  'fromagerie',
    prompt:  `${COMMON_STYLE} SUJET : un camembert de Normandie entier au lait cru, croûte blanche fleurie veloutée avec très légères marbrures dorées subtiles de l'affinage. Posé directement sur fond blanc cassé crème, ou sur papier sulfurisé blanc à peine visible. Vue 3/4 légèrement plongeante. Texture de la croûte nette et détaillée (fibres du penicillium visibles) mais propre, sans coulures, sans taches sombres. Couleur ivoire chaud appétissante. Présentation premium type fromagerie d'épicerie fine.`,
  },
  {
    label:   'Boulangerie — Croissant',
    metier:  'boulangerie',
    prompt:  `${COMMON_STYLE} SUJET : un croissant au beurre artisanal doré-cuivré, feuilletage très visible avec couches multiples bien marquées, posé légèrement de biais sur fond blanc cassé crème. Vue 3/4 rapprochée. Surface brillante mais pas vernie (vrai beurre). Couleur dorée riche et profonde, légèrement inégale aux extrémités (caractéristique d'une vraie cuisson). Texture du feuilletage nette, presque tactile. Quelques très petites miettes dorées subtilement présentes pour l'authenticité. Pas de désordre, présentation premium type boulangerie haut de gamme.`,
  },
];

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
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

function generateImage(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model:   'dall-e-3',
      prompt,
      n: 1,
      size:    '1024x1024',
      quality: 'standard',
      style:   'natural',
      response_format: 'url',
    });
    const req = https.request({
      hostname: 'api.openai.com',
      path:     '/v1/images/generations',
      method:   'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        const json = JSON.parse(data);
        if (res.statusCode === 200) resolve(json.data[0].url);
        else reject(new Error(`DALL-E ${res.statusCode}: ${JSON.stringify(json.error || json)}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function uploadToStorage(buffer, filePath) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'epvdzhzwfmtnioedyfgm.supabase.co',
      path:     `/storage/v1/object/produits-media/${filePath}`,
      method:   'POST',
      headers: {
        'apikey':         SUPA_KEY,
        'Authorization':  `Bearer ${SUPA_KEY}`,
        'Content-Type':   'image/jpeg',
        'Content-Length': buffer.length,
        'x-upsert':       'true',
      },
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(`${SUPABASE_URL}/storage/v1/object/public/produits-media/${filePath}`);
        } else {
          reject(new Error(`Storage ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

async function main() {
  console.log(`\n${C.bold}================================================${C.reset}`);
  console.log(`${C.bold}   Marcheo -- Test qualite photo DALL-E 3${C.reset}`);
  console.log(`${C.bold}================================================${C.reset}\n`);

  // Choisir le produit test selon l'argument CLI ou afficher le menu
  const arg = process.argv[2];
  let prodTest;

  if (arg && !isNaN(parseInt(arg))) {
    const idx = parseInt(arg) - 1;
    prodTest = TESTS[idx] || TESTS[0];
  } else {
    // Afficher le menu
    console.log(`  Choisissez un produit test :\n`);
    TESTS.forEach((t, i) =>
      console.log(`   ${i+1}  ${t.label}`)
    );
    console.log(`\n  Usage : node test-photo.js [1-5]`);
    console.log(`  Exemple : node test-photo.js 1  (tomates primeur)\n`);
    // Par defaut : tomates
    prodTest = TESTS[0];
    console.log(`  ${C.gray}Aucun choix : test par defaut = ${prodTest.label}${C.reset}\n`);
  }

  console.log(`  ${C.cyan}Produit test :${C.reset} ${C.bold}${prodTest.label}${C.reset}`);
  console.log(`  ${C.gray}Cout : ~0.04 USD (1 image DALL-E 3 standard)${C.reset}\n`);

  // Generer l'image
  console.log(`  ${C.blue}→${C.reset} Envoi a DALL-E 3...`);
  let imageUrl;
  try {
    imageUrl = await generateImage(prodTest.prompt);
    console.log(`  ${C.green}✓${C.reset} Image generee !`);
  } catch (e) {
    console.log(`  ${C.red}✗ Erreur DALL-E 3 :${C.reset} ${e.message}\n`);
    process.exit(1);
  }

  // Telecharger
  console.log(`  ${C.blue}→${C.reset} Telechargement...`);
  const buffer = await downloadBuffer(imageUrl);
  console.log(`  ${C.green}✓${C.reset} Image telechargee (${(buffer.length / 1024).toFixed(0)} Ko)`);

  // Sauvegarder en local
  const localFile = path.join(__dirname, `test-photo-${prodTest.metier}.jpg`);
  fs.writeFileSync(localFile, buffer);
  console.log(`  ${C.green}✓${C.reset} Sauvegardee localement : ${C.bold}${localFile}${C.reset}`);

  // Uploader sur Supabase Storage
  if (SUPA_KEY) {
    console.log(`  ${C.blue}→${C.reset} Upload Supabase Storage...`);
    try {
      const publicUrl = await uploadToStorage(buffer, `test/test-${prodTest.metier}.jpg`);
      console.log(`  ${C.green}✓${C.reset} Disponible en ligne :`);
      console.log(`    ${C.cyan}${publicUrl}${C.reset}`);
    } catch (e) {
      console.log(`  ${C.yellow}⚠ Upload echoue (${e.message}) — fichier local OK${C.reset}`);
    }
  }

  console.log(`\n${C.bold}================================================${C.reset}`);
  console.log(`  ${C.green}Photo test generee avec succes !${C.reset}`);
  console.log(`\n  ${C.yellow}Ouvrez ce fichier pour valider la qualite :${C.reset}`);
  console.log(`  ${C.bold}${localFile}${C.reset}`);
  console.log(`\n  Si la qualite est bonne -> lancez DEMARRER.bat`);
  console.log(`  et choisissez l'option pour generer tous les catalogues.`);
  console.log(`${C.bold}================================================${C.reset}\n`);
}

main().catch(e => {
  console.error(`\n${C.red}Erreur :${C.reset}`, e.message, '\n');
  process.exit(1);
});
