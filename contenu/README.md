# Machine à contenu Marchéo

Tout le contenu Instagram + Facebook de Marchéo est piloté depuis ce dossier.

| Fichier | Rôle |
|---|---|
| `registre_themes.json` | Thèmes déjà traités, angles utilisés, résultats (anti-répétition, 45 jours) |
| `calendrier.json` | Tous les contenus planifiés et leur statut (idée → validé → script → voix reçue → monté → planifié → publié) |
| `performances.csv` | Métriques par contenu (la métrique finale : `demos_creees`) |
| `apprentissages.md` | Ce qui marche / ne marche pas, en phrases courtes |
| `prompts_visuels.md` | Charte et descripteurs fixes pour la continuité visuelle |
| `plans_banque.json` | Banque de plans vidéo réutilisables |
| `banque_themes.json` / `.md` | Les 60 thèmes classés par pilier (générés par `scripts/banque.py`) |
| `validation_2026-11.md` | Document unique à valider par Paul pour novembre (généré par `scripts/calendrier.py`) |
| `reponses_dm.md` | Réponses types aux mots-clés DÉMO / AUDIT |
| `veille_2026-10.md` | Veille sourcée, avec niveau de confiance de chaque chiffre |
| `fiches/` | Une fiche complète par contenu |

Régénérer : `python3 contenu/scripts/banque.py && python3 contenu/scripts/calendrier.py`
