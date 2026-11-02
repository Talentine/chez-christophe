// ============================================================
// Marchéo · Pixel Meta (pages d'acquisition commerçants uniquement)
// Chargé SEULEMENT après consentement explicite (CNIL).
// Tant que PIXEL_ID est vide, ce script ne fait rien (aucun bandeau).
//
// Usage : window.MarcheoPixel.track('Lead', { content_category: 'boucherie' });
//
// Gère aussi le consentement du pixel WeeglAd (même bandeau, même choix).
// Le choix enregistré porte w:1 quand le bandeau mentionnait WeeglAd ; un ancien
// « oui » donné pour Meta seul est redemandé avant d'activer WeeglAd.
// Si le consentement existe déjà, WeeglAd est chargé de façon synchrone dans le
// <head> de chaque page (script inline « data-weeglad-gate ») ; sinon il est
// chargé ici, au clic sur « Accepter ».
// ============================================================

(function () {
  const PIXEL_ID = '2383980339004163'; // ← ID du Pixel Meta (Gestionnaire d'événements), ex. '123456789012345'
  const CLE = 'marcheo_consent_pub';
  const DUREE_MS = 1000 * 60 * 60 * 24 * 390; // ~13 mois
  const WEEGLAD_VK = 'c59682c734c7112d14c7dd98d22fb4fd60871d07292ac613';

  const file = [];
  let actif = false;

  window.MarcheoPixel = {
    track: function (nom, params) {
      if (!PIXEL_ID) return;
      if (actif && window.fbq) { try { window.fbq('track', nom, params || {}); } catch (e) {} }
      else file.push([nom, params || {}]);
    },
  };

  if (!PIXEL_ID) return;
  const isBot = /bot|crawler|spider|crawling|HeadlessChrome|Lighthouse/i.test(navigator.userAgent);
  if (isBot || location.hostname === 'localhost' || location.protocol === 'file:') return;

  function lireConsentement() {
    try {
      const v = JSON.parse(localStorage.getItem(CLE) || 'null');
      if (v && v.t && Date.now() - v.t < DUREE_MS) return v;
    } catch (e) {}
    return null;
  }
  function ecrireChoix(choix) {
    try { localStorage.setItem(CLE, JSON.stringify({ choix: choix, t: Date.now(), w: 1 })); } catch (e) {}
  }

  // WeeglAd (après consentement uniquement). Si le <head> l'a déjà chargé, ne fait rien.
  // Le 1er script est inséré avec async=false pour s'exécuter avant le 2nd (ordre garanti).
  function chargerWeeglad() {
    if (window.__weeglad) return;
    window.__weeglad = 'consentement';
    const base = 'https://www.weeglad.com/api/tracking/';
    const s1 = document.createElement('script');
    s1.src = base + 'pixel-inline.js?vk=' + WEEGLAD_VK;
    s1.async = false;
    document.head.appendChild(s1);
    const s2 = document.createElement('script');
    s2.src = base + 'pixel.js?vk=' + WEEGLAD_VK;
    s2.async = true;
    document.head.appendChild(s2);
  }

  function chargerPixel() {
    if (actif) return;
    /* Code de base Meta (fbevents.js) */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
    actif = true;
    while (file.length) { const [n, p] = file.shift(); try { window.fbq('track', n, p); } catch (e) {} }
  }

  function afficherBandeau() {
    if (document.getElementById('mq-consent')) return;
    const style = document.createElement('style');
    style.textContent =
      '#mq-consent{position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:560px;margin:0 auto;' +
      'background:#14213d;color:#fff;border-radius:14px;padding:16px 16px 14px;box-shadow:0 10px 30px rgba(0,0,0,.25);' +
      'font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
      '#mq-consent p{margin:0 0 12px}#mq-consent a{color:#9fd8b4;text-decoration:underline}' +
      '#mq-consent .mq-b{display:flex;gap:10px}' +
      '#mq-consent button{flex:1;min-height:44px;border-radius:10px;border:1px solid #fff;background:transparent;color:#fff;' +
      'font:600 14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;cursor:pointer}' +
      '#mq-consent button:focus-visible{outline:2px solid #9fd8b4;outline-offset:2px}';
    document.head.appendChild(style);

    const d = document.createElement('div');
    d.id = 'mq-consent';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-label', 'Choix des cookies publicitaires');
    d.innerHTML =
      '<p>Nous utilisons le Pixel Meta et le pixel WeeglAd pour mesurer l\'efficacité de nos publicités auprès des commerçants. ' +
      'Ils ne s\'activent qu\'avec votre accord. <a href="/confidentialite#art8">En savoir plus</a></p>' +
      '<div class="mq-b"><button type="button" data-c="non">Refuser</button><button type="button" data-c="oui">Accepter</button></div>';
    d.addEventListener('click', function (e) {
      const b = e.target.closest('button[data-c]');
      if (!b) return;
      const choix = b.getAttribute('data-c');
      ecrireChoix(choix);
      d.remove();
      if (choix === 'oui') { chargerPixel(); chargerWeeglad(); }
    });
    document.body.appendChild(d);
  }

  const consentement = lireConsentement();
  const choix = consentement ? consentement.choix : null;
  const aRedemander = choix === null || (choix === 'oui' && consentement.w !== 1);
  if (choix === 'oui') chargerPixel(); // accord déjà donné pour Meta
  if (choix === 'oui' && consentement.w === 1) chargerWeeglad();
  if (aRedemander) {
    if (document.body) afficherBandeau();
    else document.addEventListener('DOMContentLoaded', afficherBandeau);
  }

  // Permet de rouvrir le choix (lien « Gérer mes cookies »)
  window.MarcheoPixel.gererConsentement = function () {
    try { localStorage.removeItem(CLE); } catch (e) {}
    afficherBandeau();
  };
})();
