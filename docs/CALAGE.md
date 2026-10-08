# Le calage sur un mois réel (version 2)

But : rejouer un mois réel dans la simulation, comparer avec ce qui s'est
passé, et ajuster le modèle jusqu'à ce qu'il colle. Page : **Simulation ›
Calage sur le réel** (version 2). Code : `v2/calage.js`.

> ⚠ Les données réelles (vols, planning, pointages, labor cost) ne vont
> **jamais** dans le dépôt public. Dans le site, le classeur reste en mémoire
> le temps de la page. Les fichiers envoyés pour un calage accompagné sont
> traités dans la session, hors dépôt.

## Le classeur

Quatre feuilles, une ligne par jour et par élément. Les en-têtes ne tiennent
compte ni de la casse ni des accents. Les dates : `AAAA-MM-JJ`, `JJ/MM/AAAA`
ou une date Excel. Les heures : `HH:MM` ou une heure Excel.

| Feuille | Colonnes | Remarques |
| --- | --- | --- |
| **Vols** | `date`, puis celles de l'import des vols : `vol_id`, `compagnie`, `type_avion`, `sens`, `heure_std`, `heure_sta`, `nb_BC`, `nb_PC`, `nb_YC`, `nb_CREW`, `nb_SPML` | tous les vols du mois |
| **Planning** | `date`, `service`, `equipe`, `debut`, `fin`, `personnes`, `jour` (facultatif, −1 pour la veille) | `service` et `equipe` : les noms de Équipes › Services et équipes ; une fin avant le début passe minuit |
| **Pointages** | `date`, `service`, `arrivee`, `depart`, `personne` (facultatif) | une ligne par personne et par jour |
| **Labor cost** | `date` (facultative), `service`, `montant` | lu, pas encore utilisé par le calage |

« ⇩ Le modèle du classeur » en donne un exemple fictif.

Les exports de l'unité n'ont pas cette forme : un convertisseur par export
(pointeuse, logiciel de planning) les y amène — voir `docs/CONVERTISSEURS.md`.

## Ce qui s'observe, ce qui s'ajuste

- **Le réel d'un service, un jour** : heures prévues (planning : personnes ×
  durée), heures pointées (somme des pointages), et ce qui a débordé :
  `max(0, pointées − prévues)`.
- **Le simulé** : la journée rejouée avec les vols du jour et les équipes du
  planning (heure, effectif, durée de poste ; une équipe absente du planning
  de son service ne travaille pas ; chaque équipe ne garde que les commandes
  qui volent ce jour-là), heures sup permises jusqu'à 12 h pour que le
  débordement s'exprime.
- **Le paramètre** : un facteur par service sur ses heures de travail
  (barème et heures propres des cases). ×1,18 = 18 % de temps de plus que le
  barème. Lisible, et à faire valider par les chefs de service.

**Limite à connaître.** Une équipe payée sa vacation part à la fin de sa
vacation, même si le travail était fini plus tôt : un jour sans heures sup
dit seulement « le travail tenait dans le poste ». Ce sont les jours avec
heures sup qui apprennent. Un mois avec des journées chargées vaut mieux
qu'un mois calme ; des heures de fin de production (si un système les
enregistre) affineraient encore.

## La méthode

1. Les 75 % premiers jours **apprennent**, les derniers **vérifient** (un
   modèle qui ne prédit que les jours qu'il a vus a appris par cœur).
2. Une grille de facteurs (×0,5 à ×2), tous les services ensemble : chacun lit
   sa propre erreur (somme des écarts d'heures sup, jour par jour) et garde
   son meilleur facteur ; à erreur égale, le plus proche de ×1.
3. Un affinage à ±4 % et ±8 % autour, chacun à son facteur.
4. Avant / après sur tous les jours : erreur moyenne et tendance (sur- ou
   sous-estimation), par service, sur l'apprentissage et sur la vérification.
5. « Appliquer ces facteurs au barème » multiplie les minutes ; « Annuler »
   revient en arrière. Relancé ensuite, le calage doit trouver ×1.

Si l'erreur de vérification reste grande après calage, la vitesse seule
n'explique pas l'écart : il manque quelque chose au modèle (pauses réelles,
polyvalence entre services, renforts, aléas…). C'est là que le moteur
s'améliore.

## Tests

`tests/v2/calage.test.cjs` fabrique un mois fictif dont on connaît la vérité
(Montage ×1,3) et vérifie que le calage la retrouve, y compris avec deux
services enchaînés ; `tests/v2-calage-browser.cjs` fait le parcours complet
dans la page.
