// ============================================================
// Edge Function: compress-image — DÉSACTIVÉE (2026-09-01)
//
// Déclenchée par le trigger "trigger-compress-image" sur storage.objects,
// donc à CHAQUE upload, tous buckets confondus. Deux défauts :
//
// 1. Elle lisait le bucket 'photos-produits', abandonné en mai 2026 au profit
//    de 'boutiques-media' (commit 8c38b96). Elle échouait donc systématiquement,
//    en ajoutant jusqu'à 5 s de latence à chaque envoi de fichier.
// 2. En cas de succès, elle mettait à jour produits_base — le catalogue GLOBAL
//    partagé par toutes les boutiques — en identifiant le produit par le NOM DU
//    FICHIER uploadé. Un commerçant envoyant 'tomate.jpg' aurait remplacé la photo
//    du produit global 'tomate' pour tous les autres commerçants.
//
// La compression est de toute façon faite côté navigateur avant l'upload
// (compresserImage() dans app-commercant.html : 800 px, qualité 0.82).
// Cette fonction est donc redondante en plus d'être dangereuse.
//
// Neutralisée plutôt que supprimée, et le trigger est laissé en place pour
// garder une trace explicite. Pour supprimer définitivement :
//   drop trigger "trigger-compress-image" on storage.objects;
// puis supprimer la fonction dans le dashboard.
// ============================================================

Deno.serve(async (req) => {
  try {
    const payload = await req.json().catch(() => ({}))
    const chemin = payload?.record?.name || payload?.record?.object_name || '?'
    console.log('[compress-image] desactivee — upload ignore :', chemin)
  } catch (_) {
    console.log('[compress-image] desactivee — payload illisible')
  }

  // 200 volontaire : le trigger ne doit pas faire echouer l'upload.
  return new Response(
    JSON.stringify({ skip: true, raison: 'fonction desactivee le 2026-09-01' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
