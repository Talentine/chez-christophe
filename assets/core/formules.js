/* ============================================================
 * Formules à composer (petit-déj, midi, goûter…)
 *
 * Un produit devient une « formule » quand sa ligne catalogue porte
 *   custom_fields.formule = { groupes: [ { label: "Boisson chaude",
 *                                          choix: ["Café", "Thé", …] }, … ] }
 * Au moment de l'ajout, le client choisit une option par groupe.
 * Chaque combinaison est une ligne de panier distincte (champ `choix`),
 * et le récapitulatif des choix part dans la note de la commande
 * (le serveur garde le nom officiel du produit sur la ligne).
 * Sans ce réglage, rien ne change pour les autres produits.
 * ============================================================ */
(function () {
  function groupes(p) {
    var f = p && p.custom_fields && p.custom_fields.formule;
    var g = f && Array.isArray(f.groupes) ? f.groupes : [];
    return g.filter(function (x) { return x && x.label && Array.isArray(x.choix) && x.choix.length; });
  }
  function est(p) { return groupes(p).length > 0; }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function prixTxt(n) { return (Number(n) || 0).toFixed(2).replace('.', ',') + ' €'; }

  var CSS = ''
    + '.fm-ov{position:fixed;inset:0;background:rgba(20,15,10,.55);z-index:2000;display:flex;align-items:flex-end;justify-content:center;}'
    + '.fm-box{background:#fff;width:100%;max-width:520px;max-height:92vh;overflow:auto;border-radius:22px 22px 0 0;font-family:inherit;color:#222;animation:fmUp .25s ease;}'
    + '@media(min-width:700px){.fm-ov{align-items:center}.fm-box{border-radius:22px}}'
    + '@keyframes fmUp{from{transform:translateY(40px);opacity:.4}to{transform:none;opacity:1}}'
    + '.fm-img{position:relative;height:190px;background:#f3eee4;}'
    + '.fm-img img{width:100%;height:100%;object-fit:cover;display:block;}'
    + '.fm-x{position:absolute;top:12px;right:12px;width:36px;height:36px;border-radius:50%;border:none;background:rgba(255,255,255,.92);font-size:16px;cursor:pointer;}'
    + '.fm-body{padding:18px 18px 8px;}'
    + '.fm-nom{font-size:20px;font-weight:800;margin:0 0 4px;}'
    + '.fm-desc{font-size:13.5px;color:#666;margin:0 0 14px;line-height:1.45;}'
    + '.fm-g{margin:0 0 16px;}'
    + '.fm-gl{font-size:14px;font-weight:700;margin:0 0 8px;display:flex;justify-content:space-between;align-items:center;}'
    + '.fm-gl span{font-size:11px;font-weight:600;color:#9a7b3c;background:#f6efe1;border-radius:50px;padding:3px 8px;}'
    + '.fm-ch{display:flex;flex-wrap:wrap;gap:8px;}'
    + '.fm-c{border:1.5px solid #e3dccd;background:#fff;border-radius:50px;padding:9px 14px;font-size:13.5px;font-weight:600;font-family:inherit;cursor:pointer;color:#333;}'
    + '.fm-c.on{border-color:var(--vert-fonce,#2d4a3e);background:var(--vert-fonce,#2d4a3e);color:#fff;}'
    + '.fm-foot{position:sticky;bottom:0;background:#fff;padding:12px 18px 18px;border-top:1px solid #eee;}'
    + '.fm-add{width:100%;border:none;border-radius:50px;padding:15px;font-size:15px;font-weight:700;font-family:inherit;cursor:pointer;background:var(--vert-fonce,#2d4a3e);color:#fff;}'
    + '.fm-add[disabled]{opacity:.45;cursor:default;}';

  function injecterCss() {
    if (document.getElementById('fmCss')) return;
    var s = document.createElement('style'); s.id = 'fmCss'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  // Ouvre le choix des options ; onAjout(choixTexte) une fois validé
  function ouvrir(p, onAjout) {
    var gs = groupes(p);
    if (!gs.length) return;
    injecterCss();
    var sel = gs.map(function (g) { return g.choix.length === 1 ? g.choix[0] : null; });
    var ov = document.createElement('div');
    ov.className = 'fm-ov';
    ov.innerHTML = '<div class="fm-box" role="dialog" aria-label="' + esc(p.nom) + '">'
      + '<div class="fm-img">' + (p.photo_url ? '<img src="' + esc(p.photo_url) + '" alt="">' : '')
      + '<button class="fm-x" aria-label="Fermer">✕</button></div>'
      + '<div class="fm-body"><div class="fm-nom">' + esc(p.nom) + '</div>'
      + (p.description ? '<p class="fm-desc">' + esc(p.description) + '</p>' : '')
      + gs.map(function (g, gi) {
          return '<div class="fm-g"><div class="fm-gl">' + esc(g.label) + '<span>1 au choix</span></div><div class="fm-ch">'
            + g.choix.map(function (c, ci) {
                return '<button type="button" class="fm-c' + (sel[gi] === c ? ' on' : '') + '" data-g="' + gi + '" data-c="' + ci + '">' + esc(c) + '</button>';
              }).join('')
            + '</div></div>';
        }).join('')
      + '</div><div class="fm-foot"><button class="fm-add" type="button"></button></div></div>';
    document.body.appendChild(ov);
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    var btn = ov.querySelector('.fm-add');
    function maj() {
      var manque = sel.filter(function (x) { return !x; }).length;
      btn.disabled = manque > 0;
      btn.textContent = manque > 0
        ? 'Choisissez ' + (manque > 1 ? 'vos ' + manque + ' options' : 'votre option')
        : 'Ajouter au panier · ' + prixTxt(p.prix_marche_indicatif);
    }
    function fermer() { ov.remove(); document.body.style.overflow = prevOverflow; }
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.classList.contains('fm-x')) { fermer(); return; }
      var b = e.target.closest('.fm-c');
      if (!b) return;
      var gi = +b.dataset.g, ci = +b.dataset.c;
      sel[gi] = gs[gi].choix[ci];
      ov.querySelectorAll('.fm-c[data-g="' + gi + '"]').forEach(function (x) { x.classList.toggle('on', x === b); });
      maj();
    });
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      var texte = sel.join(', ');
      fermer();
      if (typeof onAjout === 'function') onAjout(texte);
    });
    maj();
  }

  // Ajoute (ou incrémente) la ligne formule + choix dans le tableau panier
  function ajouterLigne(panier, p, choix) {
    var base = p.nom_formule || p.nom;
    var idx = panier.findIndex(function (x) { return x.id === p.id && (x.choix || '') === choix; });
    if (idx >= 0) panier[idx].qte = (panier[idx].qte || 0) + 1;
    else panier.push(Object.assign({}, p, { qte: 1, choix: choix, nom_formule: base, nom: base + ' (' + choix + ')' }));
    return panier;
  }

  // Récapitulatif des choix pour la note de commande
  function recap(panier) {
    var lignes = (panier || []).filter(function (x) { return x && x.choix; }).map(function (x) {
      return '• ' + (x.nom_formule || x.nom) + ' ×' + x.qte + ' : ' + x.choix;
    });
    return lignes.length ? 'Choix des formules :\n' + lignes.join('\n') : '';
  }

  function nbEnPanier(panier, id) {
    return (panier || []).reduce(function (n, x) { return n + (x.id === id ? (x.qte || 0) : 0); }, 0);
  }

  window.Formules = { est: est, ouvrir: ouvrir, ajouterLigne: ajouterLigne, recap: recap, nbEnPanier: nbEnPanier };
})();
