# SIMMS : règles du dépôt (elles l'emportent sur .claude/rules/ecc en cas de conflit)

## Données
- Le dépôt est public. Aucune donnée réelle de l'unité : ni plan, ni vols, ni effectifs, ni volumes, ni noms, ni chiffres tirés d'une sauvegarde réelle. Ni dans le code, ni dans les tests, les exemples, la doc, les commits ou les rapports.
- Tests et exemples : des vols, des compagnies et des équipes fictifs.
- Les fichiers que .gitignore refuse ne se copient jamais dans le dépôt et ne se committent jamais. Les fichiers s'ajoutent un par un, par leur nom. Avant chaque commit, `git diff --cached --name-only | git check-ignore --no-index --stdin` ne doit rien afficher.

## Non-régression
- Sans son option ou ses nouvelles données, une évolution rend exactement le résultat d'avant, champ par champ.
- La version 2 (v2/) n'est pas touchée, sauf demande.
- Le moteur est déterministe, avec un seul chemin de calcul : la page et les outils appellent le même module.

## Moteur et fichiers existants
- Le moteur est une simulation à événements : il modifie son état, c'est voulu. La règle d'immutabilité d'ECC ne s'applique pas à moteur/.
- Pas de découpage ni de réécriture d'un fichier existant pour sa taille ou son style, sauf demande. Les seuils de 50 et 800 lignes ne valent que pour le code neuf.
- Pas de dépendance, sauf demande. La recherche GitHub/npm n'est pas obligatoire.

## Tests et commits
- Le test s'écrit d'abord, mais sans commit d'étape (échec, réussite) : un commit par partie, vert, avec ses tests et sa doc, après node outils/empreinte.cjs.
- Pas de rapport TDD dans un fichier : le résumé va dans le corps du commit.
- Pas de documents de planification (PRD, architecture, system_design…) dans le dépôt : le plan reste dans la session ou dans le corps du commit.
- Avant chaque commit : le skill verification-loop. Pour une partie qui touche le moteur : l'agent code-reviewer.

## Travail par prompt (Project Claude Code)

Section ajoutée le 2026-11-27. Elle complète les règles ci-dessus sans en changer aucune.

### Le cycle
- Un prompt du maître d'œuvre = un thread = une branche neuve = une pull request vers la branche par défaut.
- La branche part de la tête de la branche par défaut au lancement du thread. Elle n'est pas remise à jour sur la branche par défaut (ni merge, ni rebase), sauf si un prompt le demande.
- Ne jamais fusionner une pull request. Ne jamais pousser sur la branche par défaut. Ne jamais réécrire l'historique d'une branche poussée : ni force-push, ni rebase, ni amend d'un commit poussé.
- Une fois le rapport donné, la branche ne bouge plus : le maître d'œuvre vérifie le commit de tête que le rapport nomme. Une retouche n'arrive que par un prompt « RETOUCHE PROMPT NN.k » qui nomme la branche ; ses commits s'ajoutent par-dessus, puis un nouveau rapport « RAPPORT PROMPT NN.k ».
- L'en-tête d'un prompt dit s'il peut tourner en parallèle d'un autre. Sans mention : un seul à la fois.

### Les documents de référence
- Avant toute partie, lire `docs/decisions.md` et `docs/CHARTE_INTERFACE.md`. Toute page nouvelle ou modifiée de la version 1 respecte la charte ; un écart voulu se décide avec le chef de projet et s'écrit d'abord dans la charte.
- Ces deux fichiers ne se modifient que si le prompt le demande, et seulement comme il le demande.
- Si le prompt semble contredire une décision ou une règle de la charte : ne pas trancher. Arrêter la partie concernée avant d'écrire, faire les autres, et décrire le conflit dans la section 9 du rapport.

### Le rapport
Le thread finit par un message qui commence par « RAPPORT PROMPT NN », recopié dans la description de la pull request. Les douze sections sont toutes présentes, dans cet ordre ; « rien » si une section est vide.
1. Identité : nom de la branche ; numéro de la pull request ; base (nom de la branche et SHA complet du commit de départ) ; tête (SHA complet du dernier commit) ; nombre de commits.
2. Commits : un par ligne, SHA court, partie, titre, signé ou non.
3. Périmètre : `git diff --stat base..tête` ; la commande qui montre que `v2/`, `moteur/` et les fichiers identiques à leur jumeau de `v2/` n'ont pas changé, et son résultat (ou ce qui a changé, et pourquoi).
4. Calcul : « aucun calcul ne change », ou ce qui change, où et pourquoi ; ce que donne `node outils/empreinte.cjs`.
5. Sauvegarde : format inchangé, ou entrées ajoutées ou changées ; ce que devient une sauvegarde d'avant, et une sauvegarde d'après lue par le code d'avant.
6. Tests : batterie complète lancée sur la tête, dans une copie propre (tests Node réussis et en échec, tests navigateur OK et ÉCHEC) ; tests ajoutés ; tests dont la valeur attendue change (ancienne → nouvelle, et pourquoi) ; tests instables rencontrés.
7. Données : confirmation qu'aucune donnée d'une unité réelle n'a été ajoutée (noms, chiffres, plan), et comment cela a été vérifié.
8. Écarts au prompt : ce qui n'est pas fait, ce qui est fait autrement, ce qui est laissé faute de pouvoir toucher `moteur/` ou un fichier commun.
9. Contradictions avec `docs/decisions.md` ou la charte.
10. Choix à valider : un par ligne, avec sa partie.
11. Questions au maître d'œuvre.
12. Captures : où elles sont (hors dépôt) et la commande pour les refaire.
