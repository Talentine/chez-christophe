/* crm-enrichir — garde-fous des téléchargements (module ES pur, sans E/S).
 *
 * La fonction télécharge des pages dont l'adresse vient d'OpenStreetMap, d'une fiche Google ou d'une saisie :
 * rien ne garantit qu'elle désigne un vrai site public. Avant CHAQUE requête (accueil, pages internes, chaque
 * saut de redirection) l'adresse repasse par `urlAutorisee`, puis toutes les adresses IP résolues par `ipPublique`.
 */

const SUFFIXES_INTERNES = ['localhost', 'local', 'internal', 'intranet', 'lan', 'home', 'corp', 'arpa', 'test', 'invalid', 'example', 'onion',
  'localdomain', 'private'];
// Jamais aspirés, même par redirection : réseaux sociaux (décision produit) et l'infrastructure de la base.
const DOMAINES_REFUSES = ['facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'instagr.am', 'supabase.co', 'supabase.in', 'supabase.net', 'supabase.com'];

export const LONGUEUR_URL = 2000;
export const REDIRECTIONS_MAX = 5;

function sousDomaineDe(hote, domaine) { return hote === domaine || hote.endsWith('.' + domaine); }

/* Rend { ok: true, url (objet URL) } ou { ok: false, motif }. `options.hotesRefuses` : hôtes exacts en plus
   (celui de SUPABASE_URL). Aucune IP littérale n'est admise, sous aucune écriture. */
export function urlAutorisee(texte, options) {
  const refus = motif => ({ ok: false, motif });
  const brut = String(texte == null ? '' : texte).trim();
  if (!brut || brut.length > LONGUEUR_URL) return refus('longueur');
  let url;
  try { url = new URL(brut); } catch (e) { return refus('illisible'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return refus('protocole');
  if (url.username || url.password) return refus('identifiants');
  if (url.port && url.port !== '80' && url.port !== '443') return refus('port');
  const hote = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hote || hote.length > 253) return refus('hote');
  // IPv6 entre crochets, ou hôte sans point (nom de machine interne, entier décimal « 2130706433 »).
  if (hote.indexOf('[') >= 0 || hote.indexOf(':') >= 0 || hote.indexOf('.') < 0) return refus('hote');
  const libelles = hote.split('.');
  if (libelles.some(l => !l || l.length > 63 || !/^[a-z0-9-]+$/.test(l) || l.charAt(0) === '-' || l.charAt(l.length - 1) === '-')) return refus('hote');
  // Le dernier libellé d'un vrai nom de domaine est alphabétique (ou un IDN en punycode) : cela écarte toute
  // IPv4 littérale, y compris hexadécimale (« 0x7f.0.0.1 ») ou octale, que `URL` aurait de toute façon réécrite en chiffres.
  const dernier = libelles[libelles.length - 1];
  if (!/^([a-z]{2,}|xn--[a-z0-9-]+)$/.test(dernier)) return refus('hote');
  if (SUFFIXES_INTERNES.indexOf(dernier) >= 0) return refus('interne');
  if (DOMAINES_REFUSES.some(d => sousDomaineDe(hote, d))) return refus('domaine');
  const enPlus = ((options && options.hotesRefuses) || []).map(h => String(h || '').toLowerCase()).filter(Boolean);
  if (enPlus.some(h => sousDomaineDe(hote, h))) return refus('domaine');
  return { ok: true, url };
}

function octetsV4(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const o = [+m[1], +m[2], +m[3], +m[4]];
  // Un octet écrit avec un zéro initial (« 010 ») est ambigu (octal) : refusé.
  if (o.some((n, i) => n > 255 || (m[i + 1].length > 1 && m[i + 1].charAt(0) === '0'))) return null;
  return o;
}

function v4Publique(o) {
  const [a, b, c] = o;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false;
  return true;
}

/* Huit groupes de 16 bits, ou null si l'adresse n'est pas une IPv6 bien formée. */
function groupesV6(ip) {
  let texte = ip.toLowerCase();
  const zone = texte.indexOf('%');
  if (zone >= 0) texte = texte.slice(0, zone);
  if (!/^[0-9a-f:.]+$/.test(texte) || texte.indexOf(':') < 0) return null;
  // Fin en IPv4 pointée (« ::ffff:10.0.0.1 ») : convertie en deux groupes.
  const dernier = texte.slice(texte.lastIndexOf(':') + 1);
  if (dernier.indexOf('.') >= 0) {
    const o = octetsV4(dernier);
    if (!o) return null;
    texte = texte.slice(0, texte.lastIndexOf(':') + 1) + ((o[0] << 8) | o[1]).toString(16) + ':' + ((o[2] << 8) | o[3]).toString(16);
  }
  const moities = texte.split('::');
  if (moities.length > 2) return null;
  const lire = s => (s === '' ? [] : s.split(':'));
  const debut = lire(moities[0]), fin = moities.length === 2 ? lire(moities[1]) : [];
  if (debut.concat(fin).some(g => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  if (moities.length === 1) return debut.length === 8 ? debut.map(g => parseInt(g, 16)) : null;
  const manque = 8 - debut.length - fin.length;
  if (manque < 1) return null;
  return debut.concat(new Array(manque).fill('0'), fin).map(g => parseInt(g, 16));
}

/* Vrai seulement pour une adresse IP (v4 ou v6) routable sur Internet. Tout ce qui est privé, local, réservé,
   de documentation, multidiffusion — ou simplement illisible — est refusé. */
export function ipPublique(ip) {
  const texte = String(ip == null ? '' : ip).trim().replace(/^\[|\]$/g, '');
  if (!texte) return false;
  const v4 = octetsV4(texte);
  if (v4) return v4Publique(v4);
  const g = groupesV6(texte);
  if (!g) return false;
  const enchassee = () => v4Publique([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255]);
  // « :: », « ::1 » et les anciennes adresses « compatibles IPv4 » (::a.b.c.d).
  if (g.slice(0, 6).every(x => x === 0)) return false;
  // ::ffff:0:0/96 (IPv4 mappée) et 64:ff9b::/96 (NAT64) : c'est l'IPv4 enchâssée qui compte.
  if (g.slice(0, 5).every(x => x === 0) && g[5] === 0xffff) return enchassee();
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every(x => x === 0)) return enchassee();
  // 2002::/16 (6to4) : l'IPv4 est dans les groupes 2 et 3.
  if (g[0] === 0x2002) return v4Publique([g[1] >> 8, g[1] & 255, g[2] >> 8, g[2] & 255]);
  if ((g[0] & 0xfe00) === 0xfc00) return false;   // fc00::/7 (dont fd00:ec2::254, métadonnées)
  if ((g[0] & 0xffc0) === 0xfe80) return false;   // fe80::/10
  if ((g[0] & 0xffc0) === 0xfec0) return false;   // fec0::/10 (ancien « site-local »)
  if ((g[0] & 0xff00) === 0xff00) return false;   // ff00::/8
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false;   // documentation
  if (g[0] === 0x2001 && g[1] === 0) return false;        // Teredo
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return false;   // 100::/64 (trou noir)
  // Seul 2000::/3 est attribué à l'Internet public.
  return (g[0] & 0xe000) === 0x2000;
}

/* Domaine enregistrable approché : les deux derniers libellés, trois quand l'avant-dernier est un suffixe
   à deux niveaux courant (« co.uk », « com.au »). */
export function domaineDe(hote) {
  const l = String(hote || '').toLowerCase().replace(/\.$/, '').replace(/^www\./, '').split('.');
  if (l.length <= 2) return l.join('.');
  const deuxNiveaux = /^(co|com|org|net|gouv|asso|ac)$/.test(l[l.length - 2]) && l[l.length - 1].length === 2;
  return l.slice(deuxNiveaux ? -3 : -2).join('.');
}

/* Deux adresses du même site (même domaine enregistrable ; « www. » et les sous-domaines sont du même site). */
export function memeSite(a, b) {
  try { return domaineDe(new URL(a).hostname) === domaineDe(new URL(b).hostname); } catch (e) { return false; }
}

/* Adresse absolue d'une redirection (en-tête Location, relatif ou non), ou '' si elle est illisible. */
export function resoudreRedirection(base, location) {
  const cible = String(location == null ? '' : location).trim();
  if (!cible) return '';
  try { return new URL(cible, base).href; } catch (e) { return ''; }
}

export function typeHtml(contentType) {
  return /^\s*(text\/html|application\/xhtml\+xml)\b/i.test(String(contentType || ''));
}
