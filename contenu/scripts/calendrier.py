"""Génère calendrier.json et validation_2026-11.md à partir du plan de novembre 2026.
Usage : python3 contenu/scripts/calendrier.py"""
import json, pathlib, datetime as dt
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
BANQUE = {t["id"]: t for t in json.loads((ROOT / "banque_themes.json").read_text())}
SITE = "https://xn--marcho-fva.fr/inscription"
CTA = {
    "site": "Créez la démo de votre boutique en 5 minutes sur marchéo.fr",
    "demo": "Commentez DÉMO, je vous envoie le lien",
    "audit": "Envoyez AUDIT en message, je regarde gratuitement votre commerce",
    "save": "Enregistrez ce post pour le samedi",
}
JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]

# jour, thème, angle, métier, persona, format Reel principal, accroche (texte écran ≤ 6 mots + phrase dite), CTA
PLAN = [
 (1, 53, "Histoire vécue", "tous", 1, "F1", "19 ans primeur. Voilà pourquoi.", "J'ai passé dix-neuf ans derrière un étal. Voilà pourquoi j'ai créé Marchéo.", "site"),
 (2, 29, "Démonstration produit", "boucher", 5, "F3", "Votre semaine, en 2 minutes.", "Lundi matin, avant le café, vous savez déjà comment s'est passée votre semaine.", "site"),
 (3, 3, "Calcul chiffré", "boucher", 1, "F2", "Ce coup de fil vous coûte cher.", "Chaque appel pendant le rush, c'est un client au comptoir qui attend. Ou qui part.", "save"),
 (4, 2, "Avis tranché", "traiteur", 2, "F1", "30 % ? C'est de la folie.", "Payer 30 % de commission sur une côte de bœuf, c'est de la folie.", "demo"),
 (5, 1, "Calcul chiffré", "traiteur", 3, "F2", "3 plateaux jamais récupérés.", "Trois plateaux de Noël jamais récupérés. Faites le calcul avec moi.", "site"),
 (6, 31, "Tuto concret", "fromager", 3, "F2", "Comptez ceux qui repartent.", "Samedi, prenez une feuille et comptez ceux qui repartent sans rien acheter.", "save"),
 (7, 20, "Histoire vécue", "primeur", 4, "F1", "Une règle pour garder un client.", "En dix-neuf ans de primeur, j'ai appris une seule règle pour garder un client.", "site"),
 (8, 9, "Mythe vs réalité", "boucher", 1, "F1", "« Trop vieux pour Internet » ?", "« Mes clients sont trop vieux pour Internet. » Regardez qui commande vos plateaux de Noël.", "demo"),
 (9, 11, "Démonstration produit", "boucher", 1, "F3", "Commandé = protégé. Même absent.", "Un client commande, ne vient pas. Avec l'empreinte, vous n'êtes plus perdant.", "site"),
 (10, 7, "Erreur fréquente", "traiteur", 5, "F2", "Le carnet, c'est des erreurs.", "Le carnet papier, c'est pas de la tradition. C'est des erreurs.", "site"),
 (11, 4, "Tuto concret", "tous", 2, "F2", "Vos horaires Google datent ?", "Si Google affiche encore vos horaires de 2022, ne vous plaignez pas que la rue soit vide.", "audit"),
 (12, 17, "Saisonnier / actu", "poissonnier", 4, "F2", "Noël se joue maintenant.", "Vos fêtes de fin d'année se gagnent ou se perdent dès la mi-novembre.", "save"),
 (13, 15, "Avis tranché", "boulanger", 2, "F1", "2 000 € pour zéro visite.", "Un site vitrine à deux mille euros que personne ne visite, c'est une vitrine dans une impasse.", "demo"),
 (14, 10, "Avant / après", "primeur", 4, "F2", "Préparé la veille. Zéro attente.", "Les commandes préparées la veille, c'est un samedi qui respire.", "site"),
 (15, 44, "Démonstration produit", "fromager", 3, "F3", "Empreinte haute ou basse ?", "Empreinte haute ou basse : ça dépend de votre commerce. Je vous montre.", "site"),
 (16, 12, "Calcul chiffré", "boulanger", 5, "F2", "Un client fidèle vaut combien ?", "Un client fidèle sur cinq ans, c'est bien plus qu'une baguette par jour.", "save"),
 (17, 38, "Avis tranché", "traiteur", 1, "F1", "Le client est roi. Sauf…", "Le client est roi. Sauf quand il ne vient pas chercher sa commande.", "demo"),
 (18, 33, "Tuto concret", "boucher", 1, "F2", "Votre répondeur peut vendre.", "Votre répondeur peut transformer un appel manqué en commande. Voilà le texte.", "save"),
 (19, 52, "Histoire vécue", "primeur", 4, "F1", "Caen, un samedi de décembre.", "Caen, un samedi de décembre. Ce jour-là, j'ai compris un truc.", "site"),
 (20, 34, "Comparatif honnête", "fromager", 3, "F2", "Vendez un plateau, pas 6 fromages.", "Vendre un plateau prêt, plutôt que six fromages à l'unité. Comparons.", "site"),
 (21, 55, "Point de vue terrain", "tous", 1, "F1", "Ce qu'on me demande toujours.", "À chaque visite de commerce, on me pose les mêmes cinq questions.", "audit"),
 (22, 13, "Avis tranché", "boulanger", 2, "F1", "Votre carte finit au lavage.", "Votre carte à tampons, elle finit dans la machine à laver.", "demo"),
 (23, 49, "Démonstration produit", "tous", 5, "F3", "Le vrai prix. Sans astérisque.", "Ce que coûte Marchéo. Le vrai prix, sans petites lignes.", "site"),
 (24, 57, "Mythe vs réalité", "tous", 5, "F2", "Facture électronique : on respire.", "Facture électronique : ce qui a vraiment changé en septembre, et ce qui attend 2027.", "save"),
 (25, 14, "Tuto concret", "primeur", 4, "F2", "Des avis, sans quémander.", "Des avis Google sans quémander au comptoir. Trois gestes simples.", "audit"),
 (26, 40, "Question qui divise", "epicerie-fine", 3, "F1", "Un site ? Non. Des commandes.", "Vous n'avez pas besoin d'un site. Vous avez besoin qu'on puisse vous commander.", "demo"),
 (27, 59, "Avis tranché", "tous", 2, "F1", "Black Friday ? Pas pour vous.", "Le Black Friday n'est pas fait pour l'artisan. Et c'est tant mieux.", "site"),
 (28, 32, "Calcul chiffré", "boucher", 1, "F2", "Et si samedi commençait jeudi ?", "Et si une partie de votre samedi se faisait le jeudi ?", "site"),
 (29, 42, "Démonstration produit", "boucher", 2, "F3", "Commander chez son boucher : 60 s.", "Commander chez son boucher en soixante secondes, côté client. Je vous montre.", "site"),
 (30, 47, "Démonstration produit", "tous", 5, "F3", "Fermé le 25 ? Réglé une fois.", "Fermé le 25 décembre et le 1er janvier ? Vous le réglez une fois, c'est fini.", "site"),
]
# Créneaux Reel secondaire : « actu » = laissé libre pour du réactif (2/semaine), sinon déclinaison du thème du jour (autre métier).
SECONDAIRE = {4: "actu", 6: "declinaison", 7: "actu", 10: "declinaison", 11: "actu", 14: "actu", 16: "declinaison",
              18: "actu", 20: "declinaison", 21: "actu", 24: "declinaison", 25: "actu", 26: "declinaison", 28: "actu", 30: "declinaison"}

def heures(d):
    wd = d.weekday()
    if wd == 6:  # dimanche après-midi
        return {"reel": "15:30", "carrousel": "10:00", "stories": ["10:30", "15:45", "21:00"], "reel_secondaire": "21:00"}
    if wd == 0:  # lundi, jour de fermeture fréquent
        return {"reel": "11:00", "carrousel": "06:30", "stories": ["06:45", "14:00", "21:00"], "reel_secondaire": "20:45"}
    return {"reel": "20:45", "carrousel": "06:30", "stories": ["06:45", "13:45", "21:15"], "reel_secondaire": "13:45"}

def utm(cid):
    return f"{SITE}?utm_source=instagram&utm_medium=social&utm_campaign=2026-11&utm_content={cid}"

def main():
    assert len(PLAN) == 30 and len({p[1] for p in PLAN}) == 30
    contenus, rows = [], []
    for j, tid, angle, metier, persona, fmt, ecran, phrase, cta in PLAN:
        d = dt.date(2026, 11, j); t = BANQUE[tid]; h = heures(d); base = d.isoformat()
        commun = dict(theme_id=tid, theme=t["titre"], pilier=t["pilier"], angle=angle, metier=metier, persona=persona, statut="idée")
        contenus.append(dict(id=f"{base}-1", date=base, type="reel_principal", format=fmt, accroche_ecran=ecran, accroche_voix=phrase,
                             cta=cta, cta_texte=CTA[cta], lien=utm(f"{base}-1") if cta == "site" else None,
                             creneau={"instagram": h["reel"], "facebook": h["reel"]}, **commun))
        contenus.append(dict(id=f"{base}-2", date=base, type="carrousel", format="F4", cta="save" if cta != "save" else "site",
                             creneau={"instagram": h["carrousel"], "facebook": h["carrousel"]}, **commun))
        contenus.append(dict(id=f"{base}-3", date=base, type="stories", format="F5", nombre=3, creneau={"instagram": h["stories"]}, **commun))
        contenus.append(dict(id=f"{base}-4", date=base, type="post_facebook", format="F6", creneau={"facebook": "12:15"}, **commun))
        if j in SECONDAIRE:
            kind = SECONDAIRE[j]
            sec = dict(id=f"{base}-5", date=base, type="reel_secondaire", creneau={"instagram": h["reel_secondaire"], "facebook": h["reel_secondaire"]})
            if kind == "actu":
                sec.update(format="à définir", theme=None, statut="créneau actu libre")
            else:
                sec.update(format="F2", **{**commun, "metier": "autre métier à choisir (déclinaison)"})
            contenus.append(sec)
        rows.append((d, t, angle, metier, persona, fmt, ecran, phrase, cta))
    (ROOT / "calendrier.json").write_text(json.dumps({"mois": "2026-11", "statut_global": "en attente de validation des thèmes par Paul", "contenus": contenus}, ensure_ascii=False, indent=2) + "\n")

    c = Counter(r[1]["pilier"] for r in rows)
    reels = sum(1 for x in contenus if x["type"].startswith("reel"))
    fc = sum(1 for r in rows if r[5] == "F1")
    ctas = Counter(r[8] for r in rows)
    L = ["# Validation des thèmes — novembre 2026", "",
         "**Paul : pour chaque ligne, laissez telle quelle (= validé) ou barrez / annotez.** Durée estimée : 20 min.", "",
         f"- 30 thèmes, 1 par jour · {reels} Reels (30 principaux + {len(SECONDAIRE)} secondaires dont {sum(1 for v in SECONDAIRE.values() if v=='actu')} créneaux « actu » laissés libres) · 30 carrousels · 90 stories · 30 posts Facebook",
         f"- Répartition des piliers : " + ", ".join(f"{k} {v} ({round(100*v/30)} %)" for k, v in c.items()),
         f"- Face cam (fond vert) à tourner : {fc} scripts · CTA : site {ctas['site']}, DÉMO {ctas['demo']}, AUDIT {ctas['audit']}, enregistrer {ctas['save']}",
         "- Personas : 1 boucher installé · 2 jeune repreneur · 3 fromager/épicier fin · 4 primeur/poissonnier · 5 conjoint qui gère l'admin",
         "", "| Date | Thème | Angle · métier · persona | Format | Accroche écran | Première phrase | CTA | OK ? |", "|---|---|---|---|---|---|---|---|"]
    for d, t, angle, metier, persona, fmt, ecran, phrase, cta in rows:
        L.append(f"| {JOURS[d.weekday()][:3]} {d.day} | {t['titre']} ({t['pilier']}) | {angle} · {metier} · P{persona} | {fmt} | {ecran} | {phrase} | {cta} | ☐ |")
    L += ["", "**Légende formats** : F1 face cam fond vert · F2 b-roll IA + voix off · F3 démo écran réelle.",
          "**Légende CTA** : site = « Créez la démo… sur marchéo.fr » · demo = « Commentez DÉMO » · audit = « Envoyez AUDIT » · save = « Enregistrez ce post ».", ""]
    (ROOT / "validation_2026-11.md").write_text("\n".join(L))
    print(dict(c), "reels", reels, "facecam", fc, dict(ctas))

if __name__ == "__main__":
    main()
