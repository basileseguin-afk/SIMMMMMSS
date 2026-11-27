<!-- Adapté d'ECC (https://github.com/affaan-m/ECC, licence MIT : voir .claude/ECC-LICENSE) pour SIMMS : sans seuil de couverture ni tests E2E obligatoires. -->
# Testing Requirements

## Test Before Calling a Fix Done

A fix or a feature is not finished until it has been tested:
- run the tests that cover the change and see them pass;
- before committing, run the tests that the category of the delivery calls for, to catch regressions (see below).

In this repository, the category of the delivery, read from its diff, decides which tests run (section « Les tests » of `.claude/rules/simms.md`); a documents-only delivery runs none. The Node tests: `node --test tests/*.test.cjs tests/v2/*.test.cjs`; the browser tests: those of `tests/*-browser.cjs` that the change touches. The whole battery runs in a clean clone, without the files `.gitignore` refuses (`node outils/batterie.cjs --commit HEAD`, the verification-loop skill, phase 4b), only when the category calls for it: once per delivery, on the head of the branch, never before each commit. No test depends on `plan-prive/` or any other ignored file; a test that needs a background plan uses the fictive tile of `tests/plan-fictif.cjs`.

## Test Types

Use the kinds of tests the change calls for:
1. **Unit Tests** - Individual functions, utilities, components
2. **Integration Tests** - API endpoints, database operations
3. **E2E Tests** - Critical user flows (framework chosen per language), when the change affects them

## Test-Driven Development

MANDATORY workflow:
1. Write test first (RED)
2. Run test - it should FAIL
3. Write minimal implementation (GREEN)
4. Run test - it should PASS
5. Refactor (IMPROVE)

## Troubleshooting Test Failures

1. Use the **tdd-workflow** skill
2. Check test isolation
3. Verify mocks are correct
4. Fix implementation, not tests (unless tests are wrong)

## Skill Support

- **tdd-workflow** (skill) - Use PROACTIVELY for new features, enforces write-tests-first

## Test Structure (AAA Pattern)

Prefer Arrange-Act-Assert structure for tests:

```typescript
test('calculates similarity correctly', () => {
  // Arrange
  const vector1 = [1, 0, 0]
  const vector2 = [0, 1, 0]

  // Act
  const similarity = calculateCosineSimilarity(vector1, vector2)

  // Assert
  expect(similarity).toBe(0)
})
```

### Test Naming

Use descriptive names that explain the behavior under test:

```typescript
test('returns empty array when no markets match query', () => {})
test('throws error when API key is missing', () => {})
test('falls back to substring search when Redis is unavailable', () => {})
```
