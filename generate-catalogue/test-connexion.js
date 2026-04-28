#!/usr/bin/env node
// test-connexion.js — Vérifie que toutes les connexions fonctionnent avant de lancer
'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// Charger .env
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

const OPENAI_KEY    = process.env.OPENAI_API_KEY;
const SUPA_URL      = process.env.SUPABASE_URL || 'https://epvdzhzwfmtnioedyfgm.supabase.co';
const SUPA_KEY      = process.env.SUPABASE_SERVICE_KEY;

const C = {
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  blue: '\x1b[34m', bold: '\x1b[1m', reset: '\x1b[0m', gray: '\x1b[90m',
};

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log(`\n${C.bold}╔══════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}║   Marchéo — Test de connexion            ║${C.reset}`);
  console.log(`${C.bold}╚══════════════════════════════════════════╝\n${C.reset}`);

  let allOk = true;

  // 1. Variables d'environnement
  console.log(`${C.bold}1. Variables d'environnement${C.reset}`);
  if (!OPENAI_KEY) {
    console.log(`   ${C.red}✗ OPENAI_API_KEY manquante${C.reset}`);
    allOk = false;
  } else {
    console.log(`   ${C.green}✓ OPENAI_API_KEY${C.reset} ${C.gray}(${OPENAI_KEY.slice(0,8)}...)${C.reset}`);
  }
  if (!SUPA_KEY) {
    console.log(`   ${C.red}✗ SUPABASE_SERVICE_KEY manquante${C.reset}`);
    allOk = false;
  } else {
    console.log(`   ${C.green}✓ SUPABASE_SERVICE_KEY${C.reset} ${C.gray}(${SUPA_KEY.slice(0,12)}...)${C.reset}`);
  }

  if (!allOk) {
    console.log(`\n   ${C.yellow}➜ Créez le fichier .env depuis .env.example${C.reset}`);
    console.log(`   ${C.yellow}  ou double-cliquez sur DEMARRER.bat${C.reset}\n`);
    process.exit(1);
  }

  // 2. Connexion Supabase
  console.log(`\n${C.bold}2. Connexion Supabase${C.reset}`);
  try {
    const r = await get(
      `${SUPA_URL}/rest/v1/categories?select=count&limit=1`,
      { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
    );
    if (r.status === 200) {
      console.log(`   ${C.green}✓ Supabase connecté${C.reset} ${C.gray}(${SUPA_URL})${C.reset}`);
    } else {
      console.log(`   ${C.red}✗ Supabase erreur ${r.status}${C.reset}: ${JSON.stringify(r.data)}`);
      allOk = false;
    }
  } catch (e) {
    console.log(`   ${C.red}✗ Supabase inaccessible${C.reset}: ${e.message}`);
    allOk = false;
  }

  // 3. Compter les catégories existantes
  if (allOk) {
    try {
      const r = await get(
        `${SUPA_URL}/rest/v1/categories?select=business_type`,
        { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
      );
      if (Array.isArray(r.data)) {
        const byType = r.data.reduce((acc, c) => {
          acc[c.business_type] = (acc[c.business_type] || 0) + 1;
          return acc;
        }, {});
        console.log(`   ${C.green}✓ Catégories en base${C.reset}:`);
        Object.entries(byType).forEach(([t, n]) =>
          console.log(`     ${C.gray}•${C.reset} ${t} : ${n} catégories`)
        );
      }
    } catch (e) {}
  }

  // 4. Vérifier le bucket produits-media
  console.log(`\n${C.bold}3. Bucket Storage "produits-media"${C.reset}`);
  try {
    const r = await get(
      `${SUPA_URL}/storage/v1/bucket/produits-media`,
      { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
    );
    if (r.status === 200) {
      console.log(`   ${C.green}✓ Bucket "produits-media" accessible${C.reset} (public: ${r.data.public})`);
    } else {
      console.log(`   ${C.yellow}⚠ Bucket non trouvé (${r.status}) — sera créé au premier run${C.reset}`);
    }
  } catch (e) {
    console.log(`   ${C.yellow}⚠ ${e.message}${C.reset}`);
  }

  // 5. Test OpenAI (sans générer d'image — simple appel modèles)
  console.log(`\n${C.bold}4. Connexion OpenAI${C.reset}`);
  try {
    const r = await get('https://api.openai.com/v1/models?limit=1', {
      Authorization: `Bearer ${OPENAI_KEY}`,
    });
    if (r.status === 200) {
      console.log(`   ${C.green}✓ OpenAI API connectée${C.reset}`);
    } else if (r.status === 401) {
      console.log(`   ${C.red}✗ Clé OpenAI invalide (401)${C.reset}`);
      allOk = false;
    } else {
      console.log(`   ${C.yellow}⚠ OpenAI statut ${r.status}${C.reset}`);
    }
  } catch (e) {
    console.log(`   ${C.red}✗ OpenAI inaccessible${C.reset}: ${e.message}`);
    allOk = false;
  }

  // 6. Estimer les coûts
  console.log(`\n${C.bold}5. Estimation des coûts OpenAI${C.reset}`);
  const estProduits = 220;  // ~44 produits × 5 métiers
  const coutGPT4o   = (estProduits / 1000) * 2.5;   // ~$2.5 / 1M tokens input (gpt-4o)
  const coutDALLE3  = estProduits * 0.04;             // $0.04/image standard 1024×1024
  const coutTotal   = (coutGPT4o + coutDALLE3).toFixed(2);
  console.log(`   ${C.gray}• ~${estProduits} produits estimés (5 métiers)${C.reset}`);
  console.log(`   ${C.gray}• GPT-4o (données) : ~${coutGPT4o.toFixed(2)} USD${C.reset}`);
  console.log(`   ${C.gray}• DALL-E 3 (images) : ~${coutDALLE3.toFixed(2)} USD${C.reset} ($0.04/image)`);
  console.log(`   ${C.yellow}• Coût total estimé : ~${coutTotal} USD${C.reset}`);
  console.log(`   ${C.gray}• Durée estimée : 45-60 min (rate limit 5 images/min)${C.reset}`);

  // Résumé
  console.log();
  if (allOk) {
    console.log(`${C.green}${C.bold}  ✓ Tout est prêt ! Lancez DEMARRER.bat pour commencer.${C.reset}`);
    console.log(`${C.gray}  Conseil : commencez par un seul métier (ex: option 2 = Primeur)${C.reset}`);
    console.log(`${C.gray}  pour vérifier la qualité avant de tout générer.\n${C.reset}`);
  } else {
    console.log(`${C.red}${C.bold}  ✗ Des problèmes doivent être résolus avant de continuer.${C.reset}\n`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error(`\n${C.red}Erreur :${C.reset}`, e.message, '\n');
  process.exit(1);
});
