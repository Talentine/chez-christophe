# Core — scripts partagés (multi-tenant)

Scripts chargés par les pages HTML via `<script src>` (pas de bundler, pas de modules ES).
Tout est exposé sur `window` pour rester accessible entre les `<script>` inline des pages.

## Fichiers actifs

| Fichier | Rôle | Chargé par |
|---|---|---|
| `init.js` | Résout le slug, charge le commerce, applique thème + fontes, expose `window.CC`, `window.toAsciiUrl`, `retourAccueilBoutique`. Désactive `console.log/warn` en prod. | boutique, panier, compte, catalogue, app-commercant, notre-histoire |
| `analytics.js` | Tracking d'événements (insert `analytics_events`) | boutique, panier, compte, catalogue, landing, inscription, notre-histoire |
| `vitrine-mode.js` | Mode vitrine (aperçu sans commander) | panier, compte, catalogue, notre-histoire |
| `business-defaults.js` | Valeurs par défaut par métier au moment de l'inscription | inscription |
| `svg-icons.js` | Jeu d'icônes SVG injectées | app-commercant |

## Notes

- `init.js` contient la table des 10 métiers (`TYPES`) en dur — il est **autonome**, n'importe rien.
- L'URL Supabase et la clé anon (publique) sont définies dans `init.js`. Les pages qui ne chargent
  pas `init.js` redéclarent leur propre `SUPABASE_URL` / `SUPABASE_KEY` localement.
- Helper Stripe : `window.toAsciiUrl(url)` convertit `marchéo.fr` → `xn--marcho-fva.fr` (punycode)
  avant tout passage à une Edge Function Stripe (l'API Stripe rejette le non-ASCII).

## Ajouter un nouveau client

1. Créer la boutique en base (`commercants`) avec son `slug` et son `business_type`.
2. Le commerçant se connecte à `app-commercant.html`, ajoute produits / créneaux / galerie.
3. Le site est servi sur `/{slug}` (rewrites Vercel). Aucune modification de code requise.

## Ajouter un nouveau métier

Ajouter une entrée dans la table `TYPES` de `init.js` (palette, fontes, features, labels).
