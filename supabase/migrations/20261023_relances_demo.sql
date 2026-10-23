-- Suivi des relances après création d'une démo gratuite (fonction relances-demo, appelée chaque heure)
alter table public.commercants add column if not exists relances_demo jsonb not null default '{}'::jsonb;
comment on column public.commercants.relances_demo is 'Suivi des relances après création de démo (j0, j1, j3, j7, appel, stop) : horodatages ISO, écrit par la fonction relances-demo.';

-- Planification (appliquée séparément, la clé anon figurant dans l'en-tête) :
-- select cron.schedule('relances-demo', '5 * * * *', $$ select net.http_post(
--   url := 'https://epvdzhzwfmtnioedyfgm.supabase.co/functions/v1/relances-demo',
--   body := '{"action":"cron"}'::jsonb,
--   headers := jsonb_build_object('Content-Type','application/json')) $$);
