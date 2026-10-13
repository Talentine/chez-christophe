-- =============================================================================
-- PHOTO_REGEN.sql — file d'import des photos catalogue régénérées (Higgsfield)
-- Appliqué le 2026-10-13 (migration "photo_regen_queue").
-- Voir generate-catalogue/PHOTOS_V2.md pour le pipeline complet.
-- =============================================================================

create table if not exists public.photo_regen (
  id bigserial primary key,
  produit_id uuid not null references public.produits_base(id) on delete cascade,
  metier text not null,
  slug text not null,
  job_id uuid not null unique,
  source_url text not null,
  statut text not null default 'a_importer' check (statut in ('a_importer','importe','erreur','annule')),
  erreur text,
  old_photo_url text,
  old_photo_url_medium text,
  old_photo_url_full text,
  new_url text,
  created_at timestamptz not null default now(),
  imported_at timestamptz
);
alter table public.photo_regen enable row level security;
-- Aucune policy : accessible uniquement par la service_role.

-- Import automatique : toutes les minutes tant que la file n'est pas vide.
select cron.schedule('import-photos-regen', '* * * * *', $$
  select net.http_post(
    url := 'https://epvdzhzwfmtnioedyfgm.supabase.co/functions/v1/import-photos-regen',
    body := '{"limite":6}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 120000)
  where exists (select 1 from public.photo_regen where statut = 'a_importer')
$$);

-- ── Rollback d'un produit (ou de tout un métier) vers l'ancienne photo ──────
-- update produits_base p
--    set photo_url = r.old_photo_url,
--        photo_url_medium = r.old_photo_url_medium,
--        photo_url_full = r.old_photo_url_full
--   from photo_regen r
--  where r.produit_id = p.id and r.statut = 'importe' and r.slug = 'pomme-chantecler';
