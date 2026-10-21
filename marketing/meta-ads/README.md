# Publicités Facebook et Instagram : acquisition de commerçants

Statut : **BROUILLON**. Rien n'est publié. Aucune campagne n'a été créée dans le compte Meta Ads (compte connecté : `675546266352427`). Chaque mise en ligne attend une validation explicite.

Objectif : des **abonnements payés directement sur le site** (offre Click & Collect, 399 € d'installation puis 39 €/mois sans engagement), sans appel commercial. On cherche des commerçants qui paient, pas des clics.

| Fichier | Contenu |
|---|---|
| [`bibliotheque.md`](bibliotheque.md) | Les fiches complètes : textes, scripts, storyboards, consignes visuelles, formats, URL, UTM, indicateurs |
| [`annonces.csv`](annonces.csv) | Une ligne par annonce et par format, prête à recopier dans le Gestionnaire de publicités |
| [`creations.md`](creations.md) | Les vidéos et images produites : liens, archive, méthode, limites |
| [`suivi-hebdo.csv`](suivi-hebdo.csv) | Tableau de suivi hebdomadaire (dépense Meta + démos et paiements Marchéo) pour calculer le CAC |
| `supabase/migrations/20261020_acquisition_publicites.sql` | Colonne `commercants.acquisition` + vue `v_acquisition_pub` (démos et paiements par création), appliquée |

---

## 1. Ce qui a été vérifié dans le code avant d'écrire les textes

Les textes n'utilisent que des fonctionnalités présentes dans le site et l'application. Source entre parenthèses.

**Utilisable dans les publicités (offre 399 € + 39 €/mois)**

- Tarif : 399 € de frais d'installation une seule fois, 39 €/mois, sans engagement, résiliable depuis le tableau de bord (`supabase/functions/stripe-setup-fee`, `faq.html`, `solutions/*.html`).
- 1er mois d'abonnement offert : le commerçant paie 399 € à l'activation, l'abonnement à 39 €/mois démarre avec 30 jours d'essai (version en ligne de `stripe-setup-fee`, vérifiée dans les journaux de paiement).
- 0 % de commission sur les ventes. Les paiements par carte des clients passent par le compte Stripe du commerçant, aux frais Stripe standards (`faq.html`).
- Démo gratuite sans carte bancaire : le commerçant choisit son métier, saisit le nom, la ville et les horaires, ajoute 2 photos minimum et crée son compte ; la boutique est créée avec le catalogue de base du métier. Il paie seulement à l'activation (`inscription.html`, vérifié sur le site le 21/10).
- Adresse de boutique `marchéo.fr/nom-du-commerce`, QR code imprimable (`vercel.json`, offre Vitrine incluse).
- Commande client depuis le téléphone, retrait sur créneau choisi. **Le client doit avoir un compte** (e-mail + mot de passe) pour commander dans une boutique active ; ensuite ses coordonnées sont pré-remplies (`panier.html`, vérifié sur le site le 21/10).
- Vente au kilo ou à la pièce avec choix du poids (250 g, 500 g, 1 kg…) ; l'interface indique « Le commerçant ajustera selon le poids exact à la pesée » (`catalogue.html`).
- Note du client pour le commerçant dans la commande (« Note pour <boutique> »), utilisable pour la découpe. Il n'y a **pas** de champ « précisions » par produit (`panier.html`).
- Créneaux de retrait par jour et heure, avec capacité (`solutions/boucherie.html`).
- Paiement en ligne ou au retrait (le paiement en ligne suppose que le commerçant active son compte Stripe depuis les réglages).
- Empreinte bancaire anti no-show : jusqu'à 75 % du panier pré-autorisé, libérée 24 h après le retrait (`stripe-empreinte`, offre Click & Collect).
- Notifications SMS et e-mail, 50 SMS clients/mois inclus ; push gratuits si le client a installé la boutique sur son téléphone (`faq.html`).
- Gestion depuis le téléphone, sans matériel à acheter (`llms.txt`, `app-commercant.html`).

**À NE PAS écrire dans ces publicités**

| Allégation | Pourquoi |
|---|---|
| « Livraison à domicile » associée à 399 €/39 € | La livraison est dans l'offre 3 (549 € + 59 €/mois), pas dans l'offre Click & Collect. Les fiches parlent de retrait. |
| « Marchéo livre vos clients » | Faux : Marchéo fournit l'outil, pas de coursiers. |
| « Formation en visio incluse » | Mentionné dans la FAQ, mais pas dans la modale d'offre ni dans Stripe. À confirmer avant usage. |
| Un chiffre de clients, de CA ou de CAC | Aucune donnée réelle à ce jour. |
| « Sans créer de compte » (côté client) | Faux pour une boutique active : le client doit se connecter pour commander. |
| « Aperçu en 30 secondes », « en 3 gestes » | L'inscription demande métier, nom, horaires, 2 photos et un compte. |
| « Champ précisions sur chaque produit » | N'existe pas : c'est une note sur la commande. |
| « Votre boutique complète en 30 secondes » | C'est l'aperçu qui s'affiche en 30 secondes. Les textes disent « aperçu » ou « démo ». |

---

## 2. À régler avant de lancer (bloquant)

1. **Pixel Meta inactif.** `assets/core/meta-pixel.js` a `PIXEL_ID = ''`. Sans lui, Meta ne voit aucune conversion. Créer le Pixel dans le Gestionnaire d'événements et coller son ID.
2. **Aucun événement « achat » envoyé à Meta.** Le paiement se fait sur Stripe Checkout depuis la page boutique du commerçant (`boutique.html` → `stripe-setup-fee`). Le site envoie aujourd'hui `Lead` (e-mail saisi) et `CompleteRegistration` (démo créée), mais **pas `Purchase`**. Deux options, à décider :
   - **API Conversions côté serveur** depuis le webhook `checkout.session.completed` de `stripe-setup-fee` (fiable, mais envoie à Meta l'e-mail haché du commerçant, uniquement s'il a accepté le Pixel). Je ne l'ai pas branché : ça transmet des données personnelles à Meta, c'est à vous de décider.
   - **Import hors ligne** une fois par semaine : exporter les abonnements payés (vue `v_acquisition_pub`) et les importer comme événements hors ligne. Plus simple, moins réactif.

   Tant que `Purchase` n'existe pas, on **optimise la campagne sur `CompleteRegistration`** (démo créée) et on **juge les créations sur les paiements réels** dans Marchéo. Même avec `Purchase` en place, 500 €/mois ne donnera pas les ~50 achats par semaine dont Meta a besoin pour sortir de l'apprentissage. Rester sur la démo en optimisation est donc probable ; le juge reste le paiement.
3. ~~Incohérence sur le premier mois~~ **Réglé le 20/10.** La fonction Stripe en ligne offrait déjà le 1er mois (399 € payés à l'activation, puis 30 jours d'essai avant le premier prélèvement de 39 €) ; c'est le fichier du dépôt qui était resté sur l'ancienne version à 438 €. Le dépôt est maintenant aligné sur la version en ligne : un redéploiement ne réintroduira pas l'écart.
4. ~~Appliquer la migration~~ **Fait le 20/10** : colonne `acquisition` et vue `v_acquisition_pub` en place.
5. ~~Tourner les vidéos~~ **Produit le 21/10** : 19 vidéos (9:16 et 4:5) et 13 images fixes, montées à partir d'enregistrements d'écran du vrai site sur iPhone (boutiques de démonstration internes) et de photos d'ambiance générées. Liens et méthode : [`creations.md`](creations.md).
6. ~~Démos sans créneau~~ **Réglé le 21/10** : 10 créneaux de retrait (mardi → samedi, 9 h-12 h et 15 h-19 h) ajoutés à Le pétrin, Marée d'or et Fromagerie des Conquérants.
7. **Pastilles livraison affichées partout** : la page d'accueil de chaque boutique affiche « Livraison offerte dès 25 € » et « Commandez avant 16 h pour être livré demain », même sans offre livraison (`boutique.html`, texte fixe). Elles sont masquées dans les vidéos pour rester fidèle à l'offre à 399 €, mais un vrai client Click & Collect les verrait.
8. **Le site promet encore « sans compte client » et « prête en 30 secondes »** (pages métier, `llms.txt`), ce que le parcours réel contredit. À trancher : autoriser la commande sans compte, ou corriger ces pages.

---

## 3. Suivi : relier une publicité à un commerçant qui paie

Ce qui est en place dans ce commit :

- Les pages métier et le blog (`seo/build.py` → `solutions/*.html`, `blog/*.html`) chargent maintenant `analytics.js` et `meta-pixel.js`. Avant, une publicité qui pointait vers `/solutions/primeur` perdait ses UTM dès le clic vers l'inscription.
- `analytics.js` garde les UTM de la visite (onglet en cours) et les joint à chaque événement (`lead`, `demo_creee`).
- À la création de la boutique, `inscription.html` enregistre `commercants.acquisition` : UTM, choix Pixel, date. Le paiement, souvent fait plus tard, est donc rattaché à la publicité d'origine.
- La vue `v_acquisition_pub` donne, par création (`utm_content`) et par métier : démos, payés, encore actifs.

Limite connue : si la démo est créée avec confirmation d'e-mail obligatoire (pas de session ouverte à l'inscription), l'enregistrement peut être refusé par la sécurité de la table. Vérifier sur les premières inscriptions qu'`acquisition` est bien rempli.

**Requête hebdomadaire** (SQL Editor Supabase) :

```sql
select creation, metier, demos, payes, actifs,
       round(100.0 * payes / nullif(demos, 0), 1) as taux_demo_paye
from v_acquisition_pub
where source in ('fb', 'ig', 'an', 'msg', 'facebook', 'instagram', 'meta')
order by payes desc, demos desc;
```

Reporter `demos` et `payes` dans `suivi-hebdo.csv` à côté de la dépense Meta de la même création. **CAC = dépense ÷ payés.**

### Convention UTM (identique pour toutes les annonces)

```
utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign=<campagne>&utm_term={{adset.name}}&utm_content=<ID annonce>
```

- `utm_source` : rempli par Meta (`fb`, `ig`, `an`, `msg`).
- `utm_campaign` : `acq_primeur`, `acq_boucherie`, `acq_relance`, `acq_bouche` (TRA-02, mois 2), puis `acq_boulangerie`, `acq_poissonnerie`, `acq_fromagerie`, `acq_traiteur`.
- `utm_content` : l'ID de l'annonce, format compris (`PRI-02-916`, `PRI-02-45`…). C'est la clé de toute l'analyse : ne jamais réutiliser un ID pour une autre création.
- À coller dans le champ « Paramètres d'URL » de l'annonce, pas dans l'URL de destination.

---

## 4. Structure de test (budget 500 €/mois)

Une seule campagne, peu d'ensembles, pour ne pas éparpiller le budget.

```
Campagne « MQ – Acquisition commerçants » · objectif Ventes · budget campagne (Advantage) ~13 €/jour
├── Ensemble « Primeurs »   · France · 25-65 ans · Advantage+ audience
│     suggestions : primeur, fruits et légumes, maraîcher, Rungis, marché de producteurs, commerce de proximité
│     annonces : PRI-01, PRI-02, PRI-03, PRI-04, TRA-01
└── Ensemble « Bouchers »   · mêmes réglages
      suggestions : boucherie, charcuterie, artisan boucher, CAP boucher, métiers de bouche
      annonces : BOU-01, BOU-02, BOU-03, TRA-03

Ensemble « Relance » (≈ 80 €/mois, à ouvrir quand le Pixel tourne depuis 2 semaines)
      audience : visiteurs /solutions/* et /inscription 30 jours, hors démos créées
      annonces : TRA-01 (démo vidéo), TRA-03 (transparence des prix), PRI-04 / BOU-03 (tarif)
```

- Placements Advantage+ ; chaque annonce a ses deux formats (9:16 pour Reels et Stories, 4:5 pour le fil), servis par Meta selon l'emplacement.
- TRA-02 (tous commerces alimentaires) attend le deuxième mois : en un seul ensemble large, il diluerait le test primeurs/bouchers.
- Mois 2 : si un métier a au moins un paiement et un coût par démo correct, ouvrir l'ensemble suivant (boulangers, puis poissonniers, fromagers, traiteurs) avec les variantes de `bibliotheque.md`, en coupant les créations perdantes.

### Règles de décision

Le CAC de 10 € est une **hypothèse à tester**, pas un acquis. Avec 399 € encaissés à l'activation puis 39 €/mois à partir du 2e mois, un CAC de plusieurs dizaines d'euros reste rentable. On fixe le seuil après les premiers paiements réels.

| Moment | Règle |
|---|---|
| Avant 7 jours ou 50 € dépensés sur une annonce | Ne rien couper. Quelques clics ne disent rien. |
| 100 € dépensés, 0 démo | Couper l'annonce (le message n'attire pas les bons commerçants). |
| 3 démos ou plus, 0 payé à 300 € dépensés | Le message attire, mais pas des acheteurs : revoir l'angle prix et la page d'arrivée avant de couper. |
| Au moins 1 payé | Garder. Comparer les CAC à volume de dépense comparable. |
| Fin du mois 1 | Classer par CAC réel par métier et par création. Réaffecter 70 % du budget aux deux meilleures, 30 % à de nouvelles variantes. |

Indicateurs de diagnostic (secondaires, jamais suffisants seuls) : taux d'accroche vidéo (vues de 3 s ÷ impressions), CTR lien, coût par démo, taux démo → payé.

### Avant de passer une annonce de « brouillon » à « active »

- [ ] Pixel actif et `CompleteRegistration` visible dans le Gestionnaire d'événements
- [x] Premier mois offert, cohérent entre le site et Stripe
- [x] Migration appliquée
- [ ] Une inscription test depuis un lien avec UTM montre `acquisition.utm.utm_content`
- [ ] Vidéo montée avec sous-titres incrustés, relue sur téléphone
- [ ] Paramètres d'URL collés, lien testé depuis l'aperçu Meta
- [ ] Validation explicite de Paul
