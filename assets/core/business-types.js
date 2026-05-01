// ============================================================
// BUSINESS TYPES — handlers par métier
// Chaque type expose : palette, fontes, features, filtres, labels.
// L'UI consomme le handler pour adapter l'affichage sans duplication.
// ============================================================

export const BUSINESS_TYPES = {
  primeur: {
    label: 'Primeur',
    palette: { primary:'#2A4535', primary_dark:'#1C3028', accent:'#B8832A', accent_light:'#F0D690', danger:'#C4614A', cream:'#FAF7F0', cream_dark:'#F0EAD8' },
    fonts:   { display:'"Playfair Display"', body:'"Plus Jakarta Sans"' },
    emoji_fallback: '🌿',
    features: { saison:true, bio:true, provenance:true, decoupe:false, cuisson:false, programmation:false, dlc:false, poids_variable:true },
    filters: ['saison','bio','local','nouveau'],
    product_extra_fields: ['saisonnier','distance_km','producteur'],
    cart_modes: ['retrait','livraison'],
    labels: { produits:'Nos rayons', panier:'Mon panier', arrivage:'Arrivage du jour', coups_coeur:'Coups de cœur' }
  },

  boucherie: {
    label: 'Boucherie',
    palette: { primary:'#8B1A1A', primary_dark:'#5C1010', accent:'#D4A44C', accent_light:'#F0CE8A', danger:'#3D0A0A', cream:'#FAF5EC', cream_dark:'#EDE3CE' },
    fonts:   { display:'"Bebas Neue"', body:'"Inter"' },
    emoji_fallback: '🥩',
    features: { saison:false, bio:false, provenance:true, decoupe:true, cuisson:true, programmation:true, dlc:false, poids_variable:true },
    filters: ['origine','race','maturation'],
    product_extra_fields: ['origine_viande','races','decoupes_dispo','maturation_jours','poids_min_g','poids_max_g','poids_pas_g','cuisson_suggeree'],
    cart_modes: ['retrait','livraison'],
    labels: { produits:'Nos viandes', panier:'Ma commande', arrivage:'Pièces du jour', coups_coeur:'Sélection du boucher' }
  },

  boulangerie: {
    label: 'Boulangerie',
    palette: { primary:'#6B4423', primary_dark:'#4A2E17', accent:'#E8B14C', accent_light:'#F5D288', danger:'#A04D2B', cream:'#FAF3E3', cream_dark:'#EEE1C2' },
    fonts:   { display:'"Fraunces"', body:'"Inter"' },
    emoji_fallback: '🥖',
    features: { saison:false, bio:true, provenance:false, decoupe:false, cuisson:false, programmation:true, dlc:true, poids_variable:false },
    filters: ['bio','sans-gluten','complet'],
    product_extra_fields: ['farine','poids_g','sans_gluten','disponible_jours','commande_avant_h'],
    cart_modes: ['retrait','livraison','programme'],
    labels: { produits:'Pains & viennoiseries', panier:'Ma commande', arrivage:'Sorti du four', coups_coeur:'Spécialités' }
  },

  poissonnerie: {
    label: 'Poissonnerie',
    palette: { primary:'#1B4965', primary_dark:'#0E2B40', accent:'#62B6CB', accent_light:'#9DD4E0', danger:'#C4614A', cream:'#F4F7F9', cream_dark:'#E1E9EE' },
    fonts:   { display:'"Playfair Display"', body:'"Inter"' },
    emoji_fallback: '🐟',
    features: { saison:true, bio:false, provenance:true, decoupe:true, cuisson:false, programmation:false, dlc:true, poids_variable:true },
    filters: ['origine','sauvage','peche-du-jour'],
    product_extra_fields: ['origine_peche','zone_fao','methode','sauvage','dlc_heures','vide_ecaille','poids_approx_g'],
    cart_modes: ['retrait','livraison'],
    labels: { produits:'Pêche du jour', panier:'Mon panier', arrivage:'Arrivé ce matin', coups_coeur:'Poissons nobles' }
  },

  traiteur: {
    label: 'Traiteur',
    palette: { primary:'#2B2B2B', primary_dark:'#111111', accent:'#C9A54B', accent_light:'#E5CB82', danger:'#8B3A3A', cream:'#F8F5EF', cream_dark:'#EAE4D6' },
    fonts:   { display:'"Cormorant Garamond"', body:'"Inter"' },
    emoji_fallback: '🍽️',
    features: { saison:false, bio:false, provenance:false, decoupe:false, cuisson:false, programmation:true, dlc:true, poids_variable:false },
    filters: ['allergenes','portions','chaud-froid'],
    product_extra_fields: ['portions_min','delai_prepa_h','allergenes','chaud_froid','conservation_h'],
    cart_modes: ['retrait','livraison','programme'],
    labels: { produits:'Notre carte', panier:'Ma commande', arrivage:'Spécialités', coups_coeur:'Coups de cœur du chef' }
  },

  fromagerie: {
    label: 'Fromagerie',
    palette: { primary:'#3D5446', primary_dark:'#243225', accent:'#C9A54B', accent_light:'#E5CB82', danger:'#8B5A2B', cream:'#FAF5E6', cream_dark:'#EADCBF' },
    fonts:   { display:'"Playfair Display"', body:'"Plus Jakarta Sans"' },
    emoji_fallback: '🧀',
    features: { saison:true, bio:true, provenance:true, decoupe:true, cuisson:false, programmation:false, dlc:true, poids_variable:true },
    filters: ['lait','region','aop','affinage'],
    product_extra_fields: ['lait','affinage_mois','region','aop','croute','poids_g','decoupe_possible'],
    cart_modes: ['retrait','livraison'],
    labels: { produits:'Nos fromages', panier:'Mon panier', arrivage:'Affinés du moment', coups_coeur:'Sélection de l\'affineur' }
  },

  // ============================================================
  // RESTAURATION : 3 sous-styles (pizzeria / restaurant / fastfood)
  // Caractéristique commune : reservation_table activable
  // ============================================================
  pizzeria: {
    label: 'Pizzeria',
    palette: { primary:'#9F1B1F', primary_dark:'#5C0E10', accent:'#1B7A3E', accent_light:'#7DCC95', danger:'#9F1B1F', cream:'#FFF8E7', cream_dark:'#F4E5C2' },
    fonts:   { display:'"Lobster"', body:'"Inter"' },
    emoji_fallback: '🍕',
    features: { saison:false, bio:false, provenance:false, decoupe:false, cuisson:true, programmation:true, dlc:false, poids_variable:false, reservation_table:true },
    filters: ['vegetarienne','epicee','signature'],
    product_extra_fields: ['allergenes','temps_cuisson_min','epicee','vegetarienne'],
    cart_modes: ['retrait','livraison','sur-place'],
    labels: { produits:'Nos pizzas', panier:'Ma commande', arrivage:'Spéciale du jour', coups_coeur:'Pizzas signatures' },
    is_restauration: true,
    style_resto: 'pizzeria'
  },

  restaurant: {
    label: 'Restaurant',
    palette: { primary:'#1F1F1F', primary_dark:'#0A0A0A', accent:'#A8825D', accent_light:'#D4B8A0', danger:'#7C2D2D', cream:'#F8F5F0', cream_dark:'#E8E0D5' },
    fonts:   { display:'"Playfair Display"', body:'"Inter"' },
    emoji_fallback: '🍽️',
    features: { saison:false, bio:false, provenance:false, decoupe:false, cuisson:true, programmation:true, dlc:false, poids_variable:false, reservation_table:true },
    filters: ['signature','vegetarienne','sans-gluten'],
    product_extra_fields: ['allergenes','temps_prepa_min','vegetarienne','sans_gluten'],
    cart_modes: ['retrait','livraison','sur-place'],
    labels: { produits:'Notre carte', panier:'Ma commande', arrivage:'Suggestion du chef', coups_coeur:'Plats signatures' },
    is_restauration: true,
    style_resto: 'restaurant'
  },

  fastfood: {
    label: 'Fast-food',
    palette: { primary:'#FFCC00', primary_dark:'#CC9900', accent:'#E63946', accent_light:'#F4A4AA', danger:'#1A1A1A', cream:'#FFF9E6', cream_dark:'#F0E5B8' },
    fonts:   { display:'"Bebas Neue"', body:'"Inter"' },
    emoji_fallback: '🍔',
    features: { saison:false, bio:false, provenance:false, decoupe:false, cuisson:true, programmation:false, dlc:false, poids_variable:false, reservation_table:false },
    filters: ['burger','vegetarien','epice'],
    product_extra_fields: ['allergenes','temps_prepa_min','sauce','calories'],
    cart_modes: ['retrait','livraison','sur-place'],
    labels: { produits:'Notre carte', panier:'Ma commande', arrivage:'Édition limitée', coups_coeur:'Best-sellers' },
    is_restauration: true,
    style_resto: 'fastfood'
  }
};

export function getHandler(type) {
  return BUSINESS_TYPES[type] || BUSINESS_TYPES.primeur;
}

export function listTypes() {
  return Object.entries(BUSINESS_TYPES).map(([k, v]) => ({ key:k, label:v.label }));
}
