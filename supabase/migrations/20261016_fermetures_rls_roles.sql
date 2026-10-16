-- Congés & fermetures : la policy fermetures_owner_all ne regardait que
-- commercants.auth_user_id. Les boutiques rattachées via roles_utilisateurs
-- (multi-boutiques, salariés, boutiques sans auth_user_id) prenaient un 403
-- (42501) à l'ajout d'un congé. Policy permissive en plus, alignée sur
-- commercants_update_own + accès admin.
create policy fermetures_roles_all on public.fermetures_planifiees
  for all to authenticated
  using (
    commercant_id in (select ru.commercant_id from public.roles_utilisateurs ru
      where ru.user_id = (select auth.uid()) and ru.role = any (array['commercant','salarie','admin']))
    or exists (select 1 from public.roles_utilisateurs ru where ru.user_id = (select auth.uid()) and ru.role = 'admin')
  )
  with check (
    commercant_id in (select ru.commercant_id from public.roles_utilisateurs ru
      where ru.user_id = (select auth.uid()) and ru.role = any (array['commercant','salarie','admin']))
    or exists (select 1 from public.roles_utilisateurs ru where ru.user_id = (select auth.uid()) and ru.role = 'admin')
  );
