/* crm-enrichir — orchestration (module ES, toutes les entrées / sorties injectées).
 *
 * `deps` :
 *   telecharger(url, { ips, delai }) → UN saut HTTP, sans suivre les redirections : { statut, location, type, html, tronque }.
 *                                `ips` : les adresses publiques vérifiées, les seules auxquelles se connecter ; `delai` : ms.
 *                                Lève une erreur portant `motif` ('delai', 'tls', 'dns', 'connexion') si rien n'est reçu.
 *   resoudre(hote, { delai })  → adresses IP (A et AAAA) de l'hôte ; tableau vide si rien.
 *   chercherGoogle(corps, masque, { delai }) → réponse de Places « Text Search » ({ places: [...] }) ; `null` (la
 *                                propriété, pas son résultat) quand la clé est absente.
 *   reserverGoogle()           → (facultatif) vrai si un appel Google de plus tient dans le plafond du jour ; l'appel
 *                                est alors compté, qu'il réussisse ou non. Faux ou erreur : pas d'appel.
 *   maintenant()               → Date.
 *   telephonePris(tel)         → (facultatif) vrai si un autre prospect porte déjà ce numéro.
 *   ecrire(id, champs, { siVides, siteLu }) → (lot) enregistre les colonnes et rend la ligne telle qu'en base.
 *                                Les colonnes nommées dans `siVides` ne sont écrites que si elles sont ENCORE vides
 *                                en base au moment de l'écriture (site_web : vide, ou resté égal à `siteLu`).
 *
 * Aucune de ces fonctions n'est appelée avec autre chose qu'une adresse passée par `urlAutorisee` et dont toutes
 * les adresses IP sont publiques, y compris à chaque saut de redirection.
 */
import { urlAutorisee, ipPublique, resoudreRedirection, typeHtml, REDIRECTIONS_MAX } from './securite.js';
import {
  analyserSite, extraireLiens, vues, choisirPagesInternes, classerUrlSite, estParking, requeteGoogle, choisirLieu, signauxGoogle, bornerSignaux,
  telFrancais, MASQUE_GOOGLE
} from './analyse.js';

export const LIMITES = {
  prospects: 10, parallele: 5, pages: 3,
  // Tout le travail réseau d'un prospect (Google, DNS, pages, redirections) tient dans budgetProspect ; celui d'un
  // lot dans budgetAppel : le navigateur, qui abandonne à 60 s, reçoit toujours une réponse.
  budgetProspect: 20000, budgetAppel: 45000, delaiRequete: 8000, delaiDns: 3000,
  siteFraisJours: 30, siteGardeJours: 180, googleFraisJours: 180, googleParJour: 300
};
export const MOTIFS = ['refuse', 'dns', 'delai', 'tls', 'connexion', 'http_4xx', 'http_5xx', 'type', 'redirections'];
// Colonnes renvoyées au navigateur après l'écriture (et rien d'autre).
export const COLONNES_RETOUR = ['id', 'signaux', 'analyse_at', 'google_url', 'google_note', 'google_avis', 'site_web', 'email', 'telephone',
  'instagram', 'facebook', 'lat', 'lon', 'updated_at'];
// Colonnes qui ne sont remplies que si elles sont vides : une valeur saisie pendant l'analyse n'est jamais écrasée.
export const COLONNES_SI_VIDES = ['email', 'telephone', 'instagram', 'facebook', 'google_url', 'site_web', 'lat', 'lon'];
const JOUR = 86400000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Corps de la requête : { ids: 1 à 10 uuid, forcer }. Rend { ok, ids (dédoublonnés), forcer } ou { ok: false }. */
export function validerEntree(corps) {
  if (!corps || typeof corps !== 'object' || !Array.isArray(corps.ids)) return { ok: false };
  const ids = [];
  for (const id of corps.ids) {
    if (typeof id !== 'string' || !UUID.test(id)) return { ok: false };
    const propre = id.toLowerCase();
    if (ids.indexOf(propre) < 0) ids.push(propre);
  }
  if (!ids.length || ids.length > LIMITES.prospects) return { ok: false };
  return { ok: true, ids, forcer: corps.forcer === true };
}

/* Plafond quotidien des appels Google d'après la variable CRM_GOOGLE_MAX_JOUR. Absente ou vide : 300.
   « 0 » coupe Google. Une valeur illisible (« abc », « -5 ») coupe aussi : un plafond mal écrit ne doit pas
   devenir « pas de plafond ». */
export function plafondGoogle(valeur) {
  const texte = String(valeur == null ? '' : valeur).trim();
  if (!texte) return LIMITES.googleParJour;
  return /^\d{1,6}$/.test(texte) ? parseInt(texte, 10) : 0;
}

function motifDe(e) {
  const m = e && e.motif;
  return MOTIFS.indexOf(m) >= 0 ? m : 'connexion';
}

/* Télécharge une page en suivant au plus 5 redirections, chaque saut repassant par toutes les vérifications.
   `options.echeance` (ms) : plus rien n'est tenté après, et chaque étape reçoit le temps qui reste comme délai.
   La connexion se fait vers les adresses vérifiées ici (`ips`), jamais vers une nouvelle résolution du nom.
   Rend { ok: true, url (finale), html, tronque } ou { ok: false, motif }. */
export async function recupererPage(adresse, deps, options) {
  let url = adresse;
  const hotesRefuses = (options && options.hotesRefuses) || [];
  const echeance = options && options.echeance != null ? +options.echeance : null;
  const reste = () => (echeance == null ? Infinity : echeance - deps.maintenant());
  for (let saut = 0; saut <= REDIRECTIONS_MAX; saut++) {
    const verdict = urlAutorisee(url, { hotesRefuses });
    if (!verdict.ok) return { ok: false, motif: 'refuse' };
    if (reste() <= 0) return { ok: false, motif: 'delai' };
    let ips;
    try { ips = await deps.resoudre(verdict.url.hostname, { delai: Math.min(LIMITES.delaiDns, reste()) }); } catch (e) { return { ok: false, motif: 'dns' }; }
    if (!Array.isArray(ips) || !ips.length) return { ok: false, motif: 'dns' };
    // Une seule adresse privée parmi les réponses suffit à refuser : c'est elle que la connexion pourrait choisir.
    if (!ips.every(ipPublique)) return { ok: false, motif: 'refuse' };
    if (reste() <= 0) return { ok: false, motif: 'delai' };
    let r;
    try { r = await deps.telecharger(verdict.url.href, { ips: ips.slice(0, 8), delai: Math.min(LIMITES.delaiRequete, reste()) }); } catch (e) { return { ok: false, motif: motifDe(e) }; }
    const statut = r && +r.statut;
    if (statut >= 300 && statut < 400) {
      const suite = resoudreRedirection(verdict.url.href, r.location);
      if (!suite) return { ok: false, motif: 'redirections' };
      url = suite;
      continue;
    }
    if (statut >= 500) return { ok: false, motif: 'http_5xx' };
    if (statut >= 400) return { ok: false, motif: 'http_4xx' };
    if (!(statut >= 200)) return { ok: false, motif: 'connexion' };
    if (!typeHtml(r.type)) return { ok: false, motif: 'type' };
    return { ok: true, url: verdict.url.href, html: typeof r.html === 'string' ? r.html : '', tronque: !!r.tronque };
  }
  return { ok: false, motif: 'redirections' };
}

function frais(partie, jours, maintenant) {
  const le = partie && Date.parse(partie.le);
  return !!le && maintenant.getTime() - le < jours * JOUR && maintenant.getTime() >= le;
}
function vide(v) { return v == null || v === ''; }
function nombre(v) { const n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : null; }
function adresseWeb(v) {
  const site = typeof v === 'string' ? v.trim() : '';
  return /^https?:\/\/[^\s<>"`\\]+$/i.test(site) && site.length <= 300 ? site : '';
}

/* Google n'a pas pu être interrogé (clé absente, plafond du jour, panne). Ce que l'on savait d'une vraie réponse
   (fiche trouvée, ou cherchée et introuvable) reste ; sinon l'état est noté et daté : le prospect reste « à
   compléter » pour le navigateur, qui le reproposera. */
function googleEnAttente(etat, anciens, le) {
  const su = anciens.google && (anciens.google.etat === 'trouve' || anciens.google.etat === 'introuvable') ? anciens.google : null;
  return { etat, signaux: su || { etat, le } };
}

async function partieGoogle(p, deps, options, anciens, le, champs, vue, echeance) {
  if (!deps.chercherGoogle) return googleEnAttente('sans_cle', anciens, le);
  const maintenant = deps.maintenant();
  if (!options.forcer && anciens.google && anciens.google.etat === 'trouve' && frais(anciens.google, LIMITES.googleFraisJours, maintenant)) {
    return { etat: 'saute', signaux: anciens.google };
  }
  // Plafond du jour : l'appel est réservé (et compté) AVANT d'être fait. Compteur en panne = pas d'appel.
  const quota = options.google;
  if (quota && !(quota.reste > 0)) return googleEnAttente('quota', anciens, le);
  if (typeof deps.reserverGoogle === 'function') {
    let accorde = false;
    try { accorde = (await deps.reserverGoogle()) === true; } catch (e) { accorde = false; }
    if (!accorde) return googleEnAttente('quota', anciens, le);
  }
  if (quota) quota.reste--;
  let choix;
  try {
    const delai = Math.max(1, Math.min(LIMITES.delaiRequete, echeance - deps.maintenant()));
    const reponse = await deps.chercherGoogle(requeteGoogle(p), MASQUE_GOOGLE, { delai });
    choix = choisirLieu(p, reponse && reponse.places);
  } catch (e) {
    return googleEnAttente('erreur', anciens, le);
  }
  if (choix.etat !== 'trouve') return { etat: 'introuvable', signaux: { etat: 'introuvable', le } };
  const g = signauxGoogle(choix, le), lieu = choix.lieu;
  if (vide(p.google_url) && typeof lieu.googleMapsUri === 'string' && /^https:\/\//.test(lieu.googleMapsUri) && lieu.googleMapsUri.length <= 500 &&
      !/[\s<>"`\\]/.test(lieu.googleMapsUri)) champs.google_url = lieu.googleMapsUri;
  if (g.note != null) champs.google_note = g.note;
  if (g.avis != null) champs.google_avis = g.avis;
  // Le site de la fiche Google : repris quand le prospect n'a pas de vrai site (colonne vide, page d'annuaire,
  // profil de réseau social), puis analysé dans le même passage. Une page Facebook donnée pour « site » est rangée
  // dans sa colonne, jamais téléchargée.
  const siteGoogle = adresseWeb(lieu.websiteUri), classeGoogle = siteGoogle ? classerUrlSite(siteGoogle) : null;
  g.site = !!classeGoogle && classeGoogle.type === 'site';
  if (g.site && classerUrlSite(p.site_web).type !== 'site') {
    champs.site_web = siteGoogle;
    vue.site_web = siteGoogle;
  } else if (classeGoogle && classeGoogle.type === 'reseau_seul' && classeGoogle.reseau && classeGoogle.lien && vide(p[classeGoogle.reseau]) &&
      !(classeGoogle.reseau in champs)) {
    champs[classeGoogle.reseau] = classeGoogle.lien;
  }
  if (vide(p.telephone)) {
    const tel = telFrancais(lieu.nationalPhoneNumber);
    let pris = false;
    if (tel && deps.telephonePris) { try { pris = !!(await deps.telephonePris(tel, p.id)); } catch (e) { pris = true; } }
    if (tel && !pris) champs.telephone = tel;
  }
  const lat = lieu.location && nombre(lieu.location.latitude), lon = lieu.location && nombre(lieu.location.longitude);
  if (vide(p.lat) && vide(p.lon) && lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    champs.lat = Math.round(lat * 1e6) / 1e6;
    champs.lon = Math.round(lon * 1e6) / 1e6;
  }
  return { etat: 'trouve', signaux: g };
}

async function partieSite(p, deps, options, anciens, le, champs, vue, echeance) {
  const siteWeb = String(vue.site_web == null ? '' : vue.site_web).trim().slice(0, 300);
  const classe = classerUrlSite(siteWeb);
  if (classe.type === 'pas_de_site') return { etat: 'pas_de_site', signaux: { etat: 'pas_de_site', le } };
  if (classe.type === 'annuaire') return { etat: 'annuaire', signaux: { etat: 'annuaire', le, de: siteWeb } };
  if (classe.type === 'reseau_seul') {
    const s = { etat: 'reseau_seul', le, de: siteWeb };
    if (classe.reseau) s.reseau = classe.reseau;
    return { etat: 'reseau_seul', signaux: s };
  }
  const ancien = anciens.site;
  const lu = ancien && (ancien.etat === 'analyse' || ancien.etat === 'parking' || ancien.etat === 'illisible') && ancien.de === siteWeb;
  if (!options.forcer && lu && frais(ancien, LIMITES.siteFraisJours, deps.maintenant())) return { etat: 'saute', signaux: ancien };

  const acces = { hotesRefuses: options.hotesRefuses, echeance };
  let accueil = await recupererPage(classe.url, deps, acces);
  // Une adresse notée sans « https:// » dont le site ne répond qu'en http.
  if (!accueil.ok && !/^[a-z][a-z0-9+.\-]*:/i.test(siteWeb) && ['tls', 'connexion', 'delai'].indexOf(accueil.motif) >= 0 &&
      echeance - deps.maintenant() > 0) {
    const enClair = await recupererPage(classe.url.replace(/^https:/i, 'http:'), deps, acces);
    if (enClair.ok) accueil = enClair;
  }
  if (!accueil.ok) {
    // Combien de passages de suite ont échoué sur cette adresse : le navigateur cesse de la reproposer après trois.
    const avant = ancien && ancien.de === siteWeb ? (ancien.etat === 'injoignable' ? ancien : ancien.echec) : null;
    const essais = Math.min(99, ((avant && +avant.essais) || (avant ? 1 : 0)) + 1);
    // Une panne passagère n'efface pas ce qu'une analyse réussie avait vu (une boutique en ligne, par exemple) :
    // l'ancienne analyse reste, avec la date et le motif de l'échec.
    if (lu && frais(ancien, LIMITES.siteGardeJours, deps.maintenant())) {
      return { etat: 'injoignable', signaux: Object.assign({}, ancien, { echec: { le, motif: accueil.motif, essais } }) };
    }
    return { etat: 'injoignable', signaux: { etat: 'injoignable', le, motif: accueil.motif, de: siteWeb, essais } };
  }

  // Chaque page n'est lue qu'une fois : les deux lectures servent à la page d'attente, aux pages internes et à l'analyse.
  const lire = page => { page.vues = vues(page.html); page.liens = extraireLiens(page.html, page.url); return page; };
  const pages = [lire(accueil)];
  if (!estParking(accueil)) {
    const internes = choisirPagesInternes(accueil.liens, accueil.url);
    for (const adresse of internes) {
      if (pages.length >= LIMITES.pages || echeance - deps.maintenant() <= 0) break;
      const page = await recupererPage(adresse, deps, acces);
      if (page.ok) pages.push(lire(page));
    }
  }
  const site = analyserSite(pages, { annee: deps.maintenant().getFullYear() });
  site.le = le;
  site.de = siteWeb;
  if (site.email && vide(p.email)) champs.email = site.email;
  if (site.instagram && vide(p.instagram) && !('instagram' in champs)) champs.instagram = site.instagram;
  if (site.facebook && vide(p.facebook) && !('facebook' in champs)) champs.facebook = site.facebook;
  return { etat: site.etat, signaux: site };
}

/* Analyse un prospect (ligne de crm_prospects). Rend { site, google, champs, siVides, siteLu } : `champs` sont les
   colonnes à écrire, d'un seul tenant. Celles nommées dans `siVides` ne doivent l'être que si la colonne est encore
   vide au moment de l'écriture (la ligne lue ici a pu changer entre-temps) ; seuls les signaux, la date, la note et
   le nombre d'avis suivent toujours l'analyse. `siteLu` : valeur de site_web qui n'était pas un site (page
   d'annuaire, profil social) et que le site de la fiche Google peut remplacer.
   `options` : { forcer, hotesRefuses, echeance (ms, fin du lot), google: { reste } (plafond en mémoire, facultatif) }. */
export async function enrichirProspect(p, deps, options) {
  options = options || {};
  const debut = deps.maintenant();
  const le = debut.toISOString();
  const echeance = Math.min(debut.getTime() + LIMITES.budgetProspect, options.echeance != null ? +options.echeance : Infinity);
  const anciens = p.signaux && typeof p.signaux === 'object' && !Array.isArray(p.signaux) ? p.signaux : {};
  const champs = {}, vue = Object.assign({}, p);
  // Un « site » qui est un profil Facebook ou Instagram : le lien est rangé dans sa colonne, jamais téléchargé.
  const classeDepart = classerUrlSite(p.site_web);
  if (classeDepart.type === 'reseau_seul' && classeDepart.reseau && classeDepart.lien && vide(p[classeDepart.reseau])) champs[classeDepart.reseau] = classeDepart.lien;
  // Google d'abord : sa fiche peut donner le site qui manquait, analysé dans le même passage.
  const google = await partieGoogle(p, deps, options, anciens, le, champs, vue, echeance);
  const site = await partieSite(p, deps, options, anciens, le, champs, vue, echeance);
  const signaux = { v: 1 };
  if (anciens.osm && typeof anciens.osm === 'object') signaux.osm = anciens.osm;
  if (site.signaux) signaux.site = site.signaux;
  if (google.signaux) signaux.google = google.signaux;
  champs.signaux = bornerSignaux(signaux);
  champs.analyse_at = le;
  const r = { site: site.etat, google: google.etat, champs, siVides: COLONNES_SI_VIDES.filter(c => c in champs) };
  if ('site_web' in champs && !vide(p.site_web)) r.siteLu = p.site_web;
  return r;
}

function extraire(ligne) {
  const o = {};
  COLONNES_RETOUR.forEach(c => { if (ligne && c in ligne) o[c] = ligne[c]; });
  return o;
}

/* Traite un lot : cinq prospects à la fois, 45 s en tout (aucun téléchargement ne dépasse cette échéance). Au-delà,
   les prospects non commencés reviennent « reporte » (le navigateur les redemande). Ne lève jamais : un échec
   devient un résultat « erreur ». Le prospect renvoyé est la ligne telle qu'elle est en base après l'écriture. */
export async function enrichirLot(ids, lignes, deps, options) {
  options = options || {};
  const debut = deps.maintenant();
  const parId = new Map();
  (lignes || []).forEach(l => { if (l && l.id != null) parId.set(String(l.id).toLowerCase(), l); });
  const resultats = new Array(ids.length);
  let curseur = 0;
  async function ouvrier() {
    while (curseur < ids.length) {
      const i = curseur++, id = ids[i], p = parId.get(String(id).toLowerCase());
      if (!p) { resultats[i] = { id, etat: 'introuvable' }; continue; }
      if (deps.maintenant() - debut >= LIMITES.budgetAppel) { resultats[i] = { id, etat: 'reporte' }; continue; }
      try {
        const r = await enrichirProspect(p, deps, Object.assign({}, options, { echeance: debut.getTime() + LIMITES.budgetAppel }));
        const condition = () => ({ siVides: r.siVides.filter(c => c in r.champs), siteLu: r.siteLu });
        let ecrit;
        try {
          ecrit = await deps.ecrire(p.id, r.champs, condition());
        } catch (e) {
          // Le numéro trouvé sur la fiche Google vient d'être pris par un autre prospect : on écrit le reste.
          if (!(e && e.code === '23505' && 'telephone' in r.champs)) throw e;
          delete r.champs.telephone;
          ecrit = await deps.ecrire(p.id, r.champs, condition());
        }
        resultats[i] = { id, etat: 'ok', site: r.site, google: r.google, prospect: extraire(Object.assign({ id: p.id }, r.champs, ecrit)) };
      } catch (e) {
        if (typeof deps.journal === 'function') deps.journal(e);
        resultats[i] = { id, etat: 'erreur', message: 'Écriture impossible' };
      }
    }
  }
  const ouvriers = [];
  for (let n = 0; n < Math.min(LIMITES.parallele, ids.length); n++) ouvriers.push(ouvrier());
  await Promise.all(ouvriers);
  return { ok: true, google: deps.chercherGoogle ? 'actif' : 'sans_cle', duree_ms: deps.maintenant() - debut, resultats };
}
