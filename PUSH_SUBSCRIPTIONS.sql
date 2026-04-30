-- ============================================================
-- TABLE push_subscriptions (notifications push commerçant)
-- À exécuter dans Supabase SQL Editor (idempotent)
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercant_id uuid NOT NULL REFERENCES commercants(id) ON DELETE CASCADE,
  endpoint      text NOT NULL UNIQUE,
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_commercant
  ON push_subscriptions(commercant_id);

COMMENT ON TABLE push_subscriptions IS 'Souscriptions Web Push VAPID des commerçants (par device/navigateur)';

-- RLS : seul le service_role peut lire (côté Edge Function send-push)
-- On laisse l'INSERT public via clé anon car le client commerçant
-- s'abonne lui-même (le commercant_id est vérifié côté front via session)
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_insert_public ON push_subscriptions;
CREATE POLICY push_insert_public ON push_subscriptions
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS push_service_all ON push_subscriptions;
CREATE POLICY push_service_all ON push_subscriptions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
