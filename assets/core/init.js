// ============================================================
// CC.init() — script non-module, chargeable via <script src>
// Résout le slug, charge le commerce, applique le thème.
// Expose window.CC pour toutes les pages HTML.
// ============================================================
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
    fromagerie:   { label:'Fromagerie',    emoji:'🧀', palette:{ primary:'#3D5446', primary_dark:'#243225', accent:'#C9A54B', accent_light:'#E5CB82', danger:'#8B5A2B', cream:'#FAF5E6', cream_dark:'#EADCBF' }, fonts:{ display:'"Playfair Display"', body:'"Plus Jakarta Sans"' }, features:{ saison:true, bio:true,  provenance:true,  decoupe:true,  cuisson:false, programmation:false, dlc:true  }, labels:{ produits:'Nos fromages',     arrivage:'Affinés du moment', coups_coeur:"Sélection de l'affineur", panier:'Mon panier' } }
  };

  // ── SLUG ─────────────────────────────────────────────────
  function resolveSlug() {
    // 1. Param ?slug= prioritaire (utile en local file:// et tests)
    var p = new URLSearchParams(location.search).get('slug');
    if (p) return p;
    // 2. Sous-domaine en prod (slug.tondomaine.com)
    var host = location.hostname.split('.');
    if (host.length >= 3 && host[0] !== 'www' && host[0] !== 'localhost') return host[0];
    // 3. Sous-chemin en prod (tondomaine.com/slug/)
    if (location.protocol !== 'file:') {
      var seg = location.pathname.split('/').filter(Boolean)[0];
      if (seg && !seg.endsWith('.html')) return seg;
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

  // ── INIT ─────────────────────────────────────────────────
  async function initBusiness() {
    var slug = resolveSlug();
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
      return cfg;
    } catch(e) {
      console.error('[CC] init failed:', slug, e.message);
      if (e.message === 'COMMERCE_NOT_FOUND') {
        document.body.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:32px;font-family:system-ui;text-align:center;background:#FAF7F0;"><div style="font-size:48px">🏪</div><h1 style="margin:16px 0 8px;font-size:22px">Commerce introuvable</h1><p style="color:#3D5446;margin-bottom:24px">Vérifiez l\'URL ou contactez l\'administrateur.</p><a href="/" style="background:#2A4535;color:white;padding:12px 24px;border-radius:50px;text-decoration:none">Retour</a></div>';
      }
      return null;
    }
  }

  window.CC = { resolveSlug: resolveSlug, initBusiness: initBusiness, cfg: function(){ return window.__CONFIG__; }, TYPES: TYPES };
})();
