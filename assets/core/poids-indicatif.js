/* Marchéo — Poids indicatif
 * « Côte de bœuf, environ 1,2 kg — prix ajusté à la pesée »
 * Le client commande à la pièce sur un prix estimé (prix au kg × poids moyen),
 * le commerçant pèse à la préparation et le prix final s'ajuste.
 * Partagé par app-commercant (formulaires + pesée) et les pages client.
 */
(function () {
  'use strict';

  // ── Poids moyens usuels (g) — sert à suggérer l'option et à pré-remplir ──
  // Ordre : du plus précis au plus général (« pavé de saumon » avant « saumon »).
  const SUGGESTIONS = [
    // Boucherie
    [/cote de b(o?e)uf|cote a l.os/, 1200], [/entrecote/, 300], [/faux[- ]?filet/, 250],
    [/tournedos|filet de b(o?e)uf|pave de b(o?e)uf|pave de rumsteck/, 180], [/rumsteck|bavette|onglet|hampe/, 200],
    [/cote de veau/, 400], [/cote de porc|cotelette/, 220], [/carre d.agneau/, 800], [/souris d.agneau/, 350],
    [/gigot/, 2200], [/epaule d.agneau/, 1500], [/roti/, 1000], [/jarret/, 900], [/jambonneau/, 800],
    [/palette|echine/, 1500], [/tomahawk/, 1100], [/osso.?buco/, 350], [/joue de b(o?e)uf/, 300],
    // Volaille
    [/magret/, 400], [/supreme|filet de poulet|blanc de poulet/, 180], [/cuisse de (poulet|canard)/, 280],
    [/coquelet/, 600], [/caille/, 200], [/pigeon/, 450], [/chapon/, 3500], [/dinde/, 4500],
    [/canard/, 2200], [/pintade/, 1400], [/lapin/, 1500], [/poulet|poularde/, 1800],
    // Poissonnerie
    [/pave de saumon|dos de cabillaud|pave de cabillaud|filet de/, 160], [/saumon/, 4000],
    [/bar\b|loup de mer|\bloup\b/, 600], [/dorade|daurade/, 450], [/turbot/, 1500], [/sole/, 350],
    [/truite/, 300], [/maquereau/, 300], [/homard/, 500], [/tourteau/, 700], [/araignee/, 900],
    [/lotte/, 800], [/saint.?pierre/, 900],
    // Fromagerie (à la coupe)
    [/comte|beaufort|tomme|abondance|gruyere|emmental|cantal|salers|mimolette|parmesan|morbier|raclette/, 250],
    [/brie de|brie\b|coulommiers|roquefort|bleu d/, 250],
    // Charcuterie / traiteur
    [/saucisson/, 250], [/pate en croute|terrine/, 400], [/jambon (a l.os|entier)/, 6000],
    // Primeur
    [/pasteque/, 4000], [/potiron|citrouille/, 3000], [/courge|potimarron|butternut/, 1200],
    [/melon/, 1000], [/ananas/, 1200], [/chou.?fleur/, 1000], [/romanesco/, 800], [/chou\b|chou (vert|blanc|rouge|pomme)/, 1200],
    [/celeri.?rave/, 800], [/brocoli/, 500], [/papaye/, 600], [/mangue/, 400], [/noix de coco/, 600],
    // Boulangerie (pains au poids)
    [/miche|pain de campagne|tourte|pain au levain/, 1000], [/pain de seigle|pain complet/, 500],
  ];

  const CHIPS_G = [200, 300, 500, 1000, 1200, 1500, 2000];

  function normaliser(s) {
    return String(s || '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function suggerer(nom) {
    const n = normaliser(nom);
    if (!n.trim()) return null;
    for (const [re, g] of SUGGESTIONS) if (re.test(n)) return g;
    return null;
  }

  function fmtPoids(g) {
    g = Number(g) || 0;
    if (g < 1000) return Math.round(g) + ' g';
    return String(parseFloat((g / 1000).toFixed(2))).replace('.', ',') + ' kg';
  }

  function fmtEur(n) {
    return (Number(n) || 0).toFixed(2).replace('.', ',') + ' €';
  }

  function estimer(prixKg, g) {
    return Math.round((Number(prixKg) || 0) * (Number(g) || 0) / 10) / 100;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ── Côté client ───────────────────────────────────────────────────────────
  // Enrichit un produit aplati (boutique/catalogue) à partir de la ligne catalogue.
  function enrichir(produit, row) {
    if (!row || !row.poids_indicatif || !row.prix_kg || !row.poids_piece_g) return produit;
    produit.poids_indicatif = true;
    produit.prix_kg = Number(row.prix_kg);
    produit.poids_piece_g = Number(row.poids_piece_g);
    produit.poids_ecart_pct = row.poids_ecart_pct ?? 15;
    produit.unite = 'pièce';          // commandé à la pièce, jamais au kg
    produit.au_poids = false;
    produit.prix_lot = null;
    produit.prix_lot_qte = null;
    produit.prix_marche_indicatif = estimer(produit.prix_kg, produit.poids_piece_g);
    return produit;
  }

  function estPI(p) { return !!(p && p.poids_indicatif && p.prix_kg && p.poids_piece_g); }

  // « environ 1,2 kg · 32,00 €/kg »
  function libelle(p) {
    if (!estPI(p)) return '';
    return 'environ ' + fmtPoids(p.poids_piece_g) + ' · ' + fmtEur(p.prix_kg).replace(' €', ' €/kg');
  }

  // Petit bloc HTML sous le prix d'une carte produit
  function badgeCarte(p) {
    if (!estPI(p)) return '';
    return '<div class="pi-badge" style="font-size:11.5px;line-height:1.35;color:#5b4a8a;margin-top:2px;">⚖️ ' + esc(libelle(p))
      + '<br><span style="opacity:.8;">Prix ajusté à la pesée</span></div>';
  }

  // Encart explicatif (fiche produit)
  function encartFiche(p) {
    if (!estPI(p)) return '';
    return '<div class="pi-encart" style="background:#f3f0fa;border:1px solid #d9cff0;color:#4b3a7a;border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.5;margin:8px 0;">'
      + '⚖️ <b>Pièce d\'environ ' + fmtPoids(p.poids_piece_g) + '</b> (± ' + (p.poids_ecart_pct ?? 15) + ' %) à ' + fmtEur(p.prix_kg).replace(' €', ' €/kg') + '.<br>'
      + 'Le prix affiché est une estimation : votre commerçant pèse votre pièce et vous payez le <b>prix exact</b> au retrait.</div>';
  }

  // Note de récap panier si au moins un produit à la pesée
  function notePanier(lignes) {
    const pi = (lignes || []).filter(estPI);
    if (!pi.length) return '';
    const ecart = Math.max(...pi.map(p => Number(p.poids_ecart_pct ?? 15)));
    return '<div class="pi-note" style="background:#f3f0fa;border:1px solid #d9cff0;color:#4b3a7a;border-radius:10px;padding:9px 12px;font-size:12.5px;line-height:1.45;margin:8px 0;">'
      + '⚖️ <b>Total estimé.</b> ' + (pi.length > 1 ? pi.length + ' produits sont' : '1 produit est') + ' vendu' + (pi.length > 1 ? 's' : '') + ' à la pesée : '
      + 'le prix final est ajusté au poids réel (en général ± ' + ecart + ' %). Vous payez le montant exact au retrait.</div>';
  }

  // ── Côté commerçant : bloc formulaire ajout / modification ───────────────
  const hooks = {};   // prefix → { getNom, getPrix, setPrix, getUnite, setUnitePiece, setLotActif }

  function blocHTML(p) {
    const champ = 'width:100%;padding:10px;border:1.5px solid var(--creme-fonce);border-radius:10px;font-size:14px;font-family:inherit;background:white;';
    const chips = CHIPS_G.map(g => '<button type="button" onclick="PoidsIndicatif.choisirPoids(\'' + p + '\',' + g + ')" style="border:1px solid #cfc3ea;background:white;color:#4b3a7a;border-radius:50px;padding:5px 10px;font-size:12px;font-family:inherit;cursor:pointer;">' + fmtPoids(g) + '</button>').join('');
    return ''
      + '<div id="' + p + 'PiBloc" style="margin-bottom:14px;background:#f3f0fa;border:1px dashed #b9a7e0;border-radius:12px;padding:14px;">'
      + '  <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;">'
      + '    <span style="font-size:13px;color:#4b3a7a;font-weight:600;">⚖️ Poids indicatif — prix ajusté à la pesée <span style="color:#7a6aa8;font-weight:400;font-size:11px;">(optionnel)</span></span>'
      + '    <input type="checkbox" id="' + p + 'PiActif" onchange="PoidsIndicatif.basculer(\'' + p + '\', this.checked)" style="width:22px;height:22px;accent-color:#6b4fbb;flex-shrink:0;">'
      + '  </label>'
      + '  <div style="font-size:12px;color:#5b4a8a;margin-top:6px;line-height:1.5;">Pour les pièces dont le poids varie : <strong>« Côte de bœuf, environ 1,2 kg »</strong>. Le client commande à la pièce, vous pesez en préparant et le prix s\'ajuste tout seul.</div>'
      + '  <div id="' + p + 'PiSuggestion" style="display:none;margin-top:10px;"></div>'
      + '  <div id="' + p + 'PiChamps" style="display:none;margin-top:12px;">'
      + '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
      + '      <div><label style="font-size:12px;color:var(--texte-doux);display:block;margin-bottom:4px;">Prix au kilo</label>'
      + '        <div style="position:relative;"><input id="' + p + 'PiPrixKg" type="number" inputmode="decimal" min="0" step="0.10" placeholder="32.00" oninput="PoidsIndicatif.maj(\'' + p + '\')" style="' + champ + 'padding-right:46px;"><span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:var(--texte-doux);font-size:13px;">€/kg</span></div></div>'
      + '      <div><label style="font-size:12px;color:var(--texte-doux);display:block;margin-bottom:4px;">Poids moyen d\'une pièce</label>'
      + '        <div style="position:relative;"><input id="' + p + 'PiPoids" type="number" inputmode="numeric" min="10" step="10" placeholder="1200" oninput="PoidsIndicatif.maj(\'' + p + '\')" style="' + champ + 'padding-right:30px;"><span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:var(--texte-doux);font-size:13px;">g</span></div></div>'
      + '    </div>'
      + '    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">' + chips + '</div>'
      + '    <div style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12px;color:var(--texte-doux);">Écart annoncé au client'
      + '      <select id="' + p + 'PiEcart" onchange="PoidsIndicatif.maj(\'' + p + '\')" style="padding:6px 8px;border:1.5px solid var(--creme-fonce);border-radius:8px;font-family:inherit;font-size:13px;background:white;">'
      + [5, 10, 15, 20, 25, 30].map(v => '<option value="' + v + '"' + (v === 15 ? ' selected' : '') + '>± ' + v + ' %</option>').join('')
      + '      </select></div>'
      + '    <div id="' + p + 'PiApercu" style="margin-top:12px;"></div>'
      + '  </div>'
      + '</div>';
  }

  function $(id) { return document.getElementById(id); }

  function monter(p, conteneurId, h) {
    hooks[p] = h || {};
    const el = $(conteneurId);
    if (el) el.innerHTML = blocHTML(p);
  }

  function actif(p) { return !!$(p + 'PiActif')?.checked; }

  function basculer(p, on) {
    const h = hooks[p] || {};
    if ($(p + 'PiActif')) $(p + 'PiActif').checked = !!on;
    if ($(p + 'PiChamps')) $(p + 'PiChamps').style.display = on ? 'block' : 'none';
    if (on) {
      const prixKg = $(p + 'PiPrixKg'), poids = $(p + 'PiPoids');
      // Produit qui était vendu au kg : son prix devient le prix au kilo
      if (prixKg && !prixKg.value) {
        const u = normaliser(h.getUnite ? h.getUnite() : '');
        const prix = h.getPrix ? parseFloat(h.getPrix()) : NaN;
        if (/\bkg\b|kilo/.test(u) && prix > 0) prixKg.value = prix;
      }
      if (poids && !poids.value) {
        const g = suggerer(h.getNom ? h.getNom() : '');
        if (g) poids.value = g;
      }
      if (h.setUnitePiece) h.setUnitePiece();
      if (prixKg && !prixKg.value) setTimeout(() => prixKg.focus(), 50);
    }
    if (h.setPrixVerrouille) h.setPrixVerrouille(!!on);
    if (h.setLotActif) h.setLotActif(!on);
    surNom(p);
    maj(p);
  }

  function choisirPoids(p, g) {
    if ($(p + 'PiPoids')) $(p + 'PiPoids').value = g;
    maj(p);
  }

  function maj(p) {
    const h = hooks[p] || {};
    const apercu = $(p + 'PiApercu');
    if (!actif(p) || !apercu) { if (apercu) apercu.innerHTML = ''; return; }
    const prixKg = parseFloat($(p + 'PiPrixKg')?.value);
    const g = parseInt($(p + 'PiPoids')?.value, 10);
    const ecart = parseInt($(p + 'PiEcart')?.value, 10) || 15;
    const nom = (h.getNom ? h.getNom() : '') || 'Votre produit';
    const alertes = [];
    if (!(prixKg > 0) || !(g >= 10)) {
      apercu.innerHTML = '<div style="font-size:12px;color:#7a6aa8;">Renseignez le prix au kilo et le poids moyen pour voir l\'aperçu client.</div>';
      if (h.setPrix) h.setPrix('');
      return;
    }
    const est = estimer(prixKg, g);
    if (h.setPrix) h.setPrix(est.toFixed(2));
    if (prixKg > 150) alertes.push('Prix au kilo élevé (' + fmtEur(prixKg) + '/kg) : vérifiez qu\'il ne s\'agit pas d\'un prix à la pièce.');
    if (prixKg < 0.5) alertes.push('Prix au kilo très bas : vérifiez la saisie.');
    if (g > 10000) alertes.push('Poids moyen élevé (' + fmtPoids(g) + ') : saisissez bien des grammes.');
    if (g < 50) alertes.push('Poids moyen très faible : saisissez bien des grammes (1,2 kg = 1200).');
    const sug = suggerer(nom);
    if (sug && (g > sug * 2.5 || g < sug / 2.5)) alertes.push('Habituellement une pièce fait environ ' + fmtPoids(sug) + '.');
    const mini = estimer(prixKg, g * (1 - ecart / 100)), maxi = estimer(prixKg, g * (1 + ecart / 100));
    apercu.innerHTML = ''
      + '<div style="background:white;border:1px solid #d9cff0;border-radius:10px;padding:10px 12px;">'
      + '  <div style="font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#7a6aa8;margin-bottom:4px;">Ce que voit le client</div>'
      + '  <div style="font-size:14px;font-weight:600;color:var(--texte);">' + esc(nom) + '</div>'
      + '  <div style="font-size:13px;color:#4b3a7a;margin-top:2px;">environ ' + fmtPoids(g) + ' · <b>≈ ' + fmtEur(est) + '</b> <span style="opacity:.75;">(' + fmtEur(prixKg).replace(' €', ' €/kg') + ')</span></div>'
      + '  <div style="font-size:12px;color:#7a6aa8;margin-top:2px;">Prix ajusté à la pesée · entre ' + fmtEur(mini) + ' et ' + fmtEur(maxi) + ' en général</div>'
      + '</div>'
      + (alertes.length ? '<div style="margin-top:8px;font-size:12px;color:#9a5b00;line-height:1.45;">' + alertes.map(a => '⚠️ ' + esc(a)).join('<br>') + '</div>' : '');
  }

  // Appelé à la saisie du nom : propose l'option quand le produit s'y prête
  function surNom(p) {
    const h = hooks[p] || {};
    const box = $(p + 'PiSuggestion');
    if (!box) return;
    const g = suggerer(h.getNom ? h.getNom() : '');
    if (!g || actif(p)) { box.style.display = 'none'; box.innerHTML = ''; if (actif(p)) maj(p); return; }
    box.style.display = 'block';
    box.innerHTML = '<div style="display:flex;align-items:center;gap:10px;background:white;border:1px solid #cfc3ea;border-radius:10px;padding:8px 10px;">'
      + '<span style="font-size:12.5px;color:#4b3a7a;flex:1;line-height:1.4;">💡 Ce produit se vend souvent à la pièce avec pesée (~' + fmtPoids(g) + ').</span>'
      + '<button type="button" onclick="PoidsIndicatif.basculer(\'' + p + '\', true)" style="background:#6b4fbb;color:white;border:none;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;">Activer</button></div>';
  }

  // Remplit le bloc (édition) ou le remet à zéro (ajout)
  function charger(p, data) {
    data = data || {};
    if ($(p + 'PiPrixKg')) $(p + 'PiPrixKg').value = data.prix_kg ?? '';
    if ($(p + 'PiPoids')) $(p + 'PiPoids').value = data.poids_piece_g ?? '';
    if ($(p + 'PiEcart')) $(p + 'PiEcart').value = String(data.poids_ecart_pct ?? 15);
    basculer(p, !!data.poids_indicatif);
  }

  // Valeurs à envoyer dans catalogue (PATCH / POST)
  function lire(p) {
    if (!actif(p)) return { ok: true, data: { poids_indicatif: false } };
    const prixKg = parseFloat($(p + 'PiPrixKg')?.value);
    const g = parseInt($(p + 'PiPoids')?.value, 10);
    if (!(prixKg > 0)) return { ok: false, erreur: '⚠️ Poids indicatif : entrez le prix au kilo' };
    if (!(g >= 10 && g <= 50000)) return { ok: false, erreur: '⚠️ Poids indicatif : poids moyen entre 10 g et 50 kg' };
    return { ok: true, data: {
      poids_indicatif: true,
      prix_kg: Math.round(prixKg * 100) / 100,
      poids_piece_g: g,
      poids_ecart_pct: parseInt($(p + 'PiEcart')?.value, 10) || 15,
    }, prix_estime: estimer(prixKg, g) };
  }

  // ── Côté commerçant : pesée d'une ligne de commande ──────────────────────
  // Écart pesé vs estimé, en % (positif = plus lourd)
  function ecartPesee(ligne) {
    if (!ligne || !ligne.poids_reel_g || !ligne.poids_estime_g) return null;
    return Math.round((ligne.poids_reel_g - ligne.poids_estime_g) / ligne.poids_estime_g * 100);
  }

  window.PoidsIndicatif = {
    SUGGESTIONS, suggerer, fmtPoids, fmtEur, estimer, normaliser,
    enrichir, estPI, libelle, badgeCarte, encartFiche, notePanier,
    monter, basculer, choisirPoids, maj, surNom, charger, lire, actif,
    ecartPesee,
  };
})();
