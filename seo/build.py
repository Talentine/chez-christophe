#!/usr/bin/env python3
"""Générateur des pages SEO de marchéo.fr : articles de blog, pages métier, page À propos, llms.txt, liste sitemap.

Sources (à éditer, jamais les HTML générés) :
  seo/articles/*.md      articles de blog (front matter YAML minimal + Markdown)
  seo/pages/*.md         pages éditoriales (À propos…)
  seo/metiers.json       pages métier « Click & collect pour <métier> »

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
.nav a:hover{background:var(--creme)}.nav a.cta{background:var(--vert);color:#fff;padding:9px 16px}.nav a.cta:hover{background:var(--vert-fonce)}
.hide-m{display:inline}@media(max-width:640px){.hide-m{display:none}.nav a{padding:8px 10px}}
main{max-width:1080px;margin:0 auto;padding:28px 20px 60px}
.crumbs{font-size:13px;color:var(--gris);margin:0 0 18px}.crumbs a{color:var(--gris);text-decoration:none}.crumbs a:hover{text-decoration:underline}
.eyebrow{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--vert-fonce);margin:0 0 10px}
h1{font-family:"Playfair Display",Georgia,serif;font-size:clamp(30px,4.6vw,44px);line-height:1.12;margin:0 0 14px;letter-spacing:-.01em;text-wrap:balance;color:var(--bleu)}
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
footer{border-top:1px solid var(--creme-fonce);padding:26px 20px 40px;font-size:13px;color:var(--gris);text-align:center}footer a{color:var(--gris)}
"""

HEAD_FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
              '<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">')


def header() -> str:
    return f"""<header class="header"><div class="header-in">
  <a href="/" class="logo" aria-label="{BRAND}, accueil"><img src="/assets/brand/logo-square.svg" alt="" width="34" height="34">{BRAND}<span>.fr</span></a>
  <nav class="nav" aria-label="Navigation">
    <a href="/solutions">Par métier</a>
    <a href="/#tarifs" class="hide-m">Tarifs</a>
    <a href="/faq" class="hide-m">FAQ</a>
    <a href="/inscription" class="cta">Créer ma boutique</a>
  </nav></div></header>"""


def footer() -> str:
    return f"""<footer>© {date.today().year} {BRAND} · <a href="/a-propos">À propos</a> · <a href="/blog">Blog</a> · <a href="/solutions">Métiers</a> · <a href="/faq">FAQ</a> · <a href="/cgv">CGV</a> · <a href="/confidentialite">Confidentialité</a> · <a href="/mentions-legales">Mentions légales</a> · <a href="mailto:{CONTACT}">{CONTACT}</a></footer>"""


def cta_final(titre: str = "Voyez votre boutique en 30 secondes", texte: str = "Choisissez votre métier, tapez le nom de votre commerce : l'aperçu de votre site s'affiche avec le catalogue déjà rempli. Gratuit, sans carte bancaire.") -> str:
    return f"""<section class="cta-final"><h2>{esc(titre)}</h2><p>{esc(texte)}</p>
  <a class="btn soleil" href="/inscription">Créer ma démo gratuite</a></section>"""


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


def breadcrumb_ld(items: list[tuple[str, str]]) -> dict:
    return {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": HOST + u} for i, (n, u) in enumerate(items)]}


def org_ld() -> dict:
    return {"@type": "Organization", "@id": f"{HOST}/#org", "name": BRAND, "url": HOST + "/", "logo": LOGO,
            "founder": {"@type": "Person", "name": FONDATEUR}, "email": CONTACT, "areaServed": "FR"}


def page(*, titre: str, description: str, path: str, h1: str, lead: str, corps: str, eyebrow: str, crumbs: list[tuple[str, str]],
         ld: list[dict], aside: str, meta_line: str = "", cta: str | None = None, og_type: str = "article") -> str:
    ld_graph = {"@context": "https://schema.org", "@graph": [org_ld(), breadcrumb_ld(crumbs), *[x for x in ld if x]]}
    crumbs_html = " › ".join(f'<a href="{esc(u)}">{esc(n)}</a>' if i < len(crumbs) - 1 else esc(n) for i, (n, u) in enumerate(crumbs))
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
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
<style>{CSS}</style>
</head>
<body>
{header()}
<main>
<p class="crumbs">{crumbs_html}</p>
<div class="grid">
<article>
<p class="eyebrow">{esc(eyebrow)}</p>
<h1>{esc(h1)}</h1>
<p class="lead">{esc(lead)}</p>
{f'<p class="meta">{meta_line}</p>' if meta_line else ''}
{corps}
{cta if cta is not None else cta_final()}
</article>
{aside}
</div>
</main>
{footer()}
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
                liens.append((f"Click & collect pour {m['pluriel']}", f"/solutions/{m['slug']}"))
        ld = [{
            "@type": "Article", "headline": a["title"], "description": a["description"], "inLanguage": "fr-FR",
            "datePublished": a["date"], "dateModified": a.get("modified", a["date"]),
            "author": {"@type": "Person", "name": FONDATEUR, "jobTitle": "Fondateur de Marchéo", "url": f"{HOST}/a-propos"},
            "publisher": {"@id": f"{HOST}/#org"}, "mainEntityOfPage": HOST + path, "image": OG_IMAGE,
            "keywords": ", ".join(a.get("keywords", [])), "articleSection": a.get("rubrique", "Guides"),
        }, faq_ld(a["faq"])]
        d = date.fromisoformat(a["date"]).strftime("%d/%m/%Y")
        html = page(titre=a["title"] + " · Marchéo", description=a["description"], path=path, h1=a["title"], lead=a["description"],
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
# Pages métier
# ─────────────────────────────────────────────────────────────
def build_metiers(metiers: list[dict], arts: list[dict]) -> list[str]:
    out_dir = ROOT / "solutions"
    out_dir.mkdir(exist_ok=True)
    urls = []
    for m in metiers:
        path = f"/solutions/{m['slug']}"
        corps = md_to_html(m["corps"])
        liens = [(f"Click & collect pour {x['pluriel']}", f"/solutions/{x['slug']}") for x in metiers if x["slug"] != m["slug"]][:5]
        liens += [(a.get("titre_court") or a["title"], f"/blog/{a['slug']}") for a in arts if m["slug"] in a.get("metiers", [])][:3]
        ld = [{
            "@type": "Service", "name": f"Marchéo pour {m['pluriel']}", "serviceType": "Boutique en ligne click & collect et livraison locale",
            "provider": {"@id": f"{HOST}/#org"}, "areaServed": "FR", "audience": {"@type": "Audience", "audienceType": m["pluriel"]},
            "description": m["description"], "url": HOST + path,
            "offers": {"@type": "AggregateOffer", "priceCurrency": "EUR", "lowPrice": "19", "highPrice": "59", "offerCount": "3",
                       "description": "Abonnement mensuel sans engagement, 0 % de commission sur les ventes"},
        }, faq_ld(m.get("faq", []))]
        html = page(titre=m["title"], description=m["description"], path=path, h1=m["h1"], lead=m["lead"],
                    corps=corps + faq_html(m.get("faq", [])), eyebrow=f"{m['emoji']} {m['label']}",
                    crumbs=[("Accueil", "/"), ("Par métier", "/solutions"), (m["label"], path)],
                    ld=ld, aside=aside_block(liens, "Autres métiers"), og_type="website",
                    cta=cta_final(m.get("cta_titre", "Votre boutique, prête en 30 secondes"), m.get("cta_texte", "Choisissez « " + m["label"] + " », tapez le nom de votre commerce, et voyez votre site avec le catalogue déjà rempli. Gratuit, sans carte bancaire.")))
        (out_dir / f"{m['slug']}.html").write_text(html, encoding="utf-8")
        urls.append(path)
    # index
    tuiles = "".join(f'<a class="tuile" href="/solutions/{m["slug"]}"><span class="e">{m["emoji"]}</span><h3>{esc(m["label"])}</h3><p>{esc(m["accroche"])}</p></a>' for m in metiers)
    ld = [{"@type": "ItemList", "itemListElement": [{"@type": "ListItem", "position": i + 1, "url": f"{HOST}/solutions/{m['slug']}", "name": f"Marchéo pour {m['pluriel']}"} for i, m in enumerate(metiers)]}]
    html = page(titre="Click & collect et livraison par métier : boulangerie, boucherie, primeur, restaurant… · Marchéo",
                description="Marchéo s'adapte à chaque commerce de bouche : catalogue pré-rempli, thème et fonctionnalités propres à votre métier. Choisissez le vôtre et voyez votre boutique en 30 secondes.",
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
        html = page(titre=meta["title"] + " · Marchéo", description=meta["description"], path=path, h1=meta["h1"], lead=meta["lead"],
                    corps=md_to_html(body) + faq_html([x for x in meta.get("faq", []) if isinstance(x, dict)]), eyebrow=meta.get("eyebrow", BRAND),
                    crumbs=[("Accueil", "/"), (meta["h1"], path)], ld=ld,
                    aside=aside_block([(a.get("titre_court") or a["title"], f"/blog/{a['slug']}") for a in arts[:5]]), og_type="website")
        (ROOT / f"{f.stem}.html").write_text(html, encoding="utf-8")
        urls.append(path)
    return urls


# ─────────────────────────────────────────────────────────────
# llms.txt et liste d'URLs pour le sitemap
# ─────────────────────────────────────────────────────────────
def build_llms(arts: list[dict], metiers: list[dict]) -> None:
    lignes = [f"# {BRAND}", "",
              f"> {BRAND} (marchéo.fr) est un logiciel français de boutique en ligne pour les commerces de bouche et artisans indépendants : "
              "click & collect, livraison locale et réservation de table. Les clients commandent depuis leur téléphone en 30 secondes sans créer de compte "
              "et retirent à l'heure choisie. 0 % de commission sur les ventes, abonnement de 19 à 59 € par mois sans engagement, "
              "frais d'installation uniques de 249 à 549 €. Empreinte bancaire anti no-show optionnelle (75 % du panier, libérée 24 h après le retrait). "
              f"Fondé par {FONDATEUR}. Données hébergées en Europe, paiements Stripe.", "",
              "Métiers couverts : " + ", ".join(m["pluriel"] for m in metiers) + ".", "",
              "## Pages principales", f"- [Accueil]({HOST}/) : présentation, tarifs, FAQ",
              f"- [Créer sa boutique / démo gratuite]({HOST}/inscription) : choisir son métier, taper le nom de sa boutique, voir l'aperçu en 30 secondes",
              f"- [À propos]({HOST}/a-propos)", f"- [FAQ]({HOST}/faq)", f"- [Tarifs]({HOST}/#tarifs)", "",
              "## Pages par métier"]
    lignes += [f"- [Marchéo pour {m['pluriel']}]({HOST}/solutions/{m['slug']}) : {m['accroche']}" for m in metiers]
    lignes += ["", "## Guides et articles"]
    lignes += [f"- [{a['title']}]({HOST}/blog/{a['slug']}) : {a['description']}" for a in arts]
    lignes += ["", "## Contact", f"- Email : {CONTACT}", "- Pays : France", ""]
    (ROOT / "llms.txt").write_text("\n".join(lignes), encoding="utf-8")
    # version complète : le contenu des pages métier et des articles, en texte
    full = ["\n".join(lignes), "", "---", ""]
    for m in metiers:
        full += [f"# Marchéo pour {m['pluriel']}", "", m["lead"], "", re.sub(r"<[^>]+>", "", md_to_html(m["corps"])).strip(), ""]
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
