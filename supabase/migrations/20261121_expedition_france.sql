-- ════════════════════════════════════════════════════════════════════
-- EXPÉDITION FRANCE (Chronofresh / Chronopost) — option payante
--
-- Troisième mode de commande, à côté du retrait et de la livraison locale :
-- le commerçant expédie un colis partout en France métropolitaine.
--
--   * L'option n'est ouverte que par un ADMIN Marchéo (expedition_reglages.active).
--     Le commerçant peut seulement la demander, puis la régler une fois activée.
--   * Chaque commerçant expédie avec SON contrat Chronopost (expedition_comptes,
--     table privée : jamais lisible par le public).
--   * Les frais sont calculés côté serveur, au poids, d'après la grille du
--     commerçant (expedition_devis). Le panier affiche ce même devis.
--   * La commande est payée en ligne à la commande (statut paiement_pending
--     → nouvelle), voir l'Edge Function `expedition`.
--
-- Aucun effet sur les boutiques existantes tant que l'option n'est pas activée.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Droits ───────────────────────────────────────────────────────
-- Admin Marchéo, ou appel serveur (service_role), ou connexion SQL directe
-- (pas de JWT : réservé aux accès privilégiés à la base).
create or replace function public.expedition_est_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select auth.role() is null
      or auth.role() = 'service_role'
      or exists (select 1 from roles_utilisateurs ru
                  where ru.user_id = auth.uid() and ru.role = 'admin');
$$;

-- Gérant de la boutique (propriétaire du compte ou rôle commerçant), ou admin.
create or replace function public.expedition_est_gerant(p_commercant uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.expedition_est_admin()
      or exists (select 1 from commercants c
                  where c.id = p_commercant and c.auth_user_id = auth.uid())
      or exists (select 1 from roles_utilisateurs ru
                  where ru.user_id = auth.uid() and ru.commercant_id = p_commercant
                    and ru.role in ('commercant', 'admin'));
$$;

-- ── 2. Réglages de l'option (lecture publique : le panier en a besoin) ──
create table if not exists public.expedition_reglages (
  commercant_id uuid primary key references public.commercants(id) on delete cascade,
  -- Activation : ADMIN uniquement (verrouillé par trigger)
  active boolean not null default false,
  activee_le timestamptz,
  -- Demande d'activation faite par le commerçant depuis ses réglages
  demandee_le timestamptz,
  -- Interrupteur du commerçant : accepte les commandes à expédier
  ouverte boolean not null default false,
  -- true = Chronofresh (camion réfrigéré) · false = Chrono 13 (température ambiante)
  mode_froid boolean not null default true,
  -- Jours de remise des colis au transporteur (ISO : 1 = lundi … 5 = vendredi)
  jours_expedition smallint[] not null default '{1,2,3,4}',
  -- Commande passée après cette heure : préparation comptée à partir du lendemain
  heure_limite time not null default '12:00',
  delai_preparation_jours smallint not null default 1
    check (delai_preparation_jours between 0 and 10),
  min_commande numeric not null default 30 check (min_commande >= 0),
  seuil_gratuite numeric check (seuil_gratuite is null or seuil_gratuite > 0),
  -- Grille au poids : [{ "max_kg": 2, "prix": 19.9 }, …] — vide tant que le
  -- commerçant n'a pas saisi les tarifs de SON contrat.
  grille jsonb not null default '[]'::jsonb,
  poids_emballage_g integer not null default 800 check (poids_emballage_g >= 0),
  -- Poids retenu pour un produit à la pièce dont le poids n'est pas renseigné
  poids_defaut_g integer not null default 300 check (poids_defaut_g > 0),
  -- Date limite de consommation imprimée sur l'étiquette Chronofresh : expédition + N jours
  dlc_jours smallint not null default 7 check (dlc_jours between 1 and 60),
  corse boolean not null default false,
  supplement_corse numeric not null default 0 check (supplement_corse >= 0),
  message_client text,
  updated_at timestamptz not null default now()
);

alter table public.expedition_reglages enable row level security;

drop policy if exists expedition_reglages_lecture on public.expedition_reglages;
create policy expedition_reglages_lecture on public.expedition_reglages
  for select using (true);

drop policy if exists expedition_reglages_insert on public.expedition_reglages;
create policy expedition_reglages_insert on public.expedition_reglages
  for insert with check (public.expedition_est_gerant(commercant_id));

drop policy if exists expedition_reglages_update on public.expedition_reglages;
create policy expedition_reglages_update on public.expedition_reglages
  for update using (public.expedition_est_gerant(commercant_id))
  with check (public.expedition_est_gerant(commercant_id));

drop policy if exists expedition_reglages_delete on public.expedition_reglages;
create policy expedition_reglages_delete on public.expedition_reglages
  for delete using (public.expedition_est_admin());

-- Verrou : seul un admin change `active`. Un commerçant qui tenterait de
-- l'écrire voit sa valeur ignorée (les autres champs sont enregistrés).
create or replace function public.expedition_reglages_verrou()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if public.expedition_est_admin() then
    if new.active and (tg_op = 'INSERT' or old.active is distinct from true) then
      new.activee_le := coalesce(new.activee_le, now());
    end if;
  elsif tg_op = 'INSERT' then
    new.active := false;
    new.activee_le := null;
  else
    new.active := old.active;
    new.activee_le := old.activee_le;
  end if;
  if not new.active then
    new.ouverte := false;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_expedition_reglages_verrou on public.expedition_reglages;
create trigger trg_expedition_reglages_verrou
  before insert or update on public.expedition_reglages
  for each row execute function public.expedition_reglages_verrou();

-- ── 3. Compte transporteur du commerçant (privé) ────────────────────
create table if not exists public.expedition_comptes (
  commercant_id uuid primary key references public.commercants(id) on delete cascade,
  chrono_compte text,
  chrono_mot_de_passe text,
  chrono_sous_compte text,
  -- Adresse d'enlèvement imprimée sur l'étiquette
  exp_nom text,
  exp_contact text,
  exp_adresse text,
  exp_adresse2 text,
  exp_code_postal text,
  exp_ville text,
  exp_telephone text,
  exp_email text,
  -- Résultat du dernier « Tester mon compte »
  verifie_le timestamptz,
  produits_contrat text[],
  updated_at timestamptz not null default now()
);

alter table public.expedition_comptes enable row level security;

drop policy if exists expedition_comptes_gerant on public.expedition_comptes;
create policy expedition_comptes_gerant on public.expedition_comptes
  for all using (public.expedition_est_gerant(commercant_id))
  with check (public.expedition_est_gerant(commercant_id));

-- Jamais accessible sans connexion ; le mot de passe Chronopost s'écrit mais
-- ne se relit pas depuis le navigateur (seule l'Edge Function, en service_role, le lit).
revoke all on public.expedition_comptes from anon;
revoke select on public.expedition_comptes from authenticated;
grant select (commercant_id, chrono_compte, chrono_sous_compte, exp_nom, exp_contact,
              exp_adresse, exp_adresse2, exp_code_postal, exp_ville, exp_telephone,
              exp_email, verifie_le, produits_contrat, updated_at)
  on public.expedition_comptes to authenticated;
grant insert, update, delete on public.expedition_comptes to authenticated;

-- ── 4. Étiquettes (PDF) ─────────────────────────────────────────────
create table if not exists public.expedition_etiquettes (
  commande_id uuid primary key references public.commandes(id) on delete cascade,
  commercant_id uuid not null references public.commercants(id) on delete cascade,
  pdf_base64 text not null,
  created_at timestamptz not null default now()
);

alter table public.expedition_etiquettes enable row level security;

drop policy if exists expedition_etiquettes_gerant on public.expedition_etiquettes;
create policy expedition_etiquettes_gerant on public.expedition_etiquettes
  for select using (public.expedition_est_gerant(commercant_id));

revoke all on public.expedition_etiquettes from anon;

-- ── 5. Catalogue : poids d'expédition par produit ───────────────────
alter table public.catalogue
  add column if not exists poids_expedition_g integer
    check (poids_expedition_g is null or poids_expedition_g > 0),
  add column if not exists expedition_exclue boolean not null default false;

comment on column public.catalogue.poids_expedition_g is
  'Poids d''une unité vendue, en grammes, pour le calcul des frais d''expédition. NULL = déduit de l''unité.';
comment on column public.catalogue.expedition_exclue is
  'true = produit non expédiable (trop fragile, vendu sur place uniquement).';

-- ── 6. Commandes : paiement en ligne + suivi du colis ───────────────
alter table public.commandes
  add column if not exists paiement_status text not null default 'none',
  add column if not exists paiement_montant_cents integer,
  add column if not exists paiement_rembourse_cents integer not null default 0,
  add column if not exists expedition_date date,
  add column if not exists expedition_poids_g integer,
  add column if not exists expedition_destinataire jsonb,
  add column if not exists expedition_test boolean not null default false,
  add column if not exists expedition_transporteur text,
  add column if not exists expedition_produit text,
  add column if not exists expedition_suivi text,
  add column if not exists expedition_etiquette_le timestamptz,
  add column if not exists expedition_expediee_le timestamptz,
  add column if not exists expedition_livree_le timestamptz,
  add column if not exists expedition_suivi_etat text,
  add column if not exists expedition_suivi_maj timestamptz,
  add column if not exists expedition_confirmation_le timestamptz;

comment on column public.commandes.paiement_status is
  'Paiement en ligne (expédition) : none | pending | paid | refunded | failed';

create index if not exists commandes_expedition_suivi_idx
  on public.commandes (expedition_expediee_le)
  where type = 'expedition' and expedition_suivi is not null and expedition_livree_le is null;

-- ── 7. Poids d'une unité de vente, déduit de son libellé ────────────
-- « le kg » → 1000 · « la pièce ~250g » → 250 · « les 100 g » → 100
-- « filet 5kg » → 5000 · « bouteille 75cl » → 1200 (liquide + verre) · sinon NULL
create or replace function public.expedition_poids_unite_g(p_unite text)
returns integer
language plpgsql
immutable
as $$
declare
  u text := lower(coalesce(p_unite, ''));
  m text;
begin
  if u ~ '^\s*(le |au |par )?(kg|kilo)' then
    return 1000;
  end if;
  m := substring(u from '(\d+(?:[.,]\d+)?)\s*kg');
  if m is not null then
    return round(replace(m, ',', '.')::numeric * 1000);
  end if;
  m := substring(u from '(\d+(?:[.,]\d+)?)\s*g(?![a-z])');
  if m is not null then
    return round(replace(m, ',', '.')::numeric);
  end if;
  m := substring(u from '(\d+(?:[.,]\d+)?)\s*cl');
  if m is not null then
    return round(replace(m, ',', '.')::numeric * 10) + 450;
  end if;
  m := substring(u from '(\d+(?:[.,]\d+)?)\s*l(?![a-z])');
  if m is not null then
    return round(replace(m, ',', '.')::numeric * 1000) + 500;
  end if;
  return null;
end;
$$;

-- ── 8. Jours fériés français (métropole) ────────────────────────────
create or replace function public.jour_ferie_fr(p_date date)
returns boolean
language plpgsql
immutable
as $$
declare
  y int := extract(year from p_date);
  a int := y % 19;
  b int := y / 100;
  c int := y % 100;
  d int := b / 4;
  e int := b % 4;
  f int := (b + 8) / 25;
  g int := (b - f + 1) / 3;
  h int := (19 * a + b - d - g + 15) % 30;
  i int := c / 4;
  k int := c % 4;
  l int := (32 + 2 * e + 2 * i - h - k) % 7;
  m int := (a + 11 * h + 22 * l) / 451;
  paques date := make_date(y, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
begin
  return to_char(p_date, 'MM-DD') in
           ('01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25')
      or p_date in (paques + 1, paques + 39, paques + 50);
end;
$$;

-- ── 9. Prochaines dates d'expédition possibles ──────────────────────
-- Un colis part un jour choisi par le commerçant et arrive le lendemain :
-- on écarte les départs un jour férié, la veille d'un jour férié, le week-end
-- et pendant les fermetures de la boutique.
create or replace function public.expedition_dates(p_commercant uuid, p_nb integer default 6)
returns date[]
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  r expedition_reglages%rowtype;
  v_now timestamp := now() at time zone 'Europe/Paris';
  v_d date;
  v_fin date;
  v_out date[] := '{}';
begin
  select * into r from expedition_reglages where commercant_id = p_commercant;
  if not found then
    return v_out;
  end if;
  v_d := v_now::date + r.delai_preparation_jours;
  if v_now::time > r.heure_limite then
    v_d := v_d + 1;
  end if;
  v_fin := v_now::date + 28;
  while v_d <= v_fin and coalesce(array_length(v_out, 1), 0) < greatest(p_nb, 1) loop
    if extract(isodow from v_d)::int = any (r.jours_expedition)
       and extract(isodow from v_d)::int between 1 and 5
       and not public.jour_ferie_fr(v_d)
       and not public.jour_ferie_fr(v_d + 1)
       and not coalesce(public.est_ferme(p_commercant, v_d), false)
    then
      v_out := v_out || v_d;
    end if;
    v_d := v_d + 1;
  end loop;
  return v_out;
end;
$$;

-- ── 10. Devis d'expédition ──────────────────────────────────────────
-- Source de vérité unique : le panier l'appelle pour afficher les frais,
-- checkout_create_order le rappelle pour les facturer.
--   p_lignes     : [{ produit_base_id, quantite }, …]
--   p_sous_total : montant des produits (recalculé par le serveur au checkout)
-- Retour : { ok, code, message, frais, poids_g, dates[], … }
create or replace function public.expedition_devis(
  p_commercant uuid,
  p_lignes jsonb,
  p_code_postal text default null,
  p_sous_total numeric default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  r expedition_reglages%rowtype;
  c record;
  v_l jsonb;
  v_ligne record;
  v_qte numeric;
  v_poids numeric := 0;
  v_poids_total integer;
  v_exclus text[] := '{}';
  v_estimes text[] := '{}';
  v_cp text := regexp_replace(coalesce(p_code_postal, ''), '\s', '', 'g');
  v_corse boolean := false;
  v_palier jsonb;
  v_frais numeric;
  v_max_kg numeric := 0;
  v_gratuit boolean := false;
  v_dates date[];
  v_base jsonb;
begin
  select * into r from expedition_reglages where commercant_id = p_commercant;
  select id, pays, offre, abonnement_actif, stripe_connect_actif, stripe_connect_charges_enabled
    into c from commercants where id = p_commercant and actif is not false;

  if c.id is null or r.commercant_id is null or not r.active or not r.ouverte
     or coalesce(c.pays, 'FR') <> 'FR' or coalesce(c.offre, '') = 'vitrine'
     or jsonb_array_length(coalesce(r.grille, '[]'::jsonb)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'INDISPONIBLE',
      'message', 'L''expédition n''est pas proposée par cette boutique');
  end if;

  -- Boutique abonnée : le paiement en ligne doit être prêt (Stripe Connect).
  -- Boutique de démonstration : commandes de test, sans paiement.
  if c.abonnement_actif is true
     and not (coalesce(c.stripe_connect_actif, false) and coalesce(c.stripe_connect_charges_enabled, false)) then
    return jsonb_build_object('ok', false, 'code', 'PAIEMENT_INDISPONIBLE',
      'message', 'Le paiement en ligne n''est pas encore activé pour cette boutique');
  end if;

  select coalesce(max((p->>'max_kg')::numeric), 0) into v_max_kg
    from jsonb_array_elements(r.grille) p;

  v_base := jsonb_build_object(
    'froid', r.mode_froid,
    'min_commande', r.min_commande,
    'seuil_gratuite', r.seuil_gratuite,
    'poids_max_kg', v_max_kg,
    'corse', r.corse,
    'supplement_corse', r.supplement_corse,
    'grille', r.grille,
    'message_client', r.message_client,
    'test', c.abonnement_actif is not true
  );

  -- Poids du colis
  for v_l in select * from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb))
  loop
    v_qte := coalesce((v_l->>'quantite')::numeric, 0);
    if v_qte <= 0 or (v_l->>'produit_base_id') is null then
      continue;
    end if;
    select pb.nom, pb.unite, cat.poids_expedition_g, cat.expedition_exclue,
           cat.poids_indicatif, cat.poids_piece_g
      into v_ligne
      from catalogue cat
      join produits_base pb on pb.id = cat.produit_base_id
     where cat.commercant_id = p_commercant
       and cat.produit_base_id = (v_l->>'produit_base_id')::uuid
     limit 1;
    if not found then
      continue;
    end if;
    if v_ligne.expedition_exclue then
      v_exclus := v_exclus || v_ligne.nom::text;
      continue;
    end if;
    if v_ligne.poids_expedition_g is null
       and not (coalesce(v_ligne.poids_indicatif, false) and v_ligne.poids_piece_g is not null)
       and public.expedition_poids_unite_g(v_ligne.unite) is null then
      v_estimes := v_estimes || v_ligne.nom::text;
    end if;
    v_poids := v_poids + v_qte * coalesce(
      v_ligne.poids_expedition_g,
      case when v_ligne.poids_indicatif then v_ligne.poids_piece_g end,
      public.expedition_poids_unite_g(v_ligne.unite),
      r.poids_defaut_g);
  end loop;

  if coalesce(array_length(v_exclus, 1), 0) > 0 then
    return v_base || jsonb_build_object('ok', false, 'code', 'PRODUITS_EXCLUS',
      'exclus', to_jsonb(v_exclus),
      'message', 'Ne peut pas être expédié : ' || array_to_string(v_exclus, ', ')
                 || '. Retirez ces produits du panier ou choisissez le retrait.');
  end if;

  v_poids_total := ceil(v_poids)::int + r.poids_emballage_g;
  v_base := v_base || jsonb_build_object(
    'poids_g', v_poids_total,
    'poids_produits_g', ceil(v_poids)::int,
    'poids_estimes', to_jsonb(v_estimes));

  -- Destination : France métropolitaine. Corse en option. Pas d'outre-mer ni Monaco.
  if v_cp <> '' then
    if v_cp !~ '^\d{5}$' or v_cp ~ '^(97|98|00)' then
      return v_base || jsonb_build_object('ok', false, 'code', 'ZONE',
        'message', 'L''expédition est possible uniquement en France métropolitaine');
    end if;
    if v_cp ~ '^20' then
      if not r.corse then
        return v_base || jsonb_build_object('ok', false, 'code', 'ZONE',
          'message', 'Cette boutique n''expédie pas en Corse');
      end if;
      v_corse := true;
    end if;
  end if;

  if p_sous_total is not null and r.min_commande > 0 and p_sous_total < r.min_commande then
    return v_base || jsonb_build_object('ok', false, 'code', 'MINIMUM',
      'message', 'Expédition possible dès ' || replace(to_char(r.min_commande, 'FM999990.00'), '.', ',')
                 || ' € d''achat');
  end if;

  select p into v_palier
    from jsonb_array_elements(r.grille) p
   where (p->>'max_kg')::numeric * 1000 >= v_poids_total
   order by (p->>'max_kg')::numeric asc
   limit 1;
  if v_palier is null then
    return v_base || jsonb_build_object('ok', false, 'code', 'TROP_LOURD',
      'message', 'Colis trop lourd pour l''expédition (maximum '
                 || trim(to_char(v_max_kg, 'FM999990.##'), '.') || ' kg, emballage compris). '
                 || 'Allégez le panier ou contactez la boutique.');
  end if;

  v_frais := greatest(coalesce((v_palier->>'prix')::numeric, 0), 0);
  if r.seuil_gratuite is not null and p_sous_total is not null and p_sous_total >= r.seuil_gratuite then
    v_frais := 0;
    v_gratuit := true;
  end if;
  if v_corse then
    v_frais := v_frais + r.supplement_corse;
  end if;

  v_dates := public.expedition_dates(p_commercant, 6);
  if coalesce(array_length(v_dates, 1), 0) = 0 then
    return v_base || jsonb_build_object('ok', false, 'code', 'AUCUNE_DATE',
      'message', 'Aucune date d''expédition disponible pour le moment');
  end if;

  return v_base || jsonb_build_object(
    'ok', true,
    'frais', round(v_frais, 2),
    'gratuit', v_gratuit,
    'en_corse', v_corse,
    'dates', to_jsonb(v_dates));
end;
$$;

grant execute on function public.expedition_devis(uuid, jsonb, text, numeric) to anon, authenticated;
grant execute on function public.expedition_dates(uuid, integer) to anon, authenticated;

-- ── 11. Checkout : branche « expedition » ───────────────────────────
-- Copie de 20261113_frais_livraison_serveur.sql (identique à la prod au
-- 2026-11-21) + le mode expédition. Rien ne change pour retrait / livraison.
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
  v_offre text;
  v_frais_base numeric;
  v_seuil numeric;
  v_min_liv numeric;
  -- Expédition
  v_exp jsonb;
  v_dest jsonb;
  v_exp_date date;
  v_exp_test boolean := false;
  v_statut text := coalesce(p_commande->>'statut', 'nouvelle');
  v_date_retrait timestamptz := (p_commande->>'date_retrait')::timestamptz;
  v_retrait_date timestamptz := (p_commande->>'retrait_date')::timestamptz;
  v_adresse text := p_commande->>'adresse_livraison';
  v_empreinte text := coalesce(p_commande->>'empreinte_status', 'none');
  v_paiement text := 'none';
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

  -- Frais de livraison : réglages du commerçant, jamais la valeur envoyée par le client.
  if v_type = 'livraison' then
    select c.offre, c.frais_livraison, c.seuil_livraison_gratuite, c.min_commande_livraison
      into v_offre, v_frais_base, v_seuil, v_min_liv
    from commercants c where c.id = v_commercant;

    if coalesce(v_offre, '') <> 'livraison' then
      raise exception 'La livraison n''est pas proposée par cette boutique';
    end if;
    if coalesce(v_min_liv, 0) > 0 and v_sous_total < v_min_liv then
      raise exception 'Livraison possible dès % € d''achat', v_min_liv;
    end if;

    v_frais := greatest(coalesce(v_frais_base, 0), 0);
    if coalesce(v_seuil, 0) > 0 and v_sous_total >= v_seuil then
      v_frais := 0;
    end if;
  end if;

  -- Expédition France : devis serveur (poids, grille, zone, dates), adresse
  -- complète exigée, et statut imposé par le serveur — la commande n'apparaît
  -- chez le commerçant qu'une fois payée (Edge Function `expedition`).
  if v_type = 'expedition' then
    if jsonb_array_length(v_computed) = 0 then
      raise exception 'Panier vide';
    end if;
    v_dest := coalesce(p_commande->'expedition', '{}'::jsonb);
    if coalesce(trim(v_dest->>'nom'), '') = ''
       or coalesce(trim(v_dest->>'adresse'), '') = ''
       or coalesce(trim(v_dest->>'code_postal'), '') = ''
       or coalesce(trim(v_dest->>'ville'), '') = ''
       or coalesce(trim(v_dest->>'telephone'), '') = '' then
      raise exception 'Adresse d''expédition incomplète (nom, adresse, code postal, ville et téléphone requis)';
    end if;

    v_exp := public.expedition_devis(v_commercant, p_lignes, v_dest->>'code_postal', v_sous_total);
    if not coalesce((v_exp->>'ok')::boolean, false) then
      raise exception '%', coalesce(v_exp->>'message', 'Expédition indisponible');
    end if;

    v_exp_date := (v_dest->>'date')::date;
    if v_exp_date is null or not (v_exp->'dates') ? v_exp_date::text then
      raise exception 'EXPEDITION_DATE: cette date d''expédition n''est plus disponible';
    end if;

    v_frais := (v_exp->>'frais')::numeric;
    v_exp_test := coalesce((v_exp->>'test')::boolean, false);
    v_statut := case when v_exp_test then 'nouvelle' else 'paiement_pending' end;
    v_paiement := case when v_exp_test then 'none' else 'pending' end;
    v_empreinte := 'none';
    -- Date de départ du colis : sert au tri et au planning du commerçant
    v_date_retrait := (v_exp_date::timestamp + time '12:00') at time zone 'Europe/Paris';
    v_retrait_date := v_date_retrait;
    v_adresse := trim(v_dest->>'adresse')
      || case when coalesce(trim(v_dest->>'complement'), '') <> '' then ', ' || trim(v_dest->>'complement') else '' end
      || ', ' || trim(v_dest->>'code_postal') || ' ' || trim(v_dest->>'ville');
    v_dest := jsonb_build_object(
      'nom',          left(trim(v_dest->>'nom'), 100),
      'adresse',      left(trim(v_dest->>'adresse'), 38),
      'complement',   left(coalesce(trim(v_dest->>'complement'), ''), 38),
      'code_postal',  regexp_replace(v_dest->>'code_postal', '\s', '', 'g'),
      'ville',        left(trim(v_dest->>'ville'), 50),
      'telephone',    left(trim(v_dest->>'telephone'), 20),
      'instructions', left(coalesce(trim(v_dest->>'instructions'), ''), 200));
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
    note_client, adresse_livraison, empreinte_status, cgv_acceptees, cgv_version, cgv_acceptees_at,
    code_postal_livraison, ville_livraison, paiement_status,
    expedition_date, expedition_poids_g, expedition_destinataire, expedition_test,
    rappel_j1_envoye_at)
  values (v_commercant, v_client_id,
    p_commande->>'numero',
    v_type,
    case when v_type = 'expedition' then null else (p_commande->>'creneau_id')::uuid end,
    v_date_retrait,
    v_retrait_date,
    v_statut,
    v_sous_total,
    v_frais,
    v_total,
    p_commande->>'note_client',
    v_adresse,
    v_empreinte,
    coalesce((p_commande->>'cgv_acceptees')::boolean, false),
    p_commande->>'cgv_version',
    (p_commande->>'cgv_acceptees_at')::timestamptz,
    case when v_type = 'expedition' then v_dest->>'code_postal' end,
    case when v_type = 'expedition' then v_dest->>'ville' end,
    v_paiement,
    v_exp_date,
    case when v_type = 'expedition' then (v_exp->>'poids_g')::int end,
    case when v_type = 'expedition' then v_dest end,
    v_exp_test,
    -- Pas de « rappel de retrait J-1 » pour un colis expédié
    case when v_type = 'expedition' then v_now end)
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
    'total_ttc',   v_total,
    'statut',      v_statut,
    'paiement_requis', v_paiement = 'pending'
  );
end;
$function$;

-- ── 12. Ménage : paiements jamais aboutis ───────────────────────────
-- Une commande à expédier dont le paiement n'a pas abouti au bout de 2 h est
-- annulée (le trigger de restock remet les produits en stock).
create or replace function public.expedition_annuler_paiements_abandonnes()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_n integer;
begin
  update commandes
     set statut = 'annulee', annulee_le = now(), paiement_status = 'failed'
   where type = 'expedition'
     and statut = 'paiement_pending'
     and created_at < now() - interval '2 hours';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.expedition_annuler_paiements_abandonnes() from anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('expedition-paiements-abandonnes', 'expedition-suivi');

select cron.schedule('expedition-paiements-abandonnes', '23 * * * *',
  $$ select public.expedition_annuler_paiements_abandonnes(); $$);

-- Suivi des colis : toutes les 2 h, l'Edge Function interroge Chronopost pour
-- les colis expédiés et pas encore livrés.
select cron.schedule('expedition-suivi', '41 */2 * * *',
  $$ select net.http_post(
       url := 'https://epvdzhzwfmtnioedyfgm.supabase.co/functions/v1/expedition',
       body := '{"action":"cron-suivi"}'::jsonb,
       headers := jsonb_build_object('Content-Type', 'application/json')) $$);
