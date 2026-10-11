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

  // ── Source de campagne (UTM) : lue à l'arrivée, gardée le temps de la session ──
  //    Ne contient que les paramètres de campagne (pas d'identifiant personnel) ;
  //    pour fbclid on ne garde que sa présence, jamais sa valeur.
  function detectUtm() {
    const CLE = 'marcheo_utm';
    try {
      const q = new URLSearchParams(location.search);
      const u = {};
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) {
        const v = q.get(k);
        if (v) u[k] = v.slice(0, 100);
      });
      if (q.has('fbclid')) u.fbclid = true;
      if (Object.keys(u).length) {
        sessionStorage.setItem(CLE, JSON.stringify(u));
        return u;
      }
      return JSON.parse(sessionStorage.getItem(CLE) || 'null');
    } catch (e) { return null; }
  }
  const UTM = detectUtm();

  // ── Identifiant de visite anonyme : aléatoire, propre à l'onglet, oublié à sa fermeture ──
  //    (sessionStorage, pas de cookie) — sert uniquement à relier les pages d'une même visite.
  function detectSid() {
    const CLE = 'marcheo_sid';
    try {
      let sid = sessionStorage.getItem(CLE);
      if (!sid) {
        sid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2));
        sessionStorage.setItem(CLE, sid);
      }
      return sid;
    } catch (e) { return null; }
  }
  const SID = detectSid();

  // ── Envoi vers Supabase via beacon (non-bloquant) ──
  function sendEvent(event, meta = {}) {
    meta = (meta && typeof meta === 'object') ? Object.assign({}, meta) : {};
    if (UTM && !meta.utm) meta.utm = UTM;
    if (SID && !meta.sid) meta.sid = SID;
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

  // ── Point d'arrêt sur la page : profondeur de défilement, dernière section vue, temps passé ──
  const debutPage = Date.now();
  let scrollMax = 0;
  let sectionMax = null;
  let rafScroll = null;

  function titreSection(el) {
    const txt = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
    return txt ? txt.slice(0, 60) : (el.id || null);
  }

  function mesurerScroll() {
    rafScroll = null;
    const doc = document.documentElement;
    const hauteur = Math.max(doc.scrollHeight - window.innerHeight, 1);
    const pct = Math.min(100, Math.round((window.scrollY / hauteur) * 100));
    if (pct < scrollMax) return;
    scrollMax = pct;
    // Dernier titre de section entré dans l'écran
    const titres = document.querySelectorAll('h1, h2, .step.actif .step-title');
    for (let i = titres.length - 1; i >= 0; i--) {
      if (titres[i].getBoundingClientRect().top < window.innerHeight && titres[i].offsetParent !== null) {
        sectionMax = titreSection(titres[i]);
        break;
      }
    }
  }
  window.addEventListener('scroll', function () {
    if (!rafScroll) rafScroll = requestAnimationFrame(mesurerScroll);
  }, { passive: true });
  window.addEventListener('load', mesurerScroll);

  let sortieEnvoyee = false;
  function envoyerSortie() {
    if (sortieEnvoyee) return;
    sortieEnvoyee = true;
    mesurerScroll();
    sendEvent('page_exit', {
      scroll: scrollMax,
      section: sectionMax,
      duree: Math.round((Date.now() - debutPage) / 1000),
    });
  }
  window.addEventListener('pagehide', envoyerSortie);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') envoyerSortie();
  });

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
