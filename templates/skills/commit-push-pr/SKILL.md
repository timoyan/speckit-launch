---
name: Commit Push PR
description: Run this repo's commit gate, then commit, push, and create a GitHub PR (gh pr create)
---

Run the **commit gate** in [`.agents/rules/commit-checks.md`](../../rules/commit-checks.md), then `git commit`, `git push`, and **create a GitHub pull request** (`gh pr create`). Do the steps; do not only print commands for the user to paste. Cursor may also show a mirror at `.cursor/rules/commit-checks.mdc`; the `.agents/rules/` file is canonical.

Optional `$ARGUMENTS` hint the commit and PR subject. If absent, infer them from the diff and recent commit messages.

## Safety

- Commit message: **English**, Conventional Commits (`type(scope): subject`, optional body).
- Do **not** change git config. Do **not** `--force` push to `main` / `master`. Do **not** use `--no-verify` unless the user explicitly asks.
- Do **not** commit secrets (`.env`, credentials). If the user insists, warn first.
- Push and `gh` need a shell that can reach the network.
- If there is nothing to commit and no PR to open, say so and stop.

### Changelog

- In the same change, add an Unreleased bullet in [`CHANGELOG.md`](CHANGELOG.md) per [`.agents/rules/changelog.md`](../../rules/changelog.md).
- Edit a non-ASCII CHANGELOG only with the editor tool. Do not rewrite the file from a shell that does not set UTF-8.

## Steps

### 1. Read status (in parallel)

- `git status`
- `git diff` and `git diff --staged`
- `git log -5 --oneline`
- `git branch --show-current`
- On a feature branch: `git diff origin/main...HEAD` or `git log origin/main..HEAD`

### 2. Commit gate

From the **repo root**, run the commands in `.agents/rules/commit-checks.md` in order. If a command still contains `{{`, stop and ask the user to fill them. Do not invent commands. Do not skip the gate.

If a step fails, fix it and re-run that step. Do not commit or push past a failure.

### 3. Commit

1. Draft a Conventional Commit message (English; focus on why).
2. Add the Unreleased CHANGELOG bullet. **Do not** write a commit SHA. The PR number is added after the next step.
3. `git add` the relevant files.
4. Commit with a heredoc (or a PowerShell here-string on Windows). Do not use `--no-verify`.
5. If the hook fails, fix and make a **new** commit.
6. `git status` should be clean.

### 4. Push

```bash
git push -u origin HEAD
```

If it fails, report the reason. Do not force-push.

### 5. Create the PR

1. Review every commit that will be in the PR, not only the latest.
2. Draft a title and a body with `## Summary` and `## Test plan`.
3. Create it with `gh pr create`.
4. Capture the URL (`https://github.com/{{GITHUB_REPO}}/pull/N`). Replace `{{GITHUB_REPO}}` with this repo's `owner/name`.
5. If the new CHANGELOG bullets lack that PR number, append ` ([#N](https://github.com/{{GITHUB_REPO}}/pull/N))` with the editor tool, then commit and push. **Do not** add `[skip ci]`, or the pull-request workflow will not run. Do not write a commit SHA. Do not rewrite historical SHA links.

## Report

Reply with the gate result, the commit summary, the push target, and the pull request URL.
