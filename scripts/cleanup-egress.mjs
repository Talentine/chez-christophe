// Nettoyage egress Supabase — bucket "boutiques-media"
// 1) Supprime les objets jetables (boutiques de test + orphelins sans commerçant)
// 2) Recompresse les 32 images de rayons par défaut en webp (overwrite en place)
//
// La clé service_role ne quitte JAMAIS ta machine : passe-la en argument ou env.
//
//   npm i @supabase/supabase-js sharp
//   node scripts/cleanup-egress.mjs <SERVICE_ROLE_KEY>
//   # ou : SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/cleanup-egress.mjs
//
// Ajoute --dry-run pour simuler sans rien modifier.

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const SUPABASE_URL = 'https://epvdzhzwfmtnioedyfgm.supabase.co';
const SERVICE_KEY = process.argv.find(a => a.startsWith('eyJ')) || process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes('--dry-run');
const BUCKET = 'boutiques-media';

if (!SERVICE_KEY) {
  console.error('❌ Clé service_role manquante. Usage : node scripts/cleanup-egress.mjs <SERVICE_ROLE_KEY> [--dry-run]');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Dossiers jetables confirmés par l'audit (slugs charabia de test + orphelins sans commerçant).
// Aucun n'est une vraie boutique (chez-christophe, le-petrin, etc. exclus).
const DOSSIERS_JETABLES = [
  'hoteljhfgf', 'paul-merieultgfg', 'hjgg', 'kukyiuy', 'paul-merieultjj', 'hoteljjjjkljkh',
  'le-bistrot-19', 'rjfj', 'mb-primeur-2', 'paul', 'paul-merieult', 'lldldld',
  'fleur-d-iris', 'test', 'test-payment', 'testtttttttttt', 'floralie',
  'fhtyjuykhrg', 'hfghf', 'hjh',
];

async function listerRecursif(prefix) {
  const out = [];
  const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) { console.warn('  list KO', prefix, error.message); return out; }
  for (const item of data || []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) out.push(...await listerRecursif(path)); // sous-dossier
    else out.push(path);
  }
  return out;
}

async function supprimerJetables() {
  console.log('\n=== 1. Suppression des objets jetables ===');
  let total = 0;
  for (const dossier of DOSSIERS_JETABLES) {
    const paths = await listerRecursif(dossier);
    if (!paths.length) { console.log(`  (vide) ${dossier}`); continue; }
    console.log(`  ${dossier} → ${paths.length} objet(s)`);
    total += paths.length;
    if (!DRY) {
      const { error } = await sb.storage.from(BUCKET).remove(paths);
      if (error) console.warn('    remove KO', error.message);
    }
  }
  console.log(`  ${DRY ? '[dry-run] ' : ''}${total} objet(s) ${DRY ? 'à supprimer' : 'supprimés'}`);
}

async function recompresserRayons() {
  console.log('\n=== 2. Recompression des images de rayons (webp, en place) ===');
  const paths = (await listerRecursif('rayons')).filter(p => /\.(png|jpe?g)$/i.test(p));
  let avant = 0, apres = 0;
  for (const path of paths) {
    const { data, error } = await sb.storage.from(BUCKET).download(path);
    if (error) { console.warn('  dl KO', path, error.message); continue; }
    const buf = Buffer.from(await data.arrayBuffer());
    const webp = await sharp(buf)
      .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    avant += buf.length; apres += webp.length;
    console.log(`  ${path}  ${(buf.length/1024).toFixed(0)}Ko → ${(webp.length/1024).toFixed(0)}Ko`);
    if (!DRY) {
      // overwrite la MÊME clé : URL et categories.image_url inchangées, juste plus léger
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, webp, {
        upsert: true, contentType: 'image/webp',
      });
      if (upErr) console.warn('    upload KO', upErr.message);
    }
  }
  console.log(`  ${DRY ? '[dry-run] ' : ''}${paths.length} image(s) — ${(avant/1048576).toFixed(1)}Mo → ${(apres/1048576).toFixed(1)}Mo`);
}

(async () => {
  console.log(DRY ? '🧪 DRY-RUN (aucune modification)' : '🔥 EXÉCUTION RÉELLE');
  await supprimerJetables();
  await recompresserRayons();
  console.log('\n✅ Terminé.');
})().catch(e => { console.error(e); process.exit(1); });
