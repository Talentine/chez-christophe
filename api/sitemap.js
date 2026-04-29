// ============================================================
// /sitemap.xml — généré dynamiquement depuis Supabase
// Liste toutes les boutiques actives + pages publiques
// Cache 1h sur Vercel Edge
// ============================================================

const SUPABASE_URL = 'https://epvdzhzwfmtnioedyfgm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdmR6aHp3Zm10bmlvZWR5ZmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDYwMTgsImV4cCI6MjA5MjAyMjAxOH0.NnMHas3OCJxfqQW3lUG9LDrklsuO_c9-Xpm41K5q1uc';

const HOST = 'https://www.xn--marcho-fva.fr';
const PAGES_STATIQUES = [
  { loc: '/',                    priority: '1.0', changefreq: 'weekly'  },
  { loc: '/inscription',         priority: '0.9', changefreq: 'monthly' },
  { loc: '/cgv',                 priority: '0.3', changefreq: 'yearly'  },
  { loc: '/confidentialite',     priority: '0.3', changefreq: 'yearly'  },
  { loc: '/charte',              priority: '0.3', changefreq: 'yearly'  },
  { loc: '/mentions-legales',    priority: '0.3', changefreq: 'yearly'  },
];

export default async function handler(req, res) {
  let boutiques = [];
  try {
    const r = await fetch(
      SUPABASE_URL + '/rest/v1/commercants?actif=eq.true&select=slug,updated_at',
      { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } }
    );
    if (r.ok) boutiques = await r.json();
  } catch (e) {
    // En cas d'erreur, on retourne le sitemap sans les boutiques
  }

  const today = new Date().toISOString().split('T')[0];

  const urls = [
    ...PAGES_STATIQUES.map(p => `
  <url>
    <loc>${HOST}${p.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`),
    ...boutiques.map(b => {
      const lastmod = (b.updated_at || today).split('T')[0];
      return `
  <url>
    <loc>${HOST}/${b.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${HOST}/${b.slug}/notre-histoire</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${HOST}/${b.slug}/catalogue</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
    }),
  ].join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  res.status(200).send(xml);
}
