# Agent notes

## Spec Kit

This repo uses [GitHub Spec Kit](https://github.com/github/spec-kit) for Spec-Driven Development.

<!-- speckit-launch:pipeline -->

### Chained run

When the user starts a **new feature** or a **full Spec Kit run** (`/speckit-specify`, "run speckit", "build this feature"), chain commands in this order. Do **not** skip clarify or analyze.

```
specify → clarify → plan → tasks → analyze → implement → converge
```

A **single** slash command (`/speckit-plan` only, `/speckit-analyze` only, …) does **not** start the chain. After that command finishes, still apply the pause rules below if the next chained step would otherwise auto-start.

`/speckit-checklist` is optional extra requirements-quality review. It is **not** part of the default chain.

### After `/speckit-clarify`

**Pause and wait for the user** if any of these are still true after clarify finishes:

- `[NEEDS CLARIFICATION]` remains in `spec.md`
- Spec quality checklist still has failing items
- Coverage still has Outstanding / high-impact Deferred items

When pausing: list what is unresolved in a short bullet list and ask whether to continue to `/speckit-plan` (or re-clarify). Do **not** start plan until they confirm.

Questions that were asked **and answered** this session, and already written into the spec, do **not** require a second confirmation.

**Continue immediately to `/speckit-plan`** if clarify reported no critical ambiguities, the checklist passes, and nothing Outstanding remains. Say one line that you are continuing, then run plan.

### After `/speckit-analyze`

Analyze is read-only. Do not edit files from analyze itself. In a chained run, do **not** ask extra “would you like remediations?” questions — the pause rules below already decide whether to stop.

**Pause and wait for the user** if the report has any **CRITICAL**, **HIGH**, or **MEDIUM** finding. Show the findings table (or a short subset) and ask whether to fix first or proceed to `/speckit-implement`. Do **not** start implement until they confirm.

**Continue immediately to `/speckit-implement`** if there are **zero** findings, or **only LOW** (wording / style). Say one line that analyze is clean, then run implement.

### Other steps

- `specify` → always run `clarify` next in a chained run (do not jump to plan).
- `plan` → always run `tasks` next in a chained run.
- `tasks` → always run `analyze` next in a chained run.
- `implement` → run `converge` when the current task list is done.
- `converge` → if tasks were appended, run `implement` then `converge` again. Stop when converged, or after 3 converge passes.

Do not add extra “does this plan look OK?” gates unless clarify/analyze actually flagged issues.

### Model & capability tier routing

Match the model tier to each stage for optimal cost, speed, and accuracy:

| Stage | Capability Tier | Recommended Examples | Primary Purpose |
|-------|-----------------|----------------------|-----------------|
| `specify` / `clarify` | High reasoning / Thinking (CoT) | Claude 3.7 Sonnet (Thinking), o3-mini, Gemini 2.5 Pro | Uncovers hidden constraints, edge cases, and ambiguities early |
| `plan` | Architectural reasoning | Claude 3.7 Sonnet, GPT-4o | Solid system boundaries and dependency planning |
| `tasks` | Structured decomposition | Flagship model | Generates clean, actionable task graphs |
| `analyze` | Large context / Deep verification | Gemini 1.5/2.0 Pro, Claude 3.7 Sonnet | Whole-repo consistency and spec vs code audit without context loss |
| `implement` / `converge` | Fast, high-throughput coding | Claude 3.5/3.7 Sonnet, GPT-4o, DeepSeek-V3 | Rapid code writing, test loops, and convergence passes |

- **Interactive chat vs CLI automation**: In an interactive chat session (e.g. Cursor, Claude Code, Copilot), the active model cannot swap its own underlying LLM mid-session; the table above serves as guidance for the user (or subagent orchestrators) to select appropriate models at each stage.
- **Automated CLI workflow**: To automate cross-model switching across stages, run `specify workflow run speckit` with explicit `model:` and `integration:` pins in `.specify/workflows/overlays/speckit/chained-sdd.yml`.
- **User override priority**: If the user manually edits `.specify/workflows/overlays/speckit/chained-sdd.yml` to specify `model: "..."` or `integration: "..."`, that configuration takes strict precedence.
- **Single-agent environments**: If only using one model or tool, run all stages with your primary/flagship model.



### One-time project setup

1. Establish principles: `/speckit-constitution` (this project's principles — do not copy another repo)
2. Then use the chained run above for features

Commands use the `/speckit-*` form (hyphen). Skills live under `.agents/skills` (canonical). Per-agent paths (`.github/skills`, `.grok/skills`, `.cursor/skills`, `.claude/skills`, `.codex/skills`, …) are mounts for discovery — do not edit duplicates.

Feature artifacts live in `specs/<feature>/`. Do not add parallel ad-hoc plan docs (for example `docs/plans/`).

## Autonomy

- Day-to-day implementation is autonomous: file reads/writes, tests, type checks, and refactors. Do not interrupt for minor naming or style preferences.
- Only request review at critical decision points: breaking changes, architecture-boundary moves, or schema changes.
- Do not run destructive commands (`git reset --hard`, `git push --force`, bulk unconfirmed file deletion) without explicit user instruction.

## After clone

```bash
node scripts/link-agent-skills.mjs
```

Rebuilds junctions/symlinks from `.agents/skills` to each agent skills directory.

## Rules of thumb

- Spec-first: write or update `specs/*/spec.md` before inventing product behavior in code.
- Do not copy another project's constitution; write this project's principles with `/speckit-constitution`.
