# Bibliothèque de créations : Facebook et Instagram

Statut de toutes les annonces : **BROUILLON, non publiées.**
Offre présentée partout : **399 € d'installation (une seule fois), puis 39 €/mois sans engagement**, 0 % de commission.
Fonctionnalités citées : vérifiées dans le code (voir `README.md` § 1). Aucune annonce ne promet la livraison (offre à 549 €). Le 1er mois offert est réel (399 € payés à l'activation, abonnement après 30 jours) : il figure dans les annonces de prix.

Sommaire
- [Règles communes de production](#règles-communes-de-production)
- Primeurs : [PRI-01](#pri-01--votre-primeur-en-ligne) · [PRI-02](#pri-02--une-commande-sur-smartphone) · [PRI-03](#pri-03--votre-boutique-créée-sous-vos-yeux) · [PRI-04](#pri-04--le-tarif-en-clair)
- Bouchers : [BOU-01](#bou-01--le-catalogue-de-la-boucherie) · [BOU-02](#bou-02--le-parcours-du-client) · [BOU-03](#bou-03--loffre-et-le-prix)
- Transversales : [TRA-01](#tra-01--la-démo-marchéo-en-45-secondes) · [TRA-02](#tra-02--pour-les-commerces-alimentaires-indépendants) · [TRA-03](#tra-03--les-prix-sans-surprise)
- Variantes : [Boulangers](#boulangers-et-pâtissiers) · [Poissonniers](#poissonniers) · [Fromagers](#fromagers) · [Traiteurs](#traiteurs)

---

## Règles communes de production

**Formats**
- `-916` : vidéo verticale 1080 × 1920 (Reels, Stories). Garder textes et visages dans la zone sûre : rien d'important dans les 250 px du haut ni les 340 px du bas (interface Instagram).
- `-45` : 1080 × 1350 pour le fil Facebook et Instagram. Vidéo (même montage recadré) ou image fixe selon la fiche.
- Image fixe : une accroche de 6 mots maximum sur l'image, le reste dans le texte principal.

**Démonstrations réelles**
- Toujours filmer le vrai site sur un vrai téléphone (iPhone ou Android récent, luminosité au maximum, mode Ne pas déranger, batterie et heure propres). Enregistrement d'écran natif, pas de maquette.
- Boutiques utilisables : `/mb-primeur` (Primeur du Cours Lafayette), `/chez-christophe` (primeur), `/boucherie-classique`, `/le-petrin` (boulangerie), `/maree-d-or` (poissonnerie), `/fromagerie-conquerant`. Si ce sont des commerçants réels, **obtenir leur accord écrit** avant de montrer leur boutique dans une publicité. Sinon, créer des boutiques de démonstration dédiées aux publicités.
- Tableau de bord : `/app`, onglets commandes et réglages, sur une boutique de démonstration (jamais de vraies données clients à l'écran : noms, téléphones, adresses).
- Prix et produits visibles à l'écran : cohérents avec un vrai commerce (pas de « Produit test 0,01 € »).

**Tournage en boutique**
- Lumière naturelle, vraie boutique, vrai commerçant ou figurant crédible en tenue de travail. Pas de banque d'images, pas de visuels générés par IA pour le commerçant ni les produits.
- Son : ambiance de boutique basse ; voix off ou voix du commerçant enregistrée au micro-cravate.

**Sous-titres**
- Incrustés (les vidéos sont regardées sans le son), police sans empattement grasse, 56-64 px sur 1080 de large, blanc sur bandeau sombre à 70 %, 2 lignes maximum, 32 caractères par ligne maximum.
- Les prix apparaissent toujours en clair à l'écran au moment où ils sont dits : « 399 € une fois · 39 €/mois · sans engagement ».

**Fin de chaque vidéo** (2 s) : logo Marchéo, `marchéo.fr`, « 399 € d'installation · 39 €/mois · sans engagement ».

**URL** : domaine en punycode dans Meta (`https://xn--marcho-fva.fr/...`), lien affiché `marchéo.fr`.
**Paramètres d'URL** (champ dédié de l'annonce) :
`utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign=<campagne>&utm_term={{adset.name}}&utm_content=<ID>`

**Indicateur de réussite principal pour toutes les annonces** : coût par abonnement payé (CAC) mesuré dans `v_acquisition_pub`. Les seuils de la colonne « Indicateur » sont des seuils de diagnostic, à recalibrer après les premiers paiements.

---

# Primeurs (priorité)

Campagne `acq_primeur` · ensemble « Primeurs »

## PRI-01 · Votre primeur en ligne

| | |
|---|---|
| Métier | Primeurs et maraîchers |
| Angle | Présentation : voici à quoi ressemble *votre* boutique en ligne de primeur |
| Hypothèse testée | Un primeur se projette davantage en voyant une vraie boutique de primeur qu'en lisant une liste de fonctionnalités |
| Formats | `PRI-01-916` vidéo 20 s · `PRI-01-45` vidéo 20 s recadrée |
| CTA | En savoir plus |
| Destination | `https://xn--marcho-fva.fr/solutions/primeur` |
| UTM | `utm_campaign=acq_primeur&utm_content=PRI-01-916` / `PRI-01-45` |
| Indicateur | Coût par démo primeur ; taux démo → payé ≥ 10 % ; taux d'accroche 3 s ≥ 25 % |

**Texte principal**
> Votre primeur en ligne, simplement.
>
> Vos clients retrouvent vos fruits et légumes sur votre propre boutique, préparent leur commande depuis leur téléphone et passent la retirer au créneau choisi. Vente au kilo, à la pièce ou au panier.
>
> 399 € pour l'installation, puis 39 €/mois sans engagement. 0 % de commission.
>
> Regardez la démonstration et créez l'aperçu de votre boutique gratuitement.

**Titre** : Votre primeur en ligne
**Description** : 399 € d'installation · 39 €/mois sans engagement

**Script vidéo (20 s)**

| Temps | Image | Sous-titre / voix off |
|---|---|---|
| 0-2 s | Gros plan mains qui posent une cagette de tomates sur l'étal | « Votre primeur… » |
| 2-4 s | Le téléphone entre dans le champ, écran sur la page d'accueil de `/mb-primeur` | « …a maintenant sa boutique en ligne. » |
| 4-9 s | Défilement lent du catalogue : fruits, légumes, prix au kilo | « Vos produits, vos prix, au kilo ou à la pièce. » |
| 9-13 s | Zoom sur un produit, ajout au panier, choix d'un créneau de retrait | « Vos clients commandent et choisissent l'heure de retrait. » |
| 13-17 s | Commerçant qui tend un sac à un client souriant | « Ils passent, c'est prêt. » |
| 17-20 s | Carton de fin | « 399 € une fois · 39 €/mois · sans engagement » + marchéo.fr |

**Storyboard**
1. Plan serré, étal réel, lumière du matin. Mouvement vertical lent.
2. Plan épaule, téléphone tenu par le commerçant, écran net (verrouiller l'exposition sur l'écran).
3. Enregistrement d'écran plein cadre, défilement à vitesse naturelle (pas accéléré).
4. Enregistrement d'écran : un geste par plan, curseur de doigt visible.
5. Plan large boutique, remise du sac, pas de regard caméra.
6. Fond crème Marchéo, logo, prix en grand.

**Consignes visuelles** : vraie boutique de primeur, couleurs naturelles, pas de filtre. Écran de téléphone lisible au premier visionnage. Pas de musique trop « startup » : guitare acoustique ou ambiance de marché.

## PRI-02 · Une commande sur smartphone

| | |
|---|---|
| Métier | Primeurs |
| Angle | Démonstration produit : une commande complète, du point de vue du client, en temps réel |
| Hypothèse testée | Montrer que la commande prend moins d'une minute rassure le primeur sur l'usage par ses clients (y compris les moins à l'aise) |
| Formats | `PRI-02-916` vidéo 30 s, écran plein cadre · `PRI-02-45` même vidéo, téléphone centré sur fond crème |
| CTA | En savoir plus |
| Destination | `https://xn--marcho-fva.fr/solutions/primeur` |
| UTM | `utm_campaign=acq_primeur&utm_content=PRI-02-916` / `PRI-02-45` |
| Indicateur | Lecture à 50 % ≥ 20 % ; coût par démo ; taux démo → payé |

**Texte principal**
> Voici une vraie commande chez un primeur, filmée en entier.
>
> Le client choisit ses produits, indique la quantité au kilo ou à la pièce, choisit son créneau de retrait et valide. Pas de compte à créer. Vous recevez la commande sur votre téléphone et vous la préparez avant son passage.
>
> Marchéo : 399 € d'installation, puis 39 €/mois sans engagement. Aucune commission sur vos ventes.

**Titre** : Une commande en moins d'une minute
**Description** : Votre boutique de primeur, sans commission

**Script vidéo (30 s)** · chronomètre visible en haut de l'écran

| Temps | Image | Sous-titre |
|---|---|---|
| 0-2 s | Écran d'accueil de la boutique, chronomètre 00:00 qui démarre | « Une commande chez un primeur, en vrai. » |
| 2-8 s | Ajout de 1 kg de pommes, 500 g de clémentines, une botte de radis | « Au kilo ou à la pièce. » |
| 8-12 s | Ouverture du panier, total affiché | « Le total s'affiche tout de suite. » |
| 12-17 s | Choix du créneau de retrait (samedi 10 h-10 h 30) | « Le client choisit son heure. » |
| 17-21 s | Saisie prénom + téléphone, validation, écran de confirmation · chronomètre arrêté | « Validé. Sans créer de compte. » |
| 21-26 s | Bascule : téléphone du commerçant, la commande apparaît dans le tableau de bord | « Vous la recevez. Vous préparez. » |
| 26-30 s | Carton de fin | « 399 € une fois · 39 €/mois · sans engagement » |

**Storyboard**
1-5. Enregistrement d'écran natif d'un téléphone sur `/mb-primeur`, prise en une seule fois (le chronomètre doit être vrai : couper seulement les temps morts > 1 s et le dire « montage sans accélération »).
6. Plan réel : téléphone du commerçant posé sur le comptoir, notification de commande, puis écran du tableau de bord `/app` (données fictives).
7. Carton de fin.

**Consignes visuelles** : 4:5 = téléphone (cadre d'appareil réel, pas de maquette 3D) centré sur fond crème `#FBF7EF`, sous-titres au-dessus. Pas de données personnelles réelles.

## PRI-03 · Votre boutique créée sous vos yeux

| | |
|---|---|
| Métier | Primeurs |
| Angle | Simplicité : on choisit « Primeur », on tape le nom du commerce, l'aperçu s'affiche avec le catalogue déjà rempli |
| Hypothèse testée | La peur du « trop compliqué, pas le temps » freine plus que le prix ; lever ce frein augmente le taux de démos ET de paiements |
| Formats | `PRI-03-916` vidéo 15 s · `PRI-03-45` image fixe (avant / après) |
| CTA | S'inscrire |
| Destination | `https://xn--marcho-fva.fr/inscription?offre=clickcollect` |
| UTM | `utm_campaign=acq_primeur&utm_content=PRI-03-916` / `PRI-03-45` |
| Indicateur | Coût par démo le plus bas des 4 annonces primeur attendu ; surveiller le taux démo → payé (risque de démos « curieuses ») |

**Texte principal**
> Pas le temps de faire un site ? Choisissez « Primeur », tapez le nom de votre commerce : l'aperçu de votre boutique s'affiche, avec un catalogue de fruits et légumes déjà rempli.
>
> Vous ajustez vos prix et vos photos depuis votre téléphone. Rien à installer, aucun matériel à acheter.
>
> Essai de l'aperçu gratuit, sans carte bancaire. Ensuite : 399 € d'installation, puis 39 €/mois sans engagement.

**Titre** : Votre boutique de primeur, prête à essayer
**Description** : Aperçu gratuit · sans carte bancaire

**Script vidéo (15 s)**

| Temps | Image | Sous-titre |
|---|---|---|
| 0-2 s | Page `/inscription`, doigt qui touche « Primeur » | « 1. Choisissez Primeur » |
| 2-6 s | Saisie « Au Panier de Léa » (nom fictif) | « 2. Tapez le nom de votre commerce » |
| 6-11 s | L'aperçu de la boutique apparaît, défilement du catalogue pré-rempli | « 3. Votre boutique est là, catalogue compris » |
| 11-15 s | Carton de fin | « Aperçu gratuit · puis 399 € + 39 €/mois sans engagement » |

**Storyboard** : enregistrement d'écran réel en une prise sur un compte de test (le supprimer ensuite). Ne rien accélérer : la vitesse réelle est l'argument.

**Image fixe 4:5** : à gauche, écran vide « Nom de votre commerce » ; à droite, la boutique générée. Accroche sur l'image : « Votre boutique de primeur, en 3 gestes ». Bandeau bas : « Aperçu gratuit ».

## PRI-04 · Le tarif en clair

| | |
|---|---|
| Métier | Primeurs |
| Angle | Prix affiché d'emblée, sans « contactez-nous » |
| Hypothèse testée | Afficher le prix filtre les curieux : moins de clics, mais un taux démo → payé plus élevé et un CAC plus bas |
| Formats | `PRI-04-45` image fixe · `PRI-04-916` vidéo 10 s (texte animé sur plans de boutique) |
| CTA | En savoir plus |
| Destination | `https://xn--marcho-fva.fr/solutions/primeur` (tableau des offres sur la page) |
| UTM | `utm_campaign=acq_primeur&utm_content=PRI-04-45` / `PRI-04-916` |
| Indicateur | Taux démo → payé le plus élevé des annonces primeur ; CTR bas accepté |

**Texte principal**
> Le prix, tout de suite :
> · 399 € d'installation, une seule fois
> · 1er mois d'abonnement offert, puis 39 €/mois, sans engagement, résiliable depuis votre tableau de bord
> · 0 % de commission sur vos ventes
>
> Pour ce prix : votre boutique de primeur en ligne, les commandes de vos clients avec retrait sur créneau, la vente au kilo, l'empreinte bancaire contre les commandes non retirées et 50 SMS clients par mois.
>
> Pas de devis, pas de rendez-vous commercial. Vous démarrez quand vous voulez.

**Titre** : 399 € une fois, 39 €/mois
**Description** : 1er mois offert · sans engagement

**Image fixe 4:5** : photo réelle d'un étal (moitié haute). Moitié basse, fond crème, texte bleu Marchéo `#0F2C52` : « 399 € une fois » (très grand), « 1er mois offert, puis 39 €/mois · sans engagement » (moyen), « 0 % de commission » (petit, vert). Logo en bas à droite. Rien d'autre.

**Vidéo 10 s** : 3 plans de 2,5 s (étal, téléphone avec la boutique, remise d'un sac), chaque plan porte une ligne de prix, puis carton de fin.

---

# Bouchers et charcutiers

Campagne `acq_boucherie` · ensemble « Bouchers »

## BOU-01 · Le catalogue de la boucherie

| | |
|---|---|
| Métier | Bouchers, charcutiers |
| Angle | Le catalogue : bœuf, veau, agneau, porc, volaille, charcuterie, au kilo ou à la pièce, avec précisions de découpe |
| Hypothèse testée | Un boucher doute qu'un site sache vendre de la viande au poids ; montrer les fiches au kilo et le champ « précisions » lève l'objection |
| Formats | `BOU-01-916` vidéo 20 s · `BOU-01-45` carrousel 4 cartes (ou vidéo recadrée) |
| CTA | Découvrir |
| Destination | `https://xn--marcho-fva.fr/solutions/boucherie` |
| UTM | `utm_campaign=acq_boucherie&utm_content=BOU-01-916` / `BOU-01-45` |
| Indicateur | Coût par démo boucherie ; taux démo → payé |

**Texte principal**
> Et si vos clients pouvaient préparer leurs achats chez vous directement en ligne ?
>
> Avec Marchéo, votre boucherie a sa boutique : bœuf, veau, agneau, volaille, charcuterie. Prix au kilo, aux 100 g ou à la pièce, et un champ « précisions » pour la découpe, l'épaisseur ou la préparation. Si le poids réel diffère, vous ajustez avant d'encaisser.
>
> 399 € d'installation, puis 39 €/mois sans engagement.
>
> Découvrez comment ça fonctionne.

**Titre** : Votre boucherie en ligne
**Description** : Au kilo, à la pièce, avec vos précisions

**Script vidéo (20 s)**

| Temps | Image | Sous-titre |
|---|---|---|
| 0-2 s | Boucher qui tranche une entrecôte, plan serré | « Vendre de la viande en ligne ? » |
| 2-7 s | Écran `/boucherie-classique`, catégories bœuf / veau / volaille | « Votre catalogue, rayon par rayon. » |
| 7-12 s | Fiche produit : prix au kilo, choix de la quantité | « Au kilo, aux 100 g ou à la pièce. » |
| 12-16 s | Saisie dans « précisions » : « 2 tranches de 3 cm » | « Avec les précisions du client. » |
| 16-20 s | Carton de fin | « 399 € une fois · 39 €/mois · sans engagement » |

**Carrousel 4:5** (4 cartes, photo réelle + capture d'écran) : 1. « Votre boucherie en ligne » (vitrine réelle) · 2. « Prix au kilo ou à la pièce » (capture fiche produit) · 3. « Découpe, épaisseur : le client précise » (capture champ précisions) · 4. « 399 € une fois · 39 €/mois · sans engagement ».

**Consignes visuelles** : viande filmée proprement, lumière froide maîtrisée, pas de plans sanglants. Tablier propre, vitrine réfrigérée nette.

## BOU-02 · Le parcours du client

| | |
|---|---|
| Métier | Bouchers |
| Angle | Démonstration : la commande du client de bout en bout, jusqu'au SMS « commande prête » |
| Hypothèse testée | Montrer le côté commerçant (réception, préparation, « prête ») convainc plus que le seul côté client |
| Formats | `BOU-02-916` vidéo 30 s écran partagé · `BOU-02-45` vidéo 30 s |
| CTA | Découvrir |
| Destination | `https://xn--marcho-fva.fr/solutions/boucherie` |
| UTM | `utm_campaign=acq_boucherie&utm_content=BOU-02-916` / `BOU-02-45` |
| Indicateur | Lecture à 75 % ≥ 12 % ; taux démo → payé |

**Texte principal**
> Comment une commande arrive dans votre boucherie avec Marchéo :
>
> 1. Votre client commande la veille depuis son téléphone et choisit son créneau.
> 2. Vous recevez la commande avec son nom, son téléphone et ses précisions.
> 3. Vous préparez le matin, vous passez la commande en « Prête » : il est prévenu automatiquement.
>
> Pour les commandes importantes, l'empreinte bancaire bloque jusqu'à 75 % du panier contre les commandes jamais retirées.
>
> 399 € d'installation, puis 39 €/mois sans engagement.

**Titre** : De la commande au comptoir
**Description** : Sans commission, sans engagement

**Script vidéo (30 s)** · écran partagé haut (client) / bas (commerçant) en 9:16

| Temps | Haut : client | Bas : boucherie | Sous-titre |
|---|---|---|---|
| 0-3 s | Canapé, soir, téléphone en main | Boutique fermée, rideau | « 20 h. Votre client commande. » |
| 3-10 s | Commande : rôti de veau 1,2 kg, 6 merguez, créneau samedi 9 h | — | « Il choisit, il précise, il réserve son heure. » |
| 10-15 s | — | Matin, téléphone du boucher : la commande dans le tableau de bord | « Le matin, la commande vous attend. » |
| 15-21 s | — | Préparation, pesée, emballage | « Vous préparez. » |
| 21-25 s | Notification SMS « Votre commande est prête » | Doigt qui touche « Prête » | « Un geste : il est prévenu. » |
| 25-30 s | Carton de fin | | « 399 € une fois · 39 €/mois · sans engagement » |

**Consignes visuelles** : notification SMS réelle reçue sur un téléphone de test (pas de capture retouchée). Numéros et noms fictifs.

## BOU-03 · L'offre et le prix

| | |
|---|---|
| Métier | Bouchers |
| Angle | Prix + calcul simple : une commande de fête rembourse le mois |
| Hypothèse testée | Rapporter 39 €/mois au panier moyen d'une boucherie rend le prix évident et attire des acheteurs |
| Formats | `BOU-03-45` image fixe · `BOU-03-916` vidéo 12 s face caméra |
| CTA | En savoir plus |
| Destination | `https://xn--marcho-fva.fr/solutions/boucherie` |
| UTM | `utm_campaign=acq_boucherie&utm_content=BOU-03-45` / `BOU-03-916` |
| Indicateur | Taux démo → payé le plus élevé des annonces boucherie |

**Texte principal**
> 39 €/mois, c'est un rôti et deux volailles de fête.
>
> Marchéo, c'est votre boucherie en ligne : catalogue au kilo, commandes avec créneaux de retrait, empreinte bancaire pour les commandes de fêtes, 50 SMS clients par mois.
>
> · 399 € d'installation, une seule fois
> · 1er mois offert, puis 39 €/mois, sans engagement
> · 0 % de commission sur vos ventes
>
> Pas de devis, pas d'appel obligatoire : vous voyez l'aperçu de votre boutique et vous l'activez en ligne.

**Titre** : 399 € une fois, 39 €/mois
**Description** : Une commande de fête couvre le mois

**Image fixe 4:5** : photo réelle d'un comptoir de boucherie. Texte : « 39 €/mois » (très grand), « 399 € d'installation · sans engagement · 0 % de commission ».

**Vidéo 12 s face caméra** (le fondateur ou un boucher client qui l'accepte, jamais un acteur présenté comme client) : « 399 euros une fois, 39 euros par mois, sans engagement, sans commission. Vos clients commandent, vous préparez. Le lien est en dessous. » Sous-titres mot à mot.

---

# Publicités transversales

## TRA-01 · La démo Marchéo en 45 secondes

| | |
|---|---|
| Métier | Tous (diffusée dans « Primeurs », « Bouchers » et « Relance ») |
| Angle | Vidéo de démonstration complète : boutique, commande, tableau de bord, prix |
| Hypothèse testée | Les commerçants qui regardent une démo longue jusqu'au bout sont les plus enclins à payer ; meilleure en relance |
| Formats | `TRA-01-916` vidéo 45 s · `TRA-01-45` vidéo 45 s |
| CTA | En savoir plus |
| Destination | `https://xn--marcho-fva.fr/inscription?offre=clickcollect` |
| UTM | `utm_campaign=acq_primeur` (ensemble Primeurs) / `acq_boucherie` / `acq_relance` · `utm_content=TRA-01-916` / `TRA-01-45` |
| Indicateur | ThruPlay ≥ 15 % ; en relance : taux démo → payé ≥ 15 % |

**Texte principal**
> 45 secondes pour voir Marchéo en vrai.
>
> Votre boutique en ligne à votre nom, vos produits au kilo ou à la pièce, les commandes de vos clients avec un créneau de retrait, et tout se gère depuis votre téléphone. Aucun matériel à acheter.
>
> 399 € d'installation, puis 39 €/mois sans engagement. 0 % de commission.
>
> Créez l'aperçu de votre boutique gratuitement.

**Titre** : Marchéo, la démo complète
**Description** : Boutique, commandes, retrait : tout depuis votre téléphone

**Script vidéo (45 s)** · voix off du fondateur

| Temps | Image | Voix off / sous-titre |
|---|---|---|
| 0-3 s | Écran : `marchéo.fr/votre-commerce` qui se tape dans la barre d'adresse | « Voici votre commerce, en ligne. » |
| 3-10 s | Défilement d'une boutique (primeur), puis bascule sur une boucherie | « Une boutique à votre nom, avec vos produits, vos prix, vos horaires. » |
| 10-20 s | Commande client : produit au kilo, panier, créneau, validation | « Vos clients commandent depuis leur téléphone, sans créer de compte, et choisissent quand passer. » |
| 20-28 s | Tableau de bord `/app` : liste des commandes du jour, passage en « Prête » | « Vous recevez la commande, vous préparez, un geste et le client est prévenu. » |
| 28-34 s | Réglages : créneaux, empreinte bancaire activée | « Vous réglez vos créneaux, et vous protégez les grosses commandes avec l'empreinte bancaire. » |
| 34-40 s | Plan boutique réelle, remise d'un sac | « Pas de tablette, pas de caisse, pas de commission. » |
| 40-45 s | Carton prix | « 399 € une fois, 39 € par mois, sans engagement. » |

**Consignes visuelles** : 80 % d'enregistrement d'écran réel, 20 % de plans en boutique. Montage sobre, sans effets de transition. Musique discrète.

## TRA-02 · Pour les commerces alimentaires indépendants

| | |
|---|---|
| Métier | Commerces de bouche (primeur, boucher, boulanger, poissonnier, fromager, traiteur) |
| Angle | Identité : « fait pour les commerces de bouche indépendants, pas pour les chaînes » |
| Hypothèse testée | Un message large mais très spécifique au secteur trouve des commerçants hors des deux métiers testés à moindre coût |
| Formats | `TRA-02-916` vidéo 15 s (6 métiers × 2 s) · `TRA-02-45` image fixe mosaïque 6 métiers |
| CTA | En savoir plus |
| Destination | `https://xn--marcho-fva.fr/solutions` |
| UTM | `utm_campaign=acq_bouche&utm_content=TRA-02-916` / `TRA-02-45` |
| Indicateur | Répartition des démos par métier ; coût par démo ; à lancer au mois 2 seulement |

**Texte principal**
> Primeur, boucher, boulanger, poissonnier, fromager, traiteur : Marchéo est fait pour les commerces de bouche indépendants.
>
> Votre boutique en ligne avec un catalogue de base adapté à votre métier, la vente au poids, les commandes avec créneaux de retrait, l'empreinte bancaire pour les grosses commandes. Tout depuis votre téléphone.
>
> 399 € d'installation, puis 39 €/mois sans engagement. Aucune commission sur vos ventes.

**Titre** : La boutique en ligne des commerces de bouche
**Description** : Un catalogue adapté à votre métier

**Script vidéo (15 s)** : 6 plans de 2 s, un par métier (vrai commerce, vrai geste : peser des pommes, trancher, sortir une fournée, écailler, couper une meule, dresser un plateau), chaque plan avec le nom du métier et l'écran de sa boutique en incrustation. 3 s de carton prix.

**Image fixe 4:5** : mosaïque 2 × 3 de photos réelles des 6 métiers, bandeau central « Votre commerce, en ligne » et bandeau bas avec le prix.

## TRA-03 · Les prix sans surprise

| | |
|---|---|
| Métier | Tous |
| Angle | Transparence : tout ce que vous payez, et ce que vous ne payez pas |
| Hypothèse testée | Les commerçants échaudés par les commissions des plateformes et les frais cachés répondent mieux à une liste exhaustive des coûts |
| Formats | `TRA-03-45` image fixe · `TRA-03-916` vidéo 15 s (liste animée) |
| CTA | En savoir plus |
| Destination | `https://xn--marcho-fva.fr/sans-commission` |
| UTM | `utm_campaign=acq_boucherie` (ensemble Bouchers) / `acq_relance` · `utm_content=TRA-03-45` / `TRA-03-916` |
| Indicateur | Taux démo → payé ; commentaires (questions sur le prix = bon signe) |

**Texte principal**
> Ce que vous payez avec Marchéo :
> · 399 € d'installation, une seule fois
> · 39 €/mois à partir du 2e mois (le 1er est offert), sans engagement
> · les frais Stripe standards sur les paiements par carte de vos clients (1,4 % + 0,25 € par carte française)
>
> Ce que vous ne payez pas :
> · aucune commission sur vos ventes
> · aucun matériel (tablette, imprimante, caisse)
> · aucune durée d'engagement : résiliable depuis votre tableau de bord
>
> Le prix est affiché sur le site, vous démarrez sans rendez-vous.

**Titre** : Le prix complet, sans astérisque
**Description** : 0 % de commission · sans engagement

**Image fixe 4:5** : deux colonnes sur fond crème. « Vous payez » : 399 € une fois · 39 €/mois. « Vous ne payez pas » : commission · matériel · engagement (barrés en rouge). Logo.

**Vidéo 15 s** : les mêmes lignes qui apparaissent une à une sur plans de boutique floutés, puis carton de fin.

---

# Variantes pour les autres métiers

Mêmes règles, mêmes UTM (changer la campagne), mêmes indicateurs que la fiche source. À produire **au mois 2**, seulement pour le métier suivant dans l'ordre de priorité, si primeurs et bouchers ont donné au moins un paiement.

## Boulangers et pâtissiers

Campagne `acq_boulangerie` · destination `https://xn--marcho-fva.fr/solutions/boulangerie` · boutique filmée : `/le-petrin`

**BLG-01 · Présentation** (adapte PRI-01) · `BLG-01-916` / `BLG-01-45` · CTA En savoir plus
> Votre boulangerie en ligne, simplement.
>
> Gâteaux d'anniversaire, pains spéciaux, viennoiseries du dimanche : vos clients commandent à l'avance depuis leur téléphone et passent les retirer au créneau choisi. Vous savez ce qu'il faut préparer avant d'enfourner.
>
> 399 € pour l'installation, puis 39 €/mois sans engagement. 0 % de commission.

Titre : Votre boulangerie en ligne · Description : Commandes à l'avance, retrait à l'heure
Visuels : sortie de four, vitrine de pâtisseries, écran du catalogue `/le-petrin`. Storyboard identique à PRI-01, plan 1 = fournée qui sort du four.

**BLG-02 · Démonstration** (adapte PRI-02) · `BLG-02-916` / `BLG-02-45`
> Un gâteau commandé un mardi soir, retiré samedi à 11 h. Le client choisit, réserve son heure et valide sans créer de compte. Pour les grosses commandes, l'empreinte bancaire protège contre le gâteau jamais récupéré (jusqu'à 75 % du panier).
>
> 399 € d'installation, puis 39 €/mois sans engagement.

Titre : Le gâteau commandé, le gâteau retiré · Script : PRI-02 avec un fraisier 8 parts + une baguette tradition, plan final sur la boîte remise au client.

**BLG-03 · Tarif** (adapte PRI-04) · `BLG-03-45` image fixe
Accroche image : « 399 € une fois · 39 €/mois ». Texte principal de PRI-04 en remplaçant « boutique de primeur » par « boutique de boulangerie » et « vente au kilo » par « commandes de gâteaux à l'avance ».

## Poissonniers

Campagne `acq_poissonnerie` · destination `https://xn--marcho-fva.fr/solutions/poissonnerie` · boutique filmée : `/maree-d-or`

**POI-01 · Présentation** · `POI-01-916` / `POI-01-45` · CTA En savoir plus
> Votre poissonnerie en ligne, simplement.
>
> Vos clients voient votre étal du jour, commandent au kilo ou à la pièce, et passent retirer leur commande au créneau choisi. Plateaux de fruits de mer du week-end réglés ou garantis d'avance avec l'empreinte bancaire.
>
> 399 € pour l'installation, puis 39 €/mois sans engagement. 0 % de commission.

Titre : Votre poissonnerie en ligne · Description : Au kilo, retrait à l'heure
Visuels : étal sur glace pilée, gros plan bar entier, écran `/maree-d-or`. Pas d'images de livraison (offre 549 €).

**POI-02 · Démonstration** · `POI-02-916` / `POI-02-45`
> Un plateau de fruits de mer pour samedi, commandé jeudi soir. Le client choisit, réserve son créneau, laisse son empreinte bancaire si vous l'avez activée. Vous préparez samedi matin, un geste, il est prévenu que c'est prêt.
>
> 399 € d'installation, puis 39 €/mois sans engagement.

Titre : Le plateau du samedi, réservé jeudi · Script : BOU-02 (écran partagé client / commerçant) avec un plateau de fruits de mer.

**POI-03 · Annonce d'arrivage** · `POI-03-45` image fixe + `POI-03-916` vidéo 10 s
> Arrivage de Saint-Jacques ce matin ? Prévenez vos clients par SMS en 30 secondes depuis votre téléphone : 50 SMS par mois sont inclus. Ils commandent, vous préparez.
>
> 399 € d'installation, puis 39 €/mois sans engagement.

Titre : Votre arrivage annoncé en 30 secondes · Visuel : coquilles Saint-Jacques sur glace + capture de l'écran d'envoi de SMS du tableau de bord (contenu fictif).

## Fromagers

Campagne `acq_fromagerie` · destination `https://xn--marcho-fva.fr/solutions/fromagerie` · boutique filmée : `/fromagerie-conquerant`

**FRO-01 · Présentation** · `FRO-01-916` / `FRO-01-45` · CTA En savoir plus
> Votre fromagerie en ligne, simplement.
>
> Vos fromages à la coupe au poids, vos plateaux et vos formules raclette : vos clients commandent depuis leur téléphone et passent les retirer au créneau choisi.
>
> 399 € pour l'installation, puis 39 €/mois sans engagement. 0 % de commission.

Titre : Votre fromagerie en ligne · Description : À la coupe, en plateau, retrait à l'heure
Visuels : coupe au fil, meules, écran `/fromagerie-conquerant`.

**FRO-02 · Démonstration** · `FRO-02-916` / `FRO-02-45`
> Un plateau pour 8 et 1 kg de raclette pour vendredi soir : commandé en moins d'une minute, sans compte client, avec un créneau de retrait. Vous préparez à l'avance, le client ne fait pas la queue.
>
> 399 € d'installation, puis 39 €/mois sans engagement.

Titre : Le plateau commandé, prêt à l'heure · Script : PRI-02 avec chronomètre, panier plateau + raclette au poids.

**FRO-03 · Tarif** · `FRO-03-45` image fixe : PRI-04 adapté (« vente à la coupe au poids »).

## Traiteurs

Campagne `acq_traiteur` · destination `https://xn--marcho-fva.fr/solutions/traiteur`
**Prérequis** : créer une boutique de démonstration traiteur avant le tournage (il n'en existe pas aujourd'hui).

**TRT-01 · Présentation** · `TRT-01-916` / `TRT-01-45` · CTA En savoir plus
> Votre traiteur en ligne, simplement.
>
> Plateaux, buffets et plats du jour : vos clients commandent à l'avance depuis leur téléphone et choisissent leur créneau de retrait. Pour les grosses commandes, l'empreinte bancaire bloque jusqu'à 75 % du panier contre les commandes jamais retirées.
>
> 399 € pour l'installation, puis 39 €/mois sans engagement. 0 % de commission.

Titre : Votre traiteur en ligne · Description : Plateaux et buffets commandés d'avance
Visuels : dressage de plateaux, vitrine traiteur, écran de la boutique de démonstration.

**TRT-02 · Anti no-show** · `TRT-02-916` / `TRT-02-45`
> Un buffet pour 20 personnes préparé… et jamais récupéré ? Avec l'empreinte bancaire, jusqu'à 75 % du panier est pré-autorisé à la commande. Le client sérieux ne paie rien de plus : l'empreinte est libérée 24 h après le retrait.
>
> 399 € d'installation, puis 39 €/mois sans engagement.

Titre : Plus de buffet jamais récupéré · Script 15 s : plateau prêt sur le comptoir, horloge qui tourne, puis écran de réglage de l'empreinte bancaire, puis carton prix.

**TRT-03 · Tarif** · `TRT-03-45` image fixe : PRI-04 adapté (« commandes de plateaux à l'avance avec empreinte bancaire »).
