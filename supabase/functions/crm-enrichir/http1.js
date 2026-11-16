/* crm-enrichir — requête HTTP/1.1 sur une connexion déjà ouverte (module ES pur : la connexion est injectée).
 *
 * Pourquoi ne pas laisser faire fetch : fetch résout lui-même le nom d'hôte, une seconde fois, après la
 * vérification des adresses IP. Un DNS malveillant peut répondre une adresse publique à la vérification et une
 * adresse interne à la connexion (« DNS rebinding »). Ici la connexion est ouverte par l'appelant VERS L'ADRESSE
 * VÉRIFIÉE ; le nom d'hôte ne sert plus qu'à l'en-tête Host et au certificat TLS.
 *
 * `connexion` : { lire() → Promise<Uint8Array | null> (null = fin), ecrire(Uint8Array) → Promise }.
 * Un seul échange par connexion (Connection: close), aucun cookie, aucune redirection suivie.
 */

export const ENTETES_MAX = 32768;

const encodeur = new TextEncoder();

/* Texte de la requête GET. `url` : objet URL déjà validé (http ou https, sans identifiants). */
export function requeteGet(url, entetes) {
  const lignes = ['GET ' + (url.pathname || '/') + (url.search || '') + ' HTTP/1.1', 'Host: ' + url.host];
  Object.keys(entetes || {}).forEach(nom => {
    const valeur = String(entetes[nom]);
    // Ni nom ni valeur ne peuvent porter un saut de ligne : pas d'en-tête injecté.
    if (/^[A-Za-z0-9\-]+$/.test(nom) && !/[\r\n]/.test(valeur)) lignes.push(nom + ': ' + valeur);
  });
  lignes.push('Accept-Encoding: gzip', 'Connection: close', '', '');
  return encodeur.encode(lignes.join('\r\n'));
}

function concat(a, b) {
  const c = new Uint8Array(a.length + b.length);
  c.set(a, 0);
  c.set(b, a.length);
  return c;
}

function indexFinEntetes(octets, depuis) {
  for (let i = Math.max(0, depuis); i + 3 < octets.length; i++) {
    if (octets[i] === 13 && octets[i + 1] === 10 && octets[i + 2] === 13 && octets[i + 3] === 10) return i;
  }
  return -1;
}

function erreur(motif) {
  const e = new Error(motif);
  e.motif = motif;
  return e;
}

/* Lit la réponse : { statut, entetes (objet, noms en minuscules), corps (Uint8Array, vide si `sansCorps(statut,
   entetes)` est vrai), tronque }. `max` : nombre d'octets de corps au plus ; au-delà la lecture s'arrête et
   `tronque` est vrai. Une connexion coupée après un début de corps rend ce qui a été lu, tronqué. */
export async function lireReponse(connexion, options) {
  const max = (options && options.max) || 1572864;
  const sansCorps = options && options.sansCorps;
  let tampon = new Uint8Array(0), fin = -1;
  while (fin < 0) {
    const morceau = await connexion.lire();
    if (!morceau) throw erreur('connexion');
    const depuis = tampon.length - 3;
    tampon = concat(tampon, morceau);
    fin = indexFinEntetes(tampon, depuis);
    if (fin < 0 && tampon.length > ENTETES_MAX) throw erreur('connexion');
  }
  if (fin > ENTETES_MAX) throw erreur('connexion');
  const tete = new TextDecoder('latin1').decode(tampon.subarray(0, fin)).split('\r\n');
  const premiere = /^HTTP\/1\.[01] (\d{3})(?: |$)/.exec(tete[0] || '');
  if (!premiere) throw erreur('connexion');
  const statut = +premiere[1];
  const entetes = {};
  tete.slice(1).forEach(ligne => {
    const i = ligne.indexOf(':');
    if (i <= 0) return;
    const nom = ligne.slice(0, i).trim().toLowerCase();
    if (!(nom in entetes)) entetes[nom] = ligne.slice(i + 1).trim();
  });
  let reste = tampon.subarray(fin + 4);
  if (statut < 200 || statut === 204 || statut === 304 || (sansCorps && sansCorps(statut, entetes))) {
    return { statut, entetes, corps: new Uint8Array(0), tronque: false };
  }

  const morceaux = [];
  let total = 0, tronque = false;
  function garder(octets) {
    if (!octets.length) return true;
    if (total + octets.length >= max) {
      morceaux.push(octets.subarray(0, max - total));
      total = max;
      tronque = true;
      return false;
    }
    morceaux.push(octets);
    total += octets.length;
    return true;
  }
  async function suite() {
    const morceau = await connexion.lire();
    return morceau || null;
  }
  try {
    if (/chunked/i.test(entetes['transfer-encoding'] || '')) {
      // Morceaux « taille en hexadécimal, CRLF, données, CRLF », terminés par un morceau de taille nulle.
      let lus = true;
      while (lus) {
        let finLigne = -1;
        while ((finLigne = reste.indexOf(10)) < 0) {
          if (reste.length > 64) throw erreur('connexion');
          const m = await suite();
          if (!m) { tronque = total > 0; if (!total) throw erreur('connexion'); lus = false; break; }
          reste = concat(reste, m);
        }
        if (!lus) break;
        const taille = parseInt(new TextDecoder('latin1').decode(reste.subarray(0, finLigne)).split(';')[0].trim(), 16);
        if (!isFinite(taille) || taille < 0) throw erreur('connexion');
        reste = reste.subarray(finLigne + 1);
        if (taille === 0) break;
        let attendu = taille;
        while (attendu > 0) {
          if (!reste.length) {
            const m = await suite();
            if (!m) { tronque = true; lus = false; break; }
            reste = m;
          }
          const part = reste.subarray(0, Math.min(attendu, reste.length));
          reste = reste.subarray(part.length);
          attendu -= part.length;
          if (!garder(part)) { lus = false; break; }
        }
        if (!lus) break;
        // CRLF de fin de morceau.
        while (reste.length < 2) {
          const m = await suite();
          if (!m) { lus = false; break; }
          reste = concat(reste, m);
        }
        reste = reste.subarray(2);
      }
    } else {
      const annonce = /^\d{1,15}$/.test(entetes['content-length'] || '') ? parseInt(entetes['content-length'], 10) : null;
      let attendu = annonce == null ? Infinity : annonce;
      let encore = true;
      while (encore && attendu > 0) {
        if (!reste.length) {
          const m = await suite();
          if (!m) { if (annonce != null) tronque = true; break; }
          reste = m;
        }
        const part = reste.subarray(0, Math.min(attendu, reste.length));
        reste = reste.subarray(part.length);
        attendu -= part.length;
        encore = garder(part);
      }
    }
  } catch (e) {
    // Délai dépassé ou connexion coupée pendant la lecture : sans rien de lu c'est un échec, sinon on garde ce qu'on a.
    if (!total) throw (e && e.motif ? e : erreur('connexion'));
    tronque = true;
  }
  const corps = new Uint8Array(total);
  let position = 0;
  morceaux.forEach(m => { corps.set(m, position); position += m.length; });
  return { statut, entetes, corps, tronque };
}

/* Décompresse un corps gzip ou deflate, sans jamais dépasser `max` octets en sortie (une « bombe » compressée est
   coupée). Rend { corps, tronque } ; un flux abîmé ou coupé rend ce qui a pu être lu. Autre encodage : lève 'type'. */
export async function decompresser(corps, encodage, max) {
  const nom = String(encodage || '').trim().toLowerCase();
  if (!nom || nom === 'identity') return { corps, tronque: false };
  const format = nom === 'gzip' || nom === 'x-gzip' ? 'gzip' : nom === 'deflate' ? 'deflate' : '';
  if (!format || typeof DecompressionStream === 'undefined') throw erreur('type');
  const flux = new Blob([corps]).stream().pipeThrough(new DecompressionStream(format));
  const lecteur = flux.getReader();
  const morceaux = [];
  let total = 0, tronque = false;
  try {
    while (true) {
      const { done, value } = await lecteur.read();
      if (done) break;
      if (total + value.length >= max) {
        morceaux.push(value.subarray(0, max - total));
        total = max;
        tronque = true;
        await lecteur.cancel().catch(() => {});
        break;
      }
      morceaux.push(value);
      total += value.length;
    }
  } catch (e) {
    if (!total) throw erreur('type');
    tronque = true;
  }
  const sortie = new Uint8Array(total);
  let position = 0;
  morceaux.forEach(m => { sortie.set(m, position); position += m.length; });
  return { corps: sortie, tronque };
}

/* Adresses à essayer, IPv4 d'abord (toutes les fonctions Edge n'ont pas de route IPv6), deux au plus. */
export function ordreConnexion(ips) {
  const liste = (Array.isArray(ips) ? ips : []).map(String);
  return liste.filter(ip => ip.indexOf(':') < 0).concat(liste.filter(ip => ip.indexOf(':') >= 0)).slice(0, 2);
}
