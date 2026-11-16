-- CRM admin : étude des prospects (« Enrichir la liste », note Marchéo).
-- Le navigateur met des prospects en file d'attente (etude_demandee_at). Une tâche planifiée, extérieure au dépôt,
-- lit la file (crm_etude_file), cherche chaque commerce sur le web (fiche, photos, avis, réseaux, annuaire des
-- entreprises) et écrit son étude par crm_etude_ecrire, qui valide et borne tout ce qu'elle reçoit.
-- À appliquer après 20261116_crm_chaleur.sql (la file renvoie lat et lon, colonnes de cette migration).
alter table public.crm_prospects
  add column if not exists etude_demandee_at timestamptz,
  add column if not exists etude_at timestamptz,
  add column if not exists etude jsonb
    check (etude is null or (jsonb_typeof(etude) = 'object' and length(etude::text) <= 8000)),
  add column if not exists note_marcheo numeric(3,1)
    check (note_marcheo is null or (note_marcheo >= 0 and note_marcheo <= 10));

comment on column public.crm_prospects.etude_demandee_at is 'Étude demandée (non nul = en file d''attente) ; remis à null par crm_etude_ecrire.';
comment on column public.crm_prospects.etude_at is 'Date de la dernière étude écrite par crm_etude_ecrire.';
comment on column public.crm_prospects.etude is 'Étude du commerce (version 1) : note, confiance, avis, photos, avis clients, sources… Écrite par crm_etude_ecrire seulement.';
comment on column public.crm_prospects.note_marcheo is 'Note Marchéo du prospect, de 0 à 10 (copie de etude.note).';

create index if not exists crm_prospects_etude_file_idx on public.crm_prospects (etude_demandee_at)
  where etude_demandee_at is not null;

-- ───────── Nettoyage des valeurs reçues ─────────
-- Tout ce que l'étude contient vient du web : chaque valeur est vérifiée, tronquée ou écartée avant d'être stockée.

-- Texte : caractères de contrôle remplacés par une espace, bords nettoyés, tronqué ; vide → null.
create or replace function public.crm_etude_propre(p_valeur text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(left(btrim(regexp_replace(p_valeur, '[\x01-\x1F\x7F]+', ' ', 'g')), greatest(p_max, 0))), '')
$$;

-- Texte d'une clé : seulement si c'est une chaîne JSON.
create or replace function public.crm_etude_txt(p_objet jsonb, p_cle text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_objet -> p_cle) = 'string' then public.crm_etude_propre(p_objet ->> p_cle, p_max) end
$$;

-- Adresse web : https uniquement, hôte en lettres / chiffres / points / tirets (ni identifiants ni port), sans espace,
-- guillemet, chevron ni barre oblique inverse. Trop longue ou autre schéma → null (une adresse ne se tronque pas).
create or replace function public.crm_etude_url(p_valeur text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_valeur is not null and length(p_valeur) <= p_max
      and p_valeur ~ '^https://([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,24}(/[^\s<>"''\\`\x01-\x1F\x7F]*)?$'
    then p_valeur end
$$;

-- Valeur d'une liste fermée, sinon null.
create or replace function public.crm_etude_enum(p_objet jsonb, p_cle text, p_permis text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_objet -> p_cle) = 'string' and (p_objet ->> p_cle) = any (p_permis) then p_objet ->> p_cle end
$$;

-- Booléen JSON, sinon null.
create or replace function public.crm_etude_bool(p_objet jsonb, p_cle text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_objet -> p_cle) = 'boolean' then (p_objet ->> p_cle)::boolean end
$$;

-- Nombre JSON dans ses bornes, arrondi à p_decimales ; hors bornes, ou non entier quand un entier est attendu → null.
create or replace function public.crm_etude_nombre(p_objet jsonb, p_cle text, p_min numeric, p_max numeric, p_decimales integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_objet -> p_cle) <> 'number' then null
    when length(p_objet ->> p_cle) > 40 then null
    when (p_objet ->> p_cle)::numeric < p_min or (p_objet ->> p_cle)::numeric > p_max then null
    when p_decimales = 0 and (p_objet ->> p_cle)::numeric <> trunc((p_objet ->> p_cle)::numeric) then null
    else round((p_objet ->> p_cle)::numeric, p_decimales)
  end
$$;

-- Tableau de textes (ou d'adresses https si p_url) : p_nombre éléments valables au plus, parmi les 50 premiers.
create or replace function public.crm_etude_liste(p_objet jsonb, p_cle text, p_nombre integer, p_max integer, p_url boolean)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_agg(g.valeur order by g.rang)
  from (
    select x.rang, x.valeur
    from (
      select e.rang,
        case when p_url then public.crm_etude_url(public.crm_etude_propre(e.element #>> '{}', 2000), p_max)
             else public.crm_etude_propre(e.element #>> '{}', p_max) end as valeur
      from jsonb_array_elements(case when jsonb_typeof(p_objet -> p_cle) = 'array' then p_objet -> p_cle else '[]'::jsonb end)
        with ordinality as e(element, rang)
      where e.rang <= 50 and jsonb_typeof(e.element) = 'string'
    ) x
    where x.valeur is not null
    order by x.rang
    limit greatest(p_nombre, 0)
  ) g
$$;

-- ───────── File d'attente ─────────
-- Les demandes les plus anciennes d'abord. Un faux numéro ou un « pas intéressé » n'est pas étudié.
create or replace function public.crm_etude_file(p_max integer default 15)
returns table (
  id uuid, nom text, metier text, departement text, commune text, code_postal text, adresse text, telephone text,
  source_ref text, site_web text, instagram text, facebook text, lat double precision, lon double precision
)
language sql
stable
set search_path = ''
as $$
  select p.id, p.nom, p.metier, p.departement, p.commune, p.code_postal, p.adresse, p.telephone,
    p.source_ref, p.site_web, p.instagram, p.facebook, p.lat, p.lon
  from public.crm_prospects p
  where p.etude_demandee_at is not null
    and (p.resultat is null or p.resultat not in ('faux_numero', 'pas_interesse'))
  order by p.etude_demandee_at, p.id
  limit least(greatest(coalesce(p_max, 15), 1), 50)
$$;

comment on function public.crm_etude_file(integer) is
  'Prospects en attente d''étude (les plus anciennes demandes d''abord, 50 au plus). Lue par la tâche planifiée.';

-- ───────── Écriture d'une étude ─────────
-- Refuse (exception, rien n'est écrit) : prospect inconnu, étude qui n'est pas un objet de version 1, confiance ou
-- identifie absents ou invalides, note hors de 0 à 10. Tout le reste est nettoyé : clés inconnues ignorées, textes
-- tronqués, valeurs du mauvais type ou hors liste écartées, adresses web en https seulement.
-- Écrit etude, etude_at, note_marcheo, sort le prospect de la file, et remplit commune, code postal, adresse, site,
-- Instagram, Facebook, fiche Google et e-mail SEULEMENT s'ils sont encore vides et si le commerce a été identifié.
create or replace function public.crm_etude_ecrire(p_id uuid, p_etude jsonb)
returns setof public.crm_prospects
language plpgsql
set search_path = ''
as $$
declare
  v_brut numeric;
  v_note numeric;
  v_confiance text;
  v_identifie boolean;
  v_etude jsonb;
  v_avis jsonb;
  v_photos jsonb;
  v_reseaux jsonb;
  v_lu jsonb;
  v_commune text;
  v_code_postal text;
  v_adresse text;
  v_site text;
  v_instagram text;
  v_facebook text;
  v_google text;
  v_email text;
  c_activite constant text[] := array['actif', 'peu_actif', 'absent', 'inconnu'];
begin
  if p_id is null then
    raise exception 'crm_etude_ecrire : identifiant du prospect manquant' using errcode = '22023';
  end if;
  if p_etude is null or jsonb_typeof(p_etude) <> 'object' then
    raise exception 'crm_etude_ecrire : l''étude doit être un objet JSON' using errcode = '22023';
  end if;
  if jsonb_typeof(p_etude -> 'v') is distinct from 'number' or length(p_etude ->> 'v') > 10 then
    raise exception 'crm_etude_ecrire : version inconnue (v doit valoir 1)' using errcode = '22023';
  end if;
  if (p_etude ->> 'v')::numeric <> 1 then
    raise exception 'crm_etude_ecrire : version inconnue (v doit valoir 1)' using errcode = '22023';
  end if;
  v_confiance := public.crm_etude_enum(p_etude, 'confiance', array['faible', 'moyenne', 'forte']);
  if v_confiance is null then
    raise exception 'crm_etude_ecrire : confiance doit valoir faible, moyenne ou forte' using errcode = '22023';
  end if;
  v_identifie := public.crm_etude_bool(p_etude, 'identifie');
  if v_identifie is null then
    raise exception 'crm_etude_ecrire : identifie doit valoir true ou false' using errcode = '22023';
  end if;
  if p_etude ? 'note' and jsonb_typeof(p_etude -> 'note') <> 'null' then
    if jsonb_typeof(p_etude -> 'note') <> 'number' or length(p_etude ->> 'note') > 40 then
      raise exception 'crm_etude_ecrire : note doit être un nombre de 0 à 10, ou null' using errcode = '22023';
    end if;
    v_brut := (p_etude ->> 'note')::numeric;
    if v_brut < 0 or v_brut > 10 then
      raise exception 'crm_etude_ecrire : note doit être un nombre de 0 à 10, ou null' using errcode = '22023';
    end if;
    v_note := round(v_brut, 1);
  end if;

  -- Sous-objets : seules les clés connues, chacune nettoyée.
  v_lu := case when jsonb_typeof(p_etude -> 'avis_clients') = 'object' then p_etude -> 'avis_clients' else '{}'::jsonb end;
  v_avis := jsonb_strip_nulls(jsonb_build_object(
    'tendance', public.crm_etude_enum(v_lu, 'tendance', array['bons', 'mitiges', 'mauvais', 'inconnu']),
    'note', public.crm_etude_nombre(v_lu, 'note', 1, 5, 1),
    'nombre', public.crm_etude_nombre(v_lu, 'nombre', 0, 10000000, 0),
    'resume', public.crm_etude_txt(v_lu, 'resume', 400)));

  v_lu := case when jsonb_typeof(p_etude -> 'photos') = 'object' then p_etude -> 'photos' else '{}'::jsonb end;
  v_photos := jsonb_strip_nulls(jsonb_build_object(
    'vues', public.crm_etude_bool(v_lu, 'vues'),
    'qualite', public.crm_etude_enum(v_lu, 'qualite', array['belles', 'correctes', 'pauvres', 'inconnu']),
    'recentes', public.crm_etude_bool(v_lu, 'recentes'),
    'devanture', public.crm_etude_bool(v_lu, 'devanture'),
    'produits', public.crm_etude_bool(v_lu, 'produits'),
    'commentaire', public.crm_etude_txt(v_lu, 'commentaire', 300)));

  v_lu := case when jsonb_typeof(p_etude -> 'reseaux') = 'object' then p_etude -> 'reseaux' else '{}'::jsonb end;
  v_reseaux := jsonb_strip_nulls(jsonb_build_object(
    'instagram', public.crm_etude_enum(v_lu, 'instagram', c_activite),
    'facebook', public.crm_etude_enum(v_lu, 'facebook', c_activite)));

  -- Ce que l'étude a trouvé pour compléter la fiche : chaque valeur est validée comme la colonne qu'elle vise.
  v_lu := case when jsonb_typeof(p_etude -> 'trouve') = 'object' then p_etude -> 'trouve' else '{}'::jsonb end;
  v_commune := public.crm_etude_txt(v_lu, 'commune', 120);
  v_code_postal := public.crm_etude_txt(v_lu, 'code_postal', 10);
  if v_code_postal !~ '^[0-9]{5}$' then v_code_postal := null; end if;
  v_adresse := public.crm_etude_txt(v_lu, 'adresse', 300);
  v_site := public.crm_etude_url(public.crm_etude_txt(v_lu, 'site_web', 2000), 300);
  v_instagram := public.crm_etude_url(public.crm_etude_txt(v_lu, 'instagram', 2000), 500);
  if v_instagram !~ '^https://(www\.)?instagram\.com/[A-Za-z0-9._]+' then v_instagram := null; end if;
  v_facebook := public.crm_etude_url(public.crm_etude_txt(v_lu, 'facebook', 2000), 500);
  if v_facebook !~ '^https://(([a-z0-9-]+\.)?facebook\.com|fb\.me)/[^/]' then v_facebook := null; end if;
  v_google := public.crm_etude_url(public.crm_etude_txt(v_lu, 'google_url', 2000), 500);
  if v_google !~ ('^https://((www\.)?google\.(com|fr|be|ch|lu|ca|es|it|de|co\.uk)/maps[/?]'
      || '|maps\.google\.(com|fr|be|ch|lu|ca|es|it|de|co\.uk)/'
      || '|maps\.app\.goo\.gl/|g\.page/|share\.google/|goo\.gl/maps/|g\.co/kgs/).') then
    v_google := null;
  end if;
  v_email := lower(public.crm_etude_txt(v_lu, 'email', 200));
  if v_email !~ '^[^@\s<>"'']+@([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}$' then v_email := null; end if;

  v_etude := jsonb_strip_nulls(jsonb_build_object(
    'v', 1,
    'note', v_note,
    'confiance', v_confiance,
    'identifie', v_identifie,
    'avis', public.crm_etude_txt(p_etude, 'avis', 600),
    'avis_clients', nullif(v_avis, '{}'::jsonb),
    'photos', nullif(v_photos, '{}'::jsonb),
    'commande_en_ligne', public.crm_etude_enum(p_etude, 'commande_en_ligne', array['oui', 'non_vue', 'inconnu']),
    'plateforme', public.crm_etude_txt(p_etude, 'plateforme', 60),
    'traiteur', public.crm_etude_bool(p_etude, 'traiteur'),
    'points_de_vente', public.crm_etude_nombre(p_etude, 'points_de_vente', 1, 9999, 0),
    'reseaux', nullif(v_reseaux, '{}'::jsonb),
    'dirigeant', public.crm_etude_txt(p_etude, 'dirigeant', 80),
    'anciennete', public.crm_etude_nombre(p_etude, 'anciennete', 1800, extract(year from now())::numeric, 0),
    'points_forts', public.crm_etude_liste(p_etude, 'points_forts', 5, 120, false),
    'points_faibles', public.crm_etude_liste(p_etude, 'points_faibles', 5, 120, false),
    'angle', public.crm_etude_txt(p_etude, 'angle', 200),
    'sources', public.crm_etude_liste(p_etude, 'sources', 8, 300, true),
    'trouve', nullif(jsonb_strip_nulls(jsonb_build_object(
      'commune', v_commune, 'code_postal', v_code_postal, 'adresse', v_adresse, 'site_web', v_site,
      'instagram', v_instagram, 'facebook', v_facebook, 'google_url', v_google, 'email', v_email)), '{}'::jsonb)));

  -- La colonne est bornée à 8000 caractères : on allège plutôt que de perdre l'étude.
  if length(v_etude::text) > 8000 then v_etude := v_etude - 'trouve'; end if;
  if length(v_etude::text) > 8000 then v_etude := v_etude - 'sources'; end if;
  if length(v_etude::text) > 8000 then
    raise exception 'crm_etude_ecrire : étude trop longue (8000 caractères au plus)' using errcode = '22023';
  end if;

  return query
  update public.crm_prospects p set
    etude = v_etude,
    etude_at = now(),
    etude_demandee_at = null,
    note_marcheo = v_note,
    commune     = case when v_identifie and coalesce(p.commune, '') = '' and v_commune is not null then v_commune else p.commune end,
    code_postal = case when v_identifie and coalesce(p.code_postal, '') = '' and v_code_postal is not null then v_code_postal else p.code_postal end,
    adresse     = case when v_identifie and coalesce(p.adresse, '') = '' and v_adresse is not null then v_adresse else p.adresse end,
    site_web    = case when v_identifie and coalesce(p.site_web, '') = '' and v_site is not null then v_site else p.site_web end,
    instagram   = case when v_identifie and coalesce(p.instagram, '') = '' and v_instagram is not null then v_instagram else p.instagram end,
    facebook    = case when v_identifie and coalesce(p.facebook, '') = '' and v_facebook is not null then v_facebook else p.facebook end,
    google_url  = case when v_identifie and coalesce(p.google_url, '') = '' and v_google is not null then v_google else p.google_url end,
    email       = case when v_identifie and coalesce(p.email, '') = '' and v_email is not null then v_email else p.email end
  where p.id = p_id
  returning p.*;
  if not found then
    raise exception 'crm_etude_ecrire : prospect introuvable' using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.crm_etude_ecrire(uuid, jsonb) is
  'Écrit l''étude d''un prospect (validée, bornée), sa note Marchéo, le sort de la file et complète les colonnes encore vides.';

-- Ces fonctions ne servent qu'à la tâche planifiée : rôle de service (ou propriétaire), jamais le navigateur.
revoke all on function public.crm_etude_propre(text, integer) from public, anon, authenticated;
revoke all on function public.crm_etude_txt(jsonb, text, integer) from public, anon, authenticated;
revoke all on function public.crm_etude_url(text, integer) from public, anon, authenticated;
revoke all on function public.crm_etude_enum(jsonb, text, text[]) from public, anon, authenticated;
revoke all on function public.crm_etude_bool(jsonb, text) from public, anon, authenticated;
revoke all on function public.crm_etude_nombre(jsonb, text, numeric, numeric, integer) from public, anon, authenticated;
revoke all on function public.crm_etude_liste(jsonb, text, integer, integer, boolean) from public, anon, authenticated;
revoke all on function public.crm_etude_file(integer) from public, anon, authenticated;
revoke all on function public.crm_etude_ecrire(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.crm_etude_propre(text, integer) to service_role;
grant execute on function public.crm_etude_txt(jsonb, text, integer) to service_role;
grant execute on function public.crm_etude_url(text, integer) to service_role;
grant execute on function public.crm_etude_enum(jsonb, text, text[]) to service_role;
grant execute on function public.crm_etude_bool(jsonb, text) to service_role;
grant execute on function public.crm_etude_nombre(jsonb, text, numeric, numeric, integer) to service_role;
grant execute on function public.crm_etude_liste(jsonb, text, integer, integer, boolean) to service_role;
grant execute on function public.crm_etude_file(integer) to service_role;
grant execute on function public.crm_etude_ecrire(uuid, jsonb) to service_role;
