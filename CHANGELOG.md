# Journal des modifications

Ce fichier retrace **chaque commit** : ce qui a changé et sur quels fichiers.
Le plus récent est en haut.

---

## 2026-09-18 — Règle du robot, dressage manuel et contenance des ateliers

Trois leviers de la feuille de route entrent dans le modèle et dans les réglages.

| Fichier | Changement |
|---|---|
| `moteur/orly.js` | `robotServi(f, cfg)` : le robot ne sert que les compagnies de `cfg.robotCompagnies` (défaut FBU, TX, FWI, CRL) ; les autres YC coûtent `cfg.ycManuel` homme-minutes au montage ; bilan avec plateaux robot / manuels ; jeu de démo relabellisé (TX305, FWI40, CRL76, TX315, FBU78) pour que la règle s'y exerce |
| `sim.js`, `index.html` | champ « Compagnies servies par le robot », curseur « Dressage manuel des autres YC », panneau « Contenance des ateliers » (une case par atelier, vide = illimitée) ; verrouillés une fois la journée lancée ; repris dans les scénarios A/B ; suivi des vols marqué robot / manuel |
| `tests/orly.test.cjs`, `tests/import-browser.cjs` | règle du robot, insensibilité à la casse, liste vide, contenance dans la capture |
| `README.md` | réglages et limites |

**Ce que la règle change à la démonstration, et qu'il faut dire.** Avec tous
les YC au robot, la démo montrait un goulot robot le matin et 58 % de vols à
l'heure. **C'était un artefact** du modèle précédent. Avec la règle de la
feuille de route, seuls trois vols du matin passent au robot ; la journée de
démonstration est à l'heure par défaut (100 %), et ce sont les leviers qui
créent la tension : robot à 200 pl/h → 83 %, cuisine réduite → retards. Les
tests ont été réécrits en conséquence, sans ajuster les données pour « faire
joli ».

Le coefficient de dressage manuel (0,35 min/plateau) est inventé, affiché comme
tel et réglable : il vaut mieux un paramètre visible qu'une constante enfouie.

**Défaut de test trouvé et corrigé** : le parcours navigateur relisait un
tableau capturé avant la modification qu'il vérifiait ; il lit désormais le
tableau à chaque assertion.

Tests : 75 unitaires et 4 parcours navigateur, tous au vert.

---

## 2026-09-18 — Scénarios A/B par rejeu complet ; BUG-003 et BUG-005 corrigés

| Fichier | Changement |
|---|---|
| `sim.js` | « Capturer A/B » **rejoue la journée entière** avec les réglages du moment (`Orly.simulerJournee`) ; tableau d'indicateurs finaux, lignes différentes surlignées, note explicite ; BUG-005 corrigé |
| `ui-model.js` | BUG-003 corrigé : chaque ligne CSV garde son numéro physique |
| `index.html`, `interface.css` | panneau « Scénarios A / B », style des lignes qui diffèrent |
| `tests/import-browser.cjs` | **nouveau** — échec de lecture puis réimport, numéro de ligne physique, A/B |
| `tests/ui-model.test.cjs` | test BUG-003, **vérifié en échec sur l'ancien code** |
| `README.md`, `BUGS.md` | scénarios, bugs clos avec preuve |

**Ce que les instantanés ne pouvaient pas faire.** Ils photographiaient un
instant ; deux captures à des heures différentes n'étaient pas comparables, et
le README le disait. Le moteur est maintenant sans aléa et rejoue une journée en
quelques dizaines de millisecondes : une capture rejoue donc **toute la
journée** avec les réglages du moment. Deux captures se comparent à conditions
égales — mêmes vols, seuls les réglages diffèrent. Réglages identiques ⇒
chiffres identiques, et la note le dit. C'est le « what-if » du cahier des
charges, enfin honnête.

Le parcours navigateur le vérifie : robot à 320 puis 560 pl/h, la ponctualité
finale monte et l'occupation du robot baisse ; retour à 320, aucune ligne ne
diffère.

**BUG-003** (numéros de ligne CSV faux avec des lignes vides) : `csvRows`
attache à chaque ligne son numéro physique, compté avant tout filtrage, fins de
ligne Windows comprises. Le test ajouté **échoue sur l'ancien `ui-model.js`**
(vérifié en le rejouant contre `git show HEAD:ui-model.js`) et passe sur le
nouveau. **BUG-005** (réimport impossible après un échec de lecture) : le
gestionnaire d'erreur vide le champ. Le test navigateur force un échec de
lecture puis resélectionne le même fichier ; **il échoue avec l'ancien
gestionnaire** (vérifié en le remettant temporairement) et passe avec le nouveau.

Tests : 73 unitaires et 4 parcours navigateur, tous au vert.

---

## 2026-09-18 — L'interface tourne sur le moteur à événements discrets

`sim.js` ne calcule plus rien. Le modèle de l'unité vit dans `moteur/orly.js`,
sur le noyau, les ressources et la mesure des étapes 1 à 3. L'interface, le
plan, l'éditeur, l'import CSV et l'export sont inchangés pour l'utilisateur ;
ce qu'ils affichent, lui, a changé de nature.

| Fichier | Changement |
|---|---|
| `moteur/orly.js` | **nouveau** — ateliers = personnes occupées par lots, robot à une place, plonge = tunnels, tampon par atelier, goulot mesuré, `simulerJournee` sans interface |
| `sim.js` | moteur à débit **supprimé** (`step`, `avancer`, `finaliser`, `staffCap`, `plongeCap`, `robotCap`, barème, jeu de démo) ; `build()` construit le modèle, `step(dt)` appelle `avancerA` ; détail d'atelier et point d'attention réécrits ; export `0.3` avec `mesures` |
| `index.html` | scripts du moteur ; « pression indicative » → « occupation mesurée » |
| `tests/orly.test.cjs` | **nouveau** — 10 régressions sur la journée rejouée sans navigateur |
| `README.md` | indicateurs redéfinis, fichiers |
| `BUGS.md` | BUG-006 écarté (code supprimé), revue du branchement |

**Ce qui change pour de vrai.** Une personne est occupée par un lot de 5
homme-minutes à la fois ; le robot dresse un vol à la fois dans l'ordre des
échéances ; l'occupation affichée est la part des personnes occupées sur les 15
dernières minutes, mesurée, sans lissage ni plancher ; le point d'attention est
**le poste où l'on attend** — lots en attente d'une personne, vols en attente du
robot, tampon plein — sans aucun seuil.

**Ce que la démo révèle maintenant** et qu'elle cachait : à 07:30, les 18
personnes du montage sont à 0 % d'occupation et **le robot à 100 % avec trois
vols en file**. Le matin est en retard à cause du robot, pas des équipes. Le
levier « cadence du robot » a enfin un effet mesurable : 200 pl/h dégrade la
ponctualité, 560 l'améliore, et un test le vérifie dans les deux sens.

**Défaut trouvé et corrigé avant le commit** : la première version du goulot
mesuré ignorait le robot, qui n'est pas un atelier ; l'interface disait
« personne n'attend » pendant que trois vols attendaient. Test ajouté.

La journée complète de démonstration se rejoue en **51 ms** sous Node, sans
aléa : rejouée deux fois, elle donne le même résultat au chiffre près. C'est ce
qui rend possible une vraie comparaison A/B de scénarios.

Ce qui ne change pas : le barème d'homme-minutes n'est pas calibré, les
contenances des tampons sont illimitées tant qu'elles ne sont pas renseignées
(`CFG.tampons`), et le résultat reste une démonstration.

Tests : 72 unitaires et 3 parcours navigateur, tous au vert.

---

## 2026-09-18 — Étape 3 : le procédé décrit en données

La gamme n'est plus codée en dur : c'est un fichier JSON validé, exécutable et
reproductible. **`sim.js` est toujours inchangé** — le raccordement à
l'interface demande des informations métier qui se travaillent en privé.

| Fichier | Changement |
|---|---|
| `moteur/procede.js` | **nouveau** — `Aleas` (tirages à graine), `validerProcede`, `Procede.simuler()` |
| `moteur/procede-exemple.json` | **nouveau** — procédé **fictif** publiable, 4 postes, 3 produits |
| `docs/PROCEDE.md` | **nouveau** — guide du format |
| `tests/procede.test.cjs` | **nouveau** — 14 régressions |
| `.gitignore` | refuse tout `moteur/procede-*.json` autre que l'exemple |
| `docs/ETUDE_OPEN_SOURCE.md`, `README.md` | avancement, fichiers, guide |

Quatre listes de même longueur décrivent une gamme, une case par étape :
`poste`, `operation`, `quantite`, `composants`. L'invariant est vérifié au
chargement.

Trois écarts assumés par rapport à ProdSim : `quantite` (lot) et `composants`
(nomenclature) sont séparés au lieu d'un unique champ `demand` surchargé ; la
validation rassemble **toutes** les anomalies avant de refuser le fichier ; les
tirages passent par un générateur à graine, si bien qu'à graine égale deux
exécutions donnent exactement le même résultat — un test compare deux résultats
complets.

Un contrôle évite un blocage certain : un lot ne peut pas être plus grand que
le tampon du poste, sinon les unités s'y accumulent sans jamais atteindre le
compte.

**Deux défauts du validateur trouvés par les tests et corrigés avant le
commit** : une anomalie sur les postes court-circuitait tout le contrôle des
gammes, et un poste inconnu faisait sauter les contrôles du reste de l'étape.
Les deux contredisaient l'intention annoncée — tout signaler d'un coup.

L'exemple fictif, sur 240 minutes : `dressage` occupé à 98,2 % et bloquant son
amont 20,5 % du temps, 312 plateaux terminés, traversée moyenne 31,5 min pour
5,8 min d'opérations. Le goulot est désigné par la mesure, sans seuil choisi à
la main — à comparer avec `goulotCourant()` de `sim.js` et ses `0,55` et `4`.

Confidentialité : seul l'exemple fictif est publié ; vérifié qu'un
`moteur/procede-ory.json` est invisible pour Git et que l'exemple reste visible.

Limite connue, écrite dans le code et le guide : une place est prise avant les
unités et les composants, donc une rupture durable de composant immobilise les
places au lieu de ralentir. Comportement de ProdSim, voulu.

Tests : 62 unitaires, tous au vert. Parcours navigateur au vert.

---

## 2026-09-18 — Étape 2 : ressources, tampons, niveaux et mesure

**`sim.js` est inchangé.** Le nouveau moteur a maintenant de quoi exprimer un
poste occupé et un tampon plein, mais la gamme est encore codée en dur : le
brancher attend l'étape 3.

| Fichier | Changement |
|---|---|
| `moteur/ressources.js` | **nouveau** — `Ressource` (places entières, file par priorité), `Tampon` (contenance finie, dépôt bloquant, prise filtrée), `Niveau` (quantité continue) |
| `moteur/mesure.js` | **nouveau** — `Moniteur` de niveau (pondéré par le temps) et de comptage |
| `tests/ressources.test.cjs` | **nouveau** — 12 régressions |
| `tests/mesure.test.cjs` | **nouveau** — 6 régressions |
| `docs/ETUDE_OPEN_SOURCE.md` | section « Étape 2 » : démonstration chiffrée, écarts assumés |
| `README.md` | fichiers et statut |

**Le blocage amont existe enfin, et il est chiffré.** Un test compare deux
exécutions qui ne diffèrent que par la contenance du tampon intermédiaire. Deux
postes en série, le second cinq fois plus lent, dix articles :

| | tampon illimité | tampon d'une place |
|---|---:|---:|
| Articles produits, dernier fini | 10, à 51 min | 10, à 51 min |
| Minutes où le poste rapide tient sa place | **10** | **41** |
| Part du temps où le tampon bloque l'amont | 0 | 0,16 |

Le poste rapide ne travaille que 10 minutes dans les deux cas. Les 31 minutes
d'écart ne sortent d'aucune formule : elles sortent du modèle. C'est le
mécanisme de goulot que `sim.js` ne sait pas produire.

**La mesure remplace le lissage.** `Ressource.tauxOccupation()` est l'intégrale
des places occupées divisée par la durée et la capacité : un poste occupé 30
minutes sur 100 rend exactement 0,3, sans plancher `Math.max(u, 0.97)`. Les
moniteurs distinguent les grandeurs qui durent (pondérées par le temps) des
valeurs par objet, comme dans salabim. `Tampon.partBloquante()` et
`Niveau.partEnRupture()` donnent deux indicateurs de goulot sans heuristique.

Écarts assumés par rapport à SimPy, tous documentés dans le code : `liberer`
agit immédiatement au lieu de produire un événement, et couvre aussi l'abandon
d'une demande restée en file ; pas de préemption ; files de tampon et de niveau
dans l'ordre d'arrivée, la priorité étant portée par `Ressource`.

Chargés dans un navigateur, les trois fichiers exposent `MoteurNoyau`,
`MoteurMesure` et `MoteurRessources` ; `ressources.js` refuse de se charger
avant les deux autres avec un message explicite.

Tests : 48 unitaires (11 `ui-model` + 19 `noyau` + 6 `mesure` + 12
`ressources`), tous au vert. Parcours navigateur au vert.

---

## 2026-09-18 — Étape 1 : noyau à événements discrets

Premier code du nouveau moteur. **`sim.js` est inchangé** : rien n'est encore
branché sur l'interface, le noyau seul ne sait pas exprimer un poste occupé ni
un tampon plein.

| Fichier | Changement |
|---|---|
| `moteur/noyau.js` | **nouveau** — `Environnement`, `Evenement`, `Delai`, `Processus`, `tousDe`/`unDe`, `interrompre`, `FilePriorite` |
| `tests/noyau.test.cjs` | **nouveau** — 19 régressions |
| `docs/ETUDE_OPEN_SOURCE.md` | section « Avancement » : partis pris, défauts corrigés, limite documentée, débit mesuré |
| `README.md` | noyau et tests ajoutés au tableau des fichiers |

Quatre partis pris, tous pris contre ce que fait uia-simjs : les erreurs de
modèle **remontent** au lieu d'être rattrapées et affichées ; l'ordre des
événements simultanés est totalement déterminé par `(instant, priorité, rang de
création)`, donc reproductible ; `avancerA(t)` traite l'instant `t` inclus puis
cale l'horloge, de sorte que des appels successifs ne rejouent ni ne sautent
rien ; aucune dépendance et aucune sortie console.

**Deux défauts trouvés par les tests et corrigés avant le commit** : un
processus interrompu avant le démarrage de son générateur était tué par une
erreur non rattrapable — l'interruption est désormais refusée explicitement,
comme dans SimPy ; et un processus achevé pouvait être relancé par son amorce.

Limite assumée et documentée : l'événement attendu par un processus interrompu
reste programmé et peut tirer l'horloge jusqu'à son instant. Même comportement
que SimPy.

Débit mesuré : 120 000 événements en 268 ms sous Node, soit environ 450 000
événements par seconde.

Tests : 30 unitaires (11 `ui-model` + 19 `noyau`), tous au vert.

---

## 2026-09-18 — Étude des moteurs de simulation open source

Ajout de **`docs/ETUDE_OPEN_SOURCE.md`** : lecture et évaluation de quatre
moteurs open source, licences vérifiées dans les fichiers, et conclusion sur ce
que notre moteur doit leur emprunter.

| Fichier | Changement |
|---|---|
| `docs/ETUDE_OPEN_SOURCE.md` | **nouveau** — étude comparative et chemin proposé |
| `README.md` | lien vers l'étude |

Projets lus : **SimPy** 4.1.2 (MIT), **ProdSim** (MIT), **uia-simjs**
(Apache-2.0), **salabim** (MIT annoncé mais **aucun fichier de licence** dans
le dépôt — à ne pas recopier en l'état). Aucun projet en GPL/AGPL : tous
compatibles avec une adaptation privée.

Trois limites de `sim.js` documentées avec leur cause dans le code : travail
infiniment divisible (`capLeft` en homme-minutes), absence de tampon donc
absence de blocage amont, et taux de charge cosmétique (`st.util` lissé
0,82/0,18 avec plancher `Math.max(u, 0.97)`).

Conclusion : un moteur à événements discrets **en JavaScript, dans le
navigateur**, est réaliste — noyau inspiré d'uia-simjs, ressources transposées
de SimPy, procédé décrit en données à la ProdSim, mesure à la salabim. Aucun
code n'a encore été écrit : cette note est une étude.

---

## 2026-09-18 — Purge de l'historique (réécriture + force-push)

**Opération destructive, réalisée sur accord explicite.** L'historique des
quatre branches a été réécrit pour supprimer définitivement le plan de l'unité
et les captures qui le reproduisent.

```
git-filter-repo --invert-paths --path docs/MAP_ORY.xlsx --path assets --force
```

**Résultat vérifié sur un clone neuf du dépôt distant**, après coup et non en
essai :

| Branche | Commits | Fichiers sensibles |
|---|---:|---:|
| `claude/factory-management-system-b1e0am` | 24 | **0** |
| `codex/interface-usage-review` | 9 | **0** |
| `codex/plan-editor-v2` | 19 | **0** |
| `codex/stockages-par-service` | 21 | **0** |

Dépôt de 4,6 Mo à 400 Ko. Aucun commit perdu, tous les travaux conservés.
Après réécriture : 11 tests unitaires et les 3 parcours navigateur passent.

Une **sauvegarde locale** de l'état d'avant purge a été faite avant l'opération
(`plan-prive/sauvegarde-avant-purge.bundle`, hors Git).

### ⚠️ Ce qui n'est PAS purgé

Les références de pull requests que GitHub conserve côté serveur **ne peuvent
pas être réécrites par un force-push**. Contrôlées sur le dépôt distant après
l'opération :

| Référence | Fichiers sensibles restants |
|---|---:|
| `refs/pull/1/head` | 24 |
| `refs/pull/2/head` | 37 |
| `refs/pull/3/head` | 37 |

**Le plan reste donc accessible par ces références.** Seul le support GitHub
peut les purger : une demande doit être déposée. Tant qu'elle n'est pas
traitée, l'exposition subsiste.

### Conséquence pour les postes de travail

Tous les SHA ont changé. **Les clones existants sont incompatibles** : il faut
re-cloner, un `git pull` ne suffit pas.

| Fichier | Modification |
|---|---|
| Historique complet | Réécrit sur les 4 branches |
| `CHANGELOG.md` | Cette entrée |

---

## 2026-09-18 — Retrait des captures d'écran reproduisant le plan

Signalé par Astra : les captures `assets/apercu*.png` reproduisent le plan de
l'unité et sont donc confidentielles au même titre que le plan lui-même.
**Constat exact, et oubli de ma part** — ces captures avaient été produites
avant la décision de confidentialité.

- **Vérification faite image par image**, et non de mémoire : je pensais que
  `apercu-forme.png` montrait l'éditeur de postes sur une trame vierge. C'est
  faux : c'est le simulateur avec le plan CAD entièrement lisible. **Les cinq
  captures sont concernées**, aucune n'est sûre.
- `assets/` supprimé du suivi Git. Ce dossier n'a jamais contenu que ces cinq
  captures et les douze tuiles du plan : rien d'utile n'est perdu. Aucun
  fichier du projet ne les référençait.
- `.gitignore` bloque désormais `assets/` et `*apercu*.png`.

**Périmètre de purge élargi et revalidé en essai à blanc** sur un clone miroir,
couvrant toutes les références et non la seule branche principale :

```
git-filter-repo --invert-paths --path docs/MAP_ORY.xlsx --path assets --force
```

Résultat : 0 fichier sensible, 0 blob, dépôt de 4,8 Mo à 396 Ko, et les quatre
branches conservées avec leurs commits (22, 9, 19 et 21).

**Deux éléments que le miroir a révélés, au-delà de ce qui était annoncé :**

- une quatrième branche, `codex/stockages-par-service` ;
- les références de pull requests `refs/pull/1..3/head`, que GitHub conserve
  côté serveur et **qu'un force-push ne peut pas réécrire**. Elles pointeront
  encore sur l'ancien historique : seul le support GitHub peut les purger.

| Fichier | Modification |
|---|---|
| `assets/apercu*.png` | **Supprimés** du dépôt (5 captures) |
| `.gitignore` | Blocage de `assets/` et `*apercu*.png` |
| `CHANGELOG.md` | Cette entrée |
## 2026-09-18 — Stockages rattachés aux services

- Les stockages ne sont plus dessinés individuellement sur le plan. Les locaux
  hors stockage et les services restent éditables.
- Cliquer sur un service ouvre une liste de stockages : ajout, nom, description
  du contenu, suppression, annulation et rétablissement. Même accès dans l’éditeur.
- Aucun catalogue d’articles, quantité ou calcul d’approvisionnement : prévu pour
  une extension ultérieure ; le moteur de simulation reste inchangé.
- Format JSON v3 : sauvegarde locale, export et import des fiches. Lecture des
  anciens formats ; les stockages existants passent dans une liste à rattacher,
  sans attribution automatique. La sauvegarde v2 n’est pas écrasée.
- Correction des BUG-001, BUG-002 et BUG-004 : fermeture du détail pendant la
  simulation, clic réel sur le plan, sélection des boutons même en pause.
- Fichiers : `plan-editor.js`, `sim.js`, `index.html`, `editor.css`, guide de
  l’éditeur, registre des bugs et tests.
- Vérifications : 11 tests purs ; parcours navigateur du simulateur, de l’éditeur
  et des stockages (migration, saisie, historique, export, rechargement, mobile).
- Le fond privé et son repli en cas d’absence sont conservés. La purge de
  confidentialité reste une intervention distincte.

## 2026-09-18 — Éditeur de plan : dessin, locaux et historique

**Problème :** corriger le plan détaillé exigeait de retoucher des zones fixes,
avec de petites poignées, peu d’aide au placement et aucune annulation.

- Espace d’édition dédié : tableau de bord masqué, plan agrandi, simulation en
  pause ; outils Sélection, Rectangle, Polygone et Main.
- Création de locaux, chambres froides, équipements et circulations. Les
  stockages déjà annotés sont repris comme objets éditables. Les nouveaux objets
  restent des annotations et ne créent pas de ressources dans le moteur.
- Liste recherchable des zones, centrage de la sélection, noms, catégories et
  couleurs ; masquage et verrouillage indépendants.
- Huit poignées de rectangle, sommets et insertion de points pour les polygones.
  Les poignées gardent une taille constante à l’écran quelle que soit l’échelle.
- Redessin du contour d’un atelier, conversion rectangle/polygone, duplication
  et suppression des annotations. Un atelier du moteur ne peut pas être supprimé.
- Historique Annuler / Rétablir de 80 actions dans la session, un glisser comptant
  pour une action ; créations, propriétés, suppressions et imports inclus.
- Échap annule le geste en cours ; Entrée ou clic sur le premier sommet termine
  un contour ; Retour arrière retire le dernier sommet en cours de tracé.
- Espace + glisser, outil Main et bouton central pour déplacer la vue ; flèches
  pour ajuster la position ; raccourcis V/R/P/H, Ctrl/Cmd Z et Ctrl/Cmd D.
- Aimantation aux bords/sommets voisins avec guides, grille optionnelle de 20
  unités de dessin, Alt pour suspendre l’aimantation et Maj pour contraindre un tracé.
- Opacité du fond réglable ; libellés abrégés sur les petites zones, nom complet
  dans la liste et au survol ; interface adaptée au thème sombre et au mobile.
- Sauvegarde locale v2 avec copie précédente, export complet et import atomique.
  Les anciennes positions et exports sont repris, sans effacer l’ancienne clé.
  Une erreur d’import conserve le plan courant ; une erreur de stockage est signalée.
- Confirmation terrain explicite, distincte du déplacement d’une forme. Les
  coordonnées restent celles du dessin et ne sont pas présentées comme des mètres.
- Guide d’utilisation ajouté et tests couvrant les gestes de dessin, l’historique,
  le verrouillage, la migration, les exports et les erreurs d’import.

**Intégration avec les changements parallèles :** conservation de l’accueil,
de l’éditeur `postes/`, du registre `BUGS.md` et du retrait du fond de plan public.
Le fond reste chargé uniquement depuis `plan-prive/`, ignoré par Git.

**Fichiers :** `plan-editor.js`, `editor.css`, intégration dans `sim.js` et
`index.html`, `README.md`, `docs/EDITEUR_PLAN.md`, `tests/plan-editor.test.cjs`,
`tests/editor-browser.cjs` et adaptation de `tests/browser-smoke.cjs`.

---

## 2026-09-18 — Retrait du plan de l'unité du dépôt public

Le dépôt est public : le plan de l'unité ne doit pas y figurer. Il se
travaillera en privé, comme les exports de vols.

- **Supprimés du suivi Git** : `docs/MAP_ORY.xlsx` et les 12 tuiles
  `assets/plan/tuile*.png`.
- Le simulateur charge désormais le fond depuis **`plan-prive/`**, dossier
  local ignoré par Git. **Sans ce dossier, l'application fonctionne
  normalement** : zones, simulation et indicateurs inchangés ; la case
  *Fond de plan* est désactivée et signalée « (absent) ».
- **`.gitignore`** bloque `plan-prive/`, `prive/`, `*.xlsx`, `vols*.csv` et
  tout fichier contenant « winrest ».
- README : section *Données confidentielles*, et marche à suivre pour
  réafficher le fond en local.

**Vérifié** dans les deux cas : avec le plan en local il s'affiche ; sans lui,
les 11 zones restent dessinées, la simulation tourne et aucune erreur n'est
levée.

**Aucun export de vols réel n'était présent** dans le dépôt : les vols
embarqués sont fictifs. Les coordonnées des zones et des tuiles restent dans
le code — ce sont des nombres, pas le dessin.

> ⚠️ **Cette suppression ne purge pas l'historique Git.** Les fichiers restent
> accessibles dans les commits antérieurs d'un dépôt public. Voir la note dans
> le README pour les options (réécriture d'historique, ou dépôt privé).

| Fichier | Modification |
|---|---|
| `docs/MAP_ORY.xlsx`, `assets/plan/*` | **Supprimés** du dépôt |
| `.gitignore` | Règles pour les données confidentielles |
| `sim.js` | Fond chargé depuis `plan-prive/`, absence gérée proprement |
| `README.md` | Section *Données confidentielles* |
| `CHANGELOG.md` | Cette entrée |

---

## 2026-09-18 — Page d'accueil des applications

GitHub Pages est **activé** et le déploiement est **passé** (« pages build and
deployment », conclusion `success`, sur le commit `b8e34a4`). Vérifié via
l'historique des exécutions GitHub : le proxy de l'environnement de
développement bloque `github.io`, les adresses n'ont donc pas pu être testées
par requête directe.

Ajout de **`accueil.html`** : un point d'entrée unique listant les
applications, avec la règle pour ouvrir n'importe quel autre fichier du dépôt
et le rappel que le dépôt est public. Un seul lien à mettre en favori.

| Fichier | Modification |
|---|---|
| `accueil.html` | **Nouveau** — point d'entrée des applications |
| `README.md` | Adresse de l'accueil et règle de conversion des chemins |
| `CHANGELOG.md` | Cette entrée |

---

## 2026-09-18 — Ouverture des applications depuis GitHub

Pour éviter de télécharger et dézipper le dépôt à chaque essai : mode d'emploi
de **GitHub Pages**, qui sert le dépôt tel quel.

Vérifié avant d'écrire : le dépôt est **public** (`visibility: public`) et sa
branche par défaut est déjà la branche de travail — Pages peut donc la servir
sans rien réorganiser. L'activation elle-même se fait dans les réglages du
dépôt et ne peut pas être faite depuis le code.

- Ajout de **`.nojekyll`** : les fichiers sont servis tels quels, sans
  traitement Jekyll.
- README : marche à suivre, adresses des deux applications, et solution de
  dépannage ponctuel via `raw.githack.com`.
- **Point signalé** : le dépôt étant public, le plan d'architecte de l'unité
  (`docs/MAP_ORY.xlsx`, `assets/plan/`) est accessible à tous, et Pages le
  rendrait consultable dans un navigateur. Arbitrage à faire.

| Fichier | Modification |
|---|---|
| `.nojekyll` | **Nouveau** — désactive Jekyll sur GitHub Pages |
| `README.md` | Section d'ouverture depuis GitHub et avertissement dépôt public |
| `CHANGELOG.md` | Cette entrée |

---

## 2026-09-18 — Postes : lignes robot, stockages, assemblages

- **Mode jour/nuit retiré** de l'éditeur de postes : thème clair unique.
- **Nouvelle famille « ligne robot »** : une chaîne découpée en **modules**
  mis bout à bout, chacun avec son nom, sa longueur et son débit. Le débit de
  la ligne est le **minimum des modules** et le **module limitant** est nommé.
  La forme découle des modules, donc les outils Carreaux n'y s'appliquent pas.
- **Deux familles de stockage** : **desserte roulante** (défaut 70 × 50 cm) et
  **trolley** (défaut 80 × 45 cm), avec capacité et roulettes. Leur géométrie
  est en **centimètres**, pas en carreaux : une desserte de 70 cm ne tombe pas
  sur la trame de 50, et l'y forcer fausserait l'encombrement. Ces dimensions
  par défaut sont indicatives et à corriger.
- **Assemblages** : composer plusieurs modèles sur un même plan sous un nom
  propre. Ajout depuis une palette, déplacement au glisser (pas de 25 cm),
  **orientation 0/90/180/270** — carreaux, personnes et sens d'avancement
  pivotent ensemble —, retrait au clavier. Mesures cumulées. Un assemblage
  référence les modèles : modifier une table met à jour les assemblages.

**Bugs trouvés et corrigés pendant le développement :**

- créer ou dupliquer un modèle ou un assemblage n'enregistrait pas ; l'objet
  était perdu au rechargement s'il n'avait pas été modifié ensuite ;
- `display:flex` sur les barres d'outils annulait l'attribut `hidden` : les
  outils du mode modèle restaient visibles en mode assemblage ;
- les éléments ajoutés à un assemblage se superposaient tous au même point.

*Note de méthode : un premier test de persistance était faux — il effaçait le
stockage à chaque chargement, rechargement compris, et ne prouvait donc rien.*

| Fichier | Modification |
|---|---|
| `postes/postes.js` | Cinq familles, rotation, assemblages, corrections ci-dessus |
| `postes/index.html` | Onglets Modèles/Assemblages, palette, outils, thème retiré |
| `postes/postes.css` | Thème clair unique, familles de couleurs, `[hidden]` |
| `postes/README.md` | Familles, assemblages, format d'échange étendu |
| `CHANGELOG.md` | Cette entrée |

---

## 2026-09-18 — Éditeur de postes : thème système, export et copie

- **Thème** : sans choix explicite du visiteur, la préférence système
  s'applique (bloc `prefers-color-scheme` en plus du marquage `data-theme`).
  Le bouton reflète le thème réellement affiché au lieu d'en imposer un.
- **Hauteur** en `100%` plutôt que `100vh`, pour respecter les marges de
  sécurité sur mobile.
- **Export** : passe par la capacité `downloads` de la plateforme quand la
  page est publiée (le téléchargement direct y est inerte), et retombe sur le
  téléchargement classique en local. Un refus du visiteur n'affiche pas
  d'erreur.
- **Nouveau bouton « Copier le JSON »**, qui fonctionne partout — pratique
  pour transmettre une bibliothèque sans passer par un fichier.

| Fichier | Modification |
|---|---|
| `postes/postes.css` | Bloc sombre pour la préférence système, hauteur `100%` |
| `postes/postes.js` | `themeAffiche`/`majBoutonTheme`, export via `downloads` avec repli, copie presse-papiers |
| `postes/index.html` | Bouton « Copier le JSON » |
| `CHANGELOG.md` | Cette entrée |

---

## 2026-09-18 — Éditeur de postes de travail (trame 50 cm)

**Pourquoi :** préparer la finalité du projet — composer le plan de l'unité à
partir de carreaux de 50 × 50 cm. Premier temps : une bibliothèque de modèles,
sans toucher au simulateur.

**Nouveau dossier `postes/`**, outil autonome (aucune dépendance au reste du
dépôt, aucun fichier partagé avec le simulateur).

- **Trame de 50 cm** avec règles en mètres et trait fort tous les 2 m.
- Deux familles : **table** (établi) et **chaîne** (tapis roulant, avec sens
  d'avancement affiché par des chevrons et débit en unités/heure).
- **Formes sur mesure** : un modèle est un *ensemble de carreaux*, pas un
  rectangle. Les outils ➕/➖ Carreaux permettent les formes en L, en U et les
  îlots.
- **Personnes** posées sur les bords libres du meuble, silhouette vue de dessus
  tournée vers le plan de travail ; un clic ajoute, un second retire.
- **Mesures en direct** : encombrement, carreaux occupés, surface de travail,
  emprise au sol, personnes, surface par personne, débit par personne.
- Sauvegarde navigateur, **export / import JSON** avec refus atomique des
  fichiers invalides et alerte si le fichier utilise une autre taille de carreau.

**Bug trouvé et corrigé pendant le développement :** la silhouette d'une
personne recouvrait sa zone de clic, ce qui rendait impossible de la retirer une
fois placée (`pointer-events:none` sur le dessin).

**Portée assumée, écrite dans l'outil et son README :** les débits sont des
hypothèses saisies à la main, pas des cadences mesurées ; les modèles ne sont
pas encore implantés sur le plan de l'unité ni reliés au moteur.

| Fichier | Modification |
|---|---|
| `postes/index.html` | **Nouveau** — structure de l'éditeur |
| `postes/postes.css` | **Nouveau** — thème clair/sombre, rendu vu de dessus |
| `postes/postes.js` | **Nouveau** — modèle de données, rendu SVG, interactions, import/export |
| `postes/README.md` | **Nouveau** — usage, format d'échange et limites |
| `README.md` | Renvoi vers le nouvel outil |
| `CHANGELOG.md` | Cette entrée |

---

## 2026-09-18 — Registre des bugs

**Pourquoi :** la revue de l'interface a produit six constats. Sans endroit où
les inscrire, ils seraient perdus à la fin de la conversation et réintroduits
plus tard.

**Ajout de `BUGS.md`**, registre des défauts connus, à lire avant de coder et à
compléter après chaque revue et chaque correction. Chaque entrée porte une
gravité, un statut, le fichier concerné, la cause, la preuve et une piste de
correction. Le champ **Vérification** distingue ce qui est *confirmé*
(reproduit, preuve à l'appui) de ce qui est seulement *signalé*.

**Six entrées ouvertes**, issues de la revue du diff `88ea4a9..13d86c9` :

- `BUG-001` *(majeur, confirmé)* — la garde anti-re-rendu de `majGoulotInfo`
  compare du HTML contenant un attribut nu à sa re-sérialisation par le
  navigateur : elle ne retient jamais. Le panneau est reconstruit ~60×/s
  (90 remplacements mesurés en 1,5 s) et le bouton « Fermer » est incliquable.
- `BUG-002` *(majeur, confirmé)* — cliquer une zone du plan ne la sélectionne
  pas : `setPointerCapture` redirige le `click` vers le `<svg>`. Introduit par
  le commit `4e2bf69` (Claude), donc antérieur à la refonte ; le README décrit
  pourtant ce geste comme fonctionnel.
- `BUG-003` *(mineur, confirmé)* — une ligne vide décale les numéros de ligne
  des erreurs d'import CSV.
- `BUG-004` à `BUG-006` *(mineurs, signalés non revérifiés)* — état périmé des
  boutons d'atelier, réimport impossible après échec de lecture, recalcul
  redondant de `qlen`.

Aucun correctif dans ce commit : `sim.js`, `index.html` et `interface.css` sont
en cours de modification par ailleurs. Les tests existants ne couvrent aucun de
ces bugs ; toute correction devra venir avec un test qui échouait avant.

| Fichier | Modification |
|---|---|
| `BUGS.md` | **Nouveau** — registre des bugs et règles d'usage |
| `README.md` | Renvois vers le registre |
| `CHANGELOG.md` | Cette entrée |

---

## 2026-09-18 — Revue critique de l’interface et fiabilisation de sa lecture

**Pourquoi :** l’écran privilégiait les curseurs au détriment du plan, ne
permettait pas d’identifier les vols bloqués et présentait certains résultats
de démonstration comme des indicateurs opérationnels.

**Intégration :** cette refonte prolonge le commit `88ea4a9` de Claude. Son
marquage de démonstration, la prise en compte des inachevés, le retard courant
sur les dossiers exigibles et `docs/FEUILLE_DE_ROUTE.md` sont conservés. Le taux
est désormais strictement limité aux échéances atteintes, même si un dossier
futur est déjà terminé. Le retard des terminés est présenté séparément.

**Interface et parcours :**
- Plan agrandi avec un seul panneau contextuel : Suivi, Réglages et Données.
- Bandeau de provenance du jeu chargé, statut Prototype et accès aux limites.
- Indicateurs prioritaires en haut de page, sélection d’atelier depuis le plan,
  une liste ou les barres, détail des OF dans le panneau Suivi.
- Vue Suivi des vols : recherche, filtres, départ, échéance, statut de production
  et opérations restantes ; état explicite lorsqu’aucun résultat ne correspond.
- Mise en page adaptée aux petits écrans, focus visibles, commandes nommées,
  zones activables au clavier et animations réduites selon la préférence système.
- Édition du plan séparée de la lecture ; entrée en édition mettant en pause,
  sortie annulant les tracés en cours et ne relançant pas le calcul.

**Fiabilité des indications et interactions :**
- Pourcentage de dossiers prêts à temps calculé sur les départs à échéance
  atteinte, incluant les dossiers inachevés ; « — » sans échéance atteinte.
- Compteur distinct des échéances dépassées avec dossier non prêt ; retard
  moyen explicitement limité aux dossiers terminés.
- Retrait des activités artificielles Magasin/Duty/Handling ; services non
  calculés identifiés, curseurs sans effet désactivés.
- Indice de charge renommé Pression indicative ; ordres en attente ou traitement
  distingués d’une file d’attente pure. Échelles des deux courbes précisées.
- Réglages figés pendant un essai, y compris en pause ; recommencer les libère.
- Réinitialisation de l’accumulateur, du débit et de l’historique ; annulation
  du callback d’animation lors d’une pause pour éviter plusieurs boucles actives.
- Calcul par pas fixes de 30 secondes simulées, indépendants des images et de
  la vitesse de lecture ; fin exactement à 23 h. Jetons toujours illustratifs.
- Instantanés A/B renommés et horodatés ; entrées/configuration conservées,
  heures différentes signalées, remise à zéro lors d’un changement de jeu.

**Import, export et plan :**
- Modèle CSV téléchargeable, en-têtes explicites, gestion des séparateurs et
  guillemets, contrôles des horaires, quantités, sens et doublons.
- Refus atomique avec erreurs détaillées ; absence d’horaire jamais remplacée
  silencieusement. Taille maximale de 2 Mo et mention de l’absence d’import XLSX.
- Confirmation avant remplacement d’un essai commencé ; rechargement de la démo.
- Échappement des valeurs importées avant affichage HTML.
- Export versionné avec provenance, entrées, configuration, statut de
  démonstration, limites, instantanés et états des dossiers ; retard nul au sens
  JSON (`null`) tant que le dossier n’est pas terminé.
- Déplacement ou conversion d’une zone ne supprimant plus le statut À confirmer.
- Validation atomique des géométries JSON ; sauvegardes locales invalides
  signalées et retour aux positions par défaut.

**Documentation et contrôle :** README réécrit pour décrire le comportement
réel, audit d’usage ajouté, tests de non-régression Node et parcours Chromium.
Les standards de travail, calendriers J−1/J−2, stocks et règles robot ne sont
pas calibrés ou intégrés par ce changement ; cette limite est visible dans l’UI.

| Fichier | Modification |
|---|---|
| `index.html` | Structure, parcours, vues et libellés |
| `interface.css` | Hiérarchie visuelle, panneaux, responsive et accessibilité |
| `sim.js` | Navigation, interactions, rendu, états, export, édition et boucle |
| `ui-model.js` | Import CSV et règles de présentation testables |
| `tests/ui-model.test.cjs` | Tests purs d’import et d’indicateurs |
| `tests/browser-smoke.cjs` | Parcours navigateur et contrôles de présentation |
| `README.md` | Utilisation, formats, limites et vérification |
| `docs/AUDIT_INTERFACE.md` | Constats, corrections et limites de la revue |

---

## 2026-09-17 — Marquage « démonstration » et correction du taux de service

**Contexte :** revue technique externe (feuille de route ChatGPT/Astra,
ticket n° 2). Ses critiques ont été vérifiées dans le code : elles sont
exactes.

**Bug corrigé — l'indicateur de service était trompeur.** `kpis()` calculait
`ontime = prets.length ? … : 100` :

- il affichait **100 %** quand *aucun* vol n'était terminé ;
- les vols **non terminés dont l'échéance était dépassée** étaient exclus du
  dénominateur, donc une dégradation devenait invisible.

Désormais, un vol compte dès qu'il est **exigible** (échéance atteinte) :
terminé à temps, terminé en retard, ou **non terminé et en retard**. Sans vol
exigible, l'indicateur affiche **`n/a`** et non un succès. Le **dénominateur est
affiché** (`3 / 7 vols exigibles`), ainsi que le nombre d'inachevés.

*Démonstration :* effectifs à zéro, 12 h 20 → l'ancienne version affichait
**100 %**, la nouvelle affiche **0 % — 0/7 vols exigibles, 7 inachevés**.

**Clarification :** l'indicateur mesure la **disponibilité au frigo handling**
avant `heure_std − délai de chargement`, pas la ponctualité de départ de
l'avion. Renommé « Prêts à l'échéance ».

**Marquage du statut de démonstration :**

- Badge permanent **« ⚠️ DÉMONSTRATION — non calibré »** dans l'en-tête.
- Panneau listant les limites connues (coefficients inventés, robot appliqué à
  tous les YC, absence de J−1/J−2, effectifs sans horaires ni compétences,
  stockages non limitants, captures A/B non comparables).
- Avertissement sur les captures A/B et dans l'export JSON.
- README : encadré de statut en tête ; **suppression du tableau de résultats
  chiffrés**, qui donnait une apparence de validation métier.

**Fichiers :**

| Fichier | Modification |
|---|---|
| `sim.js` | `etatVol()`, réécriture de `kpis()` (exigibles / inachevés / `n/a`), affichage des dénominateurs, avertissement dans l'export |
| `index.html` | Badge de démonstration, panneau des limites, sous-libellés des KPI, avertissement A/B, styles associés |
| `docs/FEUILLE_DE_ROUTE.md` | **Nouveau** — revue technique et feuille de route du projet |
| `README.md` | Encadré de statut, définition précise des indicateurs, retrait du tableau de résultats |
| `CHANGELOG.md` | Cette entrée |

---

## 2026-09-17 — Formes libres pour les zones + ce journal (`0d7f7d2`)

**Ce qui change :** les zones ne sont plus limitées à des rectangles. Chaque
zone peut devenir une **forme libre** (polygone) pour épouser la géométrie
réelle des locaux.

- **Convertir** un rectangle en forme libre (et inversement) en un clic.
- **Tracer une forme** : on clique les sommets un par un, double-clic ou
  `Entrée` pour fermer, `Échap` pour annuler.
- **Déplacer un sommet** en le glissant ; bouton **`+`** au milieu de chaque
  segment pour **ajouter** un point ; **`Alt`+clic** sur un sommet pour le
  **supprimer** (minimum 3 points).
- Les libellés, jauges de charge et flèches de flux se placent d'après la
  **boîte englobante** de la forme.
- Redimensionner ou saisir largeur/hauteur **met la forme à l'échelle**.
- Les points sont **sauvegardés et exportés** avec le reste de la géométrie.
- Ajout de ce journal, tenu à jour à chaque commit.

**Fichiers :**

| Fichier | Modification |
|---|---|
| `sim.js` | Géométrie polygonale (`estPoly`, `boite`, `syncBoite`, `deplacerZone`, `appliquerBoite`, `dZone`), rendu de la zone en `<path>`, poignées de sommets et d'ajout, tracé de polygone, conversions, export/import des points |
| `index.html` | Sélecteurs CSS `.fond` (au lieu de `rect.fond`), styles des poignées de sommet / d'ajout / de tracé, boutons « Tracer une forme » et « Convertir » |
| `CHANGELOG.md` | **Nouveau** — ce journal |
| `README.md` | Documentation des formes libres |

---

## 2026-09-17 — Mode édition des zones (`d3c0c46`)

**Ce qui change :** la taille et l'emplacement des zones ne sont pas
déductibles du plan source — l'exploitant peut désormais les poser lui-même.

- Bouton **« Éditer les zones »** : sélection sur le plan ou via une liste,
  déplacement par glisser, redimensionnement par les 4 coins.
- Saisie numérique X / Y / largeur / hauteur, outil **« Redessiner »**.
- Les poignées s'adaptent au niveau de zoom.
- Une zone modifiée perd son marquage « emplacement à confirmer ».
- **Sauvegarde automatique** dans le navigateur, **export / import / copie
  JSON**, réinitialisation par zone ou globale.
- Refactorisation : la géométrie est appliquée en place (`positionnerZone`) et
  les arêtes de flux recalculées sans reconstruire le plan.

**Fichiers :** `sim.js`, `index.html`, `README.md`, `assets/apercu-edition.png`

---

## 2026-09-17 — Le vrai plan d'architecte en fond (`4e2bf69`)

**Ce qui change :** correction d'une **erreur de fond**. La version précédente
utilisait les rectangles d'**ancrage des étiquettes** du fichier Excel, et non
la géométrie des locaux : le résultat ne ressemblait pas au plan réel.

- Le fond est désormais **le plan d'architecte lui-même** : les 12 tuiles du
  fichier source sont extraites et repositionnées.
- **Calibrage** de la grille du classeur (colonne 82 px, ligne 14,4 pt) ajusté
  numériquement sur les 12 tuiles → fond et zones alignés *par construction*.
- **Zoom** (molette + boutons) et **déplacement** par glisser ; au-delà de
  ~170 %, les libellés des chambres froides apparaissent.
- Case **« Fond de plan »** pour masquer le CAD et ne garder que les flux.
- En thème sombre, le plan est **inversé** pour rester lisible.
- Les 4 zones non annotées (Quais/Réception, Réception/Appros, Cuisine,
  Plonge) sont signalées **en pointillés**.

**Fichiers :** `sim.js`, `index.html`, `README.md`, `assets/plan/tuile1-12.png`
(**nouveaux**), `assets/apercu*.png`

---

## 2026-09-17 — Thème clair à fort contraste (`b65dac2`)

**Ce qui change :** le thème sombre manquait franchement de contraste (texte
gris 8-9 px sur fond bleu nuit, libellés du plan illisibles).

- **Thème clair « plan » par défaut** : texte quasi-noir sur surfaces claires,
  bordures franches, libellés agrandis.
- Zones colorées par niveau de charge (vert / ambre / rouge) et chambres
  froides en bleu contrasté.
- Thème sombre **conservé mais corrigé**, accessible par un bouton ; le choix
  est mémorisé.
- Couleurs pilotées par **variables CSS** : plus de valeurs codées en dur dans
  le JS.

**Fichiers :** `index.html`, `sim.js`, `README.md`, `assets/apercu*.png`

---

## 2026-09-17 — Plan reconstruit depuis la carte Orly (`fd4dec1`)

**Ce qui change :** premier usage du fichier `MAP_ORY.xlsx` fourni.
⚠️ Approche ensuite corrigée (voir `4e2bf69`) : les coordonnées utilisées
étaient celles des étiquettes, pas des locaux.

- Zones placées aux coordonnées extraites du fichier.
- Ateliers renommés d'après les libellés réels (Montage, Légumerie, Duty free…).
- Chambres froides, congélateurs et aires de stockage dessinés.
- Carte source versionnée en référence.

**Fichiers :** `sim.js`, `index.html`, `README.md`, `docs/MAP_ORY.xlsx`
(**nouveau**)

---

## 2026-09-17 — Simulation des flux Newrest Orly (`ef48d94`)

**Ce qui change :** pivot depuis la maquette générique vers le vrai sujet —
la simulation des flux d'une unité de catering aérien.

- Plan 2D animé, graphe de flux et **tokens** circulants.
- **Moteur** de flux à stations alimenté par man-minutes + données de vols,
  avec précédences, robot de dressage YC et plonge à tunnels.
- Dashboard temps réel : vols à l'heure, retard moyen, débit, WIP, charge par
  atelier, courbe de la journée.
- Leviers **what-if** (effectifs, cadence robot, tunnels, horaires), scénarios
  A/B, import `vols.csv`, export JSON.
- Jeu de données d'exemple embarqué (vague matin + vague soir).

**Fichiers :** `sim.js` (**nouveau**), `index.html`, `README.md` ;
**supprimés** : `css/styles.css`, `js/data.js`, `js/main.js`, `js/sim.js`,
`js/state.js`, `js/ui.js`

---

## 2026-09-17 — UsineSim, maquette initiale (`ba6a1a6`)

**Ce qui change :** premier jet — un simulateur de gestion d'usine générique
(ateliers, machines, personnel, cadences, stockage), avant que le sujet réel
ne soit précisé.

**Fichiers :** `index.html`, `css/styles.css`, `js/data.js`, `js/state.js`,
`js/sim.js`, `js/ui.js`, `js/main.js`, `README.md`, `.gitignore`
