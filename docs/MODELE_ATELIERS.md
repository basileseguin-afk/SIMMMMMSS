# Le modèle par ateliers de travail

Remplace le modèle par postes et files d'attente. Trois objets, et trois
seulement. Le moteur est `moteur/production.js`, testé par
`tests/production.test.cjs`.

---

## 1. La compagnie × classe

L'unité de fabrication. Déduite du programme de vols — et **corrigée à la
main** quand il le faut : `CRL/BC`, `AF/YC`… Une compagnie × classe porte

- le nombre de passagers de la journée, tous vols confondus ;
- la liste de ses vols ;
- son **échéance** : le départ le plus serré, moins le délai de chargement.

Les **retours ne fabriquent rien**. Un avion qui arrive ne crée pas de classe à
produire.

La liste se **retouche** dans l'onglet : on **retire** une classe qu'on ne
fabrique pas, on en **déclare** une que le programme ne porte pas encore. Une
déclaration ne porte que son **identité** — compagnie et cabine.

> **Les chiffres viennent de l'import, jamais de la saisie.** Passagers, nombre
> de vols et échéance sont lus dans le programme de vols. Les redemander à la
> main ouvrirait deux vérités pour la même classe, et la mauvaise finirait par
> l'emporter.

Une classe déclarée que l'import ne porte pas reste donc **à volume nul** : la
table l'affiche « hors import », sans passagers ni échéance, jusqu'au prochain
import. Corriger un volume se fait dans le fichier de vols.

Retirer une classe **coupe tous les liens** que les ateliers avaient avec elle :
elle disparaît de chaque lot, et un lot vidé de sa dernière classe disparaît
avec elle. Sans cela les ateliers désigneraient un identifiant inexistant et le
modèle refuserait de tourner. Un retrait pris sur le programme se **rétablit**
d'un clic ; une classe ajoutée puis retirée, elle, est supprimée.

### Les cinq classes

| Code | Ce que c'est |
|---|---|
| `BC` | Business |
| `PC` | Premium |
| `YC` | Économie |
| `CREW` | les plateaux de l'**équipage**, sur le même vol que les passagers |
| `SPML` | les **repas spéciaux**, toutes cabines confondues |

Les deux dernières ne sont pas des cabines, mais se fabriquent exactement comme
elles. Les compter à part, c'est pouvoir leur donner **leur propre barème** : un
repas spécial ne coûte pas le temps d'un plateau de masse, et le noyer dans
l'économie reviendrait à sous-estimer la cuisine.

Dans le programme de vols, elles se lisent dans les colonnes **facultatives**
`nb_CREW` et `nb_SPML`. Un export qui ne les porte pas reste lisible : elles
valent zéro, et aucune classe n'est créée pour elles.

## 2. L'atelier de travail

Une équipe dans un service. Il n'occupe **aucune place dans l'espace** : ce
qu'il faut savoir de lui, c'est ce qu'il fait, quand, et à combien.

| Champ | Sens |
|---|---|
| `nom` | libre — « Prépa CRL BC » |
| `service` | cuisine, prépa montage, dotation, armement, appros… |
| `debut` | **donnée par vous**, au format `HH:MM` |
| `jour` | décalage en jours : `-1` pour la veille, `-2` pour l'avant-veille |
| `personnes` | effectif |
| `lots` | ce que l'équipe fabrique, **dans l'ordre** |
| `pauses` | **arrêts programmés** — machine à l'arrêt, local fermé, créneau de nettoyage |

L'interface ne dit pas « lot », elle dit **une ligne = une fabrication**, et la
règle tient en une phrase : *plusieurs classes sur la même ligne sortent
ensemble ; sur deux lignes, l'une après l'autre.* Le mot « lot » ne survit que
dans le nom du champ, pour ne pas réécrire les sauvegardes.

La première ligne commence à l'heure de début ; **chacune des suivantes démarre
quand la précédente est finie**. C'est ce qui permet à un atelier d'enchaîner
CRL/BC puis CRL/PC sans qu'on ait à calculer la seconde heure soi-même.

Une ligne à plusieurs classes les fabrique **ensemble** : elles sortent au même
instant. C'est ainsi qu'on décrit les services **en amont de la séparation par
compagnie** — appros, légumerie, plonge, magasin — sans règle particulière :
une seule ligne contenant tout.

### L'arrêt programmé n'est pas la pause de l'équipe

Les deux se confondent facilement, et ne se ressemblent pas :

| | Quand | Qui l'écrit |
|---|---|---|
| **Pause de l'équipe** | après un **temps de travail** — 3 h, puis 6 h | le modèle, tout seul |
| **Arrêt programmé** | à une **heure fixe** | vous, et seulement si besoin |

Un atelier n'a normalement **aucun arrêt programmé** : ses pauses sont déjà
comptées. On en saisit un quand rien ne tourne pendant une plage donnée — un
robot à l'arrêt pour nettoyage, un local fermé. C'est pourquoi la section est
**repliée** tant qu'elle est vide.

### Durée d'un atelier manuel

```
homme-minutes du lot = Σ sur ses classes ( minutes par vol × nombre de vols )
durée                = homme-minutes ÷ personnes ÷ rendement
```

**L'unité de compte est le vol, pas le passager.** On ne dresse pas un passager :
on monte les trolleys d'un vol, on dresse les plateaux d'une classe de ce vol.
Une étude de temps donne des minutes pour une compagnie × classe sur un vol ;
c'est donc ce que le barème contient. Le remplissage de l'avion n'y change rien.
Le nombre de passagers ne sert plus qu'au **robot**, qui compte bien des plateaux.

Le barème est une **table unique**, par service, tenue dans le **Centre des
réglages** sous « Le modèle de production » :

| Clé | Sens |
|---|---|
| `*/BC` | la valeur **commune** : toutes les compagnies qui n'en ont pas de propre |
| `AF/BC` | la valeur **propre** à AF en BC ; elle l'emporte sur la commune |

Les valeurs en place sont **non calibrées** : elles n'existent que pour que le
modèle tourne. Un barème d'hier, qui comptait par passager, est **converti** à
l'ouverture sur la base de passagers types (BC 25, PC 40, YC 190, CREW 7,
SPML 10) ; la page le dit, pour qu'on le vérifie.

Le barème se lit **un service à la fois** : replié, chacun tient en une ligne
qui montre ses minutes par vol ; ouvert, il montre la valeur commune de chaque
classe, les valeurs propres à une compagnie, et un menu pour en ajouter une.

**Certains services se chiffrent par compagnie × classe**, pas par classe : le
dressage d'un plateau AF BC n'est pas celui d'un plateau DL BC. Chaque service a
donc deux saisies, au choix :

- **Par classe** : une valeur commune par classe, et quelques valeurs propres
  ajoutées une à une.
- **Par compagnie × classe** : une grille, une ligne par compagnie qui passe par
  ce service (selon son parcours), une colonne par classe. Une case vide prend
  la valeur de la ligne « Autres compagnies » ; si celle-ci est vide aussi, la
  case est **encadrée de rouge** et le résumé du service dit combien il en reste
  « à renseigner ». Un point `·` marque un couple qui ne passe pas par ce service.

Le moteur ne fait pas de différence : une valeur propre l'emporte toujours sur
la commune. Changer de saisie ne perd rien. Un classeur importé qui porte des
valeurs propres bascule le service en grille. **Une compagnie × classe fabriquée
par une équipe sans aucune minute** au barème est signalée (« … n'a pas de
minutes pour AF/PC … en temps nul ») sans bloquer la journée.

Il se corrige service par service, ou **s'échange avec Excel** : c'est ainsi
qu'une étude de man-minutes entre dans le modèle, sans toucher au moteur. Le
classeur exporté propose une ligne par compagnie × classe **et par service de
son parcours** — exactement ce que l'étude doit renseigner. Le format est décrit
dans [les formats Excel](FORMATS_EXCEL.md). Un service que le barème ne connaît pas est
marqué **« non renseigné »** — sans quoi il travaillerait en temps nul sans rien
dire. Une **annexe** hérite du barème de l'atelier dont elle dépend.

Le **rendement** et les **règles de poste** sont réglés au même endroit. Une
équipe qui ne fixe pas sa présence suit celle de la maison : changer la règle
commune les déplace toutes.

### L'atelier robot

| Champ | Sens |
|---|---|
| `type: 'robot'` | |
| `debit` | plateaux par heure |
| `personnes` / `personnesMin` | sous le minimum, **le robot ne tourne pas** et le dit |
| `debut` | heure d'allumage |
| `pauses` | arrêts programmés |

```
durée = plateaux ÷ débit
```

Le robot ne consomme pas de barème d'homme-minutes : son temps vient de son
débit. Un arrêt programmé ne change pas la durée du travail, il **repousse la
fin** d'autant — et ce temps d'arrêt est compté à part.

### Le poste : pauses et heure de fin

Une équipe ne travaille pas huit heures d'affilée, et elle s'en va à la fin de
son poste que le travail soit fini ou non.

| Règle | Valeur par défaut |
|---|---|
| Pause après 3 h de **travail** | 15 min |
| Pause après 6 h de **travail** | 30 min |
| Présence totale sur le site | 8 h 15 |

Ces trois valeurs sont **réglables** dans le Centre des réglages, et les seuils
s'ajoutent ou se retirent.

Soit **7 h 30 de travail effectif**. Les seuils comptent le travail *cumulé*,
pas l'heure qu'il est : une équipe qui attend ses amonts ne consomme pas son
crédit de travail, donc ne prend pas sa pause.

Une fabrication que le poste ne peut pas finir est **signalée et laissée
inachevée** : sa fin est vide, sa classe ne sort pas, et les suivantes ne sont
pas commencées.
C'est le résultat le plus utile du modèle — ce qui ne rentre pas dans la
journée. Le régime se désactive atelier par atelier, et la durée de présence se
règle, pour une équipe qui ne suit pas la règle commune.

### La mise à disposition

Un magasin, des appros, tout service qui se contente de **sortir du matériel ou
des matières premières** ne fabrique rien. Il a préparé à l'avance, ou il sert
dans l'instant.

| Champ | Sens |
|---|---|
| `type: 'dispo'` | |
| `permanent` | **vrai par défaut** : personne ne l'attend |
| `debut` / `jour` | l'heure d'ouverture, quand `permanent` est faux |

Ni effectif, ni barème, ni durée — et **aucune liste** : elle sert **toutes**
les compagnies × classes, sans qu'on les énumère. Le magasin sort du matériel
pour qui en demande.

> **Mais elle ne fabrique rien.** Une classe dont la mise à disposition est la
> seule étape reste « jamais fabriquée ». Sans cette distinction, ouvrir un
> magasin suffirait à afficher « 100 % à l'heure ».

Elle figure malgré tout au **parcours** de ce qu'elle sert : c'est ce qui permet
de voir d'où vient le matériel. Sur le planning, c'est un repère, pas une barre.

Deux mises à disposition ne se cumulent pas : un service qui en porte une **et**
un autre atelier est signalé, car le second ne serait jamais attendu.

## 3. La boucle du matériel

Les trolleys, la porcelaine, les couverts ne s'achètent pas : ils reviennent.
Un départ les emporte, un retour les ramène sales, la plonge les rend propres,
un départ les remporte.

> **En théorie il n'y a pas de stock.** Si les retours égalent les départs, tout
> ce qui part vient de revenir. Un excédent de retours se stocke et sert
> d'amortisseur : quand la plonge prend du retard, ou le jour où les retours
> manquent.

Le modèle tient **un compte unique** d'unités. C'est une simplification
assumée : un trolley de CRL et un trolley d'AF ne s'y distinguent pas.

### Ce qu'un vol emporte se compte comme le barème : par vol

**Une quantité par vol, pour chaque classe présente à bord.** Un trolley part
avec l'avion : sa quantité ne bouge pas parce que la cabine est à moitié vide.
Un vol retour ramène la même quantité, classe par classe.

| Réglage | Sens |
|---|---|
| Unités par vol, par classe | **non calibré** |
| Propre à l'ouverture | le stock de départ, souvent nul |
| Délai après atterrissage | minutes avant que le sale soit à la plonge |

Une saisie d'hier, qui comptait aussi par passager, est convertie en unités par
vol sur la base des mêmes passagers types que le barème.

Un atelier de type **Lavage** ne fabrique rien : son travail vient des retours, à
mesure qu'ils arrivent. Il suit le même régime de poste que les autres — ce qui
arrive après la fin de son poste reste sale.

### La plonge : un débit par ligne, un plafond pour l'ensemble

Chaque tunnel porte son **nom**, son **débit** en unités par heure, les
**personnes** qu'il faut pour le tenir, et son état **en service ou à l'arrêt**.
La plonge, elle, porte un **débit maximum de l'ensemble** — facultatif.

> **Deux limites, et c'est la plus basse qui compte.**
> La somme des tunnels qui tournent vraiment, et le plafond de l'ensemble.

Il faut les deux. Le débit par ligne dit ce que coûte l'arrêt d'un tunnel ; le
plafond dit ce que la plonge ne dépassera pas **quoi qu'on ajoute** — parce que
le côté sale, le séchage et le retour des paniers sont partagés entre les
lignes et les brident toutes. Sans lui, ajouter un quatrième tunnel augmentait
le débit sans fin, ce qu'aucune plonge ne fait. Le plafond laissé vide ne bride
rien.

Un tunnel ne tourne que si l'équipe a les gens pour le tenir. Les tunnels sont
servis **dans l'ordre de la liste** : à vous de mettre en tête ceux qu'on allume
d'abord. Ceux que l'effectif ne couvre pas sont **nommés et laissés à l'arrêt**,
pas silencieusement ignorés.

Sans cette règle, trois tunnels à 300 u/h tenus par deux personnes annonçaient
900 u/h. C'était le chiffre le plus faux du modèle, et rien ne le disait.

La fiche affiche les trois nombres côte à côte — somme des lignes, plafond,
**débit retenu** — pour qu'on voie d'un coup d'œil lequel décide.

Un tunnel deux fois plus rapide compte pour ce qu'il vaut, pas pour un. Un
tunnel **à l'arrêt** ne lave rien et ne mobilise personne — c'est ainsi qu'on
essaie une panne sans effacer sa description. Si aucun ne tourne, le modèle le
dit plutôt que de laver à zéro.

Un atelier coché **« emporte du matériel propre »** attend, avant chaque lot,
que le compte couvre ce que ses classes emportent. L'attente est mesurée. Un lot
qui n'obtient jamais son matériel **figure au journal sans fin** : sans cette
trace, sa classe paraîtrait fabriquée par ses autres étapes.

Le service est **premier arrivé, premier servi** : sans cela un petit lot
passerait indéfiniment devant un gros.

## 4. Le parcours

Une compagnie × classe n'est pas une ligne mais un **assemblage**, et toutes ne
passent pas par les mêmes services : un plateau d'économie ne voit ni la cuisine
ni la légumerie. Chaque classe suit donc un **parcours**, qui est un **graphe
orienté** : les services sont les nœuds, un lien « A → B » dit que A livre B.
Écrit `{ id, nom, noeuds: [service], liens: [{ de, vers }] }`.

```
RÉCEPTION / APPROS → LÉGUMERIE → CUISINE → PRÉPA ─┐
PLONGE → DOTATION ────────────────────────────────┼→ MONTAGE
MAGASIN ──────────────────────────────────────────┘
```

Le montage reçoit trois liens et attend donc **ses trois amonts** ; la dotation n'attend que la
plonge, la cuisine que la légumerie. Un service peut aussi **livrer plusieurs
services** : ajouter « APPROS → MONTAGE » à côté de « APPROS → LÉGUMERIE » fait
partir une partie des appros droit au montage, qui attend alors aussi les appros.

La **prépa** (`preparation`, « PRÉPA » sur le plan) est le poste qui prépare
avant le montage (le montage garde l'identifiant historique `prepa`). Les chemins
types passent par elle. À la première ouverture après son arrivée, chaque chemin
enregistré qui reliait directement la cuisine au montage est réécrit une fois en
« CUISINE → PRÉPA → MONTAGE » (`insererPrepa`), puis marqué `prepa: true` pour ne
plus jamais être retouché : si vous retirez la prépa d'un chemin, elle n'y revient
pas. Un plan enregistré avant son arrivée est **complété** (la zone PRÉPA est
posée à sa place par défaut, marquée à confirmer) au lieu d'être refusé. Son
barème d'exemple est provisoire, comme les autres. La règle tient en une phrase :

> Un service ne travaille un lot que lorsque **les services qui le précèdent sur
> le parcours de chaque classe** du lot la lui ont livrée.

### Un chemin par commande, une case par service

Depuis le 24/09, **chaque commande a son chemin**, créé à la main : « Complet
TX BC », « Complet TX PC »… même quand plusieurs se ressemblent. Il est rangé
dans `parcoursClasse[commande]`. Sur ce chemin, chaque service porte une
**case** : l'équipe (un atelier) qui y prépare la commande — son nom, ses
personnes, son heure et son jour, ses pauses, et ses **man-minutes**.

Une case se **partage** entre chemins : la case « TX BC/PC » de la cuisine sert
au chemin de TX BC et à celui de TX PC. Elle les prépare dans l'ordre de ses
lignes : TX BC d'abord, TX PC ensuite. **Le chemin de TX BC ne tire que le temps
de TX BC** : chaque ligne d'une case est livrée à sa fin, avec les seules
man-minutes de ses commandes, et le montage de TX BC démarre sans attendre la
ligne de TX PC. Deux commandes sur la même ligne, elles, sortent ensemble.

Les man-minutes d'une commande dans une case sont celles de l'**import**
(barème par vol × nombre de vols). La case peut en fixer d'autres, pour elle
seule (`minutes: { 'TX/BC': 90 }` sur l'atelier) ; vide, elle reprend l'import.

Une commande qui n'a pas encore son chemin suit le **modèle** de sa classe
(`parcoursCabine` : « Complet » pour BC, PC, CREW et SPML, « Sans cuisine » pour
YC). Les modèles se gardent et se modifient en bas de la liste des commandes.

#### L'onglet « Les chemins »

À gauche, **les commandes**, par compagnie, avec leur chemin (ou le modèle
qu'elles suivent) et un repère : ✓ prête à l'heure, ! en retard, · pas encore
prête. Une recherche filtre la liste ; l'onglet compte les commandes sans chemin.

- **Créer le chemin** d'une commande : vide, copié d'un modèle, ou copié du
  chemin d'une autre commande — et dans ce dernier cas, **dans les mêmes
  cases** : la commande s'y ajoute sur sa propre ligne, juste après l'autre.
- **Chaque service du chemin a sa case dès la création** : là où elle n'est pas
  reprise d'un autre chemin, une case neuve est créée (« Cuisine AF CREW », 2
  personnes, 06:00), qui figure aussitôt dans « Les cases ». La plonge, qui lave
  pour tout le monde, reçoit une seule case « Plonge ». Un service ajouté ensuite
  au chemin reçoit la sienne de même. Une case qu'on retire exprès (« — aucune — »)
  ne revient pas. Les chemins dessinés avant cette règle reçoivent leurs cases
  manquantes une fois, à l'ouverture (`completerCases`).
- **Supprimer le chemin** d'une commande emporte les cases qui ne préparaient
  qu'elle ; une case partagée reste telle quelle.
- **Dupliquer pour…** : le chemin affiché pour d'autres commandes cochées,
  chacune le sien, dans les mêmes cases, à la suite (TX BC, puis TX PC, puis
  TX YC). La disposition du diagramme est copiée avec.
- **Un lien ne vaut que pour son chemin** : ajouter « Appros → Montage » sur
  TX YC ne touche pas TX BC.

Le chemin est un diagramme de nœuds (`graphe.js`) :

- **tirer le `+`** à droite d'un service jusqu'à un autre crée le lien ; ou bien
  **cliquer le `+`**, puis le service qui reçoit (un second clic sur le même `+`,
  Échap ou un clic dans le vide annule) ; au clavier, on choisit le service,
  « Relier à… », puis le service qui reçoit. La consigne et le résultat
  s'affichent juste au-dessus du diagramme ; le cadre défile tout seul quand on
  tire un trait près de son bord ;
- un lien qui **fermerait une boucle** est refusé (un repas tournerait en rond),
  un lien en double aussi ;
- **cliquer un lien** le choisit ; sa croix (ou la touche Suppr) le retire ;
- **chaque nœud porte sa case** (« TX BC · 3 p. · 06:00 », ou « aucune case »,
  en gris : l'étape est sautée) ;
- **cliquer un service** ouvre sa case dessous : choisir une case existante du
  service (la commande s'y ajoute à la suite), en créer une (« Cuisine TX BC »),
  ou n'en mettre aucune ; puis la **fiche complète** de la case : nom, service,
  type, heure, jour, personnes, pauses, et **ce qu'elle prépare, dans l'ordre**,
  une ligne par préparation, chacune avec ses man-minutes (l'import en grisé,
  la valeur propre à la case en gras). La ligne de la commande regardée est
  mise en évidence. « Relier à… » et « Retirer du chemin » y sont aussi ;
- on **déplace** les services à la souris ; la disposition est retenue
  (`ory-graphes-v1`, incluse dans la sauvegarde complète). Sans disposition, les
  nœuds se rangent en colonnes dans le sens du flux, et un lien qui saute des
  colonnes y réserve un couloir pour ne pas passer sous un autre service.

Les parcours enregistrés en branches (avant le 23/09) sont convertis en liens à
la lecture.

### Les autres onglets se calculent

Tout se règle dans les chemins ; le reste s'en déduit.

- **Qui prépare quoi** : un tableau, **une ligne par commande** (son départ, ses
  passagers, son chemin), **une colonne par service**, dans l'ordre du flux,
  groupées par service de départ puis la jonction. Chaque cellule dit la case
  qui prépare la commande et ses heures ; « à faire » quand le chemin passe par
  là sans case ; grisée quand il n'y passe pas. **Un clic sur une cellule ouvre
  le chemin de la commande, sur ce service.** La dernière colonne dit quand la
  commande est prête et se **déplie dans le temps** : une barre par étape,
  l'attente de l'étape d'avant en orange, le trait de l'heure de chargement, et
  une phrase qui résume — « AF/BC est prête à 06:45 pour un chargement avant
  05:55 : 50 min de retard. Le plus long à attendre : MONTAGE a attendu 25 min
  que DOTATION finisse. » On peut chercher une compagnie ou n'afficher que les
  commandes à compléter.
- **Les cases** : chaque case, par service, avec ses commandes dans l'ordre ;
  chacune ouvre son chemin sur cette case. « + Case hors chemin » crée ce qui
  ne suit pas une commande : une plonge, une mise à disposition qui sert tout
  le monde ; une case qu'aucun chemin n'atteint se règle sur place.
- **Leur journée** : le planning, case par case.

- **Par défaut, par classe** : BC, PC, YC, CREW et SPML ont chacune un parcours.
- **Par commande** : chaque commande peut avoir son propre chemin (onglet « Les
  chemins ») ; c'est la voie normale, le modèle de la classe n'est qu'un repli.
- **Une étape sans équipe est enjambée** : si personne ne travaille une classe
  à la cuisine, le montage attend directement ce qui précède la cuisine. Son
  nœud dit « aucune case », sa cellule du tableau « à faire », et les points à
  regarder le rappellent, sans bloquer la journée.
- **Une plonge n'est jamais un trou** : elle lave ce qui revient, elle ne
  fabrique pas de classe ; la boucle du matériel porte cette contrainte.
- **Un atelier qui fabrique une classe hors de son parcours** est signalé (sa
  case, grisée, porte ⚠) : son travail est compté, mais personne ne l'attend.
- **Un parcours qui boucle** est refusé avant de jouer quoi que ce soit.

Le **graphe du Centre des flux** décrit l'unité — qui livre qui. Il ne décide
plus que pour les classes **sans parcours** : un service ne les travaille que
lorsque tous ses fournisseurs dans ce graphe les lui ont livrées. Sa section
« **Ce que le modèle en lit** » le dit.

**L'attente est mesurée, pas dissimulée.** Chaque lot dit combien de temps il a
attendu ses amonts : c'est ce qui désigne la branche lente.

Un **cycle** dans les liaisons est refusé avant de jouer quoi que ce soit : il
bloquerait la fabrication sans jamais rien dire.

Une **annexe** — « Armement 2 » — figure dans le Centre des flux au même titre
qu'un atelier. Tant qu'on ne lui saisit aucune liaison, elle **hérite** de
celles de l'atelier dont elle dépend : c'est une seconde salle, elle attend les
mêmes amonts. Dès qu'on lui en saisit une, **la saisie l'emporte** sur
l'héritage — sans quoi une annexe alimentée autrement que son parent ne serait
pas descriptible.

---

## Ce que le modèle ne fait pas — délibérément

- **Il ne choisit pas les heures de début.** Vous décidez ; il calcule les
  conséquences et nomme ce qui ne tient pas.
- **Il ne répartit pas le travail.** Une même classe fabriquée par deux ateliers
  du même service est **signalée**, pas arbitrée : sans règle de répartition,
  trancher serait inventer. Un service, une classe, un atelier.
- **Il n'invente pas de file d'attente** entre ateliers. Il n'y a ni contenance,
  ni blocage amont, ni vivier. Un atelier fait ses lots, dans l'ordre, à son
  effectif. La seule ressource partagée est le matériel propre.
- **Il ne distingue pas les matériels.** Un seul compte pour les trolleys, la
  porcelaine et les couverts, toutes compagnies confondues.

## Ce qu'il rapporte

- par **lot** : début, fin, durée, attente des amonts, temps d'arrêt ;
- par **atelier** : fin, travail cumulé, attente, arrêt ;
- par **compagnie × classe** : fin, échéance, retard, à l'heure ou non, et les
  services traversés ;
- les **classes du programme que personne ne fabrique** — l'oubli le plus facile.

## Limites connues

- Le barème est **non calibré**. Tant qu'il ne l'est pas, aucun chiffre de sortie
  ne permet de dimensionner une équipe.
- Un atelier travaille ses lots **l'un après l'autre**. Une équipe qui mènerait
  deux lots de front se décrit comme deux ateliers.
- Le rendement est un **coefficient unique**. S'il doit varier par service ou par
  heure, c'est une évolution du barème, pas du moteur.
- Les **unités de matériel par vol** et le **délai après atterrissage** sont des
  valeurs d'attente, comme le barème.
- La journée est **unique**. Un excédent de matériel « disponible demain » n'est
  pas reporté automatiquement : il se saisit comme stock à l'ouverture.
