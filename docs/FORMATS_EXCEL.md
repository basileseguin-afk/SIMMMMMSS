# Piloter le site depuis Excel — les classeurs

Le site s'échange avec Excel en trois classeurs, un par sujet, plus un petit
classeur des horaires tiré de celui des ateliers :

| Classeur | Où | Ce qu'il porte |
|---|---|---|
| **Ateliers** | Organisation (Chemins, Cases, Qui prépare quoi) › `⇩ Cases et chemins` / `⇧ Importer` | équipes, horaires, fabrications, tunnels, compagnies × classes, parcours, matériel |
| **Horaires** | Équipes › Services et équipes › `⇩ Horaires` / `⇧ Importer` | l'heure et le jour de début de chaque case, seuls |
| **Barème** | Équipes › Plus › Barème par service › `⇩ Temps de travail` / `⇧ Importer` (ou la fiche de chaque service) | heures de travail **par vol** (d'une personne), par service et par compagnie × classe ; rendement, poste |
| **Vols** | Vols › Vols › `⇩ Exporter les vols (Excel)` / fichier à importer | départs et retours |

Pour convertir des exports Winrest dans ces formats avec Claude, voir
[`CONVERTISSEURS.md`](CONVERTISSEURS.md) (deux prompts prêts à l'emploi : vols et man-hours).

**Le plus simple est toujours le même geste : exporter, modifier dans Excel,
réimporter.** Chaque classeur porte une feuille « Lisez-moi » qui redit ses
règles.

## Règles communes

- **Un service** s'écrit par son **nom sur le plan** (`MONTAGE`,
  `RÉCEPTION / APPROS`) ou par son **identifiant** (`prepa`, `appros`). La casse
  et les accents ne comptent pas.
- **Une compagnie × classe** s'écrit `AF/BC`. Classes : `BC`, `PC`, `YC`,
  `CREW` (équipage), `SPML` (repas spéciaux).
- **Une heure** s'écrit `HH:MM`. Une heure saisie dans Excel, qui la range en
  fraction de jour, est comprise aussi.
- **Un nombre décimal** peut s'écrire avec une virgule : `12,5`.
- **Le travail s'écrit en heures** (depuis le 08/10) : heures décimales de
  travail d'une personne, `0,25` pour un quart d'heure, `1,5` pour une heure et
  demie. Les classeurs exportés les donnent au dix-millième d'heure : les
  réimporter tels quels ne change rien. Un classeur d'avant, en minutes (colonne
  « Minutes par vol », feuilles « Man-minutes » et « Man-minutes par vol »), se
  relit toujours, en minutes. Les **durées** (handling, plonge par vol, pauses,
  présence) restent en minutes.
- **Oui / non** : `oui`, `non`, `x`, `vrai`, `faux`, `1`, `0`.
- Une colonne marquée **« (info) »** est donnée pour lire : elle est ignorée à
  l'import.
- Les **en-têtes** se lisent sans tenir compte de la casse ni des accents. Les
  lignes vides sont ignorées.
- **Un import refusé ne change rien.** Il dit, en une fois, toutes les lignes à
  corriger, avec le nom de la feuille et le numéro de ligne tel qu'Excel l'affiche.
- **Un import réussi est annulable** (bouton `↶`).
- Le format `.xlsx` est lu et écrit. Un `.xls` (Excel 97-2003) doit être
  réenregistré en `.xlsx`. Le barème et les vols acceptent aussi le **CSV**.

---

## 1. Le classeur des ateliers

### Feuille « Ateliers » — obligatoire

Une ligne par équipe. **Le nom est la clé** : les autres feuilles s'y réfèrent.
Un nom n'est unique que dans son service (depuis le 08/10 : l'équipe « CRL » de
la Dotation et celle de la Cuisine). Quand deux services ont une équipe de même
nom, sa clé est **« nom · SERVICE »** (`CRL · DOTATION`), partout dans le
classeur ; l'import la relit, et un nom seul ambigu est signalé avec la clé à
écrire.

| Colonne | Sens |
|---|---|
| Atelier | nom (unique dans son service), ou « nom · SERVICE » s'il est en double |
| Service | nom ou identifiant du service |
| Type | `manuel`, `robot`, `plonge`, `mise à disposition` ou `handling` |
| Personnes | effectif (vide pour une mise à disposition) |
| Pauses | `10:00-10:15; 12:00-12:30` |
| Poste réglementaire | `oui` : pauses de régime et durée de présence s'appliquent |
| Présence (min) | vide = celle du réglage général |
| Emporte du matériel | `oui` si l'atelier consomme du matériel propre |
| Ligne robot | robot seulement : `partagée` (défaut, une ligne pour tous les robots du service) ou `propre` (un second robot) |
| Arrêts de la ligne | robot seulement : `12:15-13:00; …`, chaque jour, pour toute la ligne |
| À la chaîne avec | équipe qui prépare seulement : le service de l'étape d'avant qu'elle fait aussi, pour ses commandes (ex. `PRÉPA` dans une case de Montage) ; vide = chacune sa case |
| Ne travaille que si | équipe qui prépare : `AF ≥ 6 vols` (ou `>=`, `au moins`), `toutes ≥ 300 repas` ; vide = tous les jours |
| Sinon, commandes à | avec la colonne précédente : le nom d'une autre équipe du même service, qui reprend ses commandes les jours sans |
| Sinon, personnes à | le nom de l'équipe qui reçoit ses personnes ; vide = celle qui reprend ses commandes ; `aucune` = ses personnes ne viennent pas, l'autre équipe absorbe la charge |
| Débit robot (plateaux/h) | robot seulement |
| Effectif mini robot | robot seulement |
| Plafond plonge (u/h) | plonge seulement ; vide = aucun plafond |
| Permanent | mise à disposition seulement : `oui` = toujours servie |
| Identifiant | facultatif ; garde la trace de l'atelier d'un import à l'autre |
| Vols en même temps | handling seulement : combien de vols il prépare à la fois (1 par défaut) |
| Pas avant départ (h) | handling seulement : il ne commence pas un vol plus tôt (3 h par défaut) |
| Compagnies chargées | handling seulement : `toutes`, ou `AF, TX` |
| Vagues | mise à disposition non permanente : `J-1 14:00; J 04:00` ; vide = celles du site. Elle prime sur « Horaires », qui ne donne que la première. Ouverte comme une boutique (Permanent = oui) : `ouvert 07:00-18:00` |

### Feuille « Fabrications »

Ce que fait chaque atelier, **dans l'ordre**. Une ligne par lot.

| Atelier | Ordre | Compagnies × classes |
|---|---|---|
| Cuisine matin | 1 | `AF/BC` |
| Cuisine matin | 2 | `DL/BC + DL/PC` |

- Plusieurs classes dans un même lot se séparent par `+` : elles sortent ensemble.
- **Ajouter une compagnie × classe à un atelier, c'est ajouter une ligne.** Si
  elle n'est pas au programme de vols, elle est déclarée d'office, et l'import
  le dit ; ses volumes viendront du prochain import des vols.
- Les lots sont rangés par `Ordre` ; un `1,5` se glisse entre `1` et `2`.

### Feuille « Heures propres »

Les heures de travail qu'une case fixe pour une commande, **pour toute sa
journée** (tous ses vols), **à la place du barème**, pour elle seule. Une ligne
par valeur fixée ; une commande absente reprend le barème.

| Atelier | Compagnie × classe | Heures de travail |
|---|---|---|
| Cuisine TX BC/PC | `TX/BC` | 1,5 |

Feuille absente : les valeurs du site restent. L'ancienne feuille « Man-minutes »
(colonne « Man-minutes », en minutes) se relit toujours.

### Feuille « Tunnels »

Les tunnels d'une plonge : `Atelier`, `Tunnel`, `Débit (u/h)`, `Personnes`,
`Actif`.

### Le fichier des heures de travail (Équipes › Heures de travail)

Un fichier de **paramétrage** du barème, pour les grosses modifications :
« ⇩ Heures de travail », modifier dans Excel, « ⇧ Importer ».

- **Heures par vol** : `Compagnie`, `Classe`, `Vols (info)`, puis une
  colonne par service (son nom). Chaque case : les heures de travail d'un vol de
  cette commande dans ce service, pour une personne. Égale à la valeur « Toutes
  compagnies » de sa classe, ou vide : elle la suit ; une autre valeur devient
  propre à la compagnie. Un fichier d'avant (feuille « Man-minutes par vol », en
  minutes) se relit toujours.
- **Toutes compagnies** : `Classe`, puis une colonne par service : la valeur
  commune de chaque classe, en heures par vol (en minutes dans un fichier
  d'avant). Vide : aucune.
- **Personnes** : `Case`, `Service (info)`, `Commandes (info)`, `Personnes` :
  l'effectif de chaque case qui prépare ces commandes. Le nom de la case est la
  clé. Une case partagée n'a qu'une ligne : son effectif vaut pour toutes ses
  commandes.
- Seuls les services présents en colonne changent. Les heures fixées dans
  une case d'équipe ne sont pas dans ce fichier (classeur des cases, feuille
  « Heures propres »).

### Le fichier des cases (Équipes › Horaires des équipes)

Une feuille **Cases**, une ligne par case : `Case` (la clé), `Service (info)`,
`Type (info)`, `Jour` (`J`, `J-1`…), `Départ` (HH:MM), `Personnes`,
`Commandes, dans l’ordre`, `Vagues`, `Fin prévue (info)`.

- `Commandes, dans l’ordre` : `TX/BC → TX/PC + AF/PC` — TX BC d'abord, puis
  TX PC et AF PC **ensemble**. Seules les équipes et les robots en ont. Une
  commande écrite dans deux cases du même service va à celle où elle est
  nouvelle ; nouvelle dans les deux, c'est une erreur.
- `Vagues` : pour une mise à disposition, `ouvert 07:00-18:00` (ouverte chaque jour, comme une boutique ; « ouverte de 7h à 18h » se lit aussi), `J-1 14:00; J 04:00` (à heures fixes), ou `permanente` (toujours ouverte).
- Le handling reste au jour `J`.

### Feuille « Débits robot » (classeur des cases)

Le débit d'une compagnie × classe sur un robot : `Atelier`, `Compagnie × classe`,
`Débit (plateaux/h)`. Absente : le débit du robot (colonne « Débit robot » de la
feuille Ateliers). Dans le fichier des man-minutes, la feuille **Robot** dit la
même chose (`Case`, `Compagnie` — `toutes` pour le débit du robot —, `Classe`,
`Débit (plateaux/h)`).

### Feuille « Handling »

Les durées d'un handling, une ligne par compagnie : `Atelier`, `Compagnie`,
`Minutes par vol`. `toutes` : la durée des compagnies sans ligne. Une durée, pas
des man-minutes : l'effectif ne la raccourcit pas. Un handling n'a pas de ligne
dans « Fabrications » : il charge des vols, pas des commandes.

| Atelier | Compagnie | Minutes par vol |
|---|---|---|
| Handling | toutes | 30 |
| Handling | AF | 45 |

Feuille absente : les durées du site restent. Le handling travaille le jour J
des vols : dans « Horaires », son jour est `J` ; un `J-1` est refusé.

Colonnes `Aller (min)` (du quai à l'avion) et `Retour (min)` (de l'avion à
l'unité) : le trajet du camion, autour de `Minutes par vol` (charger l'avion).
Colonne `Vols par camion` : propre à une compagnie (ligne `toutes` : celui de
toutes). Feuille Ateliers : `Vols par camion` (celui de toutes, 1 en général)
et `Camions disponibles` (vide : pas de limite).

Colonne `Courrier` (`long` ou `court`) : une compagnie long courrier prend
« Chauffeurs long courrier » chauffeurs par vol (2 par défaut), une court
courrier « Chauffeurs court courrier » (1) — deux colonnes de la feuille
Ateliers. Une compagnie long courrier sans durée propre a une ligne, minutes
vides.

### Feuille « Chauffeurs »

Les créneaux de chauffeurs d'un handling, le jour J : `Atelier`, `Début`,
`Fin`, `Chauffeurs`. Deux créneaux qui se chevauchent s'additionnent ; un
créneau qui finit avant son début passe minuit. Un vol attend d'avoir ses
chauffeurs libres ; sans créneau, le handling charge « Vols en même temps »
vols à la fois (feuille Ateliers). Feuille absente : les créneaux du site restent.

| Atelier | Début | Fin | Chauffeurs |
|---|---|---|---|
| Handling | 03:00 | 11:00 | 6 |
| Handling | 11:00 | 20:00 | 3 |

### Feuille « Plonge par vol »

Une plonge dont la colonne `Plonge par vol` vaut `oui` (feuille Ateliers) lave
les vols qui reviennent, un par tunnel qui tourne, dans l'ordre des retours.
Une ligne par compagnie : `Atelier`, `Compagnie`, `Minutes par vol` — le temps
qu'un tunnel normal met à laver un de ses vols ; `toutes` pour les autres.
Feuille Tunnels, colonne `Vitesse (×)` : combien de fois plus vite qu'un
tunnel normal (2 : deux fois plus vite ; 1 ou vide : normal).

### Feuille « Classes »

Les compagnies × classes : `Compagnie`, `Classe`, `Parcours`, `Retirée`, puis
trois colonnes (info).

- `Parcours` vide : la classe suit le parcours de sa classe (feuille suivante).
- `Retirée` = `oui` : elle n'est plus à fabriquer. Une classe retirée mais encore
  fabriquée dans « Fabrications » est refusée : c'est une contradiction.
- Une ligne absente du programme de vols est une compagnie × classe **ajoutée**.

### Feuille « Parcours »

Un parcours est un **diagramme de nœuds** : une ligne par **lien**, « De » livre
« Vers ».

| Parcours | De | Vers |
|---|---|---|
| Complet | RÉCEPTION / APPROS | LÉGUMERIE |
| Complet | LÉGUMERIE | CUISINE |
| Complet | CUISINE | PRÉPA |
| Complet | PRÉPA | MONTAGE |
| Complet | PLONGE | DOTATION |
| Complet | DOTATION | MONTAGE |
| Complet | MAGASIN | MONTAGE |

Un service qui reçoit plusieurs liens (ici le montage) attend qu'ils aient tous
livré. Une ligne dont la colonne « Vers » est vide pose un service dans le
parcours sans le relier encore. Un service ne se livre pas lui-même.

L'ancienne écriture est encore lue : colonnes `Branche` et `Étapes`, les étapes
séparées par `>` (ou `→`), par exemple `PLONGE > DOTATION > MONTAGE`. Elle est
convertie en liens à l'import.

### Feuille « Parcours par classe »

Le parcours par défaut de `BC`, `PC`, `YC`, `CREW` et `SPML`.

Les heures de début ne sont plus dans cette feuille mais dans « Horaires ».
Un ancien classeur qui porte encore les colonnes `Début` et `Jour` ici est lu
comme avant.

### Feuille « Horaires »

Une ligne par atelier, **dans l'ordre de la journée**. Seules `Atelier`,
`Jour` et `Début` sont lues.

| Colonne | Sens |
|---|---|
| Atelier | nom de l'atelier (la clé : ne pas le changer ici) |
| Jour | `J` le jour du départ des vols, `J-1` la veille, `J-2`… jusqu'à `J-7` (`0`, `-1` sont lus aussi). **Plonge** : le jour se compte depuis l'arrivée des retours — `J-1`, `J` ou `J+1` (le lendemain) ; `J+1` est refusé pour toute autre équipe |
| Début | heure d'arrivée de l'équipe, `HH:MM`, de `00:00` à `23:59` |
| Service (info), Personnes (info), Fin prévue (info), Prépare (info) | pour se repérer ; la fin prévue est celle de la journée calculée à l'export |

Un atelier sans ligne garde son heure du site ; un atelier nouveau, créé dans
« Ateliers » sans ligne ici, commence à `06:00`, jour `J`. Une heure au-delà
de `23:59` est refusée : on écrit l'heure du jour et on change la colonne Jour.

### Le petit classeur des horaires (`⇩ Horaires`)

La feuille « Horaires » seule, avec son « Lisez-moi ». C'est le fichier à
ouvrir pour **décaler des équipes** : changer les heures dans Excel, puis
`⇧ Importer`. Le site reconnaît un classeur sans feuille « Ateliers » et **ne
change que les heures** : cases, commandes, chemins et réglages ne bougent
pas. Il demande confirmation en nommant les cases décalées, recalcule la
journée, et l'import est annulable. Un atelier inconnu, un horaire en double,
un jour ou une heure illisible : l'import est refusé en entier.

### Feuille « Matériel »

`Boucle du matériel active`, `Stock propre à l'ouverture`, `Délai après
atterrissage (min)`, `Retours à la plonge` (`programme`, `J+1` ou `planche` ; « J+2 » ou « lendemain » sont lus J+1)
et `Unités par vol` pour chaque classe. La planche elle-même a son fichier
(ci-dessous).

### Feuille absente, partie conservée

Seule « Ateliers » est obligatoire. **Une feuille absente laisse la partie
correspondante telle qu'elle est sur le site** : on peut n'envoyer que
« Ateliers » et « Fabrications ».

---

## 2. Le classeur du barème

### Feuille « Barème »

| Service | Compagnie | Classe | Heures par vol | Vols au programme (info) | Valeur appliquée (info) |
|---|---|---|---|---|---|
| CUISINE | `*` | BC | 0,5833 | | |
| CUISINE | AF | BC | *(vide)* | 4 | 0,5833 |
| CUISINE | CRL | BC | 0,7 | 1 | 0,7 |

- **Heures par vol** : les heures de travail que coûte **un vol** de cette
  compagnie dans cette classe, dans ce service, pour une personne (0,7 h =
  42 min). La journée de la classe vaut ces heures fois son nombre de vols.
  **Le nombre de passagers n'y entre pas.** Un classeur d'avant, avec une
  colonne « Minutes par vol », se relit toujours, en minutes.
- **Compagnie `*`** : la valeur commune à toutes les compagnies qui n'en ont pas
  de propre.
- **Heures vides** : pas de valeur propre, la valeur commune s'applique. La
  colonne « Valeur appliquée (info) » dit laquelle.
- L'export propose une ligne par compagnie × classe **et par service de son
  parcours** : exactement ce qu'une étude de temps doit renseigner.
- **L'import remplace le barème entier.**
- Un service qui reçoit au moins une valeur propre à une compagnie passe, sur le
  site, en **saisie par compagnie × classe** (une grille) ; les autres restent
  en saisie par classe. Le classeur, lui, a toujours la même forme.

### Feuille « Réglages » — facultative

`Rendement`, `Présence (min)`, et les pauses de régime :
`Pause 1 — après (min de travail)`, `Pause 1 — durée (min)`, etc.

### En CSV

Une seule table, mêmes colonnes que la feuille « Barème ».

---

## 3. Le classeur des vols

### Feuilles « Départs » et « Retours »

| vol_id | compagnie | type_avion | heure_std | nb_BC | nb_PC | nb_YC | nb_CREW | nb_SPML |
|---|---|---|---|---|---|---|---|---|
| AF1080 | AF | A320 | 06:40 | 12 | 0 | 150 | 5 | 6 |

La feuille « Retours » porte `heure_sta` (arrivée) au lieu de `heure_std`.
`type_avion`, `nb_CREW` et `nb_SPML` sont facultatifs. Un vol retour ramène du
matériel à laver ; seuls les départs créent des compagnies × classes à fabriquer.

### En CSV

Une seule table, avec une colonne `sens` (`DEP` ou `RET`) :

```csv
vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML
DEMO001,DEMO,A320,DEP,12:00,,0,0,100,4,3
DEMO-RET001,DEMO,A320,RET,,08:00,0,0,100,4,0
```

**L'import remplace le programme entier** et efface les scénarios A/B capturés.

### La planche retour (Vols › Planche retour)

Feuille « Planche retour » (ou « Planche », « Retours », sinon la première) :

| Vol | Compagnie | Arrivée à l’unité | Jour | BC | PC | YC | CREW | SPML |
|---|---|---|---|---|---|---|---|---|
| AF1080 | AF | 09:30 | J-1 | | | 150 | | |

- `Arrivée à l’unité` (ou `Arrivée`, `Heure`, `STA`) : HH:MM ou heure Excel.
  Le matériel est à la plonge à cette heure, **sans délai ajouté**.
- `Jour` : `J` le jour simulé, `J-1` la veille (vide : J).
- Classes : facultatives ; vides, le vol ramène les classes que sa compagnie
  emporte au départ.
- Un vol ou une compagnie par ligne au moins. Une erreur refuse le fichier en
  entier ; l'import remplace la planche et s'annule.
- La simulation ne la lit que si « Retours à la plonge » vaut `planche`
  (Simulation › Réglages de la simulation).

---

## Confidentialité

Les classeurs exportés contiennent **les données réelles de l'unité** dès qu'elle
est saisie. Le dépôt est public : `.gitignore` refuse les `*.xlsx`, `*.xls`,
`*.xlsm` et `vols*.csv`. Travaillez-les dans `prive/`.

### Feuille « Par compagnie » (classeur des ateliers)

Un service qui travaille par compagnie (l'armement : une case par compagnie,
pour chaque vol que le handling charge). Ses heures par vol.

| Colonne | Sens |
|---|---|
| Service | le nom du service |
| Compagnie | `toutes` (la valeur par défaut) ou une compagnie |
| Heures par vol | le travail d'un vol de cette compagnie, pour une personne (une ancienne colonne « Minutes par vol » se relit en minutes) |
| Armée | `non` : la compagnie n'a pas d'armement — pas de case, le handling charge ses vols sans l'attendre (08/10). Vide ou `oui` : armée |

Dans « Fabrications », la case d'une compagnie s'écrit `AF/@ARM` (le code du
service, tel qu'exporté). Sans la feuille, le réglage du site reste.
