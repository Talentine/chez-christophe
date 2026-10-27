-- Marchéo — Réparation du cron des rappels J-1
-- Avant : 'Bearer VOTRE_SERVICE_ROLE_KEY' (clé factice → 401, aucun rappel
-- envoyé) et passage quotidien à 10h UTC alors que send-email ne vise que les
-- retraits à +20h/+28h → seuls les retraits de 6h à 14h UTC étaient couverts.
-- Après : clé anon publique (comme les autres crons) et passage horaire ;
-- commandes.rappel_j1_envoye_at empêche tout double envoi.

select cron.schedule('rappels-j-1', '20 * * * *', $cron$
  select net.http_post(
    url := 'https://epvdzhzwfmtnioedyfgm.supabase.co/functions/v1/send-email',
    body := '{"action":"cron-rappels"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdmR6aHp3Zm10bmlvZWR5ZmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDYwMTgsImV4cCI6MjA5MjAyMjAxOH0.NnMHas3OCJxfqQW3lUG9LDrklsuO_c9-Xpm41K5q1uc',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdmR6aHp3Zm10bmlvZWR5ZmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDYwMTgsImV4cCI6MjA5MjAyMjAxOH0.NnMHas3OCJxfqQW3lUG9LDrklsuO_c9-Xpm41K5q1uc'
    )
  );
$cron$);
