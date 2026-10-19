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
options des évolutions suivantes s'ajoutent à ce tableau.

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

Les noms `debutPoste` et `presence` sont ceux de la version 2, dans le même
sens, pour une fusion future.

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
    viennent à leurs créneaux (les heures sup des chauffeurs viennent avec les
    tournées, § 3 et 4) ;
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
