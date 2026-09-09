# Agent notes

## Spec Kit

This repo uses [GitHub Spec Kit](https://github.com/github/spec-kit) for Spec-Driven Development.

<!-- speckit-launch:pipeline -->

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
