/* CRM admin Marchéo — panneau de fiche, notification et outils d'interface partagés.
 *
 * Expose `window.crmToast`, `window.crmFiche` (ouvrir / fermer le panneau) et `window.crmUI` (icônes,
 * formats, menu, écritures avec retour arrière) dont se servent les vues.
 *
 * Le cœur recrée toutes les fiches à chaque écriture : le panneau est donc redessiné en entier à chaque
 * changement. Tout ce que l'utilisateur est en train de saisir vit dans `ui` (jamais dans le DOM seul),
 * ce qui permet de redessiner sans rien perdre.
 */
(function () {
  'use strict';

  var CRM = window.CRM;
  if (!CRM || typeof document === 'undefined') return;
  var pur = CRM.pur;

  // ───────────────────────────── Échappement, icônes, formats ─────────────────────────────

  function esc(v) {
    if (typeof window.escHtml === 'function') return window.escHtml(v);
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c];
    });
  }

  var ICONES = {
    telephone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    whatsapp: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/>',
    sms: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    email: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    note: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    tache: '<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    horloge: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    chevronBas: '<path d="m6 9 6 6 6-6"/>',
    chevronDroit: '<path d="m9 18 6-6-6-6"/>',
    croix: '<path d="M18 6 6 18M6 6l12 12"/>',
    recherche: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    lien: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.8 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    copier: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    externe: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/>',
    epingle: '<path d="M12 17v5"/><path d="M9 3h6l-1 6 4 4v2H6v-2l4-4z"/>',
    corbeille: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    coche: '<path d="M20 6 9 17l-5-5"/>',
    fleche: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    enchainer: '<path d="m5 4 10 8-10 8z"/><path d="M19 5v14"/>',
    calendrier: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    alerte: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    oeil: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    carte: '<rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/>',
    boutique: '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9.5V20a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9.5"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M9.5 21v-6h5v6"/>',
    rouvrir: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    personne: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    audit: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
    partage: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    commande: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
    drapeau: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
    lieu: '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    actualiser: '<path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
    cadenas: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
    sommeil: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sansTel: '<path d="M10.7 13.3a16 16 0 0 0 3.4 2.6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8"/><path d="M22 2 2 22"/>',
    desinscrit: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m9 10 6 6M15 10l-6 6"/>',
    google: '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><path d="M14.6 8.6a3 3 0 1 0 .4 2.4H12"/>',
    instagram: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
    facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
    // Chaleur du prospect : flamme (chaud), thermomètre à mi-hauteur (tiède), flocon (froid), sablier (pas encore analysé).
    flamme: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    mitige: '<path d="M14 4v10.5a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z"/><path d="M12 11v6"/>',
    flocon: '<path d="M2 12h20M12 2v20M20 16l-4-4 4-4M4 8l4 4-4 4M16 4l-4 4-4-4M8 20l4-4 4 4"/>',
    sablier: '<path d="M5 22h14M5 2h14M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2"/>',
    baguette: '<path d="m4 20 11-11M14.5 5.5l4 4"/><path d="M19 13v4M17 15h4M6 3v4M4 5h4M11 2v2M10 3h2"/>',
    main: '<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>'
  };

  function ic(nom, taille) {
    var t = taille || 16;
    return '<svg class="crm-ic" width="' + t + '" height="' + t + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONES[nom] || '') + '</svg>';
  }

  function maintenant() { return CRM.horloge(); }
  function aujourdhui() { return pur.dateLocaleISO(maintenant()); }
  function pluriel(n, mot, motPluriel) { return n + ' ' + (n > 1 ? (motPluriel || mot + 's') : mot); }
  function euros(n) { return Math.round(Number(n) || 0).toLocaleString('fr-FR') + ' €'; }

  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var JOURS_SEMAINE = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

  /* « 12 nov. », avec l'année seulement quand ce n'est pas la nôtre. */
  function dateCourte(v, avecAnnee) {
    var d = pur.versDate(v);
    if (!d) return '';
    var annee = avecAnnee || d.getFullYear() !== maintenant().getFullYear();
    return d.getDate() + ' ' + MOIS[d.getMonth()] + (annee ? ' ' + d.getFullYear() : '');
  }
  function dateAvecJour(v) {
    var d = pur.versDate(v);
    return d ? JOURS_SEMAINE[d.getDay()] + ' ' + dateCourte(d) : '';
  }
  function heureCourte(v) {
    var d = pur.versDate(v);
    if (!d) return '';
    var m = d.getMinutes();
    return d.getHours() + ' h ' + (m < 10 ? '0' : '') + m;
  }
  /* Âge relatif d'un moment passé (ou proche futur) : « aujourd'hui », « hier », « il y a 6 j », puis la date. */
  function dateRelative(v) {
    var n = pur.jours(v, maintenant());
    if (isNaN(n)) return '';
    if (n === 0) return 'aujourd\'hui';
    if (n === 1) return 'hier';
    if (n === -1) return 'demain';
    if (n < 0) return n >= -30 ? 'dans ' + (-n) + ' j' : dateCourte(v);
    return n <= 30 ? 'il y a ' + n + ' j' : dateCourte(v);
  }
  /* Libellé d'une échéance de tâche. */
  function echeanceLibelle(iso) {
    var n = pur.jours(aujourdhui(), iso);
    if (isNaN(n)) return '';
    if (n === 0) return 'Aujourd\'hui';
    if (n === 1) return 'Demain';
    if (n < 0) return 'En retard de ' + (-n) + ' j';
    return dateAvecJour(iso);
  }
  function ageJours(fiche) {
    var n = pur.jours(fiche.depuis || fiche.creeLe, maintenant());
    return isNaN(n) ? null : Math.max(0, n);
  }

  function initiales(nom) {
    var mots = String(nom || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
    // « Boulangerie du Port » → BP plutôt que BD : les petits mots de liaison ne disent rien.
    var utiles = mots.filter(function (m) { return m.length > 2; });
    if (utiles.length >= 2) mots = utiles;
    return ((mots[0] || '?').charAt(0) + (mots[1] ? mots[1].charAt(0) : '')).toUpperCase();
  }

  /* Métier d'une fiche : emoji et libellé de la table METIERS d'admin.html quand le type est connu,
     sinon le libellé libre saisi lors de l'audit ou de la prospection. */
  function metierDe(fiche) {
    /* global METIERS */
    var table = typeof METIERS !== 'undefined' ? METIERS : {};
    var m = fiche.metier && table[fiche.metier];
    if (m) return { emoji: m.emoji, libelle: fiche.metierLibelle || m.label };
    var libre = fiche.metierLibelle || fiche.metier || '';
    return { emoji: '', libelle: libre ? libre.charAt(0).toUpperCase() + libre.slice(1) : '' };
  }
  function lieuMetierHtml(fiche) {
    var m = metierDe(fiche);
    var morceaux = [];
    if (m.libelle) {
      morceaux.push((m.emoji ? '<span class="crm-emoji" aria-hidden="true">' + esc(m.emoji) + '</span>' : '') +
        '<span class="crm-metier-lib">' + esc(m.libelle) + '</span>');
    }
    if (fiche.ville) morceaux.push('<span class="crm-ville">' + esc(fiche.ville) + '</span>');
    return morceaux.join('<span class="crm-sep">·</span>');
  }

  function etapeDe(id) {
    for (var i = 0; i < CRM.ETAPES.length; i++) if (CRM.ETAPES[i].id === id) return CRM.ETAPES[i];
    return { id: id, libelle: id, court: id };
  }
  function etapeHtml(fiche) {
    return '<span class="crm-etape crm-e-' + esc(fiche.etape) + '"><i></i>' + esc(etapeDe(fiche.etape).court) + '</span>';
  }
  /* Pastille de score : le chiffre porte l'information, la teinte seulement le niveau. */
  function scoreHtml(fiche) {
    var s = fiche.score;
    if (!s) return '<span class="crm-score crm-n-perdu" title="Fiche perdue : pas de score">–</span>';
    var titre = (s.type === 'sante' ? 'Santé' : 'Chaleur') + ' : ' + s.libelle + ' (' + s.valeur + ' sur 100)';
    return '<span class="crm-score crm-n-' + esc(s.niveau) + '" title="' + esc(titre) + '">' + s.valeur + '</span>';
  }

  // ───────────────────────────── Chaleur du prospect (composants partagés avec la vue Prospection) ─────────────────────────────

  var ICONES_CHALEUR = { chaud: 'flamme', tiede: 'mitige', froid: 'flocon', non_analyse: 'sablier' };
  var LIBELLES_SITE = {
    pas_de_site: 'Pas de site connu', annuaire: 'Pas de site à lui (page d\'annuaire)', parking: 'Page d\'attente ou domaine à vendre',
    illisible: 'Site non lisible par l\'analyse (page générée par script)'
  };
  var LIBELLES_GOOGLE = {
    trouve: 'Fiche Google trouvée', introuvable: 'Fiche Google non trouvée', sans_cle: 'Google non interrogé (clé absente)',
    quota: 'Google non interrogé (plafond du jour atteint) : sera repris', erreur: 'Google n\'a pas répondu : sera repris'
  };

  /* Pastille de chaleur d'un prospect : toujours une icône ET le niveau en toutes lettres (jamais la couleur seule).
     `ch` : résultat de CRM.chaleurProspect ; null (migration absente) → rien. opts.court : le libellé n'est plus
     qu'un texte pour lecteur d'écran (file étroite), l'icône et la note restent visibles. */
  function chaleurHtml(ch, opts) {
    if (!ch) return '';
    opts = opts || {};
    var libelle = ch.exclu ? 'Froid · à écarter' : ch.libelle;
    var avecValeur = ch.valeur != null && ch.niveau !== 'non_analyse' && !ch.exclu && !ch.manuel;
    var titre = 'Chaleur du prospect : ' + libelle + (avecValeur ? ' (' + ch.valeur + ' sur 100)' : '') + (ch.manuel ? ', réglé à la main' : '') +
      (ch.partiel ? '. D\'après OpenStreetMap seulement' : '');
    return '<span class="crm-chal crm-n-' + esc(ch.niveau) + (opts.court ? ' crm-chal-court' : '') + '" data-niveau="' + esc(ch.niveau) + '"' +
      (ch.partiel ? ' data-partiel="1"' : '') + (ch.exclu ? ' data-exclu="1"' : '') + ' title="' + esc(titre) + '">' + ic(ICONES_CHALEUR[ch.niveau] || 'sablier', 13) +
      '<b' + (opts.court ? ' class="crm-sr"' : '') + '>' + esc(libelle) + '</b>' + (avecValeur ? '<i>' + ch.valeur + '</i>' : '') +
      (ch.manuel ? ic('main', 12) + '<span class="crm-sr">réglé à la main</span>' : '') + '</span>';
  }

  /* Le « pourquoi » d'une chaleur : une ligne par raison, le signe et les points d'abord. `max` : nombre de lignes. */
  function raisonsChaleurHtml(ch, max) {
    if (!ch) return '';
    var html = '';
    if (ch.manuel) {
      html += '<p class="crm-chal-manuel">' + ic('main', 13) + '<span>Réglé à la main · automatique : ' +
        esc(ch.auto.niveau === 'non_analyse' ? 'pas encore analysé' : UIniveau(ch.auto.niveau) + ' ' + ch.auto.valeur) + '</span></p>';
    }
    if (!ch.raisons.length) return html + '<p class="crm-aide crm-chal-vide">Aucun signal pour l\'instant : ce prospect n\'a pas encore été analysé.</p>';
    var raisons = max ? ch.raisons.slice(0, max) : ch.raisons;
    return html + '<ul class="crm-chal-raisons">' + raisons.map(function (r) {
      var signe = r.texte.charAt(0), classe = signe === '+' ? 'crm-pts-plus' : signe === '−' ? 'crm-pts-moins' : 'crm-pts-nul';
      return '<li data-raison="' + esc(r.cle) + '"><b class="' + classe + '">' + (signe === '·' ? '·' : signe + (r.points ? Math.abs(r.points) : '')) + '</b>' +
        '<span>' + esc(r.texte.slice(1).trim()) + '</span></li>';
    }).join('') + '</ul>';
  }
  function UIniveau(id) {
    for (var i = 0; i < CRM.NIVEAUX_CHALEUR.length; i++) if (CRM.NIVEAUX_CHALEUR[i].id === id) return CRM.NIVEAUX_CHALEUR[i].libelle;
    return '';
  }

  /* Ligne d'honnêteté : quand l'analyse a eu lieu et ce qu'elle a pu regarder (site analysé, injoignable, pas de
     site ; fiche Google trouvée ou non, clé absente). */
  function etatAnalyseHtml(p, ch) {
    if (!ch || !p) return '';
    var e = ch.etats || {}, site = (p.signaux && p.signaux.site) || {}, morceaux = [];
    if (!e.analyseLe) {
      return '<p class="crm-chal-etat">' + esc(ch.partiel ? 'D\'après OpenStreetMap seulement : site et fiche Google pas encore regardés.'
        : ch.etude && ch.etude.comptee ? 'D\'après l\'étude du commerce : analyse automatique du site et de la fiche Google pas encore faite.'
          : 'Pas encore analysé : site et fiche Google pas encore regardés.') + '</p>';
    }
    morceaux.push('Analysé le ' + dateCourte(e.analyseLe));
    if (e.site === 'analyse') morceaux.push('Site analysé (' + pluriel(Math.max(1, Number(site.pages) || 1), 'page') + ')' + (site.tronque ? ', page très longue lue en partie' : ''));
    else if (e.site === 'injoignable') morceaux.push('Site injoignable le ' + dateCourte(site.le || e.analyseLe));
    else if (e.site === 'reseau_seul') morceaux.push('Sa seule vitrine : ' + (site.reseau === 'instagram' ? 'son profil Instagram' : site.reseau === 'facebook' ? 'sa page Facebook' : 'une page de réseau social'));
    else if (LIBELLES_SITE[e.site]) morceaux.push(LIBELLES_SITE[e.site]);
    // Dernier passage en échec : l'analyse réussie d'avant est gardée, avec sa date.
    if (site.echec && e.site !== 'injoignable') {
      morceaux.push('Site injoignable le ' + dateCourte(site.echec.le || e.analyseLe) + (site.le ? ' (analyse du ' + dateCourte(site.le) + ' conservée)' : ''));
    }
    if (LIBELLES_GOOGLE[e.google]) morceaux.push(LIBELLES_GOOGLE[e.google]);
    return '<p class="crm-chal-etat">' + esc(morceaux.join(' · ')) + '</p>';
  }

  /* Réglages à un toucher : niveau forcé (ou retour à l'automatique) et activité des réseaux sociaux.
     `attribut` : nom de l'attribut d'action (« data-pro » dans la prospection, « data-action » sur la fiche). */
  function reglagesChaleurHtml(p, attribut, inactif, avecReseaux) {
    var manuel = p.chaleur_manuelle || '';
    var niveaux = CRM.NIVEAUX_CHALEUR.filter(function (n) { return n.id !== 'non_analyse'; }).map(function (n) {
      return '<button type="button" class="crm-puce" ' + attribut + '="chaleur-manuelle" data-id="' + n.id + '" aria-pressed="' + (manuel === n.id) + '"' + inactif + '>' +
        ic(ICONES_CHALEUR[n.id], 13) + esc(n.libelle) + '</button>';
    }).join('') + '<button type="button" class="crm-puce" ' + attribut + '="chaleur-manuelle" data-id="" aria-pressed="' + (!manuel) + '"' + inactif + '>Automatique</button>';
    return '<div class="crm-chal-reglages"><div class="crm-chal-reglage" role="group" aria-label="Régler la chaleur à la main"><span class="crm-chal-reglage-titre">Régler à la main</span>' +
      '<div class="crm-puces">' + niveaux + '</div></div>' + (avecReseaux ? reseauxActifsHtml(p, attribut, inactif) : '') + '</div>';
  }
  function reseauxActifsHtml(p, attribut, inactif) {
    return '<div class="crm-chal-reglage crm-chal-reseaux" role="group" aria-label="Activité des réseaux"><span class="crm-chal-reglage-titre">Réseaux</span><div class="crm-puces">' +
      [['actif', 'Actifs'], ['peu_actif', 'Peu actifs']].map(function (c) {
        return '<button type="button" class="crm-puce" ' + attribut + '="reseaux-actifs" data-id="' + c[0] + '" aria-pressed="' + (p.reseaux_actifs === c[0]) + '"' + inactif + '>' + c[1] + '</button>';
      }).join('') + '</div></div>';
  }

  // ───────────────────────────── Étude du commerce (note Marchéo) ─────────────────────────────

  /* Tout ce qui vient de l'étude est une donnée lue sur le web par une tâche extérieure : chaque texte passe par
     esc(), et une source n'est un lien que si CRM.pur.urlHttps l'accepte (https, hôte simple). */
  var LIBELLES_CONFIANCE = { forte: 'Confiance forte', moyenne: 'Confiance moyenne', faible: 'Confiance faible' };
  var LIBELLES_TENDANCE = { bons: 'Bons avis', mitiges: 'Avis mitigés', mauvais: 'Mauvais avis' };
  var LIBELLES_PHOTOS = { belles: 'Belles photos', correctes: 'Photos correctes', pauvres: 'Photos pauvres' };
  var LIBELLES_ACTIVITE = { actif: 'actif', peu_actif: 'peu actif', absent: 'absent' };
  var RESERVES_ETUDE = {
    non_identifie: 'Commerce pas retrouvé avec certitude : étude à lire avec prudence, non comptée dans la chaleur.',
    faible: 'Peu d\'éléments trouvés : étude non comptée dans la chaleur.'
  };
  var RYTHME_ETUDE = 'l\'étude passe environ toutes les heures, 15 prospects à la fois';

  function noteFr(n) { return String(n).replace('.', ','); }
  function sansEtudePossible(p) { return p.resultat === 'faux_numero' || p.resultat === 'pas_interesse'; }

  /* Petite note à côté de la pastille de chaleur (file d'appels, Liste) : « 7,5/10 », en retrait quand l'étude est
     peu fiable ; un sablier quand l'étude est demandée et pas encore arrivée. Rien sans étude ni demande. */
  function noteMarcheoHtml(p) {
    var ep = CRM.etudeProspect(p);
    if (!ep) return '';
    if (ep.etude && ep.note != null) {
      var titre = 'Note Marchéo : ' + noteFr(ep.note) + ' sur 10' + (ep.fiable ? '' : ' (étude peu fiable)');
      return '<span class="crm-note-m' + (ep.fiable ? '' : ' crm-note-m-incertaine') + '" data-note="' + esc(String(ep.note)) + '" title="' + esc(titre) + '">' +
        '<span class="crm-sr">Note Marchéo </span><b>' + esc(noteFr(ep.note)) + '</b><small>/10</small>' +
        (ep.fiable ? '' : '<span class="crm-sr"> (étude peu fiable)</span>') + '</span>';
    }
    if (ep.demandeeLe) return '<span class="crm-note-m crm-note-m-attente" data-attente="1" title="Étude demandée">' + ic('sablier', 12) + '<span class="crm-sr">Étude demandée</span></span>';
    return '';
  }

  function faitEtude(libelle, valeurHtml) {
    return valeurHtml ? '<div class="crm-etude-fait"><dt>' + esc(libelle) + '</dt><dd>' + valeurHtml + '</dd></div>' : '';
  }
  function listeEtude(titre, points, classe) {
    if (!points.length) return '';
    return '<div class="crm-etude-points ' + classe + '"><p class="crm-etiquette">' + esc(titre) + '</p><ul>' +
      points.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>';
  }

  /* Détail d'une étude : avis clients, photos, commande en ligne, réseaux, dirigeant, points forts et faibles, sources. */
  function detailEtudeHtml(e, opts) {
    var ac = e.avis_clients, ph = e.photos, html = '';
    var chiffres = [LIBELLES_TENDANCE[ac.tendance] || '', ac.note != null ? noteFr(ac.note) + ' ★' : '', ac.nombre != null ? pluriel(ac.nombre, 'avis', 'avis') : ''].filter(Boolean);
    var avisClients = (chiffres.length ? '<b>' + esc(chiffres.join(' · ')) + '</b>' : '') + (ac.resume ? '<span>' + esc(ac.resume) + '</span>' : '');
    var photos = '';
    if (ph) {
      var traits = ph.vues === false ? ['Aucune photo vue'] : [LIBELLES_PHOTOS[ph.qualite] || '',
        ph.recentes === true ? 'récentes' : ph.recentes === false ? 'anciennes' : '',
        ph.devanture === true ? 'devanture visible' : ph.devanture === false ? 'pas de devanture' : '',
        ph.produits === true ? 'produits en photo' : ph.produits === false ? 'pas de photo des produits' : ''].filter(Boolean);
      photos = (traits.length ? '<b>' + esc(traits.join(' · ')) + '</b>' : '') + (ph.commentaire ? '<span>' + esc(ph.commentaire) + '</span>' : '');
    }
    var reseaux = [['Instagram', e.reseaux.instagram], ['Facebook', e.reseaux.facebook]]
      .filter(function (r) { return LIBELLES_ACTIVITE[r[1]]; }).map(function (r) { return r[0] + ' ' + LIBELLES_ACTIVITE[r[1]]; });
    var faits = faitEtude('Avis clients', avisClients) + faitEtude('Photos', photos) +
      faitEtude('Commande en ligne', e.commande_en_ligne === 'oui' ? '<b>Vue' + (e.plateforme ? ' : ' + esc(e.plateforme) : '') + '</b>'
        : e.commande_en_ligne === 'non_vue' ? '<b>Pas vue</b>' : '') +
      faitEtude('Traiteur', e.traiteur === true ? '<b>Oui</b>' : e.traiteur === false ? '<b>Non</b>' : '') +
      faitEtude('Points de vente', e.points_de_vente != null ? '<b>' + esc(String(e.points_de_vente)) + '</b>' : '') +
      faitEtude('Réseaux', reseaux.length ? '<b>' + esc(reseaux.join(' · ')) + '</b>' : '') +
      faitEtude('Dirigeant', e.dirigeant ? '<b>' + esc(e.dirigeant) + '</b><span>d\'après l\'annuaire des entreprises</span>' : '') +
      faitEtude('Création', e.anciennete != null ? '<b>' + esc(String(e.anciennete)) + '</b>' : '');
    if (faits) html += '<dl class="crm-etude-faits">' + faits + '</dl>';
    html += listeEtude('Points forts', e.points_forts, 'crm-etude-forts') + listeEtude('Points faibles', e.points_faibles, 'crm-etude-faibles');
    if (opts.avecAngle && e.angle) html += '<div class="crm-etude-angle"><p class="crm-etiquette">Angle conseillé pour l\'appel</p><p>' + esc(e.angle) + '</p></div>';
    // Sources : uniquement des adresses https revalidées ; nouvel onglet, sans référent ni accès à cette page.
    var sources = e.sources.map(function (u) { return pur.urlHttps(u); }).filter(Boolean);
    if (sources.length) {
      html += '<div class="crm-etude-sources-bloc"><p class="crm-etiquette">Sources</p><ul class="crm-etude-sources">' + sources.map(function (u) {
        var hote = (/^https:\/\/([^\/]+)/.exec(u) || [])[1] || u;
        hote = hote.replace(/^www\./, '');
        return '<li><a class="crm-btn crm-etude-source" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer" title="' + esc(u) + '" aria-label="' + esc('Source : ' + hote + ' (nouvel onglet)') + '">' +
          '<span>' + esc(hote) + '</span>' + ic('externe', 12) + '</a></li>';
      }).join('') + '</ul></div>';
    }
    return html;
  }

  /* Bloc « Étude du commerce » d'un prospect : note Marchéo, confiance en toutes lettres, date, réserve éventuelle,
     notre avis, détail, et les boutons « Demander l'étude » / « Redemander l'étude » / « Retirer de la file ».
     opts : { id, attribut ('data-pro' | 'data-action'), inactif (attributs des boutons), repliable (le détail se
     déplie), ouvert, avecAngle, envoi (une demande est en cours d'envoi) }. '' sans la migration de l'étude. */
  function etudeHtml(p, opts) {
    opts = opts || {};
    if (!p || !CRM.etat.etude) return '';
    var ep = CRM.etudeProspect(p), e = ep && ep.etude, attente = !!(ep && ep.demandeeLe);
    var attribut = opts.attribut || 'data-action', inactif = opts.inactif || '';
    if (!e && !attente && sansEtudePossible(p)) return '';
    var bouton = function (action, libelle, icone, classe) {
      return '<button type="button" class="crm-btn' + (classe ? ' ' + classe : '') + '" ' + attribut + '="' + action + '"' + (opts.envoi ? ' disabled' : inactif) + '>' + ic(icone, 14) + libelle + '</button>';
    };
    var etat = e ? 'faite' : attente ? 'attente' : 'aucune';
    var html = '<div class="crm-etude" id="' + esc(opts.id || 'crmEtude') + '" data-etat="' + etat + '"' + (e ? ' data-fiable="' + (ep.fiable ? '1' : '0') + '"' : '') + '>';
    if (!e) {
      html += '<div class="crm-etude-tete"><p class="crm-etiquette">Étude du commerce</p></div>';
      html += attente
        ? '<p class="crm-etude-attente" role="status">' + ic('sablier', 14) + '<span>En attente d\'étude, demandée ' + esc(dateRelative(ep.demandeeLe)) + ' : ' + esc(RYTHME_ETUDE) + '.</span></p>' +
          '<div class="crm-etude-actions">' + bouton('etude-retirer', 'Retirer de la file', 'croix') + '</div>'
        : '<p class="crm-etude-vide">Pas encore d\'étude : fiche, photos, avis et réseaux du commerce regardés pour vous, avec notre note.</p>' +
          '<div class="crm-etude-actions">' + bouton('etude-demander', 'Demander l\'étude', 'recherche', 'crm-btn-or') + '</div>';
      return html + '</div>';
    }
    html += '<div class="crm-etude-tete"><p class="crm-etiquette">Étude du commerce</p>' +
      '<p class="crm-etude-note' + (ep.fiable ? '' : ' crm-etude-note-incertaine') + '">' + (e.note != null
        ? 'Note Marchéo <b>' + esc(noteFr(e.note)) + '</b>/10' : 'Note Marchéo <b>non établie</b>') + '</p>' +
      '<span class="crm-etude-confiance" data-confiance="' + esc(e.confiance) + '">' + esc(LIBELLES_CONFIANCE[e.confiance]) + '</span>' +
      (ep.le ? '<span class="crm-etude-date">Étude du ' + esc(dateCourte(ep.le)) + '</span>' : '') + '</div>';
    if (ep.motif) html += '<p class="crm-etude-reserve" data-motif="' + esc(ep.motif) + '">' + ic('alerte', 14) + '<span>' + esc(RESERVES_ETUDE[ep.motif]) + '</span></p>';
    if (e.avis) html += '<p class="crm-etude-avis">' + esc(e.avis) + '</p>';
    var detail = detailEtudeHtml(e, opts);
    var idDetail = (opts.id || 'crmEtude') + 'Detail';
    if (detail && opts.repliable) {
      html += '<button type="button" class="crm-lien crm-etude-deplier" ' + attribut + '="etude-detail" aria-expanded="' + !!opts.ouvert + '" aria-controls="' + esc(idDetail) + '">' +
        ic(opts.ouvert ? 'chevronBas' : 'chevronDroit', 13) + (opts.ouvert ? 'Masquer le détail' : 'Voir toute l\'étude') + '</button>';
    }
    if (detail && (!opts.repliable || opts.ouvert)) html += '<div class="crm-etude-detail" id="' + esc(idDetail) + '">' + detail + '</div>';
    html += '<div class="crm-etude-actions">';
    if (attente) {
      html += '<p class="crm-etude-attente" role="status">' + ic('sablier', 14) + '<span>Nouvelle étude demandée ' + esc(dateRelative(ep.demandeeLe)) + '.</span></p>' + bouton('etude-retirer', 'Retirer de la file', 'croix');
    } else if (!sansEtudePossible(p)) html += bouton('etude-demander', 'Redemander l\'étude', 'actualiser');
    return html + '</div></div>';
  }

  var LIBELLES_OFFRE_COURT = { vitrine: 'Vitrine', clickcollect: 'Click & Collect', livraison: 'Livraison' };
  function offreNom(fiche) { return LIBELLES_OFFRE_COURT[fiche.offre] || ''; }

  function lectureSeule() { return !CRM.etat.ecriture; }
  // Une panne passagère n'est pas une migration manquante : ne pas envoyer le fondateur la chercher.
  function raisonLectureSeule() {
    return CRM.etat.ecriturePanne ? 'le suivi ne répond pas pour l\'instant, actualisez dans un instant' : 'la migration CRM n\'est pas encore appliquée';
  }
  function attrEcriture() {
    return lectureSeule() ? ' disabled title="Inactif : ' + esc(raisonLectureSeule()) + '"' : '';
  }

  // ───────────────────────────── Notification ─────────────────────────────

  var toast = null, minuterieToast = null;

  /* Notification propre au CRM : un message, et au besoin un bouton (« Annuler »).
     opts : { action, surAction, type: 'erreur', duree } */
  function crmToast(message, opts) {
    opts = opts || {};
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'crm-racine crm-toast';
      document.body.appendChild(toast);
    }
    clearTimeout(minuterieToast);
    toast.setAttribute('role', opts.type === 'erreur' ? 'alert' : 'status');
    toast.classList.toggle('crm-toast-erreur', opts.type === 'erreur');
    toast.innerHTML = '<span class="crm-toast-msg">' + esc(message) + '</span>' +
      (opts.action ? '<button type="button" class="crm-toast-action">' + esc(opts.action) + '</button>' : '');
    var bouton = toast.querySelector('.crm-toast-action');
    if (bouton) {
      bouton.addEventListener('click', function () {
        masquerToast();
        if (typeof opts.surAction === 'function') opts.surAction();
      });
    }
    // Forcer un passage par l'état masqué pour que deux notifications successives se voient toutes les deux.
    toast.classList.remove('crm-toast-visible');
    void toast.offsetWidth;
    toast.classList.add('crm-toast-visible');
    minuterieToast = setTimeout(masquerToast, opts.duree || (opts.action || opts.type === 'erreur' ? 6000 : 2800));
  }
  function masquerToast() {
    clearTimeout(minuterieToast);
    if (toast) toast.classList.remove('crm-toast-visible');
  }

  /* Suit une écriture du cœur : notification de réussite (avec retour arrière si `annuler` est fourni),
     message clair en cas d'échec. Ne rejette jamais : résout { ok, valeur } ou { ok: false, erreur }. */
  function ecrire(promesse, message, annuler) {
    return Promise.resolve(promesse).then(function (valeur) {
      if (message) {
        crmToast(message, annuler ? {
          action: 'Annuler',
          surAction: function () { ecrire(Promise.resolve().then(function () { return annuler(valeur); }), 'Annulé'); }
        } : null);
      }
      return { ok: true, valeur: valeur };
    }, function (erreur) {
      crmToast((erreur && erreur.message) || 'Enregistrement impossible. Réessayez.', { type: 'erreur' });
      return { ok: false, erreur: erreur };
    });
  }

  function copier(texte, message) {
    var ok = function () { crmToast(message || 'Copié'); };
    var repli = function () {
      // Presse-papiers indisponible (page non sécurisée, vieux navigateur) : sélection d'un champ temporaire.
      var zone = document.createElement('textarea');
      zone.value = texte;
      zone.className = 'crm-hors-ecran';
      document.body.appendChild(zone);
      zone.select();
      var reussi = false;
      try { reussi = document.execCommand('copy'); } catch (e) { reussi = false; }
      zone.remove();
      if (reussi) ok(); else crmToast('Copie impossible sur ce navigateur.', { type: 'erreur' });
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texte).then(ok, repli);
    else repli();
  }

  // ───────────────────────────── Menu contextuel ─────────────────────────────

  var menu = null;

  function fermerMenu(rendreFoyer) {
    if (!menu) return;
    var m = menu;
    menu = null;
    document.removeEventListener('pointerdown', m.dehors, true);
    window.removeEventListener('resize', m.placer);
    window.removeEventListener('scroll', m.placer, true);
    m.el.remove();
    if (m.ancre) {
      m.ancre.setAttribute('aria-expanded', 'false');
      if (rendreFoyer && document.contains(m.ancre)) m.ancre.focus();
    }
  }

  /* Petit menu ancré à un bouton. elements : [{ libelle, detail?, valeur }] ; surChoix(valeur). */
  function ouvrirMenu(ancre, elements, surChoix) {
    var dejaOuvertIci = menu && menu.ancre === ancre;
    fermerMenu();
    if (dejaOuvertIci) return;
    var el = document.createElement('div');
    el.className = 'crm-racine crm-menu';
    el.setAttribute('role', 'menu');
    el.innerHTML = elements.map(function (e, i) {
      return '<button type="button" role="menuitem" class="crm-menu-item" data-i="' + i + '"><span>' + esc(e.libelle) + '</span>' +
        (e.detail ? '<small>' + esc(e.detail) + '</small>' : '') + '</button>';
    }).join('');
    document.body.appendChild(el);

    var m = { el: el, ancre: ancre };
    // Sous le bouton, aligné à droite ; au-dessus s'il n'y a pas la place. Le menu suit son bouton
    // quand la page défile et se ferme si le bouton sort de l'écran.
    m.placer = function () {
      var r = ancre.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight || !document.contains(ancre)) { fermerMenu(); return; }
      var largeur = el.offsetWidth, hauteur = el.offsetHeight;
      var gauche = Math.max(8, Math.min(window.innerWidth - largeur - 8, r.right - largeur));
      var haut = r.bottom + 6 + hauteur > window.innerHeight - 8 ? Math.max(8, r.top - hauteur - 6) : r.bottom + 6;
      el.style.left = gauche + 'px';
      el.style.top = haut + 'px';
    };
    m.placer();
    m.dehors = function (e) { if (!el.contains(e.target) && !ancre.contains(e.target)) fermerMenu(); };
    el.addEventListener('click', function (e) {
      var bouton = e.target.closest('.crm-menu-item');
      if (!bouton) return;
      var choix = elements[+bouton.dataset.i];
      fermerMenu(true);
      surChoix(choix.valeur);
    });
    el.addEventListener('keydown', function (e) {
      var items = Array.prototype.slice.call(el.querySelectorAll('.crm-menu-item'));
      var i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Tab') { fermerMenu(true); }
    });
    document.addEventListener('pointerdown', m.dehors, true);
    window.addEventListener('resize', m.placer);
    window.addEventListener('scroll', m.placer, true);
    ancre.setAttribute('aria-expanded', 'true');
    menu = m;
    el.querySelector('.crm-menu-item').focus();
  }

  function optionsReport() {
    return [1, 3, 7].map(function (n) {
      var date = pur.ajouterJours(aujourdhui(), n);
      return { libelle: n === 1 ? 'Demain' : 'Dans ' + n + ' jours', detail: dateAvecJour(date), valeur: date };
    });
  }

  // ───────────────────────────── Actions communes aux listes et à la fiche ─────────────────────────────

  function tacheDe(fiche, id) {
    for (var i = 0; i < fiche.taches.length; i++) if (fiche.taches[i].id === id) return fiche.taches[i];
    return null;
  }

  /* Reporte la prochaine action : l'échéance de la tâche si c'en est une, sinon le report de la fiche. */
  function reporterAction(cle, date) {
    var f = CRM.fiche(cle);
    if (!f || !f.action) return Promise.resolve({ ok: false });
    var message = 'Reportée au ' + dateAvecJour(date);
    if (f.action.tacheId) {
      var id = f.action.tacheId, tache = tacheDe(f, id), avant = tache && tache.echeance;
      return ecrire(CRM.reporterTache(id, date), message, avant ? function () { return CRM.reporterTache(id, avant); } : null);
    }
    var cleFiche = f.cle, reportAvant = f.crm.reporte_jusqua;
    return ecrire(CRM.reporter(cleFiche, date), message, function () { return CRM.reporter(cleFiche, reportAvant); });
  }

  // Fiches dont le « Fait » est en cours d'écriture. Certaines règles (2ᵉ rendez-vous) ne se taisent qu'une fois
  // le report enregistré : sans ce verrou, un double-clic consignerait deux notes.
  var faitEnCours = {};

  /* « Fait » : termine la tâche, ou consigne que l'action calculée a été traitée pour qu'elle se taise. */
  function faitAction(cle) {
    var f = CRM.fiche(cle);
    if (!f || !f.action) return Promise.resolve({ ok: false });
    var action = f.action, cleFiche = f.cle;
    if (action.tacheId) {
      return ecrire(CRM.terminerTache(action.tacheId), 'Tâche terminée', function () { return CRM.terminerTache(action.tacheId, false); });
    }
    if (faitEnCours[cleFiche]) return Promise.resolve({ ok: false });
    faitEnCours[cleFiche] = true;
    return ecrire(CRM.ajouterInteraction(cleFiche, { type: 'note', contenu: 'Fait : ' + action.titre }).then(function (interaction) {
      // Certaines règles ne se taisent pas après une simple note (2ᵉ rendez-vous) : on les reporte au lendemain.
      var apres = CRM.fiche(cleFiche);
      if (!apres || !apres.action || apres.action.id !== action.id) return { interaction: interaction, report: false };
      var reportAvant = apres.crm.reporte_jusqua;
      return CRM.reporter(cleFiche, pur.ajouterJours(action.echeance || aujourdhui(), 1)).then(function () {
        return { interaction: interaction, report: true, reportAvant: reportAvant };
      });
    }), 'Action traitée', function (r) {
      return CRM.supprimerInteraction(r.interaction.id).then(function () {
        if (r.report) return CRM.reporter(cleFiche, r.reportAvant);
      });
    }).then(function (r) { delete faitEnCours[cleFiche]; return r; });
  }

  // ───────────────────────────── État du panneau ─────────────────────────────

  var CLE_ATTENTE = 'crm_appel_en_attente';
  var LIBELLES_CANAL = { appel: 'Appel', whatsapp: 'WhatsApp', sms: 'SMS', email: 'E-mail' };
  var FIL_REPLIE = 12;

  var racine = null, panneau = null;
  var ui = etatNeuf();

  function etatNeuf() {
    return {
      cle: null, origine: null, chaine: null,
      scoreOuvert: false, modele: null, filComplet: false, faitesOuvertes: false,
      suite: null, perdu: null, epingleEdition: false,
      // Présence en ligne : réseaux dont le lien est en cours de modification, et message d'erreur par réseau.
      lienEdition: {}, lienErreur: {},
      // Chaleur du prospect : analyse en cours (bouton « Analyse en cours… »), et dernier message (« Analyse indisponible… »).
      analyse: false, analyseMessage: '', etudeEnvoi: false,
      brouillons: { note: '', noteAppel: '', tacheTitre: '', tacheDate: '', epingle: '', suiteTitre: '', suiteDate: '', suiteNote: '', telephone: '',
        lienGoogle: '', lienInstagram: '', lienFacebook: '' }
    };
  }

  /* L'appel (ou le message) en attente de résultat survit à un rechargement : le téléphone bascule
     sur l'application d'appel et peut recharger la page au retour. */
  function lireAttente() {
    try {
      var a = JSON.parse(sessionStorage.getItem(CLE_ATTENTE) || 'null');
      if (a && a.cle && LIBELLES_CANAL[a.type] && Date.now() - a.at < 12 * 3600000) return a;
    } catch (e) { /* stockage indisponible : pas d'attente mémorisée */ }
    return null;
  }
  function poserAttente(cle, type) {
    try { sessionStorage.setItem(CLE_ATTENTE, JSON.stringify({ cle: cle, type: type, at: Date.now() })); } catch (e) { /* idem */ }
    attenteMemoire = { cle: cle, type: type, at: Date.now() };
  }
  function effacerAttente() {
    try { sessionStorage.removeItem(CLE_ATTENTE); } catch (e) { /* idem */ }
    attenteMemoire = null;
  }
  // Repli quand sessionStorage est bloqué (navigation privée stricte) : l'attente tient au moins tant que la page vit.
  var attenteMemoire = null;
  function attentePour(fiche) {
    var a = lireAttente() || attenteMemoire;
    return a && CRM.fiche(a.cle) === fiche ? a : null;
  }

  function ficheOuverte() { return ui.cle ? CRM.fiche(ui.cle) : null; }

  // ───────────────────────────── Rendu : en-tête et actions ─────────────────────────────

  function htmlChaine() {
    var c = ui.chaine;
    if (!c) return '';
    return '<div class="crm-chaine">' +
      '<span class="crm-chaine-pos"><b>' + c.position + '</b> / ' + c.total + '</span>' +
      '<progress class="crm-jauge" max="' + c.total + '" value="' + c.position + '" aria-label="Avancement de la file"></progress>' +
      '<button type="button" class="crm-btn crm-btn-discret" data-action="chaine-passer">Passer</button>' +
      '<button type="button" class="crm-btn crm-btn-or" data-action="chaine-suivante">' +
      (c.position >= c.total ? 'Terminer' : 'Suivante') + ic('fleche', 14) + '</button></div>';
  }

  function htmlTete(f) {
    var logo = f.logo && typeof window.urlSure === 'function' ? window.urlSure(f.logo) : '';
    var avatar = logo ? '<img class="crm-avatar" src="' + logo + '" alt="" loading="lazy">'
      : '<span class="crm-avatar" aria-hidden="true">' + esc(initiales(f.nom)) + '</span>';
    var sous = lieuMetierHtml(f) || (f.gerant ? esc(f.gerant) : 'Fiche sans métier ni ville');
    return '<header class="crm-pan-tete">' + avatar +
      '<div class="crm-pan-ident"><h2 id="crmFicheNom">' + esc(f.nom) + '</h2><p>' + sous + '</p></div>' +
      '<button type="button" class="crm-icone-btn" data-action="fermer" aria-label="Fermer la fiche">' + ic('croix', 18) + '</button></header>';
  }

  var DRAPEAUX = [
    ['resilie', 'Abonnement résilié', 'croix'], ['suspendue', 'Suspendue', 'alerte'], ['enPause', 'En pause', 'horloge'],
    ['desinscrit', 'Désinscrit des e-mails', 'desinscrit'], ['dormante', 'Dormante', 'sommeil'], ['sansTelephone', 'Sans téléphone', 'sansTel']
  ];

  function htmlBadges(f) {
    var s = f.score;
    var html = '<div class="crm-badges">' + etapeHtml(f);
    if (s) {
      html += '<button type="button" class="crm-badge-score crm-n-' + esc(s.niveau) + '" data-action="score" aria-expanded="' + ui.scoreOuvert + '" aria-controls="crmRaisons">' +
        '<b>' + s.valeur + '</b>' + esc(s.libelle) + ic('chevronBas', 13) + '</button>';
    } else if (f.motifPerte) {
      html += '<span class="crm-drapeau">' + esc(f.motifPerte) + '</span>';
    }
    DRAPEAUX.forEach(function (d) {
      if (f.drapeaux[d[0]]) html += '<span class="crm-drapeau">' + ic(d[2], 12) + esc(d[1]) + '</span>';
    });
    html += '</div>';
    if (s && ui.scoreOuvert) {
      html += '<div class="crm-raisons" id="crmRaisons"><p class="crm-raisons-titre">' +
        (s.type === 'sante' ? 'Santé de la boutique, sur 100 (base 50)' : 'Chaleur de la fiche, sur 100') + '</p>';
      html += s.raisons.length ? '<ul>' + s.raisons.map(function (r) {
        return '<li><b class="' + (r.points > 0 ? 'crm-pts-plus' : 'crm-pts-moins') + '">' + (r.points > 0 ? '+' : '−') + Math.abs(r.points) + '</b>' + esc(r.texte) + '</li>';
      }).join('') + '</ul>' : '<p class="crm-vide-ligne">Aucun signal pour l\'instant.</p>';
      html += '</div>';
    }
    return html;
  }

  function boutonRapide(nom, libelle, href, action, id, principal) {
    var classes = 'crm-rapide' + (principal ? ' crm-rapide-or' : '');
    var contenu = ic(nom, 18) + '<span>' + esc(libelle) + '</span>';
    if (href) {
      var externe = /^https:/.test(href) ? ' target="_blank" rel="noopener noreferrer"' : '';
      return '<a class="' + classes + '" href="' + esc(href) + '"' + externe + ' data-action="' + action + '" data-id="' + id + '">' + contenu + '</a>';
    }
    return '<button type="button" class="' + classes + '" data-action="' + action + '"' + attrEcriture() + '>' + contenu + '</button>';
  }

  function htmlRapides(f) {
    var l = CRM.liens(f);
    var html = '<div class="crm-rapides">';
    if (l.tel) html += boutonRapide('telephone', 'Appeler', l.tel, 'contact', 'appel', true);
    if (l.whatsapp) html += boutonRapide('whatsapp', 'WhatsApp', l.whatsapp, 'contact', 'whatsapp');
    if (l.sms) html += boutonRapide('sms', 'SMS', l.sms, 'contact', 'sms');
    if (l.mail) html += boutonRapide('email', 'E-mail', l.mail, 'contact', 'email');
    html += boutonRapide('note', 'Note', null, 'aller-note') + boutonRapide('tache', 'Tâche', null, 'aller-tache') + '</div>';
    if (f.drapeaux.desinscrit && l.mail) {
      html += '<p class="crm-avis">' + ic('alerte', 14) + '<span>S\'est désinscrit des e-mails automatiques : préférez le téléphone.</span></p>';
    }
    if (f.telephone && !l.tel) {
      html += '<p class="crm-avis">' + ic('alerte', 14) + '<span>Numéro inhabituel (' + esc(f.telephone) + ') : à composer à la main.</span></p>';
    }
    return html;
  }

  // ───────────────────────────── Rendu : résultat d'appel et suite ─────────────────────────────

  function pucesDate(action, choisie, jours) {
    return jours.map(function (n) {
      var date = pur.ajouterJours(aujourdhui(), n);
      var libelle = n === 0 ? 'Aujourd\'hui' : n === 1 ? 'Demain' : '+' + n + ' j';
      return '<button type="button" class="crm-puce" data-action="' + action + '" data-id="' + date + '" aria-pressed="' + (choisie === date) + '">' + libelle + '</button>';
    }).join('');
  }

  function htmlResultat(f) {
    var attente = attentePour(f), suite = ui.suite;
    if (suite) {
      var html = '<section class="crm-resultat" id="crmResultat">' +
        '<p class="crm-resultat-ok">' + ic('coche', 15) + '<span>' + esc(suite.fait) + '</span></p>';
      if (suite.type === 'tache') {
        html += '<label class="crm-etiquette" for="crmSuiteTitre">Suite proposée : une tâche</label>' +
          '<input class="crm-champ" id="crmSuiteTitre" data-champ="suiteTitre" value="' + esc(ui.brouillons.suiteTitre) + '" maxlength="300">' +
          '<div class="crm-puces">' + pucesDate('suite-date', ui.brouillons.suiteDate, [1, 2, 7]) +
          '<input type="date" class="crm-champ crm-champ-date" data-champ="suiteDate" value="' + esc(ui.brouillons.suiteDate) + '" min="' + aujourdhui() + '" aria-label="Date de la tâche"></div>' +
          '<div class="crm-resultat-pied"><button type="button" class="crm-btn crm-btn-or" data-action="suite-creer"' + attrEcriture() + '>Créer la tâche</button>' +
          '<button type="button" class="crm-btn crm-btn-discret" data-action="suite-fermer">Non merci</button></div>';
      } else {
        html += '<label class="crm-etiquette" for="crmSuiteNote">Que retenir de l\'échange ?</label>' +
          '<textarea class="crm-champ" id="crmSuiteNote" data-champ="suiteNote" rows="3" placeholder="Ce qui a été dit, la prochaine étape convenue…">' + esc(ui.brouillons.suiteNote) + '</textarea>' +
          '<div class="crm-resultat-pied"><button type="button" class="crm-btn crm-btn-or" data-action="suite-note"' + attrEcriture() + '>Enregistrer la note</button>' +
          '<button type="button" class="crm-btn crm-btn-discret" data-action="suite-fermer">Sans note</button></div>';
      }
      return html + '</section>';
    }
    if (!attente) return '';
    if (attente.type !== 'appel') {
      return '<section class="crm-resultat crm-resultat-msg" id="crmResultat">' +
        '<p class="crm-resultat-titre">' + esc(LIBELLES_CANAL[attente.type]) + ' envoyé ?</p>' +
        '<div class="crm-resultat-pied"><button type="button" class="crm-btn crm-btn-or" data-action="envoye-oui"' + attrEcriture() + '>Oui, le consigner</button>' +
        '<button type="button" class="crm-btn crm-btn-discret" data-action="attente-annuler">Non</button></div></section>';
    }
    return '<section class="crm-resultat" id="crmResultat">' +
      '<div class="crm-resultat-tete"><p class="crm-resultat-titre">Résultat de l\'appel ?</p>' +
      '<button type="button" class="crm-lien" data-action="attente-annuler">Je n\'ai pas appelé</button></div>' +
      '<div class="crm-resultat-choix">' + CRM.RESULTATS_APPEL.map(function (r) {
        return '<button type="button" class="crm-choix" data-action="resultat" data-id="' + esc(r.id) + '"' + attrEcriture() + '>' + esc(r.libelle) + '</button>';
      }).join('') + '</div>' +
      '<input class="crm-champ" data-champ="noteAppel" value="' + esc(ui.brouillons.noteAppel) + '" placeholder="Note sur l\'appel (facultatif)" aria-label="Note sur l\'appel" maxlength="2000">' +
      (lectureSeule() ? '<p class="crm-aide">Le suivi d\'appels est inactif : ' + esc(raisonLectureSeule()) + '.</p>' : '') +
      '</section>';
  }

  var LIBELLES_URGENCE = { retard: 'En retard', aujourdhui: 'Aujourd\'hui', semaine: 'Cette semaine' };

  function htmlAction(f) {
    var a = f.action;
    if (!a) return '';
    return '<section class="crm-prochaine crm-u-' + esc(a.urgence) + '">' +
      '<p class="crm-prochaine-quand">Prochaine action <span class="crm-sep">·</span> ' + esc(LIBELLES_URGENCE[a.urgence] || '') + '</p>' +
      '<p class="crm-prochaine-titre">' + esc(a.titre) + '</p>' +
      '<p class="crm-prochaine-raison">' + esc(a.raison) + '</p>' +
      '<div class="crm-prochaine-pied"><button type="button" class="crm-btn crm-btn-or" data-action="action-fait"' + attrEcriture() + '>' + ic('coche', 14) + 'Fait</button>' +
      '<button type="button" class="crm-btn" data-action="action-reporter" aria-haspopup="menu" aria-expanded="false"' + attrEcriture() + '>' + ic('horloge', 14) + 'Reporter</button></div></section>';
  }

  // ───────────────────────────── Rendu : sections ─────────────────────────────

  function section(titre, corps, opts) {
    opts = opts || {};
    return '<section class="crm-sec"' + (opts.id ? ' id="' + opts.id + '"' : '') + '><h3 class="crm-sec-titre">' + esc(titre) +
      (opts.nb ? '<span class="crm-sec-nb">' + opts.nb + '</span>' : '') + (opts.aside || '') + '</h3>' + corps + '</section>';
  }

  function htmlModeles(f) {
    var modeles = CRM.modeles(f);
    if (!modeles.length) return '';
    var corps = '<div class="crm-modeles">' + modeles.map(function (m) {
      var ouvert = ui.modele === m.id;
      var html = '<button type="button" class="crm-modele" data-action="modele" data-id="' + esc(m.id) + '" aria-expanded="' + ouvert + '">' +
        '<span>' + esc(m.titre) + '</span>' + ic(ouvert ? 'chevronBas' : 'chevronDroit', 14) + '</button>';
      if (!ouvert) return html;
      var l = CRM.liens(f, m.texte, m.sujet);
      var canaux = '';
      if (l.whatsapp) canaux += '<a class="crm-btn" href="' + esc(l.whatsapp) + '" target="_blank" rel="noopener noreferrer" data-action="contact" data-id="whatsapp">' + ic('whatsapp', 14) + 'WhatsApp</a>';
      if (l.sms) canaux += '<a class="crm-btn" href="' + esc(l.sms) + '" data-action="contact" data-id="sms">' + ic('sms', 14) + 'SMS</a>';
      if (l.mail) canaux += '<a class="crm-btn" href="' + esc(l.mail) + '" data-action="contact" data-id="email">' + ic('email', 14) + 'E-mail</a>';
      canaux += '<button type="button" class="crm-btn" data-action="modele-copier" data-id="' + esc(m.id) + '">' + ic('copier', 14) + 'Copier</button>';
      return html + '<div class="crm-modele-corps"><p class="crm-modele-texte">' + esc(m.texte) + '</p><div class="crm-modele-canaux">' + canaux + '</div></div>';
    }).join('') + '</div>';
    return section('Modèles de message', corps);
  }

  function htmlTache(t) {
    var retard = !t.fait_at && t.echeance < aujourdhui();
    var attente = t.enAttente ? ' disabled' : '';
    return '<li class="crm-tache' + (t.fait_at ? ' crm-tache-faite' : '') + '">' +
      '<button type="button" class="crm-case" role="checkbox" aria-checked="' + !!t.fait_at + '" data-action="tache-cocher" data-id="' + esc(t.id) + '"' +
      ' aria-label="' + esc((t.fait_at ? 'Rouvrir : ' : 'Terminer : ') + t.titre) + '"' + (attente || attrEcriture()) + '>' + (t.fait_at ? ic('coche', 13) : '') + '</button>' +
      '<span class="crm-tache-txt"><span class="crm-tache-titre">' + esc(t.titre) + '</span>' +
      '<span class="crm-tache-date' + (retard ? ' crm-retard' : '') + '">' + esc(t.fait_at ? 'Terminée ' + dateRelative(t.fait_at) : echeanceLibelle(t.echeance)) + '</span></span>' +
      (t.fait_at ? '' : '<button type="button" class="crm-icone-btn" data-action="tache-reporter" data-id="' + esc(t.id) + '" aria-label="Reporter la tâche" aria-haspopup="menu" aria-expanded="false"' + (attente || attrEcriture()) + '>' + ic('horloge', 15) + '</button>') +
      '<button type="button" class="crm-icone-btn" data-action="tache-supprimer" data-id="' + esc(t.id) + '" aria-label="Supprimer la tâche"' + (attente || attrEcriture()) + '>' + ic('corbeille', 15) + '</button></li>';
  }

  function htmlTaches(f) {
    var ouvertes = f.taches.filter(function (t) { return !t.fait_at; });
    var faites = f.taches.filter(function (t) { return t.fait_at; });
    var date = ui.brouillons.tacheDate || aujourdhui();
    var corps = ouvertes.length ? '<ul class="crm-taches">' + ouvertes.map(htmlTache).join('') + '</ul>' : '';
    corps += '<div class="crm-ajout">' +
      '<input class="crm-champ" id="crmTacheTitre" data-champ="tacheTitre" value="' + esc(ui.brouillons.tacheTitre) + '" placeholder="Nouvelle tâche : rappeler, envoyer le devis…" aria-label="Titre de la nouvelle tâche" maxlength="300"' + attrEcriture() + '>' +
      '<div class="crm-puces">' + pucesDate('tache-date', date, [0, 1, 3, 7]) +
      '<input type="date" class="crm-champ crm-champ-date" data-champ="tacheDate" value="' + esc(date) + '" aria-label="Échéance"' + attrEcriture() + '>' +
      '<button type="button" class="crm-btn crm-btn-or crm-ajout-ok" data-action="tache-ajouter"' + attrEcriture() + '>' + ic('plus', 14) + 'Ajouter</button></div></div>';
    if (faites.length) {
      corps += '<button type="button" class="crm-lien crm-lien-repli" data-action="faites" aria-expanded="' + ui.faitesOuvertes + '">' +
        ic(ui.faitesOuvertes ? 'chevronBas' : 'chevronDroit', 13) + pluriel(faites.length, 'tâche terminée', 'tâches terminées') + '</button>';
      if (ui.faitesOuvertes) corps += '<ul class="crm-taches">' + faites.slice(0, 20).map(htmlTache).join('') + '</ul>';
    }
    return section('Tâches', corps, { id: 'crmSecTaches', nb: ouvertes.length });
  }

  function htmlEpingle(f) {
    var note = f.crm.note_epinglee;
    var corps;
    if (ui.epingleEdition) {
      corps = '<textarea class="crm-champ" data-champ="epingle" rows="3" maxlength="4000" aria-label="Note épinglée" placeholder="À retenir sur ce commerce : horaires pour appeler, interlocuteur, contexte…">' + esc(ui.brouillons.epingle) + '</textarea>' +
        '<div class="crm-sec-pied"><button type="button" class="crm-btn crm-btn-or" data-action="epingle-enregistrer">Enregistrer</button>' +
        '<button type="button" class="crm-btn crm-btn-discret" data-action="epingle-annuler">Annuler</button></div>';
    } else if (note) {
      corps = '<button type="button" class="crm-epingle" data-action="epingle-modifier"' + attrEcriture() + '>' + ic('epingle', 14) + '<span>' + esc(note) + '</span></button>';
    } else {
      corps = '<button type="button" class="crm-epingle crm-epingle-vide" data-action="epingle-modifier"' + attrEcriture() + '>' + ic('epingle', 14) +
        '<span>Épingler une note : elle restera visible ici, au-dessus du fil.</span></button>';
    }
    return section('Note épinglée', corps);
  }

  function ligneInfo(libelle, valeurHtml) {
    return valeurHtml ? '<div class="crm-info"><dt>' + esc(libelle) + '</dt><dd>' + valeurHtml + '</dd></div>' : '';
  }
  function copiable(affiche, valeur, message) {
    return '<button type="button" class="crm-copiable" data-action="copier" data-valeur="' + esc(valeur) + '" data-message="' + esc(message) + '" title="Copier">' +
      '<span>' + esc(affiche) + '</span>' + ic('copier', 13) + '</button>';
  }

  var LIBELLES_ORIGINE = { prospection: 'Prospection', inscription: 'Inscription commencée', audit: 'Audit terrain', demo: 'Démo créée' };
  function origineLibelle(o) {
    if (LIBELLES_ORIGINE[o]) return LIBELLES_ORIGINE[o];
    if (o.indexOf('ambassadeur ') === 0) return 'Ambassadeur ' + o.slice(12);
    return 'Source ' + o;
  }

  function estDemoPrivee(c) { return !!c && c.abonnement_actif !== true && !!c.auth_user_id; }

  function htmlTrouverNumero(f) {
    if (!f.drapeaux.sansTelephone) return '';
    var m = metierDe(f).libelle;
    var commune = f.ville || '';
    var google = 'https://www.google.com/search?q=' + encodeURIComponent([f.nom, m, commune].filter(Boolean).join(' ') + ' téléphone');
    var pages = 'https://www.pagesjaunes.fr/annuaire/chercherlespros?quoiqui=' + encodeURIComponent(f.nom) + '&ou=' + encodeURIComponent(commune);
    var html = '<div class="crm-trouver"><p class="crm-trouver-titre">' + ic('sansTel', 14) + 'Trouver le numéro</p>' +
      '<div class="crm-trouver-liens">' +
      '<a class="crm-btn" href="' + esc(google) + '" target="_blank" rel="noopener noreferrer">Google' + ic('externe', 13) + '</a>' +
      '<a class="crm-btn" href="' + esc(pages) + '" target="_blank" rel="noopener noreferrer">PagesJaunes' + ic('externe', 13) + '</a></div>';
    // Le CRM ne modifie jamais la table des commerçants : seul un prospect peut recevoir le numéro trouvé.
    if (f.prospect && !f.commercant && CRM.etat.prospection) {
      html += '<div class="crm-trouver-saisie"><input class="crm-champ" type="tel" inputmode="tel" autocomplete="off" data-champ="telephone" value="' + esc(ui.brouillons.telephone) + '" placeholder="Coller le numéro trouvé" aria-label="Numéro trouvé">' +
        '<button type="button" class="crm-btn crm-btn-or" data-action="telephone-enregistrer">Enregistrer</button></div>';
    } else if (f.commercant) {
      html += '<p class="crm-aide">Le numéro d\'une boutique se corrige depuis son compte (« Gérer le compte »).</p>';
    }
    return html + '</div>';
  }

  function htmlInfos(f) {
    var c = f.commercant, o = CRM.OFFRES[f.offre];
    var lignes = '';
    lignes += ligneInfo('Gérant', f.gerant ? esc(f.gerant) : '');
    lignes += ligneInfo('Téléphone', f.telephone ? copiable(pur.formaterTel(f.telephone), f.telephone, 'Numéro copié') : '');
    lignes += ligneInfo('E-mail', f.email ? copiable(f.email, f.email, 'E-mail copié') : '');
    lignes += ligneInfo('Adresse', f.adresse ? esc(f.adresse) : (f.ville ? esc(f.ville) : ''));
    lignes += ligneInfo('Offre', o ? esc(o.nom) + ' <span class="crm-discret">' + o.mensuel + ' €/mois + ' + o.installation + ' € d\'installation</span>' : '');
    lignes += ligneInfo('Origine', esc(f.origines.map(origineLibelle).join(', ')));
    lignes += ligneInfo('Créée le', f.creeLe ? esc(dateCourte(f.creeLe, true)) : '');
    lignes += ligneInfo('Code promo', c && c.code_promo_utilise ? '<code>' + esc(c.code_promo_utilise) + '</code>' : '');
    lignes += ligneInfo('Parrain', c && c.ambassadeur_prenom ? esc(c.ambassadeur_prenom) +
      (c.ambassadeur_code_referral ? ' <code>' + esc(c.ambassadeur_code_referral) + '</code>' : '') : '');
    var liens = '';
    if (c && f.slug) {
      liens += '<a class="crm-btn" href="/' + esc(encodeURIComponent(f.slug)) + '" target="_blank" rel="noopener">' + ic('boutique', 14) + 'Voir la boutique</a>';
      if (estDemoPrivee(c)) liens += '<button type="button" class="crm-btn" data-action="copier-apercu">' + ic('lien', 14) + 'Copier le lien d\'aperçu privé</button>';
    }
    if (c) liens += '<button type="button" class="crm-btn" data-action="gerer-compte">' + ic('personne', 14) + 'Gérer le compte</button>';
    return section('Informations', '<dl class="crm-infos">' + lignes + '</dl>' + htmlTrouverNumero(f) +
      (liens ? '<div class="crm-sec-pied">' + liens + '</div>' : ''));
  }

  // ───────────────────────────── Rendu : présence en ligne ─────────────────────────────

  var CHAMPS_LIEN = { google: 'lienGoogle', instagram: 'lienInstagram', facebook: 'lienFacebook' };
  var LIBELLES_ORIGINE_LIEN = { manuel: 'saisi', trouve: 'trouvé automatiquement', boutique: 'depuis la boutique' };

  /* Lien prêt pour un href : repassé par la validation du cœur (https uniquement), puis échappé à l'affichage. */
  function lienSur(reseau, url) { return CRM.normaliserLien(reseau, url); }

  // « @lefournil », « facebook.com/lefournil » : ce que l'on reconnaît d'un coup d'œil, pas l'adresse entière.
  function lienCourt(reseau, url) {
    var court = url.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '');
    if (reseau === 'instagram') return '@' + court.replace(/^instagram\.com\//, '');
    if (reseau === 'google') {
      // « Google Maps » seulement quand l'adresse y mène à coup sûr ; sinon ce que l'on ouvrira vraiment.
      var hote = court.split(/[/?]/)[0];
      if (CRM.estLienMaps(url)) return 'Google Maps';
      return /^google\./.test(hote) ? 'Recherche Google' : hote;
    }
    return court;
  }

  function liensInactifs() { return !lectureSeule() && !CRM.etat.liens; }
  function attrLien() {
    if (liensInactifs()) return ' disabled title="Inactif : la migration des liens n\'est pas encore appliquée"';
    return attrEcriture();
  }

  function htmlLigneLien(f, r) {
    var p = f.presence[r.id];
    var url = lienSur(r.id, p.url), recherche = /^https:\/\/www\.google\.com\//.test(p.recherche) ? p.recherche : '';
    var edition = !!ui.lienEdition[r.id], erreur = ui.lienErreur[r.id];
    var champ = CHAMPS_LIEN[r.id];
    var chercher = recherche ? '<a class="crm-btn" href="' + esc(recherche) + '" target="_blank" rel="noopener noreferrer" data-lien="chercher">' +
      ic('recherche', 13) + 'Chercher<span class="crm-sr"> ' + esc(r.libelle) + ' (nouvel onglet)</span></a>' : '';
    var html = '<li class="crm-pres' + (url ? ' crm-pres-connu' : '') + '" data-reseau="' + r.id + '">' +
      '<div class="crm-pres-tete"><span class="crm-pres-ic">' + ic(r.id, 16) + '</span>' +
      '<div class="crm-pres-txt"><b>' + esc(r.libelle) + '</b>';
    if (url) {
      html += '<small><span class="crm-pres-adresse">' + esc(lienCourt(r.id, url)) + '</span>' +
        '<span class="crm-pres-origine">' + esc(LIBELLES_ORIGINE_LIEN[p.origine] || '') + '</span></small></div>';
      if (!edition) {
        html += '<div class="crm-pres-actions">' +
          '<a class="crm-btn crm-btn-or" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" data-lien="ouvrir">Ouvrir' + ic('externe', 13) +
          '<span class="crm-sr"> ' + esc(r.libelle) + ' (nouvel onglet)</span></a>' +
          '<button type="button" class="crm-btn crm-btn-discret" data-action="lien-modifier" data-id="' + r.id + '"' + attrLien() + '>Modifier' +
          '<span class="crm-sr"> le lien ' + esc(r.libelle) + '</span></button></div>';
      }
    } else {
      html += '<small>Pas encore renseigné</small></div><div class="crm-pres-actions">' + chercher + '</div>';
    }
    html += '</div>';
    if (!url || edition) {
      html += '<div class="crm-pres-saisie"><input class="crm-champ" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="500" ' +
        'data-champ="' + champ + '" value="' + esc(ui.brouillons[champ]) + '" placeholder="' + esc(r.exemple) + '" aria-label="' + esc('Lien ' + r.libelle) + '"' +
        (erreur ? ' aria-invalid="true" aria-describedby="crmLienErreur-' + r.id + '"' : '') + attrLien() + '>' +
        '<button type="button" class="crm-btn crm-btn-or" data-action="lien-enregistrer" data-id="' + r.id + '"' + attrLien() + '>Enregistrer</button></div>';
      if (erreur) html += '<p class="crm-pres-erreur" id="crmLienErreur-' + r.id + '" role="alert">' + ic('alerte', 13) + '<span>' + esc(erreur) + '</span></p>';
      if (edition) {
        html += '<div class="crm-pres-pied">' + (url ? chercher : '') +
          (p.origine === 'manuel' ? '<button type="button" class="crm-btn crm-btn-danger" data-action="lien-effacer" data-id="' + r.id + '"' + attrLien() + '>' +
            ic('corbeille', 13) + 'Effacer<span class="crm-sr"> le lien ' + esc(r.libelle) + '</span></button>' : '') +
          '<button type="button" class="crm-btn crm-btn-discret" data-action="lien-annuler" data-id="' + r.id + '">Annuler</button></div>';
      }
    }
    return html + '</li>';
  }

  /* Fiche Google, Instagram, Facebook : le lien connu s'ouvre d'un toucher ; sinon une recherche toute prête
     et un champ pour coller le lien trouvé. Présent sur toutes les fiches. */
  function htmlPresence(f) {
    if (!f.presence) return '';
    var corps = '<ul class="crm-presence">' + CRM.RESEAUX.map(function (r) { return htmlLigneLien(f, r); }).join('') + '</ul>';
    if (liensInactifs()) {
      corps += '<p class="crm-aide crm-pres-aide">' + ic('alerte', 13) + '<span>L\'enregistrement des liens sera actif une fois la migration des liens appliquée. ' +
        'Les recherches et les liens déjà connus restent utilisables.</span></p>';
    }
    return section('Présence en ligne', corps, { id: 'crmSecPresence' });
  }

  var LIBELLES_SOURCE = { osm: 'OpenStreetMap', mairie: 'Mairie', import: 'Liste importée', manuel: 'Saisie à la main' };

  /* « Chaleur du prospect » : besoin de Marchéo et facilité à le joindre, d'après ce qui a été vu (OpenStreetMap,
     son site, sa fiche Google). À ne pas confondre avec la chaleur de la fiche (badge du haut), qui suit le suivi. */
  function htmlChaleurProspect(p) {
    var ch = CRM.chaleurProspect(p);
    if (!ch) {
      return CRM.etat.prospection ? '<p class="crm-aide crm-chal-absente" id="crmChaleurProspect">La chaleur du prospect sera active une fois la migration 20261116_crm_chaleur.sql appliquée.</p>' : '';
    }
    var enCours = ui.analyse || !!(CRM.analyseEnCours && CRM.analyseEnCours.lot.indexOf(p.id) >= 0);
    var inactif = attrEcriture();
    return '<div class="crm-chal-bloc" id="crmChaleurProspect">' +
      '<div class="crm-chal-tete"><p class="crm-etiquette">Chaleur du prospect</p>' + chaleurHtml(ch) +
        '<button type="button" class="crm-btn" data-action="chaleur-analyser"' + (enCours ? ' disabled' : inactif) + '>' + ic('baguette', 14) +
          (enCours ? 'Analyse en cours…' : p.analyse_at ? 'Réanalyser' : 'Analyser') + '</button></div>' +
      (ui.analyseMessage ? '<p class="crm-aide crm-chal-indispo" role="status">' + esc(ui.analyseMessage) + '</p>' : '') +
      '<p class="crm-etiquette">Pourquoi</p>' + raisonsChaleurHtml(ch) + etatAnalyseHtml(p, ch) +
      reglagesChaleurHtml(p, 'data-action', inactif, true) + '</div>';
  }

  /* « Étude du commerce » sur la fiche CRM d'un prospect : toujours dépliée. Sans la migration : une ligne discrète. */
  function htmlEtudeProspect(p) {
    if (!CRM.etat.etude) {
      return CRM.etat.prospection ? '<p class="crm-aide crm-etude-absente" id="crmEtudeProspect">Étude indisponible : la migration 20261116_crm_etude.sql n\'est pas encore appliquée.</p>' : '';
    }
    return etudeHtml(p, { id: 'crmEtudeProspect', attribut: 'data-action', inactif: attrEcriture(), avecAngle: true, envoi: ui.etudeEnvoi });
  }
  function demanderEtudeFiche(f, retirer) {
    var p = f && f.prospect;
    if (!p || ui.etudeEnvoi) return;
    var cle = ui.cle;
    ui.etudeEnvoi = true;
    rendre();
    ecrire(retirer ? CRM.retirerEtudes([p.id]) : CRM.demanderEtudes([p.id], { forcer: true }),
      retirer ? 'Retiré de la file d\'étude' : 'Étude demandée : elle passe environ toutes les heures').then(function () {
      if (ui.cle !== cle) return;
      ui.etudeEnvoi = false;
      rendre();
    });
  }

  function analyserProspectFiche(f) {
    var p = f && f.prospect;
    if (!p || ui.analyse) return;
    var cle = ui.cle;
    ui.analyse = true;
    ui.analyseMessage = '';
    rendre();
    CRM.analyserProspects([p.id], { forcer: true }).then(function (bilan) {
      if (ui.cle !== cle) return;
      ui.analyse = false;
      ui.analyseMessage = bilan.message || (bilan.indisponible ? MESSAGE_ANALYSE_INDISPONIBLE : bilan.echecs ? 'L\'analyse de ce prospect n\'a pas abouti. Réessayez dans un instant.' : '');
      if (!bilan.indisponible && !bilan.echecs && !bilan.restants) {
        crmToast(bilan.google === 'sans_cle' ? 'Prospect analysé (Google non interrogé : clé absente)'
          : bilan.quota ? 'Prospect analysé (Google non interrogé : plafond du jour atteint)' : 'Prospect analysé');
      }
      rendre();
    });
  }
  var MESSAGE_ANALYSE_INDISPONIBLE = 'Analyse indisponible pour l\'instant. Les signaux d\'OpenStreetMap restent pris en compte.';

  function reglerChaleur(f, champ, valeur) {
    var p = f && f.prospect;
    if (!p) return;
    // Retoucher le bouton enfoncé des réseaux remet à « inconnu ».
    if (champ === 'reseaux_actifs' && p.reseaux_actifs === valeur) valeur = null;
    var champs = {};
    champs[champ] = valeur || null;
    ecrire(CRM.majProspect(p.id, champs), champ === 'chaleur_manuelle' ? (valeur ? 'Chaleur réglée à la main' : 'Chaleur automatique') : 'Activité des réseaux notée');
  }

  function htmlProspection(f) {
    var p = f.prospect;
    if (!p) return '';
    var resultat = null;
    CRM.RESULTATS_PROSPECT.forEach(function (r) { if (r.id === p.resultat) resultat = r; });
    var lignes = '';
    lignes += ligneInfo('Résultat', resultat ? '<span class="crm-pastille crm-pro-' + esc(resultat.id) + '">' + esc(resultat.libelle) + '</span>' : '<span class="crm-discret">Pas encore appelé</span>');
    lignes += ligneInfo('Dernier appel', p.appele_at ? esc(dateRelative(p.appele_at)) +
      (p.nb_appels > 1 ? ' <span class="crm-discret">' + esc(pluriel(p.nb_appels, 'appel')) + '</span>' : '') : '');
    lignes += ligneInfo('Rappel prévu', p.rappel_le ? esc(dateAvecJour(p.rappel_le)) : '');
    lignes += ligneInfo('Liste', p.liste ? esc(p.liste) : '');
    lignes += ligneInfo('Source', esc(LIBELLES_SOURCE[p.source] || p.source || ''));
    lignes += ligneInfo('Remarque', p.remarque ? esc(p.remarque) : '');
    var corps = htmlChaleurProspect(p) + htmlEtudeProspect(p) + '<dl class="crm-infos">' + lignes + '</dl>';
    if (p.note) corps += '<div class="crm-citation"><p class="crm-etiquette">Note d\'appel</p><p>' + esc(p.note) + '</p></div>';
    if (p.recommandation) corps += '<div class="crm-citation crm-citation-or"><p class="crm-etiquette">Recommandation obtenue</p><p>' + esc(p.recommandation) + '</p></div>';
    corps += '<div class="crm-sec-pied"><a class="crm-btn" href="#crm/prospection">' + ic('telephone', 14) + 'Ouvrir la prospection</a></div>';
    return section('Prospection', corps);
  }

  var LIBELLES_TEMPERATURE = { froid: 'Froid', curieux: 'Curieux', interesse: 'Intéressé', chaud: 'Chaud', autre: 'Autre' };
  var LIBELLES_SCORE_AUDIT = [['vg', 'Visibilité Google'], ['gc', 'Gestion des commandes'], ['mo', 'Mise en avant de l\'offre'], ['fi', 'Fidélisation'], ['global', 'Note globale']];

  function htmlAudit(f) {
    var a = f.audit;
    if (!a) return '';
    var d = a.data || {}, scores = a.scores || {};
    var lignes = '';
    lignes += ligneInfo('Réalisé le', esc(dateCourte(a.created_at, true)) + (a.mode ? ' <span class="crm-discret">audit ' + esc(a.mode) + '</span>' : ''));
    lignes += ligneInfo('Température', a.temperature ? esc(LIBELLES_TEMPERATURE[a.temperature] || a.temperature) : '');
    lignes += ligneInfo('2ᵉ rendez-vous', a.rdv2_date ? esc(dateAvecJour(String(a.rdv2_date).slice(0, 10))) + (d.r2_heure ? ' à ' + esc(d.r2_heure) : '') : '');
    lignes += ligneInfo('Responsable', d.responsable ? esc(d.responsable) : '');
    lignes += ligneInfo('Note Google', d.note_google ? esc(d.note_google) : '');
    var jauges = LIBELLES_SCORE_AUDIT.map(function (s) {
      var v = Number(scores[s[0]]);
      if (!isFinite(v)) return '';
      v = Math.max(0, Math.min(10, v));
      return '<div class="crm-mesure' + (s[0] === 'global' ? ' crm-mesure-globale' : '') + '"><span>' + esc(s[1]) + '</span>' +
        '<progress class="crm-jauge" max="10" value="' + v + '"></progress><b>' + String(Math.round(v * 10) / 10).replace('.', ',') + '</b></div>';
    }).join('');
    var corps = '<dl class="crm-infos">' + lignes + '</dl>' + (jauges ? '<div class="crm-mesures">' + jauges + '</div>' : '');
    if (Number(a.manque_eur) > 0) corps += '<p class="crm-manque">Manque à gagner estimé : <b>' + esc(euros(a.manque_eur)) + '/mois</b></p>';
    if (d.accroche) corps += '<div class="crm-citation"><p class="crm-etiquette">Accroche</p><p>' + esc(d.accroche) + '</p></div>';
    if (d.pj_objections) corps += '<div class="crm-citation"><p class="crm-etiquette">Objections</p><p>' + esc(d.pj_objections) + '</p></div>';
    return section('Audit terrain', corps);
  }

  function ouiNon(vrai, oui, non) {
    return '<span class="crm-etat' + (vrai ? ' crm-etat-oui' : '') + '">' + ic(vrai ? 'coche' : 'croix', 12) + esc(vrai ? oui : non) + '</span>';
  }

  function htmlSignaux(f) {
    var c = f.commercant, s = f.signaux;
    if (!c) return '';
    var enLigne = c.abonnement_actif === true;
    var visites = s.joursVisite14 ? pluriel(s.joursVisite14, 'jour') + ' sur 14' : 'Aucune sur 14 jours';
    if (s.derniereVisite) visites += ' <span class="crm-discret">dernière ' + esc(dateRelative(s.derniereVisite)) + '</span>';
    var commandes = s.commandes30 ? pluriel(s.commandes30, 'commande') + ' <span class="crm-discret">' + esc(euros(s.ca30)) + '</span>' : 'Aucune sur 30 jours';
    var suivi;
    if (!f.relancesSuivies) {
      suivi = '<span class="crm-discret" title="Démo créée avant la mise en place des e-mails automatiques">non suivi</span>';
    } else {
      suivi = '<span class="crm-etapes-suivi">' + [['j0', 'J0'], ['j1', 'J+1'], ['j3', 'J+3'], ['j7', 'J+7']].map(function (e) {
        var envoye = f.relances[e[0]];
        return '<span class="crm-suivi' + (envoye ? ' crm-suivi-envoye' : '') + '" title="' + esc(envoye ? 'Envoyé le ' + dateCourte(envoye) : 'Pas envoyé') + '">' + e[1] + '</span>';
      }).join('') + '</span>';
    }
    var lignes = ligneInfo(enLigne ? 'Visites de sa boutique' : 'Visites de sa démo', visites) +
      ligneInfo('Commandes', commandes) +
      ligneInfo('E-mails automatiques', suivi) +
      ligneInfo('Paiement', ouiNon(!!c.stripe_customer_id, 'Compte Stripe créé', 'Pas de compte Stripe')) +
      ligneInfo('Encaissement', ouiNon(!!c.stripe_connect_actif, 'Branché', 'Pas branché'));
    return section('Signaux', '<dl class="crm-infos">' + lignes + '</dl>');
  }

  var ICONES_FIL = {
    note: 'note', appel: 'telephone', email: 'email', sms: 'sms', whatsapp: 'whatsapp', rdv: 'calendrier', visite: 'lieu', etape: 'drapeau',
    inscription: 'personne', audit: 'audit', prospection: 'telephone', demo: 'boutique', email_auto: 'email', signalee: 'alerte',
    desinscription: 'desinscrit', visite_demo: 'oeil', partage: 'partage', paiement: 'carte', commande: 'commande',
    mise_en_ligne: 'coche', resiliation: 'croix'
  };

  function htmlFil(f) {
    var entrees = CRM.fil(f);
    var visibles = ui.filComplet ? entrees : entrees.slice(0, FIL_REPLIE);
    var corps = '<div class="crm-note-saisie"><textarea class="crm-champ" id="crmNote" data-champ="note" rows="2" maxlength="8000" placeholder="Écrire une note…" aria-label="Nouvelle note"' + attrEcriture() + '>' + esc(ui.brouillons.note) + '</textarea>' +
      '<div class="crm-note-pied"><span class="crm-aide">' + (lectureSeule() ? 'Notes inactives : ' + esc(raisonLectureSeule()) + '.' : 'Ctrl + Entrée pour enregistrer') + '</span>' +
      '<button type="button" class="crm-btn crm-btn-or" data-action="note-enregistrer"' + attrEcriture() + '>Enregistrer la note</button></div></div>';
    if (!entrees.length) {
      corps += '<p class="crm-vide-ligne">Rien encore dans le fil. La première note ou le premier appel apparaîtra ici.</p>';
    } else {
      corps += '<ol class="crm-fil">' + visibles.map(function (e) {
        var quand = dateRelative(e.date) + (e.auto ? '' : ', ' + heureCourte(e.date));
        var complet = pur.versDate(e.date);
        return '<li class="crm-fil-ligne' + (e.auto ? ' crm-fil-auto' : '') + '">' +
          '<span class="crm-fil-ic">' + ic(ICONES_FIL[e.type] || 'note', 13) + '</span>' +
          '<div class="crm-fil-corps"><p class="crm-fil-titre">' + esc(e.titre) +
          '<time title="' + esc(complet ? complet.toLocaleString('fr-FR') : '') + '">' + esc(quand) + '</time></p>' +
          (e.detail ? '<p class="crm-fil-detail">' + esc(e.detail) + '</p>' : '') + '</div>' +
          (e.supprimable ? '<button type="button" class="crm-icone-btn crm-fil-suppr" data-action="fil-supprimer" data-id="' + esc(e.id) + '" aria-label="Supprimer : ' + esc(e.titre) + '"' +
            (String(e.id).indexOf('provisoire-') === 0 ? ' disabled' : attrEcriture()) + '>' + ic('corbeille', 14) + '</button>' : '') +
          '</li>';
      }).join('') + '</ol>';
      if (entrees.length > FIL_REPLIE) {
        corps += '<button type="button" class="crm-lien crm-lien-repli" data-action="fil-tout" aria-expanded="' + ui.filComplet + '">' +
          ic(ui.filComplet ? 'chevronBas' : 'chevronDroit', 13) + (ui.filComplet ? 'Réduire le fil' : 'Voir tout le fil (' + entrees.length + ')') + '</button>';
      }
    }
    return section('Fil d\'activité', corps, { id: 'crmSecFil' });
  }

  function htmlBas(f) {
    if (f.etape !== 'perdu') {
      return '<div class="crm-bas"><button type="button" class="crm-btn crm-btn-danger" data-action="perdu-ouvrir"' + attrEcriture() + '>Marquer perdu</button>' +
        '<p class="crm-aide">La fiche quitte le pipeline. Elle reste consultable dans « Perdus » et peut être rouverte.</p></div>';
    }
    if (f.crm.perdu_at) {
      return '<div class="crm-bas"><button type="button" class="crm-btn" data-action="rouvrir"' + attrEcriture() + '>' + ic('rouvrir', 14) + 'Rouvrir la fiche</button>' +
        '<p class="crm-aide">Marquée perdue ' + esc(dateRelative(f.crm.perdu_at)) + (f.crm.motif_perte ? ' : ' + esc(f.crm.motif_perte.toLowerCase()) : '') + '.</p></div>';
    }
    return '<div class="crm-bas"><p class="crm-aide">Perdue par résiliation de l\'abonnement. Elle reviendra d\'elle-même si la boutique est remise en ligne.</p></div>';
  }

  function htmlFeuillePerdu() {
    if (!ui.perdu) return '';
    return '<div class="crm-feuille-voile" data-action="perdu-fermer"></div>' +
      '<div class="crm-feuille" role="dialog" aria-modal="true" aria-labelledby="crmPerduTitre">' +
      '<h3 id="crmPerduTitre">Marquer cette fiche comme perdue</h3>' +
      '<p class="crm-aide">Un toucher sur le motif suffit.</p>' +
      '<div class="crm-feuille-choix">' + CRM.MOTIFS_PERTE.map(function (m) {
        return '<button type="button" class="crm-choix' + (ui.perdu.suggere === m ? ' crm-choix-suggere' : '') + '" data-action="perdu-motif" data-id="' + esc(m) + '">' + esc(m) + '</button>';
      }).join('') + '</div>' +
      '<label class="crm-coche"><input type="checkbox" data-champ="perduRecontact"' + (ui.perdu.recontact ? ' checked' : '') + '><span>Créer la tâche « Recontacter dans 90 jours »</span></label>' +
      '<button type="button" class="crm-btn crm-btn-discret crm-feuille-annuler" data-action="perdu-fermer">Annuler</button></div>';
  }

  function htmlFiche(f) {
    return htmlChaine() + htmlTete(f) +
      '<div class="crm-pan-corps">' +
      '<div class="crm-pan-haut">' + htmlBadges(f) + htmlRapides(f) + htmlResultat(f) + htmlAction(f) + '</div>' +
      htmlModeles(f) + htmlTaches(f) + htmlEpingle(f) + htmlInfos(f) + htmlPresence(f) + htmlProspection(f) + htmlAudit(f) + htmlSignaux(f) + htmlFil(f) + htmlBas(f) +
      '</div>' + htmlFeuillePerdu();
  }

  // ───────────────────────────── Rendu : cycle de vie ─────────────────────────────

  function cleFoyer(el) {
    if (!el || !panneau || !panneau.contains(el)) return null;
    if (el.dataset.champ) return '[data-champ="' + el.dataset.champ + '"]';
    if (el.dataset.action) return '[data-action="' + el.dataset.action + '"]' + (el.dataset.id ? '[data-id="' + el.dataset.id.replace(/["\\]/g, '\\$&') + '"]' : '');
    return null;
  }

  /* Redessine le panneau en gardant la position de lecture, le champ en cours et sa sélection. */
  function rendre() {
    if (!panneau || !ui.cle) return;
    var f = ficheOuverte();
    if (!f) { demanderFermeture(); return; }
    ui.cle = f.cle;
    var corps = panneau.querySelector('.crm-pan-corps');
    var haut = corps ? corps.scrollTop : 0;
    var actif = document.activeElement;
    var foyer = cleFoyer(actif);
    var selection = foyer && actif.selectionStart != null && actif.type !== 'date' && actif.type !== 'checkbox'
      ? [actif.selectionStart, actif.selectionEnd] : null;
    panneau.innerHTML = htmlFiche(f);
    panneau.querySelector('.crm-pan-corps').scrollTop = haut;
    if (foyer) {
      var cible = panneau.querySelector(foyer);
      if (cible && !cible.disabled) {
        cible.focus({ preventScroll: true });
        if (selection) { try { cible.setSelectionRange(selection[0], selection[1]); } catch (e) { /* champ sans sélection */ } }
      } else panneau.focus({ preventScroll: true });
    }
  }

  function construire() {
    if (racine) return;
    racine = document.createElement('div');
    racine.className = 'crm-racine crm-fiche';
    racine.hidden = true;
    racine.innerHTML = '<div class="crm-voile" data-action="fermer"></div>' +
      '<aside class="crm-panneau" role="dialog" aria-modal="true" aria-labelledby="crmFicheNom" tabindex="-1"></aside>';
    document.body.appendChild(racine);
    panneau = racine.querySelector('.crm-panneau');
    racine.addEventListener('click', surClic);
    racine.addEventListener('input', surSaisie);
    racine.addEventListener('change', surSaisie);
    racine.addEventListener('keydown', surTouchePanneau);
  }

  function defiler(selecteur, foyer) {
    var el = panneau.querySelector(selecteur);
    if (!el) return;
    var doux = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    el.scrollIntoView({ block: 'center', behavior: doux ? 'smooth' : 'auto' });
    var champ = foyer && panneau.querySelector(foyer);
    if (champ && !champ.disabled) champ.focus({ preventScroll: true });
  }

  /* opts : { origine (élément à qui rendre le focus), attente ('appel' | 'whatsapp' | 'sms' | 'email'),
     chaine ({ position, total, suivante(), passer() }) pour le mode Enchaîner }. */
  function ouvrir(cle, opts) {
    opts = opts || {};
    var f = CRM.fiche(cle);
    if (!f) return false;
    construire();
    // Pendant le glissement de fermeture, le panneau est encore dans la page mais n'est plus « ouvert ».
    var dejaOuvert = !racine.hidden && racine.classList.contains('crm-fiche-ouverte');
    var origine = dejaOuvert ? ui.origine : (opts.origine || document.activeElement);
    ui = etatNeuf();
    ui.cle = f.cle;
    ui.origine = origine;
    ui.chaine = opts.chaine || null;
    if (opts.attente) poserAttente(f.cle, opts.attente);
    racine.hidden = false;
    document.documentElement.classList.add('crm-fige');
    panneau.innerHTML = htmlFiche(f);
    panneau.querySelector('.crm-pan-corps').scrollTop = 0;
    if (!dejaOuvert) {
      // L'état de départ doit être peint avant d'ajouter la classe, sinon la transition ne joue pas.
      void racine.offsetWidth;
      racine.classList.add('crm-fiche-ouverte');
    }
    panneau.focus({ preventScroll: true });
    return true;
  }

  function fermer() {
    if (!racine || racine.hidden) return;
    fermerMenu();
    var origine = ui.origine;
    ui = etatNeuf();
    racine.classList.remove('crm-fiche-ouverte');
    document.documentElement.classList.remove('crm-fige');
    var cache = function () { if (!ui.cle) { racine.hidden = true; panneau.innerHTML = ''; } };
    // On laisse au panneau le temps de glisser ; sans animation, on masque tout de suite.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) cache();
    else setTimeout(cache, 200);
    if (origine && document.contains(origine) && typeof origine.focus === 'function') origine.focus({ preventScroll: true });
  }

  /* La fermeture demandée par l'utilisateur passe par les vues, qui tiennent l'historique du navigateur. */
  function demanderFermeture() {
    if (typeof api.surDemandeFermeture === 'function') api.surDemandeFermeture();
    else fermer();
  }

  // ───────────────────────────── Événements ─────────────────────────────

  function surSaisie(e) {
    var champ = e.target.dataset && e.target.dataset.champ;
    if (!champ) return;
    if (champ === 'perduRecontact') { if (ui.perdu) ui.perdu.recontact = e.target.checked; return; }
    ui.brouillons[champ] = e.target.value;
    // Seulement sur une vraie frappe : redessiner le panneau fait partir un « change » du champ remplacé,
    // qui effacerait l'erreur que l'on vient d'afficher.
    if (e.type === 'input' && champ.indexOf('lien') === 0) effacerErreurLien(e.target);
    // Changer la date à la main doit aussi mettre à jour les puces « Demain », « +3 j »…
    if (e.type === 'change' && (champ === 'tacheDate' || champ === 'suiteDate')) rendre();
  }

  function focusables() {
    var zone = ui.perdu ? panneau.querySelector('.crm-feuille') : panneau;
    return Array.prototype.filter.call(zone.querySelectorAll('a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])'), function (el) {
      return !el.disabled && el.offsetParent !== null;
    });
  }

  function surTouchePanneau(e) {
    if (e.key === 'Tab') {
      // Focus piégé dans le panneau (ou dans la feuille « Marquer perdu » quand elle est ouverte).
      var liste = focusables();
      if (!liste.length) { e.preventDefault(); return; }
      var premier = liste[0], dernier = liste[liste.length - 1];
      if (e.shiftKey && (document.activeElement === premier || document.activeElement === panneau)) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
      return;
    }
    if (e.key !== 'Enter') return;
    var champ = e.target.dataset && e.target.dataset.champ;
    if (champ === 'tacheTitre') { e.preventDefault(); ajouterTache(); }
    else if (champ === 'suiteTitre') { e.preventDefault(); creerSuite(); }
    else if (champ === 'telephone') { e.preventDefault(); enregistrerTelephone(); }
    else if (reseauDuChamp(champ)) { e.preventDefault(); enregistrerLien(reseauDuChamp(champ)); }
    else if ((champ === 'note' || champ === 'suiteNote' || champ === 'epingle') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (champ === 'note') enregistrerNote(); else if (champ === 'suiteNote') enregistrerNoteSuite(); else enregistrerEpingle();
    }
  }

  /* Échap ferme, dans l'ordre : le menu, la feuille « Marquer perdu », l'édition en cours, la fiche. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (menu) { e.preventDefault(); fermerMenu(true); return; }
    if (!racine || racine.hidden || !ui.cle) return;
    e.preventDefault();
    if (ui.perdu) { fermerPerdu(); return; }
    if (ui.epingleEdition) { ui.epingleEdition = false; rendre(); return; }
    if (Object.keys(ui.lienEdition).length) {
      // Le focus revient sur la ligne que l'on quittait (celle du champ actif, sinon la première en édition).
      var actif = document.activeElement, ligne = actif && actif.closest ? actif.closest('.crm-pres[data-reseau]') : null;
      var idLien = ligne ? ligne.dataset.reseau : Object.keys(ui.lienEdition)[0];
      ui.lienEdition = {}; ui.lienErreur = {}; rendre(); foyerLien(idLien); return;
    }
    demanderFermeture();
  });

  function surClic(e) {
    var el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    var f = ficheOuverte();
    var id = el.dataset.id;
    switch (el.dataset.action) {
      case 'fermer': demanderFermeture(); break;
      case 'score': ui.scoreOuvert = !ui.scoreOuvert; rendre(); break;
      case 'contact': if (f) surContact(f, id); break;
      case 'aller-note': defiler('#crmSecFil', '#crmNote'); break;
      case 'aller-tache': defiler('#crmSecTaches', '#crmTacheTitre'); break;
      case 'resultat': if (f) consignerResultat(f, id); break;
      case 'envoye-oui': if (f) consignerEnvoi(f); break;
      case 'attente-annuler': effacerAttente(); rendre(); break;
      case 'suite-date': ui.brouillons.suiteDate = id; rendre(); break;
      case 'suite-creer': creerSuite(); break;
      case 'suite-note': enregistrerNoteSuite(); break;
      case 'suite-fermer': terminerSuite(); break;
      case 'action-fait': if (f) faitAction(f.cle).then(function (r) { if (r.ok) apresTraitement(); }); break;
      case 'action-reporter':
        if (f) ouvrirMenu(el, optionsReport(), function (date) { reporterAction(f.cle, date).then(function (r) { if (r.ok) apresTraitement(); }); });
        break;
      case 'modele': ui.modele = ui.modele === id ? null : id; rendre(); break;
      case 'modele-copier': if (f) copierModele(f, id); break;
      case 'tache-date': ui.brouillons.tacheDate = id; rendre(); break;
      case 'tache-ajouter': ajouterTache(); break;
      case 'tache-cocher': if (f) cocherTache(f, id); break;
      case 'tache-reporter': if (f) menuReporterTache(f, id, el); break;
      case 'tache-supprimer': if (f) supprimerTache(f, id); break;
      case 'faites': ui.faitesOuvertes = !ui.faitesOuvertes; rendre(); break;
      case 'epingle-modifier': ui.epingleEdition = true; ui.brouillons.epingle = (f && f.crm.note_epinglee) || ''; rendre(); defiler('[data-champ="epingle"]', '[data-champ="epingle"]'); break;
      case 'epingle-annuler': ui.epingleEdition = false; rendre(); break;
      case 'epingle-enregistrer': enregistrerEpingle(); break;
      case 'copier': copier(el.dataset.valeur, el.dataset.message); break;
      case 'copier-apercu': if (f) copierApercu(f); break;
      case 'gerer-compte': if (f) gererCompte(f); break;
      case 'telephone-enregistrer': enregistrerTelephone(); break;
      case 'lien-modifier': if (f) modifierLien(f, id); break;
      case 'lien-annuler': annulerLien(id); break;
      case 'lien-enregistrer': enregistrerLien(id); break;
      case 'lien-effacer': if (f) effacerLien(f, id); break;
      case 'chaleur-analyser': if (f) analyserProspectFiche(f); break;
      case 'etude-demander': if (f) demanderEtudeFiche(f, false); break;
      case 'etude-retirer': if (f) demanderEtudeFiche(f, true); break;
      case 'chaleur-manuelle': if (f) reglerChaleur(f, 'chaleur_manuelle', id); break;
      case 'reseaux-actifs': if (f) reglerChaleur(f, 'reseaux_actifs', id); break;
      case 'note-enregistrer': enregistrerNote(); break;
      case 'fil-supprimer': if (f) supprimerInteraction(f, id); break;
      case 'fil-tout': ui.filComplet = !ui.filComplet; rendre(); break;
      case 'perdu-ouvrir': ouvrirPerdu(null); break;
      case 'perdu-fermer': fermerPerdu(); break;
      case 'perdu-motif': if (f) marquerPerdu(f, id); break;
      case 'rouvrir': if (f) rouvrir(f); break;
      case 'chaine-suivante': if (ui.chaine) ui.chaine.suivante(); break;
      case 'chaine-passer': if (ui.chaine) ui.chaine.passer(); break;
    }
  }

  // ───────────────────────────── Appels, messages et leur suite ─────────────────────────────

  /* Le lien (tel:, wa.me, sms:, mailto:) s'ouvre tout seul ; on affiche tout de suite la question
     « Résultat ? » sans attendre le retour sur la page, que certains téléphones ne signalent pas. */
  function surContact(f, type) {
    ui.suite = null;
    poserAttente(f.cle, type);
    rendre();
    defiler('#crmResultat');
  }

  function consignerResultat(f, id) {
    var resultat = null;
    CRM.RESULTATS_APPEL.forEach(function (r) { if (r.id === id) resultat = r; });
    if (!resultat) return;
    var cle = f.cle, note = ui.brouillons.noteAppel.trim();
    var fait = 'Appel consigné : ' + resultat.libelle.toLowerCase();
    effacerAttente();
    ui.brouillons.noteAppel = '';
    var suite = resultat.suite;
    if (suite && suite.type === 'tache') {
      ui.suite = { type: 'tache', fait: fait };
      ui.brouillons.suiteTitre = suite.titre;
      ui.brouillons.suiteDate = suite.jours == null ? '' : pur.ajouterJours(aujourdhui(), suite.jours);
    } else if (suite && suite.type === 'perdu') {
      ouvrirPerdu('Pas intéressé', true);
    } else if (!note) {
      ui.suite = { type: 'note', fait: fait };
      ui.brouillons.suiteNote = '';
    }
    var sansSuite = !ui.suite && !ui.perdu;
    ecrire(CRM.ajouterInteraction(cle, { type: 'appel', resultat: id, contenu: note }), 'Appel consigné', function (interaction) {
      return CRM.supprimerInteraction(interaction.id);
    }).then(function (r) {
      if (r.ok) { if (sansSuite) apresTraitement(); return; }
      // Échec : on revient à la question, avec la note déjà tapée.
      if (ui.cle === cle) {
        ui.suite = null; ui.perdu = null;
        ui.brouillons.noteAppel = note;
        poserAttente(cle, 'appel');
        rendre();
      }
    });
    rendre();
    if (ui.suite) defiler('#crmResultat', ui.suite.type === 'note' ? '#crmSuiteNote' : (ui.brouillons.suiteDate ? null : '[data-champ="suiteDate"]'));
  }

  function consignerEnvoi(f) {
    var attente = attentePour(f);
    if (!attente) return;
    var cle = f.cle, type = attente.type;
    effacerAttente();
    ecrire(CRM.ajouterInteraction(cle, { type: type }), LIBELLES_CANAL[type] + ' consigné', function (interaction) {
      return CRM.supprimerInteraction(interaction.id);
    }).then(function (r) {
      if (r.ok) apresTraitement();
      else if (ui.cle === cle) { poserAttente(cle, type); rendre(); }
    });
    rendre();
  }

  function creerSuite() {
    var f = ficheOuverte();
    if (!f || !ui.suite) return;
    var titre = ui.brouillons.suiteTitre.trim(), date = ui.brouillons.suiteDate;
    if (!titre) { crmToast('Donnez un titre à la tâche.', { type: 'erreur' }); return; }
    if (!date) { crmToast('Choisissez la date.', { type: 'erreur' }); defiler('#crmResultat', '[data-champ="suiteDate"]'); return; }
    var cle = f.cle, suite = ui.suite;
    ui.suite = null;
    ecrire(CRM.ajouterTache(cle, { titre: titre, echeance: date }), 'Tâche créée pour ' + echeanceLibelle(date).toLowerCase(), function (tache) {
      return CRM.supprimerTache(tache.id);
    }).then(function (r) {
      if (r.ok) apresTraitement();
      else if (ui.cle === cle) { ui.suite = suite; rendre(); }
    });
    rendre();
  }

  function enregistrerNoteSuite() {
    var f = ficheOuverte();
    var texte = ui.brouillons.suiteNote.trim();
    if (!f || !ui.suite) return;
    if (!texte) { terminerSuite(); return; }
    var cle = f.cle, suite = ui.suite;
    ui.suite = null;
    ecrire(CRM.ajouterInteraction(cle, { type: 'note', contenu: texte }), 'Note enregistrée', function (interaction) {
      return CRM.supprimerInteraction(interaction.id);
    }).then(function (r) {
      if (r.ok) { ui.brouillons.suiteNote = ''; apresTraitement(); }
      else if (ui.cle === cle) { ui.suite = suite; rendre(); }
    });
    rendre();
  }

  function terminerSuite() {
    ui.suite = null;
    rendre();
    apresTraitement();
  }

  /* En mode Enchaîner, une fiche traitée laisse la place à la suivante, après un court instant
     pour que l'on voie ce qui vient d'être consigné. */
  function apresTraitement() {
    var chaine = ui.chaine, cle = ui.cle;
    if (!chaine) return;
    setTimeout(function () {
      if (ui.cle === cle && ui.chaine === chaine && !ui.suite && !ui.perdu) chaine.suivante();
    }, 500);
  }

  // ───────────────────────────── Notes, tâches, note épinglée ─────────────────────────────

  function enregistrerNote() {
    var f = ficheOuverte();
    var texte = ui.brouillons.note.trim();
    if (!f) return;
    if (!texte) { defiler('#crmSecFil', '#crmNote'); return; }
    var cle = f.cle;
    ui.brouillons.note = '';
    ecrire(CRM.ajouterInteraction(cle, { type: 'note', contenu: texte }), 'Note enregistrée', function (interaction) {
      return CRM.supprimerInteraction(interaction.id);
    }).then(function (r) {
      // Brouillon rendu si l'envoi échoue, sauf si l'utilisateur a déjà recommencé à écrire.
      if (!r.ok && ui.cle === cle && !ui.brouillons.note) { ui.brouillons.note = texte; rendre(); }
    });
    rendre();
  }

  function ajouterTache() {
    var f = ficheOuverte();
    var titre = ui.brouillons.tacheTitre.trim();
    if (!f) return;
    if (!titre) { defiler('#crmSecTaches', '#crmTacheTitre'); return; }
    var cle = f.cle, date = ui.brouillons.tacheDate || aujourdhui();
    ui.brouillons.tacheTitre = '';
    ecrire(CRM.ajouterTache(cle, { titre: titre, echeance: date }), 'Tâche ajoutée', function (tache) {
      return CRM.supprimerTache(tache.id);
    }).then(function (r) {
      if (!r.ok && ui.cle === cle && !ui.brouillons.tacheTitre) { ui.brouillons.tacheTitre = titre; rendre(); }
    });
    rendre();
  }

  function cocherTache(f, id) {
    var t = tacheDe(f, id);
    if (!t) return;
    var terminer = !t.fait_at;
    ecrire(CRM.terminerTache(id, terminer), terminer ? 'Tâche terminée' : 'Tâche rouverte', function () {
      return CRM.terminerTache(id, !terminer);
    }).then(function (r) { if (r.ok && terminer) apresTraitement(); });
  }

  function menuReporterTache(f, id, ancre) {
    var t = tacheDe(f, id);
    if (!t) return;
    ouvrirMenu(ancre, optionsReport(), function (date) {
      var avant = t.echeance;
      ecrire(CRM.reporterTache(id, date), 'Tâche reportée au ' + dateAvecJour(date), function () { return CRM.reporterTache(id, avant); });
    });
  }

  function supprimerTache(f, id) {
    var t = tacheDe(f, id);
    if (!t) return;
    var cle = f.cle;
    ecrire(CRM.supprimerTache(id), 'Tâche supprimée', function () {
      return CRM.ajouterTache(cle, { titre: t.titre, echeance: t.echeance }).then(function (nouvelle) {
        if (t.fait_at) return CRM.terminerTache(nouvelle.id);
      });
    });
  }

  function supprimerInteraction(f, id) {
    var cle = f.cle, avant = null;
    f.interactions.forEach(function (i) { if (String(i.id) === String(id)) avant = i; });
    if (!avant) return;
    ecrire(CRM.supprimerInteraction(avant.id), 'Supprimé du fil', function () {
      return CRM.ajouterInteraction(cle, { type: avant.type, resultat: avant.resultat, contenu: avant.contenu, fait_at: avant.fait_at });
    });
  }

  function enregistrerEpingle() {
    var f = ficheOuverte();
    if (!f) return;
    var cle = f.cle, texte = ui.brouillons.epingle.trim(), avant = f.crm.note_epinglee;
    ui.epingleEdition = false;
    ecrire(CRM.epingler(cle, texte), texte ? 'Note épinglée' : 'Note épinglée retirée', function () { return CRM.epingler(cle, avant); }).then(function (r) {
      if (!r.ok && ui.cle === cle) { ui.epingleEdition = true; ui.brouillons.epingle = texte; rendre(); }
    });
    rendre();
  }

  // ───────────────────────────── Perdu / rouvrir ─────────────────────────────

  function ouvrirPerdu(suggere, depuisAppel) {
    ui.perdu = { suggere: suggere, recontact: true, depuisAppel: !!depuisAppel };
    // Une notification encore affichée recouvrirait le bas de la feuille.
    masquerToast();
    rendre();
    var cible = panneau.querySelector(suggere ? '.crm-choix-suggere' : '.crm-feuille .crm-choix');
    if (cible) cible.focus();
  }

  function fermerPerdu() {
    var depuisAppel = ui.perdu && ui.perdu.depuisAppel;
    ui.perdu = null;
    rendre();
    var bouton = panneau.querySelector('[data-action="perdu-ouvrir"]');
    if (depuisAppel) apresTraitement(); else if (bouton) bouton.focus({ preventScroll: true });
  }

  function marquerPerdu(f, motif) {
    var cle = f.cle, recontact = ui.perdu && ui.perdu.recontact;
    ui.perdu = null;
    var operation = CRM.marquerPerdu(cle, motif).then(function () {
      if (!recontact) return null;
      // La fiche est perdue quoi qu'il arrive ; la tâche de rappel est un plus qui ne doit pas tout faire échouer.
      return CRM.ajouterTache(cle, { titre: 'Recontacter', echeance: pur.ajouterJours(aujourdhui(), 90) }).catch(function () { return null; });
    });
    ecrire(operation, recontact ? 'Fiche marquée perdue, rappel dans 90 jours' : 'Fiche marquée perdue', function (tache) {
      return CRM.rouvrir(cle).then(function () { if (tache) return CRM.supprimerTache(tache.id); });
    }).then(function (r) { if (r.ok) apresTraitement(); });
    rendre();
  }

  function rouvrir(f) {
    var cle = f.cle, motif = f.crm.motif_perte;
    ecrire(CRM.rouvrir(cle), 'Fiche rouverte', function () { return CRM.marquerPerdu(cle, motif); });
  }

  // ───────────────────────────── Modèles, liens, numéro trouvé ─────────────────────────────

  function copierModele(f, id) {
    CRM.modeles(f).forEach(function (m) { if (m.id === id) copier(m.texte, 'Message copié'); });
  }

  function copierApercu(f) {
    var c = f.commercant;
    var lien = typeof window.lienApercu === 'function' ? window.lienApercu(f.slug, c.id) : CRM.lienBoutique(f);
    copier(lien, 'Lien d\'aperçu privé copié');
  }

  /* Ouvre la page Commerçants avec la recherche préremplie. Cette page relance son propre filtre (vide)
     quand ses données arrivent : on applique le nôtre tout de suite, puis une seconde fois après son affichage. */
  function gererCompte(f) {
    var nom = f.commercant.nom_boutique || f.nom;
    if (typeof window.allerPage !== 'function') return;
    // Changer de page d'abord : c'est en quittant la page CRM que les vues retirent le hash de la fiche.
    // Demander la fermeture avant ferait un retour arrière dans l'historique, qui rouvrirait le CRM.
    window.allerPage('commercants');
    fermer();
    var champ = document.getElementById('searchCommercants');
    var tableau = document.getElementById('tableCommercants');
    if (!champ || typeof window.filtrerCommercants !== 'function') return;
    function appliquer() {
      // Un filtre de statut resté actif (pilule, ou carte de la Vue d'ensemble) masquerait la boutique cherchée.
      // La fonction de l'admin remet « Tous » puis relit le champ de recherche.
      if (typeof window.filtrerStatutDemo === 'function') window.filtrerStatutDemo('tous');
      else window.filtrerCommercants(nom);
    }
    champ.value = nom;
    appliquer();
    if (!tableau || typeof MutationObserver === 'undefined') return;
    var observateur = new MutationObserver(function () {
      observateur.disconnect();
      if (champ.value === nom) appliquer();
    });
    observateur.observe(tableau, { childList: true });
    setTimeout(function () { observateur.disconnect(); }, 8000);
  }

  function enregistrerTelephone() {
    var f = ficheOuverte();
    if (!f || !f.prospect) return;
    var saisi = ui.brouillons.telephone.trim();
    if (!pur.telFrancais(saisi)) { crmToast('Ce numéro n\'a pas la forme d\'un numéro français.', { type: 'erreur' }); return; }
    var id = f.prospect.id;
    ecrire(CRM.majProspect(id, { telephone: saisi }), 'Numéro enregistré', function () {
      return CRM.majProspect(id, { telephone: '' });
    }).then(function (r) { if (r.ok) ui.brouillons.telephone = ''; });
  }

  // ───────────────────────────── Présence en ligne : saisie des liens ─────────────────────────────

  function reseauDuChamp(champ) {
    for (var id in CHAMPS_LIEN) if (CHAMPS_LIEN[id] === champ) return id;
    return null;
  }
  function reseauCrm(id) {
    for (var i = 0; i < CRM.RESEAUX.length; i++) if (CRM.RESEAUX[i].id === id) return CRM.RESEAUX[i];
    return null;
  }
  function champLienDom(id) { return '[data-champ="' + CHAMPS_LIEN[id] + '"]'; }

  // Dès que l'on corrige la saisie, le message d'erreur s'en va (sans redessiner : le curseur ne bouge pas).
  function effacerErreurLien(champ) {
    var id = reseauDuChamp(champ.dataset.champ);
    if (!id || !ui.lienErreur[id]) return;
    delete ui.lienErreur[id];
    champ.removeAttribute('aria-invalid');
    champ.removeAttribute('aria-describedby');
    var message = panneau.querySelector('#crmLienErreur-' + id);
    if (message) message.remove();
  }

  function modifierLien(f, id) {
    if (!reseauCrm(id) || !f.presence) return;
    ui.lienEdition[id] = true;
    delete ui.lienErreur[id];
    ui.brouillons[CHAMPS_LIEN[id]] = f.presence[id].url || '';
    rendre();
    var champ = panneau.querySelector(champLienDom(id));
    if (champ && !champ.disabled) { champ.focus({ preventScroll: true }); champ.select(); }
  }

  function annulerLien(id) {
    if (!reseauCrm(id)) return;
    delete ui.lienEdition[id];
    delete ui.lienErreur[id];
    ui.brouillons[CHAMPS_LIEN[id]] = '';
    rendre();
    foyerLien(id);
  }

  /* Après un rendu qui fait disparaître le champ ou le bouton actif, le focus reste sur la ligne du réseau :
     le bouton « Modifier » si le lien est connu, sinon le champ de saisie. Sans cela il repartirait en tête de fiche. */
  function foyerLien(id) {
    if (!panneau || !reseauCrm(id)) return;
    var cibles = [panneau.querySelector('[data-action="lien-modifier"][data-id="' + id + '"]'), panneau.querySelector(champLienDom(id)),
      panneau.querySelector('.crm-pres[data-reseau="' + id + '"] a[data-lien]')];
    for (var i = 0; i < cibles.length; i++) {
      if (cibles[i] && !cibles[i].disabled) { cibles[i].focus({ preventScroll: true }); return; }
    }
  }

  function refuserLien(id, message) {
    ui.lienErreur[id] = message;
    rendre();
    var champ = panneau.querySelector(champLienDom(id));
    if (champ && !champ.disabled) champ.focus({ preventScroll: true });
  }

  function enregistrerLien(id) {
    var f = ficheOuverte(), r = reseauCrm(id);
    if (!f || !r || !f.presence || lectureSeule() || !CRM.etat.liens) return;
    var saisi = ui.brouillons[CHAMPS_LIEN[id]].trim();
    if (!saisi) { refuserLien(id, 'Collez d\'abord le lien.'); return; }
    var url = CRM.normaliserLien(id, saisi);
    if (!url) { refuserLien(id, r.erreur); return; }
    var cle = f.cle, actuel = f.presence[id];
    // Rien à écrire si le lien est déjà celui-là (trouvé ou saisi) : on referme simplement l'édition.
    if (actuel.url === url) { annulerLien(id); return; }
    var avant = actuel.origine === 'manuel' ? actuel.url : null;
    var edition = !!ui.lienEdition[id], liens = {}, retour = {};
    liens[id] = url; retour[id] = avant;
    delete ui.lienEdition[id];
    delete ui.lienErreur[id];
    ui.brouillons[CHAMPS_LIEN[id]] = '';
    ecrire(CRM.majLiens(cle, liens), 'Lien ' + r.libelle + ' enregistré', function () { return CRM.majLiens(cle, retour); }).then(function (res) {
      // Échec : la saisie revient, sauf si l'utilisateur a déjà recommencé à écrire.
      if (!res.ok && ui.cle === cle && !ui.brouillons[CHAMPS_LIEN[id]]) {
        ui.brouillons[CHAMPS_LIEN[id]] = saisi;
        if (edition) ui.lienEdition[id] = true;
        rendre();
      }
    });
    rendre();
    foyerLien(id);
  }

  function effacerLien(f, id) {
    var r = reseauCrm(id);
    if (!r || !f.presence || f.presence[id].origine !== 'manuel') return;
    var cle = f.cle, avant = f.presence[id].url, liens = {}, retour = {};
    liens[id] = null; retour[id] = avant;
    delete ui.lienEdition[id];
    delete ui.lienErreur[id];
    ui.brouillons[CHAMPS_LIEN[id]] = '';
    ecrire(CRM.majLiens(cle, liens), 'Lien ' + r.libelle + ' effacé', function () { return CRM.majLiens(cle, retour); });
    rendre();
    foyerLien(id);
  }

  // ───────────────────────────── Interface publique ─────────────────────────────

  var api = {
    ouvrir: ouvrir,
    fermer: fermer,
    rendre: rendre,
    estOuverte: function () { return !!(racine && !racine.hidden && ui.cle); },
    cle: function () { return ui.cle; },
    surDemandeFermeture: null
  };

  // Le cœur prévient après chaque chargement et chaque écriture.
  CRM.surChangement(function () { if (api.estOuverte()) rendre(); });

  crmToast.masquer = masquerToast;
  window.crmToast = crmToast;
  window.crmFiche = api;
  window.crmUI = {
    esc: esc, ic: ic, euros: euros, pluriel: pluriel, initiales: initiales,
    dateCourte: dateCourte, dateAvecJour: dateAvecJour, dateRelative: dateRelative, echeanceLibelle: echeanceLibelle,
    ageJours: ageJours, metierDe: metierDe, lieuMetierHtml: lieuMetierHtml, etapeDe: etapeDe, etapeHtml: etapeHtml,
    scoreHtml: scoreHtml, offreNom: offreNom, lectureSeule: lectureSeule, attrEcriture: attrEcriture,
    ecrire: ecrire, copier: copier, ouvrirMenu: ouvrirMenu, fermerMenu: fermerMenu, menuOuvert: function () { return !!menu; },
    optionsReport: optionsReport, reporterAction: reporterAction, faitAction: faitAction,
    chaleurHtml: chaleurHtml, raisonsChaleurHtml: raisonsChaleurHtml, etatAnalyseHtml: etatAnalyseHtml,
    reglagesChaleurHtml: reglagesChaleurHtml, reseauxActifsHtml: reseauxActifsHtml,
    etudeHtml: etudeHtml, noteMarcheoHtml: noteMarcheoHtml, RYTHME_ETUDE: RYTHME_ETUDE, MESSAGE_ANALYSE_INDISPONIBLE: MESSAGE_ANALYSE_INDISPONIBLE,
    LIBELLES_URGENCE: LIBELLES_URGENCE, DRAPEAUX: DRAPEAUX
  };
})();
