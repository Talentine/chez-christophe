/* Marchéo — pop-up d'offre « Pour soutenir les commerçants » (code SOUTIEN30)
 * -30 % sur les frais d'installation + 2 mois d'abonnement offerts, jusqu'au 20 novembre 2026 inclus.
 * S'affiche une fois (re-proposé 3 jours après fermeture), disparaît seul après la date de fin.
 * Le code est mémorisé (localStorage) : il est pré-rempli à l'inscription et au moment du paiement.
 */
(function () {
  var OFFRE = {
    code: 'SOUTIEN30',
    fin: new Date('2026-11-20T23:59:59+01:00'),
    finTexte: '20 novembre',
    lien: '/inscription.html?code=SOUTIEN30'
  };
  var CLE_FERME = 'marcheo_popup_soutien_ferme';
  var DELAI_RAPPEL = 3 * 24 * 3600 * 1000;

  if (Date.now() > OFFRE.fin.getTime()) return;
  try {
    var p = new URLSearchParams(location.search);
    if (p.get('demo') === '1' || p.get('nopromo') === '1') return;
  } catch (e) {}

  function memoriserCode() {
    try { localStorage.setItem('marcheo_code_promo', OFFRE.code); } catch (e) {}
  }
  function dejaFerme() {
    try {
      var t = parseInt(localStorage.getItem(CLE_FERME) || '0', 10);
      return t && (Date.now() - t) < DELAI_RAPPEL;
    } catch (e) { return false; }
  }
  if (dejaFerme()) return;

  var css = '' +
    '.mpromo-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(10,20,40,.55);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .25s ease;backdrop-filter:blur(2px)}' +
    '.mpromo-overlay.on{opacity:1}' +
    '.mpromo{position:relative;width:100%;max-width:420px;background:#F7F2E8;border-radius:22px;overflow:hidden;box-shadow:0 24px 60px rgba(10,20,40,.35);font-family:Inter,Manrope,system-ui,sans-serif;color:#0A1428;transform:translateY(16px) scale(.98);transition:transform .3s cubic-bezier(.2,.8,.2,1)}' +
    '.mpromo-overlay.on .mpromo{transform:none}' +
    '.mpromo-top{background:#0F2C52;color:#fff;padding:26px 24px 22px;position:relative}' +
    '.mpromo-kicker{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#F4B942}' +
    '.mpromo-kicker:before{content:"";width:8px;height:8px;border-radius:50%;background:#5BBE3A;box-shadow:0 0 0 4px rgba(91,190,58,.25)}' +
    '.mpromo h2{font-family:Manrope,system-ui,sans-serif;font-size:26px;line-height:1.15;font-weight:800;margin:10px 0 0;letter-spacing:-.02em;color:#fff}' +
    '.mpromo-x{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:50%;border:0;background:rgba(255,255,255,.12);color:#fff;font-size:18px;line-height:34px;cursor:pointer}' +
    '.mpromo-x:hover{background:rgba(255,255,255,.22)}' +
    '.mpromo-body{padding:20px 24px 24px}' +
    '.mpromo-chiffres{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}' +
    '.mpromo-chiffre{background:#fff;border:1px solid #E5E2D8;border-radius:14px;padding:12px 12px 10px;text-align:center}' +
    '.mpromo-chiffre b{display:block;font-family:Manrope,system-ui,sans-serif;font-size:30px;line-height:1;font-weight:800;color:#0F2C52;letter-spacing:-.02em}' +
    '.mpromo-chiffre span{display:block;font-size:12.5px;color:#5A6478;margin-top:6px;line-height:1.3}' +
    '.mpromo-chiffre.vert b{color:#3E9A22}' +
    '.mpromo p{font-size:14px;line-height:1.5;color:#3A4558;margin:0 0 14px}' +
    '.mpromo-code{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1.5px dashed #0F2C52;border-radius:12px;padding:10px 12px;margin-bottom:14px;background:#fff}' +
    '.mpromo-code small{font-size:12px;color:#5A6478}' +
    '.mpromo-code strong{font-family:Manrope,system-ui,sans-serif;font-size:18px;letter-spacing:.08em;color:#0F2C52}' +
    '.mpromo-code button{border:0;background:#DDF3D2;color:#2D6E17;font-weight:700;font-size:12.5px;border-radius:8px;padding:7px 10px;cursor:pointer;font-family:inherit}' +
    '.mpromo-cta{display:block;width:100%;text-align:center;background:#5BBE3A;color:#0A1428;font-weight:800;font-size:16px;border-radius:999px;padding:15px 18px;text-decoration:none;font-family:Manrope,system-ui,sans-serif;transition:transform .15s ease,background .15s ease}' +
    '.mpromo-cta:hover{background:#4FAE30;transform:translateY(-1px)}' +
    '.mpromo-later{display:block;width:100%;margin-top:10px;border:0;background:none;color:#5A6478;font-size:13px;cursor:pointer;font-family:inherit;text-decoration:underline}' +
    '.mpromo-fin{font-size:12px;color:#5A6478;text-align:center;margin-top:10px}' +
    '@media (max-width:380px){.mpromo h2{font-size:22px}.mpromo-chiffre b{font-size:26px}}' +
    '@media (prefers-reduced-motion:reduce){.mpromo-overlay,.mpromo{transition:none}}';

  function construire() {
    if (document.getElementById('mpromo-soutien')) return;
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);

    var o = document.createElement('div');
    o.className = 'mpromo-overlay';
    o.id = 'mpromo-soutien';
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    o.setAttribute('aria-labelledby', 'mpromo-titre');
    o.innerHTML =
      '<div class="mpromo">' +
        '<div class="mpromo-top">' +
          '<button class="mpromo-x" type="button" aria-label="Fermer">✕</button>' +
          '<span class="mpromo-kicker">Pour soutenir les commerçants</span>' +
          '<h2 id="mpromo-titre">La période est dure. On vous donne un coup de main.</h2>' +
        '</div>' +
        '<div class="mpromo-body">' +
          '<div class="mpromo-chiffres">' +
            '<div class="mpromo-chiffre"><b>-30&nbsp;%</b><span>sur les frais d\'installation</span></div>' +
            '<div class="mpromo-chiffre vert"><b>2 mois</b><span>d\'abonnement offerts</span></div>' +
          '</div>' +
          '<p>Votre site de commande en ligne, prêt pour vos commandes de Noël. Sans engagement, 0&nbsp;% de commission.</p>' +
          '<div class="mpromo-code"><div><small>Votre code</small><br><strong>' + OFFRE.code + '</strong></div><button type="button" class="mpromo-copier">Copier</button></div>' +
          '<a class="mpromo-cta" href="' + OFFRE.lien + '">J\'en profite</a>' +
          '<button class="mpromo-later" type="button">Plus tard</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(o);

    function fermer() {
      try { localStorage.setItem(CLE_FERME, String(Date.now())); } catch (e) {}
      o.classList.remove('on');
      setTimeout(function () { if (o.parentNode) o.parentNode.removeChild(o); }, 260);
      document.removeEventListener('keydown', surTouche);
    }
    function surTouche(e) { if (e.key === 'Escape') fermer(); }

    o.querySelector('.mpromo-x').addEventListener('click', fermer);
    o.querySelector('.mpromo-later').addEventListener('click', fermer);
    o.addEventListener('click', function (e) { if (e.target === o) fermer(); });
    document.addEventListener('keydown', surTouche);
    o.querySelector('.mpromo-copier').addEventListener('click', function () {
      var b = this;
      memoriserCode();
      try { navigator.clipboard.writeText(OFFRE.code); } catch (e) {}
      b.textContent = 'Copié ✓';
    });
    o.querySelector('.mpromo-cta').addEventListener('click', function () {
      memoriserCode();
      try { localStorage.setItem(CLE_FERME, String(Date.now())); } catch (e) {}
      try { if (window.MarcheoAnalytics) window.MarcheoAnalytics.track('promo_soutien_clic', { code: OFFRE.code }); } catch (e) {}
    });

    requestAnimationFrame(function () { o.classList.add('on'); });
    try { if (window.MarcheoAnalytics) window.MarcheoAnalytics.track('promo_soutien_vue', { code: OFFRE.code }); } catch (e) {}
    var cta = o.querySelector('.mpromo-cta');
    if (cta) setTimeout(function () { try { cta.focus({ preventScroll: true }); } catch (e) {} }, 300);
  }

  function planifier() { setTimeout(construire, 3500); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', planifier);
  else planifier();
})();
