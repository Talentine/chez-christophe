// ============================================================
// Edge Function: send-push
// Envoie une notification push (Web Push VAPID) à toutes les
// souscriptions d'un commerçant donné.
//
// Body (POST) :
//   { commande_id }                     → push "nouvelle commande"
//   { commercant_id, titre, corps, url } → push custom
//
// Variables d'env requises :
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT (optionnel, ex: "mailto:contact@marcheo.fr")
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7?target=denonext';

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:contact@marcheo.fr';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    let commercantId: string | undefined = body.commercant_id;
    let titre = body.titre as string | undefined;
    let corps = body.corps as string | undefined;
    let url = body.url as string | undefined;

    // Mode "commande" : on charge la commande pour construire le payload
    if (body.commande_id) {
      const { data: cmd, error } = await supabase
        .from('commandes')
        .select('id, numero, total_ttc, type, commercant_id, clients(prenom, nom)')
        .eq('id', body.commande_id).single();
      if (error || !cmd) return json({ error: 'Commande introuvable' }, 404);
      commercantId = cmd.commercant_id;
      const client = cmd.clients ? `${cmd.clients.prenom || ''} ${cmd.clients.nom?.[0] || ''}.`.trim() : 'Client';
      titre = '🛒 Nouvelle commande !';
      corps = `${client} · ${(cmd.total_ttc || 0).toFixed(2).replace('.', ',')}€ · ${cmd.type === 'livraison' ? '🚚 livraison' : '📍 retrait'}`;
      url = '/app-commercant.html';
    }

    if (!commercantId) return json({ error: 'commercant_id ou commande_id requis' }, 400);

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('commercant_id', commercantId);

    if (!subs || subs.length === 0) return json({ ok: true, sent: 0, reason: 'no subscriptions' });

    const payload = JSON.stringify({
      titre: titre || '🛒 Notification',
      corps: corps || '',
      url:   url   || '/app-commercant.html',
    });

    let sent = 0;
    let failed = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        sent++;
      } catch (e: any) {
        failed++;
        // 410 Gone / 404 → souscription expirée, on supprime
        if (e?.statusCode === 410 || e?.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        } else {
          console.error('push fail', s.endpoint?.slice(0, 60), e?.statusCode, e?.body || e?.message);
        }
      }
    }

    return json({ ok: true, sent, failed });
  } catch (e) {
    console.error('[send-push]', e);
    return json({ error: e.message || String(e) }, 500);
  }
});
