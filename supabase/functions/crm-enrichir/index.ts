// Edge Function — crm-enrichir v1
// Remplit les signaux de « chaleur » des prospects du CRM admin (crm_prospects.signaux) :
//   (a) télécharge la page d'accueil du site du commerce et au plus deux pages internes, et en tire des signaux
//       (commande en ligne, traiteur, plusieurs boutiques…) : voir analyse.js ;
//   (b) si le secret GOOGLE_PLACES_API_KEY existe, interroge Google Places API (New) « Text Search » : lien de la
//       fiche, note, nombre d'avis, statut, site web s'il manquait ; sans clé, cette partie est sautée et la
//       réponse le dit (google: 'sans_cle') ;
//   (c) n'aspire JAMAIS Instagram ni Facebook : seuls les liens trouvés sur le site sont rangés.
//
// Réservée à l'admin : JWT utilisateur obligatoire + ligne roles_utilisateurs (role = 'admin'), comme la RLS de
// crm_prospects. La clé anon (un JWT valide, publiée dans le front) ne suffit donc pas.
//
// POST { ids: uuid[] (1 à 10), forcer?: boolean }
// → 200 { ok, google: 'actif' | 'sans_cle', duree_ms, resultats: [{ id, etat: 'ok' | 'introuvable' | 'reporte' | 'erreur',
//         site, google ('trouve' | 'introuvable' | 'saute' | 'sans_cle' | 'quota' | 'erreur'), prospect }] }
// → 400 requete · 401 auth · 403 droits · 405 methode · 409 migration · 500 interne   ({ error, code })
//
// L'adresse téléchargée vient TOUJOURS de la base (crm_prospects.site_web ou fiche Google), jamais de la requête.
//
// Garde-fous des téléchargements (securite.js, appliqués avant chaque requête et à chaque saut de redirection) :
// http/https seulement, ports 80/443, aucune IP littérale, suffixes internes refusés, hôtes Supabase / Facebook /
// Instagram refusés, toutes les adresses résolues doivent être publiques, 5 redirections au plus, 8 s par requête,
// 20 s par prospect et 45 s par lot tout compris (DNS, Google, pages), 1,5 Mo par page, type text/html seulement,
// 3 pages par site.
//
// « DNS rebinding » : la connexion est ouverte VERS L'ADRESSE IP VÉRIFIÉE (Deno.connect, puis TLS avec le nom
// d'hôte pour le certificat ; http1.js), jamais par une seconde résolution du nom. Si l'environnement d'exécution
// interdit les connexions TCP directes, et seulement dans ce cas, la fonction se replie sur fetch : le risque
// résiduel (un DNS qui change de réponse entre la vérification et la connexion) est alors borné par le reste des
// parades : GET seul, rien de la page n'est renvoyé au navigateur (les signaux sont des identifiants de listes
// fermées), aucune information d'authentification n'est envoyée, quatre valeurs extraites par validateurs stricts.
//
// Google : les conditions d'utilisation de Places limitent la conservation des données de lieu (hors place_id).
// Les valeurs stockées (note, nombre d'avis, statut) sont datées (signaux.google.le) et rafraîchies par
// « Réanalyser ». À faire valider par le fondateur avant d'activer la clé. Masque de champs minimal, un appel par
// prospect, pas de « Place Details ». Plafond quotidien CRM_GOOGLE_MAX_JOUR (300 par défaut, 0 = Google coupé) :
// chaque appel est réservé dans un compteur atomique en base AVANT d'être fait (crm_google_reserver) ; un compteur
// injoignable vaut « plafond atteint ». Un prospect dont la fiche Google n'a pas pu être cherchée (clé absente,
// plafond, panne) garde signaux.google.etat = 'sans_cle' | 'quota' | 'erreur' : le CRM le repropose.
//
// Écriture : crm_enrichir_ecrire ne remplit e-mail, téléphone, liens, site et position que si la colonne est encore
// vide au moment de l'écriture ; une valeur saisie par l'utilisateur pendant l'analyse n'est jamais écrasée.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { enrichirLot, validerEntree, plafondGoogle, COLONNES_RETOUR, LIMITES } from './enrichir.js'
import { typeHtml } from './securite.js'
import { requeteGet, lireReponse, decompresser, ordreConnexion } from './http1.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DELAI_REQUETE = LIMITES.delaiRequete
const TAILLE_MAX = 1572864
const AGENT = 'MarcheoEnrichissement/1.0 (+https://www.xn--marcho-fva.fr)'
const COLONNES_LECTURE = 'id,nom,metier,business_type,adresse,commune,code_postal,departement,telephone,email,site_web,google_url,instagram,facebook,' +
  'signaux,analyse_at,google_note,google_avis,lat,lon'

function json(statut: number, corps: unknown) {
  return new Response(JSON.stringify(corps), { status: statut, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
function refus(statut: number, code: string, message: string) {
  return json(statut, { error: message, code })
}

function avecMotif(motif: string): Error {
  const e = new Error(motif) as Error & { motif: string }
  e.motif = motif
  return e
}

// ── Résolution DNS : A et AAAA. Deno.resolveDns d'abord ; s'il n'est pas disponible ou s'il échoue pour l'un des
//    deux types (panne, délai), DNS-sur-HTTPS pour les deux : jamais une réponse à moitié connue.
//    Rien de résolu → tableau vide → l'appelant refuse (fermé par défaut).
async function resoudreNatif(hote: string): Promise<string[] | null> {
  // deno-lint-ignore no-explicit-any
  const resolveDns = (Deno as any).resolveDns
  if (typeof resolveDns !== 'function') return null
  const ips: string[] = []
  for (const type of ['A', 'AAAA']) {
    try {
      const reponses = await resolveDns(hote, type)
      for (const ip of reponses) ips.push(String(ip))
    } catch (e) {
      // « Pas d'enregistrement de ce type » est une réponse ; toute autre erreur rend la résolution inutilisable ici.
      const nom = (e as Error)?.name || ''
      if (!(nom === 'NotFound' || /no record|not found|NXDOMAIN/i.test((e as Error)?.message || ''))) return null
    }
  }
  return ips
}

async function resoudreParHttps(hote: string, delai: number): Promise<string[]> {
  const ips: string[] = []
  for (const type of ['A', 'AAAA']) {
    const controleur = new AbortController()
    const minuterie = setTimeout(() => controleur.abort(), Math.max(1, Math.min(4000, delai)))
    try {
      const r = await fetch('https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(hote) + '&type=' + type, {
        headers: { accept: 'application/dns-json' }, signal: controleur.signal,
      })
      if (!r.ok) return []
      const d = await r.json()
      // Type 1 = A, type 28 = AAAA (les CNAME intermédiaires sont ignorés : seule l'adresse finale compte).
      for (const rep of (d?.Answer || [])) if (rep && (rep.type === 1 || rep.type === 28) && typeof rep.data === 'string') ips.push(rep.data)
    } catch (_e) {
      // Serveur DNS injoignable pour un type : on ne rend pas une réponse partielle.
      return []
    } finally {
      clearTimeout(minuterie)
    }
  }
  return ips
}

// Une promesse qui n'aboutit pas dans le délai est abandonnée (son résultat tardif est ignoré).
function avecDelai<T>(promesse: Promise<T>, delai: number, motif: string): Promise<T> {
  let minuterie: number | undefined
  const limite = new Promise<T>((_r, rejeter) => { minuterie = setTimeout(() => rejeter(avecMotif(motif)), Math.max(1, delai)) })
  return Promise.race([promesse, limite]).finally(() => clearTimeout(minuterie))
}

async function resoudre(hote: string, options?: { delai?: number }): Promise<string[]> {
  const delai = Math.max(1, Math.min(LIMITES.delaiDns, options?.delai ?? LIMITES.delaiDns))
  return await avecDelai((async () => {
    const natif = await resoudreNatif(hote)
    if (natif !== null) return natif
    return await resoudreParHttps(hote, delai)
  })(), delai, 'dns')
}

function jeuDeCaracteres(type: string, debut: Uint8Array): string {
  const entete = /charset\s*=\s*["']?([a-z0-9_\-]+)/i.exec(type || '')
  if (entete) return entete[1]
  const tete = new TextDecoder('latin1').decode(debut.subarray(0, 2048))
  const meta = /<meta[^>]{0,200}charset\s*=\s*["']?([a-z0-9_\-]+)/i.exec(tete)
  return meta ? meta[1] : 'utf-8'
}

function decoder(type: string, octets: Uint8Array): string {
  try {
    return new TextDecoder(jeuDeCaracteres(type, octets), { fatal: false }).decode(octets)
  } catch (_e) {
    return new TextDecoder('utf-8', { fatal: false }).decode(octets)
  }
}

const ENTETES_SITE = { 'User-Agent': AGENT, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'fr' }

function motifReseau(e: unknown): string {
  const message = String((e as Error)?.message || e)
  if (/certificate|tls|ssl|handshake/i.test(message)) return 'tls'
  return 'connexion'
}

// L'environnement refuse-t-il les connexions TCP directes ? (Alors seulement, repli sur fetch.)
function tcpInterdit(e: unknown): boolean {
  const nom = (e as Error)?.name || ''
  return nom === 'PermissionDenied' || nom === 'NotSupported' || nom === 'NotCapable' ||
    /requires net access|not supported|not implemented|operation not permitted/i.test(String((e as Error)?.message || ''))
}
let tcpIndisponible = false

// ── UN saut HTTP vers UNE adresse IP déjà vérifiée, sans suivre les redirections. Le nom d'hôte ne sert qu'à
//    l'en-tête Host et au certificat. Aucun cookie, aucun jeton, aucun en-tête de l'appelant.
async function sautEpingle(url: URL, ip: string, delai: number) {
  const tls = url.protocol === 'https:'
  const port = url.port ? parseInt(url.port, 10) : (tls ? 443 : 80)
  // deno-lint-ignore no-explicit-any
  let conn: any = null
  let expire = false
  const minuterie = setTimeout(() => { expire = true; try { conn?.close() } catch (_e) { /* déjà fermée */ } }, Math.max(1, delai))
  try {
    try {
      // deno-lint-ignore no-explicit-any
      conn = await (Deno as any).connect({ hostname: ip, port, transport: 'tcp' })
      if (expire) { try { conn.close() } catch (_e) { /* déjà fermée */ } throw avecMotif('delai') }
      // deno-lint-ignore no-explicit-any
      if (tls) conn = await (Deno as any).startTls(conn, { hostname: url.hostname, alpnProtocols: ['http/1.1'] })
    } catch (e) {
      if ((e as { motif?: string })?.motif) throw e
      if (expire) throw avecMotif('delai')
      if (tcpInterdit(e)) { const interdit = avecMotif('connexion') as Error & { tcpInterdit?: boolean }; interdit.tcpInterdit = true; throw interdit }
      throw avecMotif(motifReseau(e))
    }
    const connexion = {
      lire: async () => {
        const tampon = new Uint8Array(16384)
        const n = await conn.read(tampon)
        return n === null ? null : tampon.subarray(0, n)
      },
      ecrire: async (octets: Uint8Array) => {
        let ecrit = 0
        while (ecrit < octets.length) ecrit += await conn.write(octets.subarray(ecrit))
      },
    }
    let reponse
    try {
      await connexion.ecrire(requeteGet(url, ENTETES_SITE))
      // Le corps n'est lu que pour une page HTML reçue normalement.
      reponse = await lireReponse(connexion, {
        max: TAILLE_MAX,
        sansCorps: (statut: number, entetes: Record<string, string>) => statut !== 200 || !typeHtml(entetes['content-type'] || ''),
      })
    } catch (e) {
      if (expire) throw avecMotif('delai')
      throw avecMotif((e as { motif?: string })?.motif === 'connexion' ? 'connexion' : motifReseau(e))
    }
    const type = reponse.entetes['content-type'] || ''
    if (reponse.statut >= 300 && reponse.statut < 400) return { statut: reponse.statut, location: reponse.entetes['location'] || '', type, html: '', tronque: false }
    if (reponse.statut !== 200 || !typeHtml(type)) return { statut: reponse.statut, location: '', type, html: '', tronque: false }
    const clair = await decompresser(reponse.corps, reponse.entetes['content-encoding'] || '', TAILLE_MAX)
    return { statut: 200, location: '', type, html: decoder(type, clair.corps), tronque: reponse.tronque || clair.tronque }
  } finally {
    clearTimeout(minuterie)
    try { conn?.close() } catch (_e) { /* déjà fermée */ }
  }
}

// ── Repli : fetch (qui résout le nom lui-même). Utilisé seulement quand l'environnement interdit Deno.connect.
async function sautParFetch(url: string, delai: number) {
  const controleur = new AbortController()
  const minuterie = setTimeout(() => controleur.abort(), Math.max(1, delai))
  try {
    let r: Response
    try {
      r = await fetch(url, { method: 'GET', redirect: 'manual', signal: controleur.signal, credentials: 'omit', headers: ENTETES_SITE })
    } catch (e) {
      const message = String((e as Error)?.message || e)
      if (controleur.signal.aborted) throw avecMotif('delai')
      if (/dns|resolve|lookup|name or service/i.test(message)) throw avecMotif('dns')
      throw avecMotif(motifReseau(e))
    }
    const type = r.headers.get('content-type') || ''
    if (r.status >= 300 && r.status < 400) {
      await r.body?.cancel().catch(() => {})
      return { statut: r.status, location: r.headers.get('location') || '', type, html: '', tronque: false }
    }
    if (r.status !== 200 || !typeHtml(type) || !r.body) {
      await r.body?.cancel().catch(() => {})
      return { statut: r.status, location: '', type, html: '', tronque: false }
    }
    const lecteur = r.body.getReader()
    const morceaux: Uint8Array[] = []
    let total = 0, tronque = false
    try {
      while (true) {
        const { done, value } = await lecteur.read()
        if (done) break
        if (!value) continue
        if (total + value.length >= TAILLE_MAX) {
          morceaux.push(value.subarray(0, TAILLE_MAX - total))
          total = TAILLE_MAX
          tronque = true
          await lecteur.cancel().catch(() => {})
          break
        }
        morceaux.push(value)
        total += value.length
      }
    } catch (_e) {
      // Délai dépassé ou connexion coupée pendant la lecture : sans rien de lu c'est un échec, sinon on analyse ce qu'on a.
      if (!total) throw avecMotif(controleur.signal.aborted ? 'delai' : 'connexion')
      tronque = true
    }
    const octets = new Uint8Array(total)
    let position = 0
    for (const m of morceaux) { octets.set(m, position); position += m.length }
    return { statut: 200, location: '', type, html: decoder(type, octets), tronque }
  } finally {
    clearTimeout(minuterie)
  }
}

// ── UN saut HTTP. L'adresse et ses IP ont déjà été vérifiées par enrichir.js (recupererPage), qui passe les IP
//    publiques auxquelles se connecter et le temps qui reste.
async function telecharger(adresse: string, options?: { ips?: string[]; delai?: number }) {
  const debut = Date.now()
  const delai = Math.max(1, Math.min(DELAI_REQUETE, options?.delai ?? DELAI_REQUETE))
  const url = new URL(adresse)
  // deno-lint-ignore no-explicit-any
  const tcp = !tcpIndisponible && typeof (Deno as any).connect === 'function' && typeof (Deno as any).startTls === 'function'
  const ips = ordreConnexion(options?.ips || [])
  if (tcp) {
    // Sans adresse vérifiée, rien n'est tenté : jamais de connexion par le seul nom.
    if (!ips.length) throw avecMotif('dns')
    let derniere: unknown = null
    for (const ip of ips) {
      const reste = delai - (Date.now() - debut)
      if (reste <= 0) throw avecMotif('delai')
      try {
        return await sautEpingle(url, ip, reste)
      } catch (e) {
        derniere = e
        if ((e as { tcpInterdit?: boolean })?.tcpInterdit) { tcpIndisponible = true; break }
        // Seul un refus de connexion fait essayer l'adresse suivante ; un délai, un certificat refusé sont définitifs.
        if ((e as { motif?: string })?.motif !== 'connexion') throw e
      }
    }
    if (!tcpIndisponible) throw derniere
    console.warn('crm-enrichir : connexions TCP directes refusées par l\'environnement, repli sur fetch')
  }
  return await sautParFetch(adresse, Math.max(1, delai - (Date.now() - debut)))
}

function creerRechercheGoogle(cle: string) {
  return async (corps: unknown, masque: string, options?: { delai?: number }) => {
    const controleur = new AbortController()
    const minuterie = setTimeout(() => controleur.abort(), Math.max(1, Math.min(DELAI_REQUETE, options?.delai ?? DELAI_REQUETE)))
    try {
      const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST', signal: controleur.signal,
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': cle, 'X-Goog-FieldMask': masque },
        body: JSON.stringify(corps),
      })
      if (!r.ok) throw new Error('Google Places : HTTP ' + r.status)
      return await r.json()
    } finally {
      clearTimeout(minuterie)
    }
  }
}

function estColonneAbsente(erreur: { code?: string; message?: string } | null) {
  return !!erreur && (erreur.code === '42703' || erreur.code === 'PGRST204' || /column .* does not exist|schema cache/i.test(erreur.message || ''))
}
// Fonction SQL de la migration absente (crm_enrichir_ecrire, crm_google_reserver) : migration pas (ou plus) à jour.
function estFonctionAbsente(erreur: { code?: string; message?: string } | null) {
  return !!erreur && (erreur.code === 'PGRST202' || erreur.code === '42883' || /could not find the function|function .* does not exist/i.test(erreur.message || ''))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return refus(405, 'methode', 'Méthode non autorisée')

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // ── AUTH : JWT utilisateur obligatoire, puis rôle admin (même règle que la RLS de crm_prospects) ──
    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!jwt) return refus(401, 'auth', 'Authentification requise')
    const { data: authData, error: authErr } = await supabase.auth.getUser(jwt)
    const user = authErr ? null : authData?.user
    if (!user) return refus(401, 'auth', 'Session invalide ou expirée')
    const { data: admin } = await supabase
      .from('roles_utilisateurs').select('user_id')
      .eq('user_id', user.id).eq('role', 'admin').maybeSingle()
    if (!admin) return refus(403, 'droits', 'Accès réservé à l\'administrateur')

    let corps: unknown = null
    try { corps = await req.json() } catch (_e) { corps = null }
    const entree = validerEntree(corps)
    if (!entree.ok) return refus(400, 'requete', 'Requête invalide : ids attendus (1 à ' + LIMITES.prospects + ' identifiants de prospects)')

    const { data: lignes, error: erreurLecture } = await supabase.from('crm_prospects').select(COLONNES_LECTURE).in('id', entree.ids)
    if (erreurLecture) {
      if (estColonneAbsente(erreurLecture)) return refus(409, 'migration', 'La migration 20261116_crm_chaleur.sql n\'est pas appliquée')
      throw erreurLecture
    }

    // ── Google : clé facultative. Plafond du jour : 0 coupe Google, une valeur illisible aussi (voir plafondGoogle).
    const cleGoogle = (Deno.env.get('GOOGLE_PLACES_API_KEY') || '').trim()
    const plafond = plafondGoogle(Deno.env.get('CRM_GOOGLE_MAX_JOUR'))
    let migrationIncomplete = false

    let hoteSupabase = ''
    try { hoteSupabase = new URL(supabaseUrl).hostname } catch (_e) { hoteSupabase = '' }

    const deps = {
      telecharger,
      resoudre,
      chercherGoogle: cleGoogle ? creerRechercheGoogle(cleGoogle) : null,
      // Un appel Google = une réservation atomique dans le compteur du jour (UTC), faite AVANT l'appel : réanalyses
      // forcées, écritures en échec et requêtes simultanées sont toutes comptées. Compteur en erreur → pas d'appel.
      reserverGoogle: async () => {
        if (!(plafond > 0)) return false
        const { data, error } = await supabase.rpc('crm_google_reserver', { p_plafond: plafond })
        if (error) {
          if (estFonctionAbsente(error)) migrationIncomplete = true
          console.error('crm-enrichir : compteur Google indisponible, appel refusé', error)
          return false
        }
        return data === true
      },
      maintenant: () => new Date(),
      telephonePris: async (tel: string, id: string) => {
        const { data } = await supabase.from('crm_prospects').select('id').eq('telephone', tel).neq('id', id).limit(1)
        return !!(data && data.length)
      },
      // Une seule écriture par prospect, limitée aux colonnes d'enrichissement : note, résultat, liste… ne sont jamais
      // touchés. Les colonnes de `siVides` ne sont écrites que si elles sont encore vides EN BASE à cet instant.
      ecrire: async (id: string, champs: Record<string, unknown>, condition?: { siVides?: string[]; siteLu?: string }) => {
        const toujours: Record<string, unknown> = {}, siVides: Record<string, unknown> = {}
        for (const [colonne, valeur] of Object.entries(champs)) {
          if ((condition?.siVides || []).includes(colonne)) siVides[colonne] = valeur
          else toujours[colonne] = valeur
        }
        const { data, error } = await supabase
          .rpc('crm_enrichir_ecrire', { p_id: id, p_toujours: toujours, p_si_vides: siVides, p_site_lu: condition?.siteLu ?? null })
          .select(COLONNES_RETOUR.join(',')).maybeSingle()
        if (error) {
          if (estFonctionAbsente(error)) migrationIncomplete = true
          throw error
        }
        return data || {}
      },
      journal: (e: unknown) => console.error('crm-enrichir : prospect en échec', e),
    }
    const reponse = await enrichirLot(entree.ids, lignes || [], deps, {
      forcer: entree.forcer, hotesRefuses: hoteSupabase ? [hoteSupabase] : [],
    })
    if (migrationIncomplete) return refus(409, 'migration', 'La migration 20261116_crm_chaleur.sql n\'est pas appliquée en entier')
    return json(200, reponse)
  } catch (e) {
    console.error('crm-enrichir : erreur interne', e)
    return refus(500, 'interne', 'Erreur interne')
  }
})
