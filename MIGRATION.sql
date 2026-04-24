-- ============================================================
-- MIGRATION — Transformation en template universel multi-tenant
-- À exécuter dans Supabase (SQL Editor) une seule fois
-- ============================================================

-- ─── PHASE 1 : schéma multi-tenant ───────────────────────

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

-- ─── PHASE 2 : modèle produit universel ──────────────────

ALTER TABLE produits_base
  ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS stock_dispo integer;

-- ─── PHASE 3 : index de perf ─────────────────────────────

CREATE INDEX IF NOT EXISTS idx_commercants_slug ON commercants(slug);
CREATE INDEX IF NOT EXISTS idx_commercants_actif ON commercants(actif) WHERE actif = true;
CREATE INDEX IF NOT EXISTS idx_produits_commercant ON produits_base(commercant_id);
CREATE INDEX IF NOT EXISTS idx_produits_actif ON produits_base(commercant_id, actif);

-- ─── PHASE 4 : valeurs par défaut pour l'existant ────────

UPDATE commercants
  SET business_type = 'primeur',
      seuil_livraison_gratuite = COALESCE(seuil_livraison_gratuite, 25)
  WHERE slug = 'christophe-frais-caen'
    AND (business_type IS NULL OR business_type = '');

-- ─── PHASE 5 (optionnel) : commerces de démo pour chaque métier ────

-- Décommente pour créer des templates de test :

-- INSERT INTO commercants (slug, nom, business_type, ville, actif)
-- VALUES
--   ('demo-boucherie',    'Boucherie Démo',    'boucherie',    'Paris', true),
--   ('demo-boulangerie',  'Boulangerie Démo',  'boulangerie',  'Paris', true),
--   ('demo-poissonnerie', 'Poissonnerie Démo', 'poissonnerie', 'Paris', true),
--   ('demo-traiteur',     'Traiteur Démo',     'traiteur',     'Paris', true),
--   ('demo-fromagerie',   'Fromagerie Démo',   'fromagerie',   'Paris', true)
-- ON CONFLICT (slug) DO NOTHING;
