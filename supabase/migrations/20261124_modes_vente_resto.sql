-- ============================================================
-- Modes de vente (restaurant / pizzeria / fast-food)
--
-- Le restaurateur choisit dans son dashboard :
--   * au niveau de la boutique : vente à emporter oui/non, livraison oui/non
--   * plat par plat : à emporter oui/non, en livraison oui/non
--     (ex. seuls les burgers à emporter, le reste « sur place uniquement »)
-- Par défaut tout est autorisé : aucune boutique existante ne change.
-- Ne s'applique qu'aux métiers restaurant et pizzeria (pas le fast-food).
-- ============================================================

alter table public.commercants
  add column if not exists vente_retrait   boolean not null default true,
  add column if not exists vente_livraison boolean not null default true;

comment on column public.commercants.vente_retrait is
  'Restauration : vente à emporter (click & collect) proposée. false = pas de retrait.';
comment on column public.commercants.vente_livraison is
  'Restauration : livraison proposée (en plus de l''offre livraison). false = pas de livraison.';

alter table public.catalogue
  add column if not exists vente_retrait   boolean not null default true,
  add column if not exists vente_livraison boolean not null default true;

comment on column public.catalogue.vente_retrait is
  'Restauration : ce plat peut être commandé à emporter.';
comment on column public.catalogue.vente_livraison is
  'Restauration : ce plat peut être commandé en livraison.';

-- Garde-fou serveur : chaque ligne de commande doit respecter le mode
-- (retrait / livraison) autorisé par la boutique et par le plat.
create or replace function public.modes_vente_verifier()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_type text;
  v_cid uuid;
  v_bt text;
  v_ret boolean;
  v_liv boolean;
  v_pret boolean;
  v_pliv boolean;
  v_nom text;
begin
  select c.type, c.commercant_id into v_type, v_cid
    from commandes c where c.id = new.commande_id;
  if not found then return null; end if;

  select business_type, vente_retrait, vente_livraison into v_bt, v_ret, v_liv
    from commercants where id = v_cid;
  if v_bt is null or v_bt not in ('restaurant', 'pizzeria') then
    return null;
  end if;

  if v_type = 'livraison' and not v_liv then
    raise exception 'MODE_INDISPONIBLE: la livraison n''est pas proposée' using errcode = 'P0001';
  elsif v_type is distinct from 'livraison' and not v_ret then
    raise exception 'MODE_INDISPONIBLE: la vente à emporter n''est pas proposée' using errcode = 'P0001';
  end if;

  select k.vente_retrait, k.vente_livraison, pb.nom into v_pret, v_pliv, v_nom
    from catalogue k join produits_base pb on pb.id = k.produit_base_id
   where k.commercant_id = v_cid and k.produit_base_id = new.produit_base_id
   limit 1;
  if not found then return null; end if;

  if (v_type = 'livraison' and not v_pliv)
     or (v_type is distinct from 'livraison' and not v_pret) then
    raise exception 'PRODUIT_MODE_INDISPONIBLE: « % » n''est pas disponible en %',
      v_nom, case when v_type = 'livraison' then 'livraison' else 'vente à emporter' end
      using errcode = 'P0001';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_modes_vente on public.commande_lignes;
create trigger trg_modes_vente
  after insert on public.commande_lignes
  for each row execute function public.modes_vente_verifier();
