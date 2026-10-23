-- Marchéo — Activation du poids indicatif sur les produits qui s'y prêtent
-- À appliquer APRÈS 20261023_poids_indicatif.sql.
-- Règles :
--   • produit vendu au kg      → prix au kg conservé, poids moyen ajouté (le client voit ≈ prix pièce)
--   • produit à prix fixe pièce → prix au kg déduit du prix actuel : le prix affiché ne change pas
--   • pastèque (1,20 € « pièce/demi », en réalité un prix au kg) → 1,20 €/kg × 4 kg
-- Sauvegarde préalable dans catalogue_backup_poids_indicatif (retour arrière en bas du fichier).

create table if not exists public.catalogue_backup_poids_indicatif as
  select id, prix_vente, prix_lot, prix_lot_qte, now() as sauvegarde_le
    from public.catalogue where false;
alter table public.catalogue_backup_poids_indicatif enable row level security; -- aucune lecture via l'API

with regles(nom, poids_g, mode) as (values
  -- Boucherie
  ('Côte de Bœuf', 1200, 'kg'), ('Entrecôte de Bœuf', 300, 'kg'), ('Faux-Filet de Bœuf', 250, 'kg'),
  ('Rumsteak de Bœuf', 200, 'kg'), ('Bavette d''Aloyau', 200, 'kg'),
  ('Gigot d''Agneau', 2200, 'kg'), ('Épaule d''Agneau', 1500, 'kg'), ('Carré d''Agneau', 800, 'kg'),
  ('Souris d''Agneau', 350, 'kg'), ('Rôti de Porc', 1000, 'kg'), ('Rôti de Veau', 1000, 'kg'),
  ('Rôti du Dimanche', 1000, 'kg'), ('Côtelette de Veau', 300, 'kg'), ('Côtelette de Porc', 220, 'kg'),
  ('Filet Mignon de Porc', 500, 'kg'), ('Jarret de Porc', 900, 'kg'), ('Escalope de Veau', 150, 'kg'),
  ('Foie de Veau', 150, 'kg'), ('Cuisse de Poulet', 280, 'kg'), ('Blanc de Poulet', 180, 'kg'),
  ('Poulet Fermier Entier', 1800, 'piece'), ('Pintade Fermière', 1400, 'piece'), ('Canard Fermier', 2200, 'piece'),
  ('Saucisson Sec', 250, 'piece'),
  -- Poissonnerie
  ('Bar sauvage', 600, 'kg'), ('Loup de mer', 600, 'kg'), ('Daurade royale', 450, 'kg'), ('Pageot rose', 450, 'kg'),
  ('Turbot sauvage', 1500, 'kg'), ('Saint-Pierre', 900, 'kg'), ('Sole meunière', 350, 'kg'),
  ('Rouget barbet', 200, 'kg'), ('Maquereau frais', 300, 'kg'), ('Saumon entier', 4000, 'kg'),
  ('Pavé de saumon', 160, 'kg'), ('Dos de cabillaud', 160, 'kg'), ('Darnes de thon', 250, 'kg'),
  ('Aile de raie', 500, 'kg'), ('Homard breton', 500, 'piece'), ('Tourteau', 700, 'piece'),
  -- Fromagerie (à la coupe)
  ('Comté 12 mois', 250, 'kg'), ('Comté 24 mois', 250, 'kg'), ('Beaufort d''été', 250, 'kg'), ('Cantal', 250, 'kg'),
  ('Ossau-Iraty', 250, 'kg'), ('Brebis des Pyrénées', 250, 'kg'), ('Pecorino affiné', 250, 'kg'),
  ('Raclette de Savoie', 250, 'kg'), ('Roquefort AOP', 250, 'kg'), ('Bleu d''Auvergne', 250, 'kg'), ('Bleu de Gex', 250, 'kg'),
  ('Brie de Meaux', 1000, 'piece'), ('Saint-Nectaire', 1700, 'piece'), ('Fourme d''Ambert', 750, 'piece'),
  -- Primeur
  ('Potimarron', 1200, 'piece'), ('Courge Spaghetti', 1200, 'piece'), ('Courges et potimarron', 1200, 'piece'),
  ('Pastèque sans pépins', 4000, 'pasteque')
),
cibles as (
  select c.id, c.prix_vente, c.prix_lot, c.prix_lot_qte, r.poids_g, r.mode,
         coalesce(nullif(c.prix_vente, 0), pb.prix_marche_indicatif) as prix
    from public.catalogue c
    join public.produits_base pb on pb.id = c.produit_base_id
    join public.commercants m on m.id = c.commercant_id
    join regles r on r.nom = pb.nom
   where m.supprime_at is null
     and m.business_type in ('boucherie', 'poissonnerie', 'fromagerie', 'primeur')
     and c.poids_indicatif = false
     and coalesce(nullif(c.prix_vente, 0), pb.prix_marche_indicatif) > 0
),
sauvegarde as (
  insert into public.catalogue_backup_poids_indicatif (id, prix_vente, prix_lot, prix_lot_qte, sauvegarde_le)
  select id, prix_vente, prix_lot, prix_lot_qte, now() from cibles
  returning id
)
update public.catalogue c
   set poids_indicatif = true,
       poids_piece_g   = t.poids_g,
       prix_kg         = case t.mode
                           when 'piece' then round(t.prix * 1000.0 / t.poids_g, 2)
                           else t.prix end,
       poids_ecart_pct = 15
  from cibles t
 where c.id = t.id
   and c.id in (select id from sauvegarde);
-- prix_vente est recalculé par trg_catalogue_poids_indicatif (prix_kg × poids moyen).

-- ── Retour arrière (si besoin) ──────────────────────────────────────
-- update public.catalogue c set poids_indicatif = false, poids_piece_g = null, prix_kg = null,
--        prix_vente = b.prix_vente, prix_lot = b.prix_lot, prix_lot_qte = b.prix_lot_qte
--   from public.catalogue_backup_poids_indicatif b where b.id = c.id;
