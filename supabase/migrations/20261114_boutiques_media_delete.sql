-- Marchéo — Suppression des photos/vidéos de boutique
-- Le bucket "boutiques-media" n'avait aucune policy DELETE : la suppression depuis
-- le dashboard commerçant était refusée en silence. On l'autorise uniquement dans
-- le dossier {slug}/ d'une boutique que l'utilisateur gère (ou pour un admin).

drop policy if exists "Delete boutiques-media own" on storage.objects;
create policy "Delete boutiques-media own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'boutiques-media'
    and (
      exists (
        select 1
        from public.commercants c
        join public.roles_utilisateurs ru on ru.commercant_id = c.id
        where c.slug = (storage.foldername(name))[1]
          and ru.user_id = (select auth.uid())
          and ru.role = any (array['commercant','salarie','admin'])
      )
      or exists (
        select 1 from public.roles_utilisateurs ru
        where ru.user_id = (select auth.uid()) and ru.role = 'admin'
      )
    )
  );
