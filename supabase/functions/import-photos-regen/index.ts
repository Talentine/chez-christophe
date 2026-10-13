// ============================================================
// Edge Function: import-photos-regen
//
// Importe les photos catalogue régénérées (Higgsfield) dans Supabase Storage.
// Traite la file public.photo_regen (statut 'a_importer'), remplie en SQL par
// la service_role uniquement (RLS sans policy). L'appel n'accepte aucun
// paramètre de contenu : il ne fait qu'avancer la file, d'où verify_jwt=false.
//
// Pour chaque ligne :
//   1. télécharge l'image source (CDN Higgsfield uniquement)
//   2. redimensionne en 1200 px, encode en JPEG q85
//   3. upload dans produits-media/catalogue-v2/<metier>/<slug>.jpg
//   4. sauvegarde les anciennes URL puis met à jour produits_base
//
// Rollback : update produits_base set photo_url = r.old_photo_url ... depuis photo_regen.
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts'

const HOTE_AUTORISE = 'd8j0ntlcm91z4.cloudfront.net'
const BUCKET = 'produits-media'
const TAILLE = 1200

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

async function traiter(r: Record<string, any>) {
  const src = new URL(r.source_url)
  if (src.hostname !== HOTE_AUTORISE) throw new Error('hote source non autorise')

  const res = await fetch(src)
  if (!res.ok) throw new Error(`telechargement ${res.status}`)
  const brut = new Uint8Array(await res.arrayBuffer())

  const img = await Image.decode(brut)
  if (img.width > TAILLE) img.resize(TAILLE, Image.RESIZE_AUTO)
  const jpeg = await img.encodeJPEG(85)

  const chemin = `catalogue-v2/${r.metier}/${r.slug}.jpg`
  const { error: errUp } = await sb.storage.from(BUCKET).upload(chemin, jpeg, {
    contentType: 'image/jpeg',
    upsert: true,
    cacheControl: '31536000',
  })
  if (errUp) throw new Error(`upload: ${errUp.message}`)

  // Cache-busting : le chemin est stable, la version change à chaque import.
  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(chemin)
  const url = `${pub.publicUrl}?v=${r.id}`

  const { data: pb, error: errPb } = await sb.from('produits_base')
    .select('photo_url,photo_url_medium,photo_url_full').eq('id', r.produit_id).single()
  if (errPb) throw new Error(`lecture produit: ${errPb.message}`)

  // Ne pas écraser la sauvegarde si la ligne est réimportée.
  const sauvegarde = r.old_photo_url ? {} : {
    old_photo_url: pb.photo_url,
    old_photo_url_medium: pb.photo_url_medium,
    old_photo_url_full: pb.photo_url_full,
  }
  const { error: errSave } = await sb.from('photo_regen').update(sauvegarde).eq('id', r.id)
  if (errSave) throw new Error(`sauvegarde: ${errSave.message}`)

  const { error: errMaj } = await sb.from('produits_base')
    .update({ photo_url: url, photo_url_medium: url, photo_url_full: url })
    .eq('id', r.produit_id)
  if (errMaj) throw new Error(`maj produit: ${errMaj.message}`)

  return { url, octets: jpeg.length }
}

Deno.serve(async (req) => {
  const { limite = 3 } = await req.json().catch(() => ({}))
  const n = Math.min(Math.max(Number(limite) || 3, 1), 10)

  const { data: file, error } = await sb.from('photo_regen')
    .select('*').eq('statut', 'a_importer').order('id').limit(n)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  const resultats = []
  for (const r of file ?? []) {
    try {
      const { url, octets } = await traiter(r)
      await sb.from('photo_regen')
        .update({ statut: 'importe', new_url: url, erreur: null, imported_at: new Date().toISOString() })
        .eq('id', r.id)
      resultats.push({ id: r.id, ok: true, octets })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await sb.from('photo_regen').update({ statut: 'erreur', erreur: msg }).eq('id', r.id)
      resultats.push({ id: r.id, ok: false, erreur: msg })
    }
  }

  return new Response(JSON.stringify({ traites: resultats.length, resultats }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
