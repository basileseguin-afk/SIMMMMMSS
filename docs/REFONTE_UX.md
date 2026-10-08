# Refonte UX/UI — audit et proposition

8 octobre 2026. **Statut : proposition, en attente de votre accord.** Rien
n'a été modifié dans l'application. La maquette
[`maquette-refonte.html`](maquette-refonte.html) montre la direction proposée :
c'est une maquette, avec des données fictives et un bâtiment schématique (pas
le plan de l'unité), pas une fonctionnalité.

---

## 0. Ce qui a été audité

- **Le code.** Environ 21 000 lignes de JS, CSS et HTML par version : architecture, les 13 feuilles de style, la navigation (`onglets.js`), le rendu, l'état, la persistance, et les 424 tests unitaires et 63 suites navigateur.
- **Les écrans réels.** Les 25 pages de la v1 et les 3 pages propres à la v2, capturées à 1 440 × 900. L'unité de démonstration était complète : handling, armement, cuisine la veille, prépa et montage à la chaîne, deux montages, plonge par vol, légumerie. Les captures restent hors du dépôt, car elles montrent le plan réel.
- **Les mesures.** Chargement, durée du calcul, délai d'une modification, taille de la page, et dans le CSS : couleurs, tailles de texte, rayons, ombres et graisses.

### Trois écarts entre le brief et le dépôt (à trancher)

1. **Le dépôt n'a ni grille de cellules, ni fusion de cellules, ni équipements T-001 ou R-001.**
   - L'éditeur spatial (`plan-editor.js`) dessine des **zones** (rectangles et polygones) sur le dessin du bâtiment : services, annexes, locaux, chambres froides, équipements, circulations.
   - Chaque zone a un verrou de géométrie. L'éditeur offre aussi l'aimantation, une grille d'aide, annuler/rétablir et le déplacement au clavier.
   - Ce que le site appelle « fusion », c'est « à la chaîne » : une équipe qui fait deux étapes d'un bloc (Prépa + Montage).
   - Le « robot » est une ligne robot, une nature d'équipe, pas un objet qu'on place.

   Je propose de refondre les trois éditeurs qui existent (plan, chemins, services et équipes). Je n'invente pas de couche d'équipements à identifiants : si vous la voulez, c'est une fonctionnalité nouvelle, à spécifier à part.
2. **Le thème sombre a été abandonné le 23/09** (« pas vraiment utile : le site sert sur un poste de bureau », cahier des charges § 11). Le brief le redemande en premier. Avec des jetons de couleur, avoir les deux thèmes coûte peu ; reste à choisir celui par défaut.
3. **Le « verrouillage de la vue lors de l'édition »** existe sous deux formes, que je garde telles quelles :
   - le mode édition du plan fige le menu (l'en-tête passe en grisé, on sort par « Terminer ») ;
   - chaque zone a son verrou de géométrie.

---

## 1. Diagnostic

### L'architecture technique réelle

| Sujet | Constat |
|---|---|
| Pile | HTML, CSS et JS sans compilation, servis par GitHub Pages. Les modules sont des IIFE accrochées à `window` (`Sim`, `MoteurProduction`, `OrlyParcours`, `OrlyEchanges`, `OrlyOnglets`…). |
| Rendu | Gabarits de chaînes passés à `innerHTML`, délégation d'événements par attributs `data-*`. `poser()` ne réécrit pas un HTML identique et rend au champ actif son focus et son défilement. |
| État | `Sim.ateliers.state` et l'état du plan, dans `localStorage`. Annuler/rétablir passe par `changer()`. Chaque modification relance tout le calcul : 3 à 13 ms sur l'unité de démonstration, 20 à 50 ms rendu compris. Ce n'est pas un problème aujourd'hui. |
| Navigation | `onglets.js` : 5 parties, plus l'Accueil et la Sauvegarde, soit 25 pages (28 en v2) posées sur 5 anciennes « vues » par `data-sous`. Les pages cachées restent dans le DOM (6 000 à 7 500 nœuds). |
| Styles | 13 feuilles et un `<style>` dans `index.html`, en cascade. `theme.css` repeint le tout par-dessus, avec 41 `!important`. |
| v1 et v2 | Deux copies complètes. Les CSS sont identiques à 11 lignes près (`theme.css`) ; 6 fichiers JS diffèrent. Chaque changement d'interface se fait deux fois. |
| Tests | Les tests navigateur reposent sur 1 278 sélecteurs (656 `data-*`, 559 `#id`, 339 classes) et 336 vérifications de texte. C'est le contrat de non-régression. |

### Ce qui est bon et doit rester

- Un vocabulaire métier juste, en français simple, et des états « à remplir » neutres.
- L'honnêteté sur les données d'exemple.
- Le rendu par attributs `data-*` : on peut changer la présentation sans toucher à la logique.
- Les pictogrammes SVG de `icones.js`, la police Inter embarquée, le diagramme en étapes (`graphe.js`), le planning et la carte des flux.
- Annuler/rétablir, la sauvegarde en un fichier et l'aller-retour Excel.

---

## 2. Les défauts, classés par impact

### Critiques (P1) : ils coûtent du temps et provoquent des erreurs

| # | Constat observé | Effet | Piste |
|---|---|---|---|
| 1 | **Le rangement va à contre-sens.** L'éditeur du plan est dans *Résultats › Le plan rejoué* (« Modifier le plan »). *Résultats › Heure de chaque commande* retire et ajoute des commandes. *Vols › Programme des vols* n'affiche pas les vols, seulement l'import : leur liste est dans *Résultats › Vols prêts au départ*. | On cherche où l'on règle, et on modifie depuis une page de lecture. | Séparer *Configurer* (Données, Unité, Réglages) d'*Analyser*. Le plan a sa page dans Unité, et la table des vols est dans Vols. |
| 2 | **L'objet central est le plus petit.** Sur *Le plan rejoué*, le plan a environ 330 px de haut sur 900 : trois rangées d'outils au-dessus, une rangée d'indicateurs en dessous, un panneau de 330 px à droite. | Lire la journée sur le plan est pénible. | Toile pleine hauteur, barre de lecture en bas, indicateurs en surimpression compacte, panneau escamotable. |
| 3 | **Six façons de dire « il reste à faire », avec six chiffres** : « À faire ensuite » (Accueil), « Prêt à simuler ? 2 », « Contrôles détaillés 4 », « 8 points à regarder » (répété sur six pages), « 7 choses que la journée montre », « Heure de chaque commande 15 », plus les pastilles orange par service. | On ne sait pas quel chiffre croire. | Un seul registre **Problèmes** à trois niveaux. Chaque point mène là où il se corrige, et tous les badges en dérivent. |
| 4 | **Le retour des actions est confus.** Une ligne d'état reste affichée en haut de pages sans rapport : « Armement : intégré à 0 chemin… « Annuler » revient en arrière. » apparaît sur Chemins, Budget et Calage. Le site ouvre 24 `confirm()` du navigateur, souvent pour des actions qu'on peut annuler. Annuler/rétablir existe sous trois formes à trois endroits, et manque ailleurs. | Le message ne correspond plus à rien, et on confirme des actions sans risque. | Notifications éphémères avec « Annuler ». Un seul annuler/rétablir, global. Une confirmation seulement pour l'irréversible. |
| 5 | **Un vrai bug de mise en page.** Dans *Prêt à simuler ?*, la liste des services est une grille qui attend des paires nom / état. La mention « ⛓ à la chaîne » ajoute une troisième cellule, et toutes les lignes suivantes glissent d'un cran : Plonge se retrouve en face de l'état de la Prépa. | La liste dit faux. | Corrigé à l'étape 2. |

### Majeurs (P2) : cohérence et lisibilité

| # | Constat observé |
|---|---|
| 6 | **Il n'y a pas de système visuel.** Le CSS compte 136 couleurs, 27 tailles de texte, 26 rayons, 46 ombres et 9 graisses (550, 620, 650, 680…). Il y a au moins cinq styles de bouton (`.btn`, `.btn-sm`, `.btn-mini`, `.lien-discret`, liens fléchés). Des légendes en pastilles ressemblent à des boutons (« tâche unique », « valeur propre »). |
| 7 | **La couleur ne veut plus rien dire.** Chaque partie a sa teinte (bleu, sarcelle, vert, violet, rose) sur l'en-tête, les onglets et les cartes, et chaque indicateur de la synthèse a son dégradé. S'y ajoutent les états (vert, orange, rouge), « à la chaîne » (magenta) et les classes. Le rouge d'un retard se perd parmi les roses décoratifs. |
| 8 | **La navigation horizontale a deux étages** : 6 entrées en haut, jusqu'à 8 onglets dessous. À 1 440 px, « Comparer deux e… » est coupé. Des « PLUS » séparent les onglets et la Sauvegarde est une partie cachée. Des pages font double emploi : *Équipes une par une* et *Services et équipes*, *Liste des services* et la fiche service. |
| 9 | **La synthèse aligne 11 cartes de même poids.** Elle mêle nombres et phrases (« — aucun vol chargé », « 15 commandes que personne ne prépare »), un libellé est coupé (« Dernière commande prête à »), et aucune carte ne mène à sa cause. |
| 10 | **La saisie est lourde.** Les fiches sont longues, avec des explications en petits paragraphes gris sous chaque champ. L'unité est tantôt dans le libellé, tantôt absente (« (min) », « heures par vol », « h/vol1 pers. »). Les heures utilisent le champ natif, qui s'affiche « 04:00 AM » selon le navigateur. Un refus de saisie s'annonce dans la ligne d'état, loin du champ. |
| 11 | **Les tableaux répètent et mélangent.** L'en-tête « h/vol1 pers. équipe durée » revient 7 fois, les alignements varient, et des caractères-pictogrammes (⇩ ⇧ ↶ ▶ ⏭ ⛓ ✓) côtoient les pictogrammes SVG. |

### Modérés (P3)

- Les boutons du menu n'ont pas d'anneau de focus, et la réduction des animations n'est que partielle.
- Les textes d'introduction sont longs, et les aides « ? » inégales.
- Les pages cachées sont toujours rendues. C'est sans effet aujourd'hui, mais à surveiller avec l'unité réelle (200 commandes).

---

## 3. Direction artistique : « précision industrielle »

**Principes.**
- La couleur informe, elle ne décore pas.
- La densité est maîtrisée, pas tassée.
- Chaque surface a un rôle.
- Les nombres priment, en chiffres tabulaires.
- Les mouvements sont courts et utiles.

### Palette (jetons sémantiques)

| Jeton | Sombre | Clair | Usage |
|---|---|---|---|
| `fond` | `#0B0D10` | `#F7F8FA` | l'application |
| `surface-1` | `#111418` | `#FFFFFF` | panneaux, barre latérale |
| `surface-2` | `#171B21` | `#F2F4F7` | survol, champs |
| `surface-3` | `#1D222A` | `#FFFFFF` + ombre | menus, dialogues |
| `bordure` | `rgba(255,255,255,.07)` | `#E6E8EC` | séparations |
| `texte-1 / 2 / 3` | `#E8EAED` / `#A3A9B3` / `#6E7682` | `#111827` / `#4B5563` / `#6B7280` | hiérarchie du texte |
| `accent` | `#2CC2B0` | `#0F766E` | action principale, sélection, focus, élément actif. **Une seule couleur**, dans la continuité de la marque. |
| `ok` | `#3FB950` | `#15803D` | prêt, à l'heure |
| `attente` | `#D29922` | `#B45309` | à compléter, attente |
| `retard` | `#F85149` | `#C0262D` | retard, bloquant |
| `info` | `#58A6FF` | `#1D4ED8` | information |
| `donnees-1…6` | 6 teintes désaturées | idem | **dans les données seulement** : classes BC/PC/YC/CREW/SPML, flux |

La couleur propre à chaque partie disparaît : la navigation devient monochrome.

### Le reste du système

| Sujet | Règle |
|---|---|
| Typographie | Inter (déjà embarquée), chiffres tabulaires. Échelle 11 / 12 / 13 / 14 / 16 / 20 / 24 / 32, graisses 400 / 500 / 600. Pas de nouvelle police. |
| Espacement | Grille de 4 px : 4, 8, 12, 16, 24, 32, 48. |
| Rayons | 4 (champs, pastilles), 6 (boutons), 8 (panneaux, cartes), 12 (dialogues). |
| Élévation | En sombre, par la luminance des surfaces. Les ombres sont réservées aux éléments flottants. |
| Hauteurs | Contrôles de 28 px (compact) ou 32 px (normal) ; lignes de tableau de 32 à 36 px. |
| Mouvement | 120 ms (survol, appui), 180 ms (panneaux), 240 ms (changement de vue), courbe `cubic-bezier(.2,.8,.2,1)`. Rien n'est animé si « réduire les animations » est actif. |
| Pictogrammes | Un seul jeu (`icones.js`), trait de 1,5 px, en 16 et 20 px. Plus de caractères-pictogrammes. |
| Dessin du bâtiment | Sur fond « papier » clair, même en thème sombre, comme les outils de CAO. Une option « toile sombre » est à essayer sur le vrai plan. |

---

## 4. Architecture d'interface cible

```
┌─────────────────┬────────────────────────────────────────────────────────────────┐
│ ▣ Production ORY│ Unité › Équipes › Montage     ● Calcul à jour   ⚠ 6   ↶ ↷   ⌘K   ⇩ │
├─────────────────┼──────────────────────────────────────────────┬─────────────────┤
│ ◇ Accueil       │                                              │ INSPECTEUR      │
│ DONNÉES         │                                              │ s'ouvre quand   │
│   ✈ Vols        │              ZONE CENTRALE                   │ on sélectionne  │
│ UNITÉ           │     toile, tableau ou fiche, pleine          │ un objet : zone,│
│   ▦ Plan        │     largeur ; le plan et les chemins         │ équipe, nœud,   │
│   → Chemins     │     occupent toute la hauteur                │ vol, commande ; │
│   ⚇ Équipes     │                                              │ se ferme avec   │
│   ⏱ Heures      │                                              │ Échap           │
│ SIMULATION      │                                              │                 │
│   ⚙ Réglages    │                                              │                 │
│   ▶ Rejouer     │                                              │                 │
│ ANALYSE         │                                              │                 │
│   ◔ Synthèse    │                                              │                 │
│   ▤ Planning …  │                                              │                 │
├─────────────────┤                                              │                 │
│ ⚠ Problèmes   6 │                                              │                 │
│ ⇩ Sauvegarde    │                                              │                 │
└─────────────────┴──────────────────────────────────────────────┴─────────────────┘
```

### Où va chaque page

Les 25 pages restent, avec les mêmes identifiants.

| Section | Pages (identifiant actuel) |
|---|---|
| Accueil | État du projet et Problèmes en résumé |
| **Données** › Vols | Programme des vols, **avec la table des vols** (`v-programme`) ; Planche retour (`v-planche`) |
| **Unité** › Plan | **Nouvelle page** : l'éditeur du plan, aujourd'hui caché dans `j-plan` |
| **Unité** › Chemins | Vue d'ensemble (`mu-carte`), Flux (`mu-flux`), Chemin d'une commande (`at-chemins`) ; Liens entre services (`u-liens`) en avancé |
| **Unité** › Équipes | Services et équipes (`mu-services`), Horaires (`at-recap`), Heures de travail (`rg-recap`) ; Liste des services (`u-services`), Équipes une par une (`at-equipes`) et Barème (`rg-minutes`) en avancé |
| **Simulation** | Réglages (`rg-simulation`), Calage (`rg-calage`, v2) ; *Prêt à simuler ?* (`mu-pas`) et *Contrôles détaillés* (`u-lecture`) alimentent **Problèmes** |
| **Analyse** | Synthèse (`j-chiffres`), Rejouer sur le plan (`j-plan`), Planning (`at-planning`), Commandes (`at-repas`), Étapes (`at-grille`), Vols au départ (`v-departs`), Stocks (`j-stocks`), Comparer (`j-comparer`), Budget (`bu-jour`, `bu-param`, v2) |
| Pied de la barre | Problèmes, Sauvegarde (`u-sauvegarde`), Version 2, thème |

### La barre supérieure (44 px)

- Un fil d'Ariane cliquable.
- L'état du calcul (« Calcul à jour » : le calcul est réellement instantané).
- La source des vols.
- Problèmes, avec un compte unique.
- Un seul annuler/rétablir.
- Sauvegarder (export).
- En option, une palette de commandes ⌘K pour aller à une page, un service, une équipe ou une commande.

### L'inspecteur

- Il s'ouvre quand on sélectionne un objet et affiche ses propriétés groupées.
- Il porte des liens croisés : « Voir sur le plan », « Voir son chemin », « Dans le planning ».
- Il se ferme avec Échap.
- Rien ne s'affiche quand rien n'est sélectionné.

---

## 5. Les éditeurs

### 5.1 Le plan de l'unité

- Une page à part, dans Unité, avec une toile pleine hauteur. En édition, la barre latérale se replie en pictogrammes et se grise : c'est le verrouillage actuel du menu, gardé.
- **Barre d'outils flottante en haut** : Sélection V · Rectangle R · Polygone P · Main H │ Aimantation · Grille │ Annuler · Rétablir.
- **Zoom en bas à droite** : − · 100 % · + · Cadrer · Tout voir (touche 0).
- **À gauche, les calques.** Les zones sont groupées par type (services, annexes, locaux, chambres froides, équipements, circulations), avec une recherche. Œil et cadenas deviennent des pictogrammes, à la place de « ◉ », « Libre » et « Fixé ».
- **À droite, l'inspecteur de la zone** : nom, type, rattachement, couleur, position et taille, verrou, « emplacement confirmé », stockages. Ses actions sont Redessiner, En polygone et Supprimer, désactivées et expliquées quand la zone est fixée.
- **Sur la toile :**
  - les contours gardent la même épaisseur quel que soit le zoom (aujourd'hui 7 unités de plan : épais de près, fins de loin) ;
  - les étiquettes sont à taille d'écran, avec un halo ;
  - la sélection est un contour d'accent avec des poignées carrées de 8 px et la taille affichée ;
  - le survol pose un voile léger, « à confirmer » est en tirets, une zone fixée porte un cadenas.
- **Inchangés** : gestes, raccourcis, verrous, aimantation, historique, import/export du plan.

### 5.2 Rejouer la journée

- La même toile, avec une barre de lecture en bas, comme une timeline : ▶, pas à pas, début, curseur de J-1 à J, vitesse.
- Les indicateurs « à cette heure » en bandeau compact sur la toile.
- « En ce moment » dans l'inspecteur.

### 5.3 Les chemins (`graphe.js`)

- La même grammaire que le plan : fond pointillé et nœuds en cartes compactes (pictogramme, nom, état « 6/19 préparées »).
- Les étapes en bandes discrètes et une barre flottante : Ajouter un service, Réorganiser, En ligne.
- L'inspecteur du nœud ou du lien : équipe, « en même temps que… », retirer.
- La surbrillance de la chaîne au survol, qui existe déjà.

### 5.4 Services et équipes

- Le maître-détail est gardé. La fiche devient une **feuille de propriétés** en sections repliables : Nature · Équipes · Ce qu'elles préparent · Heures de travail · Avancé. Avancé regroupe « en même temps que… », les superviseurs, la règle ⚡, les pauses et les heures propres ; un compteur dit ce qui y est réglé.
- La grille « Ce qu'elle prépare » devient une vraie **matrice** : en-têtes collants, survol de ligne et de colonne, cases de 20 px, Espace pour cocher au clavier.
- Une équipe sélectionnée s'ouvre dans l'inspecteur : nom, arrivée, jour, personnes, effectif, pauses.

---

## 6. La saisie des données

- **Un composant Champ** :
  - un libellé court et l'unité dans le champ (« h / vol », « min », « pers. ») ;
  - un « ? » qui ouvre une phrase d'aide ;
  - « Sert à : … » seulement quand le code le dit déjà. Aucune relation n'est inventée.
- **Les heures en 24 h.** « 0430 » et « 4:30 » sont acceptés, et le « AM » disparaît.
- **La validation au champ.** Une bordure et un message sous le champ : le refus de `changer()` connaît déjà le champ fautif. La ligne d'état n'est plus utilisée pour ça.
- **Un retour discret** : une coche « enregistré » qui s'efface dans le champ.
- **L'avancé replié par défaut**, avec le nombre de réglages qu'il contient (« 2 réglages avancés »).
- **Les tableaux d'heures et d'horaires** :
  - en-têtes et première colonne collants ;
  - l'unité une seule fois, dans l'en-tête ;
  - les nombres alignés à droite ;
  - en option, Entrée qui descend et Tab qui avance.
- **En option**, les flèches ↑↓ pour ±1 dans les nombres (Maj : ±10). La virgule et le point sont déjà acceptés.

---

## 7. Simulation et résultats

Les calculs ne changent pas, et aucun indicateur n'est ajouté.

- **La barre supérieure** dit « Calcul à jour » et affiche les Problèmes.
- **La synthèse est hiérarchisée.**
  - Quatre indicateurs principaux en cartes compactes, avec leur dénominateur : vols chargés à l'heure, commandes prêtes à l'heure, retard le plus long, travail fourni.
  - Dessous, trois groupes (Vols · Commandes · Équipes) en listes sobres ; chaque ligne mène à sa page.
  - « 15 commandes que personne ne prépare » devient un **Problème**, avec son lien.
- **Comparer deux essais** : des écarts signés et colorés (▲ ▼) en face de chaque indicateur.
- **Le planning, les vols et les stocks** prennent la palette des données. Les barres portent leur étiquette quand elle tient, une infobulle s'ouvre au survol, et un trait marque « maintenant ».

---

## 8. Les composants

| | Composants |
|---|---|
| **À créer** (`ds.css` et un petit `ds.js`) | Jetons des deux thèmes ; bouton (principal, secondaire, discret, danger ; 28 ou 32 px) et bouton-icône ; champ avec unité ; champ heure 24 h ; liste déroulante ; case à cocher ; interrupteur ; contrôle segmenté ; onglets (dans un objet seulement) ; tableau ; pastille d'état ; étiquette de donnée (classe, flux), distincte des légendes ; carte indicateur ; inspecteur ; barre latérale ; barre supérieure ; fil d'Ariane ; barre d'outils flottante ; infobulle ; notification avec action ; dialogue de confirmation ; état vide ; ligne « problème ». En option, la palette ⌘K. |
| **À remplacer** | Les `confirm()` : par une notification « Annuler » si l'action s'annule, par un dialogue sinon. La ligne d'état collante : par des notifications. Les caractères-pictogrammes : par du SVG. Le repeint de `theme.css` et ses 41 `!important` : par des couches `@layer`. Les trois annuler/rétablir : par un seul. La synthèse en 11 cartes. L'en-tête et ses onglets : par la barre latérale et la barre supérieure. |
| **À garder** | `icones.js` (enrichi), `graphe.js` (restylé), la logique de `plan-editor.js`, le planning, `poser()`, la délégation par `data-*`, le moteur, la persistance et l'Excel. |

---

## 9. Les risques de régression, et les protections

| Risque | Protection |
|---|---|
| Casser le contrat des tests (1 278 sélecteurs, 336 textes) | Tous les `id` et `data-*` sont gardés. Une classe testée garde son nom, ou reçoit un alias. Un texte changé l'est dans le même commit que son test. La navigation des tests passe par un seul assistant (`tests/nav.cjs`), qu'on adapte une fois. |
| La double copie v1/v2 | Les CSS sont identiques : on les copie. Les 6 fichiers JS qui diffèrent se modifient deux fois, comme aujourd'hui. La batterie complète tourne sur les deux versions. |
| Sortir l'éditeur du plan des Résultats | La toile SVG `#plan` est unique, partagée par le rejeu et l'édition. La page Plan la réutilise (même vue, autre mode), sans la dupliquer. |
| Remplacer les `confirm()` | C'est un changement d'usage, à valider avec vous. Les tests qui acceptent les dialogues seront adaptés. |
| Thème sombre et dessin du bâtiment | Fond papier par défaut, essai sur le vrai plan avant d'aller plus loin. |
| Focus et défilement pendant la saisie (`poser()`) | L'inspecteur et la barre latérale ne réécrivent que leur partie. `saisie-browser` et `saisie-heure-browser` tournent à chaque étape. |
| Données et sauvegardes | Aucun changement de schéma : `localStorage`, fichiers de sauvegarde et Excel restent identiques. |
| Le plan est privé | Aucune capture du plan réel, ni dans le dépôt ni dans une maquette. |
| Performances | La latence d'une modification (aujourd'hui 20 à 50 ms) est mesurée avant et après. Aucune animation sur les grandes SVG ; les panneaux s'animent par `transform` et `opacity`. |

---

## 10. Le plan d'implémentation

Pour chaque étape : un ou deux commits, poussés seulement quand la batterie
est verte (424 tests unitaires et 63 suites navigateur, v1 et v2), avec les
captures avant / après relues.

| Étape | Contenu | Critères de validation |
|---|---|---|
| 0. Référence | Captures avant (hors dépôt), relevé des sélecteurs testés, mesure de latence. | Batterie verte, chiffres notés. |
| 1. Fondations | `ds.css` : jetons clair et sombre, échelles, couches `@layer`. Les anciennes variables (`--bg`, `--txt`, `--accent`…) sont rebranchées sur les jetons, et le thème se choisit. Rien ne bouge de place. | Contraste AA vérifié par script (≥ 4,5:1 pour le texte, ≥ 3:1 pour les éléments). Couleurs du CSS : de 136 à 40 au plus. Tailles de texte : de 27 à 8. |
| 2. Composants | Boutons, champs, listes, cases, pastilles, tableaux et cartes ; pictogrammes SVG ; fin des `!important`. Correction du bug de *Prêt à simuler ?*. | Captures des 28 pages relues. Plus aucun caractère-pictogramme. Focus visible sur tout élément actif, vérifié par un test automatique. |
| 3. Coquille | Barre latérale, barre supérieure, fil d'Ariane, annuler/rétablir unique. `onglets.js` garde ses identifiants et la mémoire de la dernière page ouverte. | `menu-browser`, `aide-browser` et `onglets.test` adaptés. Toute page atteignable en 2 clics au plus. Rien de coupé à 1 280 px. |
| 4. Retour et problèmes | Notifications avec « Annuler », fin de la ligne d'état collante, registre Problèmes unique, alimenté par les sources existantes seulement. | Un seul compteur partout ; chaque problème ouvre la bonne page ; actions annulables sans `confirm()` (si vous le validez). |
| 5. Plan de l'unité et rejeu | Page dédiée, toile pleine hauteur, barre d'outils flottante, calques, inspecteur, contours constants ; barre de lecture en bas. | `editor-browser`, `etat-plan-browser` et `plan-editor.test` verts. Gestes, verrous, raccourcis et zoom (molette, 0, Cadrer) inchangés. Le plan occupe au moins 75 % de la hauteur utile. |
| 6. Chemins | Graphe restylé, inspecteur du nœud. | `graphe-browser`, `flows-browser` et `chemin-choisi-browser` verts. |
| 7. Services, équipes et champs | Feuille de propriétés, matrice, champ avec unité, heure 24 h, validation au champ. | `mon-unite-browser`, `saisie-*` et `effectif-browser` verts. Plus de « AM ». Un refus se lit sous le champ. |
| 8. Tableaux | Heures de travail et horaires : en-têtes collants, nombres alignés. | `recap-*` verts. |
| 9. Résultats | Synthèse hiérarchisée, comparaison, planning, vols, stocks. | Les mêmes nombres qu'avant, vérifiés par test. Chaque indicateur mène à sa page. |
| 10. Finitions | Mouvements, réduction des animations, fiche des raccourcis, palette ⌘K si vous la retenez. | Latence au plus 10 % au-dessus de la référence. Aucune animation quand elles sont réduites. |
| 11. v2 et relecture | Budget et Calage, harmonisation finale, `docs/DESIGN_SYSTEM.md`. | Batterie complète v1 et v2, captures avant / après jointes. |

---

## Vos décisions, avant de commencer

1. **Éditeur.** On refond le plan, les chemins et les services, sans couche d'équipements T-001 / R-001 ? Ou voulez-vous cette couche, comme fonctionnalité nouvelle ?
2. **Thème.** Sombre par défaut avec le clair disponible, ou l'inverse (vous aviez retenu le clair seul le 23/09) ?
3. **Confirmations.** Remplace-t-on les `confirm()` des actions annulables par une notification « Annuler » ?
4. **Plan.** Le plan de l'unité sort-il des Résultats pour avoir sa page ?
5. **Options.** Palette ⌘K, navigation clavier dans les tableaux, flèches ↑↓ dans les nombres : oui ou non, une par une ?
