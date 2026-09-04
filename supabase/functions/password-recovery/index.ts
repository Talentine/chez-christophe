// ============================================================
// Edge Function: password-recovery
// Envoie un email de récupération de mot de passe via Resend +
// template Marchéo. Bypass le SMTP Supabase natif pour éviter
// que les mails partent en spam.
//
// POST body: { email: string, redirectTo?: string }
// Réponse: toujours 200 avec { ok: true } (neutre, pour ne pas
// révéler quels emails sont enregistrés).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const RESEND_FROM = Deno.env.get('RESEND_FROM') || 'Marchéo <onboarding@resend.dev>';
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SB_URL, SB_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), {
  status: s, headers: { ...cors, 'Content-Type': 'application/json' }
});

function buildEmail(link: string, email: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Réinitialisez votre mot de passe</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#FAF7F0;color:#1f3028;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F0;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.04);">
        <tr><td style="background:#2A4535;color:#fff;padding:24px 28px;">
          <div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:0.7;">Marchéo</div>
          <div style="font-size:22px;font-weight:600;margin-top:4px;">Réinitialisez votre mot de passe</div>
        </td></tr>
        <tr><td style="padding:28px;line-height:1.6;font-size:15px;">
          <p style="margin:0 0 14px;">Bonjour,</p>
          <p style="margin:0 0 18px;">Vous avez demandé à réinitialiser le mot de passe du compte <b>${email}</b>. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :</p>
          <p style="text-align:center;margin:24px 0;">
            <a href="${link}" style="display:inline-block;background:#2A4535;color:#fff;padding:14px 28px;border-radius:50px;text-decoration:none;font-weight:600;font-size:15px;">Choisir un nouveau mot de passe</a>
          </p>
          <p style="font-size:13px;color:#7a8a82;margin:14px 0 0;">Ce lien expire dans 60 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message — votre mot de passe restera inchangé.</p>
          <p style="font-size:12px;color:#7a8a82;margin:18px 0 0;word-break:break-all;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><span style="color:#2A4535;">${link}</span></p>
        </td></tr>
        <tr><td style="padding:18px 28px;background:#FAF7F0;color:#7a8a82;font-size:12px;text-align:center;">
          Email envoyé par Marchéo · <a href="https://marcheo.fr" style="color:#7a8a82;">marcheo.fr</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendViaResend(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error('Resend error: ' + (data.message || JSON.stringify(data)));
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let payload: any = {};
  try { payload = await req.json(); } catch { return json({ ok: true }); }

  const email = String(payload.email || '').trim().toLowerCase();
  const redirectTo = String(payload.redirectTo || 'https://marcheo.fr/reset-password.html');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: true });

  try {
    // 1) Génère le lien de recovery côté Supabase (admin API)
    // generateLink renvoie une erreur si l'user n'existe pas — on absorbe (réponse neutre).
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo }
    });
    if (error) {
      console.warn('[password-recovery] generateLink:', error.message);
      return json({ ok: true });
    }
    const link = (data as any)?.properties?.action_link;
    if (!link) return json({ ok: true });

    // 2) Envoie via Resend avec template Marchéo
    await sendViaResend(email, 'Réinitialisez votre mot de passe — Marchéo', buildEmail(link, email));
    return json({ ok: true });
  } catch (e) {
    console.error('[password-recovery]', (e as Error).message);
    return json({ ok: true });
  }
});
