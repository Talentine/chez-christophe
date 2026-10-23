// ============================================================
// Marchéo · Boutique de démonstration ouverte depuis une publicité
// Lien publicitaire : /chez-christophe?demo=1  (le mode reste actif pendant la visite, onglet par onglet)
// Uniquement sur les boutiques de démonstration (is_fixture) :
//   - barre fixe « Créer ma démo gratuitement » → /inscription?metier=<métier de la boutique>
//   - aucune commande ne peut partir : le bouton de commande ouvre l'invitation à créer sa démo
//   - Pixel Meta (après consentement) : ViewContent à l'arrivée
// ============================================================
(function () {
  var CLE = 'marcheo_demo_pub';
  var params = new URLSearchParams(location.search);
  try { if (params.get('demo') === '1') sessionStorage.setItem(CLE, '1'); } catch (e) {}
  var actif = false;
  try { actif = sessionStorage.getItem(CLE) === '1'; } catch (e) {}
  if (!actif) return;

  var NOMS = { primeur: 'primeur', boucherie: 'boucherie', boulangerie: 'boulangerie', poissonnerie: 'poissonnerie',
    fromagerie: 'fromagerie', traiteur: 'traiteur', fleuriste: 'fleuriste', pizzeria: 'pizzeria', restaurant: 'restaurant', fastfood: 'fast-food' };
  var demarre = false;

  function lienInscription(bt) { return '/inscription?metier=' + encodeURIComponent(bt || ''); }

  function suivre(evenement, bt) {
    try { if (window.MarcheoAnalytics) window.MarcheoAnalytics.track(evenement, { business_type: bt || null }); } catch (e) {}
  }

  function ouvrirInvitation(bt) {
    if (document.getElementById('mq-demo-modal')) return;
    var m = document.createElement('div');
    m.id = 'mq-demo-modal';
    m.innerHTML = '<div class="mq-dm-box"><div class="mq-dm-t">Ceci est une boutique de démonstration</div>'
      + '<p>La commande n\'est pas envoyée. Vous voulez la même pour votre ' + (NOMS[bt] || 'commerce') + ' ? '
      + 'Votre boutique est prête en quelques minutes, avec le catalogue déjà rempli.</p>'
      + '<a class="mq-dm-cta" href="' + lienInscription(bt) + '">Créer ma démo gratuitement</a>'
      + '<button type="button" class="mq-dm-close">Continuer la visite</button></div>';
    m.addEventListener('click', function (e) {
      if (e.target === m || e.target.closest('.mq-dm-close')) m.remove();
      if (e.target.closest('.mq-dm-cta')) suivre('demo_pub_cta', bt);
    });
    document.body.appendChild(m);
  }

  function demarrer(biz) {
    if (demarre || !biz) return;
    if (biz.is_fixture !== true) { try { sessionStorage.removeItem(CLE); } catch (e) {} return; }
    demarre = true;
    var bt = biz.business_type || 'primeur';
    var surPanier = /panier/.test(location.pathname);
    var aNav = !!document.querySelector('.bottom-nav');

    var st = document.createElement('style');
    st.textContent =
      '#mq-demo-bar{position:fixed;left:0;right:0;z-index:99;bottom:' + (aNav ? 'calc(62px + env(safe-area-inset-bottom,0px))' : 'env(safe-area-inset-bottom,0px)') + ';'
      + 'padding:10px 12px 12px;background:linear-gradient(180deg,rgba(247,242,232,0),#F7F2E8 30%);font-family:Manrope,system-ui,sans-serif}'
      + (surPanier ? '#mq-demo-bar{top:0;bottom:auto;padding:8px 12px;background:#F7F2E8;box-shadow:0 2px 10px rgba(0,0,0,.08)}' : '')
      + '#mq-demo-bar a{display:flex;align-items:center;justify-content:center;gap:8px;max-width:520px;margin:0 auto;min-height:56px;'
      + 'background:#5BBE3A;color:#fff;border-radius:50px;font-weight:800;font-size:18px;text-decoration:none;box-shadow:0 8px 22px rgba(70,160,42,.35)}'
      + '#mq-demo-bar a:focus-visible{outline:3px solid #0F2C52;outline-offset:2px}'
      + '#mq-demo-bar small{display:block;text-align:center;color:#0F2C52;font-size:12.5px;font-weight:600;margin-top:6px}'
      + '#mq-demo-modal{position:fixed;inset:0;z-index:2147482000;background:rgba(15,44,82,.6);display:flex;align-items:center;justify-content:center;padding:20px}'
      + '#mq-demo-modal .mq-dm-box{background:#fff;border-radius:22px;max-width:420px;width:100%;padding:26px 22px;text-align:center;font-family:Manrope,system-ui,sans-serif;color:#0F2C52}'
      + '#mq-demo-modal .mq-dm-t{font-weight:800;font-size:20px;margin-bottom:8px}'
      + '#mq-demo-modal p{font-size:16px;line-height:1.45;margin:0 0 18px;color:#2B3A55}'
      + '#mq-demo-modal .mq-dm-cta{display:block;background:#5BBE3A;color:#fff;border-radius:50px;padding:16px;font-weight:800;font-size:17px;text-decoration:none}'
      + '#mq-demo-modal .mq-dm-close{margin-top:10px;background:none;border:none;color:#5A6478;font:600 14px Manrope,system-ui,sans-serif;padding:10px;cursor:pointer;text-decoration:underline}';
    document.head.appendChild(st);

    var bar = document.createElement('div');
    bar.id = 'mq-demo-bar';
    bar.innerHTML = '<a href="' + lienInscription(bt) + '">Créer ma démo gratuitement →</a>'
      + (surPanier ? '' : '<small>Boutique de démonstration Marchéo · la vôtre en quelques minutes</small>');
    bar.querySelector('a').addEventListener('click', function () { suivre('demo_pub_cta', bt); });
    document.body.appendChild(bar);
    var h = surPanier ? 74 : 100;
    if (surPanier) document.body.style.paddingTop = (parseInt(getComputedStyle(document.body).paddingTop, 10) || 0) + h + 'px';
    else document.body.style.paddingBottom = (parseInt(getComputedStyle(document.body).paddingBottom, 10) || 0) + h + 'px';

    // Aucune commande ne part d'une visite publicitaire : la validation ouvre l'invitation
    if (surPanier && typeof window.etapeSuivante === 'function') {
      var origine = window.etapeSuivante;
      window.etapeSuivante = function () {
        var e = 0; try { e = etape; } catch (x) {}
        var connecte = false; try { connecte = !!(typeof getSession === 'function' && getSession()); } catch (x) {}
        if (e >= 4 || (e === 1 && !connecte)) return ouvrirInvitation(bt);
        return origine.apply(this, arguments);
      };
    }

    suivre('demo_pub_vue', bt);
    var envoyer = function () { try { window.MarcheoPixel && window.MarcheoPixel.track('ViewContent', { content_category: bt, content_name: 'boutique_demo' }); } catch (e) {} };
    if (window.MarcheoPixel) envoyer();
    else { var s = document.createElement('script'); s.src = '/assets/core/meta-pixel.js?v=2'; s.onload = envoyer; document.head.appendChild(s); }
  }

  document.addEventListener('business:ready', function (e) { demarrer((e.detail && e.detail.business) || (window.__CONFIG__ && window.__CONFIG__.business)); });
  var essais = 0;
  (function attendre() {
    var biz = window.__CONFIG__ && window.__CONFIG__.business;
    if (biz && biz.id) return demarrer(biz);
    if (++essais < 40) setTimeout(attendre, 250);
  })();
})();
