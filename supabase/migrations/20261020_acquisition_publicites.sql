-- ============================================================
-- Acquisition publicitaire : relier chaque boutique (démo puis abonnement payé)
-- à la campagne Facebook / Instagram qui l'a amenée.
--
-- Rempli par inscription.html (enregistrerAcquisition) à la création de la boutique :
--   { "utm": { "utm_source": "facebook", "utm_campaign": "...", "utm_content": "PRI-01-916", ... },
--     "consent_pub": "oui" | "non" | null, "page": "/inscription", "at": "2026-10-20T..." }
-- Lu par la vue ci-dessous (CAC par création publicitaire).
-- ============================================================

alter table public.commercants
  add column if not exists acquisition jsonb;

create index if not exists commercants_acquisition_campagne_idx
  on public.commercants ((acquisition -> 'utm' ->> 'utm_campaign'));

-- Une ligne par création publicitaire (utm_content) : démos créées, frais d'installation payés
-- (stripe_setup_session_id, posé par le webhook stripe-setup-fee) et abonnés toujours actifs. Le CAC se calcule en divisant la dépense Meta par `payes`.
create or replace view public.v_acquisition_pub
with (security_invoker = true) as
select
  coalesce(acquisition -> 'utm' ->> 'utm_source',   '(direct)') as source,
  coalesce(acquisition -> 'utm' ->> 'utm_campaign', '(aucune)') as campagne,
  coalesce(acquisition -> 'utm' ->> 'utm_term',     '(aucun)')  as ensemble,
  coalesce(acquisition -> 'utm' ->> 'utm_content',  '(aucune)') as creation,
  business_type                                                 as metier,
  count(*)                                                      as demos,
  count(*) filter (where stripe_setup_session_id is not null)   as payes,
  count(*) filter (where abonnement_actif and stripe_setup_session_id is not null) as actifs,
  count(*) filter (where stripe_setup_session_id is not null and offre = 'clickcollect') as payes_clickcollect,
  min(created_at)                                               as premiere_demo,
  max(abonnement_debut)                                         as dernier_paiement
from public.commercants
where coalesce(is_fixture, false) = false
group by 1, 2, 3, 4, 5;

comment on view public.v_acquisition_pub is
  'Démos et abonnements payés par création publicitaire (utm_content). Lecture admin (service role).';

revoke all on public.v_acquisition_pub from anon, authenticated;
