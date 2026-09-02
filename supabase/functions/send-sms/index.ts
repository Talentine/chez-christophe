// Edge Function — send-sms v3 (Twilio) — SMS transactionnels de commande
//
// v3 (2026-09-01) — FAILLE FERMÉE. Avant : la fonction acceptait un numéro et un
// texte totalement libres, avec pour seule protection verify_jwt=true — or la clé
// anon publiée dans le front est un JWT valide. C'était donc un relais SMS ouvert :
// n'importe qui pouvait envoyer n'importe quel texte à n'importe quel numéro depuis
// le numéro Twilio de Marchéo, aux frais de Marchéo (spam, phishing, facture).
//
// Désormais, deux chemins seulement :
//   1. Commerçant connecté : JWT utilisateur + propriétaire de la commande ciblée.
//   2. Client anonyme au checkout : commande_id obligatoire, le numéro doit
//      correspondre à celui du client de cette commande, et la commande doit avoir
//      été créée il y a moins de 30 minutes.
// Dans les deux cas le destinataire est borné par une commande réelle.
//
// Body : { telephone, message, commande_id }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const FENETRE_CHECKOUT_MIN = 30
const LONGUEUR_MAX_MESSAGE = 480

// Normalise un numéro FR en format international pour comparaison et envoi
function normaliserTel(brut: string): string {
  let tel = String(brut || '').replace(/[\s.\-()]/g, '')
  if (tel.startsWith('0')) tel = '+33' + tel.slice(1)
  if (!tel.startsWith('+')) tel = '+33' + tel
  return tel
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const { telephone, message, commande_id } = await req.json()

    const ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN')
    const FROM_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')

    if (!ACCOUNT_SID || !AUTH_TOKEN || !FROM_NUMBER) {
      const missing = [
        !ACCOUNT_SID && 'TWILIO_ACCOUNT_SID',
        !AUTH_TOKEN && 'TWILIO_AUTH_TOKEN',
        !FROM_NUMBER && 'TWILIO_PHONE_NUMBER',
      ].filter(Boolean).join(', ')
      console.log('[send-sms] Secrets manquants:', missing)
      return json({ error: 'Secrets Twilio manquants: ' + missing }, 500)
    }

    if (!telephone || !message) return json({ error: 'telephone et message requis' }, 400)
    if (!commande_id) return json({ error: 'commande_id requis' }, 400)
    if (String(message).length > LONGUEUR_MAX_MESSAGE) {
      return json({ error: 'Message trop long' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── La commande borne le destinataire ─────────────────────────────
    const { data: cmd } = await supabase
      .from('commandes')
      .select('id, commercant_id, created_at, clients(telephone, opt_out_sms)')
      .eq('id', commande_id)
      .single()

    if (!cmd) return json({ error: 'Commande introuvable' }, 404)

    const telClient = (cmd.clients as any)?.telephone
    const optOut    = (cmd.clients as any)?.opt_out_sms
    if (!telClient) return json({ error: 'Aucun numéro sur cette commande' }, 400)
    if (optOut) return json({ error: 'Client désinscrit des SMS', skipped: true }, 200)

    const telDemande = normaliserTel(telephone)
    if (telDemande !== normaliserTel(telClient)) {
      console.log('[send-sms] refus : numéro different de celui de la commande')
      return json({ error: 'Numéro non associé à cette commande' }, 403)
    }

    // ── Qui appelle ? ─────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    let autorise = false

    if (jwt) {
      const { data: authData } = await supabase.auth.getUser(jwt)
      const user = authData?.user
      if (user) {
        const { data: proprio } = await supabase.from('commercants')
          .select('id').eq('id', cmd.commercant_id).eq('auth_user_id', user.id).maybeSingle()
        if (proprio) autorise = true
        if (!autorise) {
          const { data: admin } = await supabase.from('roles_utilisateurs')
            .select('user_id').eq('user_id', user.id).eq('role', 'admin').maybeSingle()
          autorise = !!admin
        }
      }
    }

    // Chemin checkout : client anonyme, juste après la création de sa commande
    if (!autorise) {
      const ageMin = (Date.now() - new Date(cmd.created_at).getTime()) / 60000
      if (ageMin <= FENETRE_CHECKOUT_MIN) autorise = true
    }

    if (!autorise) {
      return json({ error: 'Accès refusé' }, 403)
    }

    // ── Envoi Twilio ──────────────────────────────────────────────────
    const params = new URLSearchParams({ To: telDemande, From: FROM_NUMBER, Body: message })

    const r = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    )

    const data = await r.json()

    if (!r.ok || data.code) {
      console.log('[send-sms] Erreur Twilio:', JSON.stringify(data))
      return json({
        error: data.message || 'Erreur Twilio',
        code: data.code,
        more_info: data.more_info,
        status: r.status,
      }, 400)
    }

    if (!data.sid) {
      console.log('[send-sms] Réponse Twilio sans SID:', JSON.stringify(data))
      return json({ error: 'Réponse Twilio invalide', raw: data }, 500)
    }

    console.log('[send-sms] SMS envoyé · commande', commande_id, '· SID:', data.sid, '· Status:', data.status)

    return json({ success: true, sid: data.sid, status: data.status })

  } catch (err) {
    console.log('[send-sms] Exception:', String(err))
    return json({ error: String(err) }, 500)
  }
})
