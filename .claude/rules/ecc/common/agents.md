<!-- Adapté d'ECC (https://github.com/affaan-m/ECC, licence MIT : voir .claude/ECC-LICENSE) pour SIMMS : planner et code-reviewer sous leur nom installé, appelés quand c'est pertinent. -->
# Agent Orchestration

## Available Agents

In this repository, the ECC agents `planner` and `code-reviewer` are installed in `.claude/agents/` (bare names).
They are invoked through the Agent tool with that `subagent_type`:

```text
Agent(subagent_type: "planner", prompt: "...")
```

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning, system design | Complex features, refactoring, architectural decisions |
| code-reviewer | Code review | After writing code |

Two skills take the place of ECC agents not installed here: **tdd-workflow** (test-driven development; new features, bug fixes) and **ecc-security-review** (security analysis; before commits).

## Agent Usage When Relevant

Optional, when it helps the task (not automatic):
1. Complex feature requests - Use **planner** agent when relevant
2. Code just written/modified - Use **code-reviewer** agent when relevant
3. Bug fix or new feature - Use the **tdd-workflow** skill when relevant
4. Architectural decision - Use **planner** agent when relevant

## Parallel Task Execution

ALWAYS use parallel Task execution for independent operations:

```markdown
# GOOD: Parallel execution
Launch 3 agents in parallel:
1. Agent 1: Security analysis of auth module
2. Agent 2: Performance review of cache system
3. Agent 3: Type checking of utilities

# BAD: Sequential when unnecessary
First agent 1, then agent 2, then agent 3
```

## Delegation Completion Contract

Applies to every agent at every depth (parent, child, grandchild):

1. **Your final message IS the deliverable.** Never end your turn with "waiting for background agents" — a spawned task is not a completed task. Ending your turn while children are running orphans their results (completed children cannot notify a parent whose turn has ended).
2. **If you delegate, you own collection.** Wait for results, integrate them, then return. Fire-and-forget delegation is forbidden.
3. **Decompose only when the work cannot fit in one context.** Do not re-delegate a task already sized for a single agent — depth is an outcome, not a plan.

> Rationale: observed failure mode — research agents followed "Parallel Task Execution" above, spawned children, and returned "waiting" as their final answer. All children completed successfully but their results were orphaned. The parallel rule without a completion contract produces zombie tasks.

## Multi-Perspective Analysis

For complex problems, use split role sub-agents:
- Factual reviewer
- Senior engineer
- Security expert
- Consistency reviewer
- Redundancy checker
