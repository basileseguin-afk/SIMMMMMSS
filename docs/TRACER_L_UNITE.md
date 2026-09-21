# Tracer et paramétrer l'unité — mode d'emploi

Cette note accompagne la séance de saisie : tracer le plan, découper les
services, aménager les ateliers, affecter les personnes. Elle tient en une
page et se lit avant de commencer.

---

## 1. Avant tout : choisir UN endroit de travail et ne plus en changer

Tout ce que vous tracez est enregistré **dans le navigateur**, pas dans un
fichier. Et le stockage d'un navigateur est **cloisonné par adresse** :

| Où vous ouvrez l'application | Stockage utilisé |
|---|---|
| `basileseguin-afk.github.io/SIMMMMMSS/` | celui du site |
| un `index.html` ouvert depuis votre disque | un autre, séparé |
| un autre navigateur, un autre ordinateur | encore un autre |

**Un tracé fait sur le site n'apparaîtra pas dans le fichier local**, et
inversement. Choisissez l'un des deux, et passez par la sauvegarde complète
pour changer de machine.

## 2. Sauvegarder : un seul fichier, souvent

**Données → Sauvegarde complète → ⇩ Tout sauvegarder.**

Un seul fichier réunit le plan, les zones, les stockages, les ateliers, les
personnes, les flux et la bibliothèque de modèles. **⇧ Restaurer** le relit,
et refuse le fichier **en entier** si une partie est abîmée — jamais à moitié.

- Sauvegardez **à chaque étape importante**, pas seulement à la fin.
- Datez ou numérotez vos fichiers : la restauration écrase tout.
- Vider les données de site du navigateur efface le travail. Le fichier est la
  seule protection.

> ⚠️ **Ce fichier contient le plan réel de l'unité.** Il ne doit jamais aller
> dans le dépôt public. `.gitignore` refuse déjà `ory-sauvegarde*.json`,
> `plan-ory-*.json`, `ateliers-ory.json`, `centre-flux-*.json` et
> `ory-postes.json`, mais la règle passe avant l'outil.

## 3. Un ordre qui évite de refaire deux fois le travail

1. **Le fond de plan**, si vous l'avez : `plan-prive/tuile1.png` … `tuile12.png`
   à la racine, en local. Sans lui tout fonctionne, seul le calque d'architecte
   manque.
2. **Les zones des services** — *Plan → Éditer les zones*. Corriger position et
   contour ; convertir en forme libre là où un rectangle ment. C'est la base :
   les ateliers ne peuvent pas déborder du contour d'un service.
3. **Les stockages** rattachés à chaque service — nom et contenu.
4. **Les ateliers de travail** — *Ateliers de travail*. Un atelier par équipe :
   son nom, son heure de début, son effectif, et les compagnies × classes
   qu'elle fabrique, dans l'ordre.
5. **Les flux** — *Centre des flux*, pour décrire qui envoie quoi à qui. C'est
   ce graphe qui dit ce qu'un atelier doit attendre avant de commencer.

## 4. Ce que les ateliers changent dans le calcul

La durée d'un lot vient du barème d'homme-minutes, divisée par l'effectif de
l'atelier. Le premier lot part à l'heure de début ; chacun des suivants quand
le précédent est fini. Un lot attend en outre que **tous les fournisseurs** de
son service aient livré ses classes.

Un lot portant plusieurs classes les fabrique **ensemble** : c'est ainsi que se
décrivent les services **en amont de la séparation par compagnie** — appros,
légumerie, plonge, magasin — sans règle particulière.

Le **barème est non calibré**. Tant qu'il ne l'est pas, aucun chiffre de sortie
ne permet de dimensionner une équipe.

## 5. Une seconde salle pour un atelier — « Armement 2 »

Un atelier peut occuper deux endroits de l'unité. Dans **Éditer les zones**,
sélectionnez l'atelier et cliquez **Dupliquer** : vous obtenez « ARMEMENT 2 »,
une **zone de production annexe** rattachée à Armement. Déplacez-la où elle se
trouve réellement, puis posez-y des ateliers dans « Ateliers de travail » comme
n'importe quel service : elle apparaît dans la liste, sous son atelier.

Elle **hérite des liaisons** de l'atelier dont elle dépend : ses amonts et ses
avals sont les siens. Ce que cela ne fait pas : une file d'attente séparée. Deux
équipes qui se partageraient les ordres selon une règle à elles, c'est un autre
modèle — il faudrait d'abord dire **quelle règle** répartit le travail.

Vous pouvez aussi dessiner un rectangle libre et lui donner le type
« Zone de production (annexe) », en choisissant son atelier de rattachement.

## 6. Ce que le modèle ne dit pas

- **Le barème n'est pas calibré.** Les durées sortent d'une table de valeurs
  d'attente, là pour que le modèle tourne.
- **Il ne choisit pas les heures de début.** Vous décidez ; il calcule les
  conséquences et nomme ce qui ne tient pas.
- **Il ne répartit pas le travail.** Une même classe fabriquée par deux ateliers
  du même service est signalée, pas arbitrée : sans règle de répartition,
  trancher serait inventer.
- **Un atelier fait ses lots l'un après l'autre.** Une équipe qui mènerait deux
  lots de front se décrit comme deux ateliers.

## 7. Ce qu'il est utile de noter pendant la saisie

Ces points bloquent le calcul et vous seul pouvez les trancher :

- **Contenance des ateliers** : combien d'ordres un atelier peut-il contenir,
  en attente ou en cours ? Sans ce chiffre, le moteur les suppose illimités et
  ne verra jamais un blocage amont.
- **Effectifs par équipe** : matin et soir, et l'heure de relève réelle.
- **Personnes polyvalentes** : qui peut aller d'un atelier à l'autre ?
- **Matériel propre** : combien d'unités disponibles à l'ouverture, et ce qui
  arrive d'ailleurs chaque jour (livraisons, lavage externe).
- **Calendrier** : les vols concernés par l'exception CRL et l'heure de bascule
  réelle — le seuil de 21:00 est une valeur de départ, pas une règle validée.
- Tout endroit où le plan vous paraît faux : c'est plus utile qu'un contour
  approximatif corrigé en silence.

## 8. Quand vous aurez fini

Sauvegardez, puis dites-le : le raccordement du reste de l'aménagement au
moteur — débits des chaînes, contenances, calibration du barème — se fait à
partir de vos chiffres, pas avant.
