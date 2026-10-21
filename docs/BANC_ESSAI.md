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

### Vérifications

- `tests/commandes-sans-vol.test.cjs` : une journée sans aucun vol d'une
  compagnie dont une équipe prépare `XX/CREW` se joue, et les autres commandes
  de l'équipe sont faites ; une commande mal écrite est toujours refusée ; une
  compagnie jamais vue est signalée sans bloquer ; une commande ajoutée,
  l'armement, l'outil ;
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
| `camions`, `camionsVL` | La flotte de gros camions, de VL (0 ou vide : sans limite) | sans limite |
| `creneaux[].type` | `vl` : des chauffeurs de VL ; sinon, de gros camion | gros camion |

Repris tels quels : `durees` (charger un avion), `allers`, `retours`,
`volsParCamion` et `volsCamion`, `longs`, `chauffeurs.long` et
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

1. la préparation au quai (`quaiDepart`), si elle charge quelque chose ;
2. l'aller (`allers`) ;
3. un ou plusieurs chargements (`durees` ; jusqu'à `volsParCamion` vols de la
   même compagnie, déjà prêts), d'un avion à l'autre en `entreAvions` ;
4. le déplacement vers un avion arrivé (`entreAvions`) et son déchargement
   (`dechargement`), jusqu'à `dechargementsParTournee` avions ;
5. le retour (`retours`, celui du dernier avion servi) ;
6. le vidage du sale au quai (`quaiRetour`), s'il y en a à bord.

Elle peut aussi seulement charger, ou seulement décharger : elle part alors à
vide, sans préparation au quai.

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
journée) ou « VL à partir de », avec son heure.

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
chauffeurs et le plan de chaque véhicule, la validation, Excel, les options du
banc, la fiche).

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
   - *Les enchaînements* : les déchargements, le plus pressé d'abord, se
     donnent chacun au chargement compatible — même véhicule, et des fenêtres
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
finit en heures sup. Le plan compte un vol par chargement : il ne regroupe pas
plusieurs vols dans un camion (`volsParCamion`).

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
la reprise en créneaux) ; `tests/non-regression.test.cjs` (réglé sans le
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
