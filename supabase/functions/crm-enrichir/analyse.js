/* crm-enrichir — analyse du HTML d'un site de commerce et choix de la fiche Google (module ES pur, sans E/S).
 *
 * Entrée : le HTML de l'accueil et d'au plus deux pages internes. Sortie : des signaux pour la chaleur du prospect.
 * Rien de ce qui est écrit sur la page n'est recopié tel quel : seulement des identifiants de listes fermées
 * (plateformes.js), des nombres, et quatre valeurs passées par un validateur strict (e-mail, portable, liens
 * Instagram et Facebook). Un signal absent veut dire « pas vu », jamais « non ».
 *
 * Les parcours sont linéaires (pas d'expression régulière sur une longueur non bornée) : une page de 1,5 Mo de
 * bruit ou de balises jamais fermées ne ralentit pas la fonction.
 */
import {
  HOTES_RESEAUX, HOTES_ANNUAIRES, BOUTIQUES, PANIER_FORTES, PANIER_FAIBLES, CHEMIN_PANIER, PLATEFORMES_COMMANDE, LIVRAISON_COMMISSION, HOTES_ANTI_GASPI,
  TEXTE_ANTI_GASPI, HOTES_MARCHEO, HOTES_FORMULAIRES, PARKING_FORTS, PARKING_FAIBLES, TRAITEUR_FORTS, TRAITEUR_FAIBLES, FETES, FETES_CONTEXTE,
  FETES_HORS_SUJET, SUR_COMMANDE, SUR_COMMANDE_DELAI, CONSTRUCTEURS, GENERATEURS_ANCIENS, CATEGORIES_PAGES, EXTENSIONS_EXCLUES, MULTI_LIENS,
  MULTI_CHEMINS, EMAILS_REJETES, MOTS_GENERIQUES, MASQUE_GOOGLE, FAMILLES_METIERS, FAMILLE_DU_METIER, CREDIT_SITE, ADRESSE_TIERS, COMPTES_MODELES
} from './plateformes.js';
import { memeSite, domaineDe } from './securite.js';

export { MASQUE_GOOGLE };

const LIENS_MAX = 3000, BALISE_MAX = 2000, TABLEAU_MAX = 6;
// En dessous, une page n'a rien donné à lire (application rendue par script, image seule).
const LISIBLE_MIN = 200, PARKING_COURT = 600;
// Au-delà, le texte d'une page n'apprend plus rien : les mots-clés ne sont cherchés que dans ce début.
const VISIBLE_MAX = 400000;

export function sansAccents(v) {
  return String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2018\u2019\u02bc]/g, '\'').toLowerCase();
}

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', agrave: 'à',
  acirc: 'â', ccedil: 'ç', ocirc: 'ô', ugrave: 'ù', ucirc: 'û', icirc: 'î', iuml: 'ï', rsquo: '\'', lsquo: '\'', laquo: '«', raquo: '»',
  copy: '©', ndash: '–', mdash: '—', hellip: '…', euro: '€', oelig: 'œ', deg: '°' };

export function decoderEntites(texte) {
  if (texte.indexOf('&') < 0) return texte;
  return texte.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (tout, nom) => {
    if (nom.charAt(0) === '#') {
      const code = /^#x/i.test(nom) ? parseInt(nom.slice(2), 16) : parseInt(nom.slice(1), 10);
      try { return code > 31 && code < 0x110000 ? String.fromCodePoint(code) : ' '; } catch (e) { return ' '; }
    }
    const v = ENTITES[nom.toLowerCase()];
    return v === undefined ? ' ' : v;
  });
}

/* Retire les blocs <nom …>…</nom> (script, style…). Un bloc jamais fermé emporte la fin du document. */
function retirerBlocs(html, min, nom) {
  const ouvre = '<' + nom, ferme = '</' + nom;
  let i = min.indexOf(ouvre);
  if (i < 0) return { html, min };
  let sortie = '', sortieMin = '', debut = 0;
  while (i >= 0) {
    // « <scripted » n'est pas « <script » : le caractère suivant doit clore le nom.
    const suivant = min.charAt(i + ouvre.length);
    if (suivant && !/[\s>\/]/.test(suivant)) { i = min.indexOf(ouvre, i + ouvre.length); continue; }
    sortie += html.slice(debut, i) + ' ';
    sortieMin += min.slice(debut, i) + ' ';
    const f = min.indexOf(ferme, i + ouvre.length);
    if (f < 0) { debut = html.length; break; }
    const fin = min.indexOf('>', f);
    debut = fin < 0 ? html.length : fin + 1;
    i = min.indexOf(ouvre, debut);
  }
  return { html: sortie + html.slice(debut), min: sortieMin + min.slice(debut) };
}

function retirerCommentaires(html) {
  let i = html.indexOf('<!--');
  if (i < 0) return html;
  let sortie = '', debut = 0;
  while (i >= 0) {
    sortie += html.slice(debut, i) + ' ';
    const f = html.indexOf('-->', i + 4);
    if (f < 0) { debut = html.length; break; }
    debut = f + 3;
    i = html.indexOf('<!--', debut);
  }
  return sortie + html.slice(debut);
}

function retirerBalises(html) {
  let sortie = '', debut = 0, i = html.indexOf('<');
  while (i >= 0) {
    const f = html.indexOf('>', i + 1);
    if (f < 0) break;
    sortie += html.slice(debut, i) + ' ';
    debut = f + 1;
    i = html.indexOf('<', debut);
  }
  return sortie + html.slice(debut);
}

/* Les deux lectures d'une page : `brut` (HTML en minuscules, pour les marqueurs techniques) et `visible`
   (le texte qu'un visiteur lit, sans accents, en minuscules, espaces réduits). */
export function vues(html) {
  const source = String(html == null ? '' : html);
  const brut = source.toLowerCase();
  let reste = { html: retirerCommentaires(source), min: '' };
  reste.min = reste.html.toLowerCase();
  ['script', 'style', 'noscript', 'svg', 'template'].forEach(nom => { reste = retirerBlocs(reste.html, reste.min, nom); });
  const visible = sansAccents(decoderEntites(retirerBalises(reste.html).slice(0, VISIBLE_MAX * 2))).replace(/\s+/g, ' ').trim().slice(0, VISIBLE_MAX);
  return { brut, visible };
}

function attribut(attributs, nom) {
  const m = new RegExp('(?:^|[\\s"\'])' + nom + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+))', 'i').exec(attributs);
  return m ? decoderEntites(m[1] != null ? m[1] : m[2] != null ? m[2] : m[3]).trim() : '';
}

/* Balises ouvrantes <nom …> d'un document : [{ attributs, fin (indice après « > ») }]. Bornées en nombre et en longueur. */
function balises(html, min, nom, max) {
  const trouvees = [], ouvre = '<' + nom;
  let i = min.indexOf(ouvre);
  while (i >= 0 && trouvees.length < (max || LIENS_MAX)) {
    const apres = i + ouvre.length, suivant = min.charAt(apres);
    if (/[\s\/>]/.test(suivant)) {
      const f = min.indexOf('>', apres);
      if (f < 0) break;
      if (f - apres <= BALISE_MAX) trouvees.push({ attributs: html.slice(apres, f), debut: i, fin: f + 1 });
    }
    i = min.indexOf(ouvre, apres);
  }
  return trouvees;
}

function analyserUrl(v, base) {
  try { return base ? new URL(v, base) : new URL(v); } catch (e) { return null; }
}
function hoteNu(hote) { return String(hote || '').toLowerCase().replace(/\.$/, '').replace(/^(www|m|fr-fr|fr)\./, ''); }
function hoteDans(hote, liste) {
  const h = hoteNu(hote);
  return liste.some(d => h === d || h.endsWith('.' + d));
}

/* Texte lisible juste avant une position du document (les balises retirées, sans accents). */
function texteAvant(source, position, longueur) {
  const morceau = source.slice(Math.max(0, position - 500), position);
  // Une balise coupée par le début du morceau ne doit pas passer pour du texte.
  const ferme = morceau.indexOf('>'), ouvre = morceau.indexOf('<');
  const debut = ferme >= 0 && (ouvre < 0 || ouvre > ferme) ? morceau.slice(ferme + 1) : morceau;
  return sansAccents(decoderEntites(retirerBalises(debut))).replace(/\s+/g, ' ').slice(-(longueur || 160));
}

/* Liens d'une page : [{ href (absolu), hote, chemin, texte (sans accents, 160 car. au plus), credit }].
   `credit` : le lien suit une mention « site réalisé par… » (ou la porte) : il est celui du prestataire.
   Les <iframe src> comptent (commande embarquée) avec un texte vide. Parcours linéaire, même sans aucun « </a> ». */
export function extraireLiens(html, urlPage) {
  const source = String(html == null ? '' : html), min = source.toLowerCase();
  const liens = [];
  function ajouter(valeur, texte, debut) {
    const v = String(valeur || '').trim();
    if (!v || v.charAt(0) === '#' || v.length > 1500) return;
    const credit = debut != null && (CREDIT_SITE.test(texteAvant(source, debut)) || CREDIT_SITE.test(texte));
    const schema = /^([a-z][a-z0-9+.\-]*):/i.exec(v);
    if (schema && !/^https?$/i.test(schema[1])) { liens.push({ href: v, hote: '', chemin: '', texte, special: schema[1].toLowerCase(), credit }); return; }
    const url = analyserUrl(v, urlPage);
    if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) return;
    liens.push({ href: url.href, hote: url.hostname.toLowerCase(), chemin: (url.pathname + url.search).toLowerCase(), texte, credit });
  }
  // Position du prochain « </a » : cherchée une seule fois tant qu'elle reste devant la balise lue (-1 : plus aucune).
  let fermeture = -2;
  balises(source, min, 'a').forEach(b => {
    if (fermeture !== -1 && fermeture < b.fin) fermeture = min.indexOf('</a', b.fin);
    const f = fermeture;
    const interieur = f < 0 ? '' : source.slice(b.fin, Math.min(f, b.fin + 400));
    const texte = sansAccents(decoderEntites(retirerBalises(interieur))).replace(/\s+/g, ' ').trim().slice(0, 160);
    ajouter(attribut(b.attributs, 'href'), texte || sansAccents(attribut(b.attributs, 'title') || attribut(b.attributs, 'aria-label')).slice(0, 160), b.debut);
  });
  balises(source, min, 'iframe', 60).forEach(b => ajouter(attribut(b.attributs, 'src'), ''));
  balises(source, min, 'area', 60).forEach(b => ajouter(attribut(b.attributs, 'href'), ''));
  return liens;
}

/* L'expression est-elle écrite sans être niée ? « Pas de boutique en ligne », « bientôt notre boutique en ligne »,
   « nous avons quitté Uber Eats » ne disent pas que le commerce l'utilise. « N'hésitez pas à commander » reste vu,
   et la négation doit toucher l'expression (18 caractères au plus entre les deux) : « pas de minimum d'achat sur
   notre boutique en ligne » décrit bien une boutique. */
const NEGATION = /(\bpas (de |d'|encore |sur |chez )|\bplus (de |d'|sur |chez )|\baucune? )[^.!?;:]{0,18}$|\b(sans|ni|bientot|prochainement|quitte|arrete|abandonne) ([a-z']+ ){0,2}$/;
const GLOBALES = new Map();
export function vuSansNegation(visible, re) {
  let globale = GLOBALES.get(re);
  if (!globale) { globale = new RegExp(re.source, re.flags.indexOf('g') >= 0 ? re.flags : re.flags + 'g'); GLOBALES.set(re, globale); }
  globale.lastIndex = 0;
  let m, essais = 0;
  while ((m = globale.exec(visible)) && essais++ < 40) {
    if (!NEGATION.test(visible.slice(Math.max(0, m.index - 70), m.index))) return true;
    if (m[0] === '') globale.lastIndex++;
  }
  return false;
}

// ───────────────────────────── Liens Instagram et Facebook ─────────────────────────────

const RESERVES_INSTAGRAM = ['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'tv', 'direct', 'about', 'developer', 'legal', 'share', '_u', '_n']
  .concat(COMPTES_MODELES);
const RESERVES_FACEBOOK = ['sharer', 'sharer.php', 'share', 'share.php', 'plugins', 'tr', 'dialog', 'login', 'login.php', 'hashtag', 'watch', 'events',
  'groups', 'help', 'policies', 'policy', 'privacy', 'legal', 'terms', 'about', 'settings', 'ads', 'ad_campaign', 'photo', 'photos', 'media', 'notes',
  'public', 'search', 'recover', 'reg', 'checkpoint', 'messages', 'bookmarks', 'stories', 'reel', 'reels', 'games', 'fundraisers', 'l.php', 'story.php',
  'photo.php', 'video.php', 'home.php', 'permalink.php', 'marketplace', 'gaming', 'business'].concat(COMPTES_MODELES);
// Sous-pages d'une page Facebook : c'est la page qui est rangée, pas la publication.
const SOUS_PAGES_FACEBOOK = ['posts', 'photos', 'videos', 'about', 'reviews', 'events', 'community', 'menu', 'services', 'shop', 'mentions', 'reels',
  'live', 'offers', 'photos_stream'];

/* Règle de CRM.normaliserLien (crm-coeur.js) pour une adresse complète, en plus strict (l'adresse vient d'une page
   et non d'une saisie) : profil Instagram ou page Facebook uniquement, jamais un bouton de partage, un pixel, une
   page de politique, le compte d'un modèle de site ; une publication est ramenée à sa page. Rend l'adresse https
   normalisée, ou ''. */
export function normaliserReseau(reseau, valeur) {
  const v = String(valeur == null ? '' : valeur).trim();
  if (!v || v.length > 500 || /[\s\u0000-\u001f\u007f<>"`\\]/.test(v)) return '';
  const url = analyserUrl(/^https?:\/\//i.test(v) ? v : 'https://' + v.replace(/^\/+/, ''));
  if (!url || url.username || url.password || url.port) return '';
  const hote = url.hostname.toLowerCase().replace(/\.$/, '');
  const chemin = url.pathname.replace(/\/+$/, '');
  if (reseau === 'instagram') {
    if (!/^((www|m)\.)?instagram\.com$/.test(hote) && hote !== 'instagr.am') return '';
    const segments = chemin.split('/');
    const id = ((segments[1] || '').toLowerCase() === '_u' || (segments[1] || '').toLowerCase() === '_n' ? segments[2] : segments[1]) || '';
    if (!/^[a-z0-9._]{1,30}$/i.test(id) || !/[a-z0-9]/i.test(id) || RESERVES_INSTAGRAM.indexOf(id.toLowerCase()) >= 0) return '';
    return 'https://www.instagram.com/' + id.toLowerCase() + '/';
  }
  if (reseau === 'facebook') {
    const court = /^(www\.)?fb\.me$/.test(hote);
    if (!/^([a-z0-9\-]+\.)?facebook\.com$/.test(hote) && !/^(www\.)?fb\.com$/.test(hote) && !court) return '';
    if (!chemin || !/^[\/A-Za-z0-9._~%\-]+$/.test(chemin)) return '';
    const morceaux = chemin.split('/');
    const premier = (morceaux[1] || '').toLowerCase();
    if (!court && morceaux.length > 2 && SOUS_PAGES_FACEBOOK.indexOf(morceaux[2].toLowerCase()) >= 0) return normaliserReseau('facebook', 'https://www.facebook.com/' + morceaux[1]);
    const numero = /^\/(profile|people)\.php$/i.test(chemin) ? /^\d{3,25}$/.exec(url.searchParams.get('id') || '') : null;
    if (!numero && RESERVES_FACEBOOK.indexOf(premier) >= 0) return '';
    if (/\.php$/i.test(chemin) && (!numero || court)) return '';
    const lien = court ? 'https://fb.me' + chemin : 'https://www.facebook.com' + chemin + (numero ? '?id=' + numero[0] : '');
    return lien.length <= 500 ? lien : '';
  }
  return '';
}

// ───────────────────────────── Nature de l'adresse du site ─────────────────────────────

/* Première adresse d'une colonne site_web (OpenStreetMap en met parfois plusieurs, séparées par « ; »),
   avec son schéma. Chaîne vide si rien d'exploitable. */
export function adresseSite(siteWeb) {
  const premier = String(siteWeb == null ? '' : siteWeb).split(/\s*;\s*/).map(s => s.trim()).filter(Boolean)[0] || '';
  if (!premier) return '';
  return /^[a-z][a-z0-9+.\-]*:/i.test(premier) ? premier : 'https://' + premier.replace(/^\/+/, '');
}

/* { type: 'pas_de_site' | 'reseau_seul' | 'annuaire' | 'site', url, reseau ('facebook' | 'instagram' | null), lien }.
   Un profil Facebook ou Instagram, un Linktree, une page d'annuaire ne sont pas « son site » : jamais téléchargés. */
export function classerUrlSite(siteWeb) {
  const adresse = adresseSite(siteWeb);
  if (!adresse) return { type: 'pas_de_site', url: '', reseau: null, lien: '' };
  const url = analyserUrl(adresse);
  if (!url) return { type: 'site', url: adresse, reseau: null, lien: '' };
  const hote = url.hostname;
  if (hoteDans(hote, HOTES_RESEAUX)) {
    const reseau = hoteDans(hote, ['instagram.com', 'instagr.am']) ? 'instagram' : hoteDans(hote, ['facebook.com', 'fb.com', 'fb.me']) ? 'facebook' : null;
    return { type: 'reseau_seul', url: adresse, reseau, lien: reseau ? normaliserReseau(reseau, adresse) : '' };
  }
  // Google Sites héberge de vrais sites de commerces : ce n'est pas un annuaire.
  if (hoteNu(hote) !== 'sites.google.com' && hoteDans(hote, HOTES_ANNUAIRES)) return { type: 'annuaire', url: adresse, reseau: null, lien: '' };
  return { type: 'site', url: adresse, reseau: null, lien: '' };
}

// ───────────────────────────── Pages internes ─────────────────────────────

function sansFragment(href) { return String(href).replace(/#.*$/, '').replace(/\/+$/, ''); }

/* Au plus deux pages internes utiles, une par catégorie (commande, traiteur, boutiques, contact), dans cet ordre
   de priorité. `liens` : résultat d'extraireLiens sur l'accueil. Rend des adresses absolues. */
export function choisirPagesInternes(liens, urlAccueil) {
  const accueil = sansFragment(urlAccueil);
  const parCategorie = {};
  (liens || []).forEach(l => {
    if (!l || l.special || !l.href || !memeSite(l.href, urlAccueil)) return;
    const url = analyserUrl(l.href);
    if (!url || EXTENSIONS_EXCLUES.test(url.pathname)) return;
    const propre = sansFragment(url.href);
    if (propre === accueil || (url.pathname === '/' && !url.search)) return;
    let chemin = url.pathname;
    try { chemin = decodeURIComponent(chemin); } catch (e) { /* chemin mal encodé : lu tel quel */ }
    const botte = sansAccents(chemin) + ' ' + (l.texte || '').replace(/\s+/g, '-');
    // « Nos boutiques » est la page des points de vente, pas celle d'une boutique en ligne : reconnue d'abord.
    const boutiques = CATEGORIES_PAGES.filter(c => c.id === 'boutiques')[0];
    const categorie = boutiques.re.test(botte) ? boutiques : CATEGORIES_PAGES.filter(c => c.re.test(botte))[0];
    if (categorie && !parCategorie[categorie.id]) parCategorie[categorie.id] = propre;
  });
  const choisies = [];
  CATEGORIES_PAGES.forEach(c => { if (parCategorie[c.id] && choisies.length < 2 && choisies.indexOf(parCategorie[c.id]) < 0) choisies.push(parCategorie[c.id]); });
  return choisies;
}

// ───────────────────────────── Page d'attente ─────────────────────────────

function liensInternes(liens, urlPage) {
  return liens.filter(l => !l.special && memeSite(l.href, urlPage) && sansFragment(l.href) !== sansFragment(urlPage));
}

/* Domaine à vendre, page par défaut de l'hébergeur : une page courte ou sans lien interne ET un motif fort.
   « Site en construction », « bientôt disponible » : seulement sur une page presque vide. Un vrai site d'une seule
   page (liens en ancres) qui écrit « galette bientôt disponible » n'est pas une page d'attente. */
export function estParking(page) {
  const v = page.vues || vues(page.html);
  const liens = page.liens || extraireLiens(page.html, page.url);
  if (v.visible.length < PARKING_COURT && PARKING_FAIBLES.some(re => re.test(v.visible))) return true;
  if (v.visible.length >= 1500 && liensInternes(liens, page.url).length > 0) return false;
  // Le HTML brut n'est sondé que sur son début : les marqueurs d'un domaine parqué sont dans l'en-tête ou le premier script.
  const botte = v.visible + ' ' + v.brut.slice(0, 20000);
  return PARKING_FORTS.some(re => re.test(botte));
}

// ───────────────────────────── Extraction ─────────────────────────────

function ajouterUnique(liste, valeur, max) {
  if (valeur && liste.indexOf(valeur) < 0 && liste.length < (max || TABLEAU_MAX)) liste.push(valeur);
}

export function emailValide(v) {
  let e = String(v == null ? '' : v).trim().toLowerCase().replace(/^mailto:/, '').replace(/\?.*$/, '');
  try { e = decodeURIComponent(e); } catch (x) { /* gardé tel quel */ }
  e = e.trim();
  if (e.length < 6 || e.length > 200 || !/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(e) || /\.\./.test(e) || EMAILS_REJETES.test(e)) return '';
  return e;
}

export function mobileFrancais(v) {
  let d = String(v == null ? '' : v).replace(/\D/g, '');
  if (d.indexOf('0033') === 0) d = d.slice(4); else if (d.indexOf('33') === 0 && d.length >= 11) d = d.slice(2);
  if (/^[67]\d{8}$/.test(d)) d = '0' + d;
  return /^0[67]\d{8}$/.test(d) ? d : '';
}

export function telFrancais(v) {
  let d = String(v == null ? '' : v).replace(/\D/g, '');
  if (d.indexOf('0033') === 0) d = d.slice(4); else if (d.indexOf('33') === 0 && d.length >= 11) d = d.slice(2);
  if (/^0[1-9]\d{8}$/.test(d)) return d;
  if (/^[1-9]\d{8}$/.test(d)) return '0' + d;
  return '';
}

function marqueurs(brut, table) {
  const ids = [];
  table.forEach(m => {
    const vu = m.un ? m.un.some(s => brut.indexOf(s) >= 0) : m.tous.every(s => brut.indexOf(s) >= 0);
    if (vu && ids.indexOf(m.id) < 0) ids.push(m.id);
  });
  return ids;
}

function produitStructure(brut) {
  if (brut.indexOf('ld+json') < 0 && brut.indexOf('"@type"') < 0) return false;
  const serre = brut.replace(/\s+/g, '');
  return (serre.indexOf('"@type":"product"') >= 0 && serre.indexOf('"offers"') >= 0) || serre.indexOf('"@type":"orderaction"') >= 0;
}

const ADRESSE_POSTALE = /\d{1,4}( ?(bis|ter))?,? (rue|avenue|av\.?|boulevard|bd|place|chemin|route|allee|cours|quai|impasse|faubourg)\b[^|<]{3,60}?\b(\d{5})\b/g;

function codesPostaux(page, codes) {
  let m;
  ADRESSE_POSTALE.lastIndex = 0;
  while ((m = ADRESSE_POSTALE.exec(page.vues.visible)) && codes.size < 20) {
    // L'adresse de l'hébergeur, du siège, de l'agence qui a fait le site ou d'un producteur n'est pas un point de vente.
    if (ADRESSE_TIERS.test(page.vues.visible.slice(Math.max(0, m.index - 140), m.index))) continue;
    codes.add(m[4]);
  }
  const re = /"postalcode"\s*:\s*"(\d{5})"/g;
  while ((m = re.exec(page.vues.brut)) && codes.size < 20) codes.add(m[1]);
}

function indicesAnciens(page, annee) {
  const brut = page.vues.brut, indices = [];
  const tete = brut.slice(0, 60000);
  if (!/<meta[^>]{0,200}name\s*=\s*["']?viewport/.test(tete)) indices.push('sans_viewport');
  let plusRecente = 0, m;
  const re = /(©|&copy;|&#169;|copyright)\s*(?:\(c\)\s*)?(\d{4})(?:\s*[-–—]\s*(\d{4}))?/g;
  while ((m = re.exec(brut))) {
    [m[2], m[3]].forEach(a => { const n = +a; if (n >= 1995 && n <= annee + 1 && n > plusRecente) plusRecente = n; });
  }
  if (plusRecente && plusRecente <= annee - 4) indices.push('copyright_' + plusRecente);
  if (/^http:/i.test(page.url)) indices.push('http_seul');
  if (/<font[\s>]|<marquee[\s>]|<frameset[\s>]|<center>|\.swf\b/.test(brut)) indices.push('balises_anciennes');
  if ((brut.match(/<table[\s>]/g) || []).length >= 5 && !/<(main|section|article|nav)[\s>]/.test(brut)) indices.push('mise_en_page_tableaux');
  const generateur = /<meta[^>]{0,200}name\s*=\s*["']?generator["']?[^>]{0,200}>/.exec(tete);
  if (generateur && GENERATEURS_ANCIENS.test(attribut(generateur[0].slice(5, -1), 'content').toLowerCase())) indices.push('generateur_ancien');
  return indices.slice(0, 4);
}

// Ce qui se commande dans un commerce de bouche : distingue « réservez votre galette » de « réservations au 04… ».
const PRODUITS = /galette|buche|gateau|plateau|pain|panier|colis|volaille|chapon|dinde|foie gras|produit|piece|tarte|fromage|viande|poisson|huitre|fruits de mer|bouquet|composition|menu|plat|repas|commande/;
const TABLE = /\btables?\b|\bcouverts?\b|\brestaurant\b|\bdejeuner\b|\bdiner\b|\bmidi et soir\b/;
const LIEN_COMMANDE = /\bcommande[rsz]?\b|\bprecommande|\breserve[rz]? (vo|un|une|le|la|les|des)\b/;

/* Le commerce prend-il déjà des commandes à la main ? 'telephone', 'formulaire' ou null. Il faut une invitation à
   commander (un verbe, « vos commandes », « commandes par téléphone ») suivie du moyen ; un numéro en pied de page,
   une réservation de table, un bouton WhatsApp ou un formulaire sans rapport ne comptent pas. */
function precommande(pages) {
  let telephone = false, formulaire = false;
  const MOYEN = '(par telephone|au 0[1-9]|au \\+33|appele[zr]|telephone[zr]|par sms|(par|sur|via) whatsapp)';
  const TEL_1 = new RegExp('(commandez|commander|passe[zr] (vos |votre |une |ta |la )?commandes?|vos commandes|prises? de commandes?|commandes? (possibles? |uniquement |a passer |se font |se fait )?' +
    '(par telephone|au 0[1-9]|au \\+33|(par|sur|via) whatsapp|par sms)|precommande[rz]|reserve[rz])[^.|!?]{0,70}?' + MOYEN, 'g');
  const TEL_2 = /(appele[zr]|telephone[zr]|contacte[zr]|joindre)[^.|!?]{0,70}?(pour (passer |vos |votre |toute |une )?(commande|precommande)|pour (commander|reserver|precommander))/g;
  const FORM_TEXTE = /bon de commande|formulaire de (pre)?commande|commande[rz]? par (mail|e-mail|courriel)/;
  const FORM_CHAMPS = /\bcommande[rs]?\b|\bprecommande/;
  pages.forEach(page => {
    const visible = page.vues.visible;
    [TEL_1, TEL_2].forEach(re => {
      let m, essais = 0;
      re.lastIndex = 0;
      while (!telephone && (m = re.exec(visible)) && essais++ < 40) {
        // Réserver une table n'est pas commander des produits ; « réservez » seul doit porter sur un produit.
        if (TABLE.test(m[0])) continue;
        if (/^reserve[rz]/.test(m[0]) && !PRODUITS.test(m[0])) continue;
        if (/pour reserver$/.test(m[0]) && !PRODUITS.test(visible.slice(m.index, m.index + m[0].length + 60))) continue;
        if (NEGATION.test(visible.slice(Math.max(0, m.index - 70), m.index))) continue;
        telephone = true;
      }
    });
    // Un bouton WhatsApp ou un formulaire externe ne compte que s'il invite à commander.
    if (page.liens.some(l => !l.credit && /^(wa\.me|api\.whatsapp\.com)$/.test(l.hote) && LIEN_COMMANDE.test(l.texte || ''))) telephone = true;
    if (vuSansNegation(visible, FORM_TEXTE)) formulaire = true;
    if (page.liens.some(l => !l.credit && HOTES_FORMULAIRES.some(h => (l.hote + l.chemin).indexOf(h) >= 0) && LIEN_COMMANDE.test(l.texte || ''))) formulaire = true;
    if (page.liens.some(l => /\.pdf(\?|$)/.test(l.chemin) && /commande/.test(sansAccents(l.chemin)))) formulaire = true;
    const brut = page.vues.brut;
    let i = brut.indexOf('<form'), essais = 0;
    while (i >= 0 && essais++ < 12 && !formulaire) {
      const f = brut.indexOf('</form', i);
      const bloc = brut.slice(i, Math.min(f < 0 ? brut.length : f, i + 6000));
      // Texte du formulaire et noms de ses champs : un formulaire de recherche, de contact ou de lettre d'information ne compte pas.
      let champs = '', a;
      const reChamps = /(?:name|placeholder|aria-label)\s*=\s*["']([^"'<>]{1,80})["']/g;
      while ((a = reChamps.exec(bloc))) champs += ' ' + a[1];
      const texteFormulaire = sansAccents(decoderEntites(retirerBalises(bloc) + champs));
      // « Numéro de commande », « suivi de commande » : un formulaire de réclamation, pas une prise de commande.
      if (FORM_CHAMPS.test(texteFormulaire.replace(/(numero|n°|no|suivi|reference|ref\.?) (de |de la |de votre )?commande/g, ' '))) formulaire = true;
      i = brut.indexOf('<form', i + 5);
    }
  });
  return telephone ? 'telephone' : formulaire ? 'formulaire' : null;
}

/* Les fêtes ne comptent que si la même phrase parle de commande : fenêtre de 120 caractères, coupée aux points
   (« Galette des rois bientôt disponible ! Commandez au 04… » est une seule idée). */
function fetesCommandees(visible, re) {
  const globale = new RegExp(re.source, 'g');
  let m, essais = 0;
  while ((m = globale.exec(visible)) && essais++ < 30) {
    let avant = visible.slice(Math.max(0, m.index - 120), m.index), apres = visible.slice(m.index + m[0].length, m.index + m[0].length + 120);
    const coupe = avant.lastIndexOf('. ');
    if (coupe >= 0) avant = avant.slice(coupe + 2);
    const fin = apres.indexOf('. ');
    if (fin >= 0) apres = apres.slice(0, fin);
    const phrase = avant + m[0] + apres;
    if (FETES_CONTEXTE.test(phrase) && !FETES_HORS_SUJET.test(avant.slice(-50))) return true;
  }
  return false;
}

/* Deux mots « événement » distincts à moins de 200 caractères l'un de l'autre (une liste), pas deux mots épars. */
function evenementsProches(visible) {
  const vus = [];
  TRAITEUR_FAIBLES.forEach(m => {
    const globale = new RegExp(m.re.source, 'g');
    let r, essais = 0;
    while ((r = globale.exec(visible)) && essais++ < 20) vus.push({ id: m.id, i: r.index });
  });
  vus.sort((a, b) => a.i - b.i);
  const ids = [];
  for (let k = 0; k < vus.length; k++) {
    for (let n = k + 1; n < vus.length && vus[n].i - vus[k].i <= 200; n++) {
      if (vus[n].id !== vus[k].id) { ajouterUnique(ids, vus[k].id, 12); ajouterUnique(ids, vus[n].id, 12); }
    }
  }
  return ids;
}

/* Analyse d'un site. `pages` : [{ url (finale), html, tronque }], l'accueil en premier (les lectures `vues` et
   `liens` déjà faites sont reprises). `options.annee` : année courante (pour l'âge du copyright). Rend le sous-objet
   `site` des signaux, sans `le` (posé par l'appelant). */
export function analyserSite(pages, options) {
  const annee = (options && options.annee) || new Date().getFullYear();
  const lues = (pages || []).filter(p => p && typeof p.html === 'string').slice(0, 3).map(p => {
    const html = p.html;
    return { url: String(p.url || ''), html, tronque: !!p.tronque, vues: p.vues || vues(html), liens: p.liens || extraireLiens(html, p.url) };
  });
  const accueil = lues[0];
  if (!accueil) return { etat: 'injoignable', motif: 'type' };
  const site = { etat: 'analyse', url: accueil.url.slice(0, 300), https: /^https:/i.test(accueil.url), pages: lues.length, tronque: lues.some(p => p.tronque) };
  if (estParking(accueil)) { site.etat = 'parking'; site.pages = 1; return site; }

  const tousLiens = [];
  lues.forEach(p => p.liens.forEach(l => tousLiens.push(l)));
  const hotes = tousLiens.filter(l => l.hote);
  const vu = re => lues.some(p => vuSansNegation(p.vues.visible, re));

  // Déjà client : le site lui-même est une boutique Marchéo, ou il y renvoie.
  if (lues.some(p => hoteDans((analyserUrl(p.url) || {}).hostname, HOTES_MARCHEO)) || hotes.some(l => hoteDans(l.hote, HOTES_MARCHEO))) site.deja_marcheo = true;

  // Commande en ligne : boutique > plateforme > rien vu.
  const outils = [];
  lues.forEach(p => marqueurs(p.vues.brut, BOUTIQUES).forEach(id => ajouterUnique(outils, id)));
  if (lues.some(p => produitStructure(p.vues.brut))) ajouterUnique(outils, 'produit_structure');
  let fortes = 0, faiblesVues = 0;
  PANIER_FORTES.forEach(re => { if (vu(re)) fortes++; });
  PANIER_FAIBLES.forEach(re => { if (vu(re)) faiblesVues++; });
  const cheminVente = lues.some(p => liensInternes(p.liens, p.url).some(l => CHEMIN_PANIER.test(l.chemin)));
  // Une expression qui décrit vraiment une vente en ligne (et qui n'est pas niée), confirmée par une seconde
  // expression ou par une page dédiée : un « passer commande » par téléphone ou un menu vide ne font pas une boutique.
  if (fortes >= 1 && (fortes + faiblesVues >= 2 || cheminVente)) ajouterUnique(outils, 'panier_texte');
  if (outils.length) {
    site.commande = 'boutique';
  } else {
    PLATEFORMES_COMMANDE.forEach(pf => { if (hotes.some(l => hoteDans(l.hote, pf.hotes))) ajouterUnique(outils, pf.id); });
    site.commande = outils.length ? 'plateforme' : 'aucune_vue';
  }
  site.outils = outils;

  const constructeur = marqueurs(accueil.vues.brut, CONSTRUCTEURS)[0];
  // Rien à lire (application rendue par script, image seule) et aucun marqueur technique : on ne peut pas dire
  // « pas vu de commande en ligne », seulement que le site n'a pas pu être lu.
  if (site.commande === 'aucune_vue' && !site.deja_marcheo && lues.every(p => p.vues.visible.length < LISIBLE_MIN)) {
    const illisible = { etat: 'illisible', url: site.url, https: site.https, pages: lues.length, tronque: site.tronque };
    if (constructeur) illisible.constructeur = constructeur;
    return illisible;
  }

  const commission = [];
  LIVRAISON_COMMISSION.forEach(pf => { if (hotes.some(l => hoteDans(l.hote, pf.hotes))) ajouterUnique(commission, pf.id); });
  if (!commission.length) LIVRAISON_COMMISSION.forEach(pf => { if (pf.texte && vu(pf.texte)) ajouterUnique(commission, pf.id); });
  if (commission.length) site.livraison_commission = commission;
  if (hotes.some(l => hoteDans(l.hote, HOTES_ANTI_GASPI)) || vu(TEXTE_ANTI_GASPI)) site.anti_gaspi = true;

  const pre = precommande(lues);
  if (pre) site.precommande = pre;

  // Traiteur (un mot fort), événements (une liste de mots faibles), fêtes, produits sur commande.
  const mots = [];
  const forts = [], faibles = [];
  lues.forEach(p => {
    TRAITEUR_FORTS.forEach(m => { if (vuSansNegation(p.vues.visible, m.re)) ajouterUnique(forts, m.id, 12); });
    evenementsProches(p.vues.visible).forEach(id => ajouterUnique(faibles, id, 12));
  });
  if (forts.length) {
    site.traiteur = true;
    // Trois mots au plus par famille : il reste de la place pour les fêtes et les produits sur commande.
    forts.forEach(id => ajouterUnique(mots, id, 3));
  }
  if (faibles.length >= 2) {
    site.evenements = true;
    faibles.forEach(id => ajouterUnique(mots, id, 3));
  }
  lues.forEach(p => {
    FETES.forEach(m => { if (fetesCommandees(p.vues.visible, m.re)) { site.fetes = true; ajouterUnique(mots, m.id, 5); } });
  });
  lues.forEach(p => {
    SUR_COMMANDE.forEach(m => { if (vuSansNegation(p.vues.visible, m.re)) { site.sur_commande = true; ajouterUnique(mots, m.id); } });
    if (SUR_COMMANDE_DELAI.test(p.vues.visible) && /commande/.test(p.vues.visible)) { site.sur_commande = true; ajouterUnique(mots, 'sur_commande'); }
  });
  if (mots.length) site.mots = mots;

  // Plusieurs points de vente.
  const codes = new Set();
  lues.forEach(p => codesPostaux(p, codes));
  const lienBoutiques = tousLiens.some(l => !l.special && !l.credit && (MULTI_LIENS.test(l.texte || '') || MULTI_CHEMINS.test(l.chemin || '')));
  if (lienBoutiques || codes.size >= 2) site.multi = true;
  if (codes.size >= 2) site.adresses = Math.min(20, codes.size);

  const indices = indicesAnciens(accueil, annee);
  if (indices.length) site.indices = indices;
  if (indices.indexOf('sans_viewport') >= 0 || indices.filter(i => i !== 'sans_viewport').length >= 2) site.vieillot = true;
  if (constructeur) site.constructeur = constructeur;

  // Coordonnées : quatre valeurs seulement, chacune passée par son validateur. Les liens d'un prestataire (mention
  // « site réalisé par… ») sont écartés ; à défaut d'e-mail du domaine du site, le premier e-mail vu est retenu.
  let email = '', emailMaison = '', mobile = '', instagram = '', facebook = '';
  const domaine = domaineDe((analyserUrl(accueil.url) || {}).hostname || '');
  tousLiens.forEach(l => {
    if (l.credit) return;
    if (l.special === 'mailto') {
      const e = emailValide(l.href);
      if (e && !email) email = e;
      if (e && !emailMaison && domaine && e.endsWith('@' + domaine)) emailMaison = e;
    }
    if (l.special === 'tel' && !mobile) mobile = mobileFrancais(l.href);
    if (l.hote && !instagram) instagram = normaliserReseau('instagram', l.href);
    if (l.hote && !facebook) facebook = normaliserReseau('facebook', l.href);
  });
  lues.forEach(p => {
    if (!email) {
      const re = /[a-z0-9._%+\-]{1,64}@[a-z0-9.\-]{1,100}\.[a-z]{2,10}/g;
      let m, essais = 0;
      while (!email && (m = re.exec(p.vues.visible)) && essais++ < 20) {
        if (CREDIT_SITE.test(p.vues.visible.slice(Math.max(0, m.index - 160), m.index))) continue;
        email = emailValide(m[0]);
      }
    }
    if (!mobile) {
      const m = /(?:\+33|0033|\b0)[\s.\-]{0,2}[67](?:[\s.\-]{0,2}\d{2}){4}(?!\d)/.exec(p.vues.visible);
      if (m && !CREDIT_SITE.test(p.vues.visible.slice(Math.max(0, m.index - 160), m.index))) mobile = mobileFrancais(m[0]);
    }
  });
  if (emailMaison || email) site.email = emailMaison || email;
  if (mobile) site.mobile = mobile;
  if (instagram) site.instagram = instagram;
  if (facebook) site.facebook = facebook;
  return site;
}

// ───────────────────────────── Fiche Google ─────────────────────────────

const DEPARTEMENTS = ('01|Ain;02|Aisne;03|Allier;04|Alpes-de-Haute-Provence;05|Hautes-Alpes;06|Alpes-Maritimes;07|Ardèche;' +
  '08|Ardennes;09|Ariège;10|Aube;11|Aude;12|Aveyron;13|Bouches-du-Rhône;14|Calvados;15|Cantal;16|Charente;' +
  '17|Charente-Maritime;18|Cher;19|Corrèze;2A|Corse-du-Sud;2B|Haute-Corse;21|Côte-d\'Or;22|Côtes-d\'Armor;23|Creuse;' +
  '24|Dordogne;25|Doubs;26|Drôme;27|Eure;28|Eure-et-Loir;29|Finistère;30|Gard;31|Haute-Garonne;32|Gers;33|Gironde;' +
  '34|Hérault;35|Ille-et-Vilaine;36|Indre;37|Indre-et-Loire;38|Isère;39|Jura;40|Landes;41|Loir-et-Cher;42|Loire;' +
  '43|Haute-Loire;44|Loire-Atlantique;45|Loiret;46|Lot;47|Lot-et-Garonne;48|Lozère;49|Maine-et-Loire;50|Manche;' +
  '51|Marne;52|Haute-Marne;53|Mayenne;54|Meurthe-et-Moselle;55|Meuse;56|Morbihan;57|Moselle;58|Nièvre;59|Nord;' +
  '60|Oise;61|Orne;62|Pas-de-Calais;63|Puy-de-Dôme;64|Pyrénées-Atlantiques;65|Hautes-Pyrénées;' +
  '66|Pyrénées-Orientales;67|Bas-Rhin;68|Haut-Rhin;69|Rhône;70|Haute-Saône;71|Saône-et-Loire;72|Sarthe;73|Savoie;' +
  '74|Haute-Savoie;75|Paris;76|Seine-Maritime;77|Seine-et-Marne;78|Yvelines;79|Deux-Sèvres;80|Somme;81|Tarn;' +
  '82|Tarn-et-Garonne;83|Var;84|Vaucluse;85|Vendée;86|Vienne;87|Haute-Vienne;88|Vosges;89|Yonne;' +
  '90|Territoire de Belfort;91|Essonne;92|Hauts-de-Seine;93|Seine-Saint-Denis;94|Val-de-Marne;95|Val-d\'Oise;' +
  '971|Guadeloupe;972|Martinique;973|Guyane;974|La Réunion;976|Mayotte').split(';').reduce((carte, d) => { const p = d.split('|'); carte[p[0]] = p[1]; return carte; }, {});

function propre(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 200); }
function nombre(v) { const n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : null; }

/* Clé d'enseigne : le nom sans ses mots génériques (« Boulangerie Maison Dupont » → « dupont »). Vide quand il ne
   reste aucun mot d'au moins quatre lettres : pas de comparaison possible. Même règle que le cœur du CRM. */
export function cleEnseigne(nom) {
  const mots = sansAccents(nom).split(/[^a-z0-9]+/).filter(m => m && MOTS_GENERIQUES.indexOf(m) < 0);
  return mots.some(m => m.length >= 4) ? mots.join(' ') : '';
}

/* Corps de la requête Text Search (Places API New) : nom, adresse, code postal et commune ; sans commune ni code
   postal, le nom du département. Le biais géographique n'est posé qu'avec des coordonnées connues. */
export function requeteGoogle(p) {
  p = p || {};
  const lieu = [propre(p.code_postal, 10), propre(p.commune, 120)].filter(Boolean).join(' ');
  const parties = [propre(p.nom, 200), propre(p.adresse, 200), lieu || DEPARTEMENTS[String(p.departement || '').toUpperCase()] || ''].filter(Boolean);
  const corps = { textQuery: parties.join(', '), languageCode: 'fr', regionCode: 'FR', pageSize: 5 };
  const lat = nombre(p.lat), lon = nombre(p.lon);
  if (lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    corps.locationBias = { circle: { center: { latitude: lat, longitude: lon }, radius: 2000.0 } };
  }
  return corps;
}

function distanceMetres(a, b) {
  const rad = x => x * Math.PI / 180, R = 6371000;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* Familles de métiers annoncées par un nom (« Boucherie du Marché » → boucherie). */
function famillesDuNom(nom) {
  const mots = sansAccents(nom).split(/[^a-z0-9]+/);
  return FAMILLES_METIERS.filter(f => f.mots.some(m => mots.indexOf(m) >= 0)).map(f => f.id);
}

/* Le candidat de Google est-il d'un autre métier que le prospect ? Vrai seulement sur une contradiction claire :
   deux noms qui annoncent des familles sans rien de commun, ou un type Google d'une autre famille que le métier. */
function metiersContraires(p, candidat) {
  const nom = candidat.displayName && candidat.displayName.text;
  const duProspect = famillesDuNom(p.nom);
  const famille = FAMILLE_DU_METIER[String(p.business_type || '').toLowerCase()];
  if (famille && duProspect.indexOf(famille) < 0) duProspect.push(famille);
  const duCandidat = famillesDuNom(nom);
  const type = String(candidat.primaryType || '').toLowerCase();
  FAMILLES_METIERS.forEach(f => { if (type && f.google.indexOf(type) >= 0 && duCandidat.indexOf(f.id) < 0) duCandidat.push(f.id); });
  if (!duProspect.length || !duCandidat.length) return false;
  return !duProspect.some(f => duCandidat.indexOf(f) >= 0);
}

/* « exact » : même clé d'enseigne. « proche » : une clé contient l'autre, ou la moitié des mots en commun
   (« Le Fournil » et « Le Fournil de Marie » : peut-être le même, peut-être le voisin). */
function proximiteNoms(a, b) {
  const ka = cleEnseigne(a), kb = cleEnseigne(b);
  if (!ka || !kb) return '';
  if (ka === kb) return 'exact';
  if ((' ' + ka + ' ').indexOf(' ' + kb + ' ') >= 0 || (' ' + kb + ' ').indexOf(' ' + ka + ' ') >= 0) return 'proche';
  const ma = new Set(ka.split(' ')), mb = new Set(kb.split(' '));
  let communs = 0;
  ma.forEach(m => { if (mb.has(m)) communs++; });
  return communs / (ma.size + mb.size - communs) >= 0.5 ? 'proche' : '';
}

function motsDeLieu(v) {
  return sansAccents(v).replace(/[^a-z0-9]+/g, ' ').replace(/\bste\b/g, 'sainte').replace(/\bst\b/g, 'saint').trim();
}
function contientMots(botte, mots) { return !!mots && (' ' + botte + ' ').indexOf(' ' + mots + ' ') >= 0; }

/* Choix de la fiche parmi les candidats de Google, dans leur ordre.
   « forte » : même téléphone.
   « moyenne » : métier non contraire ET
     - même clé d'enseigne et lieu compatible (150 m si les deux positions sont connues ; sinon code postal, et
       commune quand elle est connue ; sinon commune seule) ;
     - ou nom seulement proche, mais à moins de 60 m, ou à la même adresse (numéro et rue) dans le même code postal.
   Aucun candidat accepté → { etat: 'introuvable' } : on n'écrit jamais la note d'un homonyme, ni celle du commerce
   d'un autre métier qui porte le même nom de lieu (« Boucherie du Marché », « Boulangerie du Marché »). */
export function choisirLieu(p, places) {
  p = p || {};
  const candidats = (Array.isArray(places) ? places : []).filter(c => c && typeof c === 'object').slice(0, 10);
  const tel = telFrancais(p.telephone);
  if (tel) {
    const meme = candidats.filter(c => telFrancais(c.nationalPhoneNumber) === tel)[0];
    if (meme) return { etat: 'trouve', confiance: 'forte', lieu: meme };
  }
  const lat = nombre(p.lat), lon = nombre(p.lon);
  const cp = /^\d{5}$/.test(String(p.code_postal || '')) ? String(p.code_postal) : '';
  const commune = motsDeLieu(p.commune);
  const rue = motsDeLieu(p.adresse);
  for (const c of candidats) {
    const proximite = proximiteNoms(p.nom, c.displayName && c.displayName.text);
    if (!proximite || metiersContraires(p, c)) continue;
    const adresse = motsDeLieu(c.formattedAddress);
    const pos = c.location && nombre(c.location.latitude) != null && nombre(c.location.longitude) != null
      ? { lat: nombre(c.location.latitude), lon: nombre(c.location.longitude) } : null;
    const distance = lat != null && lon != null && pos ? distanceMetres({ lat, lon }, pos) : null;
    const memeCp = !!cp && contientMots(adresse, cp);
    let compatible;
    if (proximite === 'exact') {
      if (distance != null) compatible = distance <= 150;
      else if (cp) compatible = memeCp && (!commune || contientMots(adresse, commune));
      else compatible = contientMots(adresse, commune);
    } else {
      // Nom seulement proche : il faut être au même endroit, pas dans la même ville.
      compatible = distance != null ? distance <= 60 : (memeCp && /^\d/.test(rue) && contientMots(adresse, rue));
    }
    if (compatible) return { etat: 'trouve', confiance: 'moyenne', lieu: c };
  }
  return { etat: 'introuvable' };
}

const STATUTS_GOOGLE = ['OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY'];

/* Sous-objet `google` des signaux pour une fiche retenue : valeurs validées une à une. */
export function signauxGoogle(choix, le) {
  const l = choix.lieu || {};
  const g = { etat: 'trouve', le, confiance: choix.confiance === 'forte' ? 'forte' : 'moyenne' };
  if (typeof l.id === 'string' && /^[A-Za-z0-9_\-]{5,300}$/.test(l.id)) g.place_id = l.id;
  const note = nombre(l.rating);
  if (note != null && note >= 1 && note <= 5) g.note = Math.round(note * 10) / 10;
  const avis = nombre(l.userRatingCount);
  if (avis != null && avis >= 0 && avis < 1e7) g.avis = Math.round(avis);
  if (STATUTS_GOOGLE.indexOf(l.businessStatus) >= 0) g.statut = l.businessStatus;
  g.site = typeof l.websiteUri === 'string' && !!l.websiteUri.trim();
  return g;
}

/* Les signaux tiennent toujours dans la colonne (6000 caractères) : au besoin les tableaux sont raccourcis,
   puis les valeurs longues retirées. */
export function bornerSignaux(signaux, max) {
  const limite = max || 6000;
  const copie = JSON.parse(JSON.stringify(signaux || {}));
  if (JSON.stringify(copie).length <= limite) return copie;
  ['site', 'osm', 'google'].forEach(partie => {
    const o = copie[partie];
    if (!o || typeof o !== 'object') return;
    Object.keys(o).forEach(k => {
      if (Array.isArray(o[k])) o[k] = o[k].slice(0, 2);
      else if (typeof o[k] === 'string' && o[k].length > 120) delete o[k];
    });
  });
  if (JSON.stringify(copie).length <= limite) return copie;
  return { v: 1, site: copie.site && copie.site.etat ? { etat: copie.site.etat, le: copie.site.le } : undefined,
    google: copie.google && copie.google.etat ? { etat: copie.google.etat, le: copie.google.le } : undefined };
}
