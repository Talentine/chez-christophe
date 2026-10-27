-- Marchéo — Récompense fidélité déduite du panier et visible sur la commande
-- Le paiement se fait toujours en boutique : la remise est enregistrée sur la
-- commande (total_ttc reste la valeur du panier, pour le CA et les tampons) et
-- le commerçant encaisse total_ttc − remise_fidelite_cents.

alter table public.commandes
  add column if not exists remise_fidelite_cents integer not null default 0,
  add column if not exists code_fidelite text;

comment on column public.commandes.remise_fidelite_cents is 'Récompense fidélité à déduire à l''encaissement (centimes)';
comment on column public.commandes.code_fidelite         is 'Code FIDEL-XXXXXXXX utilisé sur cette commande';

-- Vérifie un code sans le consommer (bouton « Appliquer » du panier).
-- Ne renvoie que le montant : aucune donnée client exposée.
create or replace function public.verifier_code_fidelite(p_code text, p_commercant_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select montant_cents from public.fidelite_recompenses
    where code = upper(trim(p_code))
      and commercant_id = p_commercant_id
      and statut = 'disponible'
      and expire_at > now()
    limit 1
  ), 0);
$$;

grant execute on function public.verifier_code_fidelite(text, uuid) to anon, authenticated;

-- Consomme le code : uniquement dans la boutique qui l'a émis, une seule
-- remise par commande, et la remise est inscrite sur la commande.
create or replace function public.utiliser_recompense_fidelite(p_code text, p_commande_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_commercant uuid;
  v_montant integer;
  v_code text := upper(trim(p_code));
begin
  select commercant_id into v_commercant
  from public.commandes
  where id = p_commande_id and coalesce(remise_fidelite_cents, 0) = 0;

  if v_commercant is null then
    return 0;
  end if;

  update public.fidelite_recompenses
  set statut = 'utilisee', utilisee_at = now(), commande_utilisation_id = p_commande_id
  where code = v_code and commercant_id = v_commercant
    and statut = 'disponible' and expire_at > now()
  returning montant_cents into v_montant;

  if coalesce(v_montant, 0) > 0 then
    update public.commandes
    set remise_fidelite_cents = v_montant, code_fidelite = v_code
    where id = p_commande_id;
  end if;

  return coalesce(v_montant, 0);
end $function$;
