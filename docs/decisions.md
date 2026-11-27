# Décisions en vigueur

Une ligne par décision encore valable, avec sa date (AAAA-MM-JJ), rangée par thème. Une décision remplacée disparaît de ce fichier : seule la décision en vigueur reste. **[À CONFIRMER]** marque ce que le chef de projet n'a pas encore tranché.

Comme tout le dépôt (voir `.claude/rules/simms.md`), ce fichier ne contient aucune donnée de l'unité réelle, ni nom de compagnie, ni effectif, ni débit, ni durée, ni volume. Ces valeurs sont des réglages de la sauvegarde de l'utilisateur. Les règles de l'unité sont écrites ici sous forme générale.

Le chef de projet décide. Une évolution qui contredirait une ligne de ce fichier s'arrête et le signale. Une décision change ici d'abord, sur accord du chef de projet. Pour l'interface, le texte de référence est `docs/CHARTE_INTERFACE.md`.

Dernière mise à jour : 2026-11-27.

## 1. Conduite du projet

- 2026-11-02 — Le chef de projet décide ; le maître d'œuvre conçoit, écrit les demandes et vérifie chaque livraison. Tout changement important et toute proposition lui sont soumis.
- 2026-11-02 — La version 2 (`v2/`) est gelée : on n'y touche plus, elle reste dans le dépôt.
- 2026-11-17 — Les corrections de la version 1 ne sont pas reportées dans la version 2 tant qu'elle n'est pas utilisée. [À CONFIRMER]
- 2026-11-05 — Les données de l'unité (vols, heures réelles, exports de l'ERP, sauvegardes) ne vont jamais dans le dépôt ni dans une demande à Claude Code.
- 2026-11-16 — Ce qui décrit l'unité (compagnies, disposition, listes d'import, couleurs) est un réglage de l'utilisateur, gardé dans sa sauvegarde, jamais une valeur du code.
- 2026-11-03 — Chaque livraison est vérifiée hors dépôt sur les vraies données : même résultat quand rien ne doit changer, sauvegarde restaurée puis exportée rendue à l'identique, pages contrôlées à l'écran.
- 2026-11-27 — Tests proportionnés au risque, selon la catégorie de la livraison : documents seuls, aucun test ; interface, suite Node, tests navigateur des pages touchées et tests de la charte, et batterie complète une fois en fin de série (pour la série en cours : avec le PROMPT 44) ; calcul et données, batterie complète à chaque livraison.
- 2026-11-27 — Catégorie « calcul et données » : le diff touche `moteur/`, un fichier appelé par le calcul ou par l'import des vols, le stockage ou la sauvegarde, ou un fichier identique à son jumeau de `v2/`. La catégorie se lit dans le diff, pas dans l'intention du prompt ; la plus lourde l'emporte.
- 2026-11-27 — La batterie complète tourne une fois par livraison, dans le thread, sur la tête de la branche ; le maître d'œuvre ne la relance que si le rapport montre un échec ou un test instable.
- 2026-11-27 — Quand une livraison touche le stockage ou la sauvegarde, le maître d'œuvre rejoue plusieurs fois, de son côté, les tests d'enregistrement. [À CONFIRMER]
- 2026-11-03 — Un résultat défavorable est rapporté tel quel.
- 2026-11-27 — Un prompt du maître d'œuvre = un thread = une branche = une pull request vers la branche par défaut ; le chef de projet ne fusionne la PR qu'après la vérification du maître d'œuvre ; un seul prompt à la fois, sauf mention contraire en tête du prompt.
- 2026-11-27 — `docs/decisions.md` et `docs/CHARTE_INTERFACE.md` ne se modifient que sur demande explicite d'un prompt du maître d'œuvre.
- 2026-11-26 — Jusqu'à la fin de la série d'évolutions de l'interface en cours, le maître d'œuvre tranche les choix de détail selon la charte et les note « à valider » ; le chef de projet fait son retour à la fin de la série.

## 2. Validation et calage

- 2026-11-02 — Le projet est terminé quand : une sauvegarde de référence existe ; la prévision est validée sur un mois jamais vu ; la prévision d'effectif tourne en routine ; les vols sont lus directement dans l'export de l'ERP, sans retraitement ; deux ou trois utilisateurs de l'unité s'en servent.
- 2026-11-02 — Seuils du terme : chaque service fait mieux que la constante et que le standard ; total de l'unité à 5 % du réel par jour au plus, biais de 2 % au plus ; la bande P10–P90 contient le réel 70 à 90 % des jours. Les seuils d'erreur par service, en ETP, sont tenus hors dépôt.
- 2026-11-03 — Une prévision est figée, avec son empreinte, avant de voir le réel du mois testé. Un mois vu ne sert plus de test.
- 2026-11-03 — Une correction du calage se valide hors échantillon, en laissant un mois de côté.
- 2026-11-03 — Les mois atypiques restent dans l'apprentissage : ils reviennent chaque année.
- 2026-10-29 — Une case vide ou absente du réel n'est pas un zéro.
- 2026-11-11 — Le prochain test hors échantillon porte sur novembre : les vols d'abord, les heures réelles ensuite. Sa prévision de base est figée sur le commit `8dd0941` ; toute autre sauvegarde ou règle donne une prévision « candidate », à part.

## 3. Moteur

- 2026-11-13 — Pas de nouveau seuil ni de nouveau réglage dans la simulation, sauf s'il est indispensable : la complexité la dénature.
- 2026-11-13 — Les temps par vol saisis restent des entrées, inchangées ; une formule par service peut s'ajouter derrière, apprise sur le réel et choisie hors échantillon.
- 2026-11-13 — Structure d'un temps : temps par vol × remplissage × nombre de vols, divisé par le nombre de personnes du poste pour obtenir la durée. Le remplissage ne concerne que la prépa-montage et la dotation.
- 2026-11-13 — Le remplissage viendra plus tard, par une colonne du fichier des vols.
- 2026-11-14 — Calage par service : l'armement prend une forme proportionnelle à la journée ; les autres services gardent le calcul du moteur. Un service en sur-effectif a un besoin « au plus n ».
- 2026-11-04 — Disponibilité d'une équipe : personnes × (présence + heures sup − pauses vraiment prises). L'occupation ne dépasse jamais 100 %.
- 2026-11-13 — L'attente se compte par arrivage (les lots livrés ensemble), pas par lot.
- 2026-11-13 — « Où ça coince » se juge sur les conséquences : un dépassement d'horaire d'au moins un quart d'heure (règle fixe, sans réglage), ou un retard.
- 2026-11-13 — Le besoin des postes non mesurés n'entre pas dans « Il faut n personnes ».
- 2026-11-25 — L'effectif calculé d'une équipe est écrit dans l'équipe ; le nombre saisi est gardé à part.
- 2026-11-25 — Ouvrir une page, changer d'onglet, déplier ou survoler ne change jamais le résultat ni les données enregistrées.
- 2026-11-13 — Relais à la plonge, automatique et sans réglage : l'équipe qui part laisse le vol en cours à l'équipe présente sur le même tunnel ; sans équipe suivante, le reste se lave le lendemain, sans heures sup.
- 2026-11-14 — Le lavage arrêté reprend à l'arrivée de l'équipe suivante ; la plonge ne « coince » que si le matin du lendemain n'absorbe pas le reste.
- 2026-11-13 — Le vidage des trolleys sales reste hors simulation.
- 2026-11-17 — Robot, relais automatique : le matin, une fois sa propre commande finie, il avance au maximum la commande de l'après-midi au plus petit temps par vol ; l'avance ne crée pas d'heure sup ; à la pause, il finit le vol en cours ; l'équipe suivante reprend où il s'est arrêté.
- 2026-11-17 — Robot : durée de la ligne = plateaux ÷ débit (réglage) ; un plateau par passager Économie, repas enfants compris ; effectif calculé sur les propres commandes de l'équipe, borné entre un minimum et le nombre de postes de travail (réglages).
- 2026-11-17 — Une commande est faite par une seule équipe, sauf relais ; une commande avancée est livrée à l'aval à la fin de sa dernière part (limite acceptée).
- 2026-11-17 — On ne change pas le moteur sur un souvenir : l'heure de retour du sale ne changera qu'avec une observation réelle.
- 2026-11-24 — Les fournisseurs d'une commande viennent de son chemin ; une exception par commande (compagnie × classe) sera permise ; sans exception saisie, le résultat reste identique.
- 2026-11-23 — Aide pendant l'attente : une personne qui attend peut aider une autre équipe, pas seulement quand elle a fini ; dès que son propre travail arrive, elle revient.
- 2026-11-23 — Chaîne humaine en prépa-montage : un tapis, des personnes placées, un nombre minimal et maximal de personnes ; le débit croît avec le nombre de personnes. [À CONFIRMER : le coefficient, inconnu]
- 2026-11-23 — Période en flux continu : les jours s'enchaînent (des vols partent chaque jour, les retours atterrissent), avec des résultats sur la période et par jour. [À CONFIRMER : la conception, à écrire avant le code]
- 2026-11-26 — Une commande fixe donne au calcul un départ chaque jour où elle existe, à son heure, avec sa quantité.

## 4. Règles métier de l'unité (forme générale)

- 2026-11-03 — La durée de vacation dépend du statut (titulaire, intérimaire, régulation, autres postes) ; les valeurs sont des réglages.
- 2026-11-02 — Une compagnie est long-courrier ou court-courrier (réglage).
- 2026-11-02 — Dépendent du nombre de vols : prépa, montage, armement, handling, et la cuisine à effectif fixe. Les autres services sont une charge constante.
- 2026-11-02 — La cuisine produit à J-2, la prépa à J-1 ; la plonge reçoit le lendemain du départ.
- 2026-11-13 — Les fournisseurs (magasin, réception / appros) mettent à disposition à l'avance : dans la simulation ils sont « toujours ouverts » et ne mettent pas les services en retard.
- 2026-11-19 — Un fournisseur est une mise à disposition où rien n'arrive ; ses clients se règlent une fois pour toute l'unité, pas par chemin.
- 2026-11-24 — Un client d'un fournisseur peut avoir des exceptions, qui dépendent de la compagnie et de la classe.
- 2026-11-13 — Le contrôle des vols travaille à J-1, sans tri par heure de départ ; il rassemble tout ce qui est produit pour les vols ; il n'y a pas de zone de stockage à part.
- 2026-11-13 — Plonge : deux équipes qui se relaient ; leur chevauchement ajoute peu, les tunnels étant déjà pleins ; l'équipe de nuit est une équipe sous condition.
- 2026-11-23 — Une compagnie a un armement dès qu'un de ses chemins passe par l'armement ; une compagnie peut avoir l'armement sans dotation ni roulés couverts.
- 2026-11-24 — Deux classes d'une même compagnie peuvent suivre des chemins différents.
- 2026-11-17 — Certaines commandes n'ont pas de handling (par exemple une commande fixe) : c'est voulu et se déclare comme tel.
- 2026-11-26 — Une commande fixe (une cantine, par exemple) existe sans vol : une quantité par jour, les jours où elle existe (tous par défaut, au choix pour une autre unité), l'heure où elle doit être prête.
- 2026-11-26 — Si l'export porte aussi une ligne pour une commande fixe, l'export gagne pour la quantité, jamais pour l'heure.
- 2026-11-05 — Export de l'ERP : une livraison = un vol ; aucun prix n'est gardé.
- 2026-11-09 — Les lignes de l'export qui ne sont pas des productions (lignes techniques, besoins internes, lignes payantes) sont exclues par les règles d'import ; les vols passés sous un autre compte restent comptés.
- 2026-11-11 — Le planificateur automatique de la prépa-montage sert de comparaison, jamais de source de règles.
- 2026-11-23 — Handling, pour sa refonte : une équipe de camion = un chauffeur et un aide ; plusieurs vols par vacation ; temps d'aller et de retour à l'avion, et temps à l'avion selon le type de vol (réglages) ; l'effectif du jour suit le nombre de vols ; les encadrants ont leurs propres vacations.
- 2026-11-23 — Handling : un long-courrier se décharge et se recharge dans le même passage ; une équipe peut servir deux compagnies dans une même vague ; un moyen-courrier ne se fait pas en un seul passage. [À CONFIRMER : les durées, et le cas des compagnies non décrites]
- 2026-11-23 — Handling : ses personnes comptent dans la Période ; le nombre de camions différents utilisés est montré ; l'effectif réel se lit dans le fichier des heures.

## 5. Compagnies et commandes

- 2026-11-26 — Les compagnies d'abord, les vols à la fin : l'utilisateur saisit ses compagnies et leurs classes, règle ses services, équipes et chemins, puis importe les vols pour simuler.
- 2026-11-26 — La liste des compagnies appartient à l'utilisateur et fait foi ; une compagnie existe même sans vol.
- 2026-11-26 — L'import ne crée jamais de compagnie : les règles de tri rattachent chaque ligne de l'export à une compagnie de la liste.
- 2026-11-26 — Une ligne non rattachée est signalée dans « Contrôles » (créer la compagnie, la rattacher, l'ignorer) et n'est pas comptée tant que l'utilisateur n'a pas choisi.
- 2026-11-26 — Une compagnie peut se créer « comme une autre » : elle reprend chemins, équipes, temps et fournisseurs, classe par classe.
- 2026-11-26 — Une classe absente de la compagnie modèle prend le chemin habituel de sa classe, est marquée « à compléter » et devient un point de « Contrôles ».
- 2026-11-26 — Une unité sans liste de compagnies garde le comportement d'avant jusqu'au geste « En faire ma liste », qui ne change pas le résultat. [À CONFIRMER]
- 2026-11-26 — Un jour non coché d'une commande fixe où l'export porte une ligne : la ligne compte, à l'heure de la commande fixe. [À CONFIRMER]
- 2026-11-25 — Une fiche par commande, avec un récap des temps toujours accessible.
- 2026-11-24 — Le tableau de tous les temps et la fiche d'équipe montrent le même champ : une valeur changée ici se lit là-bas.
- 2026-11-24 — Un temps par vol qui ne sert plus (la commande a quitté le chemin) est retiré.
- 2026-11-24 — Ce retrait épargne les commandes absentes du programme chargé et les valeurs « toutes compagnies ». [À CONFIRMER]
- 2026-11-24 — La charge fixe journalière d'une équipe passe dans ses réglages avancés. [À CONFIRMER]

## 6. Interface : organisation

- 2026-11-17 — Deux publics : ceux qui lisent les résultats, ceux qui paramètrent ; un interrupteur « Lecture seule » replie et verrouille le paramétrage.
- 2026-11-11 — Les résultats répondent à cinq questions, dans cet ordre : combien de personnes par service ; où et quand ça coince ; à quelle heure chaque service finit, avec combien d'heures sup ; ce qui part en retard (les seules exceptions, avec leur cause) ; ce que change un scénario.
- 2026-11-26 — Menu : « Lire » (Synthèse, En direct, Planning, Période, Détails, Comparer), puis « Régler » dans l'ordre du travail (Commandes, Services et équipes, Chemins, Programme des vols, Planche retour, Réglages, Contrôles), puis « Fichiers ».
- 2026-11-26 — L'accueil devient une entrée du menu, au-dessus de « Lire », et guide dans l'ordre du travail. [À CONFIRMER]
- 2026-11-14 — Une chose, un endroit ; une seconde vue (un tableau) est permise si elle reste liée dans les deux sens.
- 2026-11-14 — Les réglages sans effet sont masqués ; seuls les vraiment inutiles sont supprimés.
- 2026-11-19 — La page du plan quitte le menu ; ses données restent, elle s'ouvre par « Aller à… ».
- 2026-11-19 — « En direct » s'ouvre en relief ; la vue à plat ne s'ouvre que par « Aller à… ».
- 2026-11-25 — La vue en relief d'« En direct » est gardée ; seules ses couleurs suivent le visuel.
- 2026-11-13 — Vue en direct : générée par des règles à partir des réglages, schématique ; exactement les équipes et les personnes réglées ; tables, trolleys ou rayonnages selon le service ; une ligne robot dès qu'il y a un robot ; autant de tunnels de plonge que réglés ; caméra libre, sans bibliothèque.
- 2026-11-16 — Vue en direct : la disposition des zones et leur part de surface sont des réglages de l'utilisateur.
- 2026-11-17 — Vue en direct : à l'ouverture, une vue légèrement tournée, colonnes de gauche à droite.
- 2026-11-26 — Vue en direct : le panneau « En ce moment » est fermé à l'ouverture, un bouton l'ouvre ; la ligne des chiffres cumulés reste visible.
- 2026-11-26 — Synthèse : huit colonnes (Service, Besoin, Présents, Écart, Matin, Après-midi, Occupation, Fin et heures sup) ; « Pic au travail », « Attente d'un arrivage » et « Personnes sans travail » en sortent.
- 2026-11-26 — Ces trois colonnes restent lisibles dans le détail d'un service et dans les exports. [À CONFIRMER]
- 2026-11-03 — La vue « Charge » est dans le Planning, au-dessus du planning des équipes.
- 2026-11-24 — Le Planning et « En direct » gardent le jour et l'heure choisis quand la journée change.
- 2026-11-23 — Un point de « Contrôles » mène droit à l'endroit qui le règle.
- 2026-11-19 — Chemins : les fournisseurs sortent du schéma ; « Chemins › Fournisseurs » (« Qui se fournit où ») est le seul endroit où leurs clients se règlent.
- 2026-11-24 — Chemins : « Qui le suit » se lit comme la liste nommée des commandes du chemin ; le chemin par défaut d'une classe sort de l'écran.

## 7. Interface : règles de page (charte validée le 2026-11-26)

- 2026-11-26 — Sur la page : le titre, l'objet principal, une action ; ce qui sert à chaque visite reste visible.
- 2026-11-25 — Le reste s'ouvre dans un panneau à côté de la page, qui reste visible ; jamais un panneau dans un panneau ; une fenêtre par-dessus la page ne sert qu'à une question.
- 2026-11-26 — Budget d'une page : 150 mots au plus hors tableaux ; une phrase d'explication au plus, le reste derrière un « ? » ; aucune section à déplier ; 12 boutons visibles au plus ; 7 colonnes au plus par tableau. Exceptions : le tableau de tous les temps ; la Synthèse, à huit colonnes.
- 2026-11-26 — Le budget est tenu par des tests à cliquet : l'écart d'une page d'aujourd'hui ne peut que baisser ; une page nouvelle n'a droit à aucun écart.
- 2026-11-26 — Un seul bouton plein par écran ; « Contrôles » seul en a un par point bloquant.
- 2026-11-26 — Dans « Contrôles », seul le premier bouton d'un point bloquant est plein. [À CONFIRMER]
- 2026-11-19 — La fenêtre ne défile pas ; aucun texte sous 13 px ; les colonnes prennent la largeur. Écran de référence : 1 366 × 768.
- 2026-11-26 — Des listes plates : un seul cadre, des rangées séparées par un trait, la rangée choisie sur le fond pâle de l'accent avec un trait d'accent à gauche.
- 2026-11-25 — La barre « Journée de vols » tient sur une ligne, avec une étiquette d'état courte ; « Simuler la période » n'est que dans « Période ».
- 2026-11-26 — Tout réglage se défait (« Annuler », Ctrl+Z) ; chaque saisie affiche une notification avec « Annuler » ; une question bloquante est réservée à la perte de données.
- 2026-11-26 — La réponse vient en moins d'une seconde, et l'effet d'un réglage se voit.
- 2026-11-26 — Une valeur fausse est refusée avec un message qui dit quoi faire ; une valeur inhabituelle est signalée, pas refusée.
- 2026-11-25 — Seuils de valeur inhabituelle : plus de 24 heures par vol pour une personne, plus de 200 personnes dans une équipe. [À CONFIRMER]
- 2026-11-26 — Aucun bouton n'écrit un réglage à la place de l'utilisateur sans le lui montrer.
- 2026-11-25 — L'état de sauvegarde se lit en haut de l'écran ; le navigateur prévient à la fermeture s'il reste des changements ; la page de secours exporte tout.
- 2026-11-25 — Un clic sur l'état de sauvegarde télécharge la sauvegarde complète. [À CONFIRMER]
- 2026-11-26 — Un changement non sauvegardé est une écriture dans une entrée de la sauvegarde ; ce que le calcul écrit de lui-même ne compte pas. [À CONFIRMER]
- 2026-11-26 — Tout écran nouveau passe d'abord en maquette, dans le même visuel.

## 8. Visuel

- 2026-11-25 — Direction « Profonde » : menu bordeaux sombre uni (`#2E0F1A`), fond clair chaud (`#FBF8F6`), encre `#2A1F23`, cartes blanches arrondies (rayon 14 px), police Inter, chiffres tabulaires, pas de dégradé.
- 2026-11-25 — Couleur d'action : caramel foncé `#B95B0F` (le texte blanc sur le caramel clair n'est pas assez lisible) ; elle sert à l'action et au choix, rien d'autre ; les liens sont en texte foncé souligné.
- 2026-11-25 — Les jetons du visuel vivent dans une feuille propre à la version 1 ; aucune couleur écrite en dur dans un écran ; la version 2 garde son visuel.
- 2026-11-25 — Deux thèmes, clair et sombre ; contraste de 4,5 pour 1 ; cibles de 24 px ; tout se fait au clavier ; phrases en minuscules, sans capitales espacées.
- 2026-11-25 — Saisi, repris, calculé : une valeur saisie est un champ sur fond pêche, en gras ; une valeur reprise, un champ au fond de carte, en italique gris ; un nombre calculé, du texte sans cadre.
- 2026-11-25 — La compagnie a une pastille de couleur, la classe une étiquette avec un point de couleur, partout les mêmes ; le texte lu ne change pas.
- 2026-11-25 — La couleur d'une compagnie est un réglage de l'utilisateur.
- 2026-11-25 — Douze teintes au choix, pas une couleur libre ; le choix garde le rang de la teinte ; sans choix, couleur automatique par ordre alphabétique ; les choix voyagent avec la sauvegarde. [À CONFIRMER]
- 2026-11-25 — Couleurs des classes : Équipage bleu, Économie vert, Premium violet, Business bordeaux, repas spéciaux ocre. [À CONFIRMER]
- 2026-11-25 — Un état, une couleur, partout : au travail bleu, attend ocre, en retard rouge, a fini gris ; jamais la couleur seule, toujours avec un mot ou une forme.
- 2026-11-25 — Le logo et le nom de la société ne vont pas dans le dépôt : ils seront un réglage de l'utilisateur. [À CONFIRMER]
- 2026-11-25 — Le numéro de version est au bas du menu. [À CONFIRMER]

## 9. Vocabulaire

- 2026-11-14 — « équipe » (pas « atelier »), « chemin » (pas « parcours »), « temps par vol » (pas « barème »).
- 2026-11-26 — Un mot pour une chose : compagnie, classe, commande (une compagnie × une classe), commande fixe, service, équipe, chemin, temps par vol, fournisseur, client.
- 2026-11-26 — Les mots du métier, pas ceux de l'outil ; l'unité d'une valeur s'écrit dans son champ.
- 2026-11-13 — « Arrivage » : les lots livrés ensemble. « À la limite » et « en sur-effectif » : les deux statuts d'un service au calage.
- 2026-11-26 — Un seul mot par jour de travail : « J-2 », « J-1 », « J » (plus de « veille »). [À CONFIRMER]
- 2026-11-26 — Renommages : « Détails » → « Journée en détail » ; « Réglages » → « Règles du calcul » ; « Retours » → « Planche retour ». [À CONFIRMER]

## 10. Questions ouvertes

- 2026-11-17 — Dans la simulation, l'équipe de nuit de la plonge vient souvent alors qu'il n'y en a pas aujourd'hui : cause non établie. [À CONFIRMER]
- 2026-11-17 — Heure réelle de retour du sale : à observer sur quelques jours avant tout changement. [À CONFIRMER]
- 2026-11-25 — Mesure de la prise en main : cinq collègues, cinq tâches chronométrées, un questionnaire, avant et après les évolutions de l'interface. [À CONFIRMER : le moment]
