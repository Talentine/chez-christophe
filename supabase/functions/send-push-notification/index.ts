// Edge Function — send-push-notification v2
// Prévient le commerçant sur ses appareils qu'une nouvelle commande arrive.
// Déclenchée par le trigger "trigger-push-notification" (AFTER INSERT sur
// public.commandes), qui appelle avec la service_role key.
//
// v2 (2026-09-01) : appel réservé au trigger. Avant, verify_jwt=true suffisait,
// or la clé anon publiée dans le front est un JWT valide : n'importe qui pouvait
// forger un "record" et faire sonner les téléphones d'un commerçant en boucle.
// Le contenu de la notification est désormais relu depuis la base au lieu d'être
// pris tel quel dans le payload.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  try {
    // ── Appel interne uniquement ──────────────────────────────────────
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (jwt !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
      console.log('[send-push-notification] appel externe refuse')
      return json({ error: 'Acces refuse' }, 403)
    }

    const payload = await req.json()
    const record = payload.record
    if (!record?.id) return json({ skip: 'no record' })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Relire la commande en base : le payload du trigger n'est pas une source
    // de verite pour le texte affiche au commercant.
    const { data: cmd } = await supabase
      .from('commandes')
      .select('id, numero, total_ttc, commercant_id')
      .eq('id', record.id)
      .single()

    if (!cmd?.commercant_id) return json({ skip: 'commande introuvable' })

    webpush.setVapidDetails(
      'mailto:paulmerieultpro14@gmail.com',
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!,
    )

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('commercant_id', cmd.commercant_id)

    if (error) {
      console.log('[send-push-notification] erreur subs:', error)
      return json({ error })
    }
    if (!subs || subs.length === 0) {
      return json({ msg: 'aucune souscription' })
    }

    const notifPayload = JSON.stringify({
      titre: 'Nouvelle commande !',
      corps: (cmd.numero || 'Commande') + ' — ' + (cmd.total_ttc || '') + '€',
      url: '/app-commercant.html',
    })

    const resultats = []
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          notifPayload,
        )
        resultats.push({ ok: true })
      } catch (e) {
        console.log('[send-push-notification] erreur envoi:', String(e))
        resultats.push({ ok: false, error: String(e) })
      }
    }

    return json({ success: true, resultats })
  } catch (err) {
    console.log('[send-push-notification] exception:', String(err))
    return json({ error: String(err) }, 500)
  }
})
