# Agent de prospection Marchéo — LinkedIn + email

Fonction Supabase `agent-prospection` + migration `supabase/migrations/20261018_agent_prospection.sql`.

**Installé le 18/10/2026** sur le projet `epvdzhzwfmtnioedyfgm` : tables, fonction et tâches planifiées actives, mode `live`.
Le secret d'appel est généré dans Supabase Vault (`agent_prospection_secret`) : rien à configurer. Les étapes ci-dessous
qui parlent de `AGENT_SECRET` ou du bloc `cron.schedule` sont déjà faites par la migration.
Reste à fournir : `ANTHROPIC_API_KEY` (obligatoire pour écrire les mails), et en option le jeton LinkedIn et la réception des réponses.
**Mode gratuit (actif tant que l'API Claude n'a pas de crédit)** : les mails partent sur des modèles fixes
(`redigerModele`) avec la phrase d'accroche du champ `notes`. La recherche des coordonnées est faite chaque jour ouvré à 6h52
par une tâche programmée Claude Code (« Prospection Marchéo : recherche des contacts ») qui remplit `agent_prospects`.
Dès qu'il y a du crédit sur l'API, la fonction repasse seule à la rédaction et à l'enrichissement par Claude.
Valeurs par défaut : signature « Paul Merieult, Fondateur », envoi depuis l'adresse de `RESEND_FROM`, réponses et récap sur
marcheo.contact@gmail.com, 25 mails initiaux par jour, entreprises de 2 à 30 établissements.

## Ce que fait l'agent, tout seul

| Quand | Action | Détail |
|---|---|---|
| Toutes les heures | `sourcer` | Parcourt les départements un par un (01 → 976) via l'API publique `recherche-entreprises.api.gouv.fr` : **associations / unions de commerçants** (NAF 94.99Z) et **propriétaires de 2 boutiques ou plus** (boulangerie, pâtisserie, boucherie, charcuterie, primeur, poissonnerie, fromagerie / épicerie fine, alimentation générale, supérette, traiteur). 5 établissements ou plus → classé `groupe`. |
| Toutes les 10 min | `enrichir` | Claude cherche sur le web le site, l'**email pro publié**, le téléphone, le président / gérant, son LinkedIn et 1 à 3 faits pour personnaliser. Pas d'email trouvé → `introuvable`, jamais contacté. |
| Toutes les 15 min, lun-ven 9h-18h | `envoyer` | Mail initial personnalisé (quota `QUOTA_JOUR`, 40 par défaut, étalé sur la journée), relance à J+7, dernière relance à J+14, puis stop. Associations : tarif partenaire adhérents. Multi-boutiques : tarif plusieurs boutiques. |
| À chaque réponse reçue | `reponse` | Claude classe la réponse et répond : **intéressé** → propose un rendez-vous + alerte par mail ; **question** → répond avec les vrais prix ; **pas intéressé** → remercie, stop ; **stop** → désinscrit, aucun mail ; **absence** → décale d'une semaine ; **autre** (négociation, juridique…) → pas de réponse auto, alerte. Au-delà de 3 réponses auto dans un échange, la main passe à vous. |
| Lun-ven 8h30 (et 12h30 si `LINKEDIN_POSTS_PAR_JOUR=2`) | `linkedin-post` | Publie un post sur votre profil (20 thèmes en rotation, sans répéter les accroches des 12 derniers). |
| Lun-ven 7h30 | `digest` | Mail récap : envois, réponses, prospects à rappeler, et **15 invitations LinkedIn du jour** avec la note déjà écrite. |

Claude n'a le droit de citer que les prix et faits listés dans `FAITS_MARCHEO` (en haut de `index.ts`) : aucun client, chiffre ou témoignage inventé.

## Ce que LinkedIn ne permet pas d'automatiser (10 min par jour pour vous)

L'API officielle de LinkedIn permet de **publier** sur votre profil, mais pas de s'abonner, d'envoyer des invitations, d'envoyer des messages privés ni de lire les commentaires. Les outils qui le font en pilotant un navigateur enfreignent les conditions d'utilisation de LinkedIn et finissent par une restriction du compte. C'est le compte qui porte votre réseau, donc l'agent ne le fait pas.

À la place, le digest de 7h30 vous donne les 15 profils du jour, déjà contactés par mail, avec une note d'invitation de moins de 300 caractères à coller. Ouvrir le lien → « Se connecter » → « Ajouter une note » → coller.

## Mise en service

### 1. Base de données
Exécuter `supabase/migrations/20261018_agent_prospection.sql` (SQL editor ou `supabase db push`).

### 2. Secrets de la fonction
Dashboard Supabase → Project Settings → Edge Functions → Secrets :

| Secret | Valeur |
|---|---|
| `ANTHROPIC_API_KEY` | clé API Claude (console.anthropic.com) |
| `AGENT_SECRET` | une longue chaîne aléatoire (`openssl rand -hex 32`) |
| `AGENT_MODE` | `pause` pour commencer, `live` pour envoyer et publier |
| `PROSPECTION_FROM` | `Paul Merieult — Marchéo <paul@xn--marcho-fva.fr>` (domaine vérifié dans Resend, pas de no-reply) |
| `PROSPECTION_REPLY_TO` | l'adresse qui reçoit les réponses (étape 4) |
| `OWNER_EMAIL` | votre adresse : digest et alertes |
| `SIGNATURE_NOM`, `SIGNATURE_ROLE`, `SIGNATURE_TEL` | signature des mails |
| `BOOKING_URL` | (optionnel) lien Calendly ou équivalent |
| `QUOTA_JOUR` | (optionnel) 40 par défaut ; commencer à 20 la première semaine pour chauffer le domaine |
| `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_PERSON_URN` | étape 3 |

`RESEND_API_KEY`, `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` existent déjà.

> Conseil délivrabilité : envoyer la prospection depuis un sous-domaine dédié (ex. `contact.marchéo.fr`) vérifié dans Resend, pour ne pas abîmer la réputation du domaine qui envoie les confirmations de commande.

### 3. LinkedIn (publication)
1. https://www.linkedin.com/developers/apps → **Create app** (il faut une page entreprise Marchéo à associer).
2. Onglet **Products** : ajouter **Sign In with LinkedIn using OpenID Connect** et **Share on LinkedIn** (validation immédiate).
3. Onglet **Auth** : ajouter l'URL de redirection `https://www.linkedin.com/developers/tools/oauth/redirect`.
4. https://www.linkedin.com/developers/tools/oauth/token-generator → choisir l'app, cocher `openid`, `profile`, `w_member_social` → générer. Copier le jeton dans `LINKEDIN_ACCESS_TOKEN`.
5. Récupérer votre identifiant :
   ```bash
   curl -s https://api.linkedin.com/v2/userinfo -H "Authorization: Bearer LE_JETON"
   ```
   Le champ `sub` donne `LINKEDIN_PERSON_URN` = `urn:li:person:<sub>`.

Le jeton dure **60 jours**. À expiration, l'agent vous envoie un mail « Jeton LinkedIn expiré » : refaire l'étape 4.

### 4. Réponses entrantes
Les réponses doivent arriver sur le webhook :
```
POST https://epvdzhzwfmtnioedyfgm.supabase.co/functions/v1/agent-prospection?action=reponse&k=AGENT_SECRET
```
- **Resend Inbound** (recommandé) : activer la réception sur le domaine de `PROSPECTION_REPLY_TO`, puis créer un webhook sur l'événement `email.received` vers l'URL ci-dessus. Le corps du mail est récupéré via l'API Resend si l'événement ne le contient pas.
- **Autre solution** (Gmail + Zapier/Make, Cloudflare Email Routing…) : envoyer un POST JSON `{ "from": "...", "subject": "...", "text": "..." }` sur la même URL.

### 5. Déployer et tester sans rien envoyer
```bash
supabase functions deploy agent-prospection --no-verify-jwt
URL=https://epvdzhzwfmtnioedyfgm.supabase.co/functions/v1/agent-prospection
H='x-agent-secret: VOTRE_SECRET'
curl -X POST $URL -H "$H" -d '{"action":"sourcer"}'
curl -X POST $URL -H "$H" -d '{"action":"enrichir","limite":3}'
curl -X POST $URL -H "$H" -d '{"action":"apercu","n":3}'      # mails générés, rien envoyé
curl -X POST $URL -H "$H" -d '{"action":"apercu-post"}'       # post généré, rien publié
curl -X POST $URL -H "$H" -d '{"action":"digest","forcer":true}'
```
Relire les aperçus. Si le ton et l'offre conviennent : `AGENT_MODE=live`.

### 6. Planifier
Exécuter le bloc `cron.schedule` en commentaire à la fin de la migration, après avoir remplacé `AGENT_SECRET_ICI`.

## Suivi
```sql
select statut, type, count(*) from agent_prospects group by 1, 2 order by 1, 2;
select * from agent_prospects where statut = 'interesse';
select p.nom, m.classification, m.corps from prospection_messages m join agent_prospects p on p.id = m.prospect_id
 where m.sens = 'entrant' order by m.created_at desc limit 20;
select created_at, theme, statut, erreur from linkedin_posts order by created_at desc limit 10;
```
Couper tout : `AGENT_MODE=pause` (ou `select cron.unschedule('agent-envoyer');`).

## Cadre légal (B2B, France)
- Prospection par mail d'un professionnel sur une offre liée à son activité : autorisée sans consentement préalable (CNIL), à condition d'identifier l'expéditeur et d'offrir un moyen simple de s'opposer. Chaque mail contient un lien de désinscription en un clic (en-tête `List-Unsubscribe` inclus), et « stop » en réponse désinscrit aussi.
- Seuls les emails publiés par la structure elle-même sont utilisés ; l'agent n'en devine aucun.
- 2 relances maximum, puis plus aucun mail.
- Penser à mentionner cette prospection dans `confidentialite.html` (finalité, source des données, durée de conservation, droit d'opposition).

## Coûts indicatifs
- Claude (`claude-opus-5-5`) : enrichissement avec recherche web ≈ 5 à 15 centimes par prospect, rédaction d'un mail ou d'un post ≈ 1 à 3 centimes. Pour 40 nouveaux prospects par jour : environ 3 à 7 € par jour. `CLAUDE_MODEL=claude-sonnet-5-5` divise environ par deux.
- Resend : 40 mails par jour + relances tiennent dans l'offre gratuite (3 000 mails par mois) au début, puis offre Pro.
- API recherche-entreprises : gratuite.

## À ajuster
- `OFFRE_MULTI_TEXTE()` dans `index.ts` : condition proposée aux propriétaires de plusieurs boutiques. Valeur actuelle : installation au tarif partenaire dès la 2e boutique. C'est une décision commerciale à valider.
- `THEMES_POSTS` : thèmes des posts LinkedIn.
