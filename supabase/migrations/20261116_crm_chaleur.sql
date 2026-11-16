-- CRM admin : chaleur des prospects (besoin de Marchéo + joignable).
-- signaux : ce que la recherche (OpenStreetMap) et la fonction crm-enrichir (site du commerce, fiche Google) ont vu.
-- La note n'est PAS stockée : elle est recalculée par le navigateur (CRM.pur.chaleurProspect) à partir des signaux,
-- pour pouvoir changer les poids sans relancer d'analyse.
alter table public.crm_prospects
  add column if not exists signaux jsonb
    check (signaux is null or (jsonb_typeof(signaux) = 'object' and length(signaux::text) <= 6000)),
  add column if not exists analyse_at timestamptz,
  add column if not exists chaleur_manuelle text
    check (chaleur_manuelle is null or chaleur_manuelle in ('chaud', 'tiede', 'froid')),
  add column if not exists reseaux_actifs text
    check (reseaux_actifs is null or reseaux_actifs in ('actif', 'peu_actif')),
  add column if not exists google_note numeric(2,1)
    check (google_note is null or (google_note >= 1 and google_note <= 5)),
  add column if not exists google_avis integer
    check (google_avis is null or google_avis >= 0),
  add column if not exists lat double precision check (lat is null or (lat >= -90 and lat <= 90)),
  add column if not exists lon double precision check (lon is null or (lon >= -180 and lon <= 180));

comment on column public.crm_prospects.signaux is 'Signaux de chaleur : { v, osm, site, google }. Voir crm-coeur.js (chaleurProspect).';
comment on column public.crm_prospects.analyse_at is 'Dernier passage de la fonction crm-enrichir (null = jamais analysé).';
comment on column public.crm_prospects.chaleur_manuelle is 'Niveau forcé à la main ; null = automatique.';
comment on column public.crm_prospects.reseaux_actifs is 'Activité Instagram / Facebook constatée à la main ; null = inconnue.';
comment on column public.crm_prospects.google_note is 'Note de la fiche Google (1 à 5) relevée par crm-enrichir.';
comment on column public.crm_prospects.google_avis is 'Nombre d''avis de la fiche Google relevé par crm-enrichir.';

create index if not exists crm_prospects_a_analyser_idx on public.crm_prospects (created_at) where analyse_at is null;

-- ───────── Écriture de la fonction crm-enrichir ─────────
-- Les signaux, la date d'analyse, la note et le nombre d'avis suivent toujours l'analyse. Les autres colonnes
-- (e-mail, téléphone, liens, site, position) ne sont remplies que si elles sont ENCORE vides au moment de
-- l'écriture : une valeur saisie par l'utilisateur pendant l'analyse (jusqu'à 45 s) n'est jamais écrasée.
-- site_web : remplacé aussi quand il est resté égal à p_site_lu (une page d'annuaire ou un profil social lus au
-- début de l'analyse, que le site de la fiche Google remplace).
create or replace function public.crm_enrichir_ecrire(p_id uuid, p_toujours jsonb, p_si_vides jsonb, p_site_lu text default null)
returns setof public.crm_prospects
language sql
set search_path = ''
as $$
  update public.crm_prospects p set
    signaux     = case when p_toujours ? 'signaux' then p_toujours -> 'signaux' else p.signaux end,
    analyse_at  = case when p_toujours ? 'analyse_at' then (p_toujours ->> 'analyse_at')::timestamptz else p.analyse_at end,
    google_note = case when p_toujours ? 'google_note' then (p_toujours ->> 'google_note')::numeric else p.google_note end,
    google_avis = case when p_toujours ? 'google_avis' then (p_toujours ->> 'google_avis')::integer else p.google_avis end,
    email       = case when coalesce(p.email, '') = '' and p_si_vides ? 'email' then p_si_vides ->> 'email' else p.email end,
    telephone   = case when coalesce(p.telephone, '') = '' and p_si_vides ? 'telephone' then p_si_vides ->> 'telephone' else p.telephone end,
    instagram   = case when coalesce(p.instagram, '') = '' and p_si_vides ? 'instagram' then p_si_vides ->> 'instagram' else p.instagram end,
    facebook    = case when coalesce(p.facebook, '') = '' and p_si_vides ? 'facebook' then p_si_vides ->> 'facebook' else p.facebook end,
    google_url  = case when coalesce(p.google_url, '') = '' and p_si_vides ? 'google_url' then p_si_vides ->> 'google_url' else p.google_url end,
    site_web    = case when p_si_vides ? 'site_web' and (coalesce(p.site_web, '') = '' or p.site_web = p_site_lu)
                       then p_si_vides ->> 'site_web' else p.site_web end,
    lat         = case when p.lat is null and p.lon is null and p_si_vides ? 'lat' and p_si_vides ? 'lon'
                       then (p_si_vides ->> 'lat')::double precision else p.lat end,
    lon         = case when p.lat is null and p.lon is null and p_si_vides ? 'lat' and p_si_vides ? 'lon'
                       then (p_si_vides ->> 'lon')::double precision else p.lon end
  where p.id = p_id
  returning p.*;
$$;

comment on function public.crm_enrichir_ecrire(uuid, jsonb, jsonb, text) is
  'Écriture de crm-enrichir : les colonnes de p_si_vides ne sont remplies que si elles sont encore vides.';

-- ───────── Plafond quotidien des appels Google Places ─────────
-- Un compteur par jour (UTC), incrémenté de façon atomique AVANT chaque appel : les réanalyses forcées, les appels
-- dont l'écriture échoue ensuite et les requêtes simultanées sont tous comptés.
create table if not exists public.crm_enrichir_compteurs (
  jour date primary key,
  google integer not null default 0 check (google >= 0)
);
comment on table public.crm_enrichir_compteurs is 'Appels Google Places faits par crm-enrichir, par jour (UTC).';

-- Aucune politique : seule la fonction Edge (rôle de service) lit et écrit ce compteur.
alter table public.crm_enrichir_compteurs enable row level security;
revoke all on public.crm_enrichir_compteurs from anon, authenticated;
grant select, insert, update on public.crm_enrichir_compteurs to service_role;

-- Réserve un appel : vrai s'il tient dans le plafond du jour (et il est alors compté), faux sinon.
create or replace function public.crm_google_reserver(p_plafond integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_jour date := (now() at time zone 'utc')::date;
  v_accorde boolean;
begin
  if p_plafond is null or p_plafond <= 0 then
    return false;
  end if;
  insert into public.crm_enrichir_compteurs as c (jour, google) values (v_jour, 1)
  on conflict (jour) do update set google = c.google + 1 where c.google < p_plafond
  returning true into v_accorde;
  return coalesce(v_accorde, false);
end;
$$;

comment on function public.crm_google_reserver(integer) is
  'Réserve un appel Google Places dans le plafond du jour (compteur atomique). Appelée par crm-enrichir.';

-- Ces deux fonctions ne sont appelées que par la fonction Edge, avec le rôle de service.
revoke all on function public.crm_enrichir_ecrire(uuid, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.crm_google_reserver(integer) from public, anon, authenticated;
grant execute on function public.crm_enrichir_ecrire(uuid, jsonb, jsonb, text) to service_role;
grant execute on function public.crm_google_reserver(integer) to service_role;
