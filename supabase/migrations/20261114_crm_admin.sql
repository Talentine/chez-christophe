-- CRM de l'admin Marchéo : suivi des commerçants, du premier contact à la boutique en ligne.
-- Trois tables réservées aux administrateurs (roles_utilisateurs.role = 'admin').
-- Rien n'est modifié dans les tables existantes : l'étape, le score et la prochaine action sont calculés
-- dans le navigateur à partir de commercants, leads_inscription, audits_prospects, commandes et analytics_events.
--
-- Clé de fiche « cle » :  c:<commercants.id>  |  a:<audits_prospects.fiche_id>  |  l:<e-mail en minuscules>
-- Une même personne peut avoir plusieurs clés (inscription, puis audit, puis démo) : le navigateur les regroupe,
-- il n'y a donc ni clé étrangère ni fusion à faire ici.

create table if not exists public.crm_fiches (
  id uuid primary key default gen_random_uuid(),
  cle text not null unique check (cle ~ '^[cal]:.+' and length(cle) <= 260),
  perdu_at timestamptz,
  motif_perte text check (motif_perte is null or length(motif_perte) <= 200),
  reporte_jusqua date,
  note_epinglee text check (note_epinglee is null or length(note_epinglee) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.crm_fiches is 'CRM admin : état manuel d''une fiche (perdue, action reportée, note épinglée). Créée à la première écriture.';

create table if not exists public.crm_interactions (
  id uuid primary key default gen_random_uuid(),
  cle text not null check (cle ~ '^[cal]:.+' and length(cle) <= 260),
  type text not null check (type in ('note', 'appel', 'email', 'sms', 'whatsapp', 'rdv', 'visite', 'etape')),
  resultat text check (resultat is null or resultat in
    ('joint', 'messagerie', 'pas_de_reponse', 'a_rappeler', 'rdv_pris', 'pas_interesse', 'perdu', 'rouvert')),
  contenu text check (contenu is null or length(contenu) <= 8000),
  fait_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on table public.crm_interactions is 'CRM admin : journal des échanges avec un commerçant ou un prospect (notes, appels et leur résultat, messages).';
create index if not exists crm_interactions_cle_idx on public.crm_interactions (cle, fait_at desc);

create table if not exists public.crm_taches (
  id uuid primary key default gen_random_uuid(),
  cle text not null check (cle ~ '^[cal]:.+' and length(cle) <= 260),
  titre text not null check (length(titre) between 1 and 300),
  echeance date not null default current_date,
  fait_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.crm_taches is 'CRM admin : tâches et rappels datés, rattachés à une fiche.';
create index if not exists crm_taches_ouvertes_idx on public.crm_taches (echeance) where fait_at is null;
create index if not exists crm_taches_cle_idx on public.crm_taches (cle);

-- updated_at tenu à jour sur crm_fiches
create or replace function public.crm_fiches_maj_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists crm_fiches_updated_at on public.crm_fiches;
create trigger crm_fiches_updated_at before update on public.crm_fiches
  for each row execute function public.crm_fiches_maj_updated_at();

-- Accès : administrateurs uniquement
alter table public.crm_fiches enable row level security;
alter table public.crm_interactions enable row level security;
alter table public.crm_taches enable row level security;

revoke all on public.crm_fiches, public.crm_interactions, public.crm_taches from anon;
grant select, insert, update, delete on public.crm_fiches, public.crm_interactions, public.crm_taches to authenticated;

drop policy if exists crm_fiches_admin on public.crm_fiches;
create policy crm_fiches_admin on public.crm_fiches for all to authenticated
  using (exists (select 1 from public.roles_utilisateurs ru where ru.user_id = (select auth.uid()) and ru.role = 'admin'))
  with check (exists (select 1 from public.roles_utilisateurs ru where ru.user_id = (select auth.uid()) and ru.role = 'admin'));

drop policy if exists crm_interactions_admin on public.crm_interactions;
create policy crm_interactions_admin on public.crm_interactions for all to authenticated
  using (exists (select 1 from public.roles_utilisateurs ru where ru.user_id = (select auth.uid()) and ru.role = 'admin'))
  with check (exists (select 1 from public.roles_utilisateurs ru where ru.user_id = (select auth.uid()) and ru.role = 'admin'));

drop policy if exists crm_taches_admin on public.crm_taches;
create policy crm_taches_admin on public.crm_taches for all to authenticated
  using (exists (select 1 from public.roles_utilisateurs ru where ru.user_id = (select auth.uid()) and ru.role = 'admin'))
  with check (exists (select 1 from public.roles_utilisateurs ru where ru.user_id = (select auth.uid()) and ru.role = 'admin'));
