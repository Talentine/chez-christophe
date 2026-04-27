# CONDITIONS GÉNÉRALES DE VENTE — BOUTIQUE [NOM_BOUTIQUE]

> Template à mettre à disposition de chaque commerçant. Les variables `{{ ... }}` sont à personnaliser par le commerçant dans son dashboard.

**Version 1.0 — Dernière mise à jour : [Date]**

---

## ARTICLE 1 — IDENTIFICATION DU VENDEUR

- **Nom commercial :** {{ nom_boutique }}
- **Raison sociale :** {{ raison_sociale }}
- **Forme juridique :** {{ forme_juridique }}
- **SIRET :** {{ siret }}
- **Adresse :** {{ adresse_complete }}
- **Email :** {{ email_contact }}
- **Téléphone :** {{ telephone }}

Les présentes CGV régissent les ventes de produits réalisées sur la boutique en ligne `marcheo.fr/{{ slug }}`, exploitée par le Commerçant susnommé via la plateforme **Marchéo**.

---

## ARTICLE 2 — PRODUITS

### 2.1 Caractéristiques
Les produits proposés à la vente sont décrits avec leur dénomination, leur prix, leur unité de vente et le cas échéant leur provenance, allergènes et durée de conservation.

### 2.2 Disponibilité
Les produits sont proposés dans la limite des stocks disponibles. En cas d'indisponibilité après commande, le Commerçant en informe le Client par SMS ou email et propose un remboursement, un avoir ou une substitution.

### 2.3 Prix
Les prix sont indiqués en euros, **TTC** (toutes taxes comprises). Ils peuvent être modifiés à tout moment, mais le prix appliqué est celui en vigueur au moment de la validation de la commande.

---

## ARTICLE 3 — COMMANDE

### 3.1 Processus de commande
Le Client passe commande en sélectionnant les produits, en choisissant un mode (retrait en boutique ou livraison à domicile), un créneau, puis en validant le paiement.

### 3.2 Validation
Une commande n'est définitivement enregistrée qu'après :
- Acceptation des présentes CGV
- Confirmation du paiement (ou de l'empreinte bancaire le cas échéant)

Un email et un SMS de confirmation sont envoyés au Client.

### 3.3 Refus de commande
Le Commerçant se réserve le droit de refuser toute commande pour motif légitime (rupture, suspicion de fraude, comportement abusif).

---

## ARTICLE 4 — MODES DE RETRAIT ET DE LIVRAISON

### 4.1 Click & Collect (retrait en boutique)
Le Client retire sa commande à l'adresse de la boutique, sur le créneau qu'il a choisi.

### 4.2 Livraison à domicile
La livraison est effectuée par le Commerçant ou un partenaire logistique, dans la zone géographique définie par le Commerçant. Les frais de livraison sont indiqués au moment de la commande.

### 4.3 Délais
Les créneaux affichés correspondent à la disponibilité réelle. En cas de retard exceptionnel, le Commerçant en informe immédiatement le Client.

---

## ARTICLE 5 — PRIX, PAIEMENT ET EMPREINTE BANCAIRE

### 5.1 Modes de paiement
Le paiement s'effectue en ligne par **carte bancaire** via le prestataire **Stripe**. Les paiements sont sécurisés (3D Secure, chiffrement TLS).

### 5.2 Empreinte bancaire (anti no-show) — *si activée par le Commerçant*

Au moment de la commande, une **pré-autorisation bancaire de 75 % du montant du panier** peut être effectuée sur la carte du Client.

⚠️ **Aucun débit n'est effectué à ce stade.** Il s'agit uniquement d'un blocage temporaire de fonds sur la carte du Client.

#### 5.2.1 Libération automatique
L'empreinte est **libérée automatiquement dans les 24 heures** suivant la date prévue de retrait ou de livraison, dans les cas suivants :
- Le Client a retiré sa commande
- Le Client a annulé la commande dans les délais autorisés
- Le créneau est dépassé sans action du Commerçant

#### 5.2.2 Capture (débit) en cas de no-show
Si le Client **ne se présente pas** au retrait ou à la livraison **sans avoir annulé** dans les délais, le Commerçant peut **capturer** l'empreinte (débit effectif des 75 %) dans les 24 heures suivant la date du créneau manqué.

Le Client est notifié par email du débit et de son motif.

#### 5.2.3 Conditions d'annulation gratuite
Le Client peut annuler sans frais sa commande **jusqu'à [X] heures avant le créneau** [À COMPLÉTER selon politique de chaque commerçant — typiquement 2h à 24h].

Au-delà de ce délai, l'empreinte peut être capturée en cas d'absence.

---

## ARTICLE 6 — DROIT DE RÉTRACTATION

Conformément à l'article L.221-28 du Code de la consommation, **le droit de rétractation ne s'applique pas** aux produits suivants :

- Produits **alimentaires périssables** (fruits, légumes, viandes, poissons, fromages frais, plats préparés, pâtisseries…)
- Produits **personnalisés ou réalisés sur demande**
- Produits **descellés** ne pouvant être renvoyés pour des raisons d'hygiène

Le Client renonce expressément à son droit de rétractation pour ces catégories en validant sa commande.

---

## ARTICLE 7 — RÉCLAMATIONS

En cas de produit défectueux, non conforme, ou de service insatisfaisant, le Client peut adresser sa réclamation au Commerçant :

- Par email : {{ email_contact }}
- Par téléphone : {{ telephone }}
- Directement en boutique : {{ adresse }}

Le Commerçant s'efforce d'apporter une réponse sous **48 heures ouvrées** et de proposer une solution amiable (remboursement, avoir, remplacement).

---

## ARTICLE 8 — DONNÉES PERSONNELLES

Les données personnelles collectées (nom, prénom, email, téléphone, adresse de livraison) sont nécessaires au traitement de la commande. Elles sont conservées pendant la durée de la relation commerciale puis pendant 3 ans à des fins commerciales et 10 ans à des fins comptables.

Le Client dispose des droits d'accès, de rectification, de suppression, de portabilité et d'opposition prévus par le RGPD. Il peut les exercer en écrivant à {{ email_contact }}.

Pour plus d'informations, consultez la politique de confidentialité de Marchéo : https://marcheo.fr/confidentialite

---

## ARTICLE 9 — RESPONSABILITÉ

Le Commerçant est responsable de la qualité, de la conformité et de la sécurité alimentaire des produits qu'il vend.

La plateforme Marchéo est un **simple intermédiaire technique** facilitant la transaction et n'est pas partie au contrat de vente conclu entre le Client et le Commerçant.

---

## ARTICLE 10 — LITIGES ET MÉDIATION

Les présentes CGV sont soumises au **droit français**.

### 10.1 Résolution amiable
En cas de difficulté, le Client est invité à contacter en priorité le Commerçant à l'adresse {{ email_contact }} ou par téléphone au {{ telephone }} afin de rechercher une **solution amiable** dans un délai raisonnable.

### 10.2 Médiation de la consommation
Conformément à l'article **L.612-1 du Code de la consommation**, le Client a le droit de recourir gratuitement à un médiateur de la consommation en cas de litige non résolu avec le Commerçant.

Le Commerçant adhère au médiateur suivant :

- **Nom du médiateur :** {{ mediateur_nom }} *(à renseigner par le Commerçant)*
- **Site web :** {{ mediateur_url }}
- **Adresse postale :** {{ mediateur_adresse }}

Le Client doit avoir préalablement tenté de résoudre le litige directement auprès du Commerçant par une réclamation écrite (email recommandé).

### 10.3 Plateforme européenne de règlement en ligne des litiges (RLL)
Conformément au **Règlement (UE) n° 524/2013**, la Commission européenne met à disposition une plateforme en ligne accessible à l'adresse suivante :

👉 **https://ec.europa.eu/consumers/odr**

Cette plateforme permet aux consommateurs résidant dans l'Union européenne de soumettre toute réclamation pour les litiges issus d'une transaction en ligne.

### 10.4 Tribunaux compétents
À défaut de résolution amiable ou par voie de médiation, tout litige sera porté devant les juridictions compétentes selon les règles du droit commun.

---

**{{ nom_boutique }}** — Vente via la plateforme Marchéo
