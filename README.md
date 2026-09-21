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
contenant « winrest », tout `moteur/procede-*.json` autre que l’exemple fictif,
et les **sauvegardes de l’unité** (`ory-sauvegarde*.json`, `plan-ory-*.json`,
`ateliers-ory.json`, `centre-flux-*.json`, `ory-postes.json`).

### Sauvegarder son tracé

Le plan, les ateliers, les personnes, les flux et la bibliothèque vivent **dans
le navigateur**, et son stockage est cloisonné par adresse : un tracé fait sur
GitHub Pages n’apparaît pas dans un fichier ouvert depuis le disque.
**Données → Sauvegarde complète** réunit tout dans un seul fichier, relu en
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

## Parcours d’utilisation

1. **Données** : consulter les limites du moteur, télécharger le modèle CSV ou
   importer un fichier simplifié. Le nom du jeu et le nombre de départs/retours
   restent visibles en haut de page.
2. **Réglages** : préparer les effectifs simultanés — le curseur de chaque
   service affiche l’effectif déduit de « Création des ateliers » quand il y en
   a un, et une case permet de laisser la grille piloter **les services qu’elle
   renseigne seulement**, les autres restant réglables au curseur —, la cadence du robot et la
   liste des compagnies qu’il sert (règle de la feuille de route : FBU, TX/FWI
   et CRL ; les autres YC sont dressés à la main à un coefficient non calibré),
   la contenance des ateliers en ordres de fabrication (vide = illimitée ; finie,
   elle crée le blocage amont), l’**équipe du soir** (effectif par atelier à
   partir de l’heure de relève, 14:00 par défaut ; personne n’est interrompu à
   la relève, les places en trop se ferment au fil des libérations), les
   tunnels, le **matériel propre à l’ouverture**, le **vivier polyvalent**
   (personnes partagées entre plusieurs ateliers), le **calendrier de
   production** (cuisine J−2, prépa J−1 ; inactif par défaut) et les horaires
   avant de lancer. Une fois l’essai commencé, les paramètres sont verrouillés, même
   en pause. **Recommencer** libère les réglages et efface la progression après
   confirmation ; les instantanés restent disponibles.
3. **Plan / Suivi** : sélectionner un atelier depuis le plan, la liste Atelier
   ou les indicateurs. Les opérations actives apparaissent dans le détail.
4. **Suivi des vols** : rechercher un vol ou une compagnie, filtrer les dossiers
   non prêts ou dont l’échéance est dépassée, voir les opérations restantes.
5. **Exporter le résultat** : télécharger les données d’entrée, paramètres,
   indicateurs, mesures par atelier et scénarios A/B avec le statut explicite
   de démonstration.

Le bouton Pause arrête le calcul. La vitesse est exprimée en minutes simulées
par seconde. Le calcul est un **moteur à événements discrets** (`moteur/`) :
chaque personne est occupée par un lot de 5 homme-minutes à la fois, le robot
dresse un vol à la fois dans l’ordre des échéances, la plonge a autant de
places que de tunnels, la dotation consomme du matériel propre que la plonge
réalimente, et chaque atelier a une contenance en OF (illimitée
tant qu’elle n’est pas renseignée dans `CFG.tampons`). Le rendu avance la
simulation par pas de 30 secondes simulées. Le barème d’homme-minutes reste
non calibré. Les déplacements de jetons sont illustratifs, sans valeur de
temps de transfert.

## Lire les indicateurs

- **Prêts à l’échéance** : dossiers prêts à temps / départs dont l’échéance est
  atteinte. Avant la première échéance, la valeur est « — ». Un dossier
  inachevé à échéance dépassée reste dans le dénominateur.
- **Échéances dépassées · non prêts** : dossiers encore inachevés dont
  l’échéance est atteinte.
- **Travail en cours** : ordres de fabrication libérés et non terminés, en
  attente ou en traitement.
- **Débit robot** : part du temps où le robot est occupé sur les 15 dernières
  minutes simulées, multipliée par sa cadence. Une mesure du modèle, pas du site.
- **Retard courant des départs exigibles** : moyenne incluant les dossiers
  inachevés, dont le retard augmente jusqu’à leur fin.
- **Retard des dossiers terminés** : moyenne sur les dossiers terminés uniquement.
- **Occupation par atelier** : part des personnes occupées par un lot de travail
  sur les 15 dernières minutes simulées, mesurée, sans lissage ni plancher. Le
  détail d’un atelier donne aussi l’occupation depuis 05:00. Magasin, Duty free
  et handling ne sont pas modélisés.
- **Point d’attention** : le poste où l’on attend, compté en **ordres de
  fabrication arrêtés à cause de lui** — personnes occupées, robot occupé,
  matériel propre en rupture, ou tampon plein. Un OF bloqué faute de place en
  aval est imputé à l’atelier aval, celui qui est plein. Aucun seuil : s’il n’y
  a d’attente nulle part, rien n’est désigné.
- **Calendrier de production** (facultatif) : la cuisine travaille deux jours
  avant le départ, la prépa la veille, le reste le jour même. Les ateliers
  **ferment la nuit**. L’horloge affiche alors le jour (J−2, J, J+1). Entre
  deux étapes séparées par une nuit, l’ordre **quitte son atelier** et attend
  en stock : il ne bloque pas l’amont. Cette attente est dite « planifiée »
  dans l’explication — ce n’est pas un retard.
- **Heures et ETP** : le détail d’un atelier donne les **heures demandées** par
  le barème, les **heures faites**, le **reste à faire** et les **heures de
  présence**. La présence dépasse le travail d’exactement 1 / disponibilité :
  une heure de travail mobilise plus d’une heure de quelqu’un. L’**ETP** vaut
  heures ÷ 7, convention de la feuille de route — un équivalent de **charge**,
  pas un nombre de personnes à affecter. La **plonge en est exclue** : ses
  heures sont des heures de tunnel, pas des homme-heures.
- **Vivier polyvalent** : des personnes rattachées à aucun atelier, qui vont
  là où l’on attend parmi les ateliers cochés. Un atelier sert d’abord avec ses
  propres gens ; le détail d’un atelier indique combien lui sont prêtées. La
  **plonge en est exclue** : ses places sont des tunnels, prêter quelqu’un n’en
  ajoute pas un. Un atelier sans personne à lui n’a pas de taux d’occupation —
  la question n’a pas de sens, l’indicateur affiche « — ».
- **Matériel propre** : un seul compte, en unités par passager. La dotation en
  consomme pour chaque départ, la plonge le réalimente avec les retours lavés.
  À stock vide, la dotation attend **sans mobiliser personne** : son occupation
  reste basse alors que rien n’avance, et c’est le point d’attention qui le dit.
- **Suivi des vols, colonne « Opérations »** : pendant la journée, chaque ordre
  de fabrication dit où il est et ce qu’il attend (une personne, le robot, une
  place en aval). Une fois le vol prêt, l’OF qui a fixé l’heure explique son
  parcours : attente du robot, attente de personnes par atelier, blocage aval,
  travail. Ces attentes sont des **mesures séparées qui peuvent se recouvrir**
  (au montage, robot et personnes travaillent en parallèle), pas les parts d’un
  total. L’export contient cette explication par vol et le journal des étapes.

L’échéance vaut départ simulé moins délai de chargement. Ces états concernent
la production ; ils ne constituent pas une mesure du retard avion.

**Scénarios A/B.** Une capture enregistre les réglages et les vols du moment,
puis rejoue la **journée entière** sans interface — quelques dizaines de
millisecondes, le moteur étant sans aléa. Deux captures se comparent donc à
conditions égales : mêmes vols, seuls les réglages diffèrent, et les lignes qui
diffèrent ressortent. Réglages identiques ⇒ chiffres identiques, et la note le
dit. Le tableau donne la ponctualité finale, les échéances dépassées, le retard
moyen, et l’occupation sur la journée du robot, du montage, de la cuisine et de
la plonge. Un changement de jeu efface les scénarios.

## Import CSV simplifié

Utiliser **Télécharger le modèle**. En-têtes attendus, insensibles à la casse :

```csv
vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC
DEMO001,DEMO,A320,DEP,12:00,,0,0,100
DEMO-RET001,DEMO,A320,RET,,08:00,0,0,100
```

`type_avion` est facultatif. Toutes les autres colonnes sont obligatoires.
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

## Création des ateliers

L’onglet **Création des ateliers** conserve la carte : cliquer un service le
cadre au zoom maximal. Créer des ateliers internes puis construire tables et
chaînes case par case sur une grille de **50 × 50 cm théoriques**, avec gomme,
déplacement, rotation et annulation. La bibliothèque de modèles et assemblages
existante est accessible dans l’application pour les poser sur cette grille.

Le fond n’est pas calibré : l’aménagement reste schématique, sans vérification
des dimensions réelles ni calcul automatique des capacités du moteur.
Voir le [guide de création des ateliers](docs/CREATION_ATELIERS.md).

## Centre des flux

L’onglet **Centre des flux** permet de définir des liaisons par listes
déroulantes entre services et stockages, avec plusieurs origines et destinations.
Quatre familles : humains (personnel / runners), matériels, matières premières
ou transformées, informations (OF / kanban). La circulation interne est libre
par défaut ; une liaison interservices humaine nécessite le type Runner.

Modification, désactivation, suppression, retour, filtres du plan, historique,
sauvegarde locale et export/import sont disponibles. Les anciennes flèches sont
conservées **À classer**. Voir le [guide du Centre des flux](docs/CENTRE_DES_FLUX.md).

Ce réseau configurable ne remplace pas les gammes de `moteur/orly.js` : les
calculs A/B, les équipes, les tampons et les explications par OF restent ceux
du moteur existant. Leur raccordement aux nouvelles liaisons reste à définir.

## Limites métier à traiter ensuite

- Le **calendrier de production** (cuisine J−2, prépa J−1, exception CRL du
  soir) est modélisé mais **inactif par défaut** : il change tout l’axe du
  temps. Le seuil de 21:00 et la liste des compagnies exceptées ne sont **pas
  confirmés**. Le même programme de vols est répété chaque jour, faute de
  données réelles datées.
- Le robot sert les compagnies de la liste réglable (FBU, TX/FWI et CRL par
  défaut) ; les prestations exactes et les cas SPML restent à préciser, et le
  coefficient de dressage manuel des autres YC n’est pas calibré.
- Standards théoriques du classeur, effets de lot et non-linéarité non intégrés.
- Un seul compte de matériel propre : la dotation en consomme pour chaque
  départ, les retours lavés à la plonge le réalimentent. Les trolleys
  d’armement, les stocks de denrées, les compétences, les pauses et les
  transferts physiques ne sont pas modélisés.
- Les curseurs décrivent des personnes simultanées, en deux équipes au plus
  (matin, soir), auxquelles s’ajoute un vivier polyvalent ; les compétences
  réelles ne sont pas modélisées ; la convention heures / 7 produit un équivalent de charge, pas
  une affectation de personnel.

Le moteur à événements discrets est maintenant branché à l’interface via
`moteur/orly.js`. Le noyau, les ressources et les mesures prennent en charge
les files, les tampons bloquants, les relèves et le rejeu A/B ; `moteur/procede.js`
propose aussi une description de gamme en données — voir le
[guide du procédé](docs/PROCEDE.md). La calibration, l’intégration du calendrier
métier et le raccordement du Centre des flux restent à faire.
L’[étude des moteurs](docs/ETUDE_OPEN_SOURCE.md) décrit le bilan et la décision
encore ouverte sur le moteur d’autorité (JavaScript ou Python). Cette évolution
d’interface ne tranche pas cette décision. Les données réelles restent en privé.
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
| `interface.css` | Disposition, hiérarchie visuelle et adaptations mobile |
| `sim.js` | Interface, plan, interactions et rendu |
| `moteur/orly.js` | Modèle des flux de l’unité sur le moteur : ateliers, robot, plonge, tampons, goulot mesuré |
| `plan-editor.js` / `editor.css` | Dessin, annotations, historique et sauvegarde du plan |
| `ui-model.js` | Import CSV, calcul des états et règles de présentation testables |
| `moteur/noyau.js` | Noyau à événements discrets utilisé par le modèle Orly branché à l’interface |
| `flow-center.js` / `flow-center.css` | Réseau configurable, règles humaines, onglet et affichage des flux |
| `moteur/mesure.js` | Moniteurs de niveau (pondérés par le temps) et de comptage |
| `moteur/ressources.js` | Postes à places, tampons bloquants, niveaux (étape 2) |
| `moteur/procede.js` | Procédé décrit en données : validation, tirages à graine, exécution (étape 3) |
| `moteur/procede-exemple.json` | Procédé **fictif** publiable — voir [le guide](docs/PROCEDE.md) |
| `plan-prive/` | Fond de plan **local, non versionné** (voir ci-dessous) |
| `tests/ui-model.test.cjs` | Régressions de l’import et des indicateurs |
| `tests/noyau.test.cjs` | Régressions du noyau : ordre, horloge, conditions, interruptions, erreurs |
| `tests/mesure.test.cjs` | Régressions des moniteurs : pondération par le temps, percentiles |
| `tests/ressources.test.cjs` | Régressions des ressources, dont la démonstration du blocage amont |
| `tests/procede.test.cjs` | Régressions du procédé : validation, reproductibilité, goulot mesuré |
| `tests/orly.test.cjs` | Journée de démonstration rejouée sans interface : leviers, déterminisme, blocage |
| `tests/browser-smoke.cjs` | Parcours dans Chromium, export, édition et responsive |
| `tests/import-browser.cjs` | Import CSV : échec de lecture puis réimport, numéros de ligne, scénarios A/B |
| `tests/sauvegarde-browser.cjs` | Sauvegarde complète : export, refus atomique, effacement et restauration |
| `tests/etat-plan-browser.cjs` | État de paramétrage des ateliers sur le plan, bascule des légendes, bande d'indicateurs contextuelle |
| `tests/zoom-browser.cjs` | Bornes du zoom, cadrage d'un service, raccourcis clavier, bridage du déplacement |
| `tests/grille-moteur-browser.cjs` | Tunnels et lignes robot tracés pilotant les réglages du moteur |
| `BUGS.md` | Registre des bugs connus — à lire avant de coder, à compléter après chaque revue |
| `postes/` | **Bibliothèque** de modèles de tables, chaînes et assemblages, ouverte depuis l’onglet « Création des ateliers ». Ce n’est plus une application autonome |

Tests purs, avec Node : `node --test tests/*test.cjs`.

Tests navigateur, avec Playwright installé dans l’environnement de développement
et Chromium disponible : `node tests/browser-smoke.cjs`. La variable optionnelle
`CHROMIUM_EXECUTABLE_PATH` permet de choisir un exécutable Chromium existant.
Les captures de contrôle sont écrites dans le dossier temporaire du système.
Ces outils sont nécessaires uniquement aux tests, pas à l’application.

Parcours spécifiques : `node tests/editor-browser.cjs`, `node tests/storage-browser.cjs`,
`node tests/import-browser.cjs`, `node tests/flows-browser.cjs`,
`node tests/workshops-browser.cjs`, `node tests/usability-browser.cjs`,
`node tests/sauvegarde-browser.cjs`, `node tests/etat-plan-browser.cjs`,
`node tests/zoom-browser.cjs`, `node tests/grille-moteur-browser.cjs`
(Playwright / Chromium). Ils se rejouent **tous** : un parcours laissé de côté
est une régression qui passe.
