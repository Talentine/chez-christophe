# Photos catalogue v2 — pipeline Higgsfield

Remplace les photos DALL-E 3 de `generate.js` (rendu trop « IA », variétés approximatives).

## Fonctionnement
1. **Génération** (Higgsfield via MCP, modèle Nano Banana Pro, 2k, 1:1, 2 crédits/image) :
   un prompt par produit = description factuelle du produit exact (variété, découpe, affinage,
   espèce, unité de vente, négations ciblées) + bloc de style photo commun (voir ci-dessous).
2. **File d'import** : chaque image terminée est insérée dans `public.photo_regen`
   (`produit_id`, `job_id`, `source_url`). Table RLS sans policy → service_role uniquement.
3. **Import** : le cron `import-photos-regen` appelle chaque minute l'edge function
   `supabase/functions/import-photos-regen` qui télécharge l'image (CDN Higgsfield uniquement),
   la réduit à 800 px JPEG q80 (comme `compresserImage()` de l'app), l'envoie dans
   `produits-media/catalogue-v2/<metier>/<slug>.jpg`, sauvegarde les anciennes URL
   (`old_photo_url*`) puis met à jour `produits_base`.
   Les boutiques lisent la photo dans `produits_base` : elles héritent automatiquement de la nouvelle.
   Si `detoure = true` (source PNG détourée par Higgsfield), le produit est recadré, centré
   dans 72 % × 60 % du cadre et recomposé sur le fond crème `#F2EDE3` avec une ombre douce.
4. **Rollback** : voir la requête en bas de `PHOTO_REGEN.sql`.

## Brief de prompt (utilisé pour la passe du 13/10/2026)

### Écriture des prompts (le cœur du travail)
Le prompt est en anglais, structure fixe : [SUJET] + paragraphe [STYLE] commun.

#### SUJET — précision botanique / bouchère / fromagère
Lis `nom`, `unite`, `description`, `provenance` du produit. Décris ce qu'est EXACTEMENT ce produit et à quoi il ressemble en vrai :
- variété (couleur réelle de la peau/chair, forme, taille, texture : ex. pomme Chantecler = jaune-vert mat, légèrement roussie, joue rosée),
- découpe / partie (viande : cru, os, gras, grain, forme typique de la découpe française),
- affinage / croûte / pâte (fromage : couleur de pâte, type de croûte, forme du fromage entier ou portion),
- espèce (poisson : forme, couleur, signes distinctifs ; entier vs filet vs darne),
- produit fini (boulangerie : forme, croûte, grigne, mie si tranché).
Adapte la mise en scène à l'unité de vente : « le kg » / vrac → petit tas naturel de quelques pièces ; « à la pièce » → 1 exemplaire ; « les 6 » → 6 pièces ; « botte » → une botte liée ; « pot » → un bocal en verre sans étiquette, ouvert, contenu visible ; « tranches » → tranches légèrement déployées ; plateau → plateau garni réaliste.
Ajoute des NÉGATIONS ciblées sur les confusions probables (ex. "raw, not cooked", "not Emmental, no big holes", "not a baguette", "not red apples").
Produits transformés (confiture, miel, tapenade, plats cuisinés, sandwichs) : montrer le contenu appétissant, bocal/assiette neutre sans étiquette.

#### STYLE — copier tel quel en fin de prompt (adapter seulement la surface entre crochets)
"Set on [surface]. Shot with a full-frame camera and 100mm macro lens at f/8, camera at about 30 degrees above, three-quarter view. Large softbox from the left plus soft daylight fill, gentle natural contact shadows. Subject fills about 65% of the frame, centred. True-to-life colours, neutral white balance, crisp real texture, subtle natural imperfections. Looks like an actual photograph taken by a professional food photographer, not CGI, not illustration, no plastic sheen, no oversaturation, no text, no logo, no label, no packaging."

Surfaces par métier (cohérence du catalogue) :
- primeur : "a matte warm off-white linen-textured paper backdrop, seamless"
- boucherie : "a sheet of matte off-white butcher paper over a light stone surface"
- fromagerie : "a matte light-oak wooden cheese board on a warm off-white matte backdrop"
- poissonnerie : "a bed of fine crushed ice on a matte light-grey slate surface" (fumés/marinés/tarama : "a matte light-grey slate surface")
- boulangerie : "a matte light linen cloth on a warm off-white backdrop"

Commencer le prompt par : "Real commercial product photograph for a French <greengrocer's|artisan butcher's|cheese shop's|fishmonger's|artisan bakery's> online shop. Subject: ..."

#### Exemple validé (boucherie)
"Real commercial product photograph for a French artisan butcher's online shop. Subject: one raw French-trimmed rack of lamb (carré d'agneau), 8 ribs, uncooked: pale pink-red lean eye of meat, a thin even layer of creamy white fat cap on top, rib bones frenched and scraped clean (bare ivory bones protruding in a neat row), natural meat grain and slight moisture, lying on its side showing the bones curving upward. Raw meat only, not cooked, not roasted, no herbs, no garnish.

Set on a sheet of matte off-white butcher paper over a light stone surface. Shot with ... (STYLE)"

