/* CRM admin Marchéo — page CRM : en-tête, indicateurs, vues Aujourd'hui / Pipeline / Fiches / Prospection,
 * mode Enchaîner, recherche, clavier et routage par hash.
 *
 * Expose `window.crmOuvrirPage`, `crmActualiser`, `crmPrecharger` et `crmOuvrirFiche`, appelés par admin.html.
 * La vue Prospection est dessinée par crm-prospection.js (`window.crmProspectionAfficher`) quand il est chargé.
 *
 * Routage : `#crm`, `#crm/<vue>`, `#crm/<vue>/<clé de fiche>`. Ouvrir une fiche ajoute une entrée à
 * l'historique : le bouton retour du téléphone la referme au lieu de quitter l'admin.
 */
(function () {
  'use strict';

  var CRM = window.CRM, UI = window.crmUI, panneau = window.crmFiche;
  if (!CRM || !UI || !panneau || typeof document === 'undefined') return;
  var esc = UI.esc, ic = UI.ic, pur = CRM.pur;

  var VUES = [
    { id: 'aujourdhui', libelle: 'Aujourd\'hui' },
    { id: 'pipeline', libelle: 'Pipeline' },
    { id: 'fiches', libelle: 'Fiches' },
    { id: 'prospection', libelle: 'Prospection' }
  ];
  var FILTRES = [
    { id: 'toutes', libelle: 'Toutes' },
    { id: 'prospect', libelle: 'Avant démo' },
    { id: 'demos', libelle: 'Démos' },
    { id: 'paiement', libelle: 'Paiement commencé' },
    { id: 'client', libelle: 'Boutiques en ligne' },
    { id: 'perdu', libelle: 'Perdus' }
  ];
  // Filtres posés par les indicateurs : pas de pilule permanente, seulement une pilule retirable quand ils sont actifs.
  var FILTRES_RAPIDES = { a_traiter: 'À traiter', chaudes: 'Démos chaudes' };
  var TRIS = [['score', 'Score'], ['recentes', 'Plus récentes'], ['nom', 'Nom'], ['contact', 'Dernier contact']];
  var GROUPES = [['retard', 'En retard'], ['aujourdhui', 'Aujourd\'hui'], ['semaine', 'Cette semaine']];
  var PAS_FICHES = 80, PAS_COLONNE = 25;
  var LIBELLES_TRONQUE = { commercants: 'boutiques', leads: 'inscriptions', audits: 'audits terrain', commandes: 'commandes',
    evenements: 'visites des boutiques', prospects: 'prospects', fiches: 'suivi des fiches', interactions: 'notes et appels', taches: 'tâches' };
  var LIBELLES_SOURCE = { leads: 'inscriptions', audits: 'audits terrain', commandes: 'commandes', evenements: 'visites des boutiques', prospects: 'prospection' };

  var etat = {
    vue: 'aujourdhui', sousVue: null,
    filtre: 'toutes', tri: 'score', recherche: '',
    limite: PAS_FICHES, colonnes: {},
    chaine: null, construit: false, prospectionMontee: false, renduPrevu: false
  };

  function page() { return document.getElementById('page-crm'); }
  function pageActive() { var p = page(); return !!p && p.classList.contains('actif'); }
  function zoneVue() { return document.getElementById('crmVue'); }

  // ───────────────────────────── Routage ─────────────────────────────

  function lireHash() {
    var h = location.hash || '';
    if (!/^#crm(\/|$)/.test(h)) return null;
    var morceaux = h.slice(5).split('/');
    var vue = null;
    VUES.forEach(function (v) { if (v.id === morceaux[0]) vue = v.id; });
    var reste = morceaux.slice(1).join('/');
    try { reste = decodeURIComponent(reste); } catch (e) { reste = ''; }
    var cle = /^[calp]:.+/.test(reste) ? reste : null;
    return { vue: vue, cle: cle, sousVue: vue === 'prospection' && reste && !cle ? reste : null };
  }

  function hashVue() {
    return '#crm/' + etat.vue + (etat.vue === 'prospection' && etat.sousVue ? '/' + encodeURIComponent(etat.sousVue) : '');
  }

  /* Met l'état d'écran en accord avec l'adresse. Appelé à l'ouverture de la page, après chaque chargement,
     et quand l'historique bouge (retour arrière, lien #crm/…). Sans effet si tout est déjà en accord. */
  function synchroniser() {
    var r = lireHash();
    if (!r) { etat.chaine = null; panneau.fermer(); return; }
    if (!pageActive()) {
      var tableau = document.getElementById('dashboard');
      if (tableau && tableau.classList.contains('actif') && typeof window.allerPage === 'function') window.allerPage('crm');
      return;
    }
    var vue = r.vue || etat.vue;
    if (vue !== etat.vue || (vue === 'prospection' && r.sousVue !== etat.sousVue)) {
      etat.vue = vue;
      etat.sousVue = r.sousVue;
      etat.prospectionMontee = false;
      rendre();
    }
    if (!r.cle) { etat.chaine = null; panneau.fermer(); return; }
    if (!CRM.etat.charge) return;
    var f = CRM.fiche(r.cle);
    if (!f) {
      history.replaceState(null, '', hashVue());
      panneau.fermer();
      window.crmToast('Cette fiche n\'existe plus dans le CRM.', { type: 'erreur' });
      return;
    }
    if (!panneau.estOuverte() || panneau.cle() !== f.cle) panneau.ouvrir(f.cle, { chaine: optionsChaine(f.cle) });
  }

  function ouvrirFiche(cle, opts) {
    var f = CRM.fiche(cle);
    if (!f) { window.crmToast('Cette fiche n\'existe plus dans le CRM.', { type: 'erreur' }); return; }
    opts = opts || {};
    var hash = '#crm/' + etat.vue + '/' + encodeURIComponent(f.cle);
    // D'une fiche à l'autre (mode Enchaîner), on remplace l'entrée : un seul retour arrière referme le panneau.
    if (panneau.estOuverte()) history.replaceState({ crmFiche: f.cle }, '', hash);
    else history.pushState({ crmFiche: f.cle }, '', hash);
    opts.chaine = optionsChaine(f.cle);
    panneau.ouvrir(f.cle, opts);
  }

  function fermerFiche() {
    etat.chaine = null;
    // Entrée ajoutée par nous : on la dépile et `popstate` referme. Arrivée directe sur le lien d'une fiche : rien à dépiler.
    if (history.state && history.state.crmFiche) history.back();
    else { history.replaceState(null, '', hashVue()); panneau.fermer(); }
  }
  panneau.surDemandeFermeture = fermerFiche;

  function changerVue(id, opts) {
    opts = opts || {};
    if (etat.vue === id && !opts.force) return;
    etat.vue = id;
    etat.sousVue = null;
    etat.prospectionMontee = false;
    history.replaceState(null, '', hashVue());
    rendre();
    if (!opts.sansRemonter) window.scrollTo({ top: 0 });
  }

  // ───────────────────────────── Mode Enchaîner ─────────────────────────────

  function fileAplatie() {
    var file = CRM.file();
    return file.retard.concat(file.aujourdhui, file.semaine);
  }

  function optionsChaine(cle) {
    var c = etat.chaine;
    if (!c || c.cles[c.i] !== cle) return null;
    return { position: c.i + 1, total: c.cles.length, suivante: avancerChaine, passer: avancerChaine };
  }

  function demarrerChaine() {
    var liste = fileAplatie();
    if (!liste.length) return;
    etat.chaine = { cles: liste.map(function (e) { return e.fiche.cle; }), i: 0 };
    ouvrirFiche(etat.chaine.cles[0]);
  }

  /* Simple curseur sur la liste figée au départ : une fiche traitée entre-temps reste à sa place dans le compte. */
  function avancerChaine() {
    var c = etat.chaine;
    if (!c) return;
    do { c.i++; } while (c.i < c.cles.length && !CRM.fiche(c.cles[c.i]));
    if (c.i >= c.cles.length) {
      var total = c.cles.length;
      fermerFiche();
      window.crmToast('File terminée : ' + UI.pluriel(total, 'fiche passée', 'fiches passées') + ' en revue.');
      return;
    }
    ouvrirFiche(c.cles[c.i]);
  }

  // ───────────────────────────── Coquille de la page ─────────────────────────────

  function construire() {
    var p = page();
    if (!p || etat.construit) return;
    etat.construit = true;
    p.classList.add('crm-racine', 'crm');
    p.innerHTML =
      '<header class="crm-entete">' +
        '<div class="crm-entete-titres"><h1 class="page-titre">CRM</h1><p class="page-sub">Du premier contact à la boutique en ligne</p></div>' +
        '<div class="crm-recherche" role="search">' + ic('recherche', 16) +
          '<input type="search" id="crmRecherche" placeholder="Rechercher une fiche" aria-label="Rechercher une fiche (nom, gérant, ville, e-mail, téléphone)" autocomplete="off" spellcheck="false">' +
          '<kbd aria-hidden="true">/</kbd>' +
          '<button type="button" class="crm-icone-btn crm-recherche-effacer" data-action="effacer-recherche" aria-label="Effacer la recherche" hidden>' + ic('croix', 14) + '</button>' +
        '</div>' +
      '</header>' +
      '<div id="crmBandeaux"></div>' +
      '<div class="crm-indicateurs" id="crmIndicateurs"></div>' +
      '<div class="crm-vues" id="crmPilules" role="tablist" aria-label="Vues du CRM"></div>' +
      '<div class="crm-vue" id="crmVue" role="tabpanel" tabindex="-1"></div>';
    p.addEventListener('click', surClic);
    p.addEventListener('change', surChangementChamp);
    document.getElementById('crmRecherche').addEventListener('input', surRecherche);

    // Quitter la page CRM (autre lien du menu) referme la fiche et retire le hash : un rechargement
    // doit alors rouvrir la page que l'on regarde, pas le CRM.
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(function () {
        if (pageActive()) return;
        etat.chaine = null;
        UI.fermerMenu();
        panneau.fermer();
        if (lireHash()) history.replaceState(null, '', location.pathname + location.search);
      }).observe(p, { attributes: true, attributeFilter: ['class'] });
    }
  }

  // ───────────────────────────── Rendu : bandeaux, indicateurs, pilules ─────────────────────────────

  function htmlBandeaux() {
    var e = CRM.etat, html = '';
    if (!e.charge) return '';
    if (e.erreur) {
      html += '<div class="crm-bandeau crm-bandeau-erreur" role="alert">' + ic('alerte', 16) +
        '<p><b>Les boutiques n\'ont pas pu être chargées.</b> ' + esc(e.erreur) + '</p>' +
        '<button type="button" class="crm-btn" data-action="recharger">Réessayer</button></div>';
    }
    if (!e.ecriture && e.ecriturePanne) {
      html += '<div class="crm-bandeau" role="status">' + ic('cadenas', 16) +
        '<p><b>Lecture seule pour l\'instant.</b> Notes, tâches et suivi d\'appels ne répondent pas. Ce qui était déjà chargé reste affiché.</p>' +
        '<button type="button" class="crm-btn" data-action="recharger">Réessayer</button></div>';
    } else if (!e.ecriture) {
      html += '<div class="crm-bandeau" role="status">' + ic('cadenas', 16) +
        '<p><b>Lecture seule.</b> Notes, tâches et suivi d\'appels inactifs : la migration CRM n\'est pas encore appliquée.</p></div>';
    }
    var manquantes = e.sourcesKo.filter(function (s) { return LIBELLES_SOURCE[s]; }).map(function (s) { return LIBELLES_SOURCE[s]; });
    if (manquantes.length) {
      html += '<p class="crm-sources">' + ic('alerte', 13) + 'Données indisponibles pour l\'instant : ' + esc(manquantes.join(', ')) + '. Le reste est à jour.</p>';
    }
    var partielles = (e.sourcesTronquees || []).map(function (s) { return LIBELLES_TRONQUE[s] || s; });
    if (partielles.length) {
      html += '<p class="crm-sources">' + ic('alerte', 13) + 'Trop de lignes pour tout lire : ' + esc(partielles.join(', ')) + ' en partie seulement.</p>';
    }
    return html;
  }

  function htmlIndicateurs() {
    if (!CRM.etat.charge) {
      return [0, 1, 2, 3].map(function () {
        return '<div class="crm-ind crm-ind-attente"><span class="crm-sq crm-sq-court"></span><span class="crm-sq crm-sq-chiffre"></span><span class="crm-sq crm-sq-moyen"></span></div>';
      }).join('');
    }
    var c = CRM.compteurs(), file = CRM.file();
    var demos = c.parEtape.demo.nb + c.parEtape.demo_engagee.nb;
    var cartes = [
      ['a_traiter', 'À traiter', c.aTraiter, file.retard.length ? file.retard.length + ' en retard' : 'Rien en retard', file.retard.length > 0],
      ['chaudes', 'Démos chaudes', c.chaudes, 'sur ' + UI.pluriel(demos, 'démo') + ' en cours'],
      ['paiement', 'Paiements commencés', c.paiements, c.paiements ? UI.euros(c.parEtape.paiement.mensuel) + '/mois à conclure' : 'Aucun en attente'],
      ['client', 'Boutiques en ligne', c.clients, UI.euros(c.mrr) + '/mois']
    ];
    return cartes.map(function (k) {
      return '<button type="button" class="crm-ind" data-action="indicateur" data-id="' + k[0] + '">' +
        '<span class="crm-ind-lbl">' + esc(k[1]) + '</span><span class="crm-ind-val">' + k[2] + '</span>' +
        '<span class="crm-ind-sub' + (k[4] ? ' crm-retard' : '') + '">' + esc(k[3]) + '</span></button>';
    }).join('');
  }

  function htmlPilules() {
    var aTraiter = CRM.etat.charge ? CRM.compteurs().aTraiter : 0;
    return VUES.map(function (v) {
      var actif = etat.vue === v.id;
      return '<button type="button" class="crm-pilule" role="tab" aria-selected="' + actif + '" data-action="vue" data-id="' + v.id + '">' +
        esc(v.libelle) + (v.id === 'aujourdhui' && aTraiter ? '<span class="crm-pilule-nb">' + aTraiter + '</span>' : '') + '</button>';
    }).join('');
  }

  // ───────────────────────────── Rendu : squelettes et états vides ─────────────────────────────

  function htmlSquelette() {
    var ligne = '<div class="crm-ligne crm-ligne-attente"><span class="crm-sq crm-sq-pastille"></span>' +
      '<span class="crm-sq-pile"><span class="crm-sq crm-sq-long"></span><span class="crm-sq crm-sq-moyen"></span></span></div>';
    return '<div class="crm-liste" aria-busy="true" aria-label="Chargement des fiches">' + [ligne, ligne, ligne, ligne, ligne, ligne].join('') + '</div>';
  }

  function htmlVide(icone, titre, texte, bouton) {
    return '<div class="crm-vide"><span class="crm-vide-ic">' + ic(icone, 22) + '</span>' +
      '<p class="crm-vide-titre">' + esc(titre) + '</p>' + (texte ? '<p class="crm-vide-texte">' + esc(texte) + '</p>' : '') + (bouton || '') + '</div>';
  }

  // ───────────────────────────── Vue Aujourd'hui ─────────────────────────────

  function boutonCanal(f, a) {
    var l = CRM.liens(f);
    if (a.canal === 'appel' && l.tel) {
      return '<a class="crm-btn crm-btn-or" href="' + esc(l.tel) + '" data-action="contacter" data-id="appel">' + ic('telephone', 14) + 'Appeler</a>';
    }
    if (a.canal === 'whatsapp' && l.whatsapp) {
      return '<a class="crm-btn crm-btn-or" href="' + esc(l.whatsapp) + '" target="_blank" rel="noopener noreferrer" data-action="contacter" data-id="whatsapp">' + ic('whatsapp', 14) + 'WhatsApp</a>';
    }
    if (a.canal === 'email' && l.mail) {
      return '<a class="crm-btn crm-btn-or" href="' + esc(l.mail) + '" data-action="contacter" data-id="email">' + ic('email', 14) + 'E-mail</a>';
    }
    if (a.canal === 'tache') {
      return '<button type="button" class="crm-btn crm-btn-or" data-action="fait"' + UI.attrEcriture() + '>' + ic('coche', 14) + 'Fait</button>';
    }
    return '<button type="button" class="crm-btn" data-action="ouvrir">Ouvrir</button>';
  }

  function ligneAction(e) {
    var f = e.fiche, a = e.action;
    return '<div class="crm-ligne crm-ligne-action" data-cle="' + esc(f.cle) + '">' +
      '<button type="button" class="crm-ligne-corps crm-nav" data-action="ouvrir">' + UI.scoreHtml(f) +
        '<span class="crm-ligne-txt">' +
          '<span class="crm-ligne-nom"><b>' + esc(f.nom) + '</b><span class="crm-ligne-meta">' + UI.lieuMetierHtml(f) + '</span></span>' +
          '<span class="crm-ligne-raison"><b>' + esc(a.titre) + '</b><span class="crm-sep">·</span>' + esc(a.raison) + '</span>' +
        '</span></button>' +
      '<div class="crm-ligne-actions">' + boutonCanal(f, a) +
        '<button type="button" class="crm-btn crm-btn-discret" data-action="menu-reporter" aria-haspopup="menu" aria-expanded="false"' + UI.attrEcriture() + '>' + ic('horloge', 14) + 'Reporter</button>' +
      '</div></div>';
  }

  function htmlAujourdhui() {
    var file = CRM.file();
    var total = file.retard.length + file.aujourdhui.length + file.semaine.length;
    if (!total) {
      return htmlVide('coche', 'Rien à traiter aujourd\'hui.', 'Les prochaines actions apparaîtront ici dès qu\'une démo bouge ou qu\'une tâche arrive à échéance.',
        '<button type="button" class="crm-btn" data-action="vue" data-id="pipeline">Voir le pipeline' + ic('fleche', 14) + '</button>');
    }
    var urgent = file.retard.length + file.aujourdhui.length;
    var resume = urgent ? UI.pluriel(urgent, 'action') + ' à traiter aujourd\'hui' : 'Rien d\'urgent aujourd\'hui';
    if (file.semaine.length) resume += ', ' + file.semaine.length + ' dans la semaine';
    var html = '<div class="crm-barre"><p class="crm-barre-resume">' + esc(resume) + '</p>' +
      '<button type="button" class="crm-btn crm-btn-plein" data-action="enchainer">' + ic('enchainer', 14) + 'Enchaîner (' + total + ')</button></div>';
    GROUPES.forEach(function (g) {
      var liste = file[g[0]];
      if (!liste.length) return;
      html += '<section class="crm-groupe"><h2 class="crm-groupe-titre crm-g-' + g[0] + '"><i></i>' + esc(g[1]) + '<span>' + liste.length + '</span></h2>' +
        '<div class="crm-liste">' + liste.map(ligneAction).join('') + '</div></section>';
    });
    return html;
  }

  // ───────────────────────────── Vue Pipeline ─────────────────────────────

  function htmlDrapeaux(f) {
    var html = '';
    UI.DRAPEAUX.forEach(function (d) {
      if (!f.drapeaux[d[0]] || d[0] === 'resilie') return;
      html += '<span class="crm-carte-drapeau" title="' + esc(d[1]) + '">' + ic(d[2], 12) + '<span class="crm-sr">' + esc(d[1]) + '</span></span>';
    });
    return html;
  }

  function carteFiche(f) {
    var age = UI.ageJours(f), offre = UI.offreNom(f), a = f.action;
    var due = a && a.urgence !== 'semaine';
    return '<button type="button" class="crm-carte crm-nav" data-action="ouvrir" data-cle="' + esc(f.cle) + '">' +
      '<span class="crm-carte-tete"><b>' + esc(f.nom) + '</b>' + UI.scoreHtml(f) + '</span>' +
      '<span class="crm-carte-meta">' + (UI.lieuMetierHtml(f) || 'Métier et ville inconnus') + '</span>' +
      '<span class="crm-carte-pied">' +
        (age != null ? '<span class="crm-carte-age" title="Âge de la fiche">' + (age === 0 ? 'auj.' : age + ' j') + '</span>' : '') +
        (offre ? '<span class="crm-carte-offre">' + esc(offre) + '</span>' : '') + htmlDrapeaux(f) +
        (due ? '<span class="crm-carte-action crm-u-' + esc(a.urgence) + '" title="' + esc((a.urgence === 'retard' ? 'En retard : ' : 'À traiter : ') + a.titre) + '"><i></i>' +
          '<span class="crm-sr">' + (a.urgence === 'retard' ? 'Action en retard' : 'Action à traiter') + '</span></span>' : '') +
      '</span></button>';
  }

  function htmlPipeline() {
    var c = CRM.compteurs();
    var parEtape = {};
    CRM.rechercher('', { tri: 'score' }).forEach(function (f) { (parEtape[f.etape] = parEtape[f.etape] || []).push(f); });
    var colonnes = CRM.ETAPES.filter(function (e) { return e.id !== 'perdu'; }).map(function (e) {
      var liste = parEtape[e.id] || [], k = c.parEtape[e.id];
      var limite = etat.colonnes[e.id] || PAS_COLONNE;
      var valeur = k.mensuel ? UI.euros(k.mensuel) + '/mois <span class="crm-sep">+</span> ' + UI.euros(k.installation) : 'Offre pas encore choisie';
      return '<section class="crm-col" aria-label="' + esc(e.libelle) + '">' +
        '<header class="crm-col-tete"><h2 class="crm-etape crm-e-' + e.id + '"><i></i>' + esc(e.libelle) + '<span class="crm-col-nb">' + liste.length + '</span></h2>' +
        '<p class="crm-col-valeur">' + (liste.length ? valeur : '&nbsp;') + '</p></header>' +
        '<div class="crm-col-corps">' + (liste.length ? liste.slice(0, limite).map(carteFiche).join('') : '<p class="crm-col-vide">Personne à cette étape.</p>') +
        (liste.length > limite ? '<button type="button" class="crm-lien" data-action="colonne-plus" data-id="' + e.id + '">Afficher les ' + (liste.length - limite) + ' suivantes</button>' : '') +
        '</div></section>';
    }).join('');
    return '<p class="crm-pipe-note">Les fiches avancent toutes seules selon ce que fait le commerçant : rien à déplacer à la main.</p>' +
      '<div class="crm-pipe" id="crmPipe">' + colonnes + '</div>' +
      '<div class="crm-pipe-pied"><p>Si toutes les démos en cours signaient : <b>' + esc(UI.euros(c.potentielMensuel)) + '/mois</b> + <b>' + esc(UI.euros(c.potentielInstallation)) + '</b> d\'installation.</p>' +
      '<button type="button" class="crm-lien" data-action="filtre" data-id="perdu">Perdus (' + c.parEtape.perdu.nb + ')' + ic('fleche', 13) + '</button></div>';
  }

  // ───────────────────────────── Vue Fiches ─────────────────────────────

  function ligneFiche(f) {
    var a = f.action, l = CRM.liens(f), offre = UI.offreNom(f);
    var action = a ? '<span class="crm-f-action crm-u-' + esc(a.urgence) + '"><i></i>' + esc(a.titre) + '</span>' : '<span class="crm-f-rien">–</span>';
    return '<div class="crm-ligne crm-ligne-fiche" data-cle="' + esc(f.cle) + '">' +
      '<button type="button" class="crm-ligne-corps crm-nav" data-action="ouvrir">' +
        '<span class="crm-f-nom"><b>' + esc(f.nom) + '</b>' + (f.gerant ? '<small>' + esc(f.gerant) + '</small>' : '') + '</span>' +
        '<span class="crm-f-lieu">' + (UI.lieuMetierHtml(f) || '–') + '</span>' +
        '<span class="crm-f-etape">' + UI.etapeHtml(f) + '</span>' +
        '<span class="crm-f-score">' + UI.scoreHtml(f) + '</span>' +
        '<span class="crm-f-contact">' + esc(f.dernierContact ? UI.dateRelative(f.dernierContact) : 'Jamais') + '</span>' +
        '<span class="crm-f-prochaine">' + action + '</span>' +
        '<span class="crm-f-offre">' + (offre ? esc(offre) : '–') + '</span>' +
      '</button>' +
      '<div class="crm-ligne-actions">' +
        (l.tel ? '<a class="crm-icone-btn crm-icone-or" href="' + esc(l.tel) + '" data-action="contacter" data-id="appel" aria-label="Appeler ' + esc(f.nom) + '">' + ic('telephone', 18) + '</a>' : '') +
        (l.whatsapp ? '<a class="crm-icone-btn" href="' + esc(l.whatsapp) + '" target="_blank" rel="noopener noreferrer" data-action="contacter" data-id="whatsapp" aria-label="WhatsApp à ' + esc(f.nom) + '">' + ic('whatsapp', 18) + '</a>' : '') +
      '</div></div>';
  }

  function htmlFiches() {
    var c = CRM.compteurs();
    var nb = {
      toutes: CRM.fiches.length, prospect: c.parEtape.prospect.nb, demos: c.parEtape.demo.nb + c.parEtape.demo_engagee.nb,
      paiement: c.parEtape.paiement.nb, client: c.parEtape.client.nb, perdu: c.parEtape.perdu.nb
    };
    var liste = CRM.rechercher(etat.recherche, { etape: etat.filtre, tri: etat.tri });
    var filtres = FILTRES.map(function (f) {
      return '<button type="button" class="crm-filtre" data-action="filtre" data-id="' + f.id + '" aria-pressed="' + (etat.filtre === f.id) + '">' +
        esc(f.libelle) + '<span>' + nb[f.id] + '</span></button>';
    }).join('');
    if (FILTRES_RAPIDES[etat.filtre]) {
      filtres += '<button type="button" class="crm-filtre crm-filtre-rapide" data-action="filtre" data-id="toutes" aria-pressed="true" title="Retirer ce filtre">' +
        esc(FILTRES_RAPIDES[etat.filtre]) + '<span>' + liste.length + '</span>' + ic('croix', 12) + '</button>';
    }
    var tri = '<label class="crm-tri"><span>Trier par</span><select id="crmTri" aria-label="Trier les fiches">' + TRIS.map(function (t) {
      return '<option value="' + t[0] + '"' + (etat.tri === t[0] ? ' selected' : '') + '>' + esc(t[1]) + '</option>';
    }).join('') + '</select></label>';
    var html = '<div class="crm-outils"><div class="crm-filtres" role="group" aria-label="Filtrer par étape">' + filtres + '</div>' + tri + '</div>';

    if (!liste.length) {
      var texte = etat.recherche
        ? 'Aucune fiche ne correspond à « ' + etat.recherche + ' »' + (etat.filtre !== 'toutes' ? ' dans ce filtre.' : '.')
        : 'Aucune fiche à cette étape pour l\'instant.';
      var bouton = etat.recherche || etat.filtre !== 'toutes'
        ? '<button type="button" class="crm-btn" data-action="tout-afficher">Afficher toutes les fiches</button>' : '';
      return html + htmlVide('recherche', 'Aucune fiche', texte, bouton);
    }
    html += '<p class="crm-compte" aria-live="polite">' + UI.pluriel(liste.length, 'fiche') + (etat.recherche ? ' pour « ' + esc(etat.recherche) + ' »' : '') + '</p>';
    html += '<div class="crm-liste crm-liste-fiches">' +
      '<div class="crm-liste-tete" aria-hidden="true"><span>Commerce</span><span>Métier · ville</span><span>Étape</span><span>Score</span><span>Contact</span><span>Prochaine action</span><span>Offre</span></div>' +
      liste.slice(0, etat.limite).map(ligneFiche).join('') + '</div>';
    if (liste.length > etat.limite) {
      html += '<button type="button" class="crm-btn crm-plus" data-action="plus">Afficher ' + Math.min(PAS_FICHES, liste.length - etat.limite) + ' fiches de plus</button>';
    }
    return html;
  }

  // ───────────────────────────── Vue Prospection ─────────────────────────────

  /* La vue appartient à crm-prospection.js : on lui remet un conteneur une fois, puis on ne le redessine plus
     (elle suit elle-même les changements du cœur, et l'utilisateur y saisit des notes en continu). */
  function rendreProspection(zone) {
    if (typeof window.crmProspectionAfficher !== 'function') {
      etat.prospectionMontee = false;
      zone.innerHTML = htmlVide('telephone', 'Prospection : bientôt disponible',
        'La file d\'appels à froid et la recherche de numéros arrivent ici. En attendant, les prospects déjà intéressés apparaissent dans « Fiches ».',
        '<button type="button" class="crm-btn" data-action="filtre" data-id="prospect">Voir les fiches avant démo' + ic('fleche', 14) + '</button>');
      return;
    }
    if (etat.prospectionMontee && document.getElementById('crmProspection')) return;
    zone.innerHTML = '<div class="crm-pro" id="crmProspection"></div>';
    etat.prospectionMontee = true;
    try {
      window.crmProspectionAfficher(document.getElementById('crmProspection'), { sousVue: etat.sousVue });
    } catch (e) {
      console.error('CRM : la vue Prospection a échoué', e);
      etat.prospectionMontee = false;
      zone.innerHTML = htmlVide('alerte', 'La prospection n\'a pas pu s\'afficher', 'Actualisez la page. Si le souci persiste, le reste du CRM reste utilisable.');
    }
  }

  // ───────────────────────────── Rendu d'ensemble ─────────────────────────────

  function foyerDansVue(zone) {
    var el = document.activeElement;
    if (!el || !zone.contains(el)) return null;
    if (el.id) return '#' + el.id;
    var ligne = el.closest('[data-cle]');
    if (!el.dataset.action) return null;
    var cible = '[data-action="' + el.dataset.action + '"]' + (el.dataset.id ? '[data-id="' + el.dataset.id + '"]' : '');
    if (!ligne) return cible;
    var cle = '[data-cle="' + ligne.dataset.cle.replace(/["\\]/g, '\\$&') + '"]';
    return ligne === el ? cle + cible : cle + ' ' + cible;
  }

  function rendreVue() {
    var zone = zoneVue();
    if (!zone) return;
    zone.setAttribute('data-vue', etat.vue);
    if (!CRM.etat.charge) { zone.innerHTML = htmlSquelette(); return; }
    if (etat.vue === 'prospection') { rendreProspection(zone); return; }
    // Redessiner ne doit ni faire sauter le défilement horizontal du pipeline ni perdre la ligne en cours au clavier.
    var pipe = document.getElementById('crmPipe');
    var gauche = pipe ? pipe.scrollLeft : 0;
    var foyer = foyerDansVue(zone);
    zone.innerHTML = etat.vue === 'pipeline' ? htmlPipeline() : etat.vue === 'fiches' ? htmlFiches() : htmlAujourdhui();
    pipe = document.getElementById('crmPipe');
    if (pipe && gauche) pipe.scrollLeft = gauche;
    if (foyer) {
      var cible = null;
      try { cible = zone.querySelector(foyer); } catch (e) { cible = null; }
      if (cible && !cible.disabled) cible.focus({ preventScroll: true });
    }
  }

  function rendre() {
    if (!etat.construit) return;
    document.getElementById('crmBandeaux').innerHTML = htmlBandeaux();
    document.getElementById('crmIndicateurs').innerHTML = htmlIndicateurs();
    document.getElementById('crmPilules').innerHTML = htmlPilules();
    rendreVue();
  }

  /* Une écriture déclenche plusieurs recalculs du cœur (optimiste, puis confirmé) : un seul rendu par image. */
  function planifierRendu() {
    if (etat.renduPrevu) return;
    etat.renduPrevu = true;
    var faire = function () { etat.renduPrevu = false; if (pageActive()) rendre(); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(faire); else setTimeout(faire, 16);
  }

  function majPastille() {
    var pastille = document.getElementById('navPastilleCrm');
    if (!pastille) return;
    var n = CRM.etat.charge ? CRM.compteurs().aTraiter : 0;
    pastille.hidden = !n;
    pastille.textContent = n;
    pastille.setAttribute('aria-label', n + ' à traiter');
  }

  CRM.surChangement(function () {
    majPastille();
    if (etat.construit && pageActive()) planifierRendu();
  });

  // ───────────────────────────── Événements ─────────────────────────────

  function filtrer(id) {
    etat.filtre = id;
    etat.limite = PAS_FICHES;
    if (etat.vue !== 'fiches') changerVue('fiches'); else rendreVue();
  }

  function viderRecherche() {
    var champ = document.getElementById('crmRecherche');
    champ.value = '';
    etat.recherche = '';
    champ.parentNode.classList.remove('crm-recherche-pleine');
    champ.parentNode.querySelector('.crm-recherche-effacer').hidden = true;
  }

  function surRecherche(e) {
    etat.recherche = e.target.value.trim();
    etat.limite = PAS_FICHES;
    e.target.parentNode.classList.toggle('crm-recherche-pleine', !!e.target.value);
    e.target.parentNode.querySelector('.crm-recherche-effacer').hidden = !e.target.value;
    // Chercher depuis n'importe quelle vue mène à la liste des fiches, toutes étapes confondues.
    if (etat.vue !== 'fiches') { etat.filtre = 'toutes'; changerVue('fiches', { sansRemonter: true }); }
    else rendreVue();
  }

  function surChangementChamp(e) {
    if (e.target.id !== 'crmTri') return;
    etat.tri = e.target.value;
    rendreVue();
  }

  function surClic(e) {
    var el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    var ligne = el.closest('[data-cle]');
    var cle = ligne && ligne.dataset.cle;
    var id = el.dataset.id;
    switch (el.dataset.action) {
      case 'vue': changerVue(id); break;
      case 'indicateur': viderRecherche(); filtrer(id); break;
      case 'filtre': filtrer(id); break;
      case 'tout-afficher': viderRecherche(); filtrer('toutes'); break;
      case 'effacer-recherche': viderRecherche(); rendreVue(); document.getElementById('crmRecherche').focus(); break;
      case 'ouvrir': if (cle) ouvrirFiche(cle, { origine: el }); break;
      // Le lien (tel:, wa.me, mailto:) s'ouvre de lui-même ; la fiche s'ouvre derrière avec la question « Résultat ? ».
      case 'contacter': if (cle) ouvrirFiche(cle, { origine: el, attente: id }); break;
      case 'fait': if (cle) UI.faitAction(cle); break;
      case 'menu-reporter':
        if (cle) UI.ouvrirMenu(el, UI.optionsReport(), function (date) { UI.reporterAction(cle, date); });
        break;
      case 'enchainer': demarrerChaine(); break;
      case 'plus': etat.limite += PAS_FICHES; rendreVue(); break;
      case 'colonne-plus': etat.colonnes[id] = (etat.colonnes[id] || PAS_COLONNE) + PAS_COLONNE; rendreVue(); break;
      case 'recharger': actualiser(); break;
    }
  }

  function enSaisie(el) {
    return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
  }

  /* Clavier : « / » cherche, j / k ou les flèches parcourent la liste, Entrée ouvre (c'est un bouton). */
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || !etat.construit || !pageActive() || panneau.estOuverte() || UI.menuOuvert()) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var champ = document.getElementById('crmRecherche');
    if (e.key === 'Escape' && e.target === champ) {
      if (champ.value) { viderRecherche(); rendreVue(); } else champ.blur();
      return;
    }
    if (enSaisie(e.target)) return;
    if (e.key === '/') { e.preventDefault(); champ.focus(); champ.select(); return; }
    var sens = e.key === 'j' || e.key === 'ArrowDown' ? 1 : e.key === 'k' || e.key === 'ArrowUp' ? -1 : 0;
    if (!sens) return;
    var lignes = Array.prototype.slice.call(zoneVue().querySelectorAll('.crm-nav'));
    if (!lignes.length) return;
    e.preventDefault();
    var i = lignes.indexOf(document.activeElement);
    var suivante = lignes[i < 0 ? (sens > 0 ? 0 : lignes.length - 1) : Math.max(0, Math.min(lignes.length - 1, i + sens))];
    suivante.focus();
    suivante.scrollIntoView({ block: 'nearest' });
  });

  window.addEventListener('popstate', synchroniser);
  window.addEventListener('hashchange', synchroniser);

  // ───────────────────────────── Points d'entrée appelés par admin.html ─────────────────────────────

  function apresChargement() {
    majPastille();
    if (!pageActive()) return;
    rendre();
    synchroniser();
  }

  /* Appelé par allerPage('crm'). */
  function ouvrirPage() {
    construire();
    if (!etat.construit) return;
    var r = lireHash();
    if (r && r.vue) { etat.vue = r.vue; etat.sousVue = r.sousVue; }
    if (!r) history.replaceState(null, '', hashVue());
    etat.prospectionMontee = false;
    rendre();
    CRM.charger().then(apresChargement);
  }

  /* Appelé par le bouton « Actualiser » de l'admin quand la page CRM est affichée. */
  function actualiser() {
    return CRM.charger({ force: true }).then(apresChargement);
  }

  /* Appelé après la connexion : charge en arrière-plan pour la pastille du menu, et ouvre le CRM
     si l'adresse le demande (#crm…). Ne doit jamais lever d'erreur visible. */
  var prechargeFait = false;
  function precharger() {
    prechargeFait = true;
    try {
      if (lireHash() && typeof window.allerPage === 'function') { window.allerPage('crm'); return; }
      CRM.charger().then(majPastille, function () {});
    } catch (e) { /* la pastille attendra l'ouverture de la page */ }
  }

  /* Ouvre la fiche d'une clé depuis n'importe quelle page de l'admin (menu d'une ligne Commerçants, par exemple). */
  function ouvrirFicheDepuisAdmin(cle) {
    if (!pageActive() && typeof window.allerPage === 'function') window.allerPage('crm');
    CRM.charger().then(function () {
      if (!pageActive()) return;
      if (CRM.fiche(cle)) ouvrirFiche(cle);
      else window.crmToast('Pas de fiche CRM pour cette boutique (compte de test, démo d\'ambassadeur ou boutique supprimée).', { type: 'erreur' });
    });
  }

  window.crmOuvrirPage = ouvrirPage;
  window.crmActualiser = actualiser;
  window.crmPrecharger = precharger;
  window.crmOuvrirFiche = ouvrirFicheDepuisAdmin;

  // La reprise de session d'admin.html peut aboutir avant le chargement de ce fichier : son appel de préchargement
  // est alors perdu (ni pastille, ni ouverture par #crm…). On le rejoue une fois tous les scripts du CRM lus,
  // pour que la vue Prospection soit là si l'adresse la demande.
  function rattraper() {
    var tableau = document.getElementById('dashboard');
    if (!prechargeFait && tableau && tableau.classList.contains('actif')) precharger();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', rattraper);
  else rattraper();
})();
