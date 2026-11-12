// ============================================================
// Marchéo · Démo non mise en ligne
// Une boutique créée par un commerçant et pas encore mise en ligne (abonnement non actif)
// reste accessible à qui en connaît l'adresse, mais elle n'est pas référencée :
//   - jamais indexée (balise robots noindex posée ici, et absente du sitemap)
//   - le commerçant connecté, l'admin Marchéo et les porteurs du lien d'aperçu
//     (?apercu=<clé>, copiable depuis le dashboard) voient en plus le rappel « Démo privée »
// Les visiteurs voient la boutique avec son bandeau « Boutique de démonstration ».
// ============================================================
(function () {
  var fait = false;

  function cleApercu(biz) { return String(biz.id || '').replace(/-/g, '').slice(0, 10); }

  function estProprietaire(biz) {
    try {
      var s = JSON.parse(localStorage.getItem('session_commercant') || '{}');
      var cid = s.commercant_id || s.id;
      return !!(biz.id && (cid === biz.id || (s.slug && s.slug === biz.slug)));
    } catch (e) { return false; }
  }
  function estAdmin() {
    try { return !!JSON.parse(localStorage.getItem('session_admin') || '{}').access_token; } catch (e) { return false; }
  }
  function aLienApercu(biz) {
    var cle = cleApercu(biz), k = 'marcheo_apercu_' + biz.slug;
    try {
      var p = new URLSearchParams(location.search).get('apercu');
      if (p && cle && p === cle) { localStorage.setItem(k, cle); return true; }
      return !!cle && localStorage.getItem(k) === cle;
    } catch (e) { return false; }
  }

  function estDemoPrivee(biz) {
    return !!biz && !!biz.id
      && biz.abonnement_actif !== true
      && biz.is_fixture !== true
      && biz.est_demo_ambassadeur !== true
      && !!biz.auth_user_id;
  }

  function noindex() {
    var m = document.querySelector('meta[name="robots"]');
    if (!m) { m = document.createElement('meta'); m.name = 'robots'; document.head.appendChild(m); }
    m.content = 'noindex, nofollow';
  }

  function styles() {
    if (document.getElementById('mq-prive-style')) return;
    var st = document.createElement('style');
    st.id = 'mq-prive-style';
    st.textContent =
      '#mq-prive-badge{position:fixed;left:12px;bottom:calc(74px + env(safe-area-inset-bottom,0px));z-index:98;display:flex;align-items:center;gap:7px;'
      + 'background:#0F2C52;color:#fff;border-radius:50px;padding:8px 13px 8px 10px;font:700 12.5px Manrope,system-ui,sans-serif;box-shadow:0 6px 18px rgba(15,44,82,.3)}'
      + '#mq-prive-badge svg{flex-shrink:0;color:#8BE06C}';
    document.head.appendChild(st);
  }

  var CADENAS = '<svg width="WW" height="WW" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></svg>';

  function badge() {
    // La page boutique a déjà son bandeau « Démo privée » ; ailleurs, un rappel discret.
    if (document.getElementById('m-demo-banner') || document.getElementById('mq-prive-badge')) return;
    styles();
    var b = document.createElement('div');
    b.id = 'mq-prive-badge';
    b.innerHTML = CADENAS.replace(/WW/g, '15') + 'Démo privée · visible par vous seul';
    document.body.appendChild(b);
  }

  function demarrer(biz) {
    if (fait || !estDemoPrivee(biz)) return;
    fait = true;
    noindex();
    window.__DEMO_PRIVEE__ = { cle: cleApercu(biz) };
    if (estProprietaire(biz) || estAdmin() || aLienApercu(biz)) badge();
  }

  document.addEventListener('business:ready', function (e) {
    demarrer((e.detail && e.detail.business) || (window.__CONFIG__ && window.__CONFIG__.business));
  });
  var essais = 0;
  (function attendre() {
    var biz = window.__CONFIG__ && window.__CONFIG__.business;
    if (biz && biz.id) return demarrer(biz);
    if (++essais < 40) setTimeout(attendre, 250);
  })();
})();
