# Configurer Resend pour les emails Marchéo

## Ce qui est déjà en place

- Edge Function `send-email` (transactionnels : confirmation commande, rappel J-1, empreinte débitée) — utilise déjà l'API Resend.
- Edge Function `password-recovery` (nouvelle) — envoie le mail de reset via Resend + template Marchéo, **sans passer par le SMTP Supabase natif**. C'est ce que la page `/reset-password.html` appelle.

Résultat : **le flow "mot de passe oublié" est déjà indépendant du SMTP Supabase.** Tant que `RESEND_API_KEY` est set côté Supabase Edge (déjà le cas, sinon `send-email` ne marcherait pas en prod), le reset marche.

## Ce qui reste à configurer (pour le fond du problème "spam")

Le SMTP Supabase natif est **toujours** utilisé pour les autres flows Auth :
- Signup email confirmation
- Magic links
- Change email
- Invite (admin)

Pour que ces mails-là sortent aussi du spam, il faut brancher Resend comme SMTP Supabase Auth.

### Étape 1 — Vérifier / créer le domaine Resend

1. Va sur https://resend.com/domains
2. Si `marcheo.fr` (ou le domaine que tu veux utiliser) n'est pas déjà là :
   - Clique **Add Domain** → tape `marcheo.fr`
   - Copie les 3 enregistrements DNS proposés (SPF, DKIM, DMARC)
   - Ajoute-les chez ton registrar (OVH, Gandi…)
   - Clique **Verify** dans Resend une fois propagé (2-15 min)
3. Note l'API key existante ou crée-en une : https://resend.com/api-keys

### Étape 2 — Set les secrets côté Supabase Edge

Si pas déjà fait :
- Dashboard Supabase → **Project Settings → Edge Functions → Secrets**
- Ajoute/mets à jour :
  - `RESEND_API_KEY` = ta clé Resend (`re_...`)
  - `RESEND_FROM` = `Marchéo <no-reply@marcheo.fr>` (ou l'email vérifié Resend)

### Étape 3 — Brancher Resend en SMTP Supabase Auth (optionnel mais recommandé)

Dashboard Supabase → **Authentication → Emails → SMTP Settings** :

| Champ | Valeur |
|---|---|
| Enable Custom SMTP | ✅ ON |
| Sender email | `no-reply@marcheo.fr` |
| Sender name | `Marchéo` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | ta `RESEND_API_KEY` (`re_...`) |

Sauvegarde. **Envoie un test depuis un compte de test** pour vérifier — le mail doit arriver dans la boîte principale (pas spam) avec SPF/DKIM verts.

### Étape 4 — Redirect URLs (juste pour propreté)

Dashboard Supabase → **Authentication → URL Configuration → Redirect URLs** :

Ajoute :
```
https://marcheo.fr/reset-password.html
https://<ton-domaine-vercel>.vercel.app/reset-password.html
http://localhost:3000/reset-password.html
```

**Pas indispensable** pour le flow reset password (l'edge function `password-recovery` fournit le `redirectTo` explicitement), mais utile si un autre code utilise l'API `POST /auth/v1/recover` direct.

## Comment tester

1. Va sur `https://<ton-domaine>/reset-password.html`
2. Tape un email de test (le tien) → clique **Envoyer le lien**
3. Vérifie ta boîte → clique le lien
4. Tu atterris sur la même page avec le formulaire nouveau mot de passe → valide

Si le mail n'arrive pas :
- Vérifie les logs Edge de `password-recovery` (Dashboard → Edge Functions → password-recovery → Logs)
- Message d'erreur typique : `RESEND_API_KEY not configured` → étape 2
- Ou : `Resend error: You can only send testing emails to your own email` → domaine pas encore vérifié dans Resend, utilise `onboarding@resend.dev` en attendant OU vérifie le domaine

## Fallback rapide (si tu n'as pas Resend / pas de domaine)

Tu peux toujours passer par le dashboard Supabase pour reset un mot de passe **sans mail** :
1. https://supabase.com/dashboard/project/epvdzhzwfmtnioedyfgm/auth/users
2. Clique la ligne du user → panneau de droite → **Send password recovery** OU set direct un mot de passe temporaire.
