-- ============================================================
-- MIGRATION — Transformation en template universel multi-tenant
-- À exécuter dans Supabase (SQL Editor) une seule fois
--
-- Schéma réel du projet :
--   produits_base  = catalogue global (PAS de commercant_id)
--   catalogue      = listing par marchand (commercant_id + produit_base_id)
--   commercants    = profil / config du commerce
-- ============================================================

-- ─── PHASE 1 : schéma multi-tenant sur commercants ───────

ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT 'primeur',
  ADD COLUMN IF NOT EXISTS business_config jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS favicon_url text,
  ADD COLUMN IF NOT EXISTS seuil_livraison_gratuite numeric,
  ADD COLUMN IF NOT EXISTS hero_photo_url text;

-- Contrainte sur les types supportés
ALTER TABLE commercants
  DROP CONSTRAINT IF EXISTS commercants_business_type_check;
ALTER TABLE commercants
  ADD CONSTRAINT commercants_business_type_check
  CHECK (business_type IN ('primeur','boucherie','boulangerie','poissonnerie','traiteur','fromagerie'));

-- ─── PHASE 2 : custom_fields sur catalogue (pas produits_base) ─

-- catalogue = table par marchand, c'est ici qu'on stocke
-- les données métier spécifiques (découpe, DLC, maturation…)
ALTER TABLE catalogue
  ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}'::jsonb;

-- ─── PHASE 3 : index de perf (sur les colonnes qui EXISTENT) ──

-- catalogue.commercant_id existe
CREATE INDEX IF NOT EXISTS idx_catalogue_commercant ON catalogue(commercant_id);
CREATE INDEX IF NOT EXISTS idx_catalogue_actif ON catalogue(commercant_id, actif);

-- commercants.slug existe
CREATE INDEX IF NOT EXISTS idx_commercants_slug ON commercants(slug);
CREATE INDEX IF NOT EXISTS idx_commercants_actif ON commercants(actif) WHERE actif = true;

-- ─── PHASE 4 : valeurs par défaut pour l'existant ────────

UPDATE commercants
  SET business_type = 'primeur',
      seuil_livraison_gratuite = COALESCE(seuil_livraison_gratuite, 25)
  WHERE slug = 'christophe-frais-caen'
    AND business_type = 'primeur';

-- ─── PHASE 5 (optionnel) : commerces de démo par métier ───

-- Décommente pour créer des templates de test :

-- INSERT INTO commercants (slug, nom, business_type, ville, actif)
-- VALUES
--   ('demo-boucherie',    'Boucherie Démo',    'boucherie',    'Paris', true),
--   ('demo-boulangerie',  'Boulangerie Démo',  'boulangerie',  'Paris', true),
--   ('demo-poissonnerie', 'Poissonnerie Démo', 'poissonnerie', 'Paris', true),
--   ('demo-traiteur',     'Traiteur Démo',     'traiteur',     'Paris', true),
--   ('demo-fromagerie',   'Fromagerie Démo',   'fromagerie',   'Paris', true)
-- ON CONFLICT (slug) DO NOTHING;
