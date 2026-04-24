# Core — Moteur multi-tenant

Architecture modulaire pour transformer le site en template universel (primeur, boucherie, boulangerie, poissonnerie, traiteur, fromagerie).

## Fichiers

| Fichier | Rôle |
|---|---|
| `config.js` | Résout le slug, charge le commerce, applique handler + thème |
| `api.js` | Accès Supabase (business, produits, créneaux, commandes, galerie) + cache |
| `business-types.js` | Handlers par métier : palette, fontes, features, labels, filtres |
| `theme.js` | Injecte variables CSS + Google Fonts + favicon + theme-color |
| `product-model.js` | Normalise les produits bruts en modèle universel + valide les payloads |
| `router.js` | Génère les liens internes adaptés au mode de routage |

## Usage minimal dans une page HTML

```html
<script type="module">
import { initBusiness } from './assets/core/config.js';
import { fetchProducts, fetchLatestProducts } from './assets/core/api.js';
import { normalize, extractDisplayFields } from './assets/core/product-model.js';

const cfg = await initBusiness();

// Labels dynamiques
document.querySelector('#titreArrivage').textContent = cfg.labels.arrivage;

// Produits
const raw = await fetchLatestProducts(cfg.business.id, 8);
const produits = raw.map(normalize);

produits.forEach(p => {
  const fields = extractDisplayFields(p, cfg.handler);
  // … rendu card avec p.nom, p.prix, p.badges, fields métier
});

// Features conditionnelles
if (cfg.features.programmation) showDatePicker();
if (!cfg.features.saison) hideSeasonBadges();
</script>
```

## Migration SQL (obligatoire avant activation)

Voir `../MIGRATION.sql` à la racine. Ajoute `business_type`, `business_config`, `logo_url`, `favicon_url` sur `commercants` et `custom_fields` sur `produits_base`.

## Ajouter un nouveau client

1. Exécuter dans Supabase :
```sql
INSERT INTO commercants (slug, nom, business_type, ville, actif)
VALUES ('paul-primeur', 'Paul Primeur', 'primeur', 'Deauville', true);
```
2. Le commerçant se connecte à `app-commercant.html`, ajoute ses produits, ses créneaux, sa galerie.
3. Le site est accessible sur `/paul-primeur/` (avec rewrites Vercel) ou `paul-primeur.domaine.com`.

**Aucune modification de code requise.**

## Ajouter un nouveau métier

1. Ajouter une entrée dans `BUSINESS_TYPES` (`business-types.js`).
2. Ajouter les mappings d'affichage dans `extractDisplayFields` (`product-model.js`).
3. Tester avec un commerce de démo de ce type.
