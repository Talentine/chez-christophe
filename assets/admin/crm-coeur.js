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

  function estExclu(c, emailAdmin) {
    if (c.is_fixture || c.est_demo_ambassadeur || c.supprime_at || c.code_promo_utilise === 'TEST_ADMIN') return true;
    if (!emailAdmin) return false;
    return normaliserEmail(c.email) === emailAdmin || normaliserEmail(c.demo_prospect_email) === emailAdmin;
  }

  // Une vraie fiche ne doit pas être masquée par un compte de test qui partagerait la même coordonnée.
  function indexer(carte, cle, cible) {
    if (!cle) return;
    var existant = carte.get(cle);
    if (!existant || (existant === EXCLU && cible !== EXCLU)) carte.set(cle, cible);
  }

  function trouver(cartes, emails, tels) {
    for (var i = 0; i < cartes.length; i++) {
      var k, cible;
      for (k = 0; k < emails.length; k++) { cible = emails[k] && cartes[i].email.get(emails[k]); if (cible) return cible; }
      for (k = 0; k < tels.length; k++) { cible = tels[k] && cartes[i].tel.get(tels[k]); if (cible) return cible; }
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
      var cible = EXCLU;
      if (!estExclu(c, emailAdmin)) { cible = creer(); cible.commercant = c; }
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
      var cible = (a.demo_slug && cartes.slug.get(texte(a.demo_slug))) ||
        trouver([cartes.c, cartes.a], [email], [tel]);
      if (cible === EXCLU || (!cible && emailAdmin && email === emailAdmin)) return;
      if (!cible) cible = creer();
      cible.audits.push(a);
      indexer(cartes.a.email, email, cible);
      indexer(cartes.a.tel, tel, cible);
    });

    // 3. Inscriptions commencées.
    dedoublonnerLeads(donnees.leads).forEach(function (l) {
      if (emailAdmin && l.email === emailAdmin) return;
      var tel = normaliserTel(l.telephone);
      var cible = trouver([cartes.c, cartes.a, cartes.l], [l.email], [tel]);
      if (cible === EXCLU) return;
      if (!cible) cible = creer();
      cible.leads.push(l);
      indexer(cartes.l.email, l.email, cible);
      indexer(cartes.l.tel, tel, cible);
    });

    // 4. Prospects appelés à froid : ils rejoignent une fiche existante par téléphone ou e-mail ;
    //    seuls, ils n'entrent dans le pipeline que si l'appel a donné une suite.
    (donnees.prospects || []).forEach(function (p) {
      if (!p || p.id == null) return;
      var email = normaliserEmail(p.email), tel = normaliserTel(p.telephone);
      var cible = trouver([cartes.c, cartes.a, cartes.l, cartes.p], [email], [tel]);
      if (cible === EXCLU) return;
      if (!cible) {
        if (!resultatProspectDe(p.resultat) || !resultatProspectDe(p.resultat).fiche) return;
        cible = creer();
      }
      cible.prospects.push(p);
      indexer(cartes.p.email, email, cible);
      indexer(cartes.p.tel, tel, cible);
    });

    // 5. Données rattachées par clé.
    var etats = new Map();
    (donnees.fiches || []).forEach(function (e) { if (e && e.cle) etats.set(e.cle, e); });
    var interactions = grouperParCle(donnees.interactions);
    var taches = grouperParCle(donnees.taches);
    var evenements = indexerEvenements(donnees.evenements, maintenant);
    var commandes = new Map();
    (donnees.commandes || []).forEach(function (c) {
      if (!c || c.commercant_id == null) return;
      var liste = commandes.get(c.commercant_id);
      if (!liste) commandes.set(c.commercant_id, liste = []);
      liste.push(c);
    });

    return fiches.map(function (brute) {
      return completerFiche(brute, {
        etats: etats, interactions: interactions, taches: taches, evenements: evenements, commandes: commandes
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
      interactions: listeInteractions, taches: listeTaches,
      dernierContact: dernierContact, derniereInteraction: derniereInteraction
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

  /* Démo de plus de 30 jours, sans visite ni interaction depuis 14 jours. */
  function estDormante(fiche, maintenant) {
    if (!estDemo(fiche.etape || etape(fiche))) return false;
    var age = ageFiche(fiche, maintenant);
    if (age == null || age <= 30) return false;
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
    }

    if (age != null) {
      var recent = c ? 'Démo toute récente' : 'Contact tout récent';
      if (age <= 7) plus(15, recent);
      else if (age <= 14) plus(8, recent);
      else plus(-Math.min(25, 5 * Math.floor((age - 14) / 7)), (c ? 'Démo créée' : 'Premier contact') + ' il y a ' + age + ' jours');
      if (c && age > 10 && !(s.derniereVisite && jours(s.derniereVisite, maintenant) < 7)) {
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
    if (!c || c.offre === 'vitrine') return null;
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

    if (estDemo(nomEtape) && !enSilence(fiche, 3, maintenant)) {
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
      if (fiche.lead && !c && age != null && age <= 7 && !enSilence(fiche, 3, maintenant)) {
        return { id: 'inscription', urgence: 'aujourdhui', titre: 'Inscription commencée sans finir',
          raison: 'A commencé son inscription ' + ilYA(age), canal: fiche.telNormalise ? 'appel' : 'email' };
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
        site_web: site || null, source: 'osm', source_ref: ref,
        dejaConnu: !!raison, raisonDejaConnu: raison,
        libelleDejaConnu: raison === 'file' ? 'Déjà dans la file' : raison === 'crm' ? 'Déjà client ou en démo' : null
      });
    });
    return lignes.sort(function (a, b) { return sansAccents(a.nom) < sansAccents(b.nom) ? -1 : 1; });
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

  function decouperLigne(ligne) {
    var separateur = ligne.indexOf('|') >= 0 ? '|' : ligne.indexOf(';') >= 0 ? ';' : ligne.indexOf('\t') >= 0 ? '\t' : null;
    var cellules = separateur ? ligne.split(separateur) : [ligne];
    return cellules.map(function (c) { return c.trim().replace(/^"(.*)"$/, '$1').replace(/""/g, '"').trim(); });
  }

  /* Lit des lignes collées « nom | métier | adresse | commune | département | téléphone | remarque »
     (ou la même chose séparée par des points-virgules ; la colonne « source » M/O de l'ancien outil est tolérée).
     Renvoie { lignes, ignorees:[{ numero, texte, raison }] } ; raison ∈ sans_nom, numero_invalide, doublon. */
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
      var telephone = null;
      if (texte(tel)) {
        telephone = telFrancais(tel);
        if (!telephone) return ignorer('numero_invalide');
        if (vus.has(telephone) || connus.has(telephone)) return ignorer('doublon');
        vus.add(telephone);
      }
      var cp = /\b(\d{5})\b/.exec(texte(lieu));
      var commune = texte(lieu).replace(/\b\d{5}\b/, '').replace(/^code postal\s*/i, '').trim();
      var departement = texte(dep).toUpperCase().replace(/[^0-9AB]/g, '').slice(0, 3) || (cp ? departementDe(cp[1]) : null);
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
    return { commercants: [], leads: [], audits: [], prospects: [], commandes: [], evenements: [], fiches: [], interactions: [], taches: [] };
  }

  var brut = brutVide();
  var parCle = new Map();
  var abonnes = [];
  var chargement = null;
  var rafraichissement = null;
  var jetonMemoire = null;
  var compteurProvisoire = 0;

  var CRM = {
    config: { url: '', cleAnon: '', emailAdmin: '', origine: ORIGINE_DEFAUT, signature: '' },
    etat: { charge: false, ecriture: false, prospection: false, sourcesKo: [], erreur: null, chargeLe: null },
    OFFRES: OFFRES, ETAPES: ETAPES, MOTIFS_PERTE: MOTIFS_PERTE, RESULTATS_APPEL: RESULTATS_APPEL,
    RESULTATS_PROSPECT: RESULTATS_PROSPECT, DEPARTEMENTS: DEPARTEMENTS, METIERS_OSM: METIERS_OSM,
    SERVEURS_OVERPASS: SERVEURS_OVERPASS,
    fiches: [], prospects: brut.prospects,
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
    CRM.prospects = brut.prospects;
    CRM.fiches = unifier(brut, CRM.config, CRM.horloge());
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
      return fetch(CRM.config.url + chemin, {
        method: methode, headers: entetes,
        body: corps !== undefined && corps !== null ? JSON.stringify(corps) : undefined
      });
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

  function requetesLecture(maintenant) {
    var j60 = new Date(maintenant.getTime() - 60 * JOUR).toISOString();
    var j30 = new Date(maintenant.getTime() - 30 * JOUR).toISOString();
    return {
      commercants: '/rest/v1/commercants?select=id,created_at,nom_boutique,slug,nom_gerant,email,telephone,adresse,ville,code_postal,' +
        'business_type,offre,abonnement_actif,abonnement_debut,abonnement_fin,stripe_customer_id,stripe_connect_actif,auth_user_id,' +
        'actif,en_pause,code_promo_utilise,frais_acquisition_paye,mois_offerts,supprime_at,is_fixture,est_demo_ambassadeur,' +
        'ambassadeur_prenom,ambassadeur_code_referral,demo_prospect_email,demo_prospect_telephone,acquisition,relances_demo,' +
        'logo_url,instagram,facebook',
      leads: '/rest/v1/leads_inscription?select=email,nom_boutique,business_type,offre,ville,telephone,device,created_at&order=created_at.desc&limit=500',
      audits: '/rest/v1/audits_prospects?select=fiche_id,mode,nom_commerce,type_commerce,ville,email,telephone,scores,manque_eur,' +
        'temperature,rdv2_date,demo_slug,data,created_at,updated_at',
      commandes: '/rest/v1/commandes?select=commercant_id,created_at,total_ttc,statut&created_at=gte.' + encodeURIComponent(j60) + '&limit=5000',
      evenements: '/rest/v1/analytics_events?select=event,slug,created_at,meta&created_at=gte.' + encodeURIComponent(j30) +
        '&event=in.(page_view,page_exit,paiement_commence,demo_privee_bloquee)&slug=not.is.null&order=created_at.desc&limit=5000',
      fiches: '/rest/v1/crm_fiches?select=*',
      interactions: '/rest/v1/crm_interactions?select=*&order=fait_at.desc&limit=5000',
      taches: '/rest/v1/crm_taches?select=*',
      prospects: '/rest/v1/crm_prospects?select=*&order=created_at.asc&limit=5000'
    };
  }

  /* Charge toutes les sources en parallèle. Ne rejette jamais : une source en échec est notée dans
     CRM.etat (sourcesKo, ecriture, prospection, erreur) et le reste continue. */
  CRM.charger = function (opts) {
    opts = opts || {};
    if (chargement) return chargement;
    if (CRM.etat.charge && !opts.force) return Promise.resolve(CRM.fiches);
    CRM.init();
    var requetes = requetesLecture(CRM.horloge());
    var noms = Object.keys(requetes);
    chargement = Promise.all(noms.map(function (nom) {
      return crmFetch('GET', requetes[nom]).then(function (lignes) {
        if (!Array.isArray(lignes)) throw new Error('Réponse inattendue');
        return { nom: nom, lignes: lignes };
      }, function (erreur) { return { nom: nom, erreur: erreur }; });
    })).then(function (resultats) {
      var nouveau = brutVide(), ko = [], ecriture = true, prospection = true, erreur = null;
      resultats.forEach(function (r) {
        if (!r.erreur) { nouveau[r.nom] = r.lignes; return; }
        ko.push(r.nom);
        if (r.nom === 'prospects') prospection = false;
        else if (r.nom === 'fiches' || r.nom === 'interactions' || r.nom === 'taches') ecriture = false;
        else if (r.nom === 'commercants') erreur = r.erreur.message || 'Chargement impossible';
      });
      brut = nouveau;
      CRM.etat.sourcesKo = ko;
      CRM.etat.ecriture = ecriture;
      CRM.etat.prospection = prospection;
      CRM.etat.erreur = erreur;
      CRM.etat.charge = true;
      CRM.etat.chargeLe = CRM.horloge();
      chargement = null;
      recalculer();
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

  // ───────────────────────────── Écritures du CRM ─────────────────────────────

  function refuser(message) { return Promise.reject(new Error(message)); }

  function verifierEcriture() {
    if (!CRM.etat.ecriture) throw new Error('Le CRM est en lecture seule : la migration CRM n\'est pas encore appliquée.');
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

  /* Insertion optimiste : la ligne provisoire est visible tout de suite, remplacée par celle de la base
     à la réponse, retirée si l'écriture échoue. */
  async function inserer(liste, table, ligne) {
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

  async function modifier(liste, table, id, champs) {
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

  async function supprimer(liste, table, id) {
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
    var principale = clePrincipale(cle);
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
    return p;
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
    var tri = filtrerNouveaux(lignes);
    var crees = [];
    async function envoyer(lot) {
      if (!lot.length) return [];
      return (await crmFetch('POST', '/rest/v1/crm_prospects', lot, 'resolution=ignore-duplicates,return=representation',
        { videPermis: true })) || [];
    }
    for (var debut = 0; debut < tri.gardes.length; debut += 200) {
      var lot = tri.gardes.slice(debut, debut + 200), recus;
      try {
        recus = await envoyer(lot);
      } catch (e) {
        // Les lots déjà enregistrés restent acquis : on les montre avant de signaler l'échec.
        if (!estConflit(e)) { if (crees.length) recalculer(); throw e; }
        brut.prospects = await crmFetch('GET', requetesLecture(CRM.horloge()).prospects);
        recus = await envoyer(filtrerNouveaux(lot).gardes);
      }
      recus.forEach(function (p) { brut.prospects.push(p); crees.push(p); });
    }
    recalculer();
    return {
      ajoutes: crees.length, doublons: Math.max(0, lignes.length - tri.ignores - crees.length),
      ignores: tri.ignores, prospects: crees
    };
  };

  /* Modification optimiste d'un prospect. Le retour arrière ne touche que les champs de CET appel, et
     seulement s'ils n'ont pas été modifiés depuis : une note tapée pendant l'envoi n'est jamais écrasée. */
  async function patchProspect(id, champs) {
    var p = trouverParId(brut.prospects, id);
    if (!p) throw new Error('Prospect introuvable.');
    var avant = {};
    Object.keys(champs).forEach(function (k) { avant[k] = p[k]; });
    Object.assign(p, champs);
    recalculer();
    try {
      var lignes = await crmFetch('PATCH', '/rest/v1/crm_prospects?id=eq.' + encodeURIComponent(id), champs, 'return=representation');
      if (lignes[0] && lignes[0].updated_at) p.updated_at = lignes[0].updated_at;
      return p;
    } catch (e) {
      Object.keys(champs).forEach(function (k) { if (p[k] === champs[k]) p[k] = avant[k]; });
      recalculer();
      throw e;
    }
  }

  CRM.majProspect = async function (id, champs) {
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
    if (!Object.keys(propres).length) return trouverParId(brut.prospects, id);
    return patchProspect(id, propres);
  };

  /* Pose le résultat d'un appel (appele_at = maintenant, nb_appels + 1). null efface le résultat
     sans effacer la trace de l'appel. */
  CRM.resultatProspect = async function (id, resultat) {
    verifierProspection();
    var p = trouverParId(brut.prospects, id);
    if (!p) throw new Error('Prospect introuvable.');
    if (resultat == null || resultat === '') return patchProspect(id, { resultat: null, rappel_le: null });
    if (!resultatProspectDe(resultat)) throw new Error('Résultat inconnu.');
    var champs = { resultat: resultat, appele_at: CRM.horloge().toISOString(), nb_appels: (Number(p.nb_appels) || 0) + 1 };
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
      if (r.status === 429 || r.status >= 500) throw repli('Serveur occupé (' + r.status + ')');
      if (!r.ok) throw new Error('La recherche a été refusée par OpenStreetMap (' + r.status + ').');
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
      var options = Object.assign({}, parametres.options, { metiers: parametres.metiers, code: parametres.code });
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
    prospectsDepuisOsm: prospectsDepuisOsm, requeteOverpass: requeteOverpass, analyserImport: analyserImport, recap: recap
  };

  // Réservé aux tests : remet le cœur à neuf, ou injecte des données sans passer par le réseau.
  CRM._test = {
    reinitialiser: function () {
      brut = brutVide(); parCle = new Map(); abonnes = []; chargement = null; rafraichissement = null; jetonMemoire = null;
      CRM.fiches = []; CRM.prospects = brut.prospects;
      CRM.config = { url: '', cleAnon: '', emailAdmin: '', origine: ORIGINE_DEFAUT, signature: '' };
      CRM.etat = { charge: false, ecriture: false, prospection: false, sourcesKo: [], erreur: null, chargeLe: null };
      CRM.horloge = function () { return new Date(); };
    },
    brut: function () { return brut; },
    crmFetch: crmFetch
  };

  if (racine) racine.CRM = CRM;
  if (typeof module !== 'undefined' && module.exports) module.exports = CRM;
})(typeof window !== 'undefined' ? window : null);
