-- Marchéo — Support Belgique : pays du commerçant + TVA selon le pays
-- À exécuter dans Supabase > SQL Editor (projet "click")

-- 1. Pays du commerçant (tous les commerçants existants passent en FR)
alter table public.commercants
  add column if not exists pays char(2) not null default 'FR';
alter table public.commercants
  drop constraint if exists commercants_pays_check;
alter table public.commercants
  add constraint commercants_pays_check check (pays in ('FR','BE'));
comment on column public.commercants.pays is 'Pays du commerce (FR, BE). Pilote le taux de TVA appliqué.';

-- 2. Vue commercants_actifs : ajout de pays (en fin de liste, rien d'autre ne change)
create or replace view public.commercants_actifs with (security_invoker = true) as
 SELECT id, created_at, nom_boutique, slug, nom_gerant, email, telephone, adresse, ville, code_postal,
    latitude, longitude, description, slogan, logo_url, photo_banniere_url, couleur_principale, couleur_accent,
    photos_boutique, horaires, option_click_collect, option_livraison, zone_livraison_km, frais_livraison,
    minimum_commande_livraison, empreinte_active, empreinte_seuil, empreinte_frais_noshow, empreinte_delai_annulation_h,
    bandeau_actif, bandeau_texte, fermeture_exceptionnelle, fermeture_message, instagram, facebook, plan_id,
    abonnement_actif, abonnement_debut, abonnement_fin, stripe_customer_id, stripe_subscription_id, stripe_connect_id,
    stripe_connect_actif, auth_user_id, actif, en_pause, zone_livraison, min_commande_livraison, rayon_livraison_km,
    adresse_latitude, adresse_longitude, seuil_livraison_gratuite, hero_photo_url, business_type, business_config,
    favicon_url, empreinte_obligatoire, no_show_pct, cgv_plateforme_acceptees, cgv_plateforme_version,
    cgv_plateforme_acceptees_at, charte_acceptee, charte_acceptee_at, offre, media_urls, business_types_secondaires,
    palette, code_promo_utilise, code_promo_id, frais_acquisition_paye, mois_offerts, texte_histoire,
    rayons_images_custom, stripe_setup_session_id, cancellation_policy_hours, empreinte_couvert_cents,
    delai_min_retrait_min, delai_min_livraison_min, delai_min_reservation_min, supprime_at, supprime_motif, anonymized,
    pays
   FROM commercants
  WHERE supprime_at IS NULL;

-- 3. Conversion du taux FR (catalogue de base) vers le taux du pays du commerçant
--    FR : inchangé. BE : 6 % (alimentaire), 21 % si le taux FR est le taux normal (20 %).
create or replace function public.tva_effective(p_commercant uuid, p_tva_fr numeric)
returns numeric
language sql
stable
set search_path to 'public'
as $$
  select case coalesce((select pays from commercants where id = p_commercant), 'FR')
    when 'BE' then case when coalesce(p_tva_fr, 5.50) >= 20 then 21.00 else 6.00 end
    else coalesce(p_tva_fr, 5.50)
  end;
$$;

-- 4. Checkout : la TVA vient du catalogue (serveur) puis est adaptée au pays.
--    Seule la ligne 'tva_pct' et le SELECT (ajout de pb.tva_pct) changent.
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
             c.prix_lot_qte, c.prix_lot, pb.nom, pb.unite, c.stock_qte, pb.tva_pct
        into v_unit, v_lot_qte, v_lot_prix, v_nom, v_unite, v_stock, v_tva_base
      from catalogue c
      join produits_base pb on pb.id = c.produit_base_id
      where c.commercant_id = v_commercant
        and c.produit_base_id = v_pbid
      limit 1;

      if not found then
        raise exception 'produit indisponible (%)', v_pbid;
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
        'total_ligne',     v_total_ligne
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
      quantite, prix_unitaire, tva_pct, total_ligne)
    values (v_commande_id,
      (v_l->>'produit_base_id')::uuid,
      v_l->>'nom_produit',
      v_l->>'unite',
      (v_l->>'quantite')::numeric,
      (v_l->>'prix_unitaire')::numeric,
      (v_l->>'tva_pct')::numeric,
      (v_l->>'total_ligne')::numeric);
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
