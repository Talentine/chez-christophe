/* CRM admin Marchéo — vue « Prospection » : appels à froid et recherche de numéros.
 *
 * Expose `window.crmProspectionAfficher(conteneur, { sousVue })`, appelé par crm-vues.js quand on entre dans
 * la vue. Trois sous-onglets : « Appeler » (une fiche d'appel, la file dessous), « Trouver des numéros »
 * (recherche OpenStreetMap par commune ou département) et « Liste » (toute la file, ajout, import).
 *
 * Les données vivent dans le cœur (`CRM.prospects`) ; ce fichier ne garde que l'état d'écran. La vue se
 * redessine par zones, et seulement quand leur contenu change : le fondateur tape ses notes pendant que
 * les écritures arrivent, une zone redessinée pour rien lui ferait perdre le curseur.
 */
(function () {
  'use strict';

  var CRM = window.CRM, UI = window.crmUI;
  if (!CRM || !UI || typeof document === 'undefined') return;
  var esc = UI.esc, pur = CRM.pur;

  var SOUS_VUES = [['appeler', 'Appeler'], ['trouver', 'Trouver des numéros'], ['liste', 'Liste']];
  var SOURCES = { osm: 'OpenStreetMap', mairie: 'Mairie', import: 'Liste importée', manuel: 'Saisie à la main' };
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var RAISONS_IMPORT = { sans_nom: 'nom manquant', numero_invalide: 'numéro invalide', doublon: 'déjà présent',
    format: 'colonnes non reconnues (séparez par « | » ou « ; »)' };
  var CLE_POSITION = 'crm_pro_position', CLE_BROUILLONS = 'crm_pro_brouillons';
  var DELAI_AVANCE = 350, DELAI_SAISIE = 700, DELAI_COMMUNES = 250;
  // Nouvel essai automatique d'une note refusée : de plus en plus espacé tant que ça échoue.
  var DELAI_RELANCE = 8000, DELAI_RELANCE_MAX = 120000;
  var PAS_FILE = 80, PAS_RESULTATS = 150, PAS_LISTE = 100;
  var LISTE_DEFAUT = 'Prospection';

  // Texte validé par le fondateur : à reprendre mot pour mot.
  var ACCROCHE = '« Bonjour, Paul Merieult. Je dirige une agence web spécialisée dans les commerces de bouche et le click-and-collect. ' +
    'Je suis moi-même primeur depuis 19 ans. Je vous propose une démo gratuite avec votre boutique : vous avez deux minutes ? »';
  var ACCROCHE_REFUS = 'Refus : demander s\'il a une entreprise à recommander, puis si tu peux appeler de sa part.';

  var ICONES = {
    points: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    importer: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    chevronGauche: '<path d="m15 18-6-6 6-6"/>'
  };
  function ic(nom, taille) {
    if (!ICONES[nom]) return UI.ic(nom, taille);
    var t = taille || 16;
    return '<svg class="crm-ic" width="' + t + '" height="' + t + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONES[nom] + '</svg>';
  }
  function toast(message, opts) { window.crmToast(message, opts); }
  function erreur(e, repli) { toast((e && e.message) || repli || 'Enregistrement impossible. Réessayez.', { type: 'erreur' }); }

  // ───────────────────────────── État d'écran ─────────────────────────────

  function rechercheNeuve() {
    var metiers = {};
    CRM.METIERS_OSM.forEach(function (m) { metiers[m.id] = !!m.defaut; });
    return {
      mode: 'commune', saisie: '', commune: null, departement: '', metiers: metiers,
      mobile: true, sansSite: true, sansEnseigne: true,
      phase: 'repos', jeton: 0, controleur: null, debut: 0, zone: null, criteres: null, erreur: '',
      resultats: [], total: 0, tronque: false, selection: new Set(), limite: PAS_RESULTATS,
      nomListe: '', nomListePerso: false, envoi: false, ajout: null
    };
  }
  function ajoutNeuf(liste) { return { nom: '', metier: '', commune: '', telephone: '', remarque: '', liste: liste || '' }; }

  var conteneur = null;
  var renduPrevu = false;
  var etat = {
    sousVue: 'appeler', pret: false,
    liste: '', filtreResultat: 'tous', filtreDep: '', courant: null, accroche: false, limiteFile: PAS_FILE,
    numero: { id: null, valeur: '' },
    rech: rechercheNeuve(),
    gestion: {
      recherche: '', liste: '', resultat: '', dep: '', limite: PAS_LISTE,
      panneau: null, erreurAjout: '', ajout: ajoutNeuf(), envoi: false,
      importation: { texte: '', liste: '' },
      action: null, suppression: null
    }
  };
  var communes = { minuterie: null, jeton: 0, controleur: null, liste: [], actif: -1, ouvert: false, message: '' };
  var chrono = null, avance = null;

  // Saisie de la note et de la recommandation : brouillon par prospect, envoyé après une pause.
  var brouillons = {}, minuteries = {}, envois = {}, aRenvoyer = {}, erreursSaisie = {}, enregistres = {};
  // Échecs déjà signalés par une notification (une seule par champ), et nouvel essai programmé.
  var signales = {}, relance = null, delaiRelance = DELAI_RELANCE;
  // Version du prospect (updated_at) sur laquelle chaque brouillon a été tapé : voir reprendreBrouillons.
  var basesBrouillons = {}, brouillonsRepris = false;

  // ───────────────────────────── Lectures ─────────────────────────────

  function tous() { return CRM.prospects || []; }
  function actif() { return !!CRM.etat.prospection; }
  function parId(id) {
    var liste = tous();
    for (var i = 0; i < liste.length; i++) if (liste[i].id === id) return liste[i];
    return null;
  }
  function resultatDe(id) {
    for (var i = 0; i < CRM.RESULTATS_PROSPECT.length; i++) if (CRM.RESULTATS_PROSPECT[i].id === id) return CRM.RESULTATS_PROSPECT[i];
    return null;
  }
  function aujourdhui() { return pur.dateLocaleISO(CRM.horloge()); }
  function nomListeDe(p) { return p.liste || LISTE_DEFAUT; }

  function stats(liste) {
    var s = { total: liste.length, appeles: 0, par: {} };
    liste.forEach(function (p) {
      if (!p.resultat) return;
      s.appeles++;
      s.par[p.resultat] = (s.par[p.resultat] || 0) + 1;
    });
    return s;
  }

  /* Les campagnes, dans l'ordre où elles ont été créées. */
  function listes() {
    var carte = new Map();
    tous().forEach(function (p) {
      var nom = nomListeDe(p);
      if (!carte.has(nom)) carte.set(nom, []);
      carte.get(nom).push(p);
    });
    var resultat = [];
    carte.forEach(function (prospects, nom) { resultat.push({ nom: nom, prospects: prospects, stats: stats(prospects) }); });
    return resultat;
  }

  /* Les prospects de la campagne choisie : c'est sur eux que portent « Fiche i sur n », la progression et le récap. */
  function base() {
    if (!etat.liste) return tous();
    return tous().filter(function (p) { return nomListeDe(p) === etat.liste; });
  }
  function courant() { return etat.courant ? parId(etat.courant) : null; }

  function estRappelDuJour(p) {
    return p.resultat === 'a_rappeler' && !!p.rappel_le && String(p.rappel_le).slice(0, 10) <= aujourdhui();
  }
  function dansDepartement(p) { return !etat.filtreDep || p.departement === etat.filtreDep; }
  function dansFiltre(p) {
    if (!dansDepartement(p)) return false;
    var f = etat.filtreResultat;
    if (f === 'tous') return true;
    if (f === 'a_appeler') return !p.resultat;
    if (f === 'rappel_jour') return estRappelDuJour(p);
    return p.resultat === f;
  }
  /* Vrai quand le filtre désigne des prospects déjà appelés : « Suivant » parcourt alors le filtre lui-même. */
  function filtreCible() { return etat.filtreResultat !== 'tous' && etat.filtreResultat !== 'a_appeler'; }

  function ficheCrm(p) { return CRM.fiche('p:' + p.id) || null; }
  function lieuDe(p) { return p.commune || CRM.nomDepartement(p.departement) || ''; }
  function lienGoogle(p, suffixe) {
    return 'https://www.google.com/search?q=' + encodeURIComponent([p.nom, p.metier, lieuDe(p)].filter(Boolean).join(' ') + (suffixe || ''));
  }
  function lienPagesJaunes(p) {
    return 'https://www.pagesjaunes.fr/annuaire/chercherlespros?quoiqui=' + encodeURIComponent(p.nom || '') + '&ou=' + encodeURIComponent(p.commune || '');
  }
  function lienExterne(href, libelle, classe) {
    return '<a class="' + (classe || 'crm-btn') + '" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + libelle + ic('externe', 13) + '</a>';
  }

  /* Raccourcis vers la fiche Google, l'Instagram et le Facebook du commerce : le lien quand il est connu
     (trouvé à la recherche ou saisi sur la fiche CRM), sinon la recherche toute prête. Les adresses sont
     repassées par la validation du cœur (https uniquement) avant d'aller dans un href. */
  function htmlPresence(p) {
    var presence = CRM.presenceProspect(p);
    return '<div class="crm-pro-presence" id="crmProPresence" role="group" aria-label="Présence en ligne">' + CRM.RESEAUX.map(function (r) {
      var etat = presence[r.id] || {};
      var url = CRM.normaliserLien(r.id, etat.url);
      var href = url || (/^https:\/\/www\.google\.com\//.test(etat.recherche || '') ? etat.recherche : '');
      if (!href) return '';
      var titre = (url ? 'Ouvrir : ' : 'Chercher : ') + r.libelle;
      return '<a class="crm-pro-pres' + (url ? ' crm-pro-pres-connu' : '') + '" data-reseau="' + r.id + '" href="' + esc(href) +
        '" target="_blank" rel="noopener noreferrer" title="' + esc(titre) + '" aria-label="' + esc(titre + ' (nouvel onglet)') + '">' +
        ic(r.id, 15) + '<span>' + esc(r.court) + '</span>' + ic(url ? 'coche' : 'recherche', 12) + '</a>';
    }).join('') + '</div>';
  }

  // Petits pictogrammes des réseaux trouvés par la recherche (résultats de « Trouver des numéros »).
  function htmlReseauxTrouves(p) {
    var trouves = CRM.RESEAUX.filter(function (r) { return r.id !== 'google' && CRM.normaliserLien(r.id, p[r.colonneProspect]); });
    if (!trouves.length) return '';
    return '<span class="crm-pro-reseaux">' + trouves.map(function (r) {
      return '<span class="crm-pro-reseau" data-reseau="' + r.id + '" title="' + esc(r.libelle + ' trouvé') + '">' + ic(r.id, 13) +
        '<span class="crm-sr">' + esc(r.libelle + ' trouvé') + '</span></span>';
    }).join('') + '</span>';
  }

  // ───────────────────────────── Position mémorisée ─────────────────────────────

  function lirePositions() {
    try {
      var o = JSON.parse(localStorage.getItem(CLE_POSITION) || 'null');
      return o && typeof o === 'object' && o.positions && typeof o.positions === 'object' ? o : { liste: '', positions: {} };
    } catch (e) { return { liste: '', positions: {} }; }
  }
  function memoriserPosition() {
    var o = lirePositions();
    o.liste = etat.liste;
    if (etat.courant) o.positions[etat.liste] = etat.courant;
    try { localStorage.setItem(CLE_POSITION, JSON.stringify(o)); } catch (e) { /* stockage bloqué : la position vaut pour la session */ }
  }

  /* Garde `etat.courant` sur un prospect de la campagne : la position mémorisée, sinon le premier à appeler. */
  function assurerCourant() {
    if (etat.liste && !tous().some(function (p) { return nomListeDe(p) === etat.liste; })) etat.liste = '';
    var liste = base();
    if (!liste.length) { etat.courant = null; return; }
    if (etat.courant && liste.indexOf(courant()) >= 0) return;
    var memo = lirePositions().positions[etat.liste];
    var p = memo && parId(memo);
    if (!p || liste.indexOf(p) < 0) p = liste.filter(function (x) { return !x.resultat; })[0] || liste[0];
    etat.courant = p.id;
  }

  // ───────────────────────────── Rendu par zones ─────────────────────────────

  /* Remplace le contenu d'une zone seulement s'il a changé. Si le curseur s'y trouvait, il y retourne.
     Un champ dont la valeur n'est pas écrite dans le HTML (note, recommandation) retrouve ce qui était tapé ;
     les autres reprennent la valeur de l'état, qui fait foi. */
  function poser(id, html) {
    var zone = document.getElementById(id);
    if (!zone || zone.__html === html) return false;
    var foyer = document.activeElement, memo = null;
    if (foyer && foyer.id && zone.contains(foyer)) {
      var texte = /^(TEXTAREA)$/.test(foyer.tagName) || (foyer.tagName === 'INPUT' && /^(text|tel|search)$/.test(foyer.type));
      memo = { id: foyer.id, ref: foyer.dataset.id || '', texte: texte, valeur: foyer.value };
      if (texte) { try { memo.debut = foyer.selectionStart; memo.fin = foyer.selectionEnd; } catch (e) { /* champ sans sélection */ } }
    }
    zone.__html = html;
    zone.innerHTML = html;
    if (memo) {
      var nouveau = document.getElementById(memo.id);
      if (nouveau && !nouveau.disabled) {
        if (memo.texte && (nouveau.dataset.id || '') === memo.ref) {
          var libre = nouveau.tagName === 'TEXTAREA' ? nouveau.defaultValue === '' : !nouveau.hasAttribute('value');
          if (libre && nouveau.value !== memo.valeur) nouveau.value = memo.valeur;
          try { if (memo.debut != null) nouveau.setSelectionRange(memo.debut, memo.fin); } catch (e) { /* idem */ }
        }
        nouveau.focus({ preventScroll: true });
      }
    }
    return true;
  }

  function monte() { return !!conteneur && document.contains(conteneur); }

  function planifier() {
    if (renduPrevu) return;
    renduPrevu = true;
    var faire = function () { renduPrevu = false; rendre(); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(faire); else setTimeout(faire, 16);
  }

  function rendre() {
    if (!monte()) return;
    assurerCourant();
    poser('crmProBandeau', htmlBandeau());
    poser('crmProOnglets', htmlOnglets());
    var corps = document.getElementById('crmProCorps');
    var vide = etat.sousVue === 'appeler' && !tous().length;
    var structure = etat.sousVue + (vide ? '|vide' : '');
    if (corps.dataset.structure !== structure) {
      corps.dataset.structure = structure;
      corps.innerHTML = vide ? '<div id="crmProVide"></div>' : COQUILLES[etat.sousVue];
    }
    if (vide) { poser('crmProVide', htmlFileVide()); return; }
    if (etat.sousVue === 'appeler') rendreAppeler();
    else if (etat.sousVue === 'trouver') rendreTrouver();
    else rendreListe();
  }

  var COQUILLES = {
    appeler: '<div class="crm-pro-entete" id="crmProEntete"></div>' +
      '<div class="crm-pro-cols"><div class="crm-pro-col">' +
        '<section class="crm-pro-carte" id="crmProCarte" aria-label="Fiche d\'appel"></section>' +
        '<div class="crm-pro-outils" id="crmProOutils"></div></div>' +
      '<section class="crm-pro-file" id="crmProFile" aria-label="File d\'appels"></section></div>',
    trouver: '<div class="crm-pro-trouver"><div class="crm-pro-bloc" id="crmProRecherche"></div>' +
      '<section id="crmProResultats" aria-label="Commerces trouvés" aria-live="polite"></section></div>',
    liste: '<div id="crmProGestionOutils"></div><div id="crmProPanneau"></div>' +
      '<section id="crmProCampagnes" aria-label="Listes d\'appels"></section><section id="crmProTable" aria-label="Tous les prospects"></section>'
  };

  function htmlBandeau() {
    if (actif()) return '';
    return '<div class="crm-bandeau" role="status">' + ic('cadenas', 16) +
      '<p><b>Prospection en lecture seule.</b> La table des prospects ne répond pas : la migration <code>20261114_crm_prospects.sql</code> ' +
      'n\'est pas encore appliquée. La recherche de numéros fonctionne, mais rien ne peut être ajouté à la file.</p></div>';
  }

  function htmlOnglets() {
    var aAppeler = tous().filter(function (p) { return !p.resultat; }).length;
    var compteurs = { appeler: aAppeler, liste: tous().length };
    return SOUS_VUES.map(function (v) {
      var choisi = etat.sousVue === v[0];
      return '<button type="button" class="crm-pro-onglet" role="tab" id="crmProOnglet-' + v[0] + '" aria-selected="' + choisi + '" data-pro="onglet" data-id="' + v[0] + '">' +
        esc(v[1]) + (compteurs[v[0]] ? '<span class="crm-pro-onglet-nb">' + compteurs[v[0]] + '</span>' : '') + '</button>';
    }).join('');
  }

  function htmlFileVide() {
    if (!actif()) {
      return '<div class="crm-vide"><span class="crm-vide-ic">' + ic('cadenas', 22) + '</span>' +
        '<p class="crm-vide-titre">La file d\'appels n\'est pas encore disponible</p>' +
        '<p class="crm-vide-texte">Appliquez la migration des prospects pour enregistrer vos appels. En attendant, vous pouvez déjà chercher des numéros.</p>' +
        '<button type="button" class="crm-btn" data-pro="onglet" data-id="trouver">' + ic('recherche', 14) + 'Trouver des numéros</button></div>';
    }
    return '<div class="crm-vide"><span class="crm-vide-ic">' + ic('telephone', 22) + '</span>' +
      '<p class="crm-vide-titre">Personne à appeler pour l\'instant</p>' +
      '<p class="crm-vide-texte">Cherchez des commerces avec un numéro dans une commune ou un département, ou collez une liste que vous avez déjà.</p>' +
      '<div class="crm-pro-vide-actions"><button type="button" class="crm-btn crm-btn-plein" data-pro="onglet" data-id="trouver">' + ic('recherche', 14) + 'Trouver des numéros</button>' +
      '<button type="button" class="crm-btn" data-pro="ouvrir-import">' + ic('importer', 14) + 'Importer une liste</button>' +
      '<button type="button" class="crm-btn" data-pro="ouvrir-ajout">' + ic('plus', 14) + 'Ajouter un prospect</button></div></div>';
  }

  // ───────────────────────────── Sous-onglet « Appeler » ─────────────────────────────

  function pastille(p, avecDate) {
    var r = resultatDe(p.resultat);
    if (!r) return '';
    var date = avecDate && p.resultat === 'a_rappeler' && p.rappel_le ? ' · ' + UI.dateCourte(p.rappel_le) : '';
    return '<span class="crm-pro-pastille crm-pro-r-' + r.id + '">' + esc(r.libelle + date) + '</span>';
  }

  function htmlEnteteAppel() {
    var liste = base(), s = stats(liste);
    var options = '<option value="">Toutes les listes (' + tous().length + ')</option>' + listes().map(function (l) {
      return '<option value="' + esc(l.nom) + '"' + (l.nom === etat.liste ? ' selected' : '') + '>' + esc(l.nom) + ' (' + l.stats.appeles + ' / ' + l.stats.total + ')</option>';
    }).join('');
    function chiffre(n, singulier, plurielMot) {
      return '<span><b>' + n + '</b> ' + esc(n > 1 ? (plurielMot || singulier + 's') : singulier) + '</span>';
    }
    var pct = liste.length ? Math.round(100 * s.appeles / liste.length) : 0;
    return '<div class="crm-pro-entete-haut">' +
      '<select class="crm-pro-select" id="crmProListe" data-champ="liste" aria-label="Liste d\'appels">' + options + '</select>' +
      '<p class="crm-pro-stats"><span><b>' + s.appeles + '</b> / ' + liste.length + ' appelés</span>' +
        chiffre(s.par.rdv || 0, 'démo') + chiffre(s.par.interesse || 0, 'intéressé') +
        chiffre(s.par.a_rappeler || 0, 'à rappeler', 'à rappeler') + chiffre(s.par.pas_interesse || 0, 'refus', 'refus') + '</p></div>' +
      '<div class="crm-pro-progres" role="progressbar" aria-label="Avancement des appels" aria-valuemin="0" aria-valuemax="' + liste.length +
        '" aria-valuenow="' + s.appeles + '"><i style="width:' + pct + '%"></i></div>';
  }

  function htmlTrouverNumero(p) {
    var saisi = etat.numero.id === p.id ? etat.numero.valeur : '';
    return '<div class="crm-pro-sans-tel"><p class="crm-pro-sans-tel-titre">' + ic('sansTel', 15) + 'Pas de numéro pour ce commerce</p>' +
      '<div class="crm-pro-rangee">' + lienExterne(lienGoogle(p, ' téléphone'), 'Google') + lienExterne(lienPagesJaunes(p), 'PagesJaunes') + '</div>' +
      '<div class="crm-pro-saisie-tel"><input type="tel" inputmode="tel" autocomplete="off" id="crmProNumero" data-champ="numero" data-id="' + esc(p.id) + '" value="' + esc(saisi) +
        '" placeholder="Coller le numéro trouvé" aria-label="Numéro trouvé">' +
      '<button type="button" class="crm-btn crm-btn-or" data-pro="numero-enregistrer">Enregistrer</button></div></div>';
  }

  function htmlRappel(p) {
    var choisie = p.rappel_le ? String(p.rappel_le).slice(0, 10) : '';
    var jour = aujourdhui();
    var puces = [[1, 'Demain'], [3, '+3 j'], [7, '+7 j']].map(function (c) {
      var date = pur.ajouterJours(jour, c[0]);
      return '<button type="button" class="crm-puce" data-pro="rappel" data-id="' + date + '" aria-pressed="' + (choisie === date) + '" title="' + esc(UI.dateAvecJour(date)) + '">' + c[1] + '</button>';
    }).join('');
    return '<div class="crm-pro-rappel"><p class="crm-pro-rappel-titre">' + ic('calendrier', 14) +
      (choisie ? 'Rappel prévu ' + esc(UI.dateAvecJour(choisie)) : 'Quand rappeler ?') + '</p>' +
      '<div class="crm-puces">' + puces +
      '<input type="date" class="crm-champ-date" id="crmProRappelDate" data-champ="rappel" min="' + jour + '" value="' + esc(choisie) + '" aria-label="Autre date de rappel"></div>' +
      (choisie ? '<p class="crm-aide">Ce commerce remontera dans « Aujourd\'hui » ce jour-là.</p>' : '') + '</div>';
  }

  /* Ce que la plateforme sait déjà de ce commerce : une fiche de pipeline née de l'appel, ou un commerçant
     déjà inscrit qui partage le même numéro. */
  function htmlLienCrm(p) {
    var f = ficheCrm(p);
    if (!f) return '';
    var r = resultatDe(p.resultat);
    var connu = f.commercant || f.audit || f.lead;
    if (!connu && !(r && r.fiche)) return '';
    var texte = connu ? 'Ce commerce a déjà une fiche : ' + UI.etapeDe(f.etape).libelle.toLowerCase() + '.' : 'Ce prospect est entré dans le pipeline (avant démo).';
    return '<div class="crm-pro-suite"><p>' + ic(connu ? 'alerte' : 'coche', 14) + esc(texte) + '</p>' +
      '<button type="button" class="crm-btn crm-btn-or" data-pro="fiche-crm">Ouvrir la fiche CRM' + ic('fleche', 14) + '</button></div>';
  }

  function htmlCarte() {
    var p = courant(), liste = base();
    if (!p) return '';
    var tel = pur.telFrancais(p.telephone);
    var dep = CRM.nomDepartement(p.departement);
    var lieu = [[p.code_postal, p.commune].filter(Boolean).join(' ') || 'Commune à confirmer', dep ? dep + ' (' + p.departement + ')' : (p.departement || '')].filter(Boolean);
    var appels = p.nb_appels > 0 && p.appele_at
      ? '<p class="crm-pro-appels">' + (p.nb_appels > 1 ? 'Appelé ' + p.nb_appels + ' fois, la dernière ' : 'Déjà appelé ') + esc(UI.dateRelative(p.appele_at)) + '</p>' : '';

    var html = '<div class="crm-pro-pos"><span>Fiche ' + (liste.indexOf(p) + 1) + ' sur ' + liste.length +
        (etat.liste ? '' : '<span class="crm-sep">·</span>' + esc(nomListeDe(p))) + '</span><span>' + esc(SOURCES[p.source] || '') + '</span></div>' +
      '<div class="crm-pro-ident"><h2 class="crm-pro-nom" id="crmProNom">' + esc(p.nom) + '</h2>' +
        '<p class="crm-pro-meta">' + (p.metier ? '<b>' + esc(p.metier) + '</b><span class="crm-sep">·</span>' : '') + esc(lieu.join(' · ')) + '</p>' +
        (p.adresse ? '<p class="crm-pro-meta">' + esc(p.adresse) + '</p>' : '') +
        (p.remarque ? '<p class="crm-pro-remarque">' + ic('alerte', 14) + '<span>' + esc(p.remarque) + '</span></p>' : '') + '</div>';

    if (tel) {
      html += '<a class="crm-pro-appeler" href="' + esc(CRM.liens({ telephone: tel }).tel) + '" data-pro="appel">' + ic('telephone', 22) +
          '<span>Appeler</span><b>' + esc(pur.formaterTel(tel)) + '</b></a>' + appels +
        '<div class="crm-pro-rangee"><button type="button" class="crm-btn" data-pro="copier-numero">' + ic('copier', 14) + 'Copier le numéro</button>' +
          lienExterne(lienGoogle(p), 'Vérifier le site') + '</div>';
    } else {
      html += htmlTrouverNumero(p) + appels;
    }
    html += htmlPresence(p);

    html += '<div class="crm-pro-resultats" role="group" aria-label="Résultat de l\'appel">' + CRM.RESULTATS_PROSPECT.map(function (r) {
      var choisi = p.resultat === r.id;
      return '<button type="button" class="crm-pro-res crm-pro-r-' + r.id + '" id="crmProRes-' + r.id + '" data-pro="resultat" data-id="' + r.id + '" aria-pressed="' + choisi + '">' +
        (choisi ? ic('coche', 15) : '') + esc(r.libelle) + '</button>';
    }).join('') + '</div>';

    if (p.resultat === 'a_rappeler') html += htmlRappel(p);
    html += htmlLienCrm(p);

    html += '<label class="crm-pro-champ"><span>Note</span>' +
        '<textarea id="crmProNote" data-champ="note" data-id="' + esc(p.id) + '" maxlength="4000" rows="3" placeholder="Prénom du patron, heure de rappel, objection…"></textarea></label>' +
      '<label class="crm-pro-champ"><span>Recommandation obtenue</span>' +
        '<input type="text" id="crmProReco" data-champ="recommandation" data-id="' + esc(p.id) + '" maxlength="500" autocomplete="off" placeholder="Entreprise recommandée, de la part de…"></label>' +
      '<p class="crm-pro-etat-saisie" id="crmProEtatSaisie" role="status"></p>' +
      '<div class="crm-pro-nav"><button type="button" class="crm-pro-precedent" id="crmProPrecedent" data-pro="precedent">' + ic('chevronGauche', 16) + 'Précédent</button>' +
        '<button type="button" class="crm-pro-suivant" id="crmProSuivant" data-pro="suivant">' + (filtreCible() ? 'Suivant du filtre' : 'Suivant à appeler') + ic('chevronDroit', 16) + '</button></div>';
    return html;
  }

  function htmlOutils() {
    return '<div class="crm-pro-rangee">' +
        '<button type="button" class="crm-btn" data-pro="recap">' + ic('copier', 14) + 'Copier le récap</button>' +
        '<button type="button" class="crm-btn" data-pro="accroche" aria-expanded="' + etat.accroche + '" aria-controls="crmProAccroche">' + ic('sms', 14) +
          (etat.accroche ? 'Masquer l\'accroche' : 'Voir l\'accroche') + '</button></div>' +
      (etat.accroche ? '<div class="crm-pro-accroche" id="crmProAccroche"><p>' + esc(ACCROCHE) + '</p><p>' + esc(ACCROCHE_REFUS) + '</p></div>' : '');
  }

  function htmlFile() {
    var liste = base(), visibles = liste.filter(dansFiltre);
    var rang = new Map();
    liste.forEach(function (p, i) { rang.set(p.id, i + 1); });
    var s = stats(liste), rappels = liste.filter(estRappelDuJour).length;
    function option(valeur, libelle, n) {
      return '<option value="' + valeur + '"' + (etat.filtreResultat === valeur ? ' selected' : '') + '>' + esc(libelle) + (n != null ? ' (' + n + ')' : '') + '</option>';
    }
    var deps = [];
    liste.forEach(function (p) { if (p.departement && deps.indexOf(p.departement) < 0) deps.push(p.departement); });
    deps.sort();

    var html = '<div class="crm-pro-file-tete"><h2>La file d\'appels<span>' + visibles.length + '</span></h2>' +
      '<div class="crm-pro-filtres">' +
        '<select id="crmProFiltreResultat" data-champ="filtre-resultat" aria-label="Filtrer par résultat">' +
          option('tous', 'Tous les résultats') + option('a_appeler', 'Pas encore appelés', liste.length - s.appeles) +
          CRM.RESULTATS_PROSPECT.map(function (r) { return option(r.id, r.libelle, s.par[r.id] || 0); }).join('') +
          option('rappel_jour', 'À rappeler aujourd\'hui', rappels) + '</select>' +
        (deps.length > 1 || etat.filtreDep ? '<select id="crmProFiltreDep" data-champ="filtre-dep" aria-label="Filtrer par département">' +
          '<option value="">Tous les départements</option>' + deps.map(function (d) {
            return '<option value="' + esc(d) + '"' + (etat.filtreDep === d ? ' selected' : '') + '>' + esc(d + ' ' + CRM.nomDepartement(d)) + '</option>';
          }).join('') + '</select>' : '') +
      '</div></div>';
    if (rappels && etat.filtreResultat !== 'rappel_jour') {
      html += '<button type="button" class="crm-pro-rappels" data-pro="filtre-rappels">' + ic('horloge', 15) +
        '<span>' + UI.pluriel(rappels, 'rappel prévu', 'rappels prévus') + ' aujourd\'hui ou en retard</span>' + ic('fleche', 14) + '</button>';
    }
    if (!visibles.length) {
      return html + '<div class="crm-pro-file-vide"><p>Aucune fiche pour ce filtre.</p>' +
        '<button type="button" class="crm-btn" data-pro="filtres-effacer">Tout afficher</button></div>';
    }
    html += '<div class="crm-pro-file-liste">' + visibles.slice(0, etat.limiteFile).map(function (p) {
      var enCours = p.id === etat.courant;
      var tel = p.telephone ? pur.formaterTel(p.telephone) : 'numéro à trouver';
      return '<button type="button" class="crm-pro-item crm-nav' + (enCours ? ' crm-pro-item-courant' : '') + '" id="crmProItem-' + esc(p.id) + '" data-pro="choisir" data-id="' + esc(p.id) + '"' +
        (enCours ? ' aria-current="true"' : '') + '><span class="crm-pro-item-n">' + rang.get(p.id) + '</span>' +
        '<span class="crm-pro-item-txt"><b>' + esc(p.nom) + '</b><small>' + esc([p.metier, lieuDe(p), tel].filter(Boolean).join(' · ')) + '</small></span>' +
        pastille(p, true) + '</button>';
    }).join('') + '</div>';
    if (visibles.length > etat.limiteFile) {
      html += '<button type="button" class="crm-btn crm-plus" data-pro="file-plus">Afficher ' + Math.min(PAS_FILE, visibles.length - etat.limiteFile) + ' fiches de plus</button>';
    }
    return html;
  }

  function rendreAppeler() {
    poser('crmProEntete', htmlEnteteAppel());
    poser('crmProCarte', htmlCarte());
    synchroniserSaisie();
    poser('crmProOutils', htmlOutils());
    poser('crmProFile', htmlFile());
  }

  // ───────────────────────────── Note et recommandation ─────────────────────────────

  function champSaisie(champ) { return document.getElementById(champ === 'note' ? 'crmProNote' : 'crmProReco'); }
  function enSaisie(id, champ) {
    var el = champSaisie(champ);
    return !!el && el === document.activeElement && el.dataset.id === id;
  }

  /* Le champ affiche le brouillon s'il y en a un, sinon la valeur enregistrée. Le brouillon d'un champ qui a
     le curseur est toujours gardé : le champ n'est donc jamais réécrit sous les doigts. */
  function synchroniserSaisie() {
    var p = courant();
    if (!p) return;
    ['note', 'recommandation'].forEach(function (champ) {
      var el = champSaisie(champ);
      if (!el || el.dataset.id !== p.id) return;
      var b = brouillons[p.id];
      var valeur = b && champ in b ? b[champ] : (p[champ] || '');
      if (el.value !== valeur) el.value = valeur;
    });
    majEtatSaisie();
  }

  function majEtatSaisie() {
    var zone = document.getElementById('crmProEtatSaisie');
    if (!zone || !etat.courant) return;
    var id = etat.courant, html = '';
    var cles = [id + '|note', id + '|recommandation'];
    var enErreur = cles.filter(function (k) { return erreursSaisie[k]; })[0];
    if (enErreur) {
      html = '<span class="crm-pro-etat-erreur">' + ic('alerte', 13) + 'Non enregistré : ' + esc(erreursSaisie[enErreur]) + '</span>' +
        '<button type="button" class="crm-lien" data-pro="saisie-reessayer">Réessayer</button>';
    } else if (cles.some(function (k) { return minuteries[k] || envois[k]; })) {
      html = '<span>Enregistrement…</span>';
    } else if (enregistres[id]) {
      html = '<span class="crm-pro-etat-ok">' + ic('coche', 13) + 'Enregistré</span>';
    }
    if (zone.__html !== html) { zone.__html = html; zone.innerHTML = html; }
  }

  /* Filet pour la page fermée avant l'enregistrement (panne de réseau, changement de site) : les brouillons
     sont aussi gardés dans le navigateur et renvoyés à l'ouverture suivante. */
  function memoriserBrouillons() {
    try {
      var ids = Object.keys(brouillons);
      if (!ids.length) { localStorage.removeItem(CLE_BROUILLONS); return; }
      var o = {};
      ids.forEach(function (id) { o[id] = { champs: brouillons[id], base: basesBrouillons[id] || '' }; });
      localStorage.setItem(CLE_BROUILLONS, JSON.stringify(o));
    } catch (e) { /* stockage bloqué : les brouillons valent pour la session */ }
  }

  /* À faire une fois la file chargée. Un brouillon n'est repris que si le prospect n'a pas changé depuis qu'il
     a été tapé : sinon il écraserait une note plus récente, saisie depuis un autre appareil. */
  function reprendreBrouillons() {
    if (brouillonsRepris || !CRM.etat.charge || !actif()) return;
    brouillonsRepris = true;
    var gardes;
    try { gardes = JSON.parse(localStorage.getItem(CLE_BROUILLONS) || 'null'); } catch (e) { gardes = null; }
    if (!gardes || typeof gardes !== 'object') return;
    Object.keys(gardes).forEach(function (id) {
      var p = parId(id), g = gardes[id];
      if (!p || !g || !g.champs || brouillons[id] || String(p.updated_at || '') !== String(g.base || '')) return;
      ['note', 'recommandation'].forEach(function (champ) {
        var valeur = g.champs[champ];
        if (typeof valeur !== 'string' || (p[champ] || '') === valeur.trim()) return;
        (brouillons[id] = brouillons[id] || {})[champ] = valeur;
        basesBrouillons[id] = g.base || '';
      });
    });
    memoriserBrouillons();
    viderSaisies();
  }

  function saisir(id, champ, valeur) {
    if (!brouillons[id]) { brouillons[id] = {}; basesBrouillons[id] = (parId(id) || {}).updated_at || ''; }
    brouillons[id][champ] = valeur;
    memoriserBrouillons();
    var k = id + '|' + champ;
    clearTimeout(minuteries[k]);
    minuteries[k] = setTimeout(function () { enregistrer(id, champ); }, DELAI_SAISIE);
    majEtatSaisie();
  }

  /* Un enregistrement refusé alors que sa fiche n'est plus à l'écran passerait inaperçu : on le dit une fois,
     et on réessaie tout seul. */
  function signalerEchec(id, k) {
    if (!signales[k] && !(id === etat.courant && monte() && etat.sousVue === 'appeler')) {
      signales[k] = true;
      var p = parId(id);
      toast('Note de «\u00a0' + (p ? p.nom : 'ce prospect') + '\u00a0» non enregistrée', { type: 'erreur', action: 'Réessayer', surAction: function () { viderSaisies(); } });
    }
    clearTimeout(relance);
    relance = setTimeout(function () { relance = null; viderSaisies(); }, delaiRelance);
    delaiRelance = Math.min(DELAI_RELANCE_MAX, delaiRelance * 2);
  }

  /* Envoie le brouillon d'un champ. Un seul envoi à la fois par champ : ce qui est tapé pendant l'envoi
     part juste après. En cas d'échec le brouillon reste, rien n'est perdu. `urgent` : la page se ferme,
     l'envoi doit lui survivre. */
  function enregistrer(id, champ, urgent) {
    var k = id + '|' + champ;
    clearTimeout(minuteries[k]);
    delete minuteries[k];
    var b = brouillons[id];
    if (!b || !(champ in b)) return;
    if (envois[k]) { aRenvoyer[k] = true; return; }
    var p = parId(id), valeur = b[champ];
    function oublier() {
      if (brouillons[id] && brouillons[id][champ] === valeur && !enSaisie(id, champ)) {
        delete brouillons[id][champ];
        if (!Object.keys(brouillons[id]).length) { delete brouillons[id]; delete basesBrouillons[id]; }
      }
      memoriserBrouillons();
    }
    if (!p || (p[champ] || '') === valeur.trim()) {
      if (!p) { delete brouillons[id]; delete basesBrouillons[id]; memoriserBrouillons(); } else oublier();
      delete erreursSaisie[k];
      delete signales[k];
      majEtatSaisie();
      return;
    }
    var champs = {};
    champs[champ] = valeur;
    envois[k] = CRM.majProspect(id, champs, { keepalive: !!urgent }).then(function () {
      delete erreursSaisie[k];
      delete signales[k];
      delaiRelance = DELAI_RELANCE;
      enregistres[id] = true;
      // Le brouillon qui resterait (champ encore en saisie) repose désormais sur la version enregistrée.
      if (brouillons[id]) basesBrouillons[id] = (parId(id) || {}).updated_at || '';
      oublier();
    }, function (e) {
      erreursSaisie[k] = (e && e.message) || 'connexion impossible';
      signalerEchec(id, k);
    }).then(function () {
      delete envois[k];
      if (aRenvoyer[k]) { delete aRenvoyer[k]; enregistrer(id, champ); }
      majEtatSaisie();
    });
    majEtatSaisie();
  }

  /* Envoie tout de suite ce qui attendait la fin de la pause (changement de fiche, d'onglet, page masquée). */
  function viderSaisies(urgent) {
    urgent = urgent === true;
    Object.keys(brouillons).forEach(function (id) {
      Object.keys(brouillons[id] || {}).forEach(function (champ) { enregistrer(id, champ, urgent); });
    });
  }

  // ───────────────────────────── Navigation dans la file ─────────────────────────────

  function annulerAvance() { clearTimeout(avance); avance = null; }

  function montrerCarte() {
    var carte = document.getElementById('crmProCarte');
    if (!carte) return;
    var r = carte.getBoundingClientRect();
    if (r.top < 60 || r.top > window.innerHeight * 0.5) carte.scrollIntoView({ block: 'start' });
  }

  function aller(id, opts) {
    opts = opts || {};
    annulerAvance();
    viderSaisies();
    etat.courant = id;
    memoriserPosition();
    rendre();
    var p = courant(), annonce = document.getElementById('crmProAnnonce');
    if (p && annonce) annonce.textContent = 'Fiche ' + (base().indexOf(p) + 1) + ' sur ' + base().length + ' : ' + p.nom;
    if (opts.remonter) montrerCarte();
  }

  /* « Suivant à appeler » : le prochain prospect sans résultat, en boucle, dans le département filtré.
     Quand le filtre montre des prospects déjà appelés (rappels du jour, intéressés…), on parcourt ce filtre. */
  function suivant(opts) {
    opts = opts || {};
    var liste = base(), n = liste.length, p = courant();
    if (!n) return;
    var i = Math.max(0, liste.indexOf(p));
    var critere = filtreCible() ? dansFiltre : function (x) { return !x.resultat && dansDepartement(x); };
    for (var k = 1; k < n; k++) {
      var x = liste[(i + k) % n];
      if (critere(x)) { aller(x.id, { remonter: true }); return; }
    }
    // Passage automatique sans suite possible : on reste sur la fiche, la notification « Annuler » reste visible.
    if (opts.auto) return;
    if (filtreCible()) { toast('Aucune autre fiche dans ce filtre.'); return; }
    if (p && critere(p)) { toast('C\'est la dernière fiche à appeler de cette liste.'); return; }
    toast('Tous les commerces de cette liste ont un résultat.');
    if (n > 1) aller(liste[(i + 1) % n].id, { remonter: true });
  }

  function precedent() {
    var liste = base(), n = liste.length;
    if (n < 2) return;
    var i = Math.max(0, liste.indexOf(courant()));
    if (filtreCible()) {
      for (var k = 1; k < n; k++) {
        var x = liste[(i - k + n) % n];
        if (dansFiltre(x)) { aller(x.id, { remonter: true }); return; }
      }
      return;
    }
    aller(liste[(i - 1 + n) % n].id, { remonter: true });
  }

  /* Un toucher pose le résultat, un second sur le même l'efface. Quand l'appel n'a rien donné, on passe
     tout seul au suivant, avec un « Annuler » pour le pouce qui a glissé. */
  function choisirResultat(resultat) {
    var p = courant();
    if (!p) return;
    // Double toucher : le second arrive pendant le passage au suivant et effacerait le résultat à peine posé.
    if (avance && p.resultat === resultat) return;
    annulerAvance();
    var id = p.id, nouveau = p.resultat === resultat ? null : resultat, def = resultatDe(nouveau);
    // Résultat effacé : une notification « … : fiche suivante » encore affichée dirait le contraire.
    if (nouveau === null && window.crmToast.masquer) window.crmToast.masquer();
    var promesse = CRM.resultatProspect(id, nouveau);
    promesse.then(null, function (e) {
      annulerAvance();
      erreur(e, 'Le résultat n\'a pas pu être enregistré.');
      // Si l'on était déjà passé au suivant, on revient sur la fiche dont le résultat a été refusé.
      if (parId(id) && etat.courant !== id) aller(id, { remonter: true });
    });
    if (!def || !def.suivant) return;
    toast(def.libelle + ' : fiche suivante', {
      action: 'Annuler',
      surAction: function () {
        annulerAvance();
        promesse.then(function () { return CRM.resultatProspect(id, null); }).then(function () {
          if (parId(id)) aller(id, { remonter: true });
        }, erreur);
      }
    });
    avance = setTimeout(function () {
      avance = null;
      if (etat.courant === id && etat.sousVue === 'appeler') suivant({ auto: true });
    }, DELAI_AVANCE);
  }

  function poserRappel(date) {
    var p = courant();
    if (!p) return;
    CRM.majProspect(p.id, { rappel_le: date || null }).then(function () {
      if (date) toast('Rappel prévu ' + UI.dateAvecJour(date));
    }, erreur);
  }

  function enregistrerNumero() {
    var p = courant();
    if (!p) return;
    var saisi = etat.numero.id === p.id ? etat.numero.valeur.trim() : '';
    if (!pur.telFrancais(saisi)) {
      toast('Ce numéro n\'a pas la forme d\'un numéro français à 10 chiffres.', { type: 'erreur' });
      var champ = document.getElementById('crmProNumero');
      if (champ) champ.focus();
      return;
    }
    CRM.majProspect(p.id, { telephone: saisi }).then(function () {
      etat.numero = { id: null, valeur: '' };
      toast('Numéro enregistré');
    }, erreur);
  }

  function ouvrirFicheCrm(id) {
    viderSaisies();
    if (CRM.fiche('p:' + id) && typeof window.crmOuvrirFiche === 'function') window.crmOuvrirFiche('p:' + id);
    else toast('Ce prospect n\'a pas encore de fiche dans le pipeline.', { type: 'erreur' });
  }

  function copierRecap(nom) {
    var cible = nom != null ? nom : etat.liste;
    var prospects = cible ? tous().filter(function (p) { return nomListeDe(p) === cible; }) : tous();
    UI.copier(CRM.recapProspection(prospects, cible || 'Prospection'), 'Récap copié');
  }

  /* Ouvre la fiche d'appel sur un prospect précis, quelle que soit la vue d'où l'on vient. */
  function ouvrirDansAppeler(id) {
    var p = parId(id);
    if (!p) return;
    if (etat.liste && nomListeDe(p) !== etat.liste) etat.liste = nomListeDe(p);
    etat.filtreResultat = 'tous';
    etat.filtreDep = '';
    etat.courant = id;
    changerSousVue('appeler');
    memoriserPosition();
    window.scrollTo({ top: 0 });
  }

  function commencer(nom) {
    etat.liste = tous().some(function (p) { return nomListeDe(p) === nom; }) ? nom : '';
    etat.filtreResultat = 'tous';
    etat.filtreDep = '';
    etat.courant = null;
    var premier = base().filter(function (p) { return !p.resultat; })[0];
    if (premier) etat.courant = premier.id;
    changerSousVue('appeler');
    memoriserPosition();
    window.scrollTo({ top: 0 });
  }

  function changerSousVue(id) {
    annulerAvance();
    viderSaisies();
    fermerSuggestions();
    etat.sousVue = id;
    // replaceState ne déclenche ni popstate ni hashchange : crm-vues.js ne redessine pas la vue pour autant.
    if (/^#crm\/prospection(\/|$)/.test(location.hash) && !/^#crm\/prospection\/[calp](:|%3A)/i.test(location.hash)) {
      history.replaceState(history.state, '', '#crm/prospection' + (id === 'appeler' ? '' : '/' + id));
    }
    rendre();
  }

  // ───────────────────────────── Sous-onglet « Trouver des numéros » ─────────────────────────────

  function metiersCoches() {
    return CRM.METIERS_OSM.filter(function (m) { return etat.rech.metiers[m.id]; }).map(function (m) { return m.id; });
  }

  /* La zone à chercher, ou null tant que le formulaire est incomplet. */
  function zoneRecherche() {
    var r = etat.rech;
    if (r.mode === 'commune') {
      if (!r.commune) return null;
      return { niveau: 'commune', code: r.commune.code, commune: r.commune.nom, court: r.commune.nom, libelle: 'à ' + r.commune.nom };
    }
    if (!r.departement) return null;
    var nom = CRM.nomDepartement(r.departement);
    return { niveau: 'departement', code: r.departement, commune: '', court: nom, libelle: 'dans le ' + r.departement + ' (' + nom + ')' };
  }

  function motifBlocage() {
    if (!zoneRecherche()) return etat.rech.mode === 'commune' ? 'Choisissez une commune dans la liste proposée.' : 'Choisissez un département.';
    if (!metiersCoches().length) return 'Cochez au moins un métier.';
    return '';
  }

  function caseHtml(champ, id, libelle, cochee) {
    return '<label class="crm-pro-case"><input type="checkbox" id="crmPro-' + champ + '-' + id + '" data-champ="' + champ + '" data-id="' + id + '"' +
      (cochee ? ' checked' : '') + '><span>' + esc(libelle) + '</span></label>';
  }

  function htmlFormRecherche() {
    var r = etat.rech, cours = r.phase === 'cours', blocage = motifBlocage();
    var ou;
    if (r.mode === 'commune') {
      ou = '<div class="crm-pro-combo">' + ic(r.commune ? 'coche' : 'lieu', 16) +
        '<input type="text" id="crmProCommune" data-champ="commune" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="crmProSuggestions" ' +
          'autocomplete="off" spellcheck="false" value="' + esc(r.saisie) + '" placeholder="Nom de la commune" aria-label="Commune">' +
        '<div id="crmProSuggestions"></div></div>';
    } else {
      ou = '<select class="crm-pro-select" id="crmProDepartement" data-champ="departement" aria-label="Département"><option value="">Choisir un département</option>' +
        CRM.DEPARTEMENTS.map(function (d) {
          return '<option value="' + d.code + '"' + (r.departement === d.code ? ' selected' : '') + '>' + esc(d.code + ' ' + d.nom) + '</option>';
        }).join('') + '</select>';
    }
    return '<h2 class="crm-pro-titre">Trouver des commerces à appeler</h2>' +
      '<p class="crm-aide">Les commerces dont le téléphone est renseigné dans OpenStreetMap, sans quitter le CRM.</p>' +
      '<div class="crm-pro-form">' +
        '<fieldset><legend>Où</legend><div class="crm-pro-segment" role="group" aria-label="Chercher par">' +
          '<button type="button" id="crmProMode-commune" data-pro="mode" data-id="commune" aria-pressed="' + (r.mode === 'commune') + '">Commune</button>' +
          '<button type="button" id="crmProMode-departement" data-pro="mode" data-id="departement" aria-pressed="' + (r.mode === 'departement') + '">Département</button></div>' + ou + '</fieldset>' +
        '<fieldset><legend>Métiers</legend><div class="crm-pro-cases">' + CRM.METIERS_OSM.map(function (m) {
          return caseHtml('metier', m.id, m.libelle, r.metiers[m.id]);
        }).join('') + '</div></fieldset>' +
        '<fieldset><legend>Options</legend><div class="crm-pro-cases crm-pro-cases-larges">' +
          caseHtml('option', 'mobile', 'Numéros mobiles seulement (06 / 07)', r.mobile) +
          caseHtml('option', 'sansSite', 'Sans site internet connu', r.sansSite) +
          caseHtml('option', 'sansEnseigne', 'Masquer les enseignes (chaînes)', r.sansEnseigne) + '</div></fieldset>' +
        '<div class="crm-pro-form-pied"><button type="button" class="crm-btn crm-btn-plein crm-pro-chercher" id="crmProChercher" data-pro="chercher"' +
          (blocage || cours ? ' disabled' : '') + '>' + ic('recherche', 15) + 'Chercher</button>' +
          '<p class="crm-aide" id="crmProBlocage">' + esc(cours ? '' : blocage) + '</p></div>' +
      '</div>';
  }

  function htmlSuggestions() {
    if (!communes.ouvert) return '';
    if (!communes.liste.length) return communes.message ? '<p class="crm-pro-suggestions crm-pro-suggestions-msg">' + esc(communes.message) + '</p>' : '';
    return '<ul class="crm-pro-suggestions" role="listbox" id="crmProListeCommunes" aria-label="Communes proposées">' + communes.liste.map(function (c, i) {
      var cp = c.codesPostaux[0] || '';
      return '<li role="option" id="crmProCommune-' + i + '" data-pro="commune" data-id="' + i + '" aria-selected="' + (i === communes.actif) + '">' +
        '<span>' + esc(c.nom) + '</span><small>' + esc([cp, CRM.nomDepartement(c.codeDepartement) || c.codeDepartement].filter(Boolean).join(' · ')) + '</small></li>';
    }).join('') + '</ul>';
  }

  function majSuggestions() {
    poser('crmProSuggestions', htmlSuggestions());
    var champ = document.getElementById('crmProCommune');
    if (!champ) return;
    var ouvert = communes.ouvert && communes.liste.length > 0;
    champ.setAttribute('aria-expanded', String(ouvert));
    if (ouvert && communes.actif >= 0) champ.setAttribute('aria-activedescendant', 'crmProCommune-' + communes.actif);
    else champ.removeAttribute('aria-activedescendant');
  }

  function fermerSuggestions() {
    clearTimeout(communes.minuterie);
    if (communes.controleur) communes.controleur.abort();
    communes.controleur = null;
    communes.jeton++;
    communes.ouvert = false;
    majSuggestions();
  }

  function majBlocage() {
    var bouton = document.getElementById('crmProChercher'), aide = document.getElementById('crmProBlocage');
    var blocage = motifBlocage(), cours = etat.rech.phase === 'cours';
    if (bouton) bouton.disabled = !!blocage || cours;
    if (aide) aide.textContent = cours ? '' : blocage;
  }

  function saisirCommune(valeur) {
    var r = etat.rech;
    r.saisie = valeur;
    r.commune = null;
    clearTimeout(communes.minuterie);
    if (communes.controleur) communes.controleur.abort();
    communes.controleur = null;
    var jeton = ++communes.jeton;
    majBlocage();
    if (valeur.trim().length < 2) { communes.liste = []; communes.ouvert = false; majSuggestions(); return; }
    communes.minuterie = setTimeout(function () {
      var controleur = typeof AbortController !== 'undefined' ? new AbortController() : null;
      communes.controleur = controleur;
      CRM.chercherCommunes(valeur, controleur ? controleur.signal : undefined).then(function (liste) {
        if (jeton !== communes.jeton) return;
        communes.liste = liste;
        communes.actif = liste.length ? 0 : -1;
        communes.message = liste.length ? '' : 'Aucune commune de ce nom.';
        communes.ouvert = true;
        majSuggestions();
      }, function (e) {
        if (jeton !== communes.jeton || (e && e.name === 'AbortError')) return;
        communes.liste = [];
        communes.message = 'La recherche de communes ne répond pas. Réessayez, ou cherchez par département.';
        communes.ouvert = true;
        majSuggestions();
      });
    }, DELAI_COMMUNES);
  }

  function choisirCommune(i) {
    var c = communes.liste[i], r = etat.rech;
    if (!c) return;
    r.commune = c;
    r.saisie = c.nom + (c.codesPostaux[0] ? ' (' + c.codesPostaux[0] + ')' : '');
    fermerSuggestions();
    rendre();
    var bouton = document.getElementById('crmProChercher');
    if (bouton && !bouton.disabled) bouton.focus();
  }

  function nomListeProposee(zone) {
    var d = CRM.horloge();
    return (zone.court + ' ' + MOIS[d.getMonth()] + ' ' + d.getFullYear()).slice(0, 80);
  }

  function arreterChrono() { clearInterval(chrono); chrono = null; }

  function lancerRecherche() {
    var r = etat.rech, zone = zoneRecherche();
    if (!zone || !metiersCoches().length || r.phase === 'cours') return;
    fermerSuggestions();
    var controleur = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var jeton = ++r.jeton;
    r.controleur = controleur;
    r.phase = 'cours';
    r.debut = Date.now();
    r.zone = zone;
    r.criteres = { mobile: r.mobile, sansSite: r.sansSite };
    r.resultats = [];
    r.selection = new Set();
    r.ajout = null;
    r.erreur = '';
    arreterChrono();
    chrono = setInterval(function () {
      var el = document.getElementById('crmProChrono');
      if (el) el.textContent = Math.round((Date.now() - r.debut) / 1000) + ' s';
    }, 1000);
    rendre();
    CRM.chercherOsm({
      niveau: zone.niveau, code: zone.code, metiers: metiersCoches(),
      options: { mobile: r.mobile, sansSite: r.sansSite, sansEnseigne: r.sansEnseigne, commune: zone.commune },
      signal: controleur ? controleur.signal : undefined
    }).then(function (reponse) {
      if (jeton !== r.jeton) return;
      r.phase = 'fait';
      r.resultats = reponse.prospects;
      r.total = reponse.total;
      r.tronque = reponse.tronque;
      r.limite = PAS_RESULTATS;
      r.resultats.forEach(function (p, i) { if (!p.dejaConnu) r.selection.add(i); });
      if (!r.nomListePerso) r.nomListe = nomListeProposee(zone);
    }, function (e) {
      if (jeton !== r.jeton) return;
      if (e && e.name === 'AbortError') { r.phase = 'repos'; return; }
      r.phase = 'erreur';
      r.erreur = (e && e.message) || 'OpenStreetMap ne répond pas pour l\'instant, réessayez dans une minute.';
    }).then(function () {
      if (jeton !== r.jeton) return;
      r.controleur = null;
      arreterChrono();
      rendre();
    });
  }

  function annulerRecherche() {
    var r = etat.rech;
    if (r.phase !== 'cours') return;
    if (r.controleur) r.controleur.abort();
    else { r.jeton++; r.phase = 'repos'; arreterChrono(); rendre(); }
  }

  /* Après un ajout, les lignes ajoutées deviennent « Déjà dans la file » sans relancer la recherche. */
  function marquerConnus() {
    var connus = CRM.dejaConnus(), r = etat.rech;
    r.resultats.forEach(function (p, i) {
      if (p.dejaConnu) return;
      var dansFile = connus.telephones.has(p.telephone) || connus.refs.has(p.source_ref);
      if (!dansFile && !connus.crm.has(p.telephone)) return;
      p.dejaConnu = true;
      p.libelleDejaConnu = dansFile ? 'Déjà dans la file' : 'Déjà client ou en démo';
      r.selection.delete(i);
    });
  }

  function ajouterSelection() {
    var r = etat.rech;
    if (r.envoi || !actif()) return;
    var nom = r.nomListe.trim() || LISTE_DEFAUT;
    var lignes = r.resultats.filter(function (p, i) { return r.selection.has(i) && !p.dejaConnu; })
      .map(function (p) { return Object.assign({}, p, { liste: nom }); });
    if (!lignes.length) return;
    r.envoi = true;
    rendre();
    CRM.ajouterProspects(lignes).then(function (res) {
      r.ajout = { nb: res.ajoutes, doublons: res.doublons, liste: nom };
      if (res.ajoutes) {
        toast(UI.pluriel(res.ajoutes, 'prospect ajouté', 'prospects ajoutés') + (res.doublons ? ', ' + res.doublons + ' déjà connu' + (res.doublons > 1 ? 's' : '') : ''),
          { action: 'Commencer à appeler', surAction: function () { commencer(nom); } });
      } else toast('Rien de nouveau : ces commerces étaient déjà connus.');
    }, erreur).then(function () {
      r.envoi = false;
      marquerConnus();
      rendre();
    });
  }

  function htmlAttenteRecherche() {
    var r = etat.rech;
    var ligne = '<div class="crm-ligne crm-ligne-attente"><span class="crm-sq crm-sq-pastille"></span>' +
      '<span class="crm-sq-pile"><span class="crm-sq crm-sq-long"></span><span class="crm-sq crm-sq-moyen"></span></span></div>';
    return '<div class="crm-pro-attente" role="status"><div><p class="crm-pro-attente-titre">Recherche ' + esc(r.zone.libelle) + '… <span id="crmProChrono"></span></p>' +
        '<p class="crm-aide">' + (r.zone.niveau === 'departement' ? 'Sur un département entier, la réponse peut prendre 20 à 40 secondes.' : 'Quelques secondes suffisent en général pour une commune.') + '</p></div>' +
      '<button type="button" class="crm-btn" data-pro="recherche-annuler">Annuler</button></div>' +
      '<div class="crm-liste" aria-hidden="true">' + [ligne, ligne, ligne, ligne].join('') + '</div>';
  }

  function htmlResume() {
    var r = etat.rech, n = r.resultats.length;
    var connus = r.resultats.filter(function (p) { return p.dejaConnu; }).length;
    var phrase = UI.pluriel(n, 'commerce') + ' avec un numéro ' + (r.criteres.mobile ? 'mobile' : 'de téléphone') +
      (r.criteres.sansSite ? ', sans site connu' : '') + ', ' + r.zone.libelle;
    return '<div class="crm-pro-resume"><p class="crm-pro-resume-titre">' + esc(phrase) + '</p>' +
      (connus ? '<p class="crm-aide">Dont ' + connus + ' déjà ' + (connus > 1 ? 'connus' : 'connu') + ', non sélectionnable' + (connus > 1 ? 's' : '') + '.</p>' : '') +
      (r.tronque ? '<p class="crm-pro-alerte">' + ic('alerte', 14) + 'OpenStreetMap a renvoyé le maximum de 2 000 commerces : la liste est incomplète. Cherchez plutôt commune par commune.</p>' : '') + '</div>';
  }

  function htmlResultats() {
    var r = etat.rech;
    var mention = '<p class="crm-pro-mention">Données © contributeurs OpenStreetMap. « Sans site connu » veut dire qu\'aucun site n\'est renseigné dans la source : vérifiez avant d\'appeler.</p>';
    if (r.phase === 'cours') return htmlAttenteRecherche();
    if (r.phase === 'erreur') {
      return '<div class="crm-vide"><span class="crm-vide-ic">' + ic('alerte', 22) + '</span><p class="crm-vide-titre">La recherche n\'a pas abouti</p>' +
        '<p class="crm-vide-texte">' + esc(r.erreur) + '</p><button type="button" class="crm-btn" data-pro="chercher">' + ic('actualiser', 14) + 'Réessayer</button></div>';
    }
    if (r.phase !== 'fait') {
      return '<div class="crm-vide crm-pro-vide-discret"><span class="crm-vide-ic">' + ic('lieu', 22) + '</span><p class="crm-vide-titre">Choisissez où chercher</p>' +
        '<p class="crm-vide-texte">Une commune pour une tournée d\'appels ciblée, un département pour constituer une grande liste. Les commerces déjà dans votre file ou déjà clients sont repérés.</p></div>' + mention;
    }
    if (!r.resultats.length) {
      var pistes = [];
      if (r.criteres.mobile) pistes.push('« Numéros mobiles seulement »');
      if (r.criteres.sansSite) pistes.push('« Sans site internet connu »');
      return '<div class="crm-vide"><span class="crm-vide-ic">' + ic('recherche', 22) + '</span><p class="crm-vide-titre">Aucun commerce ne correspond ' + esc(r.zone.libelle) + '</p>' +
        '<p class="crm-vide-texte">' + (r.total ? 'OpenStreetMap en connaît ' + r.total + ' avec un téléphone ici, mais aucun ne passe vos critères. ' : '') +
        (pistes.length ? 'Essayez de décocher ' + esc(pistes.join(' ou ')) + '.' : 'Essayez d\'autres métiers ou une zone plus large.') + '</p></div>' + mention;
    }

    var selectionnables = r.resultats.filter(function (p) { return !p.dejaConnu; }).length;
    var nb = r.selection.size;
    var html = htmlResume();
    if (r.ajout && r.ajout.nb) {
      html += '<div class="crm-pro-ajoute" role="status"><p>' + ic('coche', 15) + '<span><b>' + esc(UI.pluriel(r.ajout.nb, 'prospect ajouté', 'prospects ajoutés')) + '</b> à « ' + esc(r.ajout.liste) + ' ».</span></p>' +
        '<button type="button" class="crm-btn crm-btn-plein" data-pro="commencer">' + ic('telephone', 14) + 'Commencer à appeler</button></div>';
    }
    if (selectionnables) {
      html += '<div class="crm-pro-selection"><p>' + nb + ' sur ' + selectionnables + ' ' + (nb > 1 ? 'sélectionnés' : 'sélectionné') + '</p>' +
        '<button type="button" class="crm-lien" data-pro="tout-cocher" id="crmProToutCocher">' + (nb === selectionnables ? 'Tout décocher' : 'Tout cocher') + '</button></div>';
    }
    html += '<div class="crm-liste crm-pro-trouves">' + r.resultats.slice(0, r.limite).map(function (p, i) {
      var detail = [p.metier, p.adresse, p.commune].filter(Boolean).join(' · ');
      return '<div class="crm-pro-trouve' + (p.dejaConnu ? ' crm-pro-trouve-connu' : '') + '">' +
        '<label class="crm-pro-trouve-corps"><input type="checkbox" id="crmProSel-' + i + '" data-champ="selection" data-id="' + i + '"' +
          (r.selection.has(i) ? ' checked' : '') + (p.dejaConnu ? ' disabled' : '') + '>' +
          '<span class="crm-pro-trouve-txt"><b>' + esc(p.nom) + '</b><small>' + esc(detail) + '</small></span>' +
          '<span class="crm-pro-trouve-tel">' + esc(pur.formaterTel(p.telephone)) + htmlReseauxTrouves(p) + (p.dejaConnu ? '<em>' + esc(p.libelleDejaConnu || 'Déjà connu') + '</em>' : '') + '</span></label>' +
        lienExterne(lienGoogle(p), '<span>Vérifier</span>', 'crm-btn crm-btn-discret crm-pro-verifier') + '</div>';
    }).join('') + '</div>';
    if (r.resultats.length > r.limite) {
      html += '<button type="button" class="crm-btn crm-plus" data-pro="resultats-plus">Afficher ' + Math.min(PAS_RESULTATS, r.resultats.length - r.limite) + ' commerces de plus</button>';
    }

    var inactif = !actif() ? ' disabled title="Inactif tant que la migration des prospects n\'est pas appliquée"' : (!nb || r.envoi ? ' disabled' : '');
    html += '<div class="crm-pro-ajout-barre">' +
      '<label class="crm-pro-champ"><span>Ajouter à la liste</span>' +
        '<input type="text" id="crmProNomListe" data-champ="nom-liste" list="crmProListesConnues" maxlength="80" autocomplete="off" value="' + esc(r.nomListe) + '" placeholder="Nom de la campagne"></label>' +
      '<datalist id="crmProListesConnues">' + listes().map(function (l) { return '<option value="' + esc(l.nom) + '"></option>'; }).join('') + '</datalist>' +
      '<button type="button" class="crm-btn crm-btn-plein crm-pro-ajouter" data-pro="ajouter-file" id="crmProAjouter"' + inactif + '>' + ic('plus', 15) +
        (r.envoi ? 'Ajout en cours…' : 'Ajouter ' + UI.pluriel(nb, 'prospect') + ' à la file') + '</button></div>';
    return html + mention;
  }

  function rendreTrouver() {
    poser('crmProRecherche', htmlFormRecherche());
    majSuggestions();
    poser('crmProResultats', htmlResultats());
  }

  // ───────────────────────────── Sous-onglet « Liste » ─────────────────────────────

  function filtresGestion() {
    var g = etat.gestion;
    var mots = pur.sansAccents(g.recherche).split(/\s+/).filter(Boolean);
    var chiffres = g.recherche.replace(/\D/g, '');
    return tous().filter(function (p) {
      if (g.liste && nomListeDe(p) !== g.liste) return false;
      if (g.dep && p.departement !== g.dep) return false;
      if (g.resultat === 'a_appeler' ? !!p.resultat : (g.resultat && p.resultat !== g.resultat)) return false;
      if (!mots.length) return true;
      var botte = pur.sansAccents([p.nom, p.metier, p.commune, p.code_postal, nomListeDe(p), p.remarque].join(' '));
      if (mots.every(function (m) { return botte.indexOf(m) >= 0; })) return true;
      return chiffres.length >= 4 && String(p.telephone || '').indexOf(chiffres) >= 0;
    });
  }

  function attrActif() { return actif() ? '' : ' disabled title="Inactif tant que la migration des prospects n\'est pas appliquée"'; }

  function htmlGestionOutils() {
    var g = etat.gestion, deps = [];
    tous().forEach(function (p) { if (p.departement && deps.indexOf(p.departement) < 0) deps.push(p.departement); });
    deps.sort();
    function option(valeur, libelle, choisie) { return '<option value="' + esc(valeur) + '"' + (choisie === valeur ? ' selected' : '') + '>' + esc(libelle) + '</option>'; }
    return '<div class="crm-pro-gestion-tete">' +
        '<div class="crm-pro-rangee"><button type="button" class="crm-btn crm-btn-or" data-pro="ouvrir-ajout" aria-expanded="' + (g.panneau === 'ajout') + '"' + attrActif() + '>' + ic('plus', 14) + 'Ajouter un prospect</button>' +
          '<button type="button" class="crm-btn" data-pro="ouvrir-import" aria-expanded="' + (g.panneau === 'import') + '"' + attrActif() + '>' + ic('importer', 14) + 'Importer une liste</button></div>' +
        '<div class="crm-pro-cherche">' + ic('recherche', 15) +
          '<input type="search" id="crmProCherche" data-champ="g-recherche" value="' + esc(g.recherche) + '" placeholder="Nom, commune, numéro" aria-label="Chercher un prospect" autocomplete="off" spellcheck="false"></div>' +
      '</div>' +
      '<div class="crm-pro-filtres crm-pro-filtres-gestion">' +
        '<select id="crmProGListe" data-champ="g-liste" aria-label="Filtrer par liste">' + option('', 'Toutes les listes', g.liste) +
          listes().map(function (l) { return option(l.nom, l.nom, g.liste); }).join('') + '</select>' +
        '<select id="crmProGResultat" data-champ="g-resultat" aria-label="Filtrer par résultat">' + option('', 'Tous les résultats', g.resultat) + option('a_appeler', 'Pas encore appelés', g.resultat) +
          CRM.RESULTATS_PROSPECT.map(function (r) { return option(r.id, r.libelle, g.resultat); }).join('') + '</select>' +
        '<select id="crmProGDep" data-champ="g-dep" aria-label="Filtrer par département">' + option('', 'Tous les départements', g.dep) +
          deps.map(function (d) { return option(d, d + ' ' + CRM.nomDepartement(d), g.dep); }).join('') + '</select>' +
      '</div>';
  }

  function champForm(id, champ, libelle, valeur, attributs) {
    return '<label class="crm-pro-champ"><span>' + esc(libelle) + '</span><input id="' + id + '" data-champ="' + champ + '" value="' + esc(valeur) + '" autocomplete="off" ' + (attributs || 'type="text"') + '></label>';
  }

  function listeParDefaut() { return etat.gestion.liste || etat.liste || (listes()[0] && listes()[listes().length - 1].nom) || LISTE_DEFAUT; }

  function htmlApercuImport() {
    var imp = etat.gestion.importation;
    if (!imp.texte.trim()) return '<p class="crm-aide">Collez vos lignes : l\'aperçu s\'affiche ici avant tout ajout.</p>';
    var analyse = pur.analyserImport(imp.texte, CRM.dejaConnus());
    var n = analyse.lignes.length, m = analyse.ignorees.length;
    var html = '<p class="crm-pro-apercu-titre"><b>' + UI.pluriel(n, 'ligne valide', 'lignes valides') + '</b>' +
      (m ? ', ' + UI.pluriel(m, 'ignorée', 'ignorées') : '') + '</p>';
    if (n) {
      // Ce qui sera créé, tel que lu : une colonne mal placée se voit ici, pas après l'ajout.
      html += '<ul class="crm-pro-apercu-lignes" aria-label="Premiers prospects lus">' + analyse.lignes.slice(0, 3).map(function (l) {
        var suite = [l.metier, l.commune, l.telephone ? pur.formaterTel(l.telephone) : 'sans numéro'].filter(Boolean).join(' · ');
        return '<li><b>' + esc(l.nom) + '</b><small>' + esc(suite) + '</small></li>';
      }).join('') + (n > 3 ? '<li><small>… et ' + (n - 3) + ' de plus</small></li>' : '') + '</ul>';
    }
    if (m) {
      html += '<ul class="crm-pro-ignorees">' + analyse.ignorees.slice(0, 5).map(function (l) {
        return '<li><span>Ligne ' + l.numero + ' : ' + esc(RAISONS_IMPORT[l.raison] || l.raison) + '</span><small>' + esc(l.texte) + '</small></li>';
      }).join('') + (m > 5 ? '<li><span>… et ' + (m - 5) + ' de plus</span></li>' : '') + '</ul>';
    }
    return html;
  }

  function nbImportables() {
    var texte = etat.gestion.importation.texte;
    return texte.trim() ? pur.analyserImport(texte, CRM.dejaConnus()).lignes.length : 0;
  }

  function htmlPanneau() {
    var g = etat.gestion;
    var datalist = '<datalist id="crmProListesGestion">' + listes().map(function (l) { return '<option value="' + esc(l.nom) + '"></option>'; }).join('') + '</datalist>';
    var fermer = '<button type="button" class="crm-icone-btn" data-pro="panneau-fermer" aria-label="Fermer">' + ic('croix', 16) + '</button>';
    if (g.panneau === 'ajout') {
      var a = g.ajout;
      return '<div class="crm-pro-bloc crm-pro-panneau"><div class="crm-pro-panneau-tete"><h2 class="crm-pro-titre">Ajouter un prospect</h2>' + fermer + '</div>' +
        '<div class="crm-pro-grille">' +
          champForm('crmProAjoutNom', 'ajout-nom', 'Nom du commerce', a.nom, 'type="text" maxlength="200" required') +
          champForm('crmProAjoutMetier', 'ajout-metier', 'Métier', a.metier, 'type="text" maxlength="80" placeholder="Boulangerie, primeur…"') +
          champForm('crmProAjoutCommune', 'ajout-commune', 'Commune', a.commune, 'type="text" maxlength="120"') +
          champForm('crmProAjoutTel', 'ajout-telephone', 'Téléphone', a.telephone, 'type="tel" inputmode="tel" placeholder="06 12 34 56 78"') +
          champForm('crmProAjoutRemarque', 'ajout-remarque', 'Remarque', a.remarque, 'type="text" maxlength="500" placeholder="Facultatif"') +
          champForm('crmProAjoutListe', 'ajout-liste', 'Liste', a.liste, 'type="text" maxlength="80" list="crmProListesGestion"') +
        '</div>' + datalist +
        (g.erreurAjout ? '<p class="crm-pro-alerte" role="alert">' + ic('alerte', 14) + esc(g.erreurAjout) + '</p>' : '') +
        '<div class="crm-pro-panneau-pied"><button type="button" class="crm-btn crm-btn-plein" data-pro="ajout-valider" id="crmProAjoutValider"' + (g.envoi ? ' disabled' : '') + '>' + ic('plus', 14) + 'Ajouter à la file</button></div></div>';
    }
    if (g.panneau === 'import') {
      var imp = g.importation;
      return '<div class="crm-pro-bloc crm-pro-panneau"><div class="crm-pro-panneau-tete"><h2 class="crm-pro-titre">Importer une liste</h2>' + fermer + '</div>' +
        '<p class="crm-aide">Une ligne par commerce, colonnes séparées par « | » ou par des points-virgules :</p>' +
        '<p class="crm-pro-format"><code>nom | métier | adresse | commune | département | téléphone | remarque</code></p>' +
        '<textarea id="crmProImportTexte" data-champ="import-texte" rows="7" spellcheck="false" aria-label="Lignes à importer" ' +
          'placeholder="Boucherie des Halles | Boucherie | 79 cours Gabriel Péri | 34400 Lunel | 34 | 06 00 00 00 00 | Fermé le lundi">' + esc(imp.texte) + '</textarea>' +
        '<div class="crm-pro-apercu" id="crmProApercu" aria-live="polite"></div>' +
        '<div class="crm-pro-panneau-pied">' + champForm('crmProImportListe', 'import-liste', 'Ajouter à la liste', imp.liste, 'type="text" maxlength="80" list="crmProListesGestion"') + datalist +
          '<button type="button" class="crm-btn crm-btn-plein" data-pro="import-valider" id="crmProImportValider"></button></div></div>';
    }
    return '';
  }

  /* L'aperçu et le bouton de l'import suivent la frappe sans redessiner la zone de texte. */
  function majApercuImport() {
    poser('crmProApercu', htmlApercuImport());
    var bouton = document.getElementById('crmProImportValider');
    if (!bouton) return;
    var n = nbImportables();
    var libelle = ic('importer', 14) + (etat.gestion.envoi ? 'Ajout en cours…' : 'Ajouter ' + UI.pluriel(n, 'prospect'));
    if (bouton.__html !== libelle) { bouton.__html = libelle; bouton.innerHTML = libelle; }
    bouton.disabled = !n || etat.gestion.envoi || !actif();
  }

  function htmlCampagnes() {
    var g = etat.gestion, toutes = listes();
    if (!toutes.length) return '';
    return '<h2 class="crm-pro-section">Listes d\'appels<span>' + toutes.length + '</span></h2><div class="crm-pro-campagnes">' + toutes.map(function (l) {
      var s = l.stats, pct = s.total ? Math.round(100 * s.appeles / s.total) : 0;
      var suites = [[s.par.rdv, 'démo'], [s.par.interesse, 'intéressé'], [s.par.a_rappeler, 'à rappeler', 'à rappeler']]
        .filter(function (x) { return x[0]; }).map(function (x) { return x[0] + ' ' + (x[0] > 1 ? (x[2] || x[1] + 's') : x[1]); }).join(' · ');
      var html = '<div class="crm-pro-campagne" data-liste="' + esc(l.nom) + '"><div class="crm-pro-campagne-tete"><b>' + esc(l.nom) + '</b>' +
          '<span>' + s.appeles + ' / ' + s.total + ' appelés</span></div>' +
        '<div class="crm-pro-progres crm-pro-progres-fin" role="progressbar" aria-label="Avancement de ' + esc(l.nom) + '" aria-valuemin="0" aria-valuemax="' + s.total + '" aria-valuenow="' + s.appeles + '"><i style="width:' + pct + '%"></i></div>' +
        '<p class="crm-pro-campagne-suites">' + esc(suites || 'Aucune suite pour l\'instant') + '</p>';
      if (g.suppression && g.suppression.liste === l.nom) {
        html += '<p class="crm-pro-campagne-msg" role="status">Suppression… ' + g.suppression.fait + ' / ' + g.suppression.total + '</p>';
      } else if (g.action && g.action.type === 'supprimer-liste' && g.action.liste === l.nom) {
        var pipeline = l.prospects.filter(function (p) { var r = resultatDe(p.resultat); return r && r.fiche; }).length;
        html += '<div class="crm-pro-confirmation" role="alertdialog" aria-label="Confirmer la suppression de la liste">' +
          '<p>Supprimer ' + (s.total > 1 ? 'les ' + s.total + ' prospects' : 'le prospect') + ' de «&nbsp;' + esc(l.nom) + '&nbsp;»&nbsp;? Résultats et notes d\'appel seront effacés.' +
          (pipeline ? ' ' + (pipeline > 1 ? pipeline + ' sont dans le pipeline : ils' : 'Un est dans le pipeline : il') + ' en sortir' + (pipeline > 1 ? 'ont' : 'a') + '.' : '') + '</p>' +
          '<div class="crm-pro-rangee"><button type="button" class="crm-btn crm-btn-danger" data-pro="liste-supprimer-confirmer" id="crmProConfirmerListe">' + ic('corbeille', 14) +
            'Supprimer ' + UI.pluriel(s.total, 'prospect') + '</button>' +
          '<button type="button" class="crm-btn" data-pro="action-annuler">Annuler</button></div></div>';
      } else {
        html += '<div class="crm-pro-rangee"><button type="button" class="crm-btn crm-btn-or" data-pro="liste-appeler">' + ic('telephone', 14) + 'Appeler</button>' +
          '<button type="button" class="crm-btn" data-pro="liste-recap">' + ic('copier', 14) + 'Récap</button>' +
          '<button type="button" class="crm-btn crm-btn-discret crm-pro-btn-suppr" data-pro="liste-supprimer"' + attrActif() + '>' + ic('corbeille', 14) + 'Supprimer la liste</button></div>';
      }
      return html + '</div>';
    }).join('') + '</div>';
  }

  function htmlRang(p) {
    var g = etat.gestion, tel = pur.telFrancais(p.telephone);
    var action = g.action && g.action.id === p.id ? g.action : null;
    var html = '<div class="crm-pro-rang" data-id="' + esc(p.id) + '"><div class="crm-pro-rang-ligne">' +
      '<button type="button" class="crm-pro-rang-corps crm-nav" data-pro="ouvrir-appel" title="Ouvrir dans « Appeler »">' +
        '<span class="crm-pro-rang-nom"><b>' + esc(p.nom) + '</b><small>' + esc([p.metier, lieuDe(p)].filter(Boolean).join(' · ') || 'Métier et commune inconnus') + '</small></span>' +
        '<span class="crm-pro-rang-tel">' + esc(tel ? pur.formaterTel(tel) : 'Numéro à trouver') + '</span>' +
        '<span class="crm-pro-rang-liste">' + esc(nomListeDe(p)) + '</span>' +
        '<span class="crm-pro-rang-res">' + (pastille(p, true) || '<span class="crm-pro-rang-rien">À appeler</span>') + '</span></button>' +
      '<div class="crm-pro-rang-actions">' +
        (tel ? '<a class="crm-icone-btn crm-icone-or" href="' + esc(CRM.liens({ telephone: tel }).tel) + '" aria-label="Appeler ' + esc(p.nom) + '">' + ic('telephone', 17) + '</a>' : '<span class="crm-pro-rang-vide"></span>') +
        '<button type="button" class="crm-icone-btn" data-pro="rang-menu" id="crmProMenu-' + esc(p.id) + '" aria-haspopup="menu" aria-expanded="false" aria-label="Actions pour ' + esc(p.nom) + '">' + ic('points', 18) + '</button>' +
      '</div></div>';
    if (action && action.type === 'supprimer') {
      html += '<div class="crm-pro-confirmation" role="alertdialog" aria-label="Confirmer la suppression"><p>Supprimer «&nbsp;' + esc(p.nom) + '&nbsp;» de la file&nbsp;?' +
        (p.resultat ? ' Son résultat et sa note d\'appel seront effacés.' : '') + '</p>' +
        '<div class="crm-pro-rangee"><button type="button" class="crm-btn crm-btn-danger" data-pro="supprimer-confirmer" id="crmProConfirmer">' + ic('corbeille', 14) + 'Supprimer</button>' +
        '<button type="button" class="crm-btn" data-pro="action-annuler">Annuler</button></div></div>';
    } else if (action && action.type === 'deplacer') {
      html += '<div class="crm-pro-confirmation"><label class="crm-pro-champ"><span>Déplacer vers la liste</span>' +
        '<input type="text" id="crmProDeplacer" data-champ="deplacer" maxlength="80" list="crmProListesTable" autocomplete="off" value="' + esc(action.valeur) + '"></label>' +
        '<div class="crm-pro-rangee"><button type="button" class="crm-btn crm-btn-or" data-pro="deplacer-confirmer">Déplacer</button>' +
        '<button type="button" class="crm-btn" data-pro="action-annuler">Annuler</button></div></div>';
    }
    return html + '</div>';
  }

  function htmlTable() {
    var g = etat.gestion, liste = filtresGestion();
    var filtre = g.recherche || g.liste || g.resultat || g.dep;
    var html = '<h2 class="crm-pro-section">Tous les prospects<span>' + liste.length + '</span></h2>';
    if (!liste.length) {
      return html + '<div class="crm-vide"><span class="crm-vide-ic">' + ic('recherche', 22) + '</span><p class="crm-vide-titre">Aucun prospect</p>' +
        '<p class="crm-vide-texte">' + (filtre ? 'Rien ne correspond à ces filtres.' : 'La file est vide : cherchez des numéros, importez une liste ou ajoutez un commerce à la main.') + '</p>' +
        (filtre ? '<button type="button" class="crm-btn" data-pro="gestion-effacer">Tout afficher</button>'
          : '<button type="button" class="crm-btn" data-pro="onglet" data-id="trouver">' + ic('recherche', 14) + 'Trouver des numéros</button>') + '</div>';
    }
    html += '<datalist id="crmProListesTable">' + listes().map(function (l) { return '<option value="' + esc(l.nom) + '"></option>'; }).join('') + '</datalist>' +
      '<div class="crm-liste crm-pro-table"><div class="crm-pro-table-tete" aria-hidden="true"><span>Commerce</span><span>Numéro</span><span>Liste</span><span>Résultat</span></div>' +
      liste.slice(0, g.limite).map(htmlRang).join('') + '</div>';
    if (liste.length > g.limite) {
      html += '<button type="button" class="crm-btn crm-plus" data-pro="liste-plus">Afficher ' + Math.min(PAS_LISTE, liste.length - g.limite) + ' prospects de plus</button>';
    }
    return html;
  }

  function rendreListe() {
    poser('crmProGestionOutils', htmlGestionOutils());
    poser('crmProPanneau', htmlPanneau());
    if (etat.gestion.panneau === 'import') majApercuImport();
    poser('crmProCampagnes', htmlCampagnes());
    poser('crmProTable', htmlTable());
  }

  function ouvrirPanneau(type) {
    var g = etat.gestion;
    if (!actif()) return;
    g.panneau = g.panneau === type && etat.sousVue === 'liste' ? null : type;
    g.erreurAjout = '';
    if (g.panneau === 'ajout' && !g.ajout.liste) g.ajout.liste = listeParDefaut();
    if (g.panneau === 'import' && !g.importation.liste) {
      var d = CRM.horloge();
      g.importation.liste = g.liste || 'Import ' + MOIS[d.getMonth()] + ' ' + d.getFullYear();
    }
    if (etat.sousVue !== 'liste') changerSousVue('liste'); else rendre();
    var champ = document.getElementById(g.panneau === 'ajout' ? 'crmProAjoutNom' : 'crmProImportTexte');
    if (champ) { champ.focus(); champ.scrollIntoView({ block: 'nearest' }); }
  }

  function validerAjout() {
    var g = etat.gestion, a = g.ajout;
    if (g.envoi) return;
    function refuser(message, champ) {
      g.erreurAjout = message;
      rendre();
      var el = document.getElementById(champ);
      if (el) el.focus();
    }
    if (!a.nom.trim()) return refuser('Le nom du commerce est obligatoire.', 'crmProAjoutNom');
    if (a.telephone.trim() && !pur.telFrancais(a.telephone)) return refuser('Ce numéro n\'a pas la forme d\'un numéro français à 10 chiffres.', 'crmProAjoutTel');
    var liste = a.liste.trim() || LISTE_DEFAUT;
    g.envoi = true;
    g.erreurAjout = '';
    rendre();
    CRM.ajouterProspects([{ nom: a.nom, metier: a.metier, commune: a.commune, telephone: a.telephone, remarque: a.remarque, liste: liste, source: 'manuel' }]).then(function (res) {
      g.envoi = false;
      if (!res.ajoutes) return refuser('Ce numéro est déjà dans la file ou appartient à un commerce déjà dans le CRM.', 'crmProAjoutTel');
      var cree = res.prospects[0];
      g.ajout = ajoutNeuf(liste);
      toast('Prospect ajouté à «\u00a0' + liste + '\u00a0»', { action: 'Appeler', surAction: function () { ouvrirDansAppeler(cree.id); } });
      rendre();
      var nom = document.getElementById('crmProAjoutNom');
      if (nom) nom.focus();
    }, function (e) {
      g.envoi = false;
      refuser((e && e.message) || 'Ajout impossible. Réessayez.', 'crmProAjoutNom');
    });
  }

  function validerImport() {
    var g = etat.gestion, imp = g.importation;
    if (g.envoi) return;
    var analyse = pur.analyserImport(imp.texte, CRM.dejaConnus());
    if (!analyse.lignes.length) return;
    var liste = imp.liste.trim() || LISTE_DEFAUT;
    g.envoi = true;
    majApercuImport();
    CRM.ajouterProspects(analyse.lignes.map(function (l) { return Object.assign({}, l, { liste: liste }); })).then(function (res) {
      g.envoi = false;
      if (res.ajoutes) {
        imp.texte = '';
        g.panneau = null;
        g.liste = '';
        toast(UI.pluriel(res.ajoutes, 'prospect ajouté', 'prospects ajoutés') + ' à «\u00a0' + liste + '\u00a0»' + (res.doublons ? ', ' + res.doublons + ' déjà connu' + (res.doublons > 1 ? 's' : '') : ''),
          { action: 'Commencer à appeler', surAction: function () { commencer(liste); } });
      } else toast('Rien de nouveau : ces commerces étaient déjà connus.');
      rendre();
    }, function (e) {
      g.envoi = false;
      erreur(e, 'Import impossible. Réessayez.');
      rendre();
    });
  }

  function menuRang(p, ancre) {
    var elements = [{ libelle: 'Ouvrir dans « Appeler »', valeur: 'appeler' }];
    if (ficheCrm(p)) elements.push({ libelle: 'Ouvrir la fiche CRM', valeur: 'fiche' });
    if (actif()) {
      elements.push({ libelle: 'Changer de liste', valeur: 'deplacer' });
      if (!p.enAttente) elements.push({ libelle: 'Supprimer', valeur: 'supprimer' });
    }
    UI.ouvrirMenu(ancre, elements, function (choix) {
      if (choix === 'appeler') return ouvrirDansAppeler(p.id);
      if (choix === 'fiche') return ouvrirFicheCrm(p.id);
      etat.gestion.action = { type: choix, id: p.id, valeur: nomListeDe(p) };
      rendre();
      var cible = document.getElementById(choix === 'deplacer' ? 'crmProDeplacer' : 'crmProConfirmer');
      if (cible) { cible.focus(); if (cible.select) cible.select(); }
    });
  }

  function supprimerProspect(id) {
    var p = parId(id);
    etat.gestion.action = null;
    if (!p) { rendre(); return; }
    var nom = p.nom;
    CRM.supprimerProspect(id).then(function () {
      delete brouillons[id];
      toast('«\u00a0' + nom + '\u00a0» supprimé de la file');
    }, erreur);
    rendre();
  }

  function deplacerProspect(id) {
    var action = etat.gestion.action, p = parId(id);
    etat.gestion.action = null;
    var cible = action && String(action.valeur || '').trim();
    if (!p || !cible || cible === nomListeDe(p)) { rendre(); return; }
    CRM.majProspect(id, { liste: cible }).then(function () { toast('Déplacé vers «\u00a0' + cible + '\u00a0»'); }, erreur);
    rendre();
  }

  /* Pas de suppression groupée côté cœur : les prospects partent un par un, quatre à la fois. */
  function supprimerListe(nom) {
    var g = etat.gestion;
    var ids = tous().filter(function (p) { return nomListeDe(p) === nom && !p.enAttente; }).map(function (p) { return p.id; });
    g.action = null;
    if (!ids.length || g.suppression) { rendre(); return; }
    var suivi = g.suppression = { liste: nom, fait: 0, total: ids.length }, rates = 0;
    function ouvrier() {
      var id = ids.shift();
      if (id == null) return Promise.resolve();
      return CRM.supprimerProspect(id).then(function () { delete brouillons[id]; }, function () { rates++; }).then(function () {
        suivi.fait++;
        planifier();
        return ouvrier();
      });
    }
    Promise.all([ouvrier(), ouvrier(), ouvrier(), ouvrier()]).then(function () {
      g.suppression = null;
      if (g.liste === nom) g.liste = '';
      if (rates) toast(UI.pluriel(rates, 'prospect n\'a pas pu être supprimé', 'prospects n\'ont pas pu être supprimés') + '. Réessayez.', { type: 'erreur' });
      else toast('Liste «\u00a0' + nom + '\u00a0» supprimée');
      rendre();
    });
    rendre();
  }

  // ───────────────────────────── Événements ─────────────────────────────

  function surClic(e) {
    var el = e.target.closest('[data-pro]');
    if (!el || el.disabled || !conteneur.contains(el)) return;
    var id = el.dataset.id, r = etat.rech, g = etat.gestion;
    var rang = el.closest('.crm-pro-rang'), campagne = el.closest('.crm-pro-campagne');
    switch (el.dataset.pro) {
      case 'onglet': if (id !== etat.sousVue) changerSousVue(id); break;

      // Appeler
      case 'resultat': choisirResultat(id); break;
      case 'rappel': poserRappel(el.getAttribute('aria-pressed') === 'true' ? null : id); break;
      case 'precedent': precedent(); break;
      case 'suivant': suivant(); break;
      case 'copier-numero': if (courant()) UI.copier(pur.formaterTel(courant().telephone), 'Numéro copié'); break;
      case 'numero-enregistrer': enregistrerNumero(); break;
      case 'fiche-crm': if (courant()) ouvrirFicheCrm(courant().id); break;
      case 'saisie-reessayer': viderSaisies(); break;
      case 'recap': copierRecap(); break;
      case 'accroche': etat.accroche = !etat.accroche; rendre(); break;
      case 'choisir': aller(id, { remonter: true }); break;
      case 'file-plus': etat.limiteFile += PAS_FILE; rendre(); break;
      case 'filtre-rappels': etat.filtreResultat = 'rappel_jour'; etat.limiteFile = PAS_FILE; rendre(); break;
      case 'filtres-effacer': etat.filtreResultat = 'tous'; etat.filtreDep = ''; rendre(); break;

      // Trouver des numéros
      case 'mode': if (r.mode !== id) { r.mode = id; fermerSuggestions(); rendre(); } break;
      case 'commune': choisirCommune(+id); break;
      case 'chercher': lancerRecherche(); break;
      case 'recherche-annuler': annulerRecherche(); break;
      case 'tout-cocher':
        var selectionnables = [];
        r.resultats.forEach(function (p, i) { if (!p.dejaConnu) selectionnables.push(i); });
        r.selection = new Set(r.selection.size === selectionnables.length ? [] : selectionnables);
        rendre();
        break;
      case 'resultats-plus': r.limite += PAS_RESULTATS; rendre(); break;
      case 'ajouter-file': ajouterSelection(); break;
      case 'commencer': if (r.ajout) commencer(r.ajout.liste); break;

      // Liste
      case 'ouvrir-ajout': ouvrirPanneau('ajout'); break;
      case 'ouvrir-import': ouvrirPanneau('import'); break;
      case 'panneau-fermer': g.panneau = null; rendre(); break;
      case 'ajout-valider': validerAjout(); break;
      case 'import-valider': validerImport(); break;
      case 'gestion-effacer': g.recherche = ''; g.liste = ''; g.resultat = ''; g.dep = ''; g.limite = PAS_LISTE; rendre(); break;
      case 'liste-plus': g.limite += PAS_LISTE; rendre(); break;
      case 'ouvrir-appel': if (rang) ouvrirDansAppeler(rang.dataset.id); break;
      case 'rang-menu': if (rang && parId(rang.dataset.id)) menuRang(parId(rang.dataset.id), el); break;
      case 'supprimer-confirmer': if (rang) supprimerProspect(rang.dataset.id); break;
      case 'deplacer-confirmer': if (rang) deplacerProspect(rang.dataset.id); break;
      case 'action-annuler': g.action = null; rendre(); break;
      case 'liste-appeler': if (campagne) commencer(campagne.dataset.liste); break;
      case 'liste-recap': if (campagne) copierRecap(campagne.dataset.liste); break;
      case 'liste-supprimer':
        if (!campagne) break;
        g.action = { type: 'supprimer-liste', liste: campagne.dataset.liste };
        rendre();
        var confirmer = document.getElementById('crmProConfirmerListe');
        if (confirmer) confirmer.focus();
        break;
      case 'liste-supprimer-confirmer': if (campagne) supprimerListe(campagne.dataset.liste); break;
    }
  }

  function estChampTexte(el) {
    return el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|tel|search)$/.test(el.type));
  }

  function surSaisie(e) {
    var el = e.target, champ = el.dataset && el.dataset.champ;
    if (!champ || !conteneur.contains(el)) return;
    // Un champ de texte est suivi à la frappe (input) ; listes, cases et dates à la validation (change).
    if (estChampTexte(el) !== (e.type === 'input')) return;
    var id = el.dataset.id, v = el.value, r = etat.rech, g = etat.gestion;
    switch (champ) {
      case 'note': case 'recommandation': saisir(id, champ, v); break;
      case 'numero': etat.numero = { id: id, valeur: v }; break;
      case 'rappel': poserRappel(v); break;
      case 'liste':
        viderSaisies();
        etat.liste = v;
        etat.courant = null;
        etat.filtreDep = '';
        etat.limiteFile = PAS_FILE;
        assurerCourant();
        memoriserPosition();
        rendre();
        break;
      case 'filtre-resultat': etat.filtreResultat = v; etat.limiteFile = PAS_FILE; rendre(); break;
      case 'filtre-dep': etat.filtreDep = v; etat.limiteFile = PAS_FILE; rendre(); break;

      case 'commune': saisirCommune(v); break;
      case 'departement': r.departement = v; majBlocage(); break;
      case 'metier': r.metiers[id] = el.checked; majBlocage(); break;
      case 'option': r[id] = el.checked; break;
      case 'selection': if (el.checked) r.selection.add(+id); else r.selection.delete(+id); rendre(); break;
      case 'nom-liste': r.nomListe = v; r.nomListePerso = true; break;

      case 'g-recherche': g.recherche = v; g.limite = PAS_LISTE; poser('crmProTable', htmlTable()); break;
      case 'g-liste': g.liste = v; g.limite = PAS_LISTE; rendre(); break;
      case 'g-resultat': g.resultat = v; g.limite = PAS_LISTE; rendre(); break;
      case 'g-dep': g.dep = v; g.limite = PAS_LISTE; rendre(); break;
      case 'ajout-nom': case 'ajout-metier': case 'ajout-commune': case 'ajout-telephone': case 'ajout-remarque': case 'ajout-liste':
        g.ajout[champ.slice(6)] = v;
        break;
      case 'import-texte': g.importation.texte = v; majApercuImport(); break;
      case 'import-liste': g.importation.liste = v; break;
      case 'deplacer': if (g.action) g.action.valeur = v; break;
    }
  }

  function surPerteFoyer(e) {
    var el = e.target, champ = el.dataset && el.dataset.champ;
    if (champ === 'note' || champ === 'recommandation') enregistrer(el.dataset.id, champ);
    // Laisser au clic sur une suggestion le temps d'arriver avant de refermer la liste.
    if (champ === 'commune') setTimeout(function () { if (document.activeElement !== el) fermerSuggestions(); }, 180);
  }

  function surTouche(e) {
    var el = e.target, champ = el.dataset && el.dataset.champ;
    if (!champ || e.isComposing) return;
    if (champ === 'commune') {
      var n = communes.liste.length;
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && communes.ouvert && n) {
        e.preventDefault();
        communes.actif = (communes.actif + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
        majSuggestions();
        var option = document.getElementById('crmProCommune-' + communes.actif);
        if (option) option.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (communes.ouvert && communes.actif >= 0) choisirCommune(communes.actif); else lancerRecherche();
      } else if (e.key === 'Escape' && communes.ouvert) {
        e.preventDefault();
        fermerSuggestions();
      }
      return;
    }
    if (e.key === 'Enter' && el.tagName === 'INPUT') {
      if (champ === 'numero') { e.preventDefault(); enregistrerNumero(); }
      else if (champ.indexOf('ajout-') === 0) { e.preventDefault(); validerAjout(); }
      else if (champ === 'deplacer') { e.preventDefault(); var rang = el.closest('.crm-pro-rang'); if (rang) deplacerProspect(rang.dataset.id); }
      else if (champ === 'nom-liste') { e.preventDefault(); ajouterSelection(); }
    } else if (e.key === 'Escape' && etat.gestion.action && el.closest('.crm-pro-confirmation')) {
      e.preventDefault();
      etat.gestion.action = null;
      rendre();
    }
  }

  // ───────────────────────────── Montage ─────────────────────────────

  function brancher(el) {
    el.addEventListener('click', surClic);
    el.addEventListener('input', surSaisie);
    el.addEventListener('change', surSaisie);
    el.addEventListener('focusout', surPerteFoyer);
    el.addEventListener('keydown', surTouche);
    // Toucher une commune proposée ne doit pas retirer le curseur du champ avant que le clic n'arrive.
    el.addEventListener('mousedown', function (e) { if (e.target.closest('.crm-pro-suggestions')) e.preventDefault(); });
  }

  /* Appelé par crm-vues.js à chaque entrée dans la vue, avec un conteneur neuf. L'état d'écran et les
     brouillons survivent : seul le DOM est reconstruit. */
  function afficher(el, opts) {
    if (!el) return;
    opts = opts || {};
    viderSaisies();
    if (el !== conteneur) { conteneur = el; brancher(el); }
    var demandee = SOUS_VUES.filter(function (v) { return v[0] === opts.sousVue; })[0];
    etat.sousVue = demandee ? demandee[0] : 'appeler';
    reprendreBrouillons();
    if (!etat.pret) {
      etat.pret = true;
      var memo = lirePositions();
      if (memo.liste && tous().some(function (p) { return nomListeDe(p) === memo.liste; })) etat.liste = memo.liste;
    }
    el.innerHTML = '<div id="crmProBandeau"></div>' +
      '<div class="crm-pro-onglets" id="crmProOnglets" role="tablist" aria-label="Prospection"></div>' +
      '<p class="crm-sr" id="crmProAnnonce" role="status"></p>' +
      '<div id="crmProCorps"></div>';
    rendre();
  }

  CRM.surChangement(function () { reprendreBrouillons(); if (monte()) planifier(); });

  // Une note en cours de frappe part avant que l'onglet ne passe en arrière-plan ou que la page ne se ferme,
  // par un envoi que le navigateur mène à son terme même si la page disparaît.
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') viderSaisies(true); });
  window.addEventListener('pagehide', function () { viderSaisies(true); });
  window.addEventListener('online', function () { viderSaisies(); });

  window.crmProspectionAfficher = afficher;
})();
