# Audit de l'interface — 25/09/2026, six points de vue

Demande : « la répartition des sous-onglets n'a aucun sens : une partie
réglages dans chaque onglet, une partie simulation… Mets-toi à la place d'un
novice, puis d'un grand dev web, puis d'autres points de vue ; les points
communs sont les changements à faire. »

**Méthode.** Capture de chaque vue et de chaque sous-onglet (16 écrans), à la
première visite (rien de saisi) et avec une journée complète (34 commandes),
à 1440 × 900. Mesures dans le navigateur. Puis relecture des mêmes écrans par
six personnes différentes.

**Mesures à la première visite (1440 × 900).**
- Le contenu utile commence à **511 px** sur 900 : en-tête 67 px, étapes 83 px,
  encart « Comment ça marche » 236 px, titre 74 px, onglets 51 px.
- **57 boutons** visibles sur le premier écran.
- **17 tailles de texte** différentes, de 10 px à 46 px.
- On arrive sur l'étape 2 (« Qui prépare quoi »), pas sur l'étape 1.

---

## L'inventaire : ce que contient chaque onglet aujourd'hui

| Étape | Sous-onglet | Nature réelle |
|---|---|---|
| 1 Les vols | Les départs | **résultat** (prêts à l'heure, en retard) |
| | Le programme | **donnée** (import des vols) + **réglage** (décaler les vols, délai de chargement) |
| 2 Qui prépare quoi | Les chemins | **organisation** |
| | Qui prépare quoi | **organisation** (tableau, calculé) |
| | Les cases | **organisation** |
| | Leur journée | **résultat** (planning des équipes) |
| | Les commandes | **résultat** (prête à…) + organisation (ajouter une commande) |
| 3 Les temps de travail | Minutes par vol | **donnée** (barème importé) |
| | Rythme et pauses | **réglage** |
| 4 La journée | Le plan, Les chiffres, Stocks et retours | **résultat** |
| | Comparer deux essais | **scénarios** |
| L'unité | Les liens | **organisation** |
| | Ce que le calcul en retient | **contrôle** de l'organisation |
| | Sauvegarde et limites | **fichier** (sauvegarde) + à-propos |

Les résultats sont répartis sur **trois étapes** (1, 2, 4). Les réglages sont
répartis sur **deux** (1, 3). L'organisation est répartie sur **deux** (2,
L'unité). C'est le constat de départ, confirmé.

---

## Les six points de vue

### 1. Le novice (un nouveau planificateur, première visite)
- « Par où je commence ? » On arrive sur l'étape 2, l'étape 1 porte un badge
  « À faire ensuite », et un encart numéroté 1 → 4 occupe le quart de l'écran.
- Deux choses portent le même nom : l'étape « Qui prépare quoi » et son
  sous-onglet « Qui prépare quoi ».
- Les boutons `⇩ Excel` / `⇧ Importer` existent dans trois étapes mais ne
  désignent pas le même fichier. Rien ne le dit sur le bouton.
- Des mots jamais définis : chemin, case, commande, mise à disposition, lien,
  man-min, « Ce que le calcul en retient ».
- Pour savoir « est-ce que ma journée tient ? », il faut aller voir l'étape 4,
  puis l'étape 1 (départs), puis l'étape 2 (commandes, planning).

### 2. Le grand dev web (constat visuel)
- **Trop de chrome** : 57 % de la hauteur avant le contenu.
- **17 tailles de texte**, trois styles de tableau (en-tête sombre pour les
  départs, clair ailleurs), des cartes de largeurs arbitraires (« Comparer »
  à demi-largeur, « Sauvegarde » en petites cartes perdues dans le vide).
- **Boutons incohérents** : « ↶ Annuler / ↷ » en icônes à l'étape 2,
  « Annuler / Rétablir » en mots ailleurs ; « Excel » ici, « Exporter les
  liens » là, « Exporter les vols (Excel) » encore ailleurs. Pas de hiérarchie
  claire entre action principale et actions secondaires.
- En-tête global : « Chiffres d'exemple » ressemble à un bouton mais c'est un
  état ; « Exporter la journée » est proposé avant tout calcul.
- Beaucoup de pastilles de couleur (« À REMPLIR », « À UNE ÉQUIPE »,
  « À FAIRE ENSUITE ») qui se disputent l'attention.

### 3. Le responsable de production (métier, Newrest Orly)
- Son travail a quatre temps : **charger les données** (vols, man-hours),
  **décrire l'organisation** (chemins, cases, horaires, plan), **lancer et lire
  la journée**, **comparer des scénarios**. L'interface ne suit pas ces temps.
- Il veut voir d'un coup d'œil **ce qui est réel et ce qui est encore un
  exemple** : vols de démonstration ? barème d'exemple ? cases manquantes ?
- Les paramètres de simulation (décaler les vols, délai de chargement,
  rythme, pauses) sont des **réglages d'essai** : il faut les trouver au même
  endroit, là où l'on compare.

### 4. Le concepteur UX / architecte de l'information
- Principe cassé : **séparer ce qu'on saisit de ce qu'on observe**. Aujourd'hui
  un même onglet mélange les deux.
- La navigation en « étapes numérotées » suggère un parcours linéaire, alors
  qu'on revient sans cesse en arrière (changer une case, relancer, comparer).
  Un **menu par nature** convient mieux qu'un tunnel.
- Pas de **page d'accueil** qui résume l'état et oriente.

### 5. Le directeur d'unité (lit les résultats, ne paramètre pas)
- Il veut une **synthèse d'abord** (commandes à l'heure, retards, goulot,
  stocks, dernière commande prête), puis le détail. Aujourd'hui la synthèse
  (« Les chiffres ») est le 2ᵉ sous-onglet de l'étape 4, derrière le plan
  rejoué.
- Il ne doit pas tomber sur des écrans d'édition en cherchant un chiffre.

### 6. L'accessibilité et l'usage (clavier, petits écrans, lecture)
- Beaucoup de texte à 10–12 px, gris sur gris clair.
- À 1024 px, les outils passent sous les onglets ; l'encart d'aide pousse tout
  le contenu hors de l'écran.
- L'onglet actif se distingue surtout par la couleur.

---

## Les points communs → les changements à faire

| # | Changement | Vu par |
|---|---|---|
| **C1** | **Réorganiser par nature** : Données / Organisation / Réglages / Résultats. Chaque sous-onglet actuel va là où est sa nature (tableau ci-dessous). | novice, métier, UX, directeur |
| **C2** | **Page d'accueil à tuiles** (menu principal) : une tuile par partie, avec son état (réel / exemple / à faire) et, pour Résultats, le chiffre clé. L'aide « Comment ça marche » y vit, et plus en haut de chaque page. | novice, métier, UX, directeur, dev |
| **C3** | **Moins de chrome** : un en-tête compact (logo → accueil, fil « Accueil › Partie › Page », Sauvegarder), plus de barre d'étapes, plus d'encart permanent. Objectif : contenu à moins de 200 px du haut. | dev, novice, accessibilité |
| **C4** | **Des libellés sans ambiguïté** : un nom unique par page ; chaque export/import dit ce qu'il contient (« ⇩ Cases et chemins (Excel) », « ⇩ Barème (Excel) », « ⇩ Vols (Excel) ») ; Annuler / Rétablir partout pareils. | novice, dev, accessibilité |
| **C5** | **Les résultats commencent par une synthèse** : la page d'arrivée de Résultats est « Synthèse » (chiffres + à regarder), puis le plan rejoué, le planning, les commandes, les départs, les stocks, la comparaison. | directeur, métier, novice |
| **C6** | **L'état des données visible** : « exemple » vs « réel » pour les vols et le barème, sur l'accueil et dans Données, plutôt qu'un bouton « Chiffres d'exemple » dans l'en-tête. « Exporter la journée » va dans Résultats. | métier, dev, novice |
| **C7** | **Une grammaire visuelle** : une échelle de texte réduite (12 / 14 / 16 / 20 / 28), un seul style de tableau, un bouton principal par page, des cartes pleine largeur. | dev, accessibilité, directeur |

## La nouvelle structure proposée

**Accueil** — quatre tuiles, plus « Sauvegarder / Restaurer ».

| Partie | Pages (dans l'ordre) | D'où elles viennent |
|---|---|---|
| **Données** | Vols · Temps de travail (barème) | 1 › Le programme (import), 3 › Minutes par vol |
| **Organisation** | Chemins · Cases · Qui prépare quoi · Plan et liens · Contrôles | 2 › Chemins, Cases, tableau ; L'unité › Liens, Ce que le calcul en retient ; l'édition du plan |
| **Réglages** | Horaires (décaler les vols, délai de chargement) · Rythme et pauses | 1 › Le programme (partie « Horaires »), 3 › Rythme et pauses |
| **Résultats** | Synthèse · Le plan rejoué · Planning des équipes · Commandes · Départs · Stocks et retours · Comparer deux essais | 4 › Chiffres, Plan, Stocks, Comparer ; 2 › Leur journée, Les commandes ; 1 › Les départs |

Sauvegarde et « limites connues » : accessibles depuis l'accueil et l'en-tête.

Rien ne se perd : chaque écran existant trouve une place, seule sa porte
d'entrée change.
