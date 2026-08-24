# Agent notes

## Spec Kit

This repo uses [GitHub Spec Kit](https://github.com/github/spec-kit) for Spec-Driven Development.

1. Establish principles once: `/speckit-constitution`
2. Specify what to build: `/speckit-specify`
3. Plan how: `/speckit-plan`
4. Break into tasks: `/speckit-tasks`
5. Implement: `/speckit-implement`
6. Converge until complete: `/speckit-converge`

Commands use the `/speckit-*` form (hyphen). Skills live under `.agents/skills` (canonical). Per-agent paths (`.github/skills`, `.grok/skills`, `.cursor/skills`, `.claude/skills`, `.codex/skills`, …) are mounts for discovery — do not edit duplicates.

## After clone

```bash
node scripts/link-agent-skills.mjs
```

Rebuilds junctions/symlinks from `.agents/skills` to each agent skills directory.

## Rules of thumb

- Spec-first: write or update `specs/*/spec.md` before inventing product behavior in code.
- Do not copy another project's constitution; write this project's principles with `/speckit-constitution`.
