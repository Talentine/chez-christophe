// ============================================================
// CONFIG — orchestrateur : résout le slug, charge le commerce,
// applique le handler métier et le thème.
// ============================================================

import { fetchBusiness, cached } from './api.js';
import { getHandler } from './business-types.js';
import { applyTheme } from './theme.js';

export function resolveSlug() {
  // 1. Sous-domaine
  const host = location.hostname.split('.');
  if (host.length >= 3 && host[0] !== 'www' && host[0] !== 'localhost') return host[0];

  // 2. 1er segment de path
  const seg = location.pathname.split('/').filter(Boolean)[0];
  if (seg && !seg.endsWith('.html')) return seg;

  // 3. Query string
  const p = new URLSearchParams(location.search).get('slug');
  if (p) return p;

  // 4. Fallback démo
  return 'christophe-frais-caen';
}

export async function initBusiness() {
  const slug = resolveSlug();
  try {
    const business = await cached('biz:' + slug, () => fetchBusiness(slug));
    const handler  = getHandler(business.business_type || 'primeur');

    // Config finale : handler par défaut + overrides du commerçant (business_config JSONB)
    const override = business.business_config || {};
    const config = {
      slug,
      business,
      handler,
      palette:  { ...handler.palette,  ...(override.palette  || {}) },
      fonts:    { ...handler.fonts,    ...(override.fonts    || {}) },
      features: { ...handler.features, ...(override.features || {}) },
      filters:  override.filters  || handler.filters,
      labels:   { ...handler.labels,   ...(override.labels   || {}) },
      emoji_fallback: override.emoji_fallback || handler.emoji_fallback,
      cart_modes: override.cart_modes || handler.cart_modes
    };

    window.__CONFIG__ = config;
    applyTheme(config);
    document.dispatchEvent(new CustomEvent('business:ready', { detail: config }));
    return config;
  } catch (e) {
    console.error('[config] init failed:', e);
    renderErrorFallback(slug, e);
    throw e;
  }
}

function renderErrorFallback(slug, err) {
  const msg = err.message === 'COMMERCE_NOT_FOUND'
    ? `Le commerce "${slug}" est introuvable.`
    : 'Erreur de chargement du commerce.';
  document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:32px;font-family:system-ui,sans-serif;text-align:center;background:#FAF7F0;color:#1C3028;">
      <div style="font-size:48px;margin-bottom:16px;">🏪</div>
      <h1 style="font-size:22px;margin-bottom:8px;">${msg}</h1>
      <p style="color:#3D5446;margin-bottom:24px;">Vérifiez l'URL ou contactez l'administrateur.</p>
      <a href="/" style="background:#2A4535;color:white;padding:12px 24px;border-radius:50px;text-decoration:none;">Retour à l'accueil</a>
    </div>`;
}

export function cfg() {
  return window.__CONFIG__;
}
