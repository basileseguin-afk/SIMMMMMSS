# Le modèle par ateliers de travail

Remplace le modèle par postes et files d'attente. Trois objets, et trois
seulement. Le moteur est `moteur/production.js`, testé par
`tests/production.test.cjs`.

---

## 1. La compagnie × classe

L'unité de fabrication. Déduite du programme de vols — et **corrigée à la
main** quand il le faut : `CRL/BC`, `AF/YC`… Une compagnie × classe porte

- le nombre de passagers de la journée, tous vols confondus ;
- la liste de ses vols ;
- son **échéance** : le départ le plus serré, moins le délai de chargement.

Les **retours ne fabriquent rien**. Un avion qui arrive ne crée pas de classe à
produire.

La liste se **retouche** dans l'onglet : on **retire** une classe qu'on ne
fabrique pas, on en **ajoute** une que le programme ne porte pas encore
(compagnie, cabine, passagers, nombre de vols, échéance). Un ajout qui porte
l'identifiant d'une classe du programme la **remplace** — c'est ainsi qu'on
corrige un volume sans toucher au fichier de vols.

Retirer une classe **coupe tous les liens** que les ateliers avaient avec elle :
elle disparaît de chaque lot, et un lot vidé de sa dernière classe disparaît
avec elle. Sans cela les ateliers désigneraient un identifiant inexistant et le
modèle refuserait de tourner. Un retrait pris sur le programme se **rétablit**
d'un clic ; une classe ajoutée puis retirée, elle, est supprimée.

## 2. L'atelier de travail

Une équipe dans un service. Il n'occupe **aucune place dans l'espace** : ce
qu'il faut savoir de lui, c'est ce qu'il fait, quand, et à combien.

| Champ | Sens |
|---|---|
| `nom` | libre — « Prépa CRL BC » |
| `service` | cuisine, prépa montage, dotation, armement, appros… |
| `debut` | **donnée par vous**, au format `HH:MM` |
| `jour` | décalage en jours : `-1` pour la veille, `-2` pour l'avant-veille |
| `personnes` | effectif |
| `lots` | liste **ordonnée** de lots à fabriquer |
| `pauses` | plages d'arrêt — pause de midi, changement d'équipe |

Un **lot** porte une ou plusieurs compagnies × classes. Le premier lot commence
à l'heure de début ; **chacun des suivants démarre quand le précédent est
fini**. C'est ce qui permet à un atelier d'enchaîner CRL/BC puis CRL/PC sans
qu'on ait à calculer la seconde heure soi-même.

Un lot à plusieurs classes les fabrique **ensemble** : elles sortent au même
instant. C'est ainsi qu'on décrit les services **en amont de la séparation par
compagnie** — appros, légumerie, plonge, magasin — sans règle particulière :
un seul lot contenant tout.

### Durée d'un atelier manuel

```
homme-minutes du lot = Σ sur ses classes ( pax × minutes/pax + nb vols × minutes fixes )
durée                = homme-minutes ÷ personnes ÷ rendement
```

Les deux coefficients sont lus dans une **table unique**, par service et par
cabine. Les valeurs en place sont **non calibrées** : elles n'existent que pour
que le modèle tourne, et se remplacent en bloc sans toucher au moteur.

### L'atelier robot

| Champ | Sens |
|---|---|
| `type: 'robot'` | |
| `debit` | plateaux par heure |
| `personnes` / `personnesMin` | sous le minimum, **le robot ne tourne pas** et le dit |
| `debut` | heure d'allumage |
| `pauses` | plages d'arrêt |

```
durée = plateaux ÷ débit
```

Le robot ne consomme pas de barème d'homme-minutes : son temps vient de son
débit. Les pauses ne changent pas la durée du travail, elles **repoussent la
fin** d'autant — et ce temps d'arrêt est compté à part.

### Le poste : pauses et heure de fin

Une équipe ne travaille pas huit heures d'affilée, et elle s'en va à la fin de
son poste que le travail soit fini ou non.

| Règle | Valeur par défaut |
|---|---|
| Pause après 3 h de **travail** | 15 min |
| Pause après 6 h de **travail** | 30 min |
| Présence totale sur le site | 8 h 15 |

Soit **7 h 30 de travail effectif**. Les seuils comptent le travail *cumulé*,
pas l'heure qu'il est : une équipe qui attend ses amonts ne consomme pas son
crédit de travail, donc ne prend pas sa pause.

Un lot que le poste ne peut pas finir est **signalé et laissé inachevé** : sa
fin est vide, sa classe ne sort pas, et les lots suivants ne sont pas commencés.
C'est le résultat le plus utile du modèle — ce qui ne rentre pas dans la
journée. Le régime se désactive atelier par atelier, et la durée de présence se
règle, pour une équipe qui ne suit pas la règle commune.

## 3. La boucle du matériel

Les trolleys, la porcelaine, les couverts ne s'achètent pas : ils reviennent.
Un départ les emporte, un retour les ramène sales, la plonge les rend propres,
un départ les remporte.

> **En théorie il n'y a pas de stock.** Si les retours égalent les départs, tout
> ce qui part vient de revenir. Un excédent de retours se stocke et sert
> d'amortisseur : quand la plonge prend du retard, ou le jour où les retours
> manquent.

Le modèle tient **un compte unique**, en unités par passager. C'est une
simplification assumée : un trolley de CRL et un trolley d'AF ne s'y distinguent
pas.

| Réglage | Sens |
|---|---|
| Unités par passager | ce qu'un passager emporte — **non calibré** |
| Propre à l'ouverture | le stock de départ, souvent nul |
| Délai après atterrissage | minutes avant que le sale soit à la plonge |

Un atelier de type **Lavage** n'a pas de lots : son travail vient des retours, à
mesure qu'ils arrivent, à son **débit en unités par heure**. Il suit le même
régime de poste que les autres — ce qui arrive après la fin de son poste reste
sale.

Un atelier coché **« emporte du matériel propre »** attend, avant chaque lot,
que le compte couvre ce que ses classes emportent. L'attente est mesurée. Un lot
qui n'obtient jamais son matériel **figure au journal sans fin** : sans cette
trace, sa classe paraîtrait fabriquée par ses autres étapes.

Le service est **premier arrivé, premier servi** : sans cela un petit lot
passerait indéfiniment devant un gros.

## 4. Le parcours

Une compagnie × classe n'est pas une ligne mais un **assemblage** : sa part food
vient des appros, son matériel du magasin et des retours de dotation, son
armement de l'armement — et tout cela converge au montage.

Ce parcours **n'est pas inventé par le moteur** : il se lit dans le graphe des
liaisons du **Centre des flux**, celui que vous entretenez déjà. La règle tient
en une phrase :

> Un service ne peut travailler un lot que lorsque **tous ses fournisseurs**
> dans ce graphe ont livré **toutes les classes** de ce lot.

Deux conséquences utiles :

- **Le parcours peut différer d'une classe à l'autre.** Un service qui ne
  fabrique pas une classe donnée n'est pas attendu pour elle. C'est la présence
  de la classe dans un lot qui met le service sur son chemin.
- **L'attente est mesurée, pas dissimulée.** Chaque lot dit combien de temps il
  a attendu ses amonts : c'est ce qui désigne la branche lente.

Un **cycle** dans les liaisons est refusé avant de jouer quoi que ce soit : il
bloquerait la fabrication sans jamais rien dire.

---

## Ce que le modèle ne fait pas — délibérément

- **Il ne choisit pas les heures de début.** Vous décidez ; il calcule les
  conséquences et nomme ce qui ne tient pas.
- **Il ne répartit pas le travail.** Une même classe fabriquée par deux ateliers
  du même service est **signalée**, pas arbitrée : sans règle de répartition,
  trancher serait inventer. Un service, une classe, un atelier.
- **Il n'invente pas de file d'attente** entre ateliers. Il n'y a ni contenance,
  ni blocage amont, ni vivier. Un atelier fait ses lots, dans l'ordre, à son
  effectif. La seule ressource partagée est le matériel propre.
- **Il ne distingue pas les matériels.** Un seul compte pour les trolleys, la
  porcelaine et les couverts, toutes compagnies confondues.

## Ce qu'il rapporte

- par **lot** : début, fin, durée, attente des amonts, temps d'arrêt ;
- par **atelier** : fin, travail cumulé, attente, arrêt ;
- par **compagnie × classe** : fin, échéance, retard, à l'heure ou non, et les
  services traversés ;
- les **classes du programme que personne ne fabrique** — l'oubli le plus facile.

## Limites connues

- Le barème est **non calibré**. Tant qu'il ne l'est pas, aucun chiffre de sortie
  ne permet de dimensionner une équipe.
- Un atelier travaille ses lots **l'un après l'autre**. Une équipe qui mènerait
  deux lots de front se décrit comme deux ateliers.
- Le rendement est un **coefficient unique**. S'il doit varier par service ou par
  heure, c'est une évolution du barème, pas du moteur.
- Les **unités par passager** et le **délai après atterrissage** sont des valeurs
  d'attente, comme le barème.
- La journée est **unique**. Un excédent de matériel « disponible demain » n'est
  pas reporté automatiquement : il se saisit comme stock à l'ouverture.
