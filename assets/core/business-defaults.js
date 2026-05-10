// ============================================================
// business-defaults.js
// Templates par défaut de :
//   • horaires d'ouverture (avec support pause déjeuner)
//   • créneaux retrait / livraison / réservation
// selon le métier (business_type) et l'offre (vitrine / clickcollect /
// reservation / livraison).
//
// Utilisé à la création d'un commerçant (inscription.html, et idéalement
// aussi par la création de démos ambassadeur).
//
// Format horaires (rétrocompatible avec l'ancien) :
//   { lundi: { ouvert: false },
//     mardi: { ouvert: true, debut: "08:00", fin: "13:00",
//                            debut2: "15:00", fin2: "19:00" } }
//   debut2/fin2 OPTIONNELS — si présents et non vides : 2 plages (pause
//   déjeuner). Si absents : 1 seule plage (matinée + après-midi continue).
//
// Format créneau (insertion dans table `creneaux`) :
//   { jour_semaine: 0..6 (JS-style: 0=dimanche, 1=lundi, ..., 6=samedi),
//     heure_debut: "HH:MM", heure_fin: "HH:MM",
//     capacite_max: int, type: 'retrait'|'livraison'|'reservation' }
// ============================================================

(function () {
  // Map jour → index JS (cohérent avec Date.getDay())
  var JOUR_IDX = { dimanche:0, lundi:1, mardi:2, mercredi:3, jeudi:4, vendredi:5, samedi:6 };

  // ──────────────────────────────────────────────────────────
  // HORAIRES PAR DÉFAUT — construit pour ressembler à la réalité
  // d'un commerce français typique. Chaque commerçant peut tout
  // modifier ensuite depuis le dashboard.
  // ──────────────────────────────────────────────────────────
  var DEFAULT_HORAIRES = {
    boulangerie: {
      // Ouvert tôt, généralement avec une pause l'après-midi.
      // Beaucoup de boulangeries ouvrent aussi le dimanche matin.
      lundi:    { ouvert: true,  debut: '07:00', fin: '13:00', debut2: '15:00', fin2: '19:30' },
      mardi:    { ouvert: true,  debut: '07:00', fin: '13:00', debut2: '15:00', fin2: '19:30' },
      mercredi: { ouvert: true,  debut: '07:00', fin: '13:00', debut2: '15:00', fin2: '19:30' },
      jeudi:    { ouvert: true,  debut: '07:00', fin: '13:00', debut2: '15:00', fin2: '19:30' },
      vendredi: { ouvert: true,  debut: '07:00', fin: '13:00', debut2: '15:00', fin2: '19:30' },
      samedi:   { ouvert: true,  debut: '07:00', fin: '13:00', debut2: '15:00', fin2: '19:30' },
      dimanche: { ouvert: true,  debut: '07:00', fin: '13:00' },
    },
    boucherie: {
      // Fermé lundi (jour férié traditionnel des bouchers), ouvert dim matin.
      lundi:    { ouvert: false },
      mardi:    { ouvert: true,  debut: '08:00', fin: '13:00', debut2: '15:00', fin2: '19:00' },
      mercredi: { ouvert: true,  debut: '08:00', fin: '13:00', debut2: '15:00', fin2: '19:00' },
      jeudi:    { ouvert: true,  debut: '08:00', fin: '13:00', debut2: '15:00', fin2: '19:00' },
      vendredi: { ouvert: true,  debut: '08:00', fin: '13:00', debut2: '15:00', fin2: '19:30' },
      samedi:   { ouvert: true,  debut: '08:00', fin: '13:00', debut2: '15:00', fin2: '19:00' },
      dimanche: { ouvert: true,  debut: '08:00', fin: '13:00' },
    },
    primeur: {
      // Fermé lundi typique, ouvert dim matin.
      lundi:    { ouvert: false },
      mardi:    { ouvert: true,  debut: '08:00', fin: '12:30', debut2: '15:00', fin2: '19:00' },
      mercredi: { ouvert: true,  debut: '08:00', fin: '12:30', debut2: '15:00', fin2: '19:00' },
      jeudi:    { ouvert: true,  debut: '08:00', fin: '12:30', debut2: '15:00', fin2: '19:00' },
      vendredi: { ouvert: true,  debut: '08:00', fin: '12:30', debut2: '15:00', fin2: '19:30' },
      samedi:   { ouvert: true,  debut: '08:00', fin: '13:00', debut2: '15:00', fin2: '19:00' },
      dimanche: { ouvert: true,  debut: '08:00', fin: '13:00' },
    },
    poissonnerie: {
      // Souvent uniquement le matin (produit frais, peu de stock l'après-midi).
      lundi:    { ouvert: false },
      mardi:    { ouvert: true,  debut: '08:00', fin: '13:00' },
      mercredi: { ouvert: true,  debut: '08:00', fin: '13:00' },
      jeudi:    { ouvert: true,  debut: '08:00', fin: '13:00' },
      vendredi: { ouvert: true,  debut: '08:00', fin: '13:00', debut2: '15:30', fin2: '19:00' },
      samedi:   { ouvert: true,  debut: '08:00', fin: '13:00', debut2: '15:30', fin2: '19:00' },
      dimanche: { ouvert: false },
    },
    fromagerie: {
      lundi:    { ouvert: false },
      mardi:    { ouvert: true,  debut: '09:00', fin: '13:00', debut2: '15:00', fin2: '19:00' },
      mercredi: { ouvert: true,  debut: '09:00', fin: '13:00', debut2: '15:00', fin2: '19:00' },
      jeudi:    { ouvert: true,  debut: '09:00', fin: '13:00', debut2: '15:00', fin2: '19:00' },
      vendredi: { ouvert: true,  debut: '09:00', fin: '13:00', debut2: '15:00', fin2: '19:30' },
      samedi:   { ouvert: true,  debut: '09:00', fin: '19:00' }, // continu samedi
      dimanche: { ouvert: true,  debut: '09:00', fin: '13:00' },
    },
    traiteur: {
      // Plus orienté commande, journée continue.
      lundi:    { ouvert: false },
      mardi:    { ouvert: true,  debut: '09:00', fin: '13:00', debut2: '15:00', fin2: '19:00' },
      mercredi: { ouvert: true,  debut: '09:00', fin: '13:00', debut2: '15:00', fin2: '19:00' },
      jeudi:    { ouvert: true,  debut: '09:00', fin: '13:00', debut2: '15:00', fin2: '19:00' },
      vendredi: { ouvert: true,  debut: '09:00', fin: '13:00', debut2: '15:00', fin2: '19:00' },
      samedi:   { ouvert: true,  debut: '09:00', fin: '13:00', debut2: '15:00', fin2: '19:00' },
      dimanche: { ouvert: false },
    },
    fleuriste: {
      lundi:    { ouvert: false },
      mardi:    { ouvert: true,  debut: '09:00', fin: '13:00', debut2: '14:00', fin2: '19:00' },
      mercredi: { ouvert: true,  debut: '09:00', fin: '13:00', debut2: '14:00', fin2: '19:00' },
      jeudi:    { ouvert: true,  debut: '09:00', fin: '13:00', debut2: '14:00', fin2: '19:00' },
      vendredi: { ouvert: true,  debut: '09:00', fin: '13:00', debut2: '14:00', fin2: '19:30' },
      samedi:   { ouvert: true,  debut: '09:00', fin: '19:00' },
      dimanche: { ouvert: true,  debut: '09:00', fin: '13:00' },
    },
    pizzeria: {
      // Pas de service midi le lundi, ouvert tous les autres soirs.
      lundi:    { ouvert: false },
      mardi:    { ouvert: true,  debut: '11:30', fin: '14:00', debut2: '18:00', fin2: '22:30' },
      mercredi: { ouvert: true,  debut: '11:30', fin: '14:00', debut2: '18:00', fin2: '22:30' },
      jeudi:    { ouvert: true,  debut: '11:30', fin: '14:00', debut2: '18:00', fin2: '22:30' },
      vendredi: { ouvert: true,  debut: '11:30', fin: '14:00', debut2: '18:00', fin2: '23:00' },
      samedi:   { ouvert: true,  debut: '11:30', fin: '14:00', debut2: '18:00', fin2: '23:00' },
      dimanche: { ouvert: true,  debut: '18:00', fin: '22:30' },
    },
    restaurant: {
      lundi:    { ouvert: false },
      mardi:    { ouvert: true,  debut: '12:00', fin: '14:30', debut2: '19:00', fin2: '22:30' },
      mercredi: { ouvert: true,  debut: '12:00', fin: '14:30', debut2: '19:00', fin2: '22:30' },
      jeudi:    { ouvert: true,  debut: '12:00', fin: '14:30', debut2: '19:00', fin2: '22:30' },
      vendredi: { ouvert: true,  debut: '12:00', fin: '14:30', debut2: '19:00', fin2: '23:00' },
      samedi:   { ouvert: true,  debut: '12:00', fin: '14:30', debut2: '19:00', fin2: '23:00' },
      dimanche: { ouvert: true,  debut: '12:00', fin: '14:30' },
    },
    fastfood: {
      // Service continu, 7j/7
      lundi:    { ouvert: true, debut: '11:00', fin: '22:30' },
      mardi:    { ouvert: true, debut: '11:00', fin: '22:30' },
      mercredi: { ouvert: true, debut: '11:00', fin: '22:30' },
      jeudi:    { ouvert: true, debut: '11:00', fin: '22:30' },
      vendredi: { ouvert: true, debut: '11:00', fin: '23:00' },
      samedi:   { ouvert: true, debut: '11:00', fin: '23:00' },
      dimanche: { ouvert: true, debut: '11:00', fin: '22:30' },
    },
  };

  // Fallback générique si business_type inconnu : Mar–Sam 9h-19h continu.
  var FALLBACK_HORAIRES = {
    lundi:    { ouvert: false },
    mardi:    { ouvert: true,  debut: '09:00', fin: '19:00' },
    mercredi: { ouvert: true,  debut: '09:00', fin: '19:00' },
    jeudi:    { ouvert: true,  debut: '09:00', fin: '19:00' },
    vendredi: { ouvert: true,  debut: '09:00', fin: '19:00' },
    samedi:   { ouvert: true,  debut: '09:00', fin: '19:00' },
    dimanche: { ouvert: false },
  };

  // ──────────────────────────────────────────────────────────
  // Métiers de restauration (services midi/soir) → réservation
  // pertinente, livraison parfois.
  // ──────────────────────────────────────────────────────────
  var METIERS_RESTAURATION = ['pizzeria', 'restaurant', 'fastfood', 'traiteur'];

  // ──────────────────────────────────────────────────────────
  // CRÉNEAUX — granularité par métier (en minutes)
  // ──────────────────────────────────────────────────────────
  var GRAIN_RETRAIT = {
    boulangerie:  60, boucherie: 60, primeur: 60, poissonnerie: 60,
    fromagerie:   60, traiteur: 60, fleuriste: 60,
    pizzeria:     30, restaurant: 30, fastfood: 15,
  };
  // Livraison : couvre tous les métiers. Granularité 60min pour les
  // commerces de bouche (1 tournée par heure), 30min pour la restauration
  // (services rapides), 15min pour le fastfood (livraison continue).
  var GRAIN_LIVRAISON = {
    boulangerie: 60, boucherie: 60, primeur: 60, poissonnerie: 60,
    fromagerie: 60, fleuriste: 60, traiteur: 60,
    pizzeria: 30, restaurant: 30, fastfood: 15,
  };
  var GRAIN_RESERVATION = {
    pizzeria: 30, restaurant: 30, fastfood: 30, traiteur: 60,
  };

  // Capacités par défaut (commande/couverts par créneau)
  var CAP_RETRAIT = {
    boulangerie: 8, boucherie: 5, primeur: 5, poissonnerie: 5,
    fromagerie: 5, traiteur: 4, fleuriste: 5,
    pizzeria: 6, restaurant: 4, fastfood: 10,
  };
  // Livraison : capacité = nombre de commandes livrables sur le créneau
  // (selon le nombre de livreurs disponibles). Volontairement basse pour
  // que le commerçant adapte selon ses moyens. Les valeurs typiques :
  //   - 3 pour les commerces de bouche avec 1 livreur (3 livraisons/h)
  //   - 4-5 pour les boulangeries (paniers légers)
  //   - 4-5 pour la restauration rapide
  var CAP_LIVRAISON = {
    boulangerie: 5, boucherie: 3, primeur: 3, poissonnerie: 3,
    fromagerie: 3, fleuriste: 4, traiteur: 2,
    pizzeria: 4, restaurant: 3, fastfood: 5,
  };
  // Réservation = couverts par créneau (en pratique, somme des tables disponibles à ce moment)
  var CAP_RESERVATION = { pizzeria: 20, restaurant: 16, fastfood: 30, traiteur: 12 };

  // ──────────────────────────────────────────────────────────
  // PLAGES LIVRAISON par métier (différentes des horaires d'ouverture)
  // Format : array de fenêtres { debut, fin } appliquées à chaque jour
  // ouvert. Permet de découpler la livraison de la vente sur place :
  // ex. un primeur livre seulement en fin d'AM, pas pendant le rush du
  // matin où il sert ses clients en boutique. Si aucune plage n'est
  // définie pour un métier, fallback = plages d'ouverture (livraison
  // continue toute la journée).
  // ──────────────────────────────────────────────────────────
  var PLAGES_LIVRAISON = {
    boulangerie: [{ debut:'07:30', fin:'09:00' }, { debut:'16:00', fin:'19:00' }],
    boucherie:    [{ debut:'16:00', fin:'19:00' }],
    primeur:      [{ debut:'16:00', fin:'19:00' }],
    fromagerie:   [{ debut:'16:00', fin:'19:00' }],
    poissonnerie: [{ debut:'08:00', fin:'10:00' }], // produit frais : matinée uniquement
    fleuriste:    [{ debut:'09:00', fin:'13:00' }, { debut:'14:00', fin:'18:00' }],
    traiteur:     [{ debut:'11:00', fin:'13:00' }, { debut:'18:00', fin:'20:00' }],
    pizzeria:     [{ debut:'18:00', fin:'22:30' }], // soir uniquement
    restaurant:   [{ debut:'12:00', fin:'14:00' }, { debut:'19:00', fin:'22:00' }],
    fastfood:     [{ debut:'11:00', fin:'22:30' }],
  };

  // ──────────────────────────────────────────────────────────
  // Génère les créneaux d'un type pour un commerçant
  // ──────────────────────────────────────────────────────────
  function genererCreneauxJour(jourKey, plage, grainMin, capacite, type) {
    // plage = { debut: "HH:MM", fin: "HH:MM" }
    var jourIdx = JOUR_IDX[jourKey];
    if (jourIdx === undefined || !plage || !plage.debut || !plage.fin) return [];
    var [hd, md] = plage.debut.split(':').map(Number);
    var [hf, mf] = plage.fin.split(':').map(Number);
    var startMin = hd * 60 + md;
    var endMin   = hf * 60 + mf;
    var slots = [];
    for (var t = startMin; t + grainMin <= endMin; t += grainMin) {
      var h1 = Math.floor(t / 60), m1 = t % 60;
      var h2 = Math.floor((t + grainMin) / 60), m2 = (t + grainMin) % 60;
      slots.push({
        jour_semaine: jourIdx,
        heure_debut: pad(h1) + ':' + pad(m1),
        heure_fin:   pad(h2) + ':' + pad(m2),
        capacite_max: capacite,
        type: type,
      });
    }
    return slots;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // Construit toutes les plages d'un jour à partir des horaires (plage matin
  // + plage après-midi si pause déjeuner)
  function plagesDuJour(horairesJour) {
    if (!horairesJour || !horairesJour.ouvert) return [];
    var p = [];
    if (horairesJour.debut && horairesJour.fin) {
      p.push({ debut: horairesJour.debut, fin: horairesJour.fin });
    }
    if (horairesJour.debut2 && horairesJour.fin2) {
      p.push({ debut: horairesJour.debut2, fin: horairesJour.fin2 });
    }
    return p;
  }

  // ──────────────────────────────────────────────────────────
  // API publique
  // ──────────────────────────────────────────────────────────
  function getDefaultHoraires(businessType) {
    return JSON.parse(JSON.stringify(DEFAULT_HORAIRES[businessType] || FALLBACK_HORAIRES));
  }

  /**
   * Retourne un array de créneaux à insérer dans la table `creneaux`
   * pour un commerçant qui démarre.
   *
   * @param {string} businessType - boulangerie, boucherie, ...
   * @param {string} offre        - vitrine | clickcollect | reservation | livraison
   * @param {object} [horaires]   - horaires personnalisés (sinon défaut métier)
   * @returns {Array} array de créneaux (sans commercant_id — l'appelant doit l'ajouter)
   */
  function getDefaultCreneaux(businessType, offre, horaires) {
    var h = horaires || getDefaultHoraires(businessType);
    var grainRet  = GRAIN_RETRAIT[businessType]   || 60;
    var grainLiv  = GRAIN_LIVRAISON[businessType] || 60;
    var grainRes  = GRAIN_RESERVATION[businessType] || 30;
    var capRet    = CAP_RETRAIT[businessType]   || 5;
    var capLiv    = CAP_LIVRAISON[businessType] || 3;
    var capRes    = CAP_RESERVATION[businessType] || 12;
    var isResto   = METIERS_RESTAURATION.indexOf(businessType) >= 0;
    var creneaux  = [];

    // Décider quels TYPES de créneaux créer selon l'offre
    var withRetrait     = offre !== 'vitrine';
    var withLivraison   = offre === 'livraison';
    var withReservation = (offre === 'reservation' || offre === 'livraison') && isResto;

    // Plages livraison spécifiques au métier (peut différer des horaires
    // d'ouverture — ex. primeur livre seulement en fin d'AM). Fallback :
    // si pas de config dédiée, utiliser les plages d'ouverture du jour.
    var plagesLivraisonMetier = PLAGES_LIVRAISON[businessType] || null;

    var jours = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
    jours.forEach(function (jourKey) {
      var plagesJour = plagesDuJour(h[jourKey]);
      var jourEstOuvert = plagesJour.length > 0;
      plagesJour.forEach(function (plage) {
        if (withRetrait) {
          creneaux = creneaux.concat(genererCreneauxJour(jourKey, plage, grainRet, capRet, 'retrait'));
        }
        if (withReservation) {
          creneaux = creneaux.concat(genererCreneauxJour(jourKey, plage, grainRes, capRes, 'reservation'));
        }
      });
      // Livraison : utilise les plages livraison du métier si définies,
      // sinon les plages d'ouverture. Uniquement sur les jours où la
      // boutique est ouverte (pas de livraison le lundi de fermeture).
      if (withLivraison && jourEstOuvert) {
        var plagesLiv = plagesLivraisonMetier || plagesJour;
        plagesLiv.forEach(function (plage) {
          creneaux = creneaux.concat(genererCreneauxJour(jourKey, plage, grainLiv, capLiv, 'livraison'));
        });
      }
    });

    return creneaux;
  }

  // Expose
  window.MarcheoBusinessDefaults = {
    getDefaultHoraires: getDefaultHoraires,
    getDefaultCreneaux: getDefaultCreneaux,
    DEFAULT_HORAIRES: DEFAULT_HORAIRES,
    FALLBACK_HORAIRES: FALLBACK_HORAIRES,
  };
})();
