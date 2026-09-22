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

## 3. Le parcours

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
- **Il n'invente pas de file d'attente.** Il n'y a ni contenance, ni blocage
  amont, ni vivier. Un atelier fait ses lots, dans l'ordre, à son effectif.

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
