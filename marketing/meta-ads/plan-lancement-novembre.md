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
7. **Reciblage** à partir du 15 novembre : personnes ayant visité le site ou regardé la moitié d'une vidéo, sans avoir payé.

## Budget et publicités

Pourquoi seulement 2 métiers et 5 vidéos : avec 250 €, chaque ensemble de publicités doit recevoir au moins 3 €/jour pour que Meta apprenne quelque chose. Répartir sur 6 métiers donnerait environ 1 €/jour chacun, et aucun résultat lisible.

| Période | Campagne / ensemble de publicités | Publicités | Destination | Budget |
|---|---|---|---|---|
| 1er → 14 nov. | Démo · Primeurs | PRI-01 (démo complète), PRI-04 (prix), PRI-02 (vraie commande) | PRI-01 et PRI-02 : `/solutions/primeur` · PRI-04 : `/inscription?metier=primeur` | 4 €/jour |
| 1er → 14 nov. | Démo · Bouchers | BOU-01 (catalogue au kilo), BOU-03 (39 €/mois) | BOU-01 : `/solutions/boucherie` · BOU-03 : `/inscription?metier=boucherie` | 3 €/jour |
| 15 → 30 nov. | Démo · Primeurs et Bouchers | les 2 ou 3 meilleures du 1er au 14 | idem | 7 €/jour |
| 15 → 30 nov. | Reciblage | TRA-03 (prix complet), TRA-01 (démo complète) | `/inscription` | 1,50 €/jour |

Total : 7 € × 14 jours + 8,50 € × 16 jours = **234 €** (16 € de marge).

Les 2 destinations comparent deux choses : la page du métier, qui explique avant la démo, et le formulaire direct, avec une étape de moins. Les publicités de prix vont au formulaire, parce que la personne a déjà l'information principale.

## Réglages Meta

- **Objectif** : Prospects. Conversion : site web, événement `CompleteRegistration`.
- **Ciblage** : France, 30 à 65 ans, langue française. Audience Advantage+ avec ces suggestions : boucherie, charcuterie, primeur, fruits et légumes, Rungis, artisan, commerce de proximité. C'est la vidéo qui fait le tri : « Primeurs » en gros attire les primeurs.
- **Emplacements** : Advantage+. Vidéo 9:16 pour Reels et Stories, 4:5 pour le fil, via « personnaliser les éléments par emplacement ».
- **Paramètres d'URL** : coller le modèle du [README](README.md) dans « Paramètres d'URL ».
- **Musique** : choisir un titre dans la bibliothèque sonore de Meta.
- **Bouton** : « S'inscrire » pour le formulaire, « En savoir plus » pour la page métier.

## Règles de décision

À appliquer le 8 et le 14 novembre :
- **Couper** une publicité qui a dépensé 15 € sans démo, ou dont le taux de clic sur le lien reste sous 0,8 %.
- **Garder** celle qui a le coût par démo le plus bas, et lui donner le budget de son ensemble.
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
