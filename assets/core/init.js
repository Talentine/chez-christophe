// ============================================================
// CC.init() — script non-module, chargeable via <script src>
// Résout le slug, charge le commerce, applique le thème.
// Expose window.CC pour toutes les pages HTML.
// ============================================================

// ── DEBUG MODE — désactive console.log/warn en production ──
// console.error reste actif pour traquer les vrais bugs.
(function setupDebugMode() {
  var host = location.hostname;
  var isDev = host === 'localhost'
    || host === '127.0.0.1'
    || host === ''
    || /\.vercel\.app$/.test(host)        // previews Vercel
    || location.search.indexOf('debug=1') >= 0; // ?debug=1 force en prod
  if (isDev) {
    window.__MARCHEO_DEBUG__ = true;
    return;
  }
  // En prod : silence log/warn (mais pas error)
  window.__MARCHEO_DEBUG__ = false;
  var noop = function(){};
  console.log = noop;
  console.warn = noop;
  console.info = noop;
  console.debug = noop;
})();

(function () {
  const SB_URL = 'https://epvdzhzwfmtnioedyfgm.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdmR6aHp3Zm10bmlvZWR5ZmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDYwMTgsImV4cCI6MjA5MjAyMjAxOH0.NnMHas3OCJxfqQW3lUG9LDrklsuO_c9-Xpm41K5q1uc';

  // ── HANDLERS PAR MÉTIER ──────────────────────────────────
  var TYPES = {
    primeur:      { label:'Primeur',       emoji:'🌿', palette:{ primary:'#2A4535', primary_dark:'#1C3028', accent:'#B8832A', accent_light:'#F0D690', danger:'#C4614A', cream:'#FAF7F0', cream_dark:'#F0EAD8' }, fonts:{ display:'"Playfair Display"', body:'"Plus Jakarta Sans"' }, features:{ saison:true, bio:true, provenance:true, decoupe:false, cuisson:false, programmation:false, dlc:false }, labels:{ produits:'Nos rayons', arrivage:'Arrivage du jour', coups_coeur:'Coups de cœur', panier:'Mon panier' } },
    boucherie:    { label:'Boucherie',     emoji:'🥩', palette:{ primary:'#8B1A1A', primary_dark:'#5C1010', accent:'#D4A44C', accent_light:'#F0CE8A', danger:'#3D0A0A', cream:'#FAF5EC', cream_dark:'#EDE3CE' }, fonts:{ display:'"Bebas Neue"',       body:'"Inter"'              }, features:{ saison:false, bio:false, provenance:true, decoupe:true,  cuisson:true,  programmation:true,  dlc:false }, labels:{ produits:'Nos viandes',     arrivage:'Pièces du jour',    coups_coeur:'Sélection du boucher',   panier:'Ma commande' } },
    boulangerie:  { label:'Boulangerie',   emoji:'🥖', palette:{ primary:'#6B4423', primary_dark:'#4A2E17', accent:'#E8B14C', accent_light:'#F5D288', danger:'#A04D2B', cream:'#FAF3E3', cream_dark:'#EEE1C2' }, fonts:{ display:'"Fraunces"',         body:'"Inter"'              }, features:{ saison:false, bio:true,  provenance:false, decoupe:false, cuisson:false, programmation:true,  dlc:true  }, labels:{ produits:'Pains & viennoiseries', arrivage:'Sorti du four', coups_coeur:'Spécialités',            panier:'Ma commande' } },
    poissonnerie: { label:'Poissonnerie',  emoji:'🐟', palette:{ primary:'#1B4965', primary_dark:'#0E2B40', accent:'#62B6CB', accent_light:'#9DD4E0', danger:'#C4614A', cream:'#F4F7F9', cream_dark:'#E1E9EE' }, fonts:{ display:'"Playfair Display"', body:'"Inter"'              }, features:{ saison:true, bio:false, provenance:true,  decoupe:true,  cuisson:false, programmation:false, dlc:true  }, labels:{ produits:'Pêche du jour',    arrivage:'Arrivé ce matin',  coups_coeur:'Poissons nobles',        panier:'Mon panier' } },
    traiteur:     { label:'Traiteur',      emoji:'🍽️', palette:{ primary:'#2B2B2B', primary_dark:'#111111', accent:'#C9A54B', accent_light:'#E5CB82', danger:'#8B3A3A', cream:'#F8F5EF', cream_dark:'#EAE4D6' }, fonts:{ display:'"Cormorant Garamond"', body:'"Inter"'            }, features:{ saison:false, bio:false, provenance:false, decoupe:false, cuisson:false, programmation:true,  dlc:true  }, labels:{ produits:'Notre carte',      arrivage:'Spécialités',       coups_coeur:'Coups de cœur du chef', panier:'Ma commande' } },
    fromagerie:   { label:'Fromagerie',    emoji:'🧀', palette:{ primary:'#3D5446', primary_dark:'#243225', accent:'#C9A54B', accent_light:'#E5CB82', danger:'#8B5A2B', cream:'#FAF5E6', cream_dark:'#EADCBF' }, fonts:{ display:'"Playfair Display"', body:'"Plus Jakarta Sans"' }, features:{ saison:true, bio:true,  provenance:true,  decoupe:true,  cuisson:false, programmation:false, dlc:true  }, labels:{ produits:'Nos fromages',     arrivage:'Affinés du moment', coups_coeur:"Sélection de l'affineur", panier:'Mon panier' } },

    // ── RESTAURATION (3 sous-styles) ──
    pizzeria:     { label:'Pizzeria',      emoji:'🍕', palette:{ primary:'#9F1B1F', primary_dark:'#5C0E10', accent:'#1B7A3E', accent_light:'#7DCC95', danger:'#9F1B1F', cream:'#FFF8E7', cream_dark:'#F4E5C2' }, fonts:{ display:'"Lobster"',          body:'"Inter"' }, features:{ saison:false, bio:false, provenance:false, decoupe:false, cuisson:true,  programmation:true,  dlc:false, reservation_table:true }, labels:{ produits:'Nos pizzas',      arrivage:'Spéciale du jour', coups_coeur:'Pizzas signatures',     panier:'Ma commande' } },
    restaurant:   { label:'Restaurant',    emoji:'🍴', palette:{ primary:'#1F1F1F', primary_dark:'#0A0A0A', accent:'#A8825D', accent_light:'#D4B8A0', danger:'#7C2D2D', cream:'#F8F5F0', cream_dark:'#E8E0D5' }, fonts:{ display:'"Playfair Display"', body:'"Inter"' }, features:{ saison:false, bio:false, provenance:false, decoupe:false, cuisson:true,  programmation:true,  dlc:false, reservation_table:true }, labels:{ produits:'Notre carte',     arrivage:'Suggestion du chef', coups_coeur:'Plats signatures',    panier:'Ma commande' } },
    fastfood:     { label:'Fast-food',     emoji:'🍔', palette:{ primary:'#FFCC00', primary_dark:'#CC9900', accent:'#E63946', accent_light:'#F4A4AA', danger:'#1A1A1A', cream:'#FFF9E6', cream_dark:'#F0E5B8' }, fonts:{ display:'"Bebas Neue"',       body:'"Inter"' }, features:{ saison:false, bio:false, provenance:false, decoupe:false, cuisson:true,  programmation:false, dlc:false }, labels:{ produits:'Notre carte',     arrivage:'Édition limitée',   coups_coeur:'Best-sellers',         panier:'Ma commande' } }
  };

  // ── SLUG ─────────────────────────────────────────────────
  // Hôtes "plateforme" pour lesquels on ignore le sous-domaine et on
  // privilégie le routage par sous-chemin (vercel preview, netlify, github).
  var PLATFORM_HOSTS = ['vercel.app', 'netlify.app', 'github.io', 'pages.dev'];

  function resolveSlug() {
    // 1. Param ?slug= prioritaire (utile en local file:// et tests)
    var p = new URLSearchParams(location.search).get('slug');
    if (p) return p;

    var hostname = location.hostname;
    var isPlatform = PLATFORM_HOSTS.some(function(h) {
      return hostname === h || hostname.endsWith('.' + h);
    });

    // 2. Sous-chemin (prioritaire sur plateformes type vercel.app)
    //    tondomaine.com/slug/  ou  app.vercel.app/slug/
    if (location.protocol !== 'file:') {
      var seg = location.pathname.split('/').filter(Boolean)[0];
      if (seg && !seg.endsWith('.html')) return seg;
    }

    // 3. Sous-domaine en prod (slug.tondomaine.com), uniquement si pas une plateforme
    if (!isPlatform) {
      var host = hostname.split('.');
      if (host.length >= 3 && host[0] !== 'www' && host[0] !== 'localhost') return host[0];
    }

    // 4. Fallback
    return 'christophe-frais-caen';
  }

  // ── THÈME ─────────────────────────────────────────────────
  function applyTheme(cfg) {
    var p = cfg.palette, r = document.documentElement.style;
    r.setProperty('--primary',        p.primary);
    r.setProperty('--primary-dark',   p.primary_dark);
    r.setProperty('--accent',         p.accent);
    r.setProperty('--accent-light',   p.accent_light);
    r.setProperty('--danger',         p.danger);
    r.setProperty('--cream',          p.cream);
    r.setProperty('--cream-dark',     p.cream_dark);
    // Alias rétro-compat (code primeur existant)
    r.setProperty('--vert',           p.primary);
    r.setProperty('--vert-fonce',     p.primary_dark);
    r.setProperty('--vert-clair',     p.accent);
    r.setProperty('--or',             p.accent);
    r.setProperty('--or-clair',       p.accent_light);
    r.setProperty('--terracotta',     p.danger);
    r.setProperty('--creme',          p.cream);
    r.setProperty('--creme-fonce',    p.cream_dark);

    // Google Fonts dynamiques
    var fams = [cfg.fonts.display, cfg.fonts.body]
      .map(function(f){ return f.replace(/"/g,'').replace(/ /g,'+'); })
      .filter(function(f,i,a){ return a.indexOf(f) === i; });
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?'
      + fams.map(function(f){ return 'family=' + f + ':wght@400;500;600;700'; }).join('&')
      + '&display=swap';
    document.head.appendChild(link);

    // Titre page + favicon
    var nom = (cfg.business && cfg.business.nom) || 'Boutique';
    document.title = nom + ' · ' + cfg.label;
    if (cfg.business && cfg.business.favicon_url) {
      var lk = document.querySelector('link[rel="icon"]') || document.createElement('link');
      lk.rel = 'icon'; lk.href = cfg.business.favicon_url;
      document.head.appendChild(lk);
    }
  }

  // ── PRESERVE SLUG ────────────────────────────────────────
  // Réécrit tous les liens internes <a href="*.html"> pour conserver
  // le ?slug=... courant. Indispensable en local (file://) où le slug
  // ne se déduit pas du path. En prod (Vercel), inoffensif : le path
  // gère déjà le routage par slug.
  function injectSlug(url, slug) {
    if (!url || !slug) return url;
    if (/^(https?:|mailto:|tel:|javascript:|#)/i.test(url)) return url;
    if (!/\.html(\?|$|#)/i.test(url)) return url;
    if (/[?&]slug=/.test(url)) return url;
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    var hashIdx = url.indexOf('#');
    if (hashIdx >= 0) return url.slice(0, hashIdx) + sep + 'slug=' + encodeURIComponent(slug) + url.slice(hashIdx);
    return url + sep + 'slug=' + encodeURIComponent(slug);
  }

  function preserveSlugOnLinks(slug) {
    if (!slug) return;
    // Helper public : window.CC.url('panier.html') → 'panier.html?slug=xxx'
    if (window.CC) window.CC.url = function(path) { return injectSlug(path, slug); };

    // Patch des redirections JS (onclick="location.href='x.html'")
    // On surcharge window.location.assign / replace + setter href.
    try {
      var origAssign = window.location.assign.bind(window.location);
      var origReplace = window.location.replace.bind(window.location);
      window.location.assign = function(u) { return origAssign(injectSlug(String(u), slug)); };
      window.location.replace = function(u) { return origReplace(injectSlug(String(u), slug)); };
    } catch(_) {}

    // Intercepte location.href = '...' via un click handler global
    document.addEventListener('click', function(ev) {
      var t = ev.target;
      while (t && t.nodeType === 1) {
        var oc = t.getAttribute && t.getAttribute('onclick');
        if (oc && /(location|window\.location)(\.href)?\s*=/.test(oc)) {
          // Rewrite uniquement si pas déjà patché
          if (!t.dataset.ccSlugged) {
            var rewritten = oc.replace(/(['"`])([^'"`]+\.html[^'"`]*)\1/g, function(_, q, url) {
              return q + injectSlug(url, slug) + q;
            });
            t.setAttribute('onclick', rewritten);
            t.dataset.ccSlugged = '1';
          }
          break;
        }
        t = t.parentNode;
      }
    }, true);

    var apply = function() {
      // Liens <a href>
      document.querySelectorAll('a[href]').forEach(function(a) {
        var n = injectSlug(a.getAttribute('href'), slug);
        if (n !== a.getAttribute('href')) a.setAttribute('href', n);
      });
      // onclick inline avec location.href='x.html'
      document.querySelectorAll('[onclick]').forEach(function(el) {
        if (el.dataset.ccSlugged) return;
        var oc = el.getAttribute('onclick');
        if (!oc || !/\.html/.test(oc)) return;
        if (!/(location|window\.location)(\.href)?\s*=/.test(oc)) return;
        var rewritten = oc.replace(/(['"`])([^'"`]+\.html[^'"`]*)\1/g, function(_, q, url) {
          return q + injectSlug(url, slug) + q;
        });
        if (rewritten !== oc) {
          el.setAttribute('onclick', rewritten);
          el.dataset.ccSlugged = '1';
        }
      });
    };
    apply();
    if (window.MutationObserver) {
      var obs = new MutationObserver(apply);
      obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
    }
  }

  // ── INIT ─────────────────────────────────────────────────
  async function initBusiness(explicitSlug) {
    var slug = explicitSlug || resolveSlug();
    try {
      var r = await fetch(SB_URL + '/rest/v1/commercants?slug=eq.' + encodeURIComponent(slug) + '&select=*', {
        headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
      });
      var rows = await r.json();
      if (!rows.length) throw new Error('COMMERCE_NOT_FOUND');
      var business = rows[0];
      var type = business.business_type || 'primeur';
      var handler = TYPES[type] || TYPES.primeur;
      var override = business.business_config || {};
      var cfg = Object.assign({}, handler, {
        slug:     slug,
        business: business,
        handler:  handler,
        palette:  Object.assign({}, handler.palette,  override.palette  || {}),
        fonts:    Object.assign({}, handler.fonts,    override.fonts    || {}),
        features: Object.assign({}, handler.features, override.features || {}),
        labels:   Object.assign({}, handler.labels,   override.labels   || {})
      });
      window.__CONFIG__ = cfg;
      applyTheme(cfg);
      preserveSlugOnLinks(slug);
      return cfg;
    } catch(e) {
      console.error('[CC] init failed:', slug, e.message);
      if (e.message === 'COMMERCE_NOT_FOUND') {
        document.body.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:32px;font-family:system-ui;text-align:center;background:#FAF7F0;"><div style="font-size:48px">🏪</div><h1 style="margin:16px 0 8px;font-size:22px">Commerce introuvable</h1><p style="color:#3D5446;margin-bottom:24px">Vérifiez l\'URL ou contactez l\'administrateur.</p><a href="/" style="background:#2A4535;color:white;padding:12px 24px;border-radius:50px;text-decoration:none">Retour</a></div>';
      }
      return null;
    }
  }

  // ── BOUTON ACCUEIL : retour à la home boutique (jamais marchéo.fr) ──
  function retourAccueilBoutique() {
    var path = location.pathname;
    var slug = (window.__CONFIG__ && window.__CONFIG__.slug) || resolveSlug();
    var segments = path.split('/').filter(Boolean);

    // Détection de la home — uniquement /, /{slug}, /index.html, /boutique.html
    var onHome = false;
    if (segments.length === 0) {
      onHome = true; // /
    } else if (segments.length === 1) {
      var s = segments[0];
      // Si .html → ce n'est home que pour boutique.html/index.html (pas catalogue/panier/compte/notre-histoire)
      if (s.indexOf('.html') >= 0) {
        onHome = (s === 'boutique.html' || s === 'index.html');
      } else {
        // /{slug} sans .html = home de la boutique
        onHome = true;
      }
    }
    // segments.length >= 2 → /{slug}/page → PAS home → on redirige

    if (onHome) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    // Sinon : revenir à la home de la boutique
    if (slug) {
      // En local file:// ou si la page actuelle est /catalogue.html?slug=xxx → boutique.html?slug=xxx
      if (location.protocol === 'file:' || (segments.length === 1 && segments[0].indexOf('.html') >= 0)) {
        location.href = 'boutique.html?slug=' + encodeURIComponent(slug);
      } else {
        location.href = '/' + slug;
      }
    } else {
      window.history.back();
    }
  }
  window.retourAccueilBoutique = retourAccueilBoutique;

  window.CC = { resolveSlug: resolveSlug, initBusiness: initBusiness, cfg: function(){ return window.__CONFIG__; }, TYPES: TYPES, retourAccueilBoutique: retourAccueilBoutique };
})();
