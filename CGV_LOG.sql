-- ============================================================
-- LOG D'ACCEPTATION DES CGV
-- À exécuter dans Supabase SQL Editor
-- ============================================================

-- 1. Sur la table commandes : trace de l'acceptation CGV par le client
ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS cgv_acceptees boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cgv_version text,
  ADD COLUMN IF NOT EXISTS cgv_acceptees_at timestamptz,
  ADD COLUMN IF NOT EXISTS cgv_ip text;

COMMENT ON COLUMN commandes.cgv_acceptees IS 'Le client a coché J''accepte les CGV au moment de la commande';
COMMENT ON COLUMN commandes.cgv_version IS 'Version des CGV affichées au client (ex: ''2026-04'')';
COMMENT ON COLUMN commandes.cgv_acceptees_at IS 'Horodatage de l''acceptation';
COMMENT ON COLUMN commandes.cgv_ip IS 'Adresse IP au moment de l''acceptation';

-- 2. Sur la table commercants : trace de l'acceptation CGV plateforme à l'inscription
ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS cgv_plateforme_acceptees boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cgv_plateforme_version text,
  ADD COLUMN IF NOT EXISTS cgv_plateforme_acceptees_at timestamptz,
  ADD COLUMN IF NOT EXISTS charte_acceptee boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS charte_acceptee_at timestamptz;

COMMENT ON COLUMN commercants.cgv_plateforme_acceptees IS 'Acceptation CGV plateforme à l''inscription';
COMMENT ON COLUMN commercants.charte_acceptee IS 'Acceptation charte qualité commerçant';

-- 3. Index pour requêter rapidement les commandes sans CGV (audit)
CREATE INDEX IF NOT EXISTS idx_commandes_cgv_acceptees
  ON commandes(cgv_acceptees)
  WHERE cgv_acceptees = false;
