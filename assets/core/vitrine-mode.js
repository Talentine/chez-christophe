// ============================================================
// VITRINE MODE — Active sur TOUTES les pages client (boutique, catalogue, panier, etc.)
// Lit window.__CONFIG__.business et applique :
//  - body.mode-vitrine si offre = 'vitrine' et abonnement actif
//  - body.mode-demo si abonnement non actif
// Cache automatiquement panier, prix, boutons +, drawer, etc. via CSS
// ============================================================

(function() {
  // ── Injection des styles globaux (au cas où la page n'a pas son propre CSS)
  function injectVitrineStyles() {
    if (document.getElementById('vitrine-global-styles')) return;
    var css = ''
      + 'body.mode-vitrine .header-cart,'
      + 'body.mode-vitrine #cartBtn,'
      + 'body.mode-vitrine #btn-panier,'
      + 'body.mode-vitrine .btn-add,'
      + 'body.mode-vitrine .btn-ajouter,'
      + 'body.mode-vitrine .btn-ajouter-panier,'
      + 'body.mode-vitrine .poids-pill,'
      + 'body.mode-vitrine .qte-controls,'
      + 'body.mode-vitrine .ligne-actions,'
      + 'body.mode-vitrine #m-fab-reservation,'
      + 'body.mode-vitrine #m-fab-mes-resas,'
      + 'body.mode-vitrine .hero-btn-resa,'
      + 'body.mode-vitrine .bottom-nav .nav-item[href="catalogue.html"],'
      + 'body.mode-vitrine .bottom-nav .nav-item[href*="catalogue.html"],'
      + 'body.mode-vitrine .bottom-nav .nav-item[href*="cat=paniers"],'
      + 'body.mode-vitrine .bottom-nav .nav-item[onclick*="ouvrirPanier"],'
      + 'body.mode-vitrine .bottom-nav .nav-item[href="panier.html"],'
      + 'body.mode-vitrine .bottom-nav .nav-item[href*="panier.html"],'
      + 'body.mode-vitrine #drawer,'
      + 'body.mode-vitrine #overlay,'
      + 'body.mode-vitrine .drawer,'
      + 'body.mode-vitrine .drawer-overlay,'
      + 'body.mode-vitrine .panier-actions,'
      + 'body.mode-vitrine .cta-fixe,'
      + 'body.mode-vitrine #ctaFixe,'
      + 'body.mode-vitrine #m-demo-banner,'
      + 'body.mode-vitrine #m-demo-bottom-bar { display: none !important; }'
      + 'body.mode-vitrine .produit-prix,'
      + 'body.mode-vitrine .panier-prix,'
      + 'body.mode-vitrine .ligne-prix,'
      + 'body.mode-vitrine .total-ligne,'
      + 'body.mode-vitrine .produit-promo,'
      + 'body.mode-vitrine [class*="prix"]:not(.hero-info-pill):not(.btn-primary):not(.btn-secondary) {'
      + '  display: none !important;'
      + '}'
      // Bandeau "Site vitrine" en haut de chaque page
      + '#m-vitrine-banner-global {'
      + '  position: sticky; top: 0; z-index: 200;'
      + '  background: linear-gradient(135deg,#0F2C52,#1a3a6d);'
      + '  color: #fff; padding: 9px 14px;'
      + '  text-align: center;'
      + '  font-family: Manrope, system-ui, sans-serif;'
      + '  font-size: 13px; font-weight: 600;'
      + '  line-height: 1.3;'
      + '}';
    var s = document.createElement('style');
    s.id = 'vitrine-global-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function ajouterBandeauVitrine() {
    if (document.getElementById('m-vitrine-banner-global')) return;
    var banner = document.createElement('div');
    banner.id = 'm-vitrine-banner-global';
    banner.innerHTML = '🪟 <strong>Site vitrine</strong> · Cette boutique présente ses produits sans vente en ligne. Contactez-la directement.';
    document.body.insertBefore(banner, document.body.firstChild);
  }

  function appliquerModeVitrine() {
    if (document.body.classList.contains('mode-vitrine')) return;
    document.body.classList.add('mode-vitrine');
    document.body.classList.remove('mode-demo');
    injectVitrineStyles();
    ajouterBandeauVitrine();

    // Si on est dans le panier ou catalogue, rediriger vers la boutique principale
    // après 2s — l'utilisateur ne devrait pas être ici en mode vitrine
    var path = location.pathname;
    if (/\/(catalogue|panier)(\.html)?(\?|$)/.test(path)) {
      console.log('[mode-vitrine] redirection vers la boutique (page non disponible en vitrine)');
      // Calcule l'URL de retour à la boutique
      var slug = (window.__CONFIG__ && window.__CONFIG__.slug) || (location.pathname.split('/').filter(Boolean)[0] || '');
      var retour = slug ? '/' + slug + '/' : '/';
      setTimeout(function() {
        var msg = document.createElement('div');
        msg.style.cssText = 'position:fixed;inset:0;background:rgba(15,44,82,.92);z-index:999999;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Manrope,system-ui,sans-serif;color:#fff;text-align:center;';
        msg.innerHTML = '<div style="max-width:420px;"><div style="font-size:48px;margin-bottom:12px;">🪟</div><div style="font-size:20px;font-weight:800;margin-bottom:8px;">Site vitrine</div><div style="font-size:14px;opacity:.85;line-height:1.55;margin-bottom:20px;">Cette boutique présente ses produits mais ne vend pas en ligne. Vous allez être redirigé vers la page d\'accueil.</div><a href="' + retour + '" style="display:inline-block;background:#5BBE3A;color:#fff;padding:12px 26px;border-radius:50px;text-decoration:none;font-weight:700;font-size:14px;">← Retour à la boutique</a></div>';
        document.body.appendChild(msg);
        setTimeout(function() { location.href = retour; }, 2500);
      }, 200);
    }
  }

  function check() {
    var b = (window.__CONFIG__ && window.__CONFIG__.business) || null;
    if (!b) return;
    if (b.abonnement_actif === true && b.offre === 'vitrine') {
      appliquerModeVitrine();
    }
  }

  // Listener business:ready (cas normal)
  document.addEventListener('business:ready', check);
  // Si __CONFIG__ déjà set
  if (window.__CONFIG__) check();
  // Filet de sécurité
  setTimeout(check, 800);
  setTimeout(check, 2000);
})();
