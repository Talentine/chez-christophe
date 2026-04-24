# Template multi-commerce — Guide

Ce projet est un template universel qui permet de lancer un site click & collect pour n'importe quel commerce alimentaire à partir d'**un seul code source**.

## Métiers supportés

| Type | Clé | Spécificités |
|---|---|---|
| Primeur | `primeur` | Saison, bio, provenance, local |
| Boucherie | `boucherie` | Découpe, cuisson, maturation, poids variable |
| Boulangerie | `boulangerie` | Commande programmée, DLC, farine |
| Poissonnerie | `poissonnerie` | Origine pêche, zone FAO, DLC courte |
| Traiteur | `traiteur` | Portions, allergènes, délai prépa |
| Fromagerie | `fromagerie` | Lait, affinage, AOP, région |

## Lancer un nouveau client en 3 minutes

### 1. Créer le commerce dans Supabase

```sql
INSERT INTO commercants (slug, nom, business_type, ville, adresse, telephone, actif)
VALUES ('paul-primeur', 'Paul Primeur', 'primeur', 'Deauville', '2 rue de la Mer', '02 31 00 00 00', true);
```

### 2. Le commerçant se connecte

URL : `/app` → s'inscrit, ajoute ses produits, ses créneaux, sa galerie.

### 3. Le site est en ligne

- En sous-domaine : `paul-primeur.tonapp.com`
- En sous-chemin : `tonapp.com/paul-primeur/`

**Aucun déploiement, aucune modification de code.**

## Personnalisation fine (optionnelle)

Dans Supabase, champ `commercants.business_config` (JSONB) :

```json
{
  "palette":  { "primary": "#2E5A3E" },
  "fonts":    { "display": "\"Fraunces\"" },
  "labels":   { "arrivage": "Frais du matin" },
  "features": { "programmation": true }
}
```

Ces champs surchargent uniquement ce qui est spécifié ; tout le reste hérite du handler métier.

## Architecture

Voir `assets/core/README.md`.

## Checklist déploiement

- [ ] Exécuter `MIGRATION.sql` dans Supabase
- [ ] Configurer `vercel.json` avec les rewrites `/:slug/*`
- [ ] DNS wildcard `*.tonapp.com` → Vercel (si sous-domaines)
- [ ] Tester un 2ᵉ commerce de métier différent
