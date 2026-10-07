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

C'est voulu (confirmé le 24/09) : **on produit une compagnie × classe en une
fois pour tous ses vols de la journée**, quelle que soit leur heure. Le repas
d'un vol du soir est donc prêt avec celui du matin et attend en stock jusqu'à
son chargement — FBU · Business peut y passer près de 12 h. Ce temps en stock
est une mesure, pas une anomalie.

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
quand la précédente est finie**. Conséquence voulue (confirmée le 24/09) : un
retard ou un blocage sur une ligne — matériel propre absent, amont en retard —
**retarde toutes les suivantes de la case**, et avec elles la suite de leurs
chemins. Le simulateur le montre, il ne le contourne pas. C'est ce qui permet à un atelier d'enchaîner
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

### Effectif calculé ou constant (05/10)

« Le nombre de personnes sur les ateliers dépend du nombre de vols et n'est pas
constant, à part sur certains ateliers. » Chaque service porte donc un choix,
une case dans sa fiche (Équipes › Services et équipes) :

- **calculé** (case « Effectif constant » non cochée) : une équipe qui prépare à
  la main ne lit plus ses personnes, le moteur les déduit de son travail ;
- **constant** (case cochée) : l'effectif saisi, équipe par équipe, comme avant.

```
homme-minutes de l'équipe = Σ sur ses commandes ( minutes par vol × vols de la compagnie )
                            (+ l'étape faite à la chaîne, le cas échéant)
poste                     = minutes qu'une personne travaille entre son arrivée et la
                            fin de sa présence, moins les pauses fixes et du régime
personnes                 = ⌈ homme-minutes ÷ (poste × rendement) ⌉
```

Pour une équipe à la chaîne, le poste le plus lent donne le rythme : on prend le
plus petit effectif dont la durée à la chaîne tient dans le poste. Sans régime
(pas de fin de présence), on compte une présence ordinaire.

La journée est ensuite **jouée avec cet effectif** : les attentes entre services
ne sont pas dans le calcul, c'est la simulation qui dit si ça tient (une équipe
qui attend la cuisine peut déborder de son poste). L'effectif calculé devient
celui de l'équipe : planning, budget, exports et tableaux lisent le même nombre.
L'effectif saisi avant le calcul est gardé (`personnesSaisies`) : cocher
« Effectif constant » le retrouve, rien ne se perd à la première ouverture.

Ne se calculent jamais : le **robot** (sa ligne et son minimum), la **plonge**
(ses tunnels), le **handling** (durées par vol, chauffeurs) et la **mise à
disposition** — ils ne travaillent pas en homme-minutes.

Constants par défaut : **CF départ food** (les checkeurs, à heures fixes), le
**magasin**, la **légumerie**, le **duty free** et les **appros**. Les autres
services se calculent. Le calage de la v2 rejoue les journées avec les personnes
du planning réel : il ne recalcule pas l'effectif ; l'essai « une personne de
plus » du budget impose son effectif à l'équipe essayée.

**Un poste constant n'a pas de minutes par vol (06/10).** « Tous les postes
qui ne dépendent pas des vols n'ont forcément aucun man-hours par vol. » Une
équipe à la main dont l'effectif est constant (son service, ou son choix
« Effectif ») ne lit pas le barème : ses commandes passent dans ses heures de
présence, en temps nul (`hommeMinutes` 0, `constant` au journal). Sa fiche ne
demande ni minutes par vol ni minutes propres ; Minutes de travail la marque
« constant » (et n'a pas de colonne pour un service tout constant) ; aucune
alerte de barème. Seulement quand l'appelant passe `effectifCalcule` (le site
le fait toujours) : le calage de la v2, qui rejoue avec les personnes du
planning, garde le barème.

**L'effectif imposé (essai).** Pour se demander « et avec 2 personnes, ça
tient ? », un poste qui dépend des vols peut garder l'effectif qu'on saisit :
les minutes par vol s'appliquent, la durée est homme-minutes ÷ effectif saisi,
rien n'est calculé. Case « Effectif imposé (essai) » sous « Effectif
constant » dans la fiche du service, ou « Dépend des vols, effectif imposé »
dans le choix d'une équipe (`effectif: 'impose'` ; moteur : `effectifImpose`).

**Un seul atelier, pour certaines compagnies (07/10).** Nature de service
« Un seul atelier : x personnes, à telle heure, pour certaines compagnies »
(le BOB, les checkeurs de CF départ food). Une seule équipe à la main
(`parCompagnie`, `effectif: 'fixe'`, `compagnies: ['AF', …]`) ; ses lots sont
recalculés avant chaque journée : toutes les commandes de ses compagnies, dans
l'ordre des départs. Constant, il n'a pas de minutes : ses commandes passent
dans ses heures de présence. Cocher une compagnie fait passer ses flux par le
service ; le moteur ne compte pas d'« étape sautée » pour les autres
compagnies qui y passent.

**Les superviseurs / coordinateurs (06/10).** Un champ par service, dans sa
fiche (« Ce qu'il fait ») : combien sont présents (`encadrement`, par
service). Hors production, ils ne changent rien au calcul ; ils serviront à
relier l'unité au budget quotidien, où ils figurent.

**Une équipe peut faire autrement que son service (06/10).** « Le poste ne
dépend pas forcément des vols. » Chaque équipe qui prépare à la main (et chaque
équipe hors tunnel) a son choix « Effectif » : *comme le service* (par défaut),
*dépend des vols* ou *constant (saisi)* — champ `effectif` ('calcule' ou
'fixe'). Une équipe constante dans un service calculé retrouve l'effectif
qu'on lui avait saisi ; une équipe calculée dans un service constant se calcule
comme les autres.

**Les mises à disposition ont aussi leurs personnes (06/10).** « Même si
c'est une zone, les gens y travaillent, en quantité constante : 2 personnes
aux appros, ce sont 2 personnes en tout sur la journée. » Le champ
« Personnes sur la journée » de sa case le dit. Ces personnes ne changent rien
au calcul (on vient s'y servir, sans attendre une équipe) mais comptent dans
l'effectif du jour (comparaison de scénarios) et, dans la v2, dans le budget :
une vacation chacune (la présence du poste, 8 h dont 1 h de pause par défaut). Leur effectif
est toujours constant.

**Les équipes hors tunnel, hors flux (06/10).** « Pouvoir rajouter des équipes
qui ne dépendent pas du tunnel, comme pour les autres, avec le choix si cela
dépend des vols ou non. » Une équipe d'appui (`type: 'appui'`) est présente à
ses heures, ne prépare pas de commande, ne tient pas de tunnel et ne fait rien
attendre. À la plonge : « + Ajouter une équipe hors tunnel ».

- Service à **effectif constant** : son effectif est celui saisi.
- Sinon, il **dépend des vols** : ses minutes par vol (`minutesVol`, par
  compagnie, « * » pour toutes) × les vols de chaque compagnie ÷ son poste.
  À la plonge, les vols comptés sont ceux qui **reviennent** (la source des
  retours : programme RET, départs de la veille ou planche retour) ; ailleurs,
  les départs du jour. Sans minutes renseignées, l'effectif saisi reste.
- Elle part à la fin de sa présence (pas d'heures sup) et compte dans
  l'effectif du jour et le budget v2.

Moteur : option `effectifCalcule` (les services calculés) de `simuler`, résultat
`effectifs` ({ personnes, saisi, hommeMinutes, poste, rendement } par équipe),
fonctions `minutesDuPoste` et `effectifPour`. Une équipe `effectifFixe` n'est
pas calculée.

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

### Deux étapes à la chaîne dans une case (retour d'usage du 29/09)

« Une personne dresse un plat puis le passe, l'autre fait le montage
directement » — et seulement pour certaines compagnies. Une case qui prépare
peut faire **aussi l'étape d'avant** (`fusion` : le service de cette étape, par
ex. la Prépa dans une case de Montage), pour **ses** commandes seulement :

- ses commandes quittent les cases de l'étape d'avant (les deux cases n'en font
  qu'une) ; pour elles, cette étape n'est pas un trou, et ce qui la suivait
  (une autre branche du chemin) attend la case qui l'a faite ;
- la case attend ce qui précède l'étape qu'elle absorbe (la cuisine) ;
- sa durée, pour `P` minutes de l'étape d'avant (barème de ce service), `M`
  minutes de la sienne et `n` personnes :
  - `n = 1` : **P + M** — la personne fait les deux, l'un après l'autre ;
  - `n ≥ 2` : **min sur k de max(P ÷ k, M ÷ (n − k))** — k personnes au premier
    poste, n − k au second ; le plus lent donne le rythme ;
- les autres compagnies gardent leurs deux cases ;
- **seulement les commandes dont le chemin passe par l'étape d'avant**
  (retour d'usage du 01/10) : une équipe qui fait Prépa + Montage pour CRL et
  TX PC fait le Montage seul pour RAM et AH YC, dont le flux n'a pas de
  Prépa. Pour elles, ni minutes de Prépa, ni « faite à la chaîne » ; dans la
  fiche de la Prépa, elles ne sont ni cochées ni cochables ; au Montage, ⛓
  marque celles qu'elle fait à la chaîne.

Réglage : fiche de la case, « À la chaîne avec l'étape d'avant ? ». Excel :
colonne « À la chaîne avec » de la feuille Ateliers.

### Un service qui travaille par compagnie : l'armement, lié au handling (01/10 et 02/10)

« L'armement ne travaille pas en fonction de BC, PC, Éco, SPML » ; « une
seule case par compagnie, oui ou non » ; « l'armement est toujours lié au
handling ».

**Une branche à part dans chaque chemin.** On arme un vol, pas une classe :
un vol AF en Business et en Éco ne s'arme qu'une fois. Et l'armement
travaille en parallèle des repas, pas avant eux : dans chaque chemin, il est
une branche à part, reliée seulement au handling, qui charge le vol quand
repas et armement sont prêts.

`etat.categories = { [service]: [{ id: 'ARM', nom: 'Armement', minutes: { '*': 10, AF: 15 } }] }`
— un seul réglage par service (fiche : « Ce service… travaille par
compagnie » ; la fiche d'un service dont le nom dit « armement » le propose).

- **Une case par compagnie dont un chemin passe par le service** (`AF/@ARM`,
  « AF · Armement ») — comme une commande a sa case dans chaque service de
  son chemin (retour d'usage du 02/10 : « dans le chemin EZY, l'armement est
  bien présent, et je ne peux pas faire apparaître sa case »).
  `compagniesParService`, `classesCategories`.
  - **Avec ou sans vol** : une compagnie ajoutée à la main, que le programme
    ne porte pas encore, a sa case, à 0 vol (la fiche le dit).
  - **La liste « Compagnies chargées » d'un handling** dit QUI charge le vol,
    pas s'il s'arme : elle ne grise aucune case. Une compagnie qu'aucun
    handling ne charge est signalée par le calcul.
  - **Pas de case** : la compagnie dont aucun chemin ne passe par le service ;
    la fiche la nomme.
  - Cochée dans une équipe : armée ; sinon, elle ne l'est pas (et le handling
    ne l'attend pas). Le handling ne charge que les vols dont une commande
    est préparée.
- **Minutes par vol** selon la compagnie (« Toutes les compagnies » par
  défaut) × vols ; échéance du vol. Sans minutes : le calcul le dit.
- **Toujours selon les vols** (retour d'usage du 07/10 : « l'armement dépend
  du nombre de vols de la compagnie ») : un service par compagnie n'est
  jamais constant. Ses équipes ont l'effectif calculé — minutes par vol ×
  vols de chaque compagnie ÷ minutes du poste — ou, en essai, imposé. La
  fiche n'a pas de case « Effectif constant », l'équipe pas de choix
  « Constant » ; un ancien choix « constant » s'efface au calcul
  (`ateliers.parVols`, `synchroniserAteliers`). Le tableau des minutes de la
  fiche montre, par compagnie, ses vols du jour et le travail de la journée
  (minutes × vols), avec le total.
- **Le handling** attend l'armement du vol pour le charger.
- **Dans les chemins** (retour d'usage du 02/10 : « intègre l'armement sur
  tous les chemins et lie-le uniquement au handling ») : dans chaque chemin
  (flux et chemins propres), l'armement est une branche à part — un nœud,
  une seule flèche, vers le handling ; aucune vers les repas ni depuis eux.
  Un chemin sans handling le reçoit, relié à l'armement seulement : le
  handling n'est pas la suite des repas (« le handling est le handling, CF
  food c'est juste une zone tampon ») — le calcul sait qu'il charge les repas
  préparés. Un armement placé au milieu d'un chemin en sort (ce qui le
  livrait livre ce qu'il livrait). `PC.delierHandling` retire les flèches des
  repas vers le handling (migration « handling-seul »). `PC.integrerArmement`, `PC.armementIntegre`. Fait une fois au
  chargement dès qu'un handling existe (migration « armement-handling » :
  le service passe par compagnie, ses cases par classe deviennent des cases
  par compagnie — `PC.versParCompagnie` ; « Annuler » le défait) ; la fiche
  dit si c'est fait, sinon « L'intégrer à tous les chemins, relié au
  handling ». Sur le chemin des repas, il n'est jamais un trou ; le tableau
  des minutes ne lui donne pas de colonne (ses minutes sont dans sa fiche).
- **Excel** : feuille « Par compagnie » (Service, Compagnie, Minutes par vol) ;
  dans « Fabrications », la case s'écrit `AF/@ARM`.

### Une équipe qui ne travaille que certains jours (retour d'usage du 01/10)

« S'il y a tant de vols Air France, une personne est consacrée au montage AF ;
sinon elle est rattachée à un autre atelier. » Une seule forme de règle, qui
se lit comme une phrase dans la fiche de l'équipe :

> ⚡ Cette équipe ne travaille que si **AF** a au moins **6** **vols** ce
> jour-là. Sinon, ses commandes passent à **Montage général**, et ses
> personnes **ne viennent pas : elle absorbe la charge**.

`condition: { cie, seuil, mesure, sinon, renfort?, absorbe? }` sur une équipe qui
prépare (à la main ou au robot) :

- `cie` : une compagnie, ou `*` (toutes) ; `mesure` : `vols` (départs du jour)
  ou `repas` (passagers des départs) ; `seuil` : au moins 1 ;
- `sinon` : une **autre équipe du même service**, qui reprend ses commandes ;
  elles s'insèrent dans sa liste par échéance, sans déranger l'ordre des
  siennes (avec leurs man-minutes propres) ;
- ses personnes, ces jours-là (retour d'usage du 01/10 : elles ne vont pas
  forcément sur l'autre atelier) :
  - `absorbe: true` — elles ne viennent pas, l'équipe `sinon` absorbe la
    charge avec ses propres personnes (le choix proposé par défaut) ;
  - `renfort` — elles renforcent cette équipe, de n'importe quel service ;
  - ni l'un ni l'autre — elles suivent les commandes (renfort de `sinon`).

La règle se joue **dans le moteur**, au début de la journée, sur les vols du
jour (`appliquerConditions`) : toute journée rejouée la respecte (calage,
budget de la v2). Si l'équipe `sinon` ne travaille pas non plus, on suit sa
propre règle ; si l'on tourne en rond ou qu'aucune équipe du service ne
travaille au bout, l'équipe **garde** ses commandes plutôt que de les perdre
(`sansIssue`). Le résultat porte `conditions` : pour chaque règle, le compte
du jour, si elle est remplie, et où sont allées les commandes et les
personnes. L'enregistrement retire une règle dont l'équipe `sinon` a disparu
ou a changé de service.

Visible : un badge ⚡ sur l'équipe (« travaille aujourd'hui » / « pas
aujourd'hui »), la phrase et le constat du jour dans sa fiche, la carte en
pointillés un jour de repos ; dans le budget de la v2, ses personnes sont
payées à la vacation de l'équipe qu'elles renforcent, et rien quand l'autre
équipe absorbe la charge (elles ne sont pas planifiées). Excel : colonnes « Ne
travaille que si » (`AF ≥ 6 vols`, `toutes >= 300 repas`), « Sinon, commandes
à », « Sinon, personnes à » (`aucune` : l'autre équipe absorbe la charge)
de la feuille Ateliers.

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
| Pause après 6 h de **travail** | 45 min |
| Présence totale sur le site | 8 h |

« 8 h de présence avec 1 h de pause : 3 h de travail, 15 min de pause, 3 h,
45 min, puis le reste des 7 h » (retours d'usage du 06/10 ; c'était 8 h 15,
avec 15 min après 3 h et 30 min après 6 h). Ces valeurs sont **réglables**
dans le Centre des réglages, et les seuils s'ajoutent ou se retirent. Une
sauvegarde restée sur une règle par défaut d'avant, telle quelle, passe à la
nouvelle à l'ouverture ; une règle modifiée à la main ne bouge pas.

Soit **7 h de travail effectif**. Les seuils comptent le travail *cumulé*,
pas l'heure qu'il est : une équipe qui attend ses amonts ne consomme pas son
crédit de travail, donc ne prend pas sa pause.

Une fabrication que le poste ne peut pas finir est **signalée et laissée
inachevée** : sa fin est vide, sa classe ne sort pas, et les suivantes ne sont
pas commencées.
C'est le résultat le plus utile du modèle — ce qui ne rentre pas dans la
journée. Le régime se désactive atelier par atelier, et la durée de présence se
règle, pour une équipe qui ne suit pas la règle commune.

### Le robot

Une machine : un **débit en plateaux par heure** plutôt que des man-minutes, et
un **effectif minimum** pour tourner (en dessous, il ne tourne pas ; au-dessus,
le débit ne change pas).

| Champ | Sens |
|---|---|
| `type: 'robot'` | |
| `debit` | le débit du robot, plateaux/h |
| `debits` | facultatif : `{ 'TX/YC': 450 }`, le débit propre d'une commande (confirmé le 28/09) |
| `personnesMin` | l'effectif minimum pour tourner |

Une commande y dure **ses plateaux ÷ son débit**. Le service **Robot** est
rattaché au Montage ; il le remplace sur les chemins de TX, CRL et FBU Économie,
où une seule case Robot prépare ces commandes, l'une après l'autre.

**Une seule ligne physique** (retour d'usage du 29/09) : « le robot est une
seule ligne, partagée par l'équipe du matin et celle de l'après-midi, avec une
pause entre 12:15 et 13:00 ». Les cases Robot d'un même service tournent sur
UNE ligne : un lot à la fois, dans l'ordre des demandes, quelle que soit
l'équipe. Deux équipes ne font pas deux robots.

| Champ | Sens |
|---|---|
| `lignePropre` | `true` : un second robot, sa propre machine |
| `arretsLigne` | `[{ de: '12:15', a: '13:00' }]` : les arrêts de la machine, chaque jour ; ceux de toutes les cases de la ligne valent pour toutes |

Le temps passé à attendre la ligne s'ajoute à l'attente du lot
(`attenteLigne`) ; la fiche le dit (« Attend la ligne 60 min »).

### La mise à disposition

Un magasin, des appros, tout service qui se contente de **sortir du matériel ou
des matières premières** ne fabrique rien. Il a préparé à l'avance, ou il sert
dans l'instant.

| Champ | Sens |
|---|---|
| `type: 'dispo'` | |
| `permanent` | **vrai par défaut** : personne ne l'attend |
| `vagues` | quand `permanent` est faux : `[{ debut, jour }]`, ses vagues dans la journée |
| `debut` / `jour` | sa première vague (lue seule quand il n'y a pas de liste) |
| `ouverture` | quand `permanent` est vrai : `{ de: '07:00', a: '18:00' }`, ses heures d'ouverture chaque jour (une boutique) |

**Comme une boutique (confirmé le 28/09).** « La légumerie, les appros et le
magasin sont libres en permanence entre une heure et une heure. » Chaque jour
(J-1, J…), de `ouverture.de` à `ouverture.a`, on y est servi à l'instant où
l'on vient ; en dehors, l'étape qui en a besoin **attend l'ouverture**, et
cette attente compte dans la sienne (« attend 180 min »). Une plage qui passe
minuit (22:00–06:00) est permise ; ouverture = fermeture est refusé. Trois
façons de servir, au choix dans la fiche (« Quand sert-il ? ») : ouvert de …
à … (boutique), toujours ouvert, à heures fixes (vagues).

**Par vagues (confirmé le 28/09).** La légumerie, le magasin, la réception
travaillent **pour toutes les commandes à la fois**, en plusieurs vagues (ex.
J-1 14:00 puis J 04:00). Chaque commande prend **la vague qui précède son
besoin** — l'heure où l'étape d'après commence à l'attendre ; avant la
première, elle l'attend. Le journal porte une ligne par vague, avec les
commandes qu'elle sert : c'est ce que montrent le chemin, le planning et le
tableau « Qui prépare quoi » (« vague 2 · 04:00 »).

**Une seule case par poste, partagée.** Sur un chemin, ces postes ne se
règlent pas commande par commande : une seule question, « Besoin de
légumerie ? ». Oui : le service entre dans le chemin, relié comme sur les
autres chemins (en enjambant ce qui n'y est pas), et la case partagée le sert.
Des cases d'avant, une par commande, se fondent en une (« Passer à une case
partagée ») : leurs heures de début deviennent ses vagues.

Ni effectif, ni barème, ni durée — et **aucune liste** : elle sert **toutes**
les compagnies × classes, sans qu'on les énumère. Le magasin sort du matériel
pour qui en demande.

> **Règle (confirmée le 24/09) : on ignore les man-minutes d'un poste de mise
> à disposition.** Un man-minute se déduit d'une cadence. Une légumerie, un
> magasin ont bien une cadence, mais ils travaillent **à la demande** : leur
> temps suit ce qu'on leur réclame, il ne pilote pas la journée. On ne les
> décrit donc que par **l'heure à partir de laquelle ils servent** (ou
> « en permanence »). Leurs lignes du budget (ex. « Désinfection légume »,
> 7 h/jour) ne vont ni dans le barème, ni dans la case.

> **Mais elle ne fabrique rien.** Une classe dont la mise à disposition est la
> seule étape reste « jamais fabriquée ». Sans cette distinction, ouvrir un
> magasin suffirait à afficher « 100 % à l'heure ».

Elle figure malgré tout au **parcours** de ce qu'elle sert : c'est ce qui permet
de voir d'où vient le matériel. Sur le planning, c'est un repère, pas une barre.

Deux mises à disposition ne se cumulent pas : un service qui en porte une **et**
un autre atelier est signalé, car le second ne serait jamais attendu.

### Le handling : les chauffeurs (retour d'usage du 28/09)

« Le handling récupère les trolleys prêts dans la CF départ et charge les vols :
2 chauffeurs pour les compagnies long courrier, 1 pour les court courrier. »
Un handling avec des **créneaux** (`creneaux: [{ de, a, n }]`, le jour J) ne
charge plus « N vols à la fois » : chaque vol occupe `chauffeurs.long` (compagnie
de `longs`) ou `chauffeurs.court` chauffeurs pendant son chargement, et attend
qu'il y en ait assez de libres (`attenteChauffeurs`). Les vols restent pris dans
l'ordre des départs. Un vol qui demande plus de chauffeurs qu'aucun créneau
n'en offre n'est pas chargé (`handling-chauffeurs`). La durée d'un vol reste
celle de sa compagnie.

### Le camion du handling (retour d'usage du 28/09)

« Nombre de chauffeurs par camion, combien de vols charge un camion (en
général 1), et le temps = aller sur la piste + charger l'avion + revenir à
l'unité. » Un trajet part avec `chauffeurs.long` ou `chauffeurs.court`
chauffeurs (selon la catégorie de la compagnie) ; il dure `allers[cie]` (du
quai à l'avion) + `durees[cie]` (charger l'avion, pour chaque vol du camion) +
`retours[cie]` (revenir à l'unité), `*` pour toutes. Le vol est chargé à la
fin de SON chargement ; les chauffeurs et le camion sont pris jusqu'au retour.
`volsCamion[cie]` (sinon `volsParCamion`, 1 par défaut) : combien de vols de
cette compagnie un camion charge ; il prend aussi les vols suivants dans
l'ordre des départs, **de la même compagnie**, déjà complets et dont le « pas
avant » est passé quand il y arrive — un seul aller, un seul retour.
`camions` : combien de camions peuvent être dehors en même temps (0 : pas de
limite). Sans créneau de chauffeurs, « vols en même temps » compte les camions.

### Le handling : le vol redevient l'unité

Tous les autres services préparent une compagnie × classe **une fois pour tous
ses vols** de la journée. Le handling, lui, **réunit les classes d'un même vol**
(AF1234 : sa Business, son Économie, ses plateaux équipage) et le charge
(retour d'usage du 28/09).

| Champ | Sens |
|---|---|
| `type: 'handling'` | |
| `durees` | minutes par vol et par compagnie, `{ AF: 45, '*': 30 }` ; `*` pour les autres |
| `simultanes` | combien de vols il prépare à la fois (quais, camions) |
| `avance` | il ne commence pas un vol plus de `avance` minutes avant son départ (180) |
| `compagnies` | facultatif : celles qu'il charge ; vide = toutes |

Les règles, confirmées :

- **Strictement dans l'ordre des départs.** Si le vol de 08:00 n'est pas
  complet, le handling l'attend, même si celui de 08:30 l'est déjà. Un vol
  jamais complet retient tous les suivants, et c'est dit (`handling-bloque`).
- **Une durée par compagnie**, pas des man-minutes : l'effectif ne la raccourcit
  pas. Avec `simultanes` > 1, chaque quai prend le vol suivant, toujours dans
  l'ordre.
- **Deux échéances.** Une commande doit être **au handling** au départ moins le
  délai de chargement (son échéance ne change pas) ; le **vol** doit être chargé
  à son heure de départ. Une commande est donc « prête » quand ses étapes à elle
  sont finies — le handling de ses vols n'entre pas dans son heure.
- Il n'a **pas de liste de commandes** et n'est jamais un trou sur un chemin : il
  attend, pour chaque classe du vol, les services qui la précèdent sur son
  chemin, ou — si le chemin ne passe pas par lui — tous ceux qui la préparent.
- **Il travaille le jour J des vols**, jamais la veille : sa case est toujours
  au jour J (le choix du jour n'est pas proposé, un J-1 dans Excel est refusé),
  et il ne commence aucun vol avant 00:00 de ce jour, même si « pas avant »
  le permettrait. Les commandes, elles, peuvent être prêtes dès la veille.
- Plusieurs handlings : chaque vol va au premier qui charge sa compagnie, sinon
  au premier qui les charge toutes.

Le résultat porte `vols` : pour chaque départ, l'heure où il était complet, le
début et la fin du chargement, le retard sur le départ et son état (`ok`,
`retard`, `bloque`, `poste`). La page Départs, la Synthèse, le Planning et la
comparaison des essais les montrent.

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

### D'où viennent les retours (retour d'usage du 29/09)

`materiel.retours` choisit la source, dans Réglages › Réglages de la
simulation :

| Source | Chaque retour | Heure à la plonge |
|---|---|---|
| `programme` (défaut) | une ligne RET du programme de vols | arrivée + délai après atterrissage |
| `j1` | chaque départ du programme, revenu le lendemain | heure de départ + délai (le départ de la veille à la même heure : +24 h) |
| `planche` | une ligne de `materiel.planche` (planche retour du handling) | `heure` + `jour` × 1 440, **sans délai** : c'est l'arrivée à l'unité |

Une ligne de planche porte `vol`, `cie`, `heure`, `jour` (0, -1… -3) et,
facultatifs, les passagers `bc`, `pc`, `yc`, `crew`, `spml`. Sans classes, le
vol ramène les unités des classes que sa compagnie emporte au départ (YC si la
compagnie ne part pas ce jour-là). Les deux plonges, au débit comme par vol,
lisent la même source (`retoursDeVols`). Un ancien réglage `j2` (48 h, un
jour en service) se lit `j1`.

« ⇄ Comparer J+1 et planche retour » calcule la journée deux fois sans toucher
au réglage et remplit les essais A (J+1) et B (planche) de la comparaison, qui
compare aussi la plonge : matériel revenu, plus longue attente, sale restant.

Une saisie d'hier, qui comptait aussi par passager, est convertie en unités par
vol sur la base des mêmes passagers types que le barème.

Un atelier de type **Lavage** ne fabrique rien : son travail vient des retours, à
mesure qu'ils arrivent. Il suit le même régime de poste que les autres — ce qui
arrive après la fin de son poste reste sale.

### La plonge par vol (retour d'usage du 28/09)

« Le débit de tunnel se parle en vol : un tunnel lave un vol en tant de
temps. » Une plonge `parVol` lave les vols revenus (sens RET), dans l'ordre de
leur retour (arrivée + `delaiRetour`) ; **chaque tunnel qui tourne** (tenu par
quelqu'un, dans l'ordre de la liste) en prend un, pour la durée de sa
compagnie (`durees`, `*` pour toutes). Un vol qui arrive quand tous les
tunnels sont pris attend ; un vol qui ne peut pas être lavé avant la fin du
poste ne l'est pas (`plonge-vol`) ; une compagnie sans temps est signalée
(`plonge-duree`). Avec la boucle du matériel, les unités du vol redeviennent
propres à sa sortie du tunnel. Un tunnel peut aller plus vite qu'un tunnel
normal (`vitesse`, 2 = deux fois plus vite) : les temps par compagnie sont
ceux d'un tunnel normal, et chaque vol va au tunnel qui le rend propre le plus
tôt (à égalité, celui qui est libre depuis le plus longtemps). Le mode « par débit » ci-dessous reste au choix
dans la fiche.

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

### Le bouchon à la plonge : la file de sale

Les retours arrivent au rythme des vols, les tunnels lavent au leur. Quand il en
revient plus qu'ils n'en lavent, **une file se forme**. Le calcul la suit :

- **le sale pas encore lavé**, dans le temps : il monte d'un coup à chaque
  retour, et baisse au rythme des tunnels pendant qu'ils lavent (ce qui est dans
  un tunnel compte tant qu'il n'en est pas sorti) ;
- **l'attente** de chaque unité, de son retour à sa sortie du tunnel, dans
  l'ordre des retours (premier revenu, premier lavé) : la plus longue et la
  moyenne ; ce qui n'est jamais lavé attend jusqu'à la fin de la journée ;
- **les retours heure par heure** face au **débit des tunnels** (ceux qui
  tournent) : les heures où il revient plus qu'ils ne lavent sont nommées.

Au-delà d'une heure d'attente, un point à regarder le dit (« Bouchon à la
plonge : jusqu'à 740 u… »), sans bloquer la journée.

## 3 bis. Le temps entre deux ateliers : les stocks

Si la cuisine finit TX BC à 07:10 et que la prépa ne la prend qu'à 09:10, TX BC
passe **deux heures en stock** entre les deux. Le calcul le lit dans le journal,
sans rien inventer : pour chaque préparation et chaque commande, la fin de la
préparation de chaque service d'avant sur son chemin, et le début de celle-ci.
De même entre la dernière étape et **le chargement de l'avion**. Une mise à
disposition (le magasin ouvert) n'est pas un stock produit.

C'est l'inverse de l'attente : l'attente, c'est l'aval qui est prêt et attend
l'amont ; le stock, c'est le produit fini qui attend l'aval.

Pour chaque séjour : d'où, vers où, quelle commande, de quand à quand, combien
de repas (ses passagers). Par lien : le plus de repas en stock à la fois et
quand, le séjour le plus long, la moyenne. Devant un service : le niveau du
stock dans le temps, **une commande comptant une fois** même livrée par deux
services d'avant (le matériel par la dotation, les produits par le magasin).

Où on le voit :

- sur le **chemin** d'une commande, en bleu sur chaque lien : le temps qu'elle y
  passe en stock ; et dans la fenêtre de sa case : « Livrée par Cuisine à 07:10,
  prise à 09:10 : 2 h 00 en stock (32 repas) » ;
- dans la **frise** d'une commande (« Qui prépare quoi », dernière colonne) : un
  trait bleu « en stock » avant chaque étape, et la phrase qui résume ;
- dans **La journée › Stocks et retours** : le tableau des stocks par lien, avec
  leur niveau au fil de la journée (même échelle pour tous), puis la plonge :
  cinq chiffres, les retours heure par heure face au débit, et le sale pas encore
  lavé ; au survol, la valeur de chaque heure ;
- sur le **plan rejoué** : une pastille au-dessus d'un service, « 32 repas en
  stock » ou « 540 u à laver », et « En ce moment » qui les liste.

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
- **cliquer un service** ouvre sa case dans une **fenêtre à droite de l'écran**
  (sous le diagramme, elle tombait hors de vue) ; la page se range à sa gauche,
  la liste des commandes s'efface le temps du réglage et revient quand on la
  ferme (× ou Échap) ; « Relier à… » la referme aussi. On y trouve : choisir une case existante du
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

### Les flux de production (Chemins, 30/09)

Un **flux** est un parcours partagé (`type: true`) : celui d'une classe
(`parcoursCabine`), celui de plusieurs commandes, ou un modèle en réserve. Un
parcours désigné par une seule commande reste son **chemin propre** (une
exception, réglée dans Chemins › Chemin d’une commande). `marquerTypes` pose la marque à la
lecture ; `cheminDe` ne renvoie jamais un flux (le modifier pour une commande
le modifierait pour toutes) ; `typeSuivi` donne le flux qu'une commande suit,
`fluxDe` ce par où elle passe.

- **Tout le flux** (`changerFlux`) : le service entre dans le flux à sa place
  (`insererService` : ceux qui le livrent et ceux qu'il livre, lus sur les
  autres flux, les modèles types puis les liens de l'unité — sans les retours
  des vols, qui fermeraient une boucle ; il s'intercale ; jamais de boucle),
  ou en sort (`retirerService` : ceux qui le livraient livrent ceux qu'il
  livrait).
- **Seulement pour ces commandes** (`adapter`) : la commande passe à une
  **variante** — même structure que son flux, un service en plus ou en moins.
  Une variante identique existe (même `signature`) ? elle la rejoint ; sinon
  elle naît (`auto`), nommée par son écart au flux de sa classe
  (« Sans cuisine + Robot sans Montage »). Une variante que plus personne ne
  suit s'en va (`nettoyerTypes`).
- **La grille des équipes** (`cocher`) ne change que les équipes ; elle
  renvoie les commandes cochées dont le flux ne traverse pas le service
  (`horsFlux`) et celles que plus personne n'y prépare (`orphelines`) : c'est
  l'interface qui demande. Une commande sans aucun flux reçoit celui de sa
  classe, qui naît avec ce service.
- **Regrouper** (`regrouper`) : les chemins propres de même structure
  deviennent un flux ; le plus suivi d'une classe en devient le flux, les
  autres des variantes. Le calcul voit les mêmes chemins.

`grille` dit, pour chaque commande, ce que montre la case de la grille :
préparée ici, par une autre équipe, à la chaîne ailleurs, attendue (son flux
passe par le service et personne ne l'y prépare) ou hors du service.

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
