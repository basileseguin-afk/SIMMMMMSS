# Le design system de Production ORY

Ce document dit comment l'interface est construite depuis la refonte du
08/10 au 12/10 (`docs/REFONTE_UX.md`, étapes 0 à 11). Il sert à ajouter un
écran ou un composant sans casser l'ensemble : mêmes jetons, mêmes
composants, mêmes règles, en v1 comme en v2.

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
| Tailles de texte | `--ds-t-11` à `--ds-t-32` | 11, 12, 13, 14, 16, 20, 24, 32 px — huit, pas une de plus |
| Graisses | `--ds-g-normal`, `-moyen`, `-fort` | 400, 500, 600 |
| Espacements | `--ds-e-1` à `--ds-e-7` | 4, 8, 12, 16, 24, 32, 48 px |
| Rayons | `--ds-r-1` à `--ds-r-4` | 4 (touche, kbd), 6 (bouton, champ), 8 (carte), 12 (fenêtre) |
| Hauteurs | `--ds-h-compact`, `--ds-h-normal` | 28 et 32 px |
| Durées | `--ds-t-rapide`, `-panneau`, `-vue` | 120, 180, 240 ms, courbe `--ds-courbe` |
| Ombres | `--ds-ombre-1`, `--ds-ombre-flottant` | presque rien ; seul ce qui flotte porte une ombre |
| Focus | `--ds-focus` | un anneau de 3 px à l'accent |

### Couleurs

| Jeton | Clair | Sombre | Pour quoi |
|---|---|---|---|
| `--ds-fond` | `#F7F8FA` | `#0B0D10` | le fond de la page |
| `--ds-surface-1` / `-2` / `-3` | `#FFF` / `#F2F4F7` / `#FFF` | `#111418` / `#171B21` / `#1D222A` | carte ; zone en retrait ; ce qui flotte |
| `--ds-bordure` / `-forte` | `#E6E8EC` / `#D5D9E0` | 8 % / 14 % de blanc | les traits fins ; les champs et boutons |
| `--ds-texte-1` à `-4` | `#111827` … `#9AA1AC` | `#E8EAED` … `#5F6670` | titre et valeur ; texte ; secondaire ; indice (jamais pour une phrase) |
| `--ds-accent` (+ `-fort`, `-texte`, `-doux`, `-trait`, `-pale`) | `#0F766E` | `#2CC2B0` | **l'action et la sélection** |
| `--ds-ok`, `--ds-attente`, `--ds-retard`, `--ds-info` (+ `-texte`, `-doux`) | vert, ambre, rouge, bleu | plus clairs | **les états** |
| `--ds-d1` à `--ds-d6`, `--ds-chaine` | bleu, violet, vert, ambre, corail, azur ; magenta | plus clairs | **les données** |
| `--ds-sur-accent`, `--ds-sur-retard`, `--ds-sur-attente`, `--ds-sur-donnee` | blanc | presque noir | le texte posé sur ces couleurs pleines |
| `--ds-trait-plan`, `--ds-trait-lien` | gris bleuté | les mêmes | le contour d'un service sur le plan ; un lien entre services |

`tests/contraste.test.cjs` vérifie le contraste AA (4,5:1) de chaque texte
sur chaque surface où il se pose, dans les deux thèmes : un jeton retouché
sans être vérifié fait échouer la batterie.

Les anciennes variables des vues (`--bg`, `--txt`, `--accent`, `--cab-BC`…)
pointent sur ces jetons (section 2 de `ds.css`) : on ne les emploie plus
dans du code neuf.

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
  cabine (`--cab-*`), les séries d'un graphique, les barres du planning
  (l'équipe en `d1`, le robot en `d2`, la chaîne en `--ds-chaine`), les
  jauges du budget (vacations en `d1`, heures sup en `d4`). Un texte posé
  dessus prend `--ds-sur-donnee`.
- Une carte indicateur reste **neutre** : le ton est dans sa pastille et
  dans son chiffre, jamais en aplat sur toute la carte.

---

## 4. Les thèmes

Clair par défaut ; sombre au choix (« Thème sombre », au pied de la barre
latérale). Le thème est un attribut, `data-theme="sombre"` sur `<html>`,
posé avant le premier affichage. Il est retenu sous `ory-ui-theme` : une
préférence d'affichage, jamais une donnée. En sombre, l'élévation se lit à
la luminance des surfaces, pas aux ombres.

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

- En-têtes sobres : 12 px, `--ds-texte-3`, pas de capitales.
- Les nombres à droite, en chiffres tabulaires.
- Un grand tableau garde ses titres et sa première colonne à l'écran
  (`position: sticky`).
- `table[data-clavier]` : Entrée enregistre et descend dans la même
  colonne ; Maj+Entrée remonte (`champs.js`).

### Cartes et indicateurs

- Une carte : `--ds-surface-1`, une bordure fine, un rayon de 8 px, pas
  d'ombre.
- La **carte indicateur** (`.bilan-cle`, la synthèse ; les tuiles du
  budget la suivent) : un libellé et sa pastille de ton, le chiffre en
  24 px tabulaire, ce sur quoi il compte (« 0 sur 7 · 0 % »). Elle mène à
  sa page.
- Un groupe de lignes (`.bilan-groupe`) : un titre de 11 px en capitales,
  puis des lignes sobres, chacune avec son lien.

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

- **La barre latérale** : les parties dans l'ordre du travail ; celle qui
  est ouverte déplie ses pages ; au pied, les problèmes, la sauvegarde, le
  thème, l'autre version.
- **La barre du haut** : le fil d'Ariane ; « Calcul à jour » (le point bat
  quand le calcul vient de suivre un changement) ; « Aller à… » ; un seul
  Annuler / Rétablir pour ce que la page modifie.
- **Le titre de la page** : une phrase qui dit ce qu'on voit, et les outils
  de la page.

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
   retouche faite d'un seul côté.
6. Aucune clé de stockage nouvelle pour une donnée. Une préférence
   d'affichage prend `ory-ui-…`.
7. Un test navigateur pour le nouvel écran. `focus-browser`,
   `donnees-intactes-browser`, `contraste.test` et `latence-browser`
   restent verts.
8. `node outils/empreinte.cjs` avant de livrer.
9. **Jamais le plan de l'unité dans une capture** : il est confidentiel. Le
   dessin est masqué dans toute capture, et les tests n'en écrivent aucune.
