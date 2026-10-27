// Mail de bienvenue envoye au commercant juste apres son paiement Marcheo :
// remerciement, recap de la commande, activation Stripe Connect, diffusion de sa page.

const SITE = 'https://www.xn--marcho-fva.fr';
const SITE_AFFICHE = 'marchéo.fr';
const TEL = '06 13 75 58 06';
const TEL_LIEN = '+33613755806';
const REPLY_TO = Deno.env.get('REPLY_TO_EMAIL') || 'marcheo.contact@gmail.com';

const NOMS_OFFRES: Record<string, string> = {
  vitrine: 'Vitrine',
  clickcollect: 'Click & Collect + Réservation',
  livraison: 'Tout-en-un + Livraison',
};
const MENSUEL: Record<string, number> = { vitrine: 19, clickcollect: 39, livraison: 59 };

export interface DonneesBienvenue {
  email: string;
  nom_boutique: string;
  slug: string;
  offre: string;
  frais_installation_cents: number; // montant reellement paye
  mois_offerts: number;
  frais_normal_cents?: number;      // prix catalogue avant remise
  code_promo?: string | null;
  promo_pct?: number;               // remise sur l'installation (%)
  promo_description?: string | null;
  promo_mois?: number;              // mois offerts apportes par le code (hors 1er mois standard)
  stripe_connect_actif?: boolean;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const euros = (cents: number) => (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }) + ' €';

function dateFr(d: Date) {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
}

const ligneRecap = (label: string, valeur: string) =>
  `<tr><td style="padding:8px 0;color:#5b6b63;font-size:14px;border-bottom:1px solid #EAE4D6;">${label}</td><td align="right" style="padding:8px 0;font-size:14px;font-weight:600;border-bottom:1px solid #EAE4D6;">${valeur}</td></tr>`;

const etape = (num: number, titre: string, texte: string) => `
  <tr><td style="padding:0 0 14px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="34" valign="top"><div style="width:26px;height:26px;border-radius:50%;background:#2A4535;color:#fff;font-size:13px;font-weight:700;text-align:center;line-height:26px;">${num}</div></td>
      <td style="font-size:14px;line-height:1.55;"><b>${titre}</b><br><span style="color:#5b6b63;">${texte}</span></td>
    </tr></table>
  </td></tr>`;

export function construireMailBienvenue(d: DonneesBienvenue) {
  const boutique = esc(d.nom_boutique || 'votre boutique');
  const urlBoutique = `${SITE}/${encodeURIComponent(d.slug || '')}`;
  const urlAffichee = `${SITE_AFFICHE}/${esc(d.slug || '')}`;
  const urlApp = `${SITE}/app`;
  const urlStripe = `${SITE}/app?stripe=refresh`; // ouvre directement l'onglet Reglages
  const offre = NOMS_OFFRES[d.offre] || d.offre;
  const mensuel = MENSUEL[d.offre] || 0;
  const avecCommandes = d.offre !== 'vitrine';

  let abonnement = `${mensuel} € / mois, sans engagement`;
  if (d.mois_offerts > 0) {
    const debut = new Date(Date.now() + d.mois_offerts * 30 * 86400000);
    abonnement = `${d.mois_offerts > 1 ? d.mois_offerts + ' mois offerts' : '1er mois offert'}, puis ${mensuel} € / mois à partir du ${dateFr(debut)}`;
  }

  const normal = d.frais_normal_cents || d.frais_installation_cents;
  const remise = Math.max(normal - d.frais_installation_cents, 0);
  const pct = d.promo_pct || (remise && normal ? Math.round(remise * 100 / normal) : 0);
  const fraisAffiches = remise > 0
    ? `<span style="text-decoration:line-through;color:#9aa69f;font-weight:400;">${euros(normal)}</span> ${euros(d.frais_installation_cents)} <span style="color:#2f7d4f;">(−${pct} %)</span>`
    : euros(d.frais_installation_cents);

  let blocPromo = '';
  if (d.code_promo) {
    const nbMoisPromo = d.promo_mois || 0;
    const moisPromo = nbMoisPromo * mensuel * 100;
    const economie = remise + moisPromo;
    const details = [remise > 0 ? `−${pct} % sur l'installation (${euros(remise)})` : '', nbMoisPromo > 0 ? `${nbMoisPromo} mois d'abonnement offert${nbMoisPromo > 1 ? 's' : ''} (${euros(moisPromo)})` : ''].filter(Boolean).join(' + ');
    blocPromo = `
    <div style="background:#EEF6EE;border:1px solid #BFDCBF;border-radius:12px;padding:14px 16px;margin:18px 0 0;">
      <div style="font-size:13px;color:#2f7d4f;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">🎁 Offre appliquée : ${esc(d.code_promo)}</div>
      ${d.promo_description ? `<div style="font-size:14px;margin-top:4px;">${esc(d.promo_description)}</div>` : ''}
      ${details ? `<div style="font-size:14px;margin-top:6px;color:#3d5a47;">${details}</div>` : ''}
      ${economie > 0 ? `<div style="font-size:16px;font-weight:700;margin-top:8px;color:#2A4535;">Vous économisez ${euros(economie)}</div>` : ''}
    </div>`;
  }

  const recap = [
    ligneRecap('Offre', esc(offre)),
    ligneRecap('Frais d\'installation payés', fraisAffiches),
    ligneRecap('Abonnement', esc(abonnement)),
    ligneRecap('Commission sur vos ventes', '0 %'),
    ligneRecap('Votre page', `<a href="${urlBoutique}" style="color:#2A4535;">${urlAffichee}</a>`),
  ].join('');

  const blocStripe = !avecCommandes ? '' : d.stripe_connect_actif ? `
    <h2 style="font-size:17px;margin:30px 0 10px;color:#2A4535;">💳 Votre compte Stripe</h2>
    <p style="margin:0;font-size:14px;color:#5b6b63;">Votre compte Stripe est déjà actif : vous êtes prêt à recevoir des commandes. 👍</p>` : `
    <h2 style="font-size:17px;margin:30px 0 6px;color:#2A4535;">💳 Étape importante : activer votre compte Stripe</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#5b6b63;">C'est Stripe qui sécurise les empreintes bancaires de vos clients et vous verse l'argent en cas de commande non retirée. <b>Tant qu'il n'est pas activé, vos clients ne peuvent pas commander.</b> C'est gratuit et ça prend environ 5 minutes.</p>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${etape(1, 'Préparez', 'votre RIB, une pièce d\'identité, et votre numéro SIRET (ou numéro d\'entreprise en Belgique).')}
      ${etape(2, 'Ouvrez votre espace Marchéo', 'onglet <b>Réglages</b> → <b>Paiements clients (Stripe)</b> → bouton <b>Activer</b>. Le bouton ci-dessous vous y emmène directement.')}
      ${etape(3, 'Remplissez le formulaire Stripe', 'informations de l\'entreprise, identité du gérant, puis le RIB sur lequel vous recevrez l\'argent.')}
      ${etape(4, 'C\'est fait', 'Stripe vérifie votre dossier (quelques minutes à 24 h). Le statut passe à « actif » dans vos Réglages.')}
    </table>
    <div style="text-align:center;margin:10px 0 4px;">
      <a href="${urlStripe}" style="background:#635bff;color:#fff;padding:13px 26px;border-radius:50px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">Activer mon compte Stripe</a>
    </div>
    <p style="text-align:center;font-size:12px;color:#7a8a82;margin:8px 0 0;">Vos données bancaires vont directement chez Stripe, jamais chez Marchéo.</p>`;

  const astuces = [
    ['📱', 'QR code en boutique', 'Imprimez-le depuis <b>Réglages → QR Code &amp; liens</b> et posez-le à la caisse et en vitrine. C\'est le geste qui ramène le plus de clients.'],
    ['📍', 'Fiche Google', 'Collez votre lien dans le champ « Site web » (ou « Commander ») de votre fiche Google Business. Les clients qui vous cherchent tombent directement dessus.'],
    ['📸', 'Instagram &amp; Facebook', 'Mettez le lien dans votre bio, et annoncez-le en story : « Commandez en ligne, retirez sans attendre ».'],
    ['💬', 'Vos clients fidèles', 'Envoyez le lien par SMS ou WhatsApp à vos habitués, ou dites-le simplement au comptoir.'],
  ];
  if (avecCommandes) astuces.push(['🎯', 'Une offre de lancement', 'Pour les premières commandes en ligne, un petit geste (produit offert, priorité au retrait) donne l\'habitude à vos clients.']);

  const blocDiffusion = `
    <h2 style="font-size:17px;margin:30px 0 6px;color:#2A4535;">📣 Faire connaître votre page</h2>
    <p style="margin:0 0 14px;font-size:14px;color:#5b6b63;">Votre lien à partager partout :</p>
    <div style="background:#FAF7F0;border:1px dashed #C9C1AE;border-radius:10px;padding:12px;text-align:center;font-family:monospace;font-size:15px;margin-bottom:16px;"><a href="${urlBoutique}" style="color:#2A4535;text-decoration:none;font-weight:700;">${urlAffichee}</a></div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${astuces.map(([ic, t, x]) => `<tr><td width="30" valign="top" style="font-size:18px;padding:0 0 12px;">${ic}</td><td style="font-size:14px;line-height:1.55;padding:0 0 12px;"><b>${t}</b><br><span style="color:#5b6b63;">${x}</span></td></tr>`).join('')}
    </table>`;

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bienvenue sur Marchéo</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#FAF7F0;color:#1f3028;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F0;padding:28px 12px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.05);">
        <tr><td style="background:#2A4535;color:#fff;padding:26px 28px;">
          <div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:0.75;">${boutique}</div>
          <div style="font-size:23px;font-weight:700;margin-top:4px;">Merci, et bienvenue sur Marchéo ! 🎉</div>
        </td></tr>
        <tr><td style="padding:28px;line-height:1.6;font-size:15px;">
          <p style="margin:0 0 12px;">Bonjour,</p>
          <p style="margin:0 0 12px;">Un grand merci pour votre confiance. Votre paiement est bien reçu et <b>${boutique}</b> fait désormais partie de Marchéo.</p>
          <p style="margin:0 0 6px;">Primeur pendant 19 ans, je sais ce que représente le temps d'un commerçant : mon rôle, c'est que votre page vous ramène des clients sans vous en prendre. Je reste votre interlocuteur direct pour le lancement.</p>

          <h2 style="font-size:17px;margin:26px 0 8px;color:#2A4535;">🧾 Récapitulatif</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #EAE4D6;">${recap}</table>
          ${blocPromo}
          <p style="font-size:12px;color:#7a8a82;margin:8px 0 0;">Votre facture vous est envoyée séparément par Stripe. Vous la retrouvez aussi dans Réglages → Mon abonnement Marchéo.</p>

          ${blocStripe}
          ${blocDiffusion}

          <div style="text-align:center;margin:26px 0 6px;">
            <a href="${urlApp}" style="background:#2A4535;color:#fff;padding:13px 26px;border-radius:50px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">Ouvrir mon espace commerçant</a>
          </div>

          <p style="margin:26px 0 0;">Une question, un produit à ajouter, une photo à changer ? Répondez simplement à ce mail ou appelez-moi.</p>
          <p style="margin:16px 0 0;">Merci encore, et à très vite,<br><b>Paul Merieult</b><br><span style="color:#5b6b63;font-size:14px;">Fondateur de Marchéo · <a href="tel:${TEL_LIEN}" style="color:#2A4535;">${TEL}</a></span></p>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#FAF7F0;color:#7a8a82;font-size:12px;text-align:center;">
          Marchéo · la boutique en ligne des artisans, sans commission<br>
          <a href="mailto:${REPLY_TO}" style="color:#2A4535;">${REPLY_TO}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { sujet: `Merci et bienvenue sur Marchéo, ${d.nom_boutique || ''} 🎉`.replace(/, +🎉/, ' 🎉'), html };
}

export async function envoyerMailBienvenue(d: DonneesBienvenue) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) throw new Error('RESEND_API_KEY manquante');
  const from = Deno.env.get('RESEND_FROM') || 'Marchéo <onboarding@resend.dev>';
  const { sujet, html } = construireMailBienvenue(d);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: d.email, subject: sujet, html, reply_to: REPLY_TO }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Resend: ' + (data.message || r.status));
  return data;
}
