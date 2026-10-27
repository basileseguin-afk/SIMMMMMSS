# Le banc d'essai — rejouer des journées réelles avec la version 1

Un banc d'essai, tenu **hors du dépôt**, rejoue des journées réelles de
l'unité avec le moteur de la version 1 : les vols du jour et le fichier
« Sauvegarde › Tout sauvegarder ». Il compare, service par service et jour
par jour, les heures supplémentaires et les effectifs simulés aux heures
pointées. Il sert à caler le modèle et à repérer les services
sous-dimensionnés (beaucoup d'heures sup) ou sur-dimensionnés (jamais
d'heures sup, effectif réel au-dessus du besoin).

Ce document décrit ce que la version 1 offre au banc. La version 2 (`v2/`)
n'en est pas touchée.

> ⚠ Les données réelles (sauvegarde, vols, pointages) ne vont **jamais** dans
> le dépôt public : une sauvegarde contient le plan réel de l'unité
> (`.gitignore` refuse `ory-sauvegarde*.json`). Les tests et les exemples
> d'ici n'emploient que des vols, des compagnies et des équipes fictifs.

## Les règles communes

- **Chaque évolution est une option, désactivée par défaut.** Désactivée, la
  journée calculée est exactement celle d'avant, champ par champ :
  `tests/non-regression.test.cjs` le vérifie sur la démo et sur deux unités
  fictives relevées avant les évolutions (`tests/non-regression.attendu.json`),
  hors les champs nouveaux qu'il déclare.
- **Les réglages se rangent dans l'état existant** : `ory-modele-v1` pour les
  règles de calcul, `ory-ateliers-v1` pour ce qui touche une équipe ou un
  service. Ils passent par les validateurs, partent dans « Tout sauvegarder »
  et reviennent par « Restaurer ». Une sauvegarde d'avant se relit sans
  erreur, options désactivées.
- **Le moteur reste déterministe** : mêmes entrées, même sortie.
- **Les valeurs provisoires se règlent** : elles seront calées plus tard, rien
  n'est écrit en dur.

## 1. Jouer une journée hors du navigateur

### L'outil

```
node outils/simuler-journee.cjs sauvegarde.json vols.csv [options.json] > resultat.json
node outils/simuler-journee.cjs --arguments sauvegarde.json vols.xlsx    # ce que reçoit le moteur
```

- `sauvegarde.json` : le fichier « Tout sauvegarder » de la page
  (`{ schema: 'ory-sauvegarde', version: 1, contenu }`, 20 Mo au plus). Il
  est relu et validé comme « Restaurer » le relit : une partie invalide est
  refusée, en la nommant. Une partie absente vaut ce que la page a sans elle :
  le plan de base, les liens d'origine, le barème de démonstration.
- `vols.csv` ou `vols.xlsx` : les vols du jour, au format de l'import
  (`docs/FORMATS_EXCEL.md`, « Programme de vols »), lus **par le code de la
  page** : un CSV comme « Importer vos vols », un classeur par ses feuilles
  « Départs » et « Retours » (ou une seule feuille avec la colonne `sens`).
- `options.json` (facultatif) : les options ci-dessous.

En cas d'erreur, l'outil l'écrit et sort avec le code 1 (2 pour un appel mal
formé). Il rend, sur la sortie standard, un objet JSON :

```
{ "journee":  { "schema": "ory-journee", "version": 1, "sauvegarde", "vols", "departs", "retours", "options" },
  "resultat": { … tout ce que rend MoteurProduction.simuler … } }
```

`resultat` est **la journée que la page aurait calculée**, au champ près
(les nombres non finis s'écrivent `null`, comme dans tout JSON).

### Les options

| Option | Effet | Par défaut |
| --- | --- | --- |
| `delaiChargement` | Le délai de chargement (minutes entre l'échéance des commandes et le départ), celui de « Horaires de vols » : un entier de 10 à 120 | 45 |
| `decalage` | Le décalage de tous les vols, celui de « Horaires de vols » : un entier de −60 à 60 minutes | 0 |
| `modele` | Des règles de calcul forcées, fondues dans `ory-modele-v1` **avant** validation (par exemple `{ "rendement": 0.9 }`) | — |
| `ateliers` | Des réglages forcés de l'état des équipes (`ory-ateliers-v1`), hors de la liste des équipes (par exemple `{ "materiel": { "delaiRetour": 45 } }`) | — |
| `equipes` | Des réglages forcés d'une équipe, désignée par son identifiant ou par son nom (`{ "Plonge soir": { "debut": "14:00" } }`) | — |
| `heuresSup` | Les heures supplémentaires (§ 2), fondues dans `ory-modele-v1` comme `modele` : `{ "actif": true, "plafond": 720 }` | celles de la sauvegarde |
| `renforts` | Les renforts (§ 5), fondus dans `ory-modele-v1` comme `modele` : `{ "actif": true, "efficacite": 0.8 }`. La matrice de polyvalence se force par `ateliers` (`{ "polyvalence": { … } }`), les postes de travail d'une équipe par `equipes` (`{ "Montage B": { "personnesMax": 6 } }`) | ceux de la sauvegarde |
| `ordreSouple` | L'ordre souple (§ 8), fondu dans `ory-modele-v1` comme `modele` : `{ "actif": true }`. Celui d'une équipe se force par `equipes` (`{ "Contrôle": { "ordreSouple": true } }`) | celui de la sauvegarde |
| `saleInitial` | Le sale de la veille (§ 6), fondu dans `ory-ateliers-v1` (`materiel.saleInitial`) : la liste `saleFinal` que la journée d'avant a rendue, ou un nombre d'unités | celui de la sauvegarde |

Un réglage forcé passe par le validateur, comme une saisie : un objet se
fond dans celui de la sauvegarde (le reste est gardé), une valeur le
remplace. Un réglage que le validateur ne garde pas (une faute de frappe, un
champ inconnu) est refusé, en le nommant ; une option inconnue aussi. Les
options des évolutions suivantes s'ajoutent à ce tableau ; celles d'une
équipe (le handling 24 h/24, § 3) se forcent par `equipes`.

### Ce que rend chaque équipe

`resultat.ateliers` porte une ligne par équipe. En plus de ce qu'elle rendait
(`id`, `nom`, `type`, `debut`, `fin`, `finPoste`, `lots`…) :

| Champ | Sens |
| --- | --- |
| `service` | Le service de l'équipe (son identifiant ; son nom est dans `noms` des arguments, `--arguments`) |
| `jour` | Son jour : 0 le jour J, −1 la veille… (+1 : une plonge le lendemain de l'arrivée des retours) |
| `debutPoste` | Le début de son poste, en minutes depuis 00:00 du jour J (la veille est négative). Une mise à disposition permanente n'a pas d'heure : c'est le début de la journée simulée |
| `presence` | La durée de sa présence, en minutes (480 par défaut, pauses comprises) ; `null` pour une équipe sans règle de poste |
| `personnes` | Ses personnes : saisies, ou calculées (effectif calculé) |
| `travail`, `attente`, `arret` | Ses minutes de travail, d'attente (un amont, du matériel, une ligne) et d'arrêt (pauses) |
| `heuresSup` | Ses heures supplémentaires, en minutes **par personne** (§ 2) : l'heure où l'équipe part, moins la fin de sa présence ; 0 sans l'option |
| `heuresSupPersonnes` | Ses heures supplémentaires en minutes × personnes (§ 2) : le seul champ à additionner pour un service. D'une plonge à tunnels, les personnes des tunnels qui finissent un vol après sa présence seulement ; de toute autre équipe, `heuresSup` × `personnes` ; 0 sans l'option |
| `tournees`, `conducteurs`, `heuresSupChauffeurs`, `vehiculesMax` | Un handling 24 h/24 : ses tournées, ses chauffeurs et leurs heures sup, ses véhicules (§ 3) |
| `planChauffeurs` | Un handling 24 h/24 aux chauffeurs calculés : son plan de vacations, sa borne basse (§ 4) |
| `renfortsPretes`, `renfortsRecus` | Avec les renforts (§ 5) : les minutes-personne que l'équipe a prêtées à d'autres, et reçues d'autres |
| `renfortsHeuresSup` | Avec les renforts : les minutes-personne que ses personnes ont passées en renfort après la fin de leur présence |
| `renforts` | Avec les renforts : `vers` (à qui elle a prêté) et `de` (qui l'a aidée), chacun `{ id, nom, minutes }` |
| `conditionSale` | Une plonge qui ne vient que s'il reste du sale (§ 6) : s'est-elle ouverte, le sale mesuré, ce qu'elle a lavé, ce qui reste à sa fin |

Et pour la journée, quand l'unité a une plonge : `saleFinal`, le sale non lavé
à la fin de la journée, vol par vol (§ 6).

Les noms `debutPoste` et `presence` sont ceux de la version 2, dans le même
sens, pour une fusion future.

Les vols lus par l'outil (et par la page) portent aussi `eta`, l'arrivée
estimée de l'avion d'un départ, quand le programme a une colonne `heure_eta`
(§ 3), et `spmlParCabine`, les repas spéciaux de chaque cabine, quand il a les
colonnes `nb_SPML_BC`, `nb_SPML_PC`, `nb_SPML_YC` (§ 7).

### Un seul chemin de calcul

Les arguments du moteur s'assemblent dans **`moteur/journee.js`**, sans
navigateur : les commandes du programme (moins celles qu'on retire, plus
celles qu'on déclare), les équipes resynchronisées (l'armement jamais
constant, l'atelier unique avec les commandes de ses compagnies), les
catégories (l'armement), les liens tirés du Centre des flux (une annexe hérite
de ceux de son atelier, un service retiré ne compte plus), le barème complété
des annexes, la règle de poste et le rendement, les services dont l'effectif
se calcule ou s'impose, les noms — ceux des services supprimés encore cités
compris.

- `argumentsDeLaJournee(sauvegarde, vols, options)` : depuis une sauvegarde —
  c'est l'outil ;
- `argumentsDeLUnite(unite, vols, options)` : depuis l'état déjà relu — c'est
  la page (`ateliers.js`, `calculer()`), qui y passe ses cases, son plan, ses
  liens et son barème ;
- `jouer(args)` : les catégories déclarées (elles nomment les commandes), puis
  `simuler`.

La page lit aussi ses services, ses liens et les services supprimés par ce
module : ce qu'elle montre est ce que le moteur reçoit. Les services du plan
de base, leurs stockages et les liens d'origine sont dans `plan-base.js`, que
la page et l'outil lisent tous deux.

Ce qui se range à l'ouverture de la page (la prépa insérée dans les chemins,
l'armement par compagnie, les cases d'avant fondues…) est déjà fait dans une
sauvegarde prise depuis la page : l'outil ne le refait pas. Une sauvegarde
d'une version plus ancienne se rouvre donc d'abord dans la page, puis se
sauvegarde à nouveau.

### Une commande qui ne vole pas ce jour-là

Une équipe a dans ses lots les commandes de toutes les compagnies qu'elle
sert ; un jour où l'une d'elles ne vole pas, sa commande n'existe pas ce
jour-là. La journée ne se refuse plus pour autant (correction du banc d'essai,
trouvée en rejouant des journées réelles), dans la page comme dans l'outil :

- **Bien écrite** — `compagnie/cabine` (BC, PC, YC, CREW, SPML), ou
  `compagnie/@catégorie` d'une catégorie déclarée —, sans vol ce jour-là : elle
  est **absente de la journée**. Elle est écartée des lots avant de jouer :
  l'équipe passe ce lot et fait les autres (un lot qui la mêle à d'autres
  commandes les fait sans elle). Une **information** le dit, équipe par équipe
  (`commande-absente`, non bloquante) ; une équipe dont aucune commande ne vole
  ce jour-là n'est pas « une équipe qui ne fabrique rien », et son effectif
  calculé est nul. Une commande ajoutée à la main reste une commande de la
  journée (sans vol, sans travail), comme l'armement d'une compagnie cochée.
- **Une compagnie qu'on ne voit nulle part ailleurs** — ni dans les vols du
  jour (départs et retours), ni dans le barème (ni dans les minutes par
  compagnie de l'armement), ni dans les commandes ajoutées, ni dans une autre
  commande des lots — ajoute un **avertissement**, non bloquant lui aussi :
  « compagnie jamais vue : XXX — faute de frappe ? » (`compagnie-inconnue`). La
  journée se calcule quand même : une journée refusée est perdue en entier pour
  le banc.
- **Mal écrite** — une cabine qui n'existe pas (`NORD/CRWE`), une forme fausse
  (`NORDCREW`, `nord/YC`, `NORD/YC/BC`), une catégorie non déclarée — : la
  journée reste **refusée**, comme avant (`lot` : « compagnie × classe
  inconnue »).

**Une équipe sans aucun vol ce jour-là n'a personne** (correction 10). Dans un
service à effectif calculé, la personne « en temps nul » d'un barème à
renseigner ne vient que si une commande de l'équipe **vole ce jour-là** sans
minutes au barème. Une équipe dont aucune commande ne vole ce jour-là — une
commande ajoutée à la main, l'armement d'une compagnie qui ne vole pas — a un
effectif calculé de **0**, même si ses commandes ont des minutes au barème.
Ses commandes sans vol se font en temps nul, comme avant : rien n'est
« impossible », et l'équipe en aval est servie. Une équipe à effectif fixe
garde son effectif saisi.

### Vérifications

- `tests/commandes-sans-vol.test.cjs` : une journée sans aucun vol d'une
  compagnie dont une équipe prépare `XX/CREW` se joue, et les autres commandes
  de l'équipe sont faites ; une commande mal écrite est toujours refusée ; une
  compagnie jamais vue est signalée sans bloquer ; une commande ajoutée,
  l'armement, l'outil ;
- `tests/equipe-sans-vol.test.cjs` (correction 10) : 315 min par vol au
  barème et aucun vol ce jour-là, 0 personne, sa commande faite en temps nul et
  l'équipe en aval servie ; l'armement d'une compagnie qui ne vole pas ; sans
  minutes au barème avec deux vols, une personne en temps nul ; avec ses
  minutes, la formule habituelle ; l'effectif fixe inchangé ; les journées
  enregistrées inchangées ;
- `tests/journee.test.cjs` : la sauvegarde relue et refusée comme par
  « Restaurer », les options et leurs bornes, les réglages forcés, les vols
  lus comme dans la page (CSV, classeur), les mêmes entrées donnant la même
  journée, l'outil en ligne de commande ;
- `tests/non-regression.test.cjs` : la page d'avant, ses arguments et sa
  journée, champ par champ ;
- `tests/journee-browser.cjs` : pour la démo et pour une unité fictive, les
  fichiers que donne la page (« Tout sauvegarder », le programme exporté ou
  importé), rejoués par l'outil, rendent la journée de la page ; restaurée
  dans un navigateur vide, la sauvegarde redonne la même journée.

## 2. Les heures supplémentaires

La règle est celle de la version 2, avec ses noms : une équipe dont le
travail n'est pas fini à la fin de sa présence (début de poste + présence)
**reste**, jusqu'à `plafond` minutes de plus par personne, au lieu de partir
en laissant ses lots « hors poste ».

- **Le réglage** : `heuresSup: { actif, plafond }`, une règle de calcul rangée
  avec le barème (`ory-modele-v1`). Il se règle dans **Simulation › Réglages de
  la simulation › Heures supplémentaires** : une case, et le plafond en heures
  par personne et par jour (0 à 12 h). Plafond par défaut : **180 min** — avec
  la présence par défaut (480 min, dont 60 de pause), 7 h + 3 h = 10 h de
  travail, la durée maximale quotidienne. Le banc le porte à 720 min pour voir
  tout le débordement (`"heuresSup": { "actif": true, "plafond": 720 }` dans
  `options.json`). Il n'est enregistré qu'une fois réglé : un état d'avant se
  relit tel quel, sans heures sup.
- **Ce qui est compté**, par équipe : `heuresSup` = les minutes travaillées
  après la fin de la présence, plafonnées (la fin de l'équipe moins la fin de
  sa présence). Une tâche coupée par le plafond compte jusqu'à lui ; ce qui le
  dépasse reste hors poste, comme sans l'option. La fin de poste rendue
  (`finPoste`) est alors la fin de la présence plus le plafond : l'heure où
  l'équipe part au plus tard, comme en version 2.
- **En minutes × personnes** (correction du banc d'essai) :
  `heuresSupPersonnes`, le champ qu'un banc additionne. D'une **plonge à
  tunnels**, seules les personnes des tunnels encore en marche restent : la
  somme, sur ses tunnels qui finissent un vol après la fin de sa présence, de
  (fin de ce vol − fin de présence) × personnes du tunnel ; les autres partent
  à la fin de leur présence. Une plonge **sans liste de tunnels** compte toutes
  ses personnes. `heuresSup`, par personne, reste la fin du dernier vol moins
  la fin de présence : l'heure de départ de l'équipe. Pour **toute autre
  équipe**, `heuresSupPersonnes` = `heuresSup` × `personnes`. La Synthèse et le
  récap des cases (Excel, colonne « Heures sup (h × pers.) ») comptent avec
  lui. Avant, toute l'équipe comptait : quand un seul tunnel sur trois finissait
  un vol, les 9 personnes comptaient, alors que seules les 3 de ce tunnel
  restaient.
- **Qui en fait** :
  - une équipe à la main et un **robot** : on ne paie personne à attendre
    (correction du banc d'essai). Passé la fin de sa présence, elle finit le
    lot commencé, puis n'enchaîne que les lots **déjà prêts** à cet instant
    (amont livré, mise à disposition ouverte, matériel propre là, ligne du
    robot libre, assez de monde) ; **dès qu'elle devrait attendre, elle part** :
    le lot et les suivants sont hors poste, comme sans heures sup. Pendant la
    présence, l'attente reste normale, mais pas au-delà de sa fin : une équipe
    qui attend encore à la fin de sa présence part. `heuresSup` ne compte donc
    que du travail. Le robot garde sa ligne pendant un lot ; l'équipe suivante
    attend qu'il la libère. Elle restait avant à attendre son amont ou une
    mise à disposition, et cette attente comptait en heures sup : rejouées sur
    61 journées réelles, 89 % des heures sup simulées étaient de l'attente ;
  - la **plonge** finit le vol en cours, mais n'en commence pas d'autre
    (correction du banc d'essai). Par vol : passé la fin de sa présence, elle
    finit les vols **déjà dans un tunnel** — en heures sup, jusqu'au plafond ;
    un vol qui ne finirait pas avant lui n'est pas commencé — et n'en commence
    **aucun autre**. Ce qui attend va à la plonge suivante présente (la nuit,
    si elle est ouverte ; le matin du lendemain, si une plonge est réglée sur
    J+1) ; sinon au sale de fin de journée (`saleFinal`), donc au retard que
    mesure une plonge de nuit sur le retard (§ 6). Ses `heuresSup` : la fin
    du dernier vol commencé moins la fin de sa présence. Entre deux tunnels
    qui rendent un vol propre à la même heure, celui d'une équipe encore dans
    ses heures passe d'abord (comme en version 2). Au débit : elle s'arrête à
    la fin de sa présence, heures sup permises ou non (sa `finPoste` est la fin
    de sa présence) ; le sale qui reste suit le même chemin. Elle lavait
    avant tout ce qui l'attendait à la fin de sa présence : rejouée avec une
    nuit et 90 min par vol, l'équipe de l'après-midi commençait encore un vol à
    03:00, et ses heures sup avalaient le travail de la nuit ;
  - le **handling** d'une équipe (sans créneaux de chauffeurs) charge ses vols
    jusqu'au plafond. Un handling **à créneaux** n'en fait pas : ses chauffeurs
    viennent à leurs créneaux. Un handling **24 h/24** non plus : ce sont ses
    chauffeurs qui en font, quand l'un d'eux finit sa tournée après son
    créneau (§ 3) ;
  - **jamais** une mise à disposition (`dispo`) ni une équipe d'appui
    (`appui`).
- **L'effectif calculé ne change pas** : il se calcule toujours sur la
  présence normale, jamais sur présence + plafond.
- **Dans la page** : la **Synthèse** montre, quand l'option est cochée, les
  heures sup de la journée par service (personnes × heures sup de chaque
  équipe) et par équipe. Désactivée, rien ne se montre et rien ne change.

Vérifications : `tests/heures-sup.test.cjs` (une équipe qui finit dans son
poste a 0, une équipe qui déborde de 40 min a 40 min, le plafond coupe, une
mise à disposition et un appui ont 0, l'option désactivée rend la journée
d'avant, robot, plonge par vol et au débit, handling avec et sans créneaux,
effectif calculé inchangé, validation, options du banc) ;
`tests/heures-sup-personnes.test.cjs` (9 personnes, trois tunnels de 3, un seul
qui finit un vol 40 min après la présence : 120 et 40 ; deux tunnels, 40 et
10 min : 150 ; un tunnel à vitesse 2 ; une plonge sans tunnels et une équipe à
la main : heures sup × personnes ; sans l'option, 0 ; le récap des cases) ;
`tests/heures-sup-personnes-browser.cjs` (la Synthèse) ;
`tests/heures-sup-sans-attente.test.cjs` (une équipe dont le dernier lot n'est
prêt que 2 h après sa présence part à sa fin, sans heure sup, le lot hors
poste ; un lot commencé fini 40 min après : 40 min ; un lot prêt à la fin de
la présence est fait en heures sup, puis elle part au premier lot pas prêt ;
le robot ; le renfort en heures sup ; sans l'option, comme avant) ;
`tests/plonge-heures-sup.test.cjs` (la plonge finit le vol dans son tunnel et
ne commence pas celui qui attend : il va à la nuit, ou au sale de fin de
journée ; une nuit ne commence aucun vol après la fin de sa présence ; le
retard d'une plonge sur le retard compte ce que l'après-midi n'a pas commencé ;
sans l'option, rien ne change) ;
`tests/heures-sup-browser.cjs` (le réglage, son enregistrement, la Synthèse) ;
`tests/non-regression.test.cjs` (réglées mais désactivées : la même journée).

## 3. Le handling 24 h/24 : des tournées qui chargent puis déchargent

Le handling travaille jour et nuit. Il charge les vols au départ et décharge
les avions arrivés (le sale qu'ils ramènent part à la plonge). D'habitude, une
tournée charge un vol, puis va décharger un autre avion qui vient d'arriver,
avant de rentrer : le camion part plein de propre et revient plein de sale.

Une équipe de handling **`handling24h`** ne charge donc plus un vol à la fois,
strictement dans l'ordre des départs, à partir de 00:00 du jour J : elle mène
des **tournées** en parallèle. Décochée, elle fait exactement comme avant.

### Le réglage

**Équipes › la fiche du handling › « 24 h/24, en tournées… »**. Rangé avec
l'équipe (`ory-ateliers-v1`), chaque réglage seulement une fois saisi : un
état d'avant se relit tel quel ; décoché, le handling d'avant revient, ses
réglages gardés pour plus tard. Les valeurs propres à l'unité (escales, flotte,
compagnies en VL…) se saisissent dans la fiche, jamais dans le code. Le banc
les force par `equipes` :

```json
{ "equipes": { "Quais": { "handling24h": true, "escale": { "*": 90, "NORD": 45 }, "vl": ["SUD"], "camionsVL": 3 } } }
```

| Réglage | Sens | Par défaut |
| --- | --- | --- |
| `handling24h` | Le mode : `true` | désactivé |
| `escale` | Par compagnie (« * » : les autres) : les minutes entre l'arrivée de l'avion d'un départ et ce départ | aucune : pas de déchargement |
| `quaiDepart` | Par compagnie : préparer le camion au quai (le charger dans la CF départ, le contrôler), pour une tournée qui charge | 0, à saisir |
| `dechargement` | Par compagnie : décharger un avion | 30 min pour un long courrier (liste `longs`), 10 sinon |
| `quaiRetour` | Par compagnie : vider le sale au quai, pour une tournée qui en rapporte | 0, à saisir |
| `entreAvions` | Le déplacement d'un avion à un autre | 10 min (provisoire) |
| `dechargementsParTournee` | Les avions qu'une tournée décharge, au plus | 1 |
| `margeDepart` | Un vol doit être chargé tant de minutes avant son départ | 60 |
| `margeEscaleCourte` | La même marge, en escale courte | 0 (provisoire) |
| `delaiArrivee` | Un avion se décharge au plus tôt tant de minutes après son arrivée | 0 |
| `vl` | Les compagnies servies en petit camion (VL), toute la journée ; les autres vont en gros camion | aucune |
| `vlDes` | Par compagnie : en VL à partir de cette heure (`{ "SUD": "10:00" }`, l'heure du départ sur l'horloge), en gros camion avant | aucune |
| `volsCamion` | Par compagnie (« * » : `volsParCamion`) : les vols qu'une tournée en gros camion sert au plus, une vague | 1 |
| `volsVL` | Par compagnie (« * » : les autres) : les vols qu'une tournée en VL sert au plus | comme en gros camion |
| `quaiParVol` | Par compagnie : la préparation au quai en plus, par vol de plus dans une tournée | 0 (à confirmer) |
| `echange` | Les compagnies dont chaque avion est déchargé puis chargé dans la même visite, quelle que soit son escale | aucune |
| `dureesVL`, `dechargementVL` | Par compagnie (« * » : les autres) : charger, décharger un avion servi en VL | celles de la compagnie |
| `camions`, `camionsVL` | La flotte de gros camions, de VL (0 ou vide : sans limite) | sans limite |
| `creneaux[].type` | `vl` : des chauffeurs de VL ; sinon, de gros camion | gros camion |

Repris tels quels : `durees` (charger un avion), `allers`, `retours`,
`volsParCamion` et `volsCamion` (les vagues, ci-dessous), `longs`, `chauffeurs.long` et
`chauffeurs.court`, `avance`, `creneaux` ; sans créneau, `simultanes` devient
le nombre de tournées à la fois, sans compter les chauffeurs.

### L'arrivée des avions

L'heure d'arrivée réelle n'est pas fiable : l'avion d'un départ arrive à
**départ − `escale`**. La colonne facultative **`heure_eta`** de la feuille
« Départs » (ou du CSV), en HH:MM, la remplace quand elle est remplie ; plus
tard que `heure_std` sur l'horloge, elle désigne la veille. Elle suit le
décalage des Horaires de vols. Seule la version 1 la lit
(`docs/FORMATS_EXCEL.md`).

Une compagnie **sans escale ni ETA** n'a pas de déchargement : la règle des
retours de la boucle du matériel (programme, J+1 ou planche) s'applique à ses
vols, comme aujourd'hui.

### Une tournée

Un véhicule et ses chauffeurs, du quai de l'unité au quai de l'unité :

1. la préparation au quai (`quaiDepart`), si elle charge quelque chose — une
   fois par tournée, plus `quaiParVol` par vol de plus ;
2. l'aller (`allers`) ;
3. un ou plusieurs chargements (`durees` ; jusqu'à `volsCamion` ou `volsVL`
   vols de la même compagnie : une vague, ci-dessous), d'un avion à l'autre en
   `entreAvions` ;
4. le déplacement vers un avion arrivé (`entreAvions`) et son déchargement
   (`dechargement`), jusqu'à `dechargementsParTournee` avions ;
5. le retour (`retours`, celui du dernier avion servi) ;
6. le vidage du sale au quai (`quaiRetour`), s'il y en a à bord.

Elle peut aussi seulement charger, ou seulement décharger : elle part alors à
vide, sans préparation au quai.

### Les vagues : plusieurs vols par tournée (évolution 8)

Les vols courts partent par vagues : plusieurs départs d'une même compagnie
dans une tournée, en gros camion le matin et en VL l'après-midi. Le réglage,
par compagnie et par type de véhicule : le nombre maximum de vols chargés dans
une tournée, `volsCamion` en gros camion, `volsVL` en VL (sans valeur : comme
en gros camion) ; 1 par défaut, comme avant. Le banc :

```json
{ "equipes": { "Quais": { "vlDes": { "EQUI": "10:00" }, "volsCamion": { "EQUI": 3 }, "volsVL": { "EQUI": 9 }, "quaiParVol": { "EQUI": 2 } } } }
```

- **Une vague** : des départs de la même compagnie et du même type de
  véhicule, pris dans l'ordre des départs. La tournée part quand tous ses vols
  sont prêts et les sert dans l'ordre des départs, d'un avion à l'autre en
  `entreAvions`. En échange (escale courte), pour chaque avion : décharger,
  charger, puis passer au suivant.
- **Chaque vol est chargé avant sa propre limite** (départ − marge) ; un vol
  qui ne tiendrait pas — ni lui, ni ceux d'avant mis en retard par lui — part
  dans une autre tournée.
- **La préparation au quai et le vidage se comptent une fois par tournée**,
  plus `quaiParVol` minutes au quai de départ par vol de plus (0 par défaut,
  la valeur est à confirmer dans l'unité).
- **On ne groupe que si cela ne fait pas monter les minutes-chauffeur** (la
  tournée groupée, attentes comprises, ne coûte pas plus que des tournées
  séparées) et ne met aucun vol en retard.
- **Un avion déchargé à part** (escale longue) l'est avant que la vague parte :
  un avion se décharge toujours avant d'être rechargé.
- **Dans la journée jouée.** Avec un plan de chauffeurs (§ 4), la tournée sert
  la vague du plan, à l'heure du plan (sa préparation au quai comprise). Un vol
  de la vague pas encore prêt est attendu, tant que ceux qui le sont restent à
  l'heure ; ensuite la tournée part sans lui, et il part dans une autre. Sans
  plan, la tournée du vol le plus urgent prend les départs suivants de sa
  compagnie et de son véhicule déjà prêts, si elle peut les charger en
  arrivant à leur avion. Une tournée groupée qui ne trouve pas ses chauffeurs
  part avec son premier vol seul, s'il les trouve.

Sans ces réglages (1 vol par tournée), la journée est celle d'avant.

### Les règles

- **Les fenêtres.** Un chargement ne commence ni plus de `avance` minutes avant
  le départ, ni avant que les commandes du vol soient prêtes, et doit finir
  `margeDepart` minutes avant le départ : c'est la **limite** du vol. Un
  déchargement commence `delaiArrivee` minutes après l'arrivée. Une tournée
  part pour arriver à l'avion quand elle peut y travailler, pas avant.
- **Un avion se décharge avant d'être rechargé** : le déchargement d'un avion
  finit avant que le chargement de son départ commence.
- **L'escale courte.** Si l'avion arrive trop tard pour être déchargé puis
  chargé avant départ − `margeDepart`, une seule tournée fait l'échange sur le
  même avion (décharger, puis charger), et ce vol doit seulement être chargé
  `margeEscaleCourte` minutes avant son départ.
- **L'échange sur le même avion, par compagnie** (évolution 8). Chaque avion
  d'une compagnie de la liste `echange` est déchargé puis chargé dans la même
  visite, quelle que soit son escale, sans tournée de déchargement à part ; le
  chargement est fini au plus tard à départ − `margeEscaleCourte`. Avec
  plusieurs vols par tournée : pour chaque avion, décharger puis charger, puis
  passer au suivant. Une compagnie de la liste sans escale ni ETA n'a pas
  d'avion à décharger : ses vols se chargent comme avant.
- **Des durées par type de véhicule** (évolution 8). En VL, un réajustement
  d'armoire ne prend pas le temps d'un chargement complet : un vol servi en VL
  se charge en `dureesVL` et son avion se décharge en `dechargementVL`, s'ils
  sont saisis pour sa compagnie (ou pour « * ») ; sinon, les durées de la
  compagnie (`durees`, `dechargement`). La limite, l'escale courte et
  l'échéance des commandes suivent ces durées.
- **L'échéance des commandes** se déduit de la tournée de chargement : limite
  − chargement − aller − préparation au quai (− déchargement, en escale
  courte), au lieu de départ − délai de chargement. Les retards de commandes se
  mesurent sur elle.
- **Les véhicules.** Une tournée prend un gros camion ou un VL selon la liste
  `vl`, et ne sert que des vols d'un même type de véhicule. Un vol prend
  toujours un seul véhicule. La flotte est une limite par type.
- **Le véhicule selon l'heure de départ** (évolution 8). Une compagnie de
  `vlDes` part en VL pour ses départs à partir de son heure, et en gros camion
  pour ceux d'avant : `{ "SUD": "10:00" }`, un départ de 08:00 part en gros
  camion, un de 14:00 en VL. L'heure se lit sur l'horloge : un départ de 23:30
  part en VL, un de 00:30 en gros camion. Chaque départ prend alors les
  chauffeurs, la flotte et le plan (§ 4) de son véhicule. Une compagnie de la
  liste `vl` part en VL toute la journée, même si elle a aussi une heure.
- **Les chauffeurs.** Une tournée qui sert un vol long courrier prend
  `chauffeurs.long` chauffeurs, les autres `chauffeurs.court`, occupés toute la
  tournée. Avec des créneaux : des chauffeurs de son type de véhicule, à leur
  poste à son départ. **Un chauffeur ne quitte pas une tournée en cours** : il
  ne part que pour une tournée qu'il finit dans son créneau, ou dans ses
  heures supplémentaires (§ 2 : son plafond), comptées à part
  (`heuresSupChauffeurs`). Une tournée qui n'a pas les chauffeurs pour
  décharger un avion long courrier le laisse à une autre.
- **L'ordre.** Une tournée part dès que ses commandes sont prêtes, qu'un
  véhicule et assez de chauffeurs sont libres ; entre deux tournées prêtes, la
  plus urgente (fin de fenêtre la plus proche) passe d'abord. Après ses
  chargements, elle va décharger l'avion arrivé le plus urgent de son type de
  véhicule, s'il y en a un ; sinon elle rentre. Pas un avion qu'elle
  déchargerait trop tard pour que son départ soit encore chargé à l'heure —
  sauf s'il aurait déjà dû partir seul : mieux vaut tard que jamais. Un vol pas
  prêt ne bloque plus les suivants. Un avion qu'aucune tournée de chargement n'emmène part seul
  quand il presse : dès que le départ de son avion est prêt et que sa fenêtre
  s'ouvre, ou au plus tard pour que ce départ soit encore chargé à l'heure.
- **24 h/24.** Plus de limite à 00:00 du jour J : une tournée peut commencer la
  veille au soir (temps négatifs, comme les services qui travaillent à J−1).
  Les créneaux se répètent d'un jour à l'autre : un créneau de 22:00 à 06:00
  couvre aussi la nuit d'avant.
- **La plonge.** Le sale arrive à la plonge à la fin du vidage au quai, et non
  plus à l'arrivée + le délai de la boucle du matériel. Ses quantités sont
  celles du vol de départ (le matériel par vol et par classe), sauf si le
  programme a une ligne retour de la même compagnie : celle dont l'heure est la
  plus proche de l'arrivée de l'avion donne ses quantités et son nom, et ne
  sert qu'une fois. Ces avions-là sortent de la règle des retours (programme,
  J+1 ou planche) : rien n'est lavé deux fois.

### Ce qu'il rend

Par handling 24 h/24 (`resultat.ateliers[]`) :

| Champ | Sens |
| --- | --- |
| `tournees` | Les tournées : `n`, `vehicule` (`camion`, `vl`), `chauffeurs` (combien), `conducteurs` (lesquels), `depart`, `retour`, `etapes` (`etape` : `quai-depart`, `aller`, `attente`, `chargement`, `trajet`, `dechargement`, `retour`, `quai-retour` ; `de`, `a`, `vol`), `charges`, `decharges`, `echange` (escale courte), `heuresSup` (de ses chauffeurs) |
| `conducteurs` | Les chauffeurs des créneaux : `id` (créneau.rang ; `v` : la copie de la veille), `vehicule`, `de`, `a`, `heuresSup` |
| `heuresSupChauffeurs` | Les heures sup de ses chauffeurs, en minutes |
| `vehiculesMax` | Le pic de véhicules sortis en même temps, par type |

Par vol (`resultat.vols[]`), en plus : `limite`, `echeanceCommandes`,
`vehicule`, `tournee`, `chauffeurs`, `categorie`, `arrivee` et `dechargement`
(`debut`, `fin`, `tournee`) s'il a un avion à décharger, `escaleCourte`.
`aHeure` : chargé avant sa limite. En retard ou pas chargé, la **`cause`** :
`commande` (prête après son échéance, ou jamais), `chauffeur` (pas de
chauffeur), `vehicule` (pas de véhicule), `fenetre` (rien de cela, mais les
durées ne tiennent pas dans la fenêtre). `etat` : `ok`, `retard`, `bloque`
(commande jamais prête), `chauffeurs`, `vehicule`, `fenetre`.

Dans la page : la fiche du handling (la case, les réglages, les colonnes par
compagnie, le véhicule de chaque créneau, le bilan des tournées) et la page des
départs (l'échéance d'un vol est sa limite ; la cause d'un retard). Le véhicule
d'une compagnie se choisit dans sa ligne : « gros camion », « VL » (toute la
journée) ou « VL à partir de », avec son heure ; sa case « Échange » la met
dans la liste `echange`.

Vérifications : `tests/handling-24h.test.cjs` (une tournée charge A puis
décharge B, un avion n'est pas rechargé avant d'être déchargé, une escale
courte donne un échange sur le même avion, une compagnie sans escale n'est pas
déchargée, un vol pas prêt ne bloque plus le suivant, VL et gros camions se
comptent à part, l'échéance des commandes suit la tournée de chargement, le
sale arrive à la plonge à la fin du vidage, un chauffeur finit sa tournée en
heures sup ; un déchargement qui mettrait son départ en retard ne s'enchaîne
pas ; la veille au soir, le long courrier, le déterminisme, la validation,
Excel, `heure_eta`, les options du banc) ; `tests/handling-24h-browser.cjs` (la fiche,
l'enregistrement, les départs, « Tout sauvegarder ») ;
`tests/non-regression.test.cjs` (réglé mais décoché : la même journée) ;
`tests/handling-vagues.test.cjs` et `tests/handling-vagues-browser.cjs`
(évolution 8 : le véhicule selon l'heure de départ — la journée, les
chauffeurs et le plan de chaque véhicule ; les vagues — 6 départs entre 06:00
et 07:00 à 3 vols par camion en 2 tournées, 9 départs de l'après-midi en une
tournée de VL, un vol qui ne tiendrait pas dans une autre, une vague qui
attend un vol pas prêt, pas de vague qui coûte plus de minutes-chauffeur, ni
qui mélange compagnies ou véhicules, l'échange avion par avion ; l'échange
sur le même avion par compagnie — aucune tournée de déchargement à part ;
les durées en VL ; la validation, Excel, les options du banc, la fiche).

## 4. Le handling calcule son nombre de chauffeurs au plus juste

Le nombre de chauffeurs d'un handling 24 h/24 ne se saisit pas : il dépend
des avions à charger et à décharger, et il doit être le plus bas possible. Le
moteur calcule le plus petit effectif qui sert toutes les tournées à l'heure,
sans plancher ni marge. Les créneaux saisis restent le second mode, pour
rejouer un planning donné.

### Le réglage

**Équipes › la fiche du handling (24 h/24) › Chauffeurs › « Leur nombre :
calculé au plus juste »**. Rangé dans `chauffeurs`, avec l'équipe
(`ory-ateliers-v1`), chaque réglage seulement une fois saisi ; les créneaux
saisis restent enregistrés, de côté, pour revenir à « saisi ». Il ne vaut qu'en
24 h/24 : sans lui, le handling d'avant, ses créneaux. Le banc le force par
`equipes` :

```json
{ "equipes": { "Quais": { "handling24h": true, "chauffeurs": { "mode": "calcules", "selonPreparation": true } } } }
```

| Réglage (`chauffeurs.…`) | Sens | Par défaut |
| --- | --- | --- |
| `mode` | `calcules` ; sinon les créneaux saisis (`saisis`) | saisis |
| `selonPreparation` | Les fenêtres partent de l'heure où chaque vol est prêt (un premier passage de la journée la donne), et non des seules heures de vol | non |
| `pasDebut` | Une vacation peut commencer toutes les `pasDebut` minutes | 30 (provisoire) |
| `debutsPossibles` | Ou seulement à ces heures (`["06:00", "14:00", "22:00"]` : un roulement 3 × 8) | — |
| `retardPauseMax` | Une pause se prend au plus tard tant de minutes après son seuil | 60 (provisoire) |
| `iterationsMax` | Combien de fois la journée se rejoue pour ajouter une vacation (étape 3) | 5 |

**Une vacation** dure la présence du régime — celle de l'équipe de handling si
elle en a une, sinon la règle générale (480 min par défaut) — et porte ses
pauses (15 min après 3 h, 45 min après 6 h par défaut ; le seuil se compte en
temps de service, pauses d'avant comprises). Pour un chauffeur, une pause ne
coupe pas une tournée : elle se prend entre deux tournées, dès qu'elle est due
et qu'il est libre, au plus tard `retardPauseMax` minutes après son seuil ; un
chauffeur ne part pas pour une tournée qui l'en empêcherait.

**La journée est circulaire** : pour le calcul des vacations, l'heure se lit
modulo 24 h, en supposant que la veille au soir ressemble à ce soir. Une
vacation qui commence à 22:00 couvre donc aussi les tournées de 00:00 à 06:00
(et, dans la journée jouée, la vacation de 22:00 de la veille est là pour les
premières tournées). Les heures d'une vacation comptent le jour où elle
commence.

### L'algorithme

Sans dépendance, déterministe (à égalité, toujours le même ordre : heure, puis
identifiant), moins d'une seconde pour une journée de 200 vols (0,3 à 0,6 s
mesurées, trois passages de la journée compris).

0. **Un premier passage** de la journée, chauffeurs et véhicules sans limite,
   donne les vols que ce handling charge et l'heure où chacun est prêt.
1. **Le besoin** : les tournées et leur placement.
   - *Les tâches* : pour chaque départ, son chargement (en escale courte, un
     échange : décharger puis charger le même avion) ; pour chaque avion
     arrivé, son déchargement ; chacun dans ses fenêtres (§ 3). Un vol jamais
     prêt n'est pas chargé ; son avion se décharge quand même.
   - *Les vagues* (évolution 8, § 3) : par compagnie et type de véhicule, dans
     l'ordre des départs, chaque tournée prend les départs suivants tant
     qu'elle en a moins que `volsCamion` ou `volsVL`, que chaque vol tient dans
     sa fenêtre, que la tournée se mène d'une traite — pas plus longue que ce
     qu'une vacation mène entre deux pauses, chacune au plus tard
     `retardPauseMax` après son seuil (240 min par défaut) — et qu'elle ne
     coûte pas plus de minutes-chauffeur que des tournées séparées. Un vol qui
     ne tient pas part dans une autre. Ensuite, tout le calcul — les
     enchaînements, le placement, les vacations, la vérification et la borne
     basse — compte une vague comme une seule tournée.
   - *Les enchaînements* : les déchargements, le plus pressé d'abord, se
     donnent chacun au chargement (ou à la vague sans échange) compatible — même véhicule, et des fenêtres
     qui se rejoignent : l'avion est là quand la tournée y arrive, et déchargé
     à temps pour son départ — qui ferme le plus tôt, jusqu'à
     `dechargementsParTournee` par tournée, et seulement si cela ne coûte pas
     plus de minutes-chauffeur que deux tournées séparées (un déchargement long
     courrier derrière un chargement court courrier double les chauffeurs de
     toute la tournée). Les autres partent seuls.
   - *Le placement* : chaque tournée, la plus contrainte d'abord, prend dans
     sa fenêtre l'heure où elle fait le moins monter le nombre de chauffeurs
     occupés en même temps (puis la moins chargée, puis la plus tôt), sur la
     journée circulaire, par type de véhicule, dans la limite de la flotte. Un
     avion se décharge avant d'être rechargé : chaque tournée placée resserre
     la fenêtre de celle qui sert le même avion. Un second placement, « au plus
     tôt », est essayé aussi ; on garde celui qui demande le moins de
     vacations (à égalité, le premier).
2. **Les vacations** : couvrir ce besoin avec le moins de vacations possible,
   par type de véhicule. Une tournée ne se partage pas : chacun de ses
   chauffeurs la mène d'un bout à l'autre. Les tournées se donnent, dans
   l'ordre où l'étape 1 les a placées, à des chauffeurs déjà en poste : chacune
   peut glisser dans sa fenêtre jusqu'à l'heure où assez d'entre eux sont
   libres pour la mener et la finir dans leur vacation, pauses comprises (à
   heure égale, ceux dont la vacation finit le plus tôt — la règle de la
   journée jouée). Seulement s'il n'y en a pas assez avant la fin de sa
   fenêtre, on ouvre une vacation : celle qui commence le plus tard possible
   avant elle et peut la mener ; la tournée glisse au besoin, au plus près de
   son heure prévue, jusqu'à une heure où c'est possible. Le plan ne compte pas
   sur les heures sup. Un enchaînement qui ne tient plus (les autres tournées
   placées, son déchargement finirait trop tard) est scindé : le chargement
   seul, le déchargement à part. Si toute la flotte est dehors pendant toute
   la fenêtre, la tournée attend qu'un véhicule rentre (son vol est en retard,
   faute de véhicule). La journée circulaire est coupée là où il y a le moins
   de tournées (quatre coupures essayées, la meilleure retenue) ; une vacation
   qui passe la coupure couvre aussi le début du tour suivant, et l'on refait
   le tour jusqu'à ce que ces vacations-là ne changent plus.
3. **La vérification** : la journée se joue avec ce plan, comme avec des
   créneaux saisis — chaque vacation est un créneau, qui porte ses pauses.
   Chaque tournée part à l'heure où le plan l'a placée (pas avant ; plus tard
   si son vol n'est pas prêt), avec les chauffeurs prévus s'ils sont libres
   (sinon selon la règle habituelle), et n'enchaîne que les déchargements
   prévus. Si des vols sont en retard faute de chauffeur, le moteur ajoute une
   vacation là où elle manque — à l'heure de début qui couvre le plus de ces
   tournées, telles que le plan les plaçait ; autant que la première d'entre
   elles a de chauffeurs (deux pour un long courrier) — et rejoue, au plus
   `iterationsMax` fois. Une vacation ajoutée qui n'ôte aucun retard est
   retirée, et la vérification s'arrête. Un retard dû à la production reste un
   retard : il ne fait pas ajouter de chauffeur.

**Ce que le plan ne peut pas faire.** Une tournée qu'aucune vacation possible
ne peut mener dans sa fenêtre — avec un roulement fixe, une tournée à cheval
sur un changement d'équipe ou sur la pause de tous, quand sa fenêtre est trop
courte pour glisser — est mise en retard, dès qu'un chauffeur le peut, et
comptée à part (`horsVacations`) ; elle n'ajoute pas de vacation pour rien.
Avec les heures sup (§ 2), et seulement pour ces tournées-là, un chauffeur la
finit en heures sup. Avec `volsCamion` ou `volsVL` (évolution 8), le plan
regroupe les vagues ; sans eux, il compte un vol par chargement, comme avant.

### La borne basse

Rendue à côté du résultat, par type de véhicule, pour mesurer l'écart à
l'optimum ; elle ne dépasse jamais le résultat :

- `pic` : le plus de chauffeurs occupés en même temps (le plus bas des deux
  placements, l'étalé de l'étape 1 et celui que les vacations ont retenu) ;
- `parHeures` : les minutes-chauffeur des tournées ÷ les minutes utiles d'une
  vacation (sa présence moins ses pauses) ;
- `instants` : une vacation ne peut contenir deux instants distants d'une
  présence entière ; le plus grand besoin cumulé en ⌊24 h ÷ présence⌋ instants
  ainsi espacés (trois, pour 8 h) en demande donc autant de vacations distinctes
  — souvent la plus forte des trois ;
- `chauffeurs` : la plus grande des trois.

Sur une journée fictive de 200 vols (tests), le plan trouve 55 vacations de gros
camion et 9 de VL, pour une borne basse de 48 et 8.

### Ce qu'il rend

`resultat.ateliers[].planChauffeurs`, pour un handling aux chauffeurs calculés :

| Champ | Sens |
| --- | --- |
| `vacations` | Le plan : `vehicule`, `debut` (HH:MM), `de` (minutes), `a` (`de` + présence), `n` (combien) |
| `chauffeurs`, `total` | Le nombre de chauffeurs de la journée, par type (`camion`, `vl`) et en tout |
| `heuresPayees` | Les minutes-chauffeur payées (vacations × présence) |
| `borneBasse` | Par type : `pic`, `minutes`, `parHeures`, `instants`, `chauffeurs` ; et `total` |
| `occupation` | Les minutes de tournée ÷ les minutes payées (`minutesTournees`) |
| `vehiculesMax`, `vehiculesPlan` | Le pic de véhicules sortis par type, dans la journée jouée et dans le plan |
| `heuresSupChauffeurs` | Les heures sup des chauffeurs, en minutes |
| `presence`, `pauses`, `selonPreparation` | La vacation et le réglage du calcul |
| `iterations`, `ajoutees` | Les passages de la vérification, et les vacations qu'elle a ajoutées par type |
| `retardsChauffeur`, `horsVacations` | Les vols encore en retard faute de chauffeur ; les tournées qu'aucune vacation possible ne peut mener |
| `tournees` | Les tournées telles que le plan les place (`vehicule`, `chauffeurs`, `depart`, `retour`, `charges`, `decharges`) |

Les chauffeurs de la journée jouée (`conducteurs`) portent leurs pauses
(`pauses` : `debut`, `duree`).

Dans la page : la fiche du handling 24 h/24 a le choix du mode, ses réglages et
le plan calculé, lisible comme des créneaux (véhicule, de, à, chauffeurs), avec
son bilan (chauffeurs par type, heures payées, borne basse, occupation,
véhicules, heures sup). « Reprendre ce plan en créneaux saisis » en fait des
créneaux saisis, modifiables (sans pauses : des créneaux saisis n'en ont pas).

Vérifications : `tests/chauffeurs-calcules.test.cjs` (des tournées qui ne se
chevauchent jamais demandent un chauffeur ; deux tournées long courrier
simultanées en demandent quatre ; enchaîner un chargement et un déchargement
fait baisser le besoin ; le plan calculé ne laisse aucun vol en retard faute de
chauffeur ; la borne basse ne dépasse jamais le résultat ; la limite de flotte
est respectée ; le mode « saisis » garde le comportement actuel ; les pauses,
les heures de début fixes, la sortie, « selon la préparation », le
déterminisme et le temps de calcul, la validation, Excel, les options du banc) ;
`tests/chauffeurs-calcules-browser.cjs` (la fiche, l'enregistrement, le plan,
la reprise en créneaux) ; `tests/handling-vagues.test.cjs` (évolution 8 : le
plan part des vagues, la borne basse sous le résultat, aucun retard faute de
chauffeur, le déterminisme et le temps de calcul) ; `tests/non-regression.test.cjs` (réglé sans le
mode 24 h/24 : la même journée).

## 5. Les renforts : une personne qui a fini aide une équipe qui n'a pas fini

Une équipe qui a terminé tous ses lots avant la fin de sa présence ne reste
pas inactive : ses personnes vont renforcer une équipe encore au travail,
jusqu'à la fin de **leur** présence.

### Le réglage

- **La règle de calcul**, rangée avec le barème (`ory-modele-v1`) :
  `renforts: { actif, efficacite, efficaciteAutreService, delai, versHeuresSup }`.
  Elle se règle dans **Simulation › Réglages de la simulation › Renforts**.
  Elle n'est enregistrée qu'une fois réglée : un état d'avant se relit tel
  quel, sans renforts. Hors de ses bornes, une valeur reprend sa valeur par
  défaut.

  | Réglage | Sens | Par défaut |
  | --- | --- | --- |
  | `actif` | Les renforts jouent | non |
  | `efficacite` | Ce que compte un renfort du **même service** (ou d'une salle de sa famille), en personne : 0 à 2 | 0,8 (provisoire) |
  | `efficaciteAutreService` | Ce que compte un renfort d'**un autre service** : 0 à 2 | 0,6 (provisoire) |
  | `delai` | Le délai avant qu'il travaille (déplacement, lavage des mains, tenue), en minutes : 0 à 240 | 10 (provisoire) |
  | `versHeuresSup` | Un renfort peut rester en heures sup (seulement si elles sont permises, § 2), au plus leur plafond | non |

- **Qui peut aider qui** : un service aide **toujours son propre service et
  ses annexes** (les zones « annexe » du plan rattachées à lui ; une annexe
  aide aussi son service), pour leurs équipes **à la main**. `polyvalence`,
  rangée avec les cases (`ory-ateliers-v1`), **ajoute** d'autres services :
  pour un service, la liste des services qu'il peut aider en plus. Elle se
  règle sous la règle, une ligne par service qui a une équipe qui prépare ; son
  propre service y est coché et grisé, comme une annexe qui n'a que des équipes
  à la main ; « Revenir au défaut » efface la liste. Un service de la liste
  ouvre toutes ses équipes, robots et handling 24 h/24 compris — c'est aussi
  la seule façon d'ouvrir le robot ou le handling d'une annexe, ou de son
  propre service. Quand le sien ou une annexe a un robot ou un handling
  24 h/24, la page lui donne deux cases : « … · à la main », cochée et grisée
  (ses équipes à la main, toujours aidées), et « … · robot » (ou « handling
  24 h/24 »), **décochée par défaut** : cochée, la liste le nomme et ses
  machines reçoivent aussi des renforts. Les sauvegardes d'avant qui
  nommaient le service lui-même se relisent sans changement : sa case robot
  y est cochée. Corrections du banc d'essai : la liste remplaçait le défaut, et
  « MONTAGE aide PRÉPA » supprimait sans le voir l'entraide à l'intérieur du
  MONTAGE ; puis le robot de son propre service ne se cochait plus dans la
  page.
- **Les postes de travail** d'une équipe à la main ou d'un robot :
  `personnesMax`, facultatif, dans sa fiche (le champ s'y montre quand les
  renforts sont actifs, ou quand il est saisi). Ses personnes et ses renforts
  ensemble ne le dépassent pas ; sans lui, pas de limite.

Exemple de matrice (services fictifs) — le montage, la prépa et l'annexe du
robot s'entraident ; la cuisine et la cuisine chaude ; la dotation et les
roulés couverts (chacun aide aussi, toujours, son propre service) :

```json
{ "polyvalence": {
    "montage": ["prepa", "robot"], "prepa": ["montage", "robot"], "robot": ["montage", "prepa"],
    "cuisine": ["chaude"], "chaude": ["cuisine"],
    "dotation": ["roules"], "roules": ["dotation"] } }
```

### Les règles

- **Qui prête** : une équipe à la main (pas une équipe sans minutes par vol)
  ou un robot qui a **fini tous ses lots** avant la fin de sa présence (moins
  le délai). Une équipe qui attend un lot en amont n'a pas fini : elle ne
  prête personne. Chacune de ses personnes devient un renfort, de l'heure où
  l'équipe a fini à la fin de sa présence (plus le plafond des heures sup avec
  `versHeuresSup`). En heures sup, un renfort suit la règle des heures sup
  (§ 2) : il reste tant que l'équipe qu'il aide travaille ; dès qu'elle attend
  (ou à la fin de sa présence, si elle attend déjà), il part, et il ne va plus
  aider une autre équipe. Ni une plonge, ni une mise à disposition, ni une
  équipe d'appui, ni le handling ne prêtent.
- **Qui reçoit** : parmi les équipes **qui risquent de dépasser leur
  présence**, celle dont les commandes partent le plus tôt (l'échéance la
  plus proche de ce qui lui reste) ; à égalité, celle qui a le plus de travail
  restant (en minutes-personne). Une équipe « risque » quand ce qui lui reste,
  à son effectif et avec les renforts qu'elle a déjà (chacun de son arrivée à
  son départ, hors de ses pauses ; ses pauses à elle arrêtent tout le monde),
  finirait après sa présence. Un robot risque quand il n'a pas son minimum de
  personnes ; le handling 24 h/24, quand un vol prêt attend un chauffeur. Un
  renfort ne va qu'à une équipe déjà à son poste, qui y est encore après le
  délai. Chaque équipe prend d'abord une personne de son service. On répartit
  à chaque fois qu'une personne se libère, qu'une équipe commence un lot,
  qu'un vol attend un chauffeur ou qu'un renfort repart ; une équipe qui ne
  risque plus ne reçoit plus.
- **Jamais** vers une mise à disposition, une plonge, une équipe d'appui, ni
  un handling qui n'est pas 24 h/24. Vers un **robot** ou le **handling**
  (permis de conduire), seulement si la matrice le dit. Une personne de la
  plonge (zone sale) ne va vers une zone alimentaire que si la matrice le
  dit. Un handling dont le moteur **calcule** les chauffeurs (§ 4) ne reçoit
  pas : son plan les compte déjà au plus juste.
- **Ce qu'apporte une personne** : quand l'effectif d'une tâche en cours
  change (un renfort arrive, repart, prend sa pause), son temps restant se
  recalcule : travail restant ÷ (personnes + somme des efficacités des
  renforts présents) ÷ rendement. Vers un **robot**, un renfort compte pour
  le minimum qui le fait tourner : armé, le robot tourne à son débit. Vers le
  **handling 24 h/24**, c'est un chauffeur de plus, de n'importe quel
  véhicule, jusqu'à la fin de sa présence (jamais en heures sup de chauffeur).
- **Ses pauses restent les siennes** : les arrêts de son équipe, et ses pauses
  de régime pas encore prises, à l'heure où elles tomberaient en travaillant
  sans arrêt depuis le début de son poste (une simplification).
- **Il repart** à la fin de sa propre présence, ou quand l'équipe aidée a fini
  (le handling : quand tous ses vols sont partis, au retour de sa dernière
  tournée). Il peut alors aller en aider une autre.
- **L'effectif calculé ne change pas** : il se calcule sans renfort.

### Ce qu'il rend

Par équipe, `renfortsPretes`, `renfortsRecus`, `renfortsHeuresSup` et
`renforts.vers` / `renforts.de` (§ 1), et pour la journée `resultat.renforts` :
une ligne `{ de, vers, minutes }` par couple d'équipes. Les minutes sont des
**minutes-personne de présence** : du départ du renfort (délai d'arrivée
compris) à son retour, hors de ses pauses. Les heures sup d'une équipe restent
celles de son propre travail (`heuresSup`, par personne) ; celles que ses
personnes font en renfort se lisent à part (`renfortsHeuresSup`, en
minutes-personne). Les lots qu'une équipe a faits avec des renforts portent
`renfort: true` et `fait` (les minutes qu'elle y a passées).

Dans la page, la **Synthèse** a un tableau des renforts (l'équipe qui aide,
l'équipe aidée, le temps prêté), quand l'option est cochée.

Vérifications : `tests/renforts.test.cjs` (sans renfort possible, la même
journée, sur les journées de référence aussi ; une équipe qui finit à 10:00
aide une équipe du même service qui aurait débordé de 60 min, et le
débordement baisse selon l'efficacité ; la matrice interdit un passage, donc
pas de renfort ; les familles ; `personnesMax` est respecté ; un renfort part
à la fin de sa présence, et reste en heures sup seulement si on le permet ;
une équipe qui attend l'amont ne prête pas ; l'ordre des équipes aidées ; le
renfort qui passe à une autre équipe ; ses pauses ; vers un robot ; vers le
handling ; un service aide toujours son propre service — une matrice « A aide
B » laisse A s'aider lui-même —, et une sauvegarde qui avait coché le service
lui-même se relit sans changement ; le déterminisme ; la validation ; les
options du banc ; Excel) ;
`tests/renforts-browser.cjs` (le réglage, la matrice, les postes de travail, la
Synthèse, l'enregistrement) ; `tests/non-regression.test.cjs` (réglés mais
désactivés, matrice et postes saisis : la même journée).

## 6. La plonge : un shift de nuit qui ne s'ouvre que s'il reste du sale

Quand les retours de l'après-midi dépassent ce que la plonge du soir lave, un
shift de nuit s'ouvre pour absorber ce retard. C'est une **équipe de lavage
ordinaire**, saisie dans l'application (horaires, présence, tunnels,
personnes), qui ne travaille que certains jours. Elle compte le jour J, celui
où elle commence : une équipe de 22:00 à 06:00 a `jour` 0 et `debutPoste`
22:00, même si elle lave après minuit.

Deux règles décident si elle vient, au choix (une seule par équipe, elles ne
se cumulent pas) : **le sale qui attend à une heure** (`mesure: 'sale'`, plus
bas), ou **le retard que l'équipe du matin ne peut pas absorber**
(`mesure: 'absorbable'`, « Sur le retard », plus bas) — c'est la règle de
l'unité : le shift de nuit ne s'ouvre que si l'équipe du matin du lendemain
ne pourrait pas laver ce retard en plus de son propre travail.

### Le réglage

- **La condition**, sur une équipe de lavage (`ory-ateliers-v1`) :
  `condition: { mesure: 'sale', a: 'HH:MM', seuil }`. L'équipe ne travaille
  que si, à l'heure `a` (par défaut son début ; le jour où elle commence), le
  sale **en attente** atteint `seuil` unités (défaut provisoire **1** : elle
  s'ouvre dès qu'il reste du sale). Sinon, ses personnes ne viennent pas et ne
  comptent pas. Dans la page : la fiche de l'équipe de plonge, « Ne vient que
  s'il reste du sale », l'heure (« À son début » la remet à son début) et le
  seuil. Rien n'est enregistré tant que la case n'est pas cochée.
- **Le sale de la veille** : `materiel.saleInitial` (`ory-ateliers-v1`, défaut
  0), le sale non lavé la veille, présent au début de la journée — pour que le
  banc puisse enchaîner les jours. Deux formes :
  - **la liste des vols** non lavés `[{ vol, cie, unites }]`, celle que rend
    `saleFinal` à la fin de la journée d'avant : chaque vol se lave à la durée
    de sa compagnie, et s'appelle « R13 (veille) » ;
  - **un nombre d'unités** : il se lave comme des vols « toutes compagnies »
    (la durée `*` de la plonge), chacun de la taille d'un vol moyen des retours
    du jour (le dernier, du reste) ; sans retour ce jour-là, un seul vol.

  Il arrive au début de la journée : 00:00 du jour J, ou le début de la journée
  jouée s'il est plus tard. Dans la page : *Réglages de la simulation › Retours
  des vols à la plonge › Sale de la veille* (un nombre ; une liste rendue par
  le banc s'y lit, et une saisie la remplace). Pour le banc :
  `options.saleInitial`.

### Les règles

- **Le sale en attente** est le sale revenu qui n'est pas encore entré dans un
  tunnel. Par vol : les vols revenus (retours, déchargements du handling
  24 h/24, sale de la veille) qu'aucun tunnel n'a commencés à l'heure de la
  mesure. Au débit (avec la boucle du matériel) : le sale qui attend devant les
  tunnels. On mesure après ce qui arrive au même instant (une équipe qui part
  et rend ce qu'elle n'a pas lavé, un retour). Sans la boucle du matériel, une
  plonge au débit n'a rien à laver : elle ne s'ouvre jamais.
- **Le calcul** : la journée se joue d'abord **sans** l'équipe, pour mesurer
  le sale à son heure ; puis avec elle (ouverte) ou sans elle (fermée). Deux
  équipes conditionnelles décident l'une après l'autre, dans l'ordre de leur
  heure : la seconde mesure dans une journée où la première est ouverte ou
  fermée. Fermée, l'équipe reste dans la liste des équipes : `personnes` 0,
  aucun lot, pas de fin, pas d'effectif.

### Ce qu'il rend

`resultat.ateliers[].conditionSale`, pour une plonge conditionnelle :

| Champ | Sens |
| --- | --- |
| `mesure` | La règle : `sale` (et `absorbable`, plus bas) |
| `ouverte` | Le shift s'est-il ouvert |
| `a`, `heure`, `seuil` | L'heure de la mesure (saisie, et en minutes du jour J), le seuil |
| `sale` | Le sale en attente mesuré, en unités |
| `lavees` | Ce qu'elle a lavé, en unités (0 fermée) |
| `reste`, `fin` | Le sale pas encore propre à sa fin (la fin de sa présence, ou de ses heures sup) : par vol, les vols revenus pas encore sortis du tunnel ; au débit, le niveau de la file |

`resultat.saleFinal` (quand l'unité a une plonge) : le sale non lavé à la fin
de la journée, `[{ vol, cie, unites }]` — par vol, les vols qu'aucune équipe
n'a lavés ; au débit, ce qui attend encore devant les tunnels. C'est le
`saleInitial` de la journée suivante.

Dans la page, la fiche de la plonge dit, une fois la journée calculée,
« Ouverte ce jour » ou « Fermée ce jour », le sale mesuré, ce qu'elle a lavé et
ce qui reste à sa fin.

Vérifications : `tests/plonge-nuit.test.cjs` (sous le seuil, le shift ne
s'ouvre pas et ne compte aucune personne ; au-dessus, il s'ouvre et lave ; un
shift qui passe minuit compte le jour où il commence ; le `saleInitial` est
lavé, en liste ou en nombre ; l'heure de la mesure ; deux équipes
conditionnelles ; au débit ; l'enchaînement des jours ; le déterminisme ; la
validation ; les options du banc ; Excel) ; `tests/plonge-nuit-browser.cjs` (la
fiche, le bilan, le sale de la veille, l'enregistrement) ;
`tests/non-regression.test.cjs` (sans sale de la veille : la même journée,
`saleFinal` en plus).

### Sur le retard : que si le matin ne peut pas l'absorber (correction)

Avec la règle du sale, le shift de nuit s'ouvre dès qu'il reste du sale à son
heure. Dans l'unité, il ne s'ouvre que si l'équipe du matin du lendemain ne
pourrait pas laver ce retard en plus de son propre travail.

**Le réglage**, sur une équipe de lavage (`ory-ateliers-v1`) :
`condition: { mesure: 'absorbable', equipe }`. `equipe` est l'identifiant de
l'équipe qui doit absorber le retard : une autre équipe de la même plonge. Sans
lui (le défaut), c'est la plonge du même service qui **commence le plus tôt
dans la journée** (à l'heure ; à égalité, le jour, puis la première de la
liste). Une équipe désignée qui n'existe plus, ou qui n'est pas une autre
plonge du service, s'efface à la relecture : le défaut revient. Dans la page :
la fiche de la plonge, « Ne vient que s'il reste du sale », puis « Elle vient :
si le matin ne peut pas absorber le retard » et « Le retard, pour : la première
du matin (« … ») » ou une autre équipe de la plonge. Rien n'est enregistré
tant que la case n'est pas cochée ; changer de règle efface les réglages de
l'autre (l'heure et le seuil du sale, ou l'équipe désignée). Pour le banc :
`options.equipes` (`{ "Plonge nuit": { "condition": { "mesure": "absorbable" } } }`,
l'équipe par défaut ; ou `"equipe": "<identifiant>"`, l'identifiant de
l'équipe — celui de la sauvegarde, ou la colonne « Identifiant » d'Excel —, pas
son nom : une équipe inconnue est refusée en le nommant).

**Le calcul** :

1. La journée se joue **avec l'équipe fermée** : le sale non lavé à la fin
   (`saleFinal`) est **le retard**. Une plonge en heures sup ne commence pas
   de nouveau vol (§ 2) : le retard compte ce que l'après-midi n'a pas
   commencé.
2. **L'équipe désignée l'absorbe** si, **seule**, sans limite de fin, elle
   lave avant la fin de sa présence et sans heures sup :
   - le retard, présent dès le début de la journée (00:00 du jour J, comme
     tout sale de la veille) ;
   - **ses propres retours** : ceux qu'elle lave dans la journée jouée sans
     la nuit (étape 1), à leur heure — au débit, la part de chaque vol qu'elle
     y lave.

   Seule : par vol, chacun de ses tunnels qui tournent prend le vol suivant,
   dans l'ordre des arrivées (le retard d'abord) ; au débit, à son débit, ce
   qui est là d'un bloc ; ses pauses comprises. Autrement dit, elle l'absorbe
   si et seulement si son **dépassement** — de combien de minutes elle
   finirait après la fin de sa présence — vaut 0. La façon dont la journée
   répartit les vols entre deux équipes qui se chevauchent n'entre pas dans
   la décision.
3. Si elle l'absorbe, le shift de nuit **reste fermé** : le retard passe au
   lendemain par `saleFinal`, comme aujourd'hui. Sinon, **il s'ouvre**, et la
   journée se joue avec lui. Sans retard, il reste fermé ; sans autre plonge
   pour l'absorber (ou si l'équipe désignée ne travaille pas ce jour-là, une
   autre plonge conditionnelle fermée), il s'ouvre dès qu'il y a un retard
   (`depassement` vaut alors `null`, comme quand aucun de ses tunnels ne
   tourne).

**Hypothèse** : le matin du lendemain ressemble à celui du jour — ses retours
sont ceux de ce matin —, comme la journée circulaire du handling (§ 3). Le banc
qui enchaîne les jours réels rend, lui, le vrai retard au lendemain par
`saleInitial`.

**Corrections du banc d'essai** : d'abord, la journée était rejouée avec le
retard pour sale de la veille, et l'équipe désignée devait y laver elle-même
ses propres retours. Rejouées sur 61 journées réelles, à 90 min par vol, la
nuit s'ouvrait 38 fois, chaque fois avec un dépassement de 0 : seule, l'équipe
du matin avait le temps, mais au rejeu l'équipe de l'après-midi, arrivée avant
son départ, prenait sur ses tunnels libres une partie de ses retours. Cette
condition mesurait la répartition des vols entre deux équipes qui se
chevauchent, pas la capacité du matin : on juge maintenant l'équipe seule.

Une plonge sur le retard décide à son début, dans l'ordre des heures, avec
les plonges sur le sale : chacune décide dans la journée où les précédentes
sont ouvertes ou fermées. La journée se joue deux fois pour elle (sans elle,
puis la journée retenue) ; quand elle reste fermée et décide la dernière, la
journée sans elle est la journée retenue.

**Ce qu'il rend**, `resultat.ateliers[].conditionSale` :

| Champ | Sens |
| --- | --- |
| `mesure` | `absorbable` |
| `ouverte` | Le shift s'est-il ouvert |
| `equipe` | L'équipe qui doit absorber le retard (son identifiant ; `null` sans autre plonge) |
| `retard` | `{ vols, unites }` : le retard de la journée jouée sans elle, en vols (ceux de `saleFinal`) et en unités |
| `absorbe` | L'équipe désignée l'absorbe-t-elle |
| `depassement` | De combien de minutes elle dépasserait sa présence, seule (voir plus haut) : 0 quand elle l'absorbe ; `null` sans équipe qui lave ce jour-là |
| `lavees`, `reste`, `fin` | Comme pour le sale : ce qu'elle a lavé, le sale pas encore propre à sa fin |

Dans la page, la fiche dit « Ouverte ce jour » ou « Fermée ce jour », le
retard sans elle, si l'équipe désignée l'absorbe le lendemain et, sinon, de
combien elle dépasserait sa présence. Dans Excel : « Ne travaille que si » =
`retard non absorbé`, ou `retard non absorbé (par Plonge matin)` (voir
[`FORMATS_EXCEL.md`](FORMATS_EXCEL.md)).

Vérifications : `tests/plonge-absorbable.test.cjs` (un petit retard que le
matin absorbe laisse la nuit fermée, la journée est celle de l'unité sans
elle ; tout juste à la fin de sa présence ; un gros retard l'ouvre, avec son
dépassement ; une seule plonge ; une équipe désignée qui ferait des heures sup
pour l'absorber ne l'absorbe pas ; l'équipe par défaut et l'équipe désignée ;
au débit ; avec une plonge sur le sale ; le déterminisme ; la validation ; les
options du banc ; Excel) ; `tests/plonge-absorbable-seule.test.cjs` (le matin
seul lave le retard et ses retours avant la fin de sa présence : la nuit reste
fermée, même si au rejeu l'après-midi prend un de ses retours ; 20 min de
dépassement l'ouvrent ; les autres cas et la condition « sale » ne changent
pas ; le déterminisme) ; `tests/plonge-absorbable-browser.cjs` (la règle,
l'équipe désignée, le bilan, l'enregistrement) ; `tests/non-regression.test.cjs`
(sans cette règle : la même journée).

## 7. Les SPML : les cabines que chaque service prépare

Le travail SPML se compte par vol, comme le reste : un vol entre dans la
commande X/SPML d'un service s'il a au moins un SPML que ce service prépare. Or
la cuisine et la cuisine chaude ne préparent pas les SPML de l'économie : un vol
qui n'a que des SPML éco n'entre pas dans leur commande SPML.

- **L'import** (CSV ou classeur, l'outil comme la page) : colonnes facultatives
  `nb_SPML_BC`, `nb_SPML_PC`, `nb_SPML_YC`. Si elles sont là et que `nb_SPML`
  est vide, `nb_SPML` vaut leur somme. `nb_SPML` seul se lit comme avant
  (toutes cabines confondues). Le vol porte alors `spmlParCabine`
  (`{ BC, PC, YC }`, les colonnes présentes) ; la commande X/SPML garde ce
  détail pour chacun de ses vols (`classes[].vols[].cabines`). La version 2
  ignore ces colonnes.
- **Le réglage** `spmlCabines` (`ory-ateliers-v1`) : pour un service, la liste
  des cabines dont il prépare les SPML (par exemple `{ "cuisine": ["BC", "PC"] }`).
  Un service sans réglage les prépare toutes ; une liste vide, aucune. Il n'est
  enregistré qu'une fois réglé. Dans la page : *Réglages de la simulation ›
  Repas spéciaux par cabine*, une ligne par service qui prépare une commande
  SPML, une case par cabine (toutes cochées : le défaut). Pour le banc :
  `options.ateliers` (`{ "spmlCabines": { … } }`).
- **La règle** : un vol entre dans la commande X/SPML d'un service seulement
  s'il a au moins un SPML d'une cabine de sa liste. Le barème reste par vol :
  le travail d'un service sur X/SPML est ses minutes par vol × les vols qu'il
  prépare. Un vol dont le programme ne détaille pas les cabines (nb_SPML seul),
  ou dont nb_SPML dépasse la somme du détail, compte pour tout service qui
  prépare des SPML. L'effectif calculé suit. Les commandes elles-mêmes (leurs
  vols, leur échéance) ne changent pas.

Vérifications : `tests/spml-cabines.test.cjs` (un vol qui n'a que des SPML éco
n'entre pas dans la commande SPML d'un service réglé sur `['BC', 'PC']`, mais
entre dans celle d'un service sans réglage ; un import sans les nouvelles
colonnes ne change rien ; la somme, le détail incomplet, l'effectif calculé, la
validation, les options du banc, l'outil, Excel) ; `tests/spml-cabines-browser.cjs`
(l'import de la page, le réglage par service, l'enregistrement) ;
`tests/non-regression.test.cjs` (toutes les cabines saisies : la même journée).

## 8. Les lots d'une équipe : ses fournitures, et l'ordre de ses lots

### Une mise à disposition fermée ne bloque pas une équipe déjà servie (correction)

Un lot qui commençait pendant qu'une mise à disposition à heures fixes était
fermée (un magasin ouvert de 07:00 à 18:00, une « boutique ») attendait sa
réouverture : rejoué sur des journées réelles, un robot qui finissait un lot à
19:14 attendait la réouverture du lendemain à 07:00 pour lancer le suivant.

- **La règle** : une équipe prend ses fournitures en début de poste, ou dès
  que la mise à disposition ouvre. Celle-ci ne fait donc attendre que le
  **premier lot** d'une équipe qui en a besoin, et seulement si elle **n'a
  pas encore ouvert depuis le début du poste** de l'équipe (son début,
  `debutPoste`). Une fois servie, l'équipe n'est plus bloquée par ses
  fermetures. Plusieurs mises à disposition : chacune sert l'équipe à sa
  première ouverture depuis son début.
- Une journée où rien ne commence pendant une fermeture ne change pas. Les
  mises à disposition par vagues, ou toujours ouvertes, non plus.

Vérifications : `tests/mise-a-disposition-servie.test.cjs` (un robot qui
enchaîne un lot après la fermeture du magasin ne l'attend plus ; une équipe
qui commence avant l'ouverture attend l'ouverture pour son premier lot, et
seulement lui ; une équipe qui commence pendant une fermeture attend
l'ouverture ; une journée où tout se fait magasin ouvert ne change pas) ;
`tests/vagues.test.cjs` et `tests/boutique-browser.cjs` (la boutique, comme
avant).

### L'ordre souple : un lot prêt n'attend pas un lot en retard (correction, option)

Une équipe fait ses lots strictement dans l'ordre de sa liste : si un lot
attend son amont, les suivants attendent aussi, même prêts. Rejouée sur des
journées réelles, une équipe de contrôle de 27 lots attendait 790 min son
premier lot et n'atteignait jamais les derniers.

- **Le réglage** : `ordreSouple: { actif }`, une règle de calcul rangée avec le
  barème (`ory-modele-v1`), **désactivée par défaut**, enregistrée seulement
  une fois réglée. Une équipe (à la main ou au robot) peut avoir la sienne :
  `ordreSouple: true` (souple) ou `false` (strict) dans `ory-ateliers-v1` ;
  sans elle, la règle générale. Dans la page : *Réglages de la simulation ›
  Ordre des lots* (la case ; le panneau nomme les équipes réglées autrement),
  et, dans la fiche d'une équipe, « Ordre de ses lots » (le réglage général,
  souple, strict). Dans Excel : la colonne « Ordre des lots ». Pour le banc :
  `options.ordreSouple`, et `options.equipes` pour une équipe.
- **La règle** : quand le lot suivant n'est pas prêt — son amont n'a pas tout
  livré, ou une mise à disposition ne l'a pas encore servie (voir plus haut) —,
  l'équipe prend le **premier lot prêt de sa liste**, puis revient aux autres
  quand ils le sont. L'ordre de la liste reste la priorité entre lots prêts,
  et les commandes réunies par « + » restent un seul lot. Quand **aucun lot
  n'est prêt**, elle attend le premier qui le devient (s'il en devient
  plusieurs à la fois, le premier de sa liste). Le matériel, la ligne du
  robot et les renforts ne comptent pas dans « prêt » : ils se prennent
  ensuite, comme avant. En heures sup (§ 2), aucun lot prêt : elle part.
- Désactivée, ou quand rien n'attend, la journée est celle d'avant. Les
  renforts suivent les lots qui restent à l'équipe, dans l'ordre où elle les
  fait.

Vérifications : `tests/ordre-souple.test.cjs` (lot 1 pas prêt, lot 2 prêt : le
lot 2 d'abord ; la priorité de la liste entre lots prêts ; les commandes
réunies par « + » ; aucun lot prêt : le premier qui le devient ; désactivée,
la même journée ; la règle d'une équipe ; avec les heures sup ; le
déterminisme, renforts compris ; la validation ; les options du banc ; Excel) ;
`tests/ordre-souple-browser.cjs` (la case, la fiche, le rechargement, « Tout
sauvegarder ») ; `tests/non-regression.test.cjs` (désactivée : la même
journée).

## 9. Simuler une période : un programme daté, joué jour après jour

Le site simulait une seule journée : un programme de vols n'avait pas de
date, et deux mois de vols importés d'un coup tombaient dans la même journée.
Rien ne passait d'un jour au suivant, sauf le « sale de la veille » saisi à la
main. Le banc enchaînait déjà les journées réelles hors du site
(`outils/simuler-journee.cjs` une fois par jour, le `saleFinal` d'un jour pour
`saleInitial` du suivant). La version 1 le fait elle-même, par un seul chemin
de calcul (`moteur/periode.js`), pour l'outil et pour la page.

### Le programme daté

Une colonne facultative **`date`** dans le programme de vols : en CSV, en
feuille unique avec `sens`, et dans les feuilles « Départs » et « Retours »
(`docs/FORMATS_EXCEL.md`, § 3). `AAAA-MM-JJ`, `JJ/MM/AAAA` ou une date Excel,
comme le classeur de calage de la version 2 (sa logique, `dateDe`, reprise dans
`ui-model.js` sans toucher à la version 2).

- La date d'un départ est celle de son `heure_std` ; celle d'un retour, celle
  de son `heure_sta`. `heure_eta` garde sa règle : plus tard que `heure_std`
  sur l'horloge, c'est la veille.
- **Sans colonne date** (ou vide partout) : une seule journée, exactement
  comme aujourd'hui.
- Des lignes avec date et d'autres sans, ou une date illisible : **rien n'est
  importé**, et le message nomme la ligne.
- Le rapport d'import décrit la période : premier et dernier jour, nombre de
  jours, vols par jour. Un jour sans aucun vol au milieu est signalé (« aucun
  vol le 15/08 : jour sans vol ou oubli ? »), sans bloquer.
- « Exporter les vols (Excel) » écrit la date en première colonne, une vraie
  date Excel ; exporté puis réimporté, le programme est le même. « Modèle CSV
  daté » propose un programme sur deux jours fictifs.
- Le programme daté se garde comme celui d'aujourd'hui : le temps de la
  visite, jusqu'au prochain import.
- `outils/simuler-journee.cjs` joue un fichier daté d'un seul jour comme une
  journée (`journee.date` le dit) ; daté sur plusieurs jours, il le refuse et
  renvoie à `outils/simuler-periode.cjs`.

Vérifications : `tests/programme-date.test.cjs` (les formats de date ; un
programme fictif de 3 jours lu de même en CSV, en feuille unique et en Départs /
Retours ; exporté puis réimporté, identique ; sans colonne date, comme avant ;
lignes datées et non datées mêlées, date illisible ou doublon d'un même jour :
refusés, la ligne nommée ; le rapport de la période et le jour sans vol ; l'outil
d'une journée) ; `tests/programme-date-browser.cjs` (le modèle daté, le rapport
d'import, le refus, l'export).

### Le calcul de la période

`moteur/periode.js`, sans navigateur, que l'outil et la page appellent tous
les deux. La période va du premier au dernier jour du programme ; chaque jour
se joue dans l'ordre, avec les mêmes réglages et ses seuls vols (un jour sans
vol aussi : il est joué, et ce qui reste passe). Chaque journée se calcule
exactement comme une journée seule (`moteur/journee.js`), avec ce que la veille
lui laisse :

- **le sale non lavé** : le `saleFinal` du jour devient le `saleInitial` du
  lendemain ; le premier jour part du sale de la veille saisi ;
- **le matériel propre restant**, si la boucle du matériel est active : le
  stock propre de fin de journée (`materiel.restePropre`) devient le stock
  initial du lendemain ;
- **avec la source de retours « J+1 »** : le sale du jour J vient des départs
  réels de J−1 (leur heure + 24 h + le délai), et non plus des départs de J ;
  le premier jour garde la règle d'aujourd'hui. Le moteur reçoit ces départs
  par `departsVeille` (l'outil d'une journée, par l'option `volsVeille`) ;
  sans eux, rien ne change.
- **avec un handling 24 h/24** (correction 11) : un départ de la veille ne
  revient en « J+1 » que si aucun handling 24 h/24 ne décharge son avion —
  la règle d'une journée seule (§ 3 : ces avions-là sortent de la règle des
  retours), appliquée à la veille. Le moteur juge chaque départ de la veille
  d'après lui-même : un handling 24 h/24 charge sa compagnie, et le vol a une
  ETA ou sa compagnie une escale. Son sale est alors revenu au déchargement ;
  il ne revient pas une seconde fois. Une compagnie sans déchargement (ni
  escale ni ETA, ou hors de la liste du handling 24 h/24) garde la règle
  « J+1 » : son sale vient de ses départs réels de la veille. Jugé d'après les
  identifiants du jour, un numéro de vol qui changeait d'un jour à l'autre
  (fréquent en long-courrier) revenait une seconde fois : 18 à 69 vols lavés
  de trop par jour sur 61 journées réelles. Sans handling 24 h/24, rien ne
  change.

**Rien d'autre ne passe pour l'instant** : les lots non finis, les retards,
les préparations d'avance. Ils se comptent dans le bilan du jour où ils
manquent.

Une journée de la période rend, champ par champ, ce que rend
`outils/simuler-journee.cjs` pour ses vols avec le même `saleInitial` (et, si
la boucle est active, le même stock initial ; en « J+1 », les vols de la
veille) : chaque journée porte ces options (`entree`, et `options` dans le
JSON de l'outil), de quoi la rejouer seule. Le calcul est déterministe : moins
de 15 ms par journée fictive de 50 vols sous Node (`tests/periode.test.cjs`
vérifie moins d'une seconde).

### L'outil

```sh
node outils/simuler-periode.cjs sauvegarde.json vols-dates.csv|vols-dates.xlsx [options.json] > periode.json
node outils/simuler-periode.cjs sauvegarde.json vols-dates.csv --sans-detail > periode-legere.json
node outils/simuler-periode.cjs sauvegarde.json vols-dates.csv --sans-detail --xlsx periode.xlsx > periode-legere.json
```

Les mêmes options que `outils/simuler-journee.cjs` (§ 1), sauf `volsVeille`
(la période trouve elle-même les vols de la veille). Le JSON rend :

| Champ | Sens |
| --- | --- |
| `periode` | `debut`, `fin`, `jours` (les journées de vols), `joursSansVol`, `joursIncomplets` (les jours de travail), `options`, `sauvegarde` et `vols` (les noms des fichiers) |
| `bilan` | Le bilan par jour de travail, par mois et sur la période (ci-dessous) |
| `journees` | Chaque journée de vols : `date`, `departs`, `retours`, `options` (celles qui la rejouent seule par `simuler-journee`, au champ près : le sale de la veille, le stock initial, les vols de la veille en « J+1 ») et son `resultat` complet |

`--sans-detail` omet `journees`, pour un fichier léger. `--xlsx periode.xlsx`
écrit aussi le classeur de la période, le même que la page (ci-dessous). Un jour sans vol au
milieu est signalé sur la sortie d'erreur, sans bloquer, ainsi que le temps de
calcul ; un programme sans date est refusé (une journée :
`simuler-journee`). Deux lancers donnent le même fichier.

### Le bilan par jour de travail

Chaque équipe d'une journée de vols compte **au jour des vols + son `jour`** :
la cuisine à J−2 des vols du 12 travaille le 10. Une plonge de nuit compte le
jour où elle commence, comme aujourd'hui. Pour chaque jour de travail, par
service, par équipe et par compagnie :

| Mesure | Sens |
| --- | --- |
| `personnes` | L'effectif de l'équipe ce jour-là |
| `besoin` | Le besoin exact : homme-minutes ÷ poste ÷ rendement pour une équipe à effectif calculé, ses personnes sinon (non arrondi) |
| `hommeMinutes` | Le travail fait : la somme des homme-minutes de ses lots |
| `heuresSup` | Les heures sup en minutes × personnes : `heuresSupPersonnes` + `renfortsHeuresSup` |
| `renfortsPretes`, `renfortsRecus` | Les minutes de renfort prêtées et reçues (§ 5) |
| `lots`, `lotsEnRetard` | Ses lots, et ceux finis après leur échéance |
| `commandesEnRetard`, `retardMax` | Les commandes finies après leur échéance (une fois par service), et le retard le plus long |
| `volsCharges`, `volsEnRetard`, `chauffeursCamion`, `chauffeursVL`, `borneBasse`, `heuresSupChauffeurs` | Le handling : vols chargés, en retard, chauffeurs du plan par type de véhicule, borne basse, heures sup des chauffeurs (§ 3, § 4) |
| `volsLaves`, `nuits`, `saleSoir` | La plonge : vols lavés ; la nuit ouverte ou non (§ 6) ; le sale qui reste le soir |
| `encadrement` | L'encadrement saisi du service, une fois par jour |
| `charge`, `personnesService`, `surplusArrondi`, `chargeEncadrement` | La charge de l'équipe ou du service en ETP, ⌈charge⌉ au service, personnes − ⌈charge⌉, l'encadrement à part (évolution 11 a, § 10) |

**Par compagnie** (par service) : commandes, vols, passagers, homme-minutes et
retard max. Un lot de plusieurs compagnies se répartit **au prorata des minutes
du barème × vols** de chacune.

**Un jour de travail est « incomplet »** quand une de ses journées de vols
manque : avant le premier jour de vols (la cuisine à J−2 des premiers vols),
et en fin de période (les derniers jours n'ont pas leurs vols de J+1 et J+2).
Il est montré, marqué (`complet: false`, `manque` : les journées absentes), et
**sort des totaux et des moyennes**. Totaux et moyennes par mois et sur la
période, sur les jours complets seulement : les mesures s'additionnent (la
moyenne : le total ÷ les jours complets), sauf `retardMax`, le plus haut (la
moyenne : celle des retards max de chaque jour).

Vérifications : `tests/periode.test.cjs` (une période d'un jour = la journée
d'aujourd'hui ; chaque journée d'une période de 3 jours = l'outil d'une
journée avec ce que la veille lui laisse ; un vol non lavé le jour 1 lavé le
jour 2, le stock propre au lendemain ; « J+1 » ; un jour sans vol au milieu ;
le jour de travail de chaque équipe, les jours incomplets, la somme des
homme-minutes ; les mesures ; le prorata d'un lot de deux compagnies ; pas à
pas, le déterminisme et le temps de calcul ; une journée rejouée d'après son
entrée, décalage compris, comme la page la montre) ; `tests/simuler-periode.test.cjs`
(l'outil : le JSON, chaque journée rejouée seule par `simuler-journee` avec ses
`options`, `--sans-detail`, le classeur daté, le déterminisme, les refus) ;
`tests/periode-handling24.test.cjs` (correction 11, deux jours fictifs en
handling 24 h/24 : des numéros de vol qui changent, aucun retour « J+1 » le
jour 2, identique champ par champ à `simuler-journee` avec le sale du jour 1 ;
une compagnie sans escale, hors de la liste du handling, ou avec une ETA ; un
vol sous le même numéro les deux jours, un seul déchargement par jour ; sans
handling 24 h/24, rien ne change).

### La page

**Sans programme daté, rien de nouveau ne se montre** : ni bandeau, ni page
Période ; la journée se calcule comme aujourd'hui.

Avec un programme daté :

- **Un bandeau en tête de chaque page** : la journée de vols affichée (un
  sélecteur, ‹ et ›, chaque jour avec ses départs et retours), où en est la
  période, et « Simuler la période ». Les vues d'une journée (Synthèse, plan
  rejoué, planning, commandes, vols, stocks…) montrent **la journée choisie**,
  la première à l'import. « Programme des vols » le rappelle
  (« journée du 02/11/2026 »).
- **« Simuler la période »** joue les journées une à une, en rendant la main
  entre deux : la page reste vivante, la progression se lit (« Journée 12 sur
  61 ») et **Annuler** arrête le calcul (la période d'avant, s'il y en avait
  une, reste).
- **La période ne se recalcule pas à chaque frappe.** Un réglage modifié (une
  équipe, le barème, les liens, le plan, le délai de chargement, le
  décalage) ou d'autres vols importés la marquent **« à relancer »** ; le
  bouton devient « Relancer la période ». Revenir au même délai ou au même
  décalage la rend de nouveau à jour ; une modification annulée compte comme
  une modification (on relance).
- **Le sale de la veille** : tant que la période est calculée et à jour, la
  journée affichée part de ce que la veille lui laisse dans la période (son
  sale, son stock propre, ses départs de la veille en « J+1 ») — c'est, au
  champ près, la journée de la période (`OrlyPeriode.jouerAvecEntree`). Sinon
  (pas calculée, à relancer, ou le premier jour), elle part du sale de la
  veille saisi, comme aujourd'hui.
- **Résultats › Période** : le tableau jour de travail × service, une mesure
  à la fois (personnes, besoin exact, charge, personnes du service, surplus
  d'arrondi, heures sup en heures × personnes, commandes en retard, retard
  max, homme-heures), avec le total du jour ; les
  totaux et les moyennes par jour de chaque mois et de la période ; les jours
  incomplets marqués « incomplet », hors des totaux. **Un clic sur un jour**
  ouvre sa journée de vols (la Synthèse ; un jour de travail avant la période,
  la première journée) ; **▸ déplie son détail** par équipe (service, jour
  des vols, personnes, besoin exact, charge, homme-heures, heures sup, lots en
  retard, retard max) et par compagnie (commandes, vols, passagers,
  homme-heures, retard max).
- **La comparaison A/B reste à la journée** : elle compare deux essais de la
  journée affichée.

La période calculée vit le temps de la visite, comme le programme daté : elle
ne s'enregistre pas dans le navigateur.

Vérifications : `tests/periode-browser.cjs` (une unité fictive, un programme
fictif de vingt jours sur deux mois : sans date, rien de nouveau ; le
sélecteur ; le calcul par étapes et Annuler ; le bilan de la page = celui du
moteur ; la journée affichée = celle de la période, puis, à relancer, celle du
sale saisi ; la page Période : jours incomplets, totaux et moyennes par mois,
clic sur un jour, détail déplié ; de nouveau sans date, la page s'en va) ;
`tests/onglets.test.cjs` (la page Période ne se montre qu'avec un programme
daté).

### L'export de la période

Quand une période a été simulée et qu'elle est à jour, **« Exporter les
résultats »** propose « La période, en Excel » ; « La journée affichée, en
JSON » reste (à relancer, le choix de la période attend le nouveau calcul ;
sans période, le bouton exporte la journée, comme avant). La page Période a
aussi « Exporter la période (Excel) ». L'outil écrit le même classeur avec
`--xlsx` : **un seul code d'écriture** (`echanges.js`, `periodeVersClasseur` ;
`tableur.js` pour le fichier).

Huit feuilles — Lisez-moi (la période, la sauvegarde, les réglages, la date du
calcul, les définitions, l'avertissement de prototype), Période, Équipes,
Compagnies, Lots, Vols, Plonge, Jours —, décrites colonne par colonne dans
`FORMATS_EXCEL.md`, § 4. Les jours et les heures sont de vraies dates Excel,
la veille comprise ; chaque feuille a sa ligne d'en-tête, des filtres et ses
premières colonnes figées.

Vérifications : `tests/periode-export.test.cjs` (les feuilles et leurs
colonnes ; le Lisez-moi ; des dates Excel, la veille d'une équipe à J−1
comprise ; les lignes = celles du bilan et de chaque journée ; relu par
`tableur.js`, filtres et volets figés, le même fichier pour les mêmes
données ; deux mois fictifs de 50 vols par jour écrits en moins de
5 secondes) ; `tests/simuler-periode.test.cjs` (`--xlsx` : le classeur de la
page, le même JSON) ; `tests/periode-browser.cjs` (le choix d'« Exporter les
résultats », l'export de la page = celui de l'outil pour la sauvegarde de la
page, la journée en JSON ; à relancer, le choix attend ; sans date, la
journée comme avant).

## 10. Le calage sur le réel, version 1

Le banc compare la simulation aux heures pointées. Pour que l'écart dise
quelque chose, le calcul doit d'abord rendre le **besoin exact** de chaque
équipe, sans personne de trop ni personne d'oubliée : une équipe sans aucun
vol n'a personne (correction 10, § 1), et l'équipe d'un robot suit les vols
comme les autres (ci-dessous).

### L'équipe d'un robot calculée d'après son barème (évolution 9)

Un robot va à son débit : sa ligne fait ses plateaux ÷ débit, avec au moins
son minimum pour tourner. Mais le travail autour de la ligne — le chargement,
le montage, le runner — se budgète par vol, comme ailleurs. Il se chiffre au
barème **propre** d'un **service de robots** : une annexe où ne travaillent
que des robots, comme le Robot que la page pose sous le Montage
(`moteur/journee.js`, `servicesDeRobots`, passe ces services au moteur dans
`servicesRobot` ; absent quand il n'y en a pas). Dans un service de robots à
effectif calculé :

- **avec des heures par vol à son barème propre** pour ses commandes,
  l'équipe du robot prend ses personnes avec la formule d'une équipe à la
  main : minutes par vol × vols de chaque commande ÷ minutes du poste ÷
  rendement, arrondi au-dessus, et **au moins `personnesMin`** (1 par défaut)
  dès qu'elle a du travail. Le résultat va dans `effectifs` (`personnes`,
  `saisi`, `hommeMinutes`, `poste`, `rendement`), et la journée se joue avec
  cet effectif : calculé, le robot n'est jamais « à l'arrêt, pas assez de
  monde » (`robot-arret` disparaît) ;
- **sans heures par vol pour ses commandes**, il garde son effectif saisi,
  comme avant. Le barème **repris** du service dont il dépend ne compte jamais :
  sous le Montage, le Robot en reprend les minutes, qui sont celles du travail
  à la main, pas les siennes (`baremeRepris`, les services d'un robot dont le
  barème est repris ; absent quand il n'y en a pas) ;
- **hors d'un service de robots** — un service du plan de base (le Montage,
  la Prépa), une annexe partagée avec des équipes à la main ou hors tunnel —,
  les minutes du barème sont celles du travail à la main : le robot garde son
  effectif saisi, comme avant, sauf s'il demande « Calculé d'après le
  barème » ;
- **sa compagnie ne vole pas ce jour-là** (sa commande écartée de la journée) :
  0 personne si le barème a des minutes pour elle, comme une équipe à la main
  (correction 10) ; son effectif saisi sinon ;
- à effectif **« Constant (saisi) »** (le choix « Effectif » de sa fiche), ou
  dans un service constant ou à effectif imposé, son effectif saisi ;
- **sans vol ce jour-là** (une commande ajoutée à la main), 0 personne et sa
  commande en temps nul (correction 10), renforts actifs ou non : calculée à
  0 personne sans travail, une équipe — robot ou à la main — n'attend pas de
  renfort ;
- chaque journée part de son **effectif saisi** (`personnesSaisies`) : la
  valeur qu'un autre jour a calculée ne vaut pas saisie ;
- **sa ligne va toujours à son débit** : des personnes en plus ne
  l'accélèrent pas, la durée de ses lots ne change pas.

Dans la page :

- **Barème** : les heures par vol du service de robots se saisissent comme
  les autres — une valeur par classe, ou par compagnie × classe. Le classeur
  « Barème » (Exporter, Importer) lui donne ses lignes dès que son effectif
  peut se calculer ;
- **sa fiche** : « Effectif » propose « Comme le service » (« calculé s'il a des
  heures par vol au barème » dans un service de robots, « saisi » ailleurs),
  « Calculé d'après le barème » et « Constant (saisi) » ; calculé,
  « Personnes » se lit (« calculé · homme-minutes ÷ poste ») et l'effectif saisi
  est gardé, il revient au « Constant (saisi) » ;
- **Heures de travail** : un robot calculé montre ses heures par vol, comme
  une équipe à la main ; sans calcul, son débit par commande, comme avant (le
  débit par commande se règle aussi dans sa fiche).

Vérifications :

- `tests/robot-calcule.test.cjs` : 300 min par vol × 4 vols, ⌈1 200 ÷ 420⌉ =
  3 personnes ; 2 vols, 2 ; sans minutes au barème ou à effectif fixe, son
  effectif saisi ; au moins `personnesMin`, sans `robot-arret` ; la durée de la
  ligne inchangée ; sans vol (correction 10), 0 personne et rien d'impossible,
  renforts actifs compris (le robot, l'équipe à la main) ; sa compagnie qui ne
  vole pas ; saisi sous son minimum sans minutes, à l'arrêt comme avant ; la
  relecture des équipes ; la journée part de l'effectif saisi ; le récap en
  heures par vol ; le barème repris du service dont il dépend ne compte pas,
  son barème propre oui, dans un service de robots ; hors d'un service de
  robots, seulement s'il le demande, et sans rien demander le résultat d'avant,
  champ par champ ; les journées enregistrées inchangées ;
- `tests/effectif-calcule.test.cjs`, `tests/seuils-browser.cjs` : un robot
  dans un service du plan de base garde son effectif saisi, comme avant ;
- `tests/robot-calcule-browser.cjs` : le Robot sous le Montage garde son
  effectif saisi et son débit au récap ; 1 h par vol saisie dans Barème, il se
  calcule (au moins son minimum), « calculé » dans sa fiche, ses heures par vol
  au récap, la ligne à la même durée ; « Constant (saisi) » rend ses
  5 personnes ; le classeur du barème lui donne ses lignes ; après
  rechargement, le même calcul ; ses heures par vol retirées, ses
  5 personnes reviennent, dans la journée affichée aussi.

### La charge de chaque équipe, et l'arrondi au service (évolution 11 a)

Le besoin exact d'une équipe calculée (homme-minutes ÷ poste ÷ rendement) n'est
pas un nombre de personnes : arrondi équipe par équipe, puis additionné, il
compte plus de monde qu'un service n'en emploie. La période donne donc, en ETP
et sans arrondi, la **charge** de chaque équipe, puis l'arrondit **une fois,
au service** :

- la **charge** d'une équipe (`charge`, dans chaque équipe de chaque journée et
  dans le détail par équipe du bilan) :
  - une équipe à effectif calculé — à la main, hors tunnel, robot de
    l'évolution 9 — : son besoin exact (`besoin`) ;
  - un robot ou une plonge à effectif saisi : les homme-minutes de ses lots ÷
    les minutes de son poste (pendant un lot, l'équipe du robot ; à la plonge,
    les personnes du tunnel qui lave, ou celles des tunnels qui tournent ; un
    lot que la fin du poste interrompt compte ce qui en a été fait, un vol
    jamais lavé rien) ;
  - toute autre équipe : personnes × sa présence ÷ la présence du réglage
    général (3 personnes 6 h, une présence générale de 8 h : 2,25 ; sans fin de
    poste, ses personnes). De même pour une mise à disposition. Un handling
    dont le plan calcule les chauffeurs (§ 4) a 0 personne : ses chauffeurs
    se lisent dans `chauffeursCamion` et `chauffeursVL`, pas dans sa charge ;
- par service et jour de travail : `charge`, la somme de ses équipes ;
  `personnesService` = ⌈`charge`⌉ ; `surplusArrondi` = `personnes` −
  `personnesService` : ce que coûte l'arrondi équipe par équipe, avec le
  sous-emploi d'un effectif saisi (une plonge de 5 personnes pour 1 ETP de
  travail) ; il est négatif quand des présences dépassent la présence
  générale (un poste de 9 h compte plus d'un ETP) ;
- l'**encadrement** saisi d'un service a sa charge à part,
  `chargeEncadrement` (à la présence du réglage général : ses personnes) ; il
  n'entre ni dans `charge` ni dans `personnesService` ;
- le total du jour, les totaux et les moyennes par mois et sur la période les
  additionnent, comme les autres mesures.

`personnes`, `besoin`, les autres mesures et la simulation ne changent pas :
seuls ces champs s'ajoutent. La page Période les propose dans « Mesure »
(« Charge (ETP) », « Personnes du service (⌈charge⌉) », « Surplus d'arrondi
(pers.) ») et dans le détail par équipe ; le JSON de l'outil les a dans
`bilan` (chaque jour de travail, ses services et ses équipes, les totaux et
les moyennes) ; le classeur de la période les a dans les feuilles Période et
Équipes (`FORMATS_EXCEL.md` § 4).

Vérifications :

- `tests/charge-periode.test.cjs` : 2,3 + 1,4 ETP, 3 + 2 = 5 personnes, 4 au
  service, 1 de surplus ; un robot saisi à 6 personnes, sa ligne 210 minutes
  sur 420 : 3 ETP ; un robot saturé, son lot interrompu compté pour ce qui
  en a été fait ; les plonges (par vol, au débit) : homme-minutes ÷ poste ;
  une équipe constante : ses personnes, 2,25 pour 3 personnes 6 h ; une mise à
  disposition ; l'encadrement à part, chaque jour et dans les totaux ; les
  totaux et les moyennes ; les valeurs du classeur ; la
  non-régression des autres mesures (`tests/periode-bilan.attendu.json`,
  relevé avant ces champs sur les unités fictives) ; le classeur ;
- `tests/periode-browser.cjs` : la vue Période montre, par service et par
  jour, ⌈charge⌉, le surplus et la charge ; le détail, la charge de chaque
  équipe.

### Le réel : import, correspondance, comparaison (évolution 11 b)

La période simulée se compare aux heures réelles, rôle par rôle. Le calcul est
dans `moteur/reel.js`, sans navigateur : la page (Résultats › Période, « Réel
et calage ») et l'outil l'appellent.

**Le fichier « Réel par jour »** (un CSV, ou la feuille « Réel » d'un
classeur ; format dans `FORMATS_EXCEL.md` § 5) : une ligne par jour et par
rôle, ses heures de titulaires et d'intérim, hors heures supp, et ses heures
supp (facultatives). Avec une colonne `service`, le rôle devient « service /
rôle ». Un fichier mal formé (une colonne manquante, une date, des heures ou
un rôle illisibles, un « | » dans un rôle) est **refusé entier**, en nommant la
ligne ; de même un classeur dont les heures sont au format heure d'Excel
(7:30 y arrive en 0,3125 : des heures 24 fois trop petites).

**Rien d'autre ne bloque.** Une anomalie écarte sa seule cellule, avec sa
raison :

- des heures négatives (de titulaires, d'intérim ou supp) : cette catégorie
  de la cellule ;
- un jour × rôle en double : la cellule.

Une cellule écartée entière (en double, ou écartée par vous) fait sortir ce
jour-là de la comparaison des lignes qui ont son rôle : elle ne compte jamais
pour 0 h réelle.

Deux cas se **signalent sans rien écarter** — à vous de décider : une
catégorie à zéro tout un mois, présente les autres mois ; un rôle absent un
jour, présent tous les autres. Vous pouvez réintégrer une cellule écartée (en
double : ses lignes s'additionnent), écarter une cellule ou des jours, et les
rétablir. Ces décisions sont des clés (jour, rôle), sans heures.

**La correspondance** range les rôles en lignes. Chaque ligne a un nom, un ou
plusieurs rôles (leurs ETP s'additionnent ; un rôle n'appartient qu'à une
ligne) et ce qu'elle couvre — une seule chose, qu'aucune autre ligne ne
couvre (son simulé compterait deux fois dans le total de l'unité) :

| Couvre | Le simulé de la ligne, un jour de travail |
|---|---|
| des services | la charge de leurs équipes (évolution 11 a), en ETP |
| l'encadrement saisi d'un service | sa charge d'encadrement (`chargeEncadrement`) |
| les chauffeurs camion ou VL | les chauffeurs du plan du handling |
| hors simulation | 0 |

Un ETP, c'est `heures_titulaires ÷ base des titulaires + heures_interim ÷
base de l'intérim` ; les bases sont de 7 h et 7 h par défaut, et se règlent
pour un rôle. La correspondance s'importe et s'exporte en JSON pour l'outil
(`FORMATS_EXCEL.md` § 5).

**La comparaison** se fait sur les jours de travail **complets** de la
période qui ont du réel (un jour incomplet, ou sans réel, en sort) :

- par ligne et par jour : le réel, le simulé et l'écart (simulé − réel) ; un
  jour où l'une des heures de la ligne est écartée n'y compte pas ;
- par ligne, par mois et sur la période : l'erreur moyenne absolue (MAE), le
  biais (l'écart moyen) et la corrélation (de Pearson) ;
- pour toute l'unité (toutes les lignes, hors simulation comprise) : l'erreur
  et le biais du total de chaque jour, les jours où chaque ligne compte (sans
  ligne, pas de total) ;
- avec la colonne `heures_supp` : par ligne et par mois, les heures supp
  réelles et simulées (celles des services couverts ; des chauffeurs, au
  prorata camion / VL), pour décrire, pas pour caler.

Les rôles sans ligne sont listés, et ne comptent pas.

**L'outil** :

```
node outils/caler-periode.cjs periode.json reel.csv|reel.xlsx correspondance.json [--xlsx calage.xlsx] > calage.json
```

`periode.json` est la sortie de `simuler-periode`, avec ou sans
`--sans-detail`. Le JSON rend `{ calage, comparaison }` ; les cellules
écartées, les cas à vérifier et les rôles sans ligne s'écrivent aussi sur la
sortie d'erreur. `--xlsx` écrit le classeur de la page : Lisez-moi, Réel (le
réel tel que lu, chaque cellule comptée, écartée ou sans ligne), Comparaison.

**Dans la page**, sous le tableau de la période : « Importer le réel »,
« Modèle CSV » (un réel fictif de trois jours et deux rôles), la
correspondance (une ligne depuis un rôle sans ligne, ce qu'elle couvre, les
bases, l'import et l'export en JSON), les anomalies (réintégrer, écarter,
rétablir), puis la comparaison par ligne et par mois (les heures supp de
chaque mois ; jour par jour, le réel, le simulé et l'écart, et « Écarter ce
jour ») et son classeur. Tout se fait au clavier, le focus reste sur le
geste. Les
heures réelles restent en mémoire, le temps de la page ; la sauvegarde (la
partie « calage sur le réel », `ory-calage-v1`, dans « Tout sauvegarder »)
ne garde que la correspondance et les décisions.

Vérifications :

- `tests/reel.test.cjs` : le fichier (heures décimales ou HH:MM, en-têtes
  sans casse ni accents, une seule colonne « heures », le service devant le
  rôle) ; un fichier mal formé refusé, la ligne nommée ; des ETP, des écarts,
  des erreurs, des biais et une corrélation connus ; une base par catégorie
  et par rôle ; une ligne de deux rôles, l'encadrement, les chauffeurs, les
  heures supp ; un jour incomplet écarté, les rôles sans ligne ; chaque
  anomalie écartée ou signalée avec sa raison, réintégrée ou écartée par
  l'utilisateur ; une cellule écartée entière qui fait sortir son jour de la
  ligne, jamais 0 h ; « hors » dans le total de l'unité, pas de total sans
  ligne ; les pièges (heures au format heure d'Excel, « heures » avec
  « heures_interim », un « | ») ; la correspondance (un rôle dans une ligne,
  une chose couverte par une ligne, des services connus, une base partielle,
  un rôle nommé comme une propriété) ; un signal qui s'en va avec son jour ; la
  sauvegarde sans aucune heure ; le modèle CSV ;
- `tests/caler-periode.test.cjs` : l'outil, la même comparaison que le
  module, avec ou sans `--sans-detail`, les décisions de la correspondance,
  un réel en classeur, `--xlsx`, les erreurs ;
- `tests/calage-browser.cjs` : le parcours dans la page avec des fichiers
  fictifs — un nom de rôle en HTML affiché en texte, un refus qui se lit, le
  focus, un jour écarté puis rétabli, « Tout sauvegarder ».
