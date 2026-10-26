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
