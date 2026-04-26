-- ============================================================
-- NOTIFICATIONS EMAIL
-- À exécuter dans Supabase SQL Editor
-- ============================================================

-- Colonne pour tracker les rappels J-1 (évite les doublons)
ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS rappel_j1_envoye_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_commandes_rappel_j1
  ON commandes(date_retrait)
  WHERE rappel_j1_envoye_at IS NULL;

COMMENT ON COLUMN commandes.rappel_j1_envoye_at IS 'Timestamp de l envoi du rappel email J-1 (NULL = pas encore envoyé)';
