/* ════════════════════════════════════════════════════════════════════
   Expédition France — côté boutique publique.

   Chargé par boutique, catalogue, compte, notre-histoire et expedition.
   Quand la boutique propose l'expédition (option activée par Marchéo ET
   ouverte par le commerçant), ajoute l'entrée « Expédition » dans la barre
   du bas et une pastille sur la page d'accueil. Sinon : ne fait rien.

   Expose window.Expedition = { pret (Promise), reglages, disponible }.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SB_URL = 'https://epvdzhzwfmtnioedyfgm.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdmR6aHp3Zm10bmlvZWR5ZmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDYwMTgsImV4cCI6MjA5MjAyMjAxOH0.NnMHas3OCJxfqQW3lUG9LDrklsuO_c9-Xpm41K5q1uc';

  var ICONE = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>';

  var resoudre;
  var etat = {
    reglages: null,
    disponible: false,
    pret: new Promise(function (ok) { resoudre = ok; }),
  };
  window.Expedition = etat;

  function lien() {
    return (window.CC && window.CC.url) ? window.CC.url('expedition.html') : 'expedition.html';
  }

  function estDisponible(biz, r) {
    if (!biz || !r || !r.active || !r.ouverte) return false;
    if (!Array.isArray(r.grille) || r.grille.length === 0) return false;
    if (biz.offre === 'vitrine' || (biz.pays && biz.pays !== 'FR')) return false;
    // Boutique abonnée : le paiement en ligne doit être prêt
    if (biz.abonnement_actif === true && !(biz.stripe_connect_actif && biz.stripe_connect_charges_enabled)) return false;
    return true;
  }

  function ajouterEntreeNav() {
    var nav = document.querySelector('.bottom-nav');
    if (!nav || nav.querySelector('[data-expedition-nav]')) return;
    var items = nav.querySelectorAll('.nav-item');
    if (!items.length) return;
    var a = document.createElement('a');
    a.className = 'nav-item';
    a.setAttribute('data-expedition-nav', '1');
    a.href = lien();
    // Même style d'icône que les autres entrées de la page (SVG ou emoji)
    var enSvg = !!nav.querySelector('.nav-icon svg');
    a.innerHTML = '<span class="nav-icon">' + (enSvg ? ICONE : '📦') + '</span><span class="nav-label">Expédition</span>';
    if (/expedition(\.html)?$/.test(location.pathname)) a.classList.add('active');
    // Avant « Compte », toujours en dernière position
    nav.insertBefore(a, items[items.length - 1]);
    // Six entrées : on resserre légèrement les libellés sur petit écran
    if (!document.getElementById('expeditionNavStyle')) {
      var st = document.createElement('style');
      st.id = 'expeditionNavStyle';
      st.textContent = '@media (max-width:400px){.bottom-nav .nav-label{font-size:10px;letter-spacing:-.1px}}';
      document.head.appendChild(st);
    }
  }

  function ajouterPastilleAccueil(r) {
    var zone = document.getElementById('heroInfosWrap');
    if (!zone || zone.querySelector('[data-expedition-pill]')) return;
    var a = document.createElement('a');
    a.className = 'hero-info-pill';
    a.setAttribute('data-expedition-pill', '1');
    a.href = lien();
    a.style.textDecoration = 'none';
    a.style.color = 'inherit';
    a.textContent = (r.mode_froid ? '❄️' : '📦') + ' Expédition partout en France, livré en 24 h';
    zone.appendChild(a);
  }

  function charger(cfg) {
    var biz = cfg && cfg.business;
    if (!biz || !biz.id) { resoudre(etat); return; }
    fetch(SB_URL + '/rest/v1/expedition_reglages?commercant_id=eq.' + biz.id + '&select=*', {
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
    })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        var r = Array.isArray(rows) ? rows[0] : null;
        etat.reglages = r || null;
        etat.disponible = estDisponible(biz, r);
        if (etat.disponible) {
          ajouterEntreeNav();
          ajouterPastilleAccueil(r);
        }
      })
      .catch(function () { /* option absente : la boutique reste inchangée */ })
      .then(function () {
        resoudre(etat);
        try { document.dispatchEvent(new CustomEvent('expedition:pret', { detail: etat })); } catch (e) {}
      });
  }

  if (window.__CONFIG__ && window.__CONFIG__.business) charger(window.__CONFIG__);
  else document.addEventListener('business:ready', function (ev) { charger(ev.detail); }, { once: true });
})();
