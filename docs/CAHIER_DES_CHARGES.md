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
| C7 | Contraste lisible en thème sombre | 17/09 | ✅ | Abandonné le 23/09, revenu en option le 08/10 avec la refonte (voir §11) : thème clair par défaut ; le contraste AA des deux thèmes est vérifié par `contraste.test` |
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
| D3 | Import des **man-minutes** et format défini | CdC §4, 23/09 | ✅ | Classeur « Barème » ; `docs/FORMATS_EXCEL.md`. **L'étude réelle n'est pas encore importée**. Version 1 : un calage « × a » peut corriger les minutes d'un service (« Appliquer au barème », M22), et s'annuler à l'identique |
| D4 | Man-minutes **par vol**, plus par passager | 23/09 | ✅ | |
| D5 | Man-minutes **par compagnie × classe** pour certains services | 23/09 | ✅ | Grille compagnie × classe, service par service |
| D6 | Import des effectifs (staffing) | CdC §4 | ✅ | Classeur « Ateliers » (équipes, horaires, personnes) |
| D7 | Piloter les ateliers depuis Excel : modifier, **ajouter** des compagnies × classes | 23/09 | ✅ | |
| D8 | Passagers, nombre de vols et échéance **lus dans l'import**, jamais ressaisis | 22/09 | ✅ | |
| D9 | Lire l'**export Winrest** réel (lignes de prestations, dossiers, `Qty` / `Final Qty`) | Feuille de route §2, étape 1 | ✅ | Version 1 (banc d'essai, évolution 13) : l'onglet « Flights » tel quel, dans la page et par `outils/importer-flights.cjs` ; une livraison = un vol, `Guest qty` une fois par type, équipages, réserves, vols fictifs, statuts annulés, par des règles réglables et sauvegardées (`FORMATS_EXCEL.md` § 7). L'export ne donne que des départs : pas de retours |
| D10 | Jeu d'exemple embarqué (plusieurs compagnies, vague matin et soir) | CdC §9 | ✅ | Fictif : 12 départs, 6 retours |
| D11 | Traçabilité des sources et rapport d'import (acceptées, ambiguës, rejetées) | Feuille de route étape 1 | ✅ | Pour l'export Winrest (évolution 13) : acceptées = les vols gardés, par jour et par compagnie ; ambiguës = les points à vérifier (une valeur qui change dans une livraison), avec les types ignorés, les réserves fondues, les vol_id suffixés ; rejetées = les livraisons écartées et leur motif ; dans la page et en classeur. Reste : les autres imports (vols Excel ou CSV, réel, planning, classeurs) refusent toujours en bloc, sans rapport « ambigu » ; le programme ne garde pas son fichier ni son rapport d'origine après un rechargement (l'outil les écrit, `--rapport`) |

## 5. Le modèle de production

| # | Exigence | Source | État | Écart |
|---|---|---|---|---|
| M1 | Moteur à **événements discrets** | CdC §5 | ✅ | `moteur/noyau.js` (JavaScript) |
| M2 | Moteur de référence en **Python / SimPy** | Feuille de route §3 | ⛔ | **Décidé le 23/09 : un seul moteur, en JavaScript** (voir §14). Il tourne à l'identique dans le navigateur et en ligne de commande (Node) pour les calculs en série |
| M3 | **Atelier de travail** = une équipe dans un service : heure de départ, nombre de personnes, ce qu'elle fait ; **heure de fin calculée** | 21/09 | ✅ | |
| M4 | Un atelier fabrique **plusieurs compagnies × classes**, reliées d'un service à l'autre | 21/09 | ✅ | Via les parcours |
| M5 | Atelier **robot** : débit, classes, personnes (avec minimum), heure d'allumage, pauses machine | 21/09 | ✅ | |
| M6 | **Pauses** : 8 h de présence dont 1 h de pause — 3 h de travail, 15 min, 3 h, 45 min, puis 1 h ; avant le 06/10 : 15 min après 3 h, 30 min après 6 h, 8 h 15 | 22/09 | ✅ | Réglable ; l'arrêt programmé (machine, local) est séparé |
| M7 | **Plonge** : débit par tunnel **et** plafond de l'ensemble | 22/09 | ✅ | |
| M8 | **Mise à disposition** (magasin, appros…) : ni man-minutes ni durée | 22/09 | ✅ | |
| M9 | **Boucle du matériel** : départs → retours → plonge → propre ; stock = retours − départs | 22/09 | 🟡 | Un seul compte pour tout le matériel ; pas de distinction trolley / porcelaine / compagnie. Sur une période (version 1, évolution 10 — `BANC_ESSAI.md` § 9), **le report d'un jour sur l'autre** : le sale non lavé et le stock propre passent au lendemain, et en « J+1 » le sale du jour vient des départs de la veille ; dans la page, la journée choisie part du sale que la veille lui laisse dans la période calculée |
| M10 | **Parcours** en branches parallèles qui se rejoignent ; YC sans cuisine ni légumerie ; branche magasin → montage | 23/09 | ✅ | Depuis le 23/09 au soir : un graphe de nœuds et de liens (voir E11) |
| M11 | **Simuler plusieurs journées enchaînées** — cuisine J−2, prépa J−1, CRL du soir le matin de J | Feuille de route étape 2 ; **objectif final confirmé le 23/09** | 🟡 | Version 1 (évolution 10 — `BANC_ESSAI.md` § 9) : un programme de vols **daté**, joué jour après jour (`moteur/periode.js`), avec un **bilan par jour de travail** (chaque équipe au jour des vols + son `jour`) et sur la période. Passent d'un jour au suivant : le sale et le propre ; **pas encore** les lots non finis, les retards ni les préparations d'avance. Dans la page : un sélecteur de journée de vols, « Simuler la période » (par étapes, Annuler, « à relancer » après un réglage modifié) et la page Résultats › Période (jour de travail × service, totaux et moyennes par mois, détail par équipe et par compagnie ; la charge et l'arrondi au service, M19) ; l'outil `outils/simuler-periode.cjs` ; le classeur Excel de la période, le même depuis la page et l'outil (`FORMATS_EXCEL.md` § 4) |
| M12 | Stockages à **capacité finie** (frigos, frigo handling) qui bloquent le flux | CdC §4, feuille de route étape 5 | ❌ | Décrits sur le plan, sans effet sur le calcul |
| M13 | **Compétences** et affectation des personnes (vivier partagé entre ateliers) | Feuille de route étape 3 ; 21/09 | ❌ | Le vivier partagé a disparu avec la refonte ; chaque équipe a son effectif propre. Pour comparer au réel (M20), les rôles de l'unité se rangent en lignes de services ; ni compétence ni affectation de personne |
| M14 | Loi de charge : temps fixe, temps par lot, temps par pièce | Feuille de route étape 3 | ❌ | Travail = minutes par vol × nombre de vols ; linéaire |
| M15 | Robot réservé à l'économie de certaines compagnies | Feuille de route §2 | ✅ | C'est l'utilisateur qui confie les classes au robot |
| M16 | Circulation des personnes entre services (runners) | 17-18/09 | 🟡 | Décrite dans « L'unité » ; **le calcul ne déplace personne** |
| M17 | Aléas (pannes, absences, retards de livraison) | Feuille de route étape 8 | ❌ | Calcul déterministe, assumé et écrit ; à ouvrir plus tard. Un calage (M21) chiffre l'écart au réel qui reste : la bande P10–P90 de ses erreurs hors échantillon, sans rien simuler d'aléatoire |
| M18 | **L'équipe d'un robot suit les vols** : le travail autour de la ligne (chargement, montage, runner) se budgète par vol | Banc d'essai, évolution 9 | ✅ | Version 1 (`BANC_ESSAI.md` § 10) : dans un service de robots (une annexe où ne travaillent que des robots, comme le Robot sous le Montage) à effectif calculé, avec des heures par vol à son barème **propre**, comme une équipe à la main, au moins son minimum ; ailleurs, sur demande ; sa ligne va toujours à son débit. Sans ces heures (le barème repris du Montage ne compte pas), ou « Constant (saisi) », l'effectif saisi |
| M19 | **La charge de chaque équipe, et l'arrondi au service** : ne pas compter deux fois l'arrondi d'équipes qui se partagent un service | Banc d'essai, évolution 11 (a) | ✅ | Version 1 (`BANC_ESSAI.md` § 10) : la charge en ETP, non arrondie, de chaque équipe d'une période (besoin exact, homme-minutes ÷ poste d'un robot ou d'une plonge saisis, personnes × présence ÷ présence générale) ; par service et jour, ⌈charge⌉ et le surplus d'arrondi ; l'encadrement à part. Dans la page Période, l'outil et le classeur |
| M20 | **Comparer la période simulée au réel**, rôle par rôle : le réel par jour, une correspondance des rôles avec la simulation, l'écart par ligne | Banc d'essai, évolution 11 (b) | ✅ | Version 1 (`BANC_ESSAI.md` § 10, `FORMATS_EXCEL.md` § 5) : le fichier « Réel par jour » (refusé entier s'il est mal formé ; une anomalie n'écarte que sa cellule ; deux cas signalés) ; la correspondance (services, encadrement, chauffeurs, hors simulation ; bases d'ETP) ; par ligne, réel, simulé et écart par jour, erreur, biais et corrélation par mois et sur la période, le total de l'unité. Page Période (« Réel et calage »), outil `caler-periode`, classeur. Le réel reste en mémoire ; la sauvegarde ne garde que la correspondance et les décisions. Une cellule absente du réel n'est pas un zéro : son jour sort de la ligne et du total de l'unité, avec sa raison (correction 12) |
| M21 | **Caler la simulation sur le réel** sans apprendre par cœur : un modèle par ligne, validé sur des jours qu'il n'a pas vus | Banc d'essai, évolution 11 (c) | ✅ | Version 1 (`BANC_ESSAI.md` § 10) : deux références (moteur, constante), trois candidats (× a, b + a ×, × a × jour ; quatre de plus avec M25) ; validation en laissant de côté une semaine ISO, et un mois quand il y en a deux de 14 jours ; cinq règles (plus juste, stable, bornes, Wilcoxon, placebo) ; σ et la bande P10–P90 ; le total de l'unité avant / après. Dans la page (« Caler »), l'outil et le classeur |
| M22 | **Prévoir l'effectif** d'après le calage, ou corriger le barème | Banc d'essai, évolution 11 (d) | ✅ | Version 1 (`BANC_ESSAI.md` § 10) : « Garder comme politique d'effectif » (modèles, paramètres, σ, date, période ; aucune heure réelle) ; le prévu calé et sa bande P10–P90 par ligne et pour l'unité, dans la page Période, la Synthèse de la journée, l'outil (`prevuCale`, même pour un programme futur) et la feuille Période ; « Appliquer au barème » un × a, « Annuler » à l'identique ; « à refaire » quand le barème, les équipes ou la correspondance changent ; une ligne dégradée de plus de 0,3 ETP signalée |
| M23 | **Les vacations longues** : des heures sup d'office, sans débordement de charge, sur les postes à vacation longue et fixe (régulation, coordination) | Banc d'essai, évolution 11 (e) | ✅ | Version 1 (`BANC_ESSAI.md` § 10, `MODELE_ATELIERS.md`) : une présence au contrat (`presenceContrat`) sur une équipe et sur l'encadrement saisi d'un service ({ personnes, presence, presenceContrat } ; l'ancienne forme, un nombre, se lit toujours) ; au-delà, chaque personne compte l'écart en heures sup d'office, chaque jour (`heuresSupOffice`, `heuresSupOfficeEncadrement`) ; la comparaison au réel les ajoute aux heures sup simulées. Sans ce champ, rien ne change |
| M24 | **Rejouer chaque jour passé avec les personnes réellement présentes**, et caler le travail à part des décisions d'effectif | Banc d'essai, évolution 11 (f) | ✅ | Version 1 (`BANC_ESSAI.md` § 10, `FORMATS_EXCEL.md` § 5) : un planning daté (CSV ou feuille « Planning »), chaque jour rejoué avec ses équipes, leurs horaires et leurs personnes, à effectif imposé, des heures sup jusqu'à 12 h ; la comparaison ajoute les heures supp jour par jour, les nuits de plonge ouvertes, les lots en retard ; le calage du travail, un facteur des homme-minutes par ligne (grille de 0,5 à 2, affinage à ±4 et ±8 %), validé comme M21 (règles 1 à 4), applicable au barème. Dans la page (progression, Annuler), les outils (`--planning`, `--travail`) et le classeur ; le planning reste en mémoire |
| M25 | **Une formule par service, apprise sur le réel**, et dire si elle vaut besoin | Banc d'essai, évolution 17 | ✅ | Version 1 (`BANC_ESSAI.md` § 10, `FORMATS_EXCEL.md` § 4 et 5). Les temps par vol du barème restent des entrées. Par ligne de la correspondance, la forme qui passe le mieux du travail au barème aux heures réelles, parmi un catalogue (« × a », « b + a × », « × a × jour », « puissance », « logarithme », « plancher », « plafond »), ajustée par moindres carrés dans ses bornes et jugée hors échantillon comme M21, avec deux garde-fous de plus (le seuil du test divisé par le nombre de candidats ; une forme plus riche seulement si elle bat la plus simple de plus de 0,1 ETP). La formule retenue s'écrit en clair. Chaque ligne a un statut — « à la limite » (les heures suivent le travail, les heures supp montent avec la charge), « en sur-effectif », « indéterminé » — et, hors « à la limite », la formule n'est que l'effectif mis : le besoin se borne (« au plus » le travail au barème du jour × le rythme des jours chargés). La politique d'effectif garde la forme, le statut et ce rythme, sans heure réelle. Dans la page (rapport, nuage de points, Période, Synthèse), les outils et les classeurs. Limites : une formule ne vaut que pour des jours qui ressemblent à ceux appris ; le statut ne mesure pas l'occupation réelle |
| M26 | **Le relais à la plonge par vol** : deux équipes qui se suivent se passent le vol en cours dans son tunnel ; personne ne reste en heures sup pour le finir ; ce qui n'est pas fini à la fin de la dernière présence se lave le lendemain | Banc d'essai, évolution 18 | ✅ | Version 1 (`BANC_ESSAI.md` § 2, `MODELE_ATELIERS.md`). La règle est automatique, sans réglage, et ne change que la plonge par vol. Une équipe prend un vol tant qu'elle est présente ; à la fin de sa présence, une autre équipe de la même plonge présente à cet instant sur la même machine (un tunnel du même nom) continue le lavage : un seul lot, avec ses parts. Sinon le lavage s'arrête ; **la première équipe de la plonge qui arrive ensuite sur cette machine le reprend d'abord**, pour sa seule durée restante, à la vitesse de son tunnel — le même lot, une part de plus, avec son trou (correction 19). Ce n'est que sans équipe pour le reprendre ce jour-là que le vol reste sale et passe au lendemain avec sa durée restante (`saleFinal[].reste`), lavée d'abord. Une plonge par vol n'a plus d'heures sup ; la nuit « sur le retard » se juge sur le lavage que le retard pousse au-delà de la présence du matin. Dans les résultats : le lot sur les deux lignes du planning (une reprise, avec son trou : « arrêté à hh:mm, repris par … à hh:mm »), « reste à laver le lendemain » dans la Synthèse, une conséquence de plus pour « Où ça coince » — seulement quand la première équipe du lendemain ne peut pas absorber ce reste pendant sa présence (correction 19, § 6 bis). |

## 6. Simulation et visualisation

| # | Exigence | Source | État | Écart |
|---|---|---|---|---|
| V1 | Rejouer la journée : horloge, lecture, pause, pas à pas, vitesse | CdC §6 | ✅ | |
| V2 | **Jetons animés** (trolleys, flux) circulant le long des liens | CdC §6 | ⏸ | **Reporté le 23/09** : les animations viendront plus tard |
| V3 | **Couleur de congestion** par service (vert → orange → rouge selon l'occupation et la file) | CdC §6 | 🟡 | Quatre états (au travail, attend, a fini, pas commencé) avec médaillon coloré ; **pas de gradient d'occupation** |
| V4 | Mettre en évidence le **goulot courant** | CdC §6 | ✅ | La Synthèse nomme le goulot de la journée (le service au plus grand cumul d'attente, au-delà du seuil), son moment, sa file et sa cause (évolution 15, R2) ; dans le plan rejoué, « À regarder » nomme le service qui attend depuis le plus longtemps, seulement au-delà du seuil |
| V5 | **Robot** et **tunnels de plonge** visibles sur le plan avec leur cadence en direct | CdC §6 | ⏸ | **Reporté le 23/09** avec les animations |
| V6 | Plan et tableau de bord visibles en même temps | CdC §9 | ✅ | « La journée » : plan + panneau « En ce moment » |
| V7 | Suivre un repas dans le temps et **expliquer son retard** | Feuille de route étape 6 | ✅ | Frise étape par étape et phrase (« le montage a attendu 25 min la dotation ») |
| V8 | **Temporalité** : le temps entre la fin d'un atelier et le début du suivant est un **stock** ; les retours plus rapides que la plonge forment un **bouchon** | 24/09 | ✅ | Stocks par séjour, par lien et devant chaque service (et avant le chargement) ; file de sale, attente, heures en dépassement ; affichés sur le chemin, la frise, l'onglet « Stocks et retours » et le plan rejoué |

## 6 bis. Contrat des résultats

Les résultats d'une journée répondent à **cinq questions, dans cet ordre**. Tout
le reste — le tableau des commandes, les vols un par un, les stocks, les
créneaux — est du **détail**, qui sert à vérifier une réponse, pas à la donner.
Lecteurs : le chef de projet et les responsables de service (version 1,
évolution 15).

| # | Question | Indicateur | Unité | Comparé à | Seuil d'alerte (défaut) |
|---|---|---|---|---|---|
| R1 | **Combien de personnes faut-il, par service ?** | Par service et jour de travail : le **besoin** (la charge du jour en homme-minutes ÷ les minutes utiles d'un poste, arrondie au service comme dans l'évolution 11 a), les **présents** (ETP présents, K8 ; un handling à chauffeurs : ses chauffeurs), l'**écart** (présents − besoin ; seul un manque se signale) ; un **poste fixe** (une mise à disposition, une équipe d'appui saisie, un handling : pas de besoin calculé depuis une charge) n'a ni besoin ni écart et ne compte pas dans « Il faut » ; le matin (avant 13:00 du jour de travail) et l'après-midi : présents et pic au travail ; le pic de la journée et son heure ; l'occupation (K3) | personnes (ETP) | les présents, au besoin | un manque de **3 personnes** |
| R2 | **Où et quand ça coince ?** | Par service et jour de travail : ses **arrivages** (les lots livrés ensemble), la file la plus longue en arrivages qui n'ont pas commencé et son heure, l'attente la plus longue d'un arrivage, le cumul, la **cause** de cette attente (personnel, amont, matériel — K9) ; les **personnes sans travail** (heures, part de la présence, avant le premier lot, entre deux lots, après le dernier, et ce que l'équipe attendait). **Où ça coince**, sur les conséquences : un service qui finit après son horaire d'au moins **un quart d'heure** (une règle fixe, pas un réglage), ou dont un lot fait partir une commande ou un vol en retard ; rangés par heures sup, puis par cumul d'attente — le premier est le goulot | arrivages ; minutes ; arrivages × minutes ; personnes × heures | l'attente d'un arrivage, au seuil ; la fin, à l'horaire + un quart d'heure | une attente de **6 h** ; une occupation de **95 %** |
| R3 | **À quelle heure chaque service finit-il, et avec combien d'heures sup ?** | Par service et jour de travail : la fin de son dernier lot, la fin de son horaire, ce qui dépasse ; ses heures sup (équipes, renforts prêtés, chauffeurs) | heure ; personnes × heures | la fin, à la fin de l'horaire | tout dépassement (une heure sup se dit dès la première minute) |
| R4 | **Qu'est-ce qui part en retard ?** | Les **seules exceptions** : les vols chargés après leur limite, les commandes prêtes après leur limite, les vols pas prêts ou sans équipe ; pour chacune, le retard et sa cause (la phrase de V7). Sans exception : une liste vide | minutes | la limite (le départ, ou départ − marge au handling 24 h/24 ; l'échéance de la commande) | un retard d'**1 min** |
| R5 | **Que change mon scénario ?** | Entre les deux essais de « Comparer deux essais » : B − A sur chacune des quatre réponses (besoin, présents, écart ; goulot, attentes ; fins, heures sup ; exceptions nouvelles et réglées) | celles des réponses | l'essai A | — |

**Les règles de calcul.** Le module `moteur/reponses.js`, sans navigateur, **lit**
le résultat de la journée et les indicateurs de charge (`moteur/indicateurs.js`) ;
il ne recalcule rien de ce qui existe et ne change rien. La page, les outils
(`simuler-journee --reponses`) et les exports l'appellent : un seul chemin. Le
classeur de la journée porte ses réponses dans une feuille « Réponses », à la
fin, depuis la page et depuis `simuler-journee --xlsx` (`echanges-reponses.js`,
`FORMATS_EXCEL.md` § 8) ; les autres feuilles ne changent pas.

**La présentation**, la même partout dans les résultats : une durée s'écrit
« 45 min » sous une heure, « 2 h 05 » au-delà, jamais en heures décimales ; un
total d'heures de travail, en heures entières (« 525 h ») ; une quantité porte
son unité ; un compteur dit son périmètre (les vols que le handling charge ;
les commandes de repas, et à part celles d'équipement) et donne les mêmes
nombres, avec les mêmes mots, sur la Synthèse et dans « Détails » ; une
alerte ne s'affiche que si un seuil est dépassé. Pour une période, des
personnes de jours différents ne s'additionnent pas : seule leur moyenne par
jour s'affiche.

- **Une ligne par service et par jour de travail** (correction 17 a), dans les
  réponses 1, 2 et 3 : un service qui travaille la veille et le jour des vols a
  deux lignes, chacune avec ses personnes, sa file, son attente, sa fin et ses
  heures sup — celles des équipes de ce jour-là. Chaque ligne dit son jour
  (« J−2 », « veille », « jour des vols », « J+1 ») ; le goulot aussi.
- **L'ordre des services**, de l'amont vers l'aval (correction 17 b,
  `moteur/ordre-services.js`) : tiré de tous les chemins à la fois — un service
  vient après tous ceux qui l'alimentent, dans n'importe quel chemin ; à
  égalité, l'ordre du premier chemin où il apparaît ; les services hors chemin
  (permanents, appui) à la fin ; une boucle ne bloque pas. Le même ordre sert
  au tableau de la Synthèse, aux groupes du planning des équipes et aux
  colonnes de la page Période.
- **Le besoin d'une équipe**, en personnes sur son poste : à effectif calculé, son
  besoin exact (homme-minutes ÷ poste ÷ rendement) ; un robot, une plonge saisis :
  ce que ses lots occupent ÷ son poste (11 a) ; à la main, saisie : les
  homme-minutes de ses lots ÷ poste ÷ rendement. Il est rapporté à la présence
  générale, comme les présents (K8). Le besoin d'un service : ⌈ somme ⌉.
- **Le besoin non mesuré** (correction 18 a) : une équipe d'un service mesuré
  dont le besoin ne se mesure pas (aucun travail au barème ce jour-là) ne compte
  plus dans le besoin ; elle se range avec les postes fixes. Si toutes les
  équipes d'une ligne sont dans ce cas, la ligne dit « non mesuré », sans écart.
  La phrase de tête dit « dont n en postes fixes ou non mesurés ».
- **Les postes fixes** (correction 17 c) : une mise à disposition (un service
  permanent), une équipe d'appui saisie, un handling n'ont pas de besoin calculé
  depuis une charge. Leur ligne dit « fixe », n'a pas d'écart, et ne compte pas
  dans « Il faut n personnes ». L'unité : il faut n personnes (hors postes
  fixes), p sont présentes, dont f en postes fixes ; son écart compare les
  présents hors postes fixes au besoin (p − f − n). Un service qui a une équipe
  mesurée et un poste fixe garde son besoin et son écart, hors poste fixe.
- **Les présents d'un handling à chauffeurs** (son plan, ou ses créneaux
  saisis) : ses chauffeurs — leurs minutes de vacation ÷ la présence générale —,
  les mêmes personnes que les colonnes Matin et Après-midi. Les personnes
  saisies à l'équipe ne sont pas comptées à leur place : une note le dit. Les
  indicateurs de charge (K8) ne changent pas.
- **L'écart signalé** : seulement s'il **manque** des personnes (présents sous
  le besoin), d'au moins le seuil. Un surplus s'affiche, sans couleur d'alerte.
- **L'arrivage et son attente** (correction 18 a) : les lots d'une équipe qui
  deviennent prêts au même instant forment un **arrivage** — ceux prêts avant
  l'arrivée de l'équipe forment celui de son arrivée ; à une plonge par vol,
  chaque vol revenu est un arrivage. L'attente d'un arrivage va de son instant
  au début de son premier lot. Les lots suivants du même arrivage n'attendent
  pas : ils sont « à faire », dans l'ordre de travail. La file, la file la plus
  longue, l'attente la plus longue et le cumul (arrivages × minutes) se comptent
  en arrivages qui n'ont pas commencé. Un service qui reçoit sa journée en une
  fois n'a donc aucune attente ; seul celui où le travail arrive au fil de la
  journée peut en avoir. Les indicateurs de charge (K4) gardent leur file lot
  par lot : ils ne changent pas. Le seuil d'attente, sa clé et son défaut
  inchangés, s'applique à l'attente d'un arrivage.
- **La cause de l'attente des arrivages** : « matériel » s'ils attendent surtout
  leur matériel propre ; sinon « personnel » si les équipes qui les tiennent sont
  occupées au-delà du seuil pendant qu'ils attendent ; sinon « amont » si leurs
  personnes attendent le service d'avant (une équipe tenue à l'ordre de sa
  liste) ; sinon « matériel » s'il en a manqué ; sinon aucune.
- **Les personnes sans travail** (correction 18 a), par service et jour de
  travail : les heures (personnes × heures) et leur part de la présence, lues
  dans les créneaux « sans travail » des indicateurs ; réparties en trois
  moments — avant le premier lot du poste, entre deux lots, après le dernier lot
  —, dont la somme est le total des indicateurs. Quand une équipe attend, avant
  son premier lot, l'ouverture d'une mise à disposition réglée « comme une
  boutique », la ligne la nomme, avec son heure (« attend l'ouverture de …, à
  07:00 ») ; quand elle attend son amont, elle nomme le service.
- **Où ça coince** (correction 18 a) se juge sur les conséquences, **sans seuil
  réglable**. Un service coince, un jour de travail donné, (i) s'il finit après
  son horaire d'au moins **un quart d'heure** — une règle fixe, pas un réglage :
  en dessous, le dépassement s'affiche mais ne compte pas — ou (ii) si un de ses
  lots fait partir une commande ou un vol en retard : une commande prête après
  sa limite, ou pas finie, que portent ses lots ; au handling, un vol chargé
  après sa limite ou pas chargé (un retard au moins égal au seuil de retard).
  Ils se rangent par heures sup du dépassement (personnes × heures : un
  dépassement sous le quart d'heure n'y compte pas), puis par cumul d'attente ;
  à égalité, le service dont un lot finit lui-même après la limite d'abord,
  puis l'ordre des lignes. Le premier est le **goulot**, la carte en montre
  trois au plus. Chacun dit son jour, son dépassement et sa cause. Une attente
  n'est nommée que si elle explique : « attend l'ouverture de … » ou
  « attend … » (l'amont) quand le temps perdu avant le premier lot couvre le
  dépassement (l'équipe aurait fini dans son horaire en commençant à son
  arrivée) ou, sans dépassement, le plus grand retard des commandes que ses
  lots font partir en retard (une commande pas finie ne s'explique par aucun
  temps perdu) ; le matériel ; sinon « la charge du jour ne tient pas dans
  l'horaire ». Un service qui finit dans son horaire mais dont un lot finit
  après la limite le dit ainsi ; celui dont les lots finissent avant la limite,
  sur le chemin d'une commande en retard, dit que la commande ou le vol prend
  son retard en aval. Sinon : « rien ne coince ».
  Une troisième conséquence (évolution 18, correction 19) : (iii) **une
  plonge par vol qui laisse à laver le lendemain plus que la première équipe
  du lendemain ne peut en absorber pendant sa présence** coince. Le reste :
  les vols qui ne sont pas propres à la fin de la journée (`saleFinal`),
  comptés avec leur temps de lavage — la durée restante d'un vol dont le
  lavage s'est arrêté à une fin de présence, la durée entière d'un vol pas
  commencé. Le jugement est celui de la mesure `absorbable` de la nuit sous
  condition, calculé qu'il y ait ou non une telle équipe, sans seuil ni
  réglage : seule, la première équipe du lendemain lave-t-elle pendant sa
  présence ce reste et ses propres retours ? Un vol revenu en fin de soirée
  se lave normalement le lendemain matin : **un reste absorbé est le
  fonctionnement ordinaire**, il s'affiche sur la ligne de la plonge, sous sa
  fin — « reste à laver le lendemain : n vols (h de lavage) » —, sans couleur
  d'alerte, et « Où ça coince » ne cite pas la plonge. Quand elle coince,
  elle est rangée après les services qui dépassent leur horaire ou font
  partir en retard, dont le rang ne change pas, si c'est sa seule
  conséquence ; elle dit pourquoi — « laisse n vols à laver le lendemain,
  plus que l'équipe du matin ne peut en laver pendant sa présence » —, et sa
  cause : ses équipes partent à la fin de leur présence, personne ne reste
  pour finir. Tout lavé dans les présences, la plonge n'est pas citée : une
  équipe qui passe le relais ne dépasse pas son horaire.
- **La fin d'une équipe de plonge par vol** (évolution 18) : la fin de sa
  dernière part — un vol qu'elle passe en relais finit pour elle à la fin de
  sa présence ; elle n'a pas d'heures sup. Les réponses, les indicateurs de
  charge et le planning lisent les parts : une équipe est au travail pendant
  la sienne, pas au-delà.
- **La fin d'horaire** : le début du poste + la présence ; au handling, la fin de
  ses vacations de chauffeurs. Celle d'un service est celle de ses équipes
  **qui travaillent ce jour-là** (correction 18, retouches) : une équipe sans
  lot ce jour-là — sa commande n'a pas de vol — ne prête pas son horaire à son
  service ; une équipe d'appui, sans lot à elle, compte quand elle est là. Ce
  qui dépasse se compte équipe par équipe : le plus grand dépassement d'une
  équipe du service (une équipe qui finit tard dans son horaire n'en cache pas
  une autre qui déborde du sien) ; l'équipe qui dépasse est nommée, avec sa
  propre fin et son propre horaire (« l'équipe … finit à 21:30 pour 21:00 »),
  dans la ligne de la Synthèse, la carte « Où ça coince » et la feuille
  « Réponses ».
- **Une exception** : un retard au moins égal au seuil. La cause d'un vol chargé
  en retard : celle du moteur (commande pas prête, faute de chauffeur, faute de
  véhicule, fenêtre trop courte) ; celle d'une commande : l'étape de son chemin
  qui a le plus attendu, et ce qu'elle attendait (« Le plus long à attendre :
  Montage a attendu 25 min que Cuisine finisse. ») ; sans attente, l'étape qui
  la finit.

**Les seuils d'alerte**, réglables et sauvegardés (la clé `ory-seuils-v1`,
comprise dans « Tout sauvegarder » et « Restaurer » ; sans elle, les défauts).
Une valeur invalide est refusée, en la nommant. Les défauts (correction 17 c)
ne valent que tant que rien n'est réglé : un réglage enregistré ne change pas.
L'attente d'un lot est à 6 h parce que, dans une production par lots, un lot
attend normalement son tour plusieurs heures : à 1 h, la plupart des services
étaient signalés. L'écart est à 3 personnes, et ne signale qu'un manque.

| Seuil | Défaut | Valeurs admises | Ce qu'il déclenche |
|---|---|---|---|
| Écart de personnes à signaler | 3 | de 0 à 100 personnes | un manque (présents sous le besoin) d'au moins ce nombre (R1) ; un surplus n'est pas une alerte |
| Attente d'un arrivage (la clé `attenteLot`, inchangée) | 360 min (6 h) | de 0 à 1 440 min | la couleur de l'attente d'un arrivage dans le tableau (R2) ; le « Bouchon » de la plonge ; il ne décide plus du goulot (correction 18 a) |
| Occupation | 95 % | de 1 à 100 % | la cause « personnel », au-delà (R2) |
| Durée maximale d'un stock | vide : pas d'alerte | vide, ou de 1 à 10 080 min | un stock plus long (le détail des stocks) |
| Retard | 1 min | de 0 à 1 440 min | une exception, à partir de ce retard (R4) |

| # | Exigence | Source | État | Écart |
|---|---|---|---|---|
| R1–R5 | Les cinq réponses, dans un module sans navigateur que la page, les outils et les exports appellent | Évolution 15 (a à e) | ✅ | Le module et ses seuils (`moteur/reponses.js`), l'outil (`--reponses`), la Synthèse (deux phrases, trois cartes, « Les services », la courbe), « Détails » et « Comparer deux essais » rangés selon les questions, des comptes qui disent leur périmètre, une seule écriture du temps, la page Période (la colonne « Unité », la courbe et le réel, les personnes en moyenne par jour, les jours complets d'abord) et la feuille « Réponses » du classeur de la journée. Correction 17 (a à d), sur une vraie unité : le jour de travail jusqu'au bout de chaque ligne, un seul ordre des services tiré de tous les chemins, des lignes qui disent vrai (postes fixes, chauffeurs, un manque seul signalé, les seuils par défaut, le goulot) ; la page Période : « Unité » en première colonne de chiffres, visible sans défiler, les heures d'un ETP écrites en entier (« 7,5 »), les jours incomplets expliqués une fois, le détail dépliable. Correction 18 (a à c), sur une vraie journée, sans aucun réglage nouveau : des attentes qui disent vrai (l'attente par arrivage, les personnes sans travail et ce qu'elles attendaient, « Où ça coince » sur les conséquences avec son quart d'heure, le besoin non mesuré) ; le planning des équipes, d'abord toute l'unité sur un écran (une ligne par service, un jour à la fois, les équipes sans lot à part, le plein écran, les noms entiers) ; sur la page Période, « Période simulée : … » une seule fois, dans sa carte. Sans ses seuils ni la nouvelle feuille, tout résultat, indicateur et classeur d'avant reste identique (`tests/non-regression-15.test.cjs`). La période n'a pas encore ses cinq réponses jour par jour |

## 7. Indicateurs

| # | Indicateur | Source | État | Écart |
|---|---|---|---|---|
| K1 | % de repas / vols à l'heure, retard moyen et maximal | CdC §7 | ✅ | Dénominateur annoncé ; « — » avant la première échéance |
| K2 | Vols inachevés comptés, jamais masqués | Feuille de route étape 6 | ✅ | |
| K3 | **Taux d'occupation** par atelier | CdC §7 | ✅ | Par équipe et par jour : minutes au travail ÷ présence hors pauses ; par service, pondéré par les personnes ; sur la période (banc d'essai, évolution 12, `BANC_ESSAI.md` § 13) |
| K4 | **Encours et longueur de file** par atelier | CdC §7 | ✅ | Lots en file par créneau de 15 min et par service ; la file la plus longue de chaque équipe et son instant (évolution 12) |
| K5 | **Débit** (plateaux, trolleys par heure), global et par atelier | CdC §7 | 🟡 | Par équipe, dans son unité (repas, plateaux, vols lavés, vols chargés) par heure au travail, sur le jour et la période ; terminés par créneau. Pas de débit global : les unités ne s'additionnent pas (évolution 12) |
| K6 | Man-minutes **consommées vs disponibles** par atelier | CdC §7 | ✅ | Homme-minutes ÷ (personnes × présence hors pauses), par équipe, par jour et sur la période (évolution 12) |
| K7 | **Courbe** de débit et d'encours sur la journée, avec les pics | CdC §7 | ✅ | Page Planning : par service, présents et au travail sur l'axe du planning, le pic marqué, un trait par lot (correction 18 b : sans la file, qui reste dans la feuille Créneaux) ; feuille Créneaux, terminés compris (évolution 12) |
| K8 | ETP (heures ÷ 7), besoins simultanés par créneau | Feuille de route §1, étape 6 | ✅ | ETP présents par service (personnes × présence ÷ présence générale) ; personnes présentes et au travail par créneau de 15 min, et leurs pics (évolution 12) |
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
| E9 | Tester l'interface avec de vrais utilisateurs | — | ❌ | Jamais fait ; seul moyen de savoir si E6, E7 et E10 sont atteints |
| E12 | Audit visuel : lisibilité, compréhension, épuration | 23/09 | ✅ | Tous les points traités : vocabulaire « commande », chiffres qui concordent (unité et moment explicites), états neutres au lieu du rouge, arrivée sur l'étape à faire, tableau vide guidé, pluriels, libellés, champs |
| E11 | Chemins, liens de l'unité et équipes créés dans un **diagramme de nœuds** : relier deux services en tirant un trait | 23/09 | ✅ | Chemins et liens de l'unité dessinés ; les équipes s'affichent et se créent sur les nœuds du chemin. L'affectation équipe × repas reste un tableau (c'est un croisement, pas un graphe) |
| E13 | Relier un service à **plusieurs** services dans le diagramme (ex. appros → légumerie et appros → montage) ; ajouter le service **Prépa** avant le montage | 24/09 | ✅ | Le lien se crée en tirant le `+` ou en cliquant le `+` puis la cible ; la prépa s'insère une fois dans les chemins enregistrés et complète les plans existants |
| E14 | Lier très intuitivement « Les chemins » et « Les équipes » | 24/09 | ✅ | Le même diagramme dans les deux onglets et un service choisi partagé : on relie dans l'un, on règle les équipes du service dans l'autre ; équipes rangées dans le sens du chemin |
| E15 | **Un chemin par commande**, créé à la main ; sur chaque nœud une **case** (nom, personnes, heure, man-minutes de l'import modifiables), réutilisable d'un chemin à l'autre ; une case « TX BC/PC » ne fait attendre au chemin TX BC que la ligne de TX BC ; tableau, cases et journée calculés à partir des chemins | 24/09 | ✅ | Remplace E14 (même diagramme dans deux onglets), jugé insuffisant : il liait l'affichage, pas le fonctionnement. Liens propres à chaque chemin ; « Dupliquer pour… » dans les mêmes cases |
| E10 | Pages **épurées** : ne plus tout montrer à la fois, onglets et sous-onglets | 23/09 | ✅ | Deux à cinq onglets par étape, un seul affiché ; bandeau de contexte retiré ; indicateurs de la journée dans leur onglet. Pas de sous-sous-onglet : aucun onglet n'en a eu besoin |
| E16 | **Organisation du menu** claire : pas d'onglets qui se ressemblent pour des usages différents, mieux catégoriser, sans perdre de fonction | 05/10 | ✅ | Cinq parties, un sujet chacune : Vols · Chemins · Équipes · Simulation · Résultats ; outils fins après « Plus » dans leur partie (plus de partie cachée « Outils avancés ») ; noms de pages distincts ; identifiants inchangés |
| E17 | **Chemins compréhensibles avec beaucoup de services**, de façon plus visuelle | 05/10 | ✅ | Chemins › Vue d'ensemble (plan de métro : services × flux, par étape) ; diagrammes en étapes de haut en bas, tenant dans l'écran, chaîne éclairée au survol ; « En ligne » reste disponible |
| E18 | **Effectif d'après les homme-minutes** : personnes = minutes par vol × vols de chaque compagnie, rapporté au poste ; dissocier les ateliers calculés des **constants**, avec une case à cocher | 05/10 | ✅ | Case « Effectif constant » par service ; constants par défaut : CF départ food, magasin, légumerie, duty free, appros ; la simulation dans le temps est gardée, jouée avec l'effectif calculé. Plonge, handling, mise à disposition : toujours saisis (ils ne travaillent pas en homme-minutes) ; un robot se calcule d'après le barème propre de son service de robots (M18) |
| E19 | **Les zones de mise à disposition ont leurs personnes**, constantes : « 2 personnes aux appros, ce sont 2 personnes en tout sur la journée » | 06/10 | ✅ | Champ « Personnes sur la journée » dans la case ; une présence chacune ; compté dans l'effectif du jour (comparaison) et le budget v2 ; ne change pas les durées |
| E22 | **Un poste qui ne dépend pas des vols n'a aucune minute par vol** | 06/10 | ✅ | Ses commandes passent dans ses heures de présence, en temps nul ; ni minutes par vol ni minutes propres à saisir ; « constant » dans Minutes de travail. Pour tester un effectif sur un poste qui dépend des vols : « Effectif imposé (essai) » |
| E23 | **Des superviseurs / coordinateurs par service**, sans effet sur la production, pour le futur lien avec le budget quotidien | 06/10 | ✅ | Champ « Superviseurs / coordinateurs » dans la fiche de chaque service (`encadrement`) ; pas encore dans le budget |
| E24 | **Un service à un seul atelier** : x personnes, à telle heure, pour certaines compagnies (BOB, checkeurs) | 07/10 | ✅ | Nature « Un seul atelier » ; une case par compagnie ; ses commandes suivent le programme ; constant, sans minutes ; ses flux passent par le service |
| E25 | **L'armement suit toujours les vols** de chaque compagnie | 07/10 | ✅ | Service par compagnie jamais constant ; minutes par vol × vols de la compagnie ; la fiche montre vols du jour et journée par compagnie |
| E26 | **Le travail par vol en heures**, pas en minutes : « remplace les min par vol en h par vol » | 08/10 | ✅ | Barème, fiches, tableau « Heures de travail », armement, hors tunnel, heures propres d’une case et classeurs Excel en heures d’une personne ; calcul et sauvegardes en minutes ; anciens classeurs en minutes relus ; durées (handling, plonge, pauses) en minutes |
| E27 | **Le nom d'une équipe unique dans son service seulement** (« CRL » en Dotation et en Cuisine) ; jamais vide ; un refus remet le champ | 08/10 | ✅ | Excel : « nom · service » quand le nom est en double |
| E28 | **Un service qui travaille en même temps qu'un autre** (cuisine chaude ∥ cuisine) | 08/10 | ✅ | « Il travaille en même temps que… » : rangé à côté dans chaque chemin ; l'étape d'après attend les deux |
| E29 | **Des compagnies sans armement** : le handling ne les attend pas | 08/10 | ✅ | Déduit, rien à cocher : ni chemin par l'armement, ni équipe qui l'a cochée → pas de case ; un chemin sans armement n'est plus « à reprendre » ; la fiche nomme les compagnies sans armement |
| E21 | **Le poste ne dépend pas forcément des vols** : le choix équipe par équipe, pas seulement par service | 06/10 | ✅ | « Effectif » dans la fiche de chaque équipe : comme le service, dépend des vols, constant (saisi) ; constante, elle retrouve son effectif saisi |
| E20 | **Des équipes qui ne dépendent pas du tunnel** à la plonge, avec le choix, comme ailleurs, d'un effectif qui dépend des vols ou non | 06/10 | ✅ | « + Ajouter une équipe hors tunnel » ; case « Effectif constant » dans la fiche de la plonge ; calculée : minutes par vol × vols qui reviennent ÷ poste. Type « hors tunnel » utilisable dans tout service (là : départs du jour). Les minutes par vol ne passent pas encore par le classeur Excel |

## 10. Méthode et fiabilité (feuille de route d'Astra)

| # | Exigence | État | Écart |
|---|---|---|---|
| F1 | Glossaire, registre des décisions, dictionnaire des données (`REGLES_METIER.md`, `DATA_DICTIONARY.md`) | 🟡 | Couvert en partie par `MODELE_ATELIERS.md` et `FORMATS_EXCEL.md` ; pas de registre des décisions |
| F2 | Tests automatiques | ✅ | 193 tests purs, 16 parcours navigateur |
| F3 | **Calibration** sur des journées observées | 🟡 | Version 1 : la période se compare au réel par jour et par rôle (M20) et se cale ligne par ligne (M21) ; rejouée à effectif imposé, elle cale le travail de chaque ligne (M24) ; il faut encore l'étude de man-minutes et des relevés terrain |
| F4 | **Validation** sur des journées distinctes, tolérances fixées avec Basile | 🟡 | **Au fil de l'eau** (23/09) : les tolérances se fixeront à mesure que les données arrivent. Version 1 : un calage ne se valide que hors échantillon (une semaine, un mois laissés de côté), M21 |

## 11. Abandonné par décision — ne pas y revenir sans le décider

| Demande d'origine | Date | Remplacée par |
|---|---|---|
| Tables, chaînes, lignes robot sur mesure, assemblages de tables, stockage à roulettes et en trolley | 18/09 | Ateliers de travail sans emplacement (21/09) |
| Grille de 50 × 50 cm « comme Minecraft en 2D » | 19/09 | Idem |
| Curseurs d'effectifs, contenances par atelier | 17-22/09 | Effectif et horaires par équipe |
| Unité de travail par passager | 17/09 | Minutes par vol (23/09) |
| Un seul fichier HTML | 17/09 | Site GitHub Pages |
| Thème sombre | 17/09 | Un seul thème, clair (23/09) ; revenu en option, le clair par défaut (08/10) |
| Version téléphone (mise en page mobile) | 18/09 | Écrans de bureau seulement, 1 024 px et plus (23/09) |

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
3. ~~**Indicateurs de charge**, par jour et sur la période~~ : faits (banc
   d'essai, évolution 12 — K3 à K8). Reste un débit global (K5), que des
   unités différentes ne permettent pas d'additionner.
4. ~~**Lire l'export Winrest réel** (D9), avec ses règles de dossiers~~ : fait
   (banc d'essai, évolution 13), avec son rapport d'import (D11). Restent les
   retours, que l'export ne donne pas.
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
| 23/09 | « Commande » désigne une compagnie × classe pour la journée (au lieu de « repas ») | Claude, en attendant l'avis de Basile | Un non-initié lisait « 4 repas » comme 4 plateaux |
| 23/09 | Abandon du thème sombre et de la version téléphone | Basile | « Pas vraiment utile » : le site sert sur un poste de bureau |
| 23/09 | Chemins et liens dessinés en diagramme de nœuds ; les parcours deviennent des graphes (nœuds + liens) | Basile | Plus simple, plus intuitif, et un graphe se raisonne bien mathématiquement |
| 23/09 | Pages découpées en sous-onglets, une chose à la fois | Basile (proposition), Claude (découpage) | « Les pages sont beaucoup trop chargées, le cerveau s'y perd » |
| 08/10 | Refonte de l'interface (docs/REFONTE_UX.md) : plan, chemins et services refondus sans couche d'équipements ; thème clair par défaut, sombre en option ; « Annuler » à la place des confirmations ; le plan sur sa page ; palette ⌘K, clavier dans les tableaux, ↑↓ dans les nombres | Basile | « 1. Oui 2. Thème clair 3. Oui 4. Oui 5. Oui » ; et « ne change rien, toutes les valeurs doivent être les mêmes » |

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
