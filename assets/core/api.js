// ============================================================
// API — couche d'accès Supabase, partagée par toutes les pages
// ============================================================

export const SUPABASE_URL = 'https://epvdzhzwfmtnioedyfgm.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdmR6aHp3Zm10bmlvZWR5ZmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQzMDgyMjksImV4cCI6MjA0OTg4NDIyOX0.nWwXK0VJRaXBx8oDg7oFZmlXhzr-RMR7Y9QwmIWlRX4';

const H = (extra={}) => ({
  'apikey': SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
  ...extra
});

async function sb(table, query='') {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + table + query, { headers: H() });
  if (!r.ok) throw new Error(table + ' ' + r.status + ' ' + await r.text());
  return r.json();
}

// ── BUSINESS ─────────────────────────────────────────────
export async function fetchBusiness(slug) {
  const rows = await sb('commercants', `?slug=eq.${encodeURIComponent(slug)}&select=*`);
  if (!rows.length) throw new Error('COMMERCE_NOT_FOUND');
  return rows[0];
}

export async function fetchAllBusinesses() {
  return sb('commercants', '?select=id,slug,nom,business_type,actif&order=nom.asc');
}

// ── PRODUITS ─────────────────────────────────────────────
export async function fetchProducts(commercantId, opts={}) {
  let q = `?commercant_id=eq.${commercantId}&actif=eq.true&select=*,categories(nom,slug,emoji)`;
  if (opts.categorieSlug) q += `&categories.slug=eq.${opts.categorieSlug}`;
  if (opts.limit) q += `&limit=${opts.limit}`;
  q += opts.order ? `&order=${opts.order}` : '&order=nom';
  return sb('produits_base', q);
}

export async function fetchLatestProducts(commercantId, limit=8) {
  return sb('produits_base',
    `?commercant_id=eq.${commercantId}&actif=eq.true&select=*,categories(nom,emoji)&order=created_at.desc&limit=${limit}`);
}

export async function fetchCategories(commercantId) {
  return sb('categories', `?commercant_id=eq.${commercantId}&select=*&order=ordre`);
}

// ── CRÉNEAUX ─────────────────────────────────────────────
export async function fetchCreneaux(commercantId) {
  return sb('creneaux',
    `?commercant_id=eq.${commercantId}&select=*&order=jour_semaine.asc,heure_debut.asc`);
}

// ── COMMANDES ────────────────────────────────────────────
export async function fetchOrders(commercantId, status=null) {
  let q = `?commercant_id=eq.${commercantId}&select=*&order=created_at.desc`;
  if (status) q += `&statut=eq.${status}`;
  return sb('commandes', q);
}

export async function createOrder(payload) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/commandes', {
    method: 'POST',
    headers: H({ Prefer:'return=representation' }),
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ── STORAGE (galerie boutique) ───────────────────────────
export async function fetchGallery(commercantId) {
  const r = await fetch(SUPABASE_URL + '/storage/v1/object/list/galerie-boutique', {
    method: 'POST',
    headers: H(),
    body: JSON.stringify({ prefix: commercantId + '/', limit: 20, sortBy: { column:'name', order:'asc' } })
  });
  const files = await r.json();
  if (!Array.isArray(files)) return [];
  return files.filter(f => f.name && !f.name.endsWith('/')).map(f => ({
    name: f.name,
    url: `${SUPABASE_URL}/storage/v1/object/public/galerie-boutique/${commercantId}/${f.name}`,
    isVideo: /\.(mp4|mov|webm)$/i.test(f.name)
  }));
}

// ── CACHE LÉGER (5 min par défaut) ───────────────────────
const _cache = new Map();
export async function cached(key, fn, ttl=300_000) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const v = await fn();
  _cache.set(key, { v, t: Date.now() });
  return v;
}
export function invalidateCache(prefix='') {
  if (!prefix) return _cache.clear();
  for (const k of _cache.keys()) if (k.startsWith(prefix)) _cache.delete(k);
}
