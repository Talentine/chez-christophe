#!/usr/bin/env python3
"""Générateur des pages SEO de marchéo.fr : articles de blog, pages métier, page À propos, llms.txt, liste sitemap.

Sources (à éditer, jamais les HTML générés) :
  seo/articles/*.md      articles de blog (front matter YAML minimal + Markdown)
  seo/pages/*.md         pages éditoriales (À propos…)
  seo/metiers.json       pages métier « Développer son commerce grâce à internet » (une par métier)

Sorties :
  blog/<slug>.html, solutions/<metier>.html, solutions/index.html, a-propos.html, blog.html (liste),
  llms.txt, llms-full.txt, seo/urls.js (consommé par api/sitemap.js)

Usage : python seo/build.py
"""
import json
import re
from datetime import date
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parent.parent
SEO = ROOT / "seo"
HOST = "https://marchéo.fr"
BRAND = "Marchéo"
LOGO = f"{HOST}/assets/brand/logo.svg"
OG_IMAGE = f"{HOST}/assets/brand/logo-marcheo.png"
CONTACT = "marcheo.contact@gmail.com"
FONDATEUR = "Paul Merieult"

MD = markdown.Markdown(extensions=["tables", "sane_lists", "smarty"], output_format="html5")


# ─────────────────────────────────────────────────────────────
# Front matter minimal (clé: valeur, listes YAML simples, blocs faq)
# ─────────────────────────────────────────────────────────────
def parse_front_matter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    _, fm, body = text.split("---", 2)
    meta: dict = {}
    key = None
    for line in fm.splitlines():
        if not line.strip():
            continue
        if re.match(r"^\s+-\s", line) and key:
            meta.setdefault(key, [])
            item = line.strip()[2:].strip()
            if item.startswith("q:"):
                meta[key].append({"q": item[2:].strip().strip('"')})
            elif item.startswith("r:") and meta[key]:
                meta[key][-1]["r"] = item[2:].strip().strip('"')
            else:
                meta[key].append(item.strip('"'))
        elif re.match(r"^\s+(q|r):", line) and key and meta.get(key):
            k, v = line.strip().split(":", 1)
            meta[key][-1][k] = v.strip().strip('"')
        else:
            key, _, val = line.partition(":")
            key = key.strip()
            val = val.strip()
            meta[key] = val.strip('"') if val else []
    return meta, body.strip()


def md_to_html(text: str) -> str:
    MD.reset()
    return MD.convert(text)


def reading_time(text: str) -> int:
    return max(2, round(len(re.sub(r"<[^>]+>", " ", text).split()) / 200))


def esc(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def jsonld(obj: dict) -> str:
    return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False, indent=1) + "</script>"


# ─────────────────────────────────────────────────────────────
# Gabarit de page
# ─────────────────────────────────────────────────────────────
CSS = """
:root{--bleu:#0F2C52;--bleu-fonce:#0A1428;--vert:#5BBE3A;--vert-fonce:#46A02A;--soleil:#F4B942;--creme:#F7F2E8;--creme-fonce:#E5E2D8;--gris:#5B6472;--blanc:#fff}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font-family:Manrope,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--bleu-fonce);background:var(--blanc);line-height:1.65;font-size:17px;-webkit-font-smoothing:antialiased}
a{color:var(--bleu);text-decoration-thickness:1px;text-underline-offset:3px}
.header{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.94);backdrop-filter:blur(10px);border-bottom:1px solid var(--creme-fonce)}
.header-in{max-width:1080px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:20px;color:var(--bleu);text-decoration:none;letter-spacing:-.01em}.logo img{height:34px;width:auto}
.logo span{color:var(--vert)}
.nav{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.nav a{text-decoration:none;color:var(--bleu);font-weight:600;font-size:14px;padding:8px 12px;border-radius:50px}
.nav a:hover{background:var(--creme)}.nav a.cta{background:var(--vert);color:#fff;padding:9px 16px}.nav a.cta:hover{background:var(--vert-fonce)}.nav a.offres{border:2px solid var(--bleu);padding:7px 14px;font-weight:700;white-space:nowrap}.nav a.offres:hover{background:var(--bleu);color:#fff}
.hide-m{display:inline}@media(max-width:640px){.hide-m{display:none}.nav{flex-wrap:nowrap;gap:5px}.nav a{padding:8px 9px;font-size:12.5px;white-space:nowrap}.nav a.offres{padding:6px 9px}.nav a.cta{padding:8px 10px}.header-in{padding:10px 10px;gap:6px}.logo{font-size:16px;gap:6px}.logo img{height:30px}}@media(max-width:400px){.logo span{display:none}}
main{max-width:1080px;margin:0 auto;padding:28px 20px 60px}
.crumbs{font-size:13px;color:var(--gris);margin:0 0 18px}.crumbs a{color:var(--gris);text-decoration:none}.crumbs a:hover{text-decoration:underline}
.eyebrow{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--vert-fonce);margin:0 0 10px}
h1{font-family:"Playfair Display",Georgia,serif;font-size:clamp(30px,4.6vw,44px);line-height:1.12;margin:0 0 14px;letter-spacing:-.01em;text-wrap:balance;color:var(--bleu)}
.sous-titre{font-family:"Playfair Display",Georgia,serif;font-size:22px;font-weight:600;color:var(--bleu);margin:-4px 0 12px;max-width:760px;line-height:1.3}
.lead{font-size:20px;color:#2b3a52;margin:0 0 10px;max-width:760px}
.meta{font-size:13px;color:var(--gris);margin:0 0 28px}
.grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:44px;align-items:start}@media(max-width:900px){.grid{grid-template-columns:1fr}}
article{max-width:720px}
article h2{font-family:"Playfair Display",Georgia,serif;font-size:28px;line-height:1.2;margin:40px 0 12px;color:var(--bleu);text-wrap:balance}
article h3{font-size:19px;margin:28px 0 8px;color:var(--bleu)}
article p{margin:0 0 16px}article ul,article ol{padding-left:22px;margin:0 0 16px}article li{margin:0 0 6px}
article strong{color:var(--bleu)}
article table{border-collapse:collapse;width:100%;margin:8px 0 22px;font-size:15px;display:block;overflow-x:auto}
article th,article td{border:1px solid var(--creme-fonce);padding:9px 12px;text-align:left;vertical-align:top}article th{background:var(--creme);font-weight:700}
article blockquote{margin:0 0 18px;padding:14px 18px;border-left:4px solid var(--soleil);background:var(--creme);border-radius:0 10px 10px 0}
.encart{background:var(--creme);border-radius:14px;padding:18px 20px;margin:24px 0}.encart h3{margin:0 0 8px}
.faq details{border-top:1px solid var(--creme-fonce);padding:12px 0}.faq details:last-child{border-bottom:1px solid var(--creme-fonce)}
.faq summary{cursor:pointer;font-weight:700;color:var(--bleu);list-style:none;display:flex;justify-content:space-between;gap:12px}
.faq summary::after{content:"+";color:var(--vert);font-weight:800}.faq details[open] summary::after{content:"–"}
.faq p{margin:10px 0 0}
aside{position:sticky;top:76px}
.card{background:var(--bleu);color:#fff;border-radius:16px;padding:22px;margin:0 0 16px}.card h3{margin:0 0 6px;font-size:18px;color:#fff}.card p{margin:0 0 14px;font-size:14px;color:rgba(255,255,255,.82)}
.btn{display:inline-block;background:var(--vert);color:#fff;font-weight:800;text-decoration:none;padding:12px 18px;border-radius:50px;font-size:15px}.btn:hover{background:var(--vert-fonce)}
.btn.soleil{background:var(--soleil);color:var(--bleu)}
.lien-liste{background:var(--creme);border-radius:16px;padding:18px 20px}.lien-liste h3{margin:0 0 10px;font-size:15px;text-transform:uppercase;letter-spacing:.06em;color:var(--gris)}
.lien-liste a{display:block;padding:6px 0;font-size:15px;text-decoration:none;font-weight:600}.lien-liste a:hover{text-decoration:underline}
.cta-final{margin:48px 0 0;background:linear-gradient(135deg,var(--bleu),#1B3F6E);color:#fff;border-radius:20px;padding:34px 28px;text-align:center}
.cta-final h2{font-family:"Playfair Display",Georgia,serif;margin:0 0 8px;font-size:28px;color:#fff}.cta-final p{margin:0 0 18px;color:rgba(255,255,255,.85)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px;margin:26px 0}
.tuile{border:1px solid var(--creme-fonce);border-radius:14px;padding:18px;text-decoration:none;color:inherit;background:#fff;display:flex;flex-direction:column;gap:6px}
.tuile:hover{border-color:var(--vert);box-shadow:0 6px 18px rgba(15,44,82,.08)}.tuile .e{font-size:26px}.tuile h3{margin:0;font-size:17px;color:var(--bleu)}.tuile p{margin:0;font-size:14px;color:var(--gris)}
.tuile .d{font-size:12px;color:var(--gris)}
.gains{background:var(--creme);border:1px solid var(--creme-fonce);border-radius:18px;padding:22px 22px 20px;margin:6px 0 30px}
.gains h2{font-family:"Playfair Display",Georgia,serif;font-size:24px;line-height:1.2;margin:0 0 14px;color:var(--bleu)}
.gains ol{list-style:none;padding:0;margin:0 0 14px;display:grid;gap:12px}
.gains li{display:flex;gap:14px;align-items:flex-start;background:#fff;border-radius:14px;padding:14px 16px;margin:0}
.gains li:first-child{border:2px solid var(--vert)}
.gains .gi{font-size:24px;line-height:1.2;flex:none}
.gains li strong{display:block;font-size:17px;color:var(--bleu);margin:0 0 2px}
.gains li p{margin:0;font-size:15px;color:#2b3a52}
.gains-plus{font-size:14px;color:var(--gris);margin:0 0 14px}
@media(max-width:640px){.gains{padding:18px 14px;margin:4px -6px 26px}.gains h2{font-size:21px}.gains li{padding:12px;gap:10px}.gains .gi{font-size:20px}}
footer{border-top:1px solid var(--creme-fonce);padding:26px 20px 40px;font-size:13px;color:var(--gris);text-align:center}footer a{color:var(--gris)}
"""

HEAD_FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
              '<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">')


def header() -> str:
    return f"""<header class="header"><div class="header-in">
  <a href="/" class="logo" aria-label="{BRAND}, accueil"><img src="/assets/brand/logo-square.svg" alt="" width="34" height="34">{BRAND}<span>.fr</span></a>
  <nav class="nav" aria-label="Navigation">
    <a href="/solutions" class="hide-m">Par métier</a>
    <a href="/#tarifs" class="offres">Voir les offres</a>
    <a href="/faq" class="hide-m">FAQ</a>
    <a href="/inscription" class="cta">Créer ma boutique</a>
  </nav></div></header>"""


def footer() -> str:
    return f"""<footer>© {date.today().year} {BRAND} · <a href="/a-propos">À propos</a> · <a href="/blog">Blog</a> · <a href="/solutions">Métiers</a> · <a href="/faq">FAQ</a> · <a href="/cgv">CGV</a> · <a href="/confidentialite">Confidentialité</a> · <a href="/mentions-legales">Mentions légales</a> · <a href="mailto:{CONTACT}">{CONTACT}</a></footer>"""


def cta_final(titre: str = "Voyez votre boutique en 30 secondes", texte: str = "Choisissez votre métier, tapez le nom de votre commerce : l'aperçu de votre site s'affiche avec le catalogue déjà rempli. Gratuit, sans carte bancaire.", lien: str = "/inscription") -> str:
    return f"""<section class="cta-final"><h2>{esc(titre)}</h2><p>{esc(texte)}</p>
  <a class="btn soleil" href="{lien}">Créer ma démo gratuite</a></section>"""


def aside_block(liens: list[tuple[str, str]], titre_liens: str = "À lire aussi") -> str:
    liens_html = "".join(f'<a href="{esc(u)}">{esc(t)}</a>' for t, u in liens)
    return f"""<aside>
  <div class="card"><h3>Marchéo, c'est quoi ?</h3><p>La boutique en ligne de click & collect et de livraison locale des commerces de bouche. 0 % de commission, à partir de 19 € par mois, sans engagement.</p><a class="btn" href="/inscription">Créer ma démo gratuite</a></div>
  <div class="lien-liste"><h3>{esc(titre_liens)}</h3>{liens_html}</div>
</aside>"""


def faq_html(faq: list[dict]) -> str:
    if not faq:
        return ""
    items = "".join(f"<details><summary>{esc(f['q'])}</summary><p>{esc(f['r'])}</p></details>" for f in faq if f.get("q") and f.get("r"))
    return f'<h2 id="faq">Questions fréquentes</h2><div class="faq">{items}</div>'


def faq_ld(faq: list[dict]) -> dict | None:
    if not faq:
        return None
    return {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": f["q"], "acceptedAnswer": {"@type": "Answer", "text": f["r"]}} for f in faq if f.get("q") and f.get("r")]}



# ─────────────────────────────────────────────────────────────
# Bloc « Ce que ça vous rapporte » : affiché en tête de chaque article et page métier.
# Ordre imposé : 1. commandes et chiffre d'affaires  2. visibilité  3. temps gagné, puis le reste.
# ─────────────────────────────────────────────────────────────
GAINS = {
    None: (
        "Vos clients commandent à toute heure, même boutique fermée, et passent récupérer. L'empreinte bancaire sécurise chaque commande et vous ne payez aucune commission : chaque euro vendu reste dans votre caisse.",
        "Votre commerce a son propre site, trouvé sur Google avec votre nom et votre ville. Un lien à mettre sur Instagram, Facebook et votre fiche Google, et des SMS pour annoncer vos nouveautés à vos clients.",
        "Fini les commandes au téléphone pendant le rush : elles arrivent par écrit, avec le créneau de retrait. Vous préparez au calme, le client passe en deux minutes.",
    ),
    "primeur": (
        "Paniers de la semaine vendus d'avance, commandes passées le soir et le week-end : vous vendez même boutique fermée, et vous achetez en connaissant déjà une partie de la demande. Zéro commission.",
        "Les clients qui cherchent un primeur ou un panier de fruits et légumes près de chez eux tombent sur votre boutique. Vous partagez le lien sur Instagram et annoncez vos arrivages par SMS.",
        "Plus de commandes notées au téléphone pendant le rush du samedi : le client choisit lui-même produits et quantités, vous préparez au calme.",
    ),
    "boucherie": (
        "Colis, barbecue, rôti du dimanche, commandes des fêtes : vos clients réservent à toute heure, même boutique fermée, et l'empreinte bancaire vous protège des commandes non retirées. Zéro commission.",
        "Votre boucherie apparaît sur Google avec son catalogue, ses prix et ses créneaux. Un lien pour Instagram et votre fiche Google, des SMS pour annoncer la viande du moment.",
        "Les commandes arrivent par écrit, avec la découpe et le poids demandés : fini les appels pendant le coup de feu et les erreurs de quantité.",
    ),
    "boulangerie": (
        "Gâteaux, viennoiseries du dimanche, bûches et galettes : les commandes arrivent jour et nuit, vous vendez plus de commandes spéciales et produisez le juste nécessaire. Zéro commission.",
        "Les clients qui cherchent une boulangerie où commander en ligne près de chez eux vous trouvent sur Google. Un lien pour Instagram, des SMS pour annoncer la galette ou la bûche.",
        "Plus de cahier de commandes ni d'appels pendant la file du matin : tout est écrit, avec l'heure de retrait, et le client récupère sans attendre.",
    ),
    "poissonnerie": (
        "Plateaux de fruits de mer, poisson du vendredi, commandes des fêtes : réservés à l'avance, ils sont vendus avant même d'arriver. Moins de perte, zéro commission.",
        "Votre poissonnerie apparaît sur Google avec ses arrivages et ses plateaux. Vous partagez le lien sur Instagram et prévenez vos clients par SMS quand la pêche est belle.",
        "Les plateaux arrivent avec le jour, l'heure et le nombre de personnes : plus de commandes prises au téléphone les mains dans la glace.",
    ),
    "fromagerie": (
        "Plateaux, raclettes, fondues, coffrets cadeaux : vos clients commandent à toute heure, et le carnet des fêtes se remplit bien avant décembre. Zéro commission.",
        "Votre fromagerie apparaît sur Google avec ses plateaux et ses prix. Un lien pour Instagram, des SMS pour annoncer le retour du Mont d'Or ou de la raclette.",
        "Les plateaux arrivent avec le nombre de personnes et l'heure de retrait : vous les préparez au calme, sans appels pendant le rush.",
    ),
    "traiteur": (
        "Buffets, plateaux, repas de fêtes : vos clients commandent en ligne avec le nombre de personnes, et l'empreinte bancaire sécurise les grosses commandes. Zéro commission.",
        "On vous trouve sur Google en cherchant un traiteur près de chez soi, menus et prix à l'appui. Un lien pour Instagram et des SMS pour lancer la carte de Noël.",
        "Fini les devis au téléphone et les allers-retours par message : la commande arrive complète et vous planifiez la production à l'avance.",
    ),
    "fleuriste": (
        "Bouquets, deuils, Saint-Valentin, fête des mères : les commandes arrivent même boutique fermée, et vous livrez sans les 25 à 30 % de commission des plateformes de fleurs.",
        "Les clients qui cherchent un fleuriste qui livre près de chez eux vous trouvent sur Google. Un lien pour Instagram et des SMS avant chaque fête.",
        "Le message de la carte, l'adresse et le créneau arrivent par écrit : plus d'erreurs de prénom ni d'appels pendant la composition.",
    ),
    "pizzeria": (
        "Vos commandes à emporter et en livraison arrivent sans les 25 à 30 % de commission d'Uber Eats et Deliveroo : à chiffre égal, vous gardez la marge.",
        "Votre carte en ligne sur Google, un lien pour Instagram et vos clients prévenus par SMS de la pizza du moment.",
        "Plus de téléphone qui sonne pendant le coup de feu : les commandes arrivent par écrit, réparties par créneau pour lisser le service.",
    ),
    "restaurant": (
        "Vente à emporter et réservations sans commission, et l'empreinte bancaire vous protège des tables réservées qui ne viennent pas.",
        "Votre carte et vos réservations en ligne sur Google, un lien pour Instagram et des SMS pour remplir les services creux.",
        "Les commandes et réservations arrivent par écrit, réparties par créneau : moins d'appels pendant le service, moins d'erreurs.",
    ),
    "fastfood": (
        "Les commandes à emporter arrivent sans les 25 à 30 % de commission des plateformes : à chiffre égal, vous gardez la marge.",
        "Votre carte sur Google, un lien pour Instagram et des SMS pour annoncer vos offres et votre menu du moment.",
        "Le client commande et paie son créneau à l'avance : plus de file au comptoir ni de téléphone pendant le rush.",
    ),
}

GAINS_TITRES = ("Plus de commandes, plus de chiffre d'affaires", "Plus de visibilité", "Plus de temps")
GAINS_ICONES = ("📈", "📣", "⏱️")


def gains_html(metier: str | None = None, label: str | None = None) -> str:
    textes = GAINS.get(metier) or GAINS[None]
    pour = f" pour votre {label.lower()}" if label else ""
    lien = f"/inscription?metier={metier}" if metier else "/inscription"
    items = "".join(
        f'<li><span class="gi">{GAINS_ICONES[i]}</span><div><strong>{esc(GAINS_TITRES[i])}</strong><p>{esc(t)}</p></div></li>'
        for i, t in enumerate(textes))
    return (f'<section class="gains" aria-label="Ce que Marchéo vous rapporte"><h2>Ce que ça vous rapporte{esc(pour)}</h2>'
            f'<ol>{items}</ol>'
            '<p class="gains-plus"><strong>Et aussi :</strong> 0 % de commission · sans engagement · aucun matériel à acheter · '
            'site livré clé en main avec vos produits et vos photos · accompagnement au lancement.</p>'
            f'<a class="btn" href="{lien}">Voir ma démo gratuite</a></section>')


def breadcrumb_ld(items: list[tuple[str, str]]) -> dict:
    return {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": HOST + u} for i, (n, u) in enumerate(items)]}


# Fiches officielles de Marchéo sur d'autres sites (Google Business, LinkedIn, annuaires) : les moteurs et les IA
# relient ainsi la marque à ce que d'autres sites disent d'elle. Ajouter chaque URL dès qu'elle est connue.
SAME_AS: list[str] = []


def org_ld() -> dict:
    return {"@type": "Organization", "@id": f"{HOST}/#org", "name": BRAND, "url": HOST + "/", "logo": LOGO,
            **({"sameAs": SAME_AS} if SAME_AS else {}),
            "founder": {"@type": "Person", "name": FONDATEUR}, "email": CONTACT, "areaServed": "FR",
            "slogan": "La boutique en ligne des commerçants indépendants, sans matériel et sans commission",
            "description": f"{BRAND} est le logiciel français qui permet à un commerçant indépendant de créer en 30 secondes sa boutique en ligne et son site internet, avec click & collect et livraison à domicile, sans matériel à acheter et sans commission."}


def logiciel_ld() -> dict:
    """Fiche logiciel avec les prix exacts : les moteurs et les IA citent ce qui est écrit noir sur blanc."""
    formules = [("Vitrine", "19", "Site internet du commerce"),
                ("Click & Collect + Réservation", "39", "Commande en ligne avec retrait en boutique et réservation de table"),
                ("Click & Collect + Livraison", "59", "Commande en ligne avec retrait et livraison à domicile organisée par le commerçant")]
    return {"@type": "SoftwareApplication", "@id": f"{HOST}/#logiciel", "name": BRAND, "url": HOST + "/",
            "applicationCategory": "BusinessApplication", "operatingSystem": "Web, iOS, Android (navigateur)",
            "inLanguage": "fr-FR", "publisher": {"@id": f"{HOST}/#org"},
            "description": org_ld()["description"] + " 0 % de commission, sans engagement. Marchéo ne livre pas : il fournit l'outil pour que le commerçant organise sa propre livraison.",
            "offers": [{"@type": "Offer", "name": n, "price": p, "priceCurrency": "EUR", "description": d + ", abonnement mensuel sans engagement, 0 % de commission",
                        "priceSpecification": {"@type": "UnitPriceSpecification", "price": p, "priceCurrency": "EUR", "unitCode": "MON"}}
                       for n, p, d in formules]}


SUFFIXE_TITRE = f" · {BRAND}"


def seo_titre(meta: dict, defaut: str) -> str:
    """Balise <title> : 40 à 70 caractères, marque comprise. `meta_title` du front matter sinon
    le titre, avec repli sur `titre_court` quand le titre complet dépasse ce que Google affiche."""
    t = meta.get("meta_title")
    if not t:
        t = defaut
        if len(t) + len(SUFFIXE_TITRE) > 70 and meta.get("titre_court"):
            t = meta["titre_court"]
    return t if t.endswith(SUFFIXE_TITRE) else t + SUFFIXE_TITRE


def seo_desc(meta: dict) -> str:
    """Meta description : 120 à 160 caractères. `meta_description` sinon la description longue
    (qui sert aussi de chapô et de résumé sur les tuiles)."""
    return meta.get("meta_description") or meta["description"]


def page(*, titre: str, description: str, path: str, h1: str, lead: str, corps: str, eyebrow: str, crumbs: list[tuple[str, str]],
         ld: list[dict], aside: str, meta_line: str = "", cta: str | None = None, og_type: str = "article", gains: str = "", css_extra: str = "", sous_titre: str = "") -> str:
    ld_graph = {"@context": "https://schema.org", "@graph": [org_ld(), logiciel_ld(), breadcrumb_ld(crumbs), *[x for x in ld if x]]}
    crumbs_html = " › ".join(f'<a href="{esc(u)}">{esc(n)}</a>' if i < len(crumbs) - 1 else esc(n) for i, (n, u) in enumerate(crumbs))
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<!-- WeeglAd : 2 balises (la 1re synchrone, la 2de async), écrites ici seulement si le consentement publicitaire est déjà donné
     (bandeau et chargement après « Accepter » : /assets/core/meta-pixel.js) -->
<script data-weeglad-gate>(function(){{try{{
  if(window.__weeglad||/bot|crawler|spider|crawling|HeadlessChrome|Lighthouse/i.test(navigator.userAgent))return;
  var v=JSON.parse(localStorage.getItem('marcheo_consent_pub')||'null');
  if(!v||v.choix!=='oui'||v.w!==1||!v.t||Date.now()-v.t>=33696000000)return;
  window.__weeglad='head';
  document.write('<script src="https://www.weeglad.com/api/tracking/pixel-inline.js?vk=c59682c734c7112d14c7dd98d22fb4fd60871d07292ac613"><\\/script>'
    +'<script src="https://www.weeglad.com/api/tracking/pixel.js?vk=c59682c734c7112d14c7dd98d22fb4fd60871d07292ac613" async><\\/script>');
}}catch(e){{}}}})();</script>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(titre)}</title>
<meta name="description" content="{esc(description)}">
<link rel="canonical" href="{HOST}{path}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta property="og:type" content="{og_type}"><meta property="og:site_name" content="{BRAND}">
<meta property="og:title" content="{esc(titre)}"><meta property="og:description" content="{esc(description)}">
<meta property="og:url" content="{HOST}{path}"><meta property="og:image" content="{OG_IMAGE}"><meta property="og:locale" content="fr_FR">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0F2C52">
<link rel="icon" href="/assets/brand/monogram.svg" type="image/svg+xml">
{HEAD_FONTS}
{jsonld(ld_graph)}
<style>{CSS}{css_extra}</style>
</head>
<body>
{header()}
<main>
<p class="crumbs">{crumbs_html}</p>
<div class="grid">
<article>
<p class="eyebrow">{esc(eyebrow)}</p>
<h1>{esc(h1)}</h1>
{f'<p class="sous-titre">{esc(sous_titre)}</p>' if sous_titre else ""}<p class="lead">{esc(lead)}</p>
{f'<p class="meta">{meta_line}</p>' if meta_line else ''}
{gains}
{corps}
{cta if cta is not None else cta_final()}
</article>
{aside}
</div>
</main>
{footer()}
<script src="/assets/core/analytics.js?v=brandv2" defer></script>
<script src="/assets/core/meta-pixel.js?v=3" defer></script>
</body>
</html>
"""


# ─────────────────────────────────────────────────────────────
# Articles de blog
# ─────────────────────────────────────────────────────────────
def load_articles() -> list[dict]:
    arts = []
    for f in sorted((SEO / "articles").glob("*.md")):
        meta, body = parse_front_matter(f.read_text(encoding="utf-8"))
        meta["slug"] = f.stem
        meta["body_html"] = md_to_html(body)
        meta["minutes"] = reading_time(meta["body_html"])
        meta["faq"] = [x for x in meta.get("faq", []) if isinstance(x, dict)]
        arts.append(meta)
    arts.sort(key=lambda a: a.get("date", ""), reverse=True)
    return arts


def build_articles(arts: list[dict], metiers: list[dict]) -> list[str]:
    out_dir = ROOT / "blog"
    out_dir.mkdir(exist_ok=True)
    urls = []
    for a in arts:
        path = f"/blog/{a['slug']}"
        autres = [x for x in arts if x["slug"] != a["slug"]][:4]
        liens = [(x["titre_court"] if x.get("titre_court") else x["title"], f"/blog/{x['slug']}") for x in autres]
        for m in metiers:
            if m["slug"] in a.get("metiers", []):
                liens.append((f"Site et click & collect pour {m['pluriel']}", f"/solutions/{m['slug']}"))
        ld = [{
            "@type": "Article", "headline": a["title"], "description": a["description"], "inLanguage": "fr-FR",
            "datePublished": a["date"], "dateModified": a.get("modified", a["date"]),
            "author": {"@type": "Person", "name": FONDATEUR, "jobTitle": "Fondateur de Marchéo", "url": f"{HOST}/a-propos"},
            "publisher": {"@id": f"{HOST}/#org"}, "mainEntityOfPage": HOST + path, "image": OG_IMAGE,
            "keywords": ", ".join(a.get("keywords", [])), "articleSection": a.get("rubrique", "Guides"),
        }, faq_ld(a["faq"])]
        d = date.fromisoformat(a["date"]).strftime("%d/%m/%Y")
        if a.get("modified") and a["modified"] != a["date"]:
            d += " · mis à jour le " + date.fromisoformat(a["modified"]).strftime("%d/%m/%Y")
        mets = a.get("metiers", [])
        gm = a.get("gains_metier") or (mets[0] if len(mets) == 1 else None)
        gm_label = next((x["label"] for x in metiers if x["slug"] == gm), None)
        html = page(titre=seo_titre(a, a["title"]), description=seo_desc(a), path=path, h1=a["title"], lead=a["description"],
                    gains=gains_html(gm if gm_label else None, gm_label),
                    corps=a["body_html"] + faq_html(a["faq"]), eyebrow=a.get("rubrique", "Guide"),
                    crumbs=[("Accueil", "/"), ("Blog", "/blog"), (a.get("titre_court") or a["title"], path)],
                    ld=ld, aside=aside_block(liens), meta_line=f"Par {FONDATEUR} · {d} · {a['minutes']} min de lecture")
        (out_dir / f"{a['slug']}.html").write_text(html, encoding="utf-8")
        urls.append(path)
    return urls


def build_blog_index(arts: list[dict]) -> None:
    """Remplace la liste d'articles de blog.html entre les balises <!-- SEO:ARTICLES --> ... <!-- /SEO:ARTICLES -->."""
    f = ROOT / "blog.html"
    s = f.read_text(encoding="utf-8")
    cards = "".join(
        f'<a class="tuile" href="/blog/{a["slug"]}"><span class="e">{a.get("emoji", "📝")}</span><h3>{esc(a["title"])}</h3>'
        f'<p>{esc(a["description"])}</p><span class="d">{date.fromisoformat(a["date"]).strftime("%d/%m/%Y")} · {a["minutes"]} min</span></a>'
        for a in arts)
    bloc = f'<!-- SEO:ARTICLES -->\n<div class="cards">{cards}</div>\n<!-- /SEO:ARTICLES -->'
    if "<!-- SEO:ARTICLES -->" in s:
        s = re.sub(r"<!-- SEO:ARTICLES -->.*?<!-- /SEO:ARTICLES -->", lambda _: bloc, s, flags=re.S)
        f.write_text(s, encoding="utf-8")
    else:
        print("blog.html : balises SEO:ARTICLES absentes, liste non remplacée")



# ─────────────────────────────────────────────────────────────
# Pages métier « Développer son commerce grâce à internet »
# ─────────────────────────────────────────────────────────────
CSS_METIER = """
@media(max-width:900px){.grid{grid-template-columns:minmax(0,1fr)}}
.idees{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;margin:14px 0 22px;padding:0;list-style:none}
.idees li{background:#fff;border:1px solid var(--creme-fonce);border-radius:14px;padding:14px 16px;margin:0}
.idees .ie{font-size:24px;line-height:1;display:block;margin:0 0 6px}.idees strong{display:block;font-size:16px;color:var(--bleu);margin:0 0 4px;line-height:1.3}
.idees p{margin:0;font-size:14px;color:#2b3a52;line-height:1.5}
.calc{background:var(--creme);border:1px solid var(--creme-fonce);border-radius:18px;padding:22px;margin:10px 0 26px}
.calc h3{margin:0 0 4px;font-size:20px}.calc>p{margin:0 0 16px;font-size:15px;color:var(--gris)}
.calc-champs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 22px;margin:0 0 16px}@media(max-width:640px){.calc-champs{grid-template-columns:1fr}.calc{padding:18px 14px}}
.calc label{display:block;font-size:14px;font-weight:700;color:var(--bleu);margin:0 0 4px}
.calc .ligne{display:flex;align-items:center;gap:10px}.calc input[type=range]{flex:1;min-width:0;accent-color:var(--vert)}
.calc output{min-width:74px;text-align:right;font-weight:800;color:var(--bleu);font-variant-numeric:tabular-nums}
.calc-res{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 12px}
.calc-res div{background:#fff;border-radius:12px;padding:12px 14px}.calc-res span{display:block;font-size:13px;color:var(--gris)}
.calc-res b{display:block;font-size:22px;color:var(--bleu);font-variant-numeric:tabular-nums}.calc-res .fort{border:2px solid var(--vert)}.calc-res .fort b{color:var(--vert-fonce)}
.rassure{display:flex;gap:14px;align-items:flex-start;background:#fff;border:2px solid var(--soleil);border-radius:16px;padding:16px 18px;margin:0 0 30px}.rassure .ri{font-size:28px;line-height:1;flex:none}.rassure strong{display:block;font-size:18px;color:var(--bleu);margin:0 0 4px}.rassure p{margin:0;font-size:15px;color:#2b3a52}
.calc-phrase{font-size:15px;margin:0 0 6px}.calc-bonus{font-size:15px;margin:0 0 10px;background:#fff;border-left:4px solid var(--soleil);border-radius:0 10px 10px 0;padding:10px 14px}.calc-note{font-size:12px;color:var(--gris);margin:0}
.etapes{list-style:none;padding:0;margin:14px 0 20px;counter-reset:e}.etapes li{counter-increment:e;position:relative;padding:0 0 0 48px;margin:0 0 18px}
.etapes li::before{content:counter(e);position:absolute;left:0;top:0;width:34px;height:34px;border-radius:50%;background:var(--vert);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center}
.etapes strong{display:block;font-size:17px}
"""

# Le H1 porte la recherche du commerçant (« création site primeur ») ; la question générale vient en sous-titre.
SOUS_TITRE_METIER = "Développer son commerce grâce à internet : ça consiste en quoi ?"

# (installation, mensuel) ; le nom de la formule à 39 € dépend du métier (voir m["offre_39"])
OFFRES = (("Vitrine", 249, 19, "Être trouvé sur Google et présenter vos produits, sans vente en ligne"),
          (None, 399, 39, "Commandes en ligne avec retrait, avis clients, SMS, base clients"),
          ("Click & Collect + Livraison", 549, 59, "Tout ça, plus la livraison à domicile que vous faites vous-même"))


def offres_metier(m: dict) -> list[tuple[str, int, int, str]]:
    return [(n or m.get("offre_39", "Click & Collect"), i, mo, (m.get("offre_39_desc", d) if n is None else d)) for n, i, mo, d in OFFRES]


def apports_metier(m: dict) -> list[tuple[str, str, str]]:
    """Ce qu'un site à son image apporte au commerçant : même plan pour tous les métiers, mots du métier."""
    q1, q2 = m["recherche"]
    return [
        ("📍", "Les clients du coin vous trouvent",
         f"Quand quelqu'un cherche « {q1} » ou « {q2} près de chez moi » sur Google, c'est votre site qui ressort, avec vos produits, "
         "vos horaires et votre adresse. Ce sont de nouveaux clients, qui ne seraient peut-être jamais passés devant votre vitrine."),
        ("✨", "Une image pro",
         f"Un site à votre nom, à vos couleurs, avec vos photos : {m['votre']} inspire confiance avant même que le client pousse la porte. "
         "Un seul lien à mettre sur Google Maps, Instagram et Facebook, et un QR code en vitrine."),
        ("🛍️", "Le click & collect, et la livraison si vous le voulez",
         "Le client commande en ligne et passe retirer à l'heure qu'il a choisie. Si vous le souhaitez, vous livrez vous-même dans votre secteur, "
         "avec vos jours, vos créneaux et vos frais. Vous gardez tout le prix : 0 % de commission."),
        ("📱", "Vous vous modernisez",
         "Vos clients commandent déjà en ligne pour tout le reste. Vous leur offrez la même facilité, sans rien perdre de ce qui fait votre commerce : "
         "vos produits, vos conseils, le lien avec vos habitués."),
        ("➕", "Des commandes que vous n'auriez pas prises",
         m.get("commandes_en_plus", "Le soir, le dimanche, boutique fermée, ou le client pressé qui n'a pas le temps d'appeler : la commande arrive quand même, "
                                     "par écrit, avec le créneau choisi. C'est du chiffre d'affaires en plus.")),
        ("⭐", "Des avis clients, automatiquement",
         "Après chaque commande retirée, le client reçoit tout seul une demande d'avis par email. Vous validez, les avis s'affichent sur votre site : "
         "c'est ce qui décide les nouveaux clients qui hésitent."),
        ("☎️", "En prime : fini le téléphone pendant le rush",
         f"{m['rush']}, le téléphone ne sonne plus toutes les deux minutes : les commandes arrivent sur votre téléphone, triées par créneau, "
         "et vous servez vos clients au comptoir sans être interrompu."),
    ]


def calculateur_html(m: dict) -> str:
    """Calculateur sur la formule Click & Collect : commandes en plus × panier moyen, moins l'abonnement."""
    c = m["calc"]
    nom_offre, _, abo, _ = offres_metier(m)[1]

    def champ(nom: str, label: str, mini: int, maxi: int, pas: int, val: int, unite: str) -> str:
        return (f'<div><label for="c-{nom}">{esc(label)}</label><div class="ligne">'
                f'<input type="range" id="c-{nom}" data-k="{nom}" min="{mini}" max="{maxi}" step="{pas}" value="{val}" data-u="{unite}">'
                f'<output for="c-{nom}"></output></div></div>')

    return f"""<section class="calc" id="calculateur" data-abo="{abo}" aria-labelledby="calc-titre">
<h3 id="calc-titre">Est-ce rentable pour {esc(m['votre'])} ? Faites le calcul</h3>
<p>Calcul sur la formule {esc(nom_offre)} à {abo} € par mois. Bougez les curseurs avec vos chiffres : le résultat se met à jour tout seul.</p>
<div class="calc-champs">
{champ("clients", m.get("calc_label_clients", "Clients par mois dans votre commerce"), 100, 6000, 50, c["clients"], "")}
{champ("panier", "Panier moyen", 5, 200, 1, c["panier"], " €")}
{champ("pct", "Commandes en plus grâce au click & collect", 1, 30, 1, 10, " %")}
</div>
<div class="calc-res" aria-live="polite">
<div><span>Commandes en plus par mois</span><b data-r="cmd">–</b></div>
<div><span>Chiffre d'affaires en plus par mois</span><b data-r="ca">–</b></div>
<div><span>Abonnement {esc(nom_offre)}</span><b>{abo} €</b></div>
<div class="fort"><span>Ce qu'il vous reste en plus</span><b data-r="net">–</b></div>
</div>
<p class="calc-phrase" data-r="phrase"></p>
<p class="calc-bonus"><strong>Et ce n'est pas tout.</strong> Il y a un autre chiffre, difficile à calculer précisément : les gens qui découvrent votre site sans commander, mais qui passent ensuite en boutique. Ils représentent à peu près autant de monde que les commandes en plus, soit <strong data-r="visites">environ –</strong> clients en plus par mois dans votre commerce.</p>
<p class="calc-note">Par défaut, 10 % de commandes en plus : c'est la moyenne constatée chez les commerçants qui proposent le click & collect. Mettez vos propres chiffres pour faire votre calcul.</p>
</section>
<script>(function(){{var r=document.getElementById('calculateur');if(!r)return;
var abo=+r.dataset.abo,f=function(n){{return Math.round(n).toLocaleString('fr-FR')}};
function maj(){{var v={{}};r.querySelectorAll('input[type=range]').forEach(function(i){{v[i.dataset.k]=+i.value;i.nextElementSibling.textContent=f(+i.value)+i.dataset.u}});
var cmd=Math.round(v.clients*v.pct/100),ca=cmd*v.panier,net=ca-abo;
var q=function(k){{return r.querySelector('[data-r='+k+']')}};
q('cmd').textContent=f(cmd);q('ca').textContent=f(ca)+' €';q('net').textContent=(net>0?'+':'')+f(net)+' €';
var n=Math.max(1,Math.ceil(abo/v.panier));
q('visites').textContent='environ '+f(cmd);q('phrase').textContent='Votre abonnement est payé dès la '+(n===1?'1re':n+'e')+' commande en plus du mois.'}}
r.addEventListener('input',maj);maj()}})();</script>"""


def corps_metier(m: dict) -> str:
    """Corps de la page métier : explication, idées du métier, prix + calculateur, démarrage, FAQ."""
    apports = "".join(f'<li><span class="gi">{e}</span><div><strong>{esc(t)}</strong><p>{esc(p)}</p></div></li>' for e, t, p in apports_metier(m))
    idees = "".join(f'<li><span class="ie">{x["e"]}</span><strong>{esc(x["t"])}</strong><p>{esc(x["p"])}</p></li>' for x in m["idees"])
    lignes = "".join(f"<tr><td><strong>{esc(n)}</strong></td><td>{esc(d)}</td><td>{i} €</td><td>{mo} €</td></tr>" for n, i, mo, d in offres_metier(m))
    lien = f"/inscription?metier={m['slug']}"
    return f"""<section class="gains" aria-labelledby="apports"><h2 id="apports">Ce qu'un site à votre image change pour vous</h2><ol>{apports}</ol>
<a class="btn" href="{lien}">Voir ma démo gratuite</a></section>
<div class="rassure"><span class="ri">🤝</span><div><strong>Vous avez peur de ne pas y arriver ? Pas de souci.</strong>
<p>Notre équipe vous accompagne tout au long : on installe votre site avec vos produits et vos photos, on vous montre comment tout gérer depuis votre téléphone, et on reste là après la mise en ligne pour répondre à vos questions. Pas besoin d'être à l'aise avec l'informatique.</p></div></div>
<h2>Ce qui marche bien en ligne pour {esc(m['un'])}</h2>
<p>{esc(m['idees_intro'])}</p>
<ul class="idees">{idees}</ul>
<p>{esc(m.get('idees_fin', "Toutes ces idées sont des produits comme les autres sur votre site : vous les créez, les modifiez ou les retirez en quelques secondes depuis votre téléphone."))}</p>
<h2>Combien ça coûte</h2>
<table><thead><tr><th>Formule</th><th>Pour</th><th>Installation</th><th>Par mois</th></tr></thead><tbody>{lignes}</tbody></table>
<p><strong>0 % de commission</strong> sur vos ventes, sans engagement. Les frais d'installation ne sont payés qu'une fois, au moment de la mise en ligne : le site vous est livré clé en main, avec vos produits et vos photos.</p>
{calculateur_html(m)}
<h2>Comment démarrer</h2>
<ol class="etapes">
<li><strong>Créez votre démo gratuite et sans engagement</strong>Sur la page d'inscription, choisissez « {esc(m['label'])} » et tapez le nom de votre commerce. En 30 secondes, votre site apparaît à votre nom, avec un catalogue {esc(m['catalogue'])} déjà rempli. Pas de carte bancaire, rien à installer.</li>
<li><strong>Regardez-la, testez-la, ajustez-la</strong>Passez une commande comme le ferait un client. Changez les prix, ajoutez vos photos et vos spécialités, les idées ci-dessus, vos horaires de retrait{esc(" et votre zone de livraison" if m.get("livraison", True) else "")}. Prenez le temps qu'il faut : la démo ne vous engage à rien.</li>
<li><strong>Mettez-la en ligne quand vous êtes prêt</strong>Vous choisissez votre formule, et votre site est publié. On vous aide au lancement : QR code pour la vitrine, lien pour Google Maps et Instagram, premier SMS à vos habitués.</li>
</ol>
<p><a class="btn" href="{lien}">Créer ma démo gratuite</a></p>
"""


def texte_metier(m: dict) -> str:
    """Version texte de la page métier, pour llms-full.txt."""
    out = [m["h1"], SOUS_TITRE_METIER, "", m["lead"], "", "## Ce qu'un site à votre image change pour vous"]
    out += [f"- {t} : {p}" for _, t, p in apports_metier(m)]
    out += ["", f"## Ce qui marche bien en ligne pour {m['un']}", m["idees_intro"]]
    out += [f"- {x['t']} : {x['p']}" for x in m["idees"]]
    out += ["", "## Combien ça coûte"] + [f"- {n} : {i} € d'installation, {mo} € par mois. {d}." for n, i, mo, d in offres_metier(m)]
    out += ["0 % de commission, sans engagement. Démo gratuite et sans engagement, mise en ligne quand le commerçant est prêt."]
    return "\n".join(out)

# ─────────────────────────────────────────────────────────────
# Pages métier
# ─────────────────────────────────────────────────────────────
def build_metiers(metiers: list[dict], arts: list[dict]) -> list[str]:
    out_dir = ROOT / "solutions"
    out_dir.mkdir(exist_ok=True)
    urls = []
    for m in metiers:
        path = f"/solutions/{m['slug']}"
        corps = corps_metier(m)
        liens = [(f"Site et click & collect pour {x['pluriel']}", f"/solutions/{x['slug']}") for x in metiers if x["slug"] != m["slug"]][:5]
        liens += [(a.get("titre_court") or a["title"], f"/blog/{a['slug']}") for a in arts if m["slug"] in a.get("metiers", [])][:3]
        ld = [{
            "@type": "Service", "name": f"Marchéo pour {m['pluriel']}", "serviceType": "Boutique en ligne click & collect et livraison locale",
            "provider": {"@id": f"{HOST}/#org"}, "areaServed": "FR", "audience": {"@type": "Audience", "audienceType": m["pluriel"]},
            "description": m["description"], "url": HOST + path,
            "offers": {"@type": "AggregateOffer", "priceCurrency": "EUR", "lowPrice": "19", "highPrice": "59", "offerCount": "3",
                       "description": "Abonnement mensuel sans engagement, 0 % de commission sur les ventes"},
        }, faq_ld(m.get("faq", []))]
        html = page(titre=seo_titre(m, m["title"]), description=seo_desc(m), path=path, h1=m["h1"], sous_titre=SOUS_TITRE_METIER, lead=m["lead"],
                    corps=corps + faq_html(m.get("faq", [])), eyebrow=f"{m['emoji']} {m['label']}",
                    crumbs=[("Accueil", "/"), ("Par métier", "/solutions"), (m["label"], path)],
                    ld=ld, aside=aside_block(liens, "Autres métiers"), og_type="website", css_extra=CSS_METIER,
                    cta=cta_final("Voyez votre site avant de décider", "Choisissez « " + m["label"] + " », tapez le nom de votre commerce : votre démo s'affiche en 30 secondes. Gratuite, sans engagement, sans carte bancaire. Vous la mettez en ligne quand vous êtes prêt.", f"/inscription?metier={m['slug']}"))
        (out_dir / f"{m['slug']}.html").write_text(html, encoding="utf-8")
        urls.append(path)
    # index
    tuiles = "".join(f'<a class="tuile" href="/solutions/{m["slug"]}"><span class="e">{m["emoji"]}</span><h3>{esc(m["label"])}</h3><p>{esc(m["accroche"])}</p></a>' for m in metiers)
    ld = [{"@type": "ItemList", "itemListElement": [{"@type": "ListItem", "position": i + 1, "url": f"{HOST}/solutions/{m['slug']}", "name": f"Marchéo pour {m['pluriel']}"} for i, m in enumerate(metiers)]}]
    html = page(titre="Click & collect et livraison par métier · Marchéo",
                description="Une boutique en ligne par métier de bouche : catalogue pré-rempli, thème et options adaptés. Choisissez le vôtre et voyez votre démo gratuite.",
                path="/solutions", h1="Une boutique en ligne pensée pour votre métier", lead="Dix métiers, dix catalogues déjà remplis, dix thèmes. Le click & collect d'un boucher n'est pas celui d'un fleuriste : Marchéo le sait.",
                corps=f'<div class="cards">{tuiles}</div>' + md_to_html(SOLUTIONS_INTRO), eyebrow="Par métier", crumbs=[("Accueil", "/"), ("Par métier", "/solutions")],
                ld=ld, aside=aside_block([(a.get("titre_court") or a["title"], f"/blog/{a['slug']}") for a in arts[:6]]), og_type="website")
    (out_dir / "index.html").write_text(html, encoding="utf-8")
    urls.append("/solutions")
    return urls


SOLUTIONS_INTRO = """
## Pourquoi une page par métier ?

Parce qu'un commerçant ne cherche pas « un logiciel de click & collect », il cherche **comment prendre les commandes de gâteaux du week-end** ou **comment livrer ses paniers dans le quartier**. Chaque page décrit ce que Marchéo change concrètement pour ce métier, ce qui est inclus, et ce que ça coûte. Le principe reste le même partout : vos clients commandent depuis leur téléphone en 30 secondes, sans créer de compte, et viennent retirer à l'heure choisie ou se font livrer dans votre zone. Vous gardez 100 % de vos ventes.
"""


# ─────────────────────────────────────────────────────────────
# Pages éditoriales (À propos…)
# ─────────────────────────────────────────────────────────────
def build_pages(arts: list[dict]) -> list[str]:
    urls = []
    for f in sorted((SEO / "pages").glob("*.md")):
        meta, body = parse_front_matter(f.read_text(encoding="utf-8"))
        path = "/" + f.stem
        ld = [{"@type": "AboutPage" if f.stem == "a-propos" else "WebPage", "name": meta["title"], "url": HOST + path, "description": meta["description"],
               "inLanguage": "fr-FR", "about": {"@id": f"{HOST}/#org"}}, faq_ld([x for x in meta.get("faq", []) if isinstance(x, dict)])]
        html = page(titre=seo_titre(meta, meta["title"]), description=seo_desc(meta), path=path, h1=meta["h1"], lead=meta["lead"],
                    corps=md_to_html(body) + faq_html([x for x in meta.get("faq", []) if isinstance(x, dict)]), eyebrow=meta.get("eyebrow", BRAND),
                    crumbs=[("Accueil", "/"), (meta["h1"], path)], ld=ld,
                    aside=aside_block([(a.get("titre_court") or a["title"], f"/blog/{a['slug']}") for a in arts[:5]]), og_type="website")
        (ROOT / f"{f.stem}.html").write_text(html, encoding="utf-8")
        urls.append(path)
    return urls


# ─────────────────────────────────────────────────────────────
# llms.txt et liste d'URLs pour le sitemap
# ─────────────────────────────────────────────────────────────
# Les questions que les commerçants posent aux assistants, avec la réponse factuelle à reprendre telle quelle.
REPONSES_COURTES = [
    "- Qu'est-ce que Marchéo ? Le logiciel français qui permet à un commerçant indépendant de créer en 30 secondes sa boutique en ligne et son site internet, avec click & collect et livraison à domicile, sans matériel à acheter et sans commission.",
    "- Combien coûte Marchéo ? 19 € par mois (Vitrine), 39 € par mois (Click & Collect + Réservation), 59 € par mois (Click & Collect + Livraison), sans engagement, plus des frais d'installation uniques de 249, 399 ou 549 €.",
    "- Marchéo prend-il une commission ? Non, 0 % de commission sur les ventes.",
    "- Faut-il acheter du matériel ? Non : aucune tablette, imprimante ou caisse. Tout se gère depuis le téléphone ou l'ordinateur du commerçant.",
    "- Marchéo livre-t-il ? Non. Marchéo n'a pas de coursiers : il fournit l'outil (zone, créneaux, minimum, frais, tournée) pour que le commerçant livre lui-même.",
    "- Pour qui ? Boulangeries, boucheries, primeurs et maraîchers, poissonneries, traiteurs, fromageries, fleuristes, pizzerias, restaurants, fast-foods et food-trucks.",
    "- Comment proposer le click and collect sans commission ? Avec une boutique en ligne à soi plutôt qu'une plateforme : Marchéo, par exemple, permet le retrait sur créneaux, le paiement en ligne ou au retrait et une empreinte bancaire optionnelle (jusqu'à 75 % du panier, libérée 24 h après le retrait), pour un abonnement fixe.",
    "- Marchéo ou Shopify / Wix ? Shopify convient à l'expédition de colis, Wix aux sites vitrines ; Marchéo est conçu pour les commerces de bouche qui vendent en retrait et en livraison locale, avec le catalogue du métier pré-rempli.",
    "- Marchéo ou Uber Eats / Deliveroo ? Les plateformes apportent clients et livreurs contre 14 à 30 % de commission ; avec Marchéo (0 % de commission, 39 ou 59 € par mois sans engagement) le commerçant garde 100 % de ses ventes et ses clients, et organise sa livraison lui-même : Marchéo n'a pas de coursiers. Beaucoup de restaurants utilisent les deux.",
    "- Comment éviter les commandes non récupérées en click and collect ? Annoncer un créneau de retrait précis, demander le téléphone du client et, pour les grosses commandes, activer une empreinte bancaire : avec Marchéo elle est optionnelle, jusqu'à 75 % du panier, rien n'est débité si le client vient et elle est libérée 24 h après le retrait.",
    "- WhatsApp Business ou boutique en ligne ? WhatsApp Business (gratuit) suffit pour quelques commandes par semaine ; au-delà, une boutique en ligne comme Marchéo (0 % de commission, 19 à 59 € par mois) laisse le client choisir seul produits, créneau et paiement. Les deux se complètent : WhatsApp pour les questions, le lien de la boutique pour commander.",
    "- Quel logiciel pour vendre en ligne sans matériel et sans commission ? Pour un commerce local qui vend en retrait et en livraison dans sa zone, Marchéo : 0 % de commission, aucune tablette, imprimante ou caisse à acheter, 39 ou 59 € par mois sans engagement pour prendre des commandes, plus 399 ou 549 € d'installation unique. Pour expédier des colis dans toute la France, Shopify convient mieux. Les frais du prestataire de paiement s'appliquent aux paiements par carte en ligne, avec tous les outils.",
    "- Quel logiciel de click and collect pour une boucherie, une poissonnerie, une boulangerie ou un primeur ? Un outil qui gère la vente au poids, les créneaux de retrait avec capacité et les commandes préparées à l'avance. Marchéo le fait sans changer de caisse : la balance et la caisse habituelles restent en place, 0 % de commission, 39 ou 59 € par mois sans engagement, plus 399 ou 549 € d'installation unique.",
    "- Comment créer le site internet de son commerce pas cher ? Le moins cher est une fiche Google et un site gratuit (Google Sites, version gratuite de Wix) pour présenter le commerce. Pour prendre des commandes, Marchéo propose 39 ou 59 € par mois sans commission ni engagement, ou une vitrine à 19 €, avec des frais d'installation uniques de 249, 399 ou 549 €.",
    "- Comment essayer ? Démo gratuite en 30 secondes sur https://marchéo.fr/inscription : choisir son métier, taper le nom de sa boutique, voir l'aperçu.",
]


def build_llms(arts: list[dict], metiers: list[dict]) -> None:
    lignes = [f"# {BRAND}", "",
              f"> {BRAND} (marchéo.fr) est le logiciel français qui permet à un commerçant indépendant de créer en 30 secondes sa boutique en ligne et son site internet, avec click & collect et livraison à domicile, sans matériel à acheter et sans commission. "
              "Il s'adresse aux commerces de bouche et artisans indépendants : click & collect, livraison locale et réservation de table. Aucune tablette, imprimante ou caisse à acheter : tout se gère depuis le téléphone ou l'ordinateur du commerçant. Les clients commandent depuis leur téléphone en 30 secondes sans créer de compte "
              "et retirent à l'heure choisie. 0 % de commission sur les ventes, abonnement de 19 à 59 € par mois sans engagement, "
              "frais d'installation uniques de 249 à 549 €. Empreinte bancaire anti no-show optionnelle (jusqu'à 75 % du panier, libérée 24 h après le retrait). Marchéo ne livre pas et n'a pas de coursiers : il fournit l'outil (zone, créneaux, minimum de commande, frais, tournée) pour que le commerçant organise sa propre livraison. "
              f"Fondé par {FONDATEUR}. Données hébergées en Europe, paiements Stripe.", "",
              "Métiers couverts : " + ", ".join(m["pluriel"] for m in metiers) + ".", "",
              "## Réponses courtes", *REPONSES_COURTES, "",
              "## Pages principales", f"- [Accueil]({HOST}/) : présentation, tarifs, FAQ",
              f"- [Créer sa boutique / démo gratuite]({HOST}/inscription) : choisir son métier, taper le nom de sa boutique, voir l'aperçu en 30 secondes",
              f"- [À propos]({HOST}/a-propos)", f"- [FAQ]({HOST}/faq)", f"- [Tarifs]({HOST}/#tarifs)", "",
              "## Pages par métier"]
    lignes += [f"- [Marchéo pour {m['pluriel']}]({HOST}/solutions/{m['slug']}) : {m['accroche']}" for m in metiers]
    lignes += ["", "## Guides et articles"]
    lignes += [f"- [{a['title']}]({HOST}/blog/{a['slug']}) : {a['description']}" for a in arts]
    lignes += ["", "## Contact", f"- Email : {CONTACT}", "- Pays : France", f"- Dernière mise à jour : {date.today().isoformat()}", ""]
    (ROOT / "llms.txt").write_text("\n".join(lignes), encoding="utf-8")
    # version complète : le contenu des pages métier et des articles, en texte
    full = ["\n".join(lignes), "", "---", ""]
    for m in metiers:
        full += [f"# Marchéo pour {m['pluriel']}", "", texte_metier(m), ""]
        full += [f"Q : {x['q']}\nR : {x['r']}" for x in m.get("faq", [])] + [""]
    for a in arts:
        full += [f"# {a['title']}", "", a["description"], "", re.sub(r"<[^>]+>", "", a["body_html"]).strip(), ""]
        full += [f"Q : {x['q']}\nR : {x['r']}" for x in a["faq"]] + [""]
    (ROOT / "llms-full.txt").write_text("\n".join(full), encoding="utf-8")


def build_urls_js(urls: list[str]) -> None:
    (SEO / "urls.js").write_text("// Généré par seo/build.py, ne pas éditer à la main\nexport default " + json.dumps(urls, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")


def main() -> None:
    metiers = json.loads((SEO / "metiers.json").read_text(encoding="utf-8"))
    arts = load_articles()
    urls = build_articles(arts, metiers) + build_metiers(metiers, arts) + build_pages(arts)
    build_blog_index(arts)
    build_llms(arts, metiers)
    build_urls_js(urls)
    print(f"{len(arts)} articles, {len(metiers)} pages métier, {len(urls)} URL(s) générées")


if __name__ == "__main__":
    main()
