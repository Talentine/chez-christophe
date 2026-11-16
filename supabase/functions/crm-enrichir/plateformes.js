/* crm-enrichir — tables de domaines et de motifs (module ES pur, sans E/S).
 *
 * Tout ce que l'analyse d'un site peut « reconnaître » est listé ici : la fonction ne stocke jamais un texte
 * libre tiré d'une page, seulement les identifiants de ces listes fermées.
 */

// Sites qui ne sont pas « le site du commerce » : jamais téléchargés.
export const HOTES_RESEAUX = ['facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'instagr.am', 'linktr.ee', 'linkin.bio', 'beacons.ai'];
export const HOTES_ANNUAIRES = ['pagesjaunes.fr', 'tripadvisor.fr', 'tripadvisor.com', 'petitfute.com', 'yelp.fr', 'yelp.com', 'mappy.com',
  'google.com', 'google.fr', 'g.page', 'goo.gl', 'business.site', 'solocal.com', 'cylex-locale.fr', 'infobel.com'];

// Marqueurs techniques d'une boutique en ligne sur le site lui-même (cherchés dans le HTML brut en minuscules).
// `tous` : toutes les chaînes doivent être présentes ; `un` : une seule suffit.
export const BOUTIQUES = [
  { id: 'woocommerce', un: ['wp-content/plugins/woocommerce', 'woocommerce-', 'wc-ajax=', 'add_to_cart_button', '?add-to-cart='] },
  { id: 'shopify', un: ['cdn.shopify.com', 'myshopify.com', 'shopify.theme', 'shopify-section'] },
  { id: 'prestashop', un: ['content="prestashop"', '/modules/ps_', 'prestashop.', 'id="add-to-cart-or-refresh"'] },
  { id: 'wix_stores', un: ['wixstores', 'wix-ecommerce'] },
  { id: 'wix_stores', tous: ['ecom-platform', 'static.wixstatic.com'] },
  { id: 'squarespace_commerce', un: ['sqs-add-to-cart-button', 'squarespace-commerce'] },
  { id: 'ecwid', un: ['app.ecwid.com', 'ecwid.com/script.js'] },
  { id: 'magento', un: ['mage/cookies', 'magento_'] },
  // « mage » seul est dans « image » : il faut l'arborescence de Magento 2.
  { id: 'magento', tous: ['/static/version', '/frontend/', 'requirejs'] },
  { id: 'wizishop', un: ['wizishop'] },
  { id: 'oxatis', un: ['oxatis'] },
  { id: 'sumup_boutique', un: ['sumupstore.com', 'sumup.link'] },
  { id: 'square_boutique', un: ['square.site', 'squareup.com/store', 'square.online'] },
  { id: 'snipcart', un: ['snipcart'] },
  { id: 'jimdo_boutique', tous: ['jimdo', 'j-checkout'] },
  { id: 'jimdo_boutique', tous: ['jimdo', 'cc-shop'] }
];

// Expressions « panier » (sur le texte visible, sans accents). FORTES : elles décrivent une vente en ligne.
// FAIBLES : elles ne comptent qu'en renfort d'une forte (« passer commande » se dit aussi d'un appel).
// Il faut une forte et une seconde expression, ou une forte et une page interne dédiée (CHEMIN_PANIER).
// Chaque expression est lue par `vuSansNegation` (analyse.js) : « pas de boutique en ligne », « bientôt notre
// boutique en ligne » ne comptent pas. « Votre panier de légumes », « votre panier garni » sont des produits.
export const PANIER_FORTES = [
  /ajout(er)? au panier/, /(mon|votre|voir le) panier(?! (de |d'|du |des |garni|gourmand|cadeau|repas|bio|fraicheur|surprise|hebdo|pique|anti))/,
  /valider (ma|la|votre) commande/, /paiement (en ligne|securise)/,
  /click ?(and|&|et|n) ?collect/, /cliquez? et (collectez|retirez)/, /commande(r|z)? en ligne/, /boutique en ligne/, /vente en ligne/,
  /\be-?shop\b/
];
export const PANIER_FAIBLES = [/passer (la |ma |votre )?commande/, /retrait en (boutique|magasin)/, /\bdrive\b/];
// Mots entiers du chemin : « /la-carte », « /cartes-cadeaux », « /workshop » ne sont pas des pages de vente.
export const CHEMIN_PANIER = /(^|[\/\-_.=])(panier|cart|basket|checkout|e-?shop|shop|boutique-en-ligne|vente-en-ligne|commande-en-ligne|commander|click-?(and|n|et)-?collect)([\/\-_.?&=]|$)|\/commandes?(\/|$|\.|\?)|\/boutique(\/|$|\.|\?)/;

// Plateformes de commande en ligne tenues par un tiers (lien ou iframe vers l'un de ces domaines).
export const PLATEFORMES_COMMANDE = [
  { id: 'ollca', hotes: ['ollca.com'] },
  { id: 'epicery', hotes: ['epicery.com'] },
  { id: 'rapidle', hotes: ['rapidle.com', 'rapidle.fr'] },
  { id: 'pourdebon', hotes: ['pourdebon.com'] },
  { id: 'mavillemonshopping', hotes: ['mavillemonshopping.fr'] },
  { id: 'wishibam', hotes: ['wishibam.com'] },
  { id: 'cagette', hotes: ['cagette.net'] },
  { id: 'laruche', hotes: ['laruchequiditoui.fr'] },
  { id: 'locavor', hotes: ['locavor.fr'] },
  { id: 'dood', hotes: ['dood.com'] },
  { id: 'livepepper', hotes: ['livepepper.com', 'livepepper.fr'] },
  { id: 'gloriafood', hotes: ['gloriafood.com', 'fbgcdn.com', 'foodbooking.com'] },
  { id: 'zelty', hotes: ['zelty.fr'] },
  { id: 'innovorder', hotes: ['innovorder.fr', 'innovorder.io'] },
  { id: 'obypay', hotes: ['obypay.com'] },
  { id: 'flipdish', hotes: ['flipdish.com'] },
  { id: 'sumup_commande', hotes: ['storekit.com'] },
  { id: 'monbanquet', hotes: ['monbanquet.fr'] },
  { id: 'coopcycle', hotes: ['coopcycle.org'] }
];

// Livraison par des plateformes à commission : un argument (« sans commission »), pas une boutique en ligne.
export const LIVRAISON_COMMISSION = [
  { id: 'ubereats', hotes: ['ubereats.com'], texte: /uber ?eats/ },
  { id: 'deliveroo', hotes: ['deliveroo.fr', 'deliveroo.com', 'deliveroo.co.uk'], texte: /deliveroo/ },
  { id: 'justeat', hotes: ['just-eat.fr', 'justeat.fr', 'just-eat.com'], texte: /just ?eat/ },
  { id: 'delicity', hotes: ['delicity.com'] },
  { id: 'lyveat', hotes: ['lyveat.com'] }
];
export const HOTES_ANTI_GASPI = ['toogoodtogo.com', 'toogoodtogo.fr', 'wearephenix.com'];
// « Phénix » seul est aussi un nom de commerce : il faut le mot dans son contexte anti-gaspillage.
export const TEXTE_ANTI_GASPI = /too ?good ?to ?go|(appli(cation)?|paniers?|avec|sur|via) phenix\b|phenix anti[- ]?gaspi/;

// Le commerce est déjà client : lien vers Marchéo.
export const HOTES_MARCHEO = ['xn--marcho-fva.fr', 'marchéo.fr'];

export const HOTES_FORMULAIRES = ['docs.google.com/forms', 'forms.gle', 'typeform.com', 'jotform.com', 'framaforms.org', 'tally.so'];

// Page d'attente, domaine à vendre, hébergement suspendu (sur le texte visible sans accents + le HTML brut).
// FORTS : la page ne peut pas être le site d'un commerce (page courte, ou sans aucun lien interne).
// FAIBLES : un vrai site les écrit aussi (« galette bientôt disponible ») ; ils ne comptent que sur une page presque vide.
export const PARKING_FORTS = [
  /domain (is )?for sale/, /buy this domain/, /ce (nom de )?domaine est (a vendre|en vente|expire|disponible|parke)/,
  /domaine (expire|a vendre)/, /parked (free|domain)/, /sedoparking/, /sedo\.com/, /hugedomains/, /\bdan\.com/, /afternic/, /bodis\.com/,
  /parkingcrew/, /namebright/, /apache2 (ubuntu|debian) default page/, /welcome to nginx/, /index of \//,
  /felicitations ! votre (domaine|site)/, /this domain (name )?has been registered/, /account suspended/, /compte suspendu/,
  /hebergement (suspendu|expire)/
];
export const PARKING_FAIBLES = [
  /site en (construction|cours de (creation|construction|maintenance))/, /coming soon/, /bientot (disponible|en ligne)/, /page par defaut/
];
export const PARKING = PARKING_FORTS.concat(PARKING_FAIBLES);

// Offre traiteur. FORTS : un seul suffit → « traiteur ». FAIBLES : deux identifiants distincts, proches l'un de
// l'autre dans le texte (une liste « mariages, baptêmes, réceptions ») → « événements », jamais « traiteur » :
// un fleuriste aussi travaille pour des mariages.
export const TRAITEUR_FORTS = [
  { id: 'traiteur', re: /\btraiteurs?\b/ },
  { id: 'plateau', re: /plateaux? (repas|de fromages?|de charcuteries?|de fruits de mer|aperitifs?|gourmands?|a partager)/ },
  { id: 'buffet', re: /\bbuffets?\b/ },
  { id: 'cocktail', re: /cocktails? dinatoires?/ },
  { id: 'piece_montee', re: /pieces? montees?/ },
  { id: 'evenement', re: /mechoui|barbecue geant|paella geante|plancha a domicile/ }
];
export const TRAITEUR_FAIBLES = [
  { id: 'mariage', re: /\bmariages?\b/ },
  // « Paiement à réception », « accusé de réception », « réception des commandes » n'ont rien d'une fête.
  { id: 'reception', re: /(?<!\ba |accuses? de |bonne |des la |jour de )\breceptions?\b(?! (de |des |du )?(la |votre |vos |ma |mes )?(facture|commande|colis|marchandise|paiement|reglement|livraison|produit|mail|e-mail|courriel|demande|appel))/ },
  { id: 'evenement', re: /evenements? (prives?|d'entreprise|professionnels?)|evenementiel/ },
  { id: 'entreprise', re: /seminaires?|comites? d'entreprise|\bcse\b/ },
  { id: 'fete_famille', re: /baptemes?|communions?|\banniversaires?\b/ }
];
// Fêtes : ne comptent que si la même phrase (120 caractères autour) parle aussi de commande, de réservation, de
// catalogue ou de carte des fêtes. « Fermé le jour de Noël », « carte bancaire » ne disent rien d'une commande.
export const FETES = [
  { id: 'fetes', re: /fetes de fin d'annee|saint[- ]valentin|fete des meres/ },
  { id: 'noel', re: /\bnoel\b|reveillon|\bbuches?\b|\bchapons?\b/ },
  { id: 'galette', re: /galettes? des rois/ },
  { id: 'paques', re: /\bpaques\b/ }
];
export const FETES_CONTEXTE = /command|reserv|catalogue|\b(carte|menu)s? (de|des|du) (fetes?|noel|reveillon|paques)/;
export const FETES_HORS_SUJET = /\bferme(e|s|es|ture)?\b|\bconges\b|\bhoraires\b|\bouvert/;
export const SUR_COMMANDE = [
  { id: 'sur_commande', re: /sur commande|commandes? speciales?/ },
  { id: 'gateau', re: /gateaux? (d'anniversaire|personnalises?|sur mesure)/ },
  { id: 'pain_surprise', re: /pains? surprises?/ },
  { id: 'panier_garni', re: /paniers? garnis?|coffrets? cadeaux?/ },
  { id: 'colis', re: /colis (de viande|barbecue|du boucher)|caissettes?|bourriches?/ },
  { id: 'composition', re: /compositions? (florales?|sur mesure)/ }
];
export const SUR_COMMANDE_DELAI = /48 ?h a l'avance|la veille/;

// Constructeur du site (information, hors note).
export const CONSTRUCTEURS = [
  { id: 'shopify', un: ['cdn.shopify.com', 'myshopify.com'] },
  { id: 'prestashop', un: ['content="prestashop"', '/modules/ps_'] },
  { id: 'wix', un: ['static.wixstatic.com', 'x-wix-', 'wix.com website builder'] },
  { id: 'wordpress', un: ['wp-content/', 'wp-includes/'] },
  { id: 'jimdo', un: ['jimdo'] },
  { id: 'squarespace', un: ['squarespace'] },
  { id: 'webador', un: ['webador'] },
  { id: 'e-monsite', un: ['e-monsite'] },
  { id: 'solocal', un: ['site-privilege.pagesjaunes', 'solocal'] },
  { id: 'google_sites', un: ['sites.google.com'] },
  { id: 'weebly', un: ['weebly'] },
  { id: 'site123', un: ['site123'] },
  { id: 'ionos', un: ['mywebsite'] },
  { id: 'sumup', un: ['sumup'] }
];

export const GENERATEURS_ANCIENS = /^(joomla! [12]\.|wordpress [1-4]\.|.*frontpage|.*e-monsite|.*iweb)/;

// Pages internes utiles, par ordre de priorité.
export const CATEGORIES_PAGES = [
  { id: 'commande', re: /commande|commander|boutique|shop|panier|click|collect|drive|vente-en-ligne|e-?shop|reservation/ },
  { id: 'traiteur', re: /traiteur|plateau|buffet|evenement|reception|prestation|carte|nos-produits/ },
  { id: 'boutiques', re: /nos-boutiques|magasins|points-de-vente|adresses|nous-trouver/ },
  { id: 'contact', re: /contact|infos?-pratiques|horaires/ }
];
export const EXTENSIONS_EXCLUES = /\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4|mp3|ics)$/i;

export const MULTI_LIENS = /nos (boutiques|magasins|points de vente|adresses|boulangeries|boucheries|fromageries|etablissements)/;
export const MULTI_CHEMINS = /\/(nos-boutiques|magasins|points-de-vente|nos-adresses|boutiques|nos-magasins)(\/|$|\.|\?)/;

export const EMAILS_REJETES = /@(sentry\.io|.*wixpress\.com|example\.(com|org|fr)|exemple\.(com|fr)|domaine\.fr|domain\.com|email\.com|votredomaine\.fr)$|\.(png|jpe?g|gif|webp|svg)$|^(noreply|no-reply|postmaster)@|^webmaster@wix/;

// Mots trop génériques pour identifier une enseigne (même liste que le cœur du CRM, crm-coeur.js).
export const MOTS_GENERIQUES = ('boulangerie patisserie boucherie charcuterie traiteur primeur fromagerie cremerie poissonnerie epicerie fine ' +
  'fleuriste fleurs maison la le les l du de des d au aux chez et a snack pizzeria restaurant sarl sas eurl').split(' ');

// Familles de métiers : deux noms qui annoncent des familles différentes (« Boucherie du Marché », « Boulangerie
// du Marché ») ne désignent pas le même commerce, même si le reste du nom est identique.
export const FAMILLES_METIERS = [
  { id: 'boulangerie', mots: ['boulangerie', 'boulanger', 'patisserie', 'patissier', 'fournil', 'viennoiserie'], google: ['bakery', 'pastry_shop', 'dessert_shop', 'confectionery'] },
  { id: 'boucherie', mots: ['boucherie', 'boucher', 'charcuterie', 'charcutier', 'volailler', 'rotisserie'], google: ['butcher_shop'] },
  { id: 'poissonnerie', mots: ['poissonnerie', 'poissonnier', 'ecailler'], google: ['seafood_market', 'fish_store'] },
  { id: 'fromagerie', mots: ['fromagerie', 'fromager', 'cremerie', 'cremier'], google: ['cheese_shop'] },
  { id: 'primeur', mots: ['primeur', 'primeurs', 'maraicher'], google: ['greengrocer', 'produce_market'] },
  { id: 'fleuriste', mots: ['fleuriste', 'fleurs'], google: ['florist'] },
  { id: 'restauration', mots: ['restaurant', 'pizzeria', 'snack', 'brasserie', 'bistrot', 'kebab', 'creperie'],
    google: ['restaurant', 'pizza_restaurant', 'fast_food_restaurant', 'french_restaurant', 'meal_takeaway', 'bar', 'cafe'] }
];
// business_type du prospect → famille (les métiers absents, épicerie ou traiteur, ne contredisent rien).
export const FAMILLE_DU_METIER = { boulangerie: 'boulangerie', boucherie: 'boucherie', poissonnerie: 'poissonnerie', fromagerie: 'fromagerie',
  primeur: 'primeur', fleuriste: 'fleuriste', restaurant: 'restauration', pizzeria: 'restauration', fastfood: 'restauration' };

// Mention d'un prestataire (créateur du site, agence) : ses liens, son e-mail et son adresse ne sont pas ceux du commerce.
export const CREDIT_SITE = /(site|page|boutique)s? (web |internet |vitrine )?(realise|cree|concu|developpe|propulse|heberge|edite|fait|imagine|designe)e?s? (par|avec)|(realisation|conception|creation|design|developpement|webdesign|credits?)( graphique| web| du site| de site| site| et hebergement)? ?:|creation (du |de |d'un )?sites?( web| internet)?|propulse par|powered by|cree avec|made (by|with)|design(ed)? by|agence (web|digitale|de communication)|studio (web|graphique)|webmaster/;
// Devant une adresse postale : celle d'un tiers (hébergeur, siège, agence, producteur), pas un point de vente.
export const ADRESSE_TIERS = /heberg|ovh|o2switch|ionos|gandi|siege social|editeur du site|directeur de (la )?publication|creation (du |de )?site|site (realise|cree|concu)|realisation|conception|agence|studio|webmaster|credits?|producteurs?|fournisseurs?|eleveurs?|eleve (a|par|chez)|maraichers?|partenaires?|provenance|origine|issus? de|viennent de|vient de/;
// Comptes par défaut des modèles de site et pages qui ne sont pas un profil.
export const COMPTES_MODELES = ['wix', 'wixcom', 'squarespace', 'jimdo', 'jimdo_fr', 'wordpress', 'wordpressdotcom', 'shopify', 'weebly', 'webador',
  'godaddy', 'facebook', 'instagram', 'meta', 'google', 'yourpage', 'yourprofile', 'username', 'votrepage', 'votre_page', 'votreprofil', 'votrecompte',
  'exemple', 'example', 'monsite', 'pagesjaunes', 'solocal', 'ovh', 'ionos'];

export const MASQUE_GOOGLE = 'places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.businessStatus,' +
  'places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.primaryType';
