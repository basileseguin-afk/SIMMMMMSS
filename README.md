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

**Deux versions.** La racine est la version 1, stable. `v2/index.html` (en
ligne : `…/v2/`) est la version 2, en construction : une copie complète qui
reçoit les nouveautés (coûts de la main-d’œuvre et des retards, heures sup,
aléas, optimisation). Ses données restent à part ; à la première ouverture,
elle part d’une copie de votre travail. Voir [docs/V2.md](docs/V2.md).

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
rangées dans l’ordre du travail, **un sujet chacune** (refonte du 05/10) :
les vols, par où passe chaque commande, qui la prépare, la simulation, ce que
la journée donne. Une page ne mélange jamais deux sujets, et deux pages n’ont
jamais un nom qui se ressemble.

L’en-tête garde, sur une ligne, l’accueil, les cinq parties et la
**Sauvegarde**. Dans une partie, ses pages sont des **onglets** : un seul est
affiché ; un nombre sur un onglet dit qu’il y a quelque chose à y faire. Les
pages principales d’abord ; les **outils fins** du sujet (ceux qu’on ouvre
rarement) suivent, en plus petit, après la mention **« Plus »** — il n’y a plus
de partie cachée « Outils avancés ». La
dernière page ouverte de chaque partie est retenue ; les outils de la page
(annuler, rétablir, exporter, importer) se rangent à droite des onglets, et
chaque export dit ce qu’il contient.

**Le vocabulaire.** Chaque vol **commande** ses repas : une **commande** par
compagnie et par classe (« AF · Business », 88 passagers), pour la journée.
Chaque chiffre dit son unité (vols, commandes, services) et son moment (« à
07:00 », « sur toute la journée »). Ce qui n’est pas encore rempli est gris ;
le rouge ne sert qu’aux retards.

1. **Vols** — ce qu’on importe.
   - *Programme des vols* : importer le programme en Excel ou CSV simplifié, ou garder les
     vols d’exemple ; d’où viennent les vols est dit en tête.
   - *Planche retour* : quand chaque vol revient à l’unité, pour la plonge.
2. **Chemins** — par où passe chaque commande.
   - *Vue d’ensemble* : tous les chemins d’un coup d’œil, comme un plan de
     métro. Une colonne par flux (puis les variantes et les chemins à part),
     avec sa couleur, ses commandes et ses classes ; une ligne par service,
     rangée par **étape** de haut en bas ; une pastille là où le chemin passe,
     reliées par un trait de sa couleur. Une pastille ouvre le flux sur ce
     service (sa chaîne éclairée) ; une case vide (+) y fait passer le chemin,
     à sa place ; le nom d’un service ouvre sa fiche.
   - **Les diagrammes en étapes** (flux, chemin d’une commande, liens) : de
     haut en bas, une bande numérotée par étape. La **chaîne principale**
     (la plus longue) descend **tout droit** ; les branches se rangent de part
     et d’autre, juste au-dessus du service qu’elles livrent (plonge →
     dotation → montage). Les traits vont **à angle droit**, comme un plan de
     métro, et chacun arrive **à sa place** sur le bord du service (un trait
     qui descend tout droit garde le milieu). Un lien qui saute des étapes
     passe par un couloir droit sur le côté ; dans une boucle (le matériel :
     quais → plonge → … → quais), seul le vrai retour remonte, par la droite.
     Un service relié à rien se met à part (« Sans lien ») ; le « + » pour
     relier n’apparaît qu’au survol ; le diagramme tient dans la largeur de
     l’écran. **Survoler (ou choisir) un
     service éclaire sa chaîne** — ce qui y mène et ce qui en part — et pâlit
     le reste. « → En ligne » revient à la disposition de gauche à droite (le
     choix est retenu, chaque sens garde sa propre disposition).
   - *Flux de production* : un flux par type de production (Économie,
     Business…), partagé par ses commandes. À gauche les flux et leurs
     variantes ; à droite, **par où passe** celui qu'on choisit (un diagramme :
     on tire une flèche d’un service à l’autre, on ajoute ou retire un service)
     et **qui le suit** : les classes (une case par classe, qui se coche et
     se décoche), puis les exceptions en clair (« TX · Économie suit … »),
     chacune avec son bouton pour revenir en arrière, et une liste pour faire
     suivre ce flux à une autre commande. Une commande qui
     s’écarte du flux de sa classe suit une variante (« Sans cuisine + Robot
     sans Montage »), partagée par celles qui s’écartent pareil. « Regrouper »
     range d’un clic les commandes qui avaient chacune leur chemin.
   - *Chemin d’une commande* : son chemin de bout en bout. Si elle suit un
     flux partagé, un bandeau le dit (« AF · Business suit le flux
     « Complet », comme 12 autres commandes ») avec deux gestes : **Modifier
     ce flux** (ouvre Flux de production, pour toutes ses commandes) ou
     **lui faire sa variante** (une copie à elle, modifiable sur place). Le
     diagramme montre, sur chaque service, l’équipe qui la prépare ; un clic
     sur un service, puis « Ouvrir le service → », mène à sa fiche. Le
     diagramme d’un flux garde la même disposition ici et dans Flux de
     production.
     Les trois pages se répondent : la fiche d’un service liste les **flux
     qui y passent** (un clic ouvre le flux) ; dans une équipe, chaque
     commande de « Dans l’ordre » ouvre son chemin sur ce service ; un flux
     propose « Voir le chemin d’une de ses commandes » et, sur un service
     choisi, « Ses équipes → ».
     Une commande peut aussi avoir son **chemin à elle** (« Complet TX BC »),
     créé à la main — vide, copié d’un modèle, ou copié du chemin d’une autre
     commande — puis « Dupliquer pour… » d’autres commandes. À gauche la liste des
     commandes, au centre le chemin **en diagramme de nœuds** : on tire le `+`
     d’un service jusqu’à un autre (ou on clique le `+`, puis l’autre) pour dire
     qu’il le livre ; un lien ne vaut que pour ce chemin. **Chaque nœud porte
     une case** : l’équipe qui y prépare la commande, avec son nom, ses
     personnes, son heure et ses man-minutes (celles de l’import, modifiables
     pour la case). Une case se partage : « TX BC/PC » en cuisine prépare TX BC
     puis TX PC, et le chemin de TX BC n’attend que la ligne de TX BC. Une
     commande sans chemin suit le modèle de sa classe.
   - **Plus ›** *Liens entre services* : qui livre qui dans l’unité, dans le même diagramme
     de nœuds ; ces liens ne servent qu’aux commandes qui n’ont pas de chemin.
3. **Équipes** — qui prépare quoi, quand, en combien de temps : tout le
   paramétrage, **service par service**, pour quelqu’un qui connaît l’unité sans
   connaître le site.
   - *Services et équipes* : la liste des services à gauche (utilisés, avec
     un point orange s’il manque quelque chose ; pas utilisés), la **fiche**
     du service choisi à droite :
     1. *Ce qu’il fait* : des équipes préparent les commandes, un robot, il
        sert tout le monde (légumerie, magasin, réception), plonge, ou il
        charge les vols (handling) ;
     2. *Ses équipes* : pour chacune, son nom, son heure d’arrivée, le jour
        (du vol ou la veille), ses personnes, et une **grille à cocher**
        compagnies × classes : ce qu’elle prépare. L’ordre suit les départs
        (la plus pressée d’abord) ; un clic sur une compagnie ou une classe
        coche toute la ligne ou la colonne. Une commande ne se prépare qu’une
        fois par service : la cocher dans une autre équipe l’y déplace. Une
        case orange pointillée : la commande passe par ce service et personne
        ne l’y prépare. **À la chaîne** (ex. le Montage qui fait aussi la
        Prépa) se règle sous la grille de l’équipe, à la vue, et se voit
        partout en rose ⛓ : un badge sur l’équipe, une ligne dans la liste
        des services, un encadré dans les deux fiches (« Prépa + Montage, à la
        chaîne… »), un halo autour des deux services et un trait épais entre
        eux dans chaque diagramme (flux, commande, liens de l’unité), une barre
        rose au planning. Une ligne robot partagée a aussi son badge.
        **Par compagnie** (l’armement) : une case par compagnie, oui ou
        non, liée au handling — chaque compagnie dont le chemin passe par
        l’armement a sa case, avec ou sans vol, et le handling l’attend ;
        dans chaque chemin, c’est une branche à part, reliée seulement au
        handling (on arme un vol, pas une classe). Minutes par vol par compagnie.
        **⚡ Certains jours seulement** : une équipe peut ne travailler que
        si une compagnie a assez de vols (« ne travaille que si AF a au
        moins 6 vols ce jour-là ; sinon, ses commandes passent au Montage
        général », qui absorbe la charge — ou que ses personnes y viennent en
        renfort, ou aillent ailleurs) — une phrase à compléter dans sa fiche,
        un badge ⚡ qui dit si elle travaille aujourd’hui.
        « Plus de réglages » : l’ordre à la main, les pauses,
        les arrêts, les man-minutes propres, la
        ligne robot. Un service qui sert tout le monde se règle en une fiche
        (horaires, vagues) et une grille « Qui en a besoin ? » ; la plonge et
        le handling n’ont rien à cocher. **La plonge se règle sur l’arrivée
        des retours**, pas sur le départ des vols : chaque équipe de plonge
        travaille la veille, le jour même ou le lendemain de l’arrivée
        (J-1, J, J+1). Sa fiche met face à face les retours qui arrivent, heure
        par heure, et les équipes de plonge sur leur plage ; elle dit ce qui
        arrive entre deux équipes (et qui le reprend) et ce qui arrive après
        la dernière (et reste sale) ;
     3. *Minutes de travail pour un vol* : le barème du service.
     Créer un service (un nom, près de quel service du plan), le renommer, le
     voir ou le déplacer sur le plan, le supprimer : tout se fait ici. **La
     grille ne change pas le flux d’elle-même** : cocher une commande dans un
     service que son flux ne traverse pas demande s’il faut l’ajouter à tout
     le flux, seulement pour cette commande (une variante), ou ne rien
     changer ; le service se place alors entre ceux qui le livrent et ceux
     qu’il livre (d’après les autres flux, les modèles types, puis les liens
     de l’unité ; une salle annexe se place comme son service).
   - *Horaires des équipes* et *Minutes de travail* : toutes les équipes (et
     leurs heures), toutes les minutes, d’un coup d’œil, modifiables sur place
     ou dans Excel. *Flux de production › Qui suit quel chemin* : chaque
     compagnie × classe et la liste de tous les chemins (flux, variantes,
     chemins créés de toutes pièces) ; la même liste « Chemin suivi » en tête
     de *Chemin d’une commande*. *Minutes de travail* se lit par compagnie : un bloc
     chacune, sa ligne en tête est son total (la somme de ses classes,
     service par service, et l’armement, réglé là) ; un clic la déplie sur
     ses classes (« Tout déplier / Tout replier »). Première colonne et total
     de la journée restent visibles au défilement.
   - **Plus ›** *Liste des services* : un service par ligne — son nom (qui se change ici), ses
     équipes, les commandes qui y passent et ce qui lui manque, en tête de liste.
     « + Une équipe » crée une case dans ce service et l’ouvre ; « Voir sur le
     plan » ; « Modifier le plan de l’unité » pour la forme et la place.
     En dessous : les zones dessinées qui ne sont pas des services (des
     « locaux »), avec « En faire un service », et les équipes dont le service
     a disparu, à rattacher. Un service, c’est un service du plan ou une zone
     de production — masquée ou non sur le plan, elle est partout.
     Tout le cycle de vie d’un service se fait ici : **créer** (« Nouveau
     service » : un nom, un service de rattachement dont il reprend les liens) ;
     **renommer** (le champ du nom) ; **changer de rattachement** (« rattaché
     à ») ; **supprimer** un service créé (ses équipes et ses étapes de chemin
     passent dans son service de rattachement) ; **retirer** un service du plan
     d’origine, qui sort des listes, des liens, du calcul et du plan, puis le
     **remettre** (« Services retirés de l’unité », en bas de page).
   - **Plus ›** *Équipes une par une* : chaque case avec ses commandes dans l’ordre, qui mènent à leur
     chemin ; « + Case hors chemin » pour une plonge ou une mise à disposition
     qui sert tout le monde. La **légumerie, le magasin et la réception**
     ont **une seule case, partagée**, qui sert toutes les commandes à la
     fois **par vagues** (ex. J-1 14:00, puis J 04:00) : chaque commande prend
     la vague qui précède son besoin. Sur chaque chemin, une seule question :
     « Besoin de Légumerie / Magasin / Réception ? ». Des cases d’avant, une par
     commande (qui préparent, ou déjà en mise à disposition), se fondent en
     une d’elles-mêmes à l’ouverture et à l’import — « Annuler » revient en
     arrière : leurs heures deviennent ses vagues. Une case **Handling (par vol)** ne prépare pas de
     commande : elle réunit les classes d’un même vol et le charge,
     strictement dans l’ordre des départs, avec une durée par compagnie, un
     nombre de vols en même temps et une heure au plus tôt (« pas avant 3 h
     avant le départ »). Il travaille le jour J des vols, jamais la veille. Ajouter le handling à un chemin crée cette case, une
     seule pour toutes les commandes. Plus simple : **Résultats › Vols prêts au départ ›
     « Mettre en place le handling »** crée la case et l’ajoute au bout de
     tous les chemins d’un coup ; le même bandeau dit ensuite combien de vols
     sont chargés à l’heure et ouvre la fiche (« Régler le handling »). Des cases de handling d’avant, une par
     commande, sont signalées (Départs, et points à regarder de
     l’Organisation) : « Passer au handling par vol » les fond en une seule. Les commandes doivent être au handling
     au départ moins le délai de chargement ; le vol doit être chargé à son
     départ.
   - **Plus ›** *Barème par service* : les minutes d’un vol, service par service et classe
     par classe (une valeur commune, des valeurs propres à une compagnie, ou une
     grille compagnie par classe).
4. **Simulation** — vérifier, régler, lancer.
   - *Prêt à simuler ?* : ce qu’il reste à faire avant de simuler, dans l’ordre
     (vols, services et équipes, commandes que personne ne prépare, réglages,
     résultats) ; chaque point mène là où il se règle, chaque service à sa
     fiche.
   - *Réglages de la simulation* : ce qu’on essaie, sur une seule page.
     - *Horaires des vols* : décaler tous les vols ; « repas prêts combien de
     minutes avant le départ ? ».
     - *Retours des vols à la plonge* : d’où ils viennent — les lignes
     « retour » du programme, chaque départ le lendemain (J+1), ou la planche
     retour du handling ; le délai après atterrissage ; la boucle du matériel.
     « ⇄ Comparer J+1 et planche retour » calcule les deux et les met côte à
     côte dans Résultats › Comparer.
     - *Rythme et pauses* : rythme de travail, pauses et temps de présence.
   - **Plus ›** *Contrôles détaillés* : ce que le calcul comprend de l’organisation, et ce qu’il faut
     corriger ; un service sans équipe s’y corrige d’un clic (« + Une équipe
     dans… »).
5. **Résultats** — ce que la journée donne.
   - *Synthèse* : la journée entière en tuiles (commandes à l’heure, retards,
     dernière commande prête, attentes, travail fourni) ; « Exporter les
     résultats ».
   - *Le plan rejoué* : rejouer la journée sur le plan de l’unité, avec les
     chiffres de l’instant, « En ce moment » à droite et, au-dessus des
     services, ce qui attend en stock ou à laver. Le plan des services se
     modifie d’ici (« Modifier le plan »).
   - *Planning des équipes* : case par case, qui travaille quand.
   - *Heure de chaque commande* : chaque commande, prête à quelle heure, avant quand.
   - *Étapes de chaque commande* : une ligne par commande, un clic sur « Prête à »
     la déplie dans le temps ; en dessous, le tableau calculé, une ligne par commande, une
     colonne par service, la case et ses heures dans chaque cellule ; un clic
     ouvre le chemin de la commande sur ce service.
   - *Vols prêts au départ* : une frise de la journée et un tableau qui dit, vol par vol, si
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

**Effectif calculé ou constant.** Dans un service calculé, le nombre de
personnes d'une équipe se déduit de son travail : minutes par vol × vols de
chaque compagnie qu'elle prépare, divisé par les minutes travaillées de son
poste (pauses déduites), arrondi au-dessus ; la journée se joue ensuite avec
cet effectif. La case **« Effectif constant »** de la fiche du service rend
la saisie à la main ; chaque équipe peut faire autrement que son service, avec
son choix **« Effectif »** (comme le service, dépend des vols, constant). Un
poste constant n'a **pas de minutes par vol** : ses commandes passent dans ses
heures de présence ; pour essayer un effectif sur un poste qui dépend des vols,
**« Effectif imposé (essai) »** applique les minutes par vol à l'effectif
saisi. Chaque service a aussi ses **superviseurs /
coordinateurs** : hors production, gardés pour le budget quotidien. Constants par défaut : CF départ food, magasin,
légumerie, duty free, appros. Le robot, la plonge, le handling et les mises à
disposition gardent toujours leur effectif saisi. Une mise à disposition (les
appros, le magasin…) a ses **personnes sur la journée** : 2 aux appros, ce sont
2 personnes en tout, une présence chacune ; elles comptent dans l'effectif du
jour et le budget, pas dans les durées. La plonge peut avoir des **équipes hors
tunnel** : constantes, ou calculées d'après leurs minutes par vol × les vols
qui reviennent.

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
| `theme.css` / `polices/` | L’habillage, posé en dernier : police Inter embarquée (licence OFL), couleurs, cartes, boutons, champs, en-tête |
| `unite.js` / `unite.css` | Prêt à simuler ?, Flux de production et Services et équipes : le pas à pas et la fiche de chaque service (équipes, grille à cocher, minutes) |
| `sim.js` | Interface, plan, interactions, glue entre les centres |
| **`moteur/production.js`** | **Modèle par ateliers de travail** — compagnie × classe, lots ordonnés, robot, plonge, parcours lu des flux. Voir [la note de modèle](docs/MODELE_ATELIERS.md) |
| `moteur/noyau.js` | Noyau à événements discrets sur lequel tourne le modèle par ateliers |
| `replay.js` / `simulation.js` | Relecture de la journée calculée : états à l’instant t, vue Simulation |
| `comparaison.js` | Scénarios A/B : capture, tableau, verdict par ligne |
| `vols-demo.js` | Programme de vols **fictif** de démonstration, sans QR ni DL ; il reçoit des vols d’essai pour chaque compagnie que l’unité prépare ou a ajoutée sans départ au programme (jamais un programme importé) |
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
| `onglets.js` | Le menu : les cinq parties et leurs pages (chacune est un sous-onglet d’une vue), les outils « Plus », la règle qui masque les autres, le clavier, la page retenue par partie |
| `rendu.js` | Redessiner sans perdre ce qu’on tape : tant qu’on écrit dans un champ, la zone qui le contient attend pour se redessiner ; elle le fait dès que le champ est validé (Entrée, quitté), le focus revenant au même champ. Posé une fois, à la source (`innerHTML`), pour tous les écrans |
| `icones.js` | Les pictogrammes (étapes, services, états) et les couleurs d’étape |
| `demarrage.css` | Ce que montre chaque vue (lecture de la journée seulement dans « La journée ») et couleurs du plan en lecture |
| `plan-prive/` | Fond de plan **local, non versionné** (voir ci-dessous) |
| `tests/ui-model.test.cjs` | Régressions de l’import CSV |
| `tests/noyau.test.cjs` | Régressions du noyau : ordre, horloge, conditions, interruptions, erreurs |
| `tests/grille-services.test.cjs` | Les flux de production et la grille des équipes : le flux d’une classe naît au premier coche, cocher renvoie ce que le flux ne traverse pas, « tout le flux » (s’intercale, sans raccourci), « seulement pour cette commande » (une variante partagée, nommée par son écart, retirée quand plus personne ne la suit), une équipe par service, l’ordre des départs, les liens de l’unité sans boucle, une salle annexe, regrouper les chemins identiques (le calcul voit les mêmes chemins), le calcul |
| `tests/production.test.cjs` | Régressions du modèle par ateliers : enchaînement des lots, attente des amonts, robot, pauses, validation |
| `tests/effectif-calcule.test.cjs` | L’effectif calculé dans le moteur (v1 et v2) : minutes du poste (pauses fixes et de régime), plus petit effectif qui tient (rendement, étape à la chaîne), suit le nombre de vols de chaque compagnie, minutes propres à la case, robot et services constants non touchés, équipe sans commande ; poste constant sans minutes (temps nul, sans alerte de barème) ; effectif imposé (essai) ; choix par équipe |
| `tests/regime.test.cjs` | La règle de poste (v1 et v2) : 8 h de présence dont 1 h de pause par défaut (3 h, 15 min, 3 h, 45 min, 1 h) ; une sauvegarde restée sur une règle par défaut d’avant y passe, une règle réglée à la main reste |
| `tests/replay.test.cjs` | Relecture : états d’un service, ponctualité à l’instant t, pas suivant |
| `tests/comparaison.test.cjs` | Scénarios A/B : capture, déterminisme, verdicts, jeu de démonstration |
| `tests/parcours.test.cjs` | Parcours : graphe de nœuds et de liens, conversion des branches, boucle refusée, chemins parallèles, jonction, étape enjambée, hors parcours, boucle ; tableau « Qui prépare quoi », choisir une équipe, remplir, suivi dans le temps |
| `tests/tableur.test.cjs` | Classeurs Excel : aller-retour, fichier compressé d’un autre logiciel, CSV |
| `tests/echanges.test.cjs` | Les trois classeurs : aller-retour, ajouts, erreurs regroupées |
| `tests/excel-browser.cjs` | Chemins et tableau « Qui prépare quoi » dans l’interface, classeurs ateliers et vols de bout en bout |
| `tests/menu-browser.cjs` | L’accueil (tuiles, états, « à faire ensuite »), le menu à cinq parties (Vols, Chemins, Équipes, Simulation, Résultats), les onglets « Plus » de chaque partie, la nature de chaque page, les outils qui suivent la page, clavier, page retenue, sauvegarde, menu verrouillé pendant l’édition du plan, hauteur des bandeaux, écran de 1 024 px |
| `tests/liaisons-browser.cjs` | Une donnée, partout la même : barème, récap des man-minutes, récap des cases, fiches, chemin, « Qui prépare quoi », calcul, Excel, renommage, Annuler — changée à un endroit, vérifiée à tous les autres |
| `tests/fantome-browser.cjs` | Un service qu'on ne retrouve pas : « Armement » sans équipe, ses salles au travail — la note des Contrôles et « Supprimer », la recherche, les salles qui gardent ses liens, un service supprimé encore cité (« Effacer partout », « Passer dans… », « Remettre ») |
| `tests/boutique-browser.cjs` | La légumerie comme une boutique : d'un clic depuis les vagues, fermée la cuisine attend l'ouverture, les heures dans le récap des cases et « Qui prépare quoi », Annuler |
| `tests/plonge-vol-browser.cjs` | La plonge par vol : une ligne par compagnie des vols revenus, un vol par tunnel qui tourne, au temps de sa compagnie ; retour au débit |
| `tests/ajout-cie-browser.cjs` | Ajouter une compagnie et ses classes d'un coup depuis les chemins, la classe qui manque à une compagnie existante, une compagnie dans le tableau du handling |
| `tests/planche-browser.cjs` | Vols › Planche retour : saisir une ligne, export Excel modifié puis réimporté, classeur faux refusé, « Utiliser la planche retour », les réglages de la simulation (J+1, délai), rechargement, « ⇄ Comparer J+1 et planche retour » |
| `tests/lisibilite-browser.cjs` | Ce qui se lisait mal : message qui s’efface, heures du planning espacées (jour écrit une fois), cause d’une commande pas finie, « en retard » ≠ « pas finie », durées en heures, horloge « J 00:00 », Contrôles (à corriger / ce que la journée montre, badge) |
| `tests/robot-ligne-browser.cjs` | La ligne robot : matin et après-midi sur une seule ligne (l’après-midi attend), arrêt 12:15–13:00 valable pour les deux équipes, second robot à sa propre ligne, récap, rechargement |
| `tests/mon-unite-browser.cjs` | Le menu à cinq parties (Chemins s’ouvre sur les flux, Simulation sur « Prêt à simuler ? »), le pas à pas, un service ouvert depuis lui, deux équipes, toute une ligne / une colonne cochée sans rien prendre à l’autre équipe, l’ordre des départs, une commande déplacée, l’heure tapée et les personnes, décocher sort le service du chemin, les minutes dans la fiche, « Qui en a besoin ? » de la légumerie, un nouveau service placé dans le chemin, le calcul, les outils « Plus » des Équipes, rechargement |
| `tests/fusion-browser.cjs` | Deux étapes à la chaîne : « Montage AF » fait aussi la Prépa depuis sa fiche, AF quitte la case de la Prépa, durée à 1 et 2 personnes, récap, « Qui prépare quoi », chemin, fusion visible (halos et trait dans le diagramme, liste et fiches des services, badge et réglage de l’équipe, planning), retour à deux cases, rechargement |
| `tests/condition-browser.cjs` | Règle ⚡ (v1 et v2) : bouton, phrase pré-remplie pour aujourd’hui, seuil au-dessus des vols du jour → l’équipe ne travaille pas, ses commandes et sa personne passent au montage général (badge, constat, calcul), repas, retrait, équipe seule dans son service |
| `tests/flux-retrait-browser.cjs` | Retirer un service d’un flux ou un atelier d’un chemin (v1 et v2) : ses équipes lâchent les commandes, cases hors flux non cochables, « Faire passer un flux par ici », ancienne saisie signalée et retirée en un clic |
| `tests/chaine-services-browser.cjs` | Équipe à la chaîne (v1 et v2) : présente et modifiable dans ses deux services (Prépa et Montage), retirée de la Prépa quand elle n’est plus à la chaîne |
| `tests/categories-browser.cjs` | Armement par compagnie, lié au handling (v1 et v2) : la fiche le propose ; sans chemin, pas de case ; intégré aux chemins, chaque compagnie a sa case, cochable — FWI absente de la liste du handling, EZY ajoutée sans vol ; minutes par vol ; une colonne ; calcul ; le handling attend l’armement ; « Le retirer des flux » ; retour aux commandes |
| `tests/armement-chemins-browser.cjs` | Armement intégré à tous les chemins, relié seulement au handling (v1 et v2) : migration au chargement (par compagnie, cases reprises, branche à part dans chaque chemin, sorti du milieu d’un chemin), pas de trou, le handling attend l’armement, bouton pour un nouveau chemin, « Annuler », une seule fois |
| `tests/liste-commandes-browser.cjs` | Liste des commandes (Chemin d’une commande, v1 et v2) : la recherche n’est pas recouverte, la liste défile seule, un clic en bas de liste ne la ramène pas en haut, une commande ouverte d’ailleurs est amenée en vue |
| `tests/jeu-essai.test.cjs` | Jeu de démonstration (v1 et v2) : ni QR ni DL, 12 départs et 6 retours ; compagnies utilisées ; vols d’essai avec les seules classes préparées |
| `tests/jeu-essai-browser.cjs` | Jeu d’essai dans le site (v1 et v2) : QR et DL retirées d’un état enregistré (une fois), vols d’essai pour EZY, RAM, DAH et leur case d’armement, une compagnie cochée reçoit ses vols sans recharger |
| `tests/vols-fixture.cjs` | Programme figé (l’ancien jeu, fictif) pour les tests d’échanges Excel |
| `tests/saisie-heure-browser.cjs` | Taper une heure touche par touche (Récap des cases, fiche d’une case) : rien n’est arraché, Entrée ou quitter le champ enregistre, le tableau garde son défilement |
| `tests/secours-browser.cjs` | Un démarrage resté en plan ouvre la page de secours ; elle rend les données en sauvegarde, repart sans les cases, puis les remet |
| `tests/recap-cases-browser.cjs` | Récap des cases : une ligne par case, tâche unique / à la suite / ensemble, départ et jour modifiables, chercher, fichier de paramétrage exporté puis réimporté |
| `tests/robot-browser.cjs` | Le Robot : service créé et rattaché au Montage, remplace le Montage sur TX, CRL et FBU Économie (une fois), une case Robot, plateaux ÷ débit, débit et effectif dans le récap et la fiche |
| `tests/recap.test.cjs` | Récap des man-minutes : d’où vient chaque valeur, totaux, fichier de paramétrage (aller-retour sans changement, grosses modifications, erreurs), ligne récap par compagnie (armement) |
| `tests/recap-browser.cjs` | Équipes › Minutes de travail : une ligne par commande, modifier / vider une case, sur la journée, chercher, export puis import |
| `tests/recap-compagnie-browser.cjs` | Minutes de travail et armement (v1 et v2) : un bloc par compagnie, sa ligne total en tête (somme de ses classes), classes repliables, minutes par vol modifiables (reliées à la fiche de l’armement), retour à la valeur commune, effectif, Annuler, sur la journée, recherche |
| `tests/chemin-choisi.test.cjs` | Choisir le chemin d’une commande (v1 et v2) : liste des chemins, flux choisi, retour au flux de sa classe, chemin à part qui devient partagé |
| `tests/chemin-choisi-browser.cjs` | Le chemin d’une commande dans une liste (v1 et v2) : « Qui suit quel chemin » (Flux de production) et « Chemin suivi » (Chemin d’une commande) ; un flux créé de toutes pièces se choisit, le calcul le suit ; un chemin à part choisi devient partagé, et c’est dit |
| `tests/vue-ensemble-browser.cjs` | Chemins lisibles avec beaucoup de services (v1 et v2) : Vue d’ensemble (une colonne par flux, une ligne par service par étape, pastilles, case vide qui fait passer un flux puis Annuler, pastille qui ouvre le flux sur ce service), diagramme en étapes (de haut en bas, bandes, sans défilement de côté), chaîne éclairée au survol, « En ligne » retenu pour tous les diagrammes |
| `tests/defilement-browser.cjs` | La page entière ne défile jamais, seule la vue (v1 et v2) : fiche Plonge avec son équipe, molette sur la fiche puis sur l’en-tête (qui reste en place), jamais bloqué en bas : descendu sur la fiche, on remonte la souris sur la liste de gauche (Services et équipes, Chemin d’une commande), la Liste des services et chaque service de Services et équipes, toutes les pages du menu, chaque fiche de service |
| `tests/plonge-jour-browser.cjs` | La plonge se règle sur l’arrivée des retours (v1 et v2) : veille / jour / lendemain de l’arrivée, frise des retours face aux équipes, ce qui arrive sans personne, une équipe J+1 qui lave le soir (rien ne reste sale), tableau des horaires, rechargement |
| `tests/saisie-browser.cjs` | Ce qu’on tape n’est jamais perdu (v1 et v2) : un rendu arrive au milieu de la saisie d’une heure, de personnes, de minutes par vol — il attend, rien ne se perd, et tout est retenu à la validation ; un champ validé montre la valeur retenue (bornée) ; rechargement |
| `tests/cf-depart-browser.cjs` | CF départ food n’est pas le handling (v1 et v2) : un service à équipes (les checkeurs, à heures fixes) ; un handling rangé dans sa zone passe dans son service à lui, avec ses réglages et sa place dans les chemins ; « Mettre en place le handling » le vise, jamais CF départ food ; rechargement |
| `tests/effectif-browser.cjs` | L’effectif calculé (v1 et v2) : une équipe de cuisine montre son effectif, homme-minutes ÷ poste arrondi au-dessus, qui suit les commandes cochées ; Minutes de travail le montre sans le faire saisir ; « Effectif constant » rend la saisie (gardée au rechargement), décoché le calcul reprend ; CF départ food, magasin, légumerie, duty free, appros constants par défaut ; une mise à disposition (les appros) a ses personnes sur la journée (2 × 8 h dont 1 h de pause : 16 h de présence, 14 h de travail), jamais calculées ; la plonge a ses équipes hors tunnel, calculées d’après les vols qui reviennent (minutes par vol) ou saisies ; une équipe constante dans un service calculé (« Effectif ») retrouve son effectif saisi, puis revient au service ; superviseurs de CF départ food (sans effet sur la journée, gardés au rechargement) ; un poste constant sans minutes par vol (fiche, temps nul, pas de colonne dans Minutes de travail) ; « Effectif imposé (essai) » : durée = homme-minutes ÷ effectif saisi |
| `tests/seuils-browser.cjs` | Le minimum de personnes pour qu’un tunnel ou le robot tourne (v1 et v2) : « Minimum pour tourner » à la vue, tunnel « à l’arrêt : pas assez de monde » puis « tourne », robot à l’arrêt (badge, rien ne sort) puis qui tourne |
| `tests/sans-flux-browser.cjs` | Une équipe dans un service où aucun flux ne passe (CF départ food, Duty free ; v1 et v2) : grille grisée, le site dit pourquoi ; « Faire passer tous les flux par ici » la débloque ; la commande cochée passe sans minutes (poste constant) |
| `tests/service-autonome-browser.cjs` | Un service à part entière créé depuis le site (v1 et v2), « Roulés couverts » : rangé comme Prépa ou Dotation, sans minutes ni liens hérités ; flux, équipe, minutes, calcul, tableau des minutes, planning, Excel, rechargement ; rattacher / détacher ; la salle de plus reste un choix |
| `tests/armement-integre-browser.cjs` | « L’intégrer à tous les chemins » seulement s’il y a à faire (v1 et v2) : chemins suivis par les commandes seulement, un lien vers un handling suffit, sinon le chemin à reprendre est nommé avec la raison ; un clic le remet en ordre |
| `tests/coherence.test.cjs` | Audit des flux (v1 et v2) : une case cochée hors du chemin de sa commande n’y est pas préparée, et c’est dit ; un vol ne part pas avec son seul armement |
| `tests/coherence-browser.cjs` | Audit des flux dans le site (v1 et v2), sur des unités montées comme la vraie (handling, armement, chaîne, ⚡, chemin à elle, veille, robot) : chaque commande suit son chemin, le handling attend repas et armement, cases d’armement justes, compteurs, tableau des minutes = calcul, fiches cohérentes, messages lisibles ; l’audit voit une faute introduite exprès |
| `tests/vagues.test.cjs` | Mise à disposition par vagues : chaque commande prend la vague qui précède son besoin, attente avant la première |
| `tests/partage-browser.cjs` | Légumerie partagée : une case pour toutes les commandes, « Besoin de légumerie ? » sur le chemin, vagues dans le tableau, fusion des cases d’avant |
| `tests/handling.test.cjs` | Le handling par vol : classes d’un même vol réunies, ordre strict des départs, pas avant départ − X h, plusieurs quais, vol bloqué, poste fini, durée par compagnie, stocks devant le handling |
| `tests/handling-browser.cjs` | Le handling dans l’interface : une case partagée posée depuis un chemin, sa fiche, les départs « chargé à », la synthèse |
| `tests/services-browser.cjs` | Équipes › Liste des services : une ligne par service, « + Une équipe » (depuis la page, les contrôles, le plan), renommer, voir et modifier sur le plan, pas d’alerte pour une plonge ; cycle de vie : créer, doublon refusé, changer de rattachement, supprimer, retirer et remettre |
| `tests/nav.cjs` | Aide partagée des tests navigateur : aller à une page comme à la main (la partie, puis l’onglet) |
| `tests/icones.test.cjs` | Chaque service reconnaît son pictogramme |
| `tests/graphe.test.cjs` | Diagramme : colonnes, nœud au milieu de ses amonts, couloirs des longs liens, boucles, dispositions retenues |
| `tests/graphe-browser.cjs` | Diagrammes dans la page : tirer un trait, clavier, doublon et boucle refusés, équipe créée depuis un nœud, disposition retenue, liens de l’unité |
| `tests/onglets.test.cjs` | Le menu (v1 et v2) : chaque page dans une seule partie, un sujet par partie, les outils fins après « Plus » ; pages de chaque vue, identifiants uniques, règle de masquage, pictogrammes |
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
