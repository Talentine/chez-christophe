-- Marchéo — Envoi du code fidélité au client par email
-- Dès qu'un code FIDEL-XXXXXXXX est généré (fn_fidelite_apres_remise), on
-- appelle send-email (action 'recompense-fidelite'). La clé utilisée est la
-- clé anon publique, déjà présente dans le front. email_envoye_at évite les
-- doubles envois (renseigné par la fonction).

alter table public.fidelite_recompenses
  add column if not exists email_envoye_at timestamptz;

comment on column public.fidelite_recompenses.email_envoye_at is 'Date d''envoi du code au client par email (send-email)';

create or replace function public.fn_fidelite_recompense_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform net.http_post(
    url := 'https://epvdzhzwfmtnioedyfgm.supabase.co/functions/v1/send-email',
    body := jsonb_build_object('action', 'recompense-fidelite', 'recompense_id', new.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdmR6aHp3Zm10bmlvZWR5ZmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDYwMTgsImV4cCI6MjA5MjAyMjAxOH0.NnMHas3OCJxfqQW3lUG9LDrklsuO_c9-Xpm41K5q1uc',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdmR6aHp3Zm10bmlvZWR5ZmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDYwMTgsImV4cCI6MjA5MjAyMjAxOH0.NnMHas3OCJxfqQW3lUG9LDrklsuO_c9-Xpm41K5q1uc'
    )
  );
  return new;
exception when others then
  -- Ne jamais bloquer la remise de la commande à cause de l'email
  raise warning 'fn_fidelite_recompense_email: %', sqlerrm;
  return new;
end $$;

drop trigger if exists fidelite_recompenses_email on public.fidelite_recompenses;
create trigger fidelite_recompenses_email
after insert on public.fidelite_recompenses
for each row execute function public.fn_fidelite_recompense_email();
