-- =============================================================================
-- CATALOGUE_BOUTIQUES.sql — séparer le catalogue général Marchéo des produits
-- créés par les boutiques (+ correctif de sécurité RLS sur produits_base).
--
-- APPLIQUÉ le 13/10/2026 (migrations produits_base_global_securite,
-- produits_base_garde_trigger, produits_base_rls_update_securite,
-- personnaliser_produit, seed_catalogue_global_seulement), sauf l'étape 0 :
-- les produits de test ont seulement été désactivés (actif = false partout),
-- leur suppression définitive reste à lancer.
-- Rejouable sans risque (if not exists / create or replace).
-- =============================================================================

begin;

-- 0. Suppression des produits de test (aucune commande ni panier ne les référence).
delete from public.catalogue where produit_base_id in ('ff8fee34-2c38-485b-9a23-8cb26d03e4c4','2b7d3f28-d676-45d6-a27f-f3f16f9f623b');
delete from public.produits_base where id in ('ff8fee34-2c38-485b-9a23-8cb26d03e4c4','2b7d3f28-d676-45d6-a27f-f3f16f9f623b');

-- 1. Colonnes : global (catalogue Marchéo) et boutique créatrice.
alter table public.produits_base
  add column if not exists global boolean not null default true,
  add column if not exists commercant_id uuid references public.commercants(id) on delete set null;
comment on column public.produits_base.global is 'true = catalogue général Marchéo (copié dans les nouvelles boutiques). false = produit propre à une boutique.';
comment on column public.produits_base.commercant_id is 'Boutique qui a créé le produit (null = créé par Marchéo).';
create index if not exists produits_base_commercant_idx on public.produits_base(commercant_id) where commercant_id is not null;

-- 2. Rattrapage : produits créés par des boutiques restés dans le catalogue général.
update public.produits_base set global = false, commercant_id = '21b28375-ee05-415a-8e7f-28e70554846b'  -- Mims Primeur
 where id in ('07adc922-60de-4bdc-b00a-5626d6258393','63de7f2d-2b77-4e9c-85fc-230a627633af','5d1d97cc-53ee-4f22-b912-516ad2c99213');
update public.produits_base set global = false, commercant_id = '63689509-8ba4-4bed-b801-2a8090ab613b'  -- Le pétrin
 where id in ('d6aeb1a6-432c-46be-9d02-9c8bc2817672','8d1dbe29-21df-4167-8135-cc64e7267c85');

-- 3. Garde-fou (marche aussi avec une ancienne version de l'app ouverte) :
--    un non-admin crée toujours un produit privé rattaché à sa boutique et ne
--    peut jamais changer global / commercant_id.
create or replace function public.produits_base_garde()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or exists (select 1 from roles_utilisateurs where user_id = v_uid and role = 'admin') then
    return new;  -- service_role / admin
  end if;
  if tg_op = 'INSERT' then
    new.global := false;
    if new.commercant_id is null or not exists (
      select 1 from roles_utilisateurs
       where user_id = v_uid and commercant_id = new.commercant_id
         and role in ('commercant','salarie')) then
      new.commercant_id := (select commercant_id from roles_utilisateurs
                             where user_id = v_uid and role in ('commercant','salarie')
                               and commercant_id is not null
                             order by (role = 'commercant') desc limit 1);
    end if;
  else
    new.global := old.global;
    new.commercant_id := old.commercant_id;
  end if;
  return new;
end;
$$;
create or replace trigger produits_base_garde before insert or update on public.produits_base
  for each row execute function public.produits_base_garde();

-- 4. RLS : un commerçant ne modifie plus QUE les produits de sa boutique
--    (avant : n'importe quel produit du catalogue général, pour toutes les boutiques).
alter policy produits_base_commercant_update on public.produits_base
  using (global = false and commercant_id in (
    select ru.commercant_id from roles_utilisateurs ru
     where ru.user_id = (select auth.uid()) and ru.role in ('commercant','salarie')))
  with check (global = false and commercant_id in (
    select ru.commercant_id from roles_utilisateurs ru
     where ru.user_id = (select auth.uid()) and ru.role in ('commercant','salarie')));

-- 5. Personnaliser un produit : met à jour un produit de la boutique, ou crée une
--    copie propre à la boutique si c'est un produit du catalogue général (sa ligne
--    catalogue y est rattachée, les autres boutiques gardent la fiche d'origine).
create or replace function public.personnaliser_produit(p_catalogue_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cat catalogue%rowtype;
  v_pb produits_base%rowtype;
  v_new uuid;
begin
  select * into v_cat from catalogue where id = p_catalogue_id;
  if not found then raise exception 'Ligne catalogue introuvable'; end if;
  if not exists (
    select 1 from roles_utilisateurs
     where user_id = auth.uid() and commercant_id = v_cat.commercant_id
       and role in ('commercant','salarie','admin')) then
    raise exception 'Non autorisé' using errcode = 'insufficient_privilege';
  end if;
  select * into v_pb from produits_base where id = v_cat.produit_base_id;

  if not v_pb.global and v_pb.commercant_id = v_cat.commercant_id then
    v_new := v_pb.id;
  else
    insert into produits_base (categorie_id, nom, slug, unite, description, photo_url,
      photo_url_medium, photo_url_full, prix_marche_indicatif, tva_pct, saisonnier, mois_dispo,
      actif, provenance, badge_local, badge_nouveau, badge_bio, global, commercant_id)
    values (v_pb.categorie_id, v_pb.nom,
      left(v_pb.slug, 60) || '-' || (extract(epoch from clock_timestamp()) * 1000)::bigint,
      v_pb.unite, v_pb.description, v_pb.photo_url, v_pb.photo_url_medium, v_pb.photo_url_full,
      v_pb.prix_marche_indicatif, v_pb.tva_pct, v_pb.saisonnier, v_pb.mois_dispo, true,
      v_pb.provenance, v_pb.badge_local, v_pb.badge_nouveau, v_pb.badge_bio, false, v_cat.commercant_id)
    returning id into v_new;
    update catalogue set produit_base_id = v_new where id = p_catalogue_id;
  end if;

  update produits_base set
    nom          = coalesce(p_data->>'nom', nom),
    unite        = coalesce(p_data->>'unite', unite),
    photo_url    = case when p_data ? 'photo_url' then p_data->>'photo_url' else photo_url end,
    photo_url_medium = case when p_data ? 'photo_url' then p_data->>'photo_url' else photo_url_medium end,
    photo_url_full   = case when p_data ? 'photo_url' then p_data->>'photo_url' else photo_url_full end,
    categorie_id = coalesce((p_data->>'categorie_id')::uuid, categorie_id),
    description  = case when p_data ? 'description' then p_data->>'description' else description end,
    provenance   = case when p_data ? 'provenance' then p_data->>'provenance' else provenance end,
    saisonnier   = coalesce((p_data->>'saisonnier')::boolean, saisonnier),
    badge_local  = coalesce((p_data->>'badge_local')::boolean, badge_local),
    badge_nouveau = coalesce((p_data->>'badge_nouveau')::boolean, badge_nouveau),
    badge_bio    = coalesce((p_data->>'badge_bio')::boolean, badge_bio)
  where id = v_new;
  return v_new;
end;
$$;
revoke all on function public.personnaliser_produit(uuid, jsonb) from public, anon;
grant execute on function public.personnaliser_produit(uuid, jsonb) to authenticated;

-- 6. Un produit de boutique n'entre que dans le catalogue de SA boutique.
--    Couvre seed_catalogue_for_commercant, reseed_catalogue et
--    fn_creer_demo_ambassadeur (qui copient tous les produits du métier).
create or replace function public.catalogue_refus_produit_autre_boutique()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from produits_base pb
              where pb.id = new.produit_base_id and not pb.global
                and pb.commercant_id is distinct from new.commercant_id) then
    return null;  -- ignoré silencieusement : les seeds en masse continuent
  end if;
  return new;
end;
$$;
create or replace trigger catalogue_refus_produit_autre_boutique before insert on public.catalogue
  for each row execute function public.catalogue_refus_produit_autre_boutique();

-- 7. La régénération photo ne touche jamais un produit de boutique.
create or replace function public.photo_regen_refus_boutique()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (select 1 from produits_base where id = new.produit_id and not global) then
    raise exception 'Produit de boutique exclu de la régénération photo : %', new.produit_id;
  end if;
  return new;
end;
$$;
create or replace trigger photo_regen_refus_boutique before insert on public.photo_regen
  for each row execute function public.photo_regen_refus_boutique();

commit;
