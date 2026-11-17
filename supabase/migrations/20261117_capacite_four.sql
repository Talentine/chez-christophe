-- Capacité du four : nombre maximum d'articles (ex. pizzas) par créneau.
-- Réglé par le commerçant. NULL = pas de limite.
-- Les créneaux retrait et livraison qui se chevauchent partagent le même four.

alter table public.commercants
  add column if not exists four_max_par_creneau integer
    check (four_max_par_creneau is null or four_max_par_creneau > 0),
  add column if not exists four_categories uuid[] not null default '{}';

comment on column public.commercants.four_max_par_creneau is
  'Max d''articles des catégories four_categories par créneau (NULL = illimité)';

-- Quantité « four » déjà engagée sur une fenêtre [p_debut, p_fin[
create or replace function public.four_qte_fenetre(
  p_commercant uuid, p_debut timestamptz, p_fin timestamptz, p_exclure uuid default null)
returns numeric
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(sum(l.quantite), 0)
  from commandes k
  join commande_lignes l on l.commande_id = k.id
  join produits_base pb on pb.id = l.produit_base_id
  join commercants c on c.id = k.commercant_id
  where k.commercant_id = p_commercant
    and k.date_retrait >= p_debut and k.date_retrait < p_fin
    and k.statut <> 'annulee'
    and not (k.statut = 'empreinte_pending' and k.created_at < now() - interval '30 minutes')
    and (p_exclure is null or k.id <> p_exclure)
    and pb.categorie_id = any(c.four_categories);
$$;
revoke all on function public.four_qte_fenetre(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;

-- Pour la page panier : limite, produits du panier qui comptent, occupation à venir.
-- Ne renvoie que des quantités agrégées (aucune donnée client).
create or replace function public.four_etat(p_commercant uuid, p_produits uuid[])
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object(
    'max', c.four_max_par_creneau,
    'produits', coalesce((
      select jsonb_agg(pb.id) from produits_base pb
      where pb.id = any(p_produits) and pb.categorie_id = any(c.four_categories)), '[]'::jsonb),
    'occupation', coalesce((
      select jsonb_agg(jsonb_build_object(
               'debut', to_char(o.debut at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'),
               'qte', o.qte))
      from (
        select k.date_retrait debut, sum(l.quantite) qte
        from commandes k
        join commande_lignes l on l.commande_id = k.id
        join produits_base pb on pb.id = l.produit_base_id
        where k.commercant_id = c.id
          and k.date_retrait >= now() - interval '1 day'
          and k.statut <> 'annulee'
          and not (k.statut = 'empreinte_pending' and k.created_at < now() - interval '30 minutes')
          and pb.categorie_id = any(c.four_categories)
        group by k.date_retrait) o), '[]'::jsonb)
  )
  from commercants c
  where c.id = p_commercant and c.four_max_par_creneau is not null;
$$;
grant execute on function public.four_etat(uuid, uuid[]) to anon, authenticated;

-- Garde-fou serveur : vérifié à chaque ligne insérée (le cumul de la
-- commande grandit ligne après ligne, la dernière fait foi). Verrou par commerçant pour
-- éviter que deux commandes simultanées dépassent la limite.
create or replace function public.four_verifier_capacite()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_cmd commandes%rowtype;
  v_max integer;
  v_cats uuid[];
  v_duree interval;
  v_moi numeric;
  v_autres numeric;
begin
  select * into v_cmd from commandes where id = new.commande_id;
  if not found or v_cmd.date_retrait is null or v_cmd.statut = 'annulee' then
    return null;
  end if;
  select four_max_par_creneau, four_categories into v_max, v_cats
    from commercants where id = v_cmd.commercant_id;
  if v_max is null or coalesce(array_length(v_cats, 1), 0) = 0 then
    return null;
  end if;

  select coalesce(sum(l.quantite), 0) into v_moi
  from commande_lignes l join produits_base pb on pb.id = l.produit_base_id
  where l.commande_id = v_cmd.id and pb.categorie_id = any(v_cats);
  if v_moi = 0 then return null; end if;

  perform pg_advisory_xact_lock(hashtext('four:' || v_cmd.commercant_id::text));

  select coalesce(cr.heure_fin - cr.heure_debut, interval '30 minutes') into v_duree
    from creneaux cr where cr.id = v_cmd.creneau_id;
  if v_duree is null or v_duree <= interval '0' then v_duree := interval '30 minutes'; end if;

  v_autres := four_qte_fenetre(v_cmd.commercant_id, v_cmd.date_retrait,
                               v_cmd.date_retrait + v_duree, v_cmd.id);
  if v_autres + v_moi > v_max then
    raise exception 'FOUR_COMPLET: il reste % place(s) au four sur ce créneau (demandé %)',
      greatest(v_max - v_autres, 0)::int, v_moi::int
      using errcode = 'P0001';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_four_capacite on public.commande_lignes;
create trigger trg_four_capacite
  after insert on public.commande_lignes
  for each row execute function public.four_verifier_capacite();
