-- Nouveau type de commerce : épicerie (déjà appliqué en production)
alter table public.commercants drop constraint if exists commercants_business_type_check;
alter table public.commercants add constraint commercants_business_type_check check (business_type = any (array['primeur','boucherie','boulangerie','poissonnerie','traiteur','fromagerie','fleuriste','pizzeria','restaurant','fastfood','epicerie']::text[]));
alter table public.categories drop constraint if exists categories_business_type_check;
alter table public.categories add constraint categories_business_type_check check (business_type = any (array['primeur','boucherie','boulangerie','poissonnerie','traiteur','fromagerie','fleuriste','pizzeria','restaurant','fastfood','epicerie']::text[]));
