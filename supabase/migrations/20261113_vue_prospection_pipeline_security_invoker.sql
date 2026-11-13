-- Vue v_prospection_pipeline : fin du contournement du RLS (alerte ERROR
-- « security_definer_view » de l'analyse de sécurité Supabase).
--
-- Créée le 01/09 (prospection_crm) sans security_invoker, la vue s'exécutait avec
-- les droits de son propriétaire : elle ignorait le RLS de public.prospects (RLS
-- activé, aucune policy = service role uniquement) et la clé publique pouvait la
-- lire. Elle ne renvoie que des compteurs par statut (nb, avec_email, score_moyen)
-- et public.prospects est vide à ce jour : rien n'a fuité.
--
-- Personne ne la lit avec la clé publique ni avec un compte connecté (ni admin.html,
-- ni fonction Edge, ni fonction SQL, ni cron) : même traitement que v_acquisition_pub,
-- v_ambassadeur_demos et v_stripe_connect_status.
--   * security_invoker : la vue applique désormais le RLS de celui qui l'interroge ;
--   * plus aucun droit pour anon / authenticated : lecture service role uniquement.
--
-- Attention si la vue est recréée un jour : les droits par défaut du schéma public
-- redonnent tout à anon / authenticated. Reprendre alors « with (security_invoker = on) »
-- dans la définition et rejouer le revoke ci-dessous.

alter view public.v_prospection_pipeline set (security_invoker = on);

revoke all on public.v_prospection_pipeline from anon, authenticated;
