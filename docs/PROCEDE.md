# Décrire un procédé en données

> **Retiré le 23 septembre 2026.** `moteur/procede.js` et son exemple ont été supprimés avec l'ancien moteur. Ce guide reste pour mémoire : le procédé se décrit désormais atelier par atelier (voir [la note de modèle](MODELE_ATELIERS.md)).

Le procédé n'est plus codé en dur : c'est un fichier JSON qu'on relit, qu'on
discute et qu'on corrige sans toucher au moteur. La forme est inspirée de
[ProdSim](https://github.com/FuchsTom/ProdSim) (MIT) — voir
[l'étude](ETUDE_OPEN_SOURCE.md).

> 🔒 **`moteur/procede-exemple.json` est fictif et publiable.** Le procédé réel
> de l'unité se travaille dans `prive/`, que `.gitignore` bloque. Par sécurité,
> `.gitignore` refuse aussi tout `moteur/procede-*.json` autre que l'exemple.

## Squelette

```json
{
  "nom": "…",
  "horizon": 240,
  "graine": 20260918,
  "postes":   [ … ],
  "produits": [ … ]
}
```

`horizon` est la durée simulée, `graine` fixe les tirages : **à graine égale,
deux exécutions donnent exactement le même résultat.** Sans cela, comparer deux
scénarios ne voudrait rien dire, l'écart pouvant venir du hasard.

## Postes

```json
{ "nom": "dressage", "capacite": 1, "tampon": 36 }
```

| Champ | Sens |
|---|---|
| `nom` | identifiant, unique |
| `capacite` | nombre entier de **places** : opérateurs, machines, tunnels. Défaut 1 |
| `tampon` | contenance de la file d'entrée. **Absent = illimitée** |

`tampon` est le champ qui crée le blocage amont : quand il est plein, le poste
précédent ne peut pas déposer, donc ne peut pas libérer sa place.

## Produits

```json
{
  "nom": "plateau",
  "priorite": 0,
  "stock": 300,
  "source": { "loi": ["f", 0.6], "fin": 200 },

  "poste":      ["prepa_froide",   "dressage",      "controle"],
  "operation":  [["n", 0.9, 0.15], ["n", 4.5, 0.5], ["f", 0.35]],
  "quantite":   [1,                6,               12],
  "composants": [[{ "produit": "barquette", "quantite": 1 }], [], []]
}
```

**Les quatre listes de la gamme ont la même longueur : une case par étape.**
C'est l'invariant du format, vérifié au chargement, et c'est lui qui rend une
gamme lisible d'un coup d'œil.

| Liste | Une case = |
|---|---|
| `poste` | où se fait l'étape |
| `operation` | la durée, sous forme de loi |
| `quantite` | la taille du lot traité ensemble. Défaut 1 |
| `composants` | ce qui est consommé à cette étape. Défaut : rien |

Autres champs :

| Champ | Sens |
|---|---|
| `priorite` | plus petit passe d'abord dans la file des postes. Mettre l'échéance d'un vol donne la priorité au plus urgent |
| `stock` | contenance du stock de sortie du produit. Défaut : illimitée |
| `source` | comment les unités entrent dans le système |

**Un produit que personne ne consomme est un produit fini** : il quitte le
système au bout de sa gamme, et son temps de traversée est mesuré. Un produit
consommé comme composant alimente son stock, où les autres viennent le prendre.

### Écart assumé par rapport à ProdSim

ProdSim surcharge un unique champ `demand`, tantôt taille de lot, tantôt
quantités de composants, selon qu'on y met un nombre ou une liste. Ici les deux
sont séparés : `quantite` est la taille du lot, `composants` la nomenclature.
Une liste nommée vaut mieux qu'une position à deviner.

## Sources

Deux formes, exclusives l'une de l'autre.

**Arrivées régulières** — `loi` donne l'intervalle entre deux arrivées :

```json
{ "loi": ["e", 0.4], "debut": 0, "fin": 200, "quantite": 1, "max": 500 }
```

**Calendrier** — des instants explicites. C'est la forme que prendra le
programme de vols :

```json
{ "calendrier": [ { "instant": 0, "quantite": 200 }, { "instant": 90, "quantite": 200 } ] }
```

L'ordre du fichier n'a pas d'importance : le calendrier est trié au chargement.

## Lois

| Écriture | Loi |
|---|---|
| `["f", x]` | valeur fixe |
| `["u", min, max]` | uniforme |
| `["n", moyenne, ecart]` | normale |
| `["e", moyenne]` | exponentielle |

Les durées ne peuvent pas être négatives : un tirage normal négatif est rejoué
jusqu'à vingt fois puis ramené à zéro. Quand l'écart-type dépasse la moitié de
la moyenne, la validation **avertit** que la moyenne réelle s'en trouve
légèrement relevée, au lieu de laisser passer le biais en silence.

## Validation

Le fichier est contrôlé au chargement et **toutes les anomalies sont
rassemblées**, comme pour l'import CSV : on corrige un procédé en une passe,
pas en autant de passes qu'il contient de fautes.

Contrôles en place : noms uniques ; postes et composants référencés existants ;
listes de gamme de même longueur ; lois bien formées ; capacités et
contenances entières et positives ; aucun produit ne se consomme lui-même ;
tout composant est produit par quelque chose ; aucun produit sans gamme ni
source. Et un contrôle qui évite un blocage certain :

> **un lot ne peut pas être plus grand que le tampon du poste** — les unités
> s'y accumuleraient sans jamais atteindre le compte.

## Utilisation

```js
const procede = MoteurProcede.chargerProcede(texteJSON);
const resultats = procede.simuler({ horizon: 240, graine: 7 });
```

`resultats` contient, **tout en grandeurs mesurées** :

- `postes[]` — taux d'occupation, file moyenne, attente moyenne et p90, et
  l'état du tampon d'entrée dont `partBloquante` ;
- `produits[]` — créés, terminés, en stock, traversée moyenne et p90 ;
- `goulot` — le poste le plus contraint, avec sa cause : places occupées ou
  tampon saturé. **Aucun seuil choisi à la main**, aucune heuristique.

## Exemple fourni

`moteur/procede-exemple.json` décrit une chaîne de dressage fictive de quatre
postes et trois produits. Sur 240 minutes simulées :

| Poste | Places | Occupation | Tampon moyen | Bloque l'amont |
|---|---:|---:|---:|---:|
| decontamination | 2 | 10,9 % | 1,8 / 40 | 0 % |
| prepa_froide | 2 | 82,2 % | 7,4 / 60 | 0 % |
| **dressage** | 1 | **98,2 %** | 26,9 / 36 | **20,5 %** |
| controle | 1 | 3,8 % | 3,0 / 24 | 0 % |

312 plateaux terminés, temps de traversée moyen **31,5 minutes** pour un
produit dont les opérations totalisent environ 5,8 minutes. Le reste est de
l'attente — et c'est précisément ce qu'on cherche à voir.

Le 82,2 % de `prepa_froide` mérite d'être lu correctement : ce poste ne
travaille pas 82 % du temps, il **tient sa place** 82 % du temps, dont une
partie à attendre que le tampon du dressage se libère. C'est le blocage amont,
et c'est ce que le moteur actuel de `sim.js` ne sait pas produire.

## Limite connue

Une place est prise **avant** les unités et les composants : un opérateur
occupe son poste pendant qu'il rassemble son lot, ce qui est fidèle à la
réalité d'un poste tenu. Conséquence : si un composant vient à manquer
durablement, les places concernées restent immobilisées. C'est le comportement
de ProdSim, et c'est voulu — mais un procédé mal approvisionné se bloquera au
lieu de ralentir. Le contrôle « lot plus grand que le tampon » couvre le cas le
plus fréquent ; les ruptures de composants se lisent dans `partEnRupture`.
