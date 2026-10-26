---
name: verification-loop
description: Run a six-phase verification of a Claude Code session's work — build, type check, lint, tests with coverage, security grep, and diff review — then produce a PASS/FAIL verification report. Use when verifying work after completing a feature or refactor, before creating a PR, or when quality gates must pass.
license: MIT
metadata:
  origin: ECC
---
<!--
  Version adaptée du skill « verification-loop » d'ECC (https://github.com/affaan-m/ECC,
  commit 25278e7), sous licence MIT : voir .claude/ECC-LICENSE.
  Adaptations à ce dépôt (SIMMS) :
  - chaque phase lance les commandes de ce dépôt : pas d'étape de build (les empreintes
    à la place), pas de vérificateur de types (node --check à la place), pas de linter,
    les tests par node --test ;
  - la couverture se lit sans seuil (.claude/rules/ecc/common/testing.md) ;
  - les renvois à la commande /verify et aux hooks d'ECC, absents de ce dépôt, sont retirés.
-->

# Verification Loop Skill

A comprehensive verification system for Claude Code sessions.

## When to Use

Invoke this skill:
- After completing a feature or significant code change
- Before creating a PR
- When you want to ensure quality gates pass
- After refactoring

## Verification Phases

### Phase 1: Build Verification
This repository has no build step: the pages load their scripts and stylesheets directly.
Check instead that each one carries the fingerprint of its content:
```bash
node outils/empreinte.cjs
git diff --stat -- index.html v2/index.html
```

A changed `index.html` means the fingerprints were stale: commit it with the change.
If the fingerprint tool fails, STOP and fix before continuing.

### Phase 2: Type Check
Plain JavaScript, no type checker: check the syntax of every script instead.
```bash
for f in *.js moteur/*.js v2/*.js v2/moteur/*.js outils/*.cjs; do node --check "$f" || echo "KO $f"; done
```

Report all syntax errors. Fix them before continuing.

### Phase 3: Lint Check

No linter in this repository: skip this phase.

### Phase 4: Test Suite
```bash
set -o pipefail
# Run the Node tests (add --experimental-test-coverage for a coverage report: no threshold)
node --test tests/*.test.cjs tests/v2/*.test.cjs 2>&1 | tail -20

# Then the browser tests the change touches, one by one
node tests/<name>-browser.cjs
```

Report:
- Total tests: X
- Passed: X
- Failed: X
- Coverage: X% (only if the report was run; no threshold)

### Phase 5: Security Scan
```bash
# Check for secrets
grep -rn "sk-" --include="*.js" --include="*.cjs" . 2>/dev/null | head -10
grep -rn "api_key" --include="*.js" --include="*.cjs" . 2>/dev/null | head -10

# Check for console.log (the tests and the tools may print; the pages should not)
grep -rn "console.log" --include="*.js" --exclude-dir=tests . 2>/dev/null | head -10
```

### Phase 6: Diff Review
```bash
# Show what changed
git diff --stat
git diff HEAD~1 --name-only
```

Review each changed file for:
- Unintended changes
- Missing error handling
- Potential edge cases

## Output Format

After running all phases, produce a verification report:

```
VERIFICATION REPORT
==================

Build:     [PASS/FAIL] (fingerprints)
Types:     [PASS/FAIL] (X syntax errors)
Lint:      n/a (no linter)
Tests:     [PASS/FAIL] (X/Y passed)
Security:  [PASS/FAIL] (X issues)
Diff:      [X files changed]

Overall:   [READY/NOT READY] for PR

Issues to Fix:
1. ...
2. ...
```

## Continuous Mode

For long sessions, run verification every 15 minutes or after major changes:

```markdown
Set a mental checkpoint:
- After completing each function
- After finishing a component
- Before moving to next task

Run this skill again (verification-loop).
```
