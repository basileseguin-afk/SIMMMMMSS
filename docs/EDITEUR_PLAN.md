# Construire le plan détaillé de l’unité

Cliquer sur **Éditer les zones**. Le tableau de bord laisse place à l’espace de
dessin et la simulation est mise en pause. Le fond d’architecte reste la référence.

## Corriger une pièce existante

1. Rechercher son nom dans **Zones & locaux**. Les ateliers, chambres froides et
   stockages déjà annotés sont disponibles.
2. Cliquer son nom puis **Centrer la sélection**, ou double-cliquer son nom.
3. Glisser l’intérieur pour déplacer la zone. Les huit poignées d’un rectangle
   permettent de modifier ses côtés ou ses coins. Leur taille à l’écran reste
   constante avec le zoom.
4. Ajuster le nom, le type, la couleur ou les coordonnées dans le panneau.
5. Pour épouser une pièce irrégulière, utiliser **Redessiner le contour** :
   cliquer les sommets, puis le premier point ou **Fermer le polygone** / Entrée.
   Échap conserve l’ancien contour.
6. Verrouiller la géométrie une fois le placement satisfaisant. Le statut
   **Emplacement confirmé sur le terrain** est une décision explicite.

Un atelier simulé conserve son identifiant et sa liaison au moteur même si son
nom ou son contour change. Il ne peut pas être supprimé ou converti en simple
local. Le masquer reste possible. Les positions ajoutées d’après les annotations
ne constituent pas automatiquement des contours de pièces validés.

## Ajouter un local ou un équipement

- **Rectangle (R)** : glisser sur le plan pour définir le contour.
- **Polygone (P)** : cliquer les sommets. Entrée, double-clic ou clic sur le premier
  sommet termine le contour. Échap annule ; Retour arrière retire le dernier point.
- Donner un nom à la zone et choisir Local / zone, Chambre froide, Équipement ou
  Circulation. Ces objets sont des annotations ; ils n’ajoutent aucune capacité
  ni charge au moteur.
- **Dupliquer** permet de dessiner rapidement des équipements semblables. Une
  copie d’atelier devient une annotation ; elle ne duplique pas une équipe.

Pour corriger un polygone, déplacer ses sommets. Les petites poignées entre deux
sommets permettent d’insérer un point en le faisant glisser. Sélectionner un
sommet puis **Supprimer le sommet** permet de le retirer, avec au moins trois
points conservés. **Convertir en polygone** transforme un rectangle en quatre
sommets ; **Revenir au rectangle** utilise la boîte englobante. Ces actions sont
annulables.

## Naviguer et placer précisément

- Molette ou boutons + / − : zoom autour du curseur ou du centre de la vue.
- **Main (H)**, Espace + glisser ou bouton central : déplacer la vue.
- Glisser dans un endroit vide avec l’outil Sélection déplace aussi la vue.
- **Vue d’ensemble** rétablit le cadrage initial.
- L’aimantation rapproche le pointeur des bords et sommets voisins. Des guides
  roses matérialisent cet alignement. Maintenir Alt la désactive temporairement.
- La grille optionnelle a un pas de **20 unités du dessin**, pas 20 mètres.
- Maj contraint un nouveau rectangle au carré, ou le prochain segment de
  polygone à l’horizontale/verticale.
- Les flèches déplacent la sélection d’une unité ; Maj + flèche, de dix unités.
- L’opacité du fond peut être ajustée pour mieux lire les zones.

La liste permet de sélectionner les petites zones et les zones superposées.
L’œil masque une zone et **Libre / Fixé** verrouille sa géométrie. Rechercher un
nom filtre la liste sans effacer les autres zones du plan.

## Annuler, enregistrer, importer

**Annuler / Rétablir** fonctionne pour les déplacements, dimensions, créations,
suppressions, noms, couleurs, verrouillages et imports. Un glisser complet
constitue une seule action. L’historique garde jusqu’à 80 actions dans la session.
Il n’est pas conservé au rechargement de la page.

La sauvegarde locale est automatique après une modification. **Exporter le plan**
crée un JSON contenant les contours, noms, catégories, couleurs, visibilité,
verrouillages et opacité. Exporter régulièrement ce fichier pour disposer d’une
copie indépendante du navigateur.

**Importer un plan** contrôle le fichier entier avant de remplacer les données.
Un fichier incorrect conserve le plan courant. Un import valide demande une
confirmation et reste annulable. Les anciens exports plats de géométries sont
acceptés : ils mettent à jour les ateliers sans retirer les annotations ajoutées.

Si vous changez de dossier local, d’adresse ou de navigateur, exportez le JSON
depuis l’ancienne version avant de la remplacer, puis importez-le dans la nouvelle.
Le stockage du navigateur dépend de l’adresse d’ouverture de l’application.

Les anciennes positions présentes dans `orly-zones` sont reprises au premier
chargement. Le nouveau format est enregistré sous `orly-plan-v2`, sans effacer
l’ancienne clé. Une copie de l’état précédent est conservée sous
`orly-plan-v2-backup` ; **Restaurer la sauvegarde précédente** permet de la reprendre.
Il s’agit de la version précédant la dernière sauvegarde, pas d’un historique
complet. Un avertissement indique si le navigateur refuse l’enregistrement ;
dans ce cas, exporter le plan avant de quitter.

## Limites

Le dessin utilise le repère du plan d’origine : ses coordonnées ne sont pas des
mesures métriques. Cet éditeur ne calcule ni surface réglementaire, ni capacité
réelle de stockage, ni temps de déplacement. Le modèle de simulation reste
indépendant des nouvelles annotations. Maximum d’un fichier : 5 Mo, 500 zones,
500 sommets par contour.
