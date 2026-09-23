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

Le fil « Par où commencer », sous les onglets, donne l’étape suivante. Dans
l’ordre :

1. **Vols** (Réglages › Données) : importer un CSV simplifié, ou garder le jeu
   de démonstration. Le nom du jeu et le nombre de départs/retours restent
   visibles en haut de page.
2. **Plan** : tracer ou confirmer les services (« Éditer les zones »).
3. **Ateliers** : décrire, service par service, les équipes (personnes, horaire,
   pauses), ce qu’elles fabriquent (compagnie × classe, dans l’ordre), les
   plonges (tunnels, débits) et les mises à disposition.
4. **Flux** : relier les services ; le parcours des classes se lit dans ce graphe.
5. **Barème** (Réglages) : homme-minutes par unité et par service, rendement,
   régime de poste, délai de chargement et décalage des vols.

La journée est **calculée d’un coup** par `moteur/production.js` et
**recalculée à chaque modification** : aucun réglage ne se verrouille.

- **Simulation** : relit la journée calculée. « ▶ Lire », « ⏭ Pas » (saute au
  prochain changement), « ↺ Début » et un curseur de temps qui va dans les deux
  sens. Le plan montre quatre états par service : au travail, attend un amont
  (pointillé), a fini, pas commencé. Au début de la journée, il montre plutôt
  ce qui reste à décrire.
- **Vols** : chaque départ, suivi classe par classe ; une classe qu’aucun
  atelier ne fabrique est dite « Non fabriqué ».
- **Exporter** : la journée calculée — départs, classes, journal des lots.

## Lire les indicateurs

- **Échéances tenues** : parmi les classes dont l’échéance est **déjà passée**
  à l’instant relu, celles sorties à temps. Avant la première échéance : « — ».
- **Échéance dépassée** : classes dont l’échéance est passée et qui ne sont pas
  encore sorties.
- **Au travail** / **En attente** : services qui fabriquent, et services
  ouverts dont l’amont n’a pas encore livré.
- **Point d’attention** : le poste qui attend son amont depuis le plus
  longtemps à cet instant, et, sur la journée, celui qui a le plus attendu.
  Pour un service choisi : ses équipes et ses lots avec leurs heures.
- **La journée calculée** : classes à l’heure, retard le plus long, dernière
  sortie, attente cumulée, homme-heures, classes sans atelier.

L’échéance vaut départ moins délai de chargement. Ces états concernent la
production ; ils ne mesurent pas le retard avion.

**Scénarios A/B** (Réglages › Comparer deux scénarios). La journée étant déjà
calculée, une capture **fige** les réglages et leurs résultats. Changez un
atelier, le barème ou un horaire, capturez B : le tableau sépare les réglages
des résultats, fait ressortir les lignes qui diffèrent et écrit, sur chaque
résultat, « mieux » ou « moins bien ». Le calcul n’a aucun aléa : réglages
identiques ⇒ chiffres identiques, et la note le dit. Un nouveau programme de
vols efface les captures.

## Import CSV simplifié

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
  tant que l’étude de l’unité n’est pas importée.
- Calcul **sans aléa** : pas de panne, d’absence ni de retard de livraison.
- Un seul compte de matériel propre, consommé et relavé ; les stocks de
  denrées, les trolleys et les transferts physiques ne sont pas modélisés.
- Les compétences ne sont pas modélisées : une personne ne va pas aider dans
  un autre atelier.
- L’export Winrest (XLSX, lignes de prestations) n’est pas encore lu.

L’ancien moteur de démonstration (`moteur/orly.js`, `ressources.js`,
`mesure.js`, `procede.js`) a été **retiré le 23 septembre 2026** : la vue
Simulation relit désormais le modèle par ateliers, qui porte seul le calcul.
L’[étude des moteurs](docs/ETUDE_OPEN_SOURCE.md) et le
[guide du procédé](docs/PROCEDE.md) restent pour mémoire. Les données réelles
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
| `interface.css` | Disposition, hiérarchie visuelle et adaptations mobile |
| `sim.js` | Interface, plan, interactions, glue entre les centres |
| **`moteur/production.js`** | **Modèle par ateliers de travail** — compagnie × classe, lots ordonnés, robot, plonge, parcours lu des flux. Voir [la note de modèle](docs/MODELE_ATELIERS.md) |
| `moteur/noyau.js` | Noyau à événements discrets sur lequel tourne le modèle par ateliers |
| `replay.js` / `simulation.js` | Relecture de la journée calculée : états à l’instant t, vue Simulation |
| `comparaison.js` | Scénarios A/B : capture, tableau, verdict par ligne |
| `vols-demo.js` | Programme de vols **fictif** de démonstration |
| `plan-editor.js` / `editor.css` | Dessin, annotations, historique et sauvegarde du plan |
| `ui-model.js` | Import CSV et échappement, testables |
| `flow-center.js` / `flow-center.css` | Réseau configurable, règles humaines, onglet et affichage des flux |
| `ateliers.js` / `ateliers.css` | Onglet « Ateliers de travail » : saisie, planning, couverture par classe |
| `reglages.js` / `reglages.css` | Centre des réglages : barème, rendement, régime de poste |
| `demarrage.js` / `demarrage.css` | Fil « Par où commencer » |
| `plan-prive/` | Fond de plan **local, non versionné** (voir ci-dessous) |
| `tests/ui-model.test.cjs` | Régressions de l’import CSV |
| `tests/noyau.test.cjs` | Régressions du noyau : ordre, horloge, conditions, interruptions, erreurs |
| `tests/production.test.cjs` | Régressions du modèle par ateliers : enchaînement des lots, attente des amonts, robot, pauses, validation |
| `tests/replay.test.cjs` | Relecture : états d’un service, ponctualité à l’instant t, pas suivant |
| `tests/comparaison.test.cjs` | Scénarios A/B : capture, déterminisme, verdicts, jeu de démonstration |
| `tests/browser-smoke.cjs` | Parcours dans Chromium : relecture, vols, import, export, thèmes, mobile |
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
