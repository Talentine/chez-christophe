// ============================================================
// Edge Function: stripe-setup-intent — DÉSACTIVÉE (2026-09-01)
//
// Fonction d'avril 2026, jumelle de stripe-charge-noshow (même journée de
// création) : elle créait un SetupIntent Stripe à partir de paramètres libres,
// sans aucun contrôle d'appelant. Aucun appel dans le front : l'enregistrement
// de carte passe par stripe-empreinte (PaymentIntent capture_method=manual).
//
// Neutralisée pour éviter la création d'objets Stripe en masse.
// Suppression définitive à faire dans le dashboard Supabase.
// ============================================================

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  console.log('[stripe-setup-intent] appel refuse — fonction desactivee')

  return new Response(
    JSON.stringify({
      error: 'Fonction desactivee. Utiliser stripe-empreinte (action: create).',
      code: 'gone',
    }),
    { status: 410, headers: { ...cors, 'Content-Type': 'application/json' } },
  )
})
