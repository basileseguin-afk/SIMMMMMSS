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
4. **Les ateliers** — *Création des ateliers*. Cliquer un service, créer un
   atelier, peindre tables, chaînes et lignes robot sur la trame de 50 cm.
5. **Les personnes** sur chaque équipement — c'est le chiffre qui fera le lien
   avec le calcul (voir § 4).
6. **Les flux** — *Centre des flux*, pour décrire qui envoie quoi à qui.

À tout moment, **Valider l'atelier** fusionne ses cases en une surface. Une
modification le remet en dessin sans changer les codes.

## 4. Ce que les personnes changent dans le calcul

Dans **Réglages**, chaque service affiche l'effectif déduit de votre
aménagement, à côté du curseur : `CUISINE  10  [grille 6]`. L'écart entre les
deux est visible en permanence.

La case **« Reprendre les effectifs de Création des ateliers »** fait piloter
la grille — **uniquement pour les services que vous avez renseignés**. Les
autres restent réglables au curseur. Vous pouvez donc basculer service par
service, au fil de la saisie, sans jamais devoir choisir pour l'ensemble.

## 5. Ce que la grille ne dit pas

- Une case vaut **50 × 50 cm théoriques**. Sans cote de référence sur le fond
  d'architecte, la correspondance n'est pas mesurée : ce n'est pas une preuve
  qu'une table rentre physiquement dans le local.
- Aucun contrôle d'allée, d'ergonomie ou d'hygiène n'est déduit du dessin.
- Les débits des chaînes et les modules robot de la bibliothèque ne sont pas
  encore lus par le moteur. Seules les **personnes** le sont.

## 6. Ce qu'il est utile de noter pendant la saisie

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

## 7. Quand vous aurez fini

Sauvegardez, puis dites-le : le raccordement du reste de l'aménagement au
moteur — débits des chaînes, contenances, calibration du barème — se fait à
partir de vos chiffres, pas avant.
