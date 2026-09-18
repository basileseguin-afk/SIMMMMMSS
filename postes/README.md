# 🧰 Éditeur de postes de travail

Outil **indépendant** pour dessiner des modèles de postes vus de dessus, sur une
trame de **50 × 50 cm**. Il prépare la finalité du projet : composer le plan de
l'unité à partir de carreaux de 50 cm.

Ouvrir `postes/index.html` dans un navigateur. Aucune dépendance, aucun serveur.

> Cet outil ne touche pas au simulateur (`sim.js`, `index.html` à la racine).
> Il produit pour l'instant une **bibliothèque de modèles**, pas une
> implantation dans l'unité.

## Cinq familles de modèles

Deux natures de géométrie coexistent, et c'est voulu :

- **sur la trame** (table, chaîne, ligne robot) — formes libres en carreaux ;
- **en centimètres** (desserte, trolley) — rectangle libre posé par-dessus la
  trame. Une desserte de **70 cm** ne tombe pas sur un carreau de 50 : la
  forcer fausserait l'encombrement.

| Famille | Géométrie | Personnes | Particularités |
|---|---|---|---|
| 🪵 **Table** | trame, forme libre | bords libres | — |
| 🏭 **Chaîne** | trame, forme libre | bords libres | sens, débit (u/h) |
| 🤖 **Ligne robot** | trame, droite | bords libres | **modules** en série, sens, débit par module |
| 🛒 **Desserte roulante** | cm (défaut 70 × 50) | 4 côtés | capacité, roulettes |
| 🧳 **Trolley** | cm (défaut 80 × 45) | — | capacité, roulettes |

Une **ligne robot** est une chaîne découpée en **modules** mis bout à bout.
Chaque module a son nom, sa longueur et son débit. Le **débit de la ligne est
le minimum des modules** — une ligne va à la vitesse de son maillon le plus
lent — et le **module limitant** est nommé dans les mesures.

> Les dimensions par défaut des stockages (70 × 50, 80 × 45) sont **indicatives
> et à corriger**. Elles ne viennent pas d'un relevé.

## Assemblages

L'onglet **Assemblages** compose plusieurs modèles sur un même plan : par
exemple la Table 1 avec la Table 2 et une desserte, sous un nom à vous
(« Îlot montage A »).

- **Ajouter au plan** pose un modèle ; il se place à droite des précédents.
- **Glisser** pour déplacer, au **quart de mètre**.
- **⟳ Pivoter** ou la touche **R** : 0° / 90° / 180° / 270°. Les carreaux, les
  personnes et le sens d'avancement pivotent ensemble.
- **Suppr** retire l'élément sélectionné.
- Les mesures cumulent éléments, personnes, surface et débit.

Un assemblage **référence** les modèles : modifier une table met à jour tous
les assemblages qui l'utilisent.

## Utilisation

1. **+ Table** ou **+ Chaîne** crée un modèle.
2. **Longueur / largeur** en carreaux donne un rectangle de départ.
3. Outils **➕ / ➖ Carreaux** : ajouter ou retirer des carreaux un par un, pour
   obtenir des formes **en L, en U, des îlots** — c'est le « sur mesure ».
4. Outil **👤 Personnes** : cliquer un bord libre du meuble y place une
   personne tournée vers le plan de travail ; recliquer la retire.
5. Pour une chaîne, régler le **sens** (chevrons sur le tapis) et le **débit**.
   Pour une ligne robot, ajouter/retirer des **modules** et régler leur
   longueur et leur débit.

Les outils ➕/➖ Carreaux ne s'appliquent pas à une ligne robot : sa forme
découle de ses modules.

Les mesures se recalculent en direct : encombrement, carreaux occupés, surface
de travail, emprise au sol, personnes, surface par personne, et pour une chaîne
le débit par personne.

La bibliothèque est **sauvegardée dans le navigateur**. **Exporter** produit un
JSON partageable ; **Importer** le relit (fichier refusé en bloc s'il est
invalide, bibliothèque inchangée).

## Format d'échange

```json
{
  "format": "ory-postes", "version": 1, "carreauCm": 50,
  "modeles": [{
    "id": "table_...", "type": "table", "nom": "Table 1",
    "cells": ["0,0", "1,0", "0,1"],
    "postes": [{ "x": 0, "y": 0, "cote": "N" }],
    "hauteurCm": 90, "sens": "E", "debit": 0
  }, {
    "id": "robot_...", "type": "robot", "nom": "Ligne robot 1", "largeur": 2, "sens": "E",
    "modules": [{ "nom": "M1", "long": 4, "debit": 520 }],
    "cells": ["0,0"], "postes": []
  }, {
    "id": "desserte_...", "type": "desserte", "nom": "Desserte roulante 1",
    "dimCm": { "l": 70, "p": 50 }, "capacite": 6, "roulettes": true,
    "postes": [{ "cote": "S" }]
  }],
  "assemblages": [{
    "id": "asm_...", "nom": "Îlot montage A",
    "elements": [{ "id": "el_...", "refId": "table_...", "x": 1, "y": 1, "rot": 90 }]
  }]
}
```

- `cells` : carreaux occupés, en coordonnées `"x,y"` (1 carreau = 50 cm).
- `postes` : une personne par entrée, posée sur le côté `N`/`S`/`E`/`O` du
  carreau indiqué. Un poste n'existe que sur un **bord libre**.
- `carreauCm` : taille du carreau du fichier ; un écart est signalé à l'import.
- `dimCm` : pour les stockages, dimensions réelles en centimètres (hors trame).
- `modules` : pour une ligne robot ; `cells` en découle et est recalculé.
- `assemblages[].elements[]` : `refId` désigne un modèle, `x`/`y` sont en
  carreaux (pas de 0,5) et `rot` vaut 0, 90, 180 ou 270.

## Limites

- Les **débits sont des hypothèses saisies à la main**, pas des cadences
  mesurées sur le site.
- Un modèle décrit une **géométrie et une affectation**. Rien n'est relié au
  moteur de simulation, ni aux standards de travail.
- Pas encore d'implantation : les assemblages ne sont pas posés sur le plan de
  l'unité. C'est l'étape suivante.
- Pas de détection de collision entre éléments d'un assemblage.
- Thème clair uniquement.
