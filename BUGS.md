# Registre des bugs

**À consulter avant de commencer à travailler. À compléter après chaque revue
de code et après chaque correction.**

Ce fichier est la mémoire des défauts connus du projet. Il survit aux
conversations : un bug qui n'est pas écrit ici est un bug qui sera réintroduit.

## Règles d'usage

1. **Avant de coder** : lire ce fichier. Un bug ouvert dans le fichier que vous
   allez modifier se corrige en même temps, ou se signale dans la PR.
2. **Après une revue** : y inscrire chaque constat, même mineur, même non
   corrigé. Un constat non écrit est perdu.
3. **Après une correction** : passer l'entrée en `Corrigé`, indiquer le commit
   et **la vérification faite**. Ne jamais fermer une entrée sans preuve.
4. **Honnêteté du statut** : distinguer ce qui est *prouvé* de ce qui est
   *supposé*. Le champ « Vérification » sert à ça.

### Conventions

| Champ | Valeurs |
|---|---|
| **Gravité** | `Bloquant` · `Majeur` · `Mineur` · `Performance` |
| **Statut** | `Ouvert` · `En cours` · `Corrigé` · `Écarté` |
| **Vérification** | `Confirmé` (reproduit, preuve à l'appui) · `Signalé` (rapporté, non revérifié) |

Identifiants : `BUG-001`, `BUG-002`… jamais réutilisés, même après correction.

---

## Vue d'ensemble

| ID | Gravité | Statut | Vérif. | Résumé | Fichier |
|---|---|---|---|---|---|
| BUG-001 | Majeur | Corrigé | Confirmé | Panneau de détail reconstruit ~60×/s, bouton « Fermer » incliquable | `sim.js:942` |
| BUG-002 | Majeur | Corrigé | Confirmé | Cliquer une zone du plan ne la sélectionne pas | `sim.js:483` |
| BUG-003 | Mineur | Ouvert | Confirmé | Numéros de ligne CSV faux dès qu'une ligne est vide | `ui-model.js:52` |
| BUG-004 | Mineur | Corrigé | Signalé | Boutons d'atelier à l'état périmé après sélection | `sim.js:700` |
| BUG-005 | Mineur | Ouvert | Signalé | Réimport impossible après un échec de lecture | `sim.js:1095` |
| BUG-006 | Performance | Ouvert | Signalé | Recalcul redondant de `qlen` à chaque pas | `sim.js:280` |

---

## BUG-001 — Panneau de détail reconstruit en continu

- **Gravité** : Majeur · **Statut** : Corrigé · **Vérification** : Confirmé
- **Fichier** : `sim.js:942` (`majGoulotInfo`)
- **Détecté** : 2026-09-18, revue de code du diff `88ea4a9..13d86c9`

**Symptôme.** Pendant que la simulation tourne, le bouton « Fermer » du panneau
de détail d'atelier est incliquable : le clic n'aboutit jamais et la zone reste
sélectionnée.

**Cause.** La garde anti-re-rendu compare une chaîne générée à `el.innerHTML` :

```js
html = '… <button class="btn" data-clear-selection>Fermer</button> …';
if (el.innerHTML !== html) el.innerHTML = html;
```

Le navigateur re-sérialise l'attribut nu `data-clear-selection` en
`data-clear-selection=""`. Les deux chaînes ne sont **jamais** égales, donc la
garde ne retient rien et le DOM est remplacé à chaque rafraîchissement. Le
bouton est détruit puis recréé entre le `mousedown` et le `mouseup`, ce qui
empêche l'événement `click` de se produire.

**Preuve.** 90 remplacements DOM mesurés en 1,5 s (MutationObserver) ; le clic
Playwright sur `[data-clear-selection]` expire ; la zone reste sélectionnée.

**Piste de correction.** Écrire l'attribut sous sa forme sérialisée
(`data-clear-selection=""`) pour que la comparaison soit exacte, ou mieux :
comparer une clé d'état (id de zone + nombre d'OF) plutôt que du HTML.


**Correction :** commit « Rattache les stockages aux services ». Vérifié par
`tests/storage-browser.cjs` : clic souris réel, état du bouton en pause et
fermeture avec clic maintenu pendant la simulation.

---

## BUG-002 — Cliquer une zone du plan ne la sélectionne pas

- **Gravité** : Majeur · **Statut** : Corrigé · **Vérification** : Confirmé
- **Fichier** : `sim.js:483` (`initInteractions`), écouteur concerné `sim.js:407`
- **Introduit par** : commit `4e2bf69` (ajout du zoom/déplacement) — **Claude**
- **Détecté** : 2026-09-18, revue de code

**Symptôme.** Hors mode édition, cliquer un atelier sur le plan ne le
sélectionne pas, alors que le README annonce « sélectionner un atelier depuis
le plan ». Le contournement (sélecteur « Atelier ») fonctionne, ce qui a masqué
le défaut.

**Cause.** `svg.setPointerCapture(e.pointerId)` est appelé au `pointerdown` pour
gérer le déplacement du plan. La capture de pointeur **redirige l'événement
`click` vers l'élément capteur** (`<svg>`) : l'écouteur posé sur chaque zone
(`sim.js:407`) n'est donc jamais déclenché.

**Preuve.** Avec un vrai clic souris, la cible du `click` est `svg` et
`selection` reste `null`. Avec des événements synthétiques — qui n'établissent
pas de capture — la sélection fonctionne normalement.

**Piste de correction.** Ne capturer le pointeur qu'une fois un déplacement
réellement engagé (seuil de quelques pixels), ou sélectionner la zone depuis le
gestionnaire `pointerdown` au lieu de s'appuyer sur `click`.


**Correction :** commit « Rattache les stockages aux services ». Vérifié par
`tests/storage-browser.cjs` : clic souris réel, état du bouton en pause et
fermeture avec clic maintenu pendant la simulation.

---

## BUG-003 — Numéros de ligne CSV faux avec des lignes vides

- **Gravité** : Mineur · **Statut** : Ouvert · **Vérification** : Confirmé
- **Fichier** : `ui-model.js:52` (`csvRows`)
- **Détecté** : 2026-09-18, revue de code

**Symptôme.** Un message de rejet désigne une mauvaise ligne : sur un fichier
dont la ligne 3 est vide et la ligne 4 fautive, l'erreur indique « Ligne 3 ».
Sur un gros export, cela envoie corriger la mauvaise ligne.

**Cause.** Les lignes vides sont retirées **avant** l'indexation, si bien que
l'indice ne correspond plus à la position physique dans le fichier.

**Piste de correction.** Conserver le numéro de ligne d'origine au moment du
découpage, avant tout filtrage.

---

## BUG-004 — Boutons d'atelier à l'état périmé

- **Gravité** : Mineur · **Statut** : Corrigé · **Vérification** : Confirmé
- **Fichier** : `sim.js:700` (`selectionner`)

`selectionner()` ne rafraîchit pas les boutons de `#stats-ateliers` : leur état
`.active` / `aria-pressed` reste faux tant que la simulation est arrêtée ou en
pause. Gêne aussi la navigation au clavier et les lecteurs d'écran.
*Rapporté par la revue automatique, non reproduit manuellement.*


**Correction :** commit « Rattache les stockages aux services ». Vérifié par
`tests/storage-browser.cjs` : clic souris réel, état du bouton en pause et
fermeture avec clic maintenu pendant la simulation.

---

## BUG-005 — Réimport impossible après un échec de lecture

- **Gravité** : Mineur · **Statut** : Ouvert · **Vérification** : Signalé
- **Fichier** : `sim.js:1095` (`rd.onerror`)

Le gestionnaire d'erreur ne remet pas `e.target.value` à vide. Resélectionner le
même fichier ne déclenche alors plus l'événement `change` : l'utilisateur croit
que l'application ne répond pas.
*Rapporté par la revue automatique, non reproduit manuellement.*

---

## BUG-006 — Recalcul redondant de `qlen`

- **Gravité** : Performance · **Statut** : Ouvert · **Vérification** : Signalé
- **Fichier** : `sim.js:280`

Un parcours complet `O(stations × jobs)` est refait à chaque pas alors que la
ligne 264 l'a déjà calculé ; seul `quais` est ajouté, toujours à 0. Sans effet
visible sur le jeu de démonstration, mais coûteux sur un CSV volumineux lu à
vitesse élevée.
*Rapporté par la revue automatique, non mesuré.*

---

## Bugs corrigés

Voir BUG-001, BUG-002 et BUG-004 ci-dessus et leur preuve de correction.

---

## Vérifier avant de livrer

```bash
node --test tests/ui-model.test.cjs     # tests purs (import CSV, indicateurs)
node tests/browser-smoke.cjs            # parcours navigateur (Playwright requis)
```

Ces tests **ne couvrent aucun des bugs ci-dessus** : ils sont tous passés au
travers. Toute correction doit s'accompagner d'un test qui échouait avant.

## Revue d’intégration — éditeur de plan v2

La PR #2 ajoute un éditeur distinct et ses tests de gestes réels, migration,
annulation, sauvegarde et import. Les BUG-001 à BUG-006 ci-dessus restent
ouverts : cette intégration ne prétend pas corriger les interactions du
simulateur hors édition, l’import CSV ou les performances du moteur.
Les changements parallèles de confidentialité du fond de plan sont conservés.

## Revue — stockages par service

BUG-001, BUG-002 et BUG-004 corrigés et couverts par le parcours stockages.
BUG-003, BUG-005 et BUG-006 restent ouverts : import CSV et performances hors
périmètre. Le nouveau format garde la sauvegarde v2 et ne déduit pas les services
propriétaires des stockages migrés. Vérification par tests purs et navigateur.
