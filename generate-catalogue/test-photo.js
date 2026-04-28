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
const TESTS = [
  {
    label:   'Primeur — Tomates cerises',
    metier:  'primeur',
    prompt:  'Photo packshot ultra-réaliste pour e-commerce alimentaire français premium. Tomates cerises rouges brillantes, environ 15 pièces disposées en petit tas naturel harmonieux. Fond blanc pur, ombre portée douce et réaliste. Éclairage studio diffus, couleurs vives et naturelles, netteté maximale sur chaque tomate. Pas de texte, pas d\'emballage. Style minimaliste packshot marché haut de gamme.',
  },
  {
    label:   'Boucherie — Entrecôte',
    metier:  'boucherie',
    prompt:  'Photo packshot ultra-réaliste pour e-commerce alimentaire français premium. Entrecôte de bœuf persillée, belle pièce d\'environ 350g, posée à plat légèrement de biais. Marbrure visible, couleur rouge franc, texture de la viande détaillée. Fond blanc pur ou gris très léger, ombre portée douce. Éclairage studio diffus, netteté maximale. Pas de texte, pas d\'emballage, aucun accessoire. Style packshot premium boucherie artisanale.',
  },
  {
    label:   'Poissonnerie — Saumon',
    metier:  'poissonnerie',
    prompt:  'Photo packshot ultra-réaliste pour e-commerce alimentaire français premium. Pavé de saumon frais atlantique, environ 200g, posé légèrement incliné côté chair vers le haut. Chair rose orangée, peau argentée avec écailles visibles. Fond blanc pur, ombre portée légère. Éclairage studio diffus froid, couleurs naturelles fidèles, netteté très élevée sur la texture de la chair. Aucun texte, aucun emballage. Style packshot poissonnerie haut de gamme.',
  },
  {
    label:   'Fromagerie — Camembert',
    metier:  'fromagerie',
    prompt:  'Photo packshot ultra-réaliste pour e-commerce alimentaire français premium. Camembert de Normandie entier, croûte blanche fleurie légèrement dorée, posé à plat centré. Texture veloutée de la croûte visible en détail. Fond blanc pur ou crème très léger, ombre portée douce. Éclairage studio diffus chaud, netteté maximale sur la croûte. Aucun emballage, aucun texte. Style packshot fromagerie artisanale premium.',
  },
  {
    label:   'Boulangerie — Croissant',
    metier:  'boulangerie',
    prompt:  'Photo packshot ultra-réaliste pour e-commerce alimentaire français premium. Croissant au beurre artisanal doré, feuilletage apparent, posé légèrement de côté pour montrer les couches. Couleur dorée profonde, surface brillante, texture feuilletée très détaillée. Fond blanc pur, ombre portée douce et légère. Éclairage studio diffus chaud, netteté maximale. Aucun texte, aucun emballage, aucun accessoire. Style packshot boulangerie française premium.',
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
