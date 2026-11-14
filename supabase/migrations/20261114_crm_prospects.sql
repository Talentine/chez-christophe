-- CRM admin : prospection téléphonique (file d'appels à froid).
-- Un prospect est un commerce jamais inscrit sur Marchéo, trouvé par la recherche intégrée (OpenStreetMap),
-- importé d'une liste ou saisi à la main. Réservé aux administrateurs.
-- Les notes, tâches et suivis d'un prospect vivent dans crm_interactions / crm_taches sous la clé  p:<id>.

create table if not exists public.crm_prospects (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (length(nom) between 1 and 200),
  metier text check (metier is null or length(metier) <= 80),             -- libellé libre : Boulangerie, Boucherie-traiteur…
  business_type text check (business_type is null or length(business_type) <= 40), -- type Marchéo quand il est connu
  adresse text check (adresse is null or length(adresse) <= 300),
  commune text check (commune is null or length(commune) <= 120),
  code_postal text check (code_postal is null or length(code_postal) <= 10),
  departement text check (departement is null or length(departement) <= 3),
  telephone text check (telephone is null or telephone ~ '^0[1-9][0-9]{8}$'),  -- normalisé : 10 chiffres
  email text check (email is null or length(email) <= 200),
  site_web text check (site_web is null or length(site_web) <= 300),
  source text not null default 'manuel' check (source in ('osm', 'mairie', 'import', 'manuel')),
  source_ref text check (source_ref is null or length(source_ref) <= 80),   -- ex. osm:node/123
  remarque text check (remarque is null or length(remarque) <= 500),
  liste text not null default 'Prospection' check (length(liste) between 1 and 80),  -- campagne d'appels
  resultat text check (resultat is null or resultat in
    ('pas_de_reponse', 'messagerie', 'a_rappeler', 'pas_interesse', 'interesse', 'rdv', 'faux_numero', 'deja_site')),
  note text check (note is null or length(note) <= 4000),
  recommandation text check (recommandation is null or length(recommandation) <= 500),
  rappel_le date,
  nb_appels integer not null default 0 check (nb_appels >= 0),
  appele_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.crm_prospects is 'CRM admin : commerces à appeler (prospection à froid), résultat du dernier appel, note et recommandation obtenue.';

-- Un même numéro ou une même fiche source n'entre qu'une fois
create unique index if not exists crm_prospects_telephone_uniq on public.crm_prospects (telephone) where telephone is not null;
create unique index if not exists crm_prospects_source_ref_uniq on public.crm_prospects (source_ref) where source_ref is not null;
create index if not exists crm_prospects_liste_idx on public.crm_prospects (liste, created_at);

create or replace function public.crm_prospects_maj_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists crm_prospects_updated_at on public.crm_prospects;
create trigger crm_prospects_updated_at before update on public.crm_prospects
  for each row execute function public.crm_prospects_maj_updated_at();

alter table public.crm_prospects enable row level security;
revoke all on public.crm_prospects from anon;
grant select, insert, update, delete on public.crm_prospects to authenticated;

drop policy if exists crm_prospects_admin on public.crm_prospects;
create policy crm_prospects_admin on public.crm_prospects for all to authenticated
  using (exists (select 1 from public.roles_utilisateurs ru where ru.user_id = (select auth.uid()) and ru.role = 'admin'))
  with check (exists (select 1 from public.roles_utilisateurs ru where ru.user_id = (select auth.uid()) and ru.role = 'admin'));
