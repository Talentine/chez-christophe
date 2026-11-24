/* ============================================================
 * Modes de vente — restaurants et pizzerias uniquement
 *
 * Le restaurateur choisit (dashboard → Réglages → Vente à emporter & livraison) :
 *   - boutique : vente à emporter oui/non, livraison oui/non
 *     (commercants.vente_retrait / vente_livraison)
 *   - plat par plat : à emporter oui/non, livraison oui/non
 *     (catalogue.vente_retrait / vente_livraison)
 * Un plat sans aucun mode est affiché sur la carte, « Sur place uniquement ».
 * Pour tous les autres métiers, rien ne change (tout est autorisé).
 * Garde-fou serveur : trigger public.modes_vente_verifier sur commande_lignes.
 * ============================================================ */
(function () {
  var METIERS = ['restaurant', 'pizzeria'];

  function biz(b) { return b || (window.__CONFIG__ && window.__CONFIG__.business) || null; }

  function concerne(b) {
    b = biz(b);
    return !!b && METIERS.indexOf(b.business_type) >= 0;
  }

  // Modes réellement proposés par la boutique (la livraison suppose l'offre livraison)
  function boutique(b) {
    b = biz(b);
    var livOffre = !!b && b.offre === 'livraison';
    if (!concerne(b)) return { retrait: true, livraison: livOffre };
    return { retrait: b.vente_retrait !== false, livraison: livOffre && b.vente_livraison !== false };
  }

  // Modes autorisés pour un plat (ligne catalogue ou produit aplati)
  function produit(p, b) {
    var s = boutique(b);
    if (!concerne(b) || !p) return s;
    return {
      retrait: s.retrait && p.vente_retrait !== false,
      livraison: s.livraison && p.vente_livraison !== false,
    };
  }

  function commandable(p, b) {
    var m = produit(p, b);
    return m.retrait || m.livraison;
  }

  // Libellé court à afficher sur la carte du plat ('' = rien de particulier)
  function libelle(p, b) {
    if (!concerne(b)) return '';
    var s = boutique(b);
    if (!s.retrait && !s.livraison) return '';   // toute la carte est « sur place » : pas de badge par plat
    var m = produit(p, b);
    if (m.retrait === s.retrait && m.livraison === s.livraison) return '';
    if (!m.retrait && !m.livraison) return 'Sur place uniquement';
    if (m.retrait && !m.livraison) return 'À emporter uniquement';
    return 'Livraison uniquement';
  }

  function badgeHtml(p, b) {
    var l = libelle(p, b);
    if (!l) return '';
    return '<div style="font-size:11.5px;font-weight:700;color:#8a5a14;margin-top:2px;line-height:1.2;">'
      + (l === 'Sur place uniquement' ? '🍽️ ' : l === 'Livraison uniquement' ? '🚚 ' : '🛍️ ') + l + '</div>';
  }

  // Texte du bouton remplacé quand le plat ne peut pas être commandé
  function actionSurPlace() {
    return '<span style="font-size:12px;font-weight:700;color:#8a5a14;white-space:nowrap;">Sur place</span>';
  }

  window.ModesVente = {
    METIERS: METIERS,
    concerne: concerne,
    boutique: boutique,
    produit: produit,
    commandable: commandable,
    libelle: libelle,
    badgeHtml: badgeHtml,
    actionSurPlace: actionSurPlace,
  };
})();
