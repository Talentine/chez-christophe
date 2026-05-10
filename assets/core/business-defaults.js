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
  var GRAIN_LIVRAISON = {
    pizzeria: 30, restaurant: 30, fastfood: 15, traiteur: 60,
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
  var CAP_LIVRAISON = { pizzeria: 4, restaurant: 3, fastfood: 5, traiteur: 2 };
  // Réservation = couverts par créneau (en pratique, somme des tables disponibles à ce moment)
  var CAP_RESERVATION = { pizzeria: 20, restaurant: 16, fastfood: 30, traiteur: 12 };

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

    var jours = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
    jours.forEach(function (jourKey) {
      var plages = plagesDuJour(h[jourKey]);
      plages.forEach(function (plage) {
        if (withRetrait) {
          creneaux = creneaux.concat(genererCreneauxJour(jourKey, plage, grainRet, capRet, 'retrait'));
        }
        if (withLivraison) {
          creneaux = creneaux.concat(genererCreneauxJour(jourKey, plage, grainLiv, capLiv, 'livraison'));
        }
        if (withReservation) {
          creneaux = creneaux.concat(genererCreneauxJour(jourKey, plage, grainRes, capRes, 'reservation'));
        }
      });
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
