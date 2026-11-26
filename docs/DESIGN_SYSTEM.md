# Le design system de Production ORY

Ce document dit comment l'interface est construite depuis la refonte du
08/10 au 12/10 (`docs/REFONTE_UX.md`, étapes 0 à 11), et depuis la deuxième
passe de direction artistique du 15/10 (thème clair : une navigation bleu
nuit, un fond pierre, des cartes qui ont de la profondeur, des titres de page
plus affirmés, des indicateurs à voyant). Il sert à ajouter un écran ou un
composant sans casser l'ensemble : mêmes jetons, mêmes composants, mêmes
règles, en v1 comme en v2.

Ce qui le porte :

| Fichier | Ce qu'il fait |
|---|---|
| `ds.css` | Les jetons des deux thèmes, la base, les composants, la coquille, puis les retouches des vues. Chargé en dernier : il a le dernier mot. |
| `ds.js` | L'infobulle des graphiques et le trait « maintenant ». |
| `palette.js` | La palette « Aller à… » (Ctrl K) et la fiche des raccourcis. |
| `champs.js` | Les champs : l'heure en 24 h, les flèches, le refus au champ, Entrée dans les tableaux. |
| `notifications.js` | Les notifications (avec « Annuler ») et les questions. |
| `problemes.js` | Le registre unique des problèmes. |
| `icones.js` | Les pictogrammes SVG (traits de 1,7 sur 24 × 24). |

Depuis l'évolution 25, **la version 1 a son propre visuel** : une feuille
neuve, `visuel.css`, chargée par elle seule après `ds.css`, redéfinit les
jetons et retouche les composants (§ 10). `ds.css` reste la feuille commune,
identique à sa jumelle de `v2/` : la version 2, gelée, garde le visuel décrit
dans les sections 1 à 9.

Hors de l'application :

- `accueil.html`, le point d'entrée, charge `ds.css` pour ses jetons, sa
  police et ses deux thèmes, puis `visuel.css` (évolution 25). Il défait la coquille dans sa propre feuille :
  c'est un document qui défile, pas la grille de l'application.
  `accueil-browser` le vérifie.
- Les pages de secours (`secours.html`, `v2/secours.html`) restent
  autonomes, et c'est voulu : elles ne chargent rien du site, pour
  s'ouvrir même quand il ne démarre plus.

Une règle passe avant toutes les autres : **une retouche d'interface ne
change ni les données enregistrées ni le calcul**. `donnees-intactes-browser`
le vérifie à chaque batterie.

---

## 1. Les principes

- **La couleur informe, elle ne décore pas.** Une couleur dit une action,
  un état ou une donnée ; jamais un ornement.
- **La couleur n'est jamais seule.** Un état se dit aussi par un mot, un
  pictogramme ou une forme (▲ ▼, pastille, trait).
- **La densité est maîtrisée, pas tassée.** Une grille de 4 px, des
  tableaux compacts, de l'air autour des groupes.
- **Chaque surface a un rôle.** Le fond, la carte, ce qui flotte (une
  fenêtre, une notification, une infobulle).
- **Les nombres priment.** Chiffres tabulaires, alignés à droite dans les
  tableaux, avec leur unité.
- **Les mouvements sont courts et utiles**, et s'arrêtent quand le système
  demande de réduire les animations.

---

## 2. Les jetons

Tous dans `ds.css` (section 1), préfixés `--ds-`. On n'écrit jamais une
couleur, une taille, un rayon ou une durée en dur.

### Échelles

| Famille | Jetons | Valeurs |
|---|---|---|
| Police | `--ds-police`, `--ds-mono` | Inter (embarquée, licence OFL), puis la police du système |
| Tailles de texte | `--ds-t-11` à `--ds-t-32` | 11, 12, 13, 14, 16, 20, 24, 32 px — huit, pas une de plus. En version 1 (évolution 23), les deux premières valent 13 px : aucun texte sous 13 px |
| Graisses | `--ds-g-normal`, `-moyen`, `-fort` | 400, 500, 600 |
| Espacements | `--ds-e-1` à `--ds-e-7` | 4, 8, 12, 16, 24, 32, 48 px |
| Rayons | `--ds-r-1` à `--ds-r-4` | 4 (touche, kbd), 6 (bouton, champ), 8 (carte), 12 (fenêtre) |
| Hauteurs | `--ds-h-compact`, `--ds-h-normal` | 28 et 32 px |
| Durées | `--ds-t-rapide`, `-panneau`, `-vue` | 120, 180, 240 ms, courbe `--ds-courbe` |
| Ombres | `--ds-ombre-1`, `--ds-ombre-carte` (et `-survol`), `--ds-ombre-bouton`, `--ds-ombre-haut`, `--ds-ombre-heros`, `--ds-ombre-flottant` | en clair, une carte de travail se pose sur le fond et s'élève un peu au survol ; le bouton principal a de la matière ; la barre du haut et le titre de la page tiennent au-dessus de ce qui défile. En sombre, seul ce qui flotte garde une ombre (les autres valent `0 0 transparent`, qui se combine, là où `none` ferait tomber toute la déclaration) |
| Focus | `--ds-focus` | un anneau de 3 px à l'accent |

### Couleurs

| Jeton | Clair | Sombre | Pour quoi |
|---|---|---|---|
| `--ds-fond` | `#EDEAE6` (pierre : un gris à peine chaud) | `#0B0D10` | le fond de la page |
| `--ds-surface-1` / `-2` / `-3` | `#FFF` / `#F9F7F5` / `#FFF` | `#111418` / `#171B21` / `#1D222A` | carte ; zone en retrait ; ce qui flotte |
| `--ds-bordure` / `-forte` | `#E2DFDA` / `#CDCAC4` | 8 % / 14 % de blanc | les traits fins ; les champs et boutons |
| `--ds-texte-1` à `-4` | `#0A1626` … `#8794A6` (l'encre bleu nuit) | `#E8EAED` … `#5F6670` | titre et valeur ; texte ; secondaire ; indice (jamais pour une phrase) |
| `--ds-accent` (+ `-fort`, `-texte`, `-doux`, `-trait`, `-pale`) | `#0B6E99` (bleu océan) | `#2CC2B0` | **l'action et la sélection** |
| `--ds-nav-*` (fond, lueur, textes, traits, survol, actif, repère, pastilles) et `--ds-heros-ico` | bleu nuit `#0B1A2E` → `#0D2036`, texte blanc, `#E2E8F0`, `#B4C2D4` ; repère bleu ciel `#38BDF8` | les surfaces et les textes du thème : la barre d'avant la 2e passe | **la navigation**, et le bandeau de l'accueil qui reprend son bleu nuit |
| `--ds-entete-bas` | `#FBFAF9` | `--ds-surface-1` | le bas du titre de la page, à peine plus chaud que le haut |
| `--ds-ok`, `--ds-attente`, `--ds-retard`, `--ds-info` (+ `-texte`, `-doux`) | vert, ambre, rouge, bleu | plus clairs | **les états** |
| `--ds-d1` à `--ds-d6`, `--ds-chaine` | bleu, vert, violet, orange, magenta, ocre ; magenta | bleu, violet, vert, ambre, corail, azur ; magenta (inchangés) | **les données** |
| `--ds-sur-accent`, `--ds-sur-retard`, `--ds-sur-attente`, `--ds-sur-donnee` | blanc | presque noir | le texte posé sur ces couleurs pleines |
| `--ds-trait-plan`, `--ds-trait-lien` | gris bleuté | les mêmes | le contour d'un service sur le plan ; un lien entre services |

`tests/contraste.test.cjs` vérifie le contraste AA (4,5:1) de chaque texte
sur chaque surface où il se pose, dans les deux thèmes : un jeton retouché
sans être vérifié fait échouer la batterie.

Les anciennes variables des vues (`--bg`, `--txt`, `--accent`, `--cab-BC`…)
pointent sur ces jetons (section 2 de `ds.css`) : on ne les emploie plus
dans du code neuf. En clair, les classes de cabine y suivent le nouvel ordre
de la palette pour garder leur famille de couleur (Business ocre, Premium
violet, Économie vert, Équipage bleu, repas spéciaux orangés).

---

## 3. Les règles de la couleur

- **L'accent** dit ce qui se fait ou ce qui est choisi : le bouton
  principal, un lien, la page ouverte, le focus, le lecteur du rejeu et son
  trait « maintenant ». Une donnée n'est jamais à l'accent.
- **Les états** (à l'heure, en attente, en retard, information) portent un
  sens. Leur fond teinté (`-doux`) reçoit leur texte foncé (`-texte`). Ils
  vont toujours avec un mot ou une forme : « ▼ −25 min mieux », une
  pastille et son libellé.
- **Les données** servent à reconnaître, pas à juger : les classes de
  cabine (`--cab-*`), les séries d'un graphique, les barres du planning de
  la v2 (l'équipe en `d1`, le robot en `d2`, la chaîne en `--ds-chaine`), les
  jauges du budget (vacations en `d1`, heures sup en `d4`), les colonnes de
  la carte des chemins (`d1` à `d6`, dans l'ordre). Un texte posé dessus
  prend `--ds-sur-donnee` (4,5:1 sur `d1`, `d2` et la chaîne).
- **L'ordre de la palette compte.** Deux couleurs voisines restent
  distinctes en vision normale (écart ≥ 15) comme pour un daltonien (≥ 8),
  avec un contraste d'au moins 3:1 sur les cartes. On le mesure avec le
  validateur de la méthode, pas à l'œil : le trio du planning (équipe,
  robot, chaîne), les deux jauges du budget, les classes dans l'ordre de
  leurs barres et les six couleurs dans leur ordre passent (15/10).
  L'ancienne palette donnait le même bleu à `d1` et `d2` pour un daltonien
  (écart 0,5).
- Une carte indicateur reste **neutre** : le ton est dans son voyant (un
  trait de 4 px à gauche) et dans son chiffre, jamais en aplat sur toute la
  carte.

---

## 4. Les thèmes

Clair par défaut ; sombre au choix (« Thème sombre », au pied de la barre
latérale). Le thème est un attribut, `data-theme="sombre"` sur `<html>`,
posé avant le premier affichage. Il est retenu sous `ory-ui-theme` : une
préférence d'affichage, jamais une donnée. En sombre, l'élévation se lit à
la luminance des surfaces, pas aux ombres. Dans la version 1, c'est
`theme-tot.js`, appelé en tête de page, qui le pose (correction 22) : plus
de script en ligne qui lit le stockage (`BANC_ESSAI.md`, § 11).

La deuxième passe (15/10) ne concerne que le thème clair. En sombre, les
jetons de la navigation renvoient aux surfaces et aux textes du thème : la
barre latérale et le bandeau de l'accueil y gardent leur allure d'avant, et
la palette des données son ordre. Seule la structure est commune aux deux
thèmes : le titre de la page, les voyants des indicateurs, les en-têtes de
tableau.

---

## 5. Les composants

### Boutons

| Classe | Rôle |
|---|---|
| `.btn` | secondaire, le cas courant (32 px ; `.btn-sm` 28 px) |
| `.btn.btn-play` | principal : un par zone au plus, le geste attendu |
| `.btn.btn-danger` | ce qui ne se défait pas, dans une question seulement |
| `.svc-danger`, `.at-danger` | un geste qui retire, discret, sans aplat rouge |
| `.btn-icone` | un pictogramme seul ; **toujours** `aria-label` et `title` |
| `.lien-discret`, `.lien-fort` | un lien dans le texte |

### Champs

- Tous les champs ont la même allure (`ds.css`, « Champs ») et le même
  focus (bordure et anneau à l'accent).
- **L'heure en 24 h** : `<input data-heure>`, un champ texte. `champs.js`
  lit « 0430 », « 4:30 », « 4h30 » et écrit « 04:30 ». ↑↓ avancent d'un
  quart d'heure, Maj+↑↓ d'une heure. Une heure impossible est refusée,
  jamais devinée.
- **Le champ avec son unité** : l'unité dans le champ, à droite, en gris
  (`.champ-unite`, écrit par `avecUnite(champ, unite)`). Dans un tableau,
  l'unité est une fois dans l'en-tête, pas dans chaque case.
- **Le refus au champ** : `OrlyChamps.refuser(champ, raison)` écrit la
  raison sous le champ (`.champ-erreur`, `aria-invalid`,
  `aria-describedby`), remet la valeur gardée et choisit le texte : on
  retape par-dessus.
- Maj+↑↓ fait dix pas dans un nombre.

### Tableaux

- En-têtes de colonne (2e passe) : 11 px, petites capitales espacées,
  `--ds-texte-3`, sur `--ds-surface-2`, un trait `--ds-bordure-forte`
  dessous.
- Les nombres à droite, en chiffres tabulaires.
- Un grand tableau garde ses titres et sa première colonne à l'écran
  (`position: sticky`).
- `table[data-clavier]` : Entrée enregistre et descend dans la même
  colonne ; Maj+Entrée remonte (`champs.js`).

### Cartes et indicateurs

- Une carte : `--ds-surface-1`, une bordure fine, un rayon de 8 px ; une
  carte de travail se pose sur le fond par `--ds-ombre-carte` et s'élève
  au survol (`--ds-ombre-carte-survol`). Un état à gauche (« à faire »,
  « fait ») s'y ajoute en ombre intérieure : `inset 3px 0 0 <ton>,
  var(--ds-ombre-carte)`.
- **Le planning des équipes de la v1** (évolution 14 c, `planning-vue.css`)
  : le travail en barre pleine d'accent, une seule couleur ; le robot et le
  lavage s'en distinguent par un motif discret, le travail à la chaîne par
  une encoche — des formes, pas des couleurs. Les couleurs d'état ne disent
  qu'un état : l'attente des amonts (avertissement, en bande fine), un lot
  en retard (contour critique et icône). Le trait de l'heure rejouée est à
  l'encre (`--ds-texte-1`), distinct des barres. Lignes de 28 px, textes de
  12 à 13 px, à toute largeur.
- **Le plan rejoué de la v1** (évolution 14 b, `plan-flux.css`) : les quatre
  états en remplissage franc — `--ds-accent`, `--ds-attente`, `--ds-texte-4`,
  `--ds-survol` à contour pointillé `--ds-texte-3` (le gris clair ne tient
  pas 3:1 ; son contour, si) ; le texte sur le remplissage en
  `--ds-sur-accent`, `--ds-sur-attente` ou à l'encre ; les traits de « Ce qui
  circule » en `--ds-texte-2`, des épaisseurs de 1 à 8 px qui ne grossissent
  pas avec le zoom.
- La **carte indicateur** (`.bilan-cle`, la synthèse ; les tuiles du
  budget la suivent) : un voyant de 4 px à gauche à la couleur de son ton —
  dans la synthèse de la v1 (évolution 14 d), le ton suit l'état de la
  valeur : un retard nul n'est jamais critique, un compte « à l'heure »
  garde son chiffre à l'encre —,
  un libellé de 11 px en capitales, le chiffre en 32 px tabulaire, ce sur
  quoi il compte (« 0 sur 7 · 0 % »). Elle mène à sa page. Une tuile du
  budget prend la couleur de ce qu'elle résume dans la jauge (le budget en
  trait, les vacations, les heures sup) ou le ton de l'écart.
- Un groupe de lignes (`.bilan-groupe`) : un titre de 11 px en capitales à
  l'accent, souligné d'un trait de 2 px à l'encre, puis des lignes sobres,
  chacune avec son lien.
- **La Synthèse de la v1** (évolution 15 b, `synthese-vue.css`) : deux phrases
  en 16 px ; des cartes réponse (`.sy-carte`) au voyant de 4 px, dont le ton
  dit l'état — `--ds-ok` quand rien ne coince ou rien n'est en retard,
  `--ds-attente` pour un goulot, `--ds-retard` seulement pour des retards —,
  autant de colonnes que de cartes ; le tableau « Les services », ses barres
  de 44 px (l'écart centré sur zéro, en `--ds-texte-4` ; l'occupation en
  `--ds-d1`), une case au-delà de son seuil sur fond `--ds-attente-doux`, avec
  son icône et des mots, jamais la couleur seule ; la courbe de la journée
  aux couleurs de la vue Charge (`.ch-presents`, `.ch-travail`, `.ch-file`),
  les départs en traits `--ds-texte-2`, une bulle qui suit la souris et les
  flèches.

### Pastilles et étiquettes

- Le nombre d'un onglet (`.so-badge`), en ton neutre ou d'attente.
- Une étiquette d'avertissement (« Montants d'exemple, fictifs. ») : fond
  teinté d'attente, texte d'attente. Elle ne ressemble pas à un bouton.

### Notifications, questions, problèmes

- **Un geste, une notification** (`notifications.js`), en bas à droite,
  avec « Annuler » quand le geste se défait.
- **Une question** (`dialog.question`) seulement pour ce qui ne se défait
  pas : restaurer une sauvegarde, recharger la démo.
- **Un seul registre des problèmes** (`problemes.js`) : à corriger, à
  compléter, ce que la journée montre. Chaque problème mène à la page où il
  se règle. Le compte est au pied de la barre latérale et sur les onglets.
  Il se refait juste après un changement, pas pendant (§ 8).
- **Un état vide** (`.vide-carte`) : une phrase, et le geste qui le remplit.

### La coquille

- **La barre latérale** : bleu nuit en clair (`--ds-nav-*`) ; les parties
  dans l'ordre du travail ; celle qui est ouverte, éclairée d'un trait bleu
  ciel, déplie ses pages ; au pied, les problèmes, la sauvegarde, le thème,
  l'autre version. (En version 1, depuis l'évolution 22 : deux blocs, toutes
  les entrées visibles ; au pied, « Fichiers », « Lecture seule » et le
  thème — voir « Une page de réglage », plus bas.) Le focus y prend le
  repère bleu ciel, qui se voit sur le bleu nuit. Un texte clair sur fond foncé paraît plus fin : les parties
  sont en 14 px, les pages en graisse moyenne (la page ouverte en gras), le
  texte presque blanc.
- **La barre du haut** : le fil d'Ariane ; « Calcul à jour » (le point bat
  quand le calcul vient de suivre un changement) ; « Aller à… » ; un seul
  Annuler / Rétablir pour ce que la page modifie.
- **Le titre de la page** : la partie en surtitre (11 px, capitales, à
  l'accent), le nom de la page en 20 px, une phrase qui dit ce qu'on voit,
  et les outils de la page à droite. Le surtitre et le grand titre sont pour
  l'œil (`aria-hidden`) : pour un lecteur d'écran, le titre de la page reste
  celui de la barre du haut (`#view-title`). Une seule rangée sous la barre
  du haut : `menu-browser` la veut finie avant 132 px. Sur un écran bas
  (820 px ou moins), le surtitre se retire : le fil d'Ariane dit déjà la
  partie, et le contenu remonte (`rejeu-browser` : le plan d'abord, à
  1 024 × 768 aussi). Les onglets d'un groupe de pages (« Détails ») sont
  sous le titre et sa phrase, jamais au-dessus (version 1, correction 23 b,
  `lisible.css`).
- Un fond en dégradé garde une couleur de repli (`linear-gradient(…)
  var(--ds-nav-fond)`) : c'est elle que lisent les contrôles de contraste.
- **L'accueil** : le bandeau de l'histoire reprend le bleu nuit de la
  navigation, éclairé d'une lueur ; les étapes s'y lisent en clair.

### Une page de réglage : la liste à gauche, la fiche à droite (version 1, évolution 22)

Le gabarit des pages qui règlent plusieurs choses de même sorte —
« Services et équipes » (les services), « Chemins » (les chemins).

- **Deux colonnes.** À gauche, la liste : une ligne par chose, son nom et
  l'essentiel en une ligne ; « Ajouter… » en tête. À droite, la fiche de la
  chose choisie : son nom en tête, puis des **sections repliées**
  (`<details>`), la plus utile ouverte.
- **La page ne défile pas.** Elle tient sur l'écran d'un portable
  (1 366 × 768) : la vue range ses blocs en colonne, le cadre prend la
  hauteur qui reste, et **chaque colonne défile seule** (`overflow:auto`,
  `min-height:0`). Une seule zone qui défile par colonne.
- **Texte de 13 px au moins** (`--ds-t-13`), y compris les notes et les
  en-têtes de tableau repris d'un composant commun.
- **Un réglage qui ne joue pas reste caché** (`jouent.js`) ; la fiche dit
  combien, en une ligne.
- **Variantes.** « Contrôles » : une ligne d'état, puis trois colonnes égales
  (un niveau d'avis chacune), chacune avec sa zone qui défile. « Fichiers » :
  deux panneaux en haut, puis un tableau qui prend la hauteur qui reste et
  défile seul, ses en-têtes en vue (`position:sticky`).
- **Écran étroit** (900 px ou moins ; 1 000 px pour « Contrôles ») : les colonnes passent l'une sous
  l'autre, et la page défile.
- **Le menu de la version 1** (`menu.css`) : deux blocs, « Lire » et
  « Régler », toutes les entrées visibles ; au pied, « Fichiers »,
  l'interrupteur « Lecture seule » (`role="switch"`, un témoin qui glisse) et
  le thème. En lecture seule, le bloc « Régler » se replie en une ligne, un
  cadenas et « Paramétrage verrouillé » ; un lien vers un réglage est grisé,
  le mot à sa suite (`lecture-seule.css`).

Les feuilles de ces pages (`services-page.css`, `chemins-page.css`,
`controles-page.css`, `fichiers-page.css`) sont propres à la version 1 :
`unite.css`, `ateliers.css` et `ds.css`, communs avec la version 2, ne sont
pas modifiés. Contrôlé par le test de chaque page et par
`tests/captures-evolution-22-browser.cjs`.

### Les trois règles d'une page (version 1, évolution 23)

Toute page du menu les tient, aux deux tailles de référence (1 366 × 768 et
1 920 × 1 080). `tests/pages-menu-browser.cjs` parcourt les pages du menu —
chaque entrée, chaque onglet de « Détails », chaque section de « Réglages »,
la fiche d'un service, celle d'une équipe, un chemin — et échoue si l'une
manque.

1. **Un texte lisible.** Aucun texte sous 13 px, résultats compris. Dans un
   dessin (un schéma, un graphique, la scène en direct : un `<svg>`), 12 px
   au moins **à l'écran** : la taille dessinée, une fois l'échelle du dessin
   appliquée. En version 1, les deux plus petites tailles du système
   (`--ds-t-11`, `--ds-t-12`) valent 13 px (`lisible.css`) : une règle qui les
   nomme suit sans retouche. Un schéma plus grand que son cadre y défile
   plutôt que de se réduire (« Chemins », évolution 23 c).
2. **Un écran par page.** La fenêtre ne défile pas, ni la page : seules
   défilent ses zones — une liste, une fiche, un tableau —, **une par
   colonne, jamais l'une dans l'autre**. Ce qui reste en tête de la page (son
   titre, sa phrase, la barre du jour, un compte, un avis) ne défile pas. Une
   zone porte la classe `page-zone` ; un tableau qui défile dans son cadre a
   son en-tête figé. Rien n'est coupé non plus : ce qui dépasse d'un bloc
   défile, ou se replie. Sur un écran étroit (860 px) ou très bas (560 px), la
   page défile comme avant.
   **Une exception** (correction 23 i) : un long tableau dans une page qui
   défile déjà — le tableau jour par jour de « Période », entre sa courbe et
   « Réel et calage » — défile dans son propre cadre. Un en-tête ne se fige
   que dans le cadre qui défile : laissé à la zone de la page, il partait avec
   elle. Ce cadre n'est jamais plus haut que la zone (70 % de la fenêtre au
   plus) : il s'y voit en entier.
3. **Les colonnes prennent la largeur.** Une page ne tient pas dans une
   demi-largeur en laissant l'autre vide : le contenu va d'un bord à l'autre.
   Un champ, lui, garde une largeur de champ. Un petit tableau non plus ne
   s'étire pas : sa carte va d'un bord à l'autre, ses colonnes prennent la
   largeur de leur contenu (« Détails › Heures sup et renforts », trois
   colonnes ; correction 23 b).

Avec elles :

- **Moins de mots.** Une phrase d'introduction au plus par page (`intro`,
  dans `onglets.js` ; `tests/onglets.test.cjs` le vérifie). Une explication
  longue passe derrière son bouton d'aide (`details.aide`) : la légende du
  tableau de la Synthèse, « Comment lire ce tableau ».
- **Un compte rendu tient en deux lignes** ; son détail est replié
  (« Programme », évolution 23 f).
- **Un champ ne coupe ni sa valeur ni son texte d'attente** : « Postes de
  travail », vide, dit « sans limite » en entier.
- **Aucun résultat sur une page de réglage** : un résultat se lit dans le
  bloc « Lire » ; la page de réglage y mène par un lien.

`lisible.css`, chargée la dernière par la version 1 seule, porte ces règles ;
les feuilles communes avec la version 2 ne sont pas modifiées. Les captures
de contrôle : `tests/captures-evolution-23-browser.cjs`.

### La palette et la fiche des raccourcis (`palette.js`)

- **Ctrl K** (⌘ K) ou « Aller à… » ouvre la palette : une page, un service,
  une équipe, une commande ou un geste.
- On cherche sans accents ni majuscules. Le début du nom compte le plus, ce
  qui répond est marqué.
- Les flèches choisissent, Entrée ouvre, Échap ferme. Après un saut de
  page, le focus va à la page.
- Rôles : `dialog`, `combobox` et `listbox`, avec des groupes et
  `aria-activedescendant`.
- La touche **?** ouvre la fiche des raccourcis, hors d'un champ.
- Un raccourci nouveau s'ajoute dans `sections()` de `palette.js` : la
  fiche est la liste de référence.

### Les graphiques (`ds.js`)

- **La palette des données**, une même échelle quand on compare, et une
  légende quand les couleurs ne s'expliquent pas d'elles-mêmes.
- **L'étiquette dans la barre quand elle tient**, et seulement alors. On
  l'estime avec `OrlyDS.largeurTexte`, et le test vérifie avec la largeur
  réelle.
- **L'infobulle** : un graphique `class="ds-graphique"`, et sur chaque
  élément un `data-info`, sur plusieurs lignes si besoin. Elle s'ouvre tout
  de suite au survol, sans `<title>` natif en double.
- **Le trait « maintenant »** : le graphique déclare son axe du temps,
  `data-axe="t0 t1 x0 x1 y0 y1"` (minutes, puis unités du dessin). Avec
  `data-axe-etiquette`, l'heure s'écrit en haut, en bas (`bas`) ou pas du
  tout (`aucune`). Les repères d'axe marqués `.ds-axe-heure` s'effacent
  sous l'heure. Après avoir dessiné, on appelle `OrlyDS.maintenant()`.

---

## 6. Les mouvements

| Ce qui bouge | Comment | Durée |
|---|---|---|
| Une page qui arrive | fondu | 180 ms |
| Une fenêtre (palette, fiche, question, problèmes) | apparaît, à peine décalée | 180 ms |
| Une notification | entre par le bas | 180 ms |
| Le point du calcul | bat une fois | 700 ms, discret |
| Une équipe retrouvée par la palette | s'éclaire un instant | 240 ms |
| Survol, focus | couleur, bordure | 120 ms |

Ne bouge pas : l'infobulle (instantanée), les données, les tableaux.
Quand le système demande de **réduire les animations**, tout s'arrête :
`ds.css` coupe animations et transitions, et `palette-browser` le vérifie.

---

## 7. Le clavier et le focus

- **Un anneau partout** : `:focus-visible` à l'accent, jamais le contour
  gris du navigateur. `focus-browser` passe sur chaque élément atteint par
  Tab, sur toutes les pages, dans les deux thèmes, v1 et v2.
- Un bouton-icône a un nom accessible. Quand le texte d'un bouton se cache
  sur un écran étroit, son `title` prend le relais.
- Une zone qui reçoit le focus pour qu'on reprenne en haut (la page après
  un saut) ne s'entoure pas d'un cadre : ce n'est pas une commande.
- Les raccourcis sont tous dans la fiche (touche ?).

---

## 8. La latence

Critère de l'étape 10 : **un changement ne coûte pas plus de 10 % de plus
qu'avant la refonte**. La référence est le commit `fbe9654`, mesurée sur la
même machine avec l'unité type de `donnees-intactes`. Trois règles tiennent
ce budget, et `latence-browser` les vérifie sans chronomètre :

1. **Rien ne se calcule deux fois pour un même changement.** Les bilans des
   services, par exemple, sont gardés le temps du calcul (`bilanDuCalcul`).
2. **Ce qui ne se regarde pas tout de suite se fait juste après.** Le
   registre des problèmes en est l'exemple : ce qu'on vient de modifier
   s'affiche d'abord.
3. **On ne lit pas de tailles au milieu d'un calcul.** `scrollWidth` ou
   `offsetHeight` y forcent une mise en page : on ne mesure que ce qui a
   changé.

---

## 9. Ajouter un écran : la liste

1. Les jetons seulement : aucune couleur, taille, rayon ni durée en dur.
2. Les composants qui existent ; un nouveau composant va dans `ds.css`
   (section 4) avec un commentaire qui dit son rôle.
3. Le focus visible, un nom accessible pour chaque bouton-icône.
4. L'unité dans le champ, l'heure en 24 h, le refus au champ.
5. v1 et v2. Les fichiers communs sont identiques, copiés de l'un à
   l'autre ; `tests/parite.test.cjs` en tient la liste et refuse une
   retouche faite d'un seul côté. La version 2 est gelée (évolution 25) :
   une feuille commune ne se modifie plus ; ce qui est propre au visuel de
   la version 1 va dans `visuel.css` (§ 10).
6. Aucune clé de stockage nouvelle pour une donnée. Une préférence
   d'affichage prend `ory-ui-…`.
7. Un test navigateur pour le nouvel écran. `focus-browser`,
   `donnees-intactes-browser`, `contraste.test` et `latence-browser`
   restent verts.
8. `node outils/empreinte.cjs` avant de livrer.
9. **Jamais le plan de l'unité dans une capture** : il est confidentiel. Le
   dessin est masqué dans toute capture, et les tests n'en écrivent aucune.
0. En version 1, les trois règles d'une page : un texte de 13 px au moins,
   un écran par page (seules défilent ses zones, une par colonne), les
   colonnes prennent la largeur. `tests/pages-menu-browser.cjs` les vérifie
   sur chaque page du menu : une nouvelle page y entre.
10. Une page de réglage (version 1) suit le gabarit « la liste à gauche, la
    fiche à droite » : elle tient sur l'écran d'un portable, chaque colonne
    défile seule, texte de 13 px au moins. En lecture seule, elle ne s'ouvre
    pas ; une page de résultats n'y montre aucun geste qui change un réglage.

---

## 10. Version 1 : le visuel de l'évolution 25

Le chef de projet a choisi une direction sur une maquette (unité fictive,
hors dépôt) : un menu bordeaux sombre, un fond clair chaud, des cartes
blanches arrondies, une couleur d'action caramel. Elle se pose sur les pages
qui existent, sans rien changer à leur structure : mêmes pages, mêmes champs,
mêmes textes, mêmes gestes.

| Fichier | Ce qu'il fait |
|---|---|
| `visuel.css` | Les jetons de la version 1, dans les deux thèmes, puis la coquille et les composants. Chargée par `index.html` (après `ds.css` et les feuilles des vues, juste avant `lisible.css`, qui garde ses trois règles) et par `accueil.html`. Aucune police, aucune image, aucune ressource venue du réseau. |
| `visuel.js` | Ce que la feuille ne sait pas dire seule : l'ombre de la barre du haut quand un contenu défile dessous ; un texte d'attente vide pour les champs qui n'en ont pas, afin que la feuille reconnaisse un champ vide. Il ne lit ni n'écrit aucune donnée, et ne change aucun texte. |
| `pastilles.js` | La compagnie et la classe, partout les mêmes : il habille leur nom là où il se lit seul (une pastille, une étiquette), dit le rang de couleur de chaque compagnie (automatique ou choisi) et dessine la carte « Couleurs des compagnies ». Chargé par la version 1 seule |

### Les jetons redéfinis

`visuel.css` ne crée pas un second système : elle redonne une valeur aux
jetons `--ds-*` de `ds.css`, et les composants suivent d'eux-mêmes.

| Jetons | Rôle | Clair | Sombre |
|---|---|---|---|
| `--ds-fond`, `--ds-surface-1` à `-3`, `--ds-survol` | le fond de la page, les cartes posées dessus | fond chaud `#FBF8F6`, cartes blanches | brun presque noir `#161113`, cartes `#1E1719` |
| `--ds-texte-1` à `-4` | l'encre | `#2A1F23` (à la place du bleu nuit) | `#F2EAEC` |
| `--ds-accent` et sa famille | l'action : bouton principal, lien, focus | caramel `#B95B0F` | pêche `#F08A4B` |
| `--ds-accent-pale` | l'élément choisi d'une liste | `#FFF1E7` | `#3A261C` |
| `--ds-nav-*` | le menu et le bandeau de l'accueil | bordeaux `#2E0F1A`, uni, repère pêche `#FF9853` | les surfaces du thème, comme dans `ds.css` |
| `--ds-ok`, `--ds-attente`, `--ds-retard`, `--ds-info` | les états | l'attente passe au jaune ocre `#8A6A00` : l'ambre ressemblerait au caramel de l'accent | `#D6B13A` |
| `--ds-d1` à `--ds-d6`, `--ds-chaine` | les données | bleu, vert, violet, bordeaux, magenta, ocre | leurs teintes claires |
| `--ds-saisi-fond`, `--ds-saisi-bord` | **neufs** : le fond et le trait d'un champ qui porte une valeur saisie | `#FFF7F0`, `#F0D3BE` | `#2E2019`, `#5A3A28` |
| `--ds-r-1` à `--ds-r-4` | les rayons | 5, 8, 14 et 16 px : un champ et un bouton à 8 px, une carte à 14 px | les mêmes |
| `--ds-ombre-*`, `--ds-focus`, `--ds-voile`, `--ds-trait-plan`, `--ds-trait-lien` | les ombres, l'anneau du focus, le voile, les traits du dessin | leur forme d'avant, reteintée : l'encre à la place du bleu nuit, l'accent pour le focus | les ombres restent effacées ; le focus à l'accent |

Les échelles (tailles de texte, graisses, grille de 4 px, hauteurs de 28 et
32 px, mouvements) ne changent pas : aucune page ne doit se mettre à défiler.

**Les couleurs des classes**, dans les deux thèmes : Équipage `d1` (bleu),
Économie `d2` (vert), Premium `d3` (violet), Business `d4` (bordeaux), repas
spéciaux `d6` (ocre). `d5` (magenta) reste à la chaîne. Les retours de
matériel gardent leur violet (`d3`). Ce que dit une couleur dans un dessin ne
change pas (équipe, robot, chaîne, classe) : seules les teintes changent.

**La cascade décide, et la force des sélecteurs compte.**

- En thème sombre, le bloc de `ds.css` (`:root[data-theme="sombre"]`)
  l'emporte sur le `:root` de `visuel.css`. C'est voulu : la navigation y
  reste branchée sur les surfaces du thème, les ombres y restent effacées.
  Le bloc sombre de `visuel.css` redéfinit le reste.
- Les classes (`--cab-*`), `--violet` et `--edge-retour` sont redéfinis avec
  un sélecteur de la force de celui de `ds.css`
  (`:root:not([data-theme="sombre"])`) : un simple `:root` ne l'emporterait
  pas en thème clair.

**Une valeur de la maquette a bougé** : le texte 4 du thème sombre,
`#75696E` → `#73676C`. Sur le plan rejoué, un service qui a fini se remplit
du texte 4 et porte son nom en texte 1 : à `#75696E`, ce nom tenait 4,44:1 ;
à `#73676C`, 4,57:1, et le remplissage garde 3:1 sur la carte. Les autres
valeurs sont celles de la maquette. La feuille y ajoute ce que la maquette ne
donnait pas : les ombres, le focus, le voile et les traits du dessin,
reteintés.

**Contraste.** `tests/contraste.test.cjs` lit `visuel.css` par-dessus
`ds.css`, dans l'ordre de la cascade, et refait pour la version 1 toutes ses
vérifications (4,5:1 pour un texte, 3:1 pour une forme), plus : l'étiquette
sur chacune des six couleurs de donnée et sur la chaîne, le texte 1 et le
texte 3 sur le fond d'un champ saisi, les traits du dessin sur une carte, le
texte 1 sur le texte 4.
`tests/visuel-jetons-browser.cjs` lit les valeurs calculées dans la page,
dans les deux thèmes, et vérifie que la version 2 garde les siennes.

### La coquille et les composants (évolution 25 b)

Tout vient de `visuel.css` : le balisage des pages ne change pas.

| | |
|---|---|
| Le menu | Un fond uni (`--ds-nav-fond`), sans dégradé ni lueur. L'entrée ouverte : le texte du menu, un fond éclairci (`--ds-nav-actif` : blanc à 10 % en clair), un trait de 3 px au repère à gauche. Les titres de bloc (« Lire », « Régler ») en minuscules : 13 px, graisse 500, sans lettres espacées. |
| Un compteur | Une pastille au repère (`--ds-nav-repere`, pêche), son chiffre à la couleur du menu. Il ne change plus de couleur avec l'état : ce qu'il compte se dit dans sa bulle et sur la page qu'il ouvre. |
| La marque | Un carré arrondi (rayon de 9 px) au repère. |
| Le haut d'une page | Plus de bandeau ni d'ombre derrière le titre, qui se pose sur le fond de la page : 22 px, graisse 600, `letter-spacing:-0.01em`. L'en-tête garde sa hauteur au pixel. |
| La barre du haut | Son ombre n'apparaît que quand un contenu défile dessous (`visuel.js` pose `data-defile-sous-la-barre` sur `<body>`) : l'accueil, ou une page qui défile en entier sur un écran étroit. Une zone sous le titre d'une page défile sous ce qui la précède, pas sous la barre. |
| Une carte | Rayon de 14 px (`--ds-r-3`), trait `--ds-bordure`, l'ombre `--ds-ombre-carte`. Elle ne s'élève au survol que si elle se clique (une tuile de l'accueil, un service de la liste). Le plus grand rayon (16 px) reste aux fenêtres (une question, la palette) et au bandeau de l'accueil. |
| Un bouton | Rayon de 8 px. Le principal : plein, à l'accent, son texte en `--ds-sur-accent`. Les autres : fond de carte, trait `--ds-bordure-forte`. Le geste qui détruit garde sa couleur. Les hauteurs ne changent pas : 28 et 32 px. |
| Un choix parmi quelques-uns | Les onglets d'une page, un filtre, les jours et les zooms du planning, « Par vol / Sur la journée », « Référence / Essai » : des pastilles arrondies (`border-radius:999px`), 28 px de haut. Celle qui est choisie est pleine : `--ds-choix-fond`, `--ds-choix-texte`, `--ds-choix-trait` — le bordeaux du menu et du blanc en clair ; en sombre, `--ds-surface-3` et `--ds-texte-1`, cernés de l'accent. |
| Un tableau | Des en-têtes en minuscules : 13 px, graisse 500, `--ds-texte-3`, sans capitales espacées. Une ligne fine entre les rangées, le survol à `--ds-survol` ; la rangée choisie sur `--ds-accent-pale`, un trait d'accent de 3 px à gauche. Les chiffres tabulaires, à droite, comme avant. |

**Plus aucune capitale forcée.** Un titre de bloc, un surtitre, une étiquette
s'écrivent comme la page les écrit, sans lettres espacées : `visuel.css`
reprend, sélecteur par sélecteur, les règles des feuilles (communes ou
propres) qui posaient `text-transform:uppercase`. Un titre de bloc est le
même partout : 13 px, graisse 500, le troisième gris.

Aucun mouvement n'est ajouté. `tests/pages-menu-browser.cjs` parcourt chaque
page du menu aux deux tailles et dans les deux thèmes : les trois règles
d'une page tiennent, aucun élément visible n'est en capitales forcées, le
fond du menu et l'accent sont ceux de la feuille.
`tests/visuel-coquille-browser.cjs` vérifie chaque composant de ce tableau,
dans les deux thèmes.

### Les trois allures d'une valeur (évolution 25 c)

Le constat du chef de projet : « on ne distingue pas les données rentrées du
texte brut ». Une valeur a trois allures, les mêmes sur toutes les pages.

| Une valeur… | Son allure |
|---|---|
| **saisie** | Un champ au fond `--ds-saisi-fond`, au trait `--ds-saisi-bord`, graisse 600. |
| **reprise** — le défaut, la valeur de l'étage au-dessus | Un champ laissé vide, sur le fond de carte, au trait `--ds-bordure-forte`, qui la montre en texte d'attente : en italique, à `--ds-texte-3` (4,5:1 au moins). |
| **calculée**, qui ne se modifie pas | Du texte, sans cadre ni fond. |

Et, avec elles :

- **Une liste déroulante** : fond de carte quand son choix est l'option vide
  (« comme… », « choisir… », « aucun ») ; allure de champ saisi pour tout
  autre choix. En CSS : `select:has(option:checked[value=""])`. Une liste
  dont chaque option est une valeur (ce que fait un service, le service
  d'une équipe, son jour de travail…) n'a pas d'option vide : elle a
  toujours l'allure du saisi.
- **Un champ désactivé**, et tout champ **en lecture seule** : le fond en
  retrait (`--ds-surface-2`), graisse normale, pas de pêche.
- **Ce qui commande une vue n'est pas une donnée** : une recherche, le jour
  affiché, la mesure d'une période, un filtre gardent le fond de carte, même
  remplis.
- **Une case à cocher, un bouton radio, un curseur** : `accent-color` à
  l'accent.
- **Une légende** reprend ce code. Celle du tableau de tous les temps par
  vol : « valeur propre » sur le fond du saisi, « toutes compagnies » en
  italique gris ; son aide le dit (« Fond pêche : une valeur saisie ;
  italique gris : la valeur reprise »).

Comment un champ vide se reconnaît : à son texte d'attente
(`:placeholder-shown`), qui suit la frappe sans attendre un rendu.
`visuel.js` donne un texte d'attente vide (une espace) aux champs qui n'en
ont pas ; il ne change ni leur valeur ni ce que la page en lit.

La force des sélecteurs : des feuilles de vues règlent leurs champs sous un
identifiant (`#view-ateliers input…`). Les règles de `visuel.css` commencent
par `:is(#workspace,body)`, qui vaut pour toute la page et leur donne la
force d'un identifiant, sans `!important` ; `:where()` écarte sans rien
peser (le champ de la palette, les commandes de vue, la lecture seule).

`tests/visuel-champs-browser.cjs` le vérifie dans les deux thèmes, sur une
fiche de service et sur le tableau de tous les temps par vol.

### La pastille et l'étiquette (évolution 25 d)

Le constat du chef de projet : « les compagnies ont le même texte que le
reste de la page ». Une compagnie et une commande (une compagnie et une
classe) ont une allure, la même sur toutes les pages. Un module de la
version 1 la pose : `pastilles.js`.

| Ce qui est nommé | Son allure |
|---|---|
| **Une compagnie** | Une pastille pleine à sa couleur : rayon 6 px, hauteur 22 px, graisse 700. Un nom de quatre caractères au plus tient dedans, sans être répété. Un nom plus long y laisse ses deux premières lettres, en capitales, et suit en entier, en graisse 500 (« CI » puis « Ciel Charter »). |
| **Une classe** | Une étiquette arrondie : hauteur 22 px, fond `--ds-survol`, texte `--ds-texte-1`, un point de 8 px à la couleur de la classe (`--cab-*`, § « Les jetons redéfinis »), puis le nom de la classe tel que la page l'écrit (« Business », « BC »). |
| **Une commande** | La pastille de sa compagnie, puis l'étiquette de sa classe. Ce qui les liait dans le texte (« · », une espace, « / ») reste dans le texte et devient l'écart entre les deux. |

**Le texte lu ne change pas.** Les pages écrivent leurs noms comme avant ;
le module enveloppe les nœuds de texte, sans en réécrire un caractère :
`textContent`, le lecteur d'écran et le copier-coller rendent ce qu'ils
rendaient. Les deux lettres et le point sont des pseudo-éléments (un décor).
Les deux lettres sont écrites en capitales par le module : aucun
`text-transform`.

**Où.** Là où une compagnie ou une commande se lit seule : la tête d'une
rangée, une cellule qui la nomme, une liste (et, le jour où une page en
aura, une légende ou le titre d'une fiche). La liste des endroits est dans
le module (`LIEUX`) ; un texte n'y est habillé que s'il nomme, à lui seul,
une compagnie de l'unité ou une de ses commandes. Jamais dans une phrase, une
énumération, une `<option>`, un fichier exporté ni un dessin.

| Page | Endroit |
|---|---|
| Détails › Commandes | la tête de rangée d'une commande ; les commandes retirées ; « Étapes de chaque commande » |
| Détails › Vols | la compagnie sous le numéro du vol |
| Détails › Stocks et retours | la commande qui attend le plus longtemps |
| Programme | la colonne « Compagnie » ; la carte « Couleurs des compagnies » |
| Services et équipes | ce qu'une équipe prépare (la rangée d'une compagnie, « Dans l'ordre ») ; ce qui reste à faire dans un service ; les compagnies d'un service par compagnie ; le tableau de tous les temps par vol (la compagnie, ses classes) |
| Chemins | les commandes qui suivent un chemin ; qui passe par une étape |

**Les douze couleurs.** La couleur d'une compagnie est un réglage de
l'utilisateur, jamais une valeur du code : le module ne connaît qu'un rang,
de 1 à 12, et la feuille porte les teintes, une par thème (`--pa-1` à
`--pa-12`, `--pa-texte`). Le rang vaut donc dans les deux thèmes.

| Rang | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Clair (texte `#FFFFFF`) | `#39778B` | `#B54A65` | `#846A36` | `#654AB5` | `#337D3F` | `#AE4794` | `#4A65B5` | `#A35B43` | `#327979` | `#9A4AB5` | `#647630` | `#327B63` |
| Sombre (texte `#161113`) | `#5CAEC9` | `#DA90A3` | `#C59E51` | `#AB9ADD` | `#40BF55` | `#D88AC5` | `#90A3DA` | `#D59681` | `#40BFBF` | `#C890DA` | `#9FBF40` | `#40BF95` |

Le texte de la pastille tient 4,5:1 sur chacune (de 5,0 à 6,6:1 en clair, de
7,4 à 8,9:1 en sombre) : `tests/contraste.test.cjs`.

**Sans choix, la couleur est automatique** : les compagnies de l'unité —
celles du programme chargé et celles des réglages —, rangées par ordre
alphabétique, prennent les douze couleurs dans l'ordre, puis recommencent.
Rien n'est écrit. Le choix, la carte « Couleurs des compagnies » et la
sauvegarde : `docs/CAHIER_DES_CHARGES.md`, « La couleur des compagnies ».

`tests/pastilles.test.cjs` et `tests/pastilles-browser.cjs` le vérifient :
le texte de chaque page du menu est celui d'avant, une compagnie a la même
pastille sur toutes les pages, dans les deux thèmes.

### Les dessins (évolution 25 e)

Le plan, « En direct », les graphes, les courbes et le planning prennent
leurs couleurs dans les jetons : aucune feuille de vue n'écrit une teinte.
Ils ont donc suivi les jetons redéfinis, sans qu'un dessin soit retouché.

| Dessin | Ce qu'il lit |
|---|---|
| Le plan rejoué (« En direct », à plat) | un service au travail : `--ds-travail` (correction 24 c ; avant, l'accent) ; qui attend : `--ds-attente` ; qui a fini : `--ds-texte-4` ; pas commencé : la carte, en tirets ; son contour : `--ds-trait-plan` ; un lien : `--ds-trait-lien` |
| La vue en trois dimensions | ses teintes `--dv-…` (`direct.css`), toutes des jetons ou des mélanges de jetons : le sol et les murs depuis `--ds-texte-1` et `--ds-surface-1`, le travail `--ds-travail` (correction 24 c ; avant, l'accent), l'attente `--ds-attente`, ce qui coince `--ds-retard`, les repas `--ds-d1`, l'équipement `--ds-d5`. Sa scène, sa caméra, ses gestes, son panneau et sa barre du temps ne changent pas |
| Le planning, la charge | la courbe « au travail » et la barre d'un lot : `--ds-travail` (correction 24 c ; avant, `--ds-d1` pour la courbe et l'accent pour le lot) ; « présents » : `--ds-texte-3` ; un lot en retard : `--ds-retard` |
| Le schéma d'un chemin | une étape : la carte ; un lien : `--ds-trait-lien` ; une chaîne : `--ds-chaine` ; le ton d'une étape : `--ds-ok`, `--ds-attente` |
| Les courbes (Synthèse, Période, stocks) | « au travail » : `--ds-travail` ; la période : `--ds-d1` ; un stock : `--ds-d6` ; une alerte : `--ds-retard` |
| Une classe, partout | `--cab-*` : Équipage d1, Économie d2, Premium d3, Business d4, repas spéciaux d6 |

**Plus aucun bleu nuit ni bleu océan** : sur chaque page du menu, aucune
couleur calculée d'un élément visible n'est l'un des anciens bleus
(`#0B1A2E`, `#0D2036`, `#0B6E99`, `#38BDF8`), dans les deux thèmes.

**Le contraste d'un dessin.** Un texte posé dans un dessin tient 4,5:1 sur le
fond réellement dessous ; une forme (une courbe, un trait, un lien, le point
d'une classe, un état) tient 3:1 sur chacune des trois surfaces
(`--ds-fond`, `--ds-surface-1`, `--ds-surface-2`).

**Les couleurs écrites en dur dans un script commun** ne sont pas touchées
(la version 2 les partage). Leur liste, et où elles se voient :

| Script | Couleurs | Où elles se voient |
|---|---|---|
| `plan-editor.js`, l. 7 (`COLORS`) | la couleur d'une zone selon son type, écrite dans le plan à sa création et modifiable par zone : service `#0b6fa4`, annexe `#0e8aa8`, pièce `#087f75`, chambre froide `#3178c6`, équipement `#9659b5`, circulation `#bd7621` | « En direct », à plat : le contour et la teinte des zones libres du plan (annexes, pièces) ; « Modifier le plan » : toutes les zones, et le choix de la couleur. Les services, eux, sont dessinés par le plan rejoué, aux jetons |
| `plan-editor.js`, l. 376 | la grille de l'éditeur : `#91a0ac` | « Modifier le plan », grille affichée |
| `plan-editor.js`, l. 394 | les points d'une forme en cours de tracé : `#d36e12` (le premier), `#087f75`, cernés de `#fff` | « Modifier le plan », pendant un tracé |
| `flow-center.js`, l. 4 (`TYPES`) | la couleur d'un lien selon ce qui circule : personnel et runner `#167b76`, matériel `#7552ac`, matières premières `#b16b10`, matières transformées `#ce532c`, OF et kanban `#2769ac`, à classer `#74818b` | « Liens entre services » (hors du menu) : le trait d'un lien d'un seul type sur son diagramme |

`tests/visuel-dessins-browser.cjs` le vérifie sur chaque page du menu, sur
un chemin ouvert et sur « En direct » en relief, dans les deux thèmes ;
`tests/contraste.test.cjs`, pour les formes.

### L'accueil et les pages hors application (évolution 25 f)

- **La page d'entrée** (`accueil.html`) charge `ds.css` puis `visuel.css` :
  elle a les jetons de l'application, dans les deux thèmes. Ses cartes
  suivent la coquille — 14 px, trait fin, l'ombre des cartes ; une
  application, qui se clique, s'élève au survol, un bloc non. Ses titres de
  bloc sont en minuscules, à 13 px, graisse 500, au troisième gris ; aucun
  texte sous 13 px. Le titre de l'onglet et les textes ne changent pas.
- **Le bandeau de l'accueil de l'application** prend le bordeaux du menu, uni
  comme lui : plus de lueur. En thème sombre, il est sur la surface du menu.
  Il garde son rayon de 16 px ; les tuiles et les boutons de l'accueil
  suivaient déjà la coquille.
- **Les pages de secours** (`secours.html`, `v2/secours.html`) restent
  autonomes : elles ne chargent aucune feuille du site, pour s'ouvrir même
  quand le site ne se charge plus. Elles gardent leur visuel.

`tests/accueil-browser.cjs` (la page d'entrée, aux deux thèmes) et
`tests/visuel-coquille-browser.cjs` (le bandeau) le vérifient.

### Ce qui reste propre à la version 2

La version 2 (`v2/`) est gelée : elle garde son visuel d'avant. Rien de ce
qui précède ne s'y applique.

- Elle ne charge ni `visuel.css`, ni `visuel.js`, ni `pastilles.js` ; ces
  fichiers n'ont pas de jumeau dans `v2/`.
- Les feuilles et les scripts communs aux deux versions (`ds.css`,
  `interface.css`, `unite.css`, `ateliers.css`, `temps.css`, `graphe.css`,
  `reglages.css`, `champs.js`, `ds.js`, `plan-editor.js`, `flow-center.js`…)
  n'ont pas été modifiés : ils restent identiques à leurs jumeaux
  (`tests/parite.test.cjs`). C'est pourquoi le visuel de la version 1 passe
  par une feuille posée par-dessus, jamais par une retouche de `ds.css`.
- Elle garde donc : le menu bleu nuit et son dégradé, le fond gris chaud,
  l'accent bleu océan, les cartes à 8 px, les titres en capitales espacées,
  les champs tous de la même allure, les noms de compagnie en texte, et les
  jetons de `ds.css` tels quels (`--ds-saisi-*`, `--ds-choix-*` et `--pa-*`
  n'y existent pas).
- Les pages de secours des deux versions sont autonomes et n'ont pas changé.
- Une sauvegarde passe de l'une à l'autre comme avant : la version 2 ignore
  l'entrée des couleurs des compagnies.

### Le contrôle (évolution 25 g)

`tests/captures-evolution-25-browser.cjs` produit les captures de contrôle,
sur l'unité fictive, aux deux tailles (1 366 × 768 et 1 920 × 1 080) et dans
les deux thèmes : chaque page du menu, « En direct » à plat, l'accueil, la
fiche d'un service avec des champs saisis et des champs vides, le tableau de
tous les temps par vol, un chemin ouvert, la carte « Couleurs des
compagnies », une notification, une question, la palette « Aller à… », la
page d'entrée. Chacune est vérifiée : sa taille, le thème, la fenêtre qui ne
défile pas, aucun texte sous 13 px. Les captures restent hors du dépôt
(`$ORY_CAPTURES`, ou un dossier temporaire).

---

## 11. Version 1 : les retouches de la correction 24

Un audit de l'outil — simple, compréhensible, beau — a porté trois constats :
on peut perdre son travail sans être prévenu ; le caramel est partout, l'œil
ne sait plus où est l'action ; un même état n'a pas la même couleur d'une
page à l'autre. Tout passe par les fichiers propres à la version 1 ; les
feuilles et les scripts communs avec la version 2 ne changent pas.

### Un état, une couleur : le jeton du travail (correction 24 c)

Depuis que l'accent est caramel, « au travail » était caramel dans « En
direct » et bleu dans le Planning ; dans « En direct », il touchait l'ocre de
« attend ».

| Jeton | Rôle | Clair | Sombre |
|---|---|---|---|
| `--ds-travail` | « au travail » : un service, une équipe, une personne, un lot en cours | `--ds-d1` (`#2464A6`) | `--ds-d1` (`#A7C5EB`) |
| `--ds-sur-travail` | le texte posé dessus, à 4,5:1 | `--ds-sur-donnee` (`#FFFFFF`, 6,1:1) | `--ds-sur-donnee` (`#161113`, 10,5:1) |

La règle :

- **« au travail » prend `--ds-travail` partout**, et ne prend plus jamais
  l'accent : les personnages de la vue en relief (`--dv-travail`), les zones
  de la vue à plat et la pastille de leur légende, la courbe du temps, la
  courbe de charge d'un service et sa clé, les pastilles du panneau « En ce
  moment », la courbe « au travail » du Planning et de la Synthèse, les
  barres des lots du Planning et le trait d'un lot. Avant de relire la
  journée, un service dont une équipe prépare une commande (« Équipe au
  travail ») le prend aussi.
- **« attend » reste à l'ocre** (`--ds-attente`), **« en retard » au rouge**
  (`--ds-retard`), **« a fini » au gris** (`--ds-texte-4`) — la pastille
  « a fini » du panneau « En ce moment », qui était verte, est grise comme
  la zone.
- **L'accent garde ce qui est action ou choix** : un bouton, l'élément
  choisi (l'onglet du Planning, le service choisi), le focus.
- Sur une zone colorée de la vue à plat, le nom du service tient 4,5:1 dans
  les deux thèmes.

Les pastilles du panneau « En ce moment » viennent de feuilles communes
(`histoire.css`, `demarrage.css`) : `visuel.css` les reprend. Rien d'autre
ne change dans la vue en relief : sa scène, sa caméra, ses gestes.

`tests/travail-couleur-browser.cjs` le vérifie dans les deux thèmes : le
jeton, chaque élément qui dit « au travail », la même couleur calculée dans
le Planning et dans « En direct », le contraste du nom sur chaque zone.

### Le caramel pour l'action seule (correction 24 d)

Mesuré sur 16 écrans : deux boutons pleins sur 9 d'entre eux ; tous les
liens, les noms d'équipe et les flèches « … → » en caramel. L'œil ne savait
plus où était l'action.

**Le lien.** Dans le texte, en fin de carte, un nom d'équipe ou de service
dans un tableau, « lien-fort », « lien-discret » :

| | Au repos | Au survol, au focus |
|---|---|---|
| Le texte | `--ds-lien` (= `--ds-texte-1`) | `--ds-accent-texte` |
| Le trait | souligné, 1 px, `--ds-bordure-forte` | la couleur du texte |

Un lien qui dit où l'on est (`aria-current`), un service choisi
(`aria-pressed`) gardent l'accent : c'est un choix. Un lien qui détruit
(« .danger ») et un service qui coince gardent leur couleur d'état. Le titre
de ce qui se déplie (`summary`) n'est pas une action : l'encre du texte, sans
soulignement, l'accent au survol ; l'aide dépliée ne se remplit plus de
l'accent.

**Le bouton plein.** Au plus un par écran : l'action principale de la page.
Les autres sont des boutons de carte (fond de carte, trait
`--ds-bordure-forte`). Une page peut n'en avoir aucun.

| Page | Le bouton plein |
|---|---|
| « En direct » | « Rejouer » |
| « Période » | « Simuler la période » (ou « Relancer »), une seule fois : dans la page, pas dans la barre « Journée de vols » |
| « Programme » | « Importer des vols » |
| « Retours » | « Utiliser la planche retour », tant qu'elle ne l'est pas |
| « Comparer » | « Retenir comme essai A » |
| La fiche d'un service | « + Ajouter une équipe » (« + Mettre ce service en place » s'il n'en a pas) |
| « Contrôles » | le premier bouton d'un point **bloquant** ; les points à corriger et les informations n'ont que des boutons de carte. C'est la seule page qui peut en montrer plusieurs |
| Le plan qu'on modifie | « Terminer » |
| « Synthèse », « Planning », « Détails », « Chemins », « Réglages », « Fichiers », la fiche d'une équipe | aucun |

Comment : `.btn-play` reste le bouton plein. Dans la zone de travail, tout
`.btn-play` qui n'est pas l'une de ces actions prend l'allure d'un bouton de
carte (`visuel.css`) — des scripts communs avec la version 2 en dessinent, on
ne les touche pas ; les scripts propres à la version 1 ne posent plus la
classe (« + Ajouter un service », « + Ajouter un chemin », leur « + Créer »,
« Simuler la période » dans la barre). Une question (`dialog`) garde son
bouton plein : c'est son propre écran.

`tests/caramel-action-browser.cjs` le vérifie dans les deux thèmes, sur
chaque page du menu, la fiche d'un service et celle d'une équipe.
