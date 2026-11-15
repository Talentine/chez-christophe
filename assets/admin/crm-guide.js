/* CRM admin Marchéo — guide d'appel de la prospection : le script par défaut et ses fonctions pures.
 *
 * `GUIDE` est le script d'origine (étapes, variantes, réactions, objections, messagerie, SMS, créneaux par
 * métier). Il reste dans le code : ce que le fondateur modifie dans « Modifier mon script » est enregistré à
 * part (réglage `script_appel`) et posé par-dessus par `construire`. Les répliques marquées « paul » sont son
 * discours mot pour mot ; les « … » marquent l'endroit où le commerçant répond.
 *
 * Aucun accès au DOM ni au réseau : tout est testable sous Node (`require`). Dans la page, l'API est posée
 * sur `window.CRM.guide`. Chargé après crm-coeur.js et avant crm-assistant.js / crm-prospection.js.
 */
(function (racine) {
  'use strict';

  // Données au format JSON (guillemets doubles) : les répliques sont pleines d'apostrophes.
  var GUIDE = {
   "resume": "Un seul but par appel : obtenir cinq minutes à une date précise. On parle comme un ancien primeur à un commerçant, on respecte le coup de feu, on ne force jamais. La voix de Paul reste la base ; les variantes plus courtes sont proposées à côté, à tester.",
   "principes": [
    "On vend cinq minutes, pas un site. Tout ce qui explique le produit au téléphone retire une raison de prendre le rendez-vous.",
    "Une seule preuve : « primeur pendant 19 ans ». C'est ce qui sépare cet appel de tous les autres de la semaine.",
    "Chaque réplique tient en moins de 20 secondes et finit par une question simple. Après la question, on se tait.",
    "On propose deux jours, jamais « quand vous voulez » ni « est-ce que ça vous intéresse ? ».",
    "Objection : donner raison sur ce qui est vrai, une phrase de réponse, une relance vers les deux jours. Une relance par objection.",
    "Deux objections traitées sans oui : sortie propre. Un non bien quitté peut devenir un oui dans six mois.",
    "Rien de faux, rien d'invérifiable : pas de client cité, pas de chiffre sans source, pas de « démo préparée » si elle n'existe pas."
   ],
   "sources_numero": {
    "osm": "sur OpenStreetMap, une carte publique sur internet",
    "mairie": "sur la liste des commerces publiée par votre mairie",
    "import": null,
    "manuel": null
   },
   "benefices_par_metier": {
    "boulangerie": "les gâteaux et les pièces du week-end se commandent la veille, par écrit, sans téléphone devant la file",
    "patisserie": "les gâteaux se commandent par écrit, avec la date, le nombre de parts et le nom",
    "boucherie": "les commandes du week-end et les plateaux arrivent la veille, par écrit, et vous préparez au calme",
    "charcuterie": "les plateaux et les plats se commandent la veille, par écrit, et vous préparez au calme",
    "primeur": "vos clients commandent leur panier le soir, vous le préparez au calme, ils passent le prendre",
    "fromagerie": "les plateaux se commandent à l'avance, par écrit, avec le nombre de personnes et l'heure de retrait",
    "poissonnerie": "les plateaux se commandent à l'avance, et vous achetez en sachant ce qui est déjà vendu",
    "traiteur": "les commandes arrivent complètes, par écrit, avec la date et le nombre de personnes",
    "epicerie": "vos clients commandent même quand la boutique est fermée, et passent prendre leur commande toute prête",
    "caviste": "vos clients réservent leurs bouteilles en ligne et passent les prendre",
    "fleuriste": "les bouquets se commandent à l'avance, par écrit, avec la date et le message de la carte",
    "restaurant": "les commandes à emporter arrivent par écrit, avec l'heure de retrait, sans téléphone pendant le service",
    "pizzeria": "les commandes à emporter arrivent par écrit avec l'heure de retrait, sans décrocher en plein coup de feu",
    "defaut": "vos clients commandent sur internet, même quand vous êtes fermé, et passent prendre leur commande toute prête"
   },
   "etapes": [
    {
     "id": "barrage",
     "titre": "1. Quelqu'un d'autre décroche",
     "objectif": "Avoir le patron au bout du fil, ou repartir avec son prénom et la bonne heure pour rappeler. Le vendeur n'est pas un obstacle : c'est lui qui connaît l'heure creuse. On ne lui présente pas l'offre.",
     "defaut": "barrage_demande",
     "variantes": [
      {
       "id": "barrage_demande",
       "nom": "Demander le patron",
       "quand": "La voix n'est visiblement pas celle du patron, ou vous ne savez pas.",
       "texte": "Bonjour, c'est bien {le_commerce} ? … Paul Merieult. Je cherche à joindre le patron, ou la patronne. C'est vous, peut-être ?"
      },
      {
       "id": "barrage_prenom",
       "nom": "Demander par le prénom",
       "quand": "Le prénom du patron est connu. C'est la version qui passe le mieux : on demande quelqu'un, pas « le responsable ».",
       "texte": "Bonjour, Paul Merieult. Est-ce que {prenom_patron} est là, s'il vous plaît ?"
      },
      {
       "id": "barrage_sujet",
       "nom": "« C'est à quel sujet ? »",
       "quand": "La personne filtre. On dit la vérité en une phrase, sans argumenter : ce n'est pas elle qui décide.",
       "texte": "C'est au sujet des commandes de vos clients sur internet. J'ai été primeur pendant 19 ans, aujourd'hui je m'occupe de ça pour les commerces de bouche. J'en ai pour une minute avec lui. Il est disponible ?"
      },
      {
       "id": "barrage_absent",
       "nom": "Le patron n'est pas là ou il est occupé",
       "quand": "« Il n'est pas là », « il est au labo », « il sert », « il est en livraison ».",
       "texte": "Pas de souci, je ne veux pas le déranger en plein travail. C'est quoi son moment le plus calme : plutôt le matin de bonne heure, ou en début d'après-midi ? … Et je demande qui, c'est quoi son prénom ? … Merci, c'est gentil. Je rappelle à ce moment-là. Bonne journée à vous."
      },
      {
       "id": "barrage_message",
       "nom": "« Je peux prendre un message ? »",
       "quand": "La personne propose de noter. Message minuscule, et c'est vous qui rappelez.",
       "texte": "C'est gentil. Dites-lui simplement que Paul Merieult, un ancien primeur, a appelé pour les commandes sur internet. Je le rappelle moi-même, comme ça il n'a rien à faire. Il vaut mieux quelle heure ?"
      },
      {
       "id": "barrage_vendeur_refuse",
       "nom": "« Ça ne l'intéressera pas » (dit par le vendeur)",
       "quand": "Le vendeur répond à la place du patron. Une seule tentative, gentiment.",
       "texte": "Je comprends, on vous appelle souvent. Je préfère quand même lui poser la question directement. Il vaut mieux que je rappelle le matin, ou l'après-midi ?"
      }
     ],
     "reactions": [
      {
       "libelle": "C'est moi le patron / la patronne",
       "vers": "ouverture",
       "conseil": "Enchaînez sur l'ouverture à partir de « Paul Merieult », sans redire bonjour."
      },
      {
       "libelle": "Je vous le passe",
       "vers": "ouverture",
       "conseil": "Dites merci. Quand le patron prend le combiné, reprenez l'ouverture depuis le début, même si votre nom a déjà été annoncé."
      },
      {
       "libelle": "C'est à quel sujet ?",
       "vers": "barrage",
       "variante": "barrage_sujet",
       "conseil": "Une phrase vraie, puis reposez la question « il est disponible ? ». Ne jamais se présenter comme un client, un fournisseur ou un rappel attendu."
      },
      {
       "libelle": "Il n'est pas là / il est occupé",
       "vers": "barrage",
       "variante": "barrage_absent",
       "resultat": "a_rappeler",
       "conseil": "Repartez avec le prénom et l'heure creuse, et notez les deux dans la fiche avant de raccrocher. Adaptez « il » ou « elle »."
      },
      {
       "libelle": "Je peux prendre un message ?",
       "vers": "barrage",
       "variante": "barrage_message",
       "resultat": "a_rappeler",
       "conseil": "Ne dictez pas votre numéro et ne comptez pas sur un rappel : c'est vous qui rappelez, à l'heure dite."
      },
      {
       "libelle": "Ça ne l'intéressera pas (dit par le vendeur)",
       "vers": "barrage",
       "variante": "barrage_vendeur_refuse",
       "resultat": "a_rappeler",
       "conseil": "Ce n'est pas le décideur qui parle. S'il refuse encore, remerciez et raccrochez : « À rappeler » à un autre créneau, pas « Pas intéressé »."
      },
      {
       "libelle": "On ne prend pas le démarchage / ne rappelez plus",
       "vers": "sortie",
       "variante": "sortie_plus_appeler",
       "resultat": "pas_interesse",
       "conseil": "On obéit, même si c'est le vendeur qui le dit. Écrivez « NE PLUS APPELER » dans la note."
      },
      {
       "libelle": "Envoyez un mail",
       "vers": "envoyez_mail",
       "conseil": "Demandez l'adresse et le prénom du patron, et annoncez un rappel."
      },
      {
       "libelle": "Mauvais numéro / ce n'est plus ce commerce",
       "vers": "sortie",
       "variante": "sortie_faux_numero",
       "resultat": "faux_numero",
       "conseil": "Excusez-vous et raccrochez."
      }
     ]
    },
    {
     "id": "ouverture",
     "titre": "2. Ouverture",
     "objectif": "Qu'il sache en dix secondes qui vous êtes et qu'il entende « primeur pendant 19 ans ». Puis écouter sa réponse : c'est elle qui décide de la suite. Chaleureuse, vous avez 30 secondes. Sèche ou pressée, version courte tout de suite.",
     "defaut": "ouverture_paul",
     "a_tester": "ouverture_commercant",
     "variantes": [
      {
       "id": "ouverture_paul",
       "nom": "Version de Paul",
       "origine": "paul",
       "quand": "Par défaut. C'est votre voix, mot pour mot. Gardez les « euh ».",
       "texte": "Bonjour, c'est bien {le_commerce} ? … Paul Merieult, euh, j'ai été primeur pendant 19 ans, et aujourd'hui je suis dirigeant d'une entreprise de développement de sites web spécialisée dans les commerces de bouche et le click-and-collect. Vous allez bien ?"
      },
      {
       "id": "ouverture_commercant",
       "nom": "Variante à tester : entre commerçants",
       "origine": "variante",
       "quand": "À essayer une demi-journée sur deux, pour comparer. Deux changements seulement : la phrase sur l'entreprise est raccourcie, et « Vous allez bien ? » devient une question sur son temps.",
       "texte": "Bonjour, c'est bien {le_commerce} ? … Paul Merieult. Euh, on ne se connaît pas : j'ai été primeur pendant 19 ans, et aujourd'hui je m'occupe des commandes en ligne pour les commerces de bouche. Je tombe en plein service, ou vous avez trente secondes ?"
      },
      {
       "id": "ouverture_courte",
       "nom": "Version courte, 10 secondes",
       "origine": "variante",
       "quand": "Réponse sèche, bruit de boutique, « oui ? », « c'est pour quoi ? », « je suis pressé ». On saute la raison de l'appel.",
       "texte": "Je fais court, vous avez du monde. Paul Merieult, primeur pendant 19 ans. Aujourd'hui je mets en place la commande en ligne pour les commerces comme le vôtre. Je vous demande juste cinq minutes à un moment calme : plutôt {jour1} ou {jour2} ?"
      },
      {
       "id": "ouverture_rappel_vendeur",
       "nom": "Rappel : le vendeur a donné ce créneau",
       "origine": "variante",
       "quand": "Vous rappelez à l'heure indiquée par la personne qui avait décroché.",
       "texte": "Bonjour {prenom_patron}, Paul Merieult. J'ai appelé l'autre jour, on m'a dit que c'était le bon moment pour vous joindre. J'ai été primeur pendant 19 ans, et je m'occupe des commandes en ligne pour les commerces de bouche. Vous avez une minute ?"
      },
      {
       "id": "ouverture_rappel_patron",
       "nom": "Rappel : il vous a demandé de rappeler",
       "origine": "variante",
       "quand": "Le patron lui-même vous a dit de rappeler ce jour-là.",
       "texte": "Bonjour {prenom_patron}, Paul Merieult, l'ancien primeur. Vous m'aviez dit de vous rappeler aujourd'hui. C'est toujours le bon moment, vous avez deux minutes ?"
      },
      {
       "id": "ouverture_recommandation",
       "nom": "Appel sur recommandation",
       "origine": "variante",
       "quand": "Uniquement si un commerçant a réellement donné ce contact et accepté d'être cité. {recommandant} se saisit à la main.",
       "texte": "Bonjour, c'est bien {le_commerce} ? … Paul Merieult. Je vous appelle de la part de {recommandant}, qui m'a dit que ça pourrait vous parler. J'ai été primeur pendant 19 ans, et je m'occupe des commandes en ligne pour les commerces de bouche. Vous avez trente secondes ?"
      }
     ],
     "reactions": [
      {
       "libelle": "Chaleureux : « ça va, et vous ? », « je vous écoute », il rebondit sur primeur",
       "vers": "raison",
       "conseil": "Vous avez 30 secondes. S'il vous demande où vous étiez primeur, répondez-lui : c'est le meilleur moment de l'appel, ne le coupez pas pour dérouler la suite."
      },
      {
       "libelle": "Sec ou pressé : « oui ? », « c'est pour quoi ? », « faites vite »",
       "vers": "ouverture",
       "variante": "ouverture_courte",
       "conseil": "Version courte, tout de suite. Ne dites pas « ce ne sera pas long » : prouvez-le."
      },
      {
       "libelle": "En plein service / du monde en boutique",
       "vers": "pas_le_temps",
       "conseil": "Ne placez aucun argument. Prenez une heure de rappel et raccrochez."
      },
      {
       "libelle": "Ce n'est pas le patron",
       "vers": "barrage",
       "conseil": "Revenez au barrage : prénom du patron, bon moment."
      },
      {
       "libelle": "Encore un démarcheur / on m'appelle tout le temps",
       "vers": "deja_demarche",
       "conseil": "Il a raison, dites-le. Ne vous justifiez pas longtemps."
      },
      {
       "libelle": "Pas intéressé, d'entrée",
       "vers": "pas_interesse",
       "conseil": "Il refuse l'appel, pas l'offre : il ne la connaît pas. Une seule relance."
      },
      {
       "libelle": "Comment avez-vous eu mon numéro ?",
       "vers": "mon_numero",
       "conseil": "Répondez franchement, tout de suite, sans gêne."
      },
      {
       "libelle": "C'est quoi votre société ?",
       "vers": "cest_qui",
       "conseil": "Il vérifie que vous existez : c'est de l'intérêt."
      },
      {
       "libelle": "Mauvais numéro / ce n'est plus ce commerce",
       "vers": "sortie",
       "variante": "sortie_faux_numero",
       "resultat": "faux_numero",
       "conseil": "Excusez-vous et raccrochez."
      }
     ]
    },
    {
     "id": "raison",
     "titre": "3. Pourquoi j'appelle",
     "objectif": "Une raison claire et un bénéfice qu'il reconnaît dans sa journée à lui. Une idée, puis « Voilà », puis une seconde de silence. Pas de liste de fonctions : c'est le rendez-vous qui montre.",
     "defaut": "raison_metier",
     "variantes": [
      {
       "id": "raison_metier",
       "nom": "Version de Paul, avec le bénéfice du métier (recommandée)",
       "origine": "paul_adaptee",
       "quand": "Par défaut. Votre première phrase mot pour mot ; le chiffre est remplacé par ce que ça change dans son métier.",
       "texte": "Écoutez, je vous appelle parce qu'aujourd'hui je travaille avec les commerçants du secteur alimentaire, notamment sur la prise de commande sur internet. Et, euh, concrètement, pour {article_metier} : {benefice_metier}. Voilà."
      },
      {
       "id": "raison_paul",
       "nom": "Version de Paul, avec le chiffre",
       "origine": "paul",
       "avertissement": "chiffre_5_30",
       "quand": "Seulement si vous pouvez dire d'où vient le chiffre quand on vous le demande (vos propres clients, ou une source que vous pouvez nommer).",
       "texte": "Écoutez, je vous appelle parce qu'aujourd'hui je travaille avec les commerçants du secteur alimentaire, notamment sur la prise de commande sur internet. Et, euh, en moyenne, ça génère entre 5 et 30 % de chiffre d'affaires en plus sur un an. Voilà."
      },
      {
       "id": "raison_question",
       "nom": "Variante question",
       "origine": "variante",
       "quand": "Il a l'air disponible et bavard. Une seule question pour le faire parler de son commerce, puis le rendez-vous quoi qu'il réponde.",
       "texte": "Juste une question avant : aujourd'hui, quand un client veut vous passer une commande pour le week-end, il fait comment ? Il appelle, il passe, il vous écrit ? … D'accord. C'est exactement là-dessus que je travaille : que ces commandes arrivent toutes seules, par écrit, sans que vous décrochiez."
      },
      {
       "id": "raison_non_retirees",
       "nom": "En réserve : les commandes jamais retirées",
       "origine": "variante",
       "quand": "Seulement s'il en parle lui-même (« on me commande et on ne vient pas »).",
       "texte": "C'est un vrai sujet. Sur la boutique, vous pouvez demander une empreinte de carte au moment de la commande : ça vous protège contre ceux qui commandent et ne viennent pas."
      }
     ],
     "reactions": [
      {
       "libelle": "Il écoute : « oui », « ah bon », silence",
       "vers": "rdv",
       "conseil": "N'ajoutez rien. Après « Voilà », une seconde, puis le rendez-vous. Le silence d'un commerçant qui écoute n'est pas un refus."
      },
      {
       "libelle": "Et ça marche comment ?",
       "vers": "rdv",
       "conseil": "Bon signe. Une phrase, puis : « justement, c'est plus simple à voir qu'à raconter ». Pas d'explication au téléphone."
      },
      {
       "libelle": "C'est combien ?",
       "vers": "combien",
       "conseil": "Donnez le prix sans détour. Celui qui demande le prix n'est pas en train de refuser."
      },
      {
       "libelle": "D'où il sort, votre chiffre ?",
       "vers": "dou_vient_chiffre",
       "conseil": "Ne défendez pas le chiffre. Dites ce que vous savez vraiment."
      },
      {
       "libelle": "J'ai déjà un site",
       "vers": "deja_site",
       "conseil": "Demandez d'abord si on peut y commander."
      },
      {
       "libelle": "J'ai déjà Facebook / Instagram / Google",
       "vers": "deja_reseaux",
       "conseil": "Félicitez-le, c'est un atout pour la suite."
      },
      {
       "libelle": "Mes clients ne commandent pas sur internet",
       "vers": "clients_ages",
       "conseil": "Ne contredisez pas : il connaît sa clientèle mieux que vous."
      },
      {
       "libelle": "Les plateformes prennent des commissions",
       "vers": "commissions",
       "conseil": "Il vous confond avec les plateformes de livraison. Une phrase suffit."
      },
      {
       "libelle": "Je n'ai pas le temps de gérer ça",
       "vers": "pas_le_temps_gerer",
       "conseil": "C'est la vraie crainte d'un artisan seul."
      },
      {
       "libelle": "On est trop petits / ça ne marche pas chez nous",
       "vers": "trop_petits",
       "conseil": "Ne contredisez pas. Proposez de regarder sur son cas."
      },
      {
       "libelle": "J'ai déjà essayé",
       "vers": "deja_essaye",
       "conseil": "Faites-le raconter."
      },
      {
       "libelle": "Pas intéressé",
       "vers": "pas_interesse",
       "conseil": "Une relance, puis sortie."
      }
     ]
    },
    {
     "id": "rdv",
     "titre": "4. Proposer les cinq minutes",
     "objectif": "Obtenir un jour. On propose deux jours, on se tait. On vend cinq minutes, pas un site.",
     "defaut": "rdv_court",
     "variantes": [
      {
       "id": "rdv_court",
       "nom": "Version courte (recommandée)",
       "origine": "paul_adaptee",
       "quand": "Par défaut. Même début que votre version, plus directe avant la question.",
       "texte": "Ce que je vous propose, c'est simple : cinq minutes à un moment calme, je vous montre la démo que je vous ai préparée pour {article_metier}, et vous me dites si ça vous parle ou pas. Plutôt {jour1} ou {jour2} ?",
       "texte_sans_demo": "Ce que je vous propose, c'est simple : je vous prépare une démo au nom de {nom}, ça ne vous coûte rien, et on prend cinq minutes pour la regarder ensemble. Si ça ne vous parle pas, on en reste là. Plutôt {jour1} ou {jour2} ?"
      },
      {
       "id": "rdv_paul",
       "nom": "Version de Paul",
       "origine": "paul",
       "avertissement": "partout_en_france",
       "quand": "Votre texte, mot pour mot. C'est la réplique la plus longue du guide, à la limite des 20 secondes : dites-la d'une traite, sans rien ajouter.",
       "texte": "Ce que je vous propose, c'est simple : je voudrais savoir quand vous auriez 5 minutes pour voir ce qu'on met en place chez les commerçants partout en France, regarder la démo que je vous ai préparée pour {article_metier}, et voir si, et comment, on peut travailler ensemble. Plutôt {jour1} ou {jour2} ?",
       "texte_sans_demo": "Ce que je vous propose, c'est simple : je voudrais savoir quand vous auriez 5 minutes pour voir ce qu'on met en place chez les commerçants partout en France, regarder la démo que je vous prépare pour {article_metier}, et voir si, et comment, on peut travailler ensemble. Plutôt {jour1} ou {jour2} ?"
      },
      {
       "id": "rdv_heure",
       "nom": "Il a choisi un jour : fixer l'heure",
       "origine": "variante",
       "quand": "Dès qu'il dit un jour. Proposez les heures creuses de son métier.",
       "texte": "Très bien, {jour_rdv}. C'est quoi votre moment le plus calme ? Plutôt en début d'après-midi, ou après la fermeture ?"
      },
      {
       "id": "rdv_autre_jour",
       "nom": "Aucun des deux jours ne va",
       "origine": "variante",
       "quand": "« Pas cette semaine », « ni l'un ni l'autre ».",
       "texte": "Pas de souci. C'est quoi votre jour le plus calme, d'habitude ? … Et à quelle heure je vous dérange le moins ?"
      },
      {
       "id": "rdv_maintenant",
       "nom": "« Montrez-moi maintenant »",
       "origine": "variante",
       "quand": "Il a vraiment cinq minutes tout de suite.",
       "texte": "Avec plaisir. Je vous envoie le lien de la démo par SMS tout de suite, vous l'ouvrez sur votre téléphone et je vous guide. Je l'envoie sur quel numéro de portable ?",
       "texte_sans_demo": "Je préfère vous montrer une démo à votre nom plutôt qu'un exemple. Laissez-moi jusqu'à {jour1}, et on la regarde ensemble, cinq minutes. Ça vous va ?"
      }
     ],
     "reactions": [
      {
       "libelle": "Il choisit un jour",
       "vers": "rdv",
       "variante": "rdv_heure",
       "conseil": "Ne revenez plus sur l'offre. Fixez l'heure, puis verrouillez."
      },
      {
       "libelle": "L'heure est fixée",
       "vers": "conclusion",
       "conseil": "Verrouillez le reste, puis raccrochez vite."
      },
      {
       "libelle": "Envoyez-moi un mail",
       "vers": "envoyez_mail",
       "conseil": "Souvent une sortie polie. Acceptez, et fixez quand même un rappel."
      },
      {
       "libelle": "Je vais réfléchir",
       "vers": "reflechir",
       "conseil": "Il n'a encore rien vu : proposez de regarder d'abord."
      },
      {
       "libelle": "C'est combien ?",
       "vers": "combien",
       "conseil": "Répondez, puis revenez aux deux jours."
      },
      {
       "libelle": "Non",
       "vers": "pas_interesse",
       "conseil": "Une relance, pas deux. Si c'est déjà la deuxième objection de l'appel : sortie directe."
      },
      {
       "libelle": "Rappelez plus tard",
       "vers": "rappelez_plus_tard",
       "conseil": "Transformez « plus tard » en un jour et une heure."
      },
      {
       "libelle": "Ni l'un ni l'autre / pas cette semaine",
       "vers": "rdv",
       "variante": "rdv_autre_jour",
       "conseil": "Prenez son créneau à lui, même tard le soir ou un jour de fermeture. Un rendez-vous dans dix jours vaut mieux qu'un non."
      },
      {
       "libelle": "Je dois en parler à mon associé / ma femme / mon mari",
       "vers": "en_parler",
       "conseil": "Invitez l'autre personne aux cinq minutes."
      },
      {
       "libelle": "Pas en ce moment (fêtes, travaux, vacances)",
       "vers": "saison",
       "conseil": "Presque toujours vrai. Prenez une date lointaine."
      },
      {
       "libelle": "Je n'ai pas le temps de gérer ça",
       "vers": "pas_le_temps_gerer",
       "conseil": "Rassurez sur la mise en place, sans promettre « zéro travail »."
      },
      {
       "libelle": "Montrez-moi maintenant",
       "vers": "rdv",
       "variante": "rdv_maintenant",
       "conseil": "Si une démo existe, faites-le tout de suite. Sinon ne montrez pas un exemple au hasard : prenez la date."
      }
     ]
    },
    {
     "id": "conclusion",
     "titre": "5. Verrouiller le rendez-vous",
     "objectif": "Un rendez-vous flou ne tient pas. On confirme le jour, l'heure, le numéro, qui sera là et le prénom, on annonce le SMS, on raccroche. Après le oui, chaque phrase de plus est un risque.",
     "defaut": "conclusion_verrou",
     "variantes": [
      {
       "id": "conclusion_verrou",
       "nom": "Verrouillage complet",
       "origine": "variante",
       "quand": "Dès que le jour et l'heure sont donnés. Posez les questions une par une.",
       "texte": "Parfait. Donc {jour_rdv} à {heure_rdv}. Je vous rappelle sur ce numéro, ou vous avez un portable où c'est plus simple ? … Vous serez seul, ou quelqu'un décide avec vous et devrait être là aussi ? … Et c'est à quel prénom ?"
      },
      {
       "id": "conclusion_courte",
       "nom": "Verrouillage court",
       "origine": "variante",
       "quand": "Il a dit oui en coup de vent. Jour, heure, numéro, et le SMS seulement si vous avez un portable.",
       "texte": "Parfait, {jour_rdv} à {heure_rdv}. Je vous rappelle sur ce numéro ? … Très bien, je vous envoie un SMS pour confirmer. Merci, bonne journée, et bon courage pour le service.",
       "texte_sans_sms": "Parfait, {jour_rdv} à {heure_rdv}. Je vous rappelle sur ce numéro ? … Très bien, c'est noté. Merci, bonne journée, et bon courage pour le service."
      },
      {
       "id": "conclusion_boutique",
       "nom": "Il préfère que vous passiez",
       "origine": "variante",
       "quand": "C'est lui qui le propose, et la commune est à votre portée. Ne le proposez pas vous-même si vous ne pouvez pas vous déplacer.",
       "texte": "Avec plaisir. {jour_rdv} à {heure_rdv}, à la boutique à {commune}. J'en ai pour cinq minutes, et si vous avez un client, je patiente. Je vous envoie un SMS pour confirmer.",
       "texte_sans_sms": "Avec plaisir. {jour_rdv} à {heure_rdv}, à la boutique à {commune}. J'en ai pour cinq minutes, et si vous avez un client, je patiente."
      },
      {
       "id": "conclusion_recap",
       "nom": "Récapituler et raccrocher",
       "origine": "variante",
       "quand": "Toujours, juste avant de raccrocher.",
       "texte": "Je récapitule : {jour_rdv} à {heure_rdv}, {canal_rdv}, cinq minutes. Je vous envoie un SMS pour que vous l'ayez sous la main. Et si vous avez un coup de feu à ce moment-là, vous me le dites et on décale. Merci {prenom_patron}, bonne fin de journée.",
       "texte_sans_sms": "Je récapitule : {jour_rdv} à {heure_rdv}, {canal_rdv}, cinq minutes. Et si vous avez un coup de feu à ce moment-là, vous me le dites et on décale. Merci {prenom_patron}, bonne fin de journée."
      }
     ],
     "reactions": [
      {
       "libelle": "Tout est confirmé",
       "vers": "sortie",
       "resultat": "rdv",
       "conseil": "Raccrochez. Si vous avez un portable, envoyez le SMS « Confirmation de rendez-vous » dans la minute. Puis notez : jour, heure, canal, qui sera là, numéro direct, prénom. Si la démo n'existe pas encore, préparez-la avant le rendez-vous : elle est promise."
      },
      {
       "libelle": "Il veut que l'associé ou le conjoint soit là",
       "vers": "conclusion",
       "conseil": "Excellent signe. Demandez son prénom et calez l'heure sur sa disponibilité."
      },
      {
       "libelle": "Il hésite sur l'heure",
       "vers": "rdv",
       "variante": "rdv_autre_jour",
       "conseil": "Proposez l'heure creuse de son métier, ou une date plus lointaine. N'insistez pas."
      },
      {
       "libelle": "Il ne veut pas donner de portable",
       "vers": "conclusion",
       "conseil": "N'insistez pas, le fixe suffit. Pas de SMS de confirmation dans ce cas : dites « je vous rappelle sur ce numéro »."
      },
      {
       "libelle": "Il se rétracte : « finalement, envoyez un mail »",
       "vers": "envoyez_mail",
       "conseil": "Il s'est senti poussé. Ralentissez et acceptez."
      }
     ]
    },
    {
     "id": "sortie",
     "titre": "6. Sortir proprement",
     "objectif": "Quand c'est non, c'est non. Moins de quinze secondes, sans dernier argument : remercier, laisser la porte ouverte, et si le ton s'y prête, demander une recommandation.",
     "defaut": "sortie_non",
     "variantes": [
      {
       "id": "sortie_non",
       "nom": "Sortie après un refus",
       "origine": "variante",
       "quand": "Non net, ou deuxième objection non levée.",
       "texte": "Pas de souci, je n'insiste pas. Merci de m'avoir écouté, je sais que ce n'est jamais le bon moment dans un commerce. Si un jour le sujet revient, vous tapez Marchéo et vous me trouvez. Bonne journée, et bon courage pour le service."
      },
      {
       "id": "sortie_recommandation",
       "nom": "Demander une recommandation",
       "origine": "paul_adaptee",
       "quand": "Le refus est aimable et il n'est pas pressé. Jamais après un refus agacé. C'est votre consigne de refus actuelle, mise en phrases.",
       "texte": "Une dernière chose et je vous laisse. Vous connaissez un collègue commerçant, dans le coin ou ailleurs, à qui ça pourrait rendre service ? … Merci. Et ça ne vous ennuie pas si je l'appelle de votre part ?"
      },
      {
       "id": "sortie_pas_maintenant",
       "nom": "« Pas maintenant »",
       "origine": "variante",
       "quand": "Il n'a pas dit non sur le fond, seulement sur le moment.",
       "texte": "C'est noté, ce n'est pas le moment. Ça vous ennuie si je reprends de vos nouvelles dans deux ou trois mois, quand ce sera plus calme ? … Merci. Bon courage d'ici là."
      },
      {
       "id": "sortie_deja_equipe",
       "nom": "Il a déjà la commande en ligne",
       "origine": "variante",
       "quand": "Il prend déjà des commandes sur son site et il en est content.",
       "texte": "Alors vous êtes équipé, je ne vais pas vous faire perdre votre temps. Bravo, et bonne journée."
      },
      {
       "id": "sortie_plus_appeler",
       "nom": "« Ne me rappelez plus »",
       "origine": "variante",
       "quand": "Il demande à ne plus être appelé. On obéit, sans discuter.",
       "texte": "C'est noté, je vous retire de ma liste et vous n'aurez plus d'appel de ma part. Excusez-moi pour le dérangement, bonne journée."
      },
      {
       "id": "sortie_agace",
       "nom": "Il est agacé",
       "origine": "variante",
       "quand": "Ton hostile, ou il s'apprête à raccrocher.",
       "texte": "Excusez-moi pour le dérangement, bonne journée à vous."
      },
      {
       "id": "sortie_faux_numero",
       "nom": "Mauvais numéro",
       "origine": "variante",
       "quand": "Ce n'est pas, ou plus, ce commerce.",
       "texte": "Excusez-moi, je me suis trompé de numéro. Bonne journée."
      }
     ],
     "reactions": [
      {
       "libelle": "Non net, fin de l'appel",
       "vers": "sortie",
       "resultat": "pas_interesse",
       "conseil": "Notez la raison en trois mots : ce qu'il a dit, pas ce que vous avez dit."
      },
      {
       "libelle": "Il donne le nom d'un collègue",
       "vers": "sortie",
       "resultat": "pas_interesse",
       "conseil": "Notez le nom, le commerce, la commune, et s'il accepte d'être cité. Ajoutez le collègue à la liste avec « recommandé par » en remarque. Ne dites « de la part de » que s'il a dit oui."
      },
      {
       "libelle": "D'accord pour un rappel dans quelques mois",
       "vers": "sortie",
       "resultat": "a_rappeler",
       "conseil": "Une vraie date, et la raison dans la note pour l'évoquer en ouvrant le prochain appel."
      },
      {
       "libelle": "Ne plus appeler",
       "vers": "sortie",
       "variante": "sortie_plus_appeler",
       "resultat": "pas_interesse",
       "conseil": "Écrivez « NE PLUS APPELER, demandé le [date] » dans la note. C'est une obligation, pas une politesse. Ne supprimez pas la fiche : il serait réimporté et rappelé."
      },
      {
       "libelle": "Déjà équipé et content",
       "vers": "sortie",
       "variante": "sortie_deja_equipe",
       "resultat": "deja_site",
       "conseil": "Ne critiquez ni son site ni celui qui l'a fait."
      }
     ]
    }
   ],
   "objections": [
    {
     "id": "pas_le_temps",
     "libelle": "Pas le temps / je suis en plein service",
     "sens_cache": "Presque toujours vrai : il a des clients devant lui ou les mains dans la préparation. C'est un mauvais moment, pas un refus.",
     "reponse": "Je vous laisse, vous avez du monde, je sais ce que c'est. Dites-moi juste : c'est quoi votre moment calme ?",
     "relance": "Je vous rappelle {jour1} à cette heure-là, ça vous va ?",
     "si_refus": "a_rappeler",
     "conseil": "Dix secondes, aucun argument. Sans heure obtenue, rappelez à l'heure creuse de son métier. S'il redit « pas le temps » au rappel suivant, sortie propre."
    },
    {
     "id": "pas_interesse",
     "libelle": "Pas intéressé",
     "sens_cache": "Dit dans les dix premières secondes, c'est un réflexe contre le démarchage : il ne sait pas encore ce que vous proposez. Dit après avoir écouté, c'est un vrai non.",
     "reponse": "Je comprends, vous ne m'avez rien demandé. Je vous pose juste une question et je vous laisse : aujourd'hui, vos clients vous passent des commandes à l'avance, par téléphone ou par message ?",
     "relance": "C'est exactement ça que je simplifie. Cinq minutes pour vous montrer, et si ça ne vous parle pas, je ne vous rappelle plus. {jour1} ou {jour2} ?",
     "sinon": {
      "quand": "Il répond non à la question, ou redit qu'il n'est pas intéressé.",
      "vers": "sortie",
      "variante": "sortie_non",
      "resultat": "pas_interesse"
     },
     "si_refus": "pas_interesse",
     "conseil": "Une seule relance, et seulement s'il a répondu oui à la question. Tenez « je ne vous rappelle plus » s'il refuse après avoir regardé."
    },
    {
     "id": "deja_site",
     "libelle": "J'ai déjà un site",
     "sens_cache": "Trois cas : un site vitrine sans commande (bonne piste), un site avec commande qui marche (pas une piste), un site fait par un proche que personne ne met à jour (bonne piste, sujet sensible). Il faut le savoir avant de répondre.",
     "reponse": "Très bien, c'est déjà un pas de fait. Et sur votre site, vos clients peuvent commander et payer, ou c'est plutôt pour vous présenter ?",
     "relance": "Alors on ne fait pas la même chose : moi, c'est la commande. Je ne touche à rien, je vous montre en cinq minutes ce que ça ajoute à ce que vous avez déjà. {jour1} ou {jour2} ?",
     "sinon": {
      "quand": "Il prend déjà des commandes en ligne et il en est content.",
      "vers": "sortie",
      "variante": "sortie_deja_equipe",
      "resultat": "deja_site"
     },
     "si_refus": "deja_site",
     "conseil": "Ne critiquez jamais son site ni la personne qui l'a fait. Notez dans la remarque si le site prend des commandes ou non."
    },
    {
     "id": "deja_reseaux",
     "libelle": "J'ai déjà Facebook / Instagram / Google",
     "sens_cache": "Il pense que « être sur internet », c'est réglé. Il a raison sur la visibilité, mais il prend encore les commandes en message privé ou au téléphone.",
     "reponse": "C'est très bien, ça veut dire que vos clients vous suivent déjà. Quand quelqu'un veut vous commander quelque chose, il fait comment ? Il vous écrit, il vous appelle ?",
     "relance": "Justement : avec un lien sur votre page, il commande tout seul, et vous avez moins de messages à traiter le soir. Je vous montre en cinq minutes, {jour1} ou {jour2} ?",
     "si_refus": "pas_interesse",
     "conseil": "Les réseaux sont un allié. Si vous avez regardé sa page avant d'appeler, citez une vraie publication ; sinon n'inventez rien."
    },
    {
     "id": "clients_ages",
     "libelle": "Mes clients ne commandent pas sur internet / ils sont âgés",
     "sens_cache": "Il a peur de payer pour un outil que personne n'utilisera. Pour ses habitués, il a raison. Il ne pense pas à ceux qu'il ne voit pas.",
     "reponse": "Vous avez raison, vos habitués continueront à venir comme avant, et c'est très bien. Moi je pense aux autres : ceux qui travaillent quand vous êtes ouvert, et qui commandent le soir depuis leur téléphone.",
     "relance": "Je ne sais pas si ça prendrait chez vous, je ne vais pas vous le promettre. Cinq minutes pour regarder ensemble, et vous jugez. {jour1} ou {jour2} ?",
     "si_refus": "pas_interesse",
     "conseil": "Aucune statistique sur les seniors et internet, et jamais « tout le monde commande en ligne aujourd'hui » : dans un village il sait que c'est faux."
    },
    {
     "id": "combien",
     "libelle": "C'est combien ?",
     "sens_cache": "Question d'acheteur, ou test pour voir si vous tournez autour du pot. Dans les deux cas, répondre franchement fait gagner sa confiance.",
     "reponse": "Je vous le dis franchement. Pour la commande en ligne, c'est {prix_installation} euros d'installation, une seule fois, puis {prix_mensuel} euros par mois. Sans engagement, et sans commission sur vos ventes.",
     "relance": "Après, ça vaut ce prix-là ou pas, ça dépend de ce que vous voyez. Regarder ne vous coûte rien : l'installation ne se paie qu'à la mise en ligne. {jour1} ou {jour2} ?",
     "si_refus": "pas_interesse",
     "conseil": "On annonce l'offre Click & Collect, celle dont vous parlez, pas le « à partir de » de l'offre Vitrine qui ne prend pas de commandes. Les montants affichés sont ceux de l'offre en vigueur : lisez-les tels quels. Pas de négociation ni de remise au téléphone. « Premier mois offert » : seulement si vous confirmez que c'est en cours. S'il trouve ça cher et refuse : « Pas intéressé », avec « prix » en note."
    },
    {
     "id": "envoyez_mail",
     "libelle": "Envoyez-moi un mail",
     "sens_cache": "Le plus souvent une façon polie de raccrocher ; parfois il veut vraiment voir avant de parler. On ne sait pas lequel, donc on dit oui et on fixe une date.",
     "reponse": "Avec plaisir. Je vous envoie le lien de la démo que j'ai préparée à votre nom, c'est plus parlant qu'un long mail. C'est quelle adresse ? … Et c'est à quel prénom ?",
     "reponse_sans_demo": "Avec plaisir. Je vous prépare une démo à votre nom et je vous envoie le lien, c'est plus parlant qu'un long mail. C'est quelle adresse ? … Et c'est à quel prénom ?",
     "relance": "Vous regardez ça tranquillement, et je vous rappelle deux minutes pour avoir votre avis : {jour1} ou {jour2} ?",
     "si_refus": "interesse",
     "conseil": "Adresse et date de rappel : « À rappeler », avec la date. Adresse sans date : « Intéressé », un seul rappel une semaine plus tard. Pas d'adresse : c'était un non, sortie propre, « Pas intéressé ». Le mail part le jour même ; si la démo est à préparer, dites-le et tenez le délai."
    },
    {
     "id": "en_parler",
     "libelle": "Je dois en parler à mon associé / ma femme / mon mari",
     "sens_cache": "Souvent vrai : dans un commerce de bouche, le conjoint tient la caisse et les comptes. Parfois un abri. La bonne réponse est la même : faire venir l'autre.",
     "reponse": "Bien sûr, c'est normal, ça se décide à deux. Et à ce stade il n'y a rien à décider : c'est juste cinq minutes pour regarder.",
     "relance": "Le plus simple, c'est de regarder tous les deux en même temps, comme ça vous n'avez pas à lui expliquer. Vous êtes là tous les deux plutôt {jour1} ou {jour2} ?",
     "si_refus": "a_rappeler",
     "conseil": "Demandez le prénom de l'autre personne et notez-le. Ne demandez jamais « qui décide ? ». S'il veut d'abord en parler seul : rappel daté."
    },
    {
     "id": "deja_demarche",
     "libelle": "J'ai déjà été démarché / on m'appelle tout le temps",
     "sens_cache": "Il est fatigué des plateformes, des fournisseurs d'énergie et des agences de référencement, et il vous met dans le même sac. Parfois il s'est déjà fait avoir. La seule réponse que les autres ne peuvent pas donner, c'est le métier.",
     "reponse": "Je vous crois, vous devez en recevoir toutes les semaines. La différence, c'est que j'ai passé 19 ans de votre côté du comptoir, comme primeur. Et je ne vous vends rien au téléphone.",
     "relance": "Je vous demande cinq minutes pour vous montrer, et si ça ne vous parle pas, vous ne m'entendez plus. {jour1} ou {jour2} ?",
     "si_refus": "pas_interesse",
     "conseil": "S'il raconte une mauvaise expérience, écoutez jusqu'au bout sans défendre la profession, et notez-la. Aucun mal des autres démarcheurs."
    },
    {
     "id": "commissions",
     "libelle": "Les plateformes prennent des commissions",
     "sens_cache": "Il vous confond avec les plateformes de livraison. Bonne nouvelle : c'est précisément votre différence.",
     "reponse": "Vous avez raison de vous méfier, et justement ce n'est pas une plateforme. C'est votre boutique, à votre nom, avec vos clients à vous. Marchéo ne prend aucune commission sur vos ventes : c'est un abonnement fixe.",
     "relance": "Je vous montre comment ça marche, et ce que ça coûte exactement, en cinq minutes. {jour1} ou {jour2} ?",
     "si_refus": "pas_interesse",
     "conseil": "Ne citez aucune plateforme et aucun taux de commission. S'il demande les frais de paiement par carte : ne dites pas « aucun frais ». Les paiements passent par un prestataire de paiement ; donnez le détail exact si vous le connaissez, sinon « je vous le donne précisément {jour1} », et faites-le."
    },
    {
     "id": "pas_le_temps_gerer",
     "libelle": "Je n'ai pas le temps de gérer ça",
     "sens_cache": "La vraie peur : un outil de plus, des photos, des prix à tenir à jour, des commandes qui tombent en plein service. Il fait déjà des semaines très longues.",
     "reponse": "C'est la bonne question. C'est moi qui prépare la boutique à votre nom, vous ne partez pas de zéro. Ensuite ça se gère depuis votre téléphone, et c'est vous qui fixez les jours, les heures et le nombre de commandes par créneau.",
     "relance": "Regardez cinq minutes ce que ça vous demanderait vraiment, et vous jugez. {jour1} ou {jour2} ?",
     "si_refus": "pas_interesse",
     "conseil": "Ne promettez pas « zéro travail » : il y aura des commandes à préparer et des produits à tenir à jour, dites-le. « C'est moi qui prépare la boutique » doit correspondre à ce que vous faites vraiment pour chaque client. S'il dit « pas maintenant, on est en sous-effectif » : rappel dans deux ou trois mois."
    },
    {
     "id": "rappelez_plus_tard",
     "libelle": "Rappelez plus tard",
     "sens_cache": "Sans date, « plus tard » veut dire jamais. Avec une date, c'est presque un rendez-vous. Celui qui est sincère en donne une.",
     "reponse": "Avec plaisir. Pour ne pas vous déranger encore au mauvais moment, dites-moi : quel jour, et vers quelle heure, vous êtes le plus tranquille ?",
     "relance": "Très bien, je note et je vous rappelle à ce moment-là. C'est bien vous que je demande ? Votre prénom ?",
     "si_refus": "a_rappeler",
     "conseil": "Rappelez exactement à l'heure dite. « Après les fêtes », « à la rentrée » : prenez-le au mot et notez le mois. Au troisième « rappelez plus tard » sans date, posez la question franchement : « vous préférez que j'arrête de vous appeler ? », et respectez la réponse."
    },
    {
     "id": "mon_numero",
     "libelle": "Comment avez-vous eu mon numéro ?",
     "sens_cache": "Méfiance, surtout sur un portable. Il veut savoir s'il a affaire à quelqu'un d'honnête. Une réponse nette désamorce, une réponse floue confirme ses soupçons.",
     "reponse": "C'est le numéro de votre commerce, tel qu'il est affiché publiquement : je l'ai trouvé {source_numero}. Et si vous préférez que je ne vous rappelle pas, dites-le-moi, je vous retire de ma liste tout de suite.",
     "relance": "Puisque je vous ai, je peux vous dire en vingt secondes pourquoi je vous appelais ?",
     "si_refus": "pas_interesse",
     "conseil": "Dites la source réelle de ce prospect. Pour une liste importée ou une saisie à la main, l'outil ne la connaît pas : c'est à vous de savoir d'où elle vient avant d'appeler. Ne dites « je n'achète pas de fichiers » que si c'est vrai pour ce numéro. S'il demande à être retiré : sortie « ne me rappelez plus »."
    },
    {
     "id": "trop_petits",
     "libelle": "Ça ne marche pas chez nous / on est trop petits",
     "sens_cache": "Il pense que c'est fait pour les villes ou pour les gros. Parfois quelqu'un du coin a essayé et arrêté. Il connaît sa commune mieux que vous.",
     "reponse": "C'est possible, je ne vais pas vous dire le contraire sans connaître {commune}. Mais c'est fait pour les petits commerces justement, pas pour les grandes enseignes. Et regarder ne vous coûte rien.",
     "relance": "Cinq minutes, on regarde ensemble si ça a du sens chez vous, et si ça n'en a pas, je vous le dirai. {jour1} ou {jour2} ?",
     "si_refus": "pas_interesse",
     "conseil": "Aucun exemple de « petit commerce qui cartonne » qui ne soit pas un vrai client, nommé avec son accord. Tenez la promesse « je vous le dirai »."
    },
    {
     "id": "deja_essaye",
     "libelle": "J'ai déjà essayé, ça n'a rien donné",
     "sens_cache": "Il a payé pour un outil qui n'a pas servi et ne veut pas se faire avoir deux fois.",
     "reponse": "Ah, ça m'intéresse. C'était quoi, et qu'est-ce qui n'a pas marché ?",
     "relance": "Je comprends mieux. Je ne vous promets pas que ce sera différent, je vous propose de regarder cinq minutes et de me dire. {jour1} ou {jour2} ?",
     "si_refus": "pas_interesse",
     "conseil": "Laissez-le parler longtemps. Notez l'outil et la raison de l'échec. Ne dénigrez pas l'outil qu'il cite."
    },
    {
     "id": "cest_qui",
     "libelle": "C'est quoi votre société ? Vous êtes où ?",
     "sens_cache": "Il vérifie que vous existez. C'est de l'intérêt, pas de l'hostilité.",
     "reponse": "Ça s'appelle Marchéo. C'est une entreprise française, spécialisée dans les commerces de bouche. Vous pouvez taper le nom pendant qu'on se parle : tout est affiché, les prix aussi.",
     "relance": "Et le plus simple reste de regarder ensemble, cinq minutes. {jour1} ou {jour2} ?",
     "si_refus": "pas_interesse",
     "conseil": "Donnez votre nom complet et épelez-le s'il le demande. S'il demande où vous êtes installé, dites la vraie ville."
    },
    {
     "id": "reflechir",
     "libelle": "Je vais réfléchir",
     "sens_cache": "Il n'a pas assez d'éléments pour décider, ou il n'ose pas dire non. Il n'a encore rien vu.",
     "reponse": "Vous avez raison de ne pas décider au téléphone. Mais pour réfléchir, il faut avoir quelque chose sous les yeux, et là vous n'avez rien vu.",
     "relance": "Regardez d'abord, cinq minutes, et ensuite vous réfléchissez tranquillement. {jour1} ou {jour2} ?",
     "si_refus": "a_rappeler",
     "conseil": "S'il maintient, convenez d'un rappel daté. Ne dites pas « réfléchir à quoi ? »."
    },
    {
     "id": "saison",
     "libelle": "Pas en ce moment : les fêtes, les vacances, des travaux",
     "sens_cache": "Presque toujours vrai chez un commerçant de bouche. Insister pendant une période de pointe abîme la relation.",
     "reponse": "C'est noté, ce n'est vraiment pas le moment, et je ne vais pas vous en rajouter.",
     "relance": "Je reprends de vos nouvelles quand ce sera plus calme : c'est quand, pour vous ? Plutôt dans un mois, ou dans deux ?",
     "si_refus": "a_rappeler",
     "conseil": "Date et raison dans la note. Aucun argument : il vous saura gré de ne pas avoir insisté."
    },
    {
     "id": "dou_vient_chiffre",
     "libelle": "D'où il sort, votre chiffre ?",
     "sens_cache": "Il a entendu « 5 à 30 % » et il teste. Défendre un chiffre qu'on ne peut pas appuyer fait perdre toute la confiance gagnée avec « primeur pendant 19 ans ».",
     "reponse": "Vous avez raison de demander. Ça dépend vraiment du commerce, et je ne vais pas vous promettre un chiffre au téléphone.",
     "relance": "Je préfère vous montrer ce que ça donnerait chez vous, et vous jugez. {jour1} ou {jour2} ?",
     "si_refus": "pas_interesse",
     "conseil": "Si le chiffre vient réellement de vos clients, et seulement dans ce cas, vous pouvez dire : « c'est ce que je constate chez les commerçants que j'accompagne, ça varie beaucoup, d'où la fourchette ». Sinon, passez à la version sans chiffre pour les appels suivants."
    }
   ],
   "messagerie": {
    "regle": "Rien au premier appel sans réponse. Un message court au deuxième, 20 à 25 secondes dit lentement. Pas de chiffre, pas de prix, pas de « rappelez-moi d'urgence » : seulement de quoi être reconnu au prochain appel. C'est vous qui rappelez.",
    "resultat": "messagerie",
    "variantes": [
     {
      "id": "vocal_15s",
      "nom": "Message court (20 à 25 secondes)",
      "quand": "Deuxième appel sans réponse.",
      "texte": "Bonjour, Paul Merieult. J'ai été primeur pendant 19 ans, et aujourd'hui je m'occupe des commandes en ligne pour les commerces de bouche. Je voulais vous en dire un mot pour {article_metier}. Je vous rappelle {jour1}, vous n'avez rien à faire. Paul Merieult, {tel_paul}. Bonne journée."
     },
     {
      "id": "vocal_demo",
      "nom": "Message quand la démo est prête",
      "quand": "Deuxième appel sans réponse, et une démo au nom du commerce existe réellement.",
      "texte": "Bonjour, Paul Merieult, ancien primeur. J'ai préparé une démo de commande en ligne au nom de {nom}, et je voulais vous la montrer, cinq minutes. Je vous rappelle {jour1}. Paul Merieult, {tel_paul}. Bonne journée.",
      "texte_sans_demo": "Bonjour, Paul Merieult. J'ai été primeur pendant 19 ans, et aujourd'hui je m'occupe des commandes en ligne pour les commerces de bouche. Je voulais vous en dire un mot pour {article_metier}. Je vous rappelle {jour1}, vous n'avez rien à faire. Paul Merieult, {tel_paul}. Bonne journée."
     },
     {
      "id": "vocal_dernier",
      "nom": "Dernier message",
      "quand": "Dernière tentative, après plusieurs appels sur plusieurs semaines. Il annonce que vous arrêtez, et vous arrêtez.",
      "texte": "Bonjour, Paul Merieult. J'ai essayé de vous joindre plusieurs fois au sujet de la commande en ligne pour {article_metier}, je ne veux pas vous déranger davantage. Si le sujet vous intéresse un jour, je suis au {tel_paul}. Bonne continuation."
     }
    ],
    "cadence": [
     "Appel 1 sans réponse : ne rien laisser. « Pas de réponse ». Rappeler deux jours plus tard, à un autre moment de la journée.",
     "Appel 2 sans réponse : message court, 20 à 25 secondes. « Messagerie ».",
     "Appel 3 : le jour annoncé dans le message, à un troisième horaire. Tenir cette parole compte, même si personne n'a écouté.",
     "Appel 4, une à deux semaines plus tard : dernier message, puis laisser le commerce tranquille au moins trois mois."
    ],
    "conseils": [
     "Si c'est l'annonce de la boutique (« nous sommes fermés le lundi… »), ne laissez pas de message : notez le jour de fermeture dans la fiche et rappelez un autre jour.",
     "Deux messages au plus par commerce : celui du deuxième appel et le dernier.",
     "Tenez la promesse : rappelez le jour annoncé."
    ]
   },
   "sms": {
    "regle": "SMS courts, signés du nom complet, sans lien dans un premier message à quelqu'un qui ne vous a jamais parlé. Uniquement sur un numéro de portable. Les SMS qui suivent une conversation ne posent pas de difficulté ; le SMS après appel sans réponse est de la prospection : désactivé par défaut, voir les notes légales.",
    "modeles": [
     {
      "id": "confirmation_rdv",
      "nom": "Confirmation de rendez-vous",
      "quand": "Dans la minute qui suit l'appel où le rendez-vous est pris, sur le portable qu'il vous a donné.",
      "actif_par_defaut": true,
      "texte": "Bonjour {prenom_patron}, Paul Merieult (Marchéo). Merci pour votre accueil. C'est noté : {jour_rdv} à {heure_rdv}, {canal_rdv}, 5 minutes pour regarder la démo de {nom}. Un imprévu ? Répondez à ce SMS et on décale. Bonne journée.",
      "texte_sans_demo": "Bonjour {prenom_patron}, Paul Merieult (Marchéo). Merci pour votre accueil. C'est noté : {jour_rdv} à {heure_rdv}, {canal_rdv}, 5 minutes pour regarder la démo que je prépare pour {nom}. Un imprévu ? Répondez à ce SMS et on décale. Bonne journée."
     },
     {
      "id": "rappel_veille",
      "nom": "Rappel la veille",
      "quand": "La veille du rendez-vous, en fin d'après-midi.",
      "actif_par_defaut": true,
      "texte": "Bonjour {prenom_patron}, Paul Merieult. C'est toujours bon pour demain à {heure_rdv}, 5 minutes, comme convenu ? Si ça tombe mal, dites-le-moi et on décale."
     },
     {
      "id": "rdv_manque",
      "nom": "Rendez-vous manqué",
      "quand": "Il n'a pas décroché à l'heure du rendez-vous. Aucun reproche.",
      "actif_par_defaut": true,
      "texte": "Bonjour {prenom_patron}, Paul Merieult. Je viens d'essayer de vous joindre, vous devez avoir du monde, ce n'est pas grave. Je vous propose {jour1} ou {jour2}, à l'heure qui vous arrange. Dites-moi."
     },
     {
      "id": "apres_demande_mail",
      "nom": "Après « envoyez-moi un mail »",
      "quand": "Il a demandé un mail et a donné son portable. Évite que le mail se perde.",
      "actif_par_defaut": true,
      "texte": "Bonjour {prenom_patron}, Paul Merieult. Comme promis, je viens de vous envoyer par mail le lien de la démo de {nom}. Je vous rappelle {jour_rappel} pour avoir votre avis. Bonne journée.",
      "texte_sans_demo": "Bonjour {prenom_patron}, Paul Merieult. Comme promis, je prépare la démo de {nom} et je vous envoie le lien par mail dès qu'elle est prête. Je vous rappelle {jour_rappel} pour avoir votre avis. Bonne journée."
     },
     {
      "id": "apres_sans_reponse",
      "nom": "Après un appel sans réponse",
      "quand": "Après le message vocal du deuxième appel, sur un portable présenté comme le numéro du commerce. Une seule fois par commerce.",
      "actif_par_defaut": false,
      "avertissement": "sms_prospection",
      "texte": "Bonjour, Paul Merieult, ancien primeur. J'ai essayé de joindre {nom} au sujet de la commande en ligne. Je vous rappelle {jour1}. Si vous préférez ne pas être rappelé, répondez STOP."
     }
    ],
    "conseils": [
     "Si quelqu'un répond STOP ou demande à ne plus être contacté : « NE PLUS APPELER » dans la note, et plus aucun message.",
     "Un SMS avec des accents est découpé en morceaux de 70 caractères environ : ces modèles tiennent en trois ou quatre morceaux, ne les allongez pas.",
     "Pas de SMS de remerciement après un refus : il a dit non, on le laisse tranquille."
    ]
   },
   "conseils": [
    {
     "theme": "Avant d'appeler",
     "texte": "Trente secondes sur la fiche : métier, commune, prénom du patron s'il est connu, coup d'œil à sa présence en ligne. S'il a déjà la commande en ligne, ne l'appelez pas."
    },
    {
     "theme": "Ton",
     "texte": "Parlez comme à un confrère. Vous avez fait un métier voisin du sien : rien à prouver, rien à lui apprendre sur son commerce."
    },
    {
     "theme": "Ton",
     "texte": "Vouvoiement du début à la fin, même s'il vous tutoie."
    },
    {
     "theme": "Débit",
     "texte": "Une idée par phrase, une respiration après votre nom, une autre après « 19 ans ». Debout et souriant, ça s'entend."
    },
    {
     "theme": "Débit",
     "texte": "Gardez vos « euh ». Ne lisez pas le texte : un coup d'œil, puis vous parlez. Un discours trop lisse sonne comme un centre d'appels."
    },
    {
     "theme": "Silence",
     "texte": "Après « plutôt {jour1} ou {jour2} ? », taisez-vous. Comptez jusqu'à quatre. Pas de troisième jour, pas d'argument en plus."
    },
    {
     "theme": "Écoute",
     "texte": "S'il se met à parler de son commerce, de la saison, de ses soucis : écoutez et relancez. Une minute où il parle vaut mieux que tous vos arguments."
    },
    {
     "theme": "Coup de feu",
     "texte": "Vous entendez la sonnette, la caisse, un client ? Proposez vous-même de rappeler, avant qu'il le demande. Il s'en souviendra."
    },
    {
     "theme": "Objections",
     "texte": "Deux objections, pas trois. Après la deuxième réponse sans rendez-vous, sortie propre. Un commerçant forcé ne rappelle jamais, et il en parle à ses voisins."
    },
    {
     "theme": "Objections",
     "texte": "Jamais « oui mais ». Dites « vous avez raison » sur ce qui est vrai, puis votre phrase. S'il a raison sur toute la ligne, dites-le et sortez."
    },
    {
     "theme": "Objections",
     "texte": "Ne dénigrez jamais un concurrent, une plateforme ou son prestataire actuel."
    },
    {
     "theme": "Le but de l'appel",
     "texte": "Dès que vous expliquez comment ça marche, vous donnez au téléphone ce que le rendez-vous montre mieux. Réponse type : « justement, c'est plus simple à voir qu'à raconter »."
    },
    {
     "theme": "Honnêteté",
     "texte": "« La démo que je vous ai préparée » seulement si elle existe ; sinon « la démo que je vous prépare ». Si vous ne savez pas : « je vérifie et je vous le dis {jour1} »."
    },
    {
     "theme": "Promesses",
     "texte": "Tout ce qui est promis au téléphone se fait le jour même : le SMS, le mail, le rappel à l'heure dite, la démo prête avant le rendez-vous. Chez un artisan, la parole tenue est le premier argument."
    },
    {
     "theme": "Consigner",
     "texte": "Résultat et note avant de composer le numéro suivant : prénom du patron, prénom de la personne qui a décroché, objection entendue mot pour mot, heure où il est joignable."
    },
    {
     "theme": "Rythme",
     "texte": "Des séries de 45 minutes à une heure, sur un seul métier : après trois bouchers, vous avez leurs mots en bouche. Une vraie pause entre deux séries."
    },
    {
     "theme": "Rythme",
     "texte": "Beaucoup d'appels ne décrochent pas, c'est normal. Comptez les conversations avec un patron et les rendez-vous par série, pas les numéros composés."
    },
    {
     "theme": "Tester",
     "texte": "Une seule chose à la fois (par exemple l'ouverture « entre commerçants » contre la vôtre), sur une trentaine de conversations chacune avant de conclure. Les résultats d'appel du CRM servent à ça."
    }
   ],
   "creneaux_par_metier": {
    "note": "Repères de terrain non mesurés, à corriger avec les résultats réels des appels. L'heure creuse donnée par le vendeur ou le patron, et les horaires de la fiche, priment toujours sur ce tableau.",
    "boulangerie": {
     "meilleurs": [
      "14 h 00 – 15 h 30, du mardi au vendredi"
     ],
     "possibles": [
      "9 h 30 – 10 h 30 (entre le coup de feu du matin et celui du midi)"
     ],
     "eviter": [
      "avant 9 h 00",
      "11 h 30 – 13 h 30",
      "après 16 h 00 (sortie d'école puis de bureau)",
      "le dimanche matin",
      "les deux semaines avant Noël, la semaine de l'Épiphanie"
     ],
     "remarque": "Le boulanger travaille de nuit et dort souvent en début d'après-midi : c'est fréquemment la conjointe ou le conjoint qui décroche, et qui décide autant que lui. Ne la ou le traitez pas en barrage. Jour de fermeture très variable."
    },
    "patisserie": {
     "meilleurs": [
      "14 h 00 – 16 h 00, du mardi au jeudi"
     ],
     "possibles": [
      "9 h 30 – 10 h 30"
     ],
     "eviter": [
      "vendredi et samedi",
      "le dimanche matin",
      "décembre, les deux semaines avant Pâques, la Saint-Valentin, la fête des Mères"
     ],
     "remarque": "Les commandes de gâteaux par téléphone leur prennent du temps : c'est leur point sensible."
    },
    "boucherie": {
     "meilleurs": [
      "15 h 00 – 16 h 00, mardi, mercredi et jeudi"
     ],
     "possibles": [
      "8 h 30 – 9 h 30 en début de semaine (mise en place, peu de clients)"
     ],
     "eviter": [
      "10 h 00 – 12 h 45",
      "12 h 45 – 15 h 00 (souvent fermé)",
      "après 16 h 30",
      "le vendredi après-midi et le samedi",
      "le lundi (souvent fermé)",
      "la semaine avant Noël et avant Pâques"
     ],
     "remarque": "Beaucoup ferment entre 12 h 30 ou 13 h 00 et 15 h 00 : personne ne répondra. Visez la réouverture, avant le retour des clients."
    },
    "charcuterie": {
     "meilleurs": [
      "15 h 00 – 16 h 00, du mardi au jeudi"
     ],
     "possibles": [],
     "eviter": [
      "la fin de matinée",
      "vendredi et samedi",
      "décembre"
     ],
     "remarque": "Même rythme qu'une boucherie."
    },
    "primeur": {
     "meilleurs": [
      "14 h 00 – 16 h 00, du mardi au jeudi"
     ],
     "possibles": [
      "10 h 00 – 11 h 00 une fois l'étal monté, hors jour de marché"
     ],
     "eviter": [
      "avant 9 h 30 (retour du marché de gros, mise en rayon)",
      "11 h 00 – 13 h 00",
      "après 17 h 00",
      "le samedi",
      "les jours de marché pour ceux qui en font"
     ],
     "remarque": "Votre terrain : vous savez mieux que ce tableau. Dites d'entrée que c'était votre métier."
    },
    "fromagerie": {
     "meilleurs": [
      "14 h 30 – 16 h 00, du mardi au jeudi"
     ],
     "possibles": [
      "9 h 30 – 10 h 30"
     ],
     "eviter": [
      "10 h 30 – 12 h 30",
      "après 17 h 00",
      "le vendredi après-midi et le samedi",
      "décembre à partir du 10"
     ],
     "remarque": "Beaucoup font aussi les marchés : demandez quels jours ils sont en boutique."
    },
    "poissonnerie": {
     "meilleurs": [
      "14 h 30 – 16 h 00, mardi et mercredi"
     ],
     "possibles": [],
     "eviter": [
      "toute la matinée",
      "le jeudi après-midi et le vendredi (gros jour)",
      "le samedi",
      "le lundi (souvent fermé)",
      "la semaine avant Noël et le Nouvel An"
     ],
     "remarque": "Certaines sont fermées l'après-midi en début de semaine : vérifiez les horaires sur la fiche."
    },
    "traiteur": {
     "meilleurs": [
      "14 h 30 – 16 h 00, du mardi au jeudi"
     ],
     "possibles": [
      "9 h 00 – 10 h 00 en début de semaine"
     ],
     "eviter": [
      "10 h 30 – 13 h 30",
      "après 17 h 30",
      "du jeudi après-midi au samedi (préparation des commandes du week-end)"
     ],
     "remarque": "Le patron est souvent en cuisine ou en livraison. Ne demandez pas son portable au vendeur : prenez-le seulement s'il le propose."
    },
    "epicerie": {
     "meilleurs": [
      "10 h 00 – 11 h 30 et 14 h 30 – 16 h 30, en semaine"
     ],
     "possibles": [],
     "eviter": [
      "12 h 00 – 14 h 00",
      "après 17 h 00",
      "le samedi"
     ],
     "remarque": "Souvent une personne seule en boutique : proposez de rappeler dès qu'un client entre."
    },
    "caviste": {
     "meilleurs": [
      "10 h 30 – 12 h 00 et 14 h 30 – 16 h 30, du mardi au jeudi"
     ],
     "possibles": [],
     "eviter": [
      "le vendredi après 17 h 00 et le samedi",
      "décembre",
      "le lundi (souvent fermé)"
     ],
     "remarque": "Métier plus calme en journée : c'est celui où l'on peut discuter le plus longtemps."
    },
    "fleuriste": {
     "meilleurs": [
      "10 h 00 – 11 h 30 et 14 h 00 – 16 h 00, du mardi au jeudi"
     ],
     "possibles": [],
     "eviter": [
      "le vendredi après-midi et le samedi",
      "le dimanche matin",
      "les semaines de la Saint-Valentin, de la fête des Mères et de la Toussaint"
     ],
     "remarque": "Ce n'est pas un commerce de bouche : devant un fleuriste, dites « commerces de proximité » à la place de « commerces de bouche »."
    },
    "restaurant": {
     "meilleurs": [
      "15 h 00 – 17 h 00, du mardi au jeudi"
     ],
     "possibles": [
      "9 h 30 – 10 h 30, avant la mise en place"
     ],
     "eviter": [
      "11 h 00 – 14 h 30",
      "à partir de 18 h 00",
      "le vendredi soir, le samedi, le dimanche midi",
      "le lundi (souvent fermé)"
     ],
     "remarque": "Ce sont les plus démarchés par les plateformes de livraison : attendez-vous à « commissions » et « on m'appelle tout le temps »."
    },
    "pizzeria": {
     "meilleurs": [
      "15 h 00 – 17 h 30"
     ],
     "possibles": [
      "la fin de matinée, si elle ouvre le midi"
     ],
     "eviter": [
      "à partir de 18 h 00",
      "vendredi, samedi et dimanche soir"
     ],
     "remarque": "Beaucoup n'ouvrent qu'à 17 h ou 18 h : avant, personne ne décroche. Vérifiez les horaires."
    },
    "defaut": {
     "meilleurs": [
      "14 h 30 – 16 h 00, du mardi au jeudi"
     ],
     "possibles": [
      "10 h 00 – 11 h 30"
     ],
     "eviter": [
      "12 h 00 – 14 h 00",
      "après 17 h 00",
      "le vendredi après-midi, le samedi, le dimanche",
      "le jour de fermeture"
     ],
     "remarque": "En cas de doute, demandez à la personne qui décroche : « c'est quoi votre heure la plus calme ? », et notez la réponse."
    },
    "jours": {
     "meilleurs": [
      "mardi",
      "mercredi",
      "jeudi"
     ],
     "a_eviter": [
      "lundi (jour de fermeture le plus fréquent)",
      "vendredi après-midi",
      "samedi",
      "dimanche",
      "jours fériés, veilles et lendemains de jours fériés"
     ],
     "periodes_a_eviter": [
      "du 10 décembre au 2 janvier pour tous les métiers",
      "la semaine avant Pâques pour bouchers, chocolatiers et pâtissiers",
      "la période des galettes pour les boulangers",
      "les jours de marché pour ceux qui en font"
     ],
     "bonnes_periodes": [
      "de la mi-janvier à la fin février",
      "septembre et octobre",
      "de la fête des Mères au début juillet, hors zones touristiques"
     ]
    }
   },
   "avertissements": [
    {
     "id": "chiffre_5_30",
     "niveau": "important",
     "concerne": "raison_paul",
     "texte": "« Entre 5 et 30 % de chiffre d'affaires en plus sur un an » est le chiffre de Paul, gardé mot pour mot dans sa version. Aucune trace de ce chiffre dans le dépôt ni sur le site. « En moyenne » suivi d'une fourchette de 1 à 6 sonne faux à l'oral, et un commerçant qui demande « d'où ça sort ? » doit recevoir une vraie réponse. Annoncer un gain chiffré qu'on ne peut pas justifier peut être qualifié de pratique commerciale trompeuse, y compris entre professionnels. Le guide met donc par défaut la version avec le bénéfice du métier ; la version avec le chiffre reste disponible, à réserver au jour où Paul a ses propres résultats de clients."
    },
    {
     "id": "demo_preparee",
     "niveau": "important",
     "concerne": "rdv, envoyez_mail, messagerie, sms",
     "texte": "« La démo que je vous ai préparée » ne se dit que si une démo au nom de ce commerce existe. En appel à froid ce n'est presque jamais le cas : l'outil doit afficher par défaut les champs « …_sans_demo » et ne passer à la version « démo prête » que si la fiche le prouve. Toute démo promise doit être prête avant le rendez-vous."
    },
    {
     "id": "biographie",
     "niveau": "important",
     "concerne": "ouverture, deja_demarche, pas_le_temps",
     "texte": "Le guide ne fait dire à Paul que ce qu'il a dit lui-même : « primeur pendant 19 ans ». Les deux guides d'experts lui prêtaient des faits non confirmés (« quand j'avais mon magasin », « je recevais les mêmes appels », « je l'ai vécu aussi », « j'ai tenu un primeur ») : ils ont été retirés. Reste « 19 ans de votre côté du comptoir » : à valider par Paul. Autre point : l'accroche actuelle du CRM dit « je suis moi-même primeur depuis 19 ans » (au présent), le nouveau discours dit « j'ai été primeur » (au passé). Une seule est vraie aujourd'hui ; le guide suit le nouveau discours."
    },
    {
     "id": "partout_en_france",
     "niveau": "moyen",
     "concerne": "rdv_paul, raison",
     "texte": "« Chez les commerçants partout en France » et « je travaille avec les commerçants du secteur alimentaire » sont gardés mot pour mot dans la version de Paul. Ces phrases doivent rester vraies : si les clients sont encore peu nombreux ou concentrés dans une région, préférer la version courte du rendez-vous, qui ne dit ni l'un ni l'autre."
    },
    {
     "id": "pas_de_client_invente",
     "niveau": "important",
     "concerne": "tout",
     "texte": "Le guide ne cite aucun client, aucun témoignage, aucune statistique de marché. Une preuve du type « un boucher à tel endroit » doit être réelle, récente, et le commerçant cité doit être d'accord. Cela vaut aussi pour les témoignages affichés sur le site."
    },
    {
     "id": "prix",
     "niveau": "moyen",
     "concerne": "combien",
     "texte": "Aucun montant n'est écrit dans les répliques : ils viennent de CRM.OFFRES.clickcollect (399 € d'installation, 39 € par mois au 14 novembre 2026, vérifié dans crm-coeur.js et landing.html). « Sans engagement », « sans commission » et « installation payée à la mise en ligne » figurent sur le site ; Paul confirme qu'ils sont toujours exacts. Ne pas annoncer « premier mois offert » ni « aucun frais » sans vérification."
    },
    {
     "id": "promesses_produit",
     "niveau": "moyen",
     "concerne": "pas_le_temps_gerer, raison_non_retirees, commissions",
     "texte": "« C'est moi qui prépare la boutique à votre nom », « vous fixez les jours, les heures et le nombre de commandes par créneau » et « empreinte de carte à la commande » s'appuient sur ce que dit le site. Paul les relit et retire ce qui ne correspond pas exactement à son service. L'empreinte bancaire est une option : ne pas dire qu'elle supprime les commandes non retirées."
    },
    {
     "id": "ne_plus_appeler",
     "niveau": "important",
     "concerne": "sortie, pas_interesse, deja_demarche, mon_numero",
     "texte": "Trois répliques promettent « je ne vous rappelle plus » ou « je vous retire de ma liste ». Le CRM n'a pas aujourd'hui de marqueur « ne plus contacter » : la promesse ne tient que par la note « NE PLUS APPELER » et le résultat « Pas intéressé ». Un marqueur dédié, qui exclut le prospect des files d'appel et survit à une nouvelle recherche ou à un import, serait à prévoir."
    },
    {
     "id": "source_numero",
     "niveau": "moyen",
     "concerne": "mon_numero",
     "texte": "La réponse reprend la vraie source du prospect. Pour « Liste importée » et « Saisie à la main », l'outil ne la connaît pas : Paul doit savoir d'où vient chaque liste avant d'appeler."
    },
    {
     "id": "recommandation",
     "niveau": "moyen",
     "concerne": "ouverture_recommandation, sortie_recommandation",
     "texte": "« Je vous appelle de la part de… » uniquement si la personne a donné son accord explicite pour être citée. Le noter dans la fiche au moment où elle le donne."
    },
    {
     "id": "barrage",
     "niveau": "moyen",
     "concerne": "barrage",
     "texte": "Ne jamais se présenter comme un client, un fournisseur, une administration ou un rappel attendu pour passer le vendeur. « J'ai une question à lui poser », proposé par un des deux guides, a été retiré : c'est un prétexte, et le patron le sent dès la première phrase."
    },
    {
     "id": "hors_commerce_de_bouche",
     "niveau": "moyen",
     "concerne": "ouverture, vocal_15s",
     "texte": "La recherche de prospects propose aussi les fleuristes. L'ouverture de Paul, la variante à tester et le message vocal disent « commerces de bouche » : devant un fleuriste, dire « commerces de proximité », ou ne pas mélanger ces prospects avec les autres dans une même série."
    },
    {
     "id": "sms_prospection",
     "niveau": "moyen",
     "concerne": "apres_sans_reponse",
     "texte": "Le SMS envoyé à quelqu'un qui n'a jamais répondu est de la prospection par voie électronique. Il est désactivé par défaut dans ce guide ; à n'activer qu'après vérification (voir notes légales), une seule fois par commerce, sur un portable présenté comme numéro du commerce."
    },
    {
     "id": "duree_rdv_paul",
     "niveau": "faible",
     "concerne": "rdv_paul",
     "texte": "La version de Paul du rendez-vous fait une cinquantaine de mots avant la question : environ 20 secondes à débit normal, davantage s'il parle lentement. C'est la seule réplique à cette limite ; la version courte est proposée par défaut pour cette raison."
    },
    {
     "id": "creneaux",
     "niveau": "faible",
     "concerne": "creneaux_par_metier",
     "texte": "Les créneaux par métier sont des repères d'expérience, pas des données mesurées. Les deux guides ne s'accordaient pas partout (boulangerie, fromagerie, traiteur) : à afficher comme des conseils et à corriger avec les heures et résultats d'appel du CRM."
    }
   ],
   "notes_legales": [
    {
     "niveau": "limite",
     "texte": "Ces notes ne sont pas un avis juridique. Elles ont été rédigées sans consulter les textes à jour et ne citent volontairement aucun article de loi. Elles séparent ce qui est assez sûr de ce qui reste à faire confirmer par la CNIL, la DGCCRF ou un juriste."
    },
    {
     "niveau": "sur",
     "texte": "RGPD : beaucoup de commerces de bouche sont des entreprises individuelles, et le prénom, le nom, le portable du patron et les notes d'appel sont des données personnelles. La prospection téléphonique entre professionnels peut s'appuyer sur l'intérêt légitime, à condition que l'offre ait un rapport avec l'activité de la personne, qu'elle sache qui l'appelle et pourquoi, et qu'elle puisse s'opposer simplement."
    },
    {
     "niveau": "sur",
     "texte": "Droit d'opposition : quand quelqu'un demande à ne plus être appelé, il faut arrêter, sans condition, et garder une trace pour ne pas le rappeler par erreur, y compris s'il réapparaît dans une nouvelle recherche ou une liste importée. Ne pas supprimer la fiche."
    },
    {
     "niveau": "sur",
     "texte": "Transparence : s'identifier dès le début (nom, activité, objet commercial de l'appel), appeler avec un numéro visible, et répondre honnêtement à « comment avez-vous eu mon numéro ? ». Le discours de Paul le fait déjà."
    },
    {
     "niveau": "sur",
     "texte": "Les affirmations commerciales doivent être vraies et justifiables, y compris entre professionnels : gain chiffré, « sans commission », « sans engagement », existence d'une démo, clients cités."
    },
    {
     "niveau": "sur",
     "texte": "Origine des numéros : n'utiliser que des coordonnées professionnelles publiées, et garder la source dans la fiche pour pouvoir la donner."
    },
    {
     "niveau": "sur",
     "texte": "Enregistrement : ne pas enregistrer un appel sans en informer l'interlocuteur au début et lui permettre de refuser. Le guide ne prévoit aucun enregistrement."
    },
    {
     "niveau": "a_verifier",
     "texte": "Bloctel et les règles du démarchage téléphonique (jours, horaires, nombre d'appels) ont été écrits pour protéger les consommateurs ; ils ne visent pas, en principe, un appel passé à un professionnel pour un besoin de son activité. Le guide en reste proche : jours ouvrés, quatre tentatives au plus. Seuls les créneaux « possibles » d'avant 10 h, et la coupure de 13 h à 14 h, sortent des horaires prévus pour les consommateurs (en semaine, 10 h – 13 h et 14 h – 20 h) : à réserver à la ligne de la boutique."
    },
    {
     "niveau": "a_verifier",
     "texte": "Une loi de 2025 a fait passer le démarchage téléphonique des consommateurs à un régime de consentement préalable, avec une entrée en application annoncée pour août 2026, donc en principe déjà en vigueur à la date de ce guide. Elle vise les consommateurs et non les appels entre professionnels, mais son périmètre exact et ses textes d'application sont à faire confirmer avant de monter en volume."
    },
    {
     "niveau": "a_verifier",
     "texte": "Cas limite : l'artisan en nom propre joint sur son portable personnel, ou sur un numéro qui sert à la fois au commerce et à la famille. La frontière entre professionnel et consommateur y est moins nette. Par prudence : privilégier la ligne de la boutique, n'utiliser un portable que s'il est publié comme numéro du commerce ou donné par le commerce, et le noter."
    },
    {
     "niveau": "a_verifier",
     "texte": "SMS : un SMS qui confirme un rendez-vous que la personne vient d'accepter ne pose pas de difficulté. Un SMS à quelqu'un qui n'a jamais répondu est de la prospection électronique ; entre professionnels elle est en principe admise sans accord préalable si le message concerne l'activité, avec identification de l'expéditeur et moyen simple de s'opposer. Il n'est pas certain que cela couvre le portable personnel d'un artisan : à vérifier avant d'activer le modèle « après un appel sans réponse »."
    },
    {
     "niveau": "a_verifier",
     "texte": "Information des personnes : la politique de confidentialité du site devrait mentionner la prospection commerciale auprès de professionnels et la façon d'exercer ses droits. Non vérifié dans le dépôt."
    },
    {
     "niveau": "a_verifier",
     "texte": "Durée de conservation des prospects restés sans suite : la CNIL publie des recommandations dont le chiffre exact n'est pas garanti ici. Prévoir un nettoyage périodique des prospects anciens."
    },
    {
     "niveau": "a_verifier",
     "texte": "Contrat signé hors établissement (chez le commerçant, dans sa boutique) avec un très petit professionnel, cinq salariés au plus, pour un objet hors de son activité principale : des règles proches de celles des consommateurs (information avant contrat, droit de rétractation) peuvent s'appliquer. Cela ne concerne pas l'appel de prise de rendez-vous, mais la signature qui suit, surtout si vous passez à la boutique : à faire vérifier pour les conditions de vente."
    }
   ]
  };

  // ───────────────────────────── Métiers : article, possessif, reconnaissance ─────────────────────────────

  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MINUTE_JOUR = 24 * 60;

  // `le` : pour dire « c'est bien la boucherie Dupont ? » ; `votre` : « pour votre boucherie » ;
  // `mots` : formes (sans accents) qui, trouvées dans le nom du commerce, évitent de répéter le métier.
  var METIERS = {
    boulangerie: { le: 'la boulangerie', votre: 'votre boulangerie', mots: ['boulangerie', 'boulanger', 'fournil'] },
    patisserie: { le: 'la pâtisserie', votre: 'votre pâtisserie', mots: ['patisserie', 'patissier'] },
    boucherie: { le: 'la boucherie', votre: 'votre boucherie', mots: ['boucherie', 'boucher'] },
    charcuterie: { le: 'la charcuterie', votre: 'votre charcuterie', mots: ['charcuterie', 'charcutier'] },
    primeur: { le: 'le primeur', votre: 'votre magasin', mots: ['primeur', 'primeurs'] },
    fromagerie: { le: 'la fromagerie', votre: 'votre fromagerie', mots: ['fromagerie', 'fromager', 'cremerie'] },
    poissonnerie: { le: 'la poissonnerie', votre: 'votre poissonnerie', mots: ['poissonnerie', 'poissonnier'] },
    traiteur: { le: 'le traiteur', votre: 'votre commerce', mots: ['traiteur'] },
    epicerie: { le: 'l\'épicerie', votre: 'votre épicerie', mots: ['epicerie', 'epicier'] },
    caviste: { le: 'la cave', votre: 'votre cave', mots: ['cave', 'caviste', 'caves'] },
    fleuriste: { le: 'le fleuriste', votre: 'votre magasin', mots: ['fleuriste', 'fleurs'] },
    restaurant: { le: 'le restaurant', votre: 'votre restaurant', mots: ['restaurant', 'brasserie', 'bistrot', 'auberge'] },
    pizzeria: { le: 'la pizzeria', votre: 'votre pizzeria', mots: ['pizzeria', 'pizza'] }
  };
  // « Épicerie fine » est rangée sous « traiteur » (bénéfice, créneaux), mais ne se dit pas « le traiteur ».
  var EPICERIE_FINE = { le: 'l\'épicerie fine', votre: 'votre épicerie', mots: ['epicerie'] };
  // Ce qui, dans le nom seul d'un commerce, désigne son métier quand ni le libellé ni le type ne le disent. Des
  // mots entiers, et des noms de boutique seulement : « Maison Fleury » n'est pas un fleuriste, « Fromagerie
  // Boucher » n'est pas une boucherie.
  var ENSEIGNES = {
    boulangerie: ['boulangerie', 'fournil'], patisserie: ['patisserie'], boucherie: ['boucherie'], charcuterie: ['charcuterie'],
    primeur: ['primeur'], fromagerie: ['fromagerie', 'cremerie'], poissonnerie: ['poissonnerie'], traiteur: ['traiteur'],
    epicerie: ['epicerie'], caviste: ['cave', 'caviste'], fleuriste: ['fleuriste'],
    restaurant: ['restaurant', 'brasserie', 'bistrot', 'auberge'], pizzeria: ['pizzeria']
  };
  // Du plus précis au plus général : « Boulangerie-pâtisserie » est une boulangerie, « Épicerie fine » un traiteur.
  var RECONNAISSANCE = [
    ['boulangerie', /boulang/], ['patisserie', /patiss/], ['boucherie', /boucher/], ['charcuterie', /charcut/],
    ['primeur', /primeur|fruits et legumes/], ['fromagerie', /fromag|cremerie/], ['poissonnerie', /poissonn/],
    ['traiteur', /traiteur|epicerie fine/], ['epicerie', /epicerie/], ['caviste', /\bcav(e|es|iste)\b|\bvins?\b/],
    ['fleuriste', /fleur/], ['pizzeria', /pizz/], ['restaurant', /restau|fastfood|fast_food|brasserie/]
  ];

  function txt(v) { return v == null ? '' : String(v).trim(); }
  function sansAccents(v) {
    return txt(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, '\'');
  }
  function reconnaitre(v) {
    var s = sansAccents(v);
    if (!s) return '';
    for (var i = 0; i < RECONNAISSANCE.length; i++) if (RECONNAISSANCE[i][1].test(s)) return RECONNAISSANCE[i][0];
    return '';
  }

  /* Les mots d'un nom, sans accents ni apostrophes (« L'Épicerie du Coin » → l, epicerie, du, coin). */
  function motsDe(v) { return sansAccents(v).split(/[^a-z0-9]+/).filter(Boolean); }
  function singulier(mot) { return mot.length > 3 ? mot.replace(/s$/, '') : mot; }

  /* Métier lu dans le nom du commerce : le premier mot du nom qui est un nom de boutique. */
  function reconnaitreNom(nom) {
    var mots = motsDe(nom).map(singulier);
    if (/\bfruits et legumes\b/.test(sansAccents(nom))) return 'primeur';
    for (var i = 0; i < mots.length; i++) {
      if (mots[i] === 'epicerie' && mots[i + 1] === 'fine') return 'traiteur';
      for (var cle in ENSEIGNES) if (ENSEIGNES[cle].indexOf(mots[i]) >= 0) return cle;
    }
    return '';
  }

  /* Clé de métier d'un prospect : son libellé d'abord (« Pâtisserie » est rangée sous le type boulangerie),
     puis son type Marchéo, puis son nom. Chaîne vide quand rien ne le dit. */
  function metierDe(p) {
    p = p || {};
    return reconnaitre(p.metier) || reconnaitre(p.business_type) || reconnaitreNom(p.nom);
  }

  /* La façon de dire le métier d'un prospect : celle de sa clé, sauf l'épicerie fine (clé « traiteur »). */
  function dictionDe(p) {
    p = p || {};
    var cle = metierDe(p);
    if (cle === 'traiteur') {
      var libelle = sansAccents(p.metier);
      if (/epicerie fine/.test(libelle) || (!/traiteur/.test(libelle) && /\bepicerie fine\b/.test(sansAccents(p.nom)))) return EPICERIE_FINE;
    }
    return METIERS[cle] || null;
  }

  /* « votre boucherie », « votre épicerie », « votre magasin » (primeur) ; « votre commerce » par défaut. */
  function articleMetier(metier) { return METIERS[metier] ? METIERS[metier].votre : 'votre commerce'; }

  /* Le commerce avec son article, pour dire « c'est bien la boucherie Dupont ? » sans doublon :
     « Boucherie Dupont » → « la Boucherie Dupont » ; « Maison Dupont Boucherie » → le nom seul ;
     « Au Bon Pain » → « la boulangerie Au Bon Pain » ; métier inconnu → le nom seul.
     Un nom qui porte déjà son article (« L'Épicerie du Coin », « Le Vin sur Vin », « Les Délices de Marie ») se dit seul. */
  function leCommerce(p) {
    p = p || {};
    var nom = txt(p.nom);
    var m = dictionDe(p);
    if (!nom || !m) return nom;
    var mots = motsDe(nom);
    if (/^(l|le|la|les)$/.test(mots[0] || '')) return nom;
    var espace = m.le.indexOf(' '), apostrophe = m.le.indexOf('\'');
    var article = apostrophe >= 0 && (espace < 0 || apostrophe < espace) ? m.le.slice(0, apostrophe + 1) : m.le.slice(0, espace + 1);
    var nomMetier = motsDe(m.le.slice(article.length));
    if (nomMetier.every(function (mot, k) { return mots[k] === mot; })) return article + nom;
    // Le nom dit déjà le métier, ailleurs ou sous une autre forme (« Maison Dupont Boucherie », « L'Atelier des Pizzas »).
    var connus = m.mots.map(singulier);
    if (mots.some(function (mot) { return connus.indexOf(singulier(mot)) >= 0; })) return nom;
    return m.le + ' ' + nom;
  }

  // ───────────────────────────── Dates et heures dites à voix haute ─────────────────────────────

  function versDate(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    var s = txt(v);
    if (!s) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    var d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  function deux(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate()); }
  function minuit(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  /* Dimanche de Pâques d'une année (calcul de Meeus, calendrier grégorien). */
  function paques(annee) {
    var a = annee % 19, b = Math.floor(annee / 100), c = annee % 100, d = Math.floor(b / 4), e = b % 4;
    var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    var mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(annee, mois - 1, jour);
  }
  var FERIES_FIXES = ['1-1', '1-5', '8-5', '14-7', '15-8', '1-11', '11-11', '25-12'];
  /* Jour férié en France métropolitaine : les huit dates fixes, le lundi de Pâques, le jeudi de l'Ascension, le lundi de Pentecôte. */
  function estFerie(date) {
    var d = versDate(date);
    if (!d) return false;
    if (FERIES_FIXES.indexOf(d.getDate() + '-' + (d.getMonth() + 1)) >= 0) return true;
    var p = paques(d.getFullYear()), jour = minuit(d).getTime();
    return [1, 39, 50].some(function (n) { return new Date(p.getFullYear(), p.getMonth(), p.getDate() + n).getTime() === jour; });
  }

  /* Les deux prochains jours à proposer pour le rendez-vous, à partir de demain : du mardi au vendredi.
     Le lundi (jour de fermeture le plus fréquent), le samedi (trop de monde), le dimanche et les jours fériés sont écartés. */
  function joursProposes(maintenant) {
    var base = minuit(versDate(maintenant) || new Date()), resultat = [];
    for (var n = 1; n <= 14 && resultat.length < 2; n++) {
      var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
      if (d.getDay() >= 2 && d.getDay() <= 5 && !estFerie(d)) resultat.push({ date: iso(d), nom: JOURS[d.getDay()] });
    }
    return resultat;
  }

  /* « mardi » quand c'est dans les six jours, « mardi 24 novembre » au-delà, « demain » jamais (ambigu dans un SMS lu le lendemain). */
  function jourEnLettres(date, maintenant) {
    var d = versDate(date);
    if (!d) return '';
    var ecart = Math.round((minuit(d).getTime() - minuit(versDate(maintenant) || new Date()).getTime()) / 86400000);
    var nom = JOURS[d.getDay()];
    if (ecart >= 1 && ecart <= 6) return nom;
    return nom + ' ' + (d.getDate() === 1 ? '1er' : d.getDate()) + ' ' + MOIS[d.getMonth()];
  }
  /* Toujours la date entière : pour une note ou une tâche relue des semaines plus tard. */
  function jourComplet(date) {
    var d = versDate(date);
    return d ? JOURS[d.getDay()] + ' ' + (d.getDate() === 1 ? '1er' : d.getDate()) + ' ' + MOIS[d.getMonth()] : '';
  }

  /* « 15:00 » → « 15 h », « 9:30 » → « 9 h 30 ». Chaîne vide si l'heure n'en est pas une. */
  function heureLisible(v) {
    var m = /^\s*(\d{1,2})\s*(?:[:hH]\s*(\d{2})?)?\s*$/.exec(txt(v));
    if (!m || +m[1] > 23 || +(m[2] || 0) > 59) return '';
    return +m[1] + ' h' + (+(m[2] || 0) ? ' ' + m[2] : '');
  }

  var CANAUX = [
    { id: 'telephone', libelle: 'Téléphone', dit: 'par téléphone' },
    { id: 'visio', libelle: 'Visio', dit: 'en visio' },
    { id: 'place', libelle: 'Sur place', dit: 'à la boutique' }
  ];
  function canalDe(id) {
    for (var i = 0; i < CANAUX.length; i++) if (CANAUX[i].id === id) return CANAUX[i];
    return CANAUX[0];
  }

  // ───────────────────────────── Note du prospect : lignes « Étiquette : valeur » ─────────────────────────────

  /* Le prénom du patron n'a pas de colonne : il vit dans la note, sur une ligne « Patron : Marc ». */
  function ligneDeNote(note, etiquette) {
    var lignes = txt(note).split(/\r?\n/);
    for (var i = 0; i < lignes.length; i++) {
      var m = /^\s*([^:]{1,30}?)\s*:\s*(.+?)\s*$/.exec(lignes[i]);
      if (m && sansAccents(m[1]) === sansAccents(etiquette)) return m[2];
    }
    return '';
  }
  function prenomDepuisNote(note) { return ligneDeNote(note, 'Patron').replace(/[.;,]+$/, '').slice(0, 60); }

  /* Pose ou remplace la ligne « Étiquette : valeur » en tête de note, sans toucher au reste. */
  function noteAvecLigne(note, etiquette, valeur) {
    valeur = txt(valeur).replace(/\s*\r?\n\s*/g, ' ');
    var lignes = txt(note) ? txt(note).split(/\r?\n/) : [];
    var cle = sansAccents(etiquette), trouve = false;
    lignes = lignes.map(function (l) {
      var m = /^\s*([^:]{1,30}?)\s*:/.exec(l);
      if (trouve || !m || sansAccents(m[1]) !== cle) return l;
      trouve = true;
      return valeur ? etiquette + ' : ' + valeur : null;
    }).filter(function (l) { return l !== null; });
    if (!trouve && valeur) lignes.unshift(etiquette + ' : ' + valeur);
    return lignes.join('\n').slice(0, 4000);
  }

  // ───────────────────────────── Variables du script ─────────────────────────────

  // Ce qui s'affiche quand une valeur saisie pendant l'appel manque encore.
  var REPLIS = {
    jour_rdv: '(jour)', heure_rdv: '(heure)', canal_rdv: 'par téléphone', jour_rappel: '(jour)',
    recommandant: '(prénom et commerce de la personne)', commune: '(commune)', nom: '(nom du commerce)',
    source_numero: '(dites où vous avez trouvé ce numéro)'
  };
  // Variables acceptées dans un texte modifié, avec le libellé montré dans l'écran « Modifier mon script ».
  var VARIABLES = {
    le_commerce: 'le commerce avec son article (« la boucherie Dupont »)',
    nom: 'nom du commerce',
    article_metier: '« votre boucherie », « votre commerce »…',
    benefice_metier: 'la phrase du bénéfice, selon le métier',
    commune: 'commune',
    jour1: 'premier jour proposé',
    jour2: 'second jour proposé',
    jour_rdv: 'jour du rendez-vous',
    heure_rdv: 'heure du rendez-vous',
    canal_rdv: '« par téléphone », « en visio », « à la boutique »',
    jour_rappel: 'jour du rappel',
    prenom_patron: 'prénom du patron',
    recommandant: 'la personne qui recommande',
    tel_paul: 'votre numéro de rappel',
    prix_installation: 'prix de l\'installation',
    prix_mensuel: 'prix par mois',
    source_numero: 'où le numéro a été trouvé'
  };

  /* Retire le morceau de phrase qui contient une variable sans valeur : le membre entre virgules s'il ne
     contient qu'elle (« Paul Merieult, {tel_paul}. » → « Paul Merieult. »), sinon la phrase entière. */
  function sansVariable(t, nom) {
    var jeton = '{' + nom + '}';
    if (t.indexOf(jeton) < 0) return t;
    return (t.match(/[^.!?]+[.!?]*\s*|[.!?]+\s*/g) || [t]).map(function (phrase) {
      if (phrase.indexOf(jeton) < 0) return phrase;
      var fin = /[.!?]*\s*$/.exec(phrase)[0];
      var morceaux = phrase.slice(0, phrase.length - fin.length).split(',');
      var gardes = morceaux.filter(function (m) { return m.trim() !== jeton; });
      if (!gardes.length || gardes.length === morceaux.length) return '';
      return gardes.join(',') + fin;
    }).join('');
  }

  /* Remplace les variables d'un texte. Prénom inconnu : « Bonjour {prenom_patron}, » devient « Bonjour, »,
     et ailleurs « le patron ». Numéro de rappel inconnu : le morceau de phrase disparaît. Une variable que
     l'outil ne connaît pas reste telle quelle, entre accolades, pour se voir. */
  function remplir(texte, valeurs) {
    var v = valeurs || {};
    var t = texte == null ? '' : String(texte);
    if (!txt(v.prenom_patron)) {
      t = t.replace(/[  ]*\{prenom_patron\}(?=\s*[,.!?])/g, '').replace(/\{prenom_patron\}/g, 'le patron');
    }
    if (!txt(v.tel_paul)) t = sansVariable(t, 'tel_paul');
    return t.replace(/\{([a-z0-9_]+)\}/g, function (tout, nom, position, chaine) {
      var valeur = txt(v[nom]);
      if (!valeur) return nom in REPLIS ? REPLIS[nom] : tout;
      // En tête de phrase (« {jour1} ou {jour2} ? »), la valeur prend sa majuscule.
      return /(^|[.!?…]\s+)$/.test(chaine.slice(0, position)) ? valeur.charAt(0).toUpperCase() + valeur.slice(1) : valeur;
    }).replace(/[ \t]{2,}/g, ' ').trim();
  }

  function variablesDe(texte) {
    var vues = [];
    String(texte == null ? '' : texte).replace(/\{([^{}]*)\}/g, function (tout, nom) { if (vues.indexOf(nom) < 0) vues.push(nom); });
    return vues;
  }
  function variablesInconnues(texte) { return variablesDe(texte).filter(function (nom) { return !(nom in VARIABLES); }); }

  /* Les répliques d'un texte : chaque « … » (ou trois points tapés au clavier) marque l'endroit où le commerçant répond. */
  function repliques(texte) {
    return String(texte == null ? '' : texte).split(/…|\.{3}/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  /* Les répliques d'un texte, variables remplies. Le modèle est découpé avant le remplissage : des points de
     suspension dans le nom d'un commerce (« Chez Jo... et fils ») ne coupent pas la phrase. */
  function repliquesRemplies(texte, valeurs) {
    return repliques(texte).map(function (morceau) { return remplir(morceau, valeurs); }).filter(Boolean);
  }

  /* Une démo existe-t-elle réellement pour ce commerce ? Seulement si sa fiche CRM est rattachée à une
     boutique de démonstration (étape « Démos créées » ou plus loin) ou à un audit qui en porte une. */
  function demoExiste(fiche) {
    if (!fiche) return false;
    if (fiche.commercant && ['demo', 'demo_engagee', 'paiement', 'client'].indexOf(fiche.etape) >= 0) return true;
    return !!(fiche.audit && txt(fiche.audit.demo_slug));
  }

  /* Le texte à dire : la version « démo prête » seulement quand `demo` est vrai, sinon son jumeau
     « …_sans_demo » s'il existe. Jamais d'affirmation fausse sur une démo qui n'existe pas, ni de SMS promis
     à un numéro qui n'en reçoit pas. */
  function texteDe(bloc, champ, demo, sms) {
    if (!bloc) return '';
    // Aucun SMS n'est promis sur une ligne fixe : `sms === false` prend le jumeau « …_sans_sms » s'il existe.
    if (sms === false && bloc[champ + '_sans_sms']) return bloc[champ + '_sans_sms'];
    var jumeau = bloc[champ + '_sans_demo'];
    return (!demo && jumeau) ? jumeau : (bloc[champ] || '');
  }

  /* Valeurs des variables pour un prospect. `ctx` : maintenant, guide, offres (CRM.OFFRES), demo (booléen),
     telPaul, et les saisies de l'appel (prenom, jourRdv, heureRdv, canal, jourRappel, recommandant). */
  function valeurs(p, ctx) {
    p = p || {};
    ctx = ctx || {};
    var guide = ctx.guide || GUIDE;
    var metier = metierDe(p), jours = joursProposes(ctx.maintenant);
    var offre = (ctx.offres && ctx.offres.clickcollect) || {};
    var source = guide.sources_numero ? guide.sources_numero[p.source] : '';
    return {
      nom: txt(p.nom), le_commerce: leCommerce(p), metier: metier, article_metier: (dictionDe(p) || { votre: articleMetier(metier) }).votre,
      benefice_metier: guide.benefices_par_metier[metier] || guide.benefices_par_metier.defaut,
      commune: txt(p.commune),
      jour1: jours[0] ? jours[0].nom : '', jour2: jours[1] ? jours[1].nom : '',
      jour_rdv: ctx.jourRdv ? jourEnLettres(ctx.jourRdv, ctx.maintenant) : '',
      heure_rdv: heureLisible(ctx.heureRdv),
      canal_rdv: canalDe(ctx.canal).dit,
      jour_rappel: ctx.jourRappel ? jourEnLettres(ctx.jourRappel, ctx.maintenant) : '',
      prenom_patron: txt(ctx.prenom) || prenomDepuisNote(p.note),
      recommandant: txt(ctx.recommandant),
      tel_paul: txt(ctx.telPaul),
      prix_installation: offre.installation != null ? String(offre.installation) : '',
      prix_mensuel: offre.mensuel != null ? String(offre.mensuel) : '',
      source_numero: typeof source === 'string' ? source : '',
      demo_existe: !!ctx.demo
    };
  }

  // ───────────────────────────── Script personnalisé ─────────────────────────────

  var LIMITE_TEXTE = 700, LIMITE_SMS = 320;
  var ORDRE_ETAPES = ['ouverture', 'raison', 'rdv', 'conclusion', 'barrage', 'sortie'];
  var TITRES_GROUPE = {
    ouverture: 'Ouverture', raison: 'Raison de l\'appel', rdv: 'Proposition de rendez-vous', conclusion: 'Conclusion',
    barrage: 'Quelqu\'un d\'autre décroche', sortie: 'Sortie', objections: 'Objections', messagerie: 'Messagerie', sms: 'SMS'
  };

  function parId(liste, id) {
    for (var i = 0; i < (liste || []).length; i++) if (liste[i].id === id) return liste[i];
    return null;
  }
  function etapeDe(guide, id) { return parId(guide.etapes, id); }
  function objectionDe(guide, id) { return parId(guide.objections, id); }
  function varianteDe(guide, idEtape, idVariante) {
    var e = etapeDe(guide, idEtape);
    if (!e) return null;
    return parId(e.variantes, idVariante) || parId(e.variantes, e.defaut) || e.variantes[0] || null;
  }

  /* Tous les textes modifiables, dans l'ordre de l'écran « Modifier mon script ». La clé d'un bloc
     (« v:ouverture_paul:texte », « o:combien:reponse », « m:vocal_15s:texte », « s:confirmation_rdv:texte »)
     est aussi celle sous laquelle sa version personnalisée est enregistrée. */
  function blocs(guide) {
    guide = guide || GUIDE;
    var liste = [];
    function ajouter(groupe, prefixe, objet, champ, titre, max) {
      [champ, champ + '_sans_demo', champ + '_sans_sms'].forEach(function (c) {
        if (typeof objet[c] !== 'string') return;
        liste.push({
          cle: prefixe + ':' + objet.id + ':' + c, groupe: groupe, titre: titre, champ: c,
          sansDemo: c === champ + '_sans_demo', avecJumeau: typeof objet[champ + '_sans_demo'] === 'string',
          sansSms: c === champ + '_sans_sms', avecSansSms: typeof objet[champ + '_sans_sms'] === 'string',
          texte: objet[c], max: max, quand: objet.quand || ''
        });
      });
    }
    ORDRE_ETAPES.forEach(function (idEtape) {
      var e = etapeDe(guide, idEtape);
      if (e) e.variantes.forEach(function (v) { ajouter(idEtape, 'v', v, 'texte', v.nom, LIMITE_TEXTE); });
    });
    guide.objections.forEach(function (o) {
      ajouter('objections', 'o', o, 'reponse', o.libelle + ' : la réponse', LIMITE_TEXTE);
      ajouter('objections', 'o', o, 'relance', o.libelle + ' : la relance', LIMITE_TEXTE);
    });
    guide.messagerie.variantes.forEach(function (v) { ajouter('messagerie', 'm', v, 'texte', v.nom, LIMITE_TEXTE); });
    guide.sms.modeles.forEach(function (v) { ajouter('sms', 's', v, 'texte', v.nom, LIMITE_SMS); });
    return liste;
  }

  var blocsDefaut = null;
  function blocsParCle() {
    if (!blocsDefaut) {
      // Sans prototype : « constructor » ou « toString » ne passent pas pour des blocs connus.
      blocsDefaut = Object.create(null);
      blocs(GUIDE).forEach(function (b) { blocsDefaut[b.cle] = b; });
    }
    return blocsDefaut;
  }

  /* Contrôle d'un texte modifié : vide, trop long, variable inconnue. */
  function validerTexte(cle, texte) {
    var b = blocsParCle()[cle], t = txt(texte), erreurs = [];
    if (!b) return { ok: false, erreurs: ['Bloc inconnu.'], inconnues: [], longueur: t.length, max: 0 };
    var inconnues = variablesInconnues(t);
    if (!t) erreurs.push('Le texte est vide : rétablissez le texte d\'origine ou écrivez le vôtre.');
    if (t.length > b.max) erreurs.push('Trop long : ' + t.length + ' caractères pour ' + b.max + ' au plus.');
    if (inconnues.length) {
      erreurs.push((inconnues.length > 1 ? 'Variables inconnues : ' : 'Variable inconnue : ') +
        inconnues.map(function (n) { return '{' + n + '}'; }).join(', ') + '.');
    }
    if (/\{[^{}]*$|^[^{}]*\}/.test(t.replace(/\{[^{}]*\}/g, ''))) erreurs.push('Une accolade n\'est pas refermée.');
    return { ok: !erreurs.length, erreurs: erreurs, inconnues: inconnues, longueur: t.length, max: b.max };
  }

  /* Ne garde d'un script enregistré que ce qui est utilisable : blocs connus, textes valides et réellement
     différents de l'original. Tout le reste retombe sur le texte du code. */
  function nettoyerPerso(perso) {
    var propre = { textes: {}, tel_paul: '' };
    if (!perso || typeof perso !== 'object') return propre;
    var defauts = blocsParCle(), textes = perso.textes && typeof perso.textes === 'object' ? perso.textes : {};
    Object.keys(textes).forEach(function (cle) {
      var t = typeof textes[cle] === 'string' ? textes[cle].trim() : '';
      if (defauts[cle] && t !== defauts[cle].texte && validerTexte(cle, t).ok) propre.textes[cle] = t;
    });
    propre.tel_paul = txt(perso.tel_paul).replace(/[^\d +.()-]/g, '').slice(0, 20);
    return propre;
  }

  function estPersonnalise(perso) { return Object.keys(nettoyerPerso(perso).textes).length > 0; }

  /* Le guide à utiliser : le script du code, avec par-dessus les textes personnalisés. */
  function construire(perso) {
    var textes = nettoyerPerso(perso).textes;
    if (!Object.keys(textes).length) return GUIDE;
    var guide = JSON.parse(JSON.stringify(GUIDE));
    Object.keys(textes).forEach(function (cle) {
      var p = cle.split(':'), cible = null;
      if (p[0] === 'v') guide.etapes.forEach(function (e) { cible = cible || parId(e.variantes, p[1]); });
      else if (p[0] === 'o') cible = objectionDe(guide, p[1]);
      else if (p[0] === 'm') cible = parId(guide.messagerie.variantes, p[1]);
      else if (p[0] === 's') cible = parId(guide.sms.modeles, p[1]);
      if (cible) cible[p[2]] = textes[cle];
    });
    return guide;
  }

  /* Ce qui est noté dans le journal d'appels : l'ouverture utilisée, et si le script est personnalisé. */
  function versionScript(idOuverture, perso) {
    return (txt(idOuverture) + (estPersonnalise(perso) ? '+perso' : '')).slice(0, 40) || null;
  }

  // ───────────────────────────── Bon moment pour appeler ─────────────────────────────

  var INDEX_JOUR = { dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6 };
  var MOMENTS = [
    ['fin de matinee', [11 * 60, 12 * 60 + 30]], ['matin', [0, 12 * 60]], ['apres-midi', [12 * 60, 18 * 60]],
    ['soir', [18 * 60, MINUTE_JOUR]], ['midi', [11 * 60 + 30, 14 * 60 + 30]]
  ];

  function minutesDe(h, m) { return +h * 60 + (+(m || 0)); }
  function momentDe(s) {
    var apres = /(?:apres|a partir de)\s+(\d{1,2}) h(?: (\d{2}))?/.exec(s);
    if (apres) return [minutesDe(apres[1], apres[2]), MINUTE_JOUR];
    var avant = /avant\s+(\d{1,2}) h(?: (\d{2}))?/.exec(s);
    if (avant) return [0, minutesDe(avant[1], avant[2])];
    for (var i = 0; i < MOMENTS.length; i++) if (s.indexOf(MOMENTS[i][0]) >= 0) return MOMENTS[i][1];
    return null;
  }
  function tousLesJours(plages) {
    var jours = {};
    for (var j = 0; j < 7; j++) jours[j] = plages;
    return jours;
  }

  /* Lit un créneau écrit en clair (« 14 h 30 – 16 h 00, du mardi au jeudi », « le vendredi après-midi et le
     samedi », « après 16 h 30 », « décembre ») et rend { jours: { 0..6: [[début, fin] en minutes] }, mois }
     ou null quand il ne se rattache ni à une heure ni à un jour (« les jours de marché »). */
  function analyserCreneau(texte) {
    var s = sansAccents(texte).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return null;
    var plages = [];
    s.replace(/(\d{1,2}) h(?: (\d{2}))? [–-] (\d{1,2}) h(?: (\d{2}))?/g, function (tout, h1, m1, h2, m2) {
      plages.push([minutesDe(h1, m1), minutesDe(h2, m2)]);
    });
    var mentions = [], re = /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/g, m;
    while ((m = re.exec(s))) mentions.push({ jour: INDEX_JOUR[m[1]], debut: m.index, fin: m.index + m[1].length });
    var jours = {}, k, j;

    if (plages.length) {
      var concernes = [];
      var etendue = /du (\w+) au (\w+)/.exec(s);
      if (etendue && etendue[1] in INDEX_JOUR && etendue[2] in INDEX_JOUR) {
        for (j = INDEX_JOUR[etendue[1]]; ; j = (j + 1) % 7) { concernes.push(j); if (j === INDEX_JOUR[etendue[2]]) break; }
      } else if (mentions.length) concernes = mentions.map(function (x) { return x.jour; });
      else if (s.indexOf('debut de semaine') >= 0) concernes = [1, 2];
      else if (s.indexOf('en semaine') >= 0) concernes = [1, 2, 3, 4, 5];
      else concernes = [0, 1, 2, 3, 4, 5, 6];
      concernes.forEach(function (jour) { jours[jour] = plages; });
      return { jours: jours };
    }

    if (mentions.length) {
      // Le moment de la journée dit juste après un jour ne vaut que pour lui (« le vendredi après-midi et le samedi »),
      // sauf quand il clôt une énumération sans article (« vendredi, samedi et dimanche soir »).
      var moments = mentions.map(function (x, i) {
        return momentDe(s.slice(x.fin, i + 1 < mentions.length ? mentions[i + 1].debut : s.length));
      });
      var dernier = moments[moments.length - 1];
      var partage = dernier && moments.slice(0, -1).every(function (x) { return !x; }) && mentions.length > 1 && !/\ble (lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/.test(s);
      var etendu = /du (\w+)[^,]*? au (\w+)/.exec(s);
      if (etendu && etendu[1] in INDEX_JOUR && etendu[2] in INDEX_JOUR && mentions.length === 2) {
        jours[mentions[0].jour] = [moments[0] || [0, MINUTE_JOUR]];
        for (j = (mentions[0].jour + 1) % 7; ; j = (j + 1) % 7) { jours[j] = [[0, MINUTE_JOUR]]; if (j === mentions[1].jour) break; }
        return { jours: jours };
      }
      for (k = 0; k < mentions.length; k++) {
        var plage = partage ? dernier : (moments[k] || [0, MINUTE_JOUR]);
        jours[mentions[k].jour] = (jours[mentions[k].jour] || []).concat([plage]);
      }
      return { jours: jours };
    }

    if (/\bdecembre\b/.test(s) && !/\d h/.test(s)) {
      var depuis = /a partir du (\d{1,2})/.exec(s);
      return { jours: tousLesJours([[0, MINUTE_JOUR]]), mois: 11, aPartirDu: depuis ? +depuis[1] : 1 };
    }
    // Ce qui reste et parle d'une période de l'année ou d'une habitude du commerce ne se lit pas sur une horloge.
    if (/semaine|noel|paques|marche|fermeture|ferie|saint|fete|toussaint|epiphanie|nouvel an/.test(s)) return null;
    var moment = momentDe(s);
    return moment ? { jours: tousLesJours([moment]) } : null;
  }

  function creneauVaut(regle, date) {
    if (!regle) return false;
    if (regle.mois != null && (date.getMonth() !== regle.mois || date.getDate() < (regle.aPartirDu || 1))) return false;
    var plages = regle.jours[date.getDay()];
    if (!plages) return false;
    var minute = date.getHours() * 60 + date.getMinutes();
    return plages.some(function (p) { return minute >= p[0] && minute < p[1]; });
  }

  /* Est-ce un bon moment pour appeler ce métier ? Rend { niveau : 'bon' | 'possible' | 'eviter' | 'neutre',
     raison, meilleur (le créneau conseillé, à afficher quand ce n'est pas le moment), remarque }.
     Ce sont des repères de terrain, pas des mesures : l'heure creuse donnée par le commerce prime toujours. */
  function bonMoment(metier, maintenant, guide) {
    guide = guide || GUIDE;
    var date = versDate(maintenant) || new Date();
    var tous = guide.creneaux_par_metier;
    var c = tous[metier] || tous.defaut;
    var meilleur = (c.meilleurs || [])[0] || '';
    function premier(liste) {
      for (var i = 0; i < (liste || []).length; i++) if (creneauVaut(analyserCreneau(liste[i]), date)) return liste[i];
      return '';
    }
    function rendre(niveau, raison) { return { niveau: niveau, raison: raison, meilleur: meilleur, remarque: c.remarque || '' }; }
    // Du 10 décembre au 2 janvier : à éviter pour tous les métiers.
    var mois = date.getMonth(), jour = date.getDate();
    if ((mois === 11 && jour >= 10) || (mois === 0 && jour <= 2)) return rendre('eviter', 'les fêtes, du 10 décembre au 2 janvier');
    var trouve = premier(c.eviter);
    if (trouve) return rendre('eviter', trouve);
    trouve = premier(c.meilleurs);
    if (trouve) return rendre('bon', trouve);
    trouve = premier(c.possibles);
    if (trouve) return rendre('possible', trouve);
    trouve = premier((tous.jours && tous.jours.a_eviter) || []);
    if (trouve) return rendre('eviter', trouve);
    return rendre('neutre', '');
  }

  /* Quelques heures à proposer pour le rendez-vous : le début du meilleur créneau du métier, puis toutes les 30 minutes. */
  function heuresSuggerees(metier, guide) {
    guide = guide || GUIDE;
    var c = guide.creneaux_par_metier[metier] || guide.creneaux_par_metier.defaut;
    var regle = analyserCreneau((c.meilleurs || [])[0] || ''), plage = null;
    if (regle) Object.keys(regle.jours).forEach(function (j) { plage = plage || regle.jours[j][regle.jours[j].length - 1]; });
    if (!plage || plage[1] - plage[0] > 6 * 60) plage = [14 * 60 + 30, 16 * 60];
    var heures = [];
    for (var t = plage[0]; t <= plage[1] - 30 && heures.length < 3; t += 30) heures.push(deux(Math.floor(t / 60)) + ':' + deux(t % 60));
    return heures;
  }

  // ───────────────────────────── Mesure : ce que disent les appels journalisés ─────────────────────────────

  var SEUIL_CRENEAUX = 40, SEUIL_PAR_HEURE = 8;

  function compteVide() { return { appels: 0, decroches: 0, patron: 0, rdv: 0 }; }
  function compter(c, a) {
    c.appels++;
    if (a.interlocuteur === 'patron' || a.interlocuteur === 'barrage' || a.interlocuteur === 'inconnu') c.decroches++;
    if (a.interlocuteur === 'patron') c.patron++;
    if (a.resultat === 'rdv') c.rdv++;
  }
  function taux(n, total) { return total > 0 ? Math.round(100 * n / total) : null; }

  /* Chiffres du journal d'appels. Rien n'est estimé : un taux sans appel vaut null, et les meilleurs créneaux
     ne sont donnés qu'à partir de SEUIL_CRENEAUX appels (au moins SEUIL_PAR_HEURE par heure retenue). */
  function statsAppels(appels, maintenant, guide) {
    guide = guide || GUIDE;
    var ref = versDate(maintenant) || new Date();
    var debutJour = minuit(ref).getTime();
    var debutSemaine = debutJour - 6 * 86400000;
    var s = { jour: compteVide(), semaine: compteVide(), total: 0, objections: [], versions: [],
      creneaux: { assez: false, total: 0, seuil: SEUIL_CRENEAUX, lignes: [] } };
    var parObjection = {}, parHeure = {}, parVersion = {};
    (appels || []).forEach(function (a) {
      var d = versDate(a && a.fait_at);
      if (!d || !a.resultat) return;
      var t = d.getTime();
      s.total++;
      if (t >= debutJour && t < debutJour + 86400000) compter(s.jour, a);
      if (t >= debutSemaine && t < debutJour + 86400000) compter(s.semaine, a);
      (Array.isArray(a.objections) ? a.objections : []).forEach(function (id) { parObjection[id] = (parObjection[id] || 0) + 1; });
      var h = d.getHours();
      compter(parHeure[h] = parHeure[h] || compteVide(), a);
      if (a.version_script) compter(parVersion[a.version_script] = parVersion[a.version_script] || compteVide(), a);
    });
    ['jour', 'semaine'].forEach(function (k) {
      s[k].tauxDecroche = taux(s[k].decroches, s[k].appels);
      s[k].tauxRdv = taux(s[k].rdv, s[k].appels);
    });
    s.objections = Object.keys(parObjection).map(function (id) {
      var o = objectionDe(guide, id);
      return { id: id, libelle: o ? o.libelle : id, n: parObjection[id] };
    }).sort(function (a, b) { return b.n - a.n || (a.libelle < b.libelle ? -1 : 1); });
    s.versions = Object.keys(parVersion).map(function (v) {
      var c = parVersion[v];
      return { version: v, appels: c.appels, patron: c.patron, rdv: c.rdv };
    }).sort(function (a, b) { return b.appels - a.appels; });
    s.creneaux.total = s.total;
    if (s.total >= SEUIL_CRENEAUX) {
      s.creneaux.lignes = Object.keys(parHeure).map(function (h) {
        var c = parHeure[h];
        return { heure: +h, appels: c.appels, decroches: c.decroches, patron: c.patron, rdv: c.rdv, taux: taux(c.decroches, c.appels) };
      }).filter(function (l) { return l.appels >= SEUIL_PAR_HEURE; })
        .sort(function (a, b) { return b.taux - a.taux || b.appels - a.appels; }).slice(0, 3);
      s.creneaux.assez = s.creneaux.lignes.length > 0;
    }
    return s;
  }

  /* Qui a répondu, pour le journal : ce que le guide sait, sinon ce que le résultat prouve. Un rendez-vous ou
     un « intéressé » ne se prend qu'avec le patron ; « pas de réponse », « messagerie », « faux numéro » : personne. */
  function interlocuteurDe(choisi, resultat) {
    if (resultat === 'pas_de_reponse' || resultat === 'messagerie') return null;
    if (choisi === 'patron' || choisi === 'barrage') return choisi;
    if (resultat === 'rdv' || resultat === 'interesse') return 'patron';
    return resultat === 'faux_numero' ? null : 'inconnu';
  }

  var api = {
    VERSION: 'guide-1', DEFAUT: GUIDE, METIERS: METIERS, VARIABLES: VARIABLES, CANAUX: CANAUX, TITRES_GROUPE: TITRES_GROUPE,
    LIMITE_TEXTE: LIMITE_TEXTE, LIMITE_SMS: LIMITE_SMS, SEUIL_CRENEAUX: SEUIL_CRENEAUX,
    metierDe: metierDe, articleMetier: articleMetier, leCommerce: leCommerce,
    joursProposes: joursProposes, estFerie: estFerie, jourEnLettres: jourEnLettres, jourComplet: jourComplet, heureLisible: heureLisible, canalDe: canalDe,
    prenomDepuisNote: prenomDepuisNote, ligneDeNote: ligneDeNote, noteAvecLigne: noteAvecLigne,
    remplir: remplir, sansVariable: sansVariable, valeurs: valeurs, repliques: repliques, repliquesRemplies: repliquesRemplies, variablesDe: variablesDe, variablesInconnues: variablesInconnues,
    demoExiste: demoExiste, texteDe: texteDe,
    etapeDe: etapeDe, objectionDe: objectionDe, varianteDe: varianteDe,
    blocs: blocs, validerTexte: validerTexte, nettoyerPerso: nettoyerPerso, estPersonnalise: estPersonnalise,
    construire: construire, versionScript: versionScript,
    analyserCreneau: analyserCreneau, bonMoment: bonMoment, heuresSuggerees: heuresSuggerees,
    statsAppels: statsAppels, interlocuteurDe: interlocuteurDe
  };

  if (racine && racine.CRM) racine.CRM.guide = api;
  if (racine) racine.crmGuide = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null);
