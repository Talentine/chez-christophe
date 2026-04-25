-- ============================================================
-- CATÉGORIES PAR MÉTIER
-- À exécuter dans Supabase SQL Editor (une seule fois)
--
-- Ajoute la colonne business_type à categories,
-- assigne 'primeur' à l'existant et insère les catégories
-- standards des 5 autres métiers.
-- ============================================================

-- ── 1. Schéma ─────────────────────────────────────────────

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT 'primeur';

CREATE INDEX IF NOT EXISTS idx_categories_business_type ON categories(business_type);

-- Marque toutes les catégories existantes comme primeur
UPDATE categories SET business_type = 'primeur' WHERE business_type IS NULL OR business_type = '';

-- ── 2. BOUCHERIE ─────────────────────────────────────────

INSERT INTO categories (nom, slug, emoji, ordre, business_type) VALUES
  ('Bœuf',         'boeuf',         '🥩', 1, 'boucherie'),
  ('Veau',         'veau',          '🐄', 2, 'boucherie'),
  ('Porc',         'porc',          '🐖', 3, 'boucherie'),
  ('Agneau',       'agneau',        '🐑', 4, 'boucherie'),
  ('Volaille',     'volaille',      '🐔', 5, 'boucherie'),
  ('Charcuterie',  'charcuterie',   '🥓', 6, 'boucherie'),
  ('Préparations', 'preparations',  '🍖', 7, 'boucherie'),
  ('Plats cuisinés','plats-cuisines-bouch','🍲', 8, 'boucherie')
ON CONFLICT (slug) DO NOTHING;

-- ── 3. BOULANGERIE ───────────────────────────────────────

INSERT INTO categories (nom, slug, emoji, ordre, business_type) VALUES
  ('Pains',         'pains',          '🥖', 1, 'boulangerie'),
  ('Pains spéciaux','pains-speciaux', '🥨', 2, 'boulangerie'),
  ('Viennoiseries', 'viennoiseries',  '🥐', 3, 'boulangerie'),
  ('Pâtisseries',   'patisseries',    '🥧', 4, 'boulangerie'),
  ('Tartes',        'tartes',         '🍰', 5, 'boulangerie'),
  ('Sandwichs',     'sandwichs',      '🥪', 6, 'boulangerie'),
  ('Salés',         'sales-boulang',  '🧀', 7, 'boulangerie'),
  ('Boissons',      'boissons-boulang','🥤', 8, 'boulangerie')
ON CONFLICT (slug) DO NOTHING;

-- ── 4. POISSONNERIE ──────────────────────────────────────

INSERT INTO categories (nom, slug, emoji, ordre, business_type) VALUES
  ('Poissons frais',     'poissons-frais',     '🐟', 1, 'poissonnerie'),
  ('Poissons nobles',    'poissons-nobles',    '🐠', 2, 'poissonnerie'),
  ('Crustacés',          'crustaces',          '🦐', 3, 'poissonnerie'),
  ('Coquillages',        'coquillages',        '🦪', 4, 'poissonnerie'),
  ('Fumés & marinés',    'fumes-marines',      '🐡', 5, 'poissonnerie'),
  ('Plateaux',           'plateaux',           '🍤', 6, 'poissonnerie'),
  ('Préparations',       'preparations-poiss', '🍣', 7, 'poissonnerie')
ON CONFLICT (slug) DO NOTHING;

-- ── 5. TRAITEUR ──────────────────────────────────────────

INSERT INTO categories (nom, slug, emoji, ordre, business_type) VALUES
  ('Entrées',         'entrees',         '🥗', 1, 'traiteur'),
  ('Plats du jour',   'plats-du-jour',   '🍽️', 2, 'traiteur'),
  ('Plats chauds',    'plats-chauds',    '🍲', 3, 'traiteur'),
  ('Plats froids',    'plats-froids',    '🥗', 4, 'traiteur'),
  ('Buffets',         'buffets',         '🍱', 5, 'traiteur'),
  ('Cocktails',       'cocktails',       '🥂', 6, 'traiteur'),
  ('Desserts',        'desserts-trait',  '🍰', 7, 'traiteur'),
  ('Menus enfant',    'menus-enfant',    '👶', 8, 'traiteur')
ON CONFLICT (slug) DO NOTHING;

-- ── 6. FROMAGERIE ────────────────────────────────────────

INSERT INTO categories (nom, slug, emoji, ordre, business_type) VALUES
  ('Pâtes molles',       'pates-molles',       '🧀', 1, 'fromagerie'),
  ('Pâtes pressées',     'pates-pressees',     '🧀', 2, 'fromagerie'),
  ('Pâtes persillées',   'pates-persillees',   '🧀', 3, 'fromagerie'),
  ('Chèvres',            'chevres',            '🐐', 4, 'fromagerie'),
  ('Brebis',             'brebis',             '🐑', 5, 'fromagerie'),
  ('AOP',                'aop',                '⭐', 6, 'fromagerie'),
  ('Crémerie',           'cremerie',           '🥛', 7, 'fromagerie'),
  ('Plateaux',           'plateaux-fromage',   '🍽️', 8, 'fromagerie')
ON CONFLICT (slug) DO NOTHING;
