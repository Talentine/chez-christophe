-- ============================================================
-- STRIPE CONNECT (compte de réception commerçant)
-- À exécuter UNE FOIS dans Supabase SQL Editor.
--
-- Crée les colonnes nécessaires à l'Edge Function /stripe-connect
-- pour que les commerçants puissent lier leur compte bancaire et
-- recevoir les paiements clients (et capturer les empreintes).
-- ============================================================

-- ── 1. Colonnes Stripe Connect sur commercants ─────────────
ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS stripe_connect_id text,
  ADD COLUMN IF NOT EXISTS stripe_connect_actif boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_updated_at timestamptz;

COMMENT ON COLUMN commercants.stripe_connect_id IS 'ID du compte Stripe Express (acct_xxx). NULL tant que pas onboardé.';
COMMENT ON COLUMN commercants.stripe_connect_actif IS 'true = charges_enabled ET payouts_enabled. Bloque les commandes en ligne sinon.';
COMMENT ON COLUMN commercants.stripe_connect_charges_enabled IS 'Stripe a activé l acceptation des paiements';
COMMENT ON COLUMN commercants.stripe_connect_payouts_enabled IS 'Stripe a activé les virements vers le compte bancaire';
COMMENT ON COLUMN commercants.stripe_connect_details_submitted IS 'Le commerçant a complété le formulaire d onboarding Stripe';
COMMENT ON COLUMN commercants.stripe_connect_updated_at IS 'Dernière synchronisation du statut depuis Stripe';

-- ── 2. Index pour les lookups rapides ─────────────────────
CREATE INDEX IF NOT EXISTS idx_commercants_stripe_connect_id
  ON commercants(stripe_connect_id)
  WHERE stripe_connect_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commercants_stripe_connect_actif
  ON commercants(stripe_connect_actif)
  WHERE stripe_connect_actif = true;

-- ── 3. Vue de monitoring (admin) ──────────────────────────
-- Permet de voir d un coup d œil l état d onboarding Stripe de tous les commerçants
CREATE OR REPLACE VIEW v_stripe_connect_status AS
SELECT
  id,
  nom_boutique,
  slug,
  email,
  stripe_connect_id IS NOT NULL                       AS compte_cree,
  stripe_connect_details_submitted                    AS dossier_soumis,
  stripe_connect_charges_enabled                      AS peut_encaisser,
  stripe_connect_payouts_enabled                      AS peut_etre_verse,
  stripe_connect_actif                                AS pleinement_actif,
  CASE
    WHEN stripe_connect_actif THEN 'actif'
    WHEN stripe_connect_details_submitted THEN 'en_verification'
    WHEN stripe_connect_id IS NOT NULL THEN 'en_cours'
    ELSE 'non_demarre'
  END AS statut,
  stripe_connect_updated_at,
  created_at AS commercant_cree_le
FROM commercants
ORDER BY created_at DESC;

COMMENT ON VIEW v_stripe_connect_status IS 'Vue admin : où en est chaque commerçant dans l onboarding Stripe';

-- ── 4. RLS : le commerçant peut LIRE ses propres champs Stripe Connect ──
-- (la mise à jour passe TOUJOURS par l Edge Function en service_role,
--  jamais en direct depuis le client. C est un choix de sécurité.)
-- Si la policy SELECT existe déjà, on ne fait rien.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'commercants' AND policyname = 'commercant_lit_son_stripe_connect'
  ) THEN
    -- On suppose que les policies existantes sur commercants utilisent auth.uid()
    -- Cette policy s ajoute aux policies existantes (RLS additif)
    NULL; -- placeholder : à adapter selon votre schéma RLS existant
  END IF;
END $$;
