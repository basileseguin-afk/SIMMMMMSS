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
| BUG-003 | Mineur | Corrigé | Confirmé | Numéros de ligne CSV faux dès qu'une ligne est vide | `ui-model.js:52` |
| BUG-004 | Mineur | Corrigé | Signalé | Boutons d'atelier à l'état périmé après sélection | `sim.js:700` |
| BUG-005 | Mineur | Corrigé | Confirmé | Réimport impossible après un échec de lecture | `sim.js:1095` |
| BUG-006 | Performance | Écarté | Confirmé | Recalcul redondant de `qlen` à chaque pas | `sim.js:280` (code supprimé) |

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

- **Gravité** : Mineur · **Statut** : Corrigé · **Vérification** : Confirmé
- **Fichier** : `ui-model.js:52` (`csvRows`)
- **Détecté** : 2026-09-18, revue de code

**Symptôme.** Un message de rejet désigne une mauvaise ligne : sur un fichier
dont la ligne 3 est vide et la ligne 4 fautive, l'erreur indique « Ligne 3 ».
Sur un gros export, cela envoie corriger la mauvaise ligne.

**Cause.** Les lignes vides sont retirées **avant** l'indexation, si bien que
l'indice ne correspond plus à la position physique dans le fichier.

**Piste de correction.** Conserver le numéro de ligne d'origine au moment du
découpage, avant tout filtrage.

**Correction :** commit « Scénarios A/B par rejeu complet ; BUG-003 et BUG-005
corrigés ». `csvRows` attache à chaque ligne retenue son numéro physique
(`row.ligne`), compté avant tout filtrage, fins de ligne Windows et champs
multilignes compris ; `parseFlights` l'utilise. **Preuve :** le test
`tests/ui-model.test.cjs` « BUG-003 … » **échoue contre l'ancien fichier**
(rejoué contre `git show HEAD:ui-model.js` : `not ok 7`) et passe sur le nouveau ;
`tests/import-browser.cjs` vérifie de bout en bout qu'un fichier dont la ligne 4
est fautive produit « Ligne 4 ».

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

- **Gravité** : Mineur · **Statut** : Corrigé · **Vérification** : Confirmé
- **Fichier** : `sim.js:1095` (`rd.onerror`)

Le gestionnaire d'erreur ne remet pas `e.target.value` à vide. Resélectionner le
même fichier ne déclenche alors plus l'événement `change` : l'utilisateur croit
que l'application ne répond pas.
*Rapporté par la revue automatique, reproduit ensuite dans Chromium.*

**Correction :** commit « Scénarios A/B par rejeu complet ; BUG-003 et BUG-005
corrigés ». Le gestionnaire vide le champ après l'échec. **Preuve :**
`tests/import-browser.cjs` force un échec de `FileReader.readAsText`, vérifie
que le champ est vidé, puis resélectionne le même fichier et vérifie qu'il est
importé. **Avec l'ancien gestionnaire remis temporairement, le test échoue**
(« le champ doit être vidé après un échec de lecture ») ; il passe avec le nouveau.

---

## BUG-006 — Recalcul redondant de `qlen`

- **Gravité** : Performance · **Statut** : Écarté · **Vérification** : Confirmé
- **Fichier** : `sim.js:280` — **code supprimé**

Un parcours complet `O(stations × jobs)` est refait à chaque pas alors que la
ligne 264 l'a déjà calculé ; seul `quais` est ajouté, toujours à 0. Sans effet
visible sur le jeu de démonstration, mais coûteux sur un CSV volumineux lu à
vitesse élevée.
*Rapporté par la revue automatique, non mesuré.*

**Écarté :** commit « Branche l'interface sur le moteur à événements discrets ».
La fonction `step(dt)` et son parcours ont été supprimés : `qlen` est désormais
le remplissage du tampon de l'atelier, tenu à jour par le moteur (`moteur/orly.js`,
`rafraichir`). Pas de correction à proprement parler — le code n'existe plus.
Vérification : `grep -n "jobs.filter" sim.js` ne trouve plus de parcours dans
la boucle de calcul ; la journée complète se rejoue en 51 ms sous Node
(`tests/orly.test.cjs`).

---

## Bugs corrigés

BUG-001 à BUG-005 sont corrigés, chacun avec sa preuve ci-dessus. BUG-006 est
écarté : le code concerné a disparu avec le remplacement du moteur. **Aucune
entrée ouverte** à ce jour — ce qui n'est pas la même chose qu'aucun bug.

---

## Vérifier avant de livrer

```bash
node --test tests/*.test.cjs            # tests purs : import CSV, moteur, modèle Orly
node tests/browser-smoke.cjs            # parcours navigateur (Playwright requis)
node tests/storage-browser.cjs
node tests/editor-browser.cjs
```

Chaque bug corrigé est couvert par un test qui échouait avant la correction :
c'est la règle, et elle a été vérifiée pour chacun. Toute correction future
doit s'accompagner d'un test qui échouait avant.

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

## Revue — branchement du moteur à événements discrets

`sim.js` ne calcule plus rien : `moteur/orly.js` construit le modèle et le rendu
lit ses vues (`stations`, `jobs`, `goulot()`, `debitRobot()`). Constats :

- Le robot n'était pas candidat au goulot dans la première version du modèle :
  à 07:30, trois vols l'attendaient au montage et l'interface affichait
  « personne n'attend ». **Corrigé avant le commit**, test ajouté
  (`tests/orly.test.cjs`, « des vols qui attendent le robot… »).
- Les libellés « pression indicative » et « indice visuel » de l'interface
  étaient devenus faux : remplacés par « occupation mesurée ».
- BUG-003 et BUG-005 restent ouverts : import CSV hors périmètre de ce commit.

## Revue du 2026-09-19 — Centre des flux

Reprise après les corrections CSV et le remplacement du moteur : BUG-001 à
BUG-005 restent corrigés, BUG-006 écarté. Aucun ancien statut rouvert.
Le nouveau parcours `tests/flows-browser.cjs` couvre les liaisons multiples,
restrictions humaines, retour, activation, filtres du plan, sauvegarde, import
invalide sans remplacement et stockage supprimé puis restauré.
Les extrémités absentes sont signalées, jamais effacées ou réaffectées.
Le réseau configuré ne pilote pas encore les gammes ni les déplacements du
moteur Orly : limite affichée dans l’onglet et documentée dans son guide.

## Revue du 2026-09-19 — Création des ateliers

BUG-001 à BUG-005 restent corrigés, BUG-006 écarté. Nouveaux contrôles :
cases distinctes par service, contour du service, import atomique, géométrie
de modèle bornée et fenêtre émettrice vérifiée pour l’intégration de la bibliothèque.
Le parcours `tests/workshops-browser.cjs` vérifie les gestes réels, le zoom
plafonné, l’historique, plusieurs ateliers, la bibliothèque en fichier local,
la persistance et la navigation mobile.

Défaut trouvé avant livraison : pour un fichier local, `location.origin` peut
valoir `file://` alors que la cible de `postMessage` a une origine opaque `null`.
Le placement de modèle ne quittait pas la bibliothèque. Corrigé en traitant le
protocole `file:` explicitement, sans relâcher le contrôle de la fenêtre source.
Le même parcours, initialement en échec sur la fermeture de la bibliothèque,
passe avec la correction.

Limites explicites : grille non calibrée, arrondi d’emprise des meubles en cm,
pas de validation QHSE ni d’effet des équipements sur les capacités simulées.

## Revue du 2026-09-21 — Retour d'usage après le tracé de la cuisine

Constats de l'utilisateur après une vraie séance de saisie, et ce qui en a été
fait. Le registre n'avait aucune entrée ouverte : ces défauts d'usage n'étaient
pas des bugs signalés, ils sont apparus à l'usage.

| Constat | Traitement |
|---|---|
| « On dirait qu'on ne peut ajouter qu'une seule table par atelier » | **Défaut réel, reproduit et corrigé.** Deux tracés séparés donnaient **un seul** équipement : le second prolongeait le premier. Un tracé = un équipement ; l'agrandissement devient une case à cocher explicite |
| Menu déroulant des ateliers pénible | Remplacé par une **liste visible** des ateliers du service, avec nombre d'équipements et de personnes |
| « Je ne comprends pas la logique des ateliers et des tables » | Phrase de modèle en tête du panneau, étapes numérotées 1-2-3, et **tous** les équipements du service listés groupés par atelier |
| « Validation et édition pas intuitives » | « Valider l'atelier » → **« Fusionner en une surface »** / « Reprendre le détail », avec un état lisible |
| Réglages entassés dans le panneau étroit de droite | **Onglet « Réglages » pleine largeur**, en colonnes, comme le Centre des flux |

**Défaut introduit puis corrigé dans la même passe :** la colonne de droite
étant masquée dans le Centre des réglages, ses panneaux Suivi et Données
devenaient inatteignables depuis cette vue. Demander un panneau de la colonne
ramène désormais à la vue Simulation.

**Preuve :** `tests/workshops-browser.cjs` vérifie que deux tracés séparés
donnent deux équipements, que « agrandir » prolonge bien la sélection, que le
menu déroulant a disparu et que les équipements sont groupés.
`tests/usability-browser.cjs` couvre maintenant cinq vues.

## BUG-012 — Parcours de navigation cassé et non vu (2026-09-21)

**État : corrigé.**

La sortie des réglages en onglet pleine largeur masque la colonne de droite
(`body.reglages-open`). Les trois parcours navigateur qui ouvraient le panneau
« Données » en cliquant son onglet dans cette colonne cliquaient dès lors un
bouton invisible : `tests/browser-smoke.cjs` échouait par expiration.

Deux fautes distinctes :

1. **Le code.** Le garde-fou ajouté dans `showPanel` ramenait bien à la vue
   Simulation, mais seulement une fois le bouton cliqué — or il n'était plus
   cliquable. Un garde-fou qui suppose atteignable ce qu'on vient de masquer
   ne protège rien.
2. **La vérification.** La livraison précédente a été annoncée avec « 7 parcours
   navigateur au vert » alors que `browser-smoke` échouait déjà. Seule une
   partie des parcours avait été rejouée après la dernière retouche.

**Correction de fond**, plutôt que de rafistoler le garde-fou : le programme de
vols, la sauvegarde complète et le périmètre du calcul décrivent l'essai autant
que les réglages. Ils rejoignent l'onglet « Réglages », sous le titre
« Données, sauvegarde et périmètre ». La colonne de droite ne garde que le
suivi vivant et perd sa barre d'onglets, devenue inutile ; ses styles morts
sont supprimés de `interface.css`, `usability.css` et `workshop-grid.css`.

**Preuve :** les neuf parcours navigateur et les 118 tests purs passent.
`docs/ETAT_DES_LIEUX.md` et `README.md` listent désormais les neuf parcours,
avec la consigne de les rejouer en entier.

## BUG-013 — La couleur choisie pour un atelier disparaissait hors édition (2026-09-21)

**État : corrigé.** Signalé à l'usage : « j'ai colorié les zones dans Éditer le
plan mais les couleurs n'apparaissent pas quand je quitte Éditer le plan ».

Reproduit exactement, et le défaut ne touchait qu'une catégorie de zones :

| Zone coloriée | Hors édition |
|---|---|
| Local, chambre froide, circulation, annexe | couleur conservée |
| **Atelier simulé** (cuisine, montage, plonge…) | **couleur perdue** |

La cause est une frontière entre deux rendus. `plan-editor.js` cesse de dessiner
les zones de type `service` dès qu'on quitte l'édition — c'est `sim.js` qui les
rend, depuis sa propre table `ZONES`. Or `sync()`, qui recopie nom, contour et
géométrie de l'éditeur vers cette table, **ne recopiait pas `color`**. La valeur
était bien enregistrée : elle n'était simplement jamais lue par le rendu.

**Correction.** `sync()` transmet désormais la couleur, et seulement une couleur
*voulue* : `validZone` attribue à chaque zone la teinte par défaut de son type,
donc transmettre `color` sans distinction aurait peint toute l'unité en bleu.
Une couleur identique à celle du type ne change rien.

**Règle retenue**, pour ne pas écraser le sens déjà porté par les couleurs :
la teinte choisie est l'**identité** de l'atelier et tient le fond **et le
contour** — c'est le contour qui porte l'impression de couleur à petite taille,
une première version qui ne peignait que le fond donnait encore une zone fade.
Deux exceptions gardent la main parce qu'elles alertent : un atelier simulé
**sans personne** garde son contour rouge, et la zone sélectionnée son contour
d'accent. Pendant
la simulation, les couleurs de charge reprennent le fond — ce que la légende
annonce déjà. Un service hors calcul, qui ne reçoit jamais de couleur de charge,
garde la sienne en toutes circonstances. Bouton « Couleur du type » pour revenir
en arrière, visible seulement quand une couleur a été choisie.

**Preuve :** `tests/etat-plan-browser.cjs` colorie un atelier, quitte l'édition,
vérifie le fond, vérifie que le contour porte toujours le même état qu'un
atelier non colorié, recharge la page, puis rétablit la couleur du type.

## BUG-014 — Le formulaire d'ajout se lisait comme la première liaison (2026-09-21)

**État : corrigé.** Signalé à l'usage : « dans centre des flux le bouton ajouter
un flux est associé au premier flux créé, il faut le sortir et le mettre en
dehors ».

Constaté tel quel. Le formulaire de création portait la classe `fc-card` —
**la même carte, la même bordure, la même largeur et les mêmes quatre champs**
(Flux / Origine / Destination / Précision) que les liaisons de la liste juste
en dessous. Rien ne les séparait qu'un filet d'accent de 4 px à gauche. L'œil
lisait donc « Ajouter une liaison » comme un en-tête, puis les champs, puis le
bouton — et rattachait ce bouton à la liaison qui suivait.

Ce n'était pas un défaut de code mais de forme : deux choses de nature
différente, créer et modifier, avaient la même apparence.

**Correction.** Le formulaire sort du fil de la liste :

- un bouton d'appel **« + Nouvelle liaison »** rejoint la barre de filtres,
  au-dessus, hors de la liste ;
- le formulaire est **fermé par défaut**, s'ouvre à la demande et reste ouvert
  tant qu'on enchaîne les ajouts ; « Fermer » le replie ;
- ouvert, il ne ressemble plus à une liaison : fond teinté d'accent, bordure
  épaisse, en-tête propre ;
- la liste commence après un titre de section **LIAISONS EXISTANTES**.

**Preuve :** `tests/flows-browser.cjs` vérifie que le formulaire est fermé au
départ, qu'il n'est ni dans la liste ni habillé en liaison, qu'il s'ouvre et se
referme, et que tout le parcours de création continue de passer.

## BUG-015 — Rien ne confirmait la création d'un atelier de travail (2026-09-22)

**État : corrigé.** Signalé à l'usage : « quand tu crées un atelier tu ne peux
pas le valider pour confirmer la création ».

Constaté. La fiche s'enregistre **à chaque frappe** : l'atelier existe dès le
clic sur « + Nouvel atelier ». Mais rien ne le disait. On voyait une fiche
ouverte, des champs à remplir, un bandeau d'anomalies qui réclamait « 1 point à
corriger », et en bas seulement « Dupliquer » et « Supprimer » — aucun geste
pour dire « c'est bon ». L'interface avait la forme d'un formulaire sans en
avoir le bouton, ce qui laisse croire que rien n'est pris.

**Correction.** Un bouton **« Terminé »** en tête des actions de la fiche : il
la referme et écrit « « Atelier 1 » enregistré. » dans la ligne d'état. Le
message de création dit désormais ce qu'il en est — « Atelier créé et déjà
enregistré. Dites ce qu'il fabrique, puis « Terminé ». »

Rien n'a changé au modèle : il n'y avait rien à valider. Ce qui manquait, c'est
la phrase qui le dit.

**Preuve :** `tests/ateliers-browser.cjs` § 3 bis — la fiche est ouverte, le
bouton la referme, l'état confirme l'enregistrement, l'atelier est toujours là.

## BUG-016 — Une annexe n'était pas proposée dans le Centre des flux (2026-09-22)

**État : corrigé.** Signalé à l'usage : « j'ai créé une seconde zone armement
sur le plan grâce à l'édition mais elle n'apparaît pas dans la liste des
services dans les flux ».

Constaté. `endpoints()` ne retenait que les zones `kind === 'service'`, c'est-à-dire
les onze ateliers du moteur. Une annexe — `kind === 'annexe'` — était donc
invisible du Centre des flux : impossible de lui adresser une liaison.

C'était cohérent avec le choix d'origine : une annexe est une **seconde salle**
de son atelier, elle en hérite les fournisseurs et les clients. Mais hériter et
pouvoir câbler ne s'excluent pas — et sans la seconde possibilité, une annexe
qu'on veut alimenter autrement que son parent n'est pas descriptible.

**Correction.**

- `flow-center.js` : les annexes sont des emplacements comme les autres. Elles
  n'ont pas de stockages propres, donc une seule entrée chacune.
- `sim.js` : l'héritage devient un **défaut, pas une règle**. Une annexe sans
  aucune liaison à son nom hérite de celles de son atelier ; dès qu'on lui en
  saisit une, la saisie l'emporte.
- `sim.js` : `zoneParId()` cherche la géométrie dans `ZONES` **puis dans les
  zones de l'éditeur**. Sans cela une liaison vers une annexe faisait tomber
  tout le tracé des flux sur le plan : `boite(undefined)`.
- Un flux dont une extrémité a été supprimée depuis n'est plus dessiné, au lieu
  d'interrompre le tracé.

**Preuve :** `tests/annexe-browser.cjs` § 6 — l'annexe figure parmi les
emplacements, une liaison `MAGASIN → ARMEMENT 2` se saisit, et elle remplace
alors l'héritage sans toucher aux amonts d'`ARMEMENT`.

## Revue du 2026-09-24 — Contrôle complet (chemins par commande, cases, temporalité)

Méthode : tests unitaires et navigateur ; syntaxe de chaque fichier ; parcours
automatique de chaque vue et de chaque onglet à 1024 et 1440 px (erreurs de
page et de console, textes « undefined / NaN / null », débordements, boutons
sans nom) ; un « singe » qui clique chaque bouton visible des 16 onglets
(≈ 260 commandes, aucune erreur) ; scénarios de bout en bout (chemins, cases,
Excel, sauvegarde, annuler/rétablir, rechargement) ; noms piégés (`<img
onerror>`) dans une case et un chemin, parcourus dans toutes les vues (aucune
injection) ; charge de 200 commandes et 1 321 cases.

| ID | Gravité | Statut | Vérif. | Résumé | Fichier |
|---|---|---|---|---|---|
| BUG-017 | Bloquant | Corrigé | Confirmé | Au-delà de 50 chemins (48 commandes) tout l'état était refusé ; au-delà de 500 cases aussi | `parcours.js`, `ateliers.js` |
| BUG-018 | Majeur | Corrigé | Confirmé | Retirer un service du chemin d'une commande la laissait dans la case de ce service : travail compté, attendu par personne | `parcours.js` |
| BUG-019 | Majeur | Corrigé | Confirmé | Après un aller-retour Excel, une case retirée exprès revenait au rechargement (marque `cases` perdue à l'import) | `echanges.js` |
| BUG-020 | Majeur | Corrigé | Confirmé | Deux cases, ou deux chemins, pouvaient porter le même nom : l'import Excel suivant échouait ou fusionnait | `ateliers.js`, `parcours.js` |
| BUG-021 | Majeur | Corrigé | Confirmé | La comparaison A/B déclarait « identiques » deux essais qui ne différaient que par un chemin, le matériel, les commandes ou le programme de vols | `comparaison.js`, `sim.js` |
| BUG-022 | Majeur | Corrigé | Confirmé | La fenêtre de la case recouvrait les outils de la vue (Annuler, Excel, Importer) et le bandeau | `parcours.js`, `graphe.css`, `sim.js` |
| BUG-023 | Majeur | Corrigé | Confirmé | Une plonge sans fin de poste (pauses décochées) faisait échouer tout le calcul (délai infini) | `moteur/production.js` (corrigé la veille, consigné ici) |
| BUG-024 | Mineur | Corrigé | Confirmé | À 1024 px, l'état d'un service débordait de la colonne « En ce moment » | `histoire.css` |
| BUG-025 | Mineur | Corrigé | Confirmé | « attend le service d'avant depuis 0 min » | `sim.js` |
| BUG-026 | Mineur | Corrigé | Confirmé | Échap dans un champ de la case fermait la fenêtre ; sa position se mesurait vue cachée | `parcours.js`, `sim.js` |
| BUG-027 | Mineur | Corrigé | Confirmé | Une barre de retours pile sur l'heure de fin débordait du graphique | `temps.js` |
| BUG-028 | Mineur | Corrigé | Confirmé | Le rattrapage des cases pouvait en créer pour une commande retirée du programme | `parcours.js` |
| BUG-029 | Performance | Corrigé | Confirmé | À 200 commandes, une saisie dans une case redessinait toute la vue (liste des cases, planning, commandes, tableau) : ≈ 0,9 s → 0,27 s en ne dessinant que l'onglet affiché | `ateliers.js`, `parcours.js`, `sim.js` |

**Preuves.** `tests/parcours.test.cjs` (noms de chemins uniques, commande
retirée), `tests/comparaison.test.cjs` (chemin ou vols différents : pas
« identiques »), `tests/echanges.test.cjs` (marque `cases` à l'import),
`tests/graphe-browser.cjs` (fenêtre sous la barre, outils cliquables),
`tests/temps.test.cjs` (plonge sans fin de poste) ; scénarios rejoués :
retrait d'un service (plus d'anomalie « hors parcours »), Excel puis
rechargement (la case retirée ne revient pas), renommage en double
(« Refusé : le nom … est déjà celui d'une autre case »), 200 commandes
(1 321 cases, 202 chemins, journée calculée en 71 ms ; saisie 0,27 s, choix
d'une commande 0,07 s).

## Revue du 2026-09-24 — Une journée complète jouée de bout en bout

Méthode : une journée cohérente construite à la main et jouée dans le moteur
puis dans le navigateur — 12 départs de démonstration, 7 compagnies, 34
commandes (un chemin chacune), réception J-1 14:00, légumerie J-1 15:00,
cuisine J-1 16:00 (6 personnes), prépa J-1 20:00, dotation 01:00 (consomme le
matériel propre), montage 02:00, plonge 05:00 (2 tunnels de 400 u/h), magasin
à disposition. Deux variantes : stock de matériel suffisant (4 000 u, plonge
sans fin de poste) et stock court (1 500 u, plonge fermée à 13:15). Chaque
écran relu (vols, chemin, case, tableau, frise, cases, planning, commandes,
plan rejoué à 03:00, chiffres, stocks) ; chiffres recoupés (pas de
chevauchement dans une case, pas de stock négatif, durées = man-minutes ÷
personnes).

| ID | Gravité | Statut | Vérif. | Résumé | Fichier |
|---|---|---|---|---|---|
| BUG-030 | Majeur | Corrigé | Confirmé | Stock court : la dotation reste bloquée faute de matériel propre, le montage n'en voit plus rien arriver… et 24 commandes jamais montées étaient dites « prêtes à l'heure ». Une commande confiée à une équipe qui ne l'a jamais préparée n'est plus prête ; l'anomalie nomme l'équipe et la cause (« attend toujours AF · Économie de « Dotation », qui ne la livre jamais ») | `moteur/production.js` |
| BUG-031 | Majeur | Corrigé | Confirmé | L'onglet « Stocks et retours » ne défilait pas : les graphiques de la plonge, en bas, étaient coupés et inaccessibles ; une colonne vide occupait la droite | `histoire.css` |
| BUG-032 | Moyen | Corrigé | Confirmé | Plonge fermée à 13:15 et retours du soir : le moteur annonçait un « bouchon » de plusieurs heures. C'était une fermeture : ces unités ne sont pas lavées du tout. Nouvelle anomalie « plonge-fermee » (combien, à partir de quelle heure) ; l'attente maximale ne compte plus que le matériel lavé | `moteur/production.js` |
| BUG-033 | Moyen | Corrigé | Confirmé | « Dernière commande prête à 19:39 » : l'heure venait de la plonge qui lave les retours du soir ; c'est maintenant la dernière commande (06:34) | `moteur/production.js` |
| BUG-034 | Mineur | Corrigé | Confirmé | Une heure à 59,6 min s'écrivait « 03:60 » : l'arrondi se fait avant de séparer heures et minutes | `moteur/production.js` |
| BUG-035 | Mineur | Corrigé | Confirmé | Fausse alerte « aucun barème » pour la plonge et le magasin, qui n'en ont pas besoin (débit des tunnels, mise à disposition) | `moteur/production.js` |
| BUG-036 | Mineur | Corrigé | Confirmé | Frise d'une commande commencée à J-1 : une étiquette par heure, illisibles (« J-1 14:00J-1 15:00… ») ; le jour n'est plus écrit qu'au changement et les repères s'espacent. La plonge y était dite « sautée, sans équipe » : elle « sert tout le monde » | `parcours.js` |
| BUG-037 | Mineur | Corrigé | Confirmé | En-tête des stocks « J-1 14:00–19:00 » lu comme une seule soirée : « J-1 14:00 → J 19:00 » | `temps.js` |

**Preuves.** `tests/journee-simulee.test.cjs` (un test par défaut ci-dessus,
côté moteur et frise), `tests/temps-browser.cjs` (le bas de l'onglet des
stocks s'atteint, sur toute la largeur ; vérifié en échec sans le correctif).
Journée rejouée après correction : stock suffisant, 34/34 à l'heure, aucune
anomalie, dernière commande 06:34 ; stock court, 10/34 à l'heure et chaque
commande non montée nommée.

**Remarques de modèle, laissées telles quelles (à trancher).**
- Une commande (compagnie × classe) a une seule échéance : son premier départ
  de la journée. Un vol du soir rangé dans la même commande qu'un vol du matin
  est donc prêt le matin et attend en stock (FBU · Business : 11 h 59 avant le
  chargement de 18:15).
- Une case prépare ses commandes dans l'ordre : si la première est bloquée
  (matériel absent), les suivantes attendent derrière elle. C'est voulu (une
  équipe suit sa liste), mais un seul manque peut en bloquer beaucoup.
