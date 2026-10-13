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
//   2. redimensionne en 800 px, encode en JPEG q80 (~60-100 Ko, comme compresserImage() côté app)
//   3. upload dans produits-media/catalogue-v2/<metier>/<slug>.jpg
//   4. sauvegarde les anciennes URL puis met à jour produits_base
//
// Rollback : update produits_base set photo_url = r.old_photo_url ... depuis photo_regen.
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts'

const HOTE_AUTORISE = 'd8j0ntlcm91z4.cloudfront.net'
const BUCKET = 'produits-media'
const TAILLE = 800
const QUALITE = 80

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// Fond crème commun à tout le catalogue (choix client du 13/10/2026).
const FOND = Image.rgbaToColor(0xF2, 0xED, 0xE3, 0xFF)

// Recompose un détourage (PNG transparent) sur le fond crème : le produit est
// recadré sur sa zone opaque puis centré dans un cadre de 72 % x 60 %, pour
// rester entier dans les cartes du site (bandeau ~1,4:1 en object-fit cover).
// Une ombre portée douce est dessinée sous le produit.
function composerSurFond(src: Image): Image {
  // Réduire d'abord : le parcours pixel par pixel doit tenir dans la limite CPU.
  if (src.width > TAILLE * 1.25) src.resize(Math.round(TAILLE * 1.25), Image.RESIZE_AUTO)
  let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1
  for (let y = 1; y <= src.height; y++) {
    for (let x = 1; x <= src.width; x++) {
      if ((src.getPixelAt(x, y) & 0xFF) > 16) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) throw new Error('detourage vide')
  const sujet = src.crop(x0 - 1, y0 - 1, x1 - x0 + 1, y1 - y0 + 1)

  const echelle = Math.min((TAILLE * 0.72) / sujet.width, (TAILLE * 0.60) / sujet.height)
  sujet.resize(Math.round(sujet.width * echelle), Math.round(sujet.height * echelle))

  const fond = new Image(TAILLE, TAILLE).fill(FOND)
  const px = Math.round((TAILLE - sujet.width) / 2)
  const py = Math.round((TAILLE - sujet.height) / 2)

  // Ombre : ellipse floue sous la base du produit.
  const cx = TAILLE / 2, cy = py + sujet.height - 4
  const rx = sujet.width * 0.48, ry = Math.max(10, sujet.height * 0.07)
  for (let y = Math.floor(cy - ry * 2); y <= Math.ceil(cy + ry * 2); y++) {
    for (let x = Math.floor(cx - rx * 1.3); x <= Math.ceil(cx + rx * 1.3); x++) {
      if (x < 1 || y < 1 || x > TAILLE || y > TAILLE) continue
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
      const a = 0.22 * Math.exp(-d * 1.6)
      if (a < 0.005) continue
      const [r, g, b] = Image.colorToRGBA(fond.getPixelAt(x, y))
      fond.setPixelAt(x, y, Image.rgbaToColor(
        Math.round(r * (1 - a) + 70 * a), Math.round(g * (1 - a) + 55 * a), Math.round(b * (1 - a) + 40 * a), 0xFF))
    }
  }

  return fond.composite(sujet, px, py)
}

async function traiter(r: Record<string, any>) {
  const src = new URL(r.source_url)
  if (src.hostname !== HOTE_AUTORISE) throw new Error('hote source non autorise')

  const res = await fetch(src)
  if (!res.ok) throw new Error(`telechargement ${res.status}`)
  const brut = new Uint8Array(await res.arrayBuffer())

  let img = await Image.decode(brut) as Image
  if (r.detoure) img = composerSurFond(img)
  else if (img.width > TAILLE) img.resize(TAILLE, Image.RESIZE_AUTO)
  const jpeg = await img.encodeJPEG(QUALITE)

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

  // La sauvegarde garde toujours la photo d'ORIGINE : si le produit a déjà été
  // régénéré, on recopie la sauvegarde de la première régénération.
  if (!r.old_photo_url) {
    const { data: premier } = await sb.from('photo_regen')
      .select('old_photo_url,old_photo_url_medium,old_photo_url_full')
      .eq('produit_id', r.produit_id).not('old_photo_url', 'is', null)
      .order('id').limit(1).maybeSingle()
    const sauvegarde = premier ?? {
      old_photo_url: pb.photo_url,
      old_photo_url_medium: pb.photo_url_medium,
      old_photo_url_full: pb.photo_url_full,
    }
    const { error: errSave } = await sb.from('photo_regen').update(sauvegarde).eq('id', r.id)
    if (errSave) throw new Error(`sauvegarde: ${errSave.message}`)
  }

  const { error: errMaj } = await sb.from('produits_base')
    .update({ photo_url: url, photo_url_medium: url, photo_url_full: url })
    .eq('id', r.produit_id)
  if (errMaj) throw new Error(`maj produit: ${errMaj.message}`)

  return { url, octets: jpeg.length }
}

Deno.serve(async (req) => {
  const { limite = 1 } = await req.json().catch(() => ({}))
  const n = Math.min(Math.max(Number(limite) || 1, 1), 3)

  // Le cron lance plusieurs appels en parallèle (1 image chacun, limite CPU) :
  // claim_photo_regen réserve les lignes avec SKIP LOCKED.
  const { data: file, error } = await sb.rpc('claim_photo_regen', { n })
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
