# État des lieux — 21 septembre 2026

**À lire en premier, avant de reprendre le projet.** Le `CHANGELOG.md` dit ce
qui a changé commit par commit ; ce fichier dit **où en est le projet**, ce qui
est décidé, ce qui ne l'est pas, et ce qui reste à faire. Il est vérifié contre
le dépôt, pas écrit de mémoire.

Révision décrite : `0bfe587` + calendrier multijour, branche `claude/factory-management-system-b1e0am`.
Deux assistants travaillent en parallèle sur cette branche : **Claude** et
**Astra** (ChatGPT). Basile arbitre.

> **Mise à jour du 23 septembre 2026 — un seul moteur.** L'ancien moteur de
> démonstration (`moteur/orly.js`, `ressources.js`, `mesure.js`, `procede.js`,
> leurs 59 tests) est **retiré**. Le calcul tient désormais en
> `moteur/production.js` (modèle par ateliers de travail) sur `moteur/noyau.js`.
> La vue Simulation **relit** la journée calculée (`replay.js`, `simulation.js`) ;
> la comparaison A/B compare deux journées de ce modèle (`comparaison.js`) ; le
> jeu de vols fictif vit dans `vols-demo.js`. Effectifs par curseur, contenances,
> vivier, équipe du soir et calendrier multijour ont disparu avec l'ancien
> moteur : ce qu'ils décrivaient se décrit maintenant atelier par atelier
> (personnes, horaire, jour, pauses). Les sections ci-dessous qui parlent de
> l'ancien moteur décrivent **l'historique**, pas l'état présent.
>
> **Même jour, plus tard — Excel et parcours.** Le barème compte désormais en
> **minutes par vol** (valeur commune `*/BC`, valeurs propres `AF/BC`), plus par
> passager ; le matériel aussi. Chaque compagnie × classe suit un **parcours**
> (branches parallèles qui se rejoignent) décrit dans l'onglet Ateliers. Ateliers,
> barème et vols s'échangent en `.xlsx` (`tableur.js`, `echanges.js`) : voir
> [les formats Excel](FORMATS_EXCEL.md).
>
> **Puis — parcours et équipes réunis.** L'onglet Ateliers se lit en quatre
> temps : 1. les parcours (un schéma par parcours) ; 2. « Qui fabrique quoi », un
> tableau compagnie × classe × service où chaque case dit l'équipe et se choisit
> d'un clic, chaque ligne se dépliant dans le temps ; 3. les équipes ; 4. la
> journée. Le barème se saisit, service par service, par classe ou en grille
> compagnie × classe.

---

## 1. En une page

Le projet est passé, en cinq jours, d'une maquette animée à un **simulateur à
événements discrets** avec une interface de construction.

| | 17 septembre | Aujourd'hui |
|---|---|---|
| Calcul | budget d'homme-minutes réparti par pas de 30 s | moteur à événements discrets, personnes occupées par lots |
| Goulot | seuils choisis à la main (0,55 et 4) | poste où l'on attend, compté en ordres de fabrication |
| Occupation | lissage exponentiel avec plancher | intégrale mesurée, sur 15 min et sur la journée |
| Comparaison | photographies non comparables | deux journées entières rejouées, sans aléa |
| Retard | constaté | expliqué par cause, avec journal exporté |
| Plan | schéma inventé | plan réel, éditable, avec flux et ateliers sur grille |
| Confidentialité | plan et vols dans un dépôt public | retirés des branches, **encore présents dans les refs de PR** |
| Tests | aucun | **105 unitaires + 6 parcours navigateur** |

**Ce qui reste vrai malgré tout :** le barème d'homme-minutes n'est pas
calibré. Les résultats servent à **comparer des scénarios entre eux**, pas à
dimensionner une équipe ni à prédire une ponctualité réelle.

---

## 2. Ce qui a été construit

### Le moteur (Claude) — `moteur/`, 2 384 lignes, 74 tests

Issu de l'[étude des moteurs open source](ETUDE_OPEN_SOURCE.md) : SimPy,
ProdSim, uia-simjs et salabim ont été clonés, lus et évalués, licences
vérifiées dans les fichiers. Conclusion suivie : un moteur à événements
discrets **en JavaScript, dans le navigateur**, sans serveur.

| Fichier | Rôle | Statut |
|---|---|---|
| `noyau.js` | événements, processus sur générateurs, file de priorité, interruptions | **conservé** |
| `production.js` | modèle par ateliers de travail, compagnie × classe | **le seul moteur** |
| `mesure.js` | moniteurs de niveau (pondérés par le temps) et de comptage | retiré le 23/09 |
| `ressources.js` | postes à places, tampons bloquants, niveaux continus | retiré le 23/09 |
| `procede.js` | gamme décrite en données, validation, tirages à graine | retiré le 23/09 |
| `orly.js` | modèle de l'unité : ateliers, robot, plonge, matériel, calendrier | retiré le 23/09 |

Ce que l'ancien moteur représentait (historique) :

- une **personne** est occupée par un lot de 5 homme-minutes à la fois ;
- le **robot** est une place unique, un vol à la fois par ordre d'échéance,
  réservé aux compagnies de la liste (FBU, TX/FWI, CRL par défaut) ; les autres
  YC sont dressés à la main à un coefficient réglable ;
- la **plonge** a autant de places que de tunnels ;
- chaque atelier a une **contenance** en ordres de fabrication ; finie, elle
  crée le blocage amont ;
- les effectifs changent à la **relève d'équipe**, sans interrompre personne ;
- le **matériel propre** boucle : retours → plonge → stock → dotation → départs ;
- le **calendrier** (facultatif) fait produire la cuisine deux jours avant le
  départ et la prépa la veille, ateliers fermés la nuit.

### L'interface (Astra) — plan, flux, ateliers

| Apport | Fichiers | Guide |
|---|---|---|
| Éditeur de plan complet | `plan-editor.js`, `editor.css` | [EDITEUR_PLAN.md](EDITEUR_PLAN.md) |
| Stockages rattachés aux services | `plan-editor.js` | — |
| Centre des flux | `flow-center.js/.css` | [CENTRE_DES_FLUX.md](CENTRE_DES_FLUX.md) |
| Création des ateliers sur grille 50 cm | `workshop-grid.js/.css` | [CREATION_ATELIERS.md](CREATION_ATELIERS.md) |
| Contrastes et parcours | `usability.css` | [AUDIT_ERGONOMIE_2026-09-20.md](AUDIT_ERGONOMIE_2026-09-20.md) |

---

## 3. Décisions prises

| Décision | Qui | Quand |
|---|---|---|
| Le plan de l'unité et les exports de vols sortent du dépôt public | Basile | 18/09 |
| Historique réécrit (`git-filter-repo`) plutôt que dépôt privé | Basile | 18/09 |
| Moteur à événements discrets en JavaScript, dans le navigateur | Claude, suivi | 18/09 |
| Le robot ne sert que FBU, TX/FWI et CRL | feuille de route, appliqué | 18/09 |
| Le goulot se compte en ordres de fabrication, pas en lots | Claude | 19/09 |
| Le calendrier multijour existe mais reste inactif par défaut | Claude | 21/09 |
| La grille des ateliers est schématique, pas une mesure du bâtiment | Astra | 20/09 |

### Ce qui a été corrigé parce qu'un test l'a montré

Chaque défaut ci-dessous a été trouvé par un test **avant** livraison, sauf
mention contraire, et chaque correction est couverte par un test qui échouait
avant elle.

- Le goulot ignorait le robot : l'interface disait « personne n'attend » pendant
  que trois vols attendaient.
- Le goulot comparait des unités différentes — lots, vols, dossiers.
- L'occupation dépassait 100 % après une baisse d'effectif.
- Un processus interrompu avant son démarrage était tué par une erreur non
  rattrapable ; un processus achevé pouvait être relancé.
- Le validateur de procédé s'arrêtait à la première anomalie au lieu de toutes
  les rassembler.
- BUG-003 (numéros de ligne CSV faux) et BUG-005 (réimport impossible après un
  échec de lecture) : corrigés, tests prouvés en échec sur l'ancien code.
- **Une erreur de ma part, signalée par Astra :** j'avais affirmé que des
  captures d'écran ne montraient pas le plan. C'était faux. Les cinq ont été
  retirées. Leçon retenue : vérifier fichier par fichier, ne pas répondre de
  mémoire.

Le registre `BUGS.md` **n'a plus d'entrée ouverte** — ce qui n'est pas la même
chose qu'aucun bug.

---

## 4. Ce qui n'est pas fait

### Confidentialité — une action reste à mener 🔴

La purge de l'historique a été exécutée et **vérifiée sur un clone neuf** : les
quatre branches ne contiennent plus aucun fichier sensible, le dépôt est passé
de 4,6 Mo à 400 Ko.

**Mais les références de pull request conservent le plan.** Vérifié le
21 septembre :

| Référence | Fichiers sensibles encore présents |
|---|---:|
| `refs/pull/1/head` | 18 |
| `refs/pull/2/head` | 5 |
| `refs/pull/3/head` | 5 |

Ces références ne peuvent pas être réécrites par un `push`. **Seul le support
GitHub peut les purger.** Le texte de la demande a été rédigé le 18 septembre ;
**il n'a pas été envoyé**. Tant qu'il ne l'est pas, le plan de l'unité reste
récupérable par quiconque connaît l'adresse, sur un dépôt public.

### Limites métier

- **Calendrier multijour : fait, mais inactif par défaut.** Cuisine J−2, prépa
  J−1, exception CRL du soir, ateliers fermés la nuit. Il s'active dans les
  réglages. Deux réserves : le seuil de 21:00 et la liste des compagnies
  exceptées **ne sont pas confirmés**, et le programme de vols est répété
  chaque jour faute de données réelles datées.
- **Barème non calibré.** Les coefficients par passager viennent du
  démonstrateur, pas du classeur des heures. Le coefficient de dressage manuel
  (0,35 min/plateau) est inventé, affiché comme tel et réglable.
- **Export Winrest non pris en charge.** L'import CSV simplifié ne représente
  ni les lignes de prestations, ni les dossiers, ni les dates.
- **Un seul compte de matériel propre.** Les trolleys d'armement, les stocks de
  denrées, les compétences, les pauses et les transferts ne sont pas modélisés.
- **Deux équipes au plus** (matin, soir) : c'est un premier pas, pas un planning.
- Magasin, Duty free et handling ne sont pas modélisés.

### Le raccordement qui manque

Les ateliers dessinés sur la grille **ne changent rien au calcul**. Astra l'écrit
dans son guide : « le moteur, les équipes, les temps, les débits et les flux
configurés ne sont pas modifiés par ces équipements ».

Le contrat est pourtant minuscule et déjà en place : `moteur/orly.js` ne lit que
**deux nombres par service** — `CFG.staff[service]` (personnes simultanées) et
`CFG.tampons[service]` (ordres de fabrication contenus). Ce qui est construit
dans un service n'a qu'à produire ces deux nombres avant `build()`. Si les
chaînes portent un **débit** plutôt qu'un effectif, le moteur sait déjà
modéliser une cadence machine — c'est ce que fait le robot — mais il faudra
ajouter le point d'entrée.

---

## 5. Points ouverts — décisions attendues de Basile

1. **Envoyer la demande au support GitHub** pour purger `refs/pull/1..3/head`.
   Rien d'autre ne peut la remplacer. 🔴
2. **Quel moteur fait autorité ?** La feuille de route vise un moteur Python
   SimPy ; l'étude a conclu à un moteur JavaScript et le code a suivi. Les deux
   options sont posées avec leurs coûts dans
   [ETUDE_OPEN_SOURCE.md](ETUDE_OPEN_SOURCE.md). Tant que ce n'est pas tranché,
   le risque est d'en construire deux.
3. **La grille 50 × 50 sert-elle à dimensionner ou seulement à dessiner ?** Si
   elle dimensionne — combien de tables tiennent dans un local, donc combien de
   personnes — alors la surface devient une contrainte que le moteur doit
   connaître, et il faut une cote de référence sur le fond de plan.
4. **Publier une feuille de route allégée ?** Astra recommande de garder la
   version détaillée en privé (volumes, règles opérationnelles, 121 standards)
   et de publier une version limitée à l'architecture logicielle. Non tranché.
5. **Données réelles.** Le procédé de l'unité — contenances, effectifs par
   équipe, standards — ne peut venir que de l'exploitant. Il se travaille dans
   `prive/`, que `.gitignore` bloque.

---

## 6. Travailler à deux sans se gêner

La règle qui a fonctionné, à garder :

| Territoire | Fichiers |
|---|---|
| **Claude** | `moteur/`, `ui-model.js`, la glue moteur de `sim.js`, ses tests |
| **Astra** | `plan-editor.js`, `flow-center.js`, les onglets et le rendu du plan dans `index.html` |
| **Partagé** | `README.md`, `CHANGELOG.md`, `BUGS.md` — ajouter en tête, ne pas réécrire |

Fusionner avant de commencer, relancer tous les tests après la fusion. Les
conflits rencontrés jusqu'ici se sont limités au `CHANGELOG.md` et se résolvent
en gardant les deux entrées.

---

## 7. Vérifier avant de livrer

```bash
node --test tests/*.test.cjs     # 176 tests purs
node tests/browser-smoke.cjs     # puis les 13 autres parcours (Playwright + Chromium)
```

| Parcours | Couvre |
|---|---|
| `browser-smoke` | navigation, relecture de la journée, vols, import, export, thèmes, mobile |
| `import-browser` | échec de lecture puis réimport, numéros de ligne, export de la journée, scénarios A/B |
| `editor-browser` | gestes de l'éditeur, migration, annulation, import/export |
| `storage-browser` | stockages par service, clics réels, migration v2 |
| `flows-browser` | centre des flux |
| `usability-browser` | repères d'ergonomie : titres, vues, contrastes |
| `sauvegarde-browser` | sauvegarde complète : export, refus atomique, restauration |
| `ateliers-browser` | ateliers de travail : saisie, calcul, planning, persistance |
| `etat-plan-browser` | état de paramétrage sur le plan, quatre états de la relecture, bascule des légendes |
| `zoom-browser` | bornes du zoom, cadrage, clavier, bridage du déplacement |
| `annexe-browser` | seconde salle d'un atelier : création, aménagement, liaisons propres |
| `reglages-browser` | barème par vol (commun, par compagnie, grille compagnie × classe), rendement, poste, échange Excel, ancien JSON converti |
| `aide-browser` | aucun pavé de texte imposé, l'aide s'ouvre sans rien déplacer, chaque « ? » se nomme |
| `excel-browser` | parcours et tableau « Qui fabrique quoi » (choisir, créer, vider, remplir une colonne, clavier, recherche, suivi dans le temps) ; classeurs ateliers et vols : export, modification, import, refus |

La relecture de la journée (`replay.js` : où en est chaque service à l'instant
t) est couverte par `tests/replay.test.cjs`, la comparaison A/B par
`tests/comparaison.test.cjs`, en tests purs. Le fil de mise en
route est couvert par `tests/demarrage.test.cjs`, en tests
purs : c'est une fonction, `etapes(etat)`, qui ne touche pas au navigateur.

**Les quatorze parcours navigateur doivent être passés avant de livrer**, pas le seul
`browser-smoke` : c'est en n'en rejouant qu'une partie qu'une régression de
navigation est partie sur la branche (voir BUG-012).

Toute correction doit s'accompagner d'un test qui **échouait avant** elle.
