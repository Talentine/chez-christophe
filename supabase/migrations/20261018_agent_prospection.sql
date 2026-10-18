-- ============================================================
-- Agent de prospection Marchéo (LinkedIn + email)
-- Cibles : associations / unions de commerçants de chaque ville,
-- propriétaires de plusieurs boutiques (boulangerie, boucherie,
-- primeur, poissonnerie, épicerie…) et groupes alimentaires.
-- Toutes les tables sont réservées au service role (RLS sans policy).
-- Voir docs/AGENT-PROSPECTION.md
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.agent_prospects (
  id                 uuid primary key default gen_random_uuid(),
  type               text not null check (type in ('association', 'multi_boutiques', 'groupe')),
  siren              text unique,
  nom                text not null,
  naf                text,
  nb_etablissements  int,
  ville              text,
  code_postal        text,
  departement        text,
  dirigeant          text,          -- issu du registre (SIRENE / RNE)
  site_web           text,
  email              text,
  telephone          text,
  linkedin_url       text,
  contact_nom        text,
  contact_role       text,
  notes              text,          -- éléments de personnalisation trouvés à l'enrichissement
  statut             text not null default 'a_enrichir' check (statut in (
                       'a_enrichir', 'introuvable', 'pret', 'en_cours',
                       'contacte', 'relance_1', 'relance_2', 'termine',
                       'repondu', 'interesse', 'pas_interesse', 'desinscrit')),
  enrichi_at         timestamptz,
  dernier_envoi_at   timestamptz,
  prochaine_action_at timestamptz,
  sujet_initial      text,
  linkedin_fait      boolean not null default false,
  unsubscribe_token  uuid not null default gen_random_uuid(),
  created_at         timestamptz not null default now()
);

create index if not exists agent_prospects_statut_idx on public.agent_prospects (statut, prochaine_action_at);
create index if not exists agent_prospects_email_idx on public.agent_prospects (lower(email));
create unique index if not exists agent_prospects_token_idx on public.agent_prospects (unsubscribe_token);

create table if not exists public.prospection_messages (
  id           bigserial primary key,
  prospect_id  uuid references public.agent_prospects(id) on delete cascade,
  canal        text not null check (canal in ('email', 'linkedin')),
  sens         text not null check (sens in ('sortant', 'entrant')),
  etape        text,                -- initial, relance_1, relance_2, reponse_auto, entrant
  sujet        text,
  corps        text,
  classification text,              -- pour les entrants : interesse, question, pas_interesse, stop, absence, autre
  resend_id    text,
  created_at   timestamptz not null default now()
);
create index if not exists prospection_messages_prospect_idx on public.prospection_messages (prospect_id, created_at);

create table if not exists public.linkedin_posts (
  id           bigserial primary key,
  theme        text not null,
  contenu      text not null,
  statut       text not null default 'publie' check (statut in ('publie', 'erreur', 'brouillon')),
  linkedin_urn text,
  erreur       text,
  created_at   timestamptz not null default now()
);

-- Curseur de sourcing (département en cours, etc.)
create table if not exists public.prospection_etat (
  cle    text primary key,
  valeur jsonb not null,
  maj_at timestamptz not null default now()
);

alter table public.agent_prospects            enable row level security;
alter table public.prospection_messages enable row level security;
alter table public.linkedin_posts       enable row level security;
alter table public.prospection_etat     enable row level security;

-- Réserve un lot de prospects pour une action (évite les doubles envois
-- si deux exécutions du cron se chevauchent).
create or replace function public.agent_claim_prospects(p_statuts text[], n int)
returns setof public.agent_prospects
language sql as $$
  update public.agent_prospects p set statut = 'en_cours'
   where p.id in (
     select id from public.agent_prospects
      where statut = any(p_statuts)
        and email is not null
        and (prochaine_action_at is null or prochaine_action_at <= now())
      order by prochaine_action_at nulls first, created_at
      limit n
      for update skip locked)
  returning p.*;
$$;
revoke all on function public.agent_claim_prospects(text[], int) from public, anon, authenticated;

-- ── Secret partagé fonction ↔ pg_cron (Supabase Vault) ─────────────────────
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'agent_prospection_secret',
                           'Authentifie les appels pg_cron vers la fonction agent-prospection')
 where not exists (select 1 from vault.secrets where name = 'agent_prospection_secret');

create or replace function public.agent_prospection_secret()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'agent_prospection_secret' limit 1;
$$;
revoke all on function public.agent_prospection_secret() from public, anon, authenticated;
grant execute on function public.agent_prospection_secret() to service_role;

-- Marche / pause : update prospection_etat set valeur = '{"valeur":"pause"}' where cle = 'mode';
insert into public.prospection_etat (cle, valeur) values ('mode', '{"valeur":"live"}')
on conflict (cle) do nothing;

-- ── Planification (pg_cron + pg_net) ───────────────────────────────────────
-- Chaque action vérifie elle-même l'heure de Paris (jours ouvrés, heures de bureau).
create or replace function public.agent_prospection_appel(p_action text)
returns void
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := 'https://epvdzhzwfmtnioedyfgm.supabase.co/functions/v1/agent-prospection',
    body := jsonb_build_object('action', p_action),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-agent-secret', public.agent_prospection_secret()),
    timeout_milliseconds := 150000);
$$;
revoke all on function public.agent_prospection_appel(text) from public, anon, authenticated;

select cron.schedule('agent-sourcer',  '7 * * * *',    $$ select public.agent_prospection_appel('sourcer') $$);
select cron.schedule('agent-enrichir', '*/10 * * * *', $$ select public.agent_prospection_appel('enrichir') $$);
select cron.schedule('agent-envoyer',  '*/15 * * * *', $$ select public.agent_prospection_appel('envoyer') $$);
select cron.schedule('agent-linkedin', '*/15 * * * *', $$ select public.agent_prospection_appel('linkedin-post') $$);
select cron.schedule('agent-digest',   '*/15 * * * *', $$ select public.agent_prospection_appel('digest') $$);
