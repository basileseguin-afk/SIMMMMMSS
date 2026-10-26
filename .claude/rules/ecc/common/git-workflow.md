<!-- Adapté d'ECC (https://github.com/affaan-m/ECC, licence MIT : voir .claude/ECC-LICENSE) aux conventions de commit de ce dépôt (SIMMS), telles que son historique les montre. -->
# Git Workflow

## Commit Message Format

Messages are written in French, with French typography (« guillemets », a space before « : »).

```
<Sujet>, <partie> : <ce qui change, dit simplement>

<Corps : ce qui change et pourquoi, en phrases ou en liste « - » ;
ce qui ne change pas ; les fichiers touchés quand c'est utile.>

Co-Authored-By: …
Claude-Session: …
```

- **Subject**: the topic or series, then « : », then the change as the user sees it. No type prefix (`feat:`, `fix:`…), no final period. Examples from the history:
  - `Banc d'essai, évolution 10 (a) : le programme de vols daté, import et export`
  - `Banc d'essai, correction 11 : une période en handling 24 h/24, pas de second retour « J+1 »`
  - `Refonte, étape 7 (1/2) : l'heure en 24 h, le refus sous le champ`
  - a change outside a series: `Plonge : une équipe de plus aux tunnels (le matin, le soir)`
- **A message given by the user is used exactly as given** (e.g. `Ajout d’une sélection ECC`).
- **Body**: short paragraphs or a « - » list, in French: what changes and why, and what does not change (« Sans programme daté, rien ne change. », « Aucune donnée ni aucun calcul ne change. »).
- **Trailers**: end with the attribution lines the session provides (`Co-Authored-By`, `Claude-Session`). No model name anywhere else in the message.
- **One commit per part** of a request (a, b, c… or 1/2, 2/2), each with its tests and its docs (README, CHANGELOG, `docs/…`), after `node outils/empreinte.cjs`.
- **Stage files by name**, never `git add -A`: the working tree may hold private files (the unit's plan, saves) that must never be committed.

## Branches and Pull Requests

- Work on the designated branch and push after each commit (`git push -u origin <branch>`).
- The history is linear: no merge commits, no rewriting of pushed commits.
- No pull request unless asked. When one is asked for: analyze the full history (`git diff [base-branch]...HEAD`, not just the latest commit), draft a summary and a test plan.

> For the full development process (planning, TDD, code review) before git operations,
> see [development-workflow.md](./development-workflow.md).
