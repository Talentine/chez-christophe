# Edge Function `stripe-empreinte`

Gère le cycle de vie de l'empreinte bancaire (no-show protection).

## Déployer

```bash
# 1. Installer la CLI Supabase si pas déjà fait
npm i -g supabase

# 2. Login + link au projet
supabase login
supabase link --project-ref epvdzhzwfmtnioedyfgm

# 3. Déposer la clé secrète Stripe (NE PAS la commiter dans le code)
supabase secrets set STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxx

# 4. Déployer la fonction
supabase functions deploy stripe-empreinte --no-verify-jwt
```

`--no-verify-jwt` car on appelle la fonction depuis le navigateur côté client (panier).
La sécurité repose sur RLS Supabase + clé publique Stripe pour la confirmation côté front.

## Tester en local (optionnel)

```bash
supabase functions serve stripe-empreinte --env-file ./supabase/.env.local
```

Avec un fichier `supabase/.env.local` (gitignored) contenant :
```
STRIPE_SECRET_KEY=sk_test_xxxxxx
SUPABASE_URL=https://epvdzhzwfmtnioedyfgm.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## Cron auto-release 24h

Dans Supabase Dashboard → Database → Cron Jobs → `New cron job` :

```sql
select net.http_post(
  url    := 'https://epvdzhzwfmtnioedyfgm.supabase.co/functions/v1/stripe-empreinte',
  body   := '{"action":"auto-release"}'::jsonb,
  headers:= '{"Content-Type":"application/json","Authorization":"Bearer SERVICE_ROLE_KEY_ICI"}'::jsonb
);
```

Schedule: `0 * * * *` (toutes les heures).
