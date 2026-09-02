// Edge Function — notify-segment v3 (RGPD + auth + remontée du plafond SMS)
// Envoi marketing à un segment de clients : exige sms_marketing_consent=true
//
// v2 (2026-09-01) : ajout de l'authentification. Avant, verify_jwt=true suffisait,
// or la clé anon publiée dans le front est un JWT valide : n'importe qui pouvait
// envoyer un SMS marketing arbitraire à jusqu'à 500 clients d'une boutique, aux
// frais du commerçant et en son nom. Désormais : JWT utilisateur + ownership.
// v3 (2026-09-01) : compte les envois refusés pour quota SMS épuisé (quota_bloques)
// afin que le dashboard puisse proposer l'achat d'un pack.
//
// POST body :
// {
//   commercant_id: uuid,
//   segment: 'vip'|'inactif_14j'|'inactif_30j'|'nouveau'|'gros_panier'|'all'|'custom',
//   message: string,
//   canal_prefere?: 'auto'|'push'|'sms',
//   template_nom?: string,
//   segment_id?: uuid,
//   max_recipients?: number,
//   dry_run?: boolean
// }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const {
      commercant_id,
      segment = 'all',
      message,
      canal_prefere = 'auto',
      template_nom,
      segment_id,
      max_recipients = 500,
      dry_run = false,
    } = body

    if (!commercant_id || !message) {
      return new Response(JSON.stringify({ error: 'commercant_id et message requis' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── AUTH : JWT utilisateur obligatoire ────────────────────────────
    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Authentification requise' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const { data: authData, error: authErr } = await supabase.auth.getUser(jwt)
    const user = authErr ? null : authData?.user
    if (!user) {
      return new Response(JSON.stringify({ error: 'Session invalide ou expirée' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── OWNERSHIP : l'appelant doit être le commerçant ciblé (ou un admin) ──
    const { data: proprio } = await supabase
      .from('commercants').select('id')
      .eq('id', commercant_id).eq('auth_user_id', user.id).maybeSingle()
    let autorise = !!proprio
    if (!autorise) {
      const { data: admin } = await supabase
        .from('roles_utilisateurs').select('user_id')
        .eq('user_id', user.id).eq('role', 'admin').maybeSingle()
      autorise = !!admin
    }
    if (!autorise) {
      return new Response(JSON.stringify({ error: 'Accès refusé' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let q = supabase
      .from('clients')
      .select('id, prenom, nom, telephone, opt_out_sms, opt_out_push, segments, sms_marketing_consent, email_marketing_consent')
      .eq('commercant_id', commercant_id)
      .limit(max_recipients)

    if (segment !== 'all') {
      q = q.contains('segments', [segment])
    }

    const { data: clients, error } = await q
    if (error) throw error
    if (!clients || clients.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: 'Aucun client dans ce segment' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Quota
    const mois = new Date().toISOString().slice(0, 7)
    const { data: quotaRow } = await supabase
      .from('quotas_notifications')
      .select('*')
      .eq('commercant_id', commercant_id)
      .eq('mois', mois)
      .maybeSingle()
    const smsRestant = quotaRow ? Math.max(0, (quotaRow.sms_quota || 0) - (quotaRow.sms_envoyes || 0)) : 50

    // ── RGPD/LCEN : pour SMS MARKETING, opt-in EXPLICITE requis (sms_marketing_consent=true)
    //    Push : opt-in implicite par abonnement Web Push (l'utilisateur a cliqué Autoriser)
    const cibleSMS  = clients.filter(c => c.sms_marketing_consent === true && !c.opt_out_sms && !!c.telephone)
    const ciblePush = clients.filter(c => !c.opt_out_push)

    let estCanalSMS = 0, estCanalPush = 0
    if (canal_prefere === 'sms') {
      estCanalSMS = cibleSMS.length
    } else if (canal_prefere === 'push') {
      estCanalPush = ciblePush.length
    } else {
      ciblePush.forEach(_ => estCanalPush++)
      cibleSMS.filter(c => c.opt_out_push).forEach(_ => estCanalSMS++)
    }

    const sms_overage = Math.max(0, estCanalSMS - smsRestant)
    const sms_dans_quota = Math.min(estCanalSMS, smsRestant)
    const cost_estime_cents = sms_overage * 12

    if (dry_run) {
      return new Response(JSON.stringify({
        dry_run: true,
        total_clients: clients.length,
        clients_sans_consent_sms: clients.length - cibleSMS.length,
        estim: {
          push: estCanalPush,
          sms: estCanalSMS,
          sms_dans_quota,
          sms_overage,
          cost_estime_cents,
          cost_estime_eur: (cost_estime_cents / 100).toFixed(2)
        }
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Envoi réel — on appelle notify-client avec is_marketing:true (filtre côté serveur).
    // Le relais se fait avec la service_role key : notify-client la reconnaît comme
    // appel interne de confiance, l'ownership ayant déjà été vérifié ci-dessus.
    // notify-client applique lui-même le plafond SMS ; on compte ici les refus.
    const results = { sent: 0, failed: 0, skipped: 0, push: 0, sms: 0, total_cost_cents: 0, quota_bloques: 0 }
    let sms_quota_vu: number | null = null
    let sms_envoyes_vu: number | null = null
    const concurrency = 5
    for (let i = 0; i < clients.length; i += concurrency) {
      const lot = clients.slice(i, i + concurrency)
      const responses = await Promise.all(lot.map(c =>
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-client`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            commercant_id,
            client_id: c.id,
            message,
            canal_prefere,
            template_nom,
            segment_id,
            is_marketing: true,
          }),
        }).then(r => r.json()).catch(e => ({ error: String(e) }))
      ))
      responses.forEach(r => {
        if (r.quota_depasse) {
          results.quota_bloques++
          if (r.sms_quota != null) sms_quota_vu = r.sms_quota
          if (r.sms_envoyes != null) sms_envoyes_vu = r.sms_envoyes
        } else if (r.skipped) results.skipped++
        else if (r.success) {
          results.sent++
          if (r.canal === 'push') results.push++
          if (r.canal === 'sms') {
            results.sms++
            results.total_cost_cents += (r.cost_cents || 0)
          }
        } else {
          results.failed++
        }
      })
    }

    return new Response(JSON.stringify({
      success: true,
      ...results,
      sms_quota: sms_quota_vu,
      sms_envoyes: sms_envoyes_vu,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.log('[notify-segment] Exception:', String(err))
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
