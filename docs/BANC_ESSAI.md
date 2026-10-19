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
| `heuresSup` | Ses heures supplémentaires, en minutes **par personne** (§ 2) ; 0 sans l'option |
| `tournees`, `conducteurs`, `heuresSupChauffeurs`, `vehiculesMax` | Un handling 24 h/24 : ses tournées, ses chauffeurs et leurs heures sup, ses véhicules (§ 3) |

Les noms `debutPoste` et `presence` sont ceux de la version 2, dans le même
sens, pour une fusion future.

Les vols lus par l'outil (et par la page) portent aussi `eta`, l'arrivée
estimée de l'avion d'un départ, quand le programme a une colonne `heure_eta`
(§ 3).

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

### Vérifications

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
- **Qui en fait** :
  - une équipe à la main et un **robot** : elle finit ses lots ; le robot
    garde sa ligne, l'équipe suivante attend qu'elle se libère ;
  - la **plonge** : les tunnels continuent, mais seulement pour **ce qui
    l'attendait** à la fin de sa présence. Par vol : un vol revenu avant la fin
    de sa présence peut finir en heures sup ; un vol revenu après va à
    l'équipe suivante. Entre deux tunnels qui le rendent propre à la même
    heure, celui d'une équipe encore dans ses heures passe d'abord (comme en
    version 2). Au débit : le sale revenu avant la fin de la présence, pas
    celui qui revient après ; une plonge qui n'a plus rien à laver s'en va ;
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
| `vl` | Les compagnies servies en petit camion (VL) ; les autres vont en gros camion | aucune |
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
départs (l'échéance d'un vol est sa limite ; la cause d'un retard).

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
`tests/non-regression.test.cjs` (réglé mais décoché : la même journée).
