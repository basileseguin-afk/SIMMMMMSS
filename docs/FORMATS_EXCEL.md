# Piloter le site depuis Excel — les classeurs

Le site s'échange avec Excel en trois classeurs, un par sujet, plus un petit
classeur des horaires tiré de celui des ateliers :

| Classeur | Où | Ce qu'il porte |
|---|---|---|
| **Ateliers** | Organisation (Chemins, Cases, Qui prépare quoi) › `⇩ Cases et chemins` / `⇧ Importer` | équipes, horaires, fabrications, tunnels, compagnies × classes, parcours, matériel |
| **Horaires** | Équipes › Services et équipes › `⇩ Horaires` / `⇧ Importer` | l'heure et le jour de début de chaque case, seuls |
| **Barème** | Équipes › Plus › Barème par service › `⇩ Temps de travail` / `⇧ Importer` (ou la fiche de chaque service) | heures de travail **par vol** (d'une personne), par service et par compagnie × classe ; rendement, poste |
| **Vols** | Vols › Vols › `⇩ Exporter les vols (Excel)` / fichier à importer | départs et retours |
| **Période** (résultats, version 1) | Résultats › Synthèse › `Exporter les résultats` › « La période, en Excel » ; `node outils/simuler-periode.cjs … --xlsx` | les résultats d'une période simulée, jour par jour ; à lire, pas à réimporter (§ 4) |

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
| Ne travaille que si | équipe qui prépare : `AF ≥ 6 vols` (ou `>=`, `au moins`), `toutes ≥ 300 repas` ; vide = tous les jours. Plonge (version 1, banc d'essai — [`BANC_ESSAI.md`](BANC_ESSAI.md), § 6) : `sale ≥ 1 à 22:00`, elle ne vient que si ce sale attend à cette heure (`sale` seul : 1 u, à son début) ; `retard non absorbé (par Plonge matin)`, elle ne vient que si cette équipe de la plonge ne peut pas absorber le lendemain le retard de la journée (sans parenthèse : la plonge qui commence le plus tôt) |
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
| Postes de travail | équipe qui prépare ou robot (version 1, banc d'essai — [`BANC_ESSAI.md`](BANC_ESSAI.md), § 5) : ses postes de travail ; les renforts ne la portent pas au-delà. Vide = pas de limite. La colonne n'est écrite que si une équipe en a ; sans elle, l'import garde ceux du site |
| Ordre des lots | équipe qui prépare ou robot (version 1, banc d'essai — [`BANC_ESSAI.md`](BANC_ESSAI.md), § 8) : `souple` (un lot prêt n'attend pas un lot en retard) ou `strict` (l'ordre de la liste) ; vide = le réglage général. La colonne n'est écrite que si une équipe a le sien ; sans elle, l'import garde celui du site |

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

**Handling 24 h/24** (version 1, banc d'essai — [`BANC_ESSAI.md`](BANC_ESSAI.md),
§ 3). Quand un handling a des réglages par compagnie pour ses tournées, la
feuille porte cinq colonnes de plus : `Escale (min)` (de l'arrivée de l'avion à
son départ ; vide : pas de déchargement), `Préparation au quai (min)`,
`Déchargement (min)`, `Vidage au quai (min)` — `toutes` pour les compagnies
sans ligne — et `Véhicule` (`VL` : un petit camion ; `camion` : un gros). Sans
ces colonnes, l'import garde les réglages du site ; avec elles, il les
remplace. La case « 24 h/24 » et les réglages des tournées (marge avant le
départ, d'un avion à l'autre, flotte de VL…) n'ont pas de colonne : l'import
les garde tels qu'ils sont sur le site. De même pour le calcul des chauffeurs
au plus juste (`BANC_ESSAI.md`, § 4) : son mode et ses réglages n'ont pas de
colonne, et « Chauffeurs long courrier » / « court courrier » se modifient sans
les perdre.

| Atelier | Compagnie | … | Escale (min) | Préparation au quai (min) | Déchargement (min) | Vidage au quai (min) | Véhicule |
|---|---|---|---|---|---|---|---|
| Handling | toutes | … | 90 | 10 | | 15 | |
| Handling | SUD | … | 45 | | | | VL |

Les tournées par vagues (version 1, banc d'essai, évolution 8 —
[`BANC_ESSAI.md`](BANC_ESSAI.md), § 3) ajoutent leurs colonnes à la feuille,
chacune écrite seulement si un handling a ce réglage :

| Colonne | Sens |
|---|---|
| `VL à partir de` | HH:MM (ou une heure Excel) : les départs de cette compagnie partent en VL à partir de cette heure, en gros camion avant. Propre à une compagnie : refusée sur la ligne `toutes`. `VL` dans `Véhicule` : en VL toute la journée. |
| `Vols par VL` | Comme `Vols par camion`, pour une tournée en VL : les départs de la compagnie qu'elle sert au plus, une vague (1 ou plus ; vide : comme en camion). `toutes` : les compagnies sans ligne. |
| `Quai par vol en plus (min)` | La préparation au quai d'une tournée qui sert plusieurs vols, en plus, par vol de plus (vide : 0). `toutes` : les compagnies sans ligne. |
| `Minutes par vol en VL`, `Déchargement en VL (min)` | Charger, décharger un avion servi en VL (vide : `Minutes par vol` et `Déchargement (min)` de la compagnie). `toutes` : les compagnies sans ligne. |
| `Échange sur l’avion` | `oui` : chaque avion de cette compagnie est déchargé puis chargé dans la même visite, quelle que soit son escale (vide ou `non` : comme avant). Propre à une compagnie : refusée sur la ligne `toutes`. |

Sans la colonne, l'import garde les valeurs du site ; avec elle, il les
remplace (vide : plus de réglage pour cette compagnie).

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

Colonne `Véhicule` (handling 24 h/24, version 1) : `VL` pour des chauffeurs
de petit camion, `camion` (ou vide) pour un gros. Elle n'est écrite que si un
créneau est en VL.

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

`Sale de la veille (u)` (version 1, banc d'essai — [`BANC_ESSAI.md`](BANC_ESSAI.md),
§ 6) : le sale que la journée d'avant n'a pas lavé, en unités ; vide ou 0,
rien. La ligne n'est écrite que pour un nombre : une liste de vols rendue par le
banc reste celle du site.

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

Colonne facultative **`heure_eta`** (feuille « Départs » ou CSV ; version 1,
banc d'essai — [`BANC_ESSAI.md`](BANC_ESSAI.md), § 3) : l'arrivée estimée de
l'avion du départ, en HH:MM. Plus tard que `heure_std` sur l'horloge, elle
désigne la veille. Elle sert au handling 24 h/24 (le déchargement de l'avion) ;
vide, l'arrivée s'estime par l'escale de la compagnie. L'export ne l'écrit que
si un départ en a une, juste après `heure_std`. La version 2 l'ignore.

Colonnes facultatives **`nb_SPML_BC`, `nb_SPML_PC`, `nb_SPML_YC`** (feuilles
ou CSV ; version 1, banc d'essai — [`BANC_ESSAI.md`](BANC_ESSAI.md), § 7) : les
repas spéciaux de chaque cabine. Quand elles sont là et que `nb_SPML` est vide,
`nb_SPML` vaut leur somme ; `nb_SPML` seul se lit comme avant (toutes cabines
confondues). Elles disent quels services préparent les SPML d'un vol (« Repas
spéciaux par cabine », dans les Réglages de la simulation). L'export ne les
écrit que si un vol a ce détail, après `nb_SPML`. La version 2 les ignore.

Colonne facultative **`date`** (feuilles « Départs » et « Retours », feuille
unique avec `sens`, ou CSV ; version 1, banc d'essai, évolution 10 —
[`BANC_ESSAI.md`](BANC_ESSAI.md), § 9) : le jour du vol, celui de son
`heure_std` pour un départ, de son `heure_sta` pour un retour. Elle s'écrit
`AAAA-MM-JJ`, `JJ/MM/AAAA` (`JJ/MM/AA` : 20AA) ou en date Excel, comme dans le
classeur de calage de la version 2. `heure_eta` garde sa règle : plus tard que
`heure_std` sur l'horloge, c'est la veille du jour du départ. Remplie, le
programme est **daté** : chaque vol a sa date, et la période va de son premier à
son dernier jour ; une ligne sans date parmi des lignes datées, ou une date
illisible (`31/02/2026`), et rien n'est importé — le message nomme la ligne (et
la feuille). Le même vol (même `vol_id`, même sens) revient d'un jour à l'autre
; le même jour, c'est un doublon. Vide partout, ou absente : une seule journée,
comme avant. L'export l'écrit en **première colonne**, en vraie date Excel,
quand le programme est daté ; exporté puis réimporté, le programme est le même.
Le rapport d'import décrit la période : premier et dernier jour, nombre de
jours, vols par jour, et chaque jour sans aucun vol au milieu (« aucun vol le
15/08 : jour sans vol ou oubli ? »), sans bloquer. La version 2 l'ignore.

### En CSV

Une seule table, avec une colonne `sens` (`DEP` ou `RET`) :

```csv
vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML
DEMO001,DEMO,A320,DEP,12:00,,0,0,100,4,3
DEMO-RET001,DEMO,A320,RET,,08:00,0,0,100,4,0
```

Daté (« Modèle CSV daté », deux jours fictifs) :

```csv
date,vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML
2026-11-02,DEMO001,DEMO,A320,DEP,12:00,,0,0,100,4,3
2026-11-02,DEMO-RET001,DEMO,A320,RET,,08:00,0,0,100,4,0
2026-11-03,DEMO001,DEMO,A320,DEP,12:00,,0,0,90,4,2
2026-11-03,DEMO-RET001,DEMO,A320,RET,,08:00,0,0,100,4,0
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

## 4. Le classeur d'une période (résultats, version 1)

Banc d'essai, évolution 10 (`BANC_ESSAI.md`, § 9). Quand une période a été
simulée et qu'elle est à jour, **« Exporter les résultats »** propose « La
période, en Excel » (la journée affichée reste en JSON) ; la page Période a
aussi son bouton. `node outils/simuler-periode.cjs sauvegarde.json
vols-dates.csv --xlsx periode.xlsx` écrit **le même classeur**, par le même
code (`echanges.js`, `periodeVersClasseur`). Il se lit, il ne se réimporte pas.

Toutes les feuilles de données ont une ligne d'en-tête figée, **des filtres**,
et leurs premières colonnes figées. Les jours et les heures sont de **vraies
dates Excel** (`jj/mm/aaaa`, `jj/mm/aaaa hh:mm`) : une heure de la veille d'une
journée de vols porte la date de la veille (la cuisine à J−1 qui commence à
20:00 : le 30/10 à 20:00 pour les vols du 31/10). Les durées sont en
minutes ; « Heures sup » en minutes × personnes.

| Feuille | Une ligne par | Colonnes |
|---|---|---|
| **Lisez-moi** | — | la période (premier et dernier jour, jours sans vol, jours de travail incomplets), la sauvegarde et le programme de vols, les réglages (délai de chargement, décalage, options de l'outil), la date du calcul, les définitions, l'avertissement de prototype |
| **Période** | jour de travail × service, plus « Toute l'unité » ; puis, chaque mois et sur la période, le total et la moyenne par jour | `Ligne` (jour, total du mois, moyenne par jour du mois, total de la période, moyenne par jour de la période), `Jour de travail`, `Jour`, `Mois`, `Complet`, `Vols manquants`, `Jours complets`, `Service`, puis les mesures du bilan : `Personnes`, `Besoin exact (pers.)`, `Charge (ETP)`, `Personnes du service`, `Surplus d’arrondi`, `Homme-minutes`, `Heures sup (min × pers.)`, `Renforts prêtés (min)`, `Renforts reçus (min)`, `Lots`, `Lots en retard`, `Commandes en retard`, `Retard max (min)`, `Vols chargés`, `Vols en retard`, `Chauffeurs camion`, `Chauffeurs VL`, `Borne basse chauffeurs`, `Heures sup chauffeurs (min)`, `Vols lavés`, `Encadrement`, `Charge de l’encadrement (ETP)`. Avec une politique d'effectif (un calage gardé, évolution 11 d) : chaque jour de travail a aussi une rangée « Ligne : … » par ligne de la correspondance et une rangée « Toute l'unité (prévu calé) », et la feuille quatre colonnes de plus, `Simulé de la ligne (ETP)`, `Prévu calé (ETP)`, `P10 (ETP)`, `P90 (ETP)` ; sans politique, la feuille d'avant. Avec des heures sup d'office (évolution 11 e, une présence au contrat dépassée), deux mesures de plus, après `Heures sup (min × pers.)` et après `Charge de l’encadrement (ETP)` : `Heures sup d’office (min × pers.)` et `Heures sup d’office de l’encadrement (min × pers.)` ; et la feuille Équipes une colonne `Heures sup d’office (min × pers.)` après `Heures sup (min × pers.)`. Sans elles, les colonnes d'avant |
| **Équipes** | jour de travail × équipe | `Jour de travail`, `Journée de vols`, `Jour complet`, `Service`, `Équipe`, `Type`, `Effectif` (calculé ou saisi), `Personnes`, `Homme-minutes`, `Besoin exact (pers.)`, `Charge (ETP)`, `Début de poste`, `Fin de présence`, `Fin du travail`, `Travail (min)`, `Attente (min)`, `Pauses (min)`, `Heures sup (min × pers.)`, `Renforts prêtés (min)`, `Renforts reçus (min)`, `Lots`, `Lots en retard`, `Commandes en retard`, `Retard max (min)` |
| **Compagnies** | jour de travail × service × compagnie | `Jour de travail`, `Jour complet`, `Service`, `Compagnie`, `Commandes`, `Vols`, `Passagers`, `Homme-minutes`, `Retard max (min)` |
| **Lots** | lot de chaque journée de vols | `Journée de vols`, `Jour de travail`, `Service`, `Équipe`, `Commande`, `Début`, `Fin`, `Durée (min)`, `Attente (min)`, `Homme-minutes`, `Échéance`, `Marge (min)` (l'échéance moins la fin ; négative : en retard) |
| **Vols** | vol de chaque journée, avec son chargement | `Journée de vols`, `Vol`, `Compagnie`, `Équipe`, `Départ`, `Commandes prêtes`, `Arrivée de l’avion`, `Début du déchargement`, `Fin du déchargement`, `Début du chargement`, `Fin du chargement`, `Véhicule`, `Tournée`, `Limite`, `Retard (min)`, `À l’heure`, `Cause` |
| **Plonge** | vol lavé | `Journée de vols`, `Vol`, `Compagnie`, `Arrivée du sale`, `Équipe`, `Tunnel`, `Début`, `Fin`, `Attente (min)` |
| **Jours** | journée de vols | `Journée de vols`, `Jour`, `Départs`, `Retours`, `Calcul abouti`, `Anomalies`, `Commandes`, `Commandes à l’heure`, `Commandes en retard`, `Commandes pas finies`, `Retard max (min)`, `Vols suivis`, `Vols chargés`, `Vols à l’heure`, `Retard vol max (min)`, `Homme-minutes`, `Sale de la veille (u)`, `Sale restant le soir (u)`, `Stock propre initial (u)`, `Stock propre le soir (u)`, `Plonge de nuit`, `Chauffeurs camion`, `Chauffeurs VL`, `Borne basse chauffeurs`, `Heures sup chauffeurs (min)` |

- **Journée de vols** : le jour des vols. **Jour de travail** : le jour où
  l'équipe travaille, le jour des vols + son jour. Un jour de travail
  **incomplet** (une de ses journées de vols manque) est montré, `Complet` =
  `non`, et sort des totaux et des moyennes.
- Totaux et moyennes sur les jours complets : la moyenne est le total ÷ les
  jours complets ; pour `Retard max`, le total est le plus haut et la moyenne
  celle des retards max de chaque jour.
- **L'arrondi au service** (banc d'essai, évolution 11 a — `BANC_ESSAI.md`
  § 10) : `Charge (ETP)` est la charge d'une équipe, non arrondie (le besoin
  exact d'une équipe calculée ; pour un robot ou une plonge à effectif saisi,
  les homme-minutes de ses lots ÷ son poste ; sinon personnes × sa présence ÷
  la présence générale) et, pour un service, la somme de ses équipes ;
  `Personnes du service` = ⌈charge⌉ ; `Surplus d’arrondi` = `Personnes` −
  `Personnes du service` (l'arrondi équipe par équipe, avec le sous-emploi
  d'un effectif saisi ; négatif quand des présences dépassent la présence
  générale) ; `Charge de l’encadrement (ETP)` : l'encadrement saisi, à la
  présence générale, à part.
- Les nombres sont arrondis au centième. L'archive n'est pas compressée :
  deux mois fictifs de 50 vols par jour font environ 6 Mo ; un programme
  réel, davantage (surtout la feuille Lots).

## 5. Le calage sur le réel (version 1)

Banc d'essai, évolution 11 (`BANC_ESSAI.md`, § 10). Ces fichiers contiennent
des **données réelles** : ils ne vont jamais dans le dépôt. Dans la page, le
réel reste en mémoire, le temps de la page.

### Le fichier « Réel par jour »

Un CSV (séparateur `;`, `,` ou tabulation), ou la feuille **« Réel »** d'un
classeur (la seule feuille d'un CSV). Une ligne par jour et par rôle. Les
en-têtes ne tiennent compte ni de la casse ni des accents.

| Colonne | Obligatoire | Contenu |
|---|---|---|
| `date` | oui | comme le programme daté : `AAAA-MM-JJ`, `JJ/MM/AAAA` ou une date Excel |
| `role` | oui | le rôle tel que l'unité le nomme (160 caractères au plus) |
| `heures_titulaires` | oui | les heures des titulaires ce jour-là, **hors heures supp** (vide, avec l'intérim rempli : 0) |
| `heures_interim` | oui | les heures des intérimaires, hors heures supp (vide, avec les titulaires remplies : 0) |
| `heures_supp` | non | les heures supp du rôle ce jour-là (vide : inconnues) |
| `service` | non | présent, le rôle devient « service / rôle » |

- Les heures : un nombre décimal (`7,5`, `7.5`) ou `HH:MM` (`7:30`,
  `350:30`). Une case à 0 est un vrai zéro. **Une case vide n'est pas un
  zéro** (correction 13), sauf pour l'une des deux catégories de présence :
  - `heures_supp` vide : les heures supp de la cellule sont inconnues ; ce
    jour-là sort de la comparaison des heures supp de sa ligne (par mois, le
    nombre de jours comptés le dit). Ses ETP restent ;
  - `heures_titulaires` et `heures_interim` vides toutes les deux (ou
    `heures` vide, dans un fichier à une seule colonne) : la cellule n'a pas
    de réel, comme une ligne absente, avec la raison « heures vides » ;
  - une seule des deux vide, l'autre remplie : la vide vaut 0 (un export
    laisse souvent l'intérim vide quand il n'y en a pas) ;
  - les heures supp d'une ligne aux heures vides ne comptent pas non plus
    (la raison le dit).

  Dans un classeur, écrivez-les en nombre
  ou en texte : une cellule au **format heure** d'Excel arrive en fraction de
  jour (7:30 → 0,3125), et un fichier dont toutes les heures sont ainsi est
  refusé.
- Une seule colonne `heures` (sans `heures_titulaires` ni `heures_interim`)
  se lit comme des heures de titulaires, sans intérim.
- Un rôle ne contient pas le caractère `|`.
- Une colonne manquante, une date, un rôle ou des heures illisibles :
  **le fichier entier est refusé**, en nommant la ligne. Des heures
  négatives, un jour × rôle en double : la cellule est écartée, avec sa
  raison, et le reste se lit.
- **Une cellule absente n'est pas un zéro** (correction 12) : un rôle sans
  ligne un jour, ou dont la cellule est écartée, n'a pas de réel ce jour-là ;
  le jour sort des lignes de la correspondance qui ont ce rôle, avec sa
  raison, et du total de l'unité. Une ligne présente à 0 h compte 0 ; une
  ligne aux heures vides n'a pas de réel (correction 13). Un
  rôle d'une ligne de la correspondance absent de tout le fichier se signale
  (la ligne n'a alors aucun jour).
- « Modèle CSV » (page Période, « Réel et calage ») en donne un exemple
  fictif : trois jours, deux rôles.

### La correspondance (JSON)

Ce que la page exporte, et ce que l'outil `caler-periode` lit :

```json
{ "bases": { "defaut": { "titulaires": 7, "interim": 7 }, "<rôle>": { "titulaires": 10, "interim": 7 } },
  "lignes": [ { "nom": "…", "roles": ["<rôle>", "…"], "services": ["<id>", "…"] },
              { "nom": "…", "roles": ["…"], "encadrement": "<id de service>" },
              { "nom": "…", "roles": ["…"], "chauffeurs": "camion" },
              { "nom": "…", "roles": ["…"], "hors": true } ],
  "decisions": { "ecartes": { "jours": ["AAAA-MM-JJ"], "cellules": ["AAAA-MM-JJ|<rôle>"] }, "reintegres": ["AAAA-MM-JJ|<rôle>"] } }
```

- `bases` : les heures d'un ETP, de titulaire et d'intérimaire (de plus de 0
  à 24 h) ; `defaut` vaut pour tous les rôles sans base propre (7 h et 7 h
  sans elle) ; une base de rôle partielle prend le reste de `defaut`.
- `lignes` : un nom unique, des rôles (un rôle n'appartient qu'à une ligne),
  et **une seule** chose couverte : `services` (des identifiants de service),
  `encadrement` (un identifiant), `chauffeurs` (`camion` ou `vl`) ou
  `hors: true`. Un service inconnu est refusé, nommé ; un service, un
  encadrement ou des chauffeurs couverts par deux lignes aussi.
- `decisions` (facultatif) : les jours et les cellules écartés par
  l'utilisateur, les cellules réintégrées (`|titulaires`, `|interim` ou
  `|supp` pour des heures négatives). Des clés, aucune heure.

### Le planning (le rejeu à effectif imposé)

Banc d'essai, évolution 11 (f). Un CSV (séparateur `;`, `,` ou tabulation),
ou la feuille **« Planning »** d'un classeur (la seule feuille d'un CSV), comme
le planning du calage de la version 2 (`CALAGE.md`). Une ligne par jour des
vols et par équipe. Les en-têtes, les services et les équipes ne tiennent
compte ni de la casse ni des accents ; un service ou une équipe se
reconnaissent aussi à leur identifiant. Un service ou une équipe inconnus, un
nom qui désigne deux équipes du service, une heure, des personnes ou un
jour illisibles, une équipe deux fois le même jour : le fichier est refusé
entier, et le message nomme la ligne. Le planning reste en mémoire, le temps
de la page.

| Colonne | Obligatoire | Contenu |
|---|---|---|
| `date` | oui | le jour des vols que l'équipe prépare : `AAAA-MM-JJ`, `JJ/MM/AAAA` ou une date Excel |
| `service` | oui | le service, par son nom (ou son identifiant) |
| `equipe` | oui | l'équipe, par son nom dans ce service |
| `debut`, `fin` | oui | sa vacation, `HH:MM` ; une fin avant le début passe minuit |
| `personnes` | oui | ses personnes ce jour-là, un entier de 0 à 999 |
| `jour` | non | vide : le jour de l'équipe dans la sauvegarde ; 0 : le jour des vols ; −1 : la veille (−3 au plus) ; +1 : le lendemain (une plonge) |

Un jour qui a des lignes se rejoue avec elles : chaque équipe nommée prend
son début, sa présence (fin − début) et ses personnes, à effectif imposé (une
équipe constante le reste) ; une
équipe d'un service qui a des lignes ce jour-là, mais pas elle, ne travaille
pas ; un service sans ligne garde ses équipes ; les heures sup vont jusqu'à
12 h. Un jour sans ligne se joue comme aujourd'hui. « Modèle de planning »,
dans la page, donne un planning fictif de deux jours.

### Le classeur du calage

`node outils/caler-periode.cjs … --xlsx calage.xlsx`, ou « Exporter la
comparaison (Excel) » dans la page : le même classeur
(`echanges-calage.js`).

| Feuille | Une ligne par | Colonnes |
|---|---|---|
| **Lisez-moi** | — | la période, les fichiers, la date du calcul, les bases, les jours comparés et écartés, les rôles sans ligne, les anomalies, les définitions |
| **Réel** | jour × rôle | `Date`, `Rôle`, `Heures titulaires`, `Heures intérim`, `Heures supp`, `Base titulaires`, `Base intérim`, `ETP`, `Ligne`, `État` (compté, sans ligne, jour de travail incomplet, hors période, heures écartées, écartée : la raison ; jour sans réel pour sa ligne : la raison, correction 12) |
| **Comparaison** | ligne × jour, puis ses mois et la période ; toute l'unité ; les heures supp par mois ; les jours sans réel de chaque ligne et ceux retirés du total de l'unité (correction 12 ; avec eux, une colonne `Raison`) ; avec un rejeu (f), les heures supp de chaque jour et de la période, les lots en retard, les nuits de plonge ouvertes | `Ligne`, `Couvre`, `Niveau` (jour, mois, période, heures supp du mois, jour sans réel, jour retiré du total ; « rejeu : heures supp du jour », « rejeu : heures supp, période », « rejeu : lots en retard », « rejeu : nuits de plonge ouvertes »), `Jour`, `Mois`, `Unité` (ETP ou h), `Réel`, `Simulé`, `Écart`, `Jours`, `Erreur`, `Biais`, `Corrélation` |
| **Calage** (quand il est fait) | ligne : le modèle retenu, puis chaque référence et chaque candidat (« b + a × » aussi quand il se confond avec « × a ») ; puis l'erreur de chaque découpage, une rangée par modèle et par semaine ou mois laissé de côté ; le calage du travail (f), une rangée « calage du travail » par ligne de services (`a` : le facteur, `a min` et `a max` : sa plage d'une semaine laissée de côté à l'autre ; `Erreur par semaine` : l'erreur des heures supp, en heures par jour ; les règles 1 à 4) ; toute l'unité avant et après (avec une validation par mois, aussi « après (modèles retenus), validation par semaines ») | `Ligne`, `Couvre`, `Rang` (retenu, référence, candidat, pas de calage ; « référence, une semaine laissée de côté », « candidat, un mois laissé de côté »…), `Modèle`, `Accepté`, `a`, `a min`, `a max`, `b`, `b min`, `b max`, `Constante`, `Constante min`, `Constante max` (sur tous les jours ; min et max sur les découpages, semaines et mois), `Facteurs du jour (lun. → dim.)` (et leur plage), `Erreur par semaine (ETP)`, `Erreur par mois (ETP)`, une colonne par règle (`Plus juste que les références`, `Stable`, `Bornes`, `Wilcoxon`, `Placebo` : le verdict et sa raison), `σ (ETP)`, `Bande P10–P90 (± ETP)`, `Jours`, `Validation`, `Laissé de côté` (la semaine ISO ou le mois d'une rangée de découpage) |

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

Une compagnie n'a pas d'armement quand aucun de ses chemins ne passe par le
service et qu'aucune équipe ne l'a cochée : pas de case, le handling charge
ses vols sans l'attendre (08/10). Rien à écrire pour le dire : une colonne
« Armée » (un classeur du 08/10 au matin) est ignorée.

Dans « Fabrications », la case d'une compagnie s'écrit `AF/@ARM` (le code du
service, tel qu'exporté). Sans la feuille, le réglage du site reste.
