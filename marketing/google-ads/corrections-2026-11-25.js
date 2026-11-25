/**
 * Marchéo · Corrections Google Ads du 25/11/2026 (suite à l'export du compte).
 *
 * CE SCRIPT MODIFIE LE COMPTE. Chaque action est indépendante : si l'une échoue,
 * les autres continuent. Le résultat de chaque action est écrit dans un onglet
 * « Journal … » de la feuille d'export.
 *
 * 1. Met en pause la campagne Performance Max (54 € dépensés, trafic sans valeur).
 * 2. Coupe les partenaires de recherche sur les 2 campagnes Search.
 * 3. Ajoute un suffixe UTM pour voir les campagnes dans l'admin Marchéo.
 * 4. Ajoute des mots-clés à exclure (recherches de consommateurs, TikTok, etc.).
 * 5. Met en pause les mots-clés en requête large.
 * 6. Passe les enchères en « Maximiser les clics » plafonné à 1,50 €.
 * 7. Conversions : une seule par clic ; « Itinéraire » ne pilote plus les enchères.
 * 8. Crée une annonce complète par métier, vers la page du métier,
 *    et met en pause l'ancienne annonce quand elle était notée « Médiocre ».
 *
 * Rien n'est supprimé : tout peut être réactivé à la main.
 */

var FEUILLE_ID = '1RRTTZLBSj-F76KV1Vioqzo8Qb-U7BMi0QYO-x4i72bM';
var SITE = 'https://xn--marcho-fva.fr';

var PMAX = 24437668062;
var SEARCH_METIERS = 24483958506;
var SEARCH_CC = 24489073850;
var CPC_MAX = 1.5;

var CONV_ABONNEMENT = 7882761783;
var CONV_INSCRIPTION = 7904388657;
var CONV_ITINERAIRE = 7914426850;

// Mots-clés à exclure sur les deux campagnes Search (entre guillemets = expression exacte).
var NEGATIFS_COMMUNS = [
  'gâteau', 'gateau', 'gâteaux', 'gateaux', 'anniversaire', 'mariage', 'cake', 'cupcake', '"cup cake"',
  'livraison', 'livré', 'livrée', 'domicile', 'acheter', 'achat', 'prix', '"pas cher"',
  'catalogue', 'grossiste', '"à vendre"', '"a vendre"', 'viande', 'colis', 'halal', 'bio', 'producteur',
  'raclette', 'abbaye', 'pain', 'viennoiserie', 'pizza', 'repas', 'buffet', '"super u"', '"u traiteur"',
  '"service traiteur"', 'calendrier', 'box',
  'tiktok', '"tik tok"', 'tiktokshop', 'instagram', 'etsy', 'dropshipping', 'dropship', 'franchise',
  'woocommerce', 'prestashop', 'odoo', '"big cartel"', 'bigcartel', 'webador', 'myshopify', 'ankorstore',
  'veepee', '"bon coin"', 'leboncoin', 'vdi', 'handmade', '"seconde main"', 'vetement', 'vêtement',
  'déstockage', 'gratuitement', 'exemple', 'theme', 'thème', '"cahier des charges"', 'avis',
  '"c est quoi"', '"que veut dire"', 'définition', 'avantage',
  'website', 'store', 'design', 'development', 'online'
];

// En plus, sur la campagne générique « Click & collect commerçants » uniquement.
var NEGATIFS_CC = [
  '"e commerce"', 'ecommerce', 'ecom', '"commerce electronique"', 'business', 'idée', 'idee',
  'rentable', '"micro entreprise"', 'marketplace', 'marketplaces'
];

var TITRES_COMMUNS = [
  '0 % de commission', 'Dès 19 € par mois', 'Sans engagement', 'Démo gratuite de votre site',
  'Commandes en ligne 24h/24', 'Vos produits, vos photos', 'Marchéo : site clé en main',
  'Retrait ou livraison locale', 'Paiement en ligne sécurisé', 'Conçu par un primeur',
  'Accompagnement inclus'
];

var DESCRIPTIONS = [
  'Site clé en main avec vos produits et photos. Démo gratuite de votre boutique.',
  'Click & collect et livraison locale. 0 % de commission, dès 19 €/mois, sans engagement.',
  'Vos clients commandent et paient en ligne, vous préparez. Retrait par créneaux horaires.',
  'Conçu par un primeur pour les commerces de bouche. Zéro matériel, accompagnement inclus.'
];

// Une annonce par groupe : 4 titres propres au métier + les titres communs.
var ANNONCES = [
  { groupe: 200014123617, page: '/solutions/boulangerie', ancienne: null,
    titres: ['Site web pour boulangerie', 'Site internet boulangerie', 'Click & collect boulangerie', 'Site web pour pâtisserie'] },
  { groupe: 201910047509, page: '/solutions/primeur', ancienne: 831986231239,
    titres: ['Site web pour primeur', 'Site internet primeur', 'Click & collect primeur', 'Boutique en ligne primeur'] },
  { groupe: 201910048469, page: '/solutions/fromagerie', ancienne: 831986246122,
    titres: ['Site web pour fromagerie', 'Site internet fromagerie', 'Click & collect fromagerie', 'Boutique en ligne fromagerie'] },
  { groupe: 202833685392, page: '/solutions/traiteur', ancienne: 831986214877,
    titres: ['Site web pour traiteur', 'Site internet traiteur', 'Site web pour poissonnerie', 'Commandes traiteur en ligne'] },
  { groupe: 205305284154, page: '/solutions/boucherie', ancienne: 831986244628,
    titres: ['Site web pour boucherie', 'Site internet boucherie', 'Click & collect boucherie', 'Boutique en ligne boucherie'] }
];

var journal = [];
function noter(action, etat, detail) {
  journal.push([action, etat, detail || '']);
  Logger.log(action + ' → ' + etat + (detail ? ' : ' + detail : ''));
}
function tenter(action, fn) {
  try {
    var detail = fn();
    noter(action, 'OK', detail);
  } catch (e) {
    noter(action, 'ERREUR', String(e));
  }
}
function muter(operation) {
  var r = AdsApp.mutate(operation);
  if (!r.isSuccessful()) throw new Error(r.getErrorMessages().join(' | '));
  return r.getResourceName();
}
function campagne(id) {
  var it = AdsApp.campaigns().withIds([id]).get();
  if (!it.hasNext()) throw new Error('campagne ' + id + ' introuvable');
  return it.next();
}

function main() {
  var client = AdsApp.currentAccount().getCustomerId().replace(/-/g, '');
  var res = function (type, id) { return 'customers/' + client + '/' + type + '/' + id; };

  // 1. Performance Max en pause
  tenter('1. Pause Performance Max', function () {
    return muter({ campaignOperation: {
      update: { resourceName: res('campaigns', PMAX), status: 'PAUSED' }, updateMask: 'status' } });
  });

  [[SEARCH_METIERS, 'search_metiers'], [SEARCH_CC, 'search_click_collect']].forEach(function (c) {
    var id = c[0], nom = c[1];

    // 2. Partenaires de recherche
    tenter('2. Partenaires de recherche coupés · ' + nom, function () {
      return muter({ campaignOperation: {
        update: { resourceName: res('campaigns', id), networkSettings: { targetSearchNetwork: false } },
        updateMask: 'networkSettings.targetSearchNetwork' } });
    });

    // 3. Suffixe UTM
    tenter('3. Suffixe UTM · ' + nom, function () {
      var s = 'utm_source=google&utm_medium=cpc&utm_campaign=' + nom + '&utm_term={keyword}';
      campagne(id).urls().setFinalUrlSuffix(s);
      return s;
    });

    // 4. Mots-clés à exclure
    var negatifs = NEGATIFS_COMMUNS.concat(id === SEARCH_CC ? NEGATIFS_CC : []);
    tenter('4. Mots-clés à exclure · ' + nom, function () {
      var camp = campagne(id), ko = [];
      negatifs.forEach(function (n) {
        try { camp.createNegativeKeyword(n); } catch (e) { ko.push(n + ' (' + e + ')'); }
      });
      return (negatifs.length - ko.length) + ' ajoutés' + (ko.length ? ' ; refusés : ' + ko.join(', ') : '');
    });

    // 6. Enchères : maximiser les clics, CPC plafonné
    tenter('6. Enchères Maximiser les clics, plafond ' + CPC_MAX + ' € · ' + nom, function () {
      return muter({ campaignOperation: {
        update: { resourceName: res('campaigns', id),
                  targetSpend: { cpcBidCeilingMicros: String(Math.round(CPC_MAX * 1e6)) } },
        updateMask: 'targetSpend.cpcBidCeilingMicros' } });
    });
  });

  // 5. Mots-clés en requête large mis en pause
  tenter('5. Pause des mots-clés en requête large', function () {
    var it = AdsApp.keywords().withCondition('campaign.id IN (' + SEARCH_METIERS + ',' + SEARCH_CC + ')').get();
    var faits = [];
    while (it.hasNext()) {
      var k = it.next();
      if (String(k.getMatchType()) === 'BROAD' && k.isEnabled()) { k.pause(); faits.push(k.getText()); }
    }
    return faits.length + ' : ' + faits.join(', ');
  });

  // 7. Conversions
  [[CONV_INSCRIPTION, 'Inscription'], [CONV_ABONNEMENT, 'Abonnement']].forEach(function (c) {
    tenter('7. Conversion « ' + c[1] + ' » : une par clic', function () {
      return muter({ conversionActionOperation: {
        update: { resourceName: res('conversionActions', c[0]), countingType: 'ONE_PER_CLICK' },
        updateMask: 'countingType' } });
    });
  });
  tenter('7. Conversion « Itinéraire » : secondaire', function () {
    return muter({ conversionActionOperation: {
      update: { resourceName: res('conversionActions', CONV_ITINERAIRE), primaryForGoal: false },
      updateMask: 'primaryForGoal' } });
  });

  // 8. Annonces par métier
  ANNONCES.forEach(function (a) {
    tenter('8. Annonce · ' + a.page, function () {
      var itG = AdsApp.adGroups().withIds([a.groupe]).get();
      if (!itG.hasNext()) throw new Error('groupe ' + a.groupe + ' introuvable');
      var groupe = itG.next();

      var dejaFaite = false, itA = groupe.ads().get(), anciennes = [];
      while (itA.hasNext()) {
        var ad = itA.next();
        if (String(ad.urls().getFinalUrl() || '').indexOf('/solutions/') !== -1) dejaFaite = true;
        else anciennes.push(ad);
      }
      if (dejaFaite) return 'déjà créée, rien à faire';

      var op = groupe.newAd().responsiveSearchAdBuilder()
        .withHeadlines(a.titres.concat(TITRES_COMMUNS))
        .withDescriptions(DESCRIPTIONS)
        .withFinalUrl(SITE + a.page)
        .withPath1('site-web')
        .build();
      if (!op.isSuccessful()) throw new Error(op.getErrors().join(' | '));

      var suite = 'créée';
      if (a.ancienne) {
        anciennes.forEach(function (ad) {
          if (String(ad.getId()) === String(a.ancienne)) { ad.pause(); suite += ', ancienne annonce en pause'; }
        });
      }
      return suite;
    });
  });

  // Journal dans la feuille d'export
  try {
    var classeur = SpreadsheetApp.openById(FEUILLE_ID);
    var nom = 'Journal ' + Utilities.formatDate(new Date(), AdsApp.currentAccount().getTimeZone(), 'dd-MM HH\'h\'mm');
    var onglet = classeur.insertSheet(nom, 0);
    onglet.appendRow(['Action', 'Résultat', 'Détail']);
    journal.forEach(function (l) { onglet.appendRow(l); });
  } catch (e) {
    Logger.log('Journal non écrit dans la feuille : ' + e);
  }
}
