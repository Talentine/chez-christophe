// ============================================================
// /api/og?slug=chez-christophe — Génère une OG image SVG
// par boutique. Utilisable dans <meta property="og:image">.
// SVG = léger (~3 Ko), supporté par Twitter/Facebook/LinkedIn.
// ============================================================

const SUPABASE_URL = 'https://epvdzhzwfmtnioedyfgm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdmR6aHp3Zm10bmlvZWR5ZmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDYwMTgsImV4cCI6MjA5MjAyMjAxOH0.NnMHas3OCJxfqQW3lUG9LDrklsuO_c9-Xpm41K5q1uc';

const METIERS = {
  primeur:      { emoji: '🌿', label: 'Primeur' },
  boucherie:    { emoji: '🥩', label: 'Boucherie' },
  boulangerie:  { emoji: '🥖', label: 'Boulangerie' },
  poissonnerie: { emoji: '🐟', label: 'Poissonnerie' },
  fromagerie:   { emoji: '🧀', label: 'Fromagerie' },
  traiteur:     { emoji: '🍽️', label: 'Traiteur' },
  fleuriste:    { emoji: '💐', label: 'Fleuriste' },
  restaurant:   { emoji: '🍽️', label: 'Restaurant' },
  pizzeria:     { emoji: '🍕', label: 'Pizzeria' },
  fastfood:     { emoji: '🍔', label: 'Fast-food' },
};

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export default async function handler(req, res) {
  const slug = req.query?.slug || '';

  let boutique = null;
  if (slug) {
    try {
      const r = await fetch(
        SUPABASE_URL + '/rest/v1/commercants?slug=eq.' + encodeURIComponent(slug) + '&select=nom_boutique,business_type,ville',
        { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } }
      );
      if (r.ok) {
        const arr = await r.json();
        boutique = arr[0] || null;
      }
    } catch (e) {}
  }

  const nom = escapeXml(boutique?.nom_boutique || 'Marchéo');
  const metier = METIERS[boutique?.business_type] || { emoji: '🛍️', label: 'Boutique' };
  const ville = escapeXml(boutique?.ville || 'France');
  const tagline = boutique
    ? `${metier.label} · ${ville}`
    : 'Vendez sans perdre un panier';

  // SVG 1200x630 (taille standard OG image)
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0F2C52"/>
      <stop offset="100%" stop-color="#1B3F6E"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.15" r="0.5">
      <stop offset="0%" stop-color="#5BBE3A" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#5BBE3A" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <!-- Logo monogramme M -->
  <g transform="translate(80, 70)">
    <path d="M 0 110 L 36 12 L 60 70 L 84 12 L 120 110 Z" fill="#FFFFFF"/>
    <line x1="6" y1="120" x2="114" y2="120" stroke="#5BBE3A" stroke-width="5" stroke-linecap="round"/>
    <path d="M 88 4 Q 100 -4 112 4 Q 106 18 96 16 Q 90 14 88 4 Z" fill="#5BBE3A"/>
  </g>

  <!-- Wordmark Marchéo.fr -->
  <text x="220" y="155"
        font-family="Manrope, system-ui, sans-serif"
        font-weight="800" font-size="64"
        fill="#FFFFFF">Marchéo</text>
  <text x="496" y="155"
        font-family="Manrope, system-ui, sans-serif"
        font-weight="700" font-size="64"
        fill="#5BBE3A">.fr</text>

  <!-- Frise décorative -->
  <line x1="80" y1="260" x2="220" y2="260" stroke="#5BBE3A" stroke-width="4" stroke-linecap="round"/>

  <!-- Métier emoji -->
  <text x="80" y="370" font-size="80">${escapeXml(metier.emoji)}</text>

  <!-- Nom de la boutique -->
  <text x="180" y="370"
        font-family="Manrope, system-ui, sans-serif"
        font-weight="800" font-size="68"
        fill="#FFFFFF">${nom}</text>

  <!-- Tagline -->
  <text x="80" y="450"
        font-family="Manrope, system-ui, sans-serif"
        font-weight="500" font-size="32"
        fill="#FFFFFF" opacity="0.75">${tagline}</text>

  <!-- Footer URL -->
  <text x="80" y="560"
        font-family="Manrope, system-ui, sans-serif"
        font-weight="600" font-size="22"
        fill="#5BBE3A">marchéo.fr${slug ? '/' + slug : ''}</text>
  <text x="1120" y="560" text-anchor="end"
        font-family="Manrope, system-ui, sans-serif"
        font-weight="500" font-size="18"
        fill="#FFFFFF" opacity="0.5">Click &amp; Collect · Livraison · 0% commission</text>
</svg>`;

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  res.status(200).send(svg);
}
