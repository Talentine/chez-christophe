-- CRM admin : guide d'appel de la prospection.
-- crm_appels   : journal d'un appel de prospection (jusqu'où la conversation est allée, objections entendues, résultat),
--                pour mesurer ce qui marche : taux de décroché, de rendez-vous, objections les plus fréquentes, meilleurs créneaux.
-- crm_reglages : réglages de l'admin partagés entre ses appareils (script d'appel personnalisé, objectif d'appels du jour).

create table if not exists public.crm_appels (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.crm_prospects(id) on delete cascade,
  resultat text check (resultat is null or resultat in
    ('pas_de_reponse', 'messagerie', 'a_rappeler', 'pas_interesse', 'interesse', 'rdv', 'faux_numero', 'deja_site')),
  interlocuteur text check (interlocuteur is null or interlocuteur in ('patron', 'barrage', 'inconnu')),
  etape text check (etape is null or length(etape) <= 40),          -- dernière étape du guide atteinte
  objections text[] not null default '{}' check (cardinality(objections) <= 20),
  version_script text check (version_script is null or length(version_script) <= 40),
  fait_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on table public.crm_appels is 'CRM admin : journal des appels de prospection (étape atteinte, objections, résultat).';
create index if not exists crm_appels_prospect_idx on public.crm_appels (prospect_id, fait_at desc);
create index if not exists crm_appels_fait_idx on public.crm_appels (fait_at desc);

create table if not exists public.crm_reglages (
  cle text primary key check (cle ~ '^[a-z0-9_]{1,60}$'),
  valeur jsonb not null check (pg_column_size(valeur) <= 200000),
  updated_at timestamptz not null default now()
);
comment on table public.crm_reglages is 'CRM admin : réglages partagés entre appareils (script d''appel, objectif du jour).';

alter table public.crm_appels enable row level security;
alter table public.crm_reglages enable row level security;
revoke all on public.crm_appels, public.crm_reglages from anon;
grant select, insert, update, delete on public.crm_appels, public.crm_reglages to authenticated;

drop policy if exists crm_appels_admin on public.crm_appels;
create policy crm_appels_admin on public.crm_appels for all to authenticated
  using (exists (select 1 from public.roles_utilisateurs ru where ru.user_id = (select auth.uid()) and ru.role = 'admin'))
  with check (exists (select 1 from public.roles_utilisateurs ru where ru.user_id = (select auth.uid()) and ru.role = 'admin'));

drop policy if exists crm_reglages_admin on public.crm_reglages;
create policy crm_reglages_admin on public.crm_reglages for all to authenticated
  using (exists (select 1 from public.roles_utilisateurs ru where ru.user_id = (select auth.uid()) and ru.role = 'admin'))
  with check (exists (select 1 from public.roles_utilisateurs ru where ru.user_id = (select auth.uid()) and ru.role = 'admin'));
