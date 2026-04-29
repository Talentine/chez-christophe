// ============================================================
// Marchéo · Analytics privacy-first (zéro cookie, zéro PII)
// Envoie des events anonymes à Supabase. Auto-tracker page_view.
//
// Usage manuel :
//   window.MarcheoAnalytics.track('cta_click', { cta:'inscription' });
// ============================================================

(function () {
  const SB_URL = 'https://epvdzhzwfmtnioedyfgm.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdmR6aHp3Zm10bmlvZWR5ZmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDYwMTgsImV4cCI6MjA5MjAyMjAxOH0.NnMHas3OCJxfqQW3lUG9LDrklsuO_c9-Xpm41K5q1uc';

  // ── Skip en local et pour les bots/admins ──
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:';
  const isBot = /bot|crawler|spider|crawling|HeadlessChrome|Lighthouse/i.test(navigator.userAgent);
  if (isLocal || isBot) {
    window.MarcheoAnalytics = { track: function(){}, pageView: function(){} };
    return;
  }

  // ── Détection device simple (sans empreinte digitale) ──
  function detectDevice() {
    const w = window.innerWidth;
    if (w < 768) return 'mobile';
    if (w < 1024) return 'tablet';
    return 'desktop';
  }

  // ── Slug boutique depuis l'URL (premier segment non-html) ──
  function detectSlug() {
    const seg = location.pathname.split('/').filter(Boolean)[0];
    if (!seg || seg.endsWith('.html')) return null;
    if (['inscription','admin','app','app-commercant.html','catalogue','panier','compte','notre-histoire','cgv','confidentialite','charte','mentions-legales','sitemap.xml','robots.txt','branding.html'].includes(seg)) return null;
    return seg;
  }

  // ── Page normalisée (jamais d'IDs/UUIDs/queries personnelles) ──
  function detectPage() {
    let p = location.pathname;
    // Retire les UUIDs des paths
    p = p.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id');
    return p;
  }

  // ── Envoi vers Supabase via beacon (non-bloquant) ──
  function sendEvent(event, meta = {}) {
    const payload = {
      event:    String(event).slice(0, 60),
      page:     detectPage().slice(0, 200),
      slug:     detectSlug(),
      referrer: document.referrer ? new URL(document.referrer).hostname : null,
      device:   detectDevice(),
      country:  null, // alimentable via Vercel headers en SSR
      meta:     typeof meta === 'object' ? meta : {},
    };

    const url = SB_URL + '/rest/v1/analytics_events';
    const headers = {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    };

    // Beacon (non-bloquant, marche même au unload de la page)
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      // sendBeacon ne supporte pas custom headers → fallback fetch keepalive
    }
    // Fetch keepalive : non-bloquant + survit à la navigation
    try {
      fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    } catch (e) {}
  }

  // ── API publique ──
  window.MarcheoAnalytics = {
    track: sendEvent,
    pageView: function() { sendEvent('page_view'); },
  };

  // ── Auto-track page_view au chargement ──
  if (document.readyState === 'complete') {
    sendEvent('page_view');
  } else {
    window.addEventListener('load', () => sendEvent('page_view'));
  }

  // ── Auto-track les clics sur les CTA principaux (data-track) ──
  document.addEventListener('click', function (e) {
    const el = e.target.closest('[data-track]');
    if (!el) return;
    const name = el.getAttribute('data-track');
    let meta = {};
    try { meta = JSON.parse(el.getAttribute('data-track-meta') || '{}'); } catch (_) {}
    sendEvent(name, meta);
  });
})();
