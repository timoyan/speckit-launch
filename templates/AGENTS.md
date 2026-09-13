# Agent notes

## Spec Kit

This repo uses [GitHub Spec Kit](https://github.com/github/spec-kit) for Spec-Driven Development.

<!-- speckit-launch:pipeline -->
<!-- /speckit-launch:pipeline -->

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

## Changelog and commit gate

Canonical for every agent (Claude, Cursor, Copilot, Gemini, Grok, Codex, Antigravity): [`.agents/rules/`](rules/). Cursor also gets an `alwaysApply` mirror under `.cursor/rules/*.mdc`; edit the `.agents/rules/` copy if they drift. These are starter process rules, not constitution principles. Replace `{{GITHUB_REPO}}` and the commit-check placeholders. Do not copy another project's toolchain or changelog entries.

- Record every landing on `main` in `CHANGELOG.md`. New bullets link the pull request (`[#N](https://github.com/{{GITHUB_REPO}}/pull/N)`), not a commit SHA. Add that link after `gh pr create`, without `[skip ci]`. Direct commits on `main` stay unlinked. Do not rewrite historical SHA links. Details: [changelog.md](rules/changelog.md).
- Before commit, run this repo's format, typecheck, and related-test commands in [commit-checks.md](rules/commit-checks.md). If a command still contains `{{`, do not invent one and do not use `--no-verify`.
- Do not rewrite UTF-8 docs with Windows PowerShell's default encoding. Details: [shell-encoding.md](rules/shell-encoding.md).
- After `gh pr create`, append the PR link. Skill: [commit-push-pr](skills/commit-push-pr/SKILL.md).

A docs-only `push` to `main` may ignore Markdown paths. See the launcher snippet `templates/github/ci-paths-ignore.snippet.yml`. Do not add that ignore list to `pull_request`.

## Rules of thumb

- Spec-first: write or update `specs/*/spec.md` before inventing product behavior in code.
- Do not copy another project's constitution; write this project's principles with `/speckit-constitution`.
