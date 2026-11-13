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
elle part d’une copie de votre travail, et un bandeau discret dit la date de
cette copie, avec « Reprendre les données de la version 1 ». Voir [docs/V2.md](docs/V2.md).

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
dépôt. Plusieurs onglets ouverts ne s'écrasent pas : quand un autre onglet
enregistre, celui-ci le dit par un bandeau et n'enregistre plus rien tant qu'il
n'est pas rechargé (correction 14, [§ 11 du banc d'essai](docs/BANC_ESSAI.md)).

### Afficher le fond de plan

Créez un dossier `plan-prive/` à la racine et déposez-y les 12 tuiles nommées
`tuile1.png` … `tuile12.png`. Le fond apparaît alors automatiquement.

**Sans ce dossier, l'application fonctionne normalement** : les zones, la
simulation et les indicateurs sont inchangés, seul le fond d'architecte manque.
La case « Fond de plan » ne s'affiche alors pas (évolution 14) : elle n'apparaît
que si les tuiles sont là.
Aucun test ne dépend de ce dossier : celui qui a besoin d'un fond crée une
tuile fictive, hors du dépôt (`tests/plan-fictif.cjs`).

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

La **barre latérale** (refonte du 08/10) garde l’accueil, les cinq parties et,
à son pied, les **Problèmes**, la **Sauvegarde** et le passage à la version 2.
La partie ouverte **déplie ses pages** juste sous elle : une seule est
affichée ; un nombre sur une page compte les problèmes qui s’y règlent.

**Problèmes** est le seul compte de ce qui reste à faire (refonte du 09/10) :
il s’ouvre à côté de la barre et range chaque problème en trois niveaux — **à
corriger** (un point que le calcul refuse, un service supprimé encore cité),
**à compléter** (les étapes à faire de « Prêt à simuler ? »), **ce que la
journée montre** (retards, postes trop courts). Chacun mène à la page où il
se règle ; celui d’un service, à sa fiche. Les nombres des pages en dérivent. Les pages principales
d’abord ; les **outils fins** du sujet (ceux qu’on ouvre rarement) suivent, en
plus discret, après la mention **« Plus »** — il n’y a plus de partie cachée
« Outils avancés ». Toute page s’atteint en deux clics : sa partie, puis
elle. La dernière page ouverte de chaque partie est retenue.

La **barre du haut** dit où l’on est (le fil d’Ariane : la partie, qui mène à
sa première page, puis la page), que le **calcul est à jour** (il se refait à
chaque changement ; son point bat une fois quand il vient de suivre ; un clic
mène à la synthèse), ouvre **la palette « Aller à… »** et porte **un seul
Annuler / Rétablir**. La palette (**Ctrl K**, ⌘ K sur Mac) : quelques lettres,
sans accents ni majuscules, et elle propose une page, un service, une équipe,
une commande (« af eco » : AF · Économie) ou un geste (rejouer la journée,
annuler, les problèmes, le thème, exporter les résultats) ; les flèches
choisissent, Entrée ouvre, Échap ferme. La touche **?** (hors d’un champ)
ouvre la **fiche des raccourcis** ; sur le plan rejoué, **Espace** lit la
journée ou la met en pause. Les mouvements sont courts (une page qui arrive,
une fenêtre qui s’ouvre) et s’arrêtent quand le système demande de réduire
les animations. Annuler / Rétablir
agit sur ce que la page ouverte modifie (les cases, chemins et équipes ; le
barème ; les heures de travail ; les liens ; le plan pendant son édition).
**Ctrl Z** (⌘ Z) annule, **Ctrl Maj Z** ou **Ctrl Y** rétablit, hors d’un
champ de saisie, qui garde sa propre annulation. Ce qui vient de se passer
s’affiche en **notification**, en bas à droite, quelques secondes, avec
**« Annuler »** quand le geste se défait : supprimer une case, importer un
classeur, changer la nature d’un service se font sans question, et
s’annulent d’un clic. Une **question** du site reste pour ce qui ne se défait
pas : restaurer une sauvegarde, recharger la démo, supprimer un service qui
porte des équipes. Au pied de la barre latérale,
**Thème sombre** passe l’interface en sombre (le dessin du bâtiment aussi) :
une préférence de ce navigateur, qui ne touche à aucune donnée. Sous elle, une phrase dit ce
que la page montre, et ses outils (exporter, importer) se rangent à droite ;
chaque export dit ce qu’il contient. Pendant l’édition du plan, la barre
latérale se replie sur ses pictogrammes et attend qu’on la termine.

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
     le reste. Sur le diagramme, une barre flotte en haut à droite :
     « Ajouter un service », « Réorganiser » (les services se rangent
     d’eux-mêmes) et « → En ligne », qui revient à la disposition de gauche à
     droite (le choix est retenu, chaque sens garde sa propre disposition).
     Le service ou le lien choisi s’affiche au-dessus, avec ce qu’on peut en
     faire ; dans *Chemin d’une commande*, la case d’un service s’ouvre à
     droite, comme l’inspecteur du plan.
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
     personnes, son heure et ses heures de travail (celles du barème, modifiables
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
     du service choisi à droite — une feuille de propriétés dont chaque
     section se replie (le repli est gardé d’un service à l’autre) :
     1. *Ce qu’il fait* : des équipes préparent les commandes, un robot, il
        sert tout le monde (légumerie, magasin, réception), plonge, ou il
        charge les vols (handling) ;
     2. *Ses équipes* : pour chacune, son nom, son heure d’arrivée (en 24 h :
        « 0430 », « 4:30 » ou « 4h30 » ; un refus se lit sous le champ), le jour
        (du vol ou la veille), ses personnes (l’unité est dans le champ :
        « 3 pers. », « 120 pl/h », « 480 min »), et une **grille à cocher**
        compagnies × classes : ce qu’elle prépare — une matrice dont les
        compagnies et les classes restent à l’écran quand elle défile, la
        ligne et la colonne survolées s’éclairent, Espace coche au clavier.
        L’ordre suit les départs
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
        handling (on arme un vol, pas une classe). Heures par vol par compagnie.
        **⚡ Certains jours seulement** : une équipe peut ne travailler que
        si une compagnie a assez de vols (« ne travaille que si AF a au
        moins 6 vols ce jour-là ; sinon, ses commandes passent au Montage
        général », qui absorbe la charge — ou que ses personnes y viennent en
        renfort, ou aillent ailleurs) — une phrase à compléter dans « Plus de
        réglages », un badge ⚡ qui dit si elle travaille aujourd’hui.
        « Plus de réglages », replié : certains jours ⚡, l’ordre à la main,
        les pauses, les arrêts, les heures propres, la ligne robot ; sa ligne
        dit ce qui y est réglé (« ⚡ certains jours · 1 pause »). Un service qui sert tout le monde se règle en une fiche
        (horaires, vagues) et une grille « Qui en a besoin ? » ; la plonge et
        le handling n’ont rien à cocher. **La plonge se règle sur l’arrivée
        des retours**, pas sur le départ des vols : chaque équipe de plonge
        travaille la veille, le jour même ou le lendemain de l’arrivée
        (J-1, J, J+1). Sa fiche met face à face les retours qui arrivent, heure
        par heure, et les équipes de plonge sur leur plage ; elle dit ce qui
        arrive sans équipe (et qui le reprend), ce qui arrive après la
        dernière (et reste sale), et quand deux équipes se chevauchent.
        **« + Ajouter une équipe de plonge »** reste quand la plonge a déjà
        la sienne : l’équipe du matin ou du soir lave comme la première (même
        façon, mêmes tunnels, mêmes temps par vol), à ses heures, et se place
        d’elle-même au premier retour sans équipe. Les tunnels du même nom
        sont les mêmes machines : quand deux équipes se chevauchent, chacun ne
        lave qu’un vol à la fois ;
     3. *Heures de travail pour un vol* : le barème du service ;
     4. *Avancé*, replié : « Il travaille en même temps que… » et les
        superviseurs ; son titre dit ce qui y est réglé (« 1 réglage :
        2 superviseurs »).
     **Le travail se lit et se saisit en heures** d’une personne (0,25 h par
     vol = un quart d’heure), partout, Excel compris ; le calcul et les
     sauvegardes gardent les minutes. Les durées (handling, plonge, pauses)
     restent en minutes.
     Créer un service (un nom, près de quel service du plan), le renommer, le
     voir ou le déplacer sur le plan, le supprimer : tout se fait ici. **La
     grille ne change pas le flux d’elle-même** : cocher une commande dans un
     service que son flux ne traverse pas demande s’il faut l’ajouter à tout
     le flux, seulement pour cette commande (une variante), ou ne rien
     changer ; le service se place alors entre ceux qui le livrent et ceux
     qu’il livre (d’après les autres flux, les modèles types, puis les liens
     de l’unité ; une salle annexe se place comme son service).
   - *Horaires des équipes* et *Heures de travail* : toutes les équipes (et
     leurs horaires), tout le travail par vol, d’un coup d’œil, modifiables sur place
     ou dans Excel. *Flux de production › Qui suit quel chemin* : chaque
     compagnie × classe et la liste de tous les chemins (flux, variantes,
     chemins créés de toutes pièces) ; la même liste « Chemin suivi » en tête
     de *Chemin d’une commande*. *Heures de travail* se lit par compagnie : un bloc
     chacune, sa ligne en tête est son total (la somme de ses classes,
     service par service, et l’armement, réglé là) ; un clic la déplie sur
     ses classes (« Tout déplier / Tout replier »). Première colonne et total
     de la journée restent visibles au défilement ; dans *Horaires*, la case
     reste à gauche et son service en haut. **Au clavier**, dans ces tableaux
     comme dans le barème, la planche retour et les temps par compagnie :
     Entrée enregistre et descend à la ligne suivante (Maj+Entrée remonte),
     Tab avance ; les nombres s’alignent à droite.
   - *Plan de l’unité* : la place et la forme de chaque service, en pleine
     page : les calques à gauche (les zones rangées par type), le plan au
     centre avec sa barre d’outils, la zone choisie à droite. La page s’ouvre
     en édition ; « Terminer » ramène à la page d’où l’on venait.
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
     seule pour toutes les commandes. Plus simple : **Résultats › Détails › Vols ›
     « Mettre en place le handling »** crée la case et l’ajoute au bout de
     tous les chemins d’un coup ; le même bandeau dit ensuite combien de vols
     sont chargés à l’heure et ouvre la fiche (« Régler le handling »). Des cases de handling d’avant, une par
     commande, sont signalées (Départs, et points à regarder de
     l’Organisation) : « Passer au handling par vol » les fond en une seule. Les commandes doivent être au handling
     au départ moins le délai de chargement ; le vol doit être chargé à son
     départ. Case **« 24 h/24, en tournées »** (v1, pour le banc d’essai) :
     le handling travaille jour et nuit, en tournées qui chargent un ou
     plusieurs départs puis déchargent un avion arrivé (escales, quais, gros
     camions et VL par compagnie) ; voir [le banc d’essai](docs/BANC_ESSAI.md), § 3. Ses chauffeurs
     peuvent y être **calculés au plus juste** (le plus petit plan de vacations qui sert tous les
     avions à l’heure, avec sa borne basse) plutôt que saisis par créneaux (§ 4).
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
     - *Retours des vols à la plonge › Sale de la veille* (v1, pour le banc
     d’essai) : le sale que la journée d’avant n’a pas lavé ; une équipe de
     plonge peut ne venir que s’il reste du sale (un shift de nuit, dans sa
     fiche) ; voir [le banc d’essai](docs/BANC_ESSAI.md), § 6.
     - *Repas spéciaux par cabine* (v1, pour le banc d’essai) : les cabines
     dont chaque service prépare les SPML (colonnes nb_SPML_BC, nb_SPML_PC,
     nb_SPML_YC du programme) ; voir [le banc d’essai](docs/BANC_ESSAI.md), § 7.
     - *Renforts* (v1, pour le banc d’essai) : une équipe qui a fini va aider
     une équipe qui n’a pas fini, jusqu’à la fin de sa présence ; ce que compte
     un renfort, son délai d’arrivée, et qui peut aider qui, service par
     service ; voir [le banc d’essai](docs/BANC_ESSAI.md), § 5.
   - **Plus ›** *Contrôles détaillés* : ce que le calcul comprend de l’organisation, et ce qu’il faut
     corriger ; un service sans équipe s’y corrige d’un clic (« + Une équipe
     dans… »).
5. **Résultats** — ce que la journée donne.
   - *Synthèse* : la journée répond à cinq questions, dans cet ordre
     (évolution 15 ; le contrat : `docs/CAHIER_DES_CHARGES.md`, § 6 bis).
     **Lire la Synthèse**, de haut en bas :
     1. **Deux phrases.** La première dit combien de personnes il faut,
        combien sont présentes, et combien d'entre elles ne comptent pas dans
        le besoin (« Il faut 16 personnes, 37,8 sont présentes, dont 12,5 en
        postes fixes ou non mesurés. ») : un poste fixe — un service
        permanent, d'appui, un handling — n'a pas de besoin calculé depuis
        une charge ; une équipe d'un service mesuré dont le besoin ne se
        mesure pas (pas de travail au barème) se range avec eux. La seconde
        dit ce qui coince et ce qui part en retard (« Montage coince : il
        finit 40 min après son horaire (et 2 autres services) ; 15 vols et
        14 commandes partent en retard. »), ou que rien ne coince.
     2. **Trois cartes** : *Où ça coince* se juge sur les conséquences, sans
        seuil à régler. Un service coince, un jour de travail donné, s'il
        finit après son horaire d'**au moins un quart d'heure** (une règle
        fixe : en dessous, le dépassement s'affiche mais ne compte pas), ou
        si un de ses lots fait partir une commande ou un vol en retard. Ils
        se rangent par heures sup du dépassement (personnes × heures), puis
        par cumul d'attente : le premier est le goulot, la carte en montre
        trois au plus. Chacun dit son jour, son dépassement et sa cause :
        « attend l'ouverture de …, à 07:00 » (une mise à disposition réglée
        comme une boutique) ou « attend … » (son amont) quand le temps perdu
        avant son premier lot explique le dépassement ou le retard ; son
        matériel ; « la charge du jour ne tient pas dans l'horaire » ;
        « finit dans son horaire, mais après la limite d'une commande ou
        d'un vol » ; ou, pour un service dont les lots finissent à temps sur
        le chemin d'une commande en retard, « la commande prend son retard
        en aval ». Sinon : « Rien ne coince » — un arrivage qui attend plus
        que le seuil, sans retard ni dépassement, y est nommé sans devenir
        un goulot ;
        *Ce qui part en retard* (les seules exceptions, chacune avec son
        retard et sa cause, puis les comptes : les vols que le handling
        charge, les commandes de repas, celles d'équipement, chacun avec son
        périmètre) ; *L'essai* (avec deux essais retenus dans « Comparer deux
        essais » : ce qui change entre A et B). Une carte mène à son détail.
     3. **Les services**, de l'amont vers l'aval — l'ordre tiré de tous les
        chemins à la fois : un service vient après tous ceux qui l'alimentent,
        les services hors chemin à la fin ; le même ordre que le planning des
        équipes et la page Période —, une ligne par service et
        par jour de travail : il faut, présents et l'écart ; le matin et
        l'après-midi ; le pic au travail ; l'occupation ; les personnes sans
        travail ; l'attente d'un arrivage ; la fin et, dessous, les heures sup — ceux
        des équipes de ce jour-là. Chaque ligne dit son jour (« J−2 »,
        « veille », « J+1 » ; « jour des vols » quand le service a plusieurs
        lignes). Un clic sur un service l'ouvre dans le planning des
        équipes, sur ce jour-là.
        - *Besoin* : « fixe » marque un poste fixe, « non mesuré » un service
          dont aucune équipe n'a de besoin mesurable : pas de besoin, pas
          d'écart ; « 3 + 2 fixes ou non mesurés », un service qui en a à
          côté de son besoin. Un handling à chauffeurs compte ses chauffeurs
          dans *Présents*, comme dans *Matin* et *Après-midi* ; une note sous
          le tableau dit les personnes saisies à l'équipe qui ne sont pas
          comptées. L'*Écart* ne prend la couleur de statut que s'il manque
          des personnes ; un surplus garde sa barre, sans couleur d'alerte.
        - *Occupation* : la part du temps de présence couverte par le travail
          du barème. Elle dépend des temps par vol et des effectifs réglés
          (la ligne sous le tableau le rappelle).
        - *Personnes sans travail* : les heures (personnes × heures) où des
          personnes sont présentes sans travail, et leur part de la présence,
          avec une barre, sans couleur d'alerte. Au survol : les trois
          moments — avant le premier lot du poste, entre deux lots, après le
          dernier — et ce que l'équipe attendait avant son premier lot
          (« attend l'ouverture de …, à 07:00 », « attend … » : son amont).
        - *Attente d'un arrivage* : un arrivage, ce sont les lots d'une
          équipe qui deviennent prêts au même instant (ceux prêts avant son
          arrivée forment celui de son arrivée ; à une plonge par vol, chaque
          vol revenu). Son attente va de son instant au début de son premier
          lot ; les lots suivants du même arrivage n'attendent pas : ils sont
          à faire, dans l'ordre de travail. La case dit le nombre d'arrivages
          du jour, puis l'attente la plus longue et son heure (« — » si aucun
          n'a attendu), dans la couleur de statut au-delà du seuil d'attente.
          Un service qui reçoit sa journée en une fois n'a aucune attente ;
          celui où le travail arrive au fil de la journée (des retours à
          laver, des vols à contrôler) peut en avoir.
        - *Fin et heures sup* : la fin du dernier lot ; dessous, l'horaire
          des équipes qui travaillent ce jour-là (une équipe sans lot ce
          jour-là ne prête pas le sien) — ou, quand une équipe dépasse, cette
          équipe, avec sa propre fin et son propre horaire (« l'équipe …
          finit à 21:30 pour 21:00 ») ; puis les heures sup, en personnes ×
          heures. La case ne prend la couleur de statut que si le
          dépassement atteint le quart d'heure. À 1 366 px de large, tout le
          tableau tient sans défilement horizontal.
     4. **La journée** : la courbe des présents, des personnes au travail et
        des lots à faire (prêts, pas commencés), avec un repère par départ ;
        la bulle suit la souris ou les flèches du clavier.

     **Ce que veulent dire les couleurs.** Une case ne se colore que si un
     seuil est dépassé (« Réglages de la simulation › Seuils d'alerte » : un
     manque de 3 personnes, l'attente d'un arrivage de 6 h, une occupation de
     95 %, une durée de stock, un retard d'1 min — les défauts, tant que rien
     n'est réglé ; un réglage enregistré reste ; la correction 18 n'ajoute
     aucun réglage) ; la couleur de l'attente dit un arrivage qui attend
     au-delà du seuil, ou un service qui finit un quart d'heure au moins
     après son horaire ; le rouge ne sert qu'à un retard ; un retard nul ne
     s'écrit jamais en rouge. Une durée s'écrit « 45 min » sous une heure, « 2 h 05 » au-delà.
     Des commandes que personne ne prépare sont un problème, avec son lien
     vers le service où les cocher. « Exporter les résultats » ; le classeur
     de la charge de la journée porte aussi la feuille « Réponses »
     (`docs/FORMATS_EXCEL.md`, § 8).
   - *Le plan rejoué* : rejouer la journée sur le plan de l’unité, en pleine
     hauteur, la barre de lecture en bas ; les chiffres de l’instant, la
     légende et le zoom posés sur le plan ; « En ce moment » à droite, qui se
     replie (bouton dans le titre de la page) pour lui laisser toute la
     largeur ; au-dessus des services, ce qui attend en stock ou à laver.
     « Modifier le plan » ouvre *Équipes › Plan de l’unité*.
   - *Planning des équipes* : qui travaille quand — d'abord toute l'unité sur
     un écran, une ligne de 32 px par service (son nom, ses équipes, « pic au
     travail / présents », sa courbe de charge, un trait par lot), de l'amont
     vers l'aval ; un clic déplie un service en lignes d'équipe de 28 px. Un
     onglet par jour de travail qui a des lots ; trois zooms, par boutons et
     par Ctrl + molette : « Toute la chaîne » (tous les jours), « Un jour »
     (le défaut : du premier lot moins 30 min au dernier plus 30 min, dans la
     largeur, 40 px par heure au moins) et « 6 h » (160 px par heure). Les
     équipes sans lot ce jour-là sont en bas, sous « Sans lot ce jour (n) ».
     Le planning prend la hauteur qui reste, l'axe et les noms toujours à la
     vue ; « Plein écran » recouvre le menu et l'en-tête. Le détail des
     barres, de la marge et de la légende : « Lire le plan rejoué et le
     planning », plus bas. Dessous, le tableau des équipes, replié, et
     « Exporter la charge (Excel) ».
   - *Détails* (évolution 15 c) : une seule entrée du menu, quatre onglets en tête
     de page, dans cet ordre — Commandes, Vols, Stocks et retours, Heures sup et
     renforts ; l’entrée rouvre le dernier onglet ouvert, les flèches du clavier
     passent d’un onglet à l’autre. Les anciens noms (« Heure de chaque
     commande », « Vols prêts au départ ») se cherchent toujours dans « Aller
     à… ». Commandes et Vols disent d’abord leurs comptes, avec les mêmes mots
     que la Synthèse, puis les exceptions ; le reste tient en une ligne qui se
     déplie (« 28 commandes à l’heure »).
   - *Détails › Commandes* : chaque commande, prête à quelle heure, avant
     quand, et sa marge (prête avant − prête à) avec une barre — accent si elle
     est positive, couleur critique si elle est négative ; triées par défaut de
     la plus petite marge à la plus grande (un clic sur un en-tête trie
     autrement). « Retirer du programme », un réglage, est dans le menu « … »
     de la ligne.
   - *Étapes de chaque commande* (un réglage : dans le menu Chemins depuis
     l’évolution 15 c) : une ligne par commande, un clic sur « Prête à »
     la déplie dans le temps ; en dessous, le tableau calculé, une ligne par commande, une
     colonne par service, la case et ses heures dans chaque cellule ; un clic
     ouvre le chemin de la commande sur ce service. La première colonne et les
     en-têtes restent à la vue pendant le défilement ; « sert tout le monde »
     et « pas par là » s’écrivent en gris, sans italique ni hachures.
   - *Détails › Vols* : une frise de la journée et un tableau qui dit, vol par vol, si
     ses commandes sont prêtes à l’heure, en retard, ou sans équipe. Sur la
     frise, chaque vol est un point de 10 px de la couleur de son état ; son
     numéro s’écrit au survol, et toujours pour un vol en retard ; le point
     survolé dit son vol, son départ et son état.
   - *Détails › Stocks et retours* : ce qui attend entre deux ateliers et avant le
     chargement, le plus en stock d’abord (ou le plus long, d’un clic sur
     l’en-tête) — sur chaque petite courbe, ce qui est en stock à l’heure
     survolée ; leur échelle commune est dite une fois, dans l’en-tête ; un
     stock plus long que la durée maximale réglée est signalé (aucun tant
     qu’elle n’est pas réglée). Les retours des vols face au débit de la
     plonge ; « Bouchon » seulement s’il reste du sale le soir ou si
     l’attente passe le seuil.
   - **Le trait « maintenant »** : dès que la journée est rejouée (ou le
     curseur déplacé), le planning, la frise des vols et les graphiques des
     stocks marquent l’heure rejouée d’un trait, l’heure écrite au bout ; il
     suit la lecture, et s’en va quand on revient au début.
   - *Comparer deux essais* : A / B, rangé selon les cinq questions (le
     scénario, puis combien de personnes, où ça coince, à quelle heure chaque
     service finit, ce qui part en retard), et l’écart de B sur A en face de chaque
     résultat (« ▼ −25 min », « ▲ +1 h 05 », « ▲ +5 pts »), vert s’il est mieux, rouge s’il
     est moins bien, et le mot.

**Sauvegarde** (au pied de la barre latérale) : tout le travail dans un fichier, et les limites
connues du calcul.

**Tout se pilote aussi depuis Excel** : ateliers (avec classes et parcours),
barème et programme de vols s’exportent en `.xlsx`, se modifient dans le
tableur et se réimportent. Voir [les formats Excel](docs/FORMATS_EXCEL.md).

La journée est **calculée d’un coup** par `moteur/production.js` et
**recalculée à chaque modification** : aucun réglage ne se verrouille.

- **Le plan rejoué** : rejoue la journée calculée. Il s'ouvre sur le plan entier
  (« Tout voir » : tout tient dans la zone visible, à 24 px des bords) et à l'heure
  où le plus de personnes sont au travail ; cette heure reste tant que la journée
  relue ne change pas. En haut, « Voir un service » et « Liens » ; au-dessus du
  plan, une bande d'une ligne : les chiffres cumulés jusqu'à l'heure rejouée
  (« commandes prêtes jusqu’ici : 12 sur 30, toutes à l’heure »), et à droite la
  légende des quatre états. Une seule barre de commandes, en bas : « ▶ Rejouer »,
  « ⏭ Pas à pas » (saute au prochain changement), « ↺ Recommencer », l'heure, le
  curseur du temps (les jours et les départs des vols y sont marqués), la vitesse,
  puis le zoom (−, %, +, « Cadrer » le service choisi, « Tout voir »). Les noms des
  services gardent la même taille à tout zoom ; les sous-titres n'apparaissent que
  lorsqu'ils se lisent. Chaque service est rempli de la couleur de son état à
  l'heure rejouée : au travail (la couleur d'accent), attend le service d’avant
  (la couleur d'avertissement), a fini (gris), pas commencé (gris clair, contour
  pointillé). Au centre, « 4 au travail / 6 présents » — les créneaux de 15 min des
  indicateurs de charge — et, s'il y en a, « 3 en file ». « Liens » propose par
  défaut **Ce qui circule** : un trait par paire de services qui ont des repas en
  stock entre eux à l'heure rejouée (les séjours de « Stocks et retours »), d'un
  bord de zone à l'autre, la pointe à l'arrivée ; plus il est épais, plus il y a
  de repas (de 1 à 8 px, en racine de la quantité) ; les trois plus épais disent
  leur quantité (« 120 repas ») ; au-delà de 8 traits, les plus petits se
  replient dans « + n liens », dans la bande. Pendant la lecture, des points
  avancent le long des traits, un par tranche de repas (« un point = 50 repas »,
  dans la bande) : là où ils s'accumulent, le travail attend. Avec les animations
  réduites (prefers-reduced-motion), pas de points : seules les épaisseurs
  changent. Les autres choix (Tous, Humains… Aucun) dessinent les liens
  configurés, comme avant. Pendant chaque tournée du handling, un camion (ou un
  VL) va du quai vers le bord du plan, du côté des avions, puis revient. Au tout
  début de la journée (« Recommencer »), le plan montre plutôt ce qui reste à
  décrire (aucune équipe, équipe sans travail, équipe au travail).
- **Départs** : le bilan de la journée, départ par départ ; un vol dont des
  repas n’ont pas d’équipe est dit « Des repas sans équipe ».
- **Exporter les résultats** (Synthèse) : la journée calculée — départs, classes, journal des lots.

## Lire le plan rejoué et le planning

**Le plan rejoué** (Résultats › Le plan rejoué) montre la journée calculée à
l'heure rejouée — à l'ouverture, le créneau où le plus de personnes sont au
travail. Rien n'y est recalculé : il lit le résultat du moteur et ses
indicateurs.

- **La couleur d'un service dit son état** : rempli d'accent, il travaille ;
  de la couleur d'avertissement, son équipe est là mais attend le service
  d'avant ; gris, il a fini ; gris clair à contour pointillé, il n'a pas
  commencé. La légende, à droite de la bande, le rappelle.
- **Au centre** : « 4 au travail / 6 présents » (le créneau de 15 min des
  indicateurs de charge) et, s'il y en a, « 3 en file » — ce qui attend son
  équipe. Au-dessus, la pastille « n repas en stock » ou « n u à laver ».
- **Les traits de « Ce qui circule »** relient deux services qui ont des
  repas en stock entre eux à cette heure ; plus le trait est épais, plus il y
  en a, la pointe à l'arrivée ; les trois plus épais disent leur quantité.
  Au-delà de huit, « + n liens » dans la bande. Pendant la lecture, des
  points avancent le long des traits (« un point = 50 repas ») : là où ils
  s'accumulent, le travail attend. Les autres choix de « Liens » montrent
  les liens configurés de l'unité.
- **Les camions (ou VL)** du handling vont du quai vers le bord du plan, du
  côté des avions, pendant leur trajet, puis reviennent.
- **La bande** au-dessus du plan cumule depuis le début de la journée :
  « commandes prêtes jusqu'ici : 12 sur 30, toutes à l'heure », les commandes
  en retard à cette heure, les services au travail et ceux qui attendent.

**Le planning des équipes** (Résultats › Planning des équipes) dit qui
travaille quand : d'abord toute l'unité sur un écran, puis le détail d'un
service.

- **La vue d'ensemble** : à l'ouverture, tous les services sont repliés — une
  ligne par service, de l'amont vers l'aval, avec son nom, le nombre de ses
  équipes et « pic au travail / présents » ; sur l'axe du temps, sa courbe de
  charge (présents en trait, au travail en aire, le pic marqué) et un trait
  fin par lot (dans la couleur du retard s'il finit après sa limite).
  Survoler le nom d'un service donne son résumé : le pic, son heure, les
  présents, l'occupation, les heures sup.
- **Déplier** : un clic sur la ligne d'un service montre son résumé en entier,
  puis ses équipes, une ligne chacune, avec leur nombre de personnes ; « Tout
  déplier », « Tout replier ». Le navigateur retient les services dépliés.
- **« Sans lot ce jour (n) »** : en bas, repliée, la ligne des équipes qui
  n'ont aucun lot le jour affiché — mises à disposition, équipes d'appui,
  équipes sans commande, services entiers compris.
- **Un jour à la fois** : un onglet par jour de travail qui a des lots
  (« veille », « jour des vols »…), avec le nombre d'équipes qui y
  travaillent ; à l'ouverture, celui qui a le plus de lots. « Un jour » cadre
  du premier début de lot moins 30 min à la dernière fin plus 30 min, et
  remplit la largeur (une heure fait au moins 40 px) ; « 6 h » pour le
  détail ; « Toute la chaîne » montre tous les jours à la fois. Ctrl + molette
  change de zoom sous le pointeur ; on glisse pour se déplacer. La période
  visible est écrite dans le coin de l'axe ; l'axe (le jour, les heures) et
  les noms restent à la vue.
- **La place** : le planning prend toute la hauteur qui reste dans la
  fenêtre ; « Plein écran » recouvre le menu et l'en-tête, Échap en sort. La
  légende, sur la ligne des boutons, ne montre que les signes présents à
  l'écran ; son bouton la replie. La colonne des noms s'élargit jusqu'à
  260 px ; un nom coupé se lit en entier au survol.
- **Une barre** est un lot (3 px de large au moins) : pleine, l'équipe
  prépare ; la bande fine devant, le lot attend le service d'avant ; un trou,
  une pause prise ; un motif, le robot ou le lavage ; une encoche, deux
  étapes faites à la chaîne. Un contour critique et une alerte : le lot finit
  après la limite de sa commande.
- **La bande hachurée** devant le premier lot d'une équipe : elle est là,
  sans travail, de son arrivée à son premier lot. Au survol : sa durée, et ce
  qu'elle attendait (l'ouverture d'une mise à disposition, avec son heure ;
  son amont ; son matériel).
- **La marge** : le petit trait après la barre du dernier lot d'une commande
  est sa limite (« prête avant ») ; le pointillé qui l'y relie, c'est la
  marge. En retard, le trait tombe dans la barre. Quand la limite est après
  la fenêtre affichée, le pointillé s'arrête au bord droit, où une flèche
  dit son heure au survol.
- **Le détail à la demande** : survoler une barre, ou la rejoindre au
  clavier, donne la commande, le début, la fin, la durée, l'attente et la
  marge ; un clic met sa commande en évidence dans toutes les équipes
  (Échap annule). Le trait vertical, à l'encre, porte l'heure rejouée.

## Lire les indicateurs

- **Commandes prêtes jusqu’ici** (la bande au-dessus du plan rejoué) : les
  commandes prêtes depuis le début de la journée jusqu’à l’heure rejouée, sur
  toutes celles de la journée, et combien l’ont été après leur heure de
  chargement (« toutes à l’heure », « dont 2 en retard ») ; jamais « — ».
- **En retard à cette heure** : commandes dont l’heure de chargement est passée
  et qui ne sont pas encore prêtes.
- **Services au travail** / **qui attendent** : services qui préparent, et
  services dont l’équipe est là mais dont le service d’avant n’a pas encore livré.
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
résultat, son écart signé et fléché, « mieux » ou « moins bien ». Le calcul n’a aucun aléa : réglages
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

**Équipes › Plan de l’unité** (ou « Modifier le plan » sur le plan rejoué, ou
« Modifier le plan de l’unité » sur la fiche d’un service) ouvre l’éditeur en
pleine page : à gauche les **calques**, rangés par type (services, zones de
production, locaux, équipements, circulations) et recherchables ; au centre le
plan, avec sa barre d’outils flottante (Sélection, Rectangle, Polygone, Main ;
Aimantation, Grille) ; à droite **la zone choisie** (identité, géométrie,
statut). « Terminer » ramène à la page d’où l’on venait.
Les stockages sont des fiches rattachées aux services, sans contour individuel.
Ajouter des locaux et équipements, les nommer, choisir
une couleur, dupliquer, masquer ou verrouiller leur géométrie.

Les contours gardent la même épaisseur à tout zoom ; les poignées sont des
carrés de 8 px, et la taille de la zone choisie s’affiche sous son coin. Une
zone fixée porte un cadenas ; l’inspecteur grise et explique ses actions. L’aimantation et les guides
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
personnes d'une équipe se déduit de son travail : heures par vol × vols de
chaque compagnie qu'elle prépare, divisé par les heures travaillées de son
poste (pauses déduites), arrondi au-dessus ; la journée se joue ensuite avec
cet effectif. La case **« Effectif constant »** de la fiche du service rend
la saisie à la main ; chaque équipe peut faire autrement que son service, avec
son choix **« Effectif »** (comme le service, dépend des vols, constant). Un
poste constant n'a **pas d'heures par vol** : ses commandes passent dans ses
heures de présence ; pour essayer un effectif sur un poste qui dépend des vols,
**« Effectif imposé (essai) »** applique les heures par vol à l'effectif
saisi. Chaque service a aussi ses **superviseurs /
coordinateurs** : hors production, gardés pour le budget quotidien.
Un service peut aussi n'avoir qu'**un seul atelier** (le BOB, les checkeurs) :
x personnes, une heure, et les compagnies qu'il fait, cochées une à une. Constants par défaut : CF départ food, magasin,
légumerie, duty free, appros. Le robot, la plonge, le handling et les mises à
disposition gardent toujours leur effectif saisi. Une mise à disposition (les
appros, le magasin…) a ses **personnes sur la journée** : 2 aux appros, ce sont
2 personnes en tout, une présence chacune ; elles comptent dans l'effectif du
jour et le budget, pas dans les durées. La plonge peut avoir des **équipes hors
tunnel** : constantes, ou calculées d'après leurs heures par vol × les vols
qui reviennent.

Le barème des heures de travail est **non calibré** : ses durées ne dimensionnent pas
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
- L’export Winrest (onglet « Flights ») se lit tel quel (évolution 13), mais ne
  donne que des départs : un programme tiré de lui n’a pas de retours.

L’ancien moteur de démonstration (`moteur/orly.js`, `ressources.js`,
`mesure.js`, `procede.js`) a été **retiré le 23 septembre 2026** : la vue
Simulation relit désormais le modèle par ateliers, qui porte seul le calcul.
L’[étude des moteurs](docs/ETUDE_OPEN_SOURCE.md) reste pour mémoire. Les données réelles
restent en privé.
**Pour tracer et paramétrer l’unité, suivre le
[mode d’emploi de la saisie](docs/TRACER_L_UNITE.md)** : où travailler, dans
quel ordre, et comment ne rien perdre.

**Pour rejouer des journées réelles hors du navigateur** (un banc d’essai, tenu
hors du dépôt, qui compare les heures supplémentaires et les effectifs simulés
aux heures pointées), voir [le banc d’essai](docs/BANC_ESSAI.md) :
`node outils/simuler-journee.cjs sauvegarde.json vols.csv [options.json]` rend
la journée que la page aurait calculée.

**Pour reprendre le projet, commencer par l’[état des lieux](docs/ETAT_DES_LIEUX.md)** :
où en est le travail, ce qui est décidé, ce qui ne l’est pas, et ce qui reste à
faire. Voir aussi [l’audit d’usage](docs/AUDIT_INTERFACE.md), le
[registre des bugs](BUGS.md) et le
[journal des modifications](CHANGELOG.md). La
[feuille de route commune](docs/FEUILLE_DE_ROUTE.md) reste la référence métier.
Pour l’interface, le **[design system](docs/DESIGN_SYSTEM.md)** dit les jetons,
les composants, les règles de la couleur, du mouvement, du clavier et de la
latence, et la liste à suivre pour ajouter un écran (la refonte qui l’a posé :
[docs/REFONTE_UX.md](docs/REFONTE_UX.md)).

## Fichiers et vérification

| Fichier | Rôle |
|---|---|
| `index.html` | Structure et contrôles |
| `interface.css` | Disposition et hiérarchie visuelle |
| `ds.css` / `polices/` | Le design system, posé en dernier (refonte du 08/10, deuxième passe du 15/10 pour le thème clair : navigation bleu nuit, fond pierre (gris à peine chaud), cartes posées avec une ombre douce, titre de page avec sa partie en surtitre, indicateurs à voyant, palette des données validée pour les daltoniens) : jetons (thème clair, sombre en option), police Inter embarquée (licence OFL), boutons, champs, pastilles, cartes, tableaux ; la coquille : barre latérale, barre du haut (fil d’Ariane, état du calcul, « Aller à… », Annuler / Rétablir), titre de la page ; la palette et la fiche des raccourcis ; les mouvements (180 ms au plus), coupés quand les animations sont réduites |
| `unite.js` / `unite.css` | Prêt à simuler ?, Flux de production et Services et équipes : le pas à pas et la fiche de chaque service (équipes, grille à cocher, minutes) |
| `sim.js` | Interface, plan, interactions, glue entre les centres |
| `stockage.js` | Plusieurs onglets ne s’écrasent plus (correction 14) : chargé avant les autres scripts, un garde à la place de `localStorage` ; les données du site portent un numéro de révision, un onglet en retard n’écrit rien et le dit par un bandeau (« Recharger »), averti aussi par l’événement `storage` |
| **`moteur/production.js`** | **Modèle par ateliers de travail** — compagnie × classe, lots ordonnés, robot, plonge, parcours lu des flux. Voir [la note de modèle](docs/MODELE_ATELIERS.md) |
| `moteur/noyau.js` | Noyau à événements discrets sur lequel tourne le modèle par ateliers |
| `moteur/journee.js` | L’assemblage du calcul de la journée, d’un seul chemin pour la page et le banc d’essai : une sauvegarde relue comme « Restaurer », les commandes, les équipes resynchronisées, les liens, le barème, l’effectif calculé, les noms. Voir [le banc d’essai](docs/BANC_ESSAI.md) |
| `moteur/indicateurs.js` | Les indicateurs de charge (évolution 12, [§ 13 du banc d’essai](docs/BANC_ESSAI.md)) : il lit le résultat d’une journée et rend, par créneau de 15 min et par service, présents, au travail, en pause, sans travail, en file et terminés ; par équipe, l’occupation, le consommé sur disponible, le débit, la file la plus longue ; par service, ETP présents, heures au travail, pics, occupation pondérée ; sans objet dit, pas mis à 0 |
| `plan-base.js` | Le plan de base : les services du plan d’origine (ordre, noms, emplacements), ses stockages et ses liens d’origine, lus par la page et par le banc d’essai |
| `outils/simuler-journee.cjs` | Jouer une journée hors du navigateur : `node outils/simuler-journee.cjs sauvegarde.json vols.csv [options.json]` rend la journée que la page aurait calculée, et ses indicateurs de charge ; `--xlsx charge.xlsx`, le classeur de la charge de la journée ([le banc d’essai](docs/BANC_ESSAI.md)) |
| `moteur/periode.js` | Une période : un programme de vols daté joué jour après jour (le sale, le stock propre et, en « J+1 », les départs de la veille passent au lendemain), le bilan par jour de travail, par mois et sur la période ; pour la page et pour `outils/simuler-periode.cjs` ([le banc d’essai](docs/BANC_ESSAI.md), § 9) |
| `outils/simuler-periode.cjs` | Jouer une période hors du navigateur : `node outils/simuler-periode.cjs sauvegarde.json vols-dates.csv [options.json] > periode.json` rend la période, son bilan et chaque journée, comme la page les calcule ; `--sans-detail` ; `--xlsx periode.xlsx`, le classeur de la page ; une sauvegarde qui a une politique d’effectif rend aussi `prevuCale`, le prévu calé de chaque jour ([le banc d’essai](docs/BANC_ESSAI.md), § 9 et § 10) ; `--planning planning.csv`, un rejeu à effectif imposé (évolution 11 f) |
| `periode-vue.js` / `periode.css` | La période dans la page (v1) : le bandeau de la journée de vols affichée et « Simuler la période » (par étapes, Annuler, « à relancer »), la page Résultats › Période ; rien sans programme daté ; dessous, « Réel et calage » (évolution 11) ; la colonne « Unité », les personnes en moyenne par jour, la première colonne collante (évolution 15 d) ; « Unité » en première colonne de chiffres, les jours incomplets expliqués une fois, le détail dépliable (correction 17 d) |
| `moteur/ordre-services.js` | L'ordre des services, de l'amont vers l'aval (v1, correction 17 b), tiré de tous les chemins à la fois : un service après tous ceux qui l'alimentent, à égalité l'ordre du premier chemin, les services hors chemin à la fin, une boucle sans effet ; pour la Synthèse, le planning des équipes et la page Période |
| `echanges-reponses.js` | La feuille « Réponses » du classeur de la journée (v1, évolution 15 e) : les cinq réponses du module, dans l’ordre du contrat ; la page et l’outil `simuler-journee --xlsx` l’écrivent ; les autres feuilles ne changent pas |
| `periode-courbe.js` | La courbe de la page Période (v1, évolution 15 d) : la colonne Unité jour par jour, les jours incomplets en creux, le réel importé pour une mesure qui se compare à des ETP par jour ; la bulle à la souris et aux flèches |
| `moteur/reel.js` | Le réel par jour et par rôle, sa correspondance avec la simulation et la comparaison, sans navigateur (v1, banc d’essai, évolution 11 b) : la page et l’outil `caler-periode` |
| `moteur/planning.js` | Le planning daté, sans navigateur (v1, banc d’essai, évolution 11 f) : le fichier « Planning » lu et validé, un jour rejoué avec ses équipes, leurs horaires et leurs personnes, le facteur de travail de chaque service |
| `moteur/calage-travail.js` | Le calage du travail en rejeu (v1, banc d’essai, évolution 11 f) : un facteur des homme-minutes par ligne, une grille puis un affinage, validé hors échantillon (règles 1 à 4), pas à pas |
| `moteur/calage-periode.js` | Le calage sur le réel, sans navigateur (v1, banc d’essai, évolution 11 c) : un modèle par ligne, validé hors échantillon, ses règles, σ et la bande P10–P90 ; depuis l’évolution 17 (a), il essaie le catalogue de formes, corrige le seuil du test du nombre de candidats et écrit la formule retenue en clair |
| `moteur/calage-formes.js` | Le catalogue de formes du calage (v1, banc d’essai, évolution 17 a) : « puissance », « logarithme », « plancher », « plafond » — une fiche par forme (ses variables, son ajustement par moindres carrés sur une grille, ses bornes, les paramètres gardés, sa formule en clair) |
| `moteur/import-flights.js` | L’export « Flights » de Winrest lu tel quel : ses lignes et les règles d’import donnent le programme de vols daté et le rapport d’import ; pour la page et pour `outils/importer-flights.cjs` ([le banc d’essai](docs/BANC_ESSAI.md), § 14 ; [les formats](docs/FORMATS_EXCEL.md), § 7) |
| `echanges-import-flights.js` | Le classeur du rapport d’import Winrest, le même depuis la page et depuis l’outil |
| `import-flights-vue.js`, `import-flights.css` | L’export Winrest dans la page (Vols › Programme des vols) : le rapport d’import et la section « Règles d’import Winrest » |
| `outils/importer-flights.cjs` | Lire l’export Winrest hors du navigateur : `node outils/importer-flights.cjs EXPORT.xlsx [sauvegarde.json] [--rapport rapport.json] [--xlsx rapport.xlsx] > programme.csv` ; le programme au format du CSV daté, que `simuler-periode` lit tel quel ; les règles de la sauvegarde, sinon les défauts |
| `outils/caler-periode.cjs` | Comparer une période simulée au réel et la caler, ligne par ligne, hors du navigateur : `node outils/caler-periode.cjs periode.json reel.csv correspondance.json [--xlsx calage.xlsx]` ; d’un rejeu, la comparaison du rejeu ; `--travail sauvegarde.json vols-dates.csv planning.csv`, le calage du travail |
| `outils/batterie.cjs` | La batterie complète dans un clone propre (correction 15) : `node outils/batterie.cjs` copie le dépôt sans les fichiers ignorés (ou `--commit HEAD`, un worktree Git), hors du dépôt, y joue les tests Node puis chaque test navigateur, une ligne par test, « FIN n OK, m ÉCHEC », les journaux dans un dossier temporaire |
| `charge-vue.js` / `charge.css` | La charge dans la page Planning (v1, évolutions 12 c et 14 c) : par service la courbe présents / au travail et son pic, en petit sur la ligne de son service dans le planning (sans la file, correction 18 b) ; sous le planning, le tableau des équipes (occupation, consommé sur disponible, débit, file la plus longue, attente) et le classeur |
| `resultats-vue.js` / `resultats-vue.css` | Les autres pages des résultats (v1, évolution 14 d) : la Synthèse (la couleur suit l’état, la phrase de résumé), la marge de chaque commande et son tri, les points de la frise des départs, le tri et l’échelle des stocks, plus de 24 h signalé |
| `planning-vue.js` / `planning-vue.css` | Le planning des équipes (v1, évolution 14 c, correction 18 b) : d’abord toute l’unité (une ligne de 32 px par service, repliée, avec sa courbe et un trait par lot ; un clic la déplie), les onglets des jours de travail et les trois zooms, l’axe à deux niveaux et les noms collants (jusqu’à 260 px), le cadre sur la hauteur qui reste et le plein écran, les barres (attente, temps sans travail avant le premier lot, pauses, motif, encoche, retard), la limite de chaque commande (une flèche au bord quand elle est après la fenêtre), la légende des signes à l’écran, la commande mise en évidence, le trait de l’heure rejouée |
| `planning-ensemble.js` | Ce que le planning montre, avant de le dessiner (v1, correction 18 b), sans navigateur : les jours de travail qui ont des lots et celui qu’on ouvre, le cadre d’un jour (30 min avant le premier lot, 30 min après le dernier) et l’échelle qui remplit la largeur, les lignes (les services qui ont des lots, les équipes sans lot à part), le résumé d’un service, le temps sans travail avant le premier lot et ce que l’équipe attendait, la largeur de la colonne des noms |
| `calage-vue.js` | « Réel et calage » dans la page Période (v1) : l’import du réel, la correspondance, les anomalies, la comparaison |
| `echanges-calage.js` | Le classeur du calage sur le réel (v1), le même depuis la page et l’outil |
| `classeur-compresse.js` | Le classeur compressé (v1, banc d’essai, correction 16 c) : les entrées du classeur que `tableur.js` écrit, compressées (deflate) — zlib sous Node, `CompressionStream("deflate-raw")` dans le navigateur, sinon tel quel ; pour les classeurs de la période, de la charge et du calage, depuis la page et les outils |
| `echanges-charge.js` | Les indicateurs de charge dans les classeurs (v1, évolution 12 d) : le classeur de la journée (Lisez-moi, Charge, Créneaux) et les deux feuilles du classeur de la période, depuis la page et les outils ; `echanges.js`, commun aux deux versions, ne change pas |
| `replay.js` / `simulation.js` | Relecture de la journée calculée : états à l’instant t, vue Simulation |
| `comparaison.js` | Scénarios A/B : capture, tableau, verdict et écart signé par ligne |
| `vols-demo.js` | Programme de vols **fictif** de démonstration, sans QR ni DL ; il reçoit des vols d’essai pour chaque compagnie que l’unité prépare ou a ajoutée sans départ au programme (jamais un programme importé) |
| `parcours.js` | Chemins des repas : validation, chemins types, tableau « Qui prépare quoi », suivi d’un repas dans le temps, éditeur |
| `tableur.js` | Lecture et écriture de classeurs Excel (.xlsx) et de CSV, sans bibliothèque |
| `echanges.js` | Les trois classeurs (ateliers, barème, vols) : format et conversions ; le classeur des résultats d’une période (v1, en lecture) |
| `plan-editor.js` / `editor.css` | Dessin, annotations, historique et sauvegarde du plan |
| `ui-model.js` | Import CSV et échappement, testables |
| `flow-center.js` / `flow-center.css` | Réseau configurable, règles humaines, onglet et affichage des flux |
| `ateliers.js` / `ateliers.css` | Onglet « Ateliers de travail » : saisie, planning, couverture par classe |
| `reglages.js` / `reglages.css` | Centre des réglages : barème, rendement, régime de poste |
| `demarrage.js` / `histoire.css` | L’accueil : une tuile par partie avec son état, « à faire ensuite », l’histoire en quatre images, le menu de la barre latérale (la partie ouverte déplie ses pages) ; `histoire.css` porte aussi le graphisme : couleurs par sens, jauges, tableau des départs, plan de métro, barres |
| `graphe.js` / `graphe.css` | Le diagramme de nœuds des chemins et des liens de l’unité : disposition en colonnes avec couloirs, tirer un trait pour relier, clavier, disposition retenue |
| `onglets.js` | Le menu : les cinq parties et leurs pages (chacune est un sous-onglet d’une vue), les outils « Plus », la règle qui masque les autres, le clavier, la page retenue par partie ; une page conditionnelle (la Période, avec un programme daté) |
| `notifications.js` | Le retour des gestes (09/10) : une notification par geste, en bas à droite, avec « Annuler » quand il se défait (même sur deux historiques), et les questions du site pour ce qui ne se défait pas ; les historiques (cases, barème, plan, liens) s’y inscrivent |
| `problemes.js` | Le registre des Problèmes (09/10) : à corriger, à compléter, ce que la journée montre ; le nombre au pied de la barre latérale, et ceux des onglets qui en dérivent |
| `rendu.js` | Redessiner sans perdre ce qu’on tape : tant qu’on écrit dans un champ, la zone qui le contient attend pour se redessiner ; elle le fait dès que le champ est validé (Entrée, quitté), le focus revenant au même champ. Posé une fois, à la source (`innerHTML`), pour tous les écrans |
| `champs.js` | Les champs (09/10) : l’heure en 24 h (champ texte `data-heure` : « 0430 », « 4:30 », « 4h30 » → « 04:30 », gardée « HH:MM » comme avant ; tout choisi au focus ; ↑↓ un quart d’heure, Maj+↑↓ une heure), Maj+↑↓ dix pas dans un nombre, et le refus d’une saisie sous son champ (bordure, message lié au champ, valeur gardée remise) |
| `ds.js` | Les composants scriptés du système de dessin (09/10) : l’infobulle des graphiques (tout de suite au survol, ce que porte le `data-info` d’une barre, d’un avion, d’un nom ; seulement dans un graphique `ds-graphique`), et le trait « maintenant » (l’heure rejouée sur chaque graphique qui déclare son axe du temps, `data-axe="t0 t1 x0 x1 y0 y1"` ; le repère d’axe qu’il chevauche s’efface) |
| `palette.js` | La palette et la fiche des raccourcis (12/10, v1 = v2) : Ctrl K (⌘ K) ou « Aller à… » ; chercher sans accents ni majuscules dans ce que le site lui donne (pages, services, équipes, commandes, gestes), le meilleur en tête de son groupe, ce qui répond marqué ; flèches, Entrée, Échap ; la touche ? ouvre la fiche des raccourcis. `chercher` et `surligner` sont purs. Rien n’est enregistré |
| `icones.js` | Les pictogrammes (étapes, services, états) et les couleurs d’étape |
| `demarrage.css` | Ce que montre chaque vue (lecture de la journée seulement dans « La journée ») et couleurs du plan en lecture |
| `plan-prive/` | Fond de plan **local, non versionné** (voir ci-dessous) |
| `tests/ui-model.test.cjs` | Régressions de l’import CSV |
| `tests/noyau.test.cjs` | Régressions du noyau : ordre, horloge, conditions, interruptions, erreurs |
| `tests/grille-services.test.cjs` | Les flux de production et la grille des équipes : le flux d’une classe naît au premier coche, cocher renvoie ce que le flux ne traverse pas, « tout le flux » (s’intercale, sans raccourci), « seulement pour cette commande » (une variante partagée, nommée par son écart, retirée quand plus personne ne la suit), une équipe par service, l’ordre des départs, les liens de l’unité sans boucle, une salle annexe, regrouper les chemins identiques (le calcul voit les mêmes chemins), le calcul |
| `tests/production.test.cjs` | Régressions du modèle par ateliers : enchaînement des lots, attente des amonts, robot, pauses, validation |
| `tests/non-regression.test.cjs` | Les options du banc d’essai désactivées, rien ne change : pour la démo et deux unités fictives relevées avant elles (`tests/non-regression.attendu.json`), les mêmes arguments du moteur et la même journée, champ par champ, hors champs nouveaux déclarés |
| `tests/commandes-sans-vol.test.cjs` | Une commande d’une équipe qui ne vole pas ce jour-là (v1, banc d’essai) : absente de la journée, les autres commandes faites, une information ; une équipe dont rien ne vole ; une commande mal écrite toujours refusée ; une compagnie jamais vue (un avertissement) ; commande ajoutée et armement ; par l’outil |
| `tests/equipe-sans-vol.test.cjs` | Une équipe sans aucun vol ce jour-là (v1, banc d’essai, correction 10) : 0 personne même avec des minutes au barème, la commande faite en temps nul et l’aval servi (ajoutée à la main, armement) ; la personne en temps nul seulement si une commande vole sans minutes ; l’effectif fixe inchangé ; les journées enregistrées inchangées |
| `tests/robot-calcule.test.cjs` | L’équipe d’un robot calculée d’après le barème de son service de robots (v1, banc d’essai, évolution 9) : 300 min par vol × 4 vols, 3 personnes ; 2 vols, 2 ; sans minutes au barème ou à effectif fixe, l’effectif saisi ; au moins le minimum, sans arrêt annoncé ; la ligne à la même durée ; sans vol, 0 personne, renforts actifs compris ; sa compagnie qui ne vole pas ; la journée part de l’effectif saisi ; le récap en heures par vol ; le barème repris du service dont il dépend ne compte pas ; hors d’un service de robots, seulement sur demande, et sinon le résultat d’avant ; journées enregistrées inchangées |
| `tests/commandes-sans-vol-browser.cjs` | La même chose dans la page : la journée se calcule, l’information et l’avertissement parmi les points à regarder, une commande mal écrite refuse la journée |
| `tests/journee.test.cjs` | Jouer une journée hors du navigateur : la sauvegarde relue et refusée comme par « Restaurer », les options et leurs bornes, les réglages forcés, les vols lus comme dans la page (CSV, classeur), mêmes entrées même journée, l’outil en ligne de commande |
| `tests/heures-sup.test.cjs` | Les heures supplémentaires de la v1 (banc d’essai) : 0 dans le poste, 40 min pour 40 min de débordement, le plafond coupe, ni mise à disposition ni appui, option désactivée = journée d’avant ; robot (la ligne continue), plonge par vol (le vol commencé seulement) et au débit (elle s’arrête à la fin de sa présence), handling avec et sans créneaux, effectif calculé inchangé, réglage validé, options du banc |
| `tests/handling-24h.test.cjs` | Le handling 24 h/24 de la v1 (banc d’essai) : une tournée charge A puis décharge B, pas de rechargement avant le déchargement, escale courte (un échange), compagnie sans escale (la règle des retours), un vol pas prêt ne bloque plus, VL et gros camions à part, échéance des commandes selon la tournée, sale à la plonge à la fin du vidage, chauffeur en heures sup ; la veille au soir, le long courrier, la validation, Excel, heure_eta |
| `tests/programme-date.test.cjs` | Le programme de vols daté (v1, banc d’essai, évolution 10) : la colonne date en CSV, en feuille unique et en Départs / Retours, ses formats, l’export en première colonne et la relecture à l’identique, les lignes non datées ou illisibles refusées avec leur numéro, le rapport de la période et les jours sans vol, l’outil d’une journée |
| `tests/periode.test.cjs` | Le calcul d’une période (v1, banc d’essai, évolution 10) : une période d’un jour = la journée d’aujourd’hui, chaque journée = l’outil d’une journée avec ce que la veille lui laisse, le sale non lavé et le stock propre au lendemain, « J+1 », le jour sans vol ; le bilan par jour de travail (le jour de chaque équipe, les jours incomplets, la somme des homme-minutes, les mesures, le prorata d’un lot de deux compagnies) ; pas à pas, déterminisme et temps de calcul ; une journée rejouée d’après son entrée, comme la page la montre |
| `tests/simuler-periode.test.cjs` | L’outil `outils/simuler-periode.cjs` : le JSON de la période (la période, le bilan, chaque journée), chaque journée rejouée seule par `simuler-journee` avec ses options, `--sans-detail`, le classeur daté, le déterminisme, les refus ; `--xlsx` écrit le classeur de la page |
| `tests/periode-handling24.test.cjs` | Une période avec un handling 24 h/24 (v1, banc d’essai, correction 11) : un départ de la veille dont le handling décharge l’avion ne revient pas en « J+1 » (numéros de vol qui changent, même numéro les deux jours) ; une compagnie sans escale ni ETA, ou hors de la liste du handling, garde « J+1 » ; le jour 2 = `simuler-journee` avec le sale du jour 1 ; sans handling 24 h/24, rien ne change |
| `tests/charge-periode.test.cjs` | La charge de chaque équipe et l’arrondi au service (v1, banc d’essai, évolution 11 a) : 2,3 + 1,4 ETP, 5 personnes, 4 au service, 1 de surplus ; un robot saisi à 6, sa ligne 210 min sur 420, 3 ETP ; les plonges ; 2,25 pour 3 personnes 6 h ; une mise à disposition ; l’encadrement à part ; les totaux et les moyennes ; le classeur ; les autres mesures du bilan inchangées (`tests/periode-bilan.attendu.json`, relevé avant ces champs sur les unités fictives) |
| `tests/reel.test.cjs` | Le réel et sa comparaison (v1, banc d’essai, évolution 11 b, `moteur/reel.js`) : le fichier « Réel par jour » (heures décimales ou HH:MM, en-têtes sans casse ni accents, une colonne « heures », le service devant le rôle), refusé entier s’il est mal formé, la ligne nommée ; ETP, écarts, erreurs, biais et corrélation connus ; bases par catégorie et par rôle ; une ligne de deux rôles, l’encadrement, les chauffeurs, les heures supp ; un jour incomplet écarté, les rôles sans ligne ; chaque anomalie écartée ou signalée avec sa raison, réintégrée ou écartée ; « hors » dans le total de l’unité ; la correspondance ; la sauvegarde sans heure ; le modèle CSV |
| `tests/calage-periode.test.cjs` | Le calage sur le réel (v1, banc d’essai, évolution 11 c, `moteur/calage-periode.js`) : réel = 0,8 × simulé, « × a » à 2 % près ; un réel constant, la constante ; un bruit sans lien avec le volume, refusé par le placebo ; un effet du jour de la semaine, « × a × jour », refusé s’il s’inverse d’un mois à l’autre ; a = 3, hors bornes ; un seul mois, des semaines seulement ; un a qui dérive, instable ; un candidat qui ne s’apprend pas sur une part ; Wilcoxon calculé à la main ; déterministe, 60 jours et 20 lignes en moins de 2 s ; le prévu calé et sa bande |
| `tests/calage-formes.test.cjs` | Le catalogue de formes du calage (v1, banc d’essai, évolution 17 a, `moteur/calage-formes.js`) : des heures fabriquées avec une graine en puissance, en logarithme, avec un plancher, avec un plafond — la bonne forme retenue, ses paramètres à 10 % près, sa formule en clair ; des heures constantes, la constante ; un bruit sans lien, rien de retenu ; vingt candidats sur du bruit pur, aucun retenu (le seuil du test divisé par le nombre de candidats) ; une forme plus riche retenue seulement si elle bat la plus simple de plus de 0,1 ETP ; les butées ; une seconde variable lue par une fiche ; une politique d’avant relue telle quelle, le même prévu ; les nouvelles formes gardées dans leurs bornes |
| `tests/calage-avant-17.cjs` | Le rapport d’un calage sans ce que l’évolution 17 (a) lui ajoute (candidats du catalogue, formule, choix, seuil corrigé), pour le comparer aux références figées avant elle |
| `tests/caler-periode.test.cjs` | L’outil `outils/caler-periode.cjs` (évolution 11) : la comparaison et le calage du module, avec ou sans `--sans-detail`, un réel en CSV ou en classeur, `--xlsx` (Lisez-moi, Réel, Comparaison, Calage), les erreurs (appel mal formé, réel refusé en nommant la ligne, période ou service inconnus) |
| `tests/sigma-unite.test.cjs` | La bande du total de l’unité (v1, banc d’essai, correction 16), sur trois lignes fictives : σ du total mesuré hors échantillon, plus large que √Σσ² quand les lignes dérivent ensemble, plus étroit quand elles se compensent ; la politique le garde, le prévu le prend et dit lequel ; une politique d’avant donne le prévu d’avant ; un σ du total invalide refusé ; le rapport d’avant en dehors des nouveaux champs ; la ligne de la page et des classeurs |
| `tests/politique-calage.test.cjs` | Se servir du calage (v1, banc d’essai, évolution 11 d) : la politique d’effectif gardée et relue, sans heure réelle, une sauvegarde forgée refusée ; le prévu calé d’un programme futur et sa bande, une ligne sans calage dans le total ; « × a × jour » sans date et le jour de travail d’une journée ; « Appliquer au barème » × 0,8 et « Annuler » à l’identique, le lavage et le handling refusés, une équipe d’appui, une annexe, l’ordre d’annulation ; après une nouvelle période, a = 1 à 2 % près ; une ligne dégradée ; la feuille Période et l’outil `simuler-periode`, avec et sans politique |
| `tests/rejeu-planning.test.cjs` | Le rejeu à effectif imposé (v1, banc d’essai, évolution 11 f) : le planning (noms sans casse ni accents, refus qui nomment la ligne) ; trois jours rejoués, effectifs et horaires imposés, une équipe absente qui ne travaille pas, une vacation qui passe minuit ; sans planning, rien ne change ; la comparaison du rejeu ; le calage du travail qui retrouve 1,3 à 4 % près ; les outils `--planning` et `--travail` |
| `tests/reel-absent.test.cjs` | Une cellule absente du réel n’est pas un zéro (v1, banc d’essai, correction 12) : un rôle sans ligne dix jours, ses jours hors de sa ligne ; une ligne à 0 h, un vrai zéro ; une ligne de deux rôles dont l’un manque, une cellule aux heures négatives, avec leur raison ; le total de l’unité qui saute et liste les jours où une ligne manque ; l’anomalie « rôle absent » en périodes ; le total aussi en validation par semaines ; la non-régression d’un réel complet (`tests/reel-complet.attendu.json`) |
| `tests/reel-vide.test.cjs` | Une case vide du réel n’est pas un zéro (v1, banc d’essai, correction 13) : des heures supp vides dix jours, hors des heures supp mais pas des ETP ; titulaires et intérim vides, le jour hors de la ligne (« heures vides ») ; l’intérim vide, les titulaires remplies : 0 ; un jour écarté, un double réintégré, le rejeu, un jour tout vide, le signal d’un mois à zéro ; la non-régression d’un réel complet |
| `tests/plusieurs-onglets.test.cjs` | Plusieurs onglets ne s’écrasent plus (v1, banc d’essai, correction 14) : le garde de `stockage.js` sur un stockage simulé ; les clés gardées (hors préférences d’affichage et tiroir de la v2) ; un seul onglet, les mêmes données champ par champ, plus la révision ; la même valeur réécrite sans révision ; deux onglets sans événement, B en retard n’écrit rien ; le retard relu à la révision ; tout effacer sans revenir à un numéro lu ; le signal d’un autre onglet ; un stockage plein |
| `tests/batterie.test.cjs` | La batterie dans un clone propre (correction 15) : sur un dépôt Git fictif, la copie sans les fichiers ignorés, les tests Node puis navigateur, un échec qui se voit et son journal, un commit joué dans un worktree retiré ensuite |
| `tests/indicateurs.test.cjs` | Les indicateurs de charge d’une journée (évolution 12 a) : une équipe de 2 et un lot de 600 homme-minutes, créneau par créneau (occupation 300 ÷ 420, consommé 600 ÷ 840, pic à 06:00) ; deux équipes qui se chevauchent ; un lot en file de 07:00 à 09:00 ; un robot et un tunnel de plonge ; une mise à disposition et une équipe d’appui sans objet ; le handling et un camion de trois vols ; une équipe à J−1 ; les renforts ; un robot dont la ligne s’arrête ; les heures sup ; une équipe sans personne ; la somme des « au travail » ; la non-régression ; les journées de référence |
| `tests/reponses.test.cjs` | Les cinq réponses d’une journée (v1, évolution 15 a, `moteur/reponses.js`), sur des journées fictives calculées à la main : un service en sous-effectif, un en sur-effectif, l’arrondi au service, le matin et l’après-midi ; un goulot « personnel », un « amont », une journée sans goulot, une équipe inoccupée qui ne dilue pas l’occupation ; un service qui finit après son horaire ; une journée sans retard (liste vide), un vol et une commande en retard avec leur cause, un vol pas chargé, un vol sans équipe ; deux essais comparés ; les seuils (défauts, enveloppe, refus nommé) ; l’outil `--reponses` ; le résultat et les indicateurs inchangés |
| `tests/seuils-alerte-browser.cjs` | Les seuils d’alerte dans la page (v1, évolution 15 a), sur l’unité fictive : les réponses de la page égales à celles du module, le réglage dans « Réglages de la simulation » gardé dans `ory-seuils-v1`, une valeur refusée en la nommant sans rien écrire, « Tout sauvegarder » et « Restaurer », une sauvegarde d’avant qui rend les défauts, une clé abîmée |
| `tests/synthese-vue.test.cjs` | La Synthèse sans navigateur (v1, évolution 15 b, `synthese-vue.js`) : les deux phrases en tête, « Les services » dans l’ordre du chemin (une ligne par service et jour, la file, la fin et les heures sup une fois par service), les tons seulement au-delà d’un seuil et jamais le rouge, la courbe (les créneaux de l’unité, un repère par départ, la bulle), les cartes (rien ne coince, rien en retard, l’essai seulement avec deux essais) |
| `tests/synthese-questions-browser.cjs` | La Synthèse dans la page (v1, évolution 15 b), sur l’unité fictive, à 1 280 et 1 920 px : les phrases et les chiffres du tableau égaux à ceux du module, la page tient sur la largeur, la bulle de la courbe (souris, flèches), le clic sur une ligne qui ouvre ce service dans le planning, la carte de l’essai seulement avec deux essais, une journée sans retard sans couleur critique |
| `tests/comparer-vue.test.cjs` | « Comparer deux essais » rangé selon les cinq questions (v1, évolution 15 c, `comparer-vue.js`) : le scénario d’abord, puis personnes, goulot, fins et heures sup, retards ; chaque ligne de `comparaison.js` trouve sa place ; une seule écriture du temps (« 3 h 47 », jamais « 227 min » ; « 69 h » de travail, l’écart et le verdict lus sur les heures affichées) ; un nom de fichier qui contient « 90 min » reste tel quel |
| `tests/reponses-classeur.test.cjs` | La feuille « Réponses » du classeur de la journée (v1, évolution 15 e, `echanges-reponses.js`) : à la fin, les autres feuilles telles quelles ; les cinq réponses dans l’ordre du contrat, celles du module ; « Aucune exception », « Sans second essai » ; avec deux essais, ce que change le scénario ; de vraies heures Excel ; l’outil `simuler-journee --xlsx` écrit la même feuille |
| `tests/non-regression-15.test.cjs` / `tests/empreintes-resultats.cjs` | La non-régression de l’évolution 15 : le JSON de `simuler-journee` et de `simuler-periode`, et chaque feuille de leurs classeurs, ont les empreintes calculées sur le commit d’avant l’évolution (unité et vols fictifs) ; le classeur de la journée gagne la seule feuille « Réponses » |
| `tests/captures-resultats-browser.cjs` | Les captures de contrôle des résultats (v1, évolution 15 e), sur l’unité et les vols fictifs, en thème clair et sombre, à 1 280 et 1 920 px : la Synthèse avec et sans goulot, avec et sans retard ; Détails (Commandes, Vols) ; la Période ; chacune vérifiée, gardée hors du dépôt (`$ORY_CAPTURES`) |
| `tests/captures-correction-18-browser.cjs` | Les captures de contrôle de la correction 18 (v1), sur des données fictives, en thème clair et sombre, à 1 366 × 768 et 1 920 × 1 080 : la Synthèse (« rien ne coince » ; un goulot dû à une mise à disposition fermée ; le tableau avec « Personnes sans travail » et « Attente d’un arrivage ») et le planning des équipes de l’unité fictive de 15 services (replié, un service déplié, en plein écran) ; chaque capture vérifiée et gardée hors du dépôt (`$ORY_CAPTURES`) |
| `tests/ordre-services.test.cjs` | L'ordre des services (v1, correction 17 b, `moteur/ordre-services.js`) : trois chemins fictifs qui se croisent, l'égalité (l'ordre du premier chemin), un service hors chemin en fin de liste, une case sans équipe, les boucles et les chemins mal formés ; le même ordre pour les lignes de la Synthèse, les groupes du planning et les colonnes de la Période ; sans chemin, l'ordre d'avant |
| `tests/ordre-services-browser.cjs` | L'ordre des services dans la page (v1, correction 17 b), sur l'unité fictive : la Synthèse, le planning des équipes et la page Période affichent l'ordre du module ; aucun service avant un service qui l'alimente ; les services hors chemin à la fin |
| `tests/reponses-arrivages.test.cjs` | Des attentes qui disent vrai (v1, correction 18 a), sur des journées fictives calculées à la main : des lots livrés ensemble (à l'ouverture, ou une heure après) n'attendent pas ; trois arrivages dont le deuxième attend 3 h ; une plonge par vol ; les personnes sans travail en trois moments, dont la somme est le temps sans travail des indicateurs ; une équipe arrivée avant l'ouverture d'une mise à disposition (nommée, avec son heure, jusque dans la cause du goulot) ; un dépassement de 10 min ne fait pas un goulot, un de 40 min en fait un ; deux services rangés par heures sup ; un vol en retard sans dépassement ; un besoin non mesuré hors du besoin ; cinq seuils, les mêmes clés et les mêmes défauts ; la non-régression du résultat et des indicateurs |
| `tests/periode-lisible-browser.cjs` | La page Période se lit sans chercher (v1, correction 17 d), sur l'unité fictive, à 1 280 px : la colonne « Unité » juste après le jour, visible sans faire défiler ; les champs « 7,5 h titulaire » et « 7 h intérim » montrent leur valeur entière, à la française (une valeur refusée est nommée) ; les jours incomplets expliqués une seule fois, en une phrase, le détail dépliable ; (correction 18 c) « Période simulée : … » une seule fois sur la page Période, dans sa carte — ni dans la bande du haut, ni en notification ; ailleurs, la bande la garde |
| `tests/reponses-vrai.test.cjs` | Des lignes qui disent vrai (v1, correction 17 c), sur des journées fictives calculées à la main : un service permanent et un d'appui (« fixe », pas d'écart, hors de « Il faut ») ; un handling à chauffeurs (les mêmes personnes dans Présents, Matin et Après-midi, une note sur ce qui n'est pas compté) ; un surplus sans couleur d'alerte et un manque avec ; les seuils par défaut (6 h, 3 personnes) et un réglage enregistré inchangé ; des lots qui attendent 2 h dans l'horaire (« rien ne coince ») ; un service qui dépasse le seuil et son horaire, ou fait partir une commande en retard (le goulot) ; deux essais (« fixe », pas « absent ») |
| `tests/reponses-jours.test.cjs` | Le jour de travail jusqu'au bout de la ligne (v1, correction 17 a), sur une journée fictive calculée à la main : un service avec une équipe la veille et une le jour des vols a deux lignes, chacune avec sa fin, sa fin d'horaire, son dépassement, ses heures sup, sa file et son attente ; la somme des lignes fait le service ; chaque ligne dit son jour ; le goulot dit le sien ; la feuille « Réponses » et « Comparer deux essais » aussi |
| `tests/reponses-fins.test.cjs` | La fin d'un service contre l'horaire de ses équipes du jour (v1, correction 18, retouches), sur des journées fictives calculées à la main : trois équipes, une absente, une qui dépasse — la fin d'horaire est celle des équipes qui travaillent ; l'équipe qui dépasse est nommée avec sa fin et son horaire (la ligne, la carte « Où ça coince », la feuille « Réponses ») ; un petit dépassement ; un service dont aucune équipe ne travaille ; une équipe d'appui ; le tableau à onze colonnes |
| `tests/synthese-largeur-browser.cjs` | Le tableau « Les services » à 1 366 × 768 (v1, correction 18, retouches), sur l'unité fictive (des retards ; une équipe qui dépasse ; des noms longs) et l'unité fictive de 15 services : onze colonnes à l'écran, ni le tableau ni la page ne défilent en largeur, 100 px de marge au moins ; l'équipe qui dépasse et les heures sup sous la fin |
| `tests/periode-unite.test.cjs` | La page Période sans navigateur (v1, évolution 15 d) : la colonne « Unité » égale à la somme des services, le pic et l'occupation de l'unité (`chargeDeLUnite`), la moyenne des personnes seule, un seul bloc dans un mois, les jours complets d'abord, une seule écriture du temps, la courbe (un point par jour, le réel) |
| `tests/calage-bases.test.cjs` | La correspondance propose 7,5 h / 7 h par ETP quand rien n'est réglé, sans l'enregistrer ; un réglage enregistré ne change pas ; le moteur garde ses 7 h (v1, évolution 15 d) |
| `tests/periode-page-browser.cjs` | La page Période dans la page (v1, évolution 15 d), sur l'unité fictive : la colonne Unité, la courbe (souris, flèches) et le réel importé, la première colonne collante et le défilement qui se voit à 760 px, les moyennes des personnes, un seul bloc dans un mois, les jours complets d'abord, aucune durée en minutes au-delà de 60, les bases de la correspondance |
| `tests/details-browser.cjs` | Moins de pages (v1, évolution 15 c), sur l’unité fictive : le menu des Résultats et les onglets de « Détails » dans l’ordre (au clavier, le focus reste dans les onglets), les anciens identifiants et « Aller à… », les compteurs égaux sur la Synthèse et dans « Détails », les exceptions d’abord, aucune durée en minutes au-delà de 60, pas d’alerte de stock sans seuil, « Bouchon » selon le sale du soir et le seuil d’attente, « À regarder » qui se tait |
| `tests/classeur-compresse.test.cjs` | Le classeur compressé (v1, banc d’essai, correction 16 c) : 60 journées fictives, relu identique feuille par feuille, au moins trois fois plus léger, le même fichier pour les mêmes données ; le chemin du navigateur (CompressionStream), et sans lui le classeur tel quel ; un classeur d’avant non compressé qui se relit ; les outils `simuler-periode` et `simuler-journee` qui écrivent compressé |
| `tests/indicateurs-definitions.test.cjs` | Trois définitions des indicateurs de charge (v1, banc d’essai, correction 16), sur des journées fictives : le disponible = personnes × (présence − pauses prises) + heures sup, une plonge en heures sup sous 100 %, une équipe qui n’atteint pas sa pause ; « en appui ou à disposition », les quatre catégories font les présents ; le débit en vols servis d’une équipe aux lots « @… », sans vol « sans objet » ; les renforts reçus et un lot coupé dans le consommé ; la non-régression sur les journées de référence |
| `tests/import-flights.test.cjs` | L’export « Flights » de Winrest lu tel quel (v1, banc d’essai, évolution 13 a, `moteur/import-flights.js`), sur des exports fictifs calculés à la main : chaque règle de 1 à 12 (les colonnes par leur en-tête, une livraison = un vol, la Guest qty comptée une fois, la table des Guest types, les statuts, ICAO et Flight No exclus, les codes compagnie, le vol_id et « -2 », le vol sans repas, les réserves fondues ou orphelines, les vols fictifs aux lignes annulées, le tri et les colonnes du CSV daté) ; le rapport d’import ; les points à vérifier ; aucun prix dans la sortie ; les refus qui nomment la colonne ou la ligne ; 50 000 lignes en moins de 10 s |
| `tests/import-flights-regles.test.cjs` | Les règles d’import Winrest gardées (v1, banc d’essai, évolution 13 b) : la clé `ory-import-winrest-v1` et son enveloppe (schéma, version, règles complètes) ; l’aller-retour à l’identique ; une enveloppe ou une règle invalide refusée, nommée ; la clé dans « Tout sauvegarder », retirée à la restauration si elle manque |
| `tests/import-flights-sauvegarde-browser.cjs` | Les règles d’import Winrest dans « Tout sauvegarder » et « Restaurer » : les défauts sans clé, l’enveloppe enregistrée, une règle invalide ou inconnue qui refuse la sauvegarde entière sans rien remplacer, la restauration à l’identique, une sauvegarde d’avant qui rend les défauts, une clé abîmée lue comme les défauts |
| `tests/import-flights-browser.cjs` | L’export Winrest dans la page (v1, banc d’essai, évolution 13 c), sur un export fictif : l’import « Export Winrest (Flights) » à côté de celui des vols, le programme daté chargé, le rapport (les totaux, les listes repliées, le texte piégé qui reste du texte, aucun prix), le classeur du rapport compressé, les règles d’import (exclusion, code compagnie, vol fictif, Guest type, refus sous le champ), le réimport et sa question, les refus, 50 000 lignes en moins de 10 s, les couleurs en clair et en sombre |
| `tests/import-flights-classeur.test.cjs` | Le classeur du rapport d’import Winrest (évolution 13 c, `echanges-import-flights.js`) : les totaux de la page et du Lisez-moi, une feuille par liste, de vraies dates Excel, aucun prix, un rapport vide |
| `tests/importer-flights.test.cjs` | L’outil `outils/importer-flights.cjs` (évolution 13 d), sur un export fictif tiré de l’unité fictive des tests : le CSV daté du module avec les règles de la sauvegarde, `simuler-periode` qui le lit tel quel, les défauts sans sauvegarde ou avec une sauvegarde d’avant, `--rapport` et `--xlsx` (compressé), aucun prix, les refus (appel, option sans valeur ou répétée, sortie qui écraserait l’export ou la sauvegarde, colonne manquante, règle forgée, fichier trop gros, rien de gardé) |
| `tests/indicateurs-periode.test.cjs` | Les indicateurs de charge sur une période (évolution 12 b) : une équipe à J−1 au jour des vols − 1, un jour de travail qui réunit J−1 et J ; par équipe et par jour de travail ; un jour incomplet hors des moyennes, la somme sur la période égale à celle des jours, le plus haut pic ; sans indicateurs dans les extraits, le bilan d’avant champ par champ ; le débit du handling sur la période, une mise à disposition sans objet ; deux mois, une période vide ; 60 journées de 50 vols en moins de 2 s |
| `tests/charge-browser.cjs` | La vue « Charge » de la page Planning (v1, évolution 12 c), sur une unité et des vols fictifs : la courbe de chaque service sur sa ligne du planning, sur l’échelle de ses barres (évolution 14 c, correction 18 b : un trait par lot, plus de barres de file), le tableau dessous ; les indicateurs de la page égaux à ceux de l’outil ; une courbe par service et son pic (la cuisine à J−1, la veille) ; le tableau des équipes et ses « sans objet » ; la bulle d’un créneau ; les couleurs en clair et en sombre ; un nom piégé qui reste du texte ; la page Période (pic au travail, occupation, totaux et moyennes) et le clic qui ouvre la page Planning ; le tableau des équipes replié par défaut et le choix gardé (correction 16 d) |
| `tests/charge-export.test.cjs` | Les indicateurs de charge dans les classeurs et le JSON des outils (v1, évolution 12 d), sur une unité et des vols fictifs : le classeur de la journée (Charge, une ligne par équipe ; la veille datée ; « sans objet » vide et dit), la feuille Créneaux (sommes, horloge du jour de travail, pas de ligne vide), relu par `tableur.js` et déterministe ; la période (deux feuilles après Équipes, les autres inchangées ; sans indicateurs, le classeur d’avant) ; `simuler-journee` et `simuler-periode`, leur JSON et `--xlsx` |
| `tests/vacations-longues.test.cjs` | Les vacations longues (v1, banc d’essai, évolution 11 e) : une présence au contrat sur l’encadrement d’un service et sur une équipe, les heures sup d’office (2 personnes 10 h pour 7 h 30 : 5 h par jour) ; l’ancienne forme de l’encadrement lue et inchangée ; la comparaison au réel qui les ajoute ; la non-régression ; le classeur de la période avec et sans |
| `tests/periode-export.test.cjs` | Le classeur d’une période (v1, banc d’essai, évolution 10) : les huit feuilles et leurs colonnes, le Lisez-moi, de vraies dates Excel (la veille comprise), les lignes du bilan et de chaque journée, la charge et l’arrondi au service (évolution 11 a), relu par `tableur.js`, filtres et volets figés, déterministe ; deux mois fictifs écrits en quelques secondes |
| `tests/handling-vagues.test.cjs` | Le handling 24 h/24 par vagues (v1, banc d’essai, évolution 8) : le véhicule selon l’heure de départ (la journée, les chauffeurs et le plan de chaque véhicule) ; plusieurs vols par tournée (6 départs en 2 tournées de camion, 9 en une tournée de VL, un vol qui ne tiendrait pas dans une autre, une vague qui attend un vol pas prêt, pas de vague plus chère en minutes-chauffeur, le quai par vol, l’échange avion par avion), dans la journée et dans le plan des chauffeurs (la borne basse sous le résultat, le déterminisme et le temps de calcul) ; l’échange sur le même avion par compagnie (aucune tournée de déchargement à part) ; les durées en VL ; la validation, Excel, les options du banc |
| `tests/chauffeurs-calcules.test.cjs` | Les chauffeurs calculés au plus juste (v1, banc d’essai) : des tournées qui ne se chevauchent pas demandent un chauffeur, deux long courrier simultanés quatre, l’enchaînement baisse le besoin, aucun vol en retard faute de chauffeur, la borne basse sous le résultat, la flotte respectée, le mode « saisis » inchangé ; pauses, heures fixes, sortie, selon la préparation, déterminisme et temps de calcul, validation, Excel, options du banc |
| `tests/spml-cabines.test.cjs` | Les SPML par cabine (v1, banc d’essai) : un vol qui n’a que des SPML éco n’entre pas dans la commande SPML d’un service réglé sur BC et PC, mais dans celle d’un service sans réglage ; un import sans les nouvelles colonnes ne change rien ; somme, détail incomplet, effectif calculé, validation, options du banc, Excel |
| `tests/spml-cabines-browser.cjs` | Les SPML par cabine dans la page : l’import du détail, le réglage par service (Réglages de la simulation), « Tout sauvegarder » |
| `tests/plonge-nuit.test.cjs` | La plonge qui ne vient que s’il reste du sale (v1, banc d’essai) : sous le seuil, fermée et sans personne ; au-dessus, ouverte, elle lave ; un shift après minuit compte le jour où il commence ; le sale de la veille lavé (liste ou nombre) ; l’heure de la mesure, deux équipes conditionnelles, au débit, l’enchaînement des jours ; déterminisme, validation, options du banc, Excel |
| `tests/plonge-nuit-browser.cjs` | La plonge conditionnelle dans la page : la case, l’heure et le seuil dans la fiche de la plonge, son bilan du jour, le sale de la veille (Réglages de la simulation), « Tout sauvegarder » |
| `tests/ordre-souple.test.cjs` | L’ordre souple (v1, banc d’essai) : lot 1 pas prêt, lot 2 prêt, le lot 2 d’abord ; la priorité de la liste entre lots prêts ; les commandes réunies par « + » ; aucun lot prêt, le premier qui le devient ; désactivé, la même journée ; la règle d’une équipe ; avec les heures sup ; déterminisme, validation, options du banc, Excel |
| `tests/ordre-souple-browser.cjs` | L’ordre souple dans la page : la case des Réglages de la simulation, l’ordre des lots dans la fiche d’une équipe, le rechargement, « Tout sauvegarder » |
| `tests/mise-a-disposition-servie.test.cjs` | Une mise à disposition fermée ne bloque pas une équipe déjà servie (v1, banc d’essai) : un robot qui enchaîne après la fermeture du magasin ne l’attend plus ; une équipe qui commence avant l’ouverture l’attend pour son premier lot, et seulement lui ; une journée magasin ouvert ne change pas |
| `tests/heures-sup-personnes.test.cjs` | Les heures sup en minutes × personnes (v1, banc d’essai) : d’une plonge à tunnels, seules les personnes des tunnels qui finissent un vol après la présence ; un tunnel à vitesse 2 ; une plonge sans tunnels et une équipe à la main : heures sup × personnes ; sans l’option, 0 ; le récap des cases |
| `tests/heures-sup-personnes-browser.cjs` | La Synthèse compte les heures sup de la plonge avec les personnes des tunnels restés |
| `tests/heures-sup-sans-attente.test.cjs` | En heures sup, on ne paie personne à attendre (v1, banc d’essai) : un dernier lot prêt 2 h après la présence est hors poste, sans heure sup ; un lot commencé finit en heures sup ; un lot prêt à la fin de la présence est fait, puis l’équipe part au premier lot pas prêt ; le robot ; le renfort en heures sup ; sans l’option, comme avant |
| `tests/plonge-heures-sup.test.cjs` | La plonge en heures sup (v1, banc d’essai) : elle finit le vol dans son tunnel et ne commence pas celui qui attend (il va à la nuit, ou au sale de fin de journée) ; une nuit ne commence aucun vol après la fin de sa présence ; le retard compte ce que l’après-midi n’a pas commencé ; sans l’option, rien ne change ; déterminisme |
| `tests/plonge-absorbable.test.cjs` | La plonge de nuit qui ne vient que si le matin ne peut pas absorber le retard (v1, banc d’essai) : un petit retard absorbé la laisse fermée (la journée de l’unité sans elle), tout juste à la fin de la présence ; un gros retard l’ouvre, avec le dépassement du matin ; une seule plonge ; des heures sup pour l’absorber ne comptent pas ; l’équipe par défaut et l’équipe désignée ; au débit ; avec une plonge sur le sale ; déterminisme, validation, options du banc, Excel |
| `tests/plonge-absorbable-seule.test.cjs` | La plonge de nuit sur le retard juge l’équipe du matin seule (v1, banc d’essai) : seule, elle lave le retard et ses retours avant la fin de sa présence, la nuit reste fermée même si au rejeu l’après-midi prend un de ses retours ; 20 min de dépassement l’ouvrent ; les autres cas et la condition « sale » ne changent pas ; déterminisme |
| `tests/plonge-absorbable-browser.cjs` | Cette règle dans la page : la règle et l’équipe désignée dans la fiche de la plonge, son bilan du jour, le rechargement, « Tout sauvegarder » |
| `tests/renforts.test.cjs` | Les renforts de la v1 (banc d’essai) : sans renfort possible, la même journée ; une équipe qui finit à 10:00 aide une équipe qui aurait débordé de 60 min, et le débordement baisse selon l’efficacité ; la matrice interdit un passage ; familles ; `personnesMax` ; un renfort part à la fin de sa présence ; l’amont ; l’ordre des équipes aidées ; pauses ; robot ; handling ; déterminisme, validation, options du banc, Excel |
| `tests/renforts-browser.cjs` | Les renforts dans la page : la case et ses réglages (Réglages de la simulation), qui peut aider qui, les postes de travail d’une équipe, le tableau de la Synthèse, « Tout sauvegarder » |
| `tests/chauffeurs-calcules-browser.cjs` | Les chauffeurs calculés dans la page : le mode et ses réglages dans la fiche du handling, rangés avec l’équipe seulement saisis, le plan lisible comme des créneaux, « Tout sauvegarder », la reprise en créneaux saisis |
| `tests/programme-date-browser.cjs` | Le programme daté dans la page : « Modèle CSV daté », le rapport d’import de la période et du jour sans vol, le refus d’une ligne non datée, l’export Excel avec la date en première colonne |
| `tests/periode-browser.cjs` | La période dans la page (v1, banc d’essai, évolution 10) : sans programme daté rien de nouveau ; le sélecteur de journée de vols ; « Simuler la période » par étapes, Annuler ; le bilan de la page = celui du moteur ; la journée affichée part du sale laissé la veille dans la période, puis, « à relancer » après un réglage modifié, du sale saisi ; la page Période (jours incomplets, totaux et moyennes par mois, la charge, les personnes du service et le surplus d’arrondi, un clic ouvre la journée, le détail par équipe et par compagnie) ; « Exporter les résultats » propose le classeur de la période, le même que l’outil (`--xlsx`), la journée reste en JSON |
| `tests/handling-vagues-browser.cjs` | Le handling 24 h/24 par vagues dans la page : le véhicule d’une compagnie selon l’heure de départ, les vols par VL, le quai par vol de plus, l’échange sur l’avion et les durées en VL, rangés avec l’équipe seulement saisis, le bilan des tournées, le rechargement, « Tout sauvegarder » |
| `tests/handling-24h-browser.cjs` | Le handling 24 h/24 dans la page : la case et les réglages de la fiche, rangés avec l’équipe seulement saisis, l’heure_eta de l’import, le bilan des tournées, la page des départs, « Tout sauvegarder » |
| `tests/heures-sup-browser.cjs` | Les heures supplémentaires dans la page : la case et le plafond des Réglages de la simulation, rangés avec le barème, gardés au rechargement et dans « Tout sauvegarder » ; la Synthèse par service et par équipe ; désactivées, rien ne se montre |
| `tests/journee-browser.cjs` | Le banc d’essai joue la journée de la page : pour la démo et une unité fictive, « Tout sauvegarder » et le programme, rejoués par l’outil, rendent la journée de la page ; restaurée, la sauvegarde redonne la même journée |
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
| `tests/armement-chemins-browser.cjs` | Armement intégré à tous les chemins, relié seulement au handling (v1 et v2) : migration au chargement (par compagnie, cases reprises, branche à part dans chaque chemin, sorti du milieu d’un chemin), pas de trou, le handling attend l’armement ; un nouveau chemin sans armement n’est pas à reprendre, un armement mal relié se relie d’un clic, « Annuler », une seule fois |
| `tests/nom-equipe-browser.cjs` | Le nom d'une équipe (v1 et v2) : « CRL » en Dotation quand la Cuisine a le sien ; vide ou déjà pris dans le service : refusé, et le champ revient au nom gardé ; plus de « nommez-le » |
| `tests/parallele-browser.cjs` | Un service en même temps qu'un autre (v1 et v2) : une cuisine chaude en atelier unique, « en même temps que Cuisine » — plus de flèche entre elles, les mêmes entrées et sorties ; une compagnie cochée ensuite s'y range ; « aucun » garde les chemins |
| `tests/focus-browser.cjs` | Le focus se voit partout (v1 et v2, thèmes clair et sombre) : sur chaque page, chaque élément atteint au clavier porte un anneau (contour, ombre pleine ; dans un diagramme, le trait du nœud ou la bande du lien) ; le thème choisi est retenu, et s’efface revenu au clair |
| `tests/coquille-browser.cjs` | La coquille (v1 et v2) : barre latérale sur toute la hauteur, chaque page en deux clics (sa partie, puis elle, dépliée dessous), fil d’Ariane (la partie mène à sa première page), flèches haut et bas, sauvegarde au pied ; un seul Annuler / Rétablir pour ce que la page modifie (cases, barème, plan en édition), au bouton et au clavier (Ctrl Z, Ctrl Maj Z, Ctrl Y), jamais dans un champ de texte ; barre repliée pendant l’édition du plan ; rien de coupé à 1 280 et 1 024 px, sur toutes les pages |
| `tests/notifications-browser.cjs` | Le retour des gestes (v1 et v2) : supprimer une case sans question, « Annuler » qui la rend ; une notification par source et par geste, trois au plus ; refus annoncé, routine muette ; un geste sur deux historiques défait d’un bloc ; la question pour supprimer un service et ses équipes (Échap, « Ne rien changer », puis « Supprimer le service » et « Annuler ») ; aucune boîte du navigateur |
| `tests/problemes-browser.cjs` | Le registre des Problèmes (v1 et v2) : le nombre au pied de la barre, les trois niveaux, les nombres des onglets qui en dérivent, « Contrôles détaillés » qui compte pareil, un problème qui mène à sa page (un service à sa fiche), Échap, l’attente pendant l’édition du plan |
| `tests/problemes.test.cjs` | Le registre, en Node : ses niveaux, ses pages, et les nombres de chaque onglet ; une source en panne ne le bloque pas |
| `tests/plan-unite-browser.cjs` | Le plan de l’unité a sa page (v1 et v2) : Équipes › Plan de l’unité ouvre l’édition, le menu attend, « Terminer » ramène à la page d’avant, la page n’est pas retenue ; calques à gauche, toile au centre (barre d’outils flottante), inspecteur à droite ; calques par type, cadenas en pictogramme ; poignées carrées de 8 px à tout zoom, taille affichée, zone fixée expliquée ; contours constants ; « Modifier le plan » et la fiche d’un service y mènent. Aucune capture d’écran |
| `tests/rejeu-browser.cjs` | Rejouer la journée (v1 et v2, sans le plan privé et avec une tuile fictive hors du dépôt, `tests/plan-fictif.cjs` : la même mise en page) : le plan occupe au moins 75 % de la hauteur utile, la barre de lecture en bas, indicateurs, légende et zoom posés sur le plan ; « En ce moment » se replie et le choix est retenu ; replié d’office sur un écran étroit ; l’édition garde son panneau ; rien à relire, la barre dit pourquoi. Aucune capture d’écran |
| `tests/donnees-intactes-browser.cjs` | Le garde-fou de la refonte de l’interface (v1 et v2) : une unité complète, parcourue page par page (plan ouvert en édition puis refermé, thème changé), garde toutes ses clés du navigateur identiques après rechargement ; la journée calculée donne les nombres relevés avant la refonte (`tests/donnees-intactes.attendu.json`) |
| `tests/sans-armement-browser.cjs` | Des compagnies sans armement, déduites (v1 et v2) : un chemin à elle sans armement et cochée dans une équipe — armée, la fiche le dit ; décochée — plus de case, « Sans armement : TX », rien à reprendre ni à cocher, aucune alerte ; plus de colonne « Armée » ; l’armement remis dans son chemin, elle est à cocher |
| `tests/armement-vols-browser.cjs` | L'armement suit toujours les vols (v1 et v2) : jamais constant (un ancien choix s'efface), minutes par vol × vols de chaque compagnie, plus de minutes → plus de monde, fiche sans case « constant », vols du jour et journée par compagnie, saisie sans erreur de page |
| `tests/liste-commandes-browser.cjs` | Liste des commandes (Chemin d’une commande, v1 et v2) : la recherche n’est pas recouverte, la liste défile seule, un clic en bas de liste ne la ramène pas en haut, une commande ouverte d’ailleurs est amenée en vue |
| `tests/jeu-essai.test.cjs` | Jeu de démonstration (v1 et v2) : ni QR ni DL, 12 départs et 6 retours ; compagnies utilisées ; vols d’essai avec les seules classes préparées |
| `tests/jeu-essai-browser.cjs` | Jeu d’essai dans le site (v1 et v2) : QR et DL retirées d’un état enregistré (une fois), vols d’essai pour EZY, RAM, DAH et leur case d’armement, une compagnie cochée reçoit ses vols sans recharger |
| `tests/vols-fixture.cjs` | Programme figé (l’ancien jeu, fictif) pour les tests d’échanges Excel |
| `tests/saisie-heure-browser.cjs` | Taper une heure touche par touche (Récap des cases, fiche d’une case) : rien n’est arraché, Entrée ou quitter le champ enregistre, le tableau garde son défilement |
| `tests/champs.test.cjs` | L’heure tapée → « HH:MM » (« 0430 », « 4h30 », « 7 »…), une heure impossible refusée jamais devinée, ↑↓ au quart d’heure, Maj à l’heure, dix pas dans les bornes ; v1 et v2 portent le même `champs.js` |
| `tests/champs-browser.cjs` | Les champs dans un navigateur en anglais (v1 et v2) : plus de champ natif ni de « AM » ; frappe, Entrée, Tab ; « 2500 » et un champ vidé refusés sous le champ, la valeur gardée remise, retaper efface ; ↑↓ et Maj+↑↓ ; un nom d’équipe ou de service refusé sous son champ, sans notification ; les heures gardées restent « HH:MM » |
| `tests/fiche-service-browser.cjs` | La fiche d’un service en feuille de propriétés (v1 et v2) : sections repliables, repli gardé d’un service à l’autre et au rendu, Entrée au clavier ; l’avancé replié qui dit ce qui y est réglé ; la règle ⚡ dans « Plus de réglages », dont la ligne dit ce qui est réglé ; la matrice (en-têtes collants, ligne et colonne survolées, Espace) ; rien ne change dans les données |
| `tests/tableaux-browser.cjs` | Les tableaux d’heures et d’horaires au clavier (v1 et v2) : Horaires (case à gauche, service en cours sous les titres), Entrée qui enregistre et descend dans la même colonne, Maj+Entrée qui remonte, une heure refusée en descendant ; Heures de travail (nombres à droite, 0,3 h gardées 18 min, Entrée dans la colonne, sans saut) ; planche retour et barème marqués |
| `tests/palette-browser.cjs` | Les finitions (v1 et v2) : « Rien à calculer » puis « Calcul à jour », son point qui bat, vers la synthèse ; la palette (Ctrl K l’ouvre et la referme, le focus dans son champ, gestes et pages sans texte, une équipe et une commande sans accents, ce qui répond marqué, les flèches, Entrée et le focus rendu à la page, Échap, un clic, rien de trouvé dit, pas pendant la modification du plan, aucune donnée enregistrée) ; la fiche des raccourcis (« ? », pas dans un champ) ; Espace sur le plan rejoué (pas sur un bouton) ; les mouvements, et plus aucun quand les animations sont réduites |
| `tests/palette.test.cjs` | Ce que la palette trouve et dans quel ordre : gestes et pages sans texte, sans accents ni majuscules, début du nom d’abord, tous les mots, au plus N par groupe ; le surlignage échappé ; v1 et v2 portent la même `palette.js` |
| `tests/latence-browser.cjs` | La latence d’un changement, sans chronomètre (v1 et v2) : un bilan par service au plus pendant un changement ; aucun sur une page qui n’en a pas besoin, le registre des problèmes refait juste après et son compte suivi ; le menu jamais mesuré quand il ne change pas |
| `tests/graphiques-browser.cjs` | Le planning, la frise des vols et les stocks (v1 et v2) : la palette des données, une barre par lot à l’heure de son lot ; l’étiquette quand elle tient, et seulement alors ; la bulle tout de suite au survol, plus de `<title>` natif ; le trait « maintenant » absent avant le rejeu, à l’heure rejouée ensuite (planning, frise, plonge), qui suit la lecture, sans repère d’axe dessous, et s’en va au début ; la valeur d’une courbe de stock à l’heure survolée, d’après le calcul |
| `tests/accueil-browser.cjs` | La page d’entrée (`accueil.html`) : les jetons, la police et les deux thèmes du design system, sans la grille de l’application (elle défile, rien ne déborde à 390 px) ; les deux applications au clavier avec l’anneau de focus ; rien n’est écrit |
| `tests/parite.test.cjs` | v1 et v2 portent les mêmes fichiers communs (le design system, les vues, le noyau) : une retouche faite d’un seul côté échoue ici |
| `tests/ds.test.cjs` | La largeur estimée d’une étiquette, l’heure du trait (minutes, la veille négative, rien sinon) ; v1 et v2 portent le même `ds.js` |
| `tests/synthese-browser.cjs` | La synthèse (v1 et v2) : les mêmes nombres qu’avant, recalculés depuis les indicateurs comme l’ancienne synthèse les écrivait ; quatre cartes avec un handling, Vols · Commandes · Équipes, le problème des commandes sans équipe ; chaque carte et chaque ligne mènent à leur page ; la comparaison A/B et son écart signé, fléché, coloré |
| `tests/secours-browser.cjs` | Un démarrage resté en plan ouvre la page de secours ; elle rend les données en sauvegarde, repart sans les cases, puis les remet |
| `tests/recap-cases-browser.cjs` | Récap des cases : une ligne par case, tâche unique / à la suite / ensemble, départ et jour modifiables, chercher, fichier de paramétrage exporté puis réimporté |
| `tests/robot-browser.cjs` | Le Robot : service créé et rattaché au Montage, remplace le Montage sur TX, CRL et FBU Économie (une fois), une case Robot, plateaux ÷ débit, débit et effectif dans le récap et la fiche |
| `tests/robot-calcule-browser.cjs` | Le robot calculé dans la page (v1, banc d’essai, évolution 9) : sous le Montage, son effectif saisi et son débit au récap ; ses heures par vol saisies dans Barème, il se calcule (au moins son minimum), « calculé » dans sa fiche, ses heures par vol au récap, sa ligne à la même durée ; « Constant (saisi) » rend son effectif ; le barème exporté lui donne ses lignes ; après rechargement, le même calcul ; ses heures par vol retirées, son effectif saisi revient ; chaque étape attend son effet, pas un délai (correction 18 c) |
| `tests/calage-browser.cjs` | « Réel et calage » dans la page Période (v1, banc d’essai, évolution 11), avec des fichiers fictifs : le modèle CSV ; la période simulée, le réel importé ; la correspondance faite dans la page (une ligne depuis un rôle, ce qu’elle couvre), les rôles sans ligne ; une cellule en double écartée puis réintégrée ; la comparaison = celle du module ; « Caler », le rapport du module ; « Garder comme politique d’effectif », le prévu calé de chaque jour, dans la Synthèse et la feuille Période ; « Appliquer au barème » puis « Annuler » à l’identique, la période à relancer, un nouveau calage à a ≈ 1, « à refaire » ; les vacations longues saisies dans la page, leurs heures sup d’office dans la période ; le planning importé, le rejeu et sa progression, « Caler le travail » annulé puis fait, un facteur de travail appliqué puis annulé ; les exports JSON et Excel ; « Tout sauvegarder » emporte les réglages, sans heure ; après rechargement, la correspondance reste, le réel non |
| `tests/recap.test.cjs` | Récap des man-minutes : d’où vient chaque valeur, totaux, fichier de paramétrage (aller-retour sans changement, grosses modifications, erreurs), ligne récap par compagnie (armement) |
| `tests/recap-browser.cjs` | Équipes › Minutes de travail : une ligne par commande, modifier / vider une case, sur la journée, chercher, export puis import |
| `tests/recap-compagnie-browser.cjs` | Minutes de travail et armement (v1 et v2) : un bloc par compagnie, sa ligne total en tête (somme de ses classes), classes repliables, minutes par vol modifiables (reliées à la fiche de l’armement), retour à la valeur commune, effectif, Annuler, sur la journée, recherche |
| `tests/chemin-choisi.test.cjs` | Choisir le chemin d’une commande (v1 et v2) : liste des chemins, flux choisi, retour au flux de sa classe, chemin à part qui devient partagé |
| `tests/chemin-choisi-browser.cjs` | Le chemin d’une commande dans une liste (v1 et v2) : « Qui suit quel chemin » (Flux de production) et « Chemin suivi » (Chemin d’une commande) ; un flux créé de toutes pièces se choisit, le calcul le suit ; un chemin à part choisi devient partagé, et c’est dit |
| `tests/vue-ensemble-browser.cjs` | Chemins lisibles avec beaucoup de services (v1 et v2) : Vue d’ensemble (une colonne par flux, une ligne par service par étape, pastilles, case vide qui fait passer un flux puis Annuler, pastille qui ouvre le flux sur ce service), diagramme en étapes (de haut en bas, bandes, sans défilement de côté), chaîne éclairée au survol, « En ligne » retenu pour tous les diagrammes |
| `tests/defilement-browser.cjs` | La page entière ne défile jamais, seule la vue (v1 et v2) : fiche Plonge avec son équipe, molette sur la fiche puis sur l’en-tête (qui reste en place), jamais bloqué en bas : descendu sur la fiche, on remonte la souris sur la liste de gauche (Services et équipes, Chemin d’une commande), la Liste des services et chaque service de Services et équipes, aucun « piège à molette » (zone qui garde la molette dans une zone qui défile, bloquant sous Firefox et Safari), le tableau des Minutes de travail qui garde sa place quand on valide un temps, toutes les pages du menu, chaque fiche de service |
| `tests/plonge-equipes-browser.cjs` | Une équipe de plonge en plus (v1 et v2) : le bouton reste quand la plonge a son équipe ; « Plonge matin » au premier retour sans équipe, qui lave comme la première ; sa fiche en haut, le curseur dans son heure, la notification avec « Annuler » ; le matin lave les retours du matin, chaque vol une fois, un tunnel un vol à la fois ; la frise aux règles des graphiques (ds-graphique, data-info, d1, attente) ; l’heure au clavier ; le mode de lavage pour toute la plonge ; rien d’autre n’est écrit |
| `tests/equipe-plonge.test.cjs` | L’équipe de plonge en plus : même façon de laver, mêmes tunnels et temps (une copie), sans les arrêts de l’autre ; au premier retour sans équipe, au quart d’heure, sinon juste avant la première ; son nom dit son moment, libre dans le service ; la veille et le lendemain ; au débit ; le calcul à deux équipes |
| `tests/plonge-equipes.test.cjs` | Une plonge par vol à plusieurs équipes : chaque vol lavé une fois ; un tunnel du même nom est la même machine (un vol à la fois quand les postes se chevauchent), un autre nom une autre ; plonge mêlée signalée ; 150 journées au hasard, v1 et v2 |
| `tests/plonge-jour-browser.cjs` | La plonge se règle sur l’arrivée des retours (v1 et v2) : veille / jour / lendemain de l’arrivée, frise des retours face aux équipes, ce qui arrive sans personne, une équipe J+1 qui lave le soir (rien ne reste sale), tableau des horaires, rechargement |
| `tests/saisie-browser.cjs` | Ce qu’on tape n’est jamais perdu (v1 et v2) : un rendu arrive au milieu de la saisie d’une heure, de personnes, de minutes par vol — il attend, rien ne se perd, et tout est retenu à la validation ; un champ validé montre la valeur retenue (bornée) ; rechargement |
| `tests/cf-depart-browser.cjs` | CF départ food n’est pas le handling (v1 et v2) : un service à équipes (les checkeurs, à heures fixes) ; un handling rangé dans sa zone passe dans son service à lui, avec ses réglages et sa place dans les chemins ; « Mettre en place le handling » le vise, jamais CF départ food ; rechargement |
| `tests/effectif-browser.cjs` | L’effectif calculé (v1 et v2) : une équipe de cuisine montre son effectif, homme-minutes ÷ poste arrondi au-dessus, qui suit les commandes cochées ; Minutes de travail le montre sans le faire saisir ; « Effectif constant » rend la saisie (gardée au rechargement), décoché le calcul reprend ; CF départ food, magasin, légumerie, duty free, appros constants par défaut ; une mise à disposition (les appros) a ses personnes sur la journée (2 × 8 h dont 1 h de pause : 16 h de présence, 14 h de travail), jamais calculées ; la plonge a ses équipes hors tunnel, calculées d’après les vols qui reviennent (minutes par vol) ou saisies ; une équipe constante dans un service calculé (« Effectif ») retrouve son effectif saisi, puis revient au service ; superviseurs de CF départ food (sans effet sur la journée, gardés au rechargement) ; un poste constant sans minutes par vol (fiche, temps nul, pas de colonne dans Minutes de travail) ; « Effectif imposé (essai) » : durée = homme-minutes ÷ effectif saisi |
| `tests/seuils-browser.cjs` | Le minimum de personnes pour qu’un tunnel ou le robot tourne (v1 et v2) : « Minimum pour tourner » à la vue, tunnel « à l’arrêt : pas assez de monde » puis « tourne », robot à l’arrêt (badge, rien ne sort) puis qui tourne |
| `tests/sans-flux-browser.cjs` | Une équipe dans un service où aucun flux ne passe (CF départ food, Duty free ; v1 et v2) : grille grisée, le site dit pourquoi ; « Faire passer tous les flux par ici » la débloque ; la commande cochée passe sans minutes (poste constant) |
| `tests/atelier-unique-browser.cjs` | Un service à un seul atelier pour certaines compagnies (le Duty free, v1 et v2) : une équipe constante, ses personnes, ses compagnies cochées (toutes leurs commandes, flux passés par le service), sans minutes ni alerte, Toutes/Aucune, gardé au rechargement, retour à des équipes ordinaires |
| `tests/service-autonome-browser.cjs` | Un service à part entière créé depuis le site (v1 et v2), « Roulés couverts » : rangé comme Prépa ou Dotation, sans minutes ni liens hérités ; flux, équipe, minutes, calcul, tableau des minutes, planning, Excel, rechargement ; rattacher / détacher ; la salle de plus reste un choix |
| `tests/armement-integre-browser.cjs` | « L’intégrer à tous les chemins » seulement s’il y a à faire (v1 et v2) : chemins suivis par les commandes seulement, un lien vers un handling suffit, sinon le chemin à reprendre est nommé avec la raison ; un clic le remet en ordre |
| `tests/coherence.test.cjs` | Audit des flux (v1 et v2) : une case cochée hors du chemin de sa commande n’y est pas préparée, et c’est dit ; un vol ne part pas avec son seul armement |
| `tests/coherence-browser.cjs` | Audit des flux dans le site (v1 et v2), sur des unités montées comme la vraie (handling, armement, chaîne, ⚡, chemin à elle, veille, robot) : chaque commande suit son chemin, le handling attend repas et armement, cases d’armement justes, compteurs, tableau des minutes = calcul, fiches cohérentes, messages lisibles ; l’audit voit une faute introduite exprès |
| `tests/vagues.test.cjs` | Mise à disposition par vagues : chaque commande prend la vague qui précède son besoin, attente avant la première |
| `tests/partage-browser.cjs` | Légumerie partagée : une case pour toutes les commandes, « Besoin de légumerie ? » sur le chemin, vagues dans le tableau, fusion des cases d’avant |
| `tests/handling.test.cjs` | Le handling par vol : classes d’un même vol réunies, ordre strict des départs, pas avant départ − X h, plusieurs quais, vol bloqué, poste fini, durée par compagnie, stocks devant le handling |
| `tests/handling-browser.cjs` | Le handling dans l’interface : une case partagée posée depuis un chemin, sa fiche, les départs « chargé à », la synthèse |
| `tests/services-browser.cjs` | Équipes › Liste des services : une ligne par service, « + Une équipe » (depuis la page, les contrôles, le plan), renommer, voir et modifier sur le plan, pas d’alerte pour une plonge ; cycle de vie : créer, doublon refusé, changer de rattachement, supprimer, retirer et remettre |
| `tests/nav.cjs` | Aide partagée des tests navigateur : aller à une page comme à la main (la partie, puis l’onglet) ; attendre que le site ait démarré, recharger, attendre qu’une donnée soit enregistrée (correction 18 c : un état attendu plutôt qu’un délai) |
| `tests/icones.test.cjs` | Chaque service reconnaît son pictogramme |
| `tests/graphe.test.cjs` | Diagramme : colonnes, nœud au milieu de ses amonts, couloirs des longs liens, boucles, dispositions retenues |
| `tests/graphe-browser.cjs` | Diagrammes dans la page : tirer un trait, clavier, doublon et boucle refusés, équipe créée depuis un nœud, disposition retenue, liens de l’unité |
| `tests/onglets.test.cjs` | Le menu (v1 et v2) : chaque page dans une seule partie, un sujet par partie, les outils fins après « Plus » ; pages de chaque vue, identifiants uniques, règle de masquage, pictogrammes ; la page Période qui ne se montre qu’avec un programme daté |
| `tests/browser-smoke.cjs` | Parcours dans Chromium : relecture, vols, import, export, écran étroit de bureau |
| `tests/import-browser.cjs` | Import CSV : échec de lecture puis réimport, numéros de ligne, export, scénarios A/B |
| `tests/sauvegarde-browser.cjs` | Sauvegarde complète : export, refus atomique, effacement et restauration |
| `tests/plusieurs-onglets-browser.cjs` | Deux onglets du même site (correction 14) : un second onglet et le thème sans bandeau ; une modification en A, le bandeau en B tout de suite, B en retard n’écrit rien (équipes, plan, liens, barème), « Recharger » montre la modification de A ; sans l’événement, B relit la révision et n’écrit rien ; une restauration en A (la question avertit), le bandeau en B sans attendre, B refuse de restaurer, avant la question et après ; la v2 à côté sans bandeau ; la page de secours augmente la révision ; un seul onglet identique champ par champ, avec et sans le garde |
| `tests/v2-copie-browser.cjs` | La version 2 dit d’où viennent ses données (correction 14 b) : le bandeau discret et la date de la copie (JJ/MM/AAAA, celle enregistrée à la première ouverture), « Reprendre les données de la version 1 » refusé puis fait (la page rechargée, la date à jour, le budget de la v2 gardé), la v1 intacte octet pour octet et son onglet ouvert à côté sans bandeau, la révision de la v1 hors de la v2 |
| `tests/ateliers-browser.cjs` | Onglet Ateliers de bout en bout : saisie, calcul, planning, persistance |
| `tests/etat-plan-browser.cjs` | État de paramétrage sur le plan, quatre états de la relecture, bascule des légendes |
| `tests/zoom-browser.cjs` | Bornes du zoom, cadrage d'un service, raccourcis clavier, bridage du déplacement ; « Tout voir » fait tenir le plan entier (évolution 14 a) |
| `tests/plan-rejoue.test.cjs` | Le plan rejoué sans navigateur (évolution 14 a, `plan-rejoue.js`) : le cadrage à 24 px des bords où que soit le plan, les tailles des textes à tout zoom, les chiffres cumulés de la bande (jamais « — »), l’heure d’ouverture au pic de travail sur l’unité fictive, les repères du curseur |
| `tests/captures-browser.cjs` | Les captures de contrôle (évolution 14 e), sur l’unité et les vols fictifs, en thème clair et sombre, à 1 280 et 1 920 px : le plan rejoué à l’ouverture, au pic sur le service le plus chargé, en lecture (points et camions) ; le planning dans ses trois zooms. Gardées hors du dépôt : `ORY_CAPTURES=dossier node tests/captures-browser.cjs`, sinon un dossier temporaire, dit à la fin |
| `tests/resultats-vue.test.cjs` | Les autres pages des résultats sans navigateur (évolution 14 d, `resultats-vue.js`) : la couleur de la Synthèse selon l’état (un retard nul jamais critique), ses libellés et sa phrase de résumé ; la marge, son écriture, sa barre et son tri ; les couloirs des points de la frise ; l’ordre des stocks, leur échelle, plus de 24 h |
| `tests/resultats-browser.cjs` | Les autres pages des résultats (évolution 14 d), sur l’unité et les vols fictifs : la phrase de résumé et les libellés de la Synthèse, un retard nul jamais en rouge ; la marge de chaque commande, sa barre et son tri, « Retirer » dans le menu « … » ; les en-têtes et la première colonne des étapes à la vue après défilement ; les points de 10 px de la frise, le numéro d’un vol en retard toujours écrit ; les stocks triés, leur échelle dite une fois |
| `tests/planning-ensemble.test.cjs` | Le planning, d’abord toute l’unité, sans navigateur (correction 18 b, `planning-ensemble.js`), sur des journées fictives calculées à la main puis sur l’unité fictive de 15 services : les jours qui ont des lots et celui qu’on ouvre, le cadre d’un jour et l’échelle (une heure ≥ 40 px), les lignes d’un jour et les équipes sans lot, le résumé d’un service en entier, le temps sans travail avant le premier lot et ce que l’équipe attendait, la colonne des noms (160 à 260 px), la courbe en escalier |
| `tests/planning-ensemble-browser.cjs` | Le planning des équipes, d’abord toute l’unité sur un écran (correction 18 b), sur l’unité fictive de 15 services et 50 équipes, à 1 366 × 768 et 1 920 × 1 080 : les 15 lignes de service repliées et « Sans lot ce jour (n) » visibles sans défilement, au moins 60 % de la hauteur de la fenêtre, ni introduction ni bande, les boutons et la légende sur une ligne ; aucun service sans lot dans les premières lignes ; « Un jour » cadré 30 min avant le premier lot, dans la largeur ; les onglets des seuls jours qui ont des lots ; déplier (le résumé entier, les équipes et leurs personnes, la bande hachurée), le choix retenu, le clic depuis la Synthèse ; des barres de 3 px au moins ; la flèche d’une limite hors fenêtre ; « Plein écran » puis Échap ; aucun nom coupé sans infobulle |
| `tests/unite-15-services.cjs` | L’unité fictive des tests du planning (correction 18 b) : 15 services qui ont des lots le jour des vols (dont huit services « à part entière » ajoutés après le montage), 3 mises à disposition sans lot, 50 équipes, un nom d’équipe long, une commande finie la veille |
| `tests/planning-vue.test.cjs` | Le planning des équipes sans navigateur (évolution 14 c, correction 18 b, `planning-vue.js`) : l’échelle des trois zooms (« Un jour » remplit la largeur), les bornes de la chaîne, le jour qu’on ouvre, l’ordre des services le long du chemin et les lignes (les équipes sans lot à part), une pause prise qui troue la barre, la limite de chaque commande sur son dernier lot, le retard et la marge, l’infobulle, la période visible, l’axe à deux niveaux, la commande mise en évidence |
| `tests/planning-vue-browser.cjs` | Le planning des équipes (évolution 14 c, correction 18 b), sur l’unité et les vols fictifs, à 1 280 et 1 920 px, les services dépliés : « Un jour » sur le jour qui a le plus de lots, cadré sur ses lots, dans la largeur (40 px par heure au moins), la période dite, lignes de 28 px (services : 32 px) et textes de 12 à 13 px, la légende sur la ligne des boutons ; les trois zooms (boutons, Ctrl + molette) et le glissé ; l’axe et les noms à la vue après un défilement ; une ligne par service qui a des lots dans l’ordre du chemin, sa courbe, les équipes sans lot à part, replier ; la limite d’une commande en retard à gauche de la fin de sa barre ; le clic qui met une commande en évidence, Échap, l’infobulle au focus clavier ; le trait de l’heure rejouée |
| `tests/plan-flux.test.cjs` | Ce qui se passe à l’heure rejouée, sans navigateur (évolution 14 b, `plan-flux.js`) : les paires de services qui ont des repas en stock entre eux, l’épaisseur en racine de la quantité, au plus 8 traits et les trois étiquettes, les points d’une tranche qui avancent avec l’heure, le tracé de bord à bord qui contourne une zone, « au travail / présents » d’un créneau, les véhicules du handling |
| `tests/plan-flux-browser.cjs` | Le plan rejoué : ce qui se passe à l’heure rejouée (évolution 14 b), sur un plan et des vols fictifs, en thème clair et sombre : les quatre états en remplissage franc et leurs contrastes (3:1 sur la toile, 4,5:1 pour le texte), « au travail / présents » et « en file » égaux aux indicateurs de charge, « Ce qui circule » par défaut (un trait par paire, l’épaisseur qui suit la quantité, trois étiquettes, aucun trait quand rien n’attend, jamais plus de 8), les points pendant la lecture seulement et jamais en reduced-motion, les choix d’avant qui dessinent comme avant, les véhicules du handling |
| `tests/plan-rejoue-browser.cjs` | Le plan rejoué : le cadrage et les commandes (évolution 14 a), sur un plan et des vols fictifs (`tests/plan-rejoue-fictif.cjs`), à 1 280 et 1 920 px, sans fond et avec une tuile fictive : l’ouverture au pic de travail, le plan entier qui tient, « Tout voir » et « Cadrer », aucun texte sous 11 px, les noms entre 12 et 16 px, la bande des chiffres au-dessus du plan sans recouvrir de zone, une seule barre de commandes dans l’ordre, les repères du curseur, l’heure gardée tant que la journée ne change pas, « Fond de plan » seulement avec un fond |
| `tests/annexe-browser.cjs` | Zone de production annexe (« Armement 2 ») : création, rattachement, aménagement, effectif ; elle survit au rechargement — chaque étape attend son effet, pas un délai (correction 18 c) |
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

**La batterie complète, dans un clone propre** (correction 15) : `node outils/batterie.cjs`
joue les tests Node puis chaque test navigateur dans une copie du dépôt sans les
fichiers que `.gitignore` refuse (le plan privé, les sauvegardes, le réel), hors du
dépôt ; `--commit HEAD` joue un commit dans un worktree Git. Un test qui dépendrait
d'un fichier ignoré y échoue, comme dans tout clone du dépôt public. Elle fait partie
de la vérification d'avant commit (skill `verification-loop`). Code de sortie : 1 si un
test échoue, 2 si elle ne peut pas se jouer ; Playwright vient de l'environnement.
