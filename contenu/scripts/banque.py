"""Source unique de la banque de thèmes. Génère banque_themes.json et banque_themes.md.
Usage : python3 contenu/scripts/banque.py"""
import json, pathlib
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
PILIERS = {
    "VAL": ("Valeur métier", 35),
    "OPI": ("Opinions tranchées", 20),
    "DEMO": ("Démonstration Marchéo", 20),
    "CRED": ("Crédibilité / coulisses", 15),
    "SAIS": ("Saisonnier / actu", 10),
}
TOUS = ["boucher", "boulanger", "fromager", "primeur", "poissonnier", "traiteur", "epicerie-fine", "caviste"]

# (id, titre, pilier, métiers prioritaires, saison / période idéale, note de veille ou contrainte)
T = [
 # --- banque de départ (1-30) ---
 (1, "Le no-show des commandes de Noël : combien ça coûte vraiment", "SAIS", ["boucher","traiteur","fromager","poissonnier"], "nov-dec", "Pas de statistique nationale trouvée : chiffrer en ESTIMATION sur un exemple (ex. 3 plateaux à 80 € non retirés)."),
 (2, "30 % de commission, c'est travailler un jour sur trois pour une plateforme", "OPI", ["traiteur","boulanger","boucher"], "toute l'année", "Fourchette publique 15–35 %, 25–30 % le plus cité (sources tierces, pas de grille officielle). Dire « jusqu'à 30 % »."),
 (3, "Le téléphone qui sonne pendant le rush : le vrai coût", "VAL", TOUS, "toute l'année", ""),
 (4, "Votre fiche Google vous fait perdre des clients (horaires faux, pas de photos)", "VAL", TOUS, "toute l'année", "Chiffres FR récents fiables introuvables ; vieux baromètre Google 2015 : horaires = 2e info cherchée (36 %). Préférer la démonstration à la statistique."),
 (5, "Les 25–40 ans ne viennent plus en boutique « par hasard »", "OPI", ["boucher","fromager","boulanger"], "toute l'année", "Kantar 2025 : proximité gagne des parts, portée par des urbains de moins de 65 ans sans enfant. Ne pas surinterpréter."),
 (6, "Le drive du supermarché vous vole vos clients du samedi", "OPI", ["boucher","primeur","fromager"], "toute l'année", "Online = ~10 % de PDM grande distribution mi-2025 (Kantar, source secondaire)."),
 (7, "Le carnet de commandes papier : erreurs et oublis", "VAL", ["boucher","traiteur","boulanger"], "toute l'année", ""),
 (8, "La file d'attente du samedi fait fuir des clients", "VAL", TOUS, "toute l'année", "Aucune donnée fiable sur le « 1 client sur X » : utiliser la méthode de comptage (thème 31) plutôt qu'un chiffre inventé."),
 (9, "« Mes clients sont âgés, ils ne commandent pas en ligne » : mythe ou réalité", "OPI", ["boucher","primeur","boulanger"], "toute l'année", ""),
 (10, "Préparer les commandes la veille : gain de temps et d'invendus", "VAL", ["boucher","primeur","poissonnier","traiteur"], "toute l'année", ""),
 (11, "L'empreinte bancaire : la fin des commandes non récupérées", "DEMO", ["traiteur","boucher","fromager"], "nov-dec en priorité", "Capture réelle de l'interface obligatoire."),
 (12, "Combien vaut un client fidèle sur 5 ans", "VAL", ["boucher","boulanger","fromager"], "toute l'année", "Calcul en estimation explicite (panier × fréquence × 5 ans). Repère fromagerie : panier moyen ~17 € (FFF, année non précisée)."),
 (13, "La carte de fidélité papier est morte", "OPI", ["boulanger","fromager","primeur"], "toute l'année", ""),
 (14, "Avis Google : comment en obtenir sans quémander", "VAL", TOUS, "toute l'année", ""),
 (15, "Le site vitrine à 2 000 € que personne ne visite", "OPI", TOUS, "toute l'année", "Jamais nommer une agence."),
 (16, "Fermeture pour congés : comment ne pas perdre ses clients", "VAL", TOUS, "fév, été, Toussaint", ""),
 (17, "Plateaux, bûches, foie gras, fruits de mer : organiser les fêtes sans chaos", "SAIS", ["traiteur","poissonnier","boulanger","boucher"], "nov-dec", ""),
 (18, "Vendre ses invendus de fin de journée intelligemment", "VAL", ["boulanger","primeur","traiteur"], "toute l'année", "Ne pas nommer d'appli anti-gaspi pour la dénigrer."),
 (19, "Le prix affiché en ligne : peur de se comparer ?", "OPI", ["boucher","fromager","primeur"], "toute l'année", ""),
 (20, "Ce que Paul a appris en 19 ans de primeur sur la fidélisation", "CRED", ["primeur"], "toute l'année", "Anecdotes à recueillir auprès de Paul (aucune invention)."),
 (21, "Le samedi à 11 h : anatomie d'un rush", "VAL", TOUS, "toute l'année", ""),
 (22, "Instagram pour un boucher : utile ou perte de temps ?", "OPI", ["boucher"], "toute l'année", ""),
 (23, "Commander pour le lendemain : le geste que vos clients attendent", "VAL", ["boulanger","boucher","traiteur"], "toute l'année", ""),
 (24, "Les commerces qui ont tenu pendant le Covid grâce au click & collect", "CRED", TOUS, "toute l'année", "Uniquement des cas réels connus de Paul ou sourcés presse."),
 (25, "Pourquoi les jeunes repreneurs modernisent en premier", "CRED", ["boucher","boulanger","fromager"], "toute l'année", "Crémeries-fromageries : ~4 000 points de vente en 2025, plus haut niveau depuis 20 ans (Bpifrance)."),
 (26, "Le panier moyen en ligne est-il plus élevé qu'au comptoir ?", "VAL", ["fromager","traiteur","epicerie-fine"], "toute l'année", "Pas de donnée vérifiée : traiter en question/hypothèse, ou attendre des chiffres réels Marchéo."),
 (27, "Combien de temps faut-il vraiment pour mettre sa boutique en ligne", "DEMO", TOUS, "toute l'année", "Chronométrer une vraie création de démo à l'écran."),
 (28, "Les erreurs de photos produits qui font fuir", "VAL", TOUS, "toute l'année", ""),
 (29, "Le récap du lundi matin : piloter sa semaine avec ses chiffres", "DEMO", TOUS, "lundis", "Fonction « Récap du lundi » présente dans l'app."),
 (30, "Réservation de produits rares (gibier, AOP, arrivage) : créer l'attente", "VAL", ["boucher","fromager","poissonnier","caviste"], "automne (gibier), arrivages", ""),
 # --- ajouts veille d'octobre 2026 (31-60) ---
 (31, "Comptez votre file d'attente samedi : la méthode en 3 colonnes (entrés / servis / repartis)", "VAL", TOUS, "toute l'année", "Tuto sans Marchéo, réutilisable comme carrousel à enregistrer."),
 (32, "Lisser le samedi : des créneaux de retrait pour étaler le rush sur la semaine", "VAL", ["boucher","fromager","primeur"], "toute l'année", ""),
 (33, "Le message de répondeur qui transforme un appel manqué en commande", "VAL", TOUS, "toute l'année", "Tuto applicable aujourd'hui, avec texte de répondeur à copier."),
 (34, "Vendre un panier prêt plutôt que des produits à l'unité (colis, plateau, box)", "VAL", ["boucher","primeur","fromager","traiteur"], "toute l'année", ""),
 (35, "Vendre au poids en ligne : prix estimé, ajusté au retrait", "VAL", ["boucher","fromager","primeur","poissonnier"], "toute l'année", "Article de blog existant : /blog/vendre-au-poids-en-ligne."),
 (36, "Le conjoint qui tient l'admin : 3 tâches à sortir du comptoir", "VAL", TOUS, "toute l'année", "Persona 5."),
 (37, "Marché + boutique : faire commander en boutique les clients du marché", "VAL", ["primeur","fromager","poissonnier"], "toute l'année", "1 fromagerie sur 4 fait aussi les marchés (Bpifrance)."),
 (38, "« Le client est roi »… sauf quand il ne vient pas chercher sa commande", "OPI", ["traiteur","boucher","boulanger"], "toute l'année", ""),
 (39, "Les promos permanentes abîment le métier d'artisan", "OPI", TOUS, "toute l'année", ""),
 (40, "Vous n'avez pas besoin d'un site, vous avez besoin qu'on puisse vous commander", "OPI", TOUS, "toute l'année", ""),
 (41, "Le fait-maison ne se vend pas s'il ne se montre pas", "OPI", ["boulanger","traiteur","boucher"], "toute l'année", ""),
 (42, "Une commande de A à Z côté client, en 60 secondes", "DEMO", TOUS, "toute l'année", "Capture réelle."),
 (43, "Une commande de A à Z côté commerçant : de la notification au retrait", "DEMO", TOUS, "toute l'année", "Capture réelle."),
 (44, "Régler son empreinte bancaire : haut ou bas, que choisir selon son commerce", "DEMO", ["traiteur","boucher","fromager","poissonnier"], "nov-dec", ""),
 (45, "La carte de fidélité à tampons, sans carton à imprimer", "DEMO", ["boulanger","fromager","primeur"], "toute l'année", ""),
 (46, "Le suivi de stock : le produit passe en « épuisé » tout seul", "DEMO", ["boulanger","traiteur","poissonnier"], "toute l'année", ""),
 (47, "Fermetures planifiées : congés et jours fériés réglés une fois pour toutes", "DEMO", TOUS, "avant vacances / fériés", ""),
 (48, "L'avis demandé après la commande : sans quémander au comptoir", "DEMO", TOUS, "toute l'année", "Se combine avec le thème 14."),
 (49, "Les 3 formules expliquées simplement, prix compris", "DEMO", TOUS, "toute l'année", "Vitrine 249 € + 19 €/mois ; C&C + Réservation 399 € + 39 €/mois (1er mois offert) ; Tout-en-un + Livraison 549 € + 59 €/mois (1er mois offert). 0 % commission, sans engagement."),
 (50, "La livraison locale par créneaux : organiser une tournée sans s'y perdre", "DEMO", ["primeur","boucher","epicerie-fine"], "toute l'année", ""),
 (51, "Fils de primeur : ce que mon père faisait sans ordinateur et qui marche encore", "CRED", ["primeur"], "toute l'année", "Anecdotes de Paul à recueillir."),
 (52, "5 ans primeur à Caen : ce que le samedi m'a appris", "CRED", ["primeur"], "toute l'année", "Anecdotes de Paul à recueillir."),
 (53, "Pourquoi j'ai créé Marchéo (et pourquoi pas une appli de plus)", "CRED", TOUS, "toute l'année", ""),
 (54, "Une journée de prospection chez les commerçants normands", "CRED", TOUS, "toute l'année", "Coulisses réelles uniquement, accord écrit de chaque commerçant filmé ou nommé."),
 (55, "Les 5 questions qu'on me pose à chaque visite de commerce", "CRED", TOUS, "toute l'année", "Questions réellement entendues (Paul les liste)."),
 (56, "Ce que je refuse de faire avec Marchéo : commission, engagement, paiement forcé", "CRED", TOUS, "toute l'année", ""),
 (57, "Facture électronique : ce qui a changé au 1er septembre 2026 et ce qui arrive en 2027", "SAIS", TOUS, "oct-nov 2026", "Réception obligatoire pour toutes les entreprises depuis le 01/09/2026 ; émission TPE/PME au 01/09/2027 ; ventes aux particuliers hors champ (e-reporting). Faire valider par une source officielle (impots.gouv.fr) avant publication. Ne pas présenter Marchéo comme solution de facturation."),
 (58, "Horaires des fêtes sur Google : le piège des 24 et 31 décembre", "SAIS", TOUS, "fin nov-déc", ""),
 (59, "Le Black Friday n'est pas fait pour l'artisan (et c'est tant mieux)", "SAIS", TOUS, "fin novembre", "Black Friday 2026 = vendredi 27 novembre."),
 (60, "Galette des rois : beurre cher, précommandes et zéro galette perdue", "SAIS", ["boulanger"], "fin déc-janv", "Beurre : forte hausse 2024-2025 (FranceAgriMer, questions parlementaires)."),
]

def main():
    themes = [dict(id=i, titre=t, pilier=p, pilier_nom=PILIERS[p][0], metiers=m, periode=s, note_veille=n,
                   statut="disponible", derniere_utilisation=None) for i, t, p, m, s, n in T]
    assert len({x["id"] for x in themes}) == len(themes) == 60
    (ROOT / "banque_themes.json").write_text(json.dumps(themes, ensure_ascii=False, indent=2) + "\n")
    c = Counter(x["pilier"] for x in themes)
    lines = ["# Banque de thèmes — 60 sujets classés par pilier", "",
             "> Fichier généré par `contenu/scripts/banque.py` (source unique). Ne pas modifier à la main.", "",
             "| Pilier | Cible | Thèmes en banque |", "|---|---|---|"]
    for k, (nom, pct) in PILIERS.items():
        lines.append(f"| {nom} | {pct} % | {c[k]} ({round(100*c[k]/60)} %) |")
    for k, (nom, pct) in PILIERS.items():
        lines += ["", f"## {nom} ({pct} %)", ""]
        for x in themes:
            if x["pilier"] == k:
                note = f" — _{x['note_veille']}_" if x["note_veille"] else ""
                lines.append(f"- **{x['id']}. {x['titre']}** · {', '.join(x['metiers']) if x['metiers'] != TOUS else 'tous métiers'} · {x['periode']}{note}")
    (ROOT / "banque_themes.md").write_text("\n".join(lines) + "\n")
    print(dict(c))

if __name__ == "__main__":
    main()
