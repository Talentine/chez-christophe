// ============================================================
// Marchéo · Bouton « Retour en haut »
// Apparaît une fois la moitié de la page dépassée, remonte en douceur au clic.
// Se place au-dessus de la barre fixe mobile quand la page en a une (#stickyCta).
// ============================================================
(function () {
  if (document.getElementById('mq-haut')) return;
  var aBarre = !!document.getElementById('stickyCta');
  var st = document.createElement('style');
  st.textContent =
    '#mq-haut{position:fixed;right:16px;bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:60;width:48px;height:48px;border-radius:50%;'
    + 'border:2px solid #0F2C52;background:#fff;color:#0F2C52;cursor:pointer;display:flex;align-items:center;justify-content:center;'
    + 'box-shadow:0 8px 22px rgba(15,44,82,.22);opacity:0;visibility:hidden;transform:translateY(10px);'
    + 'transition:opacity .2s,transform .2s,visibility .2s,background .15s,color .15s}'
    + '#mq-haut.visible{opacity:1;visibility:visible;transform:none}'
    + '#mq-haut:hover{background:#0F2C52;color:#fff}'
    + '#mq-haut:focus-visible{outline:3px solid #F4B942;outline-offset:3px}'
    + (aBarre ? '@media(max-width:900px){#mq-haut{bottom:calc(104px + env(safe-area-inset-bottom,0px))}}' : '')
    + '@media(prefers-reduced-motion:reduce){#mq-haut{transition:none}}';
  document.head.appendChild(st);

  var btn = document.createElement('button');
  btn.id = 'mq-haut';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Retour en haut de la page');
  btn.title = 'Retour en haut';
  btn.tabIndex = -1;
  btn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  btn.addEventListener('click', function () {
    var doux = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    window.scrollTo({ top: 0, behavior: doux ? 'smooth' : 'auto' });
  });
  document.body.appendChild(btn);

  var visible = false;
  function verifier() {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var montrer = max > 600 && window.scrollY > max / 2;
    if (montrer === visible) return;
    visible = montrer;
    btn.classList.toggle('visible', visible);
    btn.tabIndex = visible ? 0 : -1;
  }
  window.addEventListener('scroll', verifier, { passive: true });
  window.addEventListener('resize', verifier, { passive: true });
  verifier();
})();
