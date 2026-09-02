// ============================================================
// Edge Function: stripe-charge-noshow — DÉSACTIVÉE (2026-09-01)
//
// Ancienne fonction de débit no-show (avril 2026). Elle créait un
// PaymentIntent à partir d'un payment_method_id, d'un montant et d'un
// libellé fournis dans le body, SANS vérifier que l'appelant était bien
// le commerçant propriétaire de la commande, et sans plafond de montant.
// Appelable par toute personne disposant de la clé anon publique.
//
// Plus aucun appel côté front : le débit d'empreinte passe désormais par
// `stripe-empreinte` (action 'capture'), qui vérifie le JWT et l'ownership.
//
// Neutralisée plutôt que supprimée pour garder une trace explicite.
// Suppression définitive à faire dans le dashboard Supabase.
// ============================================================

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  console.log('[stripe-charge-noshow] appel refusé — fonction désactivée');

  return new Response(
    JSON.stringify({
      error: 'Fonction désactivée. Utiliser stripe-empreinte (action: capture).',
      code: 'gone',
    }),
    { status: 410, headers: { ...cors, 'Content-Type': 'application/json' } },
  );
});
