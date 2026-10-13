-- Date de la toute première activation payante. Tant qu'elle est NULL,
-- la boutique n'a jamais été payante : toutes ses commandes sont des tests.
ALTER TABLE public.commercants ADD COLUMN IF NOT EXISTS premiere_activation_at timestamptz;

UPDATE public.commercants
SET premiere_activation_at = coalesce(abonnement_debut::timestamptz, created_at, now())
WHERE premiere_activation_at IS NULL
  AND (abonnement_actif = true OR abonnement_debut IS NOT NULL OR stripe_subscription_id IS NOT NULL);

CREATE OR REPLACE FUNCTION public.purger_commandes_demo(p_commercant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cmd uuid[];
BEGIN
  SELECT coalesce(array_agg(id), '{}') INTO v_cmd FROM commandes WHERE commercant_id = p_commercant_id;

  -- Remet le stock consommé par les commandes test (trigger fn_restocker_annulation)
  UPDATE commandes SET statut = 'annulee'
  WHERE id = ANY(v_cmd) AND statut IS DISTINCT FROM 'annulee';

  DELETE FROM avis WHERE commande_id = ANY(v_cmd);
  DELETE FROM notifications WHERE commande_id = ANY(v_cmd);
  DELETE FROM fidelite_recompenses
  WHERE commande_origine_id = ANY(v_cmd) OR commande_utilisation_id = ANY(v_cmd);
  DELETE FROM commandes WHERE id = ANY(v_cmd);  -- commande_lignes en cascade

  DELETE FROM reservations WHERE commercant_id = p_commercant_id;
  DELETE FROM avis WHERE client_id IN (SELECT id FROM clients WHERE commercant_id = p_commercant_id);
  DELETE FROM clients WHERE commercant_id = p_commercant_id;  -- push_subscriptions / fidélité en cascade
END $$;

REVOKE ALL ON FUNCTION public.purger_commandes_demo(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_purge_demo_premiere_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.abonnement_actif = true
     AND coalesce(OLD.abonnement_actif, false) = false
     AND OLD.premiere_activation_at IS NULL THEN
    PERFORM public.purger_commandes_demo(NEW.id);
    NEW.premiere_activation_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS purge_demo_premiere_activation ON public.commercants;
CREATE TRIGGER purge_demo_premiere_activation
BEFORE UPDATE OF abonnement_actif ON public.commercants
FOR EACH ROW EXECUTE FUNCTION public.trg_purge_demo_premiere_activation();
