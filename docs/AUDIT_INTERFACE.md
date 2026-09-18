# Audit d’usage — 17 septembre 2026

Base de l’audit initial : `0d7f7d24c2de90db21f78ccc54a0e9cb6ae058d6`.
Intégration le 18 septembre sur `88ea4a980556e299a2b8c9bcb0ce85b1beb0b407` :
les corrections et la feuille de route ajoutées par Claude sont conservées.
Le retard courant sur les dossiers exigibles est distingué du retard des terminés.

Objectif de cette intervention : faciliter la lecture de la production et
supprimer les ambiguïtés de l’interface, en conservant le fond de plan,
l’éditeur de zones et l’ouverture hors ligne.

| Constat | Conséquence pour l’utilisateur | Correction |
|---|---|---|
| Deux colonnes permanentes de réglages et résultats entourent un plan réduit | Le site devient secondaire et les commandes se concurrencent | Plan principal, panneau contextuel Suivi/Réglages/Données |
| Peu de hiérarchie entre lancement, édition et observation | Changements d’état difficiles à comprendre | Statut de lecture, édition dédiée avec pause, réglages verrouillés après lancement |
| Aucun suivi détaillé des vols | Impossible de relier un indicateur à un dossier | Vue recherchable et filtrable avec échéances, statuts et opérations restantes |
| 100 % avant toute fin et exclusion des inachevés | Impression de réussite malgré les dossiers bloqués | Dénominateur fondé sur les échéances atteintes, état vide explicite, compteur des non prêts |
| Activité générée artificiellement sur certains services | Faux diagnostic de charge | Suppression de cette activité et mention Non simulé |
| Charge lissée présentée comme occupation | Précision excessive suggérée | Libellé Pression indicative et définition explicite |
| Jeu fictif présenté comme réaliste | Confusion entre essai et prévision | Provenance persistante, statut Prototype et limites accessibles |
| CSV tolérant avec défauts silencieux | Horaires absents transformés en 7 h et imports incorrects | Modèle téléchargeable, validation stricte, rapport d’erreurs et import atomique |
| Captures A/B non horodatées | Comparaison d’instants différents | Heure, paramètres et entrées conservés ; avertissement et libellé Instantanés |
| Déplacement d’une zone interprété comme validation | Confusion entre placement et validation terrain | Conservation du statut À confirmer lors des modifications |
| Champs JSON peu contrôlés | Une importation peut dégrader le plan | Validation de toutes les géométries avant application |
| Mise en page non adaptée au téléphone | Débordements et parcours longs | Empilement, commandes accessibles, défilement limité à la table |
| Commandes sans libellé accessible et sélection uniquement visuelle | Usage clavier difficile | Libellés, focus visibles, liste Atelier et activation clavier des zones |

## Contrôles effectués

Tests Node : cas vide, vols futurs, échéances dépassées avec dossiers inachevés,
heure de minuit, CSV entre guillemets/point-virgule, doublons, quantités et horaires
invalides, colonnes manquantes et échappement du contenu importé.

Parcours Chromium : ouverture directe du HTML, navigation entre panneaux et vues,
lancement/pause, verrouillage des réglages, recherche, sélection d’atelier,
édition et persistance d’une zone polygonale, refus d’import puis import valide,
dossier toujours bloqué à 23 h, capture A/B, export JSON, thème sombre et largeur
mobile de 390 px. Contrôle des erreurs JavaScript et du débordement horizontal.

## Ce que cette intervention ne valide pas

La précision de production, les man-hours, les règles de jours de production,
le routage robot, les stocks et l’organisation des équipes restent à intégrer
et à valider avec les observations terrain. Le moteur reste un démonstrateur.
Le calcul à pas fixes corrige sa dépendance au découpage des images, sans le
transformer en moteur industriel validé.

## Suite recommandée

1. Fixer le contrat d’entrée et de sortie du futur moteur.
2. Remplacer les indicateurs de démonstration par les événements de ce moteur.
3. Ajouter import Winrest, calendrier multijour et états initiaux contrôlés.
4. Transformer les instantanés en véritables exécutions de scénarios comparables.
5. Confirmer les emplacements et capacités avec l’exploitation.
