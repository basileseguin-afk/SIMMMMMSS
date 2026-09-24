# Journal des modifications

Ce fichier retrace **chaque commit** : ce qui a changé et sur quels fichiers.
Le plus récent est en haut.

---

## 2026-09-24 — Une journée complète jouée : 8 défauts corrigés

Une journée cohérente (34 commandes, cuisine à J-1, plonge, dotation,
montage) jouée de bout en bout, écran par écran (voir `BUGS.md`, BUG-030 à
BUG-037).

- **Moteur** : une commande qu'une équipe n'a jamais préparée (bloquée
  derrière un lot sans matériel) n'est plus « prête à l'heure » ; l'anomalie
  nomme l'équipe et ce qu'elle attend. Une plonge fermée avant les derniers
  retours est signalée comme telle, plus comme un bouchon. « Dernière commande
  prête » ne compte plus la plonge. Plus de « 03:60 ». Plus d'alerte de barème
  pour la plonge et le magasin.
- **Stocks et retours** : l'onglet défile et prend toute la largeur (les
  graphiques de la plonge étaient coupés) ; « J-1 14:00 → J 19:00 ».
- **Frise d'une commande** : repères horaires espacés, jour écrit au
  changement seulement ; la plonge « sert tout le monde ».
- Tests : `tests/journee-simulee.test.cjs`, `tests/temps-browser.cjs`.

## 2026-09-24 — Contrôle complet : 13 bugs corrigés

Revue complète (voir `BUGS.md`, revue du 24/09 : BUG-017 à BUG-029).

- **Bloquant** : au-delà de 50 chemins (donc 48 commandes avec un chemin
  chacune) ou de 500 cases, tout l'état était refusé. Plafonds portés à 2 000
  chemins et 5 000 cases ; vérifié à 200 commandes (1 321 cases).
- Retirer un service du chemin d'une commande la retire aussi de sa case dans
  ce service (la case s'en va si elle ne préparait qu'elle).
- Un chemin lu dans Excel garde sa marque `cases` : une case retirée exprès ne
  revient plus au rechargement.
- Deux cases, ou deux chemins, ne peuvent plus porter le même nom (c'est la clé
  dans Excel) ; un chemin créé reçoit un numéro si son nom est pris.
- La comparaison A/B tient compte des chemins, du matériel, des commandes et
  du programme de vols : deux essais qui en diffèrent ne sont plus « identiques ».
- La fenêtre de la case commence sous la barre des onglets : Annuler, Excel,
  Importer et le bandeau restent cliquables ; Échap dans un champ ne la ferme
  plus ; sa position se mesure quand la vue est visible.
- Petits défauts : l'état d'un service débordait à 1024 px ; « depuis 0 min » ;
  une barre de retours débordait du graphique ; le rattrapage des cases ne
  touche plus une commande retirée du programme.
- Libellés : « Cases importées », « Remplacer les cases et les chemins ».

- **Performance** (BUG-029) : seul l'onglet affiché se redessine ; les autres
  le sont à leur ouverture. À 200 commandes, une saisie passe de 0,9 à 0,27 s.

---

## 2026-09-24 — Le temps entre les ateliers : stocks et bouchons

**Stocks** (`moteur/production.js` : `stocksEntreAteliers`)
- Quand un atelier finit une commande et que le suivant ne la prend que plus
  tard, elle est **en stock** : chaque séjour est compté (d'où, vers où, de
  quand à quand, combien de repas), y compris entre la dernière étape et le
  **chargement de l'avion**. Par lien : le plus de repas à la fois, le séjour le
  plus long, la moyenne. Devant chaque service : le niveau dans le temps, une
  commande comptant une fois même livrée par deux services.

**Bouchon à la plonge** (`bilanPlonge`)
- Le **sale pas encore lavé** est suivi dans le temps : il monte à chaque
  retour et baisse au rythme des tunnels. L'**attente** de chaque unité, de son
  retour à sa sortie du tunnel (premier revenu, premier lavé) : la plus longue
  et la moyenne. Les **heures où il revient plus que les tunnels ne lavent**
  sont nommées ; au-delà d'une heure d'attente, un point à regarder le signale.
- Corrigé : une plonge dont le poste n'a pas de fin (pauses décochées) faisait
  échouer le calcul (délai infini en attendant un retour).

**Où on le voit**
- **Le chemin** : en bleu sur chaque lien, le temps que la commande y passe en
  stock ; dans la fenêtre de la case, ce qui l'attendait, son travail, et ce
  qu'elle attend ensuite (`parcours.js`, `graphe.js`).
- **La frise** d'une commande : un trait « en stock » avant chaque étape, et la
  phrase dit le plus long séjour et l'attente avant le chargement.
- **La journée › Stocks et retours** (nouvel onglet, `temps.js`, `temps.css`) :
  le tableau des stocks par lien avec leur niveau au fil de la journée ; pour
  la plonge, cinq chiffres, les retours heure par heure face au débit (les
  heures en dépassement marquées « ▲ »), et le sale pas encore lavé ; survol
  sur chaque barre et curseur sur la courbe. Couleurs vérifiées au validateur
  (le bleu des vols, l'alerte toujours accompagnée de son étiquette).
- **Le plan rejoué** : une pastille au-dessus d'un service (« 32 repas en
  stock », « 540 u à laver ») et « En ce moment » qui les liste (`sim.js`).

**Tests** : `temps.test` (séjour entre cuisine et prépa, avant le chargement,
pas de stock quand l'aval attend, une commande comptée une fois, bouchon et
file qui se résorbe, pas de bouchon quand le tunnel suit) ; `temps-browser`
(chemin, case, frise, onglet, survol, plan) ; `histoire-browser` (nouvel onglet).

**Docs** : MODELE_ATELIERS (§ 3 bis et la file de la plonge), README,
CAHIER_DES_CHARGES (V8).

---

## 2026-09-24 — La case s'ouvre dans une fenêtre à droite

Retour de test : cliquer « Cuisine » dans le chemin d'AF ne semblait rien
ouvrir. La case s'ouvrait bien, mais sous le diagramme, hors de l'écran.

- La case d'un service s'ouvre maintenant dans une **fenêtre à droite**, en vue
  sans défiler (`parcours.js` : `blocPanneau`, `fermer`, `placeTiroir` ;
  `graphe.css`). × ou Échap la referment ; « Relier à… » aussi, pour qu'on voie
  le service visé (`graphe.js` : `relierDebut`).
- La page se range à gauche de la fenêtre : rien ne passe dessous
  (« Dupliquer pour… », « Réorganiser » restent à portée). La liste des
  commandes s'efface le temps du réglage, et le service choisi reste dans le cadre.
- La fenêtre garde sa position de défilement quand on modifie un champ.
- Ajouter un service au chemin n'ouvre pas la fenêtre : on tire d'abord son lien.

**Tests** : `graphe-browser` (la fenêtre est à l'écran, Échap et × la ferment,
la liste revient).

---

## 2026-09-24 — Une case pour chaque service du chemin, d'office

Retour de test : un chemin créé pour AF · Équipage n'avait aucune case ; rien
n'apparaissait dans « Les cases », et rien ne se réglait.

- **Créer un chemin crée ses cases** (`parcours.js` : `donnerCases`) : chaque
  service reçoit la sienne (« Cuisine AF CREW », 2 personnes, 06:00), sauf là où
  elle est reprise d'un autre chemin (« mêmes cases »). La plonge reçoit une
  seule case « Plonge », de type lavage, qui sert tout le monde. Même chose pour
  « Dupliquer pour… » et pour un service ajouté au chemin.
- **Les chemins déjà dessinés** reçoivent leurs cases manquantes une fois, à
  l'ouverture (`completerCases`, marque `cases` sur le chemin), et l'alerte le
  dit. Une case retirée exprès ensuite ne revient pas.
- **Supprimer le chemin** d'une commande emporte les cases qui ne préparaient
  qu'elle ; les cases partagées restent.

**Tests** : `parcours.test` (création des cases, plonge unique, reprise, rattrapage
unique) ; `graphe-browser` (la case est dans « Les cases » et y mène au chemin) ;
`excel-browser` (supprimer le chemin emporte ses cases propres).

---

## 2026-09-24 — Un chemin par commande, une case par service

« Les chemins » et « Les équipes » partageaient un affichage, pas un
fonctionnement. Refonte selon le modèle demandé : **chaque commande a son
chemin, et chaque nœud du chemin porte sa case.**

**Le modèle**
- Un chemin par commande (`parcoursClasse`), créé à la main ; les chemins de
  classe deviennent des **modèles**, pour les commandes qui n'ont pas encore le
  leur (`parcours.js` : `creerChemin`, `cheminDe`, `caseDe`, `modeles`).
- Une **case** = une équipe (atelier) dans un service ; elle se partage entre
  chemins, et prépare ses commandes dans l'ordre de ses lignes.
- **Man-minutes propres à une case** (`minutes` sur l'atelier) : le calcul les
  prend à la place de l'import, pour cette case seule (`moteur/production.js` :
  `travailDans`). Feuille Excel « Man-minutes » (`echanges.js`).
- Vérifié et testé : dans une case « TX BC puis TX PC », le chemin de TX BC ne
  compte que les man-minutes de TX BC, et son montage démarre à la fin de la
  ligne TX BC, sans attendre TX PC.

**« Les chemins »** (`parcours.js`, `graphe.css`) — devient l'onglet d'entrée
- À gauche, les commandes par compagnie, leur chemin ou leur modèle, un repère
  (✓ à l'heure, ! en retard), une recherche ; les modèles en bas.
- Créer le chemin d'une commande : vide, d'un modèle, ou du chemin d'une autre
  commande **dans les mêmes cases** (à la suite). « Dupliquer pour… » plusieurs
  commandes d'un coup. La disposition du diagramme est copiée.
- Chaque nœud porte sa case (« TX BC · 3 p. · 06:00 ») ; cliquer un service ouvre
  dessous le choix de la case (existante, nouvelle, aucune) et sa **fiche
  complète**, avec les man-minutes de chaque commande (import en grisé, valeur
  propre en gras) et la ligne de la commande regardée en évidence.
- Les liens ne valent que pour le chemin affiché.

**Les autres onglets se calculent**
- « Qui prépare quoi » : plus de menu ni de « remplir » ; chaque cellule dit sa
  case et ses heures, ou « à faire », et **ouvre le chemin** de la commande sur
  ce service.
- « Les équipes » devient **« Les cases »** : chaque case avec ses commandes
  dans l'ordre, qui mènent à leur chemin ; « + Case hors chemin » pour une
  plonge ou une mise à disposition.
- Le badge de l'onglet « Les chemins » compte les commandes sans chemin.
- Retiré : le diagramme en double dans « Les équipes » et le service partagé
  entre onglets de la version précédente (`graphe.js` n'a plus de mode
  « choisir seulement »).

**Tests** : moteur (une case partagée, surcharge des man-minutes), création et
duplication de chemins, Excel « Man-minutes » ; `graphe-browser` réécrit sur le
parcours complet (créer, case, man-minutes, dupliquer, liens propres, tableau
et cases qui mènent au chemin) ; `excel-browser` et `histoire-browser` adaptés
au tableau calculé.

**Docs** : README, MODELE_ATELIERS, FORMATS_EXCEL, CAHIER_DES_CHARGES (E15).

---

## 2026-09-24 — « Les chemins » et « Les équipes » reliés

Les deux onglets se parlaient mal : on dessinait un chemin d'un côté, on
réglait des équipes filtrées par un menu de l'autre, sans voir le lien.

- **Le même diagramme** ouvre maintenant « Les équipes » (`parcours.js`,
  `graphe.js`), en mode *choisir seulement* : pas de `+`, pas de lien à
  retirer, pas de nœud à déplacer. Cliquer un service n'affiche que ses
  équipes ; un clic dans le vide ou « Toutes les équipes » les remontre toutes.
- **Un service choisi partagé** : c'est le filtre de la liste des équipes, et
  le nœud choisi du diagramme dans les deux onglets. Ouvrir la fiche d'une
  équipe (depuis le tableau ou le chemin) choisit son service au lieu de
  vider le filtre. Le menu « Service » reste pour les services hors chemin.
- **Une barre qui situe** le service (`ateliers.js`) : « Cuisine · 1 équipe ·
  reçoit de Légumerie · livre Prépa », avec « Toutes les équipes » et
  « Modifier ses liens → ».
- **« + Nouvelle équipe · Cuisine »** : dans un service du chemin, l'équipe
  prend d'emblée les commandes du chemin qui n'y avaient personne, comme
  « + Nouvelle équipe ici » dans « Les chemins » (même code, `creerEquipe`).
- **« Régler ses équipes → »** dans le panneau d'un service du chemin mène à
  « Les équipes » sur ce service, en haut de l'onglet, le nœud dans le cadre.
- Sans service choisi, les équipes sont **rangées dans le sens du chemin**,
  puis « Hors du chemin affiché » ; le nom d'un service choisit ce service.
- Le bloc « Matériel en boucle » passe sous la liste des équipes.

**Tests** : `graphe-browser` suit le va-et-vient complet (service choisi
partagé, mode choisir seulement, création dans le service, ordre du chemin).

**Docs** : README, MODELE_ATELIERS, CAHIER_DES_CHARGES (E14).

---

## 2026-09-24 — Deux liens au départ d'un service, et le service Prépa

**Relier un service à plusieurs services** (`graphe.js`, `parcours.js`)
- Le modèle acceptait déjà « appros → légumerie » et « appros → montage » ; c'est
  le geste qui échouait. Un **clic** sur le `+` d'un service, puis un clic sur le
  service qui reçoit, crée maintenant le lien (avant, le clic sur le `+` ne
  faisait rien et le second clic ouvrait seulement le panneau). Un second clic
  sur le même `+`, Échap ou un clic dans le vide annule.
- Le trait tiré ne compte qu'au-delà de 6 px, et le cadre du diagramme **défile
  tout seul** quand on s'approche de son bord : le montage, souvent hors champ,
  se rejoint sans lâcher la souris.
- La consigne et le résultat (« … livre maintenant Montage », « livre déjà »)
  s'affichent **au-dessus du diagramme**, plus seulement en haut de page, hors
  de vue.
- Le lien choisi est dessiné par-dessus les autres ; la bulle du `+` et la
  phrase d'aide disent les deux gestes.

**Nouveau service Prépa, avant le montage**
- Service `preparation` (« PRÉPA ») : zone sur le plan, à confirmer
  (`sim.js`), pictogramme saladier (`icones.js` ; le montage garde son plateau),
  barème d'exemple provisoire (`moteur/production.js`).
- Les chemins types passent par CUISINE → PRÉPA → MONTAGE (`parcours.js`).
- Les chemins enregistrés sont réécrits **une fois** (`insererPrepa`, marque
  `prepa: true`), et l'alerte le dit ; un chemin dont on retire ensuite la prépa
  la garde retirée. Import Excel : les chemins créés sont marqués de même
  (`echanges.js`).
- Un plan enregistré sans la zone PRÉPA est **complété** au lieu d'être refusé
  (`plan-editor.js`).

**Tests** : icône et fixture Excel mis à jour ; plan complété au lieu de refusé ;
insertion unique de la prépa, deux liens au départ des appros
(`parcours.test`) ; clic `+` puis clic Montage, annulation, prépa dans le chemin
(`graphe-browser`).

**Docs** : README, MODELE_ATELIERS, FORMATS_EXCEL, CAHIER_DES_CHARGES (E13).

---

## 2026-09-23 — Corrections de l'audit visuel

L'audit (lisibilité, compréhension, épuration) a relevé des points de
priorité 1, 2 et 3. Tous sont traités ; la version téléphone et le thème
sombre, abandonnés entre-temps, sortent du périmètre.

**Priorité 1 — comprendre**
- On arrive sur l'**étape à faire ensuite**, plus sur une journée vide (`sim.js`).
- **« Commande »** remplace « repas » quand il s'agit d'une compagnie × classe :
  « 4 commandes en retard », « 30 commandes sans équipe », onglet « Les
  commandes », colonne « Commande » ; chaque ligne du tableau dit ses passagers.
- **Des chiffres qui concordent** : les indicateurs de « Les chiffres » disent
  leur heure (« À 07:00, heure rejouée »), le bilan « Sur toute la journée » ;
  les compteurs des vols disent « vols » ; le badge du tableau compte ses cases
  « à choisir », comme sa jauge ; « Leur journée » ne duplique plus les
  indicateurs, une phrase les résume avec les mêmes mots et renvoie à l'étape 4.
- **Plus de ×** sur les pastilles de classe (il se lisait « supprimer »).
- **Plus de mur rouge** sur un site neuf : ce qui n'est pas encore rempli est
  gris (plan, vols, commandes, nœuds du chemin, liens de l'unité) ; un état
  « provisoire » (~) remplace le « ! » orange des exemples ; le rouge est
  réservé aux vrais retards.

**Priorité 1 — épurer**
- Sans équipe, le tableau « Qui prépare quoi » laisse place à un encart qui dit
  par où commencer (12 commandes visibles au lieu de 311) ; en-têtes de colonne
  réduits à une information ; cibles d'au moins 32 px (71 trop petites → 0).

**Priorité 2**
- La version servie rejoint « Sauvegarde et limites » ; le statut permanent
  des liens disparaît.
- Champs à leur taille (rythme, décalage, présence, délai) ; bouton « Choisir
  un fichier… » au lieu du contrôle du navigateur ; plus de traits vides.
- Actions destructives en liens discrets (Retirer, Supprimer ce chemin,
  Remettre les chiffres d'exemple, Effacer les essais).
- « Comparer deux essais » vide : un seul bouton, « Retenir comme essai A ».
- Bilan resserré ; lignes de « Minutes par vol » compactes.
- Libellés en minuscules (les capitales restent aux petites pastilles) ; plus
  aucun « (s) » ; chaque « Exporter » dit ce qu'il exporte.
- Plan : « Cadrer » et « Tout voir » en toutes lettres ; « Liens dessinés »
  dans la barre d'outils.
- Diagramme de l'unité : liens « à classer » pâles, et un bandeau pour les classer.

**Priorité 3** : titres qui redisaient l'onglet retirés ; noms de services
affichés en minuscules lisibles (« Réception / Appros », « CF départ food »)
sans toucher aux noms enregistrés (`OrlyIcones.nomLisible`).

**Tests** : `demarrage.test` (état provisoire, commandes), `comparaison.test`,
`icones.test` (noms lisibles), `histoire-browser` (arrivée sur l'étape à faire,
aucune alerte sur un site neuf, tableau vide guidé), `import-browser` (pastille
sans croix) ; les autres parcours suivent les nouveaux mots et partent de « La
journée » quand ils travaillent sur le plan. 194 tests purs, 16 parcours navigateur.

---

## 2026-09-23 — Bureau seulement, thème clair seulement

Décision de Basile : le thème sombre et la version téléphone ne sont pas utiles.

- **Thème sombre retiré** : le bouton de l'en-tête, la fonction de bascule
  (`sim.js`), et toutes les règles `[data-theme="dark"]` des feuilles de style
  (`index.html`, `histoire.css`, `graphe.css`, `interface.css`, `usability.css`).
- **Version téléphone retirée** : tous les blocs `@media` de 900 px et moins
  (`aide.css`, `ateliers.css`, `editor.css`, `flow-center.css`, `histoire.css`,
  `interface.css`, `reglages.css`, `usability.css`, `index.html`). Les
  ajustements pour petits portables (1 000 à 1 250 px) restent.
- La page vise les écrans de bureau : `viewport` à 1 280 px, largeur minimale
  de 1 024 px (au-dessous, elle défile de côté). À 1 024 px, les outils d'une
  vue passent proprement sous ses onglets.
- Corrigé au passage : une ligne orpheline de `reglages.css` faisait ignorer la
  règle suivante, l'encadré d'avertissement des temps de travail.
- **Tests** : les vérifications « téléphone » et « sombre » deviennent « rien ne
  déborde à 1 024 px » ; `browser-smoke` vérifie qu'il n'y a plus de bascule de
  thème. 193 tests purs, 16 parcours navigateur.
- **Docs** : `README.md`, `docs/ETAT_DES_LIEUX.md`, `docs/CAHIER_DES_CHARGES.md`
  (C7 abandonné, §11, décision).

---

## 2026-09-23 — Les chemins et les liens se dessinent en diagramme de nœuds

Proposition de Basile : créer les chemins, les liens et les équipes en reliant
des nœuds, comme au tableau. C'est aussi la forme exacte du calcul.

**Le modèle**
- Un parcours est un graphe : `{ id, nom, noeuds: [service], liens: [{ de, vers }] }`
  (`parcours.js`, `moteur/production.js`). Les parcours en branches enregistrés
  avant sont convertis à la lecture ; le moteur lit encore les deux écritures.
- Les colonnes du tableau « Qui prépare quoi » se déduisent du graphe : un
  groupe par service de départ (« Depuis PLONGE »), puis la jonction.
- Classeur Excel, feuille « Parcours » : une ligne par lien (`Parcours`, `De`,
  `Vers`) ; l'ancienne écriture (`Branche`, `Étapes`) est encore lue.

**Le diagramme** (`graphe.js`, `graphe.css`, nouveaux)
- Tirer le `+` d'un service jusqu'à un autre crée le lien ; « Relier à… » fait
  de même au doigt ou au clavier (Entrée). Un lien choisi se retire par sa croix
  ou la touche Suppr.
- Un lien en double ou qui fermerait une boucle est refusé, avec la raison.
- Disposition automatique en colonnes dans le sens du flux : un service se
  place au milieu de ses amonts, un long lien réserve un couloir et ne passe
  plus sous un autre service, les liens de retour n'étirent rien.
- Les services se déplacent à la souris (Alt + flèches au clavier) ; la
  disposition est retenue (`ory-graphes-v1`, dans la sauvegarde complète) ;
  « Réorganiser » l'oublie.

**Où on le trouve**
- Qui prépare quoi › *Les chemins* : une pastille par chemin, le diagramme, et
  un panneau pour le service ou le lien choisi. Chaque nœud dit ses équipes
  (vert : tout est couvert ; ambre : des repas sans équipe). « + Nouvelle équipe
  ici » crée l'équipe et lui confie les repas du chemin qui n'avaient personne.
- L'unité › *Les liens* : les services et leurs liens dans le même diagramme ;
  un trait tiré crée un lien du type choisi ; choisir un trait ouvre son détail,
  la liste complète est repliée dessous.
- Le « plan de métro » et l'édition par branches sont retirés, avec leur CSS.

**Tests** : `tests/graphe.test.cjs`, `tests/graphe-browser.cjs` (nouveaux) ;
`parcours.test.cjs` (graphe, conversion, boucle), `echanges.test.cjs` (liens et
ancienne écriture), `excel-browser` (le chemin se modifie dans le diagramme).
193 tests purs, 16 parcours navigateur.
**Docs** : `README.md`, `docs/MODELE_ATELIERS.md`, `docs/FORMATS_EXCEL.md`,
`docs/ETAT_DES_LIEUX.md`, `docs/CAHIER_DES_CHARGES.md` (E11, décision).

---

## 2026-09-23 — Des pages épurées : une chose à la fois

Les pages en montraient trop à la fois ; l'œil ne savait plus où se poser.
Chaque étape se découpe maintenant en quelques onglets, sous son titre : un
seul est affiché, les autres attendent derrière leur nom.

**Les onglets** (`onglets.js`, nouveau)
- Les vols : *Les départs* · *Le programme*.
- Qui prépare quoi : *Qui prépare quoi* · *Les chemins* · *Les équipes* ·
  *Leur journée* · *Les repas*.
- Les temps de travail : *Minutes par vol* · *Rythme et pauses*.
- La journée : *Le plan* · *Les chiffres* · *Comparer deux essais*.
- L'unité : *Les liens* · *Ce que le calcul en retient* · *Sauvegarde et limites*.
- Un nombre sur un onglet dit qu'il y a à faire derrière (cases à choisir,
  repas sans équipe, liens à corriger). Le dernier onglet ouvert de chaque étape
  est retenu. Flèches, Début et Fin au clavier. Sur téléphone, la barre défile
  et garde l'onglet ouvert en vue.
- Le découpage ne déplace rien : les éléments portent `data-sous`, une règle
  générée masque ceux des autres onglets.

**Ce qui a quitté l'écran**
- Le bandeau de contexte : l'origine des vols est dite dans *Le programme*, et
  « Chiffres d'exemple » devient un bouton de l'en-tête qui mène aux limites du
  calcul.
- Les quatre indicateurs de la journée et son bilan : dans *Les chiffres*. Le
  plan reste seul avec « En ce moment ».
- « Comparer deux essais » quitte les temps de travail pour la journée ; la
  sauvegarde et les limites du calcul rejoignent L'unité.
- Les outils d'une étape (annuler, rétablir, Excel, importer) montent à droite
  des onglets au lieu de prendre une ligne.
- Les titres de section qui redisaient l'onglet ne gardent que leur phrase ;
  la numérotation « 1. … 4. » disparaît, les messages parlent d'onglets.
- Les points à regarder sont repliés : leur nombre suffit à savoir qu'il y a à
  faire.
- Ouvrir la fiche d'une équipe depuis le tableau mène à l'onglet *Les équipes* ;
  créée depuis le tableau, on reste sur le tableau.

**Fichiers** : `onglets.js` (nouveau), `index.html`, `sim.js`, `ateliers.js`,
`parcours.js`, `reglages.js`, `flow-center.js`, `histoire.css`.
**Tests** : `tests/onglets.test.cjs` (nouveau) ; `histoire-browser` vérifie les
onglets (un à la fois, clavier, onglet retenu, fiche d'équipe, limites) ;
`usability-browser` le contraste des onglets ; les autres parcours passent par
l'onglet voulu. 183 tests purs, 15 parcours navigateur.
**Docs** : `README.md`, `docs/ETAT_DES_LIEUX.md`, `docs/MODELE_ATELIERS.md`,
`docs/CAHIER_DES_CHARGES.md` (E10, registre des décisions).

---

## 2026-09-23 — Cahier des charges consolidé et écarts

- `docs/CAHIER_DES_CHARGES.md` (nouveau) : toutes les demandes depuis le 17/09
  (cahier des charges initial, feuille de route d'Astra, échanges), chacune
  avec sa source, son état vérifié dans le code et l'écart restant ; les
  décisions d'abandon ; les écarts classés par priorité ; les questions à
  trancher.
- `README.md` : lien vers ce document.
- Réponses de Basile consignées : moteur unique en JavaScript (décision déléguée,
  motivée au §14), objectif de plusieurs journées enchaînées, validation au fil
  de l'eau, animations reportées ; priorités révisées ; question du « vivier »
  reformulée avec un exemple ; registre des décisions.

---

## 2026-09-23 — Un site qui se lit en images

Le site était juste mais trop textuel et monochrome. Repris en designer : le
sens passe d'abord par la couleur, le pictogramme et le graphique.

**Des couleurs qui ont un sens** (palettes vérifiées contre le daltonisme, en
clair et en sombre)
- Une par étape : vols bleu, équipes vert d'eau, temps violet, journée
  framboise. La barre d'étapes devient des tuiles colorées avec pictogramme.
- Une par classe de cabine : Business or, Premium violet, Économie turquoise,
  Équipage bleu, Repas spéciaux orange — toujours avec son nom.
- Vert, ambre, rouge réservés aux états (à l'heure, attend, en retard).

**Des pictogrammes** (`icones.js`, nouveau) : un par étape, un par service
(cuisine, plonge, montage, dotation, magasin…), un par état. Le plan porte un
médaillon par service, qui prend la couleur de son état pendant la lecture.

**Des visuels à la place des phrases**
- « Comment ça marche » : une frise de quatre grands pictogrammes reliés.
- La journée : jauge en anneau pour les repas à l'heure, pictogrammes colorés
  pour les retards, le travail et l'attente ; les services en pastilles d'état ;
  une journée vide = un seul encart avec un bouton vers l'étape 2.
- Les vols : trois compteurs qui filtrent, une frise où chaque avion est posé à
  son heure dans la couleur de son état, et un tableau des départs façon
  aéroport, chaque repas en pastille de sa classe.
- Qui prépare quoi : les chemins en plan de métro (une ligne de couleur par
  branche, une station par service) ; le tableau avec les pictogrammes des
  services, les pastilles de classe, et des cases vides discrètes (« + »).
- Les temps de travail : de petites barres par classe pour chaque service, sur
  une même échelle ; l'exemple devient une équation « 60 min ÷ 2 = 30 min ».

**Fichiers** : `icones.js` (nouveau), `histoire.css`, `index.html`,
`demarrage.js`, `sim.js`, `simulation.js`, `ateliers.js`, `parcours.js`,
`reglages.js` ; tests `icones.test.cjs` (nouveau), `histoire-browser`,
`import-browser` ; docs `README.md`, `ETAT_DES_LIEUX.md`.

---

## 2026-09-23 — Un site qu'on comprend sans être du métier

Le visuel est repris de A à Z pour qu'une personne qui n'est pas dans
l'informatique comprenne ce qu'elle regarde.

**Une histoire en quatre étapes, qui est la navigation**
- Les onglets (Simulation, Ateliers, Flux, Réglages, Vols) et le bandeau « Par
  où commencer », qui disaient deux fois la même chose, laissent la place à une
  seule barre : **1. Les vols → 2. Qui prépare quoi → 3. Les temps de travail →
  4. La journée**, et à part **L'unité** (plan et liens entre services). Chaque
  étape dit son état en clair (✓ fait, ! à vérifier, · à faire), un détail
  (« 12 départs · exemple », « 4 repas en retard ») et « à faire ensuite ».
- **« Comment ça marche »** raconte l'histoire en quatre images (des avions
  partent, chaque vol emporte ses repas, des équipes les préparent, le site
  calcule la journée). Ouvert à la première visite, il se rouvre depuis
  l'en-tête.
- Chaque vue a un titre et **une phrase** qui dit ce qu'on y voit.
- L'en-tête ne garde que le nom, « Comment ça marche ? », le thème et
  l'export : l'horloge et les boutons de lecture vivent dans « La journée ».

**Les mots de tous les jours**
- atelier → équipe ; compagnie × classe → repas (« AF · Business », les
  classes en toutes lettres) ; parcours → chemin ; barème, homme-minutes →
  minutes de travail par vol ; rendement → rythme de travail ; échéance →
  « prêts avant » ; flux, liaisons → qui livre qui, liens ; amont → service
  d'avant ; scénarios → essais que l'on photographie (A / B).
- La formule `durée = homme-minutes ÷ personnes ÷ rendement` devient un
  exemple : « 60 minutes de travail pour un vol, à 2 personnes, prennent 30
  minutes ».
- La légende du plan : aucune équipe / équipe sans travail / équipe au
  travail, puis au travail / attend le service d'avant / a fini / pas commencé.
- Les indicateurs : prêts à l'heure, en retard, services au travail,
  services qui attendent — avec une phrase sous chaque chiffre.

**Chaque chose à sa place**
- L'import des vols, le délai de chargement et le décalage des vols passent à
  l'étape 1, « Les vols ». Le tableau des vols y montre le **bilan de la
  journée**, sans dépendre de l'heure rejouée ailleurs.
- « Des repas sans équipe » remplace « Non fabriqué » pour un vol dont une
  partie seulement n'a pas d'équipe.

**Fichiers** : `index.html`, `demarrage.js` (étapes, « Comment ça marche »,
titres), `histoire.css` (nouveau), `sim.js`, `simulation.js`, `ateliers.js`,
`parcours.js`, `reglages.js`, `reglages.css`, `flow-center.js`,
`comparaison.js`, `moteur/production.js` (`libelleClasse`, `enClair`),
`interface.css`, `usability.css`, `demarrage.css`, `editor.css`,
`flow-center.css` ; tests `demarrage` (réécrit), `comparaison`,
`histoire-browser` (nouveau) et les parcours navigateur existants ; docs
`README.md`, `ETAT_DES_LIEUX.md`, `MODELE_ATELIERS.md`, `FORMATS_EXCEL.md`.

---

## 2026-09-23 — « Qui fabrique quoi » : parcours et équipes dans un tableau

Les cartes de parcours pleines de cases rouges, de « Confier » et de
« + Équipe ici… » étaient justes mais illisibles. L'onglet Ateliers se lit
désormais en quatre temps numérotés.

**1. Les parcours** — un schéma neutre par parcours (branches, jonction), côte à
côte, avec les classes qui le suivent. Plus d'équipes ni de rouge ici : seulement
par où l'on passe. « Modifier » ouvre les branches comme avant.

**2. Qui fabrique quoi** — un tableau :
- une ligne par compagnie × classe (départ, parcours modifiable sur place),
  une colonne par service rangée par branche puis la jonction ;
- chaque case dit l'équipe et ses heures : remplie (vert), « à choisir »
  (pointillés), grisée si le parcours ne passe pas par là ;
- un clic sur une case : choisir l'équipe, en créer une, vider la case, et
  cocher « et les N autres cases à choisir » pour toute la colonne ; un clic sur
  un service remplit sa colonne ; « Remplir automatiquement » fait tout ce qui
  n'a qu'une équipe possible ;
- la dernière colonne dit quand la ligne est prête ; un clic la déplie dans le
  temps : une barre par étape, l'attente, l'heure de chargement, et une phrase
  (« prête à 06:45 pour un chargement avant 05:55 : 50 min de retard ; le
  montage a attendu 25 min la dotation ») ;
- jauge des cases remplies, recherche, « lignes à compléter », clavier.

**3. Les équipes** et **4. La journée** : inchangés, renommés.

**Doublons retirés** : les phrases « … est sur le parcours de N classe(s) sans
qu'aucun atelier ne l'y travaille » deviennent une seule ligne qui renvoie au
tableau ; les colonnes « Parcours » et « Services traversés » du tableau des
compagnies × classes, que le nouveau tableau porte.

**Fichiers** : `parcours.js` (`colonnes`, `tableau`, `affecter`, `chronogramme`
par étape, éditeur réécrit), `ateliers.js`, `ateliers.css`, `index.html`
(empreintes) ; tests `parcours` (176 tests purs), `excel-browser`,
`ateliers-browser` ; docs `MODELE_ATELIERS.md`, `ETAT_DES_LIEUX.md`, `README.md`.

---

## 2026-09-23 — Parcours et équipes fusionnés ; barème par compagnie × classe

**Le barème, service par service, par classe ou par compagnie × classe**
- Chaque service du barème a deux saisies : « Par classe » (une valeur commune
  par classe, quelques valeurs propres) ou « Par compagnie × classe » : une
  grille, une ligne par compagnie qui passe par ce service selon son parcours,
  une colonne par classe. Une case vide prend la valeur « Autres compagnies » ;
  sans elle, la case est encadrée de rouge et le résumé du service compte ce
  qui reste « à renseigner ». Un `·` marque un couple hors de ce service.
- Un classeur importé qui porte des valeurs propres bascule le service en grille.
- Le moteur signale une compagnie × classe fabriquée sans aucune minute au
  barème (anomalie `bareme-classe`, non bloquante) : elle travaillerait en temps
  nul sans rien dire.

**Parcours et équipes : une seule vue**
- La section « Parcours et équipes » de l'onglet Ateliers vient juste après les
  anomalies. Chaque étape d'un parcours y montre ses équipes et leurs heures
  pour les classes du parcours (un clic ouvre la fiche), sa couverture
  (« 7 / 9 classes ») et ce qui manque.
- Ce qui manque se complète sur place : « Confier » à l'unique équipe de
  l'étape, un menu s'il y en a plusieurs, « + Équipe ici… » s'il n'y en a
  aucune (équipe qui fabrique, plonge ou mise à disposition ; sa fiche s'ouvre).
  « Confier les classes sans équipe » fait tout ce qui n'a qu'une équipe possible.
- Un chronogramme par parcours suit une compagnie × classe au choix : une ligne
  par branche, l'attente des amonts, la jonction alignée, l'échéance.

**Fichiers** : `reglages.js`, `reglages.css`, `moteur/production.js`,
`parcours.js` (`etapesOrdonnees`, `couverture`, `confier`, `nouvelleEquipe`,
`completer`, `chronogramme`), `ateliers.js`, `ateliers.css`, `sim.js`,
`index.html` (empreintes) ; tests `production`, `parcours` (173 tests purs),
`reglages-browser`, `excel-browser` ; docs `MODELE_ATELIERS.md`,
`FORMATS_EXCEL.md`, `ETAT_DES_LIEUX.md`, `README.md`.

---

## 2026-09-23 — Grand ménage

Tout ce qui n'était plus relié à rien est retiré : environ 710 lignes en moins,
sans changer ce que fait le site.

**Dans la page**
- L'ancien panneau d'édition des zones (coordonnées X/Y, « Tracer une forme »,
  « Copier le JSON », « Tout réinitialiser »…) : l'éditeur du plan le
  remplaçait au démarrage, ses boutons n'étaient branchés sur rien.
- Les encarts « ROBOT » et « TUNNELS » dessinés dans les zones, vides depuis
  l'ancien moteur ; la couche des stockages, construite puis masquée aussitôt.
- Le sous-titre « 3 tunnels de lavage » de la plonge, chiffre figé d'un autre
  temps : les tunnels se décrivent dans les ateliers.
- La plonge dans le barème de démonstration : elle travaille au débit de ses
  tunnels, pas en homme-minutes. Le classeur du barème ne propose plus de
  lignes pour un service dont les équipes ne lisent pas le barème (plonge, mise
  à disposition, robot).

**Dans le code**
- `sim.js` : le tracé de zones à la main (rectangle, polygone, poignées,
  déplacement, redimensionnement), jamais déclenché depuis l'éditeur du plan ;
  l'écriture de l'ancienne clé `orly-zones` (sa relecture reste, pour migrer
  un très ancien tracé) ; les arêtes de flux codées en dur, redessinées aussitôt
  par le Centre des flux ; la navigation entre panneaux de l'ancienne colonne ;
  des propriétés de zones que plus rien ne lisait (`staff`, `sink`, `buffer`…).
- La sauvegarde complète ne cherche plus `ory-postes-v2`, que plus rien n'écrit.
- Styles : une soixantaine de règles et trente variables de couleur sans cible
  (jauges, graphique, stockages, poignées, anciennes grilles d'équipements).
- Exports de modules que personne n'importait.

**Dans les textes**
- L'accueil décrivait « charge par atelier, goulots, trame de 50 cm » et
  affirmait que le plan était public : il décrit le site actuel, et rappelle que
  le plan et les classeurs restent en local.
- L'éditeur du plan parlait d'« atelier simulé » et de « ressource » : il dit
  « service du plan ». Le Centre des flux ne prétend plus que son graphe donne
  le parcours des classes.
- `docs/PROCEDE.md`, guide d'un module supprimé, est retiré.

- Vérification : 166 tests purs et quatorze parcours navigateur au vert.

## 2026-09-23 — Excel, parcours par classe, et fin du compte au passager

Six demandes, livrées ensemble parce qu'elles se tiennent : on ne peut pas
échanger un barème avec Excel sans avoir d'abord fixé son unité, ni proposer
une ligne par compagnie × classe et par service sans savoir par où chacune passe.

**Plus de « par passager ».** Le barème comptait des minutes par passager ;
cela ne décrivait rien de réel. Il compte désormais des **minutes par vol**, par
service et par compagnie × classe : une valeur **commune** par classe (`*/BC`),
et des valeurs **propres** à une compagnie (`AF/BC`) qui l'emportent. La journée
d'une classe vaut ses minutes par vol fois son nombre de vols ; le remplissage
n'y change rien. Le matériel suit la même règle : des unités par vol, par classe
présente à bord. Le nombre de passagers ne sert plus qu'au robot, qui compte
bien des plateaux. Un barème ou un matériel d'hier est **converti** à
l'ouverture (passagers types BC 25, PC 40, YC 190, CREW 7, SPML 10), et la page
le dit.

**Un parcours par compagnie × classe.** Toutes les classes ne passent pas par
les mêmes services. Un parcours est fait de **branches** qui partent en
parallèle et se rejoignent — l'agro par les appros, la légumerie et la cuisine ;
le matériel par la plonge et la dotation ; le produit compagnie par le magasin ;
tout se retrouve au montage. Deux parcours types sont créés d'office :
« Complet » (BC, PC, CREW, SPML) et « Sans cuisine » (YC, qui ne voit ni la
cuisine ni la légumerie). Ils se modifient étape par étape dans l'onglet
Ateliers ; une compagnie × classe peut suivre un autre parcours que sa classe.
Une étape sans équipe est **enjambée** et signalée ; un atelier qui fabrique une
classe hors de son parcours est signalé ; un parcours qui boucle est refusé. Le
graphe du Centre des flux ne décide plus que pour les classes sans parcours.

**Tout se pilote depuis Excel.** Trois classeurs, exportés en `.xlsx`, modifiés
dans le tableur, réimportés :

- **Ateliers** — équipes, fabrications (une ligne par lot : c'est là qu'on
  change ou qu'on ajoute des compagnies × classes), tunnels, classes, parcours
  (une branche s'écrit `PLONGE > DOTATION > MONTAGE`), matériel ;
- **Barème** — une ligne par compagnie × classe **et par service de son
  parcours** : exactement ce que l'étude de temps doit remplir ;
- **Vols** — feuilles « Départs » et « Retours ».

Un import refusé ne change rien et dit, en une fois, toutes les lignes à
corriger ; un import réussi s'annule. Les services s'écrivent par leur nom sur
le plan ou leur identifiant. Le format est décrit dans `docs/FORMATS_EXCEL.md`
et dans la feuille « Lisez-moi » de chaque classeur.

Pas de bibliothèque : `tableur.js` lit et écrit le `.xlsx` lui-même (archive via
`DecompressionStream`, natif). SheetJS n'est plus publié sur npm dans une version
sans faille connue, et le site doit marcher hors ligne. La lecture est testée sur
un classeur compressé produit par un autre logiciel.

Corrigé au passage : l'import des vols prenait une quantité ou une heure égale
à zéro (minuit) pour une case vide ; plusieurs messages nommaient un service par
son identifiant (« prepa ») au lieu de son nom (« MONTAGE »).

- Fichiers : `tableur.js`, `parcours.js`, `echanges.js` (nouveaux),
  `moteur/production.js`, `ateliers.js`, `reglages.js`, `ui-model.js`, `sim.js`,
  `flow-center.js`, `index.html`, `ateliers.css`, `reglages.css` ;
  `docs/FORMATS_EXCEL.md` (nouveau), `docs/MODELE_ATELIERS.md`, README, état
  des lieux.
- Tests : `parcours`, `tableur`, `echanges`, `excel-browser` (nouveaux) ;
  `production`, `reglages-browser`, `ateliers-browser`, `sauvegarde-browser`,
  `aide-browser`, `flows-browser` mis à jour.
- Vérification : 165 tests purs et quatorze parcours navigateur au vert.

## 2026-09-23 — Un seul moteur

L'ancien moteur de démonstration est retiré. Depuis que la vue Simulation relit
la journée des ateliers, il ne servait plus qu'à une comparaison A/B menée sur
**un autre modèle que celui qu'on décrit** — des curseurs d'effectif, de
contenance, de vivier ou de calendrier qui ne changeaient rien à ce qu'on
regardait.

- **Supprimés** : `moteur/orly.js`, `moteur/ressources.js`, `moteur/mesure.js`,
  `moteur/procede.js` et son exemple, leurs 59 tests, et tout ce qui les
  pilotait dans Réglages (effectifs, équipe du soir, robot, contenances,
  vivier, calendrier multijour, tunnels, stock de matériel). Ce qu'ils
  décrivaient se décrit maintenant atelier par atelier.
- **Conservés** : le noyau à événements discrets (`moteur/noyau.js`), sur
  lequel tourne le modèle par ateliers, et le panneau « Horaires de vols ».
- **Scénarios A/B refaits** sur le modèle par ateliers (`comparaison.js`,
  nouveau, testé). La journée étant déjà calculée, capturer **fige** réglages
  et résultats. Le tableau sépare les deux, fait ressortir ce qui diffère et
  écrit « mieux » ou « moins bien » sur chaque résultat qui bouge — le mot, pas
  seulement la couleur. Il vit dans sa propre section, « Comparer deux
  scénarios ».
- **Le décalage global des vols** agit enfin sur le calcul : il n'était lu que
  par l'ancien moteur.
- **Jeu de démonstration** sorti du moteur dans `vols-demo.js` : ce n'est
  qu'une donnée, au format de l'import.
- Nettoyés : les jauges d'occupation vides dans les zones, les jetons animés,
  le badge rouge du goulot, l'indicateur et le statut par vol de l'ancien
  moteur dans `ui-model.js`, les styles devenus orphelins. Le périmètre du
  calcul (« Non calibré · limites ») décrit désormais le modèle par ateliers.
- Documentation : README, état des lieux ; le guide du procédé et l'étude des
  moteurs portent une note « retiré, pour mémoire ».

- Vérification : 133 tests purs et treize parcours navigateur au vert.

## 2026-09-23 — La vue Simulation relit la journée des ateliers

Troisième des trois points d'ergonomie. La vue Simulation tournait encore sur
l'ancien moteur : effectifs par curseur, files, contenances. On décrivait
l'unité dans « Ateliers de travail » et on en regardait **une autre** sur le
plan. Deux vérités sur le même écran.

Le modèle par ateliers calcule la journée **d'un coup** : il n'y a donc plus
rien à « lancer », il y a une journée à **relire**.

- **Transport** : « ▶ Lire », « ⏭ Pas » (saute au prochain changement, pas à
  la minute suivante), « ↺ Début » et un **curseur de temps** qui va dans les
  deux sens. Sans atelier décrit, le bouton est grisé et le dit : « Rien à
  relire : décrivez des ateliers ».
- **Plus de verrou** : changer un atelier, un réglage ou le programme de vols
  recalcule la journée dans l'instant. « Recommencer » disparaît.
- **Le plan** : quatre états seulement — au travail, attend un amont (en
  pointillé, pour ne pas dépendre de la couleur), a fini, pas commencé. Au début
  de la journée il reprend l'état de paramétrage ; il n'existe plus de service
  « hors calcul ».
- **Les indicateurs** : « Échéances tenues » ne juge que les échéances **déjà
  passées** — à l'aube il affiche « — », plus un « 0 % » rouge qui accusait une
  journée n'ayant rien raté. Puis « Échéance dépassée », « Au travail »,
  « En attente ».
- **Panneau de droite** : le point d'attention nomme le poste qui attend
  depuis le plus longtemps et, pour un service choisi, ses équipes et ses lots
  avec leurs heures. « La journée calculée » résume le résultat final. Le
  graphique et les taux d'occupation de l'ancien moteur sont retirés.
- **Vols** : un départ est suivi classe par classe. Une classe que personne ne
  fabrique est dite « Non fabriqué — onglet Ateliers » au lieu d'un faux retard.
  Les filtres correspondent enfin à leurs libellés.
- **Export** : la journée calculée (départs, classes, journal des lots),
  et non plus l'état interne de l'ancien moteur.

Corrigé au passage :

- l'import d'un programme de vols ne recalculait plus la journée des ateliers
  (régression de cette refonte, attrapée par le test de fumée) ;
- au survol, les boutons de l'en-tête passaient en texte vert sur fond bleu
  foncé, illisible ;
- deux anciens bouts de code réactivaient « Lire » sur une journée vide.

Les curseurs de l'ancien moteur, dans Réglages, ne pilotent plus que la
comparaison A/B ; ils le disent. Leur suppression est l'étape suivante.

- Fichiers : `simulation.js` (nouveau), `replay.js`, `sim.js`, `index.html`,
  `demarrage.css`, `usability.css`, `reglages.js` ; tests `replay`,
  `browser-smoke`, `etat-plan-browser`, `import-browser`, `editor-browser`,
  `storage-browser`, `reglages-browser`.
- Vérification : 205 tests purs et treize parcours navigateur au vert.

## 2026-09-22 — Le barème, un service à la fois

Deuxième des trois points d'ergonomie. Onze services × cinq classes × deux
colonnes faisaient **cent dix champs numériques d'un bloc**. Personne ne lit
ça : on cherche sa ligne, on se trompe de colonne, on renonce.

- Le barème devient une **liste de services**. Replié, chacun tient en une
  ligne qui montre ses minutes par unité — `BC 1,4 · PC 0,7 · YC 0,28 ·
  CREW 1,4 · SPML 2,2` — et le fixe par vol s'il existe.
- Ouvert, il montre **dix champs et rien d'autre**. Le navigateur n'en garde
  **qu'un ouvert** à la fois (`name` sur le `<details>`), sinon on retrouve le mur.
- À l'arrivée : **zéro champ à l'écran** au lieu de cent dix.
- Un service **sans barème** porte un liseré orange et sa marque « non
  renseigné » sans qu'on ait à l'ouvrir : il travaillerait en temps nul.
- Un service qui **porte une équipe** est marqué « équipe » : ce sont ses
  lignes qui comptent d'abord.
- Les actions passent **au-dessus** de la liste : l'import est le vrai chemin
  d'entrée d'une étude, il ne doit pas être enterré sous le tableau.
- Le service ouvert **survit à un rendu** : sans cela, saisir une valeur
  refermait la fiche qu'on était en train de remplir.

Corrigé au passage : devenu élément flex à côté de son « ? », un titre de
section se réduisait à la largeur de son texte et son filet de séparation n'en
soulignait plus qu'un bout.

- Vérification : 193 tests purs et treize parcours navigateur au vert.

## 2026-09-22 — Un « ? » plutôt qu'un paragraphe

Deuxième passe d'ergonomie, sur le premier des trois points restés ouverts :
**tout était expliqué en permanence, au même niveau visuel que les champs.**
L'œil ne savait plus où était le geste à faire.

| Vue | Mots visibles avant | Après | Paragraphes de 20 mots et plus |
|---|---|---|---|
| Ateliers | 175 | **74** | 2 → **0** |
| Flux | 195 | **168** | 1 → **0** |
| Réglages | 574 | **161** | 16 → **0** |

La règle, tenue partout (`aide.css`) :

- **reste visible** ce qui guide le geste — une phrase, les unités, un libellé ;
- **passe derrière le « ? »** le pourquoi, les définitions, les mises en garde
  de fond. Rien n'est supprimé : tout est à un clic.

C'est un `<details>` natif — donc au clavier et à la recherche dans la page
sans une ligne de JavaScript. Le corps est une **bulle ancrée** : ouvrir une
aide ne déplace rien.

Trois défauts trouvés en le posant :

- `display:block` sur un enfant de `<details>` **écrase le masquage du
  navigateur** : l'aide serait restée ouverte en permanence, exactement ce
  qu'on voulait éviter.
- Dans le fil du texte, le corps **grossissait la ligne qui le portait** :
  ouvrir l'aide d'un titre écrasait ce titre sur la gauche.
- Un `<details>` **ne peut pas vivre dans un `<p>`** : le navigateur referme le
  paragraphe, et le « ? » tombe à la ligne. Les conteneurs concernés sont
  devenus des `<div>`, et les aides de titre sortent du `<h2>`/`<h3>`.

- `tests/aide-browser.cjs` tient la règle : aucun pavé imposé, l'aide s'ouvre
  sans rien déplacer, aucune aide imbriquée dans un titre ou un paragraphe,
  chaque « ? » porte un libellé, et rien ne déborde sur téléphone.
- Vérification : 193 tests purs et treize parcours navigateur au vert.

## 2026-09-22 — Par où commencer : un fil, et un seul en-tête

« Il faut retravailler tout le site pour qu'il soit bien plus user friendly. »
Première passe, sur ce qui manquait le plus : **on ne savait ni par quoi
commencer, ni où l'on en était.**

**Un fil de mise en route** (`demarrage.js`, `demarrage.css`), sous les onglets,
sur toutes les vues. Cinq étapes dans l'ordre où on les fait — vols, plan,
ateliers, flux, barème — chacune avec son état réel et son geste suivant, et
une phrase qui dit quoi faire maintenant. Il ne calcule rien de neuf : il relit
ce que les autres savent déjà. Trois états seulement, chacun avec un **signe**
en plus de sa couleur. Tout au vert, il se réduit à une ligne.

Les **ateliers passent avant les flux** : c'est l'atelier qui met un service sur
le chemin d'une classe, donc sans équipe le graphe ne porte aucun parcours et
rien ne peut en être jugé. Le fil le dit au lieu d'afficher un faux « fait ».

**Un seul en-tête.** L'horloge, « Lancer », la vitesse de lecture et les quatre
indicateurs ne décrivent que la vue Simulation — ils s'affichaient partout. Sur
« Ateliers » ou « Réglages », c'était un gros bouton vert invitant à lancer ce
qu'on ne regardait pas, et **trois bandeaux avant le contenu**. Ils restent dans
leur vue ; les réglages de l'ancien moteur portent désormais « Ouvrir la vue
Simulation » et « Recommencer » — ce dernier là où la page le nomme déjà.

**Les indicateurs attendent d'avoir quelque chose à dire.** Avant le lancement
ils valaient « — », « 0 », « 0 OF », « 0 plateaux/h » : une bande entière pour
ne rien dire, juste au-dessus du plan qu'on venait voir.

Corrigé au passage : sans `data-vue` sur `<body>` au premier chargement, les
commandes de la vue Simulation disparaissaient dès l'arrivée. Et
`zoom-browser` cliquait des coordonnées en dur, que toute bande ajoutée
au-dessus du plan cassait ; il cherche maintenant lui-même un point libre,
avec le sélecteur qu'emploie le gestionnaire.

- Tests : `tests/demarrage.test.cjs`, neuf tests purs sur `etapes(etat)`.
- Vérification : 193 tests purs et douze parcours navigateur au vert.

## 2026-09-22 — Le matériel ne se compte plus au seul passager

« Je ne comprends pas l'utilité d'“unités par passager”, notre unité par
passager n'est pas utile. » Le réglage était le bon endroit, mais la mauvaise
question : **un trolley part avec le vol**, pas avec le passager, et sa
quantité ne bouge pas parce que la cabine est à moitié vide.

- `moteur/production.js` : le matériel se compte comme le barème —
  **par passager ET par vol, classe par classe**. Une unique « unité par
  passager » devait faire les deux, et n'en faisait bien aucune.
- Qui n'a pas d'unité au passager met cette colonne à **zéro** : le compte se
  fait alors uniquement par vol, ce qui est le cas le plus courant.
- `unitesDe()` relit une saisie d'hier — un `parPax` scalaire — et rend
  exactement le même résultat. Le réglage brut est lu **avant** la fusion avec
  le défaut, sans quoi la table par défaut masquait la valeur héritée.
- `ateliers.js` : le champ unique devient une petite table à cinq lignes.
- Vérification : 184 tests purs et douze parcours navigateur au vert.

## 2026-09-22 — CREW et SPML, et les deux débits de la plonge

**Deux classes de plus.** `CABINES` devient `['BC','PC','YC','CREW','SPML']`.
Les deux dernières ne sont pas des cabines mais se fabriquent comme elles :
les plateaux de l'**équipage**, et les **repas spéciaux**. Les compter à part,
c'est pouvoir leur donner leur propre barème — un repas spécial ne coûte pas
le temps d'un plateau de masse, et le noyer dans l'économie sous-estimait la
cuisine.

- `ui-model.js` : colonnes **facultatives** `nb_CREW` et `nb_SPML`. Un export
  qui ne les porte pas reste lisible ; elles valent zéro et ne créent rien.
- Le barème passe à cinq colonnes, le modèle CSV et le jeu de démonstration
  les portent. Le jeu de démonstration compte donc 34 classes au lieu de 20.

**La plonge se décrit vraiment tunnel par tunnel.** « Pour plonge et tunnels
détaille plus, ça peut être pour chaque tunnel et pas au global. » Le défaut
n'était pas l'affichage : c'était que **le débit s'additionnait sans se
demander s'il y avait les gens**.

- Chaque tunnel porte désormais les **personnes qu'il faut pour le tenir**.
  Le débit de la plonge est la somme de ceux qui **tournent vraiment**.
- Les tunnels sont servis **dans l'ordre de la liste** — à vous de mettre en
  tête ceux qu'on allume d'abord. Ceux que l'effectif ne couvre pas sont
  **nommés et laissés à l'arrêt**, avec un liseré orange et une anomalie.
- Trois tunnels à 300 u/h tenus par deux personnes annonçaient 900 u/h. C'était
  le chiffre le plus faux du modèle, et rien ne le disait.
- « Mais un débit par tunnel de plonge **et pour l'ensemble des tunnels**. »
  La plonge porte donc aussi un **débit maximum de l'ensemble**, facultatif :
  ce qui est partagé entre les lignes — le côté sale, le séchage, le retour des
  paniers — les bride toutes. Sans lui, ajouter un quatrième tunnel augmentait
  le débit sans fin, ce qu'aucune plonge ne fait.
- **Deux limites, et c'est la plus basse qui compte.** La fiche affiche les
  trois nombres côte à côte — somme des lignes, plafond, **débit retenu** —
  pour qu'on voie d'un coup d'œil lequel décide, et le cadre passe à l'orange
  quand c'est le plafond.
- `tunnelsQuiTournent()` dans `moteur/production.js` porte les deux.
- Vérification : 179 tests purs et douze parcours navigateur au vert.

## 2026-09-22 — Le navigateur ne peut plus servir une version périmée

« Je ne vois rien sur le visuel. » Le déploiement était vert, le dépôt à jour,
et la page servie datait. GitHub Pages met ses fichiers en cache
quelques minutes, les navigateurs bien plus longtemps — et le pire n'est pas de
voir l'ancienne version, c'est d'en voir **un mélange** : un `index.html` neuf
avec un `sim.js` périmé, donc une page cassée. C'est arrivé deux fois.

- `outils/empreinte.cjs` : chaque script et chaque feuille de style porte
  `?v=<empreinte>`, huit caractères du hachage de **son contenu**. Le fichier
  change, l'URL change, le navigateur redemande ; le fichier ne change pas,
  l'URL ne change pas, le cache fait son travail.
- `tests/empreinte.test.cjs` **refuse** une page dont une empreinte a vieilli :
  l'oubli ne peut plus partir sur la branche.
- Le Centre des réglages affiche la **version servie**, pour répondre d'un coup
  d'œil à « mon navigateur a-t-il bien la dernière ? »
- Vérification : 167 tests purs et douze parcours navigateur au vert.

## 2026-09-22 — Le Centre des réglages règle enfin le bon moteur

Le Centre des réglages décrivait encore le seul moteur de démonstration :
effectifs par curseur, contenances, vivier, scénarios A/B. Depuis les ateliers
de travail, ce n'est plus là que se joue la production — et un réglage qui ne
règle rien est pire qu'un réglage absent.

**Une section « Le modèle de production », en tête** (`reglages.js`,
`reglages.css`, clé `ory-modele-v1`) :

- le **barème** — homme-minutes par service × cabine, en clair et modifiable
  case par case. Il n'était jusqu'ici qu'une constante du moteur.
- il **s'importe et s'exporte** (`schema: "ory-bareme"`) : c'est ainsi qu'une
  étude de man-minutes entrera en bloc. L'export donne le gabarit.
- un service que le barème ne connaît pas est marqué **« non renseigné »** —
  sans quoi il travaillait en temps nul sans rien dire. Une **annexe** hérite du
  barème de l'atelier dont elle dépend.
- l'avertissement « **valeurs de démonstration, non calibrées** » est là où on
  les modifie, pas seulement dans un coin de la page.
- le **rendement**, et les **règles de poste** : seuils de pause (ajoutables,
  retirables) et durée de présence.
- les **horaires de vols** remontent ici : le délai de chargement fixe
  l'échéance d'une compagnie × classe. Un seul champ pour les deux moteurs —
  deux champs pour une valeur finiraient par diverger.

**Le régime de poste devient celui de la maison.** `moteur/production.js` :
`normaliserRegime(regime, defaut)` et `simuler({regime})`. Un atelier ne retient
sa présence que s'il en a fixé une ; sinon il suit le réglage général, et
changer la règle commune les déplace tous. Dans la fiche d'un atelier, le champ
est vide avec le réglage général en filigrane ; le vider y revient.

**Le reste est nommé pour ce qu'il est.** « Ancien moteur de démonstration » :
ces réglages ne pilotent que la vue Simulation, restée sur le moteur précédent.
Le modèle par ateliers n'a ni file d'attente ni contenance.

- `sim.js` : le barème entre dans la **sauvegarde complète** — l'oublier
  ramènerait les valeurs de démonstration sans le dire.
- Corrigé au passage : un `input[type=number]` refuse la virgule, et le barème
  paraissait vide ; et un rendu déclenché par la sortie d'un champ arrachait le
  bouton qu'on était en train de cliquer — les blocs ne sont plus redessinés
  quand rien n'a bougé.
- Tests : `tests/reglages-browser.cjs`, onzième… **douzième** parcours.
- Vérification : 163 tests purs et douze parcours navigateur au vert.

## 2026-09-22 — La mise à disposition, et le Centre des flux qui décide

Trois points signalés à la relecture de l'onglet Ateliers.

**Une classe déclarée ne porte plus que son identité.** « Passagers, vols et
échéance, tu les auras à l'import du planning des vols. » Exact : les
redemander à la main ouvrait deux vérités pour la même classe.

- `ateliers.js` : le formulaire « + Compagnie × classe » ne demande plus que la
  **compagnie** et la **cabine**. Les trois champs de volume disparaissent.
- Une classe déclarée que l'import ne porte pas est marquée **« hors import »**
  et affiche « — » plutôt qu'un volume inventé.
- Une classe que le programme porte déjà garde **ses** chiffres : une
  déclaration ne les écrase plus.

**Un nouveau type d'atelier : la mise à disposition.** « Les zones qui mettent
uniquement à disposition du matériel ou des matières premières n'ont ni
man-minutes ni temps de production. »

- `moteur/production.js` : `type: 'dispo'`. Ni effectif, ni barème, ni durée,
  ni liste — elle sert **toutes** les compagnies × classes sans qu'on les
  énumère. **Permanente par défaut** ; décochée, elle prend une heure
  d'ouverture et son aval l'attend.
- Elle **ne fabrique rien** : une classe dont c'est la seule étape reste
  « jamais fabriquée ». Sans cela, ouvrir un magasin aurait suffi à afficher
  « 100 % à l'heure ».
- Elle figure au **parcours** de ce qu'elle sert, et sur le planning comme un
  repère — pas comme une barre de durée nulle.
- Deux ateliers dont l'un est une mise à disposition, dans le même service :
  signalé, car le second ne serait jamais attendu.

**Le Centre des flux refondu.** Depuis les ateliers de travail, ce graphe donne
le parcours : son bandeau disait pourtant encore « sans effet sur le calcul ».

- Le badge dit désormais ce qu'il en est, et une section
  **« Ce que le modèle en lit »** passe **avant** la liste : un tableau
  service par service — ce qu'il est, ce qu'il **attend**, à qui il **livre**.
- Elle nomme ce qui empêcherait la journée de se jouer : un service qui
  **fournit sans avoir d'équipe**, une équipe qui ne fabrique rien, un service
  relié à personne, une **boucle sans fin**. Une alerte par nature de problème,
  pas une par service.
- Les règles de circulation humaine descendent en bas, avec leur périmètre dit :
  de la description, le modèle ne déplace pas encore les personnes.
- Modifier une liaison **recalcule** désormais les ateliers.
- Tests : cinq tests moteur pour la mise à disposition, une section navigateur
  dans `ateliers-browser` et une dans `flows-browser`.
- Vérification : 163 tests purs et onze parcours navigateur au vert.

## 2026-09-22 — Confirmer la création d'un atelier, câbler une annexe

Deux points signalés à l'usage, [BUG-015](BUGS.md) et [BUG-016](BUGS.md).

**« On ne peut pas valider la création d'un atelier. »** La fiche s'enregistrait
déjà à chaque frappe, mais rien ne le disait : un formulaire sans bouton laisse
croire que rien n'est pris.

- `ateliers.js` : un bouton **« Terminé »** en tête des actions referme la fiche
  et confirme l'enregistrement dans la ligne d'état.
- Le message de création le dit aussi : « Atelier créé et **déjà enregistré**… »

**« Ma seconde zone Armement n'apparaît pas dans les flux. »** Le Centre des
flux ne retenait que les onze ateliers du moteur.

- `flow-center.js` : une **annexe est un emplacement comme un autre**. On peut
  lui adresser une liaison.
- `sim.js` : l'héritage des liaisons du parent devient un **défaut, pas une
  règle**. Une annexe sans liaison à son nom hérite de celles de son atelier ;
  dès qu'on lui en saisit une, la saisie l'emporte. C'est ainsi qu'on donne à
  « Armement 2 » un parcours qui lui soit propre.
- `sim.js` : `zoneParId()` trouve la géométrie d'une annexe pour tracer le flux
  sur le plan — sans quoi le tracé entier tombait. Un flux dont une extrémité
  a disparu est simplement ignoré.
- Tests : `ateliers-browser` § 3 bis et `annexe-browser` § 6.
- Vérification : 156 tests purs et onze parcours navigateur au vert.

## 2026-09-22 — Le mot « lot » disparaît, et l'arrêt programmé se distingue de la pause

Deux points de vocabulaire signalés en relecture : « je ne comprends pas le
truc des lots », et « pourquoi on rajoute les pauses alors que l'opérateur en
a une automatiquement ». Le modèle ne change pas ; ce qu'on en lit, si.

- `ateliers.js` : la section ne s'appelle plus « Lots, dans l'ordre de
  fabrication » mais **« Ce que cette équipe fabrique, dans l'ordre »**, et la
  règle tient en une ligne : *une ligne = une fabrication ; plusieurs sur la
  même ligne sortent ensemble, sur deux lignes l'une après l'autre.*
- L'en-tête d'une ligne est son **numéro** — `1.`, `2.` — et les classes sont
  **dans cet en-tête**, plus en dessous : on voit la fabrication d'un coup d'œil.
- Ajouter se fait **en un geste** : un menu « + Ajouter une fabrication… » crée
  la ligne déjà remplie, au lieu d'un bouton qui créait une ligne vide à
  compléter ensuite. Chaque ligne porte son « + fabriquer en même temps… ».
- Les pauses saisies à la main deviennent l'**« Arrêt programmé »**, replié par
  défaut, et disent ce qu'elles ne sont pas : la pause de l'équipe est déjà
  comptée par le régime de poste. Un arrêt programmé est une plage où **rien ne
  tourne** — machine à l'arrêt, local fermé, créneau de nettoyage — à une
  heure fixe, pas après un temps de travail.
- `ateliers.css` : styles des chips en en-tête, des deux menus d'ajout et du
  repli de l'arrêt programmé.
- Tests : quatre parcours navigateur suivent le nouveau geste d'ajout, et
  `ateliers-browser` ouvre le repli avant d'ajouter un arrêt.
- Vérification : 156 tests purs et onze parcours navigateur au vert.

## 2026-09-22 — Le débit d'une plonge est la somme de ses tunnels

- `moteur/production.js` : `debitLavage()` additionne les débits des tunnels
  **actifs** d'un atelier de lavage. Un atelier sans liste de tunnels retombe
  sur son débit global, pour les saisies antérieures.
- `ateliers.js` : la plonge se décrit tunnel par tunnel — nom, débit, en
  service ou non — et l'interface affiche la somme. Un tunnel deux fois plus
  rapide compte pour ce qu'il vaut, pas pour un.
- Un tunnel se met **à l'arrêt sans être supprimé** : c'est ainsi qu'on essaie
  une panne. Tous arrêtés, le modèle refuse plutôt que de laver à zéro.
- Vérification : 156 tests purs et onze parcours navigateur au vert.

## 2026-09-22 — Le poste avec ses pauses, et la boucle du matériel

Deux contraintes réelles entrent dans le modèle. La note complète est dans
[docs/MODELE_ATELIERS.md](docs/MODELE_ATELIERS.md).

**Le poste.** Une équipe prend **15 min après 3 h de travail**, **30 min après
6 h**, et reste **8 h 15 sur le site** — soit 7 h 30 de travail effectif. Les
seuils comptent le travail *cumulé*, pas l'heure qu'il est : une équipe qui
attend ses amonts ne consomme pas son crédit, donc ne prend pas sa pause.

- Un lot que le poste ne peut pas finir est **laissé inachevé et signalé** : sa
  classe ne sort pas, et les lots suivants ne sont pas commencés. C'est le
  résultat le plus utile — ce qui ne rentre pas dans la journée.
- Le régime se désactive atelier par atelier, la présence se règle.

**Le matériel en boucle.** Trolleys et porcelaine ne s'achètent pas : un départ
les emporte, un retour les ramène sales, la plonge les rend propres. Un compte
unique, en unités par passager.

- Nouveau type d'atelier **Lavage** : pas de lots, son travail vient des retours
  à mesure qu'ils arrivent, à son débit en unités par heure. Il suit le même
  régime de poste — ce qui arrive après sa fin de poste reste sale.
- Un atelier **« emporte du matériel propre »** attend, avant chaque lot, que le
  compte couvre ses classes. Service premier arrivé, premier servi.
- Le bilan dit ce que la boucle a fait : revenu, lavé, emporté, reste propre,
  **plus bas niveau** et attente. Retours = départs → le stock revient à zéro ;
  retours > départs → l'excédent reste disponible.
- Un lot qui n'obtient **jamais** son matériel figure au journal sans fin : sans
  cette trace, sa classe paraissait fabriquée par ses autres étapes.
- Corrigé au passage : les cases à cocher héritaient d'une largeur pleine qui
  rejetait leur libellé hors de l'écran ; et les réglages du matériel, qui ne
  vivent pas dans une carte d'atelier, étaient ignorés en silence à la saisie.
- Vérification : 153 tests purs et onze parcours navigateur au vert.

## 2026-09-22 — La liste des compagnies × classes se retouche

- `ateliers.js` : chaque ligne du tableau porte un bouton **Retirer**, et un
  bouton **+ Compagnie × classe** ajoute ce que le programme de vols ne porte
  pas (compagnie, cabine, passagers, nombre de vols, échéance).
- **Les liens suivent** : retirer une classe la retire de **chaque lot** de
  chaque atelier, et un lot vidé de sa dernière classe disparaît avec elle.
  Un lot resté vide parce qu'on vient de le créer, lui, est conservé. Le
  message nomme les ateliers touchés et les lots supprimés.
- Un retrait pris sur le programme se **rétablit** d'un clic : les classes
  retirées restent listées au-dessus du tableau.
- Un ajout portant l'identifiant d'une classe du programme la **remplace** :
  c'est la façon de corriger un volume sans toucher au fichier de vols.
- `moteur/production.js` : `simuler()` accepte une liste `classes` qui remplace
  celle déduite des vols. Un lot qui nomme une classe inconnue est refusé en la
  nommant.
- Corrigé au passage : le libellé pour lecteur d'écran de la dernière colonne,
  en position absolue sans bloc englobant, rallongeait le défilement horizontal
  de toute la page sur mobile.
- Vérification : 138 tests purs et onze parcours navigateur au vert.

## 2026-09-21 — Refonte : le modèle par ateliers de travail remplace la grille

La grille 50 × 50, les équipements et la bibliothèque sont **abandonnés**. Un
atelier n'occupe plus de place dans l'espace : c'est une équipe, décrite par ce
qu'elle fait, quand elle commence et à combien.

- **`moteur/production.js`** (nouveau) : compagnie × classe déduite des départs,
  ateliers à lots ordonnés, atelier robot à débit et effectif minimum, pauses,
  parcours lu du graphe du Centre des flux. Un service ne travaille un lot que
  lorsque **tous ses fournisseurs** ont livré ses classes.
- Un cycle dans les liaisons n'est refusé que s'il bloque **une classe réelle** :
  les retours (quais → plonge → dotation → quais) bouclent sans gêner personne.
- **`ateliers.js` / `ateliers.css`** (nouveaux) : l'onglet « Ateliers de travail »
  — saisie par service, planning en barres avec l'attente des amonts, et une
  table de couverture qui nomme les classes que personne ne fabrique.
- **Une annexe hérite des liaisons de son atelier** : un atelier posé dans
  « Armement 2 » attend et alimente les mêmes services qu'Armement.
- **Supprimés** : `workshop-grid.js`, `workshop-grid.css`, `postes/`, la reprise
  des effectifs depuis la grille, le pilotage des tunnels et des lignes robot
  par la grille, et les trois parcours de test correspondants.
- Le barème d'homme-minutes est une **table unique, non calibrée**, faite pour
  être remplacée en bloc par l'étude à venir.
- Vérification : 136 tests purs et onze parcours navigateur, dont
  `tests/production.test.cjs` (23) et `tests/ateliers-browser.cjs`.

**Reste à faire** : la vue Simulation tourne encore sur l'ancien moteur
(`moteur/orly.js`) et ses réglages. La brancher sur le nouveau modèle, puis
déposer l'ancien, est l'étape suivante.

## 2026-09-21 — BUG-014 : sortir la création de liaison du fil de la liste

- `flow-center.js` : le formulaire d'ajout portait la même carte et les mêmes
  quatre champs que les liaisons juste en dessous ; on lisait son bouton comme
  appartenant à la première d'entre elles.
- Un bouton **« + Nouvelle liaison »** rejoint la barre de filtres, hors de la
  liste. Le formulaire est fermé par défaut, s'ouvre à la demande et reste
  ouvert tant qu'on enchaîne ; « Fermer » le replie.
- Ouvert, il ne ressemble plus à une liaison : fond teinté, bordure d'accent,
  en-tête propre. La liste commence après un titre **Liaisons existantes**.
- `tests/flows-browser.cjs` vérifie l'état fermé, l'ouverture, la fermeture et
  la séparation d'avec la liste.

## 2026-09-21 — Panneau d'aménagement : moins de texte, moins d'étapes

Retour d'usage : « la bande à droite, je veux moins de texte et que ça soit
bien plus intuitif ». Avant d'atteindre le premier bouton utile, le panneau
empilait quatre blocs de texte gris.

- Le titre du panneau disparaît : le nom du service **est** le titre. L'onglet
  dit déjà « Création des ateliers ».
- La pastille « Grille 50 × 50 cm » était en double avec le bas du plan :
  supprimée du panneau.
- « Cadrer », « Toute l'unité », annuler et rétablir passent sur **une seule
  barre**, en haut, au lieu de quatre boutons pleine largeur éparpillés.
- L'avertissement de placement ne s'affiche **que s'il y a de quoi avertir**,
  en une ligne, et ne récite plus les compteurs à zéro.
- Ce qui est acquis disparaît : la phrase de modèle une fois qu'un atelier
  existe, l'astuce « un tracé = un équipement » une fois un équipement posé,
  le titre d'atelier au-dessus de la liste tant qu'il n'y en a qu'un.
- Trois étapes deviennent deux (« Équipements » absorbe « et personnes », où
  les personnes se saisissaient déjà). La phrase d'état sous « Fusionner »
  disait ce que le bouton dit : supprimée. Le total des personnes tient en une
  ligne, sans détail par atelier tant qu'il n'y en a qu'un.
- **Raccourci préservé** : une première version masquait les outils tant
  qu'aucun atelier n'existait. Cela supprimait le chemin le plus court —
  dessiner directement crée le premier atelier tout seul. Annulé.

## 2026-09-21 — BUG-013 : la couleur d'un atelier tient hors édition

- `plan-editor.js` : `sync()` transmet la couleur choisie à l'interface de
  simulation. Elle était enregistrée mais jamais relue : hors édition, les
  ateliers du moteur sont rendus par `sim.js`, qui ne la connaissait pas. Seuls
  les ateliers étaient touchés ; locaux et annexes gardaient bien la leur.
- Seule une couleur **voulue** est transmise : chaque zone reçoit d'office la
  teinte de son type, la recopier sans distinction aurait peint l'unité en bleu.
- Règle : la teinte choisie tient le **fond et le contour**, pour que la zone
  ait le même aspect qu'au moment où on l'a peinte. Deux exceptions alertent et
  gardent la main : un atelier simulé **sans personne** (contour rouge) et la
  zone sélectionnée. Pendant la simulation, les couleurs de charge reprennent
  le fond ; un service hors calcul garde la sienne.
- Bouton « Couleur du type » pour revenir en arrière, affiché seulement quand
  une couleur a été choisie.
- `tests/etat-plan-browser.cjs` couvre le cycle complet, rechargement compris.

## 2026-09-21 — Une seconde salle pour un atelier : « Armement 2 »

- `plan-editor.js` : nouveau type de zone **« Zone de production (annexe) »**,
  rattachée à un atelier du moteur. Le chemin le plus court : sélectionner
  l'atelier et cliquer **Dupliquer** — on obtient « ARMEMENT 2 », déjà
  rattaché, déjà numéroté. La validation refuse une annexe sans atelier de
  rattachement, ou rattachée à un atelier qui n'existe pas.
- Une annexe est **cliquable hors édition** et figure dans la liste des
  services, rangée sous son atelier. Elle s'aménage dans « Création des
  ateliers » comme n'importe quel service.
- `sim.js` : ce qui est tracé dans une annexe — équipements et personnes —
  **compte pour l'atelier dont elle dépend**. Le panneau de suivi le dit
  explicitement au lieu d'un chiffre muet.
- **Ce que cela ne fait pas**, et c'est écrit dans l'interface : une file
  d'attente séparée. Deux équipes se partageant les ordres demanderaient une
  règle de répartition, qui n'existe pas encore.
- Vérification : 121 tests purs et douze parcours navigateur, dont
  `tests/annexe-browser.cjs`, nouveau, qui refait le geste de bout en bout.

## 2026-09-21 — Zoom déplafonné, équipements visibles, tunnels et robot reliés

- **Zoom** (`sim.js`) : le cadrage du service servait de plafond en vue Ateliers,
  on ne pouvait pas s'approcher d'un carreau de 50 cm. Même borne partout
  (0,5× → 16×). Molette proportionnelle — un pavé tactile envoie beaucoup de
  petits événements, un cran fixe sautait ; pincement reconnu. Double-clic sur
  un atelier pour le cadrer, ailleurs pour revenir à l'ensemble. Bouton
  « cadrer le service », raccourcis <kbd>+</kbd> <kbd>−</kbd> <kbd>0</kbd> et
  flèches. Le centre de l'écran reste bridé à portée du plan.
- **Couleurs partagées** : la palette des équipements devient des jetons de
  thème (`--eq-table`, `--eq-tapis`, `--eq-robot`, `--eq-tunnel`…), clairs et
  sombres. Ce qu'on trace se revoit sur la vue Simulation, dans la même
  couleur : une couche en lecture seule sous les ateliers, transparente aux
  clics. Jusqu'ici on aménageait sans jamais revoir son travail.
- **Tunnels et lignes robot** : nouveau type d'équipement « Tunnel de lavage »
  (code TU). Les tunnels tracés dans la plonge et les lignes robot tracées au
  montage pilotent désormais `CFG.tunnels` et `CFG.robotLignes`, sous la même
  règle que les personnes : la grille pilote là où elle est renseignée.
- `moteur/orly.js` : `robotLignes` (défaut 1). Une place de ressource par ligne,
  la cadence devient une cadence **par ligne**. À zéro ligne il n'y a pas de
  robot : tout le YC part au dressage manuel. Curseur « Lignes robot » dans les
  Réglages, curseur des tunnels porté à 8.
- **Textes allégés** dans le panneau d'aménagement et le suivi : le modèle tient
  en une ligne, les deux dépliants du retard n'en font qu'un, les codes et les
  limites sont réduits à l'essentiel.
- `sim.js` publie `Sim.cfg` et `Sim.etat()` pour l'inspection et les parcours.
- Vérification : 120 tests purs et onze parcours navigateur au vert, dont
  `tests/zoom-browser.cjs` et `tests/grille-moteur-browser.cjs`, nouveaux.

## 2026-09-21 — Le plan dit ce qu'il reste à renseigner

- `sim.js` : état de paramétrage par atelier tant que la simulation n'a pas
  démarré. Trois états — **Personne** (atelier simulé sans effectif),
  **Au curseur** (effectif réglé, rien de tracé), **Aménagé** (effectif et au
  moins un équipement) — plus **Hors calcul** pour les services présents sur
  le plan mais sans charge calculée (magasin, duty free, quais, tampons).
- Deux langages de couleur qui ne se croisent jamais : progression avant le
  lancement, charge mesurée pendant la simulation. La légende du plan est
  réécrite au basculement plutôt que d'en afficher deux.
- Ligne d'état sous le plan : « N atelier(s) restent à aménager », qui décroît
  à mesure du traçage.
- `usability.css`, `interface.css`, `index.html` : couleurs d'état, légende
  pilotée par le code, bande d'indicateurs masquée hors Simulation et Vols
  (elle décrit une simulation en cours, pas un réglage), grille des onglets
  corrigée sur mobile — elle datait de quatre onglets, il y en a cinq.
- **BUG-012** : la colonne de droite étant masquée dans le Centre des réglages,
  l'onglet « Données » y était inatteignable et `tests/browser-smoke.cjs`
  échouait depuis la livraison précédente, annoncée à tort comme vérifiée.
  Le panneau Données rejoint l'onglet Réglages, sous « Données, sauvegarde et
  périmètre » ; la barre d'onglets de la colonne disparaît avec ses styles morts.
- `tests/etat-plan-browser.cjs` : nouveau parcours — les trois états, le hors
  calcul, la bascule de légende au lancement et la bande d'indicateurs.
- Vérification : 118 tests purs et **neuf** parcours navigateur au vert.

## 2026-09-20 — Codes par type d’équipement

- `workshop-grid.js` : remplacement du repère global AT affiché sur le plan
  par un code pour chaque équipement : T-001 (table), R-001 (robot), C-001
  (chaîne), D-001 (desserte), TR-001 (trolley). Numérotation indépendante
  par type, unique dans l’aménagement, visible sur le plan et dans la liste.
- Codes conservés au renommage, à la validation, au rechargement et à
  l’export/import. Les anciennes sauvegardes reçoivent automatiquement des
  codes ; les anciens identifiants AT restent acceptés mais ne sont plus affichés.
- Rendu fusionné et transparent des ateliers validés conservé, avec un repère
  par équipement. Noms complets réservés au panneau d’édition.
- Vérification : 98 tests unitaires et parcours navigateur ateliers réussis ;
  migration, préfixes, doublons, stabilité, historique et export couverts.

## 2026-09-20 — Valider les ateliers et afficher leur code sur le plan

- `workshop-grid.js` : bouton « Valider l’atelier », puis « Modifier l’atelier ».
  Les cases des équipements de cet atelier deviennent une surface commune,
  avec contour extérieur sans joints internes et remplissage à 22 % d’opacité.
  La grille reste visible ; trous et espaces entre îlots sont conservés.
- Code automatique unique dans l’aménagement (`AT-001`, etc.) affiché sur
  le plan ; nom complet conservé dans le panneau d’édition. Le code reste
  stable lors d’une reprise du dessin, d’un renommage ou d’un rechargement.
- Les cellules et équipements restent éditables sans perte. Toute modification
  de géométrie remet l’atelier en dessin ; une nouvelle validation unifie le rendu.
  Validation refusée si l’atelier est vide ou ses équipements hors service.
- Codes et état conservés dans la sauvegarde locale et les exports/imports v1 ;
  anciennes sauvegardes toujours acceptées. Annuler/rétablir reste disponible.
- Tests : 97 tests unitaires réussis et parcours ateliers enrichi (validation,
  reprise, historique, suppression, rechargement et export). Inspection du rendu
  translucide sans fond privé. Aucun changement du moteur de simulation.

## 2026-09-20 — Interface : contraste et hiérarchie des actions

- Revue heuristique documentée dans `docs/AUDIT_ERGONOMIE_2026-09-20.md` :
  constats, contrastes chiffrés, décisions et limites de la vérification.
- `usability.css` : en-tête sombre, surfaces distinctes, contrôles contrastés,
  navigation active pleine, palette ateliers, styles clair/sombre et mobile.
- `index.html`, `sim.js` : navigation raccourcie, titre propre à chaque vue,
  indicateurs plus concis et explications repliables accessibles au clavier.
- `workshop-grid.js`, `flow-center.js` : commandes hiérarchisées, consignes
  regroupées dans des aides ; limites du modèle toujours visibles.
- `postes/postes.css` : cohérence des contrôles de la bibliothèque embarquée.
- Vérification : 95 tests unitaires, six parcours navigateur existants et un
  parcours ciblé contraste / clavier / responsive. Sélecteur de sauvegarde
  du test ateliers précisé pour permettre plusieurs aides repliables.
- Aucun changement du moteur, des données sauvegardées ou du fond privé.

## 2026-09-20 — Création des ateliers : construction sur grille dans les services

- Onglet **Création des ateliers** dans la simulation, conservant la carte.
  Clic service : cadrage automatique et zoom plafonné à ce cadrage. Lecture
  suspendue pendant l’aménagement, vue dégagée des jauges et grands libellés.
- Plusieurs ateliers nommés par service. Tables, chaînes et lignes robot
  construites case par case au clic-glissé ; gomme, sélection/déplacement,
  rotation, renommage et suppression. Cases occupées et hors service refusées.
- Grille de 50 × 50 cm **théoriques**, explicitement schématique : aucune cote
  réelle n’est déduite du plan. Taille visuelle commune réglable avant placement.
- Bibliothèque `postes/` accessible dans l’application : modèles et assemblages
  réutilisés par copie. Le détail source est conservé ; seule l’emprise est
  dessinée. Meubles en cm et positions d’assemblage arrondis sur la grille.
- Sauvegarde locale, export/import validé, annulation/rétablissement par geste.
  Un service absent ou modifié ne supprime pas les données : alerte de placement.
- Correction de l’échange intégré en ouverture locale : origine opaque `file:`
  prise en charge et source de la fenêtre émettrice contrôlée.
- Moteur, scénarios A/B, Centre des flux et fichiers privés conservés, sans
  liaison automatique entre dessin des équipements et capacité simulée.
- Reprise sur `726e4f8` : boucle du matériel propre plonge/dotation et nouveau
  calcul du goulot conservés. Aucun fichier du moteur remplacé.
- Vérification : 95 tests unitaires et six parcours navigateur, dont le nouveau
  parcours ateliers (zoom plafonné, tracé, gomme, rotation, bibliothèque,
  services distincts, persistance, export, import invalide et affichage mobile).
- Fichiers : `workshop-grid.js/css`, `sim.js`, `index.html`, `postes/postes.js`,
  tests, guides, README et registre des bugs.

---

## 2026-09-19 — Centre des flux, repris sur le nouveau moteur

- Reprise sur un clone neuf après la purge, depuis `90fc4e0`. Conservés : moteur
  à événements discrets branché, scénarios A/B par rejeu, règles robot / manuel,
  contenances, relève d’équipe, explications par OF et export de résultats 0.4.
  Aucun ancien commit ni fichier confidentiel réintroduit.
- Nouvel onglet **Centre des flux** : liaisons orientées par listes déroulantes
  entre services et stockages, avec plusieurs origines et destinations.
- Quatre familles : humains (personnel / runners), matériels, matières
  (premières / transformées), informations (OF / kanban uniquement).
- Circulation interne libre par défaut, réglable par service ; sorties humaines
  réservées aux liaisons Runner explicites. Les anciennes flèches restent à classer.
- Ajout, modification, activation, suppression, retour, filtres par famille et
  service, annulation/rétablissement, sauvegarde locale, export/import validé.
- Noms et stockages synchronisés avec le plan. Stockage supprimé : ses liaisons
  sont conservées et signalées à réparer. Pas de réaffectation automatique.
- Réseau affiché sur le plan sans replacer les frigos. Les échanges internes
  restent dans la liste ; les liaisons entre services sont filtrables.
- Portée explicite : le centre configure les échanges, mais ne remplace pas les
  gammes de `moteur/orly.js` et ne change pas ses résultats. Le choix du moteur
  d’autorité JavaScript / Python reste ouvert, conformément à l’étude actualisée.
- README remis en cohérence avec le branchement du moteur et le retrait d’assets.
- Fichiers : `flow-center.js`, `flow-center.css`, `index.html`, `sim.js`, README,
  guide `docs/CENTRE_DES_FLUX.md`, registre des bugs et deux nouveaux tests.
- Vérification : 86 tests unitaires et cinq parcours navigateur réussis
  (flux, import/A-B, simulateur, éditeur et stockages), sur la version intégrée.

---

## 2026-09-21 — Ateliers compréhensibles, Centre des réglages pleine largeur

Retour d'usage après une vraie séance de tracé. Les cinq constats sont traités.

### Le défaut qui faisait croire à « une table par atelier »

Il était réel. **Deux tracés séparés ne donnaient qu'un seul équipement** : le
second prolongeait le premier, parce que le dernier élément restait sélectionné.
Reproduit en une ligne, corrigé en une ligne :

> **Chaque tracé crée un équipement.** Pour agrandir un équipement existant, une
> case à cocher explicite, « Agrandir l'équipement sélectionné ».

### Rendre la structure visible

| Avant | Maintenant |
|---|---|
| Menu déroulant « Atelier dans ce service » | **Liste visible** : chaque atelier, son nombre d'équipements et de personnes |
| Liste des équipements du seul atelier courant | **Tous** les équipements du service, groupés par atelier, avec pastille de couleur |
| « Valider l'atelier », sans dire ce que ça fait | **« Fusionner en une surface »** / « Reprendre le détail » |
| Aucune explication du modèle | Une phrase en tête : un **service** contient des **ateliers**, un atelier contient des **équipements**, les **personnes** s'affectent aux équipements |
| Un long empilement | Trois étapes numérotées : ateliers, dessiner, équipements et personnes |

### Centre des réglages

Les réglages quittent le panneau étroit de droite pour un **onglet pleine
largeur**, en trois colonnes, comme le Centre des flux. Le nœud existant est
**déplacé** plutôt que recopié : toutes les liaisons se font par identifiant et
continuent de fonctionner.

**Défaut introduit puis corrigé dans la même passe** : la colonne de droite
étant masquée dans cette vue, ses panneaux Suivi et Données devenaient
inatteignables. Demander un panneau de la colonne ramène maintenant à la vue
Simulation.

| Fichier | Changement |
|---|---|
| `workshop-grid.js`, `workshop-grid.css` | panneau réécrit, un tracé = un équipement, liste d'ateliers, équipements groupés, légende |
| `sim.js`, `index.html`, `interface.css` | onglet Réglages, déplacement du panneau, retour à la vue Simulation |
| `tests/workshops-browser.cjs` | deux tracés = deux équipements, agrandissement explicite, disparition du menu déroulant |
| `tests/usability-browser.cjs` | cinq vues au lieu de quatre |
| `BUGS.md` | revue d'usage |

Le modèle de données n'a pas bougé : les huit tests de `workshops.test.cjs`
passent sans modification.

Tests : 118 unitaires et 7 parcours navigateur.

---

## 2026-09-21 — Sauvegarde complète, avant la saisie de l'unité

| Fichier | Changement |
|---|---|
| `sim.js`, `index.html` | **Données → Sauvegarde complète** : un seul fichier pour le plan, les zones, les stockages, les ateliers, les personnes, les flux et la bibliothèque. Restauration validée **avant** toute écriture, refusée en entier si une partie est abîmée |
| `.gitignore` | les sauvegardes de l'unité, y compris les exports par éditeur existants |
| `docs/TRACER_L_UNITE.md` | **nouveau** — mode d'emploi de la séance de saisie |
| `tests/sauvegarde-browser.cjs` | **nouveau** — l'aller-retour prouvé |
| `README.md` | sauvegarde, confidentialité, lien vers le mode d'emploi |

Le tracé vit dans le navigateur, réparti sur **quatre clés et quatre boutons
d'export**. Quatre fichiers à ne pas perdre, c'est trois de trop, et il suffit
de vider les données de site pour effacer des heures de travail. Un seul
fichier les réunit désormais.

**Le piège le plus sournois est nommé dans l'interface et dans le guide** : le
stockage d'un navigateur est cloisonné par adresse. Un tracé fait sur GitHub
Pages **n'apparaît pas** dans un `index.html` ouvert depuis le disque, et
inversement.

Le parcours navigateur ne se contente pas de vérifier le bouton : il trace une
zone déplacée et une table de cinq personnes, exporte, **fait refuser un
fichier dont une partie est corrompue** en vérifiant qu'aucune clé n'a bougé,
**vide entièrement le stockage**, restaure, et retrouve la table, ses cinq
personnes et la zone à sa nouvelle position. C'est cette preuve qui compte, pas
le bouton.

Tests : 118 unitaires et 7 parcours navigateur.

---

## 2026-09-21 — Curseurs et grille réconciliés ; heures demandées, faites et ETP

### La question « curseurs ou grille ? » n'a plus à être tranchée

Elle était insoluble parce qu'elle était posée en tout ou rien : si la grille
faisait foi, un service non aménagé tombait à zéro. Elle est donc posée
**service par service**.

| Fichier | Changement |
|---|---|
| `sim.js`, `index.html`, `interface.css` | effectif déduit de la grille affiché **en permanence** à côté de chaque curseur (« grille 6 ») ; case « Reprendre les effectifs de Création des ateliers » ; les curseurs des services renseignés se verrouillent, les autres restent libres |
| `tests/workshops-browser.cjs` | l'écart visible sans la case, le verrou avec, et un service non aménagé intact |

Sans la case, rien ne change et l'**écart entre les deux est visible** — c'est
déjà une information. Avec, la grille pilote **les seuls services qu'elle
renseigne**. Il n'y a plus de choix global à faire : on bascule service par
service, au fil de l'aménagement.

### Heures demandées, heures faites, présence, ETP

| Fichier | Changement |
|---|---|
| `moteur/orly.js` | `bilan.ateliers[].heuresDemandees / heuresRealisees / heuresPresence / resteAFaire / etpRealise`, et un total `bilan.charge` hors plonge |
| `sim.js` | détail d'atelier et quatre lignes A/B |
| `tests/orly.test.cjs` | 5 régressions sur les invariants |

C'est l'étape 6 de la feuille de route et son vocabulaire : « heures théoriques
demandées, heures humaines simulées » et « équivalent de charge sur 7 h ».

Sur la journée de démonstration : **82,3 h demandées, 82,3 h faites, 96,8 h de
présence, 11,76 ETP**. Cuisine réduite à une personne : 63,9 h faites, **18,4 h
restent sur le carreau**.

**Deux erreurs de ma part, révélées par les chiffres eux-mêmes :**

1. Je comptais l'intégrale d'occupation comme des heures de travail. C'est du
   **temps de présence** : une heure de travail mobilise 1 / disponibilité heure
   de quelqu'un, soit 1,18 h ici. Les deux grandeurs sont désormais séparées, et
   un test vérifie le rapport exact.
2. La plonge entrait dans le total des ETP. Ses « heures » sont des **heures de
   tunnel**, pas des homme-heures : elle est marquée `nature: 'tunnels'`, son
   ETP vaut `null`, et le total humain l'exclut.

Invariant vérifié par test : quand tout se fait, **heures faites = heures
demandées**. L'écart, c'est exactement le travail resté sur le carreau.

**Code mort retiré :** le tableau A/B interprétait encore `'h'` comme un format
d'horloge, reliquat de l'instantané qui porte désormais son propre libellé. Mes
lignes en heures s'affichaient « — ».

Tests : 118 unitaires et 6 parcours navigateur.

---

## 2026-09-21 — Personnes sur les équipements, site autonome retiré, vivier partagé

### La régression de l'absorption est réparée

Depuis que l'éditeur de postes a été absorbé dans l'onglet « Création des
ateliers », un équipement dessiné sur la grille n'avait **aucun moyen de porter
des personnes**. C'était une perte par rapport au site autonome.

| Fichier | Changement |
|---|---|
| `workshop-grid.js` | champ `postes` par équipement (entier 0–99, validé) ; champ dans la fiche, total par atelier et par service, compte repris d'un modèle posé depuis la bibliothèque, affiché sur le plan à côté du code |
| `workshop-grid.css` | mise en avant du total |
| `tests/workshops.test.cjs`, `tests/workshops-browser.cjs` | conservation, bornes, zéro qui efface le champ, saisie réelle, annuler/rétablir |

Un **compte**, pas des positions : la grille est schématique, le placement fin
reste l'affaire de la bibliothèque. Le champ est absent quand il vaut zéro — une
sauvegarde ancienne reste valide et n'est pas alourdie.

### Le site autonome disparaît

`postes/` n'est plus proposé comme application séparée : la carte de la page
d'accueil et la ligne du README sont retirées. **Les fichiers restent** : c'est
la bibliothèque de modèles et d'assemblages qu'ouvre l'onglet « Création des
ateliers ». Une seule porte d'entrée, un seul endroit où aménager.

### Vivier de personnes partagé

| Fichier | Changement |
|---|---|
| `moteur/orly.js` | `cfg.viviers` : effectif + ateliers couverts ; un lot demande une place à son atelier **et** aux viviers qui le couvrent, garde la première accordée et abandonne les autres ; heures d'ouverture communes ; minutes prêtées par atelier |
| `sim.js`, `index.html`, `interface.css` | curseur d'effectif et cases des ateliers couverts ; personnes prêtées dans le détail d'un atelier ; deux lignes A/B |
| `tests/orly.test.cjs` | 7 régressions |
| `tests/import-browser.cjs` | le levier dans l'interface |

La feuille de route demandait de représenter les compétences et les
affectations simultanées. C'est un premier pas : des personnes rattachées à
aucun atelier, qui vont là où l'on attend.

**Ce que ça donne.** Cuisine réduite à 2 personnes : 25 % de vols à l'heure,
103 minutes de retard moyen. Avec un vivier de 8 couvrant cuisine, montage et
dotation : **92 % à l'heure, aucun retard**. Le vivier a prêté 1 841
homme-minutes, dont 1 248 à la cuisine — le bilan dit à quoi il a servi.

Trois partis pris, écrits dans le code :

1. **Les gens de l'atelier passent avant un prêt.** L'atelier est en tête de la
   liste des sources ; mieux il est doté, moins il emprunte — un test le vérifie.
2. **La plonge ne peut pas être couverte.** Ses places sont des tunnels, pas des
   personnes : prêter quelqu'un n'en ajoute pas un. Un vivier réduit à la plonge
   est écarté, et la case n'existe pas dans l'interface.
3. **Un atelier sans personne à lui n'a pas de taux d'occupation.** L'indicateur
   vaut `null`, pas zéro : la question n'a pas de sens. C'est mon assertion de
   test qui avait tort, pas le moteur.

Le moteur accepte plusieurs viviers ; l'interface n'en expose qu'un, et le dit.

Tests : 113 unitaires et 6 parcours navigateur.

---

## 2026-09-21 — Calendrier multijour : cuisine J−2, prépa J−1, nuits fermées

| Fichier | Changement |
|---|---|
| `moteur/orly.js` | `cfg.calendrier` : avance par atelier, exception CRL du soir, programme répété sur N journées de départs ; **planning quotidien** de chaque atelier (ouverture, relève, fermeture) ; attente calendaire entre deux étapes séparées par une nuit ; `debut`, `horizon`, `etiquetteJour` exposés |
| `sim.js` | l'interface lit `DEBUT()` / `FIN()` sur le modèle au lieu de la fenêtre quotidienne ; horloge et tableaux étiquetés par jour ; case « Calendrier de production » et curseur de journées ; ligne A/B |
| `index.html` | panneau « Calendrier de production » |
| `tests/orly.test.cjs` | 7 régressions : arithmétique des jours, cuisine J−2 et prépa J−1, exception CRL, nuits fermées, sortie d'atelier la nuit, rétrocompatibilité |
| `tests/import-browser.cjs` | la case, l'horloge, le compteur et l'A/B dans le navigateur |
| `README.md` | réglages, lecture, limites |

C'était la **première limite métier de la feuille de route**. Elle est levée,
avec une réserve écrite partout : le seuil de 21:00 et la liste des compagnies
exceptées **ne sont pas confirmés**, et le programme de vols est répété faute de
données réelles datées.

**Inactif par défaut.** Il change tout l'axe du temps de l'interface, et Astra
y travaille en parallèle. Activé, il se voit : l'horloge passe à « J−2 05:00 »,
le programme devient 36 départs sur trois jours, les ateliers ferment la nuit.

**Ce que le calendrier révèle.** Sur la démonstration, matériel neutralisé pour
isoler l'effet :

| | départs | à l'heure | cuisine | prépa | robot |
|---|---:|---:|---:|---:|---:|
| Journée unique | 12 | 100 % | 15 % | 11 % | 20 % |
| Calendrier, 3 journées | 36 | 100 % | 9 % | 6 % | 9 % |

La pression d'échéance sur la cuisine et la prépa **était un artefact du modèle
d'une seule journée**, qui entassait deux jours de production dans celui du
départ. Un plat cuisiné l'avant-veille n'a pas d'échéance le jour du vol.

**Et un résultat que la journée unique cachait.** Calendrier actif avec le
matériel : 47 % à l'heure, 148 minutes de retard moyen. Ce n'est pas le
calendrier qui dégrade, c'est la **boucle du matériel qui ne se boucle pas** —
le jeu de démonstration compte 3 220 passagers au départ pour 1 772 au retour.
Sur une journée, le stock initial masquait l'écart ; sur trois, il se vide.
C'est la donnée de démonstration qui est déséquilibrée, pas le modèle, et
c'est dit dans l'interface.

Points de conception, écrits dans le code : un ordre qui attend l'ouverture du
lendemain **quitte son atelier** — il n'immobilise pas une place toute la nuit
et ne bloque pas l'amont ; le blocage aval ne se joue qu'entre deux étapes du
même jour. Personne n'est interrompu à la fermeture : un lot commencé à 22:58
se termine après 23:00.

**Trois défauts corrigés en cours de route.** Le tableau A/B formatait un
instantané ancien avec le calendrier courant, affichant un jour qui n'était pas
le sien — chaque instantané porte désormais son propre libellé. Le compteur de
vols ne suivait pas la reconstruction du modèle. Et l'étiquette de jour des vols
était celle du calcul (J+2) au lieu de celle du calendrier (J).

Tests : 105 unitaires et 6 parcours navigateur.

---

## 2026-09-21 — État des lieux du projet

| Fichier | Changement |
|---|---|
| `docs/ETAT_DES_LIEUX.md` | **nouveau** — où en est le projet, décisions prises, limites, points ouverts |
| `README.md` | l'état des lieux devient le point d'entrée pour reprendre le projet |

Le `CHANGELOG` dit ce qui a changé commit par commit ; il ne dit pas où on en
est. Après cinq jours, quarante commits et deux assistants en parallèle, ce
fichier manquait. Il est vérifié contre le dépôt, pas écrit de mémoire.

**Deux faits vérifiés à cette occasion, et l'un est préoccupant.**

Les références de pull request conservent toujours le plan de l'unité :
`refs/pull/1/head` en contient 18 fichiers, `refs/pull/2` et `refs/pull/3` en
contiennent 5 chacun. La purge des branches est bien effective, mais ces
références ne peuvent pas être réécrites par un `push` — seul le support GitHub
peut les supprimer. La demande a été rédigée le 18 septembre et **n'a pas été
envoyée**. Tant qu'elle ne l'est pas, le plan reste récupérable sur un dépôt
public.

Correction d'une affirmation fausse écrite dans le brouillon de ce fichier : il
n'y avait pas « 6 tests » le 17 septembre, il n'y en avait **aucun**. Les
premiers arrivent le 18 avec Astra. Vérifié par `git log --diff-filter=A`.

Comptes à la révision `0bfe587` : 98 tests unitaires (noyau 19, orly 21,
procede 14, ressources 14, ui-model 7, workshops 7, mesure 6, flows 5,
plan-editor 5) et 6 parcours navigateur, tous au vert après fusion des quatre
intégrations d'Astra du 20 septembre.

---

## 2026-09-19 — Boucle du matériel propre, et goulot recompté en ordres

| Fichier | Changement |
|---|---|
| `moteur/orly.js` | `Niveau` « matériel propre » : consommé par la dotation (unités par passager), réalimenté par les retours lavés à la plonge. Nouvel état `attente_materiel`, nouvelle cause dans l'explication, bilan `materiel`. **`goulot()` réécrit** : compté en ordres de fabrication |
| `sim.js`, `index.html` | curseur « Matériel propre à l'ouverture » dans le panneau Plonge ; niveau du stock dans le détail de la dotation ; trois lignes A/B |
| `tests/orly.test.cjs`, `tests/import-browser.cjs` | conservation du stock, seuil, état et cause, non-double-comptage, levier dans l'interface |
| `README.md` | lecture du point d'attention et du matériel |

La feuille de route relevait que « la plonge ne remet pas réellement du matériel
dans un stock utilisé par la production ». C'est fait, et la boucle se referme :
retours → plonge → stock → dotation → départs.

**Ce que le modèle sait maintenant répondre.** Le seuil mesuré sur la
démonstration : au-dessus de 2 000 unités à l'ouverture la journée passe à
100 % ; à 1 600 elle tombe à 83 % ; à 1 000, à 33 % avec 135 minutes de retard
moyen. Et l'explication le dit par vol : *CRL76, retard 548 min — OF dot (le
dernier fini) : attente de matériel propre 660 min · travail 18 min*. Le
réglage par défaut (2 600) ne contraint pas la démonstration : aucun résultat
existant n'a bougé, un test le vérifie.

Point de conception : l'OF attend le matériel **dans** l'atelier mais **sans
mobiliser d'opérateur**. On ne met pas quelqu'un devant un stock vide.
Conséquence à lire correctement : la dotation affiche une occupation basse
pendant que rien n'avance — c'est le point d'attention qui donne la cause.

**Défaut trouvé par un test et corrigé : le goulot comparait des unités
différentes.** Il mettait en concurrence un nombre de lots (atelier), un nombre
de vols (robot) et un nombre de dossiers (matériel). Un atelier avec beaucoup de
petits lots l'emportait toujours. `goulot()` compte désormais, pour chaque
poste, **combien d'ordres de fabrication sont arrêtés à cause de lui** — une
seule unité, comparable. Et un OF bloqué faute de place en aval est imputé à
l'atelier aval, celui qui est plein, pas à celui où il patiente.

Tests : 91 unitaires et 5 parcours navigateur.

---

## 2026-09-18 — Un retard s'explique : étapes par OF, état en direct, journal

| Fichier | Changement |
|---|---|
| `moteur/orly.js` | chaque OF garde ses étapes (entrée, première personne, fin, sortie, demande/début/fin robot) ; `etatOF` dérive ce qu'il attend ; `decomposer` et `expliquer(vol)` désignent l'OF qui a fixé l'heure et ses attentes ; `journal()` |
| `sim.js` | suivi des vols : état vivant par OF, explication du vol prêt ; détail d'atelier : état de chaque OF ; export `0.4` avec `explication` par vol et `journal` |
| `tests/orly.test.cjs`, `tests/import-browser.cjs` | explication d'un retard robot, bornes de la décomposition, état en direct, journal ordonné, export |
| `README.md` | lecture de la colonne « Opérations » |

C'est l'étape 6 de la feuille de route : « permettre à un responsable
d'expliquer un résultat depuis les opérations qui le produisent » et « cause du
retard : personnel, machine, matériel… ». Avec le robot à 200 pl/h, la démo dit
par exemple : *CRL76, retard 59 min — OF food (le dernier fini) : attente du
robot 42 min · attente de personnes 14 min (appros 13, cuisine 1) · travail 201
min*. Le travail inclut les 102 minutes de dressage robot de ce vol : un robot
lent, ce n'est pas seulement de l'attente.

**Précaution écrite dans le code et dans le README** : au montage, l'attente du
robot et l'attente de personnes se recouvrent. Ce sont des mesures séparées,
pas les parts d'un total ; les additionner serait faux.

Tests : 81 unitaires et 4 parcours navigateur.

---

## 2026-09-18 — Relève d'équipe : la capacité varie dans le temps

| Fichier | Changement |
|---|---|
| `moteur/ressources.js` | `Ressource.modifierCapacite(n)` ; capacité 0 permise ; **capacité effective** mesurée (places ouvertes, ou présents qui finissent après une baisse) : le taux d'occupation ne dépasse jamais 1 |
| `moteur/orly.js` | `cfg.equipes = { bascule, soir: { atelier: n } }` : à l'heure de relève, l'effectif de l'atelier change ; un atelier à 0 fait attendre au lieu d'être absent ; `personnes` du bilan = moyenne sur la journée |
| `sim.js`, `index.html` | bloc repliable « Équipe du soir » : heure de relève et un curseur par atelier, « comme le matin » tant qu'on n'y touche pas ; détail d'atelier = personnes présentes ; ligne A/B |
| `tests/ressources.test.cjs` | relève et renfort sans interruption, occupation ∫occupées / ∫capacité effective, ressource à zéro place |
| `tests/orly.test.cjs`, `tests/import-browser.cjs` | cuisine sans équipe du soir : vague du matin faite, vague du soir jamais ; renfort ; bascule avant l'ouverture |
| `README.md` | réglages, limites |

La feuille de route relevait que « les ressources humaines sont des capacités
globales constantes ; leurs horaires ne sont pas représentés ». Un effectif peut
maintenant changer à une heure donnée. Personne n'est interrompu à la relève :
les places en trop se ferment au fil des libérations, et les renforts servent
aussitôt ce qui attend.

**Point de conception trouvé par le test.** Mesurée naïvement, l'occupation
dépassait 100 % après une baisse d'effectif : deux personnes finissaient leur
lot alors qu'une seule place restait ouverte. La capacité mesurée est donc la
capacité **effective** — les présents, pas les places du planning. Quelqu'un qui
termine après la relève est encore là.

Deux équipes au plus (matin, soir) : c'est un premier pas, pas un planning.

Tests : 78 unitaires et 4 parcours navigateur, tous au vert.

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
