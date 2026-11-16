/* CRM admin Marchéo — cœur : logique pure et accès aux données.
 *
 * Expose `window.CRM`. Aucun accès au DOM. Se charge aussi sous Node pour les tests :
 * rien n'est lu dans window / localStorage / fetch au chargement, seulement à l'exécution des fonctions.
 *
 * Principe : les données brutes (commerçants, inscriptions, audits, prospects, événements, commandes et
 * les quatre tables crm_*) sont gardées telles quelles ; les fiches unifiées sont recalculées en entier
 * après chaque chargement et chaque écriture. Rien n'est fusionné en base : une fiche regroupe plusieurs clés.
 */
(function (racine) {
  'use strict';

  var JOUR = 86400000;
  var ORIGINE_DEFAUT = 'https://www.xn--marcho-fva.fr';
  // Les e-mails automatiques de suivi n'existent que pour les démos créées à partir de cette date.
  var DEBUT_SUIVI = '2026-10-23';

  // ───────────────────────────── Constantes métier ─────────────────────────────

  var OFFRES = {
    vitrine: { mensuel: 19, installation: 249, nom: 'Vitrine' },
    clickcollect: { mensuel: 39, installation: 399, nom: 'Click & Collect' },
    livraison: { mensuel: 59, installation: 549, nom: 'Livraison' }
  };

  // Ordre du pipeline, « perdu » à part en dernier.
  var ETAPES = [
    { id: 'prospect', libelle: 'Avant démo', court: 'Avant démo' },
    { id: 'demo', libelle: 'Démos créées', court: 'Démo' },
    { id: 'demo_engagee', libelle: 'Démos engagées', court: 'Démo engagée' },
    { id: 'paiement', libelle: 'Paiement commencé', court: 'Paiement' },
    { id: 'client', libelle: 'Boutiques en ligne', court: 'En ligne' },
    { id: 'perdu', libelle: 'Perdus', court: 'Perdu' }
  ];

  var MOTIFS_PERTE = ['Trop cher', 'Pas le temps', 'Pas intéressé', 'A choisi autre chose', 'Injoignable', 'Fermeture', 'Autre'];

  // `suite` : ce que l'interface propose en un toucher après le résultat (jours = échéance de la tâche,
  // null = date à saisir).
  var RESULTATS_APPEL = [
    { id: 'joint', libelle: 'Joint', suite: null },
    { id: 'messagerie', libelle: 'Messagerie', suite: { type: 'tache', titre: 'Rappeler', jours: 2 } },
    { id: 'pas_de_reponse', libelle: 'Pas de réponse', suite: { type: 'tache', titre: 'Rappeler', jours: 2 } },
    { id: 'a_rappeler', libelle: 'À rappeler', suite: { type: 'tache', titre: 'Rappeler', jours: 2 } },
    { id: 'rdv_pris', libelle: 'RDV pris', suite: { type: 'tache', titre: 'Rendez-vous', jours: null } },
    { id: 'pas_interesse', libelle: 'Pas intéressé', suite: { type: 'perdu' } }
  ];

  // Les 8 résultats de l'outil d'appels à froid. `suivant` : on passe tout seul au prospect suivant ;
  // `fiche` : le prospect entre dans le pipeline (clé p:<id>).
  var RESULTATS_PROSPECT = [
    { id: 'pas_de_reponse', libelle: 'Pas de réponse', suivant: true, fiche: false },
    { id: 'messagerie', libelle: 'Messagerie', suivant: true, fiche: false },
    { id: 'a_rappeler', libelle: 'À rappeler', suivant: false, fiche: true },
    { id: 'pas_interesse', libelle: 'Pas intéressé', suivant: false, fiche: false },
    { id: 'interesse', libelle: 'Intéressé', suivant: false, fiche: true },
    { id: 'rdv', libelle: 'Démo / RDV', suivant: false, fiche: true },
    { id: 'faux_numero', libelle: 'Faux numéro', suivant: true, fiche: false },
    { id: 'deja_site', libelle: 'A déjà un site', suivant: true, fiche: false }
  ];
  var ORDRE_RECAP = ['rdv', 'interesse', 'a_rappeler', 'pas_interesse', 'messagerie', 'pas_de_reponse', 'deja_site', 'faux_numero'];

  var TYPES_INTERACTION = ['note', 'appel', 'email', 'sms', 'whatsapp', 'rdv', 'visite', 'etape'];
  var RESULTATS_INTERACTION = ['joint', 'messagerie', 'pas_de_reponse', 'a_rappeler', 'rdv_pris', 'pas_interesse', 'perdu', 'rouvert'];
  // Une note ou un changement d'étape n'est pas un contact avec le commerçant.
  var TYPES_CONTACT = ['appel', 'email', 'sms', 'whatsapp', 'rdv', 'visite'];

  var LIBELLES_RESULTAT = {
    joint: 'Joint', messagerie: 'Messagerie', pas_de_reponse: 'Pas de réponse', a_rappeler: 'À rappeler',
    rdv_pris: 'RDV pris', pas_interesse: 'Pas intéressé', perdu: 'Perdu', rouvert: 'Rouvert'
  };

  // Cases à cocher de la recherche de numéros. Chaque case couvre une ou plusieurs valeurs OpenStreetMap.
  var METIERS_OSM = [
    { id: 'boulangerie', libelle: 'Boulangerie', defaut: true, shop: ['bakery'] },
    { id: 'patisserie', libelle: 'Pâtisserie', defaut: true, shop: ['pastry'] },
    { id: 'boucherie', libelle: 'Boucherie', defaut: true, shop: ['butcher'] },
    { id: 'primeur', libelle: 'Primeur', defaut: true, shop: ['greengrocer'] },
    { id: 'fromagerie', libelle: 'Fromagerie', defaut: true, shop: ['cheese'] },
    { id: 'poissonnerie', libelle: 'Poissonnerie', defaut: true, shop: ['seafood'] },
    { id: 'traiteur', libelle: 'Épicerie fine / traiteur', defaut: true, shop: ['deli'], craft: ['caterer'] },
    { id: 'epicerie', libelle: 'Épicerie', defaut: true, shop: ['convenience'] },
    { id: 'fleuriste', libelle: 'Fleuriste', defaut: true, shop: ['florist'] },
    { id: 'restaurant', libelle: 'Restaurant', defaut: false, amenity: ['restaurant'] },
    { id: 'pizzeria', libelle: 'Pizzeria / restauration rapide', defaut: false, amenity: ['fast_food'] }
  ];

  // Valeur OpenStreetMap → case cochée, libellé du métier et type Marchéo.
  var CORRESPONDANCE_OSM = {
    'shop:bakery': { case: 'boulangerie', metier: 'Boulangerie', type: 'boulangerie' },
    'shop:pastry': { case: 'patisserie', metier: 'Pâtisserie', type: 'boulangerie' },
    'shop:butcher': { case: 'boucherie', metier: 'Boucherie', type: 'boucherie' },
    'shop:greengrocer': { case: 'primeur', metier: 'Primeur', type: 'primeur' },
    'shop:cheese': { case: 'fromagerie', metier: 'Fromagerie', type: 'fromagerie' },
    'shop:seafood': { case: 'poissonnerie', metier: 'Poissonnerie', type: 'poissonnerie' },
    'shop:deli': { case: 'traiteur', metier: 'Épicerie fine', type: 'traiteur' },
    'craft:caterer': { case: 'traiteur', metier: 'Traiteur', type: 'traiteur' },
    'shop:convenience': { case: 'epicerie', metier: 'Épicerie', type: 'epicerie' },
    'shop:florist': { case: 'fleuriste', metier: 'Fleuriste', type: 'fleuriste' },
    'amenity:restaurant': { case: 'restaurant', metier: 'Restaurant', type: 'restaurant' },
    'amenity:fast_food': { case: 'pizzeria', metier: 'Restauration rapide', type: 'fastfood' }
  };
  var PIZZERIA = { case: 'pizzeria', metier: 'Pizzeria', type: 'pizzeria' };

  var SERVEURS_OVERPASS = [
    'https://overpass.openstreetmap.fr/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];
  var DELAI_OVERPASS = 45000;
  var LIMITE_OVERPASS = 2000;
  var ETIQUETTES_TEL = ['contact:mobile', 'phone:mobile', 'mobile', 'phone', 'contact:phone'];

  var DEPARTEMENTS = ('01|Ain;02|Aisne;03|Allier;04|Alpes-de-Haute-Provence;05|Hautes-Alpes;06|Alpes-Maritimes;07|Ardèche;' +
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
    '971|Guadeloupe;972|Martinique;973|Guyane;974|La Réunion;976|Mayotte')
    .split(';').map(function (d) { var p = d.split('|'); return { code: p[0], nom: p[1] }; });

  function nomDepartement(code) {
    var c = String(code || '').toUpperCase();
    for (var i = 0; i < DEPARTEMENTS.length; i++) if (DEPARTEMENTS[i].code === c) return DEPARTEMENTS[i].nom;
    return '';
  }

  // ───────────────────────────── Fonctions pures : texte, téléphone, dates ─────────────────────────────

  function texte(v) { return v == null ? '' : String(v).trim(); }

  function sansAccents(v) {
    return texte(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function normaliserEmail(v) {
    var e = texte(v).toLowerCase();
    return e.indexOf('@') > 0 ? e : '';
  }

  /* Chiffres seuls ; 0033 / 33 initial → 0 ; 9 chiffres commençant par 1-9 → 0 devant.
     Moins de 9 chiffres : chaîne vide (pas de rapprochement possible). */
  function normaliserTel(v) {
    var d = texte(v).replace(/\D/g, '');
    if (d.indexOf('0033') === 0) d = d.slice(4);
    else if (d.indexOf('33') === 0) {
      // On ne retire l'indicatif que si le reste a la forme d'un numéro français (« +33 (0)6… » compris),
      // sinon un numéro à 9 chiffres commençant par 33 serait amputé.
      var reste = d.slice(2);
      if (/^[1-9]\d{8}$/.test(reste) || /^0[1-9]\d{8}$/.test(reste)) d = reste;
    }
    if (/^[1-9]\d{8}$/.test(d)) d = '0' + d;
    return d.length >= 9 ? d : '';
  }

  /* Numéro français à 10 chiffres, ou null. Plus strict que normaliserTel : sert à ce qui est enregistré
     dans crm_prospects et aux liens d'appel. Un indicatif étranger est refusé même si le reste « ressemble ». */
  function telFrancais(v) {
    var brut = texte(v);
    if (/^(\+|00)/.test(brut) && !/^(\+|00)\s*33/.test(brut)) return null;
    var d = normaliserTel(brut);
    return /^0[1-9]\d{8}$/.test(d) ? d : null;
  }

  function estMobile(v) { return /^0[67]\d{8}$/.test(normaliserTel(v)); }

  function formaterTel(v) {
    var d = normaliserTel(v);
    if (!/^0\d{9}$/.test(d)) return texte(v);
    return d.replace(/(\d\d)(?=\d)/g, '$1 ');
  }

  /* Numéro au format international sans « + » (33612345678), ou null. */
  function telInternational(v) {
    var fr = telFrancais(v);
    if (fr) return '33' + fr.slice(1);
    var brut = texte(v);
    var d = brut.replace(/\D/g, '');
    if (brut.charAt(0) === '+' && d.length >= 9) return d;
    if (brut.indexOf('00') === 0 && d.length >= 11) return d.slice(2);
    return null;
  }

  /* Une date de calendrier « AAAA-MM-JJ » est lue en heure locale : new Date('2026-11-14') la lirait en UTC
     et la décalerait d'un jour à l'ouest de Greenwich. */
  function versDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10));
    }
    var d = new Date(v);
    return isNaN(d) ? null : d;
  }

  function ms(v) { var d = versDate(v); return d ? d.getTime() : 0; }

  function dateLocaleISO(v) {
    var d = versDate(v == null ? new Date() : v);
    if (!d) return '';
    var m = d.getMonth() + 1, j = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j;
  }

  /* Nombre de jours de calendrier de a vers b, en heure locale (hier soir → ce matin = 1). */
  function jours(a, b) {
    var da = versDate(a), db = versDate(b);
    if (!da || !db) return NaN;
    var ja = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
    var jb = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
    return Math.round((jb - ja) / JOUR);
  }

  function ajouterJours(v, n) {
    var d = versDate(v == null ? new Date() : v);
    if (!d) return '';
    return dateLocaleISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
  }

  function ilYA(n) {
    if (!(n > 0)) return 'aujourd\'hui';
    return n === 1 ? 'hier' : 'il y a ' + n + ' j';
  }

  function dateCourte(v) {
    var d = versDate(v);
    if (!d) return '';
    var j = d.getDate(), m = d.getMonth() + 1;
    return (j < 10 ? '0' : '') + j + '/' + (m < 10 ? '0' : '') + m;
  }

  function estAnnulee(commande) { return sansAccents(commande && commande.statut).indexOf('annul') === 0; }

  // ───────────────────────────── Unification ─────────────────────────────

  var EXCLU = { exclu: true };

  // Compte de test, démo d'ambassadeur ou compte de l'admin : jamais dans le CRM, ni ce qui s'y rattache.
  function estHorsCrm(c, emailAdmin) {
    if (c.is_fixture || c.est_demo_ambassadeur || c.code_promo_utilise === 'TEST_ADMIN') return true;
    if (!emailAdmin) return false;
    return normaliserEmail(c.email) === emailAdmin || normaliserEmail(c.demo_prospect_email) === emailAdmin;
  }

  function estExclu(c, emailAdmin) { return !!c.supprime_at || estHorsCrm(c, emailAdmin); }

  /* Ce qu'un compte exclu laisse dans les index. Un compte supprimé n'écarte que ce qui date d'avant sa
     suppression : le même commerce qui se réinscrit ou qu'on rappelle ensuite ouvre une fiche neuve. */
  function marqueExclusion(c, emailAdmin) {
    if (estHorsCrm(c, emailAdmin) || !ms(c.supprime_at)) return EXCLU;
    return { exclu: true, jusqua: ms(c.supprime_at) };
  }

  // Une vraie fiche ne doit pas être masquée par un compte exclu qui partagerait la même coordonnée,
  // et une exclusion définitive prime sur une exclusion datée.
  function rangCible(cible) { return !cible.exclu ? 2 : cible.jusqua == null ? 1 : 0; }
  function indexer(carte, cle, cible) {
    if (!cle) return;
    var existant = carte.get(cle);
    if (!existant || rangCible(cible) > rangCible(existant)) carte.set(cle, cible);
  }

  // Une exclusion datée ne vaut plus pour une ligne postérieure à la suppression du compte.
  function encoreValable(cible, date) {
    return !!cible && !(cible.exclu && cible.jusqua != null && ms(date) > cible.jusqua);
  }

  /* Première fiche (ou exclusion) qui partage un e-mail ou un téléphone. `date` : date de la ligne à rattacher. */
  function trouver(cartes, emails, tels, date) {
    for (var i = 0; i < cartes.length; i++) {
      var k, cible;
      for (k = 0; k < emails.length; k++) { cible = emails[k] && cartes[i].email.get(emails[k]); if (encoreValable(cible, date)) return cible; }
      for (k = 0; k < tels.length; k++) { cible = tels[k] && cartes[i].tel.get(tels[k]); if (encoreValable(cible, date)) return cible; }
    }
    return null;
  }

  /* Plusieurs lignes d'inscription du même e-mail n'en font qu'une : champs de la plus récente,
     date de la plus ancienne. */
  function dedoublonnerLeads(leads) {
    var parEmail = new Map();
    (leads || []).forEach(function (l) {
      var email = normaliserEmail(l && l.email);
      if (!email) return;
      var g = parEmail.get(email);
      if (!g) { g = { recent: l, ancien: l, nb: 0 }; parEmail.set(email, g); }
      g.nb++;
      if (ms(l.created_at) > ms(g.recent.created_at)) g.recent = l;
      if (ms(l.created_at) < ms(g.ancien.created_at)) g.ancien = l;
    });
    var liste = [];
    parEmail.forEach(function (g, email) {
      liste.push(Object.assign({}, g.recent, {
        email: email, created_at: g.ancien.created_at, derniere_tentative: g.recent.created_at, tentatives: g.nb
      }));
    });
    return liste.sort(function (a, b) { return ms(a.created_at) - ms(b.created_at); });
  }

  function nouvelleFiche() {
    return { commercant: null, audits: [], leads: [], prospects: [] };
  }

  // La colonne `ville` d'un audit contient souvent l'adresse complète : on en tire la commune si elle suit un code postal.
  function villeDepuisAdresse(adresse) {
    var m = /\b\d{5}\s+([^,]+)$/.exec(texte(adresse));
    return m ? m[1].trim() : '';
  }

  function premier() {
    for (var i = 0; i < arguments.length; i++) { var v = texte(arguments[i]); if (v) return v; }
    return '';
  }

  /* Événements de fréquentation regroupés par slug de boutique, bornés à 30 jours. */
  function indexerEvenements(evenements, maintenant) {
    var parSlug = new Map();
    var limite = maintenant.getTime() - 30 * JOUR;
    (evenements || []).forEach(function (e) {
      if (!e || !e.created_at) return;
      var slug = e.slug || (e.meta && e.meta.boutique);
      if (!slug || ms(e.created_at) < limite) return;
      var liste = parSlug.get(slug);
      if (!liste) parSlug.set(slug, liste = []);
      liste.push(e);
    });
    return parSlug;
  }

  function signauxVides() {
    return {
      joursVisite14: 0, joursVisite30: 0, derniereVisite: null, dureeVisite: 0, partages: 0, paiementCommenceLe: null,
      commandes: 0, commandes30: 0, commandes30Avant: 0, ca30: 0, premiereCommande: null, premiereCommandeSure: false,
      derniereCommande: null,
      visitesParJour: [], partagesParJour: [], paiementsCommences: []
    };
  }

  function calculerSignaux(commercant, evenements, commandes, maintenant) {
    var s = signauxVides();
    var visites = new Map(), partages = new Map();
    (evenements || []).forEach(function (e) {
      var jour = dateLocaleISO(e.created_at);
      var age = jours(e.created_at, maintenant);
      if (e.event === 'page_view') {
        var v = visites.get(jour);
        if (!v) visites.set(jour, v = { jour: jour, nb: 0, date: e.created_at });
        v.nb++;
        if (ms(e.created_at) > ms(v.date)) v.date = e.created_at;
        if (!s.derniereVisite || ms(e.created_at) > ms(s.derniereVisite)) s.derniereVisite = e.created_at;
        if (age < 14) v.recent = true;
      } else if (e.event === 'page_exit') {
        s.dureeVisite += Math.max(0, Number(e.meta && e.meta.duree) || 0);
      } else if (e.event === 'demo_privee_bloquee') {
        s.partages++;
        var p = partages.get(jour);
        if (!p) partages.set(jour, p = { jour: jour, nb: 0, date: e.created_at });
        p.nb++;
        if (ms(e.created_at) > ms(p.date)) p.date = e.created_at;
      } else if (e.event === 'paiement_commence') {
        s.paiementsCommences.push(e.created_at);
        if (!s.paiementCommenceLe || ms(e.created_at) > ms(s.paiementCommenceLe)) s.paiementCommenceLe = e.created_at;
      }
    });
    visites.forEach(function (v) { s.visitesParJour.push(v); s.joursVisite30++; if (v.recent) s.joursVisite14++; });
    partages.forEach(function (p) { s.partagesParJour.push(p); });

    (commandes || []).forEach(function (c) {
      if (estAnnulee(c) || !c.created_at) return;
      var age = (maintenant.getTime() - ms(c.created_at)) / JOUR;
      s.commandes++;
      if (age <= 30) { s.commandes30++; s.ca30 += Number(c.total_ttc) || 0; }
      else if (age <= 60) s.commandes30Avant++;
      if (!s.premiereCommande || ms(c.created_at) < ms(s.premiereCommande)) s.premiereCommande = c.created_at;
      if (!s.derniereCommande || ms(c.created_at) > ms(s.derniereCommande)) s.derniereCommande = c.created_at;
    });
    s.ca30 = Math.round(s.ca30 * 100) / 100;
    s.premiereCommandeSure = (maintenant.getTime() - ms(commercant.created_at)) / JOUR <= 60;
    return s;
  }

  function cleDe(prefixe, valeur) { return prefixe + ':' + valeur; }

  /* Construit les fiches unifiées. `donnees` : { commercants, leads, audits, prospects, commandes, evenements,
     fiches (crm_fiches), interactions, taches }. Toute source absente est traitée comme vide. */
  function unifier(donnees, config, maintenant) {
    donnees = donnees || {};
    maintenant = versDate(maintenant) || new Date();
    var emailAdmin = normaliserEmail(config && config.emailAdmin);
    var fiches = [];
    var cartes = {
      slug: new Map(),
      c: { email: new Map(), tel: new Map() },
      a: { email: new Map(), tel: new Map() },
      l: { email: new Map(), tel: new Map() },
      p: { email: new Map(), tel: new Map() }
    };
    function creer() { var f = nouvelleFiche(); fiches.push(f); return f; }

    // 1. Commerçants : la base. Les comptes exclus sont indexés quand même, pour écarter aussi
    //    l'audit ou l'inscription de test qui s'y rattache.
    (donnees.commercants || []).forEach(function (c) {
      if (!c || c.id == null) return;
      var cible;
      if (estExclu(c, emailAdmin)) cible = marqueExclusion(c, emailAdmin);
      else { cible = creer(); cible.commercant = c; }
      indexer(cartes.slug, texte(c.slug), cible);
      indexer(cartes.c.email, normaliserEmail(c.email), cible);
      indexer(cartes.c.email, normaliserEmail(c.demo_prospect_email), cible);
      indexer(cartes.c.tel, normaliserTel(c.telephone), cible);
      indexer(cartes.c.tel, normaliserTel(c.demo_prospect_telephone), cible);
    });

    // 2. Audits terrain : slug de la démo, puis e-mail, puis téléphone. Jamais par nom.
    (donnees.audits || []).slice().sort(function (a, b) { return ms(a.created_at) - ms(b.created_at); }).forEach(function (a) {
      if (!a || a.fiche_id == null) return;
      var email = normaliserEmail(a.email), tel = normaliserTel(a.telephone);
      var parSlug = a.demo_slug && cartes.slug.get(texte(a.demo_slug));
      var cible = (encoreValable(parSlug, a.created_at) && parSlug) ||
        trouver([cartes.c, cartes.a], [email], [tel], a.created_at);
      if ((cible && cible.exclu) || (!cible && emailAdmin && email === emailAdmin)) return;
      if (!cible) cible = creer();
      cible.audits.push(a);
      indexer(cartes.a.email, email, cible);
      indexer(cartes.a.tel, tel, cible);
    });

    // 3. Inscriptions commencées.
    dedoublonnerLeads(donnees.leads).forEach(function (l) {
      if (emailAdmin && l.email === emailAdmin) return;
      var tel = normaliserTel(l.telephone);
      var cible = trouver([cartes.c, cartes.a, cartes.l], [l.email], [tel], l.derniere_tentative);
      if (cible && cible.exclu) return;
      if (!cible) cible = creer();
      cible.leads.push(l);
      indexer(cartes.l.email, l.email, cible);
      indexer(cartes.l.tel, tel, cible);
    });

    // Données du CRM regroupées par clé (lues dès l'étape 4, rattachées aux fiches à l'étape 5).
    var etats = new Map();
    (donnees.fiches || []).forEach(function (e) { if (e && e.cle) etats.set(e.cle, e); });
    var interactions = grouperParCle(donnees.interactions);
    var taches = grouperParCle(donnees.taches);

    // 4. Prospects appelés à froid : ils rejoignent une fiche existante par téléphone ou e-mail ;
    //    seuls, ils n'entrent dans le pipeline que si l'appel a donné une suite. Une fiche qui porte déjà
    //    des notes, des tâches ou un état y reste même si le résultat change : sinon ce suivi disparaîtrait.
    (donnees.prospects || []).forEach(function (p) {
      if (!p || p.id == null) return;
      var email = normaliserEmail(p.email), tel = normaliserTel(p.telephone);
      var cible = trouver([cartes.c, cartes.a, cartes.l, cartes.p], [email], [tel], p.appele_at || p.created_at);
      if (cible && cible.exclu) return;
      if (!cible) {
        var suite = resultatProspectDe(p.resultat), cleP = cleDe('p', p.id);
        var aDesDonnees = etats.has(cleP) || interactions.has(cleP) || taches.has(cleP);
        if (!(suite && suite.fiche) && !aDesDonnees) return;
        cible = creer();
      }
      cible.prospects.push(p);
      indexer(cartes.p.email, email, cible);
      indexer(cartes.p.tel, tel, cible);
    });

    // 5. Signaux rattachés par boutique.
    var evenements = indexerEvenements(donnees.evenements, maintenant);
    var commandes = new Map();
    (donnees.commandes || []).forEach(function (c) {
      if (!c || c.commercant_id == null) return;
      var liste = commandes.get(c.commercant_id);
      if (!liste) commandes.set(c.commercant_id, liste = []);
      liste.push(c);
    });

    // Une source qui n'a pas pu être lue n'est pas une source vide : les règles qui en dépendent se taisent.
    var inconnu = {};
    ((config && config.sourcesKo) || []).forEach(function (nom) { inconnu[nom] = true; });

    return fiches.map(function (brute) {
      return completerFiche(brute, {
        etats: etats, interactions: interactions, taches: taches, evenements: evenements, commandes: commandes,
        inconnu: inconnu
      }, maintenant);
    });
  }

  function grouperParCle(lignes) {
    var carte = new Map();
    (lignes || []).forEach(function (l) {
      if (!l || !l.cle) return;
      var liste = carte.get(l.cle);
      if (!liste) carte.set(l.cle, liste = []);
      liste.push(l);
    });
    return carte;
  }

  function resultatProspectDe(id) {
    for (var i = 0; i < RESULTATS_PROSPECT.length; i++) if (RESULTATS_PROSPECT[i].id === id) return RESULTATS_PROSPECT[i];
    return null;
  }

  function plusRecent(liste, champ) {
    return liste.slice().sort(function (a, b) { return ms(b[champ]) - ms(a[champ]); })[0] || null;
  }

  function completerFiche(brute, sources, maintenant) {
    var c = brute.commercant;
    var audit = plusRecent(brute.audits, 'updated_at') || plusRecent(brute.audits, 'created_at');
    var lead = plusRecent(brute.leads, 'derniere_tentative');
    // Le prospect mis en avant est celui dont l'appel a donné une suite, sinon le dernier appelé.
    var prospect = plusRecent(brute.prospects.filter(function (p) {
      var r = resultatProspectDe(p.resultat); return r && r.fiche;
    }), 'appele_at') || plusRecent(brute.prospects, 'appele_at');
    var donneesAudit = (audit && audit.data) || {};

    // Ordre des clés : c: > a: > p: > l:. La première est la clé principale (celle des écritures).
    var cles = [];
    if (c) cles.push(cleDe('c', c.id));
    brute.audits.forEach(function (a) { cles.push(cleDe('a', a.fiche_id)); });
    brute.prospects.forEach(function (p) { cles.push(cleDe('p', p.id)); });
    brute.leads.forEach(function (l) { cles.push(cleDe('l', l.email)); });

    var telephone = premier(c && c.telephone, c && c.demo_prospect_telephone, audit && audit.telephone,
      lead && lead.telephone, prospect && prospect.telephone);
    var adresse = premier(c && c.adresse, audit && audit.ville, prospect && prospect.adresse);
    var dates = [];
    if (c) dates.push(c.created_at);
    brute.audits.forEach(function (a) { dates.push(a.created_at); });
    brute.leads.forEach(function (l) { dates.push(l.created_at); });
    brute.prospects.forEach(function (p) { dates.push(p.created_at); });
    var creeLe = plusAncienne(dates);
    // Âge utile aux règles : celui de la démo quand elle existe, sinon celui du premier signe d'intérêt
    // (pour un prospect : l'appel, pas l'import de la liste).
    var depuis = c ? c.created_at : plusAncienne(
      brute.audits.map(function (a) { return a.created_at; })
        .concat(brute.leads.map(function (l) { return l.created_at; }))
        .concat(brute.prospects.map(function (p) { return p.appele_at || p.created_at; })));

    var relancesBrutes = (c && c.relances_demo) || {};
    var relances = {
      j0: relancesBrutes.j0 || null, j1: relancesBrutes.j1 || null, j3: relancesBrutes.j3 || null,
      j7: relancesBrutes.j7 || null, appel: relancesBrutes.appel || null, stop: relancesBrutes.stop || null
    };

    var listeInteractions = [], listeTaches = [];
    cles.forEach(function (cle) {
      listeInteractions = listeInteractions.concat(sources.interactions.get(cle) || []);
      listeTaches = listeTaches.concat(sources.taches.get(cle) || []);
    });
    listeInteractions.sort(function (a, b) { return ms(b.fait_at) - ms(a.fait_at); });
    // Tâches ouvertes d'abord (la plus ancienne en tête), puis les faites (la plus récente en tête).
    listeTaches.sort(function (a, b) {
      if (!a.fait_at !== !b.fait_at) return a.fait_at ? 1 : -1;
      if (a.fait_at) return ms(b.fait_at) - ms(a.fait_at);
      return texte(a.echeance) < texte(b.echeance) ? -1 : texte(a.echeance) > texte(b.echeance) ? 1 : ms(a.created_at) - ms(b.created_at);
    });

    var appelsProspection = brute.prospects.map(function (p) { return p.appele_at; }).filter(Boolean);
    var dernierContact = plusRecente(listeInteractions.filter(function (i) {
      return TYPES_CONTACT.indexOf(i.type) >= 0;
    }).map(function (i) { return i.fait_at; }).concat(appelsProspection));
    var derniereInteraction = plusRecente(listeInteractions.filter(function (i) {
      return i.type !== 'etape';
    }).map(function (i) { return i.fait_at; }));

    var etat = sources.etats.get(cles[0]) || {};
    // Les liens saisis à la main suivent le commerce même si sa clé principale a changé depuis (prospect devenu démo).
    var etatsLiens = cles.map(function (cle) { return sources.etats.get(cle); });
    var origines = [];
    if (prospect) origines.push('prospection');
    if (lead) origines.push('inscription');
    if (audit) origines.push('audit');
    if (c) origines.push('demo');
    if (c && texte(c.ambassadeur_prenom)) origines.push('ambassadeur ' + texte(c.ambassadeur_prenom));
    var utm = c && c.acquisition && c.acquisition.utm && texte(c.acquisition.utm.utm_source);
    if (utm) origines.push(utm);

    var fiche = {
      cle: cles[0], cles: cles,
      nom: premier(c && c.nom_boutique, audit && audit.nom_commerce, lead && lead.nom_boutique, prospect && prospect.nom,
        lead && lead.email, 'Sans nom'),
      gerant: premier(c && c.nom_gerant, donneesAudit.responsable),
      email: normaliserEmail(premier(c && c.email, c && c.demo_prospect_email, audit && audit.email,
        lead && lead.email, prospect && prospect.email)),
      telephone: telephone, telNormalise: normaliserTel(telephone),
      ville: premier(c && c.ville, lead && lead.ville, prospect && prospect.commune, villeDepuisAdresse(audit && audit.ville)),
      adresse: adresse,
      metier: premier(c && c.business_type, lead && lead.business_type, audit && audit.type_commerce,
        prospect && prospect.business_type),
      metierLibelle: premier(prospect && prospect.metier),
      offre: premier(c && c.offre, lead && lead.offre),
      slug: premier(c && c.slug), logo: premier(c && c.logo_url),
      commercant: c, audit: audit, lead: lead, prospect: prospect,
      audits: brute.audits, leads: brute.leads, prospects: brute.prospects,
      origines: origines, creeLe: creeLe, depuis: depuis,
      relancesSuivies: !!(c && ms(c.created_at) >= ms(DEBUT_SUIVI + 'T00:00:00Z')),
      relances: relances,
      signaux: c ? calculerSignaux(c, sources.evenements.get(texte(c.slug)), sources.commandes.get(c.id), maintenant)
        : signauxVides(),
      crm: {
        perdu_at: etat.perdu_at || null, motif_perte: etat.motif_perte || null,
        reporte_jusqua: etat.reporte_jusqua || null, note_epinglee: etat.note_epinglee || null
      },
      presence: presence({
        nom: premier(c && c.nom_boutique, audit && audit.nom_commerce, lead && lead.nom_boutique, prospect && prospect.nom),
        commune: premier(c && c.ville, lead && lead.ville, prospect && prospect.commune, villeDepuisAdresse(audit && audit.ville)),
        etats: etatsLiens, prospects: [prospect].concat(brute.prospects), commercant: c
      }),
      interactions: listeInteractions, taches: listeTaches,
      dernierContact: dernierContact, derniereInteraction: derniereInteraction,
      // Sources non lues (commandes, evenements, interactions) : voir unifier.
      inconnu: sources.inconnu || {}
    };

    fiche.etape = etape(fiche, maintenant);
    var resilie = !!(c && c.abonnement_actif !== true && c.abonnement_fin);
    fiche.drapeaux = {
      desinscrit: !!relances.stop, dormante: false, sansTelephone: !fiche.telNormalise,
      suspendue: !!(c && c.actif === false), enPause: !!(c && c.en_pause), resilie: resilie
    };
    fiche.drapeaux.dormante = estDormante(fiche, maintenant);
    // Un perdu saisi à la main garde son motif ; une résiliation en fournit un d'office.
    fiche.motifPerte = fiche.etape === 'perdu' ? (fiche.crm.perdu_at ? fiche.crm.motif_perte : 'Résiliation') : null;
    // Chaleur du prospect (besoin de Marchéo), calculée ici sans les homonymes de la file : `unifier` reste pure.
    fiche.chaleurProspect = prospect ? chaleurProspect(prospect, {}) : null;
    fiche.score = score(fiche, maintenant);
    fiche.action = prochaineAction(fiche, maintenant);
    return fiche;
  }

  function plusAncienne(dates) {
    var r = null;
    dates.forEach(function (d) { if (d && (!r || ms(d) < ms(r))) r = d; });
    return r;
  }
  function plusRecente(dates) {
    var r = null;
    dates.forEach(function (d) { if (d && (!r || ms(d) > ms(r))) r = d; });
    return r;
  }

  // ───────────────────────────── Étape ─────────────────────────────

  function estDemo(nomEtape) { return nomEtape === 'demo' || nomEtape === 'demo_engagee'; }

  /* Première règle vraie. L'étape n'est jamais saisie : elle découle de ce que fait le commerçant. */
  function etape(fiche) {
    var c = fiche.commercant, s = fiche.signaux || signauxVides();
    if (fiche.crm && fiche.crm.perdu_at) return 'perdu';
    if (c && c.abonnement_actif !== true && c.abonnement_fin) return 'perdu';
    if (c && c.abonnement_actif === true) return 'client';
    if (c && (c.stripe_customer_id || s.paiementCommenceLe)) return 'paiement';
    if (c && (s.commandes >= 1 || s.joursVisite30 >= 2)) return 'demo_engagee';
    if (c) return 'demo';
    return 'prospect';
  }

  function ageFiche(fiche, maintenant) {
    var n = jours(fiche.depuis || fiche.creeLe, maintenant);
    return isNaN(n) ? null : Math.max(0, n);
  }

  /* Jours écoulés depuis la dernière tentative d'inscription, ou null sans inscription. */
  function ageInscription(fiche, maintenant) {
    var l = fiche.lead;
    var n = l ? jours(l.derniere_tentative || l.created_at, maintenant) : NaN;
    return isNaN(n) ? null : Math.max(0, n);
  }

  /* Démo de plus de 30 jours, sans visite ni interaction depuis 14 jours. */
  function estDormante(fiche, maintenant) {
    if (!estDemo(fiche.etape || etape(fiche))) return false;
    var age = ageFiche(fiche, maintenant);
    if (age == null || age <= 30) return false;
    // Sans les visites, impossible de dire qu'il ne se passe rien.
    if (fiche.inconnu && fiche.inconnu.evenements) return false;
    var visite = fiche.signaux && fiche.signaux.derniereVisite;
    if (visite && jours(visite, maintenant) < 14) return false;
    return !(fiche.derniereInteraction && jours(fiche.derniereInteraction, maintenant) < 14);
  }

  // ───────────────────────────── Scores ─────────────────────────────

  function borner(n) { return Math.max(0, Math.min(100, Math.round(n))); }

  function trierRaisons(raisons) {
    return raisons.sort(function (a, b) { return Math.abs(b.points) - Math.abs(a.points); });
  }

  function aPaiementCommence(fiche) {
    var c = fiche.commercant;
    return !!(c && c.abonnement_actif !== true && (c.stripe_customer_id || (fiche.signaux && fiche.signaux.paiementCommenceLe)));
  }

  function scoreChaleur(fiche, nomEtape, maintenant) {
    var c = fiche.commercant, a = fiche.audit, s = fiche.signaux || signauxVides();
    var raisons = [], total = 0;
    function plus(points, libelle) { if (points) { total += points; raisons.push({ points: points, texte: libelle }); } }
    var aujourdhui = dateLocaleISO(maintenant);
    var age = ageFiche(fiche, maintenant);
    // Quelqu'un qui retente de s'inscrire redevient un contact frais, même si sa première tentative est ancienne.
    var ageLead = c ? null : ageInscription(fiche, maintenant);
    if (age != null && ageLead != null) age = Math.min(age, ageLead);

    if (a) {
      plus(15, 'Audit terrain réalisé');
      var temperature = { chaud: [20, 'Très intéressé lors de l\'audit'], interesse: [12, 'Intéressé lors de l\'audit'],
        curieux: [4, 'Curieux lors de l\'audit'], froid: [-10, 'Froid lors de l\'audit'] }[a.temperature];
      if (temperature) plus(temperature[0], temperature[1]);
      if (a.rdv2_date && texte(a.rdv2_date).slice(0, 10) >= aujourdhui) plus(10, '2ᵉ rendez-vous prévu');
    }
    if (s.joursVisite14) {
      plus(Math.min(20, 4 * s.joursVisite14),
        'A consulté sa démo ' + s.joursVisite14 + ' jour' + (s.joursVisite14 > 1 ? 's' : '') + ' sur 14');
    }
    if (s.dureeVisite > 120) plus(10, 'A passé du temps sur sa démo');
    if (s.partages >= 1) plus(10, 'A partagé sa démo');
    if (s.commandes >= 1) plus(15, 'A testé une commande');
    if (c && c.logo_url) plus(5, 'A ajouté son logo');
    if (c && (c.instagram || c.facebook)) plus(3, 'A renseigné ses réseaux sociaux');
    if (aPaiementCommence(fiche)) plus(25, 'A ouvert le paiement');

    var jointRecemment = (fiche.interactions || []).some(function (i) {
      return (i.resultat === 'joint' || i.resultat === 'rdv_pris') && jours(i.fait_at, maintenant) <= 7;
    });
    if (jointRecemment) plus(10, 'Joint ces 7 derniers jours');

    // L'appel de prospection ne compte que tant qu'aucune démo n'existe : ensuite, ce sont ses signaux qui parlent.
    if (nomEtape === 'prospect' && fiche.prospect) {
      var suite = { rdv: [40, 'Rendez-vous obtenu en prospection'], interesse: [30, 'Intéressé lors de l\'appel de prospection'],
        a_rappeler: [10, 'A demandé à être rappelé'] }[fiche.prospect.resultat];
      if (suite) plus(suite[0], suite[1]);
      // Le besoin de Marchéo constaté sur le prospect (voir chaleurProspect) nuance la chaleur de la fiche.
      var besoin = fiche.chaleurProspect;
      if (besoin && besoin.niveau === 'chaud') plus(BAREME_CHALEUR.fiche_chaud, 'Prospect chaud (besoin de Marchéo)');
      else if (besoin && besoin.niveau === 'froid') plus(BAREME_CHALEUR.fiche_froid, 'Prospect froid (besoin de Marchéo)');
    }

    if (age != null) {
      var recent = c ? 'Démo toute récente' : 'Contact tout récent';
      if (age <= 7) plus(15, recent);
      else if (age <= 14) plus(8, recent);
      else plus(-Math.min(25, 5 * Math.floor((age - 14) / 7)), (c ? 'Démo créée' : 'Premier contact') + ' il y a ' + age + ' jours');
      var visitesConnues = !(fiche.inconnu && fiche.inconnu.evenements);
      if (c && age > 10 && visitesConnues && !(s.derniereVisite && jours(s.derniereVisite, maintenant) < 7)) {
        plus(-10, 'Aucune visite de sa démo depuis 7 jours');
      }
    }
    if (fiche.relances && fiche.relances.stop) plus(-30, 'S\'est désinscrit des e-mails');
    if (nomEtape === 'prospect' && !fiche.telNormalise) plus(-5, 'Pas de téléphone');

    var valeur = borner(total);
    var niveau = valeur >= 60 ? 'chaud' : valeur >= 35 ? 'tiede' : 'froid';
    return {
      type: 'chaleur', valeur: valeur, niveau: niveau,
      libelle: { chaud: 'Chaud', tiede: 'Tiède', froid: 'Froid' }[niveau], raisons: trierRaisons(raisons)
    };
  }

  /* Nombre de jours sans commande d'une boutique en ligne qui devrait en recevoir, ou null si rien à signaler
     (vitrine, mise en ligne de moins de 14 jours, commande récente). */
  function joursSansCommande(fiche, maintenant) {
    var c = fiche.commercant, s = fiche.signaux || signauxVides();
    if (!c || c.offre === 'vitrine' || (fiche.inconnu && fiche.inconnu.commandes)) return null;
    var enLigneDepuis = jours(c.abonnement_debut || c.created_at, maintenant);
    if (!(enLigneDepuis > 14)) return null;
    if (!s.derniereCommande) return Math.min(60, enLigneDepuis);
    var n = jours(s.derniereCommande, maintenant);
    return n >= 14 ? n : null;
  }

  function scoreSante(fiche, maintenant) {
    var c = fiche.commercant || {}, s = fiche.signaux || signauxVides();
    var raisons = [], total = 50;
    function plus(points, libelle) { if (points) { total += points; raisons.push({ points: points, texte: libelle }); } }
    var vitrine = c.offre === 'vitrine';

    if (s.commandes30) plus(Math.min(25, 2 * s.commandes30), s.commandes30 + ' commande' + (s.commandes30 > 1 ? 's' : '') + ' sur 30 jours');
    if (s.commandes30 > 0 && s.commandes30 >= s.commandes30Avant) plus(10, 'Commandes stables ou en hausse');
    // Une vitrine ne prend pas de commande : on ne lui reproche pas d'en manquer.
    if (!vitrine && s.commandes30Avant > 0 && s.commandes30 < 0.5 * s.commandes30Avant) {
      plus(-15, 'Commandes en forte baisse (' + s.commandes30 + ' contre ' + s.commandes30Avant + ')');
    }
    if (c.stripe_connect_actif) plus(5, 'Encaissement en ligne branché');
    if (c.en_pause || c.actif === false) plus(-40, c.actif === false ? 'Boutique suspendue' : 'Boutique en pause');
    var sansCommande = joursSansCommande(fiche, maintenant);
    if (sansCommande != null) plus(-20, 'Aucune commande depuis ' + sansCommande + ' jours');

    var valeur = borner(total);
    var niveau = valeur >= 70 ? 'sain' : valeur >= 40 ? 'surveiller' : 'risque';
    return {
      type: 'sante', valeur: valeur, niveau: niveau,
      libelle: { sain: 'Saine', surveiller: 'À surveiller', risque: 'À risque' }[niveau], raisons: trierRaisons(raisons)
    };
  }

  /* Chaleur d'une fiche en cours, santé d'une boutique en ligne, rien pour une fiche perdue. */
  function score(fiche, maintenant) {
    maintenant = versDate(maintenant) || new Date();
    var nomEtape = etape(fiche);
    if (nomEtape === 'perdu') return null;
    return nomEtape === 'client' ? scoreSante(fiche, maintenant) : scoreChaleur(fiche, nomEtape, maintenant);
  }

  // ───────────────────────────── Prochaine action ─────────────────────────────

  function canalContact(fiche) {
    return fiche.telNormalise ? 'appel' : fiche.email ? 'email' : 'tache';
  }

  /* Vrai si quelque chose a été consigné sur la fiche depuis moins de n jours. L'appel de prospection compte
     comme une interaction, sauf pour les règles qu'il déclenche lui-même. */
  function enSilence(fiche, n, maintenant, sansProspection) {
    var dates = [fiche.derniereInteraction];
    if (!sansProspection) (fiche.prospects || []).forEach(function (p) { dates.push(p.appele_at); });
    var derniere = plusRecente(dates);
    return !!derniere && jours(derniere, maintenant) < n;
  }

  function actionTache(fiche, aujourdhui) {
    var limite = ajouterJours(aujourdhui, 7);
    var ouvertes = (fiche.taches || []).filter(function (t) { return !t.fait_at && t.echeance; });
    ouvertes.sort(function (a, b) { return a.echeance < b.echeance ? -1 : a.echeance > b.echeance ? 1 : 0; });
    var t = ouvertes[0];
    if (!t || t.echeance > limite) return null;
    var retard = jours(t.echeance, aujourdhui);
    return {
      id: 'tache', urgence: retard > 0 ? 'retard' : retard === 0 ? 'aujourdhui' : 'semaine',
      titre: t.titre,
      raison: retard > 0 ? 'Tâche en retard de ' + retard + ' j' : retard === 0 ? 'Tâche prévue aujourd\'hui' : 'Tâche prévue le ' + dateCourte(t.echeance),
      canal: 'tache', tacheId: t.id, echeance: t.echeance
    };
  }

  function actionProspection(fiche, aujourdhui, maintenant) {
    var p = fiche.prospect;
    if (!p) return null;
    if (p.resultat === 'rdv' && !enSilence(fiche, 3, maintenant, true)) {
      return { id: 'prospection_rdv', urgence: 'aujourdhui', titre: 'Créer sa démo / préparer le rendez-vous',
        raison: 'Rendez-vous obtenu lors de l\'appel de prospection', canal: 'tache' };
    }
    if (p.resultat === 'interesse' && !enSilence(fiche, 3, maintenant)) {
      return { id: 'prospection_interesse', urgence: 'aujourdhui', titre: 'Rappeler : intéressé lors de l\'appel de prospection',
        raison: p.appele_at ? 'Appelé ' + ilYA(jours(p.appele_at, maintenant)) : 'Intéressé lors de l\'appel', canal: canalContact(fiche) };
    }
    if (p.resultat === 'a_rappeler' && !enSilence(fiche, 2, maintenant, true)) {
      var rappel = texte(p.rappel_le).slice(0, 10);
      // Un échange abouti le jour du rappel ou après l'honore : sans cela il reviendrait « en retard » à vie.
      // Un appel tombé sur la messagerie ou resté sans réponse ne compte pas, le rappel reste dû.
      var honore = (fiche.interactions || []).some(function (i) {
        if (TYPES_CONTACT.indexOf(i.type) < 0 || !i.fait_at) return false;
        if (i.resultat === 'messagerie' || i.resultat === 'pas_de_reponse') return false;
        return rappel ? dateLocaleISO(i.fait_at) >= rappel : ms(i.fait_at) > ms(p.appele_at);
      });
      if (honore) return null;
      if (rappel) {
        if (rappel > ajouterJours(aujourdhui, 7)) return null;
        var retard = jours(rappel, aujourdhui);
        return { id: 'prospection_rappel', urgence: retard > 0 ? 'retard' : retard === 0 ? 'aujourdhui' : 'semaine',
          titre: 'Rappeler comme convenu',
          raison: retard > 0 ? 'Rappel prévu le ' + dateCourte(rappel) + ', en retard de ' + retard + ' j'
            : retard === 0 ? 'Rappel prévu aujourd\'hui' : 'Rappel prévu le ' + dateCourte(rappel),
          canal: canalContact(fiche), echeance: rappel };
      }
      if (p.appele_at && jours(p.appele_at, maintenant) >= 2) {
        return { id: 'prospection_rappel', urgence: 'aujourdhui', titre: 'Rappeler comme convenu',
          raison: 'A demandé à être rappelé ' + ilYA(jours(p.appele_at, maintenant)), canal: canalContact(fiche) };
      }
    }
    return null;
  }

  /* Première règle vraie. Les règles calculées se taisent pendant un report ou juste après une interaction ;
     une tâche, elle, ne se tait jamais. */
  function prochaineAction(fiche, maintenant) {
    maintenant = versDate(maintenant) || new Date();
    var aujourdhui = dateLocaleISO(maintenant);
    var nomEtape = etape(fiche);

    // 1. Tâche ouverte.
    var tache = actionTache(fiche, aujourdhui);
    if (tache) return tache;
    if (nomEtape === 'perdu') return null;
    if (fiche.crm && fiche.crm.reporte_jusqua && texte(fiche.crm.reporte_jusqua).slice(0, 10) > aujourdhui) return null;

    var c = fiche.commercant, a = fiche.audit, s = fiche.signaux || signauxVides();
    var age = ageFiche(fiche, maintenant);
    var interactions = (fiche.interactions || []).filter(function (i) { return i.type !== 'etape'; });

    // 2. Deuxième rendez-vous d'audit aujourd'hui ou demain.
    if (a && a.rdv2_date) {
      var rdv = texte(a.rdv2_date).slice(0, 10);
      if (rdv === aujourdhui || rdv === ajouterJours(aujourdhui, 1)) {
        var heure = texte(a.data && a.data.r2_heure);
        return { id: 'rdv2', urgence: 'aujourdhui', titre: 'Préparer le 2ᵉ rendez-vous',
          raison: 'Rendez-vous ' + (rdv === aujourdhui ? 'aujourd\'hui' : 'demain') + (heure ? ' à ' + heure : ''),
          canal: 'tache', echeance: rdv };
      }
    }

    // 3. Paiement commencé sans aboutir.
    if (nomEtape === 'paiement' && !enSilence(fiche, 2, maintenant)) {
      return { id: 'paiement', urgence: 'aujourdhui', titre: 'Appeler : paiement resté en attente',
        raison: 'A ouvert le paiement sans terminer' + (s.paiementCommenceLe ? ' ' + ilYA(jours(s.paiementCommenceLe, maintenant)) : ''),
        canal: canalContact(fiche) };
    }

    // Règles 4 à 6 : elles reposent sur les échanges consignés, donc muettes si on n'a pas pu les lire.
    var echangesConnus = !(fiche.inconnu && fiche.inconnu.interactions);
    if (estDemo(nomEtape) && echangesConnus && !enSilence(fiche, 3, maintenant)) {
      // 4. Signalée « à appeler » par le suivi automatique, jamais appelée.
      var dejaAppelee = interactions.some(function (i) { return i.type === 'appel'; });
      if (fiche.relances && fiche.relances.appel && !dejaAppelee) {
        return { id: 'signalee', urgence: 'aujourdhui', titre: 'Appeler cette démo',
          raison: 'Signalée à appeler, pas encore appelée', canal: canalContact(fiche) };
      }
      // 5. Démo toute fraîche, sans aucun échange.
      if (age != null && age <= 7 && !interactions.length) {
        return { id: 'fraiche', urgence: 'aujourdhui', titre: 'Appeler tant que c\'est frais',
          raison: 'Démo créée ' + ilYA(age), canal: canalContact(fiche) };
      }
      // 6. Démo chaude laissée sans contact.
      var chaleur = fiche.score || score(fiche, maintenant);
      var sansContact = !fiche.dernierContact || jours(fiche.dernierContact, maintenant) >= 3;
      if (chaleur && chaleur.valeur >= 60 && sansContact) {
        var positive = chaleur.raisons.filter(function (r) { return r.points > 0; })[0];
        return { id: 'chaude', urgence: 'aujourdhui', titre: 'Relancer cette démo chaude',
          raison: positive ? positive.texte : 'Démo chaude sans contact depuis 3 jours', canal: canalContact(fiche) };
      }
    }

    if (nomEtape === 'prospect') {
      // Appels de prospection ayant donné une suite.
      var prospection = actionProspection(fiche, aujourdhui, maintenant);
      if (prospection) return prospection;
      // 7. Inscription commencée sans compte.
      var ageLead = c ? null : ageInscription(fiche, maintenant);
      if (ageLead != null && ageLead <= 7 && !enSilence(fiche, 3, maintenant)) {
        return { id: 'inscription', urgence: 'aujourdhui', titre: 'Inscription commencée sans finir',
          raison: (fiche.lead.tentatives > 1 ? 'A retenté son inscription ' : 'A commencé son inscription ') + ilYA(ageLead),
          canal: fiche.telNormalise ? 'appel' : 'email' };
      }
    }

    // 8. Boutique en ligne qui décroche.
    if (nomEtape === 'client' && !enSilence(fiche, 14, maintenant)) {
      var sante = fiche.score || score(fiche, maintenant);
      var sansCommande = joursSansCommande(fiche, maintenant);
      if (sansCommande != null || (sante && sante.valeur < 40)) {
        return { id: 'client', urgence: 'semaine', titre: 'Prendre des nouvelles',
          raison: sansCommande != null ? 'Aucune commande depuis ' + sansCommande + ' j' : 'Santé à ' + sante.valeur + ' sur 100',
          canal: canalContact(fiche) };
      }
    }

    // 9. Démo dormante : décider.
    if (estDormante(fiche, maintenant) && !enSilence(fiche, 30, maintenant)) {
      var dernierSigne = plusRecente([s.derniereVisite, fiche.derniereInteraction, fiche.depuis]);
      return { id: 'dormante', urgence: 'semaine', titre: 'Clore ou relancer',
        raison: 'Aucun signe depuis ' + Math.max(0, jours(dernierSigne, maintenant)) + ' j', canal: 'tache' };
    }
    return null;
  }

  // ───────────────────────────── Fil d'activité ─────────────────────────────

  function titreInteraction(i) {
    var resultat = i.resultat ? LIBELLES_RESULTAT[i.resultat] || i.resultat : '';
    switch (i.type) {
      case 'note': return 'Note';
      case 'appel': return 'Appel' + (resultat ? ' : ' + resultat.toLowerCase() : '');
      case 'email': return 'E-mail envoyé';
      case 'sms': return 'SMS envoyé';
      case 'whatsapp': return 'WhatsApp envoyé';
      case 'rdv': return 'Rendez-vous';
      case 'visite': return 'Visite sur place';
      case 'etape': return i.resultat === 'rouvert' ? 'Fiche rouverte' : 'Fiche marquée perdue';
      default: return 'Échange';
    }
  }

  /* Du plus récent au plus ancien : ce qui a été consigné à la main (supprimable) et ce que la plateforme sait. */
  function fil(fiche) {
    var entrees = [];
    function auto(type, date, titre, detail) {
      if (!date) return;
      entrees.push({ date: date, type: type, auto: true, titre: titre, detail: detail || undefined, supprimable: false });
    }
    var c = fiche.commercant, s = fiche.signaux || signauxVides(), r = fiche.relances || {};

    (fiche.interactions || []).forEach(function (i) {
      entrees.push({
        id: i.id, date: i.fait_at, type: i.type, auto: false, titre: titreInteraction(i),
        detail: i.contenu || undefined, resultat: i.resultat || undefined, supprimable: true
      });
    });

    (fiche.leads || (fiche.lead ? [fiche.lead] : [])).forEach(function (l) {
      var offre = OFFRES[l.offre] ? 'Offre ' + OFFRES[l.offre].nom : '';
      var tentatives = l.tentatives > 1 ? l.tentatives + ' tentatives' : '';
      auto('inscription', l.created_at, 'Inscription commencée', [offre, tentatives].filter(Boolean).join(' · '));
      if (l.tentatives > 1 && ms(l.derniere_tentative) > ms(l.created_at)) {
        auto('inscription', l.derniere_tentative, 'Nouvelle tentative d\'inscription');
      }
    });
    (fiche.audits || (fiche.audit ? [fiche.audit] : [])).forEach(function (a) {
      auto('audit', a.created_at, 'Audit terrain', a.mode ? 'Audit ' + a.mode : '');
    });
    (fiche.prospects || (fiche.prospect ? [fiche.prospect] : [])).forEach(function (p) {
      var res = resultatProspectDe(p.resultat);
      if (res) auto('prospection', p.appele_at, 'Appel de prospection : ' + res.libelle.toLowerCase(), p.note);
    });

    if (c) {
      auto('demo', c.created_at, 'Démo créée');
      [['j0', 'le jour même'], ['j1', 'J+1'], ['j3', 'J+3'], ['j7', 'J+7']].forEach(function (e) {
        auto('email_auto', r[e[0]], 'E-mail automatique envoyé', 'Suivi ' + e[1]);
      });
      auto('signalee', r.appel, 'Signalée à appeler');
      auto('desinscription', r.stop, 'S\'est désinscrit des e-mails automatiques');
      (s.visitesParJour || []).forEach(function (v) {
        auto('visite_demo', v.date, 'Visite de sa démo', v.nb + ' page' + (v.nb > 1 ? 's vues' : ' vue'));
      });
      (s.partagesParJour || []).forEach(function (p) {
        auto('partage', p.date, 'Démo partagée', 'Un tiers a essayé de l\'ouvrir' + (p.nb > 1 ? ' (' + p.nb + ' fois)' : ''));
      });
      (s.paiementsCommences || []).forEach(function (d) { auto('paiement', d, 'Paiement commencé'); });
      // Les commandes ne sont chargées que sur 60 jours : la « première » n'est sûre que pour un compte plus jeune.
      if (s.premiereCommande && s.premiereCommandeSure) auto('commande', s.premiereCommande, 'Première commande');
      if (c.abonnement_debut) auto('mise_en_ligne', c.abonnement_debut, 'Mise en ligne');
      if (c.abonnement_actif !== true && c.abonnement_fin) auto('resiliation', c.abonnement_fin, 'Résiliation');
    }

    return entrees.sort(function (x, y) { return ms(y.date) - ms(x.date); });
  }

  // ───────────────────────────── Modèles de message et liens ─────────────────────────────

  function lienBoutique(fiche, origine) {
    if (!fiche.slug) return '';
    var c = fiche.commercant || {};
    var lien = (origine || ORIGINE_DEFAUT).replace(/\/+$/, '') + '/' + encodeURIComponent(fiche.slug);
    // Une démo pas encore en ligne est privée : sans ce paramètre, le commerçant tomberait sur une page fermée.
    if (c.abonnement_actif !== true && c.auth_user_id && c.id) {
      lien += '?apercu=' + String(c.id).replace(/-/g, '').slice(0, 10);
    }
    return lien;
  }

  function phrasePrix(fiche) {
    var o = OFFRES[fiche.offre];
    if (!o) return '';
    return 'L\'offre ' + o.nom + ' est à ' + o.mensuel + ' € par mois, plus ' + o.installation + ' € d\'installation, payés une seule fois.';
  }

  function modeles(fiche, config) {
    config = config || {};
    var nomEtape = fiche.etape || etape(fiche);
    var prenom = texte(fiche.gerant).split(/\s+/)[0];
    var bonjour = prenom ? 'Bonjour ' + prenom + ',' : 'Bonjour,';
    var boutique = fiche.nom && fiche.nom !== 'Sans nom' && fiche.nom.indexOf('@') < 0 ? fiche.nom : '';
    var votreBoutique = boutique ? 'votre boutique en ligne ' + boutique : 'votre boutique en ligne';
    var lien = lienBoutique(fiche, config.origine);
    var prix = phrasePrix(fiche);
    var signature = 'Bonne journée,\n' + (texte(config.signature) || 'L\'équipe Marchéo');
    function assembler(paragraphes) {
      return [bonjour].concat(paragraphes.filter(Boolean)).concat([signature]).join('\n\n');
    }

    var tous = [
      {
        id: 'demo_prete', titre: 'Démo prête, on en parle ?', etapes: ['demo', 'demo_engagee', 'paiement'],
        sujet: boutique ? 'Votre boutique en ligne ' + boutique + ' est prête' : 'Votre boutique en ligne est prête',
        texte: assembler([
          'La démonstration de ' + votreBoutique + ' est prête. Vous pouvez la parcourir comme le feront vos clients' + (lien ? ' : ' + lien : '.'),
          'Auriez-vous dix minutes cette semaine pour la regarder ensemble ? Je vous montre comment ajouter vos produits et recevoir vos premières commandes.',
          prix
        ])
      },
      {
        id: 'produits_phares', titre: 'Vos 3 produits phares', etapes: ['prospect', 'demo', 'demo_engagee'],
        sujet: 'Vos trois produits phares',
        texte: assembler([
          'Pour que ' + votreBoutique + ' vous ressemble vraiment, pouvez-vous m\'envoyer vos trois produits phares, avec leur prix et une photo si vous en avez une ?',
          'Je les ajoute moi-même, vous n\'avez rien d\'autre à faire.' + (lien ? ' Vous verrez le résultat ici : ' + lien : '')
        ])
      },
      {
        id: 'paiement_attente', titre: 'Paiement resté en attente', etapes: ['paiement'],
        sujet: 'Votre mise en ligne est restée en attente',
        texte: assembler([
          'J\'ai vu que vous aviez commencé la mise en ligne de ' + votreBoutique + ', sans aller jusqu\'au bout. Avez-vous rencontré un souci au moment du paiement, ou une question est-elle restée sans réponse ?',
          prix ? 'Pour rappel : ' + prix.charAt(0).toLowerCase() + prix.slice(1) : '',
          lien ? 'Vous pouvez reprendre quand vous voulez : ' + lien : '',
          'Si vous préférez, je vous appelle et nous le faisons ensemble en cinq minutes.'
        ])
      },
      {
        id: 'relance_douce', titre: 'Relance douce après silence', etapes: ['prospect', 'demo', 'demo_engagee', 'paiement', 'perdu'],
        sujet: boutique ? 'Votre boutique en ligne ' + boutique : 'Votre boutique en ligne',
        texte: assembler([
          'Je me permets de revenir vers vous au sujet de ' + votreBoutique + '. Je sais que les journées sont chargées dans un commerce, alors je fais court.',
          'Souhaitez-vous que nous avancions, ou préférez-vous que je vous recontacte plus tard ? Un simple oui ou non me suffit.',
          lien && nomEtape !== 'perdu' ? 'Votre démonstration est toujours disponible : ' + lien : ''
        ])
      },
      {
        id: 'nouvelles_boutique', titre: 'Des nouvelles de votre boutique', etapes: ['client'],
        sujet: 'Des nouvelles de votre boutique en ligne',
        texte: assembler([
          'Je prends des nouvelles de ' + votreBoutique + '. Tout se passe-t-il comme vous le souhaitez ?',
          'Si vous avez une question, un produit à ajouter ou une idée pour faire venir plus de clients, dites-le-moi : je m\'en occupe avec vous.',
          lien ? 'Votre boutique : ' + lien : ''
        ])
      }
    ];
    return tous.filter(function (m) { return m.etapes.indexOf(nomEtape) >= 0; })
      .map(function (m) { return { id: m.id, titre: m.titre, sujet: m.sujet, texte: m.texte }; });
  }

  /* Liens d'action prêts à mettre dans un href (à échapper par escHtml comme toute valeur d'attribut). */
  function liens(fiche, message, sujet) {
    var inter = telInternational(fiche && fiche.telephone);
    var email = normaliserEmail(fiche && fiche.email);
    var corps = texte(message), objet = texte(sujet);
    var parametresMail = [];
    if (objet) parametresMail.push('subject=' + encodeURIComponent(objet));
    if (corps) parametresMail.push('body=' + encodeURIComponent(corps));
    return {
      tel: inter ? 'tel:+' + inter : null,
      // « ?&body= » est la seule écriture comprise à la fois par iOS et Android.
      sms: inter ? 'sms:+' + inter + (corps ? '?&body=' + encodeURIComponent(corps) : '') : null,
      whatsapp: inter ? 'https://wa.me/' + inter + (corps ? '?text=' + encodeURIComponent(corps) : '') : null,
      mail: email ? 'mailto:' + encodeURIComponent(email).replace(/%40/g, '@') + (parametresMail.length ? '?' + parametresMail.join('&') : '') : null
    };
  }

  // ───────────────────────────── Présence en ligne : fiche Google, Instagram, Facebook ─────────────────────────────

  var RESEAUX = [
    { id: 'google', libelle: 'Fiche Google', court: 'Google', colonne: 'lien_google', colonneProspect: 'google_url',
      exemple: 'Coller le lien Google Maps',
      erreur: 'Ce n\'est pas un lien Google valable. Collez le lien de partage de la fiche (Google Maps, bouton « Partager »).' },
    { id: 'instagram', libelle: 'Instagram', court: 'Instagram', colonne: 'lien_instagram', colonneProspect: 'instagram',
      exemple: 'Coller le lien ou l\'@identifiant',
      erreur: 'Ce n\'est pas un lien Instagram valable. Collez l\'adresse du profil (https://www.instagram.com/nom) ou son @identifiant.' },
    { id: 'facebook', libelle: 'Facebook', court: 'Facebook', colonne: 'lien_facebook', colonneProspect: 'facebook',
      exemple: 'Coller le lien Facebook',
      erreur: 'Ce n\'est pas un lien Facebook valable. Collez l\'adresse de la page (https://www.facebook.com/nom).' }
  ];
  var LONGUEUR_LIEN = 500;
  // Premiers segments d'une adresse Instagram qui ne désignent pas un profil.
  var RESERVES_INSTAGRAM = ['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'tv', 'direct', 'about', 'developer', 'legal', 'share', '_u', '_n'];
  // Premiers segments qui précèdent le nom du profil dans un lien d'application (« instagram.com/_u/nom »).
  var PREFIXES_INSTAGRAM = ['_u', '_n'];
  var DOMAINES_GOOGLE = '(com|fr|be|ch|lu|ca|es|it|de|co\\.uk)';
  var HOTE_GOOGLE = new RegExp('^(www\\.)?google\\.' + DOMAINES_GOOGLE + '$');
  var HOTE_GOOGLE_MAPS = new RegExp('^maps\\.google\\.' + DOMAINES_GOOGLE + '$');
  /* Liens courts de partage d'une fiche : pour chaque hôte, le chemin exigé. Un raccourcisseur générique
     (« goo.gl/abc », « g.co/abc ») peut mener n'importe où : seules les formes propres aux fiches passent. */
  var HOTES_GOOGLE_COURTS = {
    'maps.app.goo.gl': /^\/[^\/]/, 'g.page': /^\/[^\/]/, 'share.google': /^\/[^\/]/,
    'goo.gl': /^\/maps\/[^\/]/i, 'g.co': /^\/kgs\/[^\/]/i
  };
  // Fins de nom de domaine courantes : « lefournil.fr » tapé seul est un site, pas un identifiant.
  var FIN_DOMAINE = /\.(fr|com|net|org|eu|be|ch|lu|de|es|it|uk|io|co|me|shop|store|site|online|info|biz|bzh|paris|boutique|restaurant|pro|app|page)$/i;

  function reseauDe(id) {
    for (var i = 0; i < RESEAUX.length; i++) if (RESEAUX[i].id === id) return RESEAUX[i];
    return null;
  }

  function analyserUrl(v) {
    if (typeof URL === 'undefined') return null;
    try { return new URL(v); } catch (e) { return null; }
  }

  /* Rend l'adresse https normalisée d'une fiche Google, d'un profil Instagram ou d'une page Facebook, ou une
     chaîne vide si la valeur n'en est pas une. Accepte une URL (http ou https, avec ou sans « https:// ») et,
     pour Instagram et Facebook, un identifiant (« @nom » ou « nom »). Tout autre schéma (javascript:, data:…),
     tout autre site et toute valeur trop longue sont refusés : le résultat peut aller dans un href.
     L'apostrophe est admise à l'entrée (« …/maps/place/L'Épi+d'Or/… ») mais ne sort jamais : elle est réécrite
     en %27 pour Google et refusée par les règles d'Instagram et de Facebook. Le résultat est stable : le
     repasser par la fonction rend la même adresse. */
  function normaliserLien(reseau, valeur) {
    var v = texte(valeur);
    if (!reseauDe(reseau) || !v || v.length > LONGUEUR_LIEN || /[\s\u0000-\u001f\u007f<>"`\\]/.test(v)) return '';
    var schema = /^([a-z][a-z0-9+.\-]*):/i.exec(v);
    var url = null;
    if (schema) {
      if (!/^https?$/i.test(schema[1]) || !/^https?:\/\/[^\/]/i.test(v)) return '';
      url = analyserUrl(v);
      if (!url) return '';
    } else if (v.indexOf('/') >= 0) {
      // « www.instagram.com/nom », « //facebook.com/nom » : une adresse écrite sans son schéma.
      url = analyserUrl('https://' + v.replace(/^\/+/, ''));
      if (!url) return '';
    }
    var lien = url ? lienDepuisUrl(reseau, url) : lienDepuisIdentifiant(reseau, v);
    if (lien && !url) {
      // Un identifiant suit les mêmes règles qu'une adresse (segments réservés, « .php »…) : on repasse par elles.
      url = analyserUrl(lien);
      lien = url ? lienDepuisUrl(reseau, url) : '';
    }
    return lien && lien.length <= LONGUEUR_LIEN ? lien : '';
  }

  function lienDepuisIdentifiant(reseau, v) {
    var id = v.replace(/^@/, '');
    // Un nom de site tapé seul (« instagram.com ») n'est pas un identifiant.
    if (/^(www\.|m\.)?(instagram|facebook|fb|google)\.[a-z]{2,6}$/i.test(id)) return '';
    /* Ni un nom de domaine quelconque (« www.lefournil.fr », « lefournil.fr ») : sans cela le site du commerce
       deviendrait un faux profil. Un identifiant qui finit vraiment ainsi se saisit avec son « @ ». */
    if (/^(www|m)\./i.test(id) || (v.charAt(0) !== '@' && FIN_DOMAINE.test(id))) return '';
    if (reseau === 'instagram') {
      return /^[a-z0-9._]{1,30}$/i.test(id) && /[a-z0-9]/i.test(id) ? 'https://www.instagram.com/' + id.toLowerCase() + '/' : '';
    }
    if (reseau === 'facebook') {
      return /^[a-z0-9.\-]{2,80}$/i.test(id) && /[a-z0-9]/i.test(id) ? 'https://www.facebook.com/' + id : '';
    }
    return '';
  }

  function lienDepuisUrl(reseau, url) {
    if (url.username || url.password || url.port) return '';
    var hote = url.hostname.toLowerCase().replace(/\.$/, '');
    var chemin = url.pathname.replace(/\/+$/, '');
    if (reseau === 'instagram') {
      if (!/^((www|m)\.)?instagram\.com$/.test(hote) && hote !== 'instagr.am') return '';
      var segments = chemin.split('/');
      var id = (PREFIXES_INSTAGRAM.indexOf((segments[1] || '').toLowerCase()) >= 0 ? segments[2] : segments[1]) || '';
      if (!/^[a-z0-9._]{1,30}$/i.test(id) || RESERVES_INSTAGRAM.indexOf(id.toLowerCase()) >= 0) return '';
      return 'https://www.instagram.com/' + id.toLowerCase() + '/';
    }
    if (reseau === 'facebook') {
      // « fb.me » est un raccourcisseur : son code n'est pas un chemin de facebook.com, l'hôte est donc gardé.
      var courtFb = /^(www\.)?fb\.me$/.test(hote);
      if (!/^([a-z0-9\-]+\.)?facebook\.com$/.test(hote) && !/^(www\.)?fb\.com$/.test(hote) && !courtFb) return '';
      if (!chemin || !/^[\/A-Za-z0-9._~%\-]+$/.test(chemin)) return '';
      // Les anciens profils n'ont pas de nom : « profile.php?id=123 ».
      var numero = /^\/(profile|people)\.php$/i.test(chemin) ? /^\d{3,25}$/.exec(url.searchParams.get('id') || '') : null;
      if (/\.php$/i.test(chemin) && (!numero || courtFb)) return '';
      if (courtFb) return 'https://fb.me' + chemin;
      return 'https://www.facebook.com' + chemin + (numero ? '?id=' + numero[0] : '');
    }
    /* Google : l'hôte ne suffit pas (« google.com/url?q=… » redirige n'importe où, « sites.google.com » héberge
       des pages de tiers). Seules passent les adresses de Maps, une recherche Google, et les liens courts de
       partage d'une fiche. Le chemin testé est celui que `URL` a déjà normalisé (« /maps/../url » vaut « /url »). */
    var q = url.searchParams;
    var ok = false;
    if (HOTE_GOOGLE.test(hote)) {
      ok = /^\/maps(\/|$)/i.test(url.pathname) ? (chemin.length > 5 || !!url.search)
        : /^\/search\/?$/i.test(url.pathname) && !!(q.get('q') || q.get('kgmid') || q.get('ludocid'));
    } else if (HOTE_GOOGLE_MAPS.test(hote)) {
      ok = /^\/maps(\/|$)/i.test(url.pathname) ? (chemin.length > 5 || !!url.search)
        : url.pathname === '/' && !!(q.get('cid') || q.get('q'));
    } else if (Object.prototype.hasOwnProperty.call(HOTES_GOOGLE_COURTS, hote)) {
      ok = HOTES_GOOGLE_COURTS[hote].test(url.pathname);
    }
    if (!ok) return '';
    return ('https://' + hote + url.pathname + url.search).replace(/'/g, '%27');
  }

  // Lien court Google dont la destination n'est pas forcément Maps : l'affichage montre alors son hôte.
  function estLienMaps(url) {
    var u = analyserUrl(texte(url));
    if (!u) return false;
    var hote = u.hostname.toLowerCase();
    return hote === 'maps.app.goo.gl' || hote === 'g.page' || HOTE_GOOGLE_MAPS.test(hote) ||
      ((HOTE_GOOGLE.test(hote) || hote === 'goo.gl') && /^\/maps(\/|$)/i.test(u.pathname));
  }

  // Première valeur de la liste qui donne un lien valable (une étiquette peut en contenir plusieurs, séparées par « ; »).
  function premierLien(reseau, valeurs) {
    for (var i = 0; i < valeurs.length; i++) {
      var morceaux = texte(valeurs[i]).split(/\s*;\s*/);
      for (var k = 0; k < morceaux.length; k++) {
        var lien = normaliserLien(reseau, morceaux[k]);
        if (lien) return lien;
      }
    }
    return '';
  }

  /* Premier lien valable parmi des colonnes déjà normalisées (crm_fiches, crm_prospects, commercants) : la
     valeur est relue entière, sans découpage sur « ; » (une adresse Google peut en contenir). */
  function premierLienEntier(reseau, valeurs) {
    for (var i = 0; i < valeurs.length; i++) {
      var lien = normaliserLien(reseau, valeurs[i]);
      if (lien) return lien;
    }
    return '';
  }

  /* Recherches toutes prêtes pour retrouver un commerce : sa fiche sur Google Maps, puis son profil Instagram
     et sa page Facebook par une recherche Google ciblée. Elles existent toujours, même sans commune. */
  function recherchesPresence(nom, commune) {
    var n = texte(nom);
    var quoi = [n === 'Sans nom' ? '' : n, texte(commune)].filter(Boolean).join(' ');
    return {
      google: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(quoi),
      instagram: 'https://www.google.com/search?q=' + encodeURIComponent((quoi + ' instagram').trim()),
      facebook: 'https://www.google.com/search?q=' + encodeURIComponent((quoi + ' facebook').trim())
    };
  }

  /* Présence en ligne d'un commerce. `sources` : { nom, commune, etats (lignes crm_fiches), prospects, commercant }.
     Pour chaque réseau : { url, origine, recherche }. Priorité : lien saisi à la main (crm_fiches) > lien trouvé
     à la recherche (crm_prospects) > lien de la boutique (commercants). origine ∈ 'manuel', 'trouve', 'boutique',
     ou null quand rien n'est connu (url vaut alors ''). */
  function presence(sources) {
    sources = sources || {};
    var recherches = recherchesPresence(sources.nom, sources.commune);
    var etats = (sources.etats || []).filter(Boolean), prospects = (sources.prospects || []).filter(Boolean);
    var c = sources.commercant || null;
    var resultat = {};
    RESEAUX.forEach(function (r) {
      var url = premierLienEntier(r.id, etats.map(function (e) { return e[r.colonne]; })), origine = url ? 'manuel' : null;
      if (!url) { url = premierLienEntier(r.id, prospects.map(function (p) { return p[r.colonneProspect]; })); if (url) origine = 'trouve'; }
      if (!url && c && r.id !== 'google') { url = premierLienEntier(r.id, [c[r.id]]); if (url) origine = 'boutique'; }
      resultat[r.id] = { url: url, origine: origine, recherche: recherches[r.id] };
    });
    return resultat;
  }

  // ───────────────────────────── Chaleur des prospects ─────────────────────────────

  /* Deux « chaleurs » existent et ne se confondent pas :
     - la chaleur de la FICHE (scoreChaleur, plus haut) : avancement du suivi une fois le contact pris ;
     - la chaleur du PROSPECT (ici) : probabilité qu'il ait besoin de Marchéo ET qu'il soit joignable / réceptif.
     Elle se calcule à partir de signaux stockés (crm_prospects.signaux = { v, osm, site, google }) : ceux
     d'OpenStreetMap sont posés par le navigateur dès la recherche, ceux du site et de la fiche Google par la
     fonction crm-enrichir. La note n'est jamais stockée : changer un poids ci-dessous suffit, sans réanalyse.
     Un signal absent veut dire « pas vu », jamais « non ». */

  // Colonnes de la migration 20261116_crm_chaleur.sql.
  var COLONNES_CHALEUR = ['signaux', 'analyse_at', 'chaleur_manuelle', 'reseaux_actifs', 'google_note', 'google_avis', 'lat', 'lon'];
  var NIVEAUX_CHALEUR = [
    { id: 'chaud', libelle: 'Chaud' }, { id: 'tiede', libelle: 'Tiède' }, { id: 'froid', libelle: 'Froid' },
    { id: 'non_analyse', libelle: 'Pas encore analysé' }
  ];
  var NIVEAUX_MANUELS = ['chaud', 'tiede', 'froid'];
  var ACTIVITES_RESEAUX = ['actif', 'peu_actif'];
  var TAILLE_SIGNAUX = 6000;

  // Tous les poids de la note. Base 30, bornes 0 à 100 ; Chaud à partir de 60, Tiède de 40 à 59, Froid en dessous.
  var BAREME_CHALEUR = {
    base: 30, chaud: 60, tiede: 40,
    // Commande en ligne : le signal le plus fort, dans les deux sens. Une boutique ou une plateforme détectée
    // plafonne la note à Froid (plafond_froid), quels que soient les autres signaux ; seul un appel qui se passe
    // bien (intéressé, rendez-vous) ou le réglage manuel passent au-dessus.
    boutique: -45, plateforme: -25, sans_commande: 20, plafond_froid: 39,
    // Site.
    reseau_seul: 18, sans_site_confirme: 18, sans_site: 10, parking: 15, injoignable: 0, vieillot: 8,
    // Commandes déjà prises à la main, offre qui se commande à l'avance (le trio est plafonné).
    precommande_telephone: 12, precommande_formulaire: 10, traiteur: 12, evenements: 8, fetes: 6, sur_commande: 6, plafond_traiteur: 20,
    commission: 10, livraison: 4, anti_gaspi: 3,
    multi: 10, meme_nom: 0, enseigne: -25,
    reseaux_un: 6, reseaux_deux: 8, reseaux_actifs: 10, reseaux_peu: -3,
    google_frequente: 10, google_installe: 6, google_mal_note: -5, ferme_temporaire: -20,
    avis_frequente: 100, note_frequente: 4.2, avis_installe: 30, note_installe: 4, avis_mal_note: 20, note_mal_note: 3.5,
    horaires: 2, email: 3, mobile: 5, sans_tel: -15,
    metiers: { traiteur: 10, boucherie: 8, poissonnerie: 8, patisserie: 8, fromagerie: 6, fleuriste: 6, boulangerie: 5, primeur: 4,
      epicerie: 2, restaurant: 0, pizzeria: -5, fastfood: -5 },
    metier_a_l_avance: 5,
    r_rdv: 20, r_interesse: 15, r_deja_site: -40, r_refus: -30, r_faux: -15, r_silence: -8, appels_silence: 4,
    // Apport à la chaleur de la fiche (pipeline) d'un prospect chaud ou froid.
    fiche_chaud: 10, fiche_froid: -10,
    /* Étude du commerce (crm_prospects.etude, écrite par la tâche planifiée) : elle complète les signaux, pondérée
       par sa confiance (forte × 1, moyenne × 0,6 ; faible ou commerce non identifié : pas comptée du tout).
       La note Marchéo (0 à 10) pèse (note − 5) × 3, borné à ±15. */
    etude: { forte: 1, moyenne: 0.6, commande: -45, sans_commande: 12, traiteur: 12, multi: 10, reseaux: 8, reseaux_peu: -3,
      avis_frequente: 10, avis_installe: 6, avis_mal_note: -5, avis_bons: 4, avis_mauvais: -4, note_centre: 5, note_pas: 3, note_max: 15 },
    rangs: { chaud: 3000, tiede: 2000, non_analyse: 1500, froid: 1000, exclu: 0 }
  };

  // Identifiants des listes fermées de la fonction crm-enrichir → mots lisibles. Un identifiant inconnu n'est pas affiché.
  var LIBELLES_OUTILS = {
    woocommerce: 'WooCommerce', shopify: 'Shopify', prestashop: 'PrestaShop', wix_stores: 'Wix', squarespace_commerce: 'Squarespace',
    ecwid: 'Ecwid', magento: 'Magento', wizishop: 'WiziShop', oxatis: 'Oxatis', sumup_boutique: 'SumUp', square_boutique: 'Square',
    snipcart: 'Snipcart', jimdo_boutique: 'Jimdo', produit_structure: 'fiches produit avec prix', panier_texte: 'panier sur son site',
    ollca: 'Ollca', epicery: 'Epicery', rapidle: 'Rapidle', pourdebon: 'Pourdebon', mavillemonshopping: 'Ma Ville Mon Shopping',
    wishibam: 'Wishibam', cagette: 'Cagette', laruche: 'La Ruche qui dit Oui', locavor: 'Locavor', dood: 'Dood', livepepper: 'LivePepper',
    gloriafood: 'GloriaFood', zelty: 'Zelty', innovorder: 'Innovorder', obypay: 'Obypay', flipdish: 'Flipdish', sumup_commande: 'SumUp',
    monbanquet: 'Monbanquet', coopcycle: 'CoopCycle',
    ubereats: 'Uber Eats', deliveroo: 'Deliveroo', justeat: 'Just Eat', delicity: 'Delicity', lyveat: 'Lyveat'
  };
  var LIBELLES_MOTS = {
    traiteur: 'traiteur', plateau: 'plateaux', buffet: 'buffets', cocktail: 'cocktails dînatoires', piece_montee: 'pièces montées',
    evenement: 'événements', mariage: 'mariages', reception: 'réceptions', entreprise: 'entreprises', fete_famille: 'fêtes de famille',
    noel: 'Noël', paques: 'Pâques', galette: 'galette des rois', fetes: 'fêtes',
    sur_commande: 'sur commande', gateau: 'gâteaux sur mesure', pain_surprise: 'pains surprise', panier_garni: 'paniers garnis',
    colis: 'colis', composition: 'compositions'
  };
  var MOTS_TRAITEUR = ['traiteur', 'plateau', 'buffet', 'cocktail', 'piece_montee', 'evenement', 'mariage', 'reception', 'entreprise', 'fete_famille'];
  var MOTS_EVENEMENTS = ['mariage', 'reception', 'evenement', 'entreprise', 'fete_famille'];
  // Un prospect analysé dont le site n'a pas répondu est reproposé à l'analyse, au plus ce nombre de fois, pas avant ce délai.
  var ESSAIS_SITE = 3, DELAI_REESSAI_SITE = 20 * 3600000, DELAI_REESSAI_GOOGLE = 3600000;
  // Même nom à moins de cette distance : peut-être le même commerçant (jamais plus qu'un « à vérifier »).
  var RAYON_MEME_NOM = 15000, RAYON_DOUBLON = 30;
  // Adresses qui ne sont pas « le site du commerce » : elles ne rapprochent pas deux prospects.
  var HOTES_PARTAGES = ['facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'instagr.am', 'linktr.ee', 'linkin.bio', 'beacons.ai', 'pagesjaunes.fr',
    'tripadvisor.fr', 'tripadvisor.com', 'petitfute.com', 'yelp.fr', 'yelp.com', 'mappy.com', 'google.com', 'google.fr', 'g.page', 'goo.gl',
    'business.site', 'solocal.com', 'wixsite.com', 'jimdofree.com', 'e-monsite.com', 'wordpress.com', 'webador.fr', 'site123.me', 'eatbu.com'];
  var MOTS_COMMANDE = ['sur_commande', 'gateau', 'pain_surprise', 'panier_garni', 'colis', 'composition'];
  var LIBELLES_INDICES = {
    sans_viewport: 'pas adapté au téléphone', http_seul: 'sans https', balises_anciennes: 'mise en page d\'époque',
    mise_en_page_tableaux: 'mise en page en tableaux', generateur_ancien: 'outil de création ancien'
  };
  var LIBELLES_METIERS_CHALEUR = {
    traiteur: 'traiteur', boucherie: 'boucherie', poissonnerie: 'poissonnerie', patisserie: 'pâtisserie', fromagerie: 'fromagerie',
    fleuriste: 'fleuriste', boulangerie: 'boulangerie', primeur: 'primeur', epicerie: 'épicerie', restaurant: 'restaurant',
    pizzeria: 'pizzeria', fastfood: 'restauration rapide'
  };
  // Mots trop génériques pour reconnaître une enseigne (même liste dans la fonction crm-enrichir, plateformes.js).
  var MOTS_GENERIQUES = ('boulangerie patisserie boucherie charcuterie traiteur primeur fromagerie cremerie poissonnerie epicerie fine ' +
    'fleuriste fleurs maison la le les l du de des d au aux chez et a snack pizzeria restaurant sarl sas eurl').split(' ');

  function objet(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }
  function listeTextes(v) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }) : []; }
  function nombreFini(v) { var n = typeof v === 'number' ? v : (v == null || v === '' ? NaN : Number(v)); return isFinite(n) ? n : null; }
  function libellesDe(ids, table, permis, max) {
    var vus = [];
    listeTextes(ids).forEach(function (id) {
      if (permis && permis.indexOf(id) < 0) return;
      var l = Object.prototype.hasOwnProperty.call(table, id) ? table[id] : '';
      if (l && vus.indexOf(l) < 0 && vus.length < (max || 3)) vus.push(l);
    });
    return vus;
  }
  function entreParentheses(mots) { return mots.length ? ' (' + mots.join(', ') + ')' : ''; }
  function noteFr(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }

  /* Clé d'enseigne : le nom sans ses mots génériques (« Boulangerie Maison Dupont » → « dupont »). Vide quand il
     ne reste aucun mot d'au moins quatre lettres : aucune comparaison n'est alors tentée. */
  function cleEnseigne(nom) {
    var mots = sansAccents(nom).split(/[^a-z0-9]+/).filter(function (m) { return m && MOTS_GENERIQUES.indexOf(m) < 0; });
    return mots.some(function (m) { return m.length >= 4; }) ? mots.join(' ') : '';
  }

  /* Domaine du site d'un commerce (« www.dupont.fr/contact » → « dupont.fr »), ou '' pour une page de réseau
     social, d'annuaire ou d'hébergeur gratuit : deux commerces qui affichent le même site sont la même maison. */
  function domaineSite(siteWeb) {
    var adresse = texte(siteWeb).split(/\s*;\s*/)[0];
    if (!adresse) return '';
    var hote = adresse.replace(/^[a-z][a-z0-9+.\-]*:\/\//i, '').replace(/[\/?#].*$/, '').replace(/:\d+$/, '').toLowerCase().replace(/^www\./, '');
    if (!/^[a-z0-9.\-]+\.[a-z]{2,}$/.test(hote)) return '';
    for (var i = 0; i < HOTES_PARTAGES.length; i++) {
      if (hote === HOTES_PARTAGES[i] || hote.slice(-HOTES_PARTAGES[i].length - 1) === '.' + HOTES_PARTAGES[i]) return '';
    }
    return hote;
  }
  function distanceMetres(a, b) {
    var rad = function (x) { return x * Math.PI / 180; };
    var dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    var h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.pow(Math.sin(dLon / 2), 2);
    return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function positionDe(x) {
    var lat = nombreFini(x && x.lat), lon = nombreFini(x && x.lon);
    return lat != null && lon != null ? { lat: lat, lon: lon } : null;
  }
  /* Deux commerces de même nom sont-ils assez proches pour être peut-être la même maison ? Avec deux positions :
     moins de 15 km (et pas au même endroit : un doublon n'est pas une seconde boutique). Sinon : même commune ou
     même code postal, jamais « quelque part dans le même département ». */
  function voisins(a, b) {
    var pa = positionDe(a), pb = positionDe(b);
    if (pa && pb) { var d = distanceMetres(pa, pb); return d > RAYON_DOUBLON && d <= RAYON_MEME_NOM; }
    var ca = sansAccents(a.commune), cb = sansAccents(b.commune);
    return (!!ca && ca === cb) || (!!texte(a.code_postal) && texte(a.code_postal) === texte(b.code_postal));
  }
  function memeEndroit(a, b) {
    var pa = positionDe(a), pb = positionDe(b);
    return !!pa && !!pb && distanceMetres(pa, pb) <= RAYON_DOUBLON;
  }

  /* Signaux lus dans les étiquettes OpenStreetMap d'un commerce. `homonymes` : nombre d'autres commerces de la
     MÊME MAISON dans la réponse (même marque ou même site), ou { homonymes, memeNom } ; `memeNom` : nombre de
     commerces voisins qui portent seulement le même nom (un indice à vérifier, jamais une affirmation).
     Seul ce qui est vu est noté : une clé absente ne dit rien. */
  function signauxOsm(etiquettes, homonymes, maintenant) {
    var e = etiquettes || {};
    var s = { le: dateLocaleISO(maintenant == null ? new Date() : maintenant) };
    function oui(v) { return /^(yes|only)$/i.test(texte(v)); }
    if (texte(e.craft) === 'caterer' || oui(e.catering) || /traiteur/.test(sansAccents(texte(e.name) + ' ' + texte(e.description)))) s.traiteur = true;
    if (oui(e.delivery)) s.livraison = true;
    if (oui(e.takeaway) || texte(e.drive_through) === 'yes') s.emporter = true;
    if (texte(e.opening_hours)) s.horaires = true;
    var marque = premier(e.brand, e.operator);
    if (marque) s.marque = marque.slice(0, 80);
    if (texte(e['brand:wikidata']) || texte(e['operator:wikidata'])) s.enseigne = true;
    var compte = objet(homonymes) || { homonymes: homonymes };
    var n = Math.floor(Number(compte.homonymes)), m = Math.floor(Number(compte.memeNom));
    if (n >= 1) s.homonymes = Math.min(999, n);
    if (m >= 1) s.meme_nom = Math.min(999, m);
    return s;
  }

  // Signaux tels qu'ils peuvent être enregistrés : un objet de version 1 qui tient dans la colonne, sinon rien.
  function signauxValides(v) {
    var s = objet(v);
    if (!s || s.v !== 1) return null;
    try { return JSON.stringify(s).length <= TAILLE_SIGNAUX ? s : null; } catch (e) { return null; }
  }
  function coordonnee(v, max) {
    var n = nombreFini(v);
    return n != null && Math.abs(n) <= max ? Math.round(n * 1e6) / 1e6 : null;
  }

  // ───────────────────────────── Étude des prospects (note Marchéo) ─────────────────────────────

  /* Une tâche planifiée, extérieure à ce dépôt, étudie les prospects mis en file (crm_prospects.etude_demandee_at) :
     fiche, photos, avis, réseaux, annuaire des entreprises. Elle écrit son étude par la fonction SQL
     crm_etude_ecrire (migration 20261116_crm_etude.sql), qui valide et borne tout. Le navigateur ne fait
     pourtant confiance à rien de ce qu'il relit : l'étude repasse ici par les mêmes règles, tout texte est
     échappé à l'affichage et une adresse n'est un lien que si elle est en https. */
  var COLONNES_ETUDE = ['etude_demandee_at', 'etude_at', 'etude', 'note_marcheo'];
  var CONFIANCES_ETUDE = ['faible', 'moyenne', 'forte'];
  var BORNES_ETUDE = { avis: 600, resume: 400, commentaire: 300, plateforme: 60, dirigeant: 80, point: 120, points: 5, angle: 200, source: 300, sources: 8 };
  // Un faux numéro ou un « pas intéressé » n'est pas étudié (la file de la base les écarte aussi).
  var RESULTATS_SANS_ETUDE = ['faux_numero', 'pas_interesse'];
  var ACTIVITES_ETUDE = ['actif', 'peu_actif', 'absent', 'inconnu'];

  function textePropre(v, max) {
    return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max).trim() : '';
  }
  /* L'adresse si elle peut aller dans un href : https, hôte en lettres / chiffres / points / tirets (ni identifiants
     ni port), sans espace, guillemet, chevron ni barre oblique inverse. Sinon ''. Une adresse ne se tronque pas. */
  function urlHttps(v, max) {
    var u = typeof v === 'string' ? v.trim() : '';
    if (!u || u.length > (max || BORNES_ETUDE.source)) return '';
    return /^https:\/\/([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,24}(\/[^\s<>"'\\`\u0000-\u001f\u007f]*)?$/.test(u) ? u : '';
  }
  function parmi(v, liste) { return typeof v === 'string' && liste.indexOf(v) >= 0 ? v : null; }
  function booleen(v) { return v === true ? true : v === false ? false : null; }
  function nombreBorne(v, min, max, decimales) {
    if (typeof v !== 'number' || !isFinite(v) || v < min || v > max) return null;
    if (!decimales && v !== Math.floor(v)) return null;
    var f = Math.pow(10, decimales || 0);
    return Math.round(v * f) / f;
  }
  function textesBornes(v, nombre, max) {
    var liste = [];
    (Array.isArray(v) ? v.slice(0, 50) : []).forEach(function (x) {
      var t = textePropre(x, max);
      if (t && liste.length < nombre) liste.push(t);
    });
    return liste;
  }

  /* Étude telle qu'elle peut être affichée : seules les clés du schéma (version 1), chacune vérifiée ; toutes
     présentes dans le résultat ('' / null / [] quand l'étude ne dit rien). Forme inconnue → null. */
  function etudeValide(v) {
    var e = objet(v);
    if (!e || e.v !== 1) return null;
    var confiance = parmi(e.confiance, CONFIANCES_ETUDE);
    if (!confiance || typeof e.identifie !== 'boolean') return null;
    var note = e.note == null ? null : nombreBorne(e.note, 0, 10, 1);
    if (e.note != null && note == null) return null;
    var ac = objet(e.avis_clients) || {}, ph = objet(e.photos), re = objet(e.reseaux) || {};
    var sources = [];
    (Array.isArray(e.sources) ? e.sources.slice(0, 50) : []).forEach(function (x) {
      var u = urlHttps(x, BORNES_ETUDE.source);
      if (u && sources.indexOf(u) < 0 && sources.length < BORNES_ETUDE.sources) sources.push(u);
    });
    return {
      v: 1, note: note, confiance: confiance, identifie: e.identifie,
      avis: textePropre(e.avis, BORNES_ETUDE.avis),
      avis_clients: {
        tendance: parmi(ac.tendance, ['bons', 'mitiges', 'mauvais', 'inconnu']) || 'inconnu',
        note: nombreBorne(ac.note, 1, 5, 1), nombre: nombreBorne(ac.nombre, 0, 10000000, 0), resume: textePropre(ac.resume, BORNES_ETUDE.resume)
      },
      photos: ph ? {
        vues: booleen(ph.vues), qualite: parmi(ph.qualite, ['belles', 'correctes', 'pauvres', 'inconnu']) || 'inconnu',
        recentes: booleen(ph.recentes), devanture: booleen(ph.devanture), produits: booleen(ph.produits),
        commentaire: textePropre(ph.commentaire, BORNES_ETUDE.commentaire)
      } : null,
      commande_en_ligne: parmi(e.commande_en_ligne, ['oui', 'non_vue', 'inconnu']) || 'inconnu',
      plateforme: textePropre(e.plateforme, BORNES_ETUDE.plateforme),
      traiteur: booleen(e.traiteur),
      points_de_vente: nombreBorne(e.points_de_vente, 1, 9999, 0),
      reseaux: { instagram: parmi(re.instagram, ACTIVITES_ETUDE) || 'inconnu', facebook: parmi(re.facebook, ACTIVITES_ETUDE) || 'inconnu' },
      dirigeant: textePropre(e.dirigeant, BORNES_ETUDE.dirigeant),
      anciennete: nombreBorne(e.anciennete, 1800, 2200, 0),
      points_forts: textesBornes(e.points_forts, BORNES_ETUDE.points, BORNES_ETUDE.point),
      points_faibles: textesBornes(e.points_faibles, BORNES_ETUDE.points, BORNES_ETUDE.point),
      angle: textePropre(e.angle, BORNES_ETUDE.angle),
      sources: sources
    };
  }

  /* L'étude d'un prospect et sa demande : { etude (nettoyée, ou null), note, confiance, identifie, fiable, motif,
     le (date de l'étude), demandeeLe (en file depuis) }, ou null s'il n'a ni étude ni demande en cours.
     `fiable` : commerce retrouvé avec certitude ET confiance moyenne ou forte ; sinon l'étude est montrée avec sa
     réserve (`motif` : 'non_identifie' ou 'faible') et ne compte pas dans la chaleur. */
  function etudeProspect(p) {
    if (!p) return null;
    var e = etudeValide(p.etude), demandee = p.etude_demandee_at || null;
    if (!e && !demandee) return null;
    return {
      etude: e, note: e ? e.note : null, confiance: e ? e.confiance : null, identifie: e ? e.identifie : null,
      fiable: !!e && e.identifie && e.confiance !== 'faible',
      motif: !e ? '' : !e.identifie ? 'non_identifie' : e.confiance === 'faible' ? 'faible' : '',
      le: e ? (p.etude_at || null) : null, demandeeLe: demandee
    };
  }

  /* Prénom à dire au téléphone, tiré du nom du dirigeant relevé dans l'annuaire des entreprises (« Marc DUPONT »,
     « DUPONT Marc », « M. Jean-Pierre MARTIN »). Seulement des lettres, tirets et apostrophes. '' quand on ne peut
     pas distinguer le prénom du nom (tout en capitales, un seul mot). */
  function prenomDirigeant(nom) {
    var t = textePropre(nom, BORNES_ETUDE.dirigeant).replace(/\([^)]*\)/g, ' ').split(/\s*[,;\/&]\s*|\s+et\s+/i)[0] || '';
    var mots = t.split(/\s+/).filter(function (m) { return /^[\p{L}][\p{L}'’\-]*$/u.test(m) && !/^(m|mr|mme|mlle|monsieur|madame|mademoiselle)$/i.test(m); });
    if (mots.length < 2) return '';
    var prenom = mots.filter(function (m) { return /^\p{Lu}[\p{L}'’\-]*\p{Ll}/u.test(m); })[0] || '';
    return prenom.slice(0, 60);
  }

  /* Les mieux notés d'abord : études fiables, puis études peu fiables, puis prospects sans note. Ordre gardé à égalité. */
  function rangNote(p) {
    var ep = etudeProspect(p);
    if (!ep || ep.note == null) return 0;
    return (ep.fiable ? 2000 : 1000) + Math.round(ep.note * 10);
  }
  function trierParNote(prospects) {
    var rangs = (prospects || []).map(function (p, i) { return { p: p, i: i, rang: rangNote(p) }; });
    rangs.sort(function (a, b) { return b.rang - a.rang || a.i - b.i; });
    return rangs.map(function (r) { return r.p; });
  }

  /* Prospects à mettre en file d'étude : ni étude, ni demande en cours, ni faux numéro, ni « pas intéressé ». */
  function aEtudier(prospects) {
    return (prospects || []).filter(function (p) {
      return !!p && !p.enAttente && !/^provisoire-/.test(String(p.id)) && !p.etude_at && !p.etude && !p.etude_demandee_at &&
        RESULTATS_SANS_ETUDE.indexOf(p.resultat) < 0;
    });
  }

  function metierChaleur(p) {
    var B = BAREME_CHALEUR.metiers;
    var libelle = sansAccents(p.metier), type = texte(p.business_type).toLowerCase(), cle = '';
    // Une pâtisserie est rangée parmi les boulangeries : c'est son libellé qui la distingue.
    if (/patisserie/.test(libelle)) cle = 'patisserie';
    else if (Object.prototype.hasOwnProperty.call(B, type)) cle = type;
    else if (/traiteur/.test(libelle)) cle = 'traiteur';
    else if (/boucher|charcut/.test(libelle)) cle = 'boucherie';
    else if (/poissonn/.test(libelle)) cle = 'poissonnerie';
    else if (/fromag|cremerie/.test(libelle)) cle = 'fromagerie';
    else if (/fleur/.test(libelle)) cle = 'fleuriste';
    else if (/boulang/.test(libelle)) cle = 'boulangerie';
    else if (/primeur|fruits|legumes/.test(libelle)) cle = 'primeur';
    else if (/epicerie/.test(libelle)) cle = 'epicerie';
    else if (/pizz/.test(libelle)) cle = 'pizzeria';
    else if (/rapide|snack|fast/.test(libelle)) cle = 'fastfood';
    else if (/restaurant/.test(libelle)) cle = 'restaurant';
    return cle ? { cle: cle, points: B[cle], libelle: LIBELLES_METIERS_CHALEUR[cle] } : null;
  }

  function libelleNiveau(niveau) {
    for (var i = 0; i < NIVEAUX_CHALEUR.length; i++) if (NIVEAUX_CHALEUR[i].id === niveau) return NIVEAUX_CHALEUR[i].libelle;
    return '';
  }

  /* Chaleur d'un prospect. `contexte` : { homonymes (autres prospects de la file de la même maison : même site),
     memeNom (prospects voisins de même nom seulement) }, facultatif.
     Rend { niveau, libelle, valeur, manuel, exclu, partiel, auto: { niveau, valeur }, raisons: [{ cle, points,
     texte }], etats: { site, google, analyseLe }, rang }. Le texte d'une raison commence par « + », « − » ou « · ».
     Sans aucun signal : niveau « non_analyse », valeur nulle, aucune raison (les colonnes seules ne font pas une note). */
  function chaleurProspect(p, contexte) {
    p = p || {};
    contexte = contexte || {};
    var B = BAREME_CHALEUR;
    var s = objet(p.signaux) || {};
    var osm = objet(s.osm), site = objet(s.site), google = objet(s.google);
    var analyse = !!p.analyse_at;
    var manuel = NIVEAUX_MANUELS.indexOf(p.chaleur_manuelle) >= 0 ? p.chaleur_manuelle : null;
    // L'étude ne compte que si elle est fiable ; ses points sont pondérés par sa confiance.
    var ep = etudeProspect(p), etude = ep && ep.fiable ? ep.etude : null;
    var coef = etude ? (etude.confiance === 'forte' ? B.etude.forte : B.etude.moyenne) : 0;
    function pe(points) { return Math.round(points * coef); }
    var D_ETUDE = ' (d\'après l\'étude)';
    var etats = {
      site: site && texte(site.etat) ? texte(site.etat) : null,
      // Analysé sans rien de Google : la clé n'était pas configurée.
      google: google && texte(google.etat) ? texte(google.etat) : (analyse ? 'sans_cle' : null),
      analyseLe: p.analyse_at || null
    };
    function rendre(niveauAuto, valeur, raisons, drapeaux) {
      drapeaux = drapeaux || {};
      var niveau = drapeaux.exclu ? 'froid' : (manuel || niveauAuto);
      return {
        niveau: niveau, libelle: libelleNiveau(niveau), valeur: valeur, manuel: !!manuel && !drapeaux.exclu, exclu: !!drapeaux.exclu,
        partiel: !!drapeaux.partiel, auto: { niveau: niveauAuto, valeur: valeur }, raisons: raisons, etats: etats,
        // Étude du commerce : comptée dans la note, ou écartée (motif : 'non_identifie', 'faible'). null : pas d'étude.
        etude: ep && ep.etude ? { comptee: !!etude && !drapeaux.exclu && valeur != null, motif: ep.motif } : null,
        rang: (drapeaux.exclu ? B.rangs.exclu : B.rangs[niveau]) + (valeur || 0)
      };
    }

    // Exclusions : plus fortes que tout, réglage manuel compris. « Fermé définitivement » n'exclut que si la fiche
    // Google est sûrement la sienne (même téléphone) ; une fiche rapprochée par le nom et le lieu plafonne à Froid.
    var fermeIncertain = false;
    if (google && google.statut === 'CLOSED_PERMANENTLY') {
      if (google.confiance !== 'moyenne') {
        return rendre('froid', 0, [{ cle: 'ferme', points: 0, texte: '− fermé définitivement d\'après Google' }], { exclu: true });
      }
      fermeIncertain = true;
    }
    if (site && site.deja_marcheo === true) {
      return rendre('froid', 0, [{ cle: 'deja_marcheo', points: 0, texte: '− déjà chez Marchéo' }], { exclu: true });
    }
    if (!osm && !site && !google && !analyse && !etude) return rendre('non_analyse', null, []);

    var raisons = [], total = B.base;
    function compter(cle, points, libelle) {
      total += points;
      raisons.push({ cle: cle, points: points, texte: (points > 0 ? '+ ' : points < 0 ? '− ' : '· ') + libelle });
    }
    var etatSite = etats.site, commande = site ? texte(site.commande) : '';
    var outils = site ? listeTextes(site.outils) : [];

    // Commande en ligne.
    var plafonds = [];
    if (fermeIncertain) {
      compter('ferme_incertain', 0, 'fermé définitivement d\'après une fiche Google au même nom : à vérifier');
      plafonds.push('fiche Google « fermé définitivement »');
    }
    if (commande === 'boutique') compter('boutique', B.boutique, 'a déjà une boutique en ligne' + entreParentheses(libellesDe(outils, LIBELLES_OUTILS, null, 1)));
    else if (commande === 'plateforme') {
      var plateformes = libellesDe(outils, LIBELLES_OUTILS, null, 2);
      compter('plateforme', B.plateforme, 'prend déjà des commandes en ligne' + (plateformes.length ? ' via ' + plateformes.join(', ') : ' via une plateforme'));
    } else if (etatSite === 'analyse' && commande === 'aucune_vue') compter('sans_commande', B.sans_commande, 'pas vu de commande en ligne sur son site');
    // L'étude complète ce que le site n'a pas dit, sans jamais compter deux fois la même chose.
    var dejaEnLigne = commande === 'boutique' || commande === 'plateforme';
    var commandeEtude = !!etude && etude.commande_en_ligne === 'oui' && !dejaEnLigne;
    if (commandeEtude) {
      compter('etude_commande', pe(B.etude.commande), 'commande en ligne vue' + (etude.plateforme ? ' : ' + etude.plateforme : '') + D_ETUDE);
    } else if (etude && etude.commande_en_ligne === 'non_vue' && !dejaEnLigne && !(etatSite === 'analyse' && commande === 'aucune_vue')) {
      compter('etude_sans_commande', pe(B.etude.sans_commande), 'pas vu de commande en ligne' + D_ETUDE);
    }

    // Site.
    var sansSite = !texte(p.site_web) || etatSite === 'pas_de_site' || etatSite === 'annuaire';
    if (etatSite === 'reseau_seul') {
      var vitrine = site.reseau === 'instagram' ? 'son profil Instagram' : site.reseau === 'facebook' ? 'sa page Facebook' : 'une page de réseau social';
      compter('reseau_seul', B.reseau_seul, 'sa seule vitrine est ' + vitrine);
    } else if (etatSite === 'parking') compter('parking', B.parking, 'son site est une page d\'attente');
    else if (etatSite === 'injoignable') compter('injoignable', B.injoignable, 'site injoignable' + (site.le && dateCourte(site.le) ? ' le ' + dateCourte(site.le) : '') + ' : à vérifier');
    else if (etatSite === 'illisible') compter('illisible', 0, 'site non lisible par l\'analyse (page générée par script) : à vérifier');
    else if (texte(p.site_web) && etatSite === 'pas_de_site') {
      // Un site a été saisi (ou trouvé) depuis l'analyse qui n'en connaissait pas : elle ne vaut plus.
      compter('site_a_analyser', 0, 'site connu depuis la dernière analyse, pas encore analysé');
    } else if (sansSite && etatSite !== 'analyse') {
      if (google && google.etat === 'trouve' && google.site === true) {
        // La fiche Google indique un site que l'analyse n'a pas encore lu : on ne peut pas écrire « pas de site ».
        compter('site_a_analyser', 0, 'site indiqué sur sa fiche Google, pas encore analysé');
      } else if ((etatSite === 'pas_de_site' || etatSite === 'annuaire') && google && google.etat === 'trouve') {
        compter('sans_site_confirme', B.sans_site_confirme, 'pas de site (ni dans OpenStreetMap ni sur sa fiche Google)');
      } else compter('sans_site', B.sans_site, 'pas de site connu');
    }
    // Dernier passage en échec alors qu'une analyse réussie existe : elle est gardée, et on le dit.
    var echec = site ? objet(site.echec) : null;
    if (echec && (etatSite === 'analyse' || etatSite === 'parking' || etatSite === 'illisible')) {
      compter('injoignable', 0, 'site injoignable' + (echec.le && dateCourte(echec.le) ? ' le ' + dateCourte(echec.le) : '') +
        (site.le && dateCourte(site.le) ? ' : analyse du ' + dateCourte(site.le) + ' conservée' : ' : analyse précédente conservée'));
    }
    if (site && site.vieillot === true && commande !== 'boutique') {
      var indices = listeTextes(site.indices).map(function (i) {
        var annee = /^copyright_(\d{4})$/.exec(i);
        return annee ? 'copyright ' + annee[1] : (Object.prototype.hasOwnProperty.call(LIBELLES_INDICES, i) ? LIBELLES_INDICES[i] : '');
      }).filter(Boolean).slice(0, 2);
      compter('vieillot', B.vieillot, 'site ancien' + entreParentheses(indices));
    }

    // Commandes prises à la main, offre à commander à l'avance.
    if (site && commande !== 'boutique' && (site.precommande === 'telephone' || site.precommande === 'formulaire')) {
      if (site.precommande === 'telephone') compter('precommande', B.precommande_telephone, 'prend déjà des commandes par téléphone');
      else compter('precommande', B.precommande_formulaire, 'prend déjà des commandes par formulaire ou e-mail');
    }
    var mots = site ? listeTextes(site.mots) : [];
    var metierTraiteur = texte(p.business_type) === 'traiteur' && sansAccents(p.metier) === 'traiteur';
    var trio = [];
    if ((site && site.traiteur === true) || (osm && osm.traiteur === true) || metierTraiteur) {
      trio.push(['traiteur', B.traiteur, 'offre traiteur' + entreParentheses(libellesDe(mots, LIBELLES_MOTS, MOTS_TRAITEUR, 3).filter(function (m) { return m !== 'traiteur'; }))]);
    }
    else if (site && site.evenements === true) {
      // Mariages, réceptions… sans mot de traiteur : des commandes à l'avance, pas forcément une offre traiteur.
      trio.push(['evenements', B.evenements, 'travaille pour des événements' + entreParentheses(libellesDe(mots, LIBELLES_MOTS, MOTS_EVENEMENTS, 3))]);
    }
    if (site && site.fetes === true) trio.push(['fetes', B.fetes, 'prend des commandes pour les fêtes']);
    if (site && site.sur_commande === true) {
      trio.push(['sur_commande', B.sur_commande, 'produits sur commande' + entreParentheses(libellesDe(mots, LIBELLES_MOTS, MOTS_COMMANDE, 3).filter(function (m) { return m !== 'sur commande'; }))]);
    }
    if (etude && etude.traiteur === true && !trio.some(function (t) { return t[0] === 'traiteur'; })) {
      trio.push(['etude_traiteur', pe(B.etude.traiteur), 'offre traiteur' + D_ETUDE]);
    }
    var cumul = 0;
    trio.forEach(function (t) {
      var points = Math.max(0, Math.min(t[1], B.plafond_traiteur - cumul));
      cumul += points;
      compter(t[0], points, t[2]);
    });
    var commission = site ? libellesDe(site.livraison_commission, LIBELLES_OUTILS, null, 3) : [];
    if (commission.length) compter('commission', B.commission, 'livre via ' + commission.join(', ') + ' (à commission)');
    else if (osm && (osm.livraison === true || osm.emporter === true)) compter('livraison', B.livraison, 'fait déjà de la livraison ou de l\'emporté');
    if (site && site.anti_gaspi === true) compter('anti_gaspi', B.anti_gaspi, 'utilise déjà une appli (Too Good To Go)');

    // Plusieurs points de vente, enseigne nationale. Un simple homonyme des environs (« Boulangerie du Centre »
    // dans deux villes) n'est pas une seconde boutique : il est signalé sans point, à vérifier.
    var homonymes = Math.max(osm ? (nombreFini(osm.homonymes) || 0) : 0, nombreFini(contexte.homonymes) || 0);
    var memeNom = Math.max(osm ? (nombreFini(osm.meme_nom) || 0) : 0, nombreFini(contexte.memeNom) || 0);
    if (osm && osm.enseigne === true) compter('enseigne', B.enseigne, 'enseigne nationale : décision prise au siège');
    else if ((site && site.multi === true) || homonymes >= 1) {
      var adresses = site ? nombreFini(site.adresses) : null;
      compter('multi', B.multi, 'plusieurs points de vente' + (adresses >= 2 ? ' (' + adresses + ' adresses vues)'
        : homonymes >= 1 ? ' (' + (homonymes + 1) + ' commerces de la même maison)' : ''));
    } else if (etude && etude.points_de_vente >= 2) {
      compter('etude_multi', pe(B.etude.multi), 'plusieurs points de vente : ' + etude.points_de_vente + D_ETUDE);
    } else if (memeNom >= 1) {
      compter('meme_nom', B.meme_nom, 'même nom qu\'un autre commerce des environs : plusieurs points de vente ? À vérifier');
    }

    // Réseaux sociaux : la présence est constatée automatiquement, l'activité à la main.
    var insta = !!texte(p.instagram), fb = !!texte(p.facebook);
    if (insta || fb) compter('reseaux', insta && fb ? B.reseaux_deux : B.reseaux_un, 'compte ' + (insta && fb ? 'Instagram et Facebook' : insta ? 'Instagram' : 'Facebook') + ' trouvé');
    if (p.reseaux_actifs === 'actif') compter('reseaux_actifs', B.reseaux_actifs, 'réseaux actifs (constaté à la main)');
    else if (p.reseaux_actifs === 'peu_actif') compter('reseaux_peu', B.reseaux_peu, 'réseaux peu actifs (constaté à la main)');
    else if (etude) {
      // Le réglage à la main passe toujours devant : l'étude ne parle que s'il est vide.
      var ri = etude.reseaux.instagram === 'actif', rf = etude.reseaux.facebook === 'actif';
      if (ri || rf) compter('etude_reseaux', pe(B.etude.reseaux), (ri && rf ? 'Instagram et Facebook actifs' : ri ? 'Instagram actif' : 'Facebook actif') + D_ETUDE);
      else if (etude.reseaux.instagram === 'peu_actif' || etude.reseaux.facebook === 'peu_actif') compter('etude_reseaux_peu', pe(B.etude.reseaux_peu), 'réseaux peu actifs' + D_ETUDE);
    }

    // Fiche Google.
    if (google && google.etat === 'trouve') {
      var avis = nombreFini(google.avis), note = nombreFini(google.note);
      if (avis != null && note != null) {
        var detail = noteFr(note) + ' ★, ' + avis + ' avis Google';
        if (avis >= B.avis_frequente && note >= B.note_frequente) compter('google_frequente', B.google_frequente, 'commerce fréquenté (' + detail + ')');
        else if (avis >= B.avis_installe && note >= B.note_installe) compter('google_installe', B.google_installe, 'commerce installé (' + detail + ')');
        else if (avis >= B.avis_mal_note && note < B.note_mal_note) compter('google_mal_note', B.google_mal_note, 'mal noté sur Google (' + noteFr(note) + ' ★)');
      }
      if (google.statut === 'CLOSED_TEMPORARILY') compter('ferme_temporaire', B.ferme_temporaire, 'fermé temporairement d\'après Google');
    }

    // Avis clients relevés par l'étude, quand la fiche Google n'a rien compté.
    if (etude && !raisons.some(function (r) { return /^google_/.test(r.cle); })) {
      var ac = etude.avis_clients, pa = 0, texteAvis = '';
      if (ac.nombre != null && ac.note != null) {
        var chiffres = ' (' + noteFr(ac.note) + ' ★, ' + ac.nombre + ' avis)';
        if (ac.nombre >= B.avis_frequente && ac.note >= B.note_frequente) { pa = B.etude.avis_frequente; texteAvis = 'très bons avis clients' + chiffres; }
        else if (ac.nombre >= B.avis_installe && ac.note >= B.note_installe) { pa = B.etude.avis_installe; texteAvis = 'bons avis clients' + chiffres; }
        else if (ac.nombre >= B.avis_mal_note && ac.note < B.note_mal_note) { pa = B.etude.avis_mal_note; texteAvis = 'avis clients médiocres' + chiffres; }
      }
      if (!pa && ac.tendance === 'bons') { pa = B.etude.avis_bons; texteAvis = 'avis clients plutôt bons'; }
      else if (!pa && ac.tendance === 'mauvais') { pa = B.etude.avis_mauvais; texteAvis = 'avis clients plutôt mauvais'; }
      if (pa) compter('etude_avis', pe(pa), texteAvis + D_ETUDE);
    }

    // Joignable.
    if (osm && osm.horaires === true) compter('horaires', B.horaires, 'horaires connus');
    if (texte(p.email)) compter('email', B.email, 'e-mail connu (envoi de la démo possible)');
    if (!texte(p.telephone)) compter('sans_tel', B.sans_tel, 'pas de numéro');
    else if (estMobile(p.telephone)) compter('mobile', B.mobile, 'numéro de portable');

    var metier = metierChaleur(p);
    if (metier && metier.points) {
      compter('metier', metier.points, metier.points < 0 ? 'métier déjà très équipé en commande en ligne'
        : (metier.points >= B.metier_a_l_avance ? 'métier à commandes à l\'avance' : 'commerce de proximité') + ' (' + metier.libelle + ')');
    }

    // Notre note (0 à 10), avec un poids borné : elle résume l'étude, elle ne remplace pas les signaux.
    if (etude && etude.note != null) {
      var brutNote = (etude.note - B.etude.note_centre) * B.etude.note_pas;
      compter('etude_note', pe(Math.max(-B.etude.note_max, Math.min(B.etude.note_max, brutNote))), 'note Marchéo ' + noteFr(etude.note) + '/10' + D_ETUDE);
    }
    if (ep && ep.etude && !etude) {
      compter('etude_ecartee', 0, 'étude peu fiable (' + (ep.motif === 'non_identifie' ? 'commerce pas retrouvé avec certitude' : 'peu d\'éléments trouvés') + ') : non comptée');
    }

    // Ce que l'appel a appris pèse plus que tout ce qui a été deviné.
    var appels = Number(p.nb_appels) || 0;
    if (p.resultat === 'rdv') compter('r_rdv', B.r_rdv, 'rendez-vous obtenu');
    else if (p.resultat === 'interesse') compter('r_interesse', B.r_interesse, 'intéressé lors de l\'appel');
    else if (p.resultat === 'deja_site') compter('r_deja_site', B.r_deja_site, 'a dit avoir déjà un site de commande');
    else if (p.resultat === 'pas_interesse') compter('r_refus', B.r_refus, 'pas intéressé lors de l\'appel');
    else if (p.resultat === 'faux_numero') compter('r_faux', B.r_faux, 'faux numéro');
    else if (appels >= B.appels_silence && (p.resultat === 'pas_de_reponse' || p.resultat === 'messagerie')) compter('r_silence', B.r_silence, appels + ' appels sans réponse');

    // Plafond : il prend déjà des commandes en ligne (boutique ou plateforme) → Froid, même très bien installé.
    // Ce que l'appel a appris (intéressé, rendez-vous) passe au-dessus.
    if ((commande === 'boutique' || commande === 'plateforme') && p.resultat !== 'rdv' && p.resultat !== 'interesse') {
      plafonds.push('il prend déjà des commandes en ligne');
    }
    // Commande en ligne vue par une étude sûre d'elle : même plafond que pour le site.
    if (commandeEtude && etude.confiance === 'forte' && p.resultat !== 'rdv' && p.resultat !== 'interesse') {
      plafonds.push('commande en ligne vue par l\'étude');
    }
    if (plafonds.length && total > B.plafond_froid) compter('plafond', B.plafond_froid - total, 'note plafonnée à Froid : ' + plafonds[0]);

    var valeur = borner(total);
    var niveau = valeur >= B.chaud ? 'chaud' : valeur >= B.tiede ? 'tiede' : 'froid';
    return rendre(niveau, valeur, trierRaisons(raisons), { partiel: !analyse && !site && !google && !etude });
  }

  /* Par où commencer l'appel, d'après les signaux : { cle, texte } ou null. Première règle vraie. */
  function angleProspect(p, chaleur) {
    p = p || {};
    var ch = chaleur || chaleurProspect(p);
    if (!ch || ch.exclu) return null;
    // L'accroche proposée par l'étude du commerce passe devant les règles automatiques, si l'étude est fiable.
    var ep = etudeProspect(p);
    if (ep && ep.fiable && ep.etude.angle) return { cle: 'etude', texte: ep.etude.angle, source: 'etude' };
    if (!ch.raisons.length) return null;
    var cles = {};
    ch.raisons.forEach(function (r) { cles[r.cle] = r; });
    var site = objet((objet(p.signaux) || {}).site) || {}, google = objet((objet(p.signaux) || {}).google) || {};
    var outil = libellesDe(site.outils, LIBELLES_OUTILS, null, 1)[0];
    function angle(cle, phrase) { return { cle: cle, texte: phrase }; }
    if (cles.boutique) return angle('boutique', 'Il a déjà une boutique en ligne' + (outil ? ' (' + outil + ')' : '') + '. Demander ce qu\'elle lui rapporte et ce qu\'elle lui coûte ; sinon, passer au suivant.');
    if (cles.commission) return angle('commission', 'Il livre via ' + libellesDe(site.livraison_commission, LIBELLES_OUTILS, null, 2).join(' et ') + '. Parler de la commande en direct : ses clients, sans commission.');
    if (cles.plateforme) return angle('plateforme', 'Il vend déjà via ' + (outil || 'une plateforme') + '. Parler de sa propre boutique, à son nom, sans intermédiaire.');
    if (cles.traiteur) return angle('traiteur', 'Offre traiteur repérée. Parler des commandes de plateaux prises et payées à l\'avance.');
    if (cles.evenements) return angle('evenements', 'Il travaille pour des événements (mariages, réceptions). Parler des commandes passées et payées à l\'avance.');
    if (cles.fetes) return angle('fetes', 'Il prend des commandes pour les fêtes. Parler des précommandes sans cahier ni téléphone.');
    if (cles.precommande) {
      return angle('precommande', (site.precommande === 'formulaire' ? 'Il prend déjà des commandes par formulaire ou e-mail.' : 'Il prend déjà des commandes par téléphone.') +
        ' Parler du temps gagné : elles arrivent toutes seules, même boutique fermée.');
    }
    if (cles.multi) return angle('multi', 'Plusieurs points de vente. Parler du retrait au choix dans chaque boutique.');
    if (cles.reseaux_actifs || cles.reseau_seul) {
      var reseau = texte(p.instagram) || site.reseau === 'instagram' ? 'Instagram' : texte(p.facebook) || site.reseau === 'facebook' ? 'Facebook' : 'les réseaux';
      // « Sans boutique » ne se dit que si on a pu le constater : site lu sans commande, ou pas de site du tout.
      var constate = cles.reseau_seul || cles.sans_commande || cles.sans_site_confirme || cles.sans_site || cles.parking;
      return angle('reseaux', 'Présent sur ' + reseau + (constate ? ', sans boutique' : '') + '. Parler du lien de commande à mettre ' + (reseau === 'Instagram' ? 'dans sa bio' : 'sur sa page') + '.');
    }
    if (cles.sans_site_confirme || cles.sans_site || cles.parking) return angle('sans_site', 'Pas de site connu. « Je vous prépare une démo à votre nom, ça ne vous coûte rien. »');
    if (cles.vieillot) return angle('vieillot', 'Site ancien, sans commande. Proposer de montrer la même chose en version commande sur téléphone.');
    if (cles.google_frequente) return angle('google', (nombreFini(google.avis) ? nombreFini(google.avis) + ' avis Google' : 'Beaucoup d\'avis Google') + ' : beaucoup de passage. Parler des clients qui commanderaient avant de venir.');
    return null;
  }

  /* Les plus chauds d'abord (chaud, tiède, pas encore analysé, froid, à écarter), sans changer l'ordre à égalité. */
  function trierParChaleur(prospects, chaleurDe) {
    var rangs = (prospects || []).map(function (p, i) {
      var ch = typeof chaleurDe === 'function' ? chaleurDe(p) : chaleurProspect(p);
      return { p: p, i: i, rang: ch ? ch.rang : BAREME_CHALEUR.rangs.non_analyse };
    });
    rangs.sort(function (a, b) { return b.rang - a.rang || a.i - b.i; });
    return rangs.map(function (r) { return r.p; });
  }

  // ───────────────────────────── Prospection : OpenStreetMap, import, récap ─────────────────────────────

  function versEnsemble(v) {
    if (v instanceof Set) return v;
    return new Set(Array.isArray(v) ? v : []);
  }

  function metierOsm(etiquettes) {
    var m = null;
    if (etiquettes.shop) m = CORRESPONDANCE_OSM['shop:' + etiquettes.shop];
    if (!m && etiquettes.amenity) m = CORRESPONDANCE_OSM['amenity:' + etiquettes.amenity];
    if (!m && etiquettes.craft) m = CORRESPONDANCE_OSM['craft:' + etiquettes.craft];
    if (m && etiquettes.amenity === 'restaurant' && /pizza/i.test(texte(etiquettes.cuisine))) return PIZZERIA;
    return m || null;
  }

  /* Une étiquette peut contenir plusieurs numéros : on les essaie tous et on préfère un mobile. */
  function telephonesOsm(etiquettes) {
    var valides = [];
    ETIQUETTES_TEL.forEach(function (nom) {
      texte(etiquettes[nom]).split(/[;,\/]/).forEach(function (morceau) {
        var t = telFrancais(morceau);
        if (t && valides.indexOf(t) < 0) valides.push(t);
      });
    });
    return valides;
  }

  function departementDe(codePostal, repli) {
    var cp = texte(codePostal);
    var r = texte(repli).toUpperCase();
    if (/^\d{5}$/.test(cp)) {
      if (cp.indexOf('97') === 0 || cp.indexOf('98') === 0) return cp.slice(0, 3);
      // Le code postal ne distingue pas les deux départements corses : seul le code INSEE le fait.
      if (cp.indexOf('20') === 0) return r === '2A' || r === '2B' ? r : '20';
      return cp.slice(0, 2);
    }
    return r || null;
  }

  function departementDuCode(code) {
    var c = texte(code).toUpperCase();
    if (!c) return '';
    if (c.length <= 3) return c;
    return /^9[78]/.test(c) ? c.slice(0, 3) : c.slice(0, 2);
  }

  /* Transforme la réponse Overpass en lignes de prospects. options : { mobile, sansSite, sansEnseigne,
     metiers (cases cochées), commune (nom recherché), departement ou code (INSEE recherché) }.
     dejaConnus : { telephones, refs } déjà dans la file, { crm } téléphones des fiches du CRM. */
  function prospectsDepuisOsm(elements, options, dejaConnus) {
    options = options || {};
    dejaConnus = dejaConnus || {};
    var dansFile = versEnsemble(dejaConnus.telephones), refs = versEnsemble(dejaConnus.refs), dansCrm = versEnsemble(dejaConnus.crm);
    var cases = Array.isArray(options.metiers) ? options.metiers : null;
    var depRecherche = texte(options.departement) || departementDuCode(options.code);
    var vus = new Set(), lignes = [];
    var maintenant = options.maintenant == null ? new Date() : options.maintenant;

    /* Plusieurs points de vente : pour chaque commerce, combien d'AUTRES éléments de la réponse sont de la même
       maison (même marque, ou même site à lui), et combien de voisins portent seulement le même nom. Compté sur
       tous les commerces nommés au métier reconnu, avant les filtres : une seconde boutique sans portable reste
       une seconde boutique. Un même nom dans deux villes éloignées (« Boulangerie du Centre ») ne compte pas, et
       un même nom voisin n'est qu'un indice : seuls la marque et le site affirment « plusieurs points de vente ». */
    var parEnseigne = new Map(), fiches = new Map();
    function ficheOsm(el, e) {
      var ref = el.type + '/' + el.id;
      if (!fiches.has(ref)) {
        var cp = /^\d{5}$/.test(texte(e['addr:postcode'])) ? texte(e['addr:postcode']) : '';
        fiches.set(ref, { ref: ref, lat: el.lat != null ? el.lat : el.center && el.center.lat, lon: el.lon != null ? el.lon : el.center && el.center.lon,
          commune: texte(e['addr:city']), code_postal: cp });
      }
      return fiches.get(ref);
    }
    function clesEnseigne(e) {
      var cles = [], cle = cleEnseigne(e.name), marque = sansAccents(e.brand), domaine = domaineSite(premier(e.website, e['contact:website'], e.url));
      if (cle) cles.push('n:' + cle);
      if (marque) cles.push('m:' + marque);
      if (domaine) cles.push('s:' + domaine);
      return cles;
    }
    (elements || []).forEach(function (el) {
      var e = (el && el.tags) || {};
      if (!texte(e.name) || !metierOsm(e)) return;
      var fiche = ficheOsm(el, e);
      clesEnseigne(e).forEach(function (cle) {
        if (!parEnseigne.has(cle)) parEnseigne.set(cle, []);
        parEnseigne.get(cle).push(fiche);
      });
    });
    function homonymesDe(el, e) {
      var moi = ficheOsm(el, e), maison = new Set(), memeNom = new Set();
      clesEnseigne(e).forEach(function (cle) {
        (parEnseigne.get(cle) || []).forEach(function (autre) {
          // Le même commerce dessiné deux fois (un point et un bâtiment) n'est pas une seconde boutique.
          if (autre.ref === moi.ref || memeEndroit(moi, autre)) return;
          if (cle.charAt(0) !== 'n') maison.add(autre.ref);
          else if (voisins(moi, autre)) memeNom.add(autre.ref);
        });
      });
      maison.forEach(function (ref) { memeNom.delete(ref); });
      return { homonymes: maison.size, memeNom: memeNom.size };
    }

    (elements || []).forEach(function (el) {
      var e = (el && el.tags) || {};
      var nom = texte(e.name);
      if (!nom) return;
      var metier = metierOsm(e);
      if (!metier || (cases && cases.indexOf(metier.case) < 0)) return;
      var site = premier(e.website, e['contact:website'], e.url);
      if (options.sansSite && site) return;
      if (options.sansEnseigne && (e.brand || e['brand:wikidata'])) return;

      var numeros = telephonesOsm(e);
      var mobile = numeros.filter(estMobile)[0];
      var telephone = options.mobile ? mobile : (mobile || numeros[0]);
      if (!telephone || vus.has(telephone)) return;
      vus.add(telephone);

      var codePostal = /^\d{5}$/.test(texte(e['addr:postcode'])) ? texte(e['addr:postcode']) : null;
      var ref = 'osm:' + el.type + '/' + el.id;
      var raison = dansFile.has(telephone) || refs.has(ref) ? 'file' : dansCrm.has(telephone) ? 'crm' : null;
      lignes.push({
        nom: nom.slice(0, 200), metier: metier.metier, business_type: metier.type,
        adresse: [texte(e['addr:housenumber']), texte(e['addr:street'])].filter(Boolean).join(' ') || null,
        commune: premier(e['addr:city'], options.commune) || null,
        code_postal: codePostal, departement: departementDe(codePostal, depRecherche),
        telephone: telephone, email: normaliserEmail(premier(e.email, e['contact:email'])) || null,
        site_web: site || null,
        // Beaucoup de commerces n'ont pour « site » que leur page Facebook ou leur profil Instagram.
        instagram: premierLien('instagram', [e['contact:instagram'], e.instagram, siteEnUrl(site)]) || null,
        facebook: premierLien('facebook', [e['contact:facebook'], e.facebook, siteEnUrl(site)]) || null,
        source: 'osm', source_ref: ref,
        // Position (nœud, ou centre d'un bâtiment) et signaux de chaleur lus dans les étiquettes.
        lat: coordonnee(el.lat != null ? el.lat : el.center && el.center.lat, 90),
        lon: coordonnee(el.lon != null ? el.lon : el.center && el.center.lon, 180),
        signaux: { v: 1, osm: signauxOsm(e, homonymesDe(el, e), maintenant) },
        dejaConnu: !!raison, raisonDejaConnu: raison,
        libelleDejaConnu: raison === 'file' ? 'Déjà dans la file' : raison === 'crm' ? 'Déjà client ou en démo' : null
      });
    });
    return lignes.sort(function (a, b) { return sansAccents(a.nom) < sansAccents(b.nom) ? -1 : 1; });
  }

  /* Le site d'un commerce est toujours une adresse, jamais un identifiant : « www.lefournil.fr » écrit sans
     « https:// » ne doit pas être lu comme un nom de profil Instagram ou de page Facebook. */
  function siteEnUrl(site) {
    return texte(site).split(/\s*;\s*/).filter(Boolean).map(function (s) {
      return /^[a-z][a-z0-9+.\-]*:/i.test(s) || s.indexOf('/') >= 0 ? s : 'https://' + s;
    }).join(';');
  }

  function requeteOverpass(parametres) {
    parametres = parametres || {};
    var niveau = parametres.niveau === 'departement' || parametres.niveau === 6 || parametres.niveau === '6' ? 6 : 8;
    var code = texte(parametres.code).toUpperCase().replace(/[^0-9AB]/g, '');
    var cases = Array.isArray(parametres.metiers) ? parametres.metiers
      : METIERS_OSM.filter(function (m) { return m.defaut; }).map(function (m) { return m.id; });
    var valeurs = { shop: [], amenity: [], craft: [] };
    METIERS_OSM.forEach(function (m) {
      if (cases.indexOf(m.id) < 0) return;
      ['shop', 'amenity', 'craft'].forEach(function (cle) { valeurs[cle] = valeurs[cle].concat(m[cle] || []); });
    });
    var tel = '[~"^(' + ['phone', 'contact:phone', 'contact:mobile', 'phone:mobile', 'mobile'].join('|') + ')$"~"."](area.a);';
    var lignes = [];
    if (valeurs.shop.length) lignes.push('  nwr["shop"~"^(' + valeurs.shop.join('|') + ')$"]' + tel);
    if (valeurs.amenity.length) lignes.push('  nwr["amenity"~"^(' + valeurs.amenity.join('|') + ')$"]' + tel);
    // Une pizzeria est souvent saisie comme restaurant : on va la chercher même si « Restaurant » n'est pas coché.
    if (cases.indexOf('pizzeria') >= 0 && cases.indexOf('restaurant') < 0) {
      lignes.push('  nwr["amenity"="restaurant"]["cuisine"~"pizza"]' + tel);
    }
    if (valeurs.craft.length) lignes.push('  nwr["craft"="' + valeurs.craft[0] + '"]' + tel);
    return '[out:json][timeout:40];\n' +
      'area["ref:INSEE"="' + code + '"]["admin_level"="' + niveau + '"]->.a;\n' +
      '(\n' + lignes.join('\n') + '\n);\n' +
      'out center tags ' + LIMITE_OVERPASS + ';';
  }

  /* Code d'un département saisi librement : « 34 », « 2a », « 34 Hérault », « 30 - Gard » ou le nom seul.
     Chaîne vide si rien n'est reconnu (l'appelant retombe alors sur le code postal). */
  function codeDepartement(v) {
    var saisie = texte(v).toUpperCase();
    var code = /^(2[AB]|\d{2,3})(?!\d)/.exec(saisie);
    if (code) return code[1];
    var nom = sansAccents(saisie);
    for (var i = 0; nom && i < DEPARTEMENTS.length; i++) if (sansAccents(DEPARTEMENTS[i].nom) === nom) return DEPARTEMENTS[i].code;
    return '';
  }

  function decouperLigne(ligne) {
    var separateur = ligne.indexOf('|') >= 0 ? '|' : ligne.indexOf(';') >= 0 ? ';' : ligne.indexOf('\t') >= 0 ? '\t' : null;
    var cellules = separateur ? ligne.split(separateur) : [ligne];
    return cellules.map(function (c) { return c.trim().replace(/^"(.*)"$/, '$1').replace(/""/g, '"').trim(); });
  }

  /* Lit des lignes collées « nom | métier | adresse | commune | département | téléphone | remarque »
     (ou la même chose séparée par des points-virgules ; la colonne « source » M/O de l'ancien outil est tolérée).
     Renvoie { lignes, ignorees:[{ numero, texte, raison }] } ; raison ∈ sans_nom, format, numero_invalide, doublon. */
  function analyserImport(contenu, dejaConnus) {
    dejaConnus = dejaConnus || {};
    var connus = new Set();
    versEnsemble(dejaConnus.telephones).forEach(function (t) { connus.add(t); });
    versEnsemble(dejaConnus.crm).forEach(function (t) { connus.add(t); });
    var lignes = [], ignorees = [], vus = new Set();

    String(contenu || '').split(/\r?\n/).forEach(function (brute, index) {
      if (!brute.trim()) return;
      var c = decouperLigne(brute);
      // Ligne d'en-tête d'un tableur.
      if (sansAccents(c[0]) === 'nom' && lignes.length === 0 && ignorees.length === 0) return;
      function ignorer(raison) { ignorees.push({ numero: index + 1, texte: brute.trim(), raison: raison }); }

      var nom = c[0], metier, adresse, lieu, dep, tel, source = 'import', remarque;
      if (c.length >= 6) {
        metier = c[1]; adresse = c[2]; lieu = c[3]; dep = c[4]; tel = c[5];
        var repere = sansAccents(c[6]);
        if (c.length >= 8 || /^(m|o|mairie|osm)$/.test(repere)) {
          if (repere === 'm' || repere === 'mairie') source = 'mairie';
          else if (repere === 'o' || repere === 'osm') source = 'osm';
          remarque = c.slice(7).join(' ').trim();
        } else remarque = c.slice(6).join(' ').trim();
      } else {
        // Ligne courte : le numéro est la cellule qui en a la forme, le reste suit dans l'ordre.
        var reste = c.slice(1).filter(function (cellule) {
          if (tel == null && /\d{6}/.test(cellule.replace(/\D/g, '')) && /^[\d\s.+()\-]+$/.test(cellule)) { tel = cellule; return false; }
          return true;
        });
        metier = reste[0]; lieu = reste[1]; remarque = reste.slice(2).join(' ').trim();
      }
      if (!nom) return ignorer('sans_nom');
      // Une seule cellule qui contient un numéro : les colonnes n'ont pas été reconnues (CSV à virgules…).
      // L'accepter créerait un prospect sans téléphone dont le nom serait la ligne entière.
      if (c.length === 1 && /\d{9}/.test(nom.replace(/[\s.\-()]/g, ''))) return ignorer('format');
      var telephone = null;
      if (texte(tel)) {
        telephone = telFrancais(tel);
        if (!telephone) return ignorer('numero_invalide');
        if (vus.has(telephone) || connus.has(telephone)) return ignorer('doublon');
        vus.add(telephone);
      }
      var cp = /\b(\d{5})\b/.exec(texte(lieu));
      var commune = texte(lieu).replace(/\b\d{5}\b/, '').replace(/^code postal\s*/i, '').trim();
      var departement = codeDepartement(dep) || (cp ? departementDe(cp[1]) : null);
      lignes.push({
        nom: nom.slice(0, 200), metier: texte(metier) || null, adresse: texte(adresse) || null,
        commune: commune || null, code_postal: cp ? cp[1] : null, departement: departement || null,
        telephone: telephone, source: source, remarque: texte(remarque) || null
      });
    });
    return { lignes: lignes, ignorees: ignorees };
  }

  /* Texte à coller : recommandations d'abord, puis les appels regroupés par résultat. */
  function recap(prospects, titre) {
    prospects = prospects || [];
    var L = [];
    var recos = prospects.filter(function (p) { return texte(p.recommandation); });
    if (recos.length) {
      L.push('RECOMMANDATIONS OBTENUES');
      recos.forEach(function (p) { L.push('- ' + texte(p.recommandation).toUpperCase() + ' (via ' + p.nom + ')'); });
      L.push('');
    }
    var appeles = prospects.filter(function (p) { return p.resultat; }).length;
    L.push((texte(titre) || 'Prospection') + ' : ' + appeles + ' / ' + prospects.length + ' appelés');
    ORDRE_RECAP.forEach(function (id) {
      var groupe = prospects.filter(function (p) { return p.resultat === id; });
      if (!groupe.length) return;
      L.push('');
      L.push(resultatProspectDe(id).libelle + ' (' + groupe.length + ')');
      groupe.forEach(function (p) {
        var lieu = texte(p.commune) || nomDepartement(p.departement);
        var morceaux = [p.nom, lieu, p.telephone ? formaterTel(p.telephone) : ''].filter(Boolean);
        L.push('- ' + morceaux.join(', ') + (texte(p.note) ? ' : ' + texte(p.note) : ''));
      });
    });
    return L.join('\n');
  }

  // ───────────────────────────── État, configuration, notifications ─────────────────────────────

  function brutVide() {
    return { commercants: [], leads: [], audits: [], prospects: [], commandes: [], evenements: [], fiches: [], interactions: [], taches: [],
      appels: [], reglages: [] };
  }

  /* ecriturePanne : la lecture seule vient d'une panne passagère (réseau, serveur), pas d'une migration absente.
     sourcesTronquees : sources si volumineuses que la lecture s'est arrêtée avant la fin.
     liens / liensProspects : faux dès que l'on sait que les colonnes de la migration « liens » manquent dans
     crm_fiches / crm_prospects (vu à la lecture ou au premier refus d'écriture). Le reste du CRM n'en dépend pas.
     appels / reglages : faux quand la table du journal d'appels ou celle des réglages n'existe pas (migration
     20261114_crm_appels.sql non appliquée). Rien d'autre n'en dépend : le journal se tait, les réglages restent
     sur l'appareil.
     chaleur : faux dès que l'on sait que les colonnes de la migration 20261116_crm_chaleur.sql manquent dans
     crm_prospects (vu à la lecture, au premier refus d'écriture, ou dit par la fonction crm-enrichir). Sans elles :
     aucune pastille de chaleur, prospects ajoutés sans leurs signaux, le reste inchangé.
     etude : faux dès que l'on sait que les colonnes de la migration 20261116_crm_etude.sql manquent (vu à la
     lecture ou au premier refus d'écriture). Sans elles : ni bouton « Enrichir la liste », ni note Marchéo, ni requête.
     analyse : 'inconnu' tant que la fonction crm-enrichir n'a pas été appelée, 'ok' après un lot réussi,
     'indisponible' après un échec (fonction non déployée, réseau, serveur). Un rechargement n'y touche pas. */
  function etatInitial() {
    return { charge: false, ecriture: false, ecriturePanne: false, prospection: false, sourcesKo: [], sourcesTronquees: [],
      liens: true, liensProspects: true, appels: false, reglages: false, chaleur: true, etude: true, analyse: 'inconnu', google: 'inconnu', googlePlafond: '', erreur: null, chargeLe: null };
  }

  var brut = brutVide();
  var parCle = new Map();
  var abonnes = [];
  var chargement = null;
  // Suivi des écritures en cours, pour rattraper celles qu'un rechargement aurait croisées (voir suivreEcriture).
  var ecrituresEnVol = 0, generation = 0, rechargementDu = false;
  // Sources dont on n'a aucune donnée, même ancienne : leurs règles se taisent (voir unifier).
  var sourcesSansDonnees = [];
  var rafraichissement = null;
  var jetonMemoire = null;
  var compteurProvisoire = 0;
  // Chaleur des prospects : notes déjà calculées (vidées à chaque recalcul) et enseignes présentes dans la file.
  var cacheChaleur = new Map(), homonymesFile = null, lignesFile = null;
  // Analyse en cours par la fonction crm-enrichir (une seule à la fois), et fonction connue absente (404).
  var analyse = null, fonctionAbsente = false, pauseAnalyse = 300;
  // Prospects dont l'analyse a fait échouer la fonction pendant cette session : repris en dernier, un par un.
  var echecsAnalyse = {};

  var CRM = {
    config: { url: '', cleAnon: '', emailAdmin: '', origine: ORIGINE_DEFAUT, signature: '' },
    etat: etatInitial(),
    OFFRES: OFFRES, ETAPES: ETAPES, MOTIFS_PERTE: MOTIFS_PERTE, RESULTATS_APPEL: RESULTATS_APPEL,
    NIVEAUX_CHALEUR: NIVEAUX_CHALEUR, BAREME_CHALEUR: BAREME_CHALEUR, analyseEnCours: null,
    RESULTATS_PROSPECT: RESULTATS_PROSPECT, DEPARTEMENTS: DEPARTEMENTS, METIERS_OSM: METIERS_OSM, RESEAUX: RESEAUX,
    SERVEURS_OVERPASS: SERVEURS_OVERPASS,
    fiches: [], prospects: brut.prospects, appels: brut.appels,
    // Horloge remplaçable (tests).
    horloge: function () { return new Date(); }
  };

  function sessionStockee() {
    if (typeof localStorage === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem('session_admin') || 'null'); } catch (e) { return null; }
  }

  /* Lit les globales d'admin.html quand elles existent. Peut être rappelé sans risque : la session
     (donc l'e-mail de l'admin) peut changer entre deux appels. */
  CRM.init = function (opts) {
    opts = opts || {};
    var c = CRM.config;
    /* global SUPABASE_URL, SUPABASE_KEY */
    c.url = opts.url || c.url || (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '');
    c.cleAnon = opts.cleAnon || c.cleAnon || (typeof SUPABASE_KEY !== 'undefined' ? SUPABASE_KEY : '');
    c.origine = opts.origine || c.origine || ORIGINE_DEFAUT;
    if (opts.signature != null) c.signature = opts.signature;
    var session = sessionStockee();
    c.emailAdmin = normaliserEmail(opts.emailAdmin || (session && session.email) || '');
    return CRM;
  };

  CRM.surChangement = function (fn) {
    if (typeof fn !== 'function') return function () {};
    abonnes.push(fn);
    return function () { var i = abonnes.indexOf(fn); if (i >= 0) abonnes.splice(i, 1); };
  };

  function recalculer() {
    cacheChaleur = new Map();
    homonymesFile = null;
    CRM.prospects = brut.prospects;
    CRM.appels = brut.appels;
    CRM.fiches = unifier(brut, Object.assign({}, CRM.config, { sourcesKo: sourcesSansDonnees }), CRM.horloge());
    parCle = new Map();
    CRM.fiches.forEach(function (f) { f.cles.forEach(function (cle) { parCle.set(cle, f); }); });
    abonnes.slice().forEach(function (fn) {
      // Un abonné défaillant ne doit ni bloquer les autres ni faire échouer une écriture réussie.
      try { fn(CRM.fiches); } catch (e) { if (typeof console !== 'undefined') console.error('CRM : abonné en erreur', e); }
    });
  }

  // ───────────────────────────── Accès réseau ─────────────────────────────

  function jetonCourant() {
    /* global sessionAdmin */
    if (typeof sessionAdmin !== 'undefined' && sessionAdmin) return sessionAdmin;
    if (jetonMemoire) return jetonMemoire;
    var session = sessionStockee();
    return (session && session.access_token) || CRM.config.cleAnon;
  }

  /* Un seul rafraîchissement à la fois : le jeton de rafraîchissement est à usage unique, deux appels
     simultanés invalideraient la session. */
  function rafraichirJeton() {
    if (rafraichissement) return rafraichissement;
    rafraichissement = (async function () {
      var session = sessionStockee();
      if (!session || !session.refresh_token) return false;
      var r = await fetch(CRM.config.url + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: { apikey: CRM.config.cleAnon, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      if (!r.ok) return false;
      var d = await r.json();
      if (!d || !d.access_token) return false;
      jetonMemoire = d.access_token;
      // `sessionAdmin` est un `let` global d'admin.html : on le réaffecte par son nom nu, pas via window.
      if (typeof sessionAdmin !== 'undefined') sessionAdmin = d.access_token;
      try {
        localStorage.setItem('session_admin', JSON.stringify(Object.assign({}, session, {
          access_token: d.access_token, refresh_token: d.refresh_token || session.refresh_token
        })));
      } catch (e) { /* stockage plein ou bloqué : le jeton en mémoire suffit pour la session */ }
      return true;
    })().catch(function () { return false; }).then(function (ok) { rafraichissement = null; return ok; });
    return rafraichissement;
  }

  function erreurHttp(statut, json, brutTexte) {
    var message = (json && (json.message || json.msg || json.error_description || json.error)) || '';
    var e = new Error(
      statut === 401 || statut === 403 ? 'Session expirée ou droits insuffisants. Reconnectez-vous.'
        : message ? String(message) : 'Erreur ' + statut + (brutTexte ? ' : ' + String(brutTexte).slice(0, 200) : ''));
    e.statut = statut;
    e.code = (json && json.code) || null;
    e.detail = message || null;
    return e;
  }

  async function crmFetch(methode, chemin, corps, prefer, options) {
    options = options || {};
    function envoyer() {
      var entetes = { apikey: CRM.config.cleAnon, Authorization: 'Bearer ' + jetonCourant() };
      if (corps !== undefined && corps !== null) entetes['Content-Type'] = 'application/json';
      if (prefer) entetes.Prefer = prefer;
      var requete = { method: methode, headers: entetes,
        body: corps !== undefined && corps !== null ? JSON.stringify(corps) : undefined };
      // Demandé pour une écriture lancée pendant que la page se ferme : sans cela le navigateur l'abandonne.
      if (options.keepalive) requete.keepalive = true;
      return fetch(CRM.config.url + chemin, requete);
    }
    var r;
    try {
      r = await envoyer();
      if (r.status === 401 && await rafraichirJeton()) r = await envoyer();
    } catch (e) {
      var reseau = new Error('Connexion impossible. Vérifiez le réseau puis réessayez.');
      reseau.reseau = true;
      throw reseau;
    }
    var contenu = await r.text().catch(function () { return ''; });
    var json = null;
    if (contenu) { try { json = JSON.parse(contenu); } catch (e) { json = null; } }
    if (!r.ok) throw erreurHttp(r.status, json, contenu);
    // Avec return=representation, une écriture filtrée par les droits répond 200 et un tableau vide.
    if (methode !== 'GET' && /return=representation/.test(prefer || '') && Array.isArray(json) && !json.length && !options.videPermis) {
      throw new Error('Écriture refusée (droits)');
    }
    return json;
  }

  /* Appel d'une fonction Edge (POST JSON) avec le jeton de l'admin. Un 401 déclenche un rafraîchissement du jeton
     et un second essai. Rejette avec une erreur `reseau` (connexion, délai de 60 s) ou l'erreur HTTP (statut, code). */
  var DELAI_FONCTION = 60000;
  async function crmFonction(nom, corps) {
    async function envoyer() {
      var controleur = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var minuterie = setTimeout(function () { if (controleur) controleur.abort(); }, DELAI_FONCTION);
      try {
        var r = await fetch(CRM.config.url + '/functions/v1/' + nom, {
          method: 'POST',
          headers: { apikey: CRM.config.cleAnon, Authorization: 'Bearer ' + jetonCourant(), 'Content-Type': 'application/json' },
          body: JSON.stringify(corps), signal: controleur ? controleur.signal : undefined
        });
        return { r: r, contenu: await r.text().catch(function () { return ''; }) };
      } catch (e) {
        // Délai de 60 s dépassé (la fonction a répondu trop tard) : à distinguer d'un réseau coupé.
        if (controleur && controleur.signal.aborted) e.delai = true;
        throw e;
      } finally { clearTimeout(minuterie); }
    }
    var recu;
    try {
      recu = await envoyer();
      if (recu.r.status === 401 && await rafraichirJeton()) recu = await envoyer();
    } catch (e) {
      var reseau = new Error('Connexion impossible. Vérifiez le réseau puis réessayez.');
      reseau.reseau = true;
      reseau.delai = !!(e && e.delai);
      throw reseau;
    }
    var json = null;
    if (recu.contenu) { try { json = JSON.parse(recu.contenu); } catch (e) { json = null; } }
    if (!recu.r.ok) throw erreurHttp(recu.r.status, json, recu.contenu);
    return json;
  }

  function requetesLecture(maintenant) {
    var j90 = new Date(maintenant.getTime() - 90 * JOUR).toISOString();
    var j60 = new Date(maintenant.getTime() - 60 * JOUR).toISOString();
    var j30 = new Date(maintenant.getTime() - 30 * JOUR).toISOString();
    return {
      commercants: '/rest/v1/commercants?select=id,created_at,nom_boutique,slug,nom_gerant,email,telephone,adresse,ville,code_postal,' +
        'business_type,offre,abonnement_actif,abonnement_debut,abonnement_fin,stripe_customer_id,stripe_connect_actif,auth_user_id,' +
        'actif,en_pause,code_promo_utilise,frais_acquisition_paye,mois_offerts,supprime_at,is_fixture,est_demo_ambassadeur,' +
        'ambassadeur_prenom,ambassadeur_code_referral,demo_prospect_email,demo_prospect_telephone,acquisition,relances_demo,' +
        'logo_url,instagram,facebook&order=id',
      leads: '/rest/v1/leads_inscription?select=email,nom_boutique,business_type,offre,ville,telephone,device,created_at&order=created_at.desc&limit=500',
      audits: '/rest/v1/audits_prospects?select=fiche_id,mode,nom_commerce,type_commerce,ville,email,telephone,scores,manque_eur,' +
        'temperature,rdv2_date,demo_slug,data,created_at,updated_at&order=fiche_id',
      commandes: '/rest/v1/commandes?select=commercant_id,created_at,total_ttc,statut&created_at=gte.' + encodeURIComponent(j60) +
        '&order=created_at.desc,id.desc',
      evenements: '/rest/v1/analytics_events?select=event,slug,created_at,meta&created_at=gte.' + encodeURIComponent(j30) +
        '&event=in.(page_view,page_exit,paiement_commence,demo_privee_bloquee)&slug=not.is.null&order=created_at.desc',
      fiches: '/rest/v1/crm_fiches?select=*&order=id',
      interactions: '/rest/v1/crm_interactions?select=*&order=fait_at.desc,id.desc',
      taches: '/rest/v1/crm_taches?select=*&order=id',
      prospects: '/rest/v1/crm_prospects?select=*&order=created_at.asc,id.asc',
      // Journal d'appels : les 90 derniers jours suffisent à la mesure (jour, semaine, créneaux constatés).
      appels: '/rest/v1/crm_appels?select=*&fait_at=gte.' + encodeURIComponent(j90) + '&order=fait_at.desc,id.desc',
      reglages: '/rest/v1/crm_reglages?select=cle,valeur,updated_at&order=cle'
    };
  }

  /* L'API ne rend pas plus de 1000 lignes par requête, quelle que soit la limite demandée : on lit par paquets
     jusqu'à un paquet incomplet. Chaque requête doit donc porter un ordre stable, sinon des lignes sauteraient
     d'un paquet à l'autre. Au-delà de PAGES_MAX paquets on s'arrête et on le signale (`tronque`). */
  var TAILLE_PAGE = 1000, PAGES_MAX = 30;

  async function lireTout(chemin) {
    // Une requête déjà bornée sous la taille d'un paquet tient en un seul appel.
    var limite = /[?&]limit=(\d+)/.exec(chemin);
    if (limite && +limite[1] <= TAILLE_PAGE) {
      var lignes = await crmFetch('GET', chemin);
      if (!Array.isArray(lignes)) throw new Error('Réponse inattendue');
      return { lignes: lignes, tronque: false };
    }
    var toutes = [];
    for (var page = 0; page < PAGES_MAX; page++) {
      var lot = await crmFetch('GET', chemin + '&limit=' + TAILLE_PAGE + '&offset=' + page * TAILLE_PAGE);
      if (!Array.isArray(lot)) throw new Error('Réponse inattendue');
      toutes = toutes.concat(lot);
      if (lot.length < TAILLE_PAGE) return { lignes: toutes, tronque: false };
    }
    return { lignes: toutes, tronque: true };
  }

  // Une table vide ne dit rien de ses colonnes : dans le doute, on les suppose là (l'écriture tranchera).
  function colonnePresente(lignes, colonne) { return !lignes.length || colonne in lignes[0]; }

  /* Refus de l'API parce qu'une colonne n'existe pas (migration « liens » non appliquée) : PGRST204 à l'écriture,
     42703 dans une requête. */
  function estColonneAbsente(e) {
    return !!e && (e.code === 'PGRST204' || e.code === '42703' ||
      (e.statut === 400 && /column|colonne/i.test(texte(e.detail)) &&
        /lien_|google_url|instagram|facebook|signaux|analyse_at|chaleur_manuelle|reseaux_actifs|google_note|google_avis|\blat\b|\blon\b|etude|note_marcheo/.test(texte(e.detail))));
  }
  // Nom de la colonne que l'API dit ne pas connaître, ou '' si le refus ne la nomme pas.
  function colonneRefusee(e) {
    var detail = texte(e && e.detail);
    var m = /'([a-z_]+)' column/.exec(detail) || /column (?:[a-z_]+\.)?"?([a-z_]+)"? does not exist/.exec(detail);
    return m ? m[1] : '';
  }
  var MIGRATION_CHALEUR = 'la migration de la chaleur (20261116_crm_chaleur.sql) n\'est pas encore appliquée';
  var MESSAGE_ETUDE_ABSENTE = 'Étude indisponible : la migration de l\'étude (20261116_crm_etude.sql) n\'est pas encore appliquée.';
  var MIGRATION_LIENS = 'la migration des liens (20261114_crm_liens.sql) n\'est pas encore appliquée';

  // Panne passagère (réseau coupé, serveur en erreur), par opposition à une table absente ou à des droits refusés.
  function estPanne(e) { return !!e && (e.reseau === true || e.statut >= 500 || e.statut === 408 || e.statut === 429); }

  /* Charge toutes les sources en parallèle. Ne rejette jamais : une source en échec est notée dans
     CRM.etat (sourcesKo, ecriture, prospection, erreur) et le reste continue. */
  CRM.charger = function (opts) {
    opts = opts || {};
    if (chargement) return chargement;
    if (CRM.etat.charge && !opts.force) return Promise.resolve(CRM.fiches);
    CRM.init();
    var requetes = requetesLecture(CRM.horloge());
    var noms = Object.keys(requetes);
    // Ce qu'on savait lire avant ce chargement : une source qui échoue cette fois-ci garde ses dernières lignes.
    var dejaLues = CRM.etat.charge ? noms.filter(function (nom) { return sourcesSansDonnees.indexOf(nom) < 0; }) : [];
    chargement = Promise.all(noms.map(function (nom) {
      return lireTout(requetes[nom]).then(function (lu) {
        return { nom: nom, lignes: lu.lignes, tronque: lu.tronque };
      }, function (erreur) { return { nom: nom, erreur: erreur }; });
    })).then(function (resultats) {
      var nouveau = brutVide(), ko = [], sansDonnees = [], tronquees = [];
      var ecriture = true, panne = true, prospection = true, erreur = null;
      var annexes = { appels: true, reglages: true };
      resultats.forEach(function (r) {
        if (!r.erreur) {
          nouveau[r.nom] = r.lignes;
          if (r.tronque) tronquees.push(r.nom);
          return;
        }
        // Journal d'appels et réglages : des à-côtés. Leur absence ne compte pas parmi les sources en échec ;
        // une panne passagère garde les dernières lignes lues et laisse l'écriture tenter sa chance.
        if (r.nom in annexes) {
          annexes[r.nom] = estPanne(r.erreur);
          if (dejaLues.indexOf(r.nom) >= 0 && estPanne(r.erreur)) nouveau[r.nom] = brut[r.nom];
          return;
        }
        ko.push(r.nom);
        if (r.nom === 'prospects') prospection = false;
        else if (r.nom === 'fiches' || r.nom === 'interactions' || r.nom === 'taches') {
          ecriture = false;
          if (!estPanne(r.erreur)) panne = false;
        } else if (r.nom === 'commercants') erreur = r.erreur.message || 'Chargement impossible';
        // Mieux vaut des lignes d'il y a quelques minutes qu'une source prise pour vide. Les commerçants font
        // exception : sans eux, l'échec doit rester une erreur visible.
        if (r.nom !== 'commercants' && dejaLues.indexOf(r.nom) >= 0) nouveau[r.nom] = brut[r.nom];
        // Une table du CRM absente (migration non appliquée) est réellement vide, pas « inconnue ».
        else if (!/^(fiches|interactions|taches|prospects)$/.test(r.nom) || estPanne(r.erreur)) sansDonnees.push(r.nom);
      });
      brut = nouveau;
      generation++;
      sourcesSansDonnees = sansDonnees;
      CRM.etat.sourcesKo = ko;
      CRM.etat.sourcesTronquees = tronquees;
      CRM.etat.ecriture = ecriture;
      CRM.etat.ecriturePanne = !ecriture && panne;
      CRM.etat.prospection = prospection;
      // Une table lue sans les colonnes de la migration « liens » : on le sait avant même d'essayer d'écrire.
      CRM.etat.liens = colonnePresente(nouveau.fiches, 'lien_google');
      CRM.etat.liensProspects = colonnePresente(nouveau.prospects, 'google_url');
      CRM.etat.chaleur = colonnePresente(nouveau.prospects, 'signaux');
      CRM.etat.etude = colonnePresente(nouveau.prospects, 'etude_demandee_at');
      CRM.etat.appels = annexes.appels;
      CRM.etat.reglages = annexes.reglages;
      CRM.etat.erreur = erreur;
      CRM.etat.charge = true;
      CRM.etat.chargeLe = CRM.horloge();
      chargement = null;
      recalculer();
      envoyerReglagesLocaux();
      return CRM.fiches;
    });
    return chargement;
  };

  // ───────────────────────────── Lectures ─────────────────────────────

  CRM.fiche = function (cle) { return parCle.get(cle); };

  function valeurScore(f) { return f.score ? f.score.valeur : -1; }

  CRM.file = function (maintenant) {
    var groupes = { retard: [], aujourdhui: [], semaine: [] };
    CRM.fiches.forEach(function (f) {
      var action = maintenant ? prochaineAction(f, maintenant) : f.action;
      if (action && groupes[action.urgence]) groupes[action.urgence].push({ fiche: f, action: action });
    });
    Object.keys(groupes).forEach(function (g) {
      groupes[g].sort(function (a, b) { return valeurScore(b.fiche) - valeurScore(a.fiche); });
    });
    return groupes;
  };

  /* parEtape[id] = { nb, mensuel, installation } ; le potentiel additionne les démos en cours
     (démo, démo engagée, paiement commencé) dont l'offre est connue. */
  CRM.compteurs = function () {
    var c = { aTraiter: 0, chaudes: 0, paiements: 0, clients: 0, mrr: 0, potentielMensuel: 0, potentielInstallation: 0, parEtape: {} };
    ETAPES.forEach(function (e) { c.parEtape[e.id] = { nb: 0, mensuel: 0, installation: 0 }; });
    CRM.fiches.forEach(function (f) {
      var offre = OFFRES[f.offre], e = c.parEtape[f.etape];
      e.nb++;
      if (offre) { e.mensuel += offre.mensuel; e.installation += offre.installation; }
      if (f.action && (f.action.urgence === 'retard' || f.action.urgence === 'aujourdhui')) c.aTraiter++;
      if (estDemo(f.etape) && f.score && f.score.niveau === 'chaud') c.chaudes++;
      if (f.etape === 'paiement') c.paiements++;
      if (f.etape === 'client') { c.clients++; if (offre) c.mrr += offre.mensuel; }
      if ((estDemo(f.etape) || f.etape === 'paiement') && offre) {
        c.potentielMensuel += offre.mensuel; c.potentielInstallation += offre.installation;
      }
    });
    return c;
  };

  function correspondEtape(f, filtre) {
    if (!filtre || filtre === 'toutes') return true;
    if (filtre === 'demos') return estDemo(f.etape);
    if (filtre === 'chaudes') return estDemo(f.etape) && !!f.score && f.score.niveau === 'chaud';
    if (filtre === 'a_traiter') return !!f.action && f.action.urgence !== 'semaine';
    return f.etape === filtre;
  }

  /* etape : 'toutes' (défaut), un identifiant d'étape, 'demos' (démo + démo engagée), ou les raccourcis
     des indicateurs 'chaudes' et 'a_traiter'. tri : 'score' (défaut), 'recentes', 'nom', 'contact'. */
  CRM.rechercher = function (recherche, options) {
    options = options || {};
    var mots = sansAccents(recherche).split(/\s+/).filter(Boolean);
    var chiffres = texte(recherche).replace(/\D/g, '');
    var liste = CRM.fiches.filter(function (f) {
      if (!correspondEtape(f, options.etape)) return false;
      if (!mots.length) return true;
      var botte = sansAccents([f.nom, f.gerant, f.ville, f.email, f.telephone, f.metierLibelle].join(' '));
      if (mots.every(function (m) { return botte.indexOf(m) >= 0; })) return true;
      // « 06 12 34 » doit retrouver 0612345678, quelle que soit la façon dont le numéro est écrit.
      return chiffres.length >= 4 && /^[\d\s.+()\-]+$/.test(texte(recherche)) && f.telNormalise.indexOf(normaliserTel(chiffres) || chiffres) >= 0;
    });
    var tris = {
      score: function (a, b) { return valeurScore(b) - valeurScore(a) || ms(b.creeLe) - ms(a.creeLe); },
      recentes: function (a, b) { return ms(b.depuis || b.creeLe) - ms(a.depuis || a.creeLe); },
      nom: function (a, b) { return sansAccents(a.nom) < sansAccents(b.nom) ? -1 : sansAccents(a.nom) > sansAccents(b.nom) ? 1 : 0; },
      contact: function (a, b) { return ms(b.dernierContact) - ms(a.dernierContact); }
    };
    return liste.sort(tris[options.tri] || tris.score);
  };

  CRM.fil = fil;
  CRM.etape = etape;
  CRM.score = score;
  CRM.prochaineAction = prochaineAction;
  CRM.modeles = function (fiche) { return modeles(fiche, CRM.config); };
  CRM.liens = liens;
  CRM.lienBoutique = function (fiche) { return lienBoutique(fiche, CRM.config.origine); };
  CRM.nomDepartement = nomDepartement;
  CRM.normaliserLien = normaliserLien;
  CRM.estLienMaps = estLienMaps;

  /* Présence en ligne d'un prospect de la file d'appels : celle de sa fiche quand il en a une (liens saisis
     compris), sinon ce que la recherche a trouvé, et toujours les recherches automatiques. */
  CRM.presenceProspect = function (p) {
    if (!p) return presence({});
    var f = p.id != null ? parCle.get(cleDe('p', p.id)) : null;
    return f ? f.presence : presence({ nom: p.nom, commune: p.commune, prospects: [p] });
  };

  /* Autres prospects de la file de la même maison. `homonymes` : ils affichent le même site (le leur, pas une page
     Facebook) avec un autre numéro ou une autre commune : plusieurs points de vente. `memeNom` : ils portent
     seulement le même nom, tout près (15 km, ou même commune) : un indice à vérifier, jamais une affirmation.
     Deux « Boulangerie du Centre » de deux villes éloignées, ou de deux campagnes sans rapport, ne comptent pas. */
  function indexerFile() {
    if (homonymesFile) return;
    homonymesFile = new Map();
    lignesFile = new Set(brut.prospects);
    brut.prospects.forEach(function (x) {
      var cle = cleEnseigne(x.nom), domaine = domaineSite(x.site_web);
      [cle && 'n:' + cle, domaine && 's:' + domaine].filter(Boolean).forEach(function (c) {
        if (!homonymesFile.has(c)) homonymesFile.set(c, []);
        homonymesFile.get(c).push(x);
      });
    });
  }
  function homonymesDansFile(p) {
    var cle = cleEnseigne(p.nom), domaine = domaineSite(p.site_web);
    function autre(x) {
      return x !== p && x.id !== p.id && !memeEndroit(p, x) && (texte(x.telephone) !== texte(p.telephone) || sansAccents(x.commune) !== sansAccents(p.commune));
    }
    var maison = domaine ? (homonymesFile.get('s:' + domaine) || []).filter(autre) : [];
    var memeNom = cle ? (homonymesFile.get('n:' + cle) || []).filter(function (x) { return autre(x) && maison.indexOf(x) < 0 && voisins(p, x); }) : [];
    return { homonymes: maison.length, memeNom: memeNom.length };
  }

  /* Chaleur d'un prospect (voir chaleurProspect), homonymes de la file compris. Rend null quand les colonnes de la
     migration manquent : l'interface n'affiche alors aucune pastille. Le résultat est gardé jusqu'au prochain recalcul. */
  CRM.chaleurProspect = function (p) {
    if (!p || !CRM.etat.chaleur) return null;
    if (cacheChaleur.has(p)) return cacheChaleur.get(p);
    indexerFile();
    var dansFile = lignesFile.has(p);
    var ch = chaleurProspect(p, dansFile ? homonymesDansFile(p) : {});
    // Seules les lignes de la file sont gardées : toute modification d'une d'elles passe par un recalcul, qui vide ce cache.
    if (dansFile) cacheChaleur.set(p, ch);
    return ch;
  };
  CRM.angleProspect = function (p) {
    var ch = CRM.chaleurProspect(p);
    return ch ? angleProspect(p, ch) : null;
  };
  function jourUtc(v) { var d = new Date(v); return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10); }

  /* Ce qu'il reste à faire analyser d'un prospect : 'jamais' (aucune analyse), 'google' (analysé, mais sa fiche
     Google n'a pas pu être cherchée : clé absente à l'époque, plafond du jour atteint, panne), 'site' (son site
     n'a pas répondu : trois essais au plus, un par jour ; ou il a changé depuis l'analyse), ou '' (rien). Sans cela un prospect analysé un jour sans
     clé Google, ou au-delà du plafond, n'aurait plus jamais sa fiche Google remplie automatiquement. */
  function resteAAnalyser(p, maintenant) {
    if (!p) return '';
    if (!p.analyse_at) return 'jamais';
    var s = objet(p.signaux) || {}, google = objet(s.google), site = objet(s.site);
    var etatGoogle = google && texte(google.etat) ? texte(google.etat) : 'sans_cle';
    var instant = new Date(maintenant).getTime();
    function age(le) { var t = Date.parse(le); return isNaN(t) ? Infinity : instant - t; }
    // La fonction vient de dire que le plafond Google du jour est atteint : rien à lui redemander avant demain.
    var plafondAtteint = !!CRM.etat.googlePlafond && CRM.etat.googlePlafond === jourUtc(instant);
    // Clé absente : reproposé tant que la fonction n'a pas redit, pendant cette session, qu'elle n'a pas de clé.
    if (!plafondAtteint && etatGoogle === 'sans_cle' && CRM.etat.google !== 'sans_cle') return 'google';
    // Plafond du jour : reproposé le lendemain (jour UTC, comme le compteur de la fonction).
    if (!plafondAtteint && etatGoogle === 'quota' && jourUtc(google.le) !== jourUtc(instant)) return 'google';
    if (!plafondAtteint && etatGoogle === 'erreur' && age(google.le) >= DELAI_REESSAI_GOOGLE) return 'google';
    if (site && site.etat === 'injoignable' && (nombreFini(site.essais) || 1) < ESSAIS_SITE && age(site.le) >= DELAI_REESSAI_SITE) return 'site';
    // Le site a changé depuis l'analyse (saisi, corrigé) : ce qu'elle a vu ne le concerne plus.
    var siteWeb = texte(p.site_web).slice(0, 300);
    if (site && siteWeb && (site.etat === 'pas_de_site' || (texte(site.de) && texte(site.de) !== siteWeb))) return 'site';
    return '';
  }

  /* Prospects à (faire) analyser, dans l'ordre de la file : ceux que la fonction crm-enrichir n'a jamais regardés,
     puis ceux dont il reste la fiche Google ou le site à reprendre (voir resteAAnalyser). Les prospects qui ont
     fait échouer la fonction pendant cette session viennent en dernier. `liste` : nom d'une campagne. */
  CRM.aAnalyser = function (liste) {
    var nom = texte(liste), maintenant = CRM.horloge();
    var jamais = [], reprises = [], difficiles = [];
    brut.prospects.forEach(function (p) {
      if (p.enAttente || /^provisoire-/.test(String(p.id)) || (nom && (p.liste || 'Prospection') !== nom)) return;
      var reste = resteAAnalyser(p, maintenant);
      if (!reste) return;
      (echecsAnalyse[p.id] ? difficiles : reste === 'jamais' ? jamais : reprises).push(p);
    });
    return jamais.concat(reprises, difficiles);
  };
  /* Pourquoi un prospect est proposé à l'analyse : 'jamais', 'google', 'site' ou ''. */
  CRM.resteAAnalyser = function (p) { return resteAAnalyser(p, CRM.horloge()); };

  // ───────────────────────────── Étude des prospects : file d'attente et arrivées ─────────────────────────────

  /* Étude et demande d'étude d'un prospect (voir etudeProspect). null sans la migration de l'étude. */
  CRM.etudeProspect = function (p) { return CRM.etat.etude ? etudeProspect(p) : null; };

  /* Prospects en attente d'étude, les plus anciennes demandes d'abord (hors faux numéro et « pas intéressé », que
     la file de la base n'envoie pas à l'étude). */
  CRM.enFileEtude = function () {
    if (!CRM.etat.etude) return [];
    return brut.prospects.filter(function (p) { return !!p.etude_demandee_at && RESULTATS_SANS_ETUDE.indexOf(p.resultat) < 0; })
      .sort(function (a, b) { return ms(a.etude_demandee_at) - ms(b.etude_demandee_at); });
  };

  var LOT_ETUDE = 100;
  // Colonnes que crm_etude_ecrire peut avoir remplies (seulement si elles étaient vides).
  var COLONNES_TROUVEES = ['commune', 'code_postal', 'adresse', 'site_web', 'instagram', 'facebook', 'google_url', 'email'];

  /* Pose ou retire la demande d'étude d'un ensemble de prospects (une requête par paquet de 100). Optimiste : en
     cas d'échec, les paquets non enregistrés reviennent à leur valeur d'avant. */
  function ecrireFileEtude(cibles, valeur) {
    return suivreEcriture(async function () {
      var avant = cibles.map(function (p) { return p.etude_demandee_at || null; });
      cibles.forEach(function (p) { p.etude_demandee_at = valeur; });
      recalculer();
      var debut = 0;
      try {
        for (; debut < cibles.length; debut += LOT_ETUDE) {
          var lot = cibles.slice(debut, debut + LOT_ETUDE);
          var lignes = await crmFetch('PATCH', '/rest/v1/crm_prospects?id=in.(' + lot.map(function (p) { return encodeURIComponent(p.id); }).join(',') + ')&select=id,updated_at',
            { etude_demandee_at: valeur }, 'return=representation');
          (Array.isArray(lignes) ? lignes : []).forEach(function (l) {
            var p = l && trouverParId(brut.prospects, l.id);
            if (p && l.updated_at) p.updated_at = l.updated_at;
          });
        }
        return cibles.length;
      } catch (e) {
        cibles.slice(debut).forEach(function (p, i) { if (p.etude_demandee_at === valeur) p.etude_demandee_at = avant[debut + i]; });
        if (estColonneAbsente(e)) {
          CRM.etat.etude = false;
          recalculer();
          throw new Error(MESSAGE_ETUDE_ABSENTE);
        }
        recalculer();
        throw e;
      }
    });
  }

  /* Met des prospects en file d'étude (etude_demandee_at = maintenant). Sans `opts.forcer`, ceux qui ont déjà une
     étude ou une demande sont laissés ; avec (« Redemander l'étude » d'une fiche), ils repassent. Un faux numéro
     ou un « pas intéressé » n'est jamais mis en file. Résout { demandes }. */
  CRM.demanderEtudes = async function (ids, opts) {
    verifierProspection();
    if (!CRM.etat.etude) throw new Error(MESSAGE_ETUDE_ABSENTE);
    var forcer = !!(opts && opts.forcer);
    var prospects = idsAnalysables(ids).map(function (id) { return trouverParId(brut.prospects, id); });
    var cibles = forcer ? prospects.filter(function (p) { return RESULTATS_SANS_ETUDE.indexOf(p.resultat) < 0; }) : aEtudier(prospects);
    if (forcer && prospects.length && !cibles.length) throw new Error('Un faux numéro ou un « pas intéressé » n\'est pas étudié.');
    if (!cibles.length) return { demandes: 0 };
    return { demandes: await ecrireFileEtude(cibles, CRM.horloge().toISOString()) };
  };

  /* Retire des prospects de la file d'étude. Résout { retires }. */
  CRM.retirerEtudes = async function (ids) {
    verifierProspection();
    if (!CRM.etat.etude) throw new Error(MESSAGE_ETUDE_ABSENTE);
    var cibles = idsAnalysables(ids).map(function (id) { return trouverParId(brut.prospects, id); }).filter(function (p) { return !!p.etude_demandee_at; });
    if (!cibles.length) return { retires: 0 };
    return { retires: await ecrireFileEtude(cibles, null) };
  };

  /* Lecture légère des études arrivées depuis la dernière vue (la tâche planifiée écrit en base à son rythme).
     Seules les lignes dont l'étude est plus récente que la dernière connue sont lues, et seules les colonnes de
     l'étude sont recopiées ; une colonne que crm_etude_ecrire a pu remplir n'est prise que si elle est vide ici.
     Résout { arrivees, indisponible }. Ne rejette jamais, n'écrit rien dans la console. */
  var lectureEtudes = null;
  CRM.rafraichirEtudes = function () {
    if (!CRM.etat.etude || !CRM.etat.prospection || !CRM.etat.charge) return Promise.resolve({ arrivees: 0, indisponible: !CRM.etat.etude });
    if (lectureEtudes) return lectureEtudes;
    var derniere = '';
    brut.prospects.forEach(function (p) { if (p.etude_at && (!derniere || ms(p.etude_at) > ms(derniere))) derniere = p.etude_at; });
    var chemin = '/rest/v1/crm_prospects?select=id,' + COLONNES_ETUDE.concat(COLONNES_TROUVEES).join(',') + ',updated_at&etude_at=' +
      (derniere ? 'gt.' + encodeURIComponent(derniere) : 'not.is.null') + '&order=etude_at.asc,id.asc&limit=' + TAILLE_PAGE;
    var generationDepart = generation;
    lectureEtudes = crmFetch('GET', chemin).then(function (lignes) {
      // Un rechargement complet est passé entre-temps : il a déjà tout lu.
      if (!Array.isArray(lignes) || generation !== generationDepart) return { arrivees: 0, indisponible: false };
      var arrivees = 0;
      lignes.forEach(function (l) {
        var p = l && trouverParId(brut.prospects, l.id);
        if (!p || !l.etude_at || (p.etude_at && ms(l.etude_at) <= ms(p.etude_at))) return;
        p.etude = l.etude; p.etude_at = l.etude_at; p.note_marcheo = l.note_marcheo == null ? null : l.note_marcheo;
        // Redemandée ici après l'écriture de cette étude : la demande locale reste.
        if (!(p.etude_demandee_at && ms(p.etude_demandee_at) > ms(l.etude_at))) p.etude_demandee_at = l.etude_demandee_at || null;
        COLONNES_TROUVEES.forEach(function (c) { if (c in l && !texte(p[c]) && texte(l[c])) p[c] = l[c]; });
        if (l.updated_at) p.updated_at = l.updated_at;
        arrivees++;
      });
      if (arrivees) recalculer();
      return { arrivees: arrivees, indisponible: false };
    }, function (e) {
      if (estColonneAbsente(e)) { CRM.etat.etude = false; recalculer(); }
      return { arrivees: 0, indisponible: true };
    }).then(function (bilan) { lectureEtudes = null; return bilan; });
    return lectureEtudes;
  };
  // Période du rafraîchissement léger de la vue Prospection, tant qu'il reste des prospects en file (ms).
  CRM.PERIODE_ETUDES = 60000;

  // ───────────────────────────── Écritures du CRM ─────────────────────────────

  function refuser(message) { return Promise.reject(new Error(message)); }

  function verifierEcriture() {
    if (CRM.etat.ecriture) return;
    throw new Error(CRM.etat.ecriturePanne
      ? 'Le CRM est en lecture seule pour l\'instant : actualisez la page dans un instant.'
      : 'Le CRM est en lecture seule : la migration CRM n\'est pas encore appliquée.');
  }

  function verifierCle(cle) {
    if (!/^[calp]:.+/.test(texte(cle)) || texte(cle).length > 260) throw new Error('Fiche inconnue.');
  }

  // Les écritures vont toujours sur la clé principale de la fiche, quelle que soit la clé reçue.
  function clePrincipale(cle) {
    var f = parCle.get(cle);
    return f ? f.cle : cle;
  }

  function estDate(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !!versDate(v); }

  function idProvisoire() { return 'provisoire-' + (++compteurProvisoire); }

  function remplacer(liste, ancien, nouveau) {
    var i = liste.indexOf(ancien);
    if (i >= 0) liste[i] = nouveau;
    return i >= 0;
  }
  function retirer(liste, element) {
    var i = liste.indexOf(element);
    if (i >= 0) liste.splice(i, 1);
    return i;
  }
  function trouverParId(liste, id) {
    for (var i = 0; i < liste.length; i++) if (liste[i].id === id) return liste[i];
    return null;
  }

  /* Entoure une écriture optimiste. Un chargement qui la croise peut lire la base sans elle, ou remplacer
     `brut` pendant qu'elle attend sa réponse : l'écriture réussit en base mais disparaît de l'écran. Dans ce
     cas, une relecture part dès que plus rien n'est en vol (réussite ou échec : le retour arrière se fait
     lui aussi sur les anciennes données). */
  function suivreEcriture(executer) {
    var generationDepart = generation, chevauche = !!chargement;
    ecrituresEnVol++;
    function fin() {
      if (chevauche || chargement || generation !== generationDepart) rechargementDu = true;
      if (--ecrituresEnVol === 0 && rechargementDu) {
        rechargementDu = false;
        // Après le chargement en cours, sinon charger() rendrait cette lecture déjà périmée.
        (chargement || Promise.resolve()).then(function () { return CRM.charger({ force: true }); });
      }
    }
    return executer().then(function (v) { fin(); return v; }, function (e) { fin(); throw e; });
  }

  /* Insertion optimiste : la ligne provisoire est visible tout de suite, remplacée par celle de la base
     à la réponse, retirée si l'écriture échoue. */
  function inserer(liste, table, ligne) {
    return suivreEcriture(function () { return insererSansSuivi(liste, table, ligne); });
  }
  async function insererSansSuivi(liste, table, ligne) {
    var provisoire = Object.assign({ id: idProvisoire(), created_at: CRM.horloge().toISOString(), enAttente: true }, ligne);
    liste.push(provisoire);
    recalculer();
    try {
      var lignes = await crmFetch('POST', '/rest/v1/' + table, ligne, 'return=representation');
      remplacer(liste, provisoire, lignes[0]);
      recalculer();
      return lignes[0];
    } catch (e) {
      retirer(liste, provisoire);
      recalculer();
      throw e;
    }
  }

  function modifier(liste, table, id, champs) {
    return suivreEcriture(function () { return modifierSansSuivi(liste, table, id, champs); });
  }
  async function modifierSansSuivi(liste, table, id, champs) {
    var avant = trouverParId(liste, id);
    if (!avant) throw new Error('Élément introuvable.');
    var apres = Object.assign({}, avant, champs);
    remplacer(liste, avant, apres);
    recalculer();
    try {
      var lignes = await crmFetch('PATCH', '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), champs, 'return=representation');
      var enregistre = Object.assign({}, apres, lignes[0]);
      remplacer(liste, apres, enregistre);
      recalculer();
      return enregistre;
    } catch (e) {
      remplacer(liste, apres, avant);
      recalculer();
      throw e;
    }
  }

  function supprimer(liste, table, id) {
    return suivreEcriture(function () { return supprimerSansSuivi(liste, table, id); });
  }
  async function supprimerSansSuivi(liste, table, id) {
    var ligne = trouverParId(liste, id);
    if (!ligne) throw new Error('Élément introuvable.');
    var position = retirer(liste, ligne);
    recalculer();
    try {
      await crmFetch('DELETE', '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), null, 'return=representation');
    } catch (e) {
      liste.splice(Math.min(position, liste.length), 0, ligne);
      recalculer();
      throw e;
    }
  }

  CRM.ajouterInteraction = async function (cle, donnees) {
    verifierEcriture(); verifierCle(cle);
    donnees = donnees || {};
    if (TYPES_INTERACTION.indexOf(donnees.type) < 0) throw new Error('Type d\'échange inconnu.');
    if (donnees.resultat && RESULTATS_INTERACTION.indexOf(donnees.resultat) < 0) throw new Error('Résultat inconnu.');
    var contenu = texte(donnees.contenu).slice(0, 8000);
    if (donnees.type === 'note' && !contenu) throw new Error('La note est vide.');
    var faitLe = versDate(donnees.fait_at) || CRM.horloge();
    return inserer(brut.interactions, 'crm_interactions', {
      cle: clePrincipale(cle), type: donnees.type, resultat: donnees.resultat || null,
      contenu: contenu || null, fait_at: faitLe.toISOString()
    });
  };

  CRM.supprimerInteraction = async function (id) {
    verifierEcriture();
    return supprimer(brut.interactions, 'crm_interactions', id);
  };

  CRM.ajouterTache = async function (cle, donnees) {
    verifierEcriture(); verifierCle(cle);
    donnees = donnees || {};
    var titre = texte(donnees.titre).slice(0, 300);
    if (!titre) throw new Error('Donnez un titre à la tâche.');
    var echeance = donnees.echeance || dateLocaleISO(CRM.horloge());
    if (!estDate(echeance)) throw new Error('Date d\'échéance invalide.');
    return inserer(brut.taches, 'crm_taches', { cle: clePrincipale(cle), titre: titre, echeance: echeance, fait_at: null });
  };

  CRM.terminerTache = async function (id, fait) {
    verifierEcriture();
    return modifier(brut.taches, 'crm_taches', id, { fait_at: fait === false ? null : CRM.horloge().toISOString() });
  };

  CRM.reporterTache = async function (id, echeance) {
    verifierEcriture();
    if (!estDate(echeance)) throw new Error('Date d\'échéance invalide.');
    return modifier(brut.taches, 'crm_taches', id, { echeance: echeance });
  };

  CRM.supprimerTache = async function (id) {
    verifierEcriture();
    return supprimer(brut.taches, 'crm_taches', id);
  };

  /* L'état d'une fiche (perdu, report, note épinglée) n'existe en base qu'à partir de la première écriture :
     on passe par un upsert sur la clé, qui ne touche que les colonnes envoyées. */
  async function ecrireEtat(cle, champs) {
    verifierEcriture(); verifierCle(cle);
    return suivreEcriture(function () { return ecrireEtatSansSuivi(cle, champs); });
  }
  async function ecrireEtatSansSuivi(cle, champs) { return ecrireLigneEtat(clePrincipale(cle), champs); }
  // Écrit sur la ligne de cette clé exacte (principale, ou secondaire quand il faut y effacer un lien).
  async function ecrireLigneEtat(principale, champs) {
    var avant = null;
    for (var i = 0; i < brut.fiches.length; i++) if (brut.fiches[i].cle === principale) avant = brut.fiches[i];
    var apres = Object.assign({ cle: principale, perdu_at: null, motif_perte: null, reporte_jusqua: null, note_epinglee: null }, avant, champs);
    if (avant) remplacer(brut.fiches, avant, apres); else brut.fiches.push(apres);
    recalculer();
    try {
      var lignes = await crmFetch('POST', '/rest/v1/crm_fiches?on_conflict=cle', Object.assign({ cle: principale }, champs),
        'resolution=merge-duplicates,return=representation');
      remplacer(brut.fiches, apres, Object.assign({}, apres, lignes[0]));
      recalculer();
      return lignes[0];
    } catch (e) {
      if (avant) remplacer(brut.fiches, apres, avant); else retirer(brut.fiches, apres);
      recalculer();
      throw e;
    }
  }

  CRM.reporter = async function (cle, date) {
    if (date != null && !estDate(date)) throw new Error('Date de report invalide.');
    return ecrireEtat(cle, { reporte_jusqua: date || null });
  };

  CRM.epingler = async function (cle, contenu) {
    return ecrireEtat(cle, { note_epinglee: texte(contenu).slice(0, 4000) || null });
  };

  /* Enregistre les liens saisis à la main sur une fiche : { google, instagram, facebook }. Seuls les réseaux
     fournis sont touchés ; null ou une chaîne vide efface le lien saisi (le lien trouvé automatiquement, s'il
     existe, redevient visible). Une valeur qui n'est pas un lien valable fait rejeter tout l'appel. */
  CRM.majLiens = async function (cle, liens) {
    verifierEcriture(); verifierCle(cle);
    if (!CRM.etat.liens) throw new Error('L\'enregistrement des liens est inactif : ' + MIGRATION_LIENS + '.');
    liens = liens || {};
    var champs = {};
    RESEAUX.forEach(function (r) {
      if (!(r.id in liens)) return;
      var saisi = texte(liens[r.id]);
      if (!saisi) { champs[r.colonne] = null; return; }
      var lien = normaliserLien(r.id, saisi);
      if (!lien) throw new Error(r.erreur);
      champs[r.colonne] = lien;
    });
    if (!Object.keys(champs).length) return null;
    /* La présence lit les liens saisis sur toutes les clés de la fiche (un lead ou un prospect devenu démo garde
       les siens sur son ancienne clé). Effacer, c'est donc aussi vider la colonne sur les clés secondaires qui la
       portent, sinon l'ancien lien réapparaîtrait aussitôt. Aucune ligne n'est créée pour cela. */
    var principale = clePrincipale(cle), f = parCle.get(cle);
    var secondaires = [];
    (f ? f.cles : []).forEach(function (autre) {
      if (autre === principale) return;
      var ligne = null, aVider = {};
      for (var i = 0; i < brut.fiches.length; i++) if (brut.fiches[i].cle === autre) ligne = brut.fiches[i];
      if (!ligne) return;
      Object.keys(champs).forEach(function (colonne) { if (champs[colonne] === null && ligne[colonne] != null) aVider[colonne] = null; });
      if (Object.keys(aVider).length) secondaires.push({ cle: autre, champs: aVider });
    });
    try {
      return await suivreEcriture(async function () {
        var resultat = await ecrireLigneEtat(principale, champs);
        for (var i = 0; i < secondaires.length; i++) await ecrireLigneEtat(secondaires[i].cle, secondaires[i].champs);
        return resultat;
      });
    } catch (e) {
      if (!estColonneAbsente(e)) throw e;
      // Les colonnes manquent en base : on le retient pour ne plus proposer l'enregistrement, le reste continue.
      CRM.etat.liens = false;
      recalculer();
      throw new Error('Lien non enregistré : ' + MIGRATION_LIENS + '.');
    }
  };

  // Le changement d'état est l'essentiel ; sa trace dans le fil est du confort et ne doit pas le faire échouer.
  async function consignerEtape(cle, resultat, contenu) {
    try {
      await inserer(brut.interactions, 'crm_interactions', {
        cle: clePrincipale(cle), type: 'etape', resultat: resultat, contenu: contenu || null, fait_at: CRM.horloge().toISOString()
      });
    } catch (e) { /* l'état est enregistré, seule la ligne du fil manque */ }
  }

  CRM.marquerPerdu = async function (cle, motif) {
    var raison = texte(motif).slice(0, 200) || 'Autre';
    var etat = await ecrireEtat(cle, { perdu_at: CRM.horloge().toISOString(), motif_perte: raison });
    await consignerEtape(cle, 'perdu', raison);
    return etat;
  };

  CRM.rouvrir = async function (cle) {
    var etat = await ecrireEtat(cle, { perdu_at: null, motif_perte: null });
    await consignerEtape(cle, 'rouvert', null);
    return etat;
  };

  // ───────────────────────────── Écritures de la prospection ─────────────────────────────

  var CHAMPS_PROSPECT = {
    nom: 200, metier: 80, business_type: 40, adresse: 300, commune: 120, code_postal: 10, departement: 3,
    email: 200, site_web: 300, source_ref: 80, remarque: 500, liste: 80, note: 4000, recommandation: 500
  };
  var SOURCES_PROSPECT = ['osm', 'mairie', 'import', 'manuel'];

  function verifierProspection() {
    if (!CRM.etat.prospection) throw new Error('La prospection est inactive : la migration des prospects n\'est pas encore appliquée.');
  }

  /* Téléphones et références déjà connus : la file de prospection d'un côté, les fiches du CRM de l'autre
     (tous les commerçants, y compris suspendus ou de test : on ne démarche pas un numéro déjà en base). */
  CRM.dejaConnus = function () {
    var telephones = new Set(), refs = new Set(), crm = new Set();
    function noter(ensemble, v) { var t = normaliserTel(v); if (t) ensemble.add(t); }
    brut.prospects.forEach(function (p) { noter(telephones, p.telephone); if (p.source_ref) refs.add(p.source_ref); });
    brut.commercants.forEach(function (c) { noter(crm, c.telephone); noter(crm, c.demo_prospect_telephone); });
    brut.leads.forEach(function (l) { noter(crm, l.telephone); });
    brut.audits.forEach(function (a) { noter(crm, a.telephone); });
    return { telephones: telephones, refs: refs, crm: crm };
  };

  // Toutes les lignes d'un envoi groupé doivent porter exactement les mêmes colonnes.
  function preparerProspect(ligne) {
    ligne = ligne || {};
    var p = {};
    Object.keys(CHAMPS_PROSPECT).forEach(function (champ) {
      if (champ === 'note' || champ === 'recommandation') return;
      p[champ] = texte(ligne[champ]).slice(0, CHAMPS_PROSPECT[champ]) || null;
    });
    p.telephone = texte(ligne.telephone) ? telFrancais(ligne.telephone) : null;
    p.email = normaliserEmail(ligne.email) || null;
    p.departement = p.departement ? p.departement.toUpperCase() : null;
    p.source = SOURCES_PROSPECT.indexOf(ligne.source) >= 0 ? ligne.source : 'manuel';
    p.liste = p.liste || 'Prospection';
    RESEAUX.forEach(function (r) { p[r.colonneProspect] = normaliserLien(r.id, ligne[r.colonneProspect]) || null; });
    // Signaux de chaleur lus à la recherche (OpenStreetMap) et position : toujours présents, nuls par défaut.
    p.signaux = signauxValides(ligne.signaux);
    p.lat = coordonnee(ligne.lat, 90);
    p.lon = coordonnee(ligne.lon, 180);
    if (p.lat == null || p.lon == null) { p.lat = null; p.lon = null; }
    return p;
  }

  function sansLiens(p) {
    var copie = Object.assign({}, p);
    RESEAUX.forEach(function (r) { delete copie[r.colonneProspect]; });
    return copie;
  }
  function sansChaleur(p) {
    var copie = Object.assign({}, p);
    delete copie.signaux; delete copie.lat; delete copie.lon;
    return copie;
  }

  function filtrerNouveaux(lignes) {
    var connus = CRM.dejaConnus();
    var gardes = [], doublons = 0, ignores = 0;
    lignes.forEach(function (ligne) {
      var p = preparerProspect(ligne);
      // Un numéro fourni mais invalide n'est pas enregistré à moitié : la ligne est écartée.
      if (!p.nom || (texte(ligne && ligne.telephone) && !p.telephone)) { ignores++; return; }
      if ((p.telephone && (connus.telephones.has(p.telephone) || connus.crm.has(p.telephone))) ||
          (p.source_ref && connus.refs.has(p.source_ref))) { doublons++; return; }
      if (p.telephone) connus.telephones.add(p.telephone);
      if (p.source_ref) connus.refs.add(p.source_ref);
      gardes.push(p);
    });
    return { gardes: gardes, doublons: doublons, ignores: ignores };
  }

  function estConflit(e) { return !!e && (e.statut === 409 || e.code === '23505'); }

  /* Ajoute des prospects par lots. Les doublons (téléphone ou référence déjà en file, téléphone d'une fiche
     du CRM) sont écartés avant l'envoi. Si la base en voit quand même un (file modifiée ailleurs entre-temps),
     on recharge la file et on refait le tri une fois. Renvoie { ajoutes, doublons, ignores, prospects }. */
  CRM.ajouterProspects = async function (lignes) {
    verifierProspection();
    lignes = Array.isArray(lignes) ? lignes : [];
    return suivreEcriture(function () { return ajouterProspectsSansSuivi(lignes); });
  };
  async function ajouterProspectsSansSuivi(lignes) {
    var tri = filtrerNouveaux(lignes);
    var crees = [];
    function poster(lot) {
      return crmFetch('POST', '/rest/v1/crm_prospects', lot, 'resolution=ignore-duplicates,return=representation', { videPermis: true });
    }
    /* Migration « liens » ou « chaleur » non appliquée : les prospects sont ajoutés quand même, sans les colonnes
       que la base ne connaît pas. Le refus nomme la colonne ; sinon on retire les liens, puis la chaleur. */
    async function envoyer(lot) {
      if (!lot.length) return [];
      for (var essai = 0; ; essai++) {
        var allege = lot;
        if (!CRM.etat.liensProspects) allege = allege.map(sansLiens);
        if (!CRM.etat.chaleur) allege = allege.map(sansChaleur);
        try {
          return (await poster(allege)) || [];
        } catch (e) {
          if (!estColonneAbsente(e) || essai >= 2) throw e;
          var deChaleur = COLONNES_CHALEUR.indexOf(colonneRefusee(e)) >= 0;
          if (deChaleur && CRM.etat.chaleur) CRM.etat.chaleur = false;
          else if (!deChaleur && CRM.etat.liensProspects) CRM.etat.liensProspects = false;
          else if (CRM.etat.chaleur) CRM.etat.chaleur = false;
          else if (CRM.etat.liensProspects) CRM.etat.liensProspects = false;
          else throw e;
        }
      }
    }
    for (var debut = 0; debut < tri.gardes.length; debut += 200) {
      var lot = tri.gardes.slice(debut, debut + 200), recus;
      try {
        recus = await envoyer(lot);
      } catch (e) {
        // Les lots déjà enregistrés restent acquis : on les montre avant de signaler l'échec.
        if (!estConflit(e)) { if (crees.length) recalculer(); throw e; }
        brut.prospects = (await lireTout(requetesLecture(CRM.horloge()).prospects)).lignes;
        recus = await envoyer(filtrerNouveaux(lot).gardes);
      }
      recus.forEach(function (p) { brut.prospects.push(p); crees.push(p); });
    }
    recalculer();
    return {
      ajoutes: crees.length, doublons: Math.max(0, lignes.length - tri.ignores - crees.length),
      ignores: tri.ignores, prospects: crees
    };
  }

  /* Modification optimiste d'un prospect. Le retour arrière ne touche que les champs de CET appel, et
     seulement s'ils n'ont pas été modifiés depuis : une note tapée pendant l'envoi n'est jamais écrasée. */
  function patchProspect(id, champs, options) {
    return suivreEcriture(function () { return patchProspectSansSuivi(id, champs, options); });
  }
  async function patchProspectSansSuivi(id, champs, options) {
    var p = trouverParId(brut.prospects, id);
    if (!p) throw new Error('Prospect introuvable.');
    var avant = {};
    Object.keys(champs).forEach(function (k) { avant[k] = p[k]; });
    Object.assign(p, champs);
    recalculer();
    try {
      var lignes = await crmFetch('PATCH', '/rest/v1/crm_prospects?id=eq.' + encodeURIComponent(id), champs, 'return=representation',
        { keepalive: !!(options && options.keepalive) });
      if (lignes[0] && lignes[0].updated_at) p.updated_at = lignes[0].updated_at;
      return p;
    } catch (e) {
      Object.keys(champs).forEach(function (k) { if (p[k] === champs[k]) p[k] = avant[k]; });
      recalculer();
      throw e;
    }
  }

  /* `options.keepalive` : à demander pour un enregistrement lancé pendant que la page se ferme. */
  CRM.majProspect = async function (id, champs, options) {
    verifierProspection();
    champs = champs || {};
    var propres = {};
    Object.keys(champs).forEach(function (k) {
      if (CHAMPS_PROSPECT[k]) propres[k] = texte(champs[k]).slice(0, CHAMPS_PROSPECT[k]) || null;
    });
    if ('telephone' in champs) {
      propres.telephone = texte(champs.telephone) ? telFrancais(champs.telephone) : null;
      if (texte(champs.telephone) && !propres.telephone) throw new Error('Numéro de téléphone invalide.');
      var autre = propres.telephone && brut.prospects.filter(function (x) { return x.id !== id && x.telephone === propres.telephone; })[0];
      if (autre) throw new Error('Ce numéro est déjà dans la file (' + autre.nom + ').');
    }
    if ('rappel_le' in champs) {
      if (champs.rappel_le != null && champs.rappel_le !== '' && !estDate(champs.rappel_le)) throw new Error('Date de rappel invalide.');
      propres.rappel_le = champs.rappel_le || null;
    }
    if ('nom' in propres && !propres.nom) throw new Error('Le nom est obligatoire.');
    if ('liste' in propres && !propres.liste) propres.liste = 'Prospection';
    if ('email' in propres) propres.email = normaliserEmail(propres.email) || null;
    var avecLiens = false;
    RESEAUX.forEach(function (r) {
      if (!(r.colonneProspect in champs)) return;
      var saisi = texte(champs[r.colonneProspect]);
      propres[r.colonneProspect] = saisi ? normaliserLien(r.id, saisi) : null;
      if (saisi && !propres[r.colonneProspect]) throw new Error(r.erreur);
      avecLiens = true;
    });
    if (avecLiens && !CRM.etat.liensProspects) throw new Error('L\'enregistrement des liens est inactif : ' + MIGRATION_LIENS + '.');
    // Réglages manuels de la chaleur : niveau forcé (null = automatique) et activité des réseaux (null = inconnue).
    var avecChaleur = false;
    [['chaleur_manuelle', NIVEAUX_MANUELS], ['reseaux_actifs', ACTIVITES_RESEAUX]].forEach(function (c) {
      if (!(c[0] in champs)) return;
      var v = champs[c[0]] == null || champs[c[0]] === '' ? null : champs[c[0]];
      if (v !== null && c[1].indexOf(v) < 0) throw new Error('Valeur inconnue.');
      propres[c[0]] = v;
      avecChaleur = true;
    });
    if (avecChaleur && !CRM.etat.chaleur) throw new Error('Réglage inactif : ' + MIGRATION_CHALEUR + '.');
    if (!Object.keys(propres).length) return trouverParId(brut.prospects, id);
    if (!avecLiens && !avecChaleur) return patchProspect(id, propres, options);
    try {
      return await patchProspect(id, propres, options);
    } catch (e) {
      if (!estColonneAbsente(e)) throw e;
      if (avecChaleur && (!avecLiens || COLONNES_CHALEUR.indexOf(colonneRefusee(e)) >= 0)) {
        CRM.etat.chaleur = false;
        recalculer();
        throw new Error('Réglage inactif : ' + MIGRATION_CHALEUR + '.');
      }
      CRM.etat.liensProspects = false;
      throw new Error('Lien non enregistré : ' + MIGRATION_LIENS + '.');
    }
  };

  /* Pose le résultat d'un appel (appele_at = maintenant, nb_appels + 1). null efface le résultat
     sans effacer la trace de l'appel. `opts.correction` : le résultat d'un appel déjà compté est corrigé
     (pouce qui a glissé, résultat précisé pendant le même appel) : ni nouvel appel, ni nouvelle heure. */
  CRM.resultatProspect = async function (id, resultat, opts) {
    verifierProspection();
    var p = trouverParId(brut.prospects, id);
    if (!p) throw new Error('Prospect introuvable.');
    if (resultat == null || resultat === '') return patchProspect(id, { resultat: null, rappel_le: null });
    if (!resultatProspectDe(resultat)) throw new Error('Résultat inconnu.');
    var correction = !!(opts && opts.correction) && Number(p.nb_appels) > 0 && !!p.appele_at;
    var champs = correction ? { resultat: resultat }
      : { resultat: resultat, appele_at: CRM.horloge().toISOString(), nb_appels: (Number(p.nb_appels) || 0) + 1 };
    // Une date de rappel n'a de sens que pour « À rappeler ».
    if (resultat !== 'a_rappeler' && p.rappel_le) champs.rappel_le = null;
    return patchProspect(id, champs);
  };

  CRM.supprimerProspect = async function (id) {
    verifierProspection();
    return supprimer(brut.prospects, 'crm_prospects', id);
  };

  /* Récap à copier. `liste` : un tableau de prospects, le nom d'une liste, ou rien (toute la file). */
  CRM.recapProspection = function (liste, titre) {
    if (Array.isArray(liste)) return recap(liste, titre);
    var nom = texte(liste);
    return recap(nom ? brut.prospects.filter(function (p) { return p.liste === nom; }) : brut.prospects, titre || nom);
  };

  // ───────────────────────────── Analyse automatique (fonction crm-enrichir) ─────────────────────────────

  var LOT_ANALYSE = 5, PASSAGES_ANALYSE = 2, AUTO_MAX = 60, CLE_ANALYSE_ABSENTE = 'crm_analyse_absente';
  // Colonnes que la fonction remplit et que le navigateur recopie dans sa ligne.
  var COLONNES_ENRICHIES = ['signaux', 'analyse_at', 'google_note', 'google_avis', 'google_url', 'site_web', 'email', 'telephone',
    'instagram', 'facebook', 'lat', 'lon', 'updated_at'];

  function bilanAnalyse(champs) {
    return Object.assign({ analyses: 0, echecs: 0, restants: 0, indisponible: false, google: null, arrete: false, message: '',
      // Fiches Google qui n'ont pas pu être cherchées (plafond du jour, clé absente) et prospects qui ont fait échouer la fonction.
      googleReportes: 0, quota: false, enEchec: [] }, champs);
  }
  function idsAnalysables(ids) {
    var vus = [];
    (Array.isArray(ids) ? ids : []).forEach(function (id) {
      if (typeof id !== 'string' || !id || /^provisoire-/.test(id) || vus.indexOf(id) >= 0) return;
      var p = trouverParId(brut.prospects, id);
      if (p && !p.enAttente) vus.push(id);
    });
    return vus;
  }
  // La fonction a répondu 404 pendant cette session : plus d'appel automatique (un clic sur « Analyser » retente).
  function absenceConnue() {
    if (fonctionAbsente) return true;
    try { return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(CLE_ANALYSE_ABSENTE) === '1'; } catch (e) { return false; }
  }
  function noterAbsence(absente) {
    fonctionAbsente = absente;
    try {
      if (typeof sessionStorage === 'undefined') return;
      if (absente) sessionStorage.setItem(CLE_ANALYSE_ABSENTE, '1'); else sessionStorage.removeItem(CLE_ANALYSE_ABSENTE);
    } catch (e) { /* stockage bloqué : la mémoire de la page suffit */ }
  }
  function publierAnalyse() {
    CRM.analyseEnCours = analyse ? {
      fait: analyse.fait, total: analyse.total, auto: analyse.auto, lot: analyse.lot.slice(),
      annuler: function () { if (analyse) analyse.annule = true; }
    } : null;
  }
  function prevenirAnalyse(a) {
    a.ecouteurs.slice().forEach(function (fn) { try { fn(a.fait, a.total); } catch (e) { /* un écouteur défaillant ne bloque pas l'analyse */ } });
  }

  /* Recopie dans la ligne du prospect ce que la fonction a écrit en base. Une colonne modifiée par l'utilisateur
     pendant l'analyse (valeur différente de celle du départ du lot, et non vide) n'est jamais écrasée. */
  function fusionnerAnalyse(id, recu, depart) {
    var p = trouverParId(brut.prospects, id);
    if (!p || !recu || typeof recu !== 'object') return;
    COLONNES_ENRICHIES.forEach(function (colonne) {
      if (!(colonne in recu)) return;
      if (depart && colonne !== 'updated_at' && p[colonne] !== depart[colonne] && p[colonne] != null) return;
      p[colonne] = recu[colonne];
    });
  }

  /* Répond aux demandes venues pendant l'analyse (un clic sur « Analyser » d'une fiche) dès que LEURS prospects
     sont traités, avec un bilan qui ne porte que sur eux. `fin` : l'analyse s'arrête, tout le monde est servi. */
  function servirAttentes(a, fin) {
    var global = a.bilan || bilanAnalyse();
    a.attentes = a.attentes.filter(function (attente) {
      var restants = attente.ids.filter(function (id) { return !a.issues[id]; });
      if (restants.length && !fin) return true;
      var faits = attente.ids.filter(function (id) { return a.issues[id] === 'ok'; }).length;
      attente.resoudre(bilanAnalyse({
        analyses: faits, echecs: attente.ids.length - restants.length - faits, restants: restants.length, google: global.google,
        indisponible: restants.length > 0 && global.indisponible, arrete: restants.length > 0 && global.arrete,
        message: restants.length ? global.message : '',
        quota: attente.ids.some(function (id) { var x = trouverParId(brut.prospects, id), g = x && objet((objet(x.signaux) || {}).google); return !!g && g.etat === 'quota'; }),
        enEchec: global.enEchec.filter(function (id) { return attente.ids.indexOf(id) >= 0; })
      }));
      return false;
    });
  }

  /* La file ne garde pas les prospects qui n'attendaient que leur fiche Google quand la fonction vient de dire
     qu'elle ne peut pas la chercher (pas de clé, plafond du jour atteint) : les appeler ne servirait à rien. */
  function retirerAttentesGoogle(a, bilan) {
    var avant = a.file.length;
    a.file = a.file.filter(function (id) { return !(a.motifs[id] === 'google' && !a.forces[id]); });
    var retires = avant - a.file.length;
    a.total -= retires;
    bilan.googleReportes += retires;
  }

  async function deroulerAnalyse(a) {
    var bilan = a.bilan = bilanAnalyse();
    function arretDemande() { return a.annule || !!(a.signal && a.signal.aborted); }
    // Prospects repris seuls après l'échec de leur lot, et qui ont échoué seuls : coupables si un autre réussit ensuite.
    var suspects = [], reussitesSeules = 0;
    function innocenter() {
      // La fonction ne répond plus du tout : personne n'est coupable, tout retourne dans la file.
      suspects.forEach(function (id) {
        bilan.echecs--; a.fait--; delete a.issues[id];
        bilan.enEchec = bilan.enEchec.filter(function (x) { return x !== id; });
        echecsAnalyse[id] = Math.max(0, (echecsAnalyse[id] || 1) - 1);
        if (!echecsAnalyse[id]) delete echecsAnalyse[id];
      });
      a.file = suspects.concat(a.file);
      suspects = [];
    }
    while (a.file.length) {
      if (arretDemande()) { bilan.arrete = true; break; }
      // Un lot ne mêle pas les prospects à réanalyser de force et les autres ; un prospect « seul » part seul.
      var forcer = !!a.forces[a.file[0]], seul = !!a.seuls[a.file[0]], lot = [];
      while (a.file.length && lot.length < (seul ? 1 : LOT_ANALYSE) && !!a.forces[a.file[0]] === forcer && !!a.seuls[a.file[0]] === seul) lot.push(a.file.shift());
      a.lot = lot;
      publierAnalyse();
      var depart = {};
      lot.forEach(function (id) {
        var p = trouverParId(brut.prospects, id), copie = {};
        if (p) COLONNES_ENRICHIES.forEach(function (colonne) { copie[colonne] = p[colonne]; });
        depart[id] = p ? copie : null;
      });
      var reponse = null, echec = null;
      try {
        reponse = await crmFonction('crm-enrichir', { ids: lot, forcer: forcer });
        if (!reponse || !Array.isArray(reponse.resultats)) echec = { statut: 502 };
      } catch (e) { echec = e || {}; }
      if (echec) {
        a.lot = [];
        // La fonction a répondu trop tard ou a été interrompue (délai, erreur 5xx) : c'est peut-être UN prospect
        // (une page énorme ou piégée). Chaque prospect du lot est alors repris seul, et celui qui échoue encore
        // est compté « non abouti » et nommé, sans bloquer les autres ni les analyses suivantes.
        var passager = !!echec.delai || (echec.statut >= 500 && echec.statut <= 599);
        if (passager && lot.length > 1) {
          lot.forEach(function (id) { a.seuls[id] = true; });
          a.file = lot.concat(a.file);
          continue;
        }
        if (passager && lot.length === 1 && a.seuls[lot[0]] && !suspects.length && (a.file.length || reussitesSeules)) {
          var coupable = lot[0];
          suspects.push(coupable);
          bilan.echecs++; a.fait++; a.issues[coupable] = 'echec'; bilan.enEchec.push(coupable);
          echecsAnalyse[coupable] = (echecsAnalyse[coupable] || 0) + 1;
          publierAnalyse();
          prevenirAnalyse(a);
          // Seul et dernier, alors que d'autres du même lot ont réussi : c'est bien lui.
          if (!a.file.length) suspects = [];
          continue;
        }
        // Rien n'est perdu : le lot (et les suspects non confirmés) retournent en tête de file et comptent parmi les restants.
        a.file = lot.concat(a.file);
        innocenter();
        bilan.indisponible = true;
        if (echec.statut === 409 && echec.code === 'migration') {
          CRM.etat.chaleur = false;
        } else if (echec.statut === 401 || echec.statut === 403) {
          bilan.message = 'Session expirée ou droits insuffisants. Reconnectez-vous.';
        } else {
          CRM.etat.analyse = 'indisponible';
          if (echec.statut === 404) noterAbsence(true);
        }
        break;
      }
      // Une réponse : les prospects qui avaient échoué seuls juste avant étaient bien en cause.
      suspects = [];
      if (seul) reussitesSeules++;
      CRM.etat.analyse = 'ok';
      noterAbsence(false);
      if (reponse.google === 'actif' || reponse.google === 'sans_cle') { bilan.google = reponse.google; CRM.etat.google = reponse.google; }
      var traites = {}, plafondAtteint = false;
      reponse.resultats.forEach(function (r) {
        var id = r && lot.filter(function (x) { return String(x).toLowerCase() === String(r.id).toLowerCase(); })[0];
        if (!id || traites[id]) return;
        traites[id] = true;
        if (r.etat === 'ok' && r.prospect) {
          fusionnerAnalyse(id, r.prospect, depart[id]);
          if (r.google === 'quota') plafondAtteint = true;
          // Il n'attendait que sa fiche Google et elle n'a toujours pas pu être cherchée : rien de fait pour lui.
          if (a.motifs[id] === 'google' && !a.forces[id] && (r.google === 'quota' || r.google === 'sans_cle')) bilan.googleReportes++;
          else bilan.analyses++;
          a.fait++; a.issues[id] = 'ok';
          delete echecsAnalyse[id];
        } else if (r.etat === 'reporte' && (a.passages[id] = (a.passages[id] || 0) + 1) < PASSAGES_ANALYSE) a.file.push(id);
        else { bilan.echecs++; a.fait++; a.issues[id] = 'echec'; }
      });
      lot.forEach(function (id) { if (!traites[id]) { bilan.echecs++; a.fait++; a.issues[id] = 'echec'; } });
      if (plafondAtteint) { bilan.quota = true; CRM.etat.googlePlafond = jourUtc(CRM.horloge()); }
      if (plafondAtteint || reponse.google === 'sans_cle') retirerAttentesGoogle(a, bilan);
      a.lot = [];
      publierAnalyse();
      recalculer();
      prevenirAnalyse(a);
      servirAttentes(a, false);
      if (arretDemande()) { bilan.arrete = a.file.length > 0; break; }
      if (a.file.length && pauseAnalyse) await new Promise(function (resoudre) { setTimeout(resoudre, pauseAnalyse); });
    }
    bilan.restants = a.file.length;
    return bilan;
  }

  /* Fait analyser des prospects par la fonction crm-enrichir (site du commerce, fiche Google), par lots de 5.
     opts : { forcer (réanalyser même ce qui est frais), surProgres(fait, total), signal (AbortSignal) }.
     Résout { analyses, echecs, restants, indisponible, google ('actif' | 'sans_cle' | null), arrete, message,
     googleReportes, quota, enEchec (ids des prospects qui ont fait échouer la fonction) }.
     NE REJETTE JAMAIS et n'écrit rien dans la console : une fonction non déployée, un réseau coupé ou une
     migration absente donnent `indisponible`. Une seule analyse à la fois : un second appel ajoute ses prospects
     à l'analyse en cours — EN TÊTE s'il vient d'un clic, même s'ils attendaient déjà plus loin dans la file — et
     sa promesse se résout dès que SES prospects sont traités, avec un bilan qui ne porte que sur eux. */
  CRM.analyserProspects = function (ids, opts) {
    opts = opts || {};
    var liste = idsAnalysables(ids);
    if (!CRM.etat.chaleur || !CRM.etat.prospection) return Promise.resolve(bilanAnalyse({ indisponible: true, restants: liste.length }));
    // Une analyse que l'on vient d'arrêter finit son lot : la nouvelle demande part juste après.
    if (analyse && analyse.annule) return analyse.promesse.then(function () { return CRM.analyserProspects(ids, opts); });
    var maintenant = CRM.horloge();
    function motifs(a) { liste.forEach(function (id) { if (!(id in a.motifs)) a.motifs[id] = resteAAnalyser(trouverParId(brut.prospects, id), maintenant); }); }
    if (analyse) {
      var a0 = analyse;
      if (!liste.length) return Promise.resolve(bilanAnalyse());
      var enVol = function (id) { return a0.lot.indexOf(id) >= 0; };
      var nouveaux = liste.filter(function (id) { return a0.file.indexOf(id) < 0 && !enVol(id); });
      // Déjà traité plus tôt dans cette analyse et redemandé : il repasse.
      nouveaux.forEach(function (id) { if (a0.issues[id]) { delete a0.issues[id]; a0.fait = Math.max(0, a0.fait - 1); a0.total--; } });
      if (opts.auto) a0.file = a0.file.concat(nouveaux);
      else {
        // Un clic passe devant tout le monde : ses prospects quittent leur place dans la file pour en prendre la tête.
        var devant = liste.filter(function (id) { return !enVol(id); });
        a0.file = devant.concat(a0.file.filter(function (id) { return devant.indexOf(id) < 0; }));
        a0.auto = false;
      }
      a0.total += nouveaux.length;
      if (opts.forcer) liste.forEach(function (id) { a0.forces[id] = true; });
      motifs(a0);
      if (typeof opts.surProgres === 'function') a0.ecouteurs.push(opts.surProgres);
      publierAnalyse();
      return new Promise(function (resoudre) { a0.attentes.push({ ids: liste.slice(), resoudre: resoudre }); });
    }
    if (!liste.length) return Promise.resolve(bilanAnalyse());
    var a = analyse = { file: liste.slice(), total: liste.length, fait: 0, lot: [], forces: {}, seuls: {}, motifs: {}, issues: {}, attentes: [], passages: {},
      annule: false, auto: !!opts.auto, signal: opts.signal || null, ecouteurs: typeof opts.surProgres === 'function' ? [opts.surProgres] : [] };
    if (opts.forcer) liste.forEach(function (id) { a.forces[id] = true; });
    motifs(a);
    // Ceux qui ont déjà fait échouer la fonction pendant cette session partent seuls : ils n'entraînent plus leur lot.
    liste.forEach(function (id) { if (echecsAnalyse[id]) a.seuls[id] = true; });
    publierAnalyse();
    a.promesse = deroulerAnalyse(a).then(null, function () {
      // Aucune erreur n'est attendue ici ; par prudence elle devient un bilan, jamais un rejet.
      a.bilan = bilanAnalyse({ indisponible: true, restants: a.file.length });
      return a.bilan;
    }).then(function (bilan) {
      analyse = null;
      servirAttentes(a, true);
      publierAnalyse();
      recalculer();
      return bilan;
    });
    return a.promesse;
  };

  /* Analyse lancée toute seule après un ajout de prospects : au plus 60 d'un coup (les autres sont comptés dans
     `restants`), et rien du tout si la fonction a déjà répondu « absente » pendant cette session. */
  CRM.analyseAuto = function (ids, opts) {
    var liste = idsAnalysables(ids);
    if (absenceConnue()) return Promise.resolve(bilanAnalyse({ indisponible: true, silencieux: true, restants: liste.length }));
    var surplus = Math.max(0, liste.length - AUTO_MAX);
    return CRM.analyserProspects(liste.slice(0, AUTO_MAX), Object.assign({}, opts, { auto: true, forcer: false })).then(function (bilan) {
      return surplus ? Object.assign({}, bilan, { restants: bilan.restants + surplus }) : bilan;
    });
  };

  // ───────────────────────────── Journal d'appels et réglages ─────────────────────────────

  var INTERLOCUTEURS = ['patron', 'barrage', 'inconnu'];
  var CLE_REGLAGE = /^[a-z0-9_]{1,60}$/, PREFIXE_REGLAGE = 'crm_reglage_', TAILLE_REGLAGE = 150000;

  // Table inconnue de l'API (migration non appliquée) : PGRST205, ou 42P01 dans une requête.
  function estTableAbsente(e) { return !!e && (e.code === 'PGRST205' || e.code === '42P01' || e.statut === 404); }

  function champsAppel(donnees) {
    var champs = {};
    if ('resultat' in donnees) champs.resultat = donnees.resultat;
    if ('interlocuteur' in donnees) champs.interlocuteur = INTERLOCUTEURS.indexOf(donnees.interlocuteur) >= 0 ? donnees.interlocuteur : null;
    if ('etape' in donnees) champs.etape = texte(donnees.etape).slice(0, 40) || null;
    if ('objections' in donnees) {
      champs.objections = (Array.isArray(donnees.objections) ? donnees.objections : []).map(function (o) { return texte(o).slice(0, 40); })
        .filter(Boolean).slice(0, 20);
    }
    if ('version_script' in donnees) champs.version_script = texte(donnees.version_script).slice(0, 40) || null;
    return champs;
  }

  /* Ajoute une ligne au journal d'appels (prospect, résultat, interlocuteur, dernière étape du guide, objections
     entendues, version du script). Le journal sert à mesurer, pas à travailler : cette écriture ne rejette
     jamais et ne bloque rien. Rend la ligne enregistrée, ou null (journal inactif, prospect pas encore en base, échec). */
  CRM.journaliserAppel = function (donnees) {
    donnees = donnees || {};
    var prospect = texte(donnees.prospect_id);
    if (!CRM.etat.appels || !resultatProspectDe(donnees.resultat) || !prospect || /^provisoire-/.test(prospect)) return Promise.resolve(null);
    var ligne = Object.assign({ prospect_id: prospect, interlocuteur: null, etape: null, objections: [], version_script: null },
      champsAppel(donnees), { fait_at: CRM.horloge().toISOString() });
    return inserer(brut.appels, 'crm_appels', ligne).then(null, function (e) {
      if (estTableAbsente(e)) CRM.etat.appels = false;
      return null;
    });
  };

  /* Corrige la ligne d'un appel dont le résultat vient d'être changé (pouce qui a glissé). Ne rejette jamais. */
  CRM.corrigerAppel = function (id, donnees) {
    var champs = champsAppel(donnees || {});
    if (!CRM.etat.appels || !trouverParId(brut.appels, id) || ('resultat' in champs && !resultatProspectDe(champs.resultat))) return Promise.resolve(null);
    return modifier(brut.appels, 'crm_appels', id, champs).then(null, function () { return null; });
  };

  /* Retire la ligne d'un appel dont le résultat vient d'être effacé. Ne rejette jamais. */
  CRM.supprimerAppel = function (id) {
    if (!CRM.etat.appels || !trouverParId(brut.appels, id)) return Promise.resolve(null);
    return supprimer(brut.appels, 'crm_appels', id).then(null, function () { return null; });
  };

  function reglageLocal(cle) {
    if (typeof localStorage === 'undefined') return null;
    try {
      var o = JSON.parse(localStorage.getItem(PREFIXE_REGLAGE + cle) || 'null');
      return o && typeof o === 'object' && 'valeur' in o ? o : null;
    } catch (e) { return null; }
  }
  function ecrireReglageLocal(cle, valeur) {
    if (typeof localStorage === 'undefined') return false;
    // `le` : l'heure de l'écriture, pour qu'une vieille copie ne passe jamais devant une valeur plus récente de la base.
    try { localStorage.setItem(PREFIXE_REGLAGE + cle, JSON.stringify({ valeur: valeur, le: CRM.horloge().toISOString() })); return true; } catch (e) { return false; }
  }
  function oublierReglageLocal(cle) {
    if (typeof localStorage === 'undefined') return;
    try { localStorage.removeItem(PREFIXE_REGLAGE + cle); } catch (e) { /* stockage bloqué : rien à oublier */ }
  }
  function ligneReglage(cle) {
    for (var i = 0; i < brut.reglages.length; i++) if (brut.reglages[i].cle === cle) return brut.reglages[i];
    return null;
  }

  /* La copie de cet appareil encore valable, ou null. Elle cède devant la ligne de la base quand celle-ci est
     plus récente (réglage modifié depuis un autre appareil), ou quand la copie n'est pas datée (ancien format). */
  function reglageLocalValable(cle) {
    var local = reglageLocal(cle), ligne = local && ligneReglage(cle);
    if (!local || !ligne) return local;
    var le = Date.parse(local.le), base = Date.parse(ligne.updated_at);
    if (isNaN(le)) return null;
    return isNaN(base) || le >= base ? local : null;
  }

  /* Valeur d'un réglage (script d'appel, objectif du jour), ou null. La copie gardée sur cet appareil
     l'emporte tant que la base n'a pas pu la recevoir, sauf si la base a reçu depuis une valeur plus récente. */
  CRM.reglage = function (cle) {
    var local = reglageLocalValable(cle);
    if (local) return local.valeur;
    var ligne = ligneReglage(cle);
    return ligne ? ligne.valeur : null;
  };
  /* Vrai quand ce réglage n'est enregistré que sur cet appareil. */
  CRM.reglageSurAppareil = function (cle) { return !!reglageLocalValable(cle); };

  /* `le` : l'heure à laquelle la valeur a été choisie. Elle est écrite dans updated_at, que rien d'autre ne met à jour. */
  async function envoyerReglage(cle, valeur, le) {
    var quand = isNaN(Date.parse(le)) ? CRM.horloge().toISOString() : new Date(Date.parse(le)).toISOString();
    var lignes = await crmFetch('POST', '/rest/v1/crm_reglages?on_conflict=cle', { cle: cle, valeur: valeur, updated_at: quand },
      'resolution=merge-duplicates,return=representation');
    var ligne = ligneReglage(cle), recue = lignes[0] || { cle: cle, valeur: valeur, updated_at: quand };
    if (ligne) remplacer(brut.reglages, ligne, recue); else brut.reglages.push(recue);
    oublierReglageLocal(cle);
  }

  /* Enregistre un réglage dans crm_reglages. Si la table manque ou si l'envoi échoue, la valeur reste sur cet
     appareil (localStorage) et sera renvoyée au prochain chargement réussi. Rend { ou : 'base' | 'appareil' } ;
     ne rejette que si rien n'a pu être gardé nulle part. */
  CRM.ecrireReglage = async function (cle, valeur) {
    if (!CLE_REGLAGE.test(texte(cle))) throw new Error('Réglage inconnu.');
    if (valeur === undefined || JSON.stringify(valeur).length > TAILLE_REGLAGE) throw new Error('Réglage trop volumineux.');
    var garde = ecrireReglageLocal(cle, valeur);
    recalculer();
    if (CRM.etat.reglages) {
      try {
        await envoyerReglage(cle, valeur);
        recalculer();
        return { ou: 'base' };
      } catch (e) {
        if (estTableAbsente(e)) CRM.etat.reglages = false;
        if (!garde) throw e;
      }
    }
    if (!garde) throw new Error('Réglage non enregistré : le stockage de cet appareil est bloqué.');
    return { ou: 'appareil' };
  };

  // Après un chargement réussi : les réglages restés sur cet appareil rejoignent la base, sans rien bloquer.
  // Une copie plus ancienne que la ligne de la base est oubliée : elle n'écrase pas ce qu'un autre appareil a enregistré depuis.
  function envoyerReglagesLocaux() {
    if (!CRM.etat.reglages || typeof localStorage === 'undefined') return;
    var cles = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIXE_REGLAGE) === 0 && CLE_REGLAGE.test(k.slice(PREFIXE_REGLAGE.length))) cles.push(k.slice(PREFIXE_REGLAGE.length));
      }
    } catch (e) { return; }
    cles.forEach(function (cle) {
      var local = reglageLocalValable(cle);
      if (!local) { oublierReglageLocal(cle); return; }
      envoyerReglage(cle, local.valeur, local.le).then(recalculer, function (e) { if (estTableAbsente(e)) CRM.etat.reglages = false; });
    });
  }

  // ───────────────────────────── Recherche de numéros (services tiers) ─────────────────────────────

  function erreurAnnulation() {
    var e = new Error('Recherche annulée.');
    e.name = 'AbortError';
    return e;
  }

  /* Interroge un serveur Overpass avec un délai maximal. Renvoie les éléments, ou lève une erreur
     marquée `repli` quand il faut essayer le serveur suivant. */
  async function interrogerOverpass(serveur, requete, signal) {
    var controleur = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var horsDelai = false;
    var minuterie = setTimeout(function () { horsDelai = true; if (controleur) controleur.abort(); }, DELAI_OVERPASS);
    function relayer() { if (controleur) controleur.abort(); }
    if (signal) signal.addEventListener('abort', relayer);
    function repli(message) { var e = new Error(message); e.repli = true; return e; }
    try {
      var r;
      try {
        r = await fetch(serveur, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(requete),
          signal: controleur ? controleur.signal : undefined
        });
      } catch (e) {
        if (signal && signal.aborted && !horsDelai) throw erreurAnnulation();
        throw repli(horsDelai ? 'Délai dépassé' : 'Serveur injoignable');
      }
      // Une requête mal formée le sera partout. Tout autre refus (accès réservé, 404, 429, 5xx) est propre
      // à ce serveur : on essaie le suivant.
      if (r.status === 400) throw new Error('La recherche a été refusée par OpenStreetMap (400).');
      if (!r.ok) throw repli('Serveur indisponible (' + r.status + ')');
      var d;
      try { d = await r.json(); } catch (e) {
        if (signal && signal.aborted && !horsDelai) throw erreurAnnulation();
        throw repli('Réponse illisible');
      }
      var elements = (d && d.elements) || [];
      // Overpass répond 200 même quand la requête a expiré côté serveur : il le dit dans « remark ».
      if (!elements.length && d && /timed? ?out|runtime error/i.test(texte(d.remark))) throw repli('Requête expirée côté serveur');
      return elements;
    } finally {
      clearTimeout(minuterie);
      if (signal) signal.removeEventListener('abort', relayer);
    }
  }

  /* Cherche des commerces avec téléphone dans une commune ou un département, sur le premier serveur
     qui répond. Renvoie { prospects, total, tronque, serveur }. Rejette avec une erreur `AbortError`
     si la recherche est annulée. */
  CRM.chercherOsm = async function (parametres) {
    parametres = parametres || {};
    var signal = parametres.signal;
    var requete = requeteOverpass(parametres);
    for (var i = 0; i < SERVEURS_OVERPASS.length; i++) {
      if (signal && signal.aborted) throw erreurAnnulation();
      var elements;
      try {
        elements = await interrogerOverpass(SERVEURS_OVERPASS[i], requete, signal);
      } catch (e) {
        if (e && e.repli) continue;
        throw e;
      }
      var options = Object.assign({}, parametres.options, { metiers: parametres.metiers, code: parametres.code, maintenant: CRM.horloge() });
      if (parametres.niveau === 'departement' && !options.departement) options.departement = texte(parametres.code).toUpperCase();
      return {
        prospects: prospectsDepuisOsm(elements, options, CRM.dejaConnus()),
        total: elements.length, tronque: elements.length >= LIMITE_OVERPASS, serveur: SERVEURS_OVERPASS[i]
      };
    }
    throw new Error('OpenStreetMap ne répond pas pour l\'instant, réessayez dans une minute.');
  };

  /* Autocomplétion des communes (geo.api.gouv.fr). Renvoie [{ nom, code, codesPostaux, codeDepartement }]. */
  CRM.chercherCommunes = async function (recherche, signal) {
    var q = texte(recherche);
    if (q.length < 2) return [];
    var r = await fetch('https://geo.api.gouv.fr/communes?nom=' + encodeURIComponent(q) +
      '&fields=nom,code,codesPostaux,codeDepartement&boost=population&limit=8', { signal: signal });
    if (!r.ok) throw new Error('La recherche de communes ne répond pas.');
    var liste = await r.json();
    return (Array.isArray(liste) ? liste : []).map(function (c) {
      return { nom: c.nom, code: c.code, codesPostaux: c.codesPostaux || [], codeDepartement: c.codeDepartement || '' };
    });
  };

  // ───────────────────────────── Fonctions pures exportées ─────────────────────────────

  CRM.pur = {
    normaliserTel: normaliserTel, normaliserEmail: normaliserEmail, telFrancais: telFrancais, estMobile: estMobile,
    formaterTel: formaterTel, telInternational: telInternational, sansAccents: sansAccents,
    jours: jours, dateLocaleISO: dateLocaleISO, ajouterJours: ajouterJours, versDate: versDate,
    unifier: unifier, etape: etape, score: score, prochaineAction: prochaineAction, fil: fil,
    modeles: modeles, liens: liens, lienBoutique: lienBoutique,
    prospectsDepuisOsm: prospectsDepuisOsm, requeteOverpass: requeteOverpass, analyserImport: analyserImport, recap: recap,
    normaliserLien: normaliserLien, recherchesPresence: recherchesPresence, presence: presence, estLienMaps: estLienMaps,
    cleEnseigne: cleEnseigne, signauxOsm: signauxOsm, chaleurProspect: chaleurProspect, angleProspect: angleProspect,
    trierParChaleur: trierParChaleur,
    etudeValide: etudeValide, etudeProspect: etudeProspect, urlHttps: urlHttps, prenomDirigeant: prenomDirigeant,
    trierParNote: trierParNote, aEtudier: aEtudier
  };

  // Réservé aux tests : remet le cœur à neuf, ou injecte des données sans passer par le réseau.
  CRM._test = {
    reinitialiser: function () {
      brut = brutVide(); parCle = new Map(); abonnes = []; chargement = null; rafraichissement = null; jetonMemoire = null;
      CRM.fiches = []; CRM.prospects = brut.prospects; CRM.appels = brut.appels;
      CRM.config = { url: '', cleAnon: '', emailAdmin: '', origine: ORIGINE_DEFAUT, signature: '' };
      ecrituresEnVol = 0; generation = 0; rechargementDu = false; sourcesSansDonnees = [];
      cacheChaleur = new Map(); homonymesFile = null; analyse = null; fonctionAbsente = false; pauseAnalyse = 300; echecsAnalyse = {};
      CRM.analyseEnCours = null; lectureEtudes = null; CRM.PERIODE_ETUDES = 60000;
      CRM.etat = etatInitial();
      CRM.horloge = function () { return new Date(); };
    },
    brut: function () { return brut; },
    crmFetch: crmFetch, crmFonction: crmFonction,
    // Pause entre deux lots d'analyse (ms) : raccourcie par les tests.
    pauseAnalyse: function (ms) { pauseAnalyse = Math.max(0, Number(ms) || 0); }
  };

  if (racine) racine.CRM = CRM;
  if (typeof module !== 'undefined' && module.exports) module.exports = CRM;
})(typeof window !== 'undefined' ? window : null);
