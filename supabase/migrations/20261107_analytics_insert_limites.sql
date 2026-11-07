-- Analytics : l'écriture publique (clé anon) reste ouverte au tracker,
-- mais bornée pour éviter le remplissage abusif et l'antidatage des événements.
-- Lecture inchangée : réservée aux admins (policy analytics_read_admin).

drop policy if exists analytics_insert_public on public.analytics_events;
create policy analytics_insert_public on public.analytics_events
  for insert to anon, authenticated
  with check (
    length(event) between 1 and 60
    and (page is null or length(page) <= 200)
    and (slug is null or length(slug) <= 200)
    and (referrer is null or length(referrer) <= 255)
    and (device is null or device in ('mobile', 'tablet', 'desktop'))
    and (country is null or length(country) <= 8)
    and (meta is null or pg_column_size(meta) <= 4000)
    and created_at between now() - interval '5 minutes' and now() + interval '5 minutes'
  );

-- Le public n'a besoin que d'INSERT (les autres droits étaient déjà neutralisés par RLS,
-- sauf TRUNCATE qui ne passe pas par RLS).
revoke update, delete, truncate, references, trigger on public.analytics_events from anon, authenticated;
