-- Carte de prospection (/prospection) : suivi du démarchage des commerces de bouche.
-- Une ligne par commerce suivi. id = identifiant du commerce côté carte
-- ("node/123" OpenStreetMap, "siret/…" registre des entreprises, "custom/…" ajout manuel).
-- Réservé aux admins (roles_utilisateurs.role = 'admin').
CREATE TABLE IF NOT EXISTS public.prospection (
  id          text PRIMARY KEY,
  suivi       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- statut, couleur, mémo, rappel, potentiel, objections, historique…
  commerce    jsonb,                                -- fiche complète pour les commerces ajoutés à la main
  supprime    boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS prospection_updated_at_idx ON public.prospection (updated_at);

-- updated_at posé par le serveur : sert de curseur de synchronisation aux appareils.
CREATE OR REPLACE FUNCTION public.prospection_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prospection_touch ON public.prospection;
CREATE TRIGGER prospection_touch
  BEFORE INSERT OR UPDATE ON public.prospection
  FOR EACH ROW EXECUTE FUNCTION public.prospection_touch();

ALTER TABLE public.prospection ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prospection_admin_all ON public.prospection;
CREATE POLICY prospection_admin_all ON public.prospection
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM roles_utilisateurs ru WHERE ru.user_id = (SELECT auth.uid()) AND ru.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM roles_utilisateurs ru WHERE ru.user_id = (SELECT auth.uid()) AND ru.role = 'admin'));

REVOKE ALL ON public.prospection FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.prospection TO authenticated;
