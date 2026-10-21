-- Catégorie « Paniers » (corbeilles, paniers garnis) disponible à l'ajout produit
-- pour tous les métiers. Primeur, fromagerie et poissonnerie l'avaient déjà
-- (slugs paniers / plateaux-fromage / plateaux). Les slugs étant uniques,
-- chaque métier reçoit paniers-<métier>.
insert into categories (nom, slug, emoji, ordre, business_type, commercant_id)
select 'Paniers', 'paniers-' || t, '🧺', 99, t, null
from unnest(array['boucherie','boulangerie','traiteur','fleuriste','pizzeria','restaurant','fastfood']) as t
where not exists (select 1 from categories where slug = 'paniers-' || t);
