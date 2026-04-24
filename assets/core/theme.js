// ============================================================
// THEME — applique palette / fontes / méta dynamiquement
// ============================================================

export function applyTheme(cfg) {
  const root = document.documentElement.style;
  const p = cfg.palette;

  // Variables CSS : compatibles avec l'existant (--vert, --or, --creme…)
  root.setProperty('--primary',      p.primary);
  root.setProperty('--primary-dark', p.primary_dark);
  root.setProperty('--accent',       p.accent);
  root.setProperty('--accent-light', p.accent_light);
  root.setProperty('--danger',       p.danger);
  root.setProperty('--cream',        p.cream);
  root.setProperty('--cream-dark',   p.cream_dark);

  // Alias rétro-compat (le site primeur utilise --vert, --or, --creme…)
  root.setProperty('--vert',         p.primary);
  root.setProperty('--vert-fonce',   p.primary_dark);
  root.setProperty('--or',           p.accent);
  root.setProperty('--or-clair',     p.accent_light);
  root.setProperty('--terracotta',   p.danger);
  root.setProperty('--creme',        p.cream);
  root.setProperty('--creme-fonce',  p.cream_dark);

  // Fontes
  root.setProperty('--font-display', cfg.fonts.display);
  root.setProperty('--font-body',    cfg.fonts.body);

  // Charger les fontes Google si elles ne sont pas déjà là
  injectGoogleFonts([cfg.fonts.display, cfg.fonts.body]);

  // Titre, favicon, theme-color
  const nom = cfg.business.nom || 'Boutique';
  document.title = nom + ' · ' + cfg.handler.label;

  if (cfg.business.favicon_url) setLink('icon', cfg.business.favicon_url);
  setMeta('theme-color', p.primary);
}

function injectGoogleFonts(families) {
  const fams = families
    .map(f => f.replace(/"/g,'').trim().replace(/ /g,'+'))
    .filter((f,i,a) => a.indexOf(f) === i);
  const href = `https://fonts.googleapis.com/css2?${fams.map(f => `family=${f}:wght@400;500;600;700`).join('&')}&display=swap`;
  if (document.querySelector(`link[href="${href}"]`)) return;
  const lk = document.createElement('link');
  lk.rel = 'stylesheet';
  lk.href = href;
  document.head.appendChild(lk);
}

function setLink(rel, href) {
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) { el = document.createElement('link'); el.rel = rel; document.head.appendChild(el); }
  el.href = href;
}

function setMeta(name, content) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) { el = document.createElement('meta'); el.name = name; document.head.appendChild(el); }
  el.content = content;
}
