/* CRM admin Marchéo — assistant d'appel de la vue « Prospection ».
 *
 * Pendant l'appel, la fiche du prospect montre quoi dire (le script de crm-guide.js, variables remplies), des
 * boutons « Il répond… » qui mènent à l'étape ou à l'objection suivante, un panneau d'objections toujours à
 * portée, la prise de rendez-vous, la messagerie et le barrage. S'y ajoutent « Mes appels » (ce que dit le
 * journal d'appels) et l'écran « Modifier mon script ».
 *
 * Ce fichier ne garde que l'état d'écran de l'appel en cours. Il expose `window.crmAssistantCreer(ctx)`,
 * appelé une fois par crm-prospection.js, qui lui prête ses outils (`ctx`) : prospect courant, pose d'un
 * résultat, écriture dans la note, redessin. Ses boutons portent `data-gd`, ses champs `data-gdc`.
 * Chargé après crm-guide.js et avant crm-prospection.js.
 */
(function () {
  'use strict';

  var CRM = window.CRM, UI = window.crmUI;
  if (!CRM || !UI || !CRM.guide || typeof document === 'undefined') return;
  var G = CRM.guide, esc = UI.esc, pur = CRM.pur;

  var CLE_REPLI = 'crm_pro_guide', CLE_MESURE = 'crm_pro_mesure';
  var REGLAGE_SCRIPT = 'script_appel', REGLAGE_OBJECTIF = 'objectif_appels';
  var OBJECTIF_MAX = 500;
  // Le fil de l'appel. Barrage, messagerie, rappel et sortie sont des branches : elles s'affichent à côté.
  var FIL = [['qui', 'Qui décroche ?'], ['ouverture', 'Ouverture'], ['raison', 'Raison'], ['rdv', 'Rendez-vous'], ['conclusion', 'Conclusion']];
  var RANG = { qui: 0, messagerie: 0, barrage: 1, ouverture: 2, raison: 3, rdv: 4, conclusion: 5 };
  var BRANCHES = { barrage: 'Barrage', messagerie: 'Messagerie', rappel: 'Rappel à noter', sortie: 'Sortie' };
  var COURTS = { barrage: 'Barrage', ouverture: 'Ouverture', raison: 'Raison', rdv: 'Rendez-vous', conclusion: 'Conclusion', sortie: 'Sortie' };
  var QUI = [
    { id: 'patron', libelle: 'Le patron, la patronne', aide: 'la personne qui décide' },
    { id: 'barrage', libelle: 'Un vendeur, une vendeuse', aide: 'quelqu\'un d\'autre' },
    { id: 'messagerie', libelle: 'La messagerie', aide: 'un répondeur' },
    { id: 'personne', libelle: 'Personne', aide: 'ça sonne dans le vide' }
  ];
  var MOMENTS = {
    bon: 'Bon moment pour appeler', possible: 'Moment possible', eviter: 'Plutôt à éviter maintenant',
    neutre: 'Ni conseillé ni déconseillé à cette heure'
  };
  // Prospect d'exemple pour l'aperçu de « Modifier mon script » quand la file est vide.
  var EXEMPLE = { nom: 'Boucherie Dupont', metier: 'Boucherie', commune: 'Lunel', source: 'osm', nb_appels: 0 };

  function lirePref(cle) { try { return localStorage.getItem(cle); } catch (e) { return null; } }
  function ecrirePref(cle, valeur) { try { localStorage.setItem(cle, valeur); } catch (e) { /* stockage bloqué : la préférence vaut pour la session */ } }
  function sansAccents(v) { return pur.sansAccents(v == null ? '' : String(v)).toLowerCase(); }
  function kbd(touche) { return '<kbd class="crm-gd-kbd" aria-hidden="true">' + esc(touche) + '</kbd>'; }

  window.crmAssistantCreer = function (ctx) {
    var ic = ctx.ic;
    var prefs = { ouvert: lirePref(CLE_REPLI) !== '0', mesure: lirePref(CLE_MESURE) === '1' };
    var appel = null, seances = 0;
    var cache = { cle: null, guide: G.DEFAUT, perso: G.nettoyerPerso(null) };
    var editeur = { ouvert: false, groupe: 'ouverture', textes: null, tel: '', envoi: false };
    var mesure = { saisie: null, envoi: false };
    // Ce que le guide a écrit en enregistrant un rendez-vous ou un rappel, par prospect, pour pouvoir le défaire :
    // { rdv: { ligne, tache (promesse de l'id de la tâche créée) }, rappel: { ligne } }.
    var traces = {};
    // Champ date ou heure du guide où l'on tape au clavier (id), ou null.
    var frappe = null;
    var CHAMPS_DATE = { 'rdv-jour': true, 'rdv-heure': true, 'rappel-jour': true, 'rappel-heure': true };

    // ───────────────────────────── Script en vigueur, valeurs, état de l'appel ─────────────────────────────

    /* Le guide à suivre : celui du code, avec par-dessus ce que le fondateur a modifié. */
    function guide() {
      var brutPerso = CRM.reglage(REGLAGE_SCRIPT), cle = JSON.stringify(brutPerso || null);
      if (cache.cle !== cle) {
        cache.cle = cle;
        cache.perso = G.nettoyerPerso(brutPerso);
        cache.guide = G.construire(brutPerso);
      }
      return cache.guide;
    }
    function telPaul() { guide(); return cache.perso.tel_paul ? (pur.formaterTel(cache.perso.tel_paul) || cache.perso.tel_paul) : ''; }

    function appelNeuf(id) {
      return {
        id: id, seance: ++seances, interlocuteur: null, etape: 'qui', atteinte: 'qui', variantes: {}, ouverture: null,
        conseil: '', objection: null, origine: null, baseObjection: null, objections: [], insister: false, propose: null, pose: null,
        recherche: '', prenom: null, conseils: false, sms: false, retour: [],
        rdv: { jour: '', heure: '', canal: 'telephone', envoi: false, fait: false, tache: '', erreur: '' },
        rappel: { jour: '', heure: '', envoi: false, fait: false, erreur: '' }
      };
    }
    function appelCourant() {
      var p = ctx.courant();
      if (!p) { appel = null; return null; }
      if (!appel || appel.id !== p.id) appel = appelNeuf(p.id);
      return appel;
    }
    function demo(p) { return G.demoExiste(ctx.ficheCrm(p)); }
    /* Un SMS ne se promet que sur un portable : sur un fixe, les textes prennent leur version sans SMS. */
    function smsPossible(p) { return pur.estMobile(p.telephone); }
    function prenomDe(p, a) { return a && a.prenom != null ? a.prenom.trim() : G.prenomDepuisNote(ctx.noteDe(p)); }
    function vals(p, a) {
      return G.valeurs(p, {
        maintenant: CRM.horloge(), guide: guide(), offres: CRM.OFFRES, demo: demo(p), telPaul: telPaul(),
        prenom: prenomDe(p, a), jourRdv: a.rdv.jour, heureRdv: a.rdv.heure, canal: a.rdv.canal, jourRappel: a.rappel.jour
      });
    }
    function aujourdhui() { return pur.dateLocaleISO(CRM.horloge()); }
    function resultatDe(id) {
      for (var i = 0; i < CRM.RESULTATS_PROSPECT.length; i++) if (CRM.RESULTATS_PROSPECT[i].id === id) return CRM.RESULTATS_PROSPECT[i];
      return null;
    }
    function libelleResultat(id) { var r = resultatDe(id); return r ? r.libelle : ''; }

    /* Variante affichée pour une étape : celle choisie, sinon celle du guide. Pour la messagerie, le guide donne
       une cadence : dernier message à partir du quatrième appel, message « démo prête » seulement si elle existe. */
    function varianteCourante(p, a, idEtape) {
      var g = guide();
      if (idEtape === 'messagerie') {
        var liste = g.messagerie.variantes, voulue = a.variantes.messagerie;
        if (!voulue) voulue = (Number(p.nb_appels) || 0) >= 3 ? 'vocal_dernier' : demo(p) ? 'vocal_demo' : 'vocal_15s';
        for (var i = 0; i < liste.length; i++) if (liste[i].id === voulue) return liste[i];
        return liste[0];
      }
      return G.varianteDe(g, idEtape, a.variantes[idEtape]);
    }
    /* La version courte de l'ouverture se termine par la demande de rendez-vous : ses réponses sont celles de l'étape « rdv ». */
    function etapeDesReactions(p, a) {
      if (a.etape === 'ouverture' && varianteCourante(p, a, 'ouverture').id === 'ouverture_courte') return 'rdv';
      return a.etape;
    }

    // ───────────────────────────── Morceaux d'affichage ─────────────────────────────

    function htmlScript(texte, v, classe) {
      var morceaux = G.repliquesRemplies(texte, v);
      return '<div class="crm-gd-script' + (classe ? ' ' + classe : '') + '">' + morceaux.map(function (m, i) {
        return (i ? '<span class="crm-gd-pause">il répond</span>' : '') + '<p>' + esc(m) + '</p>';
      }).join('') + '</div>';
    }

    function htmlMoment(p) {
      var m = G.bonMoment(G.metierDe(p), CRM.horloge(), guide());
      var detail = m.niveau === 'bon' || m.niveau === 'possible' ? m.raison
        : (m.raison ? m.raison + '. ' : '') + (m.meilleur ? 'Meilleur créneau : ' + m.meilleur : '');
      return '<p class="crm-gd-moment crm-gd-moment-' + m.niveau + '" id="crmGdMoment" title="' + esc('Repère de terrain, pas une mesure. ' + m.remarque) + '">' +
        '<i aria-hidden="true"></i><span><b>' + esc(MOMENTS[m.niveau]) + '</b>' + (detail ? '<span class="crm-sep">·</span>' + esc(detail) : '') + '</span></p>';
    }

    function htmlFil(a) {
      var atteint = RANG[a.atteinte] || 0;
      return '<ol class="crm-gd-fil" aria-label="Étapes de l\'appel">' + FIL.map(function (e, i) {
        var courante = !a.objection && a.etape === e[0];
        return '<li><button type="button" class="crm-gd-pas' + (RANG[e[0]] < atteint || (e[0] === 'qui' && a.etape !== 'qui') ? ' crm-gd-pas-fait' : '') + '" data-gd="etape" data-id="' + e[0] + '"' +
          (courante ? ' aria-current="step"' : '') + '><span class="crm-gd-pas-n">' + (i + 1) + '</span><span class="crm-gd-pas-l">' + esc(e[1]) + '</span></button></li>';
      }).join('') + (BRANCHES[a.etape] && !a.objection ? '<li class="crm-gd-branche" aria-current="step">' + esc(BRANCHES[a.etape]) + '</li>' : '') + '</ol>';
    }

    function htmlRetour(a) {
      return a.retour.length ? '<button type="button" class="crm-gd-retour" data-gd="retour" data-touche="Backspace" aria-keyshortcuts="Backspace" title="Revenir à ce qui précédait (touche Retour arrière)">' +
        ic('chevronGauche', 15) + '<span>Retour</span></button>' : '';
    }

    /* Les conseils du guide citent parfois une variable (« je vous le donne {jour1} ») : ils sont remplis comme les répliques. */
    function htmlConseil(a, v) {
      return a.conseil ? '<p class="crm-gd-conseil">' + ic('note', 14) + '<span>' + esc(G.remplir(a.conseil, v)) + '</span></p>' : '';
    }

    function htmlAvertissement(variante) {
      if (!variante || !variante.avertissement) return '';
      var liste = guide().avertissements || [], texte = '';
      liste.forEach(function (x) { if (x.id === variante.avertissement) texte = x.texte; });
      return texte ? '<details class="crm-gd-avert"><summary>' + ic('alerte', 14) + 'À savoir avant de dire ce texte</summary><p>' + esc(texte) + '</p></details>' : '';
    }

    /* Devant un fleuriste, « commerces de bouche » sonne faux : la consigne s'affiche sous le texte qui le dit. */
    function htmlHorsBouche(p, texte) {
      if (G.metierDe(p) !== 'fleuriste' || !/commerces? de bouche/i.test(texte)) return '';
      return '<p class="crm-gd-conseil crm-gd-hors-bouche">' + ic('alerte', 14) + '<span>Ce n\'est pas un commerce de bouche : dites « commerces de proximité » à la place de « commerces de bouche ».</span></p>';
    }

    function htmlVariantes(liste, courante, etiquette) {
      if (liste.length < 2) return '';
      return '<select class="crm-gd-variante" id="crmGdVariante" data-gdc="variante" aria-label="' + esc(etiquette) + '">' + liste.map(function (v) {
        return '<option value="' + esc(v.id) + '"' + (v.id === courante.id ? ' selected' : '') + '>' + esc(v.nom) + '</option>';
      }).join('') + '</select>';
    }

    /* Puces de jour : demain (pour un rappel), les deux jours proposés au commerçant, puis une date libre. */
    function htmlJours(action, choisie, avecDemain, id) {
      var jour = aujourdhui(), liste = [];
      var proposes = G.joursProposes(CRM.horloge());
      var demain = pur.ajouterJours(jour, 1);
      if (avecDemain && !proposes.some(function (j) { return j.date === demain; })) liste.push({ date: demain, libelle: 'Demain' });
      proposes.forEach(function (j) { liste.push({ date: j.date, libelle: G.jourComplet(j.date).split(' ').slice(0, 2).join(' ') }); });
      var libre = choisie && !liste.some(function (j) { return j.date === choisie; });
      return '<div class="crm-puces">' + liste.map(function (j) {
        return '<button type="button" class="crm-puce" data-gd="' + action + '" data-id="' + j.date + '" aria-pressed="' + (choisie === j.date) + '">' + esc(j.libelle) + '</button>';
      }).join('') + '<input type="date" class="crm-champ-date" id="' + id + '" data-gdc="' + action + '" min="' + jour + '" value="' + esc(libre ? choisie : '') + '" aria-label="Autre date"></div>';
    }
    function htmlHeures(p, action, choisie, id) {
      var liste = G.heuresSuggerees(G.metierDe(p), guide());
      var libre = choisie && liste.indexOf(choisie) < 0;
      return '<div class="crm-puces">' + liste.map(function (h) {
        return '<button type="button" class="crm-puce" data-gd="' + action + '" data-id="' + h + '" aria-pressed="' + (choisie === h) + '">' + esc(G.heureLisible(h)) + '</button>';
      }).join('') + '<input type="time" class="crm-champ-date" id="' + id + '" data-gdc="' + action + '" step="300" value="' + esc(libre ? choisie : '') + '" aria-label="Autre heure"></div>';
    }
    function htmlPrenom(p, a) {
      return '<label class="crm-pro-champ"><span>Prénom du patron</span><input type="text" id="crmGdPrenom" data-gdc="prenom" maxlength="60" autocomplete="off" ' +
        'autocapitalize="words" value="' + esc(a.prenom != null ? a.prenom : G.prenomDepuisNote(ctx.noteDe(p))) + '" placeholder="Demandez-le avant de raccrocher"></label>';
    }
    function htmlSuite(avecFiche) {
      return '<div class="crm-pro-rangee">' + (avecFiche ? '<button type="button" class="crm-btn" data-gd="fiche-crm">Ouvrir la fiche CRM' + ic('fleche', 14) + '</button>' : '') +
        '<button type="button" class="crm-btn crm-btn-or" data-gd="suivant">Fiche suivante' + ic('chevronDroit', 14) + '</button></div>';
    }

    // ───────────────────────────── Rendez-vous, rappel, résultat proposé ─────────────────────────────

    function smsConfirmation(p, a) {
      var modele = null;
      guide().sms.modeles.forEach(function (m) { if (m.id === 'confirmation_rdv') modele = m; });
      return modele ? G.remplir(G.texteDe(modele, 'texte', demo(p)), vals(p, a)) : '';
    }

    function htmlSms(p, texte, titre) {
      var lien = CRM.liens({ telephone: p.telephone }, texte).sms;
      var mobile = pur.estMobile(p.telephone);
      return '<div class="crm-gd-sms"><p class="crm-gd-etiquette">' + esc(titre) + '</p><p class="crm-gd-sms-texte" id="crmGdSmsTexte">' + esc(texte) + '</p>' +
        '<div class="crm-pro-rangee">' +
          (lien ? '<a class="crm-btn crm-btn-or" id="crmGdSmsLien" href="' + esc(lien) + '">' + ic('sms', 14) + 'Ouvrir dans Messages</a>' : '') +
          '<button type="button" class="crm-btn" data-gd="sms-copier">' + ic('copier', 14) + 'Copier</button></div>' +
        (mobile ? '' : '<p class="crm-aide">' + (p.telephone ? 'Ce numéro est un fixe : demandez un portable avant d\'envoyer le SMS.' : 'Pas de numéro : copiez le texte une fois le portable connu.') + '</p>') + '</div>';
    }

    function htmlRdv(p, a, complet) {
      var r = a.rdv;
      if (r.fait) {
        return '<div class="crm-gd-form crm-gd-fait" id="crmGdRdv"><p class="crm-gd-fait-titre">' + ic('coche', 16) + '<span>Rendez-vous enregistré : ' +
            esc(G.jourComplet(r.jour) + ' à ' + G.heureLisible(r.heure) + ', ' + G.canalDe(r.canal).dit) + '.</span></p>' +
          '<p class="crm-aide">' + esc('Résultat « ' + libelleResultat('rdv') + ' » posé. ' + (r.tache || '')) + '</p>' +
          htmlSms(p, smsConfirmation(p, a), 'SMS de confirmation, à envoyer dans la minute') + htmlSuite(true) + htmlAnnuler('rdv-annuler', 'Annuler ce rendez-vous') + '</div>';
      }
      // Pendant qu'on propose les cinq minutes, le formulaire tient en une ligne : les réponses du commerçant
      // restent à portée de pouce. L'heure vient une fois le jour choisi.
      if (!complet) {
        return '<div class="crm-gd-form crm-gd-form-court" id="crmGdRdv"><p class="crm-gd-etiquette">' + (r.jour ? 'Le jour, puis l\'heure qu\'il choisit' : 'Le jour qu\'il choisit') + '</p>' +
          htmlJours('rdv-jour', r.jour, false, 'crmGdRdvJour') + (r.jour ? htmlHeures(p, 'rdv-heure', r.heure, 'crmGdRdvHeure') : '') + '</div>';
      }
      return '<div class="crm-gd-form" id="crmGdRdv"><p class="crm-gd-form-titre">' + ic('calendrier', 15) + 'Le rendez-vous</p>' +
        '<p class="crm-gd-etiquette">Jour</p>' + htmlJours('rdv-jour', r.jour, false, 'crmGdRdvJour') +
        '<p class="crm-gd-etiquette">Heure</p>' + htmlHeures(p, 'rdv-heure', r.heure, 'crmGdRdvHeure') +
        '<p class="crm-gd-etiquette">Comment</p><div class="crm-gd-segment" role="group" aria-label="Canal du rendez-vous">' + G.CANAUX.map(function (c) {
          return '<button type="button" data-gd="rdv-canal" data-id="' + c.id + '" aria-pressed="' + (r.canal === c.id) + '">' + esc(c.libelle) + '</button>';
        }).join('') + '</div>' + htmlPrenom(p, a) +
        (r.erreur ? '<p class="crm-pro-alerte" role="alert">' + ic('alerte', 14) + '<span>' + esc(r.erreur) + '</span></p>' : '') +
        '<button type="button" class="crm-btn crm-btn-plein crm-gd-valider" id="crmGdRdvEnregistrer" data-gd="rdv-enregistrer" data-touche="Enter"' + (r.envoi ? ' disabled' : '') + '>' +
          ic('coche', 15) + (r.envoi ? 'Enregistrement…' : 'Enregistrer le rendez-vous') + kbd('Entrée') + '</button></div>';
    }

    /* Un enregistrement fait par erreur se défait d'un toucher : résultat, tâche et ligne de la note. */
    function htmlAnnuler(action, libelle) {
      return '<button type="button" class="crm-lien crm-gd-annuler" data-gd="' + action + '">' + ic('rouvrir', 13) + esc(libelle) + '</button>';
    }

    function htmlRappel(p, a) {
      var r = a.rappel;
      if (r.fait) {
        var quand = [r.jour ? G.jourComplet(r.jour) : '', r.heure ? 'vers ' + G.heureLisible(r.heure) : ''].filter(Boolean).join(' ');
        return '<div class="crm-gd-form crm-gd-fait" id="crmGdRappel"><p class="crm-gd-fait-titre">' + ic('coche', 16) + '<span>À rappeler' + (quand ? ' ' + esc(quand) : '') + '.</span></p>' +
          '<p class="crm-aide">' + esc(r.jour ? 'Ce commerce remontera dans « Aujourd\'hui » ce jour-là. ' : 'Sans date : il remontera dans deux jours. ') + 'Le prénom et l\'heure sont dans la note.</p>' + htmlSuite(false) + htmlAnnuler('rappel-annuler', 'Annuler ce rappel') + '</div>';
      }
      return '<div class="crm-gd-form" id="crmGdRappel"><p class="crm-gd-form-titre">' + ic('horloge', 15) + 'À noter avant de raccrocher</p>' +
        htmlPrenom(p, a) +
        '<p class="crm-gd-etiquette">Meilleur moment pour rappeler</p>' + htmlJours('rappel-jour', r.jour, true, 'crmGdRappelJour') +
        htmlHeures(p, 'rappel-heure', r.heure, 'crmGdRappelHeure') +
        (r.erreur ? '<p class="crm-pro-alerte" role="alert">' + ic('alerte', 14) + '<span>' + esc(r.erreur) + '</span></p>' : '') +
        '<button type="button" class="crm-btn crm-btn-plein crm-gd-valider" id="crmGdRappelEnregistrer" data-gd="rappel-enregistrer" data-touche="Enter"' + (r.envoi ? ' disabled' : '') + '>' +
          ic('coche', 15) + (r.envoi ? 'Enregistrement…' : 'Enregistrer : à rappeler') + kbd('Entrée') + '</button></div>';
    }

    /* Le résultat que la réponse du commerçant appelle : un toucher (ou Entrée) le pose. */
    function htmlPropose(a) {
      if (a.rdv.fait || a.rappel.fait) return '';
      if (a.pose) {
        return '<div class="crm-gd-propose crm-gd-fait"><p class="crm-gd-fait-titre">' + ic('coche', 16) + '<span>Résultat posé : ' + esc(libelleResultat(a.pose)) + '.</span></p>' + htmlSuite(false) + '</div>';
      }
      if (!a.propose || a.propose === 'rdv' || a.propose === 'a_rappeler') return '';
      return '<div class="crm-gd-propose"><span>Résultat proposé</span>' +
        '<button type="button" class="crm-btn crm-btn-plein crm-gd-valider" id="crmGdPoser" data-gd="poser" data-id="' + esc(a.propose) + '" data-touche="Enter">' +
          'Poser « ' + esc(libelleResultat(a.propose)) + ' »' + kbd('Entrée') + '</button></div>';
    }

    // ───────────────────────────── Étapes ─────────────────────────────

    function htmlReactions(p, a) {
      var g = guide(), e = G.etapeDe(g, etapeDesReactions(p, a));
      if (!e || !e.reactions.length) return '';
      return '<p class="crm-gd-soustitre">Il répond…</p><div class="crm-gd-reactions">' + e.reactions.map(function (r, i) {
        var touche = i < 9 ? String(i + 1) : i === 9 ? '0' : '';
        var vers = G.objectionDe(g, r.vers) ? 'objection' : (r.resultat === 'rdv' ? 'enregistrer' : r.vers === e.id && !r.variante ? '' : COURTS[r.vers] || '');
        return '<button type="button" class="crm-gd-reaction" data-gd="reaction" data-id="' + i + '"' + (touche ? ' data-touche="' + touche + '" aria-keyshortcuts="' + touche + '"' : '') + '>' +
          (touche ? kbd(touche) : '<span class="crm-gd-kbd-vide" aria-hidden="true"></span>') + '<span class="crm-gd-reaction-l">' + esc(r.libelle) + '</span>' +
          (vers ? '<small>' + esc(vers) + '</small>' : '') + '</button>';
      }).join('') + '</div>';
    }

    function htmlQui(p, a) {
      var ouverture = G.varianteDe(guide(), 'ouverture', null);
      var repliques = ouverture ? G.repliquesRemplies(ouverture.texte, vals(p, a)) : [];
      var nb = Number(p.nb_appels) || 0;
      return '<div class="crm-gd-etape" id="crmGdEtape"><div class="crm-gd-etape-tete"><h3 id="crmGdTitre" tabindex="-1">Ça décroche</h3></div>' +
        (repliques.length > 1 ? '<div class="crm-gd-script"><p>' + esc(repliques[0]) + '</p></div>' : '') +
        (nb ? '<p class="crm-aide">' + esc(nb > 1 ? nb + ' appels déjà passés à ce commerce.' : 'Un appel déjà passé à ce commerce.') + (G.prenomDepuisNote(ctx.noteDe(p)) ? ' Patron : ' + esc(G.prenomDepuisNote(ctx.noteDe(p))) + '.' : '') + '</p>' : '') +
        '<p class="crm-gd-soustitre">Qui décroche ?</p><div class="crm-gd-qui">' + QUI.map(function (q, i) {
          return '<button type="button" class="crm-gd-reaction" data-gd="qui" data-id="' + q.id + '" data-touche="' + (i + 1) + '" aria-keyshortcuts="' + (i + 1) + '">' + kbd(i + 1) +
            '<span class="crm-gd-reaction-l"><b>' + esc(q.libelle) + '</b><i>' + esc(q.aide) + '</i></span></button>';
        }).join('') + '</div></div>';
    }

    function htmlEtape(p, a) {
      var g = guide(), e = G.etapeDe(g, a.etape);
      if (!e) return '';
      var variante = varianteCourante(p, a, a.etape), v = vals(p, a);
      var reactions = etapeDesReactions(p, a);
      var html = '<div class="crm-gd-etape" id="crmGdEtape"><div class="crm-gd-etape-tete">' + htmlRetour(a) +
        '<h3 id="crmGdTitre" tabindex="-1">' + esc(String(e.titre).replace(/^\d+\.\s*/, '')) + '</h3>' + htmlVariantes(e.variantes, variante, 'Version du texte') + '</div>';
      if (a.etape === 'ouverture') {
        var courte = variante.id === 'ouverture_courte';
        html += '<button type="button" class="crm-gd-courte" id="crmGdCourte" data-gd="courte" data-touche="c" aria-keyshortcuts="C" aria-pressed="' + courte + '">' + kbd('C') +
          '<span><b>Version courte</b><i>' + (courte ? 'revenir à la version complète' : 's\'il est sec ou pressé') + '</i></span></button>';
      }
      var sms = smsPossible(p), texte = G.texteDe(variante, 'texte', demo(p), sms);
      // « Très bien, (jour). » ne se lit pas à voix haute : tant que le jour n'est pas choisi, le texte s'en passe.
      var sansJour = a.etape === 'rdv' && variante.id === 'rdv_heure' && !a.rdv.jour;
      if (sansJour) texte = G.sansVariable(texte, 'jour_rdv');
      html += htmlConseil(a, v) + htmlScript(texte, v) + htmlHorsBouche(p, texte) + htmlAvertissement(variante) +
        (sansJour ? '<p class="crm-aide" id="crmGdSansJour">Touchez le jour qu\'il vient de dire : il entre dans le texte, et les heures s\'affichent.</p>' : '') +
        (!sms && variante.texte_sans_sms ? '<p class="crm-aide" id="crmGdSansSms">' + (p.telephone ? 'Ce numéro est un fixe' : 'Pas de numéro de portable') + ' : le texte ne promet pas de SMS. S\'il vous donne un portable, envoyez-lui la confirmation.</p>' : '');
      // La demande de recommandation suit la porte ouverte : c'est la sortie propre après un refus.
      if (a.etape === 'sortie' && (variante.id === 'sortie_non' || variante.id === 'sortie_pas_maintenant')) {
        var reco = G.varianteDe(g, 'sortie', 'sortie_recommandation');
        if (reco) html += '<p class="crm-gd-etiquette">Si le ton s\'y prête : demander une recommandation</p>' + htmlScript(reco.texte, v, 'crm-gd-script-suite');
      }
      var avecRappel = a.etape === 'barrage' || (a.propose === 'a_rappeler' && !a.pose) || a.rappel.fait;
      var suite = a.rdv.fait || a.rappel.fait ? '' : htmlReactions(p, a);
      // Au barrage, on écoute d'abord la réponse du vendeur ; le prénom et l'heure se notent ensuite.
      if (a.etape === 'barrage' && !a.rappel.fait) return html + htmlPropose(a) + suite + htmlRappel(p, a) + '</div>';
      if (avecRappel) html += htmlRappel(p, a);
      else if (reactions === 'rdv' || a.etape === 'conclusion') html += htmlRdv(p, a, a.etape === 'conclusion');
      return html + htmlPropose(a) + suite + '</div>';
    }

    function htmlEtapeRappel(p, a) {
      var texte = a.variantes.rappel ? G.varianteDe(guide(), 'sortie', a.variantes.rappel) : null;
      return '<div class="crm-gd-etape" id="crmGdEtape"><div class="crm-gd-etape-tete">' + htmlRetour(a) + '<h3 id="crmGdTitre" tabindex="-1">Noter le rappel</h3></div>' +
        htmlConseil(a, vals(p, a)) + (texte ? htmlScript(texte.texte, vals(p, a)) : '') + htmlRappel(p, a) + '</div>';
    }

    function htmlMessagerie(p, a) {
      var g = guide(), variante = varianteCourante(p, a, 'messagerie'), v = vals(p, a);
      var nb = Number(p.nb_appels) || 0, cadence = g.messagerie.cadence || [];
      var html = '<div class="crm-gd-etape" id="crmGdEtape"><div class="crm-gd-etape-tete">' + htmlRetour(a) + '<h3 id="crmGdTitre" tabindex="-1">Messagerie</h3>' +
        htmlVariantes(g.messagerie.variantes, variante, 'Message à laisser') + '</div>' +
        (cadence.length ? '<p class="crm-gd-conseil">' + ic('note', 14) + '<span>' + esc(cadence[Math.min(nb, cadence.length - 1)]) + '</span></p>' : '') +
        htmlScript(G.texteDe(variante, 'texte', demo(p)), v) + htmlHorsBouche(p, G.texteDe(variante, 'texte', demo(p))) +
        (telPaul() ? '' : '<p class="crm-aide">Votre numéro de rappel n\'est pas renseigné : ajoutez-le dans « Modifier mon script » pour qu\'il soit dit dans le message.</p>');
      var modele = null, avert = '';
      g.sms.modeles.forEach(function (m) { if (m.id === 'apres_sans_reponse') modele = m; });
      if (modele && pur.estMobile(p.telephone)) {
        (g.avertissements || []).forEach(function (x) { if (x.id === modele.avertissement) avert = x.texte; });
        html += '<button type="button" class="crm-btn crm-gd-sms-bascule" data-gd="sms-relance" aria-expanded="' + a.sms + '" aria-controls="crmGdSmsRelance">' + ic('sms', 14) +
            (a.sms ? 'Masquer le SMS de relance' : 'SMS de relance') + '</button>' +
          (a.sms ? '<div id="crmGdSmsRelance">' + (avert ? '<p class="crm-pro-alerte">' + ic('alerte', 14) + '<span>' + esc(avert) + '</span></p>' : '') +
            htmlSms(p, G.remplir(G.texteDe(modele, 'texte', demo(p)), v), 'SMS de relance, une seule fois par commerce') + '</div>' : '');
      }
      if (a.pose) return html + htmlPropose(a) + '</div>';
      return html + '<p class="crm-gd-soustitre">Ensuite</p><div class="crm-gd-reactions">' +
        '<button type="button" class="crm-gd-reaction" data-gd="poser" data-id="messagerie" data-touche="1" aria-keyshortcuts="1">' + kbd('1') +
          '<span class="crm-gd-reaction-l">Message laissé</span><small>' + esc(libelleResultat('messagerie')) + '</small></button>' +
        '<button type="button" class="crm-gd-reaction" data-gd="poser" data-id="pas_de_reponse" data-touche="2" aria-keyshortcuts="2">' + kbd('2') +
          '<span class="crm-gd-reaction-l">Rien laissé</span><small>' + esc(libelleResultat('pas_de_reponse')) + '</small></button></div></div>';
    }

    // ───────────────────────────── Objections ─────────────────────────────

    /* Ce que fait « ça passe » : la relance qui propose deux jours mène au rendez-vous, celle qui annonce un
       rappel mène au rappel à noter, les autres rendent la main à l'appel. */
    function suiteObjection(o) {
      if (/\{jour2\}/.test(o.relance)) return 'rdv';
      return o.si_refus === 'a_rappeler' ? 'rappel' : 'continuer';
    }

    function htmlObjection(p, a) {
      var g = guide(), o = G.objectionDe(g, a.objection), v = vals(p, a), d = demo(p);
      if (!o) return '';
      var n = a.objections.length;
      var tete = '<div class="crm-gd-etape crm-gd-objection" id="crmGdEtape"><div class="crm-gd-etape-tete">' +
        '<button type="button" class="crm-gd-retour" data-gd="objection-fermer" data-touche="Escape" aria-keyshortcuts="Escape" title="Revenir à l\'étape (touche Échap)">' + ic('chevronGauche', 15) + '<span>Retour</span></button>' +
        '<h3 id="crmGdTitre" tabindex="-1">« ' + esc(o.libelle) + ' »</h3></div>';
      var limite = n >= 2 ? '<p class="crm-gd-limite" role="status">' + ic('alerte', 15) + '<span><b>' + (n === 2 ? 'Deuxième objection de cet appel.' : n + ' objections sur cet appel.') +
        '</b> ' + (n === 2 ? 'Une réponse, pas plus : s\'il ne dit pas oui, n\'insistez pas et sortez proprement.' : 'N\'insistez pas : laissez la porte ouverte, et demandez une recommandation si le ton s\'y prête.') + '</span></p>' : '';

      // À partir de la troisième objection, la sortie propre passe devant la réponse.
      if (n >= 3 && !a.insister) {
        var sortie = G.varianteDe(g, 'sortie', 'sortie_non'), reco = G.varianteDe(g, 'sortie', 'sortie_recommandation');
        return tete + limite + (sortie ? htmlScript(sortie.texte, v) : '') +
          (reco ? '<p class="crm-gd-etiquette">Si le ton s\'y prête : demander une recommandation</p>' + htmlScript(reco.texte, v, 'crm-gd-script-suite') : '') +
          '<div class="crm-gd-reactions">' +
            '<button type="button" class="crm-gd-reaction" data-gd="objection-sortie" data-touche="1" aria-keyshortcuts="1">' + kbd('1') + '<span class="crm-gd-reaction-l">Il confirme son refus</span><small>' + esc(libelleResultat(o.si_refus === 'deja_site' ? 'deja_site' : 'pas_interesse')) + '</small></button>' +
            '<button type="button" class="crm-gd-reaction" data-gd="objection-insister" data-touche="2" aria-keyshortcuts="2">' + kbd('2') + '<span class="crm-gd-reaction-l">Voir quand même la réponse à cette objection</span></button>' +
          '</div></div>';
      }

      var suite = suiteObjection(o);
      var libelleSuite = suite === 'rdv' ? 'Ça passe' : suite === 'rappel' ? 'Il donne un moment' : 'Ça passe';
      var versSuite = suite === 'rdv' ? 'Rendez-vous' : suite === 'rappel' ? 'Rappel à noter' : 'on continue';
      var html = tete + limite + '<p class="crm-gd-sens"><b>Ce que ça veut dire.</b> ' + esc(G.remplir(o.sens_cache, v)) + '</p>' +
        htmlScript(G.texteDe(o, 'reponse', d), v) +
        '<p class="crm-gd-etiquette">Puis la relance</p>' + htmlScript(G.texteDe(o, 'relance', d), v, 'crm-gd-script-suite') +
        (o.conseil ? '<p class="crm-gd-conseil">' + ic('note', 14) + '<span>' + esc(G.remplir(o.conseil, v)) + '</span></p>' : '') +
        htmlPropose(a);
      if (a.pose) return html + '</div>';
      html += '<div class="crm-gd-reactions">' +
        '<button type="button" class="crm-gd-reaction crm-gd-reaction-oui" data-gd="objection-passe" data-touche="1" aria-keyshortcuts="1">' + kbd('1') +
          '<span class="crm-gd-reaction-l">' + esc(libelleSuite) + '</span><small>' + esc(versSuite) + '</small></button>' +
        '<button type="button" class="crm-gd-reaction crm-gd-reaction-non" data-gd="objection-refus" data-touche="2" aria-keyshortcuts="2">' + kbd('2') +
          '<span class="crm-gd-reaction-l">Toujours non</span><small>' + esc(libelleResultat(o.si_refus)) + '</small></button>';
      if (o.sinon) {
        html += '<button type="button" class="crm-gd-reaction" data-gd="objection-sinon" data-touche="3" aria-keyshortcuts="3">' + kbd('3') +
          '<span class="crm-gd-reaction-l">' + esc(o.sinon.quand) + '</span><small>' + esc(libelleResultat(o.sinon.resultat)) + '</small></button>';
      } else if (n >= 2) {
        html += '<button type="button" class="crm-gd-reaction" data-gd="objection-sortie" data-touche="3" aria-keyshortcuts="3">' + kbd('3') +
          '<span class="crm-gd-reaction-l">Sortie propre</span><small>' + esc(libelleResultat('pas_interesse')) + '</small></button>';
      }
      return html + '</div></div>';
    }

    function objectionsFiltrees(a) {
      var q = sansAccents(a.recherche).trim();
      return guide().objections.filter(function (o) { return !q || sansAccents(o.libelle).indexOf(q) >= 0; });
    }
    function htmlGrilleObjections(a) {
      var liste = objectionsFiltrees(a);
      if (!liste.length) return '<p class="crm-aide">Aucune objection ne correspond.</p>';
      return liste.map(function (o) {
        return '<button type="button" class="crm-gd-obj' + (a.objections.indexOf(o.id) >= 0 ? ' crm-gd-obj-entendue' : '') + '" data-gd="objection" data-id="' + esc(o.id) + '" aria-pressed="' + (a.objection === o.id) + '">' +
          esc(o.libelle) + '</button>';
      }).join('');
    }
    function htmlObjections(a) {
      var n = a.objections.length;
      return '<div class="crm-gd-objections" id="crmGdObjections"><div class="crm-gd-obj-tete"><h3>Objections' +
          (n ? '<span>' + esc(UI.pluriel(n, 'entendue')) + ' sur cet appel</span>' : '') + '</h3>' +
        '<label class="crm-gd-obj-cherche">' + ic('recherche', 14) + '<input type="search" id="crmGdRecherche" data-gdc="recherche" autocomplete="off" value="' + esc(a.recherche) +
          '" placeholder="Chercher une objection" aria-label="Chercher une objection" aria-keyshortcuts="O">' + kbd('O') + '</label></div>' +
        '<div class="crm-gd-obj-grille" id="crmGdGrille">' + htmlGrilleObjections(a) + '</div></div>';
    }

    /* Les conseils généraux citent parfois une variable (« plutôt {jour1} ou {jour2} ? ») : remplis comme le reste. */
    function htmlConseils(p, a) {
      var g = guide(), parTheme = [], themes = {}, v = vals(p, a);
      (g.conseils || []).forEach(function (c) {
        if (!themes[c.theme]) { themes[c.theme] = []; parTheme.push(c.theme); }
        themes[c.theme].push(c.texte);
      });
      return '<div class="crm-gd-conseils" id="crmGdConseils"><p class="crm-gd-etiquette">Les principes</p><ul>' +
        (g.principes || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
        parTheme.map(function (theme) {
          return '<p class="crm-gd-etiquette">' + esc(theme) + '</p><ul>' + themes[theme].map(function (t) { return '<li>' + esc(G.remplir(t, v)) + '</li>'; }).join('') + '</ul>';
        }).join('') +
        '<p class="crm-gd-etiquette">Cadre légal : repères à faire confirmer, pas un avis juridique</p><ul>' +
        (g.notes_legales || []).map(function (n) { return '<li>' + esc(n.texte) + '</li>'; }).join('') + '</ul></div>';
    }

    /* Le guide entier, pour la fiche du prospect courant. Replié : seuls le titre et le repère « bon moment » restent. */
    function htmlGuide() {
      var p = ctx.courant();
      if (!p) return '';
      var a = appelCourant();
      var tete = '<div class="crm-gd-tete"><button type="button" class="crm-gd-repli" id="crmGdRepli" data-gd="repli" aria-expanded="' + prefs.ouvert +
        '" aria-controls="crmGdCorps" aria-keyshortcuts="G">' + ic(prefs.ouvert ? 'chevronBas' : 'chevronDroit', 16) + '<span>Guide d\'appel</span>' + kbd('G') + '</button>' + htmlMoment(p) + '</div>';
      if (!prefs.ouvert) return '<section class="crm-gd crm-gd-replie" aria-label="Guide d\'appel">' + tete + '</section>';
      var corps = a.objection ? htmlObjection(p, a)
        : a.etape === 'qui' ? htmlQui(p, a)
          : a.etape === 'messagerie' ? htmlMessagerie(p, a)
            : a.etape === 'rappel' ? htmlEtapeRappel(p, a) : htmlEtape(p, a);
      // « Angle conseillé » : par où commencer, d'après les signaux de chaleur du prospect (site, fiche Google, OpenStreetMap).
      var angle = typeof CRM.angleProspect === 'function' ? CRM.angleProspect(p) : null;
      var htmlAngle = angle ? '<p class="crm-gd-angle" id="crmGdAngle" data-angle="' + esc(angle.cle) + '"><span class="crm-gd-etiquette">Angle conseillé</span><span>' + esc(angle.texte) + '</span></p>' : '';
      return '<section class="crm-gd" aria-label="Guide d\'appel">' + tete + htmlAngle + '<div class="crm-gd-corps" id="crmGdCorps">' + htmlFil(a) + corps + htmlObjections(a) +
        '<div class="crm-gd-pied"><button type="button" class="crm-lien" data-gd="conseils" aria-expanded="' + a.conseils + '" aria-controls="crmGdConseils">' + ic('note', 13) +
            (a.conseils ? 'Masquer les conseils' : 'Conseils et repères') + '</button>' +
          '<button type="button" class="crm-lien" data-gd="recommencer">' + ic('rouvrir', 13) + 'Recommencer l\'appel</button>' +
          '<button type="button" class="crm-lien" data-gd="editeur-ouvrir">' + ic('note', 13) + 'Modifier mon script</button></div>' +
        (a.conseils ? htmlConseils(p, a) : '') + '</div></section>';
    }

    /* L'ouverture du guide (version de Paul), pour le bloc « Voir l'accroche » de la fiche d'appel simple. */
    function htmlAccroche(p) {
      var variante = G.varianteDe(guide(), 'ouverture', 'ouverture_paul');
      if (!p || !variante) return '';
      return G.repliquesRemplies(variante.texte, vals(p, appelCourant())).map(function (m) { return '<p>« ' + esc(m) + ' »</p>'; }).join('');
    }

    // ───────────────────────────── Navigation dans le guide ─────────────────────────────

    function memoriser(a) {
      a.retour.push({ etape: a.etape, objection: a.objection, origine: a.origine, baseObjection: a.baseObjection, variantes: Object.assign({}, a.variantes), conseil: a.conseil, propose: a.propose, insister: a.insister });
      if (a.retour.length > 30) {
        a.retour.shift();
        // Les repères « hauteur de la pile à l'ouverture de l'objection » descendent d'un cran avec elle.
        a.retour.forEach(function (x) { if (x.baseObjection) x.baseObjection--; });
        if (a.baseObjection) a.baseObjection--;
      }
    }
    function restaurer(a, avant) {
      a.etape = avant.etape; a.objection = avant.objection; a.origine = avant.origine; a.baseObjection = avant.baseObjection;
      a.variantes = avant.variantes; a.conseil = avant.conseil; a.propose = avant.propose; a.insister = avant.insister;
    }
    /* Mémorise l'écran courant avant d'ouvrir une objection. À la première d'une série, la hauteur de la pile est
       notée : refermer l'objection ramène la pile à cette hauteur, et « Retour » recule alors vraiment d'une étape. */
    function memoriserAvantObjection(a) {
      var premiere = !a.objection;
      memoriser(a);
      if (premiere) a.baseObjection = a.retour.length - 1;
    }
    function fermerObjection(a) {
      var base = a.baseObjection;
      if (base != null && a.retour.length > base) {
        var avant = a.retour[base];
        a.retour.length = base;
        restaurer(a, avant);
      }
      a.objection = null; a.baseObjection = null; a.propose = null; a.insister = false;
    }
    function allerEtape(a, id, variante) {
      a.etape = id;
      a.objection = null;
      a.baseObjection = null;
      a.insister = false;
      if (variante) a.variantes[id] = variante;
      if (id === 'barrage') a.interlocuteur = 'barrage';
      else if (id === 'ouverture' || id === 'raison' || id === 'rdv' || id === 'conclusion') a.interlocuteur = 'patron';
      if (id in RANG && RANG[id] > (RANG[a.atteinte] || 0)) a.atteinte = id;
      if (id === 'ouverture' || a.variantes.ouverture) a.ouverture = (a.variantes.ouverture || (G.etapeDe(guide(), 'ouverture') || {}).defaut) || a.ouverture;
    }
    function ouvrirObjection(a, id) {
      if (!G.objectionDe(guide(), id)) return;
      if (!a.objection) a.origine = a.etape;
      a.objection = id;
      a.insister = false;
      a.recherche = '';
      if (a.objections.indexOf(id) < 0) a.objections.push(id);
      if (!a.interlocuteur) a.interlocuteur = 'patron';
    }

    /* Après un changement d'étape : le titre prend le foyer (les raccourcis restent actifs, un lecteur d'écran
       l'annonce) et le haut du guide revient à l'écran s'il en était sorti. */
    function montrer() {
      var titre = document.getElementById('crmGdTitre');
      if (titre) { try { titre.focus({ preventScroll: true }); } catch (e) { titre.focus(); } }
      var corps = document.getElementById('crmGdCorps');
      if (!corps) return;
      var r = corps.getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight * 0.6) corps.scrollIntoView({ block: 'start' });
    }
    function rendre(avecFoyer) {
      ctx.rendre();
      if (!avecFoyer) return;
      montrer();
      // Il vient de dire son jour : le foyer va sur les jours à toucher, pas sur le titre.
      if (document.getElementById('crmGdSansJour')) foyerSur('rdv-jour');
    }

    function reagir(p, a, i) {
      var g = guide(), e = G.etapeDe(g, etapeDesReactions(p, a)), r = e && e.reactions[i];
      if (!r) return;
      if (G.objectionDe(g, r.vers)) memoriserAvantObjection(a); else memoriser(a);
      a.conseil = r.conseil || '';
      a.propose = r.resultat || null;
      a.pose = null;
      if (G.objectionDe(g, r.vers)) { ouvrirObjection(a, r.vers); a.conseil = ''; }
      // « Tout est confirmé » : on n'affiche pas la sortie d'un refus, on enregistre le rendez-vous.
      else if (r.resultat === 'rdv') { allerEtape(a, 'conclusion'); rendre(false); foyer('crmGdRdvEnregistrer'); return; }
      else if (r.resultat === 'a_rappeler' && r.vers === 'sortie') { allerEtape(a, 'rappel'); a.variantes.rappel = 'sortie_pas_maintenant'; }
      else allerEtape(a, r.vers, r.variante || (r.vers === a.etape ? a.variantes[r.vers] : null));
      rendre(true);
    }

    function foyer(id) {
      var el = document.getElementById(id);
      if (el) { try { el.focus({ preventScroll: false }); } catch (e) { el.focus(); } }
    }
    /* Les puces et bascules du guide n'ont pas d'id : après un redessin, le foyer revient sur le bouton qui porte
       la même action (et la même valeur). Sans cela, le clavier repartirait du haut du guide à chaque choix. */
    function foyerSur(action, id) {
      var corps = document.getElementById('crmGdCorps');
      var liste = corps ? corps.querySelectorAll('[data-gd="' + action + '"]') : [];
      for (var i = 0; i < liste.length; i++) {
        if (id != null && liste[i].dataset.id !== id) continue;
        try { liste[i].focus({ preventScroll: true }); } catch (e) { liste[i].focus(); }
        return true;
      }
      return false;
    }
    function rendreSur(action, id) { ctx.rendre(); foyerSur(action, id); }

    // ───────────────────────────── Actions ─────────────────────────────

    /* Pose un résultat depuis le guide. Le cœur l'enregistre, crm-prospection.js journalise l'appel. */
    function poser(a, resultat) {
      var p = ctx.courant();
      if (!p || !resultatDe(resultat)) return Promise.resolve(null);
      var plusAppeler = a.etape === 'sortie' && a.variantes.sortie === 'sortie_plus_appeler' && resultat === 'pas_interesse';
      return ctx.resultat(resultat).then(function () {
        if (plusAppeler) {
          ctx.completerNote(p.id, function (note) { return G.noteAvecLigne(note, 'NE PLUS APPELER', 'demandé le ' + G.jourComplet(aujourdhui()) + ' ' + CRM.horloge().getFullYear()); });
        }
        if (resultat === 'pas_interesse' && /recommand|collègue/i.test(a.conseil)) foyer('crmProReco');
      });
    }

    function enregistrerRdv(p, a) {
      var r = a.rdv, jour = aujourdhui();
      if (r.envoi || r.fait) return;
      r.erreur = !/^\d{4}-\d{2}-\d{2}$/.test(r.jour) || !pur.versDate(r.jour) ? 'Choisissez le jour du rendez-vous.'
        : r.jour < jour ? 'Ce jour est déjà passé.'
          : !G.heureLisible(r.heure) ? 'Choisissez l\'heure du rendez-vous.' : '';
      if (r.erreur) { rendre(false); foyer(/jour/.test(r.erreur) ? 'crmGdRdvJour' : 'crmGdRdvHeure'); return; }
      var prenom = prenomDe(p, a), canal = G.canalDe(r.canal);
      var quand = G.jourComplet(r.jour) + ' à ' + G.heureLisible(r.heure);
      r.envoi = true;
      rendre(false);
      ctx.resultat('rdv').then(function () {
        var trace = { ligne: quand + ', ' + canal.dit, tache: Promise.resolve(null) };
        (traces[p.id] = traces[p.id] || {}).rdv = trace;
        ctx.completerNote(p.id, function (note) {
          var n = G.noteAvecLigne(note, 'RDV', trace.ligne);
          return prenom ? G.noteAvecLigne(n, 'Patron', prenom) : n;
        });
        var titre = ('Rendez-vous démo à ' + G.heureLisible(r.heure) + ' (' + canal.libelle.toLowerCase() + ')' + (prenom ? ' avec ' + prenom : '')).slice(0, 300);
        var fiche = ctx.ficheCrm(p);
        var deja = fiche && (fiche.taches || []).some(function (t) { return !t.fait_at && t.titre === titre && t.echeance === r.jour; });
        if (deja) return 'La tâche existe déjà dans le CRM.';
        // Seule une tâche créée ici sera retirée si le rendez-vous est annulé ; celle qui existait déjà reste.
        var creation = CRM.ajouterTache('p:' + p.id, { titre: titre, echeance: r.jour });
        trace.tache = creation.then(function (t) { return t && t.id; }, function () { return null; });
        return creation.then(function () {
          return 'Tâche créée dans le CRM pour ' + G.jourComplet(r.jour) + '.';
        }, function (e) { return 'La tâche n\'a pas pu être créée dans le CRM (' + ((e && e.message) || 'erreur') + ') : notez le rendez-vous à la main.'; });
      }).then(function (tache) {
        r.envoi = false; r.fait = true; r.tache = tache;
        a.propose = null;
        if (appel === a) { rendre(false); foyer('crmGdSmsLien'); }
      }, function () {
        // Le refus du résultat est déjà signalé par la fiche d'appel.
        r.envoi = false;
        if (appel === a) rendre(false);
      });
    }

    function enregistrerRappel(p, a) {
      var r = a.rappel, jour = aujourdhui();
      if (r.envoi || r.fait) return;
      r.erreur = r.jour && (!pur.versDate(r.jour) || r.jour < jour) ? 'Cette date de rappel est déjà passée.'
        : r.heure && !G.heureLisible(r.heure) ? 'Cette heure n\'en est pas une.' : '';
      if (r.erreur) { rendre(false); return; }
      var prenom = prenomDe(p, a);
      var quand = [r.jour ? G.jourComplet(r.jour) : '', r.heure ? 'vers ' + G.heureLisible(r.heure) : ''].filter(Boolean).join(' ');
      r.envoi = true;
      rendre(false);
      ctx.resultat('a_rappeler').then(function () {
        var ligne = quand ? quand + (a.interlocuteur === 'barrage' ? ' (dit en boutique)' : '') : '';
        (traces[p.id] = traces[p.id] || {}).rappel = { ligne: ligne };
        ctx.completerNote(p.id, function (note) {
          var n = ligne ? G.noteAvecLigne(note, 'Rappeler', ligne) : note;
          return prenom ? G.noteAvecLigne(n, 'Patron', prenom) : n;
        });
        return r.jour ? CRM.majProspect(p.id, { rappel_le: r.jour }).then(null, function (e) { ctx.erreur(e, 'La date de rappel n\'a pas pu être enregistrée.'); }) : null;
      }).then(function () {
        r.envoi = false; r.fait = true;
        a.propose = null;
        if (appel === a) rendre(false);
      }, function () {
        r.envoi = false;
        if (appel === a) rendre(false);
      });
    }

    /* Le résultat de la fiche n'est plus celui que le guide avait enregistré (effacé, ou remplacé) : ce que le guide
       avait écrit avec lui s'en va aussi. Le rendez-vous : sa tâche dans le CRM et sa ligne « RDV » dans la note.
       Le rappel : sa ligne « Rappeler » (la date de rappel est déjà remise à zéro par le cœur). Le prénom du patron
       reste. Le formulaire revient, avec ce qui était saisi. */
    function defaire(id, resultat) {
      var t = traces[id], a = appel && appel.id === id ? appel : null, quoi = '';
      if (!t) return;
      if (t.rdv && resultat !== 'rdv') {
        var rdv = t.rdv;
        delete t.rdv;
        if (a) { a.rdv.fait = false; a.rdv.envoi = false; a.rdv.tache = ''; }
        ctx.completerNote(id, function (note) { return G.ligneDeNote(note, 'RDV') === rdv.ligne ? G.noteAvecLigne(note, 'RDV', '') : note; });
        rdv.tache.then(function (idTache) { return idTache ? CRM.supprimerTache(idTache) : null; })
          .then(null, function (e) { ctx.erreur(e, 'La tâche du rendez-vous n\'a pas pu être retirée du CRM : supprimez-la dans la fiche.'); });
        quoi = 'Rendez-vous annulé : la tâche et la ligne de la note sont retirées';
      }
      if (t.rappel && resultat !== 'a_rappeler') {
        var rappel = t.rappel;
        delete t.rappel;
        if (a) { a.rappel.fait = false; a.rappel.envoi = false; }
        if (rappel.ligne) ctx.completerNote(id, function (note) { return G.ligneDeNote(note, 'Rappeler') === rappel.ligne ? G.noteAvecLigne(note, 'Rappeler', '') : note; });
        quoi = quoi || 'Rappel annulé : la date et la ligne de la note sont retirées';
      }
      if (!quoi) return;
      ctx.toast(quoi);
      ctx.rendre();
    }
    function annulerEnregistrement(p, idBouton) {
      var suite = function () { if (appel && appel.id === p.id) foyer(idBouton); };
      if (!p.resultat) { defaire(p.id, null); suite(); return; }
      // Le refus de l'effacement est déjà signalé par la fiche d'appel.
      ctx.effacerResultat().then(suite, function () {});
    }

    function basculer() {
      prefs.ouvert = !prefs.ouvert;
      ecrirePref(CLE_REPLI, prefs.ouvert ? '1' : '0');
      ctx.rendre();
      foyer('crmGdRepli');
    }

    function surClic(e) {
      var el = e.target.closest('[data-gd]');
      if (!el || el.disabled) return;
      var action = el.dataset.gd, id = el.dataset.id;
      if (traiterMesure(action, id) || traiterEditeur(action, id)) return;
      var p = ctx.courant(), a = appelCourant();
      if (action === 'repli') { basculer(); return; }
      if (action === 'editeur-ouvrir') { ouvrirEditeur(); return; }
      if (!p || !a) return;
      var g = guide(), o = a.objection ? G.objectionDe(g, a.objection) : null;
      switch (action) {
        case 'etape':
          if (a.etape === id && !a.objection) break;
          memoriser(a); a.conseil = ''; a.propose = null; allerEtape(a, id); rendre(true);
          break;
        case 'retour':
          var avant = a.retour.pop();
          if (avant) restaurer(a, avant);
          rendre(true);
          break;
        case 'qui':
          memoriser(a);
          a.conseil = '';
          if (id === 'patron') allerEtape(a, 'ouverture');
          else if (id === 'barrage') allerEtape(a, 'barrage');
          else if (id === 'messagerie') allerEtape(a, 'messagerie');
          else { poser(a, 'pas_de_reponse'); break; }
          rendre(true);
          break;
        case 'reaction': reagir(p, a, +id); break;
        case 'courte':
          a.variantes.ouverture = varianteCourante(p, a, 'ouverture').id === 'ouverture_courte' ? null : 'ouverture_courte';
          a.ouverture = a.variantes.ouverture || G.etapeDe(g, 'ouverture').defaut;
          ctx.rendre(); foyer('crmGdCourte');
          break;
        case 'objection':
          if (a.objection === id) break;
          memoriserAvantObjection(a); a.propose = null; a.conseil = ''; ouvrirObjection(a, id); rendre(true);
          break;
        case 'objection-fermer': fermerObjection(a); rendre(true); break;
        case 'objection-insister': a.insister = true; rendre(true); break;
        case 'objection-passe':
          if (!o) break;
          memoriser(a);
          var suite = suiteObjection(o);
          a.propose = null;
          a.conseil = '';
          // Jour et heure déjà convenus (il s'était rétracté après la conclusion) : on ne les redemande pas.
          if (suite === 'rdv' && a.rdv.jour && G.heureLisible(a.rdv.heure)) allerEtape(a, 'conclusion');
          else if (suite === 'rdv') allerEtape(a, 'rdv', 'rdv_heure');
          else if (suite === 'rappel') { allerEtape(a, 'rappel'); a.variantes.rappel = null; a.propose = 'a_rappeler'; }
          else allerEtape(a, a.origine === 'ouverture' || a.origine === 'qui' || !G.etapeDe(g, a.origine) ? 'raison' : a.origine);
          rendre(true);
          break;
        case 'objection-refus':
          if (!o) break;
          memoriser(a);
          a.conseil = '';
          if (o.si_refus === 'a_rappeler') { allerEtape(a, 'rappel'); a.variantes.rappel = 'sortie_pas_maintenant'; a.propose = 'a_rappeler'; }
          else if (o.si_refus === 'interesse') { a.propose = 'interesse'; rendre(false); foyer('crmGdPoser'); break; }
          else { allerEtape(a, 'sortie', o.si_refus === 'deja_site' ? 'sortie_deja_equipe' : 'sortie_non'); a.propose = o.si_refus; }
          rendre(true);
          break;
        case 'objection-sinon':
          if (!o || !o.sinon) break;
          memoriser(a);
          a.conseil = '';
          allerEtape(a, o.sinon.vers, o.sinon.variante);
          a.propose = o.sinon.resultat;
          rendre(true);
          break;
        case 'objection-sortie':
          memoriser(a);
          a.conseil = '';
          allerEtape(a, 'sortie', o && o.si_refus === 'deja_site' ? 'sortie_deja_equipe' : 'sortie_non');
          a.propose = o && o.si_refus === 'deja_site' ? 'deja_site' : 'pas_interesse';
          rendre(true);
          break;
        case 'poser': poser(a, id); break;
        case 'rdv-jour':
          a.rdv.jour = a.rdv.jour === id ? '' : id;
          a.rdv.erreur = '';
          if (a.rdv.jour && etapeDesReactions(p, a) === 'rdv') { memoriser(a); allerEtape(a, 'rdv', 'rdv_heure'); a.conseil = ''; }
          rendreSur(action, id);
          break;
        case 'rdv-heure':
          a.rdv.heure = a.rdv.heure === id ? '' : id;
          a.rdv.erreur = '';
          if (a.rdv.heure && a.rdv.jour && etapeDesReactions(p, a) === 'rdv') { memoriser(a); allerEtape(a, 'conclusion'); a.conseil = ''; rendre(true); break; }
          rendreSur(action, id);
          break;
        case 'rdv-canal':
          a.rdv.canal = id;
          // « Sur place » a son propre texte de conclusion ; on y passe, et on en revient, sans le demander.
          if (id === 'place' && !a.variantes.conclusion) a.variantes.conclusion = 'conclusion_boutique';
          else if (id !== 'place' && a.variantes.conclusion === 'conclusion_boutique') a.variantes.conclusion = null;
          rendreSur(action, id);
          break;
        case 'rdv-enregistrer': enregistrerRdv(p, a); break;
        case 'rdv-annuler': annulerEnregistrement(p, 'crmGdRdvEnregistrer'); break;
        case 'rappel-jour': a.rappel.jour = a.rappel.jour === id ? '' : id; a.rappel.erreur = ''; rendreSur(action, id); break;
        case 'rappel-heure': a.rappel.heure = a.rappel.heure === id ? '' : id; a.rappel.erreur = ''; rendreSur(action, id); break;
        case 'rappel-enregistrer': enregistrerRappel(p, a); break;
        case 'rappel-annuler': annulerEnregistrement(p, 'crmGdRappelEnregistrer'); break;
        case 'sms-relance': a.sms = !a.sms; rendreSur(action); break;
        case 'sms-copier':
          var zone = document.getElementById('crmGdSmsTexte');
          if (zone) UI.copier(zone.textContent, 'SMS copié');
          break;
        case 'fiche-crm': ctx.ouvrirFicheCrm(p.id); break;
        case 'suivant': ctx.suivant(); break;
        case 'conseils': a.conseils = !a.conseils; rendreSur(action); break;
        case 'recommencer': appel = appelNeuf(p.id); rendre(true); break;
      }
    }

    function surSaisie(e) {
      var el = e.target, champ = el.dataset && el.dataset.gdc;
      if (!champ) return;
      var texte = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|tel|search|number)$/.test(el.type));
      if (texte !== (e.type === 'input')) return;
      if (saisieMesure(champ, el) || saisieEditeur(champ, el)) return;
      var p = ctx.courant(), a = appelCourant(), v = el.value;
      if (!p || !a) return;
      switch (champ) {
        case 'variante':
          a.variantes[a.etape] = v;
          if (a.etape === 'ouverture') a.ouverture = v;
          ctx.rendre();
          break;
        case 'recherche':
          a.recherche = v;
          var grille = document.getElementById('crmGdGrille');
          if (grille) grille.innerHTML = htmlGrilleObjections(a);
          break;
        // Pas de redessin ici, ni à la sortie du champ : le bouton que le pouce vise juste après serait remplacé sous
        // lui et le toucher perdu. Le prénom entre dans les répliques au prochain changement d'écran.
        case 'prenom': a.prenom = v; break;
        // Date et heure : choisies d'un coup (sélecteur), l'écran suit aussitôt. Tapées au clavier, le navigateur
        // annonce un changement dès que la valeur est complète, en pleine frappe : l'état suit, l'écran attend la
        // sortie du champ (voir surSortie), sinon le champ serait remplacé sous le curseur.
        case 'rdv-jour':
          a.rdv.jour = v; a.rdv.erreur = '';
          if (v && v >= aujourdhui() && etapeDesReactions(p, a) === 'rdv') allerEtape(a, 'rdv', 'rdv_heure');
          rendreApresDate(el);
          break;
        case 'rdv-heure': a.rdv.heure = v; a.rdv.erreur = ''; rendreApresDate(el); break;
        case 'rappel-jour': a.rappel.jour = v; a.rappel.erreur = ''; rendreApresDate(el); break;
        case 'rappel-heure': a.rappel.heure = v; a.rappel.erreur = ''; rendreApresDate(el); break;
      }
    }
    /* Le champ où l'on tape ne déclenche pas de dessin. On ne se fie pas ici à document.activeElement : quand un
       segment (jour, mois, minutes) est complet, le navigateur passe au suivant et annonce le changement à ce
       moment-là, alors que le foyer n'est, un instant, sur aucun élément. */
    function rendreApresDate(el) { if (frappe !== el.id) ctx.rendre(); }
    /* Vrai tant qu'une date ou une heure est en cours de frappe dans le guide : crm-prospection.js ne redessine pas. */
    function saisieEnCours() {
      var el = frappe ? document.getElementById(frappe) : null;
      if (!el) frappe = null;
      return !!el && document.activeElement === el;
    }
    function surFrappe(e) {
      var el = e.target;
      if (!el || !el.id || !el.dataset || !CHAMPS_DATE[el.dataset.gdc] || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length === 1 || /^(Backspace|Delete|Arrow(Up|Down|Left|Right))$/.test(e.key)) frappe = el.id;
      // Entrée valide la saisie : l'écran suit tout de suite, le curseur reste dans le champ.
      else if (e.key === 'Enter' && frappe === el.id) { frappe = null; ctx.rendre(); }
    }
    /* Sortie d'un champ date ou heure tapé au clavier : l'écran rattrape l'état. Un court délai laisse aboutir le
       toucher qui a fait sortir du champ (le bouton visé ne doit pas être remplacé sous le doigt) ; le foyer, s'il
       est passé sur une puce du guide, y revient après le redessin. */
    function surSortie(e) {
      var el = e.target;
      if (!frappe || !el || el.id !== frappe) return;
      frappe = null;
      setTimeout(function () {
        var f = document.activeElement, action = f && f.dataset && !f.id ? f.dataset.gd : null, id = action ? f.dataset.id : null;
        ctx.rendre();
        if (action && !(document.activeElement && document.activeElement.dataset && document.activeElement.dataset.gd === action)) foyerSur(action, id);
      }, 300);
    }

    /* Raccourcis du guide. Jamais pendant une saisie (note, recommandation, formulaires), jamais avec une touche
       de combinaison, jamais quand la fiche CRM ou un menu est ouvert. Les touches du CRM (« / », j, k, flèches)
       ne sont pas reprises ici. */
    function surTouche(e) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || !ctx.actif() || editeur.ouvert) return;
      var el = e.target, a = appelCourant();
      var saisie = !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
      if (saisie) {
        if (el.id !== 'crmGdRecherche' || !a) return;
        if (e.key === 'Enter') {
          var premiere = objectionsFiltrees(a)[0];
          if (premiere) { e.preventDefault(); memoriserAvantObjection(a); a.propose = null; a.conseil = ''; ouvrirObjection(a, premiere.id); rendre(true); }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          if (a.recherche) { a.recherche = ''; ctx.rendre(); } else el.blur();
        }
        return;
      }
      var touche = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (touche === 'g') { e.preventDefault(); basculer(); return; }
      if (!prefs.ouvert || !a) return;
      if (touche === 'o') { e.preventDefault(); foyer('crmGdRecherche'); return; }
      // Entrée sur un bouton ou un lien reste l'action de ce bouton.
      if (touche === 'Enter' && el && el.closest && el.closest('button, a, summary, [role=button]')) return;
      if (!/^([0-9c]|Enter|Escape|Backspace)$/.test(touche)) return;
      var corps = document.getElementById('crmGdCorps');
      var cible = corps && corps.querySelector('[data-touche="' + touche + '"]:not(:disabled)');
      if (!cible) return;
      e.preventDefault();
      cible.click();
    }
    document.addEventListener('keydown', surTouche);

    // ───────────────────────────── « Mes appels » ─────────────────────────────

    function objectif() {
      var n = Math.round(Number(CRM.reglage(REGLAGE_OBJECTIF)));
      return n >= 1 && n <= OBJECTIF_MAX ? n : 0;
    }
    /* Sans journal d'appels (migration non appliquée), on connaît encore les commerces appelés aujourd'hui. */
    function appelesAujourdhui() {
      var jour = aujourdhui();
      return (CRM.prospects || []).filter(function (p) { return p.appele_at && pur.dateLocaleISO(p.appele_at) === jour; }).length;
    }
    function pourcent(n) { return n == null ? '' : n + ' %'; }

    function htmlTuiles(titre, c, journal) {
      function tuile(valeur, libelle, detail) {
        return '<div class="crm-ms-tuile"><b>' + esc(valeur) + '</b><span>' + esc(libelle) + '</span>' + (detail ? '<small>' + esc(detail) + '</small>' : '') + '</div>';
      }
      if (!journal) return '';
      return '<div class="crm-ms-periode"><p class="crm-gd-etiquette">' + esc(titre) + '</p><div class="crm-ms-tuiles">' +
        tuile(c.appels, c.appels > 1 ? 'appels' : 'appel', '') +
        tuile(c.decroches, c.decroches > 1 ? 'décrochés' : 'décroché', c.appels ? pourcent(c.tauxDecroche) + ' des appels' : '') +
        tuile(c.patron, c.patron > 1 ? 'patrons joints' : 'patron joint', '') +
        tuile(c.rdv, 'rendez-vous', c.appels ? pourcent(c.tauxRdv) + ' des appels' : '') + '</div></div>';
    }

    function htmlMesure() {
      var journal = !!CRM.etat.appels;
      var s = G.statsAppels(journal ? CRM.appels : [], CRM.horloge(), guide());
      var faits = journal ? s.jour.appels : appelesAujourdhui();
      var but = objectif();
      var pct = but ? Math.min(100, Math.round(100 * faits / but)) : 0;
      var resume = 'Aujourd\'hui : ' + (journal ? UI.pluriel(faits, 'appel') : UI.pluriel(faits, 'commerce appelé', 'commerces appelés')) + (but ? ' sur ' + but : '') +
        (journal && s.jour.rdv ? ' · ' + s.jour.rdv + ' rendez-vous' : '');
      var html = '<section class="crm-ms' + (prefs.mesure ? '' : ' crm-ms-replie') + '" aria-label="Mes appels">' +
        '<button type="button" class="crm-ms-tete" id="crmMsTete" data-gd="mesure-repli" aria-expanded="' + prefs.mesure + '" aria-controls="crmMsCorps">' +
          ic(prefs.mesure ? 'chevronBas' : 'chevronDroit', 16) + '<b>Mes appels</b><span id="crmMsResume">' + esc(resume) + '</span>' +
          (but ? '<span class="crm-pro-progres crm-ms-jauge" role="progressbar" aria-label="Objectif d\'appels du jour" aria-valuemin="0" aria-valuemax="' + but + '" aria-valuenow="' + Math.min(faits, but) + '"><i style="width:' + pct + '%"></i></span>' : '') +
        '</button>';
      if (!prefs.mesure) return html + '</section>';

      html += '<div class="crm-ms-corps" id="crmMsCorps">';
      if (!journal) {
        html += '<p class="crm-ms-note">' + ic('cadenas', 14) + '<span>Le journal d\'appels n\'est pas encore actif : la migration <code>20261114_crm_appels.sql</code> n\'est pas appliquée. ' +
          'Décrochés, rendez-vous, objections et créneaux s\'afficheront une fois la table en place. Les appels, eux, s\'enregistrent normalement.</span></p>';
      } else {
        html += '<div class="crm-ms-periodes">' + htmlTuiles('Aujourd\'hui', s.jour, true) + htmlTuiles('7 derniers jours', s.semaine, true) + '</div>' +
          (s.semaine.appels ? '' : '<p class="crm-aide">Aucun appel journalisé sur les 7 derniers jours : les chiffres se remplissent à chaque résultat posé.</p>');
      }

      var saisi = mesure.saisie != null ? mesure.saisie : (but ? String(but) : '');
      html += '<div class="crm-ms-objectif"><label class="crm-pro-champ" for="crmMsObjectif"><span>Objectif d\'appels du jour</span></label>' +
        '<div class="crm-ms-objectif-ligne"><input type="number" inputmode="numeric" id="crmMsObjectif" data-gdc="objectif" min="1" max="' + OBJECTIF_MAX + '" step="1" value="' + esc(saisi) + '" placeholder="Par exemple 30">' +
          '<button type="button" class="crm-btn crm-btn-or" data-gd="objectif-enregistrer"' + (mesure.envoi ? ' disabled' : '') + '>Enregistrer</button></div>' +
        '<p class="crm-aide" id="crmMsObjectifEtat">' + esc(!but ? 'Aucun objectif fixé.'
          : faits >= but ? 'Objectif atteint : ' + faits + ' sur ' + but + '.'
            : 'Encore ' + UI.pluriel(but - faits, 'appel') + ' pour atteindre ' + but + '.') +
          (CRM.reglageSurAppareil(REGLAGE_OBJECTIF) ? ' Enregistré sur cet appareil seulement.' : '') + '</p></div>';

      if (journal) {
        html += '<div class="crm-ms-bloc"><p class="crm-gd-etiquette">Objections les plus entendues, sur 90 jours</p>' +
          (s.objections.length ? '<ol class="crm-ms-liste">' + s.objections.slice(0, 5).map(function (o) {
            return '<li><span>' + esc(o.libelle) + '</span><b>' + o.n + '</b></li>';
          }).join('') + '</ol>' : '<p class="crm-aide">Aucune objection notée pour l\'instant : touchez celles que vous entendez pendant l\'appel.</p>') + '</div>' +
          '<div class="crm-ms-bloc"><p class="crm-gd-etiquette">Meilleurs créneaux constatés, sur 90 jours</p>' +
          (s.creneaux.assez ? '<ol class="crm-ms-liste">' + s.creneaux.lignes.map(function (l) {
            return '<li><span>' + l.heure + ' h – ' + (l.heure + 1) + ' h</span><b>' + esc(pourcent(l.taux)) + ' de décrochés</b><small>' + l.decroches + ' sur ' + esc(UI.pluriel(l.appels, 'appel')) + '</small></li>';
          }).join('') + '</ol>' : '<p class="crm-aide">Pas encore assez d\'appels pour le dire : ' + s.creneaux.total + ' sur les ' + s.creneaux.seuil +
            ' nécessaires. En attendant, le repère « bon moment » suit les créneaux du guide, qui ne sont pas des mesures.</p>') + '</div>';
        if (s.versions.length > 1) {
          html += '<div class="crm-ms-bloc"><p class="crm-gd-etiquette">Ouvertures comparées, sur 90 jours</p><ol class="crm-ms-liste">' + s.versions.map(function (x) {
            var id = x.version.replace(/\+perso$/, ''), v = G.varianteDe(guide(), 'ouverture', id);
            return '<li><span>' + esc((v && v.id === id ? v.nom : x.version) + (/\+perso$/.test(x.version) ? ' (texte modifié)' : '')) + '</span><b>' + esc(UI.pluriel(x.rdv, 'rendez-vous', 'rendez-vous')) + '</b><small>' +
              esc(UI.pluriel(x.appels, 'appel') + ', ' + UI.pluriel(x.patron, 'patron joint', 'patrons joints')) + '</small></li>';
          }).join('') + '</ol></div>';
        }
      }
      return html + '</div></section>';
    }

    function traiterMesure(action) {
      if (action === 'mesure-repli') {
        prefs.mesure = !prefs.mesure;
        ecrirePref(CLE_MESURE, prefs.mesure ? '1' : '0');
        ctx.rendre(); foyer('crmMsTete');
        return true;
      }
      if (action !== 'objectif-enregistrer') return false;
      var n = Math.round(Number(mesure.saisie != null ? mesure.saisie : objectif()));
      if (!(n >= 1 && n <= OBJECTIF_MAX)) { ctx.toast('L\'objectif est un nombre d\'appels entre 1 et ' + OBJECTIF_MAX + '.', { type: 'erreur' }); foyer('crmMsObjectif'); return true; }
      mesure.envoi = true;
      ctx.rendre();
      CRM.ecrireReglage(REGLAGE_OBJECTIF, n).then(function (r) {
        ctx.toast(r.ou === 'base' ? 'Objectif enregistré : ' + n + ' appels par jour' : 'Objectif gardé sur cet appareil : ' + n + ' appels par jour');
      }, function (e) { ctx.erreur(e, 'L\'objectif n\'a pas pu être enregistré.'); }).then(function () {
        mesure.envoi = false; mesure.saisie = null;
        ctx.rendre();
      });
      return true;
    }
    function saisieMesure(champ, el) {
      if (champ !== 'objectif') return false;
      mesure.saisie = el.value;
      return true;
    }

    // ───────────────────────────── « Modifier mon script » ─────────────────────────────

    function textesEnregistres() { guide(); return cache.perso.textes; }
    function ouvrirEditeur() {
      if (!editeur.textes) { editeur.textes = Object.assign({}, textesEnregistres()); editeur.tel = cache.perso.tel_paul || ''; }
      editeur.ouvert = true;
      ctx.rendre();
      window.scrollTo({ top: 0 });
      foyer('crmEdTitre');
    }
    function defauts() {
      // Sans prototype : « constructor » ou « toString » ne passent pas pour des blocs connus.
      var carte = Object.create(null);
      G.blocs(G.DEFAUT).forEach(function (b) { carte[b.cle] = b; });
      return carte;
    }
    /* Ce qui partirait à l'enregistrement : seulement les textes qui diffèrent de l'original. */
    function ecarts() {
      var d = defauts(), o = {};
      Object.keys(editeur.textes || {}).forEach(function (cle) {
        var t = String(editeur.textes[cle]).trim();
        if (d[cle] && t !== d[cle].texte) o[cle] = t;
      });
      return o;
    }
    function editeurModifie() {
      if (!editeur.textes) return false;
      return JSON.stringify(ecarts()) !== JSON.stringify(textesEnregistres()) || G.nettoyerPerso({ tel_paul: editeur.tel }).tel_paul !== (cache.perso.tel_paul || '');
    }
    function texteBloc(b) { return editeur.textes && b.cle in editeur.textes ? editeur.textes[b.cle] : b.texte; }

    function valeursApercu(p, sansDemo) {
      var jours = G.joursProposes(CRM.horloge());
      var tel = G.nettoyerPerso({ tel_paul: editeur.tel }).tel_paul;
      return G.valeurs(p, {
        maintenant: CRM.horloge(), guide: G.DEFAUT, offres: CRM.OFFRES, demo: !sansDemo,
        telPaul: tel ? (pur.formaterTel(tel) || tel) : '', prenom: G.prenomDepuisNote(p.note) || 'Marc',
        jourRdv: jours[0] ? jours[0].date : '', heureRdv: '15:00', canal: 'telephone', jourRappel: jours[1] ? jours[1].date : '',
        recommandant: 'Julie, de la fromagerie d\'à côté'
      });
    }
    function htmlApercu(b, p) {
      return htmlScript(texteBloc(b), valeursApercu(p, b.sansDemo), 'crm-ed-script');
    }
    function htmlEtatBloc(b) {
      var c = G.validerTexte(b.cle, texteBloc(b));
      return c.erreurs.map(function (m) { return '<span>' + ic('alerte', 13) + esc(m) + '</span>'; }).join('');
    }

    function htmlEditeur() {
      var p = ctx.courant() || EXEMPLE, d = defauts();
      var tous = G.blocs(G.DEFAUT), groupes = [], vus = {};
      tous.forEach(function (b) { if (!vus[b.groupe]) { vus[b.groupe] = true; groupes.push(b.groupe); } });
      var modifie = editeurModifie();
      var surAppareil = CRM.reglageSurAppareil(REGLAGE_SCRIPT);
      var html = '<div class="crm-ed"><div class="crm-ed-tete"><button type="button" class="crm-btn" data-gd="editeur-fermer">' + ic('chevronGauche', 14) + 'Revenir aux appels</button>' +
        '<h2 id="crmEdTitre" tabindex="-1">Modifier mon script</h2></div>' +
        '<p class="crm-aide">Le texte d\'origine reste dans l\'outil : « Rétablir le texte d\'origine » le remet, bloc par bloc. Les « … » marquent l\'endroit où le commerçant répond. ' +
          'Aperçu sur <b>' + esc(p.nom) + '</b>.</p>' +
        '<div class="crm-ed-barre"><p id="crmEdEtat" role="status">' + (modifie ? ic('alerte', 14) + 'Modifications non enregistrées'
          : surAppareil ? ic('cadenas', 14) + 'Enregistré sur cet appareil seulement : la table des réglages ne répond pas (migration 20261114_crm_appels.sql).'
            : Object.keys(textesEnregistres()).length ? ic('coche', 14) + esc(UI.pluriel(Object.keys(textesEnregistres()).length, 'texte personnalisé', 'textes personnalisés')) + ' en service'
              : 'Vous utilisez le script d\'origine.') + '</p>' +
          '<button type="button" class="crm-btn crm-btn-plein" id="crmEdEnregistrer" data-gd="editeur-enregistrer"' + (editeur.envoi ? ' disabled' : '') + '>' + (editeur.envoi ? 'Enregistrement…' : 'Enregistrer mon script') + '</button></div>' +
        '<label class="crm-pro-champ crm-ed-tel"><span>Mon numéro de rappel, dit à la fin des messages vocaux</span><input type="tel" inputmode="tel" id="crmEdTel" data-gdc="ed-tel" maxlength="20" autocomplete="off" value="' +
          esc(editeur.tel) + '" placeholder="06 12 34 56 78"></label>' +
        '<div class="crm-ed-groupes" role="group" aria-label="Partie du script">' + groupes.map(function (id) {
          var n = tous.filter(function (b) { return b.groupe === id && texteBloc(b).trim() !== d[b.cle].texte; }).length;
          return '<button type="button" class="crm-puce" data-gd="ed-groupe" data-id="' + id + '" aria-pressed="' + (editeur.groupe === id) + '">' + esc(G.TITRES_GROUPE[id] || id) +
            (n ? '<span class="crm-ed-nb">' + n + '</span>' : '') + '</button>';
        }).join('') + '</div><div class="crm-ed-blocs">';
      tous.forEach(function (b, i) {
        if (b.groupe !== editeur.groupe) return;
        var texte = texteBloc(b), change = texte.trim() !== d[b.cle].texte, c = G.validerTexte(b.cle, texte);
        html += '<div class="crm-ed-bloc' + (change ? ' crm-ed-bloc-modifie' : '') + '" data-cle="' + esc(b.cle) + '">' +
          '<div class="crm-ed-bloc-tete"><label for="crmEd-' + i + '">' + esc(b.titre) + (b.sansSms ? '<i>numéro fixe, sans SMS</i>' : b.avecJumeau ? '<i>' + (b.sansDemo ? 'démo pas encore prête' : 'démo prête') + '</i>' : b.avecSansSms ? '<i>numéro de portable</i>' : '') +
            (change ? '<em>modifié</em>' : '') + '</label><span class="crm-ed-compteur' + (c.longueur > c.max ? ' crm-ed-trop' : '') + '" id="crmEdCompteur-' + i + '">' + c.longueur + ' / ' + c.max + '</span></div>' +
          (b.quand ? '<p class="crm-aide">' + esc(b.quand) + '</p>' : '') +
          '<textarea id="crmEd-' + i + '" data-gdc="ed-texte" data-id="' + esc(b.cle) + '" data-n="' + i + '" rows="4" maxlength="' + (b.max + 400) + '" aria-describedby="crmEdErreur-' + i + '"' +
            (c.ok ? '' : ' aria-invalid="true"') + '>' + esc(texte) + '</textarea>' +
          '<p class="crm-ed-erreur" id="crmEdErreur-' + i + '" role="alert">' + htmlEtatBloc(b) + '</p>' +
          '<div class="crm-ed-apercu"><p class="crm-gd-etiquette">Aperçu</p><div id="crmEdApercu-' + i + '">' + htmlApercu(b, p) + '</div></div>' +
          (change ? '<button type="button" class="crm-lien" data-gd="ed-retablir" data-id="' + esc(b.cle) + '">' + ic('rouvrir', 13) + 'Rétablir le texte d\'origine</button>' : '') + '</div>';
      });
      html += '</div><div class="crm-ed-variables"><p class="crm-gd-etiquette">Variables utilisables</p><ul>' + Object.keys(G.VARIABLES).map(function (nom) {
        return '<li><code>{' + esc(nom) + '}</code> ' + esc(G.VARIABLES[nom]) + '</li>';
      }).join('') + '</ul></div></div>';
      return html;
    }

    function enregistrerScript() {
      if (editeur.envoi) return;
      var textes = ecarts(), cles = Object.keys(textes), premiere = null;
      cles.forEach(function (cle) { if (!premiere && !G.validerTexte(cle, textes[cle]).ok) premiere = cle; });
      // Un bloc vidé ne figure pas dans les écarts valides : on le signale aussi.
      Object.keys(editeur.textes).forEach(function (cle) { if (!premiere && !String(editeur.textes[cle]).trim()) premiere = cle; });
      if (premiere) {
        var d = defauts();
        editeur.groupe = d[premiere].groupe;
        ctx.toast('Un texte est à corriger avant d\'enregistrer : ' + d[premiere].titre + '.', { type: 'erreur' });
        ctx.rendre();
        var zone = document.querySelector('.crm-ed-bloc[data-cle="' + premiere + '"] textarea');
        if (zone) zone.focus();
        return;
      }
      var valeur = { v: 1, textes: textes, tel_paul: G.nettoyerPerso({ tel_paul: editeur.tel }).tel_paul };
      editeur.envoi = true;
      ctx.rendre();
      CRM.ecrireReglage(REGLAGE_SCRIPT, valeur).then(function (r) {
        editeur.textes = Object.assign({}, textes);
        editeur.tel = valeur.tel_paul;
        ctx.toast(r.ou === 'base' ? 'Script enregistré' : 'Script gardé sur cet appareil : la table des réglages ne répond pas');
      }, function (e) { ctx.erreur(e, 'Le script n\'a pas pu être enregistré.'); }).then(function () {
        editeur.envoi = false;
        ctx.rendre();
      });
    }

    function traiterEditeur(action, id) {
      switch (action) {
        case 'editeur-fermer': editeur.ouvert = false; ctx.rendre(); window.scrollTo({ top: 0 }); return true;
        case 'editeur-enregistrer': enregistrerScript(); return true;
        case 'ed-groupe': editeur.groupe = id; ctx.rendre(); return true;
        case 'ed-retablir': delete editeur.textes[id]; ctx.rendre(); return true;
      }
      return false;
    }

    /* La frappe ne redessine pas l'écran : seuls le compteur, les erreurs et l'aperçu du bloc suivent. */
    function saisieEditeur(champ, el) {
      if (champ === 'ed-tel') { editeur.tel = el.value; majEtatEditeur(); return true; }
      if (champ !== 'ed-texte') return false;
      var cle = el.dataset.id, n = el.dataset.n, b = defauts()[cle];
      if (!b || !editeur.textes) return true;
      editeur.textes[cle] = el.value;
      var c = G.validerTexte(cle, el.value);
      var compteur = document.getElementById('crmEdCompteur-' + n), erreur = document.getElementById('crmEdErreur-' + n), apercu = document.getElementById('crmEdApercu-' + n);
      if (compteur) { compteur.textContent = c.longueur + ' / ' + c.max; compteur.classList.toggle('crm-ed-trop', c.longueur > c.max); }
      if (erreur) erreur.innerHTML = htmlEtatBloc(b);
      if (apercu) apercu.innerHTML = htmlApercu(b, ctx.courant() || EXEMPLE);
      if (c.ok) el.removeAttribute('aria-invalid'); else el.setAttribute('aria-invalid', 'true');
      majEtatEditeur();
      return true;
    }
    function majEtatEditeur() {
      var etat = document.getElementById('crmEdEtat');
      if (etat && editeurModifie()) etat.innerHTML = ic('alerte', 14) + 'Modifications non enregistrées';
    }

    // ───────────────────────────── Ce que crm-prospection.js utilise ─────────────────────────────

    return {
      htmlGuide: htmlGuide, htmlMesure: htmlMesure, htmlEditeur: htmlEditeur, htmlAccroche: htmlAccroche,
      editeurOuvert: function () { return editeur.ouvert; },
      surClic: surClic, surSaisie: surSaisie, surFrappe: surFrappe, surSortie: surSortie, saisieEnCours: saisieEnCours,
      /* Ce que le journal d'appels retient de l'appel en cours sur ce prospect. */
      contexteAppel: function (id, resultat) {
        var a = appel && appel.id === id ? appel : null;
        return {
          seance: a ? a.seance : 0,
          interlocuteur: G.interlocuteurDe(a ? a.interlocuteur : null, resultat),
          etape: a && (a.atteinte !== 'qui' || a.etape !== 'qui') ? (a.etape === 'messagerie' ? 'messagerie' : a.atteinte) : null,
          objections: a ? a.objections.slice() : [],
          version_script: a && a.ouverture ? G.versionScript(a.ouverture, CRM.reglage(REGLAGE_SCRIPT)) : null
        };
      },
      /* Un résultat vient d'être posé (ou effacé) sur ce prospect, depuis le guide ou depuis la fiche d'appel. */
      surResultat: function (id, resultat) {
        if (!appel || appel.id !== id) return;
        appel.pose = resultat || null;
        if (resultat) appel.propose = null;
      },
      /* Le résultat est enregistré : ce que le guide avait écrit pour un autre résultat est défait. */
      apresResultat: function (id, resultat) { defaire(id, resultat || null); }
    };
  };
})();
