<!-- Adapté d'ECC (https://github.com/affaan-m/ECC, licence MIT : voir .claude/ECC-LICENSE) pour SIMMS : réduit aux règles de sécurité de ce dépôt. -->
# Sécurité

- **Aucune donnée réelle.** Le dépôt est public : ni plan, ni vols, ni effectifs, ni volumes, ni noms de l'unité, ni chiffres tirés d'une sauvegarde réelle (voir `.claude/rules/simms.md`).
- **Pas de secret.** Ni clé, ni mot de passe, ni jeton dans le code, les tests, la doc ou les commits.
- **Les fichiers importés sont validés** avant d'être utilisés : un CSV, un classeur Excel ou une sauvegarde est vérifié (format, colonnes, valeurs) ; une erreur refuse le fichier entier et dit quoi corriger.
- **Le texte importé est échappé avant l'affichage** : un nom de vol, de compagnie, d'équipe ou de service venu d'un fichier passe par l'échappement HTML (`esc`, `escapeHTML`) avant d'entrer dans la page.
