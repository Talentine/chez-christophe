# Plan de lancement : novembre 2026 (budget 250 €)

Statut : **prêt, non publié.** Les campagnes seront créées en pause, puis activées le 1er novembre avec votre feu vert.

## Le parcours

1. **Publicité vidéo par métier** : le métier en gros dès la première image, la boutique à 1,5 s.
2. **Clic** : page du métier (`/solutions/primeur`) ou directement le formulaire de démo (`/inscription?metier=primeur`, métier déjà choisi).
3. **Démo gratuite créée** : événement Meta `CompleteRegistration`. **C'est la conversion sur laquelle Meta optimise.**
4. **Relances automatiques** (fonction `relances-demo`, toutes les heures) :
   - environ 15 min après la création : « Votre boutique est prête » ;
   - J1 : « Ajoutez vos 3 produits phares » ;
   - J1 ou J2 à 8 h : vous recevez sur marcheo.contact@gmail.com la liste « À appeler aujourd'hui » (nom, métier, ville, téléphone) ;
   - J3 : « Une question ? On vous rappelle » ;
   - J7 : « Mettez votre boutique en ligne : 1er mois offert ».
   Les relances s'arrêtent dès que le commerçant paie, ou s'il clique sur « Ne plus recevoir ces conseils ».
5. **Bandeau dans le tableau de bord de la démo** : « Testez tout, puis mettez votre boutique en ligne : 1er mois offert », avec un bouton « Activer ».
6. **Paiement** : événements Meta `InitiateCheckout` (clic sur une offre) et `Purchase` (retour de Stripe, valeur 399 €, envoyé une seule fois).
7. **Reciblage** à partir de décembre : personnes ayant visité le site ou regardé la moitié d'une vidéo, sans avoir payé.

## Budget et publicités

**Une seule campagne, un seul ensemble de publicités, 8 €/jour, 3 vidéos.** Meta répartit lui-même le budget vers la vidéo qui fait le plus de démos.

Pourquoi concentrer :
- Pour sortir de sa phase d'apprentissage, Meta veut environ 50 conversions par semaine et par ensemble de publicités. À 250 €/mois, on n'y arrivera de toute façon pas. Il faut donc mettre toutes les démos au même endroit pour qu'il apprenne le plus vite possible.
- Deux ensembles à 3 et 4 €/jour se partagent les données, apprennent deux fois moins vite et coûtent plus cher par démo.
- Au-delà de 3 ou 4 vidéos pour ce budget, chacune reçoit trop peu de diffusion pour être jugée.

| Publicité | Rôle | Destination | Bouton |
|---|---|---|---|
| **TRA-02** (18 s, tous les métiers, boutique à 1,5 s) | Toucher le plus de commerçants possible | `/inscription` (le commerçant choisit son métier) | S'inscrire |
| **PRI-01** (28 s, démo primeur avec promotions) | Convaincre les primeurs | `/solutions/primeur` | En savoir plus |
| **PRI-04** (19 s, le prix) | Ceux qui ont déjà compris : passer à la démo | `/inscription?metier=primeur` | S'inscrire |

Budget : 8 €/jour × 30 jours = **240 €**.

Pas de reciblage en novembre : avec ce budget, l'audience à recibler ne dépassera pas quelques centaines de personnes, et les relances par e-mail et les appels font déjà ce travail. On l'ajoutera en décembre, quand l'audience existera.

### Les mois suivants

Chaque mois : la meilleure vidéo transversale du mois précédent reste en place, et on ajoute un métier.

| Mois | Vidéos |
|---|---|
| Novembre | TRA-02 + PRI-01 + PRI-04 |
| Décembre | meilleure transversale + BOU-01 + BOU-03, et reciblage à environ 1,50 €/jour |
| Janvier | meilleure transversale + POI-01 + FRO-01 |
| Février | meilleure transversale + BLG-01 + TRT-01 (boutique traiteur à valider) |

## Réglages Meta

- **Objectif** : Prospects. Conversion : site web, événement `CompleteRegistration`.
- **Ciblage** : France, 30 à 65 ans, langue française. Audience Advantage+ avec ces suggestions : boucherie, charcuterie, primeur, fruits et légumes, Rungis, artisan, commerce de proximité. C'est la vidéo qui fait le tri : « Primeurs » en gros attire les primeurs.
- **Emplacements** : Advantage+. Vidéo 9:16 pour Reels et Stories, 4:5 pour le fil, via « personnaliser les éléments par emplacement ».
- **Paramètres d'URL** : coller le modèle du [README](README.md) dans « Paramètres d'URL ».
- **Musique** : choisir un titre dans la bibliothèque sonore de Meta.
- **Bouton** : « S'inscrire » pour le formulaire, « En savoir plus » pour la page métier.

## Règles de décision

À appliquer le 8 et le 15 novembre (ne rien toucher avant : chaque modification relance l'apprentissage de Meta) :
- **Couper** une vidéo qui a dépensé 25 € sans démo, ou dont le taux de clic sur le lien reste sous 0,8 %.
- **La remplacer** par une autre vidéo primeur (PRI-02) ou transversale (TRA-01).
- **Ne pas changer le budget** de plus de 20 % à la fois.
- **Si moins de 3 démos au total au bout de 5 jours** : le pixel est neuf, et Meta n'a pas assez de données pour optimiser sur la démo. Passer temporairement l'optimisation sur « Vues de page de destination », puis revenir sur la démo dès 10 démos.

À quoi s'attendre honnêtement : un coût par démo entre 8 et 30 €, soit environ 8 à 25 démos dans le mois. Les ventes viendront surtout des appels et des relances.

## À faire avant le 1er novembre

- [ ] **Vous** : créer le pixel dans le Gestionnaire d'événements Meta (Sources de données → Ajouter → Web → nom « Marchéo »), puis m'envoyer son identifiant (15 chiffres). Le compte publicitaire 675546266352427 n'en a aucun aujourd'hui.
- [ ] **Vous** : vérifier le domaine marchéo.fr dans le Business Manager (Paramètres → Sécurité de la marque → Domaines).
- [ ] **Moi** : mettre l'identifiant dans `assets/core/meta-pixel.js`, puis tester les 3 événements avec l'outil « Tester les événements » de Meta.
- [ ] **Moi** : créer les campagnes en pause. Le quota Adspirer de ce mois est épuisé (15 sur 15) ; il se renouvelle en novembre, sinon je vous donne la marche à suivre dans le Gestionnaire de publicités.
- [ ] **Vous** : le feu vert d'activation.

## Suivi

- Démos et ventes par publicité : vue `v_acquisition_pub` dans Supabase, colonnes `utm_content` = ID de l'annonce.
- Tableau de suivi hebdomadaire : [suivi-hebdo.csv](suivi-hebdo.csv).
