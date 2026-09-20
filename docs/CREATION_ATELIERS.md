# Création des ateliers sur grille

Ouvrir **Création des ateliers** dans la simulation. La carte de l’unité reste
visible et la lecture est mise en pause. Cliquer un service, ou le choisir dans
la liste Atelier : son contour est cadré automatiquement. Ce cadrage est le
zoom maximal dans ce mode. Dézoomer reste possible ; **Cadrer le service** y
revient et **Toute l’unité** permet de choisir un autre service.

## Construire comme sur une grille 2D

1. Créer un **Atelier** dans le service et le nommer. Un service peut en avoir
   plusieurs. Dessiner sans atelier en crée automatiquement un premier.
2. Choisir **Table**, **Chaîne** ou **Ligne robot**, puis cliquer-glisser pour
   peindre les cases. Les cases ajoutées prolongent l’équipement sélectionné
   lorsque son type et son atelier correspondent.
3. **Nouvel équipement** démarre une autre table ou chaîne au prochain tracé.
4. **Gomme** retire les cases survolées, y compris dans un autre atelier du
   même service. Retirer la dernière case supprime l’équipement.
5. **Sélection / déplacement** permet de sélectionner un équipement et de le
   glisser de case en case. Sa fiche permet de le renommer, de le pivoter de
   90° ou de le supprimer.

Une case ne peut accueillir qu’un équipement dans un service, même si les
équipements appartiennent à des ateliers différents. Un nouveau placement ou
déplacement doit rester dans le contour du service ; les cases coupées par
son bord ne sont pas constructibles. Les cases d’un équipement peuvent former
une forme libre, y compris discontinue. Aucun contrôle d’allée, d’ergonomie
ou de conformité QHSE n’est déduit du dessin.

**Annuler / Rétablir** couvre jusqu’à 80 actions dans la session. Un tracé
complet vaut une action. Les autres ateliers du service restent visibles,
avec une couleur atténuée.

## Réutiliser tables, chaînes et assemblages

**Bibliothèque de tables / chaînes…** ouvre l’éditeur existant dans
l’application, sans changer de page. Les fonctions de modèles, formes libres,
personnes, modules robot et assemblages restent disponibles. Sélectionner ou
créer le modèle / assemblage, puis cliquer **Placer dans le service** et cliquer
sur la grille pour le poser. **Retour au plan** ferme simplement la bibliothèque.

La pose crée une **copie indépendante**. Modifier la bibliothèque ne modifie
pas les équipements déjà placés. Les données du modèle d’origine sont gardées
dans `source` pour une utilisation ultérieure ; le plan affiche son emprise,
pas les personnes, modules détaillés ou débits. Pour une desserte ou un trolley
en centimètres, l’emprise est arrondie aux cases supérieures ; les positions
d’un assemblage au quart de mètre sont arrondies à la case de 50 cm la plus
proche. Si cet arrondi crée une collision, la pose entière est refusée.

La bibliothèque conserve sa clé et sa page indépendante `postes/`. Si le
navigateur isole le stockage entre fichiers locaux, utiliser son import JSON
pour retrouver une bibliothèque précédemment exportée.

## Une grille schématique, pas une mesure du bâtiment

Une case représente **50 × 50 cm théoriques**. Sans cote de référence, la
correspondance avec le fond d’architecte n’est pas mesurée : ce n’est pas une
preuve qu’une table rentre physiquement dans le local. La taille visuelle de
la case, commune à toute l’unité, est réglable avant le premier placement
(40 unités du dessin par défaut). Elle se verrouille ensuite afin de ne pas
déplacer tous les équipements en changeant involontairement l’échelle.

La grille et les aménagements sont affichés dans l’onglet de création. Le
moteur, les équipes, les temps, les débits et les flux configurés ne sont pas
modifiés par ces équipements. Ils seront raccordés séparément.

## Conserver et reprendre

La sauvegarde locale est automatique, sous `ory-workshops-v1`. Exporter les
ateliers pour conserver une copie JSON ou changer de poste. Exporter aussi le
plan séparément : les ateliers référencent ses services par identifiant et
leurs cases utilisent le repère du dessin.

L’import est contrôlé avant remplacement, confirmé et annulable. Limites :
5 Mo, 300 ateliers, 2 000 équipements, 5 000 cases par équipement, 30 000 au
total. Un fichier invalide est refusé sans remplacer l’aménagement.
Si le contour d’un service change ou disparaît, les données ne sont pas
supprimées : un avertissement signale les équipements hors contour ou les
services absents. Les déplacer, corriger le plan ou exporter pour les reprendre.

Les ateliers détaillés sont des données locales : ne pas publier leurs exports
réels sur le dépôt public. Le fond privé reste facultatif et non versionné.
