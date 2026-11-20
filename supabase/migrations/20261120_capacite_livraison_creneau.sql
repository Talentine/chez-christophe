-- Nombre maximum de livraisons par créneau (creneaux.capacite_max).
-- Jusqu'ici capacite_max était saisi dans l'app commerçant mais jamais contrôlé.
-- Actif pour toutes les boutiques. Pour en exclure une :
-- commercants.business_config->>'limiter_livraisons_par_creneau' = 'false'.
-- Seules les commandes en livraison sont comptées ; une commande annulée ou une
-- empreinte bancaire abandonnée depuis plus de 30 min libère sa place.

create or replace function public.livraison_limite_active(p_commercant uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select coalesce((business_config->>'limiter_livraisons_par_creneau')::boolean, true)
  from commercants where id = p_commercant;
$$;
revoke all on function public.livraison_limite_active(uuid) from public, anon, authenticated;

-- Pour la page panier : nombre de livraisons déjà prises par créneau et par date.
-- Ne renvoie que des comptes agrégés (aucune donnée client). NULL si l'option est inactive.
create or replace function public.livraisons_occupation(p_commercant uuid)
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select case when public.livraison_limite_active(p_commercant) then coalesce((
    select jsonb_agg(jsonb_build_object(
             'creneau_id', o.creneau_id,
             'debut', to_char(o.date_retrait at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'),
             'n', o.n))
    from (
      select k.creneau_id, k.date_retrait, count(*) n
      from commandes k
      where k.commercant_id = p_commercant
        and k.type = 'livraison'
        and k.creneau_id is not null
        and k.date_retrait >= now() - interval '1 day'
        and k.statut <> 'annulee'
        and not (k.statut = 'empreinte_pending' and k.created_at < now() - interval '30 minutes')
      group by k.creneau_id, k.date_retrait) o), '[]'::jsonb)
  end;
$$;
grant execute on function public.livraisons_occupation(uuid) to anon, authenticated;

-- Garde-fou serveur à la création de la commande. Verrou par commerçant pour
-- éviter que deux commandes simultanées dépassent la limite.
create or replace function public.livraison_verifier_capacite()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_cap integer;
  v_pris integer;
begin
  if new.type is distinct from 'livraison' or new.creneau_id is null or new.date_retrait is null
     or new.statut = 'annulee' or not public.livraison_limite_active(new.commercant_id) then
    return new;
  end if;
  select capacite_max into v_cap from creneaux where id = new.creneau_id;
  if v_cap is null or v_cap <= 0 then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('livraison:' || new.commercant_id::text));

  select count(*) into v_pris
  from commandes k
  where k.commercant_id = new.commercant_id
    and k.type = 'livraison'
    and k.creneau_id = new.creneau_id
    and k.date_retrait = new.date_retrait
    and k.statut <> 'annulee'
    and not (k.statut = 'empreinte_pending' and k.created_at < now() - interval '30 minutes');

  if v_pris >= v_cap then
    raise exception 'CRENEAU_COMPLET: ce créneau de livraison est complet, choisissez-en un autre'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_livraison_capacite on public.commandes;
create trigger trg_livraison_capacite
  before insert on public.commandes
  for each row execute function public.livraison_verifier_capacite();
