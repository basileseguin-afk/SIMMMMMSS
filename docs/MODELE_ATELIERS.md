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
ni la légumerie. Chaque classe suit donc un **parcours** : des **branches** qui
partent en parallèle et se rejoignent là où elles partagent un service.

```
Agro       RÉCEPTION / APPROS → LÉGUMERIE → CUISINE → MONTAGE
Matériel   PLONGE → DOTATION ─────────────────────→ MONTAGE
Magasin    MAGASIN ───────────────────────────────→ MONTAGE
```

Le montage attend alors **les trois branches** ; la dotation n'attend que la
plonge, la cuisine que la légumerie. La règle tient en une phrase :

> Un service ne travaille un lot que lorsque **les services qui le précèdent sur
> le parcours de chaque classe** du lot la lui ont livrée.

Les parcours se décrivent à l'étape 2, « Qui prépare quoi », section « 1. Le
chemin des repas » : un schéma par parcours, une ligne par branche, la jonction à droite.
« Modifier » ouvre ses branches : chaque étape est un menu. Deux parcours types
sont créés d'office — **Complet** pour BC, PC, CREW et SPML, **Sans cuisine**
pour YC — et se modifient librement.

### Qui prépare quoi : le chemin et les équipes dans un seul tableau

Le parcours dit **par où** passe une classe ; les équipes disent **qui, quand et
en combien de temps**. La section « 2. Qui prépare quoi » les réunit dans un
tableau qui se lit comme une feuille Excel :

- **une ligne par compagnie × classe**, avec son heure de départ et son
  parcours (modifiable sur place) ;
- **une colonne par service**, rangées par branche (Agro, Matériel, Magasin),
  puis la jonction ;
- **dans chaque case, l'équipe** qui la fabrique et ses heures. Trois aspects
  se voient de loin : **remplie** (vert), **« à choisir »** (pointillés orange),
  **grisée** quand le parcours de la ligne ne passe pas par ce service. Une
  plonge ou une mise à disposition, qui sert tout le monde, s'écrit en clair.

Les gestes :

- **Cliquer une case** ouvre un petit menu : les équipes du service (avec leur
  heure, leur effectif et leur charge), « Nouvelle équipe », « Vider la case »,
  et une case à cocher pour **remplir d'un coup toutes les cases « à choisir »
  de la colonne**. Une classe confiée à une équipe quitte les autres équipes du
  même service, et s'ajoute à la fin de sa liste, rangée par heure de départ.
- **Cliquer le nom d'un service** remplit toutes ses cases vides à la fois.
- **« Remplir automatiquement »** fait tout ce qui n'a qu'une équipe possible.
- **Une nouvelle équipe** naît avec la case cliquée ; sa fiche s'ouvre dans
  « 3. Les équipes » pour régler son heure et son effectif.
- **La dernière colonne** dit quand la ligne est prête, à l'heure ou en retard.
  Un clic la **déplie dans le temps** : une barre par étape, dans l'ordre des
  colonnes, l'attente de l'étape d'avant en orange, le trait de l'heure de
  chargement, et une phrase qui résume — « AF/BC est prête à 06:45 pour un
  chargement avant 05:55 : 50 min de retard. Le plus long à attendre : MONTAGE a
  attendu 25 min que DOTATION finisse. »
- Une barre du haut compte les cases remplies ; on peut **chercher une
  compagnie** ou n'afficher que **les lignes à compléter**. Le tableau se pilote
  au clavier (Entrée ouvre le menu d'une case, Échap le referme).

Les sections « 3. Les équipes » (horaires, effectifs, ordre de fabrication) et
« 4. La journée des équipes » (le planning, équipe par équipe) restent la vue par équipe.

- **Par défaut, par classe** : BC, PC, YC, CREW et SPML ont chacune un parcours.
- **Par compagnie × classe** : chaque ligne du tableau « Qui prépare quoi » a
  son menu de parcours ; une compagnie peut y suivre un autre chemin que sa classe.
- **Une étape sans équipe est enjambée** : si personne ne travaille une classe
  à la cuisine, le montage attend directement ce qui précède la cuisine. Sa case
  reste « à choisir », et les points à regarder le rappellent, sans bloquer la
  journée.
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
