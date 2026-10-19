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
| `planChauffeurs` | Un handling 24 h/24 aux chauffeurs calculés : son plan de vacations, sa borne basse (§ 4) |
| `renfortsPretes`, `renfortsRecus` | Avec les renforts (§ 5) : les minutes-personne que l'équipe a prêtées à d'autres, et reçues d'autres |
| `renfortsHeuresSup` | Avec les renforts : les minutes-personne que ses personnes ont passées en renfort après la fin de leur présence |
| `renforts` | Avec les renforts : `vers` (à qui elle a prêté) et `de` (qui l'a aidée), chacun `{ id, nom, minutes }` |

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

- **Qui peut aider qui** : `polyvalence`, rangée avec les cases
  (`ory-ateliers-v1`) — pour un service, la liste des services qu'il peut
  aider. Elle se règle sous la règle, une ligne par service qui a une équipe
  qui prépare. Une liste saisie **remplace** le défaut (son propre service n'y
  est que s'il est coché ; une liste vide : il n'aide personne) ; « Revenir au
  défaut » l'efface. Sans liste (défaut provisoire), un service aide **son
  service et ses annexes** (les zones « annexe » du plan rattachées à lui ;
  une annexe aide aussi son service), et seulement des équipes **à la main**.
  Une liste saisie autorise toutes les équipes des services cochés, robots et
  handling 24 h/24 compris.
- **Les postes de travail** d'une équipe à la main ou d'un robot :
  `personnesMax`, facultatif, dans sa fiche (le champ s'y montre quand les
  renforts sont actifs, ou quand il est saisi). Ses personnes et ses renforts
  ensemble ne le dépassent pas ; sans lui, pas de limite.

Exemple de matrice (services fictifs) — le montage, la prépa et l'annexe du
robot s'entraident ; la cuisine et la cuisine chaude ; la dotation et les
roulés couverts :

```json
{ "polyvalence": {
    "montage": ["montage", "prepa", "robot"], "prepa": ["prepa", "montage", "robot"], "robot": ["robot", "montage", "prepa"],
    "cuisine": ["cuisine", "chaude"], "chaude": ["chaude", "cuisine"],
    "dotation": ["dotation", "roules"], "roules": ["roules", "dotation"] } }
```

### Les règles

- **Qui prête** : une équipe à la main (pas une équipe sans minutes par vol)
  ou un robot qui a **fini tous ses lots** avant la fin de sa présence (moins
  le délai). Une équipe qui attend un lot en amont n'a pas fini : elle ne
  prête personne. Chacune de ses personnes devient un renfort, de l'heure où
  l'équipe a fini à la fin de sa présence (plus le plafond des heures sup avec
  `versHeuresSup`). Ni une plonge, ni une mise à disposition, ni une équipe
  d'appui, ni le handling ne prêtent.
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
handling ; le déterminisme ; la validation ; les options du banc ; Excel) ;
`tests/renforts-browser.cjs` (le réglage, la matrice, les postes de travail, la
Synthèse, l'enregistrement) ; `tests/non-regression.test.cjs` (réglés mais
désactivés, matrice et postes saisis : la même journée).
