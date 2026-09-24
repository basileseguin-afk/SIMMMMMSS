# SIMMMMMSS — Feuille de route de la simulation ORY

Version 1 — 17 septembre 2026. Document de travail à partager avec Basile et Claude.

## 1. But du projet et état de départ

Construire un outil permettant d’expliquer la charge par service, de prévoir les files et les retards, puis de comparer des organisations : effectifs et horaires, robot, plonge, stocks et circuits. Les heures de travail constituent la mesure de base. La conversion conventionnelle **ETP = heures / 7** sert à présenter une charge ; elle ne donne pas, à elle seule, le nombre de personnes à mettre simultanément au travail.

Le projet est réussi lorsqu’une simulation reproduit suffisamment bien des journées observées, explique ses écarts et permet de comparer des scénarios reproductibles. Une animation plausible ou un bon ajustement aux totaux mensuels ne suffit pas à établir cette capacité.

### Périmètre de la revue

Dépôt : https://github.com/basileseguin-afk/SIMMMMMSS

Révision examinée : `0d7f7d24c2de90db21f78ccc54a0e9cb6ae058d6`, sur la branche par défaut `claude/factory-management-system-b1e0am`. Lecture du README, du CHANGELOG, de l’arborescence, de `index.html` et de `sim.js`. Cette revue est statique : elle ne constitue pas un essai du fonctionnement dans le navigateur. Aucun changement au dépôt n’a été effectué.

| Composant | Présent dans cette révision | Travail restant |
|---|---|---|
| Interface et plan | Plan réel en tuiles, zones modifiables, polygones, zoom, thèmes | Valider les implantations et associer les objets du moteur aux zones |
| Animation | Flux et états visibles | Rejouer des événements calculés indépendamment de l’affichage |
| Données | Exemples embarqués et import CSV simplifié | Importer et contrôler les exports réels et les standards |
| Calcul | Moteur JavaScript à pas de temps, paramètres et coefficients de démonstration | Calendrier multijour, ressources finies, lots, stocks, compétences et règles métier |
| Indicateurs | Ponctualité, retard, débit, files, occupation | Définitions fiables, prise en compte des vols inachevés et traçabilité |
| Scénarios | Curseurs et captures A/B | Exécutions complètes et comparables, avec données et hypothèses figées |
| Qualité et déploiement | Application navigateur sans dépendances | Tests métier, calibration, procédure de lancement et sauvegarde |

Points concrets à corriger avant toute utilisation prédictive :

- `chargeVol()` affecte actuellement tous les YC au robot, quelle que soit la compagnie.
- `build()` déclenche la production quelques heures avant le départ ; les règles J−1 et J−2 ne sont pas représentées.
- Les coefficients par passager sont codés dans `sim.js` et ne viennent pas du classeur des heures.
- L’import CSV ne représente pas les lignes de prestations, les dates et les dossiers de l’export Winrest fourni.
- Les ressources humaines sont des capacités globales constantes ; leurs horaires, compétences et affectations simultanées ne sont pas représentés.
- Les stockages sont visibles sur le plan mais ne limitent pas le flux. La plonge ne remet pas réellement du matériel dans un stock utilisé par la production.
- Le taux de ponctualité porte sur les vols terminés ; il affiche 100 % quand aucun vol n’est terminé. Les vols inachevés peuvent donc masquer une dégradation.
- Les captures A/B enregistrent l’état courant et quelques paramètres, sans constituer deux exécutions comparables.

Le travail d’interface est conservé. La priorité technique est de séparer ce qui calcule de ce qui affiche, puis de raccorder progressivement le modèle métier.

## 2. Référentiel métier à transmettre aux deux environnements de travail

| Sujet | Règle acquise | Limite ou complément nécessaire |
|---|---|---|
| Mesure du travail | Heures détaillées de la colonne C du classeur ; 1 ETP conventionnel = 7 h | Distinguer charge, heures de présence et durée écoulée |
| Vol full | Avion complet | Configuration avion et capacité par classe associées au standard à renseigner |
| Nature des standards | Temps théoriques par service et tâche | Les heures réalisées et supplémentaires restent à collecter |
| Robot | Économie de FBU, TX/FWI et CRL uniquement | Prestations précises et cas ECO SPML à confirmer |
| Autres classes/compagnies | Production manuelle | Détailler les opérations et compétences nécessaires |
| Prépa | J−1, sauf CRL du soir, généralement vers 21 h, préparés le matin de J | Liste des vols concernés et fenêtres horaires à confirmer ; pas de seuil automatique à 21 h |
| Cuisine | Cible théorique J−2 | Simuler aussi la disponibilité effective et les retards |
| Plonge | Selon les retours, usuellement J−1 ou J−2 | Horaires réels des retours, stock initial et compatibilité du matériel |
| Plan | Les annotations ajoutées décrivent les usages actuels | Contours, positions d’équipements et capacités à valider sur place |
| Étude mathématique précédente | Source d’hypothèses à explorer | Le besoin en ETP n’a pas été correctement prédit ; modèle non validé |

Une première base structurée contient **121 standards détaillés** : 15 Armement, 18 Dotation, 18 Plonge, 47 Food et 23 Cuisine. Elle conserve les cellules sources, reconstruit les sous-totaux et distingue les inconnues. Ce fichier, `base_simulation_ory_v01.json`, est un référentiel initial, pas un moteur calibré. Certains standards portent sur une journée ou une commande : ils ne doivent pas tous devenir des coefficients par vol.

Constats sur l’export fourni : 2 866 lignes de prestations sur les 17 et 18 septembre, avec 68 identifiants de dossier par date. Un dossier n’équivaut pas nécessairement à un départ physique. Un même nombre de passagers est répété sur plusieurs prestations. Les dossiers fictifs, annulés, réserves ou équipages demandent une règle explicite. `Qty` et `Final Qty` divergent sur certaines lignes : leur choix doit être validé.

Exemple : un effectif Economy répété sur le matériel, le repas et le snack n’est pas trois fois l’effectif du vol. Il peut néanmoins engendrer plusieurs opérations distinctes. Il faut conserver les prestations sans additionner abusivement les passagers.

## 3. Architecture cible et responsabilités

Chaîne de traitement proposée : **sources → données contrôlées → ordres de fabrication → moteur de simulation → journal d’événements et résultats → interface**.

| Bloc | Responsabilité | Livrable principal |
|---|---|---|
| Import et contrôle | Lire les fichiers, normaliser, conserver la provenance, signaler les ambiguïtés | Jeu de données validé et rapport d’import |
| Référentiels métier | Compagnies, classes, prestations, gammes, standards, équipements et calendriers | Configuration versionnée, indépendante du code |
| Génération de charge | Transformer commandes et prestations en opérations sans doublons | Ordres de fabrication datés et justifiés |
| Simulation | Affecter ressources, traiter lots et stocks, calculer attentes et fins | Événements horodatés et états |
| Mesure et calibration | Calculer les indicateurs et confronter le modèle au terrain | Rapport d’écarts et paramètres justifiés |
| Scénarios | Rejouer une base identique avec des changements explicites | Comparaison reproductible |
| Interface | Éditer, lancer, afficher, explorer et rejouer | Application utilisable et résultats expliqués |

Conserver l’interface HTML/JavaScript actuelle. Pour respecter le cadrage initial, viser un moteur Python à événements discrets, par exemple avec SimPy. La première connexion peut se faire par fichiers JSON ; une API locale pourra ensuite permettre de lancer les calculs depuis l’interface. Le replay de résultats pourra rester utilisable hors ligne. Le double-clic sur un HTML ne doit pas être présenté comme lançant automatiquement un moteur Python.

Un seul moteur fera autorité pour les résultats métier. Le moteur JavaScript actuel peut rester disponible comme démonstration identifiée pendant la transition. Une réécriture de l’interface dans un framework n’est pas un préalable.

Répartition proposée : **Basile** valide les règles, les données et les résultats terrain ; **Claude** poursuit l’interface, l’éditeur et le replay ; **Codex** prépare les données, les contrats, le moteur et les contrôles. Les changements de schéma ou d’indicateur sont partagés avant développement.

## 4. Étapes de réalisation et critères de passage

### Étape 0 — Fixer les règles et le contrat entre les composants

**Objectif :** disposer d’une référence commune qui survive aux conversations.

Travaux :
- Écrire un glossaire : service/atelier, prestation, passager, plateau, lot, trolley, dossier et vol physique.
- Créer un registre de décisions avec statut « confirmé », « hypothèse » ou « à mesurer », source et date.
- Définir les identifiants stables des zones, opérations, ressources et vols.
- Définir les schémas des données d’entrée, du scénario, des événements et des résultats, ainsi que leurs versions et unités.
- Définir le périmètre de responsabilité : disponibilité au handling, départ camion ou autre jalon. Un retard de production ne devient pas automatiquement un retard avion.

**Livrables :** `REGLES_METIER.md`, `DATA_DICTIONARY.md`, schémas JSON et un exemple synthétique complet. Ces noms sont des propositions de fichiers à créer.

**Validation :** Claude peut afficher un résultat d’exemple sans réinterpréter les calculs ; chaque inconnue est visible. Dépendance : aucune.

### Étape 1 — Construire une base de données exploitable

**Objectif :** obtenir une demande de production fiable et traçable.

Travaux :
- Importer l’onglet détaillé de l’export vols et les standards théoriques ; conserver séparément les fichiers sources.
- Normaliser les alias, notamment TX/FWI et BF/FBU, sans confondre compagnie, client facturé et opérateur du vol.
- Séparer vol physique, dossier commercial, prestation, classe et quantité ; gérer équipages, réserves, fictifs et annulations par des règles validées.
- Définir quand utiliser `Qty`, `Final Qty` et les effectifs passagers.
- Ajouter les configurations avion et les capacités auxquelles se rapportent les standards « full ».
- Conserver la source de chaque valeur : fichier, feuille, ligne/cellule et transformation.
- Produire un rapport de lignes acceptées, ambiguës ou rejetées. Une donnée absente ne devient pas silencieusement zéro ou 7 h du matin.

**Livrables :** importeur, tables normalisées, rapport de qualité et petit jeu synthétique versionnable.

**Validation :** retrouver manuellement plusieurs vols et leurs prestations sans double compte ; rattacher chaque standard à sa véritable unité. Les dossiers ambigus restent identifiables, sans être déclarés exploitables.

**Dépendance :** étape 0.

### Étape 2 — Reconstituer le calendrier de production multijour

**Objectif :** rattacher la charge au jour où elle est réalisée.

Travaux :
- Utiliser des dates et heures complètes, avec le fuseau du site ; gérer minuit et les changements de date.
- Paramétrer les fenêtres de cuisine J−2, de prépa J−1 et l’exception CRL produite le matin de J.
- Distinguer date cible, autorisation de commencer, disponibilité des intrants et échéance de fin.
- Compléter les calendriers de Dotation, Armement, BOB/Duty, Magasin et Appros.
- Alimenter la plonge par les retours effectivement disponibles et suivre les stocks d’un jour à l’autre.
- Définir l’état initial : encours, produits déjà préparés, matériel propre et sale. Prévoir une période de mise en régime si cet état n’est pas observé.

Pour analyser la journée du 17 septembre, la cuisine peut concerner les départs du 19, la prépa ceux du 18 hors exception CRL, et les CRL du soir du 17. Les deux dates d’export disponibles ne décrivent donc pas toute la charge de l’unité ce jour-là. Les arrivées renseignées à 00:00 ne constituent pas automatiquement des retours exploitables.

**Livrables :** calendrier de charge par service et registre d’exceptions par vol.

**Validation :** reconstituer une journée avec un responsable de chaque service ; identifier explicitement la couverture manquante. Un calcul partiel doit être présenté comme tel.

**Dépendance :** étape 1.

### Étape 3 — Définir les gammes et les lois de charge

**Objectif :** décrire les opérations réelles et leur comportement selon le volume.

Travaux :
- Définir les gammes par famille de prestation : manuel/robot, BC/PY/YC, équipages, SPML et non-food.
- Représenter les tâches parallèles et leurs points de réunion. Cuisine chaude et froide ne sont pas nécessairement deux étapes successives de chaque produit.
- Décomposer temps fixe, préparation de série, temps par lot, temps par pièce et nettoyage/changement de série.
- Distinguer minutes de travail humain et durée machine ; préciser quand un opérateur est immobilisé ou disponible pour une autre tâche.
- Définir le nombre minimal et maximal de personnes utile sur chaque opération et les compétences requises.
- Vérifier les frontières des standards pour ne pas compter deux fois runner, montage, manutention ou nettoyage.

Une famille de formules candidate, à choisir opération par opération, est :

`W(q) = a × indicateur(q > 0) + b × plafond(q / L) + c × q`

`W` désigne des minutes de travail humain ; `a` un temps fixe, `b` un travail par lot de taille `L`, `c` un travail par unité. Une fonction par morceaux peut convenir à d’autres opérations. Les activités quotidiennes fixes sont décrites séparément. Cette écriture est une hypothèse structurante, pas une loi déjà prouvée pour ORY.

Un standard « avion complet » donne un point de référence. **Un seul point ne permet pas d’identifier séparément les temps fixes, les effets de lot et les cadences.** Les paramètres non observés restent des hypothèses accompagnées d’une analyse de sensibilité.

De même, `durée = charge / effectif` ne sera utilisé que lorsque le partage du travail le justifie. Doubler les personnes ne divise pas nécessairement la durée par deux. Une cadence machine doit être caractérisée comme nominale ou effective pour éviter de compter deux fois ses pertes.

**Livrables :** catalogue des opérations et formules, paramètres externes, statut de confiance par paramètre.

**Validation :** comportement cohérent à quantité nulle, petit volume, changement de lot et avion complet ; bilan d’heures sans doublons. Dépendances : étapes 1 et 2.

### Étape 4 — Livrer une première chaîne calculée de bout en bout

**Objectif :** vérifier l’architecture sur un périmètre réduit et observable.

Choisir quelques dossiers validés comprenant une production robot éligible, une production manuelle et une exception CRL. Le premier périmètre couvre la prépa, le montage, le transfert et le jalon de disponibilité au handling. Les entrées cuisine et matériel propre sont alors fournies comme disponibilités explicites ; elles seront simulées dans l’étape suivante.

Travaux :
- Exécuter le calcul indépendamment de l’animation.
- Mettre en place ressources humaines, robot, calendrier, lots, priorités et encours limités sur ce périmètre.
- Réserver conjointement machine et personnel lorsque l’opération exige les deux ; empêcher les doubles affectations.
- Émettre les événements de création, attente, début, interruption éventuelle, fin et transfert.
- Rejouer ces événements sur le plan existant.

**Livrables :** moteur minimal, résultat JSON reproductible, journal d’événements et replay raccordé.

**Validation :** résultat vérifiable à la main sur des cas simples ; une indisponibilité de ressource retarde effectivement la bonne opération ; changer la vitesse d’affichage ne modifie aucun résultat.

**Dépendances :** contrats de l’étape 0, données et règles des étapes 1 à 3.

### Étape 5 — Étendre à tous les services et aux stocks

**Objectif :** faire apparaître les contraintes entre ateliers.

| Périmètre | Éléments à représenter |
|---|---|
| Magasin/Appros | Réceptions, consommables, approvisionnement, ressources partagées |
| Décontamination/Cuisine | Gammes pertinentes, chaud/froid, équipements, lots et attentes |
| Prépa/Montage | Robot, manuel, composants, assemblage et trolleys |
| Plonge | Arrivées de matériel sale, opérateurs, trois tunnels distincts, capacités et matériel propre récupéré |
| Dotation | Couverts, menus/serviettes et flux directs des assiettes propres vers l’avion selon les usages |
| Armement/BOB-Duty | Retours, préparation, approvisionnements et ressources communes ou dédiées |
| Stockages/Handling | Places disponibles, compatibilité, mouvements, délais et disponibilité de manutention |

Pour la plonge, le tunnel décrit comme environ deux fois plus rapide reste à mesurer. Les trois équipements ne doivent pas être remplacés par une capacité totale illimitée en personnel. Les stocks propres peuvent servir plusieurs départs compatibles ; ne pas imposer un appariement artificiel retour/départ.

Les contraintes de conservation, refroidissement ou durée maximale d’attente proviendront des règles opérationnelles validées du site. Aucune valeur sanitaire ne sera inventée. Une surface de local ou un rectangle du plan ne donne pas sa capacité en trolleys.

Les activités hors du périmètre principal, telles que certaines commandes ou la cantine, peuvent consommer les mêmes personnes. Les représenter au minimum comme réservations de capacité si leur production détaillée n’est pas simulée.

**Livrables :** réseau complet, nomenclatures de matériel, stocks et calendriers de ressources.

**Validation :** conservation des quantités, stocks jamais négatifs, files et blocages expliqués, capacités physiques respectées. Dépendance : étape 4. L’extension peut se faire service par service.

### Étape 6 — Fiabiliser les indicateurs et l’explication des résultats

**Objectif :** permettre à un responsable d’expliquer un résultat depuis les opérations qui le produisent.

Indicateurs à définir et calculer depuis les événements :
- Heures théoriques demandées, heures humaines simulées, présence planifiée et travail au-delà du planning, présentés séparément.
- Équivalent de charge sur 7 h, besoins simultanés et affectations par créneau.
- Files en attente, travail en cours, temps de traversée et stock.
- Occupation des personnes et des machines, avec distinction travail, attente et blocage.
- Nombre de dossiers prêts à l’échéance, en retard, inachevés à échéance dépassée et encore non exigibles.
- Cause du retard : personnel, machine, matériel, intrant, calendrier, transfert ou autre dépendance.

Le taux de service doit annoncer son dénominateur. Un vol inachevé dont l’échéance est passée ne disparaît pas du calcul. Sans vol exigible, afficher « non applicable » plutôt qu’un succès de 100 %. Un retard de disponibilité interne reste distinct du retard de départ de l’avion.

**Livrables :** dictionnaire des indicateurs et vues de détail par service/vol.

**Validation :** rapprochement des totaux avec le journal ; cas sans activité, sans personnel et avec tâches inachevées correctement affichés. À commencer dès l’étape 0 et à compléter avec les étapes 4–5.

### Étape 7 — Calibrer puis valider sur des journées distinctes

**Objectif :** mesurer la capacité prédictive réelle.

Travaux :
- Collecter, dès le début du projet, horaires et affectations réels, prolongations, quantités, heures de début/fin, changements de série, pannes et attentes importantes.
- Observer différents volumes et compositions de vols. Quand c’est possible, distinguer petits, moyens et gros lots.
- Ajuster les paramètres sur une partie des journées ; réserver d’autres journées pour la validation chronologique.
- Comparer heures par service, fins de production, files et localisation des contraintes. Utiliser un calcul linéaire simple comme référence de comparaison.
- Examiner les erreurs par type de journée et famille de prestation, pas seulement un total mensuel.
- Définir avec Basile les tolérances acceptables pour chaque usage avant d’accepter le modèle.
- **Affinage de fin de projet — les réajustements du jour.** En théorie la cuisine travaille la veille (J−1) de la prépa : le stock entre les deux est prévu, pas un problème, et se règle en mettant la case cuisine au jour J−1. Dans la réalité, des réajustements le jour même créent des stocks et des attentes hors planning. Les modéliser (part de la production refaite ou complétée le jour J, et à quel moment) est un affinage à traiter à la toute fin, une fois le modèle calé.

Des heures payées seules ne permettent pas d’identifier toutes les causes d’écart : occupation réelle, sous-charge, nettoyage, interruptions ou heures supplémentaires peuvent être mélangés. Ne pas appliquer un coefficient général d’heures supplémentaires sans diagnostic.

L’étude mathématique antérieure pourra fournir des variables à tester. Ses coefficients, seuils d’ETP et bons scores d’ajustement ne sont pas repris comme des vérités terrain.

**Livrables :** jeu d’observations, paramètres calibrés, rapport de validation et limites d’usage.

**Validation :** performances acceptables sur les journées non utilisées pour l’ajustement et écarts résiduels expliqués. La collecte démarre en parallèle ; la validation utilise les étapes 4 à 6.

### Étape 8 — Comparer les scénarios puis rechercher des organisations

**Objectif :** comparer des décisions réalisables avec des résultats fiables.

Travaux :
- Figer pour chaque exécution les données, stocks initiaux, horizon, version du moteur, paramètres et, si nécessaire, graine aléatoire.
- Comparer des plannings, répartitions de personnel, lots, priorités, cadences robot et disponibilités de tunnels.
- Distinguer un changement simulé en cours de journée d’une nouvelle exécution complète.
- Présenter gains, coûts en heures et contreparties sur les autres services.
- Si le modèle devient probabiliste, répéter les simulations et afficher la dispersion des résultats.
- N’ajouter une recherche automatique d’organisation qu’après validation, avec contraintes de compétences, horaires et objectif de service explicites.

Une simulation peut explorer une modification d’horaire avion sans que ce levier soit réellement disponible à l’unité. Les recommandations doivent distinguer leviers contrôlables et hypothèses de contexte.

**Livrables :** scénarios sauvegardables, comparatif complet et justification des résultats.

**Validation :** même entrée/version donnant le même résultat en mode déterministe ; comparaison réalisée sur le même périmètre. Les recommandations opérationnelles dépendent de l’étape 7.

### Étape 9 — Livrer et maintenir l’outil

**Objectif :** permettre une utilisation répétée et un passage de relais.

Travaux :
- Définir le mode d’utilisation : lancement local du moteur avec interface, ou lecture hors ligne de résultats précalculés.
- Documenter import, contrôle des erreurs, lancement, comparaison, export et mise à jour des paramètres.
- Sauvegarder géométries validées, configurations, décisions et résultats utiles ; les modifications conservées seulement dans le navigateur ne sont pas un référentiel partagé.
- Prévoir des tests automatiques des règles critiques et un jeu de non-régression synthétique.
- Versionner dépendances et formats, documenter les changements et les migrations de données.
- Organiser la validation d’une nouvelle version et la possibilité de réutiliser une version antérieure.

Le dépôt examiné est public et contient déjà le plan source. Il faut décider quels éléments ont vocation à y rester. Les données d’exploitation et heures réelles seront conservées dans un emplacement à accès approprié ; les tests publics utiliseront des données synthétiques. Cette revue n’ajoute aucun fichier métier au dépôt et n’en change pas la visibilité.

**Livrables :** procédure de lancement, guide utilisateur, tests et version de référence acceptée.

**Validation :** une autre personne peut importer un jeu autorisé, reproduire un résultat et comprendre ses hypothèses. Les pratiques de versionnement commencent dès l’étape 0.

## 5. Les dix premiers tickets à ouvrir

Les responsables ci-dessous décrivent une proposition de répartition du travail, sans création ni attribution effective de tickets dans GitHub.

| N° | Ticket | Responsable proposé | Dépendance | Critère de fin |
|---|---|---|---|---|
| 1 | Écrire le référentiel des règles et inconnues | Codex + Basile | Aucune | Les règles du présent document sont reprises et sourcées |
| 2 | Marquer les résultats actuels comme démonstration et corriger le taux sans vols terminés | Claude | Aucune | Aucune apparence de validation métier ; cas vide explicite |
| 3 | Définir les schémas scénario/événements/résultats | Codex + Claude | 1 | Exemple synthétique lu par l’interface |
| 4 | Importer Winrest avec un rapport de qualité | Codex | 1 | Traçabilité et plusieurs dossiers rapprochés manuellement |
| 5 | Valider quantités, fictifs, capacités full et prestations robot | Basile + Codex | 4 | Correspondances documentées ; cas restants signalés |
| 6 | Formaliser calendriers J−2/J−1/J et exceptions CRL | Codex + Basile | 4 | Charge par date/service vérifiée sur un exemple |
| 7 | Intégrer les 121 standards et expliciter leurs unités | Codex | 1, 5 | Aucun mélange vol/jour/commande ni sous-total doublonné |
| 8 | Exporter et versionner les zones validées | Basile + Claude | 3 | Identifiants communs, validation distincte du simple déplacement |
| 9 | Construire le moteur minimal prépa→handling | Codex | 3, 5, 6, 7 | Petit cas calculable à la main et ressources respectées |
| 10 | Raccorder le replay et les indicateurs au résultat du moteur | Claude + Codex | 3, 9 | Même résultat à toute vitesse d’animation |

En parallèle de ces tickets, Basile peut lancer la collecte terrain nécessaire à la calibration. Il serait dommage d’attendre que tout le moteur soit terminé pour commencer les observations.

## 6. Informations à réunir, dans l’ordre

| Priorité | Information | Ce qu’elle débloque |
|---|---|---|
| Immédiate | Capacités par classe/configuration et correspondance des standards full | Mise à l’échelle des heures |
| Immédiate | Sens de Qty/Final Qty, dossiers fictifs/équipages/réserves | Demande réelle sans doublons |
| Immédiate | Prestations robot, ECO SPML et liste des CRL concernés | Gammes et calendrier |
| Immédiate | Horaires des équipes et répartition par service sur quelques journées | Capacité humaine datée |
| Ensuite | Exports couvrant plusieurs journées consécutives et leurs besoins amont/aval | Charge multijour complète |
| Ensuite | Retours, stocks propres/sales et disponibilités initiales | Plonge et dépendances matérielles |
| Ensuite | Capacités mesurées des équipements, stockages et manutention | Contraintes physiques |
| Dès que possible | Débuts/fins observés, attentes, heures réalisées et prolongations | Calibration et validation |

Une première collecte de 7 à 14 jours consécutifs peut être pratique, à adapter aux rotations, à la diversité des journées et à la couverture J−2/J−1/J. Ce n’est pas une garantie de représentativité. Le développement peut avancer sur un périmètre réduit pendant la collecte ; un manque de données ne doit pas être masqué par des valeurs inventées.

## 7. Organisation du développement et contrôle qualité

Le **CHANGELOG** reste le journal de ce qui a été réalisé. La feuille de route décrit le futur ; le registre de décisions explique les choix. Tous doivent porter des liens vers les versions et changements correspondants.

Utiliser des branches de travail et des changements courts, avec périmètres identifiés : interface, données, moteur, validation. Garder le contrat de données commun. La branche par défaut actuelle n’a pas besoin d’être renommée pour commencer. Les pull requests doivent expliquer le comportement changé, les règles concernées et la validation effectuée.

Contrôles minimaux à prévoir :
- Alias de compagnies, règles robot et classes manuelles.
- Quantités répétées sans multiplication des passagers.
- Exceptions CRL et changements de date.
- Opération nécessitant un opérateur impossible sans opérateur disponible.
- Aucune personne affectée à deux tâches simultanément ; pauses et fins de poste respectées selon la politique choisie.
- Stocks et ressources conservés ; capacités jamais dépassées.
- Réunions de flux attendant tous les composants nécessaires.
- Cas sans activité et vols inachevés sans indicateur trompeur.
- Indépendance entre vitesse du replay et résultat du moteur.
- Reproductibilité d’un scénario versionné.

L’ordre conseillé est : **contrat commun → données et calendrier → chaîne minimale calculée/rejouée → extension aux services → validation terrain → scénarios décisionnels**. L’interface, le repérage des locaux et la collecte terrain peuvent avancer en parallèle. La priorité immédiate est de rendre la première chaîne explicable et vérifiable, puis de l’étendre.

## Sources de la revue

- [README du dépôt à la révision examinée](https://github.com/basileseguin-afk/SIMMMMMSS/blob/0d7f7d24c2de90db21f78ccc54a0e9cb6ae058d6/README.md).
- [CHANGELOG à la révision examinée](https://github.com/basileseguin-afk/SIMMMMMSS/blob/0d7f7d24c2de90db21f78ccc54a0e9cb6ae058d6/CHANGELOG.md).
- [Moteur et interface JavaScript à la révision examinée](https://github.com/basileseguin-afk/SIMMMMMSS/blob/0d7f7d24c2de90db21f78ccc54a0e9cb6ae058d6/sim.js).
- Fichiers fournis : cadrage initial, `RECAP_FORMULES_DECOUVERTES.md`, export vols des 17–18 septembre 2026, `MAP ORY.xlsx`, `Man hours pour tous les services.xlsx`.
- Précisions de Basile dans la conversation, prioritaires sur les hypothèses de démonstration ou de l’étude précédente.
