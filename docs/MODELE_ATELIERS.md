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
homme-minutes du lot = Σ sur ses classes ( pax × minutes/pax + nb vols × minutes fixes )
durée                = homme-minutes ÷ personnes ÷ rendement
```

Les deux coefficients sont lus dans une **table unique**, par service et par
cabine, tenue dans le **Centre des réglages** sous « Le modèle de production ».
Les valeurs en place sont **non calibrées** : elles n'existent que pour que le
modèle tourne.

Elles se corrigent case par case, ou **s'importent en bloc** : c'est ainsi qu'une
étude de man-minutes entre dans le modèle, sans toucher au moteur. Le fichier
porte `schema: "ory-bareme"` et désigne les services par leur identifiant du
plan ; l'export donne le gabarit. Un service que le barème ne connaît pas est
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

### Ce qu'un vol emporte se compte comme le barème

**Par passager ET par vol, classe par classe.** Pas au seul passager.

Un trolley part avec **le vol** : sa quantité ne bouge pas parce que la cabine
est à moitié vide. La porcelaine suit **le passager**, mais seulement en avant.
Une unique « unité par passager » devait donc faire les deux, et n'en faisait
bien aucune.

| | Ce qu'on y met |
|---|---|
| **u / vol** | ce qui part avec l'avion — trolleys, caissons, fours |
| **u / passager** | ce qui suit les gens — porcelaine, couverts en cabine avant |

Qui n'a pas d'unité au passager met simplement cette colonne à **zéro** : c'est
le cas le plus courant, et le modèle n'en compte alors que par vol.

| Réglage | Sens |
|---|---|
| Unités par classe | **non calibré**, par passager et par vol |
| Propre à l'ouverture | le stock de départ, souvent nul |
| Délai après atterrissage | minutes avant que le sale soit à la plonge |

Une saisie d'hier, qui ne portait qu'un « unités par passager » unique, est
relue telle quelle : elle donne exactement le même résultat.

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

Une compagnie × classe n'est pas une ligne mais un **assemblage** : sa part food
vient des appros, son matériel du magasin et des retours de dotation, son
armement de l'armement — et tout cela converge au montage.

Ce parcours **n'est pas inventé par le moteur** : il se lit dans le graphe des
liaisons du **Centre des flux**. Cet onglet n'est donc plus décoratif — il
**décide**. Il porte pour cela une section « **Ce que le modèle en lit** » qui
montre, service par service, ce qu'il attend et à qui il livre, et qui nomme ce
qui empêcherait la journée de se jouer :

- un service qui **fournit sans avoir d'équipe** — rien n'en sort, et personne
  ne l'attend ; c'est le cas que la *mise à disposition* règle ;
- une équipe qui **ne fabrique rien** ;
- un service **relié à personne**, ou qui **ne livre à personne** ;
- une **boucle sans fin**.

Du graphe, le moteur ne retient que le **sens** des liaisons actives, d'un
service à un autre. La famille de flux, les stockages, la précision et les
règles de circulation humaine restent de la description. La règle tient en une
phrase :

> Un service ne peut travailler un lot que lorsque **tous ses fournisseurs**
> dans ce graphe ont livré **toutes les classes** de ce lot.

Deux conséquences utiles :

- **Le parcours peut différer d'une classe à l'autre.** Un service qui ne
  fabrique pas une classe donnée n'est pas attendu pour elle. C'est la présence
  de la classe dans un lot qui met le service sur son chemin.
- **L'attente est mesurée, pas dissimulée.** Chaque lot dit combien de temps il
  a attendu ses amonts : c'est ce qui désigne la branche lente.

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
- Les **unités par passager** et le **délai après atterrissage** sont des valeurs
  d'attente, comme le barème.
- La journée est **unique**. Un excédent de matériel « disponible demain » n'est
  pas reporté automatiquement : il se saisit comme stock à l'ouverture.
