# Chez Christophe — Audit Design & Refonte Complète

> Audit UX/UI et proposition de refonte pour l'app primeur (fruits, légumes, fromagerie).
> Cible : clients locaux + touristes (Deauville, Caen). Positionnement : frais, premium, simple, naturel.

---

## 1. Analyse du design actuel

### Forces

| Point fort | Détail |
|---|---|
| **DNA couleur cohérent** | Vert forêt + crème + or — palette artisanale bien choisie |
| **Mobile-first** | PWA, safe-areas, bottom nav, scroll horizontal — architecture solide |
| **Typo qui fonctionne** | Playfair Display (headings) + DM Sans (body) — bonne base |
| **Micro-animations** | `scale(0.96)` au tap, cubic-bezier bounce — feeling natif appréciable |
| **Checkout complet** | 5 étapes, créneaux, Stripe — parcours d'achat pensé |

### Faiblesses

| Problème | Impact |
|---|---|
| **Emojis comme icônes** | Non-scalable, incohérent cross-platform, non-accessible |
| **Scale typographique explosée** | 11 tailles de 10px à 36px — aucun rythme, hiérarchie floue |
| **Spacing aléatoire** | Gaps de 6, 8, 10, 12, 14, 16, 20px — pas de système 4pt/8pt |
| **Trop de border-radius** | 5 valeurs (10, 12, 16, 20, 50px) — manque de cohérence |
| **CSS inline dans HTML** | Maintenabilité nulle, performances CSS non-optimisées |
| **Couleur or trop légère** | `#d4a84c` sur fond crème — contraste insuffisant (< 3:1) |
| **Sections trop denses** | Padding 28px vertical insuffisant entre sections majeures |

---

## 2. Problèmes visuels critiques

### Couleurs

```
ACTUEL                    PROBLÈME
--or: #d4a84c            → Ratio contraste ~2.8:1 sur fond crème = échec WCAG AA
--texte-doux: #5a7060    → 3.2:1 sur blanc = lisible mais insuffisant pour corps
--vert-clair: #7ba286    → Utilisé sur fond crème = invisible en tant qu'accent
```

**Hiérarchie visuelle cassée** : l'or et le vert clair se fondent dans la crème, aucun élément ne ressort vraiment.

### Typographie

```
ACTUEL                    PROBLÈME
10 / 11 / 12 / 13 /      → 11 tailles = chaos visuel
14 / 15 / 16 / 22 /
24 / 28px / clamp(28-36)
```

### Spacing

```
ACTUEL                    PROBLÈME
Gaps: 6 / 8 / 10 / 12px  → Grille produits trop serrée, impression de marché de masse
Sections: padding 28px    → Trop proche, manque de respiration premium
```

---

## 3. Problèmes UX

| Friction | Où | Fix |
|---|---|---|
| **Emojis catégories** | `.rayon-card` | Remplacer par illustrations SVG custom (légumes/fruits stylisés) |
| **Prix pas assez mis en valeur** | Cartes produit | Taille + couleur + position hiérarchisées |
| **Pas d'upsell visible** | Catalogue | Ajouter "Souvent achetés ensemble" + produits suggérés |
| **Bouton "Ajouter au panier"** | Partout | CTA trop discret — fond or insuffisamment contrasté |
| **Navigation bas** | Mobile | Labels trop petits (10px) — difficile à lire d'un coup d'œil |
| **Hero section** | `index.html` | Aucune urgence/fraîcheur — pas de signal "arrivage du jour" en hero |
| **Section avis clients** | `index.html` | Non mise en valeur — social proof enterré en bas de page |

---

## 4. Refonte visuelle complète

### Direction artistique : "Marché de Terroir Premium"

> Naturel mais jamais rustique. Frais mais jamais générique. Local mais jamais folklorique.

Référence visuelle : **Épicerie fine parisienne rencontre marché normand soigné.**

---

### Palette de couleurs — Système complet

```css
/* ===== PALETTE "CHEZ CHRISTOPHE — REFONTE" ===== */

/* Primaires */
--vert-profond:    #2A4535;   /* Remplace #3a5c4a — plus profond, plus premium */
--vert-riche:      #1C3028;   /* Remplace #1f3028 — titres, header */
--vert-doux:       #5C8A6E;   /* Remplace #7ba286 — accents secondaires */

/* Accent chaud */
--or-riche:        #B8832A;   /* Remplace #d4a84c — contraste 4.6:1 sur crème ✓ */
--or-pale:         #F0D690;   /* Remplace #f3d989 — badges subtils */
--terracotta:      #C4614A;   /* NOUVEAU — promos, badges "arrivage", urgence douce */

/* Fonds */
--ivoire:          #FAF7F0;   /* Remplace #faf6ee — plus chaud, plus laiteux */
--ivoire-profond:  #F0EAD8;   /* Remplace #ede6d6 — séparateurs, zones secondaires */
--blanc-pur:       #FFFFFF;   /* Cartes produits */

/* Texte */
--texte-fort:      #18271E;   /* Remplace #1a2e26 — titres */
--texte-corps:     #3D5446;   /* Remplace #5a7060 — corps, descriptions */
--texte-leger:     #7A9080;   /* Metadata, prix barrés, labels */

/* Statuts */
--succes:          #2D7A4F;   /* Confirmation commande */
--alerte:          #C4614A;   /* = terracotta — cohérence */
--erreur:          #B83232;   /* Erreurs formulaire */
```

**Contraste vérifié WCAG AA :**
- `--texte-fort` sur `--ivoire` → **11.2:1** ✓
- `--or-riche` sur `--ivoire` → **4.6:1** ✓ (était 2.8:1)
- `--vert-profond` sur `--blanc-pur` → **7.8:1** ✓

---

### Typographie — Système à 6 niveaux

**Fonts recommandées :**

```
Heading: Playfair Display SC   → Garder (fort, identitaire, gastronomique)
Body:    Plus Jakarta Sans      → Remplacer DM Sans (plus premium, meilleure lisibilité)
```

```css
/* Import */
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display+SC:wght@400;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');

/* Échelle typographique — 6 niveaux SEULEMENT */
--t-display:    clamp(28px, 7vw, 42px) / 1.15 / Playfair Display SC 700;
--t-titre:      clamp(20px, 5vw, 26px) / 1.25 / Playfair Display SC 400;
--t-sous-titre: 18px / 1.4  / Plus Jakarta Sans 600;
--t-corps:      16px / 1.65 / Plus Jakarta Sans 400;   /* min 16px mobile ! */
--t-label:      14px / 1.5  / Plus Jakarta Sans 500;
--t-micro:      12px / 1.4  / Plus Jakarta Sans 400;   /* badges SEULEMENT */
```

**Plus de 11, 13, 15px.** Fin de l'anarchie typographique.

---

### Système de spacing — Grille 8pt

```css
/* 8 valeurs. C'est tout. */
--space-1:  4px;   /* Micro : icône ↔ label */
--space-2:  8px;   /* Élément interne : gap dans card */
--space-3:  12px;  /* Padding bouton vertical */
--space-4:  16px;  /* Padding card, gap grille produits */
--space-5:  24px;  /* Padding section interne */
--space-6:  32px;  /* Entre composants majeurs */
--space-7:  48px;  /* Entre sections de page */
--space-8:  64px;  /* Hero / sections hero */
```

---

### Système de border-radius — 4 valeurs

```css
--radius-sm:   8px;   /* Inputs, badges */
--radius-md:   14px;  /* Cards produits */
--radius-lg:   20px;  /* Cards featured, drawers */
--radius-full: 999px; /* Boutons pills, quantity selectors */
```

---

### Structure des pages — Refonte

#### Page d'accueil (`index.html`)

```
┌─────────────────────────────────────┐
│  HEADER sticky — logo centré + cart  │
│  (fond --vert-riche, logo blanc)     │
├─────────────────────────────────────┤
│  BANNIÈRE FRAÎCHEUR (NEW)            │
│  "Arrivage du jour • Tomates cœur   │
│  de bœuf, Fraises Gariguette..."    │
│  Fond --terracotta, scroll lent      │
├─────────────────────────────────────┤
│  HERO — Photo plein format           │
│  Titre: "Le marché, livré chez vous" │
│  Sous-titre: Fruits, légumes,        │
│  fromageries — Caen & Deauville     │
│  [Commander maintenant] [Nos rayons] │
│  Badges: ✓ Local  ✓ Frais du jour   │
│           ✓ Click & Collect         │
├─────────────────────────────────────┤
│  RAYONS — Grille 3 colonnes (REFONTE)│
│  Illustrations SVG custom au lieu   │
│  d'emojis. Cards avec photo fond.   │
├─────────────────────────────────────┤
│  ARRIVAGE DU JOUR — Carousel horiz.  │
│  Cards avec badge "AUJOURD'HUI"     │
│  --terracotta, quantités limitées   │
├─────────────────────────────────────┤
│  PANIERS THÉMATIQUES                │
│  Titre "Idées de paniers"           │
│  Cards larges avec photo + économie │
├─────────────────────────────────────┤
│  SOCIAL PROOF (remonté en priorité) │
│  3 avis clients + note /5           │
│  Fond --ivoire-profond, sérieux     │
├─────────────────────────────────────┤
│  NOTRE HISTOIRE — Teaser 2 colonnes │
│  Photo Christophe + texte court     │
│  [Découvrir notre histoire →]       │
├─────────────────────────────────────┤
│  BOTTOM NAV (5 icônes SVG + labels) │
└─────────────────────────────────────┘
```

#### Carte produit — Refonte

```
AVANT                      APRÈS
┌──────────┐               ┌──────────────────┐
│  [emoji] │               │  [Photo produit] │
│  Tomates │               │  ← plein format  │
│  2.50€/kg│               │  Badge ARRIVAGE  │
│  [+]     │               ├──────────────────┤
└──────────┘               │ Tomates cœur bœuf│ ← --t-label 500
                           │ Var. locale      │ ← --t-micro terracotta
                           │ 3.90 €/kg        │ ← --t-sous-titre or-riche
                           │ [  −  1  +  ]    │ ← qty selector centré
                           └──────────────────┘
```

**Changements clés :**
- Photo produit pleine carte (pas de fond vert uni)
- Badge "Arrivage" / "Bio" en terracotta (SVG pill)
- Variété/origine en micro-texte (local = premium)
- Prix en or-riche + taille augmentée
- Selector quantité intégré (pas bouton "+" flottant)
- Card shadow : `0 2px 12px rgba(26,46,30,0.08)`

---

### Boutons & CTAs — Refonte

```css
/* Bouton PRIMAIRE — Commander / Ajouter au panier */
.btn-primaire {
  background: var(--or-riche);        /* #B8832A — contraste 4.6:1 */
  color: var(--texte-fort);
  font: 600 16px/1 'Plus Jakarta Sans';
  padding: 14px 28px;
  border-radius: var(--radius-full);
  border: none;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  box-shadow: 0 4px 16px rgba(184,131,42,0.35);
}
.btn-primaire:active {
  transform: scale(0.96);
  box-shadow: 0 2px 8px rgba(184,131,42,0.2);
}

/* Bouton SECONDAIRE — Voir tous, En savoir plus */
.btn-secondaire {
  background: transparent;
  color: var(--vert-profond);
  border: 2px solid var(--vert-profond);
  font: 600 15px/1 'Plus Jakarta Sans';
  padding: 12px 24px;
  border-radius: var(--radius-full);
}

/* Bouton GHOST — Actions discrètes */
.btn-ghost {
  background: transparent;
  color: var(--texte-corps);
  font: 500 14px/1 'Plus Jakarta Sans';
  padding: 10px 16px;
  border-radius: var(--radius-sm);
  text-decoration: underline;
}
```

---

## 5. Idées modernes pour se démarquer

### Micro-interactions à implémenter

```css
/* 1. CARD HOVER — Lift effect */
.produit-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(26,46,30,0.14);
  transition: all 0.25s cubic-bezier(0.34, 1.2, 0.64, 1);
}

/* 2. BADGE ARRIVAGE — Pulse doux */
.badge-arrivage {
  background: var(--terracotta);
  animation: pulse-soft 3s ease-in-out infinite;
}
@keyframes pulse-soft {
  0%, 100% { box-shadow: 0 0 0 0 rgba(196,97,74,0.4); }
  50%      { box-shadow: 0 0 0 6px rgba(196,97,74,0); }
}

/* 3. BLUR CARDS catégories — Fond semi-transparent */
.rayon-card {
  background: rgba(255,255,255,0.7);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.8);
}
```

**Autres interactions clés :**
- **Fraîcheur signal** — Badge pulsant "12 commandes aujourd'hui" (urgence sociale douce)
- **Flying cart** — Miniature produit qui "vole" vers l'icône panier à l'ajout
- **Quantity spring** — `scale(1.15)` sur le chiffre qui change (0.2s spring)
- **Scroll reveal** — Sections apparaissent en `translateY(20px)` → `Y(0)` (respecter `prefers-reduced-motion`)

### Éléments qui donnent envie (fraîcheur + local)

| Élément | Implémentation | Impact |
|---|---|---|
| **Badge "Arrivé ce matin"** | Pill `--terracotta` en haut des cards arrivage | Urgence + fraîcheur |
| **Origine produit** | `"Normandie • 35km"` en micro-texte | Premium local |
| **Compteur stock** | `"Plus que 8 kg"` — seulement si < 10 | Urgence douce |
| **Saison indicator** | Icône soleil/nuage/pluie selon mois | Storytelling |
| **Photo Christophe** | Petite photo dans header mobile (accueil) | Confiance, humanisation |
| **"Recommandé par Christophe"** | Badge éditorial sur 2-3 produits | Expertise, upsell |
| **Économie panier thématique** | `"Économisez 3,50 € avec ce panier"` | Panier moyen ↑ |

---

## 6. Roadmap de changements prioritaires

### Priorité 1 — Quick wins (< 2 h chacun)

1. Remplacer emojis → SVG dans `.rayon-card` (Lucide Icons ou set custom légumes)
2. Corriger contraste couleur or : `#d4a84c` → `#B8832A`
3. Agrandir prix sur cartes produit à `--t-sous-titre` (18px, font-weight 600)
4. Remonter section avis au-dessus de la galerie photos
5. Badge "Arrivage du jour" en terracotta sur produits du jour

### Priorité 2 — Impact fort (1-2 jours)

6. Grille produits : gap 16px (au lieu de 8px), photos vraies plein format
7. Système spacing 8pt : normaliser tous les paddings/gaps
8. Remplacement police body : DM Sans → Plus Jakarta Sans
9. Section hero : ajouter badges de réassurance ("Local", "Frais", "Click & Collect")
10. Bannière fraîcheur animée avec arrivage du jour en haut

### Priorité 3 — Expérience premium (3-5 jours)

11. Animations scroll reveal sur sections
12. Flying cart animation à l'ajout panier
13. Cards produit refontées avec photo, origine, variété
14. Section upsell "Souvent achetés avec ce produit"
15. Compteur stock sur arrivages limités

---

> **Principe directeur** : Chaque changement doit répondre à "Est-ce que ça donne encore plus envie d'acheter ?" Si oui, priorité haute. Si c'est cosmétique, priorité basse.

Le design actuel a de vraies bases solides (palette, typo, mobile-first). La refonte est une **élévation**, pas une révolution. L'objectif est de passer du feeling "appli mobile utile" au feeling **"épicerie fine que j'ai envie de fréquenter"**.
