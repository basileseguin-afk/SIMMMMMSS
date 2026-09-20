# Revue d’interface — 20 septembre 2026

Revue heuristique du simulateur, des ateliers, des flux, des vols et de la
bibliothèque de postes. Observation dans Chromium, avec données fictives et
sans fond de plan privé. Il ne s’agit ni d’une étude auprès des utilisateurs,
ni d’une certification d’accessibilité.

## Diagnostic et décisions

| Constat | Modification |
| --- | --- |
| Navigation active presque aussi claire que les onglets voisins | Onglet actif plein, contraste inversé, libellés Simulation / Ateliers / Flux / Vols |
| Titre identique quelle que soit la vue | Titre synchronisé avec la navigation |
| Carte, outils et en-tête se confondent | En-tête bleu nuit, carte grisée, panneaux distincts, contours renforcés |
| Longues explications avant les actions | Aides natives repliables pour les taux, retards, règles robot, stocks, scénarios et construction |
| Commandes d’atelier peu hiérarchisées | Palette de construction en grille, outil actif plein, nouvel équipement mis en avant, suppression distinguée |
| Centre des flux : titre et consignes répétés | Titre unique, indication de périmètre courte, aide contextuelle ; création de liaison distinguée |
| Petits textes et limites de champs peu visibles | Libellés principaux agrandis, bordures plus sombres, focus clavier sur les aides |
| Bibliothèque de postes visuellement différente | Couleur d’accent, bordures et focus harmonisés |

Les avertissements « non calibré », « grille schématique » et « liaisons sans
effet sur le calcul » restent visibles. Les messages d’erreur, retours d’import
et indications de blocage ne sont pas repliés. Les aides utilisent `details`
et `summary`, accessibles au clavier sans gestion d’état JavaScript ajoutée.

## Contrastes

Ratios calculés selon la luminance relative sRGB sur les couleurs opaques :

| Paire | Avant | Après |
| --- | ---: | ---: |
| Bordure de contrôle / fond blanc | 2,17:1 | 4,19:1 |
| Texte tertiaire / blanc | 4,55:1 | 6,09:1 |
| Texte / onglet actif clair | — | 6,19:1 |
| Texte / onglet actif sombre | — | 9,60:1 |

L’ancien texte tertiaire dépassait déjà de peu le seuil usuel ; le ressenti
venait aussi de la taille, des bordures et de l’absence de hiérarchie.
Les repères retenus sont 4,5:1 pour le texte courant et 3:1 pour les éléments
graphiques nécessaires à l’identification des contrôles, conformément aux
explications du W3C sur le [contraste du texte](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
et le [contraste non textuel](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
Ces mesures ciblées ne couvrent pas tous les états, textes SVG ou fonds privés.

## Vérification

- 95 tests unitaires réussis ; six parcours navigateur existants réussis.
- Parcours supplémentaire : contraste du texte des principales commandes
  visibles et actives dans les deux thèmes, ouverture de l’aide au clavier,
  absence de débordement horizontal dans les quatre vues à 1440 et 390 px.
- Inspection des captures en clair/sombre : simulation, ateliers, flux, vols.
- Moteur de calcul et formats de sauvegarde inchangés. Aucune donnée réelle
  ajoutée au dépôt. Repli sans plan privé conservé.

## À vérifier avec les utilisateurs

Faire réaliser trois tâches sans explication préalable : créer une table,
ajouter une liaison vers deux destinations, identifier un départ en retard.
Observer les hésitations et le besoin d’aide. La densité de la carte complète
reste une limite à petite échelle ; cette passe ne déplace pas les services et
ne prétend pas mesurer des gains de temps utilisateur.
