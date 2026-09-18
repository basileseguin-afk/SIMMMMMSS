# Journal des modifications

Ce fichier retrace **chaque commit** : ce qui a changé et sur quels fichiers.
Le plus récent est en haut.

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
