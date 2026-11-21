/* ════════════════════════════════════════════════════════════════════
   Expédition France — côté app commerçant.

   Chargé par app-commercant.html. Fournit :
     - ExpeditionApp.ouvrir()  : écran Réglages → Expédition France
         · option non activée : présentation + « Demander l'activation »
           (seul un admin Marchéo l'active, voir admin.html)
         · option activée     : jours de départ, tarifs au poids, compte
           Chronopost, poids des produits
     - ExpeditionApp.carte(c)  : habillage d'une commande à expédier dans la
       liste des commandes (étiquette, départ du colis, suivi, remboursement)

   S'appuie sur les globales de app-commercant.html : SUPABASE_URL,
   SUPABASE_KEY, getValidToken, afficherToast, toutesLesCommandes,
   renderCommandes, chargerCommandesSupabase.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // Tarif de l'option affiché au commerçant avant activation. Laisser vide
  // tant que le prix n'est pas arrêté : l'écran indique alors seulement que
  // l'option est payante. Exemple : '20 € / mois + 150 € de mise en service'.
  var TARIF_OPTION = '';

  var JOURS = [[1, 'Lun'], [2, 'Mar'], [3, 'Mer'], [4, 'Jeu'], [5, 'Ven']];
  var E = { cid: null, biz: null, reglages: null, compte: null, produits: [], motDePasseSaisi: false };

  // ── Outils ────────────────────────────────────────────────
  function h(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function eur(n) { return Number(n || 0).toFixed(2).replace('.', ',') + ' €'; }
  function nombre(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; }
  function toast(m) { if (typeof afficherToast === 'function') afficherToast(m); }
  function commercantId() {
    try { return JSON.parse(localStorage.getItem('session_commercant') || '{}').commercant_id || null; } catch (e) { return null; }
  }
  function dateCourte(iso) {
    if (!iso) return '—';
    return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function isoPlusJours(iso, n) {
    var d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function aujourdhui() { return isoPlusJours(new Date().toISOString(), 0); }

  async function rest(methode, chemin, corps, prefer) {
    var token = await getValidToken();
    var r = await fetch(SUPABASE_URL + '/rest/v1/' + chemin, {
      method: methode,
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json', 'Prefer': prefer || 'return=representation',
      },
      body: corps ? JSON.stringify(corps) : undefined,
    });
    var txt = await r.text();
    if (!r.ok) throw new Error(txt || ('HTTP ' + r.status));
    return txt ? JSON.parse(txt) : null;
  }

  async function fonction(corps) {
    var token = await getValidToken();
    var r = await fetch(SUPABASE_URL + '/functions/v1/expedition', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    var data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    if (!r.ok || !data || data.error) throw new Error((data && data.error) || 'Service indisponible, réessayez.');
    return data;
  }

  // Même règle que la fonction SQL expedition_poids_unite_g (affichage seul :
  // le serveur fait foi au moment de la commande).
  function poidsUnite(unite) {
    var u = String(unite || '').toLowerCase();
    if (/^\s*(le |au |par )?(kg|kilo)/.test(u)) return 1000;
    var m = u.match(/(\d+(?:[.,]\d+)?)\s*kg/);
    if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 1000);
    m = u.match(/(\d+(?:[.,]\d+)?)\s*g(?![a-z])/);
    if (m) return Math.round(parseFloat(m[1].replace(',', '.')));
    m = u.match(/(\d+(?:[.,]\d+)?)\s*cl/);
    if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 10) + 450;
    m = u.match(/(\d+(?:[.,]\d+)?)\s*l(?![a-z])/);
    if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 1000) + 500;
    return null;
  }
  function poidsLisible(g) {
    if (g == null) return '';
    return g >= 1000 ? String(Math.round(g / 10) / 100).replace('.', ',') + ' kg' : g + ' g';
  }

  // ── Styles ────────────────────────────────────────────────
  function styles() {
    if (document.getElementById('expAppStyle')) return;
    var st = document.createElement('style');
    st.id = 'expAppStyle';
    st.textContent = [
      '#expOverlay{position:fixed;inset:0;background:#F7F2E8;z-index:5000;overflow-y:auto;-webkit-overflow-scrolling:touch;font-family:Manrope,system-ui,sans-serif;color:#0A1428;}',
      '#expOverlay .exp-barre{position:sticky;top:0;background:#0A1428;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:12px;z-index:2;}',
      '#expOverlay .exp-barre button{background:rgba(255,255,255,.12);border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:18px;cursor:pointer;}',
      '#expOverlay .exp-barre-titre{font-size:17px;font-weight:700;}',
      '#expOverlay .exp-corps{max-width:640px;margin:0 auto;padding:16px 16px 120px;}',
      '#expOverlay .exp-carte{background:#fff;border:1px solid #E5E2D8;border-radius:14px;padding:16px;margin-bottom:14px;}',
      '#expOverlay h3{font-size:16px;margin:0 0 4px;}',
      '#expOverlay .exp-aide{font-size:12.5px;color:#5A6478;line-height:1.5;margin-bottom:12px;}',
      '#expOverlay label.exp-l{display:block;font-size:12.5px;color:#5A6478;margin:10px 0 5px;}',
      '#expOverlay input[type=text],#expOverlay input[type=number],#expOverlay input[type=time],#expOverlay input[type=password],#expOverlay input[type=email],#expOverlay input[type=tel],#expOverlay textarea{width:100%;padding:11px 12px;border:1.5px solid #E5E2D8;border-radius:10px;font-size:14px;font-family:inherit;background:#F7F2E8;outline:none;box-sizing:border-box;}',
      '#expOverlay input:focus,#expOverlay textarea:focus{border-color:#0F2C52;}',
      '#expOverlay .exp-2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}',
      '#expOverlay .exp-btn{background:#0F2C52;color:#fff;border:none;border-radius:12px;padding:13px 16px;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;}',
      '#expOverlay .exp-btn.clair{background:#F7F2E8;color:#0F2C52;border:1.5px solid #E5E2D8;}',
      '#expOverlay .exp-btn.or{background:#F4B942;color:#0A1428;}',
      '#expOverlay .exp-btn:disabled{opacity:.5;cursor:default;}',
      '#expOverlay .exp-jours{display:flex;gap:6px;flex-wrap:wrap;}',
      '#expOverlay .exp-jours label{display:flex;align-items:center;gap:5px;background:#F7F2E8;border:1.5px solid #E5E2D8;border-radius:10px;padding:8px 11px;font-size:13px;cursor:pointer;}',
      '#expOverlay .exp-palier{display:grid;grid-template-columns:1fr 1fr 38px;gap:8px;align-items:center;margin-bottom:8px;}',
      '#expOverlay .exp-palier button{background:#fdf0ef;color:#9a2d24;border:none;border-radius:9px;height:40px;cursor:pointer;font-size:15px;}',
      '#expOverlay .exp-check{display:flex;gap:9px;align-items:flex-start;font-size:13.5px;padding:6px 0;line-height:1.45;}',
      '#expOverlay .exp-check b{flex:0 0 20px;}',
      '#expOverlay .exp-prod{display:grid;grid-template-columns:1fr 92px 34px;gap:8px;align-items:center;padding:8px 0;border-top:1px solid #EFEBDF;}',
      '#expOverlay .exp-prod:first-child{border-top:none;}',
      '#expOverlay .exp-prod-nom{font-size:13.5px;font-weight:600;line-height:1.3;}',
      '#expOverlay .exp-prod-sub{font-size:11.5px;color:#5A6478;}',
      '#expOverlay .exp-prod input[type=text]{padding:8px 9px;font-size:13px;}',
      '#expOverlay .exp-pied{position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #E5E2D8;padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));z-index:3;}',
      '#expOverlay .exp-pied .exp-btn{width:100%;max-width:608px;display:block;margin:0 auto;}',
      '#expOverlay .exp-etat{border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.45;margin-top:10px;}',
      '#expOverlay .exp-ok{background:#eaf7ee;color:#1f5230;}',
      '#expOverlay .exp-ko{background:#fdf0ef;color:#9a2d24;}',
      '#expOverlay .exp-info{background:#FFF8E7;color:#6b5514;}',
      '#expDialogue{position:fixed;inset:0;background:rgba(10,20,40,.55);z-index:6000;display:flex;align-items:flex-end;justify-content:center;font-family:Manrope,system-ui,sans-serif;}',
      '#expDialogue .exp-d{background:#fff;border-radius:18px 18px 0 0;padding:20px 18px calc(18px + env(safe-area-inset-bottom,0px));width:100%;max-width:480px;color:#0A1428;}',
      '#expDialogue h3{font-size:17px;margin:0 0 6px;}',
      '#expDialogue p{font-size:13px;color:#5A6478;line-height:1.5;margin:0 0 10px;}',
      '#expDialogue label{display:block;font-size:12.5px;color:#5A6478;margin:10px 0 5px;}',
      '#expDialogue input{width:100%;padding:12px;border:1.5px solid #E5E2D8;border-radius:10px;font-size:15px;font-family:inherit;background:#F7F2E8;box-sizing:border-box;}',
      '#expDialogue .exp-d-btns{display:flex;gap:8px;margin-top:16px;}',
      '#expDialogue button{flex:1;border:none;border-radius:12px;padding:13px;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;}',
      '#expDialogue .p{background:#0F2C52;color:#fff;}',
      '#expDialogue .s{background:#F7F2E8;color:#0A1428;}',
      '#expDialogue .exp-d-err{color:#9a2d24;font-size:13px;margin-top:10px;display:none;}',
    ].join('');
    document.head.appendChild(st);
  }

  // ════════════════════════════════════════════════════════════
  //  RÉGLAGES
  // ════════════════════════════════════════════════════════════
  function estDemo() {
    return !!(E.biz && E.biz.abonnement_actif !== true);
  }
  function paiementPret() {
    return !!(E.biz && E.biz.stripe_connect_actif && E.biz.stripe_connect_charges_enabled);
  }

  async function charger() {
    E.cid = commercantId();
    if (!E.cid) throw new Error('Session expirée, reconnectez-vous.');
    var rs = await Promise.all([
      rest('GET', 'commercants?id=eq.' + E.cid + '&select=id,nom_boutique,email,telephone,adresse,code_postal,ville,offre,pays,abonnement_actif,stripe_connect_actif,stripe_connect_charges_enabled'),
      rest('GET', 'expedition_reglages?commercant_id=eq.' + E.cid + '&select=*'),
    ]);
    E.biz = (rs[0] && rs[0][0]) || {};
    E.reglages = (rs[1] && rs[1][0]) || null;
    E.compte = null;
    E.produits = [];
    E.motDePasseSaisi = false;
    if (E.reglages && E.reglages.active) {
      var rs2 = await Promise.all([
        rest('GET', 'expedition_comptes?commercant_id=eq.' + E.cid + '&select=commercant_id,chrono_compte,chrono_sous_compte,exp_nom,exp_contact,exp_adresse,exp_adresse2,exp_code_postal,exp_ville,exp_telephone,exp_email,verifie_le').catch(function () { return []; }),
        rest('GET', 'catalogue?commercant_id=eq.' + E.cid + '&actif=not.is.false&select=id,nom_custom,poids_expedition_g,expedition_exclue,poids_indicatif,poids_piece_g,produits_base(nom,unite)&limit=1000').catch(function () { return []; }),
      ]);
      E.compte = (rs2[0] && rs2[0][0]) || null;
      E.produits = (rs2[1] || []).map(function (p) {
        return {
          id: p.id,
          nom: p.nom_custom || (p.produits_base && p.produits_base.nom) || 'Produit',
          unite: (p.produits_base && p.produits_base.unite) || '',
          poids: p.poids_expedition_g,
          exclu: !!p.expedition_exclue,
          auto: (p.poids_indicatif && p.poids_piece_g) ? p.poids_piece_g : poidsUnite(p.produits_base && p.produits_base.unite),
        };
      }).sort(function (a, b) { return a.nom.localeCompare(b.nom, 'fr'); });
    }
  }

  function fermer() {
    var o = document.getElementById('expOverlay');
    if (o) o.remove();
    document.body.style.overflow = '';
  }

  async function ouvrir() {
    styles();
    fermer();
    var o = document.createElement('div');
    o.id = 'expOverlay';
    o.innerHTML = '<div class="exp-barre"><button onclick="ExpeditionApp.fermer()" aria-label="Fermer">←</button><div class="exp-barre-titre">📦 Expédition France</div></div>'
      + '<div class="exp-corps" id="expCorps"><div class="exp-carte">Chargement…</div></div>';
    document.body.appendChild(o);
    document.body.style.overflow = 'hidden';
    try {
      await charger();
      rendre();
    } catch (e) {
      document.getElementById('expCorps').innerHTML = '<div class="exp-carte"><div class="exp-etat exp-ko">❌ ' + h(e.message) + '</div></div>';
    }
  }

  function rendre() {
    var corps = document.getElementById('expCorps');
    if (!corps) return;
    var ancienPied = document.querySelector('#expOverlay .exp-pied');
    if (ancienPied) ancienPied.remove();
    if (E.reglages && E.reglages.active) rendreReglages(corps);
    else rendrePresentation(corps);
  }

  // ── Option non activée ────────────────────────────────────
  function rendrePresentation(corps) {
    var demande = E.reglages && E.reglages.demandee_le;
    corps.innerHTML = ''
      + '<div class="exp-carte">'
      +   '<h3>Vendez vos produits partout en France</h3>'
      +   '<div class="exp-aide">Vos clients commandent sur votre boutique, paient en ligne, et vous leur expédiez un colis livré le lendemain par Chronopost — en camion réfrigéré avec Chronofresh pour les produits frais.</div>'
      +   '<div class="exp-check"><b>✓</b><span>Un mode « Expédition France » dans le panier, avec les frais calculés au poids</span></div>'
      +   '<div class="exp-check"><b>✓</b><span>Le paiement par carte à la commande, versé sur votre compte</span></div>'
      +   '<div class="exp-check"><b>✓</b><span>L\'étiquette Chronopost imprimée en un clic depuis la commande</span></div>'
      +   '<div class="exp-check"><b>✓</b><span>Le numéro de suivi envoyé automatiquement à votre client</span></div>'
      +   '<div class="exp-check"><b>✓</b><span>Une page « Expédition » sur votre boutique, qui explique tout à vos clients</span></div>'
      + '</div>'
      + '<div class="exp-carte">'
      +   '<h3>🔒 Option payante</h3>'
      +   '<div class="exp-aide">' + (TARIF_OPTION
            ? 'Tarif : <strong>' + h(TARIF_OPTION) + '</strong>, en plus de votre abonnement. '
            : 'Cette option s\'ajoute à votre abonnement. ')
      +     'Elle est activée par l\'équipe Marchéo, qui vous accompagne pour la mise en route.</div>'
      +   (demande
            ? '<div class="exp-etat exp-ok">✅ Demande envoyée le ' + h(new Date(demande).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })) + '. L\'équipe Marchéo vous recontacte rapidement.</div>'
            : '<button class="exp-btn or" style="width:100%;margin-top:6px;" id="expBtnDemande" onclick="ExpeditionApp.demander()">Demander l\'activation</button>')
      + '</div>'
      + '<div class="exp-carte">' + blocPrerequis() + '</div>';
  }

  function blocPrerequis() {
    return '<h3>Ce qu\'il vous faudra de votre côté</h3>'
      + '<div class="exp-aide">À préparer pendant que nous activons l\'option.</div>'
      + '<div class="exp-check"><b>1</b><span><strong>Un contrat professionnel Chronopost</strong>, avec le service <strong>Chronofresh</strong> pour les produits frais. Il se demande à un commercial Chronopost (SIRET et RIB). Vous payez vos envois directement à Chronopost.</span></div>'
      + '<div class="exp-check"><b>2</b><span><strong>Vos identifiants Chronopost</strong> : numéro de compte et mot de passe des services web, fournis avec le contrat.</span></div>'
      + '<div class="exp-check"><b>3</b><span><strong>Le paiement en ligne activé</strong> (Réglages → Paiements clients), pour encaisser les commandes avant l\'envoi.</span></div>'
      + '<div class="exp-check"><b>4</b><span><strong>Des emballages adaptés</strong> : caisses isothermes, pains de glace, calage, et une balance.</span></div>'
      + '<div class="exp-check"><b>5</b><span><strong>Une imprimante</strong> pour les étiquettes (format A4 ou étiquettes autocollantes).</span></div>'
      + '<div class="exp-check"><b>6</b><span><strong>Vos obligations sanitaires</strong> pour la vente à distance de produits frais : renseignez-vous auprès de la DDPP de votre département.</span></div>';
  }

  async function demander() {
    var b = document.getElementById('expBtnDemande');
    if (b) { b.disabled = true; b.textContent = 'Envoi…'; }
    try {
      var res = await fonction({ action: 'demander-activation', commercant_id: E.cid });
      E.reglages = Object.assign({}, E.reglages || {}, { demandee_le: res.demandee_le || new Date().toISOString() });
      toast('✅ Demande envoyée à Marchéo');
      rendre();
    } catch (e) {
      toast('❌ ' + e.message);
      if (b) { b.disabled = false; b.textContent = 'Demander l\'activation'; }
    }
  }

  // ── Option activée ────────────────────────────────────────
  function ligneEtat(ok, texte) {
    return '<div class="exp-check"><b>' + (ok ? '✅' : '⬜') + '</b><span>' + texte + '</span></div>';
  }

  function prerequis() {
    var r = E.reglages || {};
    var c = E.compte || {};
    return {
      grille: Array.isArray(r.grille) && r.grille.length > 0,
      compte: estDemo() || !!(c.chrono_compte && c.verifie_le),
      adresse: !!((c.exp_adresse || E.biz.adresse) && (c.exp_code_postal || E.biz.code_postal) && (c.exp_ville || E.biz.ville)),
      paiement: estDemo() || paiementPret(),
    };
  }

  function rendreReglages(corps) {
    var r = E.reglages;
    var c = E.compte || {};
    var pr = prerequis();
    var pret = pr.grille && pr.compte && pr.adresse && pr.paiement;
    var grille = (r.grille || []).slice().sort(function (a, b) { return Number(a.max_kg) - Number(b.max_kg); });

    corps.innerHTML = ''
      // ── Ouverture
      + '<div class="exp-carte">'
      +   '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">'
      +     '<div><h3>Proposer l\'expédition à mes clients</h3><div class="exp-aide" style="margin:0;">Affiche le mode « Expédition France » dans le panier et la page Expédition sur votre boutique.</div></div>'
      +     '<label style="position:relative;flex:0 0 48px;height:26px;"><input type="checkbox" id="expOuverte" ' + (r.ouverte ? 'checked' : '') + ' style="opacity:0;width:0;height:0;" onchange="ExpeditionApp.basculerOuverture(this)"><span id="expOuverteSlider" style="position:absolute;inset:0;background:' + (r.ouverte ? '#5BBE3A' : '#ccc') + ';border-radius:13px;cursor:pointer;transition:.2s;"></span><span id="expOuverteRond" style="position:absolute;top:3px;left:' + (r.ouverte ? '25px' : '3px') + ';width:20px;height:20px;background:#fff;border-radius:50%;transition:.2s;pointer-events:none;"></span></label>'
      +   '</div>'
      +   '<div style="margin-top:12px;">'
      +     ligneEtat(pr.grille, 'Tarifs d\'expédition renseignés')
      +     ligneEtat(pr.adresse, 'Adresse d\'enlèvement des colis')
      +     ligneEtat(pr.compte, estDemo() ? 'Compte Chronopost (non requis en démonstration : étiquettes spécimen)' : 'Compte Chronopost renseigné et testé')
      +     ligneEtat(pr.paiement, estDemo() ? 'Paiement en ligne (non requis en démonstration : commandes de test)' : 'Paiement en ligne activé (Réglages → Paiements clients)')
      +   '</div>'
      +   (estDemo() ? '<div class="exp-etat exp-info">🧪 Boutique en démonstration : les commandes sont des tests, sans paiement, et les étiquettes sont des spécimens Chronopost.</div>' : '')
      +   (!pret ? '<div class="exp-etat exp-info">Complétez les points ci-dessus, enregistrez, puis activez l\'interrupteur.</div>' : '')
      + '</div>'

      // ── Service et départs
      + '<div class="exp-carte">'
      +   '<h3>Service et jours de départ</h3>'
      +   '<div class="exp-aide">Un colis remis au transporteur un jour J est livré à J+1 avant 13 h. Évitez un départ si vous ne pouvez pas garantir la livraison le lendemain.</div>'
      +   '<label class="exp-check" style="cursor:pointer;"><input type="radio" name="expMode" value="froid" ' + (r.mode_froid !== false ? 'checked' : '') + ' onchange="ExpeditionApp.changerMode()"> <span><strong>❄️ Chronofresh</strong> — camion réfrigéré (0 à 4 °C). Pour les produits frais.</span></label>'
      +   '<label class="exp-check" style="cursor:pointer;"><input type="radio" name="expMode" value="ambiant" ' + (r.mode_froid === false ? 'checked' : '') + ' onchange="ExpeditionApp.changerMode()"> <span><strong>📦 Chrono 13</strong> — température ambiante. Pour l\'épicerie et les produits secs.</span></label>'
      +   '<label class="exp-l">Jours de remise des colis au transporteur</label>'
      +   '<div class="exp-jours">' + JOURS.map(function (j) {
            return '<label><input type="checkbox" class="expJour" value="' + j[0] + '" ' + ((r.jours_expedition || []).indexOf(j[0]) >= 0 ? 'checked' : '') + '> ' + j[1] + '</label>';
          }).join('') + '</div>'
      +   '<div class="exp-aide" style="margin:6px 0 0;">Un départ le vendredi est livré le samedi : vérifiez que votre contrat inclut la livraison du samedi.</div>'
      +   '<div class="exp-2">'
      +     '<div><label class="exp-l">Heure limite de commande</label><input type="time" id="expHeure" value="' + h(String(r.heure_limite || '12:00').slice(0, 5)) + '"></div>'
      +     '<div><label class="exp-l">Délai de préparation (jours)</label><input type="number" id="expDelai" min="0" max="10" step="1" value="' + h(r.delai_preparation_jours) + '"></div>'
      +   '</div>'
      +   '<div class="exp-aide" style="margin:6px 0 0;">Exemple : délai 1 jour, limite 12 h → une commande passée lundi à 10 h peut partir mardi ; passée lundi à 15 h, mercredi.</div>'
      +   '<div id="expDlcBloc" style="' + (r.mode_froid === false ? 'display:none;' : '') + '"><label class="exp-l">Date limite de consommation imprimée sur l\'étiquette : départ + … jours</label><input type="number" id="expDlc" min="1" max="60" step="1" value="' + h(r.dlc_jours) + '"><div class="exp-aide" style="margin:6px 0 0;">Chronofresh l\'exige. Vous pourrez la modifier colis par colis.</div></div>'
      + '</div>'

      // ── Tarifs
      + '<div class="exp-carte">'
      +   '<h3>Tarifs d\'expédition facturés au client</h3>'
      +   '<div class="exp-aide">Indiquez un prix par tranche de poids. Partez des tarifs de <strong>votre</strong> contrat Chronopost et ajoutez le coût de l\'emballage. Le poids du colis est calculé automatiquement à partir du panier.</div>'
      +   '<div class="exp-palier" style="font-size:12px;color:#5A6478;margin-bottom:4px;"><span>Jusqu\'à (kg)</span><span>Prix client (€)</span><span></span></div>'
      +   '<div id="expPaliers">' + (grille.length ? grille : [{ max_kg: '', prix: '' }]).map(palierHtml).join('') + '</div>'
      +   '<button class="exp-btn clair" style="width:100%;" onclick="ExpeditionApp.ajouterPalier()">+ Ajouter une tranche</button>'
      +   '<div class="exp-2">'
      +     '<div><label class="exp-l">Commande minimum (€)</label><input type="text" inputmode="decimal" id="expMin" value="' + h(r.min_commande != null ? String(r.min_commande).replace('.', ',') : '') + '"></div>'
      +     '<div><label class="exp-l">Expédition offerte dès (€)</label><input type="text" inputmode="decimal" id="expSeuil" placeholder="jamais" value="' + h(r.seuil_gratuite != null ? String(r.seuil_gratuite).replace('.', ',') : '') + '"></div>'
      +   '</div>'
      +   '<div class="exp-2">'
      +     '<div><label class="exp-l">Poids de l\'emballage (g)</label><input type="number" id="expEmballage" min="0" step="50" value="' + h(r.poids_emballage_g) + '"></div>'
      +     '<div><label class="exp-l">Poids d\'un produit sans poids connu (g)</label><input type="number" id="expDefaut" min="1" step="10" value="' + h(r.poids_defaut_g) + '"></div>'
      +   '</div>'
      +   '<label class="exp-check" style="cursor:pointer;margin-top:10px;"><input type="checkbox" id="expCorse" ' + (r.corse ? 'checked' : '') + ' onchange="document.getElementById(\'expCorseBloc\').style.display=this.checked?\'\':\'none\'"> <span>J\'expédie aussi en <strong>Corse</strong></span></label>'
      +   '<div id="expCorseBloc" style="' + (r.corse ? '' : 'display:none;') + '"><label class="exp-l">Supplément Corse (€), ajouté même si l\'expédition est offerte</label><input type="text" inputmode="decimal" id="expSupCorse" value="' + h(String(r.supplement_corse || 0).replace('.', ',')) + '"></div>'
      +   '<label class="exp-l">Message affiché à vos clients (facultatif)</label>'
      +   '<textarea id="expMessage" rows="2" maxlength="300" placeholder="Ex. Pas d\'expédition la semaine de Noël.">' + h(r.message_client || '') + '</textarea>'
      + '</div>'

      // ── Compte Chronopost
      + '<div class="exp-carte">'
      +   '<h3>Mon compte Chronopost</h3>'
      +   '<div class="exp-aide">Les étiquettes sont créées sur <strong>votre</strong> contrat : Chronopost vous facture directement vos envois. Ces identifiants ne sont jamais visibles de vos clients.</div>'
      +   '<div class="exp-2">'
      +     '<div><label class="exp-l">N° de compte</label><input type="text" inputmode="numeric" id="expCompte" autocomplete="off" value="' + h(c.chrono_compte || '') + '"></div>'
      +     '<div><label class="exp-l">Sous-compte (si vous en avez un)</label><input type="text" inputmode="numeric" id="expSousCompte" autocomplete="off" value="' + h(c.chrono_sous_compte || '') + '"></div>'
      +   '</div>'
      +   '<label class="exp-l">Mot de passe des services web</label>'
      +   '<input type="password" id="expMdp" autocomplete="new-password" placeholder="' + (c.chrono_compte ? '•••••• (enregistré — laissez vide pour le conserver)' : '6 chiffres fournis par Chronopost') + '" oninput="ExpeditionApp.mdpSaisi()">'
      +   '<label class="exp-l" style="margin-top:16px;font-weight:600;color:#0A1428;">Adresse d\'enlèvement des colis</label>'
      +   '<label class="exp-l">Nom affiché sur l\'étiquette</label><input type="text" id="expNomExp" maxlength="100" value="' + h(c.exp_nom || E.biz.nom_boutique || '') + '">'
      +   '<label class="exp-l">Adresse</label><input type="text" id="expAdr" maxlength="38" value="' + h(c.exp_adresse || E.biz.adresse || '') + '">'
      +   '<div class="exp-2">'
      +     '<div><label class="exp-l">Code postal</label><input type="text" inputmode="numeric" id="expCpExp" maxlength="5" value="' + h(c.exp_code_postal || E.biz.code_postal || '') + '"></div>'
      +     '<div><label class="exp-l">Ville</label><input type="text" id="expVilleExp" maxlength="50" value="' + h(c.exp_ville || E.biz.ville || '') + '"></div>'
      +   '</div>'
      +   '<div class="exp-2">'
      +     '<div><label class="exp-l">Téléphone</label><input type="tel" id="expTelExp" maxlength="20" value="' + h(c.exp_telephone || E.biz.telephone || '') + '"></div>'
      +     '<div><label class="exp-l">E-mail</label><input type="email" id="expMailExp" maxlength="80" value="' + h(c.exp_email || E.biz.email || '') + '"></div>'
      +   '</div>'
      +   '<button class="exp-btn clair" style="width:100%;margin-top:14px;" id="expBtnTest" onclick="ExpeditionApp.testerCompte()">Enregistrer et tester mon compte</button>'
      +   '<div id="expTestEtat">' + (c.verifie_le ? '<div class="exp-etat exp-ok">✅ Identifiants validés par Chronopost le ' + h(new Date(c.verifie_le).toLocaleDateString('fr-FR')) + '.</div>' : '') + '</div>'
      + '</div>'

      // ── Poids des produits
      + '<div class="exp-carte">'
      +   '<h3>Poids de mes produits</h3>'
      +   '<div class="exp-aide">Le poids sert à calculer les frais. Il est déduit de l\'unité de vente quand c\'est possible (« le kg », « la pièce ~250 g »). Corrigez-le si besoin, et cochez ✕ pour un produit qui ne s\'expédie pas.</div>'
      +   '<div class="exp-prod" style="font-size:11.5px;color:#5A6478;border-top:none;"><span>Produit</span><span>Poids unitaire (g)</span><span title="Non expédiable">✕</span></div>'
      +   '<div id="expProduits">' + (E.produits.length ? E.produits.map(produitHtml).join('') : '<div class="exp-aide">Aucun produit dans votre catalogue.</div>') + '</div>'
      + '</div>'

      + '<div class="exp-carte">' + blocPrerequis() + '</div>';

    var pied = document.createElement('div');
    pied.className = 'exp-pied';
    pied.innerHTML = '<button class="exp-btn" id="expBtnSave" onclick="ExpeditionApp.enregistrer()">Enregistrer</button>';
    document.getElementById('expOverlay').appendChild(pied);
  }

  function palierHtml(p) {
    return '<div class="exp-palier">'
      + '<input type="text" inputmode="decimal" class="expPalierKg" placeholder="2" value="' + h(p.max_kg === '' || p.max_kg == null ? '' : String(p.max_kg).replace('.', ',')) + '">'
      + '<input type="text" inputmode="decimal" class="expPalierPrix" placeholder="0,00" value="' + h(p.prix === '' || p.prix == null ? '' : Number(p.prix).toFixed(2).replace('.', ',')) + '">'
      + '<button onclick="this.parentElement.remove()" aria-label="Supprimer la tranche">🗑</button>'
      + '</div>';
  }

  function produitHtml(p) {
    var sub = p.unite + (p.auto ? ' · calculé : ' + poidsLisible(p.auto) : ' · poids inconnu');
    return '<div class="exp-prod">'
      + '<div><div class="exp-prod-nom">' + h(p.nom) + '</div><div class="exp-prod-sub">' + h(sub) + '</div></div>'
      + '<input type="text" inputmode="numeric" placeholder="' + h(p.auto || 'défaut') + '" value="' + h(p.poids || '') + '" onchange="ExpeditionApp.majProduit(\'' + p.id + '\', \'poids\', this)">'
      + '<input type="checkbox" title="Non expédiable" ' + (p.exclu ? 'checked' : '') + ' onchange="ExpeditionApp.majProduit(\'' + p.id + '\', \'exclu\', this)" style="width:20px;height:20px;accent-color:#9a2d24;">'
      + '</div>';
  }

  function ajouterPalier() {
    document.getElementById('expPaliers').insertAdjacentHTML('beforeend', palierHtml({ max_kg: '', prix: '' }));
  }

  function changerMode() {
    var froid = document.querySelector('input[name=expMode]:checked').value === 'froid';
    document.getElementById('expDlcBloc').style.display = froid ? '' : 'none';
  }

  function mdpSaisi() { E.motDePasseSaisi = true; }

  async function majProduit(id, champ, el) {
    var p = E.produits.find(function (x) { return x.id === id; });
    if (!p) return;
    var patch;
    if (champ === 'exclu') {
      patch = { expedition_exclue: !!el.checked };
    } else {
      var n = nombre(el.value);
      if (el.value.trim() !== '' && (n === null || n <= 0 || n > 30000)) { toast('⚠️ Poids invalide (en grammes)'); el.value = p.poids || ''; return; }
      patch = { poids_expedition_g: el.value.trim() === '' ? null : Math.round(n) };
    }
    try {
      await rest('PATCH', 'catalogue?id=eq.' + id, patch, 'return=minimal');
      if (champ === 'exclu') p.exclu = patch.expedition_exclue; else p.poids = patch.poids_expedition_g;
      toast('✅ ' + p.nom + ' mis à jour');
    } catch (e) {
      toast('❌ Enregistrement impossible');
    }
  }

  // Lit le formulaire. Renvoie { reglages, compte } ou lève une erreur lisible.
  function lireFormulaire() {
    var paliers = [];
    var lignes = document.querySelectorAll('#expPaliers .exp-palier');
    for (var i = 0; i < lignes.length; i++) {
      var kgTxt = lignes[i].querySelector('.expPalierKg').value.trim();
      var prixTxt = lignes[i].querySelector('.expPalierPrix').value.trim();
      if (kgTxt === '' && prixTxt === '') continue;
      var kg = nombre(kgTxt), prix = nombre(prixTxt);
      if (kg === null || kg <= 0 || kg > 30) throw new Error('Tarifs : le poids d\'une tranche doit être compris entre 0 et 30 kg');
      if (prix === null || prix < 0) throw new Error('Tarifs : indiquez un prix pour la tranche jusqu\'à ' + kgTxt + ' kg');
      paliers.push({ max_kg: kg, prix: Math.round(prix * 100) / 100 });
    }
    paliers.sort(function (a, b) { return a.max_kg - b.max_kg; });
    for (var k = 1; k < paliers.length; k++) {
      if (paliers[k].max_kg === paliers[k - 1].max_kg) throw new Error('Tarifs : deux tranches ont le même poids');
    }
    var jours = Array.prototype.map.call(document.querySelectorAll('.expJour:checked'), function (el) { return Number(el.value); });
    if (jours.length === 0) throw new Error('Choisissez au moins un jour de départ');
    var min = nombre(document.getElementById('expMin').value);
    var seuilTxt = document.getElementById('expSeuil').value.trim();
    var seuil = seuilTxt === '' ? null : nombre(seuilTxt);
    if (seuilTxt !== '' && (seuil === null || seuil <= 0)) throw new Error('« Expédition offerte dès » : montant invalide (laissez vide pour ne jamais l\'offrir)');
    var delai = nombre(document.getElementById('expDelai').value);
    if (delai === null || delai < 0 || delai > 10) throw new Error('Délai de préparation : entre 0 et 10 jours');
    var dlc = nombre(document.getElementById('expDlc').value);
    var corse = document.getElementById('expCorse').checked;
    var supCorse = nombre(document.getElementById('expSupCorse').value);
    var cp = document.getElementById('expCpExp').value.trim();
    if (cp && !/^\d{5}$/.test(cp)) throw new Error('Adresse d\'enlèvement : code postal invalide');

    var compte = {
      commercant_id: E.cid,
      chrono_compte: document.getElementById('expCompte').value.trim() || null,
      chrono_sous_compte: document.getElementById('expSousCompte').value.trim() || null,
      exp_nom: document.getElementById('expNomExp').value.trim() || null,
      exp_adresse: document.getElementById('expAdr').value.trim() || null,
      exp_code_postal: cp || null,
      exp_ville: document.getElementById('expVilleExp').value.trim() || null,
      exp_telephone: document.getElementById('expTelExp').value.trim() || null,
      exp_email: document.getElementById('expMailExp').value.trim() || null,
    };
    var mdp = document.getElementById('expMdp').value.trim();
    if (mdp) compte.chrono_mot_de_passe = mdp;
    // Compte ou mot de passe modifiés : le test précédent ne vaut plus
    if (mdp || compte.chrono_compte !== ((E.compte && E.compte.chrono_compte) || null)) compte.verifie_le = null;

    return {
      reglages: {
        commercant_id: E.cid,
        mode_froid: document.querySelector('input[name=expMode]:checked').value === 'froid',
        jours_expedition: jours.sort(),
        heure_limite: document.getElementById('expHeure').value || '12:00',
        delai_preparation_jours: Math.round(delai),
        min_commande: min !== null && min >= 0 ? min : 0,
        seuil_gratuite: seuil,
        grille: paliers,
        poids_emballage_g: Math.max(0, Math.round(nombre(document.getElementById('expEmballage').value) || 0)),
        poids_defaut_g: Math.max(1, Math.round(nombre(document.getElementById('expDefaut').value) || 300)),
        dlc_jours: dlc !== null && dlc >= 1 && dlc <= 60 ? Math.round(dlc) : 7,
        corse: corse,
        supplement_corse: corse && supCorse !== null && supCorse >= 0 ? supCorse : 0,
        message_client: document.getElementById('expMessage').value.trim() || null,
      },
      compte: compte,
    };
  }

  async function sauver(avecOuverture) {
    var f = lireFormulaire();
    if (avecOuverture !== undefined) f.reglages.ouverte = avecOuverture;
    var lignes = await rest('POST', 'expedition_reglages?on_conflict=commercant_id', f.reglages, 'resolution=merge-duplicates,return=representation');
    // Pas d'upsert ici : le mot de passe Chronopost est en écriture seule pour
    // le navigateur (colonne non lisible), on écrit donc sans rien relire.
    if (E.compte && E.compte.commercant_id) {
      var maj = Object.assign({}, f.compte);
      delete maj.commercant_id;
      await rest('PATCH', 'expedition_comptes?commercant_id=eq.' + E.cid, maj, 'return=minimal');
    } else {
      await rest('POST', 'expedition_comptes', f.compte, 'return=minimal');
    }
    E.reglages = (lignes && lignes[0]) || Object.assign({}, E.reglages, f.reglages);
    E.compte = Object.assign({}, E.compte || {}, f.compte);
    delete E.compte.chrono_mot_de_passe;
    return f;
  }

  async function enregistrer() {
    var b = document.getElementById('expBtnSave');
    if (b) { b.disabled = true; b.textContent = 'Enregistrement…'; }
    try {
      await sauver();
      toast('✅ Réglages d\'expédition enregistrés');
      rendre();
    } catch (e) {
      toast('❌ ' + e.message);
      if (b) { b.disabled = false; b.textContent = 'Enregistrer'; }
    }
  }

  async function basculerOuverture(el) {
    var veut = el.checked;
    try {
      await sauver(); // on enregistre d'abord ce qui est à l'écran
      if (veut) {
        var pr = prerequis();
        if (!pr.grille) throw new Error('Renseignez d\'abord vos tarifs d\'expédition');
        if (!pr.adresse) throw new Error('Renseignez d\'abord l\'adresse d\'enlèvement des colis');
        if (!pr.compte) throw new Error('Enregistrez et testez d\'abord votre compte Chronopost');
        if (!pr.paiement) throw new Error('Activez d\'abord le paiement en ligne (Réglages → Paiements clients)');
      }
      var lignes = await rest('PATCH', 'expedition_reglages?commercant_id=eq.' + E.cid, { ouverte: veut });
      E.reglages = (lignes && lignes[0]) || E.reglages;
      toast(E.reglages.ouverte ? '✅ Expédition proposée à vos clients' : 'Expédition masquée de votre boutique');
    } catch (e) {
      toast('⚠️ ' + e.message);
    }
    rendre();
  }

  async function testerCompte() {
    var b = document.getElementById('expBtnTest');
    var etat = document.getElementById('expTestEtat');
    if (b) { b.disabled = true; b.textContent = 'Test en cours…'; }
    try {
      var f = lireFormulaire();
      if (!f.compte.chrono_compte) throw new Error('Indiquez votre numéro de compte Chronopost');
      if (!f.compte.chrono_mot_de_passe && !(E.compte && E.compte.chrono_compte)) throw new Error('Indiquez votre mot de passe Chronopost');
      if (!f.compte.exp_code_postal) throw new Error('Indiquez le code postal d\'enlèvement');
      await sauver();
      var res = await fonction({ action: 'tester-compte', commercant_id: E.cid });
      if (res.ok) {
        E.compte.verifie_le = new Date().toISOString();
        rendre();
        var z = document.getElementById('expTestEtat');
        if (z) z.innerHTML = '<div class="exp-etat exp-ok">✅ Identifiants validés par Chronopost. ' + (E.reglages.mode_froid !== false ? 'Chronofresh sera vérifié à la création de votre première étiquette : s\'il n\'est pas ouvert sur votre contrat, Chronopost le signalera.' : '') + '</div>';
        toast('✅ Compte Chronopost validé');
        return;
      }
      if (E.compte) E.compte.verifie_le = null;
      if (etat) etat.innerHTML = '<div class="exp-etat exp-ko">❌ Chronopost a refusé ces identifiants : ' + h(res.message || '') + '. Vérifiez le numéro de compte et le mot de passe des services web (différent de celui de votre espace client).</div>';
    } catch (e) {
      if (etat) etat.innerHTML = '<div class="exp-etat exp-ko">❌ ' + h(e.message) + '</div>';
    }
    if (b) { b.disabled = false; b.textContent = 'Enregistrer et tester mon compte'; }
  }

  // ════════════════════════════════════════════════════════════
  //  COMMANDES À EXPÉDIER
  // ════════════════════════════════════════════════════════════
  function commande(id) {
    return (typeof toutesLesCommandes !== 'undefined' ? toutesLesCommandes : []).find(function (c) { return c.id === id; });
  }

  async function recharger() {
    var cid = commercantId();
    if (cid && typeof chargerCommandesSupabase === 'function') await chargerCommandesSupabase(cid);
  }

  function lienSuivi(c) {
    var x = c.exp || {};
    if (!x.suivi) return '';
    if (x.transporteur && x.transporteur !== 'chronopost') return '';
    return 'https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumerosLT=' + encodeURIComponent(x.suivi);
  }

  var BTN = 'border-radius:10px;padding:10px;font-size:13px;font-weight:500;font-family:Manrope,system-ui,sans-serif;cursor:pointer;flex:1;';

  // Habillage d'une commande à expédier pour renderCarteCommande.
  function carte(c) {
    var x = c.exp || {};
    var d = x.destinataire || {};
    var statut = c.statut;
    var expediee = !!x.expediee_le;
    var annulee = statut === 'annulee';
    var id = c.id;

    var paiement = x.test
      ? '<span style="background:#FFF8E7;color:#6b5514;">🧪 Commande de test (démonstration)</span>'
      : x.paiement_status === 'paid'
        ? '<span style="background:#eaf7ee;color:#1f5230;">💳 Payée en ligne ' + eur((x.paiement_montant_cents || 0) / 100) + (x.paiement_rembourse_cents > 0 ? ' · remboursé ' + eur(x.paiement_rembourse_cents / 100) : '') + '</span>'
        : x.paiement_status === 'refunded'
          ? '<span style="background:#f3f3f3;color:#555;">↩️ Remboursée ' + eur((x.paiement_rembourse_cents || 0) / 100) + '</span>'
          : '';

    var adresse = '<div style="margin:8px 0;padding:10px 12px;background:#f1edfb;border-radius:10px;font-size:13px;color:#3d2f6b;line-height:1.5;">'
      + '<div style="font-weight:700;">📦 ' + h(d.nom || c.client) + (d.telephone ? ' · <a href="tel:' + h(String(d.telephone).replace(/\s/g, '')) + '" style="color:inherit;">' + h(d.telephone) + '</a>' : '') + '</div>'
      + '<div>' + h(d.adresse || '') + (d.complement ? ', ' + h(d.complement) : '') + '</div>'
      + '<div>' + h(d.code_postal || '') + ' ' + h(d.ville || '') + '</div>'
      + '<div style="margin-top:4px;font-size:12px;opacity:.85;">Départ prévu ' + h(dateCourte(x.date)) + ' · ' + h(poidsLisible(x.poids_g) || '—') + '</div>'
      + '</div>'
      + (paiement ? '<div style="margin:8px 0;font-size:12px;font-weight:500;display:flex;">' + paiement.replace('<span style="', '<span style="padding:8px 12px;border-radius:10px;flex:1;') + '</div>' : '');

    var suivi = '';
    if (x.suivi) {
      var url = lienSuivi(c);
      suivi = '<div style="margin:8px 0;padding:10px 12px;background:#eef3fb;border-radius:10px;font-size:13px;color:#1f3d70;line-height:1.5;">'
        + '<div><strong>' + h(x.produit || 'Colis') + '</strong> · suivi <span style="font-family:monospace;font-weight:700;">' + h(x.suivi) + '</span>'
        + (url ? ' · <a href="' + url + '" target="_blank" rel="noopener" style="color:#1f3d70;">Suivre</a>' : '') + '</div>'
        + (x.livree_le ? '<div>✅ Livré le ' + h(dateCourte(x.livree_le)) + '</div>'
            : x.suivi_etat ? '<div>📍 ' + h(x.suivi_etat) + '</div>'
            : expediee ? '<div>Remis au transporteur le ' + h(dateCourte(x.expediee_le)) + '</div>' : '<div>Étiquette prête — colis à remettre au transporteur</div>')
        + '</div>';
    }

    var principal, secondaires = '';
    if (annulee) {
      principal = '<button class="btn-preparer" style="background:var(--creme);color:var(--texte-doux);cursor:default;">✕ Annulée</button>';
    } else if (expediee) {
      principal = '<button class="btn-preparer" style="background:var(--creme);color:var(--texte-doux);cursor:default;">' + (x.livree_le ? '✓ Livrée' : '✓ Expédiée') + '</button>';
      if (!x.livree_le && lienSuivi(c)) {
        secondaires = '<button onclick="ExpeditionApp.actualiserSuivi(\'' + id + '\')" style="' + BTN + 'background:#eef3fb;color:#1f3d70;border:1px solid #cfdcf2;">🔄 Actualiser le suivi</button>';
      }
    } else if (x.suivi) {
      principal = '<button class="btn-preparer" style="background:var(--vert-fonce);color:white;" onclick="ExpeditionApp.expedier(\'' + id + '\')">📦 COLIS REMIS AU TRANSPORTEUR</button>';
      secondaires = (x.etiquette_le ? '<button onclick="ExpeditionApp.imprimer(\'' + id + '\')" style="' + BTN + 'background:#eef3fb;color:#1f3d70;border:1px solid #cfdcf2;">🖨 Réimprimer</button>'
          + '<button onclick="ExpeditionApp.annulerEtiquette(\'' + id + '\')" style="' + BTN + 'background:#f3f3f3;color:#555;border:1px solid #ddd;">Annuler l\'étiquette</button>' : '')
        + '<button onclick="ExpeditionApp.rembourser(\'' + id + '\')" style="' + BTN + 'background:#fdf0ef;color:#9a2d24;border:1px solid #f3c8c4;">Annuler la commande</button>';
    } else {
      principal = '<button class="btn-preparer vert" onclick="ExpeditionApp.etiquette(\'' + id + '\')">🏷️ CRÉER L\'ÉTIQUETTE</button>';
      secondaires = '<button onclick="ExpeditionApp.suiviManuel(\'' + id + '\')" style="' + BTN + 'background:#f3f3f3;color:#555;border:1px solid #ddd;">J\'ai déjà mon étiquette</button>'
        + '<button onclick="ExpeditionApp.rembourser(\'' + id + '\')" style="' + BTN + 'background:#fdf0ef;color:#9a2d24;border:1px solid #f3c8c4;">Annuler la commande</button>';
    }

    return {
      couleur: '#6b4fbb',
      typeIcon: '📦 Expédition',
      typeBadgeStyle: 'background:#f1edfb;color:#4b3a7a;',
      heure: 'Départ ' + dateCourte(x.date),
      badge: annulee ? { classe: 'badge-remise', texte: 'Annulée' }
        : x.livree_le ? { classe: 'badge-remise', texte: 'Livrée' }
        : expediee ? { classe: 'badge-remise', texte: 'Expédiée' }
        : x.suivi ? { classe: 'badge-prete', texte: 'Étiquette prête' }
        : { classe: 'badge-nouvelle', texte: 'À préparer' },
      blocHaut: adresse + suivi,
      btnPrincipal: principal,
      blocBas: secondaires ? '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">' + secondaires + '</div>' : '',
    };
  }

  // ── Dialogue ──────────────────────────────────────────────
  function dialogue(titre, corpsHtml, libelleOk, action) {
    styles();
    var vieux = document.getElementById('expDialogue');
    if (vieux) vieux.remove();
    var d = document.createElement('div');
    d.id = 'expDialogue';
    d.innerHTML = '<div class="exp-d"><h3>' + titre + '</h3>' + corpsHtml
      + '<div class="exp-d-err" id="expDErr"></div>'
      + '<div class="exp-d-btns"><button class="s" id="expDNon">Annuler</button><button class="p" id="expDOui">' + libelleOk + '</button></div></div>';
    document.body.appendChild(d);
    var fermerD = function () { d.remove(); };
    d.addEventListener('click', function (ev) { if (ev.target === d) fermerD(); });
    document.getElementById('expDNon').onclick = fermerD;
    document.getElementById('expDOui').onclick = async function () {
      var b = this, err = document.getElementById('expDErr');
      var texte = b.textContent;
      b.disabled = true; b.textContent = 'Patientez…'; err.style.display = 'none';
      try {
        await action();
        fermerD();
      } catch (e) {
        err.textContent = '❌ ' + e.message; err.style.display = 'block';
        b.disabled = false; b.textContent = texte;
      }
    };
  }

  function ouvrirPdf(base64) {
    var bin = atob(base64);
    var octets = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
    var url = URL.createObjectURL(new Blob([octets], { type: 'application/pdf' }));
    var w = window.open(url, '_blank');
    if (!w) {
      // Fenêtre bloquée (application installée, iOS) : téléchargement direct
      var a = document.createElement('a');
      a.href = url; a.download = 'etiquette-chronopost.pdf';
      document.body.appendChild(a); a.click(); a.remove();
    }
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  // ── Actions ───────────────────────────────────────────────
  function etiquette(id) {
    var c = commande(id);
    if (!c) return;
    var x = c.exp || {};
    var nonPeses = (c.produits || []).filter(function (p) { return p.poids_indicatif && !p.poids_reel_g; });
    var depart = x.date && x.date > aujourdhui() ? x.date : aujourdhui();
    var froid = x.froid !== false;
    var dlcDefaut = isoPlusJours(depart, Number(x.dlc_jours || 7));
    dialogue('🏷️ Créer l\'étiquette',
      '<p>Commande ' + h(c.numero) + ' pour ' + h((x.destinataire && x.destinataire.nom) || c.client) + ', ' + h((x.destinataire && x.destinataire.ville) || '') + ' · départ ' + h(dateCourte(depart)) + '</p>'
      + (nonPeses.length ? '<p style="background:#f3f0fa;color:#4b3a7a;padding:8px 10px;border-radius:8px;">⚖️ ' + h(nonPeses.map(function (p) { return p.nom; }).join(', ')) + ' : pas encore pesé. Pesez avant d\'expédier pour que le client soit remboursé de l\'écart éventuel.</p>' : '')
      + '<label>Poids réel du colis fermé (kg)</label><input id="expDPoids" type="text" inputmode="decimal" value="' + h(String(Math.round((x.poids_g || 1000) / 10) / 100).replace('.', ',')) + '">'
      + (froid ? '<label>Date limite de consommation des produits</label><input id="expDDlc" type="date" min="' + h(isoPlusJours(depart, 1)) + '" value="' + h(dlcDefaut) + '">' : '')
      + (x.test ? '<p style="margin-top:10px;background:#FFF8E7;color:#6b5514;padding:8px 10px;border-radius:8px;">🧪 Commande de test : l\'étiquette sera un spécimen, à ne pas utiliser.</p>' : ''),
      'Créer et imprimer',
      async function () {
        var poids = nombre(document.getElementById('expDPoids').value);
        if (poids === null || poids <= 0 || poids > 30) throw new Error('Poids invalide (entre 0,1 et 30 kg)');
        var corps = { action: 'etiquette', commande_id: id, poids_kg: poids };
        var champDlc = document.getElementById('expDDlc');
        if (champDlc) {
          if (!champDlc.value) throw new Error('Indiquez la date limite de consommation');
          corps.dlc = champDlc.value;
        }
        var res = await fonction(corps);
        ouvrirPdf(res.pdf_base64);
        toast('✅ Étiquette ' + (res.produit || '') + ' créée : ' + res.suivi);
        await recharger();
      });
  }

  async function imprimer(id) {
    try {
      var res = await fonction({ action: 'etiquette-pdf', commande_id: id });
      ouvrirPdf(res.pdf_base64);
    } catch (e) { toast('❌ ' + e.message); }
  }

  function annulerEtiquette(id) {
    var c = commande(id);
    if (!c) return;
    dialogue('Annuler l\'étiquette ?',
      '<p>L\'étiquette ' + h((c.exp && c.exp.suivi) || '') + ' sera annulée et la commande repassera « à préparer ». Détruisez l\'étiquette imprimée : une étiquette non utilisée n\'est pas facturée par Chronopost.</p>',
      'Annuler l\'étiquette',
      async function () {
        await fonction({ action: 'annuler-etiquette', commande_id: id });
        toast('Étiquette annulée');
        await recharger();
      });
  }

  function expedier(id) {
    var c = commande(id);
    if (!c) return;
    var x = c.exp || {};
    dialogue('📦 Colis remis au transporteur ?',
      '<p>Le client reçoit aussitôt un e-mail avec son numéro de suivi' + (x.suivi ? ' <strong>' + h(x.suivi) + '</strong>' : '') + '. La commande passe en « terminée ».</p>'
      + (x.paiement_status === 'paid' ? '<p>Si la pesée a fait baisser le total, la différence est remboursée automatiquement au client.</p>' : ''),
      'Oui, colis parti',
      async function () {
        var res = await fonction({ action: 'expedier', commande_id: id });
        toast(res.rembourse_cents > 0 ? '✅ Colis expédié · ' + eur(res.rembourse_cents / 100) + ' remboursés au client' : '✅ Colis expédié, client prévenu');
        await recharger();
      });
  }

  // Étiquette faite ailleurs (site du transporteur) : on saisit le n° de suivi
  function suiviManuel(id) {
    var c = commande(id);
    if (!c) return;
    dialogue('J\'ai déjà mon étiquette',
      '<p>Vous avez créé l\'étiquette sur le site de votre transporteur ? Saisissez le numéro de suivi : le client le reçoit par e-mail et la commande passe en « terminée ».</p>'
      + '<label>Numéro de suivi du colis</label><input id="expDSuivi" type="text" autocapitalize="characters" placeholder="XU123456789FR">',
      'Colis parti, prévenir le client',
      async function () {
        var n = document.getElementById('expDSuivi').value.trim();
        if (!n) throw new Error('Indiquez le numéro de suivi');
        await fonction({ action: 'expedier', commande_id: id, suivi: n, transporteur: 'chronopost' });
        toast('✅ Colis expédié, client prévenu');
        await recharger();
      });
  }

  async function actualiserSuivi(id) {
    try {
      var res = await fonction({ action: 'suivi', commande_id: id });
      toast(res.ok ? (res.livre ? '✅ Colis livré' : (res.etat ? '📍 ' + res.etat : 'Pas encore d\'information de suivi')) : '⚠️ ' + (res.message || 'Suivi indisponible'));
      await recharger();
    } catch (e) { toast('❌ ' + e.message); }
  }

  function rembourser(id) {
    var c = commande(id);
    if (!c) return;
    var x = c.exp || {};
    var paye = x.paiement_status === 'paid' ? (x.paiement_montant_cents || 0) - (x.paiement_rembourse_cents || 0) : 0;
    dialogue('Annuler cette commande ?',
      '<p>La commande ' + h(c.numero) + ' sera annulée' + (paye > 0 ? ' et le client <strong>remboursé de ' + eur(paye / 100) + '</strong> sur sa carte' : '') + '. Il est prévenu par e-mail. Cette action est définitive.</p>',
      paye > 0 ? 'Annuler et rembourser' : 'Annuler la commande',
      async function () {
        await fonction({ action: 'rembourser', commande_id: id });
        toast('Commande annulée' + (paye > 0 ? ', client remboursé' : ''));
        await recharger();
      });
  }

  // Champs d'expédition d'une commande renvoyée par l'API → objet `exp`
  function depuisLigne(c) {
    if (!c || c.type !== 'expedition') return null;
    return {
      date: c.expedition_date || null,
      poids_g: c.expedition_poids_g || null,
      destinataire: c.expedition_destinataire || null,
      test: !!c.expedition_test,
      transporteur: c.expedition_transporteur || null,
      produit: c.expedition_produit || null,
      suivi: c.expedition_suivi || null,
      etiquette_le: c.expedition_etiquette_le || null,
      expediee_le: c.expedition_expediee_le || null,
      livree_le: c.expedition_livree_le || null,
      suivi_etat: c.expedition_suivi_etat || null,
      paiement_status: c.paiement_status || 'none',
      paiement_montant_cents: c.paiement_montant_cents || 0,
      paiement_rembourse_cents: c.paiement_rembourse_cents || 0,
      froid: REGLAGES_COMMANDES ? REGLAGES_COMMANDES.mode_froid !== false : true,
      dlc_jours: REGLAGES_COMMANDES ? REGLAGES_COMMANDES.dlc_jours : 7,
    };
  }

  // Réglages utiles aux commandes (service froid, DLC par défaut), chargés une fois
  var REGLAGES_COMMANDES = null;
  var reglagesDemandes = false;
  async function chargerReglagesCommandes() {
    if (reglagesDemandes) return;
    var cid = commercantId();
    if (!cid) return;
    reglagesDemandes = true;
    try {
      var rows = await rest('GET', 'expedition_reglages?commercant_id=eq.' + cid + '&select=active,ouverte,mode_froid,dlc_jours');
      REGLAGES_COMMANDES = (rows && rows[0]) || null;
      majLigneReglages();
    } catch (e) { reglagesDemandes = false; }
  }

  // Sous-titre de la ligne « Expédition France » dans Réglages
  function majLigneReglages() {
    var sub = document.getElementById('regExpeditionSub');
    if (!sub) return;
    var r = REGLAGES_COMMANDES;
    sub.textContent = !r || !r.active ? 'Option payante · envoyez vos produits partout en France'
      : r.ouverte ? 'Activée · proposée à vos clients'
      : 'Activée · à régler avant ouverture';
  }

  window.ExpeditionApp = {
    ouvrir: ouvrir, fermer: fermer, demander: demander, enregistrer: enregistrer,
    basculerOuverture: basculerOuverture, testerCompte: testerCompte, ajouterPalier: ajouterPalier,
    changerMode: changerMode, mdpSaisi: mdpSaisi, majProduit: majProduit,
    carte: carte, depuisLigne: depuisLigne, chargerReglagesCommandes: chargerReglagesCommandes,
    etiquette: etiquette, imprimer: imprimer, annulerEtiquette: annulerEtiquette, expedier: expedier,
    suiviManuel: suiviManuel, actualiserSuivi: actualiserSuivi, rembourser: rembourser,
  };
})();
