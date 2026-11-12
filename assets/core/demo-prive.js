// ============================================================
// Marchéo · Démo privée
// Une boutique créée par un commerçant et pas encore mise en ligne (abonnement non actif)
// n'est visible que par lui :
//   - jamais indexée (balise robots noindex posée ici, et absente du sitemap)
//   - un visiteur qui tombe sur l'adresse voit « Boutique en préparation »
//   - le commerçant connecté, l'admin Marchéo et les porteurs du lien d'aperçu privé
//     (?apercu=<clé>, copiable depuis le dashboard) voient la boutique normalement
// Restent publiques : les boutiques avec abonnement actif, les boutiques d'exemple Marchéo
// (is_fixture), les démos ambassadeur et les démos préparées par Marchéo sans compte lié.
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
      '#mq-prive-mur{position:fixed;inset:0;z-index:2147483000;background:#F7F2E8;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Manrope,system-ui,sans-serif;color:#0F2C52;overflow:auto}'
      + '#mq-prive-mur .mq-pv-box{max-width:440px;width:100%;text-align:center;background:#fff;border-radius:24px;padding:34px 26px 28px;box-shadow:0 18px 50px rgba(15,44,82,.12)}'
      + '#mq-prive-mur .mq-pv-ico{width:64px;height:64px;border-radius:50%;background:#0F2C52;color:#fff;display:flex;align-items:center;justify-content:center;margin:0 auto 18px}'
      + '#mq-prive-mur h1{font-size:23px;font-weight:800;line-height:1.25;margin:0 0 10px;color:#0F2C52}'
      + '#mq-prive-mur p{font-size:15.5px;line-height:1.55;margin:0 0 22px;color:#3F4D66}'
      + '#mq-prive-mur a.mq-pv-cta{display:block;background:#0F2C52;color:#fff;border-radius:50px;padding:15px;font-weight:800;font-size:16px;text-decoration:none}'
      + '#mq-prive-mur a.mq-pv-lien{display:inline-block;margin-top:14px;color:#3F4D66;font-weight:600;font-size:14px;text-decoration:underline}'
      + '#mq-prive-mur a:focus-visible{outline:3px solid #5BBE3A;outline-offset:3px}'
      + '#mq-prive-mur .mq-pv-pied{margin-top:20px;font-size:12.5px;color:#6B7785}'
      + '#mq-prive-badge{position:fixed;left:12px;bottom:calc(74px + env(safe-area-inset-bottom,0px));z-index:98;display:flex;align-items:center;gap:7px;'
      + 'background:#0F2C52;color:#fff;border-radius:50px;padding:8px 13px 8px 10px;font:700 12.5px Manrope,system-ui,sans-serif;box-shadow:0 6px 18px rgba(15,44,82,.3)}'
      + '#mq-prive-badge svg{flex-shrink:0;color:#8BE06C}';
    document.head.appendChild(st);
  }

  var CADENAS = '<svg width="WW" height="WW" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></svg>';

  function mur(biz) {
    if (document.getElementById('mq-prive-mur')) return;
    styles();
    var m = document.createElement('div');
    m.id = 'mq-prive-mur';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-labelledby', 'mq-pv-titre');
    m.innerHTML = '<div class="mq-pv-box">'
      + '<div class="mq-pv-ico">' + CADENAS.replace(/WW/g, '30') + '</div>'
      + '<h1 id="mq-pv-titre">Cette boutique est en préparation</h1>'
      + '<p>Elle n\'est pas encore ouverte au public. Revenez bientôt pour commander en ligne.</p>'
      + '<a class="mq-pv-cta" href="/app">Je suis le commerçant · me connecter</a>'
      + '<a class="mq-pv-lien" href="/">Découvrir Marchéo</a>'
      + '<div class="mq-pv-pied">Boutique créée avec Marchéo</div></div>';
    document.body.appendChild(m);
    document.documentElement.style.overflow = 'hidden';
    document.title = 'Boutique en préparation';
    try { if (window.MarcheoAnalytics) window.MarcheoAnalytics.track('demo_privee_bloquee', { boutique: biz.slug || null }); } catch (e) {}
  }

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
    else mur(biz);
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
