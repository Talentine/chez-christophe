-- ════════════════════════════════════════════════════════════════════
-- Points de retrait multiples
-- ════════════════════════════════════════════════════════════════════
-- Une boutique peut avoir plusieurs lieux de retrait sur un seul site :
--   • plusieurs magasins (chaque magasin a ses propres créneaux) ;
--   • des commerçants itinérants (lundi marché de Caen, mardi marché du
--     Havre…) : chaque créneau hebdo est rattaché au marché du jour.
--
-- Configuration réservée à l'admin Marchéo : seules les personnes ayant le
-- rôle 'admin' dans roles_utilisateurs peuvent créer / modifier / supprimer
-- des points. La fonctionnalité est active dès qu'une boutique a au moins
-- un point actif ; sans point, rien ne change (adresse de la fiche).
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.points_retrait (
  id            uuid primary key default gen_random_uuid(),
  commercant_id uuid not null references public.commercants(id) on delete cascade,
  nom           text not null,
  adresse       text,
  code_postal   text,
  ville         text,
  infos         text,               -- ex. « Place Saint-Sauveur, stand n°12 »
  ordre         integer not null default 0,
  actif         boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists points_retrait_commercant_idx
  on public.points_retrait (commercant_id, ordre);

alter table public.points_retrait enable row level security;

drop policy if exists points_retrait_lecture_publique on public.points_retrait;
create policy points_retrait_lecture_publique on public.points_retrait
  for select using (true);

drop policy if exists points_retrait_admin_all on public.points_retrait;
create policy points_retrait_admin_all on public.points_retrait
  for all to authenticated
  using (exists (select 1 from public.roles_utilisateurs ru
                 where ru.user_id = (select auth.uid()) and ru.role = 'admin'))
  with check (exists (select 1 from public.roles_utilisateurs ru
                      where ru.user_id = (select auth.uid()) and ru.role = 'admin'));

-- Mode d'affichage des créneaux côté client quand il y a plusieurs points :
--   'par_point'      → créneaux regroupés par boutique / point de retrait
--   'chronologique'  → liste par date, le lieu affiché sur chaque créneau
--                      (idéal pour les marchés : lun. Caen, mar. Le Havre…)
alter table public.commercants
  add column if not exists points_retrait_affichage text not null default 'par_point';

alter table public.commercants
  drop constraint if exists commercants_points_retrait_affichage_check;
alter table public.commercants
  add constraint commercants_points_retrait_affichage_check
  check (points_retrait_affichage in ('par_point', 'chronologique'));

-- Rattachement d'un créneau à un point de retrait (null = adresse de la fiche)
alter table public.creneaux
  add column if not exists point_retrait_id uuid
  references public.points_retrait(id) on delete set null;

create index if not exists creneaux_point_retrait_idx on public.creneaux (point_retrait_id);

-- La commande mémorise le lieu au moment de l'achat (copie figée : si le
-- point est renommé ou supprimé plus tard, l'historique reste juste).
alter table public.commandes
  add column if not exists point_retrait_id uuid
  references public.points_retrait(id) on delete set null;
alter table public.commandes add column if not exists point_retrait_nom text;
alter table public.commandes add column if not exists point_retrait_adresse text;

-- Rempli côté serveur à partir du créneau choisi : le client ne peut pas
-- imposer un point qui n'appartient pas à la boutique.
create or replace function public.commandes_set_point_retrait()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_point public.points_retrait%rowtype;
begin
  new.point_retrait_id := null;
  new.point_retrait_nom := null;
  new.point_retrait_adresse := null;

  if new.creneau_id is null or coalesce(new.type, 'retrait') <> 'retrait' then
    return new;
  end if;

  select p.* into v_point
    from public.creneaux c
    join public.points_retrait p on p.id = c.point_retrait_id
   where c.id = new.creneau_id
     and c.commercant_id = new.commercant_id
     and p.commercant_id = new.commercant_id
   limit 1;

  if found then
    new.point_retrait_id := v_point.id;
    new.point_retrait_nom := v_point.nom;
    new.point_retrait_adresse := nullif(concat_ws(', ',
      nullif(trim(v_point.adresse), ''),
      nullif(trim(concat_ws(' ', nullif(trim(v_point.code_postal), ''), nullif(trim(v_point.ville), ''))), '')
    ), '');
  end if;

  return new;
end;
$$;

revoke execute on function public.commandes_set_point_retrait() from public, anon, authenticated;

drop trigger if exists trg_commandes_set_point_retrait on public.commandes;
create trigger trg_commandes_set_point_retrait
  before insert on public.commandes
  for each row execute function public.commandes_set_point_retrait();
