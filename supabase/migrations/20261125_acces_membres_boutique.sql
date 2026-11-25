-- 25/11/2026 — Accès complet des membres d'une boutique (patron + salariés)
-- et création des rôles salariés par le patron. Déjà appliquée en production.
create or replace function public.est_membre_boutique(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from roles_utilisateurs
    where user_id = auth.uid() and commercant_id = cid
      and role in ('commercant','salarie','admin')
  ) or exists (select 1 from commercants where id = cid and auth_user_id = auth.uid());
$$;
revoke all on function public.est_membre_boutique(uuid) from public;
grant execute on function public.est_membre_boutique(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['avis','client_segments','clients','commandes','fermetures_planifiees','fidelite_recompenses','notification_templates','notifications_envoyees','paniers_thematiques','quotas_notifications','reservations']
  loop
    execute format('drop policy if exists %I on public.%I', t||'_membres_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.est_membre_boutique(commercant_id)) with check (public.est_membre_boutique(commercant_id))', t||'_membres_all', t);
  end loop;
end $$;

drop policy if exists commande_lignes_membres_all on public.commande_lignes;
create policy commande_lignes_membres_all on public.commande_lignes for all to authenticated
  using (exists (select 1 from commandes c where c.id = commande_id and public.est_membre_boutique(c.commercant_id)))
  with check (exists (select 1 from commandes c where c.id = commande_id and public.est_membre_boutique(c.commercant_id)));

drop policy if exists panier_lignes_membres_all on public.panier_lignes;
create policy panier_lignes_membres_all on public.panier_lignes for all to authenticated
  using (exists (select 1 from paniers_thematiques p where p.id = panier_id and public.est_membre_boutique(p.commercant_id)))
  with check (exists (select 1 from paniers_thematiques p where p.id = panier_id and public.est_membre_boutique(p.commercant_id)));

drop policy if exists roles_insert_proprietaire on public.roles_utilisateurs;
create policy roles_insert_proprietaire on public.roles_utilisateurs for insert to authenticated
  with check (role in ('salarie','commercant') and commercant_id is not null
    and exists (select 1 from commercants m where m.id = commercant_id and m.auth_user_id = auth.uid()));
