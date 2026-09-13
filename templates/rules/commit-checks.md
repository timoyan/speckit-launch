# Commit gate

Replace the three placeholders with this repo's commands before treating the gate as real. Keep the policy; do not copy another project's toolchain.

## Required

**Any** `git commit` (including docs-only and CHANGELOG follow-ups, whether by an agent or a human) must pass these checks first:

1. **Format check**: `{{FORMAT_CHECK}}`
2. **Type check**: `{{TYPECHECK}}`
3. **Related tests**: `{{RELATED_TESTS}}`
   - Run only tests related to **staged** source files.
   - No staged source files (docs-only and similar) → skip (pass).
   - The **full** suite stays on CI (and manual runs). Do not make it the only pre-commit gate.

`pre-push` must not repeat format and typecheck. The remote CI run covers the full suite.

If a command still contains `{{`, do not invent a substitute and do not commit. Tell the user to fill this file.

## Agent behavior

1. When the user asks to commit, `git add` the intended files, run the three checks, fix failures in the same change, then commit.
2. If format fails and this repo has a format-write command, run that, then re-run the format check.
3. **Do not** use `--no-verify` to skip this gate unless the user explicitly asks.

## Do not

- Do not replace related tests with the full suite as the only pre-commit gate (too slow), and do not treat related tests as equal to CI.
- Do not hardcode another project's format, token, or architecture-boundary commands into this rule.
