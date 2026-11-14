-- CRM admin : présence en ligne d'un commerce (fiche Google, Instagram, Facebook).
-- crm_prospects : liens trouvés automatiquement à la recherche (OpenStreetMap) ou saisis sur le prospect.
-- crm_fiches    : liens saisis à la main sur n'importe quelle fiche ; ils priment sur les liens trouvés.

alter table public.crm_prospects
  add column if not exists google_url text check (google_url is null or (google_url ~ '^https://' and length(google_url) <= 500)),
  add column if not exists instagram text check (instagram is null or (instagram ~ '^https://' and length(instagram) <= 500)),
  add column if not exists facebook text check (facebook is null or (facebook ~ '^https://' and length(facebook) <= 500));

alter table public.crm_fiches
  add column if not exists lien_google text check (lien_google is null or (lien_google ~ '^https://' and length(lien_google) <= 500)),
  add column if not exists lien_instagram text check (lien_instagram is null or (lien_instagram ~ '^https://' and length(lien_instagram) <= 500)),
  add column if not exists lien_facebook text check (lien_facebook is null or (lien_facebook ~ '^https://' and length(lien_facebook) <= 500));
