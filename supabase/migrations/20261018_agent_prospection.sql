-- ============================================================
-- Agent de prospection Marchéo (LinkedIn + email)
-- Cibles : associations / unions de commerçants de chaque ville,
-- propriétaires de plusieurs boutiques (boulangerie, boucherie,
-- primeur, poissonnerie, épicerie…) et groupes alimentaires.
-- Toutes les tables sont réservées au service role (RLS sans policy).
-- Voir docs/AGENT-PROSPECTION.md
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.prospects (
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

create index if not exists prospects_statut_idx on public.prospects (statut, prochaine_action_at);
create index if not exists prospects_email_idx on public.prospects (lower(email));
create unique index if not exists prospects_token_idx on public.prospects (unsubscribe_token);

create table if not exists public.prospection_messages (
  id           bigserial primary key,
  prospect_id  uuid references public.prospects(id) on delete cascade,
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

alter table public.prospects            enable row level security;
alter table public.prospection_messages enable row level security;
alter table public.linkedin_posts       enable row level security;
alter table public.prospection_etat     enable row level security;

-- Réserve un lot de prospects pour une action (évite les doubles envois
-- si deux exécutions du cron se chevauchent).
create or replace function public.claim_prospects(p_statuts text[], n int)
returns setof public.prospects
language sql as $$
  update public.prospects p set statut = 'en_cours'
   where p.id in (
     select id from public.prospects
      where statut = any(p_statuts)
        and email is not null
        and (prochaine_action_at is null or prochaine_action_at <= now())
      order by prochaine_action_at nulls first, created_at
      limit n
      for update skip locked)
  returning p.*;
$$;
revoke all on function public.claim_prospects(text[], int) from public, anon, authenticated;

-- ── Planification (pg_cron + pg_net) ───────────────────────────────────────
-- À exécuter une fois dans le SQL editor en remplaçant AGENT_SECRET_ICI par
-- la valeur du secret AGENT_SECRET de la fonction. Chaque action vérifie
-- elle-même l'heure de Paris (jours ouvrés, heures de bureau).
--
-- select cron.schedule('agent-sourcer',  '7 * * * *',     $$ select net.http_post(url := 'https://epvdzhzwfmtnioedyfgm.supabase.co/functions/v1/agent-prospection', body := '{"action":"sourcer"}'::jsonb,       headers := '{"Content-Type":"application/json","x-agent-secret":"AGENT_SECRET_ICI"}'::jsonb, timeout_milliseconds := 150000) $$);
-- select cron.schedule('agent-enrichir', '*/10 * * * *',  $$ select net.http_post(url := 'https://epvdzhzwfmtnioedyfgm.supabase.co/functions/v1/agent-prospection', body := '{"action":"enrichir"}'::jsonb,      headers := '{"Content-Type":"application/json","x-agent-secret":"AGENT_SECRET_ICI"}'::jsonb, timeout_milliseconds := 150000) $$);
-- select cron.schedule('agent-envoyer',  '*/15 * * * *',  $$ select net.http_post(url := 'https://epvdzhzwfmtnioedyfgm.supabase.co/functions/v1/agent-prospection', body := '{"action":"envoyer"}'::jsonb,       headers := '{"Content-Type":"application/json","x-agent-secret":"AGENT_SECRET_ICI"}'::jsonb, timeout_milliseconds := 150000) $$);
-- select cron.schedule('agent-linkedin', '*/15 * * * *',  $$ select net.http_post(url := 'https://epvdzhzwfmtnioedyfgm.supabase.co/functions/v1/agent-prospection', body := '{"action":"linkedin-post"}'::jsonb, headers := '{"Content-Type":"application/json","x-agent-secret":"AGENT_SECRET_ICI"}'::jsonb, timeout_milliseconds := 150000) $$);
-- select cron.schedule('agent-digest',   '*/15 * * * *',  $$ select net.http_post(url := 'https://epvdzhzwfmtnioedyfgm.supabase.co/functions/v1/agent-prospection', body := '{"action":"digest"}'::jsonb,        headers := '{"Content-Type":"application/json","x-agent-secret":"AGENT_SECRET_ICI"}'::jsonb, timeout_milliseconds := 150000) $$);
