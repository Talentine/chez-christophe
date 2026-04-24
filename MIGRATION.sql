-- ============================================================
-- Migration à exécuter dans Supabase (SQL Editor)
-- Ajoute les colonnes nécessaires pour :
--   1. Seuil livraison gratuite configurable (dashboard commerçant)
--   2. Photo de fond du hero définie depuis la galerie commerçant
-- ============================================================

ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS seuil_livraison_gratuite numeric,
  ADD COLUMN IF NOT EXISTS hero_photo_url text;

-- (optionnel) Valeur par défaut pour Chez Christophe
UPDATE commercants
  SET seuil_livraison_gratuite = 25
  WHERE slug = 'christophe-frais-caen'
    AND seuil_livraison_gratuite IS NULL;
