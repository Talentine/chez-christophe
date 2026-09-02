// Edge Function — notify-client v9 (RGPD + auth + plafond SMS)
// is_marketing=true → exige sms_marketing_consent. Sinon transactionnel (opt_out_sms uniquement).
//
// v7 (2026-09-01) : ajout de l'authentification. Avant, la fonction était
// ouverte (verify_jwt=false, aucun contrôle) : n'importe qui pouvait déclencher
// un SMS Twilio facturé, avec un texte arbitraire, au nom d'une boutique.
// Désormais : JWT obligatoire + l'appelant doit être le commerçant propriétaire
// du commercant_id (ou un admin).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const SMS_COST_CENTS_DEFAULT = 7

function renderTemplate(tpl: string, vars: Record<string, any>): string {
  return tpl.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, k) => {
    const v = vars[k]
    if (v === undefined || v === null) return ''
    return String(v)
  })
}

async function envoyerSMS(tel: string, message: string) {
  const ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
  const AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN')
  const FROM_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')
  if (!ACCOUNT_SID || !AUTH_TOKEN || !FROM_NUMBER) {
    return { ok: false, error: 'Secrets Twilio manquants', cost_cents: 0 }
  }
  let to = tel.replace(/[\s.\-]/g, '')
  if (to.startsWith('0')) to = '+33' + to.slice(1)
  if (!to.startsWith('+')) to = '+33' + to
  const params = new URLSearchParams({ To: to, From: FROM_NUMBER, Body: message })
  const r = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
    { method: 'POST', headers: {
      'Authorization': 'Basic ' + btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    }, body: params.toString() }
  )
  const data = await r.json()
  if (!r.ok || data.code) return { ok: false, error: data.message || 'Twilio error', cost_cents: 0 }
  return { ok: true, sid: data.sid, cost_cents: SMS_COST_CENTS_DEFAULT }
}

async function envoyerPush(clientId: string, titre: string, corps: string, url: string) {
  try {
    const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ client_id: clientId, titre, corps, url }),
    })
    const data = await r.json()
    if (!r.ok) return { ok: false, error: data.error || 'send-push HTTP ' + r.status }
    if ((data.sent || 0) === 0) return { ok: false, error: data.reason || 'aucun device push enregistré' }
    return { ok: true, sent: data.sent }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const {
      commercant_id, client_id, message,
      canal_prefere = 'auto', template_nom, segment_id, force_sms,
      is_marketing = false  // par défaut transactionnel ; les campagnes manuelles passent true
    } = body

    if (!commercant_id || !client_id || !message) {
      return new Response(JSON.stringify({ error: 'commercant_id, client_id et message requis' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── AUTH : JWT utilisateur obligatoire ────────────────────────────
    // La clé anon est un JWT valide mais ne résout aucun utilisateur :
    // getUser() échoue, l'appel est donc rejeté. C'est le comportement voulu.
    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Authentification requise' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    // Appel interne de confiance : notify-segment relaie ses envois avec la
    // service_role key, qui n'est jamais exposée côté navigateur. Il a déjà
    // vérifié le JWT et l'ownership du commerçant avant de relayer.
    const isInternal = jwt === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!isInternal) {
      const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(jwt)
      const user = authErr ? null : authData?.user
      if (!user) {
        return new Response(JSON.stringify({ error: 'Session invalide ou expirée' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // ── OWNERSHIP : l'appelant doit être le commerçant ciblé (ou un admin) ──
      const { data: proprio } = await supabaseAdmin
        .from('commercants').select('id')
        .eq('id', commercant_id).eq('auth_user_id', user.id).maybeSingle()
      let autorise = !!proprio
      if (!autorise) {
        const { data: admin } = await supabaseAdmin
          .from('roles_utilisateurs').select('user_id')
          .eq('user_id', user.id).eq('role', 'admin').maybeSingle()
        autorise = !!admin
      }
      if (!autorise) {
        return new Response(JSON.stringify({ error: 'Accès refusé' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    const { data: client } = await supabaseAdmin
      .from('clients').select('*').eq('id', client_id).single()
    if (!client) {
      return new Response(JSON.stringify({ error: 'Client introuvable' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: commercant } = await supabaseAdmin
      .from('commercants').select('id, slug, nom_boutique, offre').eq('id', commercant_id).single()
    if (!commercant) {
      return new Response(JSON.stringify({ error: 'Commerçant introuvable' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { count: nbSubs } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client_id)
      .eq('actif', true)
    const hasPushSub = (nbSubs || 0) > 0

    const produitPref = Array.isArray(client.produits_preferes) && client.produits_preferes.length > 0
      ? client.produits_preferes[0]?.nom : null
    const variables = {
      prenom: client.prenom || '',
      nom: client.nom || '',
      nom_complet: `${client.prenom || ''} ${client.nom || ''}`.trim(),
      produit_prefere: produitPref || 'votre produit préféré',
      nom_boutique: commercant.nom_boutique || '',
      total_depense: ((client.total_depense_cents || 0) / 100).toFixed(2) + ' €',
      nb_commandes: client.nb_commandes || 0,
    }
    const messageRendu = renderTemplate(message, variables)
    const unsubUrl = `https://www.xn--marcho-fva.fr/unsubscribe.html?t=${client.unsubscribe_token}`

    // ── PLAFOND SMS ───────────────────────────────────────────────────────
    // Les SMS du CRM (ce chemin) sont plafonnes par le quota mensuel de l'offre,
    // packs achetes inclus. Les SMS transactionnels lies aux commandes passent
    // par send-sms et ne sont pas concernes.
    const moisCourant = new Date().toISOString().slice(0, 7)
    const { data: quotaRow } = await supabaseAdmin
      .from('quotas_notifications')
      .select('sms_envoyes, sms_quota')
      .eq('commercant_id', commercant_id)
      .eq('mois', moisCourant)
      .maybeSingle()

    const quotaOffre = commercant.offre === 'livraison' ? 100
      : commercant.offre === 'clickcollect' ? 50 : 0
    const smsQuota   = quotaRow ? Math.max(quotaRow.sms_quota || 0, quotaOffre) : quotaOffre
    const smsEnvoyes = quotaRow ? (quotaRow.sms_envoyes || 0) : 0
    const smsRestant = Math.max(0, smsQuota - smsEnvoyes)
    const quotaSmsEpuise = smsRestant <= 0

    const peutPush = !client.opt_out_push && hasPushSub
    // ── RGPD : pour MARKETING, exiger sms_marketing_consent=true. Pour transactionnel, juste !opt_out_sms
    const peutSMS  = is_marketing
      ? (client.sms_marketing_consent === true && !client.opt_out_sms && !!client.telephone)
      : (!client.opt_out_sms && !!client.telephone)

    let canal: 'push' | 'sms' = 'sms'
    if (force_sms) canal = 'sms'
    else if (canal_prefere === 'push') canal = peutPush ? 'push' : 'sms'
    else if (canal_prefere === 'sms') canal = 'sms'
    else canal = peutPush ? 'push' : 'sms'

    // Quota epuise : on tente le push, sinon on refuse sans rien facturer.
    if (canal === 'sms' && quotaSmsEpuise) {
      if (peutPush) {
        canal = 'push'
      } else {
        return new Response(JSON.stringify({
          error: `Quota SMS epuise (${smsEnvoyes}/${smsQuota} ce mois-ci). Achetez un pack pour continuer.`,
          skipped: true,
          quota_depasse: true,
          sms_envoyes: smsEnvoyes,
          sms_quota: smsQuota,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    if (canal === 'sms' && !peutSMS) {
      const reason = is_marketing && client.sms_marketing_consent !== true
        ? 'pas de consentement SMS marketing (RGPD)'
        : (client.opt_out_sms ? 'opt-out SMS' : 'pas de numéro de téléphone')
      return new Response(JSON.stringify({ error: reason, skipped: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (canal === 'push' && !peutPush) {
      if (peutSMS && !quotaSmsEpuise) canal = 'sms'
      else {
        return new Response(JSON.stringify({ error: 'Aucun canal disponible', skipped: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    let cost = 0
    let providerId: string | null = null
    let statut = 'echec'
    let erreur: string | null = null

    if (canal === 'sms') {
      const messageFinal = messageRendu + `\nSTOP : ${unsubUrl}`
      const res = await envoyerSMS(client.telephone, messageFinal)
      cost = res.cost_cents
      providerId = res.sid || null
      statut = res.ok ? 'envoyee' : 'echec'
      erreur = res.error || null
    } else {
      const titre = commercant.nom_boutique || 'Nouveau message'
      const url = `https://www.xn--marcho-fva.fr/${commercant.slug}/`
      const res = await envoyerPush(client_id, titre, messageRendu, url)
      statut = res.ok ? 'envoyee' : 'echec'
      erreur = res.error || null
      if (!res.ok && canal_prefere === 'auto' && peutSMS && !quotaSmsEpuise) {
        canal = 'sms'
        const messageFinal = messageRendu + `\nSTOP : ${unsubUrl}`
        const resSms = await envoyerSMS(client.telephone, messageFinal)
        cost = resSms.cost_cents
        providerId = resSms.sid || null
        statut = resSms.ok ? 'envoyee' : 'echec'
        erreur = resSms.error || null
      }
    }

    let quota: any = null
    if (statut === 'envoyee') {
      const { data: q } = await supabaseAdmin.rpc('incrementer_quota_notif', {
        p_commercant_id: commercant_id, p_canal: canal, p_cost_cents: cost,
      })
      quota = q
    }

    await supabaseAdmin.from('notifications_envoyees').insert({
      commercant_id, client_id, segment_id: segment_id || null,
      canal, template_nom: template_nom || null,
      message: messageRendu, variables,
      statut, erreur, cost_cents: cost, provider_id: providerId,
    })

    return new Response(JSON.stringify({
      success: statut === 'envoyee',
      canal, statut, erreur, cost_cents: cost, quota,
      had_push: hasPushSub, is_marketing,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.log('[notify-client] Exception:', String(err))
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
