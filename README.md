# ORY — Simulation des flux de production

Interface de travail pour explorer les ateliers d’une unité de catering aérien,
suivre les départs simulés et préparer des essais de capacité.

**Statut : prototype non calibré.** Le plan provient du fichier de l’unité ;
les vols embarqués et les calculs sont des exemples. Les résultats ne permettent
pas encore de dimensionner les équipes ou de prédire la ponctualité réelle.

## Ouvrir l’application

Ouvrir `index.html` dans un navigateur récent. Aucun serveur, aucune installation
et aucune dépendance réseau ne sont nécessaires à l’utilisation. Conserver les
fichiers JavaScript, CSS et le dossier `assets` à côté du HTML.

## 🌐 Ouvrir l'application depuis GitHub (sans rien télécharger)

Le dépôt est **public** et sa branche par défaut est la branche de travail :
**GitHub Pages** peut donc le servir tel quel. À activer une seule fois :

> **Settings** → **Pages** → *Build and deployment* → Source : **Deploy from a
> branch** → Branch : `claude/factory-management-system-b1e0am` → dossier
> `/ (root)` → **Save**. Le site est en ligne au bout d'une minute environ.

Ensuite, chaque `push` republie automatiquement. Les adresses :

| Application | Adresse |
|---|---|
| Simulateur des flux | `https://basileseguin-afk.github.io/SIMMMMMSS/` |
| Éditeur de postes de travail | `https://basileseguin-afk.github.io/SIMMMMMSS/postes/` |

Le fichier `.nojekyll` à la racine désactive le traitement Jekyll : les fichiers
sont servis tels quels.

**Sans activer Pages**, pour ouvrir un fichier ponctuellement, remplacez
`github.com` par `raw.githack.com` et `/blob/` par rien :
`https://raw.githack.com/basileseguin-afk/SIMMMMMSS/claude/factory-management-system-b1e0am/postes/index.html`
(service tiers, pratique pour un essai, pas pour un usage durable).

> ⚠️ **Le dépôt est public.** Le plan d'architecte de l'unité (`docs/MAP_ORY.xlsx`
> et `assets/plan/`) y est donc accessible à tous, et activer Pages le rend
> consultable dans un navigateur. À arbitrer : garder ainsi, rendre le dépôt
> privé (Pages devient alors payant), ou sortir le plan du dépôt.

## Parcours d’utilisation

1. **Données** : consulter les limites du moteur, télécharger le modèle CSV ou
   importer un fichier simplifié. Le nom du jeu et le nombre de départs/retours
   restent visibles en haut de page.
2. **Réglages** : préparer les effectifs simultanés, cadences et horaires avant
   de lancer. Une fois l’essai commencé, les paramètres sont verrouillés, même
   en pause. **Recommencer** libère les réglages et efface la progression après
   confirmation ; les instantanés restent disponibles.
3. **Plan / Suivi** : sélectionner un atelier depuis le plan, la liste Atelier
   ou les indicateurs. Les opérations actives apparaissent dans le détail.
4. **Suivi des vols** : rechercher un vol ou une compagnie, filtrer les dossiers
   non prêts ou dont l’échéance est dépassée, voir les opérations restantes.
5. **Exporter le résultat** : télécharger les données d’entrée, paramètres,
   indicateurs et instantanés avec le statut explicite de démonstration.

Le bouton Pause arrête le calcul. La vitesse est exprimée en minutes simulées
par seconde. Le moteur avance désormais par pas fixes de 30 secondes simulées,
sans dépendre du découpage des images du navigateur ; il reste un modèle simplifié.
Les déplacements de jetons sont illustratifs, sans valeur de temps de transfert.

## Lire les indicateurs

- **Prêts à l’échéance** : dossiers prêts à temps / départs dont l’échéance est
  atteinte. Avant la première échéance, la valeur est « — ». Un dossier
  inachevé à échéance dépassée reste dans le dénominateur.
- **Échéances dépassées · non prêts** : dossiers encore inachevés dont
  l’échéance est atteinte.
- **Travail en cours** : ordres de fabrication libérés et non terminés, en
  attente ou en traitement.
- **Débit robot** : débit instantané simulé, pas une mesure du site.
- **Retard courant des départs exigibles** : moyenne incluant les dossiers
  inachevés, dont le retard augmente jusqu’à leur fin.
- **Retard des dossiers terminés** : moyenne sur les dossiers terminés uniquement.
- **Pression par atelier** : indice indicatif hérité du démonstrateur ; il ne
  représente pas un taux d’occupation mesuré. Magasin, Duty free et handling
  n’ont pas de charge calculée et ne reçoivent plus d’activité artificielle.

L’échéance vaut départ simulé moins délai de chargement. Ces états concernent
la production ; ils ne constituent pas une mesure du retard avion.

Les instantanés A/B enregistrent l’heure, les données et la configuration. Ils
restent des photographies, pas deux simulations complètes comparables. Des
heures différentes sont signalées. Un changement de jeu efface les instantanés.

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

## Éditer les zones

**Éditer les zones** met la simulation en pause et ouvre le panneau dédié.
Les rectangles et polygones, poignées, tracés et exports JSON sont conservés.
Les coordonnées peuvent être saisies au clavier. **Terminer l’édition** revient
au suivi sans reprendre automatiquement le calcul.

Les positions sont enregistrées dans le navigateur. Exporter le JSON pour
partager les modifications. Un simple déplacement ne retire plus le statut
« emplacement à confirmer ». Les anciennes données enregistrées restent
compatibles ; leur statut ne prouve pas une validation terrain. Un import de
zones incorrect est refusé avant toute modification. Les zones restent des
annotations : elles ne déterminent ni une capacité de stockage ni un temps de trajet.

## Limites métier à traiter ensuite

- Cuisine J−2, prépa J−1 et exception CRL du soir produit le matin de J non intégrées.
- Le moteur utilise encore le robot pour tous les YC. La règle réelle limite
  son usage à l’économie FBU, TX/FWI et CRL ; les prestations exactes et SPML
  restent à préciser.
- Standards théoriques du classeur, effets de lot et non-linéarité non intégrés.
- Stocks, retours utilisables, compétences, pauses et transferts physiques incomplets.
- Les curseurs décrivent des personnes simultanées ; la convention heures / 7
  produit un équivalent de charge, pas une affectation de personnel.

La prochaine étape consiste à connecter une chaîne de calcul validée à cette
interface. Voir [l’audit d’usage](docs/AUDIT_INTERFACE.md), le
[registre des bugs](BUGS.md) et le
[journal des modifications](CHANGELOG.md). La
[feuille de route commune](docs/FEUILLE_DE_ROUTE.md) reste la référence du projet.

## Fichiers et vérification

| Fichier | Rôle |
|---|---|
| `index.html` | Structure et contrôles |
| `interface.css` | Disposition, hiérarchie visuelle et adaptations mobile |
| `sim.js` | Démonstrateur, plan, interactions et rendu |
| `ui-model.js` | Import CSV, calcul des états et règles de présentation testables |
| `assets/plan/` | Fond de plan existant |
| `tests/ui-model.test.cjs` | Régressions de l’import et des indicateurs |
| `tests/browser-smoke.cjs` | Parcours dans Chromium, export, édition et responsive |
| `BUGS.md` | Registre des bugs connus — à lire avant de coder, à compléter après chaque revue |
| `postes/` | Éditeur de postes de travail sur trame 50 cm (outil indépendant) |

Tests purs, avec Node : `node --test tests/ui-model.test.cjs`.

Tests navigateur, avec Playwright installé dans l’environnement de développement
et Chromium disponible : `node tests/browser-smoke.cjs`. La variable optionnelle
`CHROMIUM_EXECUTABLE_PATH` permet de choisir un exécutable Chromium existant.
Les captures de contrôle sont écrites dans le dossier temporaire du système.
Ces outils sont nécessaires uniquement aux tests, pas à l’application.
