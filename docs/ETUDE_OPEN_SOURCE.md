# Étude : moteurs de simulation industrielle open source

> **Note du 23 septembre 2026.** Les étapes 2 à 4 décrites ici (`ressources.js`, `mesure.js`, `procede.js`, `orly.js`) ont été **retirées** : seul le noyau (`moteur/noyau.js`) a été conservé, sous le modèle par ateliers (`moteur/production.js`). L'étude reste valable pour le choix du noyau.

**Objet.** Identifier, lire et évaluer le meilleur code open source de
simulation de production, puis dire précisément ce que notre moteur doit lui
emprunter. Cette note est une étude technique : elle ne contient aucune donnée
d'exploitation.

**Méthode.** Quatre projets ont été clonés et lus (pas seulement leurs pages de
présentation). Les licences ont été vérifiées dans les fichiers, pas de mémoire.

---

## 1. Les projets retenus

| Projet | Langage | Taille | Licence | Vérification |
|---|---|---:|---|---|
| [SimPy](https://gitlab.com/team-simpy/simpy) 4.1.2 | Python | 2 100 lignes | **MIT** | `LICENSE.txt` : « Copyright (c) 2013 Ontje Lünsdorf and Stefan Scherfke » |
| [ProdSim](https://github.com/FuchsTom/ProdSim) | Python (sur SimPy) | 3 500 lignes | **MIT** | `LICENSE.md` : « MIT License Copyright (c) 2021 Tom Fuchs » |
| [uia-simjs](https://github.com/uia4w/uia-simjs) | **JavaScript** | 775 lignes | **Apache-2.0** | fichier `LICENSE` + `package.json` |
| [salabim](https://github.com/salabim/salabim) | Python | 28 000 lignes (un seul fichier) | MIT **annoncé, non fourni** | **aucun fichier `LICENSE` dans le dépôt** ; MIT seulement dans `readme.md` et les classifiers de `pyproject.toml` |

**Aucun projet du lot n'est en GPL ou AGPL.** MIT et Apache-2.0 autorisent
l'adaptation dans un projet privé ou propriétaire, à charge de conserver
l'avis de copyright. C'est compatible avec la décision de garder le plan et
les données de vols hors du dépôt public.

**Réserve sur salabim** : le dépôt ne contient pas de fichier de licence. La
mention MIT du README ne vaut pas licence jointe. On peut s'inspirer de ses
idées sans réserve ; **on ne recopie pas son code** tant que le fichier manque.

Écarté volontairement : **Warteschlangensimulator** (Java, Apache-2.0, ~1 Go).
C'est une application de bureau, pas une bibliothèque. Elle reste utile comme
**référence de validation** : modéliser un atelier dans les deux outils et
comparer les résultats est le moyen le moins coûteux de vérifier notre moteur.

---

## 2. Ce que fait notre moteur aujourd'hui

`sim.js`, fonction `step(dt)` : à chaque pas de 30 secondes simulées, on
parcourt les ateliers dans un ordre fixe (`ordreTraitement`) et on répartit un
budget d'**homme-minutes** (`capLeft = effectif × dispo × dt`) sur les dossiers
présents, triés par échéance.

C'est un modèle **à débit**, pas à événements. Ses limites sont structurelles,
et trois d'entre elles expliquent la plupart des résultats invraisemblables :

1. **Le travail est infiniment divisible.** Un dossier peut être traité par
   « 0,3 personne ». Personne n'est jamais *occupé* : il n'y a que des minutes
   dans un pot commun. Un poste ne se prend pas, ne se libère pas.
2. **Il n'y a aucun tampon.** Aucun atelier n'a de capacité de stock en entrée.
   Donc **aucun blocage amont** : un atelier aval saturé ne fait jamais
   remonter la file. Or c'est le mécanisme de goulot dominant en catering
   (chambres froides, trolleys, quais). Notre « goulot » est déduit d'un taux
   de charge, pas observé.
3. **Le taux de charge est cosmétique.** `st.util = st.util*0.82 + u*0.18`,
   avec un plancher artificiel `Math.max(u, 0.97)` dès que quelque chose
   attend. Le README le reconnaît déjà (« indice indicatif »). Ce n'est pas
   une mesure : c'est un lissage exponentiel d'un rapport calculé sur un pas.

Trois autres manques, moins visibles mais bloquants pour la suite :

4. **Pas de nomenclature.** Un dossier vol est une masse d'homme-minutes par
   atelier. On ne sait pas exprimer « 1 plateau = 1 plat + 1 entrée + 1
   dessert », ni consommer des composants produits ailleurs.
5. **Pas de couche statistique.** `kpis()` recalcule tout à chaque image à
   partir des tableaux. Aucune moyenne pondérée par le temps, aucun percentile,
   aucun historique exploitable.
6. **Aucune variabilité.** Tous les temps sont déterministes. Un résultat
   unique, sans dispersion, ne permet pas de dire si un effectif « passe ».

---

## 3. Ce qu'on emprunte, projet par projet

### 3.1 ProdSim — le modèle de données (à transposer, pas à copier)

ProdSim est le projet le plus proche de notre besoin : *« process-based
discrete event simulation for production environments »*. Son apport n'est pas
son code Python, inutilisable chez nous, mais **la forme de son fichier
d'entrée**. Tout le procédé tient dans un JSON à trois clés :

```json
{
  "order":   [ /* les produits et leur gamme */ ],
  "station": [ /* les postes, leur capacité et leur tampon */ ],
  "factory": { /* les attributs globaux */ }
}
```

Un produit (`order`) porte sa gamme sous forme de **listes parallèles de même
longueur** — une case par étape :

```json
{
  "name": "gearbox",
  "source": "source_1",
  "storage": 10,
  "station":   ["assemble_gb", "quality_check"],
  "function":  ["assemble_gb", "quality_check"],
  "demand":    [[1, 8, 1], 2],
  "component": [[ "housing", "screw", "gear_shaft" ], []]
}
```

Ce qu'il faut en retenir, point par point :

- **`station` / `function` / `demand` / `component` sont des listes alignées.**
  L'étape *i* se fait au poste `station[i]`, exécute `function[i]`, consomme
  `demand[i]` unités des composants `component[i]`. L'invariant « même
  longueur » se vérifie au chargement : c'est un contrôle de cohérence gratuit.
- **`demand` + `component`, c'est la nomenclature.** `[[1,8,1], 2]` signifie :
  à l'étape 1, assembler 1 carter + 8 vis + 1 arbre ; à l'étape 2, traiter par
  lots de 2. **C'est exactement ce qui nous manque** pour exprimer une
  prestation composée, et la notion de lot en prime.
- **`storage` est une capacité de tampon**, portée aussi bien par le produit
  (stock de sortie) que par le poste (file d'entrée). C'est ce chiffre qui crée
  le blocage amont.
- **`capacity` sur un poste = le nombre de machines / de places**, et chaque
  place reçoit ses propres attributs. Une station à 2 places, c'est
  `"capacity": 2` — pas un budget de minutes.
- **Les attributs suivent une convention de distribution** : `["f", 0]` =
  valeur fixe, `["n", 42, 0.4]` = loi normale de moyenne 42 et d'écart-type
  0,4. Une convention courte, lisible dans un JSON, extensible. À reprendre
  telle quelle pour introduire la variabilité (point 6 ci-dessus).

Et le **squelette du processus** (`simulator.py`), qui est la bonne réponse
aux limites 1 et 2 :

```
prendre une place au poste     (request sur la ressource, avec priorité)
  prendre la pièce dans le tampon d'entrée   (store.get, filtré)
  exécuter la fonction d'usinage/assemblage  (yield timeout)
  déposer dans le tampon du poste suivant    (store.put → BLOQUE si plein)
libérer la place
```

La ligne qui compte est la dernière : `yield next_store.put(item)` **avant**
`station.release(request)`. Le poste reste occupé tant que l'aval n'a pas de
place. Le blocage amont sort gratuitement de l'ordre de ces deux lignes.

À noter aussi, lu dans `__assembling_process` : la demande de place est
lancée en parallèle d'une attente de composants
(`yield AnyOf(env, get_events + [request])`), et la requête est **annulée** si
elle n'a pas abouti. C'est ainsi qu'on évite de bloquer un poste en attendant
un composant qui n'arrive pas.

### 3.2 SimPy — trois primitives à porter en JavaScript

SimPy est petit (2 100 lignes) et sa valeur tient à trois classes que
**personne n'a portées correctement en JS** :

| Primitive | Fichier | Lignes | À quoi ça sert chez nous |
|---|---|---:|---|
| `Resource` / `PriorityResource` | `resources/resource.py` | 291 | Un poste de travail, un opérateur, un tunnel de plonge : capacité entière, file d'attente, priorité |
| `Store` / `FilterStore` | `resources/store.py` | 204 | Un tampon de capacité finie ; `get` filtré pour piocher « le bon article » ; `put` bloquant quand c'est plein |
| `Container` | `resources/container.py` | 126 | Un niveau continu : stock de matière, encours mesuré en quantité |

Plus `resources/base.py` (280 lignes) qui factorise les deux files
(`put_queue` / `get_queue`) et le déclenchement en cascade. Soit **environ 900
lignes de Python à transposer, dont on n'a besoin que de la moitié**.

### 3.3 uia-simjs — le cœur événementiel déjà en JavaScript

C'est la piste stratégique. `uia-simjs` est un portage du **noyau** de SimPy en
JavaScript moderne, sous Apache-2.0 :

| Fichier | Lignes | Contenu |
|---|---:|---|
| `env.js` | 157 | L'environnement : file de priorité, `now()`, `step()`, `schedule()`, `run(until)` |
| `event.js` | 192 | L'événement, ses rappels, ses états |
| `process.js` | 108 | Le processus : un générateur JS repris à chaque `yield` |
| `timeout.js` | 29 | L'attente |
| `condition.js` + `all-of.js` + `any-of.js` | 98 | `AllOf` / `AnyOf` |
| `interruption.js` | 33 | L'interruption d'un processus |

Le mécanisme est identique à SimPy, et il tient dans `process.js` : un
processus est une **fonction génératrice**, chaque `yield` rend un événement,
et le rappel de cet événement relance le générateur avec la valeur produite.
Les générateurs JavaScript (`function*` / `yield`) sont exactement l'équivalent
des générateurs Python utilisés par SimPy — **le portage est naturel, pas une
astuce**.

La file d'attente est un tas binaire trié par `(temps, priorité)`, ce qui donne
le bon comportement pour les événements simultanés.

**Ce qui manque** — et c'est précisément ce qu'apporte le § 3.2 : il n'y a
**ni `Resource`, ni `Store`, ni `Container`**. Le noyau est là, les ressources
sont à écrire.

**Défauts à corriger avant tout usage** :

- `run()` arrête la simulation en **levant une exception** (`throw new
  Error("time up interruption")`) qu'il rattrape et affiche. Inacceptable dans
  une interface : une vraie erreur de modèle serait avalée de la même façon.
- `console.log("=== start ===")` et consorts dans le chemin critique.
- Une dépendance (`tinyqueue`) et un empaquetage rollup / ES modules, alors que
  notre contrainte est **un script classique sans étape de construction**. Le
  tas binaire fait une trentaine de lignes : on l'écrit, on ne l'importe pas.
- Version 0.1.0, intégration continue sur Travis CI : **projet non maintenu**.

Conclusion : on ne prend pas ce paquet comme dépendance, on **reprend sa
conception** (et son avis de copyright si on en reprend des portions).

### 3.4 salabim — le vocabulaire statistique

28 000 lignes dans un seul fichier, une conception monolithique qu'on ne
reprendra pas. Mais salabim a la **meilleure couche de mesure** du lot, et
c'est notre manque n° 5. Son idée centrale, la classe `Monitor`, tient en une
distinction que notre code ne fait pas :

- **moniteur de niveau** (`level=True`) : la valeur est un **état qui dure**.
  Les statistiques sont **pondérées par le temps**. C'est ce qu'il faut pour
  la longueur de file, l'encours, le taux d'occupation d'un poste.
- **moniteur de comptage** (`level=False`, défaut) : on enregistre une valeur
  **par objet**. Statistiques non pondérées. C'est ce qu'il faut pour le temps
  de traversée d'un dossier, son retard, son temps d'attente.

Chaque moniteur fournit `mean()`, `percentile(q)`, `print_statistics()`,
histogramme. **Notre `st.util` lissé à 0,82/0,18 doit devenir un moniteur de
niveau** : le taux d'occupation d'un poste, c'est l'intégrale de son nombre de
places occupées divisée par le temps écoulé — une grandeur mesurée, défendable,
et qui ne demande aucun plancher artificiel.

À retenir aussi : salabim applique le même traitement aux files et aux
ressources, qui exposent leurs propres moniteurs. La mesure n'est pas un calcul
d'affichage fait après coup — elle est **portée par l'objet simulé**.

**Ce qu'on n'emprunte pas** : son animation. Elle est écrite en tkinter/PIL,
c'est-à-dire du bureau. Sous Pyodide (Python dans le navigateur), salabim
**force `blind_animation=True`** et refuse l'animation interactive
(`salabim.py`, lignes 10609-10617). Notre rendu SVG existant reste la bonne
réponse.

---

## 4. Ce que ça donne pour nous

### La conclusion d'architecture

**Un moteur à événements discrets en JavaScript, dans le navigateur, sans
serveur.** C'est réaliste : uia-simjs prouve que le noyau tient en 500 lignes
utiles, et SimPy donne le plan exact des ressources à ajouter. On garde alors
la propriété qui fait tout l'intérêt du projet — **des fichiers statiques
ouverts depuis GitHub Pages, aucune installation** — tout en remplaçant un
modèle à débit par un modèle où un poste est *réellement* occupé et un tampon
*réellement* plein.

L'alternative (Python + SimPy + ProdSim tels quels) donnerait un moteur plus
riche immédiatement, mais imposerait un serveur ou une installation locale.
Elle reste pertinente comme **banc d'essai hors ligne** pour calibrer, pas
comme produit.

### Le chemin proposé, en trois temps

**1. Le noyau (`moteur/noyau.js`, ~400 lignes).** Tas binaire trié
`(temps, priorité)`, `Event`, `Timeout`, `Process` sur générateurs, `AllOf` /
`AnyOf`. Conception reprise d'uia-simjs, débarrassée de l'arrêt par exception,
des `console.log` et de la dépendance externe. Testable sans navigateur avec
`node --test`, comme `ui-model.js`.

**2. Les ressources (`moteur/ressources.js`, ~350 lignes).** `Ressource`
(capacité entière + file + priorité), `Tampon` (capacité finie, `prendre`
filtré, `deposer` bloquant), `Niveau` (continu). Transposées de SimPy, MIT,
avis de copyright conservé. **C'est cette étape qui fait apparaître le blocage
amont**, donc les vrais goulots.

**3. Le procédé en données (`moteur/procede.json`).** Schéma inspiré de
ProdSim : `postes[]` avec `capacite` et `tampon`, `produits[]` avec des listes
alignées `poste` / `operation` / `quantite` / `composants`, et la convention de
distribution `["f", x]` / `["n", moyenne, ecart]`. Le procédé cesse d'être
codé en dur dans `sim.js` : il devient une donnée qu'on relit et qu'on discute.
**Le fichier réel de l'unité restera hors du dépôt**, comme le plan ; seul un
exemple fictif est publié.

**Puis la mesure**, en parallèle de l'étape 2 : `Moniteur` de niveau et de
comptage à la salabim, porté par chaque poste et chaque tampon. Le taux
d'occupation devient une intégrale, pas un lissage. Les indicateurs cessent
d'être recalculés à chaque image.

### Ce qui ne change pas

Le rendu SVG, l'éditeur de zones, l'éditeur de postes et l'import CSV restent
en l'état. Le moteur est remplacé **derrière** l'interface : `step(dt)` laisse
la place à « avancer la simulation jusqu'à `now + dt` », et le rendu continue
de lire l'état à la fréquence d'affichage. C'est un remplacement de couche, pas
une réécriture du produit.

### Validation

Une fois l'étape 2 en place, modéliser un atelier simple **dans notre moteur et
dans Warteschlangensimulator**, et comparer les temps d'attente et les taux
d'occupation. Deux implémentations indépendantes qui tombent d'accord, c'est la
vérification la moins coûteuse qu'on puisse s'offrir — et la seule qui vaille
avant de parler de dimensionnement.

---

## 5. Avis de copyright à conserver

Si du code est transposé, ces mentions doivent figurer dans les fichiers
concernés :

```
Conception des ressources transposée de SimPy
Copyright (c) 2013 Ontje Lünsdorf and Stefan Scherfke — licence MIT

Conception du noyau événementiel inspirée de uia-simjs
Copyright (c) Kyle K. Lin — licence Apache-2.0

Modèle de données inspiré de ProdSim
Copyright (c) 2021 Tom Fuchs — licence MIT
```

salabim n'apparaît pas dans cette liste : **seules ses idées** sont reprises
(la distinction niveau/comptage), et son dépôt ne fournit pas de fichier de
licence.

---

## 6. Avancement

### Étape 1 — noyau événementiel : **faite** (`moteur/noyau.js`, 19 tests)

`moteur/noyau.js` (≈ 480 lignes, script classique sans étape de construction,
utilisable depuis `file://` comme depuis Node) fournit :

| Élément | Rôle |
|---|---|
| `Environnement` | `maintenant`, `programmer`, `pas`, `executer`, `avancerA` |
| `Evenement` | attente → programmé → traité ; `reussir` / `echouer` / `annuler` |
| `Delai` | l'attente d'une durée |
| `Processus` | une fonction génératrice reprise à chaque `yield` ; c'est aussi un événement, donc attendable |
| `tousDe` / `unDe` | attendre tous les événements, ou le premier |
| `interrompre` | fait lever une `Interruption` au point d'attente d'un processus |
| `FilePriorite` | tas binaire, ordre `(instant, priorité, rang de création)` |

Quatre partis pris, tous pris contre ce que fait uia-simjs :

1. **Les erreurs remontent.** Un événement en échec que personne n'attend fait
   lever son erreur par `pas()`. uia-simjs arrête la simulation en levant une
   exception qu'il rattrape et affiche : une vraie erreur de modèle y serait
   avalée de la même façon. Un échec *attendu*, lui, se rattrape normalement
   par `try`/`catch` autour du `yield`.
2. **L'ordre est totalement déterminé** par le triplet
   `(instant, priorité, rang de création)`. Sans le troisième critère, deux
   événements simultanés de même priorité sortiraient dans un ordre dépendant
   du tas : un test vérifie que deux exécutions identiques donnent la même
   trace, caractère par caractère.
3. **`avancerA(t)` traite l'instant `t` inclus, puis cale l'horloge sur `t`.**
   Des appels successifs ne rejouent ni ne sautent aucun événement, même
   lorsqu'aucun ne tombe dans l'intervalle. C'est ce dont le rendu a besoin
   pour appeler `avancerA(now + dt)` à chaque image.
4. **Aucune dépendance, aucune sortie console** dans le chemin critique. Le tas
   binaire fait trente lignes ; l'importer coûterait plus cher que l'écrire.

**Deux défauts trouvés par les tests**, corrigés avant le commit : un processus
interrompu avant le démarrage de son générateur était tué par une erreur non
rattrapable (l'interruption est désormais refusée explicitement tant que le
générateur n'est pas entamé, comme dans SimPy) ; et un processus achevé pouvait
être relancé par son amorce.

**Limite documentée et assumée** : quand un processus est interrompu,
l'événement qu'il attendait reste programmé. Il se résout dans le vide, mais il
fait avancer l'horloge jusqu'à son instant si plus rien d'autre n'est en file.
On ne peut pas le retirer du tas à coût constant, et il peut être partagé avec
d'autres processus. SimPy a exactement le même comportement.

**Débit mesuré** : 20 000 ordres de cinq étapes, soit 120 000 événements, en
268 ms sous Node — environ **450 000 événements par seconde**. Une journée
d'exploitation se compte en dizaines de milliers d'événements : la marge est
large, y compris dans un navigateur.

**Ce que le noyau ne fait pas encore**, et pourquoi rien n'est encore branché
sur l'interface : il n'a ni poste de capacité finie, ni tampon, ni mesure. Un
noyau seul ne sait pas exprimer « ce poste est occupé » ni « ce tampon est
plein ». C'est l'objet de l'étape 2, et c'est elle qui fera apparaître les
vrais goulots. `sim.js` est inchangé.

### Étape 2 — ressources et mesure : **faite** (18 tests)

Deux fichiers, transposés de SimPy (MIT) pour les ressources et inspirés de
salabim pour la mesure. La mesure était annoncée « en parallèle de l'étape 2 » :
elle est là, parce qu'une ressource incapable de répondre « quelle est ton
occupation » ne règle pas le défaut n° 3.

| Objet | Fichier | Rôle |
|---|---|---|
| `Ressource` | `moteur/ressources.js` | un nombre entier de places, file triée par priorité |
| `Tampon` | `moteur/ressources.js` | contenance finie ; `deposer` **bloque** quand c'est plein ; `prendre` accepte un filtre |
| `Niveau` | `moteur/ressources.js` | quantité continue, plafond, rupture mesurée |
| `Moniteur` | `moteur/mesure.js` | statistiques de niveau (pondérées par le temps) et de comptage |

La gamme d'un produit s'écrit alors :

```js
const place = poste.demander({ priorite: dossier.echeance });
yield place;
try {
  const article = yield tamponEntree.prendre();
  yield env.delai(dureeOperation);
  yield tamponSuivant.deposer(article);   // BLOQUE si l'aval est plein
} finally {
  poste.liberer(place);                   // après le dépôt, jamais avant
}
```

**L'ordre des deux dernières lignes est tout le sujet.** Le poste reste occupé
tant que l'aval n'a pas de place : le blocage amont sort de cet ordre, pas
d'une règle écrite pour lui.

#### La démonstration, et elle est chiffrée

Un test compare deux exécutions qui ne diffèrent **que** par la contenance du
tampon intermédiaire. Deux postes en série, le second cinq fois plus lent, dix
articles à traiter :

| | tampon illimité | tampon d'une place |
|---|---:|---:|
| Articles produits | 10 | 10 |
| Dernier fini | 51 min | 51 min |
| **Minutes pendant lesquelles le poste rapide tient sa place** | **10** | **41** |
| Part du temps où le tampon bloque l'amont | 0 | 0,16 |
| Attente moyenne au dépôt | 0 | 3,1 min |

Le poste rapide ne travaille que 10 minutes dans les deux cas — dix articles,
une minute chacun. Mais avec un tampon d'une place il **immobilise son poste 41
minutes**. Les 31 minutes d'écart sont le blocage amont, et elles n'existent
dans aucune formule : elles sortent du modèle. C'est exactement ce que `sim.js`
ne sait pas produire, et c'est pour cela qu'il ne peut pas désigner un vrai
goulot.

#### La mesure remplace le lissage

`Ressource.tauxOccupation()` est l'intégrale des places occupées divisée par la
durée et par la capacité. Un test vérifie qu'un poste occupé 30 minutes sur 100
rend exactement `0,3` — pas un lissage, pas de plancher `Math.max(u, 0.97)`.

Les moniteurs distinguent, comme salabim, les grandeurs qui **durent** (file,
places occupées, encours : pondérées par le temps) des valeurs **par objet**
(attente, retard, traversée : non pondérées). Un test montre l'écart : une file
à 10 pendant une minute puis à 0 pendant 99 a une longueur moyenne de **0,1**,
là où une moyenne arithmétique des observations dirait 3,3.

Deux indicateurs de goulot sortent directement des objets, sans heuristique :
`Tampon.partBloquante()` — part du temps où ce tampon a bloqué son amont — et
`Niveau.partEnRupture()` — part du temps où un retrait a attendu.

#### Écarts assumés par rapport à SimPy

- **`liberer` agit immédiatement** au lieu de produire un événement à attendre.
  On n'a jamais besoin d'attendre une libération, et un `yield` de plus serait
  un oubli de plus. La réservation, le dépôt et la prise restent des événements.
- **`liberer` couvre aussi l'abandon** : appelé sur une demande encore en file,
  il l'en retire. C'est le schéma de ProdSim — demander une place en parallèle
  d'autre chose avec `unDe`, puis annuler la demande si elle n'a pas abouti. Un
  test vérifie qu'une demande abandonnée ne bloque pas la file derrière elle.
  Il ne faut jamais abandonner une demande qu'un processus attend encore : il
  ne serait pas réveillé. C'est écrit dans le code, à l'endroit où ça compte.
- **Pas de préemption.** Aucun besoin identifié, et elle coûterait cher.
- Les files de `Tampon` et de `Niveau` sont dans l'ordre d'arrivée, sans
  priorité : la priorité est portée par `Ressource`, là où les échéances de vol
  s'appliquent. Conséquence testée et voulue : un petit retrait attend derrière
  un gros qui ne peut pas être servi.

Le traitement des deux files d'un tampon est déclenché par la **résolution** des
événements, pas par leur enregistrement — même mécanisme que SimPy, et c'est ce
qui évite toute réentrance entre dépôts et prises.

Chargés dans un navigateur, les trois fichiers exposent `MoteurNoyau`,
`MoteurMesure` et `MoteurRessources` ; `ressources.js` refuse de se charger
avant les deux autres avec un message explicite plutôt qu'un `undefined`.

**`sim.js` reste inchangé.** Il manque encore la description du procédé en
données : tant que la gamme est codée en dur, brancher le nouveau moteur
reviendrait à réécrire `sim.js` à la main au lieu de le nourrir.

### Étape 3 — le procédé en données : **faite** (14 tests)

`moteur/procede.js` et `moteur/procede-exemple.json`. Le format complet est
décrit dans le guide du procédé (retiré depuis, avec le module) ; l'essentiel tenait en ceci :
quatre listes de même longueur, une case par étape.

```json
"poste":      ["prepa_froide",   "dressage",      "controle"],
"operation":  [["n", 0.9, 0.15], ["n", 4.5, 0.5], ["f", 0.35]],
"quantite":   [1,                6,               12],
"composants": [[{ "produit": "barquette", "quantite": 1 }], [], []]
```

Le procédé cesse d'être codé en dur dans `sim.js` : il devient une donnée qu'on
relit, qu'on discute et qu'on corrige sans toucher au moteur.

**Trois écarts assumés par rapport à ProdSim :**

1. ProdSim surcharge un unique champ `demand`, tantôt taille de lot, tantôt
   quantités de composants selon qu'on y met un nombre ou une liste. Ici
   `quantite` est le lot et `composants` la nomenclature. Une liste nommée vaut
   mieux qu'une position à deviner.
2. La validation **rassemble toutes les anomalies** avant de refuser le
   fichier, comme l'import CSV de l'interface. Corriger un procédé une faute à
   la fois est une perte de temps.
3. Les tirages passent par un générateur à graine : **à graine égale, deux
   exécutions donnent exactement le même résultat**. Sans cela, comparer deux
   scénarios ne voudrait rien dire, l'écart pouvant venir du hasard. Un test le
   vérifie en comparant deux résultats complets.

Un contrôle mérite d'être cité, parce qu'il évite un blocage certain plutôt
qu'un simple message : **un lot ne peut pas être plus grand que le tampon du
poste**, sinon les unités s'y accumulent sans jamais atteindre le compte.

#### Ce que l'exemple montre

`moteur/procede-exemple.json` — fictif, publiable — décrit quatre postes et
trois produits. Sur 240 minutes :

| Poste | Places | Occupation | Tampon moyen | Bloque l'amont |
|---|---:|---:|---:|---:|
| decontamination | 2 | 10,9 % | 1,8 / 40 | 0 % |
| prepa_froide | 2 | 82,2 % | 7,4 / 60 | 0 % |
| **dressage** | 1 | **98,2 %** | 26,9 / 36 | **20,5 %** |
| controle | 1 | 3,8 % | 3,0 / 24 | 0 % |

312 plateaux terminés, traversée moyenne **31,5 minutes** pour un produit dont
les opérations totalisent 5,8 minutes. Le reste est de l'attente.

Le goulot est **désigné par la mesure** : le poste dont l'occupation ou le
blocage aval est le plus élevé, avec sa cause. Aucun seuil choisi à la main,
aucune heuristique — à comparer avec `goulotCourant()` de `sim.js`, qui
compare un lissage à `0,55` et une longueur de file à `4`.

Les 82,2 % de `prepa_froide` se lisent correctement : ce poste ne travaille pas
82 % du temps, il **tient sa place** 82 % du temps, dont une partie à attendre
que le tampon du dressage se libère.

#### Confidentialité

Seul l'exemple fictif est publié. `.gitignore` refuse désormais tout
`moteur/procede-*.json` autre que lui, et le procédé réel se travaille dans
`prive/`. Vérifié : un `moteur/procede-ory.json` est invisible pour Git,
l'exemple reste visible.

#### Limite connue

Une place est prise **avant** les unités et les composants : un opérateur
occupe son poste pendant qu'il rassemble son lot, ce qui décrit fidèlement un
poste tenu. Conséquence : une rupture durable de composant immobilise les
places concernées au lieu de simplement ralentir. C'est le comportement de
ProdSim, il est voulu, et il est écrit dans le code et dans le guide.

### Le branchement sur l'interface : **fait** (`moteur/orly.js`, 16 tests)

`sim.js` ne calcule plus rien. `moteur/orly.js` construit le modèle de l'unité
sur le noyau, les ressources et la mesure ; l'interface lit ses vues. Le
barème d'homme-minutes du démonstrateur est repris tel quel, et reste non
calibré. Ce qui a changé de nature :

| Avant (`step(dt)`) | Maintenant (`moteur/orly.js`) |
|---|---|
| budget d'homme-minutes réparti par pas de 30 s | une personne occupée par un lot de 5 homme-minutes à la fois |
| robot = débit continu | robot = une place, un vol à la fois, par ordre d'échéance, servi aux compagnies de la liste (FBU, TX/FWI, CRL) |
| aucun tampon | contenance en OF par atelier, réglable ; finie, elle crée le blocage amont |
| effectifs constants | équipe du matin, équipe du soir, heure de relève ; personne n'est interrompu |
| `util` lissé avec plancher | occupation mesurée sur 15 min et sur la journée |
| goulot par seuils (0,55 et 4) | le poste où l'on attend, sans seuil, robot compris |
| instantanés non comparables | scénarios A/B par rejeu complet de la journée, sans aléa |
| retard constaté | retard **expliqué** par l'OF qui fixe l'heure : attentes par cause, travail, journal exporté |

**Ce que la règle du robot a changé à la démonstration, et qu'il faut dire.**
Avec tous les YC au robot, la démo montrait un goulot robot le matin et 58 % de
vols à l'heure. C'était un artefact. Avec la règle de la feuille de route, la
journée de démonstration est à l'heure par défaut ; ce sont les leviers qui
créent la tension, et les tests le vérifient sans que les données aient été
ajustées.

### Une décision à prendre : un seul moteur fait autorité

La feuille de route (§ 3) demande de « viser un moteur Python à événements
discrets, par exemple avec SimPy », l'interface s'y connectant par fichiers
JSON, et précise qu'« un seul moteur fera autorité pour les résultats métier ».

Cette étude a conclu autrement, et le code a suivi : le moteur à événements
discrets existe **en JavaScript, dans le navigateur**, sans serveur ni
installation, et il tourne. Ses primitives sont celles de SimPy, transposées et
testées ; la journée complète se rejoue en quelques dizaines de millisecondes.

Les deux options restent ouvertes, et ce n'est pas à cette étude de trancher :

- **Garder le moteur JavaScript comme moteur d'autorité.** Avantage : un seul
  langage, des fichiers statiques ouverts depuis GitHub Pages, le rejeu A/B
  instantané dans l'interface. Coût : l'import des exports réels et les
  référentiels métier se feront aussi en JavaScript, ou par fichiers JSON
  préparés ailleurs.
- **Bâtir le moteur Python prévu et reléguer celui-ci au rôle de
  démonstrateur.** Avantage : l'écosystème SimPy/ProdSim pour l'import, la
  calibration et l'analyse. Coût : deux moteurs à tenir cohérents, un serveur
  ou une installation locale, et le rejeu A/B ne sera plus instantané.

Ce qui ne dépend pas du choix : le format `procede.json` (§ étape 3) est
lisible par les deux ; les indicateurs et leur définition (§ étape 6 de la
feuille de route) sont les mêmes ; et Warteschlangensimulator reste le banc de
validation indépendant proposé au § 1.

### Ce qui reste, et qui n'est plus technique

- **traduire le programme de vols réel en ordres de fabrication** — la forme
  `calendrier` du procédé existe, mais le passage d'un dossier Winrest à des
  unités de production suppose les règles métier (prestations par classe, cas
  SPML, cuisine J−2, prépa J−1) qui restent à confirmer ;
- **renseigner les contenances des ateliers et les effectifs par équipe** —
  ce sont des données de l'exploitant, désormais des réglages et non des
  constantes ;
- **calibrer le barème** — le coefficient de dressage manuel (0,35 min par
  plateau) est inventé, affiché comme tel et réglable.

Les trois demandent des informations que seul l'exploitant a, et se
travaillent en privé.
