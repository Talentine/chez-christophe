-- ============================================================
-- EMPREINTE BANCAIRE (no-show protection)
-- À exécuter dans Supabase SQL Editor
--
-- Politique :
--   • empreinte = 75% du panier (pré-autorisation Stripe)
--   • auto-release 24h après date de retrait
--   • bouton "litige" pour capturer en cas de no-show
-- ============================================================

-- ── 1. Colonnes commerçant ──────────────────────────────

ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS empreinte_obligatoire boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_show_pct integer NOT NULL DEFAULT 75;

COMMENT ON COLUMN commercants.empreinte_obligatoire IS 'Si true, le client doit fournir une empreinte bancaire pour commander';
COMMENT ON COLUMN commercants.no_show_pct IS 'Pourcentage du panier prélevé en cas de no-show (défaut 75%)';

-- ── 2. Colonnes commande ────────────────────────────────

ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS empreinte_montant_cents integer,
  ADD COLUMN IF NOT EXISTS empreinte_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS empreinte_capturee_at timestamptz,
  ADD COLUMN IF NOT EXISTS retrait_date timestamptz;

-- empreinte_status valeurs possibles :
--   'none'      → commande sans empreinte
--   'pending'   → empreinte créée, fonds bloqués
--   'released'  → fonds libérés (client venu OU auto 24h)
--   'captured'  → fonds capturés (no-show, litige déclenché)
--   'failed'    → échec création empreinte

CREATE INDEX IF NOT EXISTS idx_commandes_empreinte_status ON commandes(empreinte_status);
CREATE INDEX IF NOT EXISTS idx_commandes_retrait_date ON commandes(retrait_date) WHERE empreinte_status = 'pending';

-- ── 3. Vue : commandes à libérer automatiquement ────────
-- Toute commande avec empreinte 'pending' dont la date de retrait + 24h est dépassée

CREATE OR REPLACE VIEW commandes_empreintes_a_liberer AS
SELECT id, commercant_id, stripe_payment_intent_id, retrait_date
FROM commandes
WHERE empreinte_status = 'pending'
  AND retrait_date IS NOT NULL
  AND retrait_date + interval '24 hours' < now();

COMMENT ON VIEW commandes_empreintes_a_liberer IS 'Commandes dont l empreinte doit être auto-libérée (retrait + 24h dépassé)';
