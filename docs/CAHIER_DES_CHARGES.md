# Cahier des charges consolidé et écarts — 23 septembre 2026

Ce document rassemble **tout ce qui a été demandé** depuis le début du projet
(17 septembre) : le cahier des charges initial (`prompt-simulation-newrest`),
la feuille de route d'Astra (17/09) et les demandes de Basile au fil des
échanges. Pour chaque exigence : sa **source**, son **état vérifié dans le
code** au 23/09, et l'**écart** restant.

Légende : ✅ fait · 🟡 partiel · ❌ absent · ⏸ reporté · ⛔ abandonné ou remplacé par une décision

Aucune donnée réelle de l'unité ne figure ici : le dépôt est public.

---

## 1. La finalité, telle qu'elle est aujourd'hui

Simuler la production de l'unité de catering aérien d'Orly — une journée aujourd'hui, **plusieurs journées enchaînées** à terme (objectif confirmé le 23/09) — pour :

1. **voir où et quand se forment les bouchons** selon les vagues de vols ;
2. **mesurer la charge** et optimiser le personnel par service ;
3. **tester des scénarios** (effectifs, cadence robot, tunnels, horaires de vols)
   et les comparer A / B.

La simulation est alimentée par les **man-minutes** et le **programme de vols**.
Depuis le 23/09, elle doit aussi être **compréhensible par quelqu'un qui n'est
pas du métier de l'informatique**, et se lire **en images plus qu'en texte**.

Le modèle a changé deux fois de nature. Il est utile de le garder en tête avant
de relire le cahier des charges initial :

| Date | Décision de Basile | Effet |
|---|---|---|
| 18/09 | Plan et vols réels **privés** | Le dépôt public ne porte que des données fictives |
| 21/09 | « Le partie table etc […] on abandonne » | Fin des tables, chaînes et grille 50 × 50 ; place aux **ateliers de travail** sans emplacement |
| 23/09 | Arrêter l'**unité par passager** | Barème et matériel **par vol** |
| 23/09 | **Parcours** en branches parallèles qui se rejoignent | Chaque compagnie × classe suit un chemin (YC sans cuisine ni légumerie) |
| 23/09 | Fusionner parcours et ateliers | Tableau « Qui prépare quoi » |

---

## 2. Cadre, contraintes, méthode de travail

| # | Exigence | Source | État | Écart / commentaire |
|---|---|---|---|---|
| C1 | Application navigateur en HTML/CSS/JS sans dépendance, hors ligne | CdC initial §9 | ✅ | Plus un fichier unique : un site en plusieurs fichiers, servi par GitHub Pages (demande du 18/09 « lancer directement dans GitHub ») |
| C2 | Un **seul fichier HTML** ouvrable en double-clic | CdC initial §9 | ⛔ | Remplacé par le site multi-fichiers ; il s'ouvre aussi en local (`index.html`) |
| C3 | Plan de l'unité et vols réels **jamais publiés** | 18/09 | 🟡 | `.gitignore`, `plan-prive/`, `prive/` en place. **Reste : purger `refs/pull/1..3/head` via GitHub Support** (action de Basile, jamais envoyée) |
| C4 | Un fichier qui dit, à chaque commit, ce qui a changé et où | 17/09 | ✅ | `CHANGELOG.md` |
| C5 | Un fichier de bugs à relire et remplir après chaque revue | 18/09 | ✅ | `BUGS.md` — à tenir à jour après chaque revue |
| C6 | Travail à deux assistants (Claude, Astra) sur le même dépôt | 17-19/09 | ✅ | Pas de conflit en cours ; Astra n'a pas poussé depuis la refonte du 21/09 |
| C7 | Contraste lisible en thème sombre | 17/09 | ✅ | Contrôlé par `usability-browser` |
| C8 | S'inspirer des meilleurs simulateurs industriels open source | 18/09 | ✅ | `docs/ETUDE_OPEN_SOURCE.md` ; noyau à événements discrets inspiré de SimPy |

## 3. Le plan de l'unité

| # | Exigence | Source | État | Écart |
|---|---|---|---|---|
| P1 | Plan 2D de l'unité, orienté Sud → Nord, toutes les zones étiquetées | CdC §2, §6 | ✅ | Fond réel chargé depuis `plan-prive/` (absent du dépôt public) |
| P2 | Zones à la bonne taille et au bon endroit, **corrigeables** | 17/09 | ✅ | Éditeur de plan (« Modifier le plan ») ; 8 zones restent marquées « à confirmer » |
| P3 | Formes libres (polygones), pas seulement des rectangles | 17/09 | ✅ | |
| P4 | Couleurs choisies à l'édition visibles dans la simulation | 21/09 | ✅ | |
| P5 | Ajouter une zone de production (ex. **Armement 2**) | 21/09 | ✅ | Annexes ; elles apparaissent dans les services et les liens |
| P6 | Zoom nettement amélioré ; cliquer un service zoome dessus | 19/09, 21/09 | ✅ | |
| P7 | Stockages dessinés (congélateurs, frigos, frigo handling, zones de mise à dispo) | CdC §2, §6 | 🟡 | Stockages par service décrits et dessinés ; **ils ne limitent pas le flux** (voir M12) |

## 4. Données d'entrée

| # | Exigence | Source | État | Écart |
|---|---|---|---|---|
| D1 | Import du programme de vols (départs et retours) | CdC §4, 23/09 | ✅ | Excel `.xlsx` et CSV ; export aller-retour |
| D2 | Colonnes BC, PC, YC, **CREW**, **SPML** | CdC §4, 22/09 | ✅ | |
| D3 | Import des **man-minutes** et format défini | CdC §4, 23/09 | ✅ | Classeur « Barème » ; `docs/FORMATS_EXCEL.md`. **L'étude réelle n'est pas encore importée** |
| D4 | Man-minutes **par vol**, plus par passager | 23/09 | ✅ | |
| D5 | Man-minutes **par compagnie × classe** pour certains services | 23/09 | ✅ | Grille compagnie × classe, service par service |
| D6 | Import des effectifs (staffing) | CdC §4 | ✅ | Classeur « Ateliers » (équipes, horaires, personnes) |
| D7 | Piloter les ateliers depuis Excel : modifier, **ajouter** des compagnies × classes | 23/09 | ✅ | |
| D8 | Passagers, nombre de vols et échéance **lus dans l'import**, jamais ressaisis | 22/09 | ✅ | |
| D9 | Lire l'**export Winrest** réel (lignes de prestations, dossiers, `Qty` / `Final Qty`) | Feuille de route §2, étape 1 | ❌ | Seul le format simplifié est lu. Règles à fixer : dossier ≠ vol, équipages, fictifs, annulés |
| D10 | Jeu d'exemple embarqué (plusieurs compagnies, vague matin et soir) | CdC §9 | ✅ | Fictif : 12 départs, 6 retours |
| D11 | Traçabilité des sources et rapport d'import (acceptées, ambiguës, rejetées) | Feuille de route étape 1 | 🟡 | Refus en bloc avec ligne et feuille ; pas de rapport « ambigu » |

## 5. Le modèle de production

| # | Exigence | Source | État | Écart |
|---|---|---|---|---|
| M1 | Moteur à **événements discrets** | CdC §5 | ✅ | `moteur/noyau.js` (JavaScript) |
| M2 | Moteur de référence en **Python / SimPy** | Feuille de route §3 | ⛔ | **Décidé le 23/09 : un seul moteur, en JavaScript** (voir §14). Il tourne à l'identique dans le navigateur et en ligne de commande (Node) pour les calculs en série |
| M3 | **Atelier de travail** = une équipe dans un service : heure de départ, nombre de personnes, ce qu'elle fait ; **heure de fin calculée** | 21/09 | ✅ | |
| M4 | Un atelier fabrique **plusieurs compagnies × classes**, reliées d'un service à l'autre | 21/09 | ✅ | Via les parcours |
| M5 | Atelier **robot** : débit, classes, personnes (avec minimum), heure d'allumage, pauses machine | 21/09 | ✅ | |
| M6 | **Pauses** : 15 min après 3 h, 30 min après 6 h, 8 h 15 de présence | 22/09 | ✅ | Réglable ; l'arrêt programmé (machine, local) est séparé |
| M7 | **Plonge** : débit par tunnel **et** plafond de l'ensemble | 22/09 | ✅ | |
| M8 | **Mise à disposition** (magasin, appros…) : ni man-minutes ni durée | 22/09 | ✅ | |
| M9 | **Boucle du matériel** : départs → retours → plonge → propre ; stock = retours − départs | 22/09 | 🟡 | Un seul compte pour tout le matériel ; pas de distinction trolley / porcelaine / compagnie ; **pas de report d'un jour sur l'autre** |
| M10 | **Parcours** en branches parallèles qui se rejoignent ; YC sans cuisine ni légumerie ; branche magasin → montage | 23/09 | ✅ | |
| M11 | **Simuler plusieurs journées enchaînées** — cuisine J−2, prépa J−1, CRL du soir le matin de J | Feuille de route étape 2 ; **objectif final confirmé le 23/09** | 🟡 | Une équipe peut commencer de J−7 à J, mais **une seule journée est simulée** et rien ne passe d'un jour au suivant |
| M12 | Stockages à **capacité finie** (frigos, frigo handling) qui bloquent le flux | CdC §4, feuille de route étape 5 | ❌ | Décrits sur le plan, sans effet sur le calcul |
| M13 | **Compétences** et affectation des personnes (vivier partagé entre ateliers) | Feuille de route étape 3 ; 21/09 | ❌ | Le vivier partagé a disparu avec la refonte ; chaque équipe a son effectif propre |
| M14 | Loi de charge : temps fixe, temps par lot, temps par pièce | Feuille de route étape 3 | ❌ | Travail = minutes par vol × nombre de vols ; linéaire |
| M15 | Robot réservé à l'économie de certaines compagnies | Feuille de route §2 | ✅ | C'est l'utilisateur qui confie les classes au robot |
| M16 | Circulation des personnes entre services (runners) | 17-18/09 | 🟡 | Décrite dans « L'unité » ; **le calcul ne déplace personne** |
| M17 | Aléas (pannes, absences, retards de livraison) | Feuille de route étape 8 | ❌ | Calcul déterministe, assumé et écrit ; à ouvrir plus tard |

## 6. Simulation et visualisation

| # | Exigence | Source | État | Écart |
|---|---|---|---|---|
| V1 | Rejouer la journée : horloge, lecture, pause, pas à pas, vitesse | CdC §6 | ✅ | |
| V2 | **Jetons animés** (trolleys, flux) circulant le long des liens | CdC §6 | ⏸ | **Reporté le 23/09** : les animations viendront plus tard |
| V3 | **Couleur de congestion** par service (vert → orange → rouge selon l'occupation et la file) | CdC §6 | 🟡 | Quatre états (au travail, attend, a fini, pas commencé) avec médaillon coloré ; **pas de gradient d'occupation** |
| V4 | Mettre en évidence le **goulot courant** | CdC §6 | 🟡 | « À regarder » nomme le service qui attend depuis le plus longtemps, et celui qui a le plus attendu sur la journée |
| V5 | **Robot** et **tunnels de plonge** visibles sur le plan avec leur cadence en direct | CdC §6 | ⏸ | **Reporté le 23/09** avec les animations |
| V6 | Plan et tableau de bord visibles en même temps | CdC §9 | ✅ | « La journée » : plan + panneau « En ce moment » |
| V7 | Suivre un repas dans le temps et **expliquer son retard** | Feuille de route étape 6 | ✅ | Frise étape par étape et phrase (« le montage a attendu 25 min la dotation ») |

## 7. Indicateurs

| # | Indicateur | Source | État | Écart |
|---|---|---|---|---|
| K1 | % de repas / vols à l'heure, retard moyen et maximal | CdC §7 | ✅ | Dénominateur annoncé ; « — » avant la première échéance |
| K2 | Vols inachevés comptés, jamais masqués | Feuille de route étape 6 | ✅ | |
| K3 | **Taux d'occupation** par atelier | CdC §7 | ❌ | |
| K4 | **Encours et longueur de file** par atelier | CdC §7 | 🟡 | Nombre de services qui attendent ; pas de longueur de file |
| K5 | **Débit** (plateaux, trolleys par heure), global et par atelier | CdC §7 | ❌ | |
| K6 | Man-minutes **consommées vs disponibles** par atelier | CdC §7 | 🟡 | Heures de travail totales au bilan ; pas le rapport par atelier |
| K7 | **Courbe** de débit et d'encours sur la journée, avec les pics | CdC §7 | ❌ | Il existe le planning des équipes et la frise des départs, pas de courbe |
| K8 | ETP (heures ÷ 7), besoins simultanés par créneau | Feuille de route §1, étape 6 | ❌ | Existait dans l'ancien moteur, perdu à la refonte |
| K9 | Cause du retard (personnel, machine, matériel, amont…) | Feuille de route étape 6 | 🟡 | Amont et matériel oui ; personnel ou machine non distingués |

## 8. Leviers « what-if » et scénarios

| # | Levier | Source | État | Écart |
|---|---|---|---|---|
| W1 | Effectif par atelier | CdC §8 | ✅ | Dans la fiche de chaque équipe (pas de curseur) |
| W2 | Cadence du robot | CdC §8 | ✅ | |
| W3 | Nombre de tunnels actifs | CdC §8 | ✅ | |
| W4 | Décalage des vols **global** | CdC §8 | ✅ | |
| W5 | Décalage **par vol** | CdC §8 | ❌ | Seulement en réimportant le programme |
| W6 | Vitesse de lecture | CdC §8 | ✅ | |
| W7 | Comparaison **A / B** | CdC §8 | ✅ | « Comparer deux essais », avec verdict « mieux / moins bien » |
| W8 | Export des résultats CSV / JSON, capture du plan | CdC §8 | 🟡 | JSON oui ; **ni CSV des résultats ni capture** |
| W9 | Scénario figé et reproductible (données, version, paramètres) | Feuille de route étape 8 | 🟡 | Calcul déterministe et empreinte ; pas d'archivage d'un scénario complet |

## 9. Ergonomie

| # | Exigence | Source | État | Écart |
|---|---|---|---|---|
| E1 | Beaucoup moins de texte dans les panneaux | 21/09 | ✅ | Contrôlé par `aide-browser` (25 mots au plus par bloc) |
| E2 | Réglages dans un vrai onglet pleine largeur | 21/09 | ✅ | « Les temps de travail » |
| E3 | Créer puis **valider** un atelier ; ajouter et supprimer des lignes | 22/09 | ✅ | |
| E4 | Site « user friendly », sur le modèle des sites qui le sont | 22/09 | ✅ | |
| E5 | Parcours et ateliers réunis, **très intuitif** | 23/09 | ✅ | Tableau « Qui prépare quoi », menus au clic |
| E6 | Compréhensible par un non-informaticien | 23/09 | ✅ | Quatre étapes, « Comment ça marche », mots simples |
| E7 | Moins textuel, **coloré, visuel** | 23/09 | ✅ | Couleurs par sens, pictogrammes, jauges, frise, plan de métro, barres |
| E8 | Nettoyage de tout ce qui n'est plus utilisé | 23/09 | ✅ | |
| E9 | Tester l'interface avec de vrais utilisateurs | — | ❌ | Jamais fait ; seul moyen de savoir si E6 et E7 sont atteints |

## 10. Méthode et fiabilité (feuille de route d'Astra)

| # | Exigence | État | Écart |
|---|---|---|---|
| F1 | Glossaire, registre des décisions, dictionnaire des données (`REGLES_METIER.md`, `DATA_DICTIONARY.md`) | 🟡 | Couvert en partie par `MODELE_ATELIERS.md` et `FORMATS_EXCEL.md` ; pas de registre des décisions |
| F2 | Tests automatiques | ✅ | 179 tests purs, 15 parcours navigateur |
| F3 | **Calibration** sur des journées observées | ❌ | Il faut l'étude de man-minutes et des relevés terrain |
| F4 | **Validation** sur des journées distinctes, tolérances fixées avec Basile | ⏸ | **Au fil de l'eau** (23/09) : les tolérances se fixeront à mesure que les données arrivent |

## 11. Abandonné par décision — ne pas y revenir sans le décider

| Demande d'origine | Date | Remplacée par |
|---|---|---|
| Tables, chaînes, lignes robot sur mesure, assemblages de tables, stockage à roulettes et en trolley | 18/09 | Ateliers de travail sans emplacement (21/09) |
| Grille de 50 × 50 cm « comme Minecraft en 2D » | 19/09 | Idem |
| Curseurs d'effectifs, contenances par atelier | 17-22/09 | Effectif et horaires par équipe |
| Unité de travail par passager | 17/09 | Minutes par vol (23/09) |
| Un seul fichier HTML | 17/09 | Site GitHub Pages |

---

## 12. Les écarts qui comptent, par ordre de priorité (révisé le 23/09)

1. **Importer l'étude de man-minutes réelle** (D3) et **calibrer au fil de
   l'eau** (F3). Tant que les chiffres sont des exemples, le site montre un
   fonctionnement, pas une réalité.
2. **Simuler plusieurs journées enchaînées** (M11, M9) — l'objectif final :
   - un programme de vols **daté**, sur plusieurs jours ;
   - des équipes qui reviennent chaque jour (ou selon le jour de la semaine) ;
   - la cuisine à J−2 et la prépa à J−1 **calculées**, plus réglées à la main ;
   - ce qui reste le soir **passe au lendemain** : matériel propre et sale,
     préparations d'avance, retards ;
   - un bilan **par jour** et **sur la période**.
3. **Indicateurs de charge**, par jour et sur la période : occupation par
   équipe (K3), débit (K5), consommé / disponible (K6), ETP (K8), courbe de la
   journée (K7).
4. **Lire l'export Winrest réel** (D9), avec ses règles de dossiers.
5. **Stocks à capacité finie** (M12) — ils prennent tout leur sens sur
   plusieurs jours.
6. **Décalage par vol** (W5), **export CSV des résultats** (W8), **loi de
   charge par lot** (M14).
7. **Couleur des services selon leur charge** (V3), sans animation.
8. **Purge des `refs/pull/1..3/head`** (C3, action de Basile) et **test par des
   personnes du terrain** (E9).

Reporté : tout ce qui est **animation** (V2, V5).

## 13. Question encore ouverte : le « vivier » de personnes (M13)

Aujourd'hui, chaque équipe a **son** effectif : « Cuisine matin, 4 personnes,
de 04:30 à 12:45 ». Ces 4 personnes ne font que de la cuisine, du début à la
fin de leur poste.

La question est de savoir si, **dans la réalité**, des personnes changent de
service en cours de journée. Par exemple, la plonge a fini à 10 h et ses 3
personnes vont aider au montage.

- **Si non** — chacun reste dans son équipe —, le modèle actuel suffit.
- **Si oui**, il faut un « vivier » : on déclare « 20 personnes présentes de
  04:00 à 12:15, dont 8 savent faire la cuisine », et la simulation les place là
  où il y a du travail. C'est plus réaliste, mais plus lourd à paramétrer.

Réponse attendue de Basile ; sans elle, le modèle actuel reste en place.

## 14. Registre des décisions

| Date | Décision | Par | Raison |
|---|---|---|---|
| 18/09 | Plan et vols réels hors du dépôt public | Basile | Confidentialité |
| 21/09 | Ateliers de travail sans emplacement ; abandon des tables, chaînes, grille | Basile | Plus simple à simuler |
| 23/09 | Temps de travail par vol, plus par passager | Basile | Le passager « ne représente rien » |
| 23/09 | Parcours en branches ; fusion avec les équipes | Basile | Deux faces d'une même chose |
| 23/09 | **Un seul moteur, en JavaScript** | Claude, délégué par Basile | Voir ci-dessous |
| 23/09 | **Objectif final : plusieurs journées enchaînées** | Basile | |
| 23/09 | Validation du modèle au fil de l'eau | Basile | Les données arrivent progressivement |
| 23/09 | Animations reportées | Basile | |

**Pourquoi JavaScript plutôt que Python.**

- **Le site s'ouvre sans rien installer.** GitHub Pages ou un double-clic en
  local suffisent, y compris pour le travail confidentiel dans `plan-prive/`.
  Un moteur Python demanderait un serveur ou une installation sur chaque poste,
  et ferait perdre le calcul instantané à chaque modification.
- **Le volume est petit.** Une journée représente quelques milliers
  d'événements, une semaine quelques dizaines de milliers : quelques
  millisecondes en JavaScript. Plusieurs journées ne demandent pas Python.
- **Un seul moteur, c'est une seule vérité.** Deux moteurs divergeraient et
  doubleraient l'entretien. Celui-ci a déjà 179 tests.
- **Le calcul en série reste possible.** Le même moteur tourne sous Node en
  ligne de commande : c'est déjà le cas pour les tests. Il pourra donc enchaîner
  des centaines de scénarios pour la calibration.
- **Quand Python deviendrait utile** : pour une optimisation ou un ajustement
  statistique lourd lors de la calibration. Ce serait alors un outil
  **à côté**, qui lit et écrit les mêmes classeurs, et non un second moteur.
