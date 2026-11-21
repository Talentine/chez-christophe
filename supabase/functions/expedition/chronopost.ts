// ============================================================
// Client des services web Chronopost (SOAP) — étiquettes, contrat, suivi.
//
// Vérifié le 2026-11-21 avec le compte de test public de Chronopost
// (celui que Chronopost livre dans ses modules e-commerce) :
//   - shippingMultiParcelV4, produit « 01 » → étiquette Chrono 13
//   - shippingMultiParcelV4, produit « 2R » → étiquette « FRESH 13H »
//     (Chronofresh). La balise expirationDate (DLC) est OBLIGATOIRE en 2R.
//   - un départ le vendredi est automatiquement étiqueté « livraison samedi ».
//   - trackSkybillV2 répond sans identifiants.
// ============================================================

const URL_EXPEDITION = 'https://ws.chronopost.fr/shipping-cxf/ShippingServiceWS';
const URL_TARIFS = 'https://ws.chronopost.fr/quickcost-cxf/QuickcostServiceWS';
const URL_SUIVI = 'https://ws.chronopost.fr/tracking-cxf/TrackingServiceWS';

export interface Identifiants { compte: string; motDePasse: string; sousCompte?: string }

// Compte de test public de Chronopost : étiquettes « spécimen », jamais facturées.
export const COMPTE_TEST: Identifiants = { compte: '19869502', motDePasse: '255562' };

export interface Adresse {
  nom: string; contact?: string; adresse: string; adresse2?: string;
  codePostal: string; ville: string; telephone?: string; email?: string;
}

export interface DemandeEtiquette {
  identifiants: Identifiants;
  produit: string;            // '2R' Chronofresh · '01' Chrono 13
  expediteur: Adresse;
  destinataire: Adresse;
  reference: string;
  contenu: string;
  poidsKg: number;
  dateEnvoi: string;          // AAAA-MM-JJ
  dlc?: string | null;        // AAAA-MM-JJ — obligatoire en Chronofresh
}

export const lienSuivi = (numero: string) =>
  'https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumerosLT=' + encodeURIComponent(numero);

const x = (v: unknown) => String(v ?? '').replace(/[<>&'"]/g, (c) =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' } as Record<string, string>)[c]);

const b = (nom: string, v: unknown) => `<${nom}>${x(v)}</${nom}>`;

// Chronopost limite la longueur des champs imprimés sur l'étiquette
const court = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

const tel = (v: unknown) => String(v ?? '').replace(/[^\d+]/g, '').slice(0, 17);

function lire(xml: string, balise: string): string | null {
  const m = xml.match(new RegExp(`<${balise}>([\\s\\S]*?)</${balise}>`));
  return m ? m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&') : null;
}

async function soap(url: string, espace: string, corps: string): Promise<string> {
  const ctrl = new AbortController();
  const minuterie = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': '' },
      body: `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cxf="${espace}"><soapenv:Body>${corps}</soapenv:Body></soapenv:Envelope>`,
      signal: ctrl.signal,
    });
    return await r.text();
  } finally {
    clearTimeout(minuterie);
  }
}

function erreurSoap(xml: string): string | null {
  return lire(xml, 'faultstring');
}

// ── ÉTIQUETTE ───────────────────────────────────────────────
export async function creerEtiquette(d: DemandeEtiquette): Promise<
  { ok: true; numero: string; pdfBase64: string; service: string } | { ok: false; code: string; message: string }
> {
  const e = d.expediteur;
  const r = d.destinataire;
  const corps = `<cxf:shippingMultiParcelV4>
<headerValue>${b('accountNumber', d.identifiants.compte)}${b('idEmit', 'CHRFR')}${b('subAccount', d.identifiants.sousCompte || '')}</headerValue>
<shipperValue>${b('shipperAdress1', court(e.adresse, 38))}${b('shipperAdress2', court(e.adresse2, 38))}${b('shipperCity', court(e.ville, 50))}${b('shipperCivility', 'M')}${b('shipperContactName', court(e.contact || e.nom, 100))}${b('shipperCountry', 'FR')}${b('shipperCountryName', 'FRANCE')}${b('shipperEmail', court(e.email, 80))}${b('shipperMobilePhone', tel(e.telephone))}${b('shipperName', court(e.nom, 100))}${b('shipperName2', '')}${b('shipperPhone', tel(e.telephone))}${b('shipperPreAlert', '0')}${b('shipperZipCode', court(e.codePostal, 9))}${b('shipperType', '1')}</shipperValue>
<customerValue>${b('customerAdress1', court(e.adresse, 38))}${b('customerAdress2', court(e.adresse2, 38))}${b('customerCity', court(e.ville, 50))}${b('customerCivility', 'M')}${b('customerContactName', court(e.contact || e.nom, 100))}${b('customerCountry', 'FR')}${b('customerCountryName', 'FRANCE')}${b('customerEmail', court(e.email, 80))}${b('customerMobilePhone', tel(e.telephone))}${b('customerName', court(e.nom, 100))}${b('customerName2', '')}${b('customerPhone', tel(e.telephone))}${b('customerPreAlert', '0')}${b('customerZipCode', court(e.codePostal, 9))}${b('printAsSender', 'N')}</customerValue>
<recipientValue>${b('recipientAdress1', court(r.adresse, 38))}${b('recipientAdress2', court(r.adresse2, 38))}${b('recipientCity', court(r.ville, 50))}${b('recipientContactName', court(r.contact || r.nom, 100))}${b('recipientCountry', 'FR')}${b('recipientCountryName', 'FRANCE')}${b('recipientEmail', court(r.email, 80))}${b('recipientMobilePhone', tel(r.telephone))}${b('recipientName', court(r.nom, 100))}${b('recipientName2', '')}${b('recipientPhone', tel(r.telephone))}${b('recipientPreAlert', '22')}${b('recipientZipCode', court(r.codePostal, 9))}${b('recipientType', '2')}</recipientValue>
<refValue>${b('recipientRef', court(d.reference, 35))}${b('shipperRef', court(d.reference, 35))}</refValue>
<skybillValue>${b('bulkNumber', '1')}${b('codCurrency', 'EUR')}${b('codValue', '0')}${b('content1', court(d.contenu, 45))}${b('customsCurrency', 'EUR')}${b('customsValue', '0')}${b('evtCode', 'DC')}${b('insuredCurrency', 'EUR')}${b('insuredValue', '0')}${b('objectType', 'MAR')}${b('productCode', d.produit)}${b('service', '0')}${b('shipDate', d.dateEnvoi + 'T10:00:00')}${b('shipHour', '10')}${b('skybillRank', '1')}${b('weight', d.poidsKg.toFixed(2))}${b('weightUnit', 'KGM')}</skybillValue>
<skybillParamsValue>${b('mode', 'PDF')}</skybillParamsValue>
${b('password', d.identifiants.motDePasse)}${b('modeRetour', '2')}${b('numberOfParcel', '1')}${b('version', '2.0')}${b('multiParcel', 'N')}
${d.dlc ? `<scheduledValue>${b('expirationDate', d.dlc + 'T12:00:00')}${b('sellByDate', d.dlc + 'T12:00:00')}</scheduledValue>` : ''}
</cxf:shippingMultiParcelV4>`;

  let xml: string;
  try {
    xml = await soap(URL_EXPEDITION, 'http://cxf.shipping.soap.chronopost.fr/', corps);
  } catch (err) {
    return { ok: false, code: 'RESEAU', message: 'Chronopost ne répond pas, réessayez dans quelques minutes' };
  }
  const faute = erreurSoap(xml);
  if (faute) return { ok: false, code: 'SOAP', message: faute };
  const code = lire(xml, 'errorCode') || '';
  if (code !== '0') return { ok: false, code, message: lire(xml, 'errorMessage') || 'erreur ' + code };
  const numero = lire(xml, 'skybillNumber');
  const pdf = lire(xml, 'pdfEtiquette');
  if (!numero || !pdf) return { ok: false, code: 'VIDE', message: 'Réponse Chronopost incomplète' };
  return { ok: true, numero, pdfBase64: pdf, service: lire(xml, 'signaletiqueProduit') || '' };
}

// ── ANNULATION D'UNE ÉTIQUETTE ──────────────────────────────
export async function annulerEtiquette(ids: Identifiants, numero: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const xml = await soap(URL_SUIVI, 'http://cxf.tracking.soap.chronopost.fr/',
      `<cxf:cancelSkybill>${b('accountNumber', ids.compte)}${b('password', ids.motDePasse)}${b('language', 'fr_FR')}${b('skybillNumber', numero)}</cxf:cancelSkybill>`);
    const code = lire(xml, 'errorCode');
    return { ok: code === '0', message: lire(xml, 'errorMessage') || erreurSoap(xml) || undefined };
  } catch (_) {
    return { ok: false, message: 'Chronopost ne répond pas' };
  }
}

// ── SERVICES DU CONTRAT ─────────────────────────────────────
// Sert de « test de connexion » : identifiants refusés → erreur ; sinon la
// liste des codes produits ouverts sur le contrat (2R = Chronofresh).
export async function produitsDuContrat(ids: Identifiants, codePostalDepart: string): Promise<
  { ok: true; codes: string[] } | { ok: false; message: string }
> {
  const demain = new Date(Date.now() + 86400_000);
  const date = `${String(demain.getUTCDate()).padStart(2, '0')}/${String(demain.getUTCMonth() + 1).padStart(2, '0')}/${demain.getUTCFullYear()}`;
  let xml: string;
  try {
    xml = await soap(URL_TARIFS, 'http://cxf.quickcost.soap.chronopost.fr/',
      `<cxf:calculateProducts>${b('accountNumber', ids.compte)}${b('password', ids.motDePasse)}${b('depCountryCode', 'FR')}${b('depZipCode', codePostalDepart)}${b('arrCountryCode', 'FR')}${b('arrZipCode', '75001')}${b('arrCity', 'Paris')}${b('type', 'M')}${b('weight', '2')}${b('shippingDate', date)}</cxf:calculateProducts>`);
  } catch (_) {
    return { ok: false, message: 'Chronopost ne répond pas, réessayez dans quelques minutes' };
  }
  const faute = erreurSoap(xml);
  if (faute) return { ok: false, message: faute };
  const code = lire(xml, 'errorCode') || '';
  if (code !== '0') return { ok: false, message: lire(xml, 'errorMessage') || 'Identifiants refusés (erreur ' + code + ')' };
  const codes = [...xml.matchAll(/<productCode>([^<]+)<\/productCode>/g)].map((m) => m[1]);
  if (codes.length === 0) return { ok: false, message: 'Aucun service ouvert sur ce compte : vérifiez le numéro de compte et le mot de passe' };
  return { ok: true, codes };
}

// ── SUIVI ───────────────────────────────────────────────────
export interface EvenementSuivi { code: string; date: string | null; libelle: string; lieu: string }

export async function suivreColis(numero: string): Promise<
  { ok: true; evenements: EvenementSuivi[]; dernier: EvenementSuivi | null; livre: boolean } | { ok: false; message: string }
> {
  let xml: string;
  try {
    xml = await soap(URL_SUIVI, 'http://cxf.tracking.soap.chronopost.fr/',
      `<cxf:trackSkybillV2>${b('language', 'fr_FR')}${b('skybillNumber', numero)}</cxf:trackSkybillV2>`);
  } catch (_) {
    return { ok: false, message: 'Chronopost ne répond pas' };
  }
  const code = lire(xml, 'errorCode') || '';
  if (code !== '0') return { ok: false, message: lire(xml, 'errorMessage') || erreurSoap(xml) || 'erreur ' + code };
  const evenements: EvenementSuivi[] = [...xml.matchAll(/<events>([\s\S]*?)<\/events>/g)].map((m) => ({
    code: lire(m[1], 'code') || '',
    date: lire(m[1], 'eventDate'),
    libelle: lire(m[1], 'eventLabel') || '',
    lieu: lire(m[1], 'officeLabel') || '',
  }));
  evenements.sort((a, c) => String(a.date || '').localeCompare(String(c.date || '')));
  const dernier = evenements.length ? evenements[evenements.length - 1] : null;
  // « D » = livraison effectuée ; D1, D2… = variantes (voisin, gardien, relais)
  const livre = evenements.some((ev) => /^D\d?$/.test(ev.code) || /livraison effectu|colis livr/i.test(ev.libelle));
  return { ok: true, evenements, dernier, livre };
}
