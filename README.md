# ORY — Simulation des flux de production

Interface de travail pour explorer les ateliers d’une unité de catering aérien,
suivre les départs simulés et préparer des essais de capacité.

**Statut : prototype non calibré.** Le plan provient du fichier de l’unité ;
les vols embarqués et les calculs sont des exemples. Les résultats ne permettent
pas encore de dimensionner les équipes ou de prédire la ponctualité réelle.

## Ouvrir l’application

Ouvrir `index.html` dans un navigateur récent. Aucun serveur, aucune installation
et aucune dépendance réseau ne sont nécessaires à l’utilisation. Conserver les
fichiers JavaScript, CSS et le dossier `moteur` à côté du HTML. Le fond privé
est facultatif ; aucun dossier `assets` n’est nécessaire.

## 🌐 Ouvrir l'application depuis GitHub (sans rien télécharger)

Le dépôt est **public** et sa branche par défaut est la branche de travail :
**GitHub Pages** peut donc le servir tel quel. À activer une seule fois :

> **Settings** → **Pages** → *Build and deployment* → Source : **Deploy from a
> branch** → Branch : `claude/factory-management-system-b1e0am` → dossier
> `/ (root)` → **Save**. Le site est en ligne au bout d'une minute environ.

Ensuite, chaque `push` republie automatiquement. Les adresses :

| Page | Adresse |
|---|---|
| **Accueil** (point d'entrée, à mettre en favori) | `https://basileseguin-afk.github.io/SIMMMMMSS/accueil.html` |
| Simulateur des flux | `https://basileseguin-afk.github.io/SIMMMMMSS/` |

Pour ouvrir **n'importe quel autre fichier**, reprenez son chemin sur GitHub et
remplacez `github.com/basileseguin-afk/SIMMMMMSS/blob/<branche>/` par
`basileseguin-afk.github.io/SIMMMMMSS/`. Un dossier contenant un `index.html`
s'ouvre sans nommer le fichier.

Le fichier `.nojekyll` à la racine désactive le traitement Jekyll : les fichiers
sont servis tels quels.

**Sans activer Pages**, pour ouvrir un fichier ponctuellement, remplacez
`github.com` par `raw.githack.com` et `/blob/` par rien :
`https://raw.githack.com/basileseguin-afk/SIMMMMMSS/claude/factory-management-system-b1e0am/index.html`
(service tiers, pratique pour un essai, pas pour un usage durable).

> ⚠️ **Le dépôt est public.** Aucune donnée confidentielle ne doit y être
> commitée — voir *Données confidentielles* ci-dessous.

## 🔒 Données confidentielles

Le dépôt est **public**. Le plan de l'unité et les exports de vols **n'y sont
pas** et ne doivent jamais y être commités. Ils se travaillent en local.

| Donnée | Où la mettre | État |
|---|---|---|
| Plan de l'unité (tuiles + classeur source) | `plan-prive/` | ignoré par Git |
| Exports de vols, man-hours, tout classeur | `prive/` | ignoré par Git |

`.gitignore` bloque `plan-prive/`, `prive/`, `*.xlsx`, `vols*.csv`, tout fichier
contenant « winrest », tout `moteur/procede-*.json`,
et les **sauvegardes de l’unité** (`ory-sauvegarde*.json`, `plan-ory-*.json`,
`ateliers-ory.json`, `centre-flux-*.json`, `ory-postes.json`).

### Sauvegarder son tracé

Le plan, les ateliers, les personnes, les flux et la bibliothèque vivent **dans
le navigateur**, et son stockage est cloisonné par adresse : un tracé fait sur
GitHub Pages n’apparaît pas dans un fichier ouvert depuis le disque.
**Sauvegarde** (en haut à droite) **› Tout sauvegarder** réunit tout dans un seul fichier, relu en
entier ou refusé en entier. Ce fichier contient le plan réel : il reste hors du
dépôt.

### Afficher le fond de plan

Créez un dossier `plan-prive/` à la racine et déposez-y les 12 tuiles nommées
`tuile1.png` … `tuile12.png`. Le fond apparaît alors automatiquement.

**Sans ce dossier, l'application fonctionne normalement** : les zones, la
simulation et les indicateurs sont inchangés, seul le fond d'architecte manque.
La case *Fond de plan* est alors désactivée et signalée « (absent) ».

Les **coordonnées** des zones et des tuiles restent dans le code : ce sont des
nombres, pas le dessin. Les **vols embarqués sont fictifs** ; aucun export réel
n'est présent dans ce dépôt.

> **Où en est-on ?** Le [cahier des charges consolidé](docs/CAHIER_DES_CHARGES.md)
> reprend tout ce qui a été demandé, l’état de chaque point et les écarts restants.

## Parcours d’utilisation

Le site raconte une histoire simple, pour qu’une personne qui n’est pas du
métier de l’informatique comprenne ce qu’elle regarde : **des avions partent,
chaque vol emporte ses repas, des équipes les préparent de service en service,
et le site calcule à quelle heure chaque repas est prêt.** L’accueil la
raconte en quatre images.

**Le menu.** Le site s’ouvre sur une **page d’accueil à tuiles** : une tuile par
partie du travail, avec son état en clair (✓ fait, · à faire, ~ provisoire —
des chiffres d’exemple, par exemple —, ! à vérifier, réservé aux vrais
problèmes), ses pages, et ce qu’il y a « à faire ensuite ». Les parties sont
rangées **par nature** : ce qu’on importe, ce qu’on décrit, ce qu’on essaie, ce
qu’on observe. Une page ne mélange jamais deux natures.

L’en-tête garde, sur une ligne, l’accueil, les quatre parties et la
**Sauvegarde**. Dans une partie, ses pages sont des **onglets** : un seul est
affiché ; un nombre sur un onglet dit qu’il y a quelque chose à y faire. La
dernière page ouverte de chaque partie est retenue ; les outils de la page
(annuler, rétablir, exporter, importer) se rangent à droite des onglets, et
chaque export dit ce qu’il contient.

**Le vocabulaire.** Chaque vol **commande** ses repas : une **commande** par
compagnie et par classe (« AF · Business », 88 passagers), pour la journée.
Chaque chiffre dit son unité (vols, commandes, services) et son moment (« à
07:00 », « sur toute la journée »). Ce qui n’est pas encore rempli est gris ;
le rouge ne sert qu’aux retards.

1. **Données** — ce qu’on importe.
   - *Vols* : importer le programme en Excel ou CSV simplifié, ou garder les
     vols d’exemple ; d’où viennent les vols est dit en tête.
   - *Temps de travail* : les minutes d’un vol, service par service et classe
     par classe (une valeur commune, des valeurs propres à une compagnie, ou une
     grille compagnie par classe).
2. **Organisation** — ce qu’on décrit.
   - *Chemins* : **un chemin par commande** (« Complet TX BC »), créé à la
     main — vide, copié d’un modèle, ou copié du chemin d’une autre commande —
     et « Dupliquer pour… » d’autres commandes. À gauche la liste des
     commandes, au centre le chemin **en diagramme de nœuds** : on tire le `+`
     d’un service jusqu’à un autre (ou on clique le `+`, puis l’autre) pour dire
     qu’il le livre ; un lien ne vaut que pour ce chemin. **Chaque nœud porte
     une case** : l’équipe qui y prépare la commande, avec son nom, ses
     personnes, son heure et ses man-minutes (celles de l’import, modifiables
     pour la case). Une case se partage : « TX BC/PC » en cuisine prépare TX BC
     puis TX PC, et le chemin de TX BC n’attend que la ligne de TX BC. Une
     commande sans chemin suit le modèle de sa classe.
   - *Cases* : chaque case avec ses commandes dans l’ordre, qui mènent à leur
     chemin ; « + Case hors chemin » pour une plonge ou une mise à disposition
     qui sert tout le monde.
   - *Qui prépare quoi* : le tableau calculé, une ligne par commande, une
     colonne par service, la case et ses heures dans chaque cellule ; un clic
     ouvre le chemin de la commande sur ce service.
   - *Services* : un service par ligne — son nom (qui se change ici), ses
     équipes, les commandes qui y passent et ce qui lui manque, en tête de liste.
     « + Une équipe » crée une case dans ce service et l’ouvre ; « Voir sur le
     plan » ; « Modifier le plan de l’unité » pour la forme et la place.
   - *Liens entre services* : qui livre qui dans l’unité, dans le même diagramme
     de nœuds ; ces liens ne servent qu’aux commandes qui n’ont pas de chemin.
   - *Contrôles* : ce que le calcul comprend de l’organisation, et ce qu’il faut
     corriger ; un service sans équipe s’y corrige d’un clic (« + Une équipe
     dans… »).
3. **Réglages** — ce qu’on essaie.
   - *Horaires des vols* : décaler tous les vols ; « repas prêts combien de
     minutes avant le départ ? ».
   - *Rythme et pauses* : rythme de travail, pauses et temps de présence.
4. **Résultats** — ce que la journée donne.
   - *Synthèse* : la journée entière en tuiles (commandes à l’heure, retards,
     dernière commande prête, attentes, travail fourni) ; « Exporter les
     résultats ».
   - *Le plan rejoué* : rejouer la journée sur le plan de l’unité, avec les
     chiffres de l’instant, « En ce moment » à droite et, au-dessus des
     services, ce qui attend en stock ou à laver. Le plan des services se
     modifie d’ici (« Modifier le plan »).
   - *Planning des équipes* : case par case, qui travaille quand.
   - *Commandes* : chaque commande, prête à quelle heure, avant quand.
   - *Départs* : une frise de la journée et un tableau qui dit, vol par vol, si
     ses commandes sont prêtes à l’heure, en retard, ou sans équipe.
   - *Stocks et retours* : ce qui attend entre deux ateliers et avant le
     chargement ; les retours des vols face au débit de la plonge.
   - *Comparer deux essais* : A / B.

**Sauvegarde** (en-tête) : tout le travail dans un fichier, et les limites
connues du calcul.

**Tout se pilote aussi depuis Excel** : ateliers (avec classes et parcours),
barème et programme de vols s’exportent en `.xlsx`, se modifient dans le
tableur et se réimportent. Voir [les formats Excel](docs/FORMATS_EXCEL.md).

La journée est **calculée d’un coup** par `moteur/production.js` et
**recalculée à chaque modification** : aucun réglage ne se verrouille.

- **Le plan rejoué** : rejoue la journée calculée. « ▶ Rejouer », « ⏭ Pas à pas »
  (saute au prochain changement), « ↺ Début » et un curseur de temps qui va dans
  les deux sens. Le plan montre quatre états par service : au travail, attend le
  service d’avant (pointillé), a fini, pas commencé. Au début de la journée, il
  montre plutôt ce qui reste à décrire (aucune équipe, équipe sans travail,
  équipe au travail).
- **Départs** : le bilan de la journée, départ par départ ; un vol dont des
  repas n’ont pas d’équipe est dit « Des repas sans équipe ».
- **Exporter les résultats** (Synthèse) : la journée calculée — départs, classes, journal des lots.

## Lire les indicateurs

- **Prêts à l’heure** : parmi les repas dont l’heure de chargement est **déjà
  passée** à l’heure rejouée, ceux prêts à temps. Avant le premier chargement : « — ».
- **En retard** : repas dont l’heure de chargement est passée et qui ne sont pas
  encore prêts.
- **Services au travail** / **Services qui attendent** : services qui préparent,
  et services dont l’équipe est là mais dont le service d’avant n’a pas encore livré.
- **Point d’attention** : le poste qui attend son amont depuis le plus
  longtemps à cet instant, et, sur la journée, celui qui a le plus attendu.
  Pour un service choisi : ses équipes et ses lots avec leurs heures.
- **La journée calculée** : classes à l’heure, retard le plus long, dernière
  sortie, attente cumulée, homme-heures, classes sans atelier.

L’échéance vaut départ moins délai de chargement. Ces états concernent la
production ; ils ne mesurent pas le retard avion.

**Scénarios A/B** (Résultats › Comparer deux essais). La journée étant déjà
calculée, une capture **fige** les réglages et leurs résultats. Changez un
atelier, le barème ou un horaire, capturez B : le tableau sépare les réglages
des résultats, fait ressortir les lignes qui diffèrent et écrit, sur chaque
résultat, « mieux » ou « moins bien ». Le calcul n’a aucun aléa : réglages
identiques ⇒ chiffres identiques, et la note le dit. Un nouveau programme de
vols efface les captures.

## Import CSV simplifié

Le programme s’importe aussi en Excel, feuilles « Départs » et « Retours » :
le plus simple est d’exporter le programme actuel puis de le modifier. Voir
[les formats Excel](docs/FORMATS_EXCEL.md).

Utiliser **Télécharger le modèle**. En-têtes attendus, insensibles à la casse :

```csv
vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML
DEMO001,DEMO,A320,DEP,12:00,,0,0,100,4,3
DEMO-RET001,DEMO,A320,RET,,08:00,0,0,100,4,0
```

`type_avion`, `nb_CREW` et `nb_SPML` sont facultatifs. Toutes les autres
colonnes sont obligatoires.
`heure_std` doit être renseignée pour DEP, `heure_sta` pour RET, au format
HH:MM. Les quantités sont des entiers positifs ou nuls, avec au moins une
quantité non nulle par ligne. Une ligne représente un départ ou un retour ;
un même identifiant ne peut pas être répété dans le même sens.

Virgules, points-virgules et champs entre guillemets sont pris en charge.
Toute erreur refuse le fichier entier et conserve le jeu précédent. Taille
maximale : 2 Mo. **Le XLSX Winrest et ses lignes de prestations ne sont pas
encore pris en charge.** Aucun effectif passager n’est déduit de cet export.

## Dessiner et détailler le plan

**Éditer les zones** ouvre un espace dédié : plan agrandi, outils Rectangle /
Polygone / Sélection / Main, liste recherchable des ateliers et locaux.
Les stockages sont des fiches rattachées aux services, sans contour individuel.
Ajouter des locaux et équipements, les nommer, choisir
une couleur, dupliquer, masquer ou verrouiller leur géométrie.

Les poignées gardent une taille lisible au zoom. L’aimantation et les guides
facilitent l’alignement ; Espace + glisser déplace la vue. **Annuler / Rétablir**
couvre les gestes et les imports. **Centrer la sélection** permet de travailler
sur une petite pièce. L’édition est compatible avec les anciennes positions
sauvegardées et les anciens exports JSON.

Les nouvelles zones sont des annotations, sans charge simulée. Les ateliers
reliés au moteur conservent leur identité. La sauvegarde dans le navigateur est
automatique ; **Exporter le plan** permet de conserver une copie indépendante.

Voir le **[guide de l’éditeur](docs/EDITEUR_PLAN.md)** pour les gestes, raccourcis,
imports, sauvegardes et limites.

## Ateliers de travail

L'onglet **Ateliers de travail** décrit qui fabrique quoi, quand, et à combien.
Un atelier est une équipe dans un service : un nom libre (« Prépa CRL BC »),
une **heure de début que vous donnez**, un effectif, et une liste **ordonnée**
de lots à fabriquer. La fin est calculée. Un atelier **robot** travaille à son
débit et refuse de tourner sous son effectif minimum.

L'unité de fabrication est la **compagnie × classe** (`CRL/BC`, `AF/YC`…),
déduite du programme de vols. Son parcours se lit dans le graphe du Centre des
flux : un service ne travaille un lot que lorsque **tous ses fournisseurs** ont
livré ses classes — c'est là que les branches food, matériel et armement se
rejoignent.

Le barème d'homme-minutes est **non calibré** : ses durées ne dimensionnent pas
une équipe. Voir [la note de modèle](docs/MODELE_ATELIERS.md).

## Centre des flux

L’onglet **Centre des flux** permet de définir des liaisons par listes
déroulantes entre services et stockages, avec plusieurs origines et destinations.
Quatre familles : humains (personnel / runners), matériels, matières premières
ou transformées, informations (OF / kanban). La circulation interne est libre
par défaut ; une liaison interservices humaine nécessite le type Runner.

Modification, désactivation, suppression, retour, filtres du plan, historique,
sauvegarde locale et export/import sont disponibles. Les anciennes flèches sont
conservées **À classer**. Voir le [guide du Centre des flux](docs/CENTRE_DES_FLUX.md).

Le modèle par ateliers lit ce graphe : c’est lui qui dit quel service attend
quel autre (voir la [note de modèle](docs/MODELE_ATELIERS.md)).

## Limites métier à traiter ensuite

- Le **barème d’homme-minutes n’est pas calibré** : valeurs de démonstration
  tant que l’étude de l’unité n’est pas importée. Il compte **par vol** ; le
  nombre de passagers ne sert plus qu’au robot (des plateaux).
- Calcul **sans aléa** : pas de panne, d’absence ni de retard de livraison.
- Un seul compte de matériel propre, consommé et relavé ; les stocks de
  denrées, les trolleys et les transferts physiques ne sont pas modélisés.
- Les compétences ne sont pas modélisées : une personne ne va pas aider dans
  un autre atelier.
- L’export Winrest (XLSX, lignes de prestations) n’est pas encore lu.

L’ancien moteur de démonstration (`moteur/orly.js`, `ressources.js`,
`mesure.js`, `procede.js`) a été **retiré le 23 septembre 2026** : la vue
Simulation relit désormais le modèle par ateliers, qui porte seul le calcul.
L’[étude des moteurs](docs/ETUDE_OPEN_SOURCE.md) reste pour mémoire. Les données réelles
restent en privé.
**Pour tracer et paramétrer l’unité, suivre le
[mode d’emploi de la saisie](docs/TRACER_L_UNITE.md)** : où travailler, dans
quel ordre, et comment ne rien perdre.

**Pour reprendre le projet, commencer par l’[état des lieux](docs/ETAT_DES_LIEUX.md)** :
où en est le travail, ce qui est décidé, ce qui ne l’est pas, et ce qui reste à
faire. Voir aussi [l’audit d’usage](docs/AUDIT_INTERFACE.md), le
[registre des bugs](BUGS.md) et le
[journal des modifications](CHANGELOG.md). La
[feuille de route commune](docs/FEUILLE_DE_ROUTE.md) reste la référence métier.

## Fichiers et vérification

| Fichier | Rôle |
|---|---|
| `index.html` | Structure et contrôles |
| `interface.css` | Disposition et hiérarchie visuelle |
| `sim.js` | Interface, plan, interactions, glue entre les centres |
| **`moteur/production.js`** | **Modèle par ateliers de travail** — compagnie × classe, lots ordonnés, robot, plonge, parcours lu des flux. Voir [la note de modèle](docs/MODELE_ATELIERS.md) |
| `moteur/noyau.js` | Noyau à événements discrets sur lequel tourne le modèle par ateliers |
| `replay.js` / `simulation.js` | Relecture de la journée calculée : états à l’instant t, vue Simulation |
| `comparaison.js` | Scénarios A/B : capture, tableau, verdict par ligne |
| `vols-demo.js` | Programme de vols **fictif** de démonstration |
| `parcours.js` | Chemins des repas : validation, chemins types, tableau « Qui prépare quoi », suivi d’un repas dans le temps, éditeur |
| `tableur.js` | Lecture et écriture de classeurs Excel (.xlsx) et de CSV, sans bibliothèque |
| `echanges.js` | Les trois classeurs (ateliers, barème, vols) : format et conversions |
| `plan-editor.js` / `editor.css` | Dessin, annotations, historique et sauvegarde du plan |
| `ui-model.js` | Import CSV et échappement, testables |
| `flow-center.js` / `flow-center.css` | Réseau configurable, règles humaines, onglet et affichage des flux |
| `ateliers.js` / `ateliers.css` | Onglet « Ateliers de travail » : saisie, planning, couverture par classe |
| `reglages.js` / `reglages.css` | Centre des réglages : barème, rendement, régime de poste |
| `demarrage.js` / `histoire.css` | L’accueil : une tuile par partie avec son état, « à faire ensuite », l’histoire en quatre images, le menu de l’en-tête ; `histoire.css` porte aussi le graphisme : couleurs par sens, jauges, tableau des départs, plan de métro, barres |
| `graphe.js` / `graphe.css` | Le diagramme de nœuds des chemins et des liens de l’unité : disposition en colonnes avec couloirs, tirer un trait pour relier, clavier, disposition retenue |
| `onglets.js` | Le menu : les quatre parties et leurs pages (chacune est un sous-onglet d’une vue), la règle qui masque les autres, le clavier, la page retenue par partie |
| `icones.js` | Les pictogrammes (étapes, services, états) et les couleurs d’étape |
| `demarrage.css` | Ce que montre chaque vue (lecture de la journée seulement dans « La journée ») et couleurs du plan en lecture |
| `plan-prive/` | Fond de plan **local, non versionné** (voir ci-dessous) |
| `tests/ui-model.test.cjs` | Régressions de l’import CSV |
| `tests/noyau.test.cjs` | Régressions du noyau : ordre, horloge, conditions, interruptions, erreurs |
| `tests/production.test.cjs` | Régressions du modèle par ateliers : enchaînement des lots, attente des amonts, robot, pauses, validation |
| `tests/replay.test.cjs` | Relecture : états d’un service, ponctualité à l’instant t, pas suivant |
| `tests/comparaison.test.cjs` | Scénarios A/B : capture, déterminisme, verdicts, jeu de démonstration |
| `tests/parcours.test.cjs` | Parcours : graphe de nœuds et de liens, conversion des branches, boucle refusée, chemins parallèles, jonction, étape enjambée, hors parcours, boucle ; tableau « Qui prépare quoi », choisir une équipe, remplir, suivi dans le temps |
| `tests/tableur.test.cjs` | Classeurs Excel : aller-retour, fichier compressé d’un autre logiciel, CSV |
| `tests/echanges.test.cjs` | Les trois classeurs : aller-retour, ajouts, erreurs regroupées |
| `tests/excel-browser.cjs` | Chemins et tableau « Qui prépare quoi » dans l’interface, classeurs ateliers et vols de bout en bout |
| `tests/menu-browser.cjs` | L’accueil (tuiles, états, « à faire ensuite »), le menu par parties, la nature de chaque page, les outils qui suivent la page, clavier, page retenue, sauvegarde, menu verrouillé pendant l’édition du plan, hauteur des bandeaux, écran de 1 024 px |
| `tests/services-browser.cjs` | Organisation › Services : une ligne par service, « + Une équipe » (depuis la page, les contrôles, le plan), renommer, voir et modifier sur le plan, pas d’alerte pour une plonge |
| `tests/nav.cjs` | Aide partagée des tests navigateur : aller à une page comme à la main (la partie, puis l’onglet) |
| `tests/icones.test.cjs` | Chaque service reconnaît son pictogramme |
| `tests/graphe.test.cjs` | Diagramme : colonnes, nœud au milieu de ses amonts, couloirs des longs liens, boucles, dispositions retenues |
| `tests/graphe-browser.cjs` | Diagrammes dans la page : tirer un trait, clavier, doublon et boucle refusés, équipe créée depuis un nœud, disposition retenue, liens de l’unité |
| `tests/onglets.test.cjs` | Le menu : chaque page dans une seule partie, rangée par nature ; pages de chaque vue, identifiants uniques, règle de masquage, pictogrammes |
| `tests/browser-smoke.cjs` | Parcours dans Chromium : relecture, vols, import, export, écran étroit de bureau |
| `tests/import-browser.cjs` | Import CSV : échec de lecture puis réimport, numéros de ligne, export, scénarios A/B |
| `tests/sauvegarde-browser.cjs` | Sauvegarde complète : export, refus atomique, effacement et restauration |
| `tests/ateliers-browser.cjs` | Onglet Ateliers de bout en bout : saisie, calcul, planning, persistance |
| `tests/etat-plan-browser.cjs` | État de paramétrage sur le plan, quatre états de la relecture, bascule des légendes |
| `tests/zoom-browser.cjs` | Bornes du zoom, cadrage d'un service, raccourcis clavier, bridage du déplacement |
| `tests/annexe-browser.cjs` | Zone de production annexe (« Armement 2 ») : création, rattachement, aménagement, effectif |
| `BUGS.md` | Registre des bugs connus — à lire avant de coder, à compléter après chaque revue |

Tests purs, avec Node : `node --test tests/*test.cjs`.

Tests navigateur, avec Playwright installé dans l’environnement de développement
et Chromium disponible : `node tests/browser-smoke.cjs`. La variable optionnelle
`CHROMIUM_EXECUTABLE_PATH` permet de choisir un exécutable Chromium existant.
Les captures de contrôle sont écrites dans le dossier temporaire du système.
Ces outils sont nécessaires uniquement aux tests, pas à l’application.

Parcours spécifiques : `node tests/editor-browser.cjs`, `node tests/storage-browser.cjs`,
`node tests/import-browser.cjs`, `node tests/flows-browser.cjs`,
`node tests/ateliers-browser.cjs`, `node tests/usability-browser.cjs`,
`node tests/sauvegarde-browser.cjs`, `node tests/etat-plan-browser.cjs`,
`node tests/zoom-browser.cjs`,
`node tests/annexe-browser.cjs` (Playwright / Chromium). Ils se rejouent **tous** : un parcours laissé de côté
est une régression qui passe.
