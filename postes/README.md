# 🧰 Éditeur de postes de travail

Outil **indépendant** pour dessiner des modèles de postes vus de dessus, sur une
trame de **50 × 50 cm**. Il prépare la finalité du projet : composer le plan de
l'unité à partir de carreaux de 50 cm.

Ouvrir `postes/index.html` dans un navigateur. Aucune dépendance, aucun serveur.

> Cet outil ne touche pas au simulateur (`sim.js`, `index.html` à la racine).
> Il produit pour l'instant une **bibliothèque de modèles**, pas une
> implantation dans l'unité.

## Deux familles de modèles

| | Table (établi) | Chaîne (tapis roulant) |
|---|---|---|
| Forme | libre, sur la trame | libre, sur la trame |
| Personnes | sur les bords libres | sur les bords libres |
| Sens d'avancement | — | ↑ ↓ ← → |
| Débit | — | unités/heure |

## Utilisation

1. **+ Table** ou **+ Chaîne** crée un modèle.
2. **Longueur / largeur** en carreaux donne un rectangle de départ.
3. Outils **➕ / ➖ Carreaux** : ajouter ou retirer des carreaux un par un, pour
   obtenir des formes **en L, en U, des îlots** — c'est le « sur mesure ».
4. Outil **👤 Personnes** : cliquer un bord libre du meuble y place une
   personne tournée vers le plan de travail ; recliquer la retire.
5. Pour une chaîne, régler le **sens** (chevrons sur le tapis) et le **débit**.

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
  }]
}
```

- `cells` : carreaux occupés, en coordonnées `"x,y"` (1 carreau = 50 cm).
- `postes` : une personne par entrée, posée sur le côté `N`/`S`/`E`/`O` du
  carreau indiqué. Un poste n'existe que sur un **bord libre**.
- `carreauCm` : taille du carreau du fichier ; un écart est signalé à l'import.

## Limites

- Les **débits sont des hypothèses saisies à la main**, pas des cadences
  mesurées sur le site.
- Un modèle décrit une **géométrie et une affectation**. Rien n'est relié au
  moteur de simulation, ni aux standards de travail.
- Pas encore d'implantation : les modèles ne sont pas posés sur le plan de
  l'unité. C'est l'étape suivante.
