// ============================================================
// ROUTER — helpers de navigation multi-client
// ============================================================

import { resolveSlug } from './config.js';

/**
 * Préfixe un chemin interne avec le slug courant si routage path-based.
 * Ex: link('catalogue.html') -> '/paul-primeur/catalogue' sur prod
 *                            -> 'catalogue.html?slug=paul-primeur' en dev
 */
export function link(path) {
  const slug = resolveSlug();
  const host = location.hostname.split('.');
  const isSubdomain = host.length >= 3 && host[0] !== 'www' && host[0] !== 'localhost';

  // Sous-domaine : les liens restent relatifs
  if (isSubdomain) return path;

  // Path-based en prod (rewrites Vercel) — gardé en .html en dev
  const isDev = location.protocol === 'file:' || location.hostname === 'localhost';
  if (isDev) {
    const url = new URL(path, location.href);
    url.searchParams.set('slug', slug);
    return url.pathname.split('/').pop() + url.search;
  }

  // Prod : /slug/route
  const clean = path.replace(/\.html$/, '').replace(/^\.?\//, '');
  return `/${slug}/${clean === 'index' ? '' : clean}`;
}

export { resolveSlug };
