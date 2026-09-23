# Piloter le site depuis Excel — les trois classeurs

Le site s'échange avec Excel en trois classeurs, un par sujet :

| Classeur | Où | Ce qu'il porte |
|---|---|---|
| **Ateliers** | étape 2, « Qui prépare quoi » › `⇩ Excel` / `⇧ Importer` | équipes, fabrications, tunnels, compagnies × classes, parcours, matériel |
| **Barème** | étape 3, « Les temps de travail » › `⇩ Excel` / `⇧ Importer` | homme-minutes **par vol**, par service et par compagnie × classe ; rendement, poste |
| **Vols** | étape 1, « Les vols » › `⇩ Exporter (Excel)` / fichier à importer | départs et retours |

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

| Colonne | Sens |
|---|---|
| Atelier | nom, unique |
| Service | nom ou identifiant du service |
| Type | `manuel`, `robot`, `plonge` ou `mise à disposition` |
| Début | heure d'arrivée de l'équipe, `HH:MM` |
| Jour | `0` le jour du départ, `-1` la veille… jusqu'à `-7` |
| Personnes | effectif (vide pour une mise à disposition) |
| Pauses | `10:00-10:15; 12:00-12:30` |
| Poste réglementaire | `oui` : pauses de régime et durée de présence s'appliquent |
| Présence (min) | vide = celle du réglage général |
| Emporte du matériel | `oui` si l'atelier consomme du matériel propre |
| Débit robot (plateaux/h) | robot seulement |
| Effectif mini robot | robot seulement |
| Plafond plonge (u/h) | plonge seulement ; vide = aucun plafond |
| Permanent | mise à disposition seulement : `oui` = toujours servie |
| Identifiant | facultatif ; garde la trace de l'atelier d'un import à l'autre |

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

### Feuille « Tunnels »

Les tunnels d'une plonge : `Atelier`, `Tunnel`, `Débit (u/h)`, `Personnes`,
`Actif`.

### Feuille « Classes »

Les compagnies × classes : `Compagnie`, `Classe`, `Parcours`, `Retirée`, puis
trois colonnes (info).

- `Parcours` vide : la classe suit le parcours de sa classe (feuille suivante).
- `Retirée` = `oui` : elle n'est plus à fabriquer. Une classe retirée mais encore
  fabriquée dans « Fabrications » est refusée : c'est une contradiction.
- Une ligne absente du programme de vols est une compagnie × classe **ajoutée**.

### Feuille « Parcours »

Une ligne par **branche**.

| Parcours | Branche | Étapes |
|---|---|---|
| Complet | Agro | `RÉCEPTION / APPROS > LÉGUMERIE > CUISINE > MONTAGE` |
| Complet | Matériel | `PLONGE > DOTATION > MONTAGE` |
| Complet | Magasin | `MAGASIN > MONTAGE` |
| Sans cuisine | Matériel | `PLONGE > DOTATION > MONTAGE` |

Les étapes se séparent par `>` (ou `→`). Les branches d'un même parcours partent
en parallèle et **se rejoignent** aux services qu'elles partagent.

### Feuille « Parcours par classe »

Le parcours par défaut de `BC`, `PC`, `YC`, `CREW` et `SPML`.

### Feuille « Matériel »

`Boucle du matériel active`, `Stock propre à l'ouverture`, `Délai après
atterrissage (min)`, et `Unités par vol` pour chaque classe.

### Feuille absente, partie conservée

Seule « Ateliers » est obligatoire. **Une feuille absente laisse la partie
correspondante telle qu'elle est sur le site** : on peut n'envoyer que
« Ateliers » et « Fabrications ».

---

## 2. Le classeur du barème

### Feuille « Barème »

| Service | Compagnie | Classe | Minutes par vol | Vols au programme (info) | Valeur appliquée (info) |
|---|---|---|---|---|---|
| CUISINE | `*` | BC | 35 | | |
| CUISINE | AF | BC | *(vide)* | 4 | 35 |
| CUISINE | CRL | BC | 42 | 1 | 42 |

- **Minutes par vol** : les homme-minutes que coûte **un vol** de cette compagnie
  dans cette classe, dans ce service. La journée de la classe vaut ces minutes
  fois son nombre de vols. **Le nombre de passagers n'y entre pas.**
- **Compagnie `*`** : la valeur commune à toutes les compagnies qui n'en ont pas
  de propre.
- **Minutes vides** : pas de valeur propre, la valeur commune s'applique. La
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

---

## Confidentialité

Les classeurs exportés contiennent **les données réelles de l'unité** dès qu'elle
est saisie. Le dépôt est public : `.gitignore` refuse les `*.xlsx`, `*.xls`,
`*.xlsm` et `vols*.csv`. Travaillez-les dans `prive/`.
