# Changelog on every main landing

## Required

Whenever you create a git commit that will land on **`main`** (direct commit on `main`, or a PR merge into `main`):

1. **Update [`CHANGELOG.md`](CHANGELOG.md) in the same commit** (or in a follow-up on the same PR before merge).
2. Put new work under `## [Unreleased]` while developing on a branch. When a human lands it on `main`, they may move entries under a `## YYYY-MM-DD` heading (commit date in the project timezone, or UTC if unset). Do not run a bot to do that.
3. Each new bullet includes a conventional type section (`Added` / `Changed` / `Fixed` / `Docs` / `Chore` / `Refactor` / `Removed` / `Security`) and a user-facing summary. **Do not add new commit-SHA links.** A commit cannot contain its own hash, and a bot that stamps SHAs onto `main` races with other merges.
4. Trace new work with the **pull request number**, which stays stable after `gh pr create`. Format: ``- summary ([#N](https://github.com/{{GITHUB_REPO}}/pull/N))``. Replace `{{GITHUB_REPO}}` with this repo's `owner/name`. Add that link on the PR branch after the PR exists, in a follow-up commit **without** `[skip ci]` (a `[skip ci]` tip skips the whole `pull_request` workflow). Direct commits on `main` have no PR number — leave the summary unlinked. Do not rewrite historical SHA links already on `main`.

## Do not

- Skip CHANGELOG for tiny or docs-only commits on `main` — still add a `Docs` / `Chore` line.
- Skip CHANGELOG when a UI action says "commit only these staged files" — still include `CHANGELOG.md` in the **same** commit, or land a follow-up CHANGELOG commit **before** push.
- Rewrite unrelated historical entries.
- Replace CHANGELOG with only a `git log` paste; keep categorized bullets.
- On Windows PowerShell, rewrite `CHANGELOG.md` via `Set-Content` without UTF-8 encoding. Edit with the editor tool; see [shell-encoding.md](shell-encoding.md).

## When the user asks to commit

1. Stage CHANGELOG updates with the code (preferred: same commit as the change).
2. If you forgot CHANGELOG before committing, fix in the next commit immediately and note it — never land on `main` without a CHANGELOG line for that work.
3. Do not amend or rebase to insert a commit SHA. After the PR exists, append the PR link and push it without `[skip ci]`.

## Reference

Policy intro: root `CHANGELOG.md`. New features: Spec Kit (`specs/`).
