-- ============================================================================
-- CHECKOUT_HARDENING.sql
-- Durcissement de checkout_create_order : recalcul serveur des prix + anti-survente.
--
-- Contexte : l'ancienne version insérait prix_unitaire / total_ligne / sous_total
-- / total_ttc TELS QUELS depuis le payload client → un client pouvait forger une
-- commande à n'importe quel prix (ex. total_ttc = 0.01).
--
-- Cette version IGNORE tous les montants du payload et les recalcule depuis le
-- catalogue de référence (catalogue.prix_vente, offre lot prix_lot/prix_lot_qte,
-- fallback produits_base.prix_marche_indicatif). Elle bloque aussi la survente
-- (catalogue.stock_qte ; NULL = illimité), en complément du trigger de décrément.
--
-- Le client (panier.html) utilise désormais le total_ttc RENVOYÉ par cette RPC
-- pour calculer le montant de l'empreinte Stripe (anti-minoration de la pré-auto).
--
-- Appliqué en prod le 2026-06-12 (migration: harden_checkout_create_order_server_pricing).
-- ============================================================================

create or replace function public.checkout_create_order(p_client jsonb, p_commande jsonb, p_lignes jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_commercant uuid := (p_client->>'commercant_id')::uuid;
  v_email text := nullif(trim(p_client->>'email'), '');
  v_client_id uuid;
  v_commande_id uuid;
  v_l jsonb;
  v_now timestamptz := now();
  v_type text := coalesce(p_commande->>'type', 'retrait');
  -- recalcul serveur
  v_pbid uuid;
  v_qte numeric;
  v_unit numeric;
  v_lot_qte int;
  v_lot_prix numeric;
  v_nom text;
  v_unite text;
  v_stock numeric;
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

  -- ════════════════════════════════════════════════════════════════
  -- RECALCUL SERVEUR DES PRIX (anti-fraude) : on ignore TOUS les
  -- montants du payload client (prix_unitaire, total_ligne, sous_total,
  -- total_ttc) et on les recalcule depuis le catalogue de référence.
  -- Bloque aussi la survente (stock_qte NULL = illimité).
  -- ════════════════════════════════════════════════════════════════
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
             c.prix_lot_qte, c.prix_lot, pb.nom, pb.unite, c.stock_qte
        into v_unit, v_lot_qte, v_lot_prix, v_nom, v_unite, v_stock
      from catalogue c
      join produits_base pb on pb.id = c.produit_base_id
      where c.commercant_id = v_commercant
        and c.produit_base_id = v_pbid
      limit 1;

      if not found then
        raise exception 'produit indisponible (%)', v_pbid;
      end if;

      -- Garde-fou stock côté serveur (en plus du trigger de décrément)
      if v_stock is not null and v_stock < v_qte then
        raise exception 'Stock insuffisant pour % : il reste % (demandé %)', v_nom, v_stock, v_qte;
      end if;

      -- Prix ligne : offre lot du commerçant si configurée et quantité
      -- atteinte, sinon prix unitaire. (Le client ne contrôle ni le prix
      -- unitaire ni l'offre lot : tout vient du catalogue.)
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
        'tva_pct',         coalesce((v_l->>'tva_pct')::numeric, 5.50),
        'total_ligne',     v_total_ligne
      );
    end loop;
  end if;

  -- Frais de livraison : appliqués uniquement en livraison, jamais négatifs.
  if v_type = 'livraison' then
    v_frais := greatest(coalesce((p_commande->>'frais_livraison')::numeric, 0), 0);
  end if;
  v_total := v_sous_total + v_frais;

  -- ── CLIENT : créer ou retrouver (inchangé) ──
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

  -- ── COMMANDE : totaux RECALCULÉS serveur (v_sous_total / v_frais / v_total) ──
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

  -- ── LIGNES : prix RECALCULÉS serveur (v_computed) ──
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
