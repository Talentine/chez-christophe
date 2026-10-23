-- Marchéo — Poids indicatif : « Côte de bœuf, environ 1,2 kg — prix ajusté à la pesée »
-- Le client commande à la pièce sur un prix estimé (prix au kg × poids moyen).
-- Le commerçant pèse à la préparation : la ligne et le total de la commande sont recalculés.

-- 1. Catalogue : réglage par produit, disponible pour tous les commerçants
alter table public.catalogue
  add column if not exists poids_indicatif boolean not null default false,
  add column if not exists poids_piece_g   integer,
  add column if not exists prix_kg         numeric(10,2),
  add column if not exists poids_ecart_pct smallint not null default 15;

alter table public.catalogue drop constraint if exists catalogue_poids_indicatif_check;
alter table public.catalogue add constraint catalogue_poids_indicatif_check check (
  poids_ecart_pct between 0 and 100
  and (not poids_indicatif or (coalesce(poids_piece_g, 0) between 10 and 50000 and coalesce(prix_kg, 0) > 0))
);

comment on column public.catalogue.poids_indicatif is 'Vendu à la pièce sur un poids moyen, prix final ajusté à la pesée';
comment on column public.catalogue.poids_piece_g   is 'Poids moyen d''une pièce, en grammes (ex : 1200 pour une côte de bœuf)';
comment on column public.catalogue.prix_kg         is 'Prix au kilo utilisé pour l''estimation et la pesée';
comment on column public.catalogue.poids_ecart_pct is 'Écart de poids annoncé au client (± %)';

-- Le prix pièce estimé est toujours dérivé du prix au kg : une seule source de vérité.
-- Pas d'offre lot sur un produit à la pesée (le prix varie d'une pièce à l'autre).
create or replace function public.catalogue_sync_poids_indicatif()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.poids_indicatif then
    new.prix_vente   := round(new.prix_kg * new.poids_piece_g / 1000.0, 2);
    new.prix_lot     := null;
    new.prix_lot_qte := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_catalogue_poids_indicatif on public.catalogue;
create trigger trg_catalogue_poids_indicatif
  before insert or update on public.catalogue
  for each row execute function public.catalogue_sync_poids_indicatif();

-- 2. Lignes de commande : on fige l'estimation et on stocke la pesée
alter table public.commande_lignes
  add column if not exists poids_indicatif boolean not null default false,
  add column if not exists prix_kg         numeric(10,2),
  add column if not exists poids_estime_g  integer,
  add column if not exists poids_reel_g    integer,
  add column if not exists total_estime    numeric(10,2),
  add column if not exists pesee_le        timestamptz;

comment on column public.commande_lignes.poids_estime_g is 'Poids total estimé de la ligne (poids moyen × quantité)';
comment on column public.commande_lignes.poids_reel_g   is 'Poids total pesé par le commerçant (NULL = pas encore pesé)';
comment on column public.commande_lignes.total_estime   is 'Montant estimé au moment de la commande';

-- 3. Checkout : prix recalculé côté serveur, pièce entière obligatoire, infos de pesée figées
CREATE OR REPLACE FUNCTION public.checkout_create_order(p_client jsonb, p_commande jsonb, p_lignes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_commercant uuid := (p_client->>'commercant_id')::uuid;
  v_email text := nullif(trim(p_client->>'email'), '');
  v_client_id uuid;
  v_commande_id uuid;
  v_l jsonb;
  v_now timestamptz := now();
  v_type text := coalesce(p_commande->>'type', 'retrait');
  v_pbid uuid;
  v_qte numeric;
  v_unit numeric;
  v_lot_qte int;
  v_lot_prix numeric;
  v_nom text;
  v_unite text;
  v_stock numeric;
  v_tva_base numeric;
  v_pi boolean;
  v_pi_g integer;
  v_pi_kg numeric;
  v_total_ligne numeric;
  v_sous_total numeric := 0;
  v_frais numeric := 0;
  v_total numeric := 0;
  v_computed jsonb := '[]'::jsonb;
begin
  if v_commercant is null or not exists (
    select 1 from commercants c where c.id = v_commercant and c.actif is not false
  ) then
    raise exception 'commercant invalide';
  end if;
  if v_email is null then
    raise exception 'email requis';
  end if;

  if p_lignes is not null then
    for v_l in select * from jsonb_array_elements(p_lignes)
    loop
      v_pbid := (v_l->>'produit_base_id')::uuid;
      v_qte  := coalesce((v_l->>'quantite')::numeric, 0);
      if v_pbid is null then
        raise exception 'produit invalide dans le panier';
      end if;
      if v_qte <= 0 then
        raise exception 'quantité invalide';
      end if;

      select coalesce(nullif(c.prix_vente, 0), pb.prix_marche_indicatif, 0),
             c.prix_lot_qte, c.prix_lot, pb.nom, pb.unite, c.stock_qte, pb.tva_pct,
             c.poids_indicatif, c.poids_piece_g, c.prix_kg
        into v_unit, v_lot_qte, v_lot_prix, v_nom, v_unite, v_stock, v_tva_base,
             v_pi, v_pi_g, v_pi_kg
      from catalogue c
      join produits_base pb on pb.id = c.produit_base_id
      where c.commercant_id = v_commercant
        and c.produit_base_id = v_pbid
      limit 1;

      if not found then
        raise exception 'produit indisponible (%)', v_pbid;
      end if;

      if v_pi then
        -- Vendu à la pièce : quantité entière
        if v_qte <> trunc(v_qte) then
          raise exception 'Quantité invalide pour % : nombre de pièces entier attendu', v_nom;
        end if;
        v_unite := 'pièce';
        v_lot_qte := null;
        v_lot_prix := null;
      end if;

      if v_stock is not null and v_stock < v_qte then
        raise exception 'Stock insuffisant pour % : il reste % (demandé %)', v_nom, v_stock, v_qte;
      end if;

      if v_lot_qte is not null and v_lot_prix is not null and v_lot_qte > 0 and v_qte >= v_lot_qte then
        v_total_ligne := floor(v_qte / v_lot_qte) * v_lot_prix
                       + (v_qte - floor(v_qte / v_lot_qte) * v_lot_qte) * v_unit;
      else
        v_total_ligne := v_unit * v_qte;
      end if;

      v_sous_total := v_sous_total + v_total_ligne;
      v_computed := v_computed || jsonb_build_object(
        'produit_base_id', v_pbid,
        'nom_produit',     v_nom,
        'unite',           v_unite,
        'quantite',        v_qte,
        'prix_unitaire',   v_unit,
        'tva_pct',         public.tva_effective(v_commercant,
                             coalesce(v_tva_base, (v_l->>'tva_pct')::numeric, 5.50)),
        'total_ligne',     v_total_ligne,
        'poids_indicatif', coalesce(v_pi, false),
        'prix_kg',         case when v_pi then v_pi_kg end,
        'poids_estime_g',  case when v_pi then (v_pi_g * v_qte)::int end,
        'total_estime',    case when v_pi then v_total_ligne end
      );
    end loop;
  end if;

  if v_type = 'livraison' then
    v_frais := greatest(coalesce((p_commande->>'frais_livraison')::numeric, 0), 0);
  end if;
  v_total := v_sous_total + v_frais;

  select id into v_client_id from clients
   where commercant_id = v_commercant and lower(email) = lower(v_email)
   order by created_at asc limit 1;

  if v_client_id is null then
    insert into clients (commercant_id, email, nom, prenom, telephone,
      sms_marketing_consent, sms_marketing_consent_at,
      email_marketing_consent, email_marketing_consent_at)
    values (v_commercant, v_email,
      p_client->>'nom', p_client->>'prenom', p_client->>'telephone',
      coalesce((p_client->>'sms_marketing_consent')::boolean, false),
      case when (p_client->>'sms_marketing_consent')::boolean
           then coalesce((p_client->>'sms_marketing_consent_at')::timestamptz, v_now) end,
      coalesce((p_client->>'email_marketing_consent')::boolean, false),
      case when (p_client->>'email_marketing_consent')::boolean
           then coalesce((p_client->>'email_marketing_consent_at')::timestamptz, v_now) end)
    returning id into v_client_id;
  else
    update clients set
      sms_marketing_consent    = sms_marketing_consent or coalesce((p_client->>'sms_marketing_consent')::boolean, false),
      sms_marketing_consent_at = coalesce(sms_marketing_consent_at,
                                   case when (p_client->>'sms_marketing_consent')::boolean then v_now end),
      email_marketing_consent    = email_marketing_consent or coalesce((p_client->>'email_marketing_consent')::boolean, false),
      email_marketing_consent_at = coalesce(email_marketing_consent_at,
                                     case when (p_client->>'email_marketing_consent')::boolean then v_now end)
    where id = v_client_id;
  end if;

  insert into commandes (commercant_id, client_id, numero, type, creneau_id,
    date_retrait, retrait_date, statut, sous_total, frais_livraison, total_ttc,
    note_client, adresse_livraison, empreinte_status, cgv_acceptees, cgv_version, cgv_acceptees_at)
  values (v_commercant, v_client_id,
    p_commande->>'numero',
    v_type,
    (p_commande->>'creneau_id')::uuid,
    (p_commande->>'date_retrait')::timestamptz,
    (p_commande->>'retrait_date')::timestamptz,
    coalesce(p_commande->>'statut', 'nouvelle'),
    v_sous_total,
    v_frais,
    v_total,
    p_commande->>'note_client',
    p_commande->>'adresse_livraison',
    coalesce(p_commande->>'empreinte_status', 'none'),
    coalesce((p_commande->>'cgv_acceptees')::boolean, false),
    p_commande->>'cgv_version',
    (p_commande->>'cgv_acceptees_at')::timestamptz)
  returning id into v_commande_id;

  for v_l in select * from jsonb_array_elements(v_computed)
  loop
    insert into commande_lignes (commande_id, produit_base_id, nom_produit, unite,
      quantite, prix_unitaire, tva_pct, total_ligne,
      poids_indicatif, prix_kg, poids_estime_g, total_estime)
    values (v_commande_id,
      (v_l->>'produit_base_id')::uuid,
      v_l->>'nom_produit',
      v_l->>'unite',
      (v_l->>'quantite')::numeric,
      (v_l->>'prix_unitaire')::numeric,
      (v_l->>'tva_pct')::numeric,
      (v_l->>'total_ligne')::numeric,
      (v_l->>'poids_indicatif')::boolean,
      (v_l->>'prix_kg')::numeric,
      (v_l->>'poids_estime_g')::int,
      (v_l->>'total_estime')::numeric);
  end loop;

  return jsonb_build_object(
    'commande_id', v_commande_id,
    'client_id',   v_client_id,
    'sous_total',  v_sous_total,
    'frais_livraison', v_frais,
    'total_ttc',   v_total
  );
end;
$function$;

-- 4. Pesée : le commerçant saisit le poids réel, la ligne et la commande sont recalculées.
--    p_poids_g NULL = annuler la pesée (retour au prix estimé).
create or replace function public.peser_ligne_commande(p_ligne_id uuid, p_poids_g integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_l commande_lignes%rowtype;
  v_cmd commandes%rowtype;
  v_nouveau numeric;
  v_delta numeric;
begin
  select * into v_l from commande_lignes where id = p_ligne_id for update;
  if not found then raise exception 'ligne introuvable'; end if;
  if not v_l.poids_indicatif then raise exception 'ce produit n''est pas vendu au poids indicatif'; end if;

  select * into v_cmd from commandes where id = v_l.commande_id for update;

  if not exists (
    select 1 from commercants m
     where m.id = v_cmd.commercant_id and m.auth_user_id = auth.uid()
    union all
    select 1 from roles_utilisateurs ru
     where ru.user_id = auth.uid()
       and (ru.role = 'admin' or (ru.commercant_id = v_cmd.commercant_id and ru.role in ('commercant','salarie')))
  ) then
    raise exception 'accès refusé';
  end if;

  if v_cmd.statut = 'annulee' then raise exception 'commande annulée'; end if;
  if p_poids_g is not null and (p_poids_g < 1 or p_poids_g > 200000) then
    raise exception 'poids invalide';
  end if;

  v_nouveau := case when p_poids_g is null
                    then coalesce(v_l.total_estime, v_l.total_ligne)
                    else round(v_l.prix_kg * p_poids_g / 1000.0, 2) end;
  v_delta := v_nouveau - coalesce(v_l.total_ligne, 0);

  update commande_lignes
     set poids_reel_g = p_poids_g,
         total_ligne  = v_nouveau,
         pesee_le     = case when p_poids_g is null then null else now() end
   where id = p_ligne_id;

  -- Delta plutôt que recalcul complet : préserve frais de livraison et toute remise déjà appliquée
  update commandes
     set sous_total = coalesce(sous_total, 0) + v_delta,
         total_ttc  = coalesce(total_ttc, 0) + v_delta
   where id = v_cmd.id
  returning * into v_cmd;

  return jsonb_build_object(
    'ligne_id',      p_ligne_id,
    'total_ligne',   v_nouveau,
    'total_estime',  v_l.total_estime,
    'poids_reel_g',  p_poids_g,
    'poids_estime_g', v_l.poids_estime_g,
    'sous_total',    v_cmd.sous_total,
    'total_ttc',     v_cmd.total_ttc,
    'reste_a_peser', (select count(*) from commande_lignes
                       where commande_id = v_cmd.id and poids_indicatif and poids_reel_g is null)
  );
end;
$$;

revoke all on function public.peser_ligne_commande(uuid, integer) from public, anon;
grant execute on function public.peser_ligne_commande(uuid, integer) to authenticated;
