// ============================================================
// Cadrage de la photo d'accueil (hero) — partagé entre la boutique
// publique et l'éditeur du dashboard commerçant.
//
// Un cadrage = { url, x, y, zoom }
//   x, y : point d'ancrage en % (50/50 = centré), même logique que
//          background-position.
//   zoom : 0 = photo entière visible (des bandes floues comblent le vide)
//          1 = la photo remplit le cadre (comportement historique)
//          >1 = zoom avant.
// Stocké dans commercants.business_config.hero_cadrage. Le champ `url`
// évite d'appliquer un vieux cadrage à une nouvelle photo.
// ============================================================
(function () {
  'use strict';

  var ZOOM_MAX = 3;

  function borne(v, min, max, defaut) {
    v = Number(v);
    if (!isFinite(v)) return defaut;
    return Math.min(max, Math.max(min, v));
  }

  function normaliser(c) {
    c = c || {};
    return {
      url: c.url || '',
      x: borne(c.x, 0, 100, 50),
      y: borne(c.y, 0, 100, 50),
      zoom: borne(c.zoom, 0, ZOOM_MAX, 1)
    };
  }

  // Taille affichée de la photo (px) pour un cadre et un zoom donnés.
  function taille(cadreL, cadreH, natL, natH, zoom) {
    var remplir = Math.max(cadreL / natL, cadreH / natH);
    var entiere = Math.min(cadreL / natL, cadreH / natH);
    var echelle = zoom <= 1 ? entiere + (remplir - entiere) * zoom : remplir * zoom;
    return { l: natL * echelle, h: natH * echelle };
  }

  // Applique le cadrage sur `calque` (image en background) dans `cadre`.
  // `fond` (optionnel) : calque flou affiché quand la photo ne couvre pas tout.
  function appliquer(cadre, calque, fond, natL, natH, cadrage) {
    var L = cadre.clientWidth, H = cadre.clientHeight;
    if (!L || !H || !natL || !natH) return null;
    var c = normaliser(cadrage);
    var t = taille(L, H, natL, natH, c.zoom);
    calque.style.backgroundSize = t.l.toFixed(1) + 'px ' + t.h.toFixed(1) + 'px';
    calque.style.backgroundPosition = c.x + '% ' + c.y + '%';
    if (fond) fond.style.opacity = (t.l < L - 0.5 || t.h < H - 0.5) ? '1' : '0';
    return { l: t.l, h: t.h, cadreL: L, cadreH: H };
  }

  window.HeroCadrage = { ZOOM_MAX: ZOOM_MAX, normaliser: normaliser, taille: taille, appliquer: appliquer };
})();
