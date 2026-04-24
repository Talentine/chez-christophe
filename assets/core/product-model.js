// ============================================================
// PRODUCT MODEL — normalisation universelle compatible tous métiers
// ============================================================

/**
 * Normalise un produit brut Supabase en modèle universel.
 * Tout ce qui est spécifique métier va dans `custom`.
 */
export function normalize(raw) {
  if (!raw) return null;
  const cf = raw.custom_fields || {};
  return {
    id:            raw.id,
    nom:           raw.nom,
    description:   raw.description || '',
    categorie:     raw.categories ? { nom: raw.categories.nom, slug: raw.categories.slug, emoji: raw.categories.emoji } : null,
    photoUrl:      raw.photo_url || null,

    // Prix universel
    prix:          Number(raw.prix_marche_indicatif ?? raw.prix ?? 0),
    unite:         raw.unite || 'pièce',

    // Stock
    actif:         !!raw.actif,
    stockDispo:    raw.stock_dispo ?? null,

    // Badges (fusion colonnes + custom_fields)
    badges: compactBadges({
      saison:  raw.saisonnier ?? cf.saisonnier ?? false,
      bio:     raw.badge_bio ?? cf.bio ?? false,
      local:   raw.badge_local ?? cf.local ?? false,
      nouveau: raw.badge_nouveau ?? cf.nouveau ?? false,
      promo:   cf.promo ?? false,
      aop:     cf.aop ?? false,
      sauvage: cf.sauvage ?? false
    }),

    provenance: raw.provenance || cf.provenance || cf.origine_viande || cf.origine_peche || cf.region || null,

    // Métier — accès typé depuis le handler
    custom: cf,

    createdAt: raw.created_at,
    _raw: raw
  };
}

function compactBadges(obj) {
  return Object.entries(obj).filter(([,v]) => !!v).map(([k]) => k);
}

/**
 * Retourne les champs métier pertinents pour l'UI, selon le handler.
 */
export function extractDisplayFields(product, handler) {
  if (!product || !handler) return [];
  const fields = [];
  const cf = product.custom || {};

  const map = {
    // Primeur
    distance_km:       v => ({ icon:'📍', label:'Distance', value: v + ' km' }),
    producteur:        v => ({ icon:'👨‍🌾', label:'Producteur', value: v }),

    // Boucherie
    origine_viande:    v => ({ icon:'🇫🇷', label:'Origine', value: v }),
    races:             v => ({ icon:'🐄', label:'Race', value: Array.isArray(v) ? v.join(', ') : v }),
    maturation_jours:  v => ({ icon:'⏳', label:'Maturation', value: v + ' jours' }),
    cuisson_suggeree:  v => ({ icon:'🔥', label:'Cuisson', value: v }),

    // Boulangerie
    farine:            v => ({ icon:'🌾', label:'Farine', value: v }),
    poids_g:           v => ({ icon:'⚖️', label:'Poids', value: v + ' g' }),
    commande_avant_h:  v => ({ icon:'🕐', label:'Commande avant', value: v + 'h' }),

    // Poissonnerie
    origine_peche:     v => ({ icon:'🌊', label:'Origine', value: v }),
    zone_fao:          v => ({ icon:'🗺️', label:'Zone FAO', value: v }),
    methode:           v => ({ icon:'⚓', label:'Méthode', value: v }),
    dlc_heures:        v => ({ icon:'🕒', label:'DLC', value: v + ' h' }),

    // Traiteur
    portions_min:      v => ({ icon:'🍽️', label:'Portions min.', value: v }),
    delai_prepa_h:     v => ({ icon:'⏱️', label:'Préparation', value: v + ' h' }),
    allergenes:        v => ({ icon:'⚠️', label:'Allergènes', value: Array.isArray(v) ? v.join(', ') : v }),

    // Fromagerie
    lait:              v => ({ icon:'🥛', label:'Lait', value: v }),
    affinage_mois:     v => ({ icon:'🧂', label:'Affinage', value: v + ' mois' }),
    region:            v => ({ icon:'📍', label:'Région', value: v })
  };

  for (const key of handler.product_extra_fields || []) {
    if (cf[key] !== undefined && cf[key] !== null && cf[key] !== '' && map[key]) {
      fields.push(map[key](cf[key]));
    }
  }
  return fields;
}

/**
 * Valide un payload produit côté commerçant selon le handler.
 */
export function validateProduct(payload, handler) {
  const errors = [];
  if (!payload.nom || payload.nom.trim().length < 2) errors.push('Nom requis');
  if (payload.prix == null || payload.prix < 0) errors.push('Prix invalide');
  if (!payload.unite) errors.push('Unité requise');

  if (handler?.features?.dlc && !payload.custom_fields?.dlc_heures) {
    errors.push('DLC requise pour ce type de commerce');
  }
  return errors;
}
