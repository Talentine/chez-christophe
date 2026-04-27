# 📚 Documents juridiques Marchéo

> Templates rédigés pour la plateforme. **À faire valider par un avocat avant publication.**

## Contenu du dossier

| Fichier | Cible | Description |
|---------|-------|-------------|
| `CGV-PLATEFORME.md` | Commerçants | Régit la relation entre Marchéo et les commerçants (abonnement, commission, empreinte bancaire, reversement) |
| `CGV-BOUTIQUE.md` | Clients finaux | Template à proposer à chaque commerçant pour ses propres clients |
| `MENTIONS-LEGALES.md` | Public | Page « Mentions légales » obligatoire sur le site |
| `POLITIQUE-CONFIDENTIALITE.md` | Public | Politique RGPD complète |
| `CHARTE-COMMERCANT.md` | Commerçants | Engagement qualité signé à l'inscription |

---

## ⚠️ Avant publication

### 1. Compléter les zones `[À COMPLÉTER]`
Recherchez et remplacez tous les `[À COMPLÉTER]` par vos vraies informations :
- SIRET
- Raison sociale
- Adresse du siège
- Tribunal compétent
- Médiateur de la consommation choisi
- Pourcentage de commission
- Etc.

### 2. Faire valider par un avocat
Ces documents sont des **templates** rédigés à partir de pratiques courantes du secteur. Ils ne constituent pas un conseil juridique et doivent être adaptés à votre situation par un professionnel du droit. Comptez 300 à 800 € pour une revue complète.

**Plateformes recommandées :**
- [Captain Contrat](https://www.captaincontrat.com)
- [Legalstart](https://legalstart.fr)
- [Mister Avocat](https://misteravocat.com)

### 3. Inscrire la médiation
Adhérer à un médiateur de la consommation agréé par la CECMC (obligation légale pour B2C) :
- [CM2C](https://www.cm2c.net) (généraliste, ~70 €/an)
- [SAS Médiation Solution](https://sasmediationsolution-conso.fr)

### 4. Déclarer à la CNIL (si nécessaire)
Pour la plupart des SaaS B2B/B2C, la simple tenue d'un **registre des traitements RGPD** suffit. Pas de déclaration formelle requise depuis le RGPD (2018), sauf cas particuliers (données sensibles, surveillance massive…).

### 5. Publier les documents sur le site
- `/cgv` → CGV plateforme
- `/mentions-legales` → mentions légales
- `/confidentialite` → politique de confidentialité
- Lien vers la charte dans le formulaire d'inscription

### 6. Logger l'acceptation
À chaque inscription :
- Stocker `cgv_acceptees_at`, `version_cgv`, `ip_acceptation` dans la table `commercants`
- Idem pour le formulaire client → table `clients`
- Permet de prouver l'acceptation en cas de litige

---

## 🛠️ Prochaines étapes techniques

Une fois les CGV validées, je peux ajouter :

- [ ] Pages publiques `/cgv`, `/mentions-legales`, `/confidentialite` sur le site
- [ ] Checkbox d'acceptation à l'inscription commerçant + log en base
- [ ] Checkbox d'acceptation à la commande client + log en base
- [ ] Bandeau cookies conforme RGPD avec consentement granulaire
- [ ] Page `/charte` consultable depuis le dashboard commerçant

Dites-le moi quand vous voulez attaquer ces points.
