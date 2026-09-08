# speckit-launch

English | [繁體中文](README.zh-Hant.md)

One command to launch a [GitHub Spec Kit](https://github.com/github/spec-kit) project with **mainstream AI agent integrations** and a shared canonical `.agents/skills` tree.

Works on **Windows, macOS, and Linux**. Not locked to one coding agent or OS.

## Why

Official init sets up **one** agent:

```bash
specify init <name> --integration copilot --script sh --non-interactive
```

This launcher installs the mainstream set in one step, consolidates `speckit-*` skills into `.agents/skills`, creates junction/symlink mounts, updates `.gitignore`, and overlays a **chained Spec Kit pipeline** (clarify / analyze as real steps; pause only when those steps still have issues).

## Prerequisites

- [Node.js](https://nodejs.org/) (18+)
- [`specify`](https://github.com/github/spec-kit) on `PATH`, or [`uv`](https://docs.astral.sh/uv/) (the CLI installs `specify-cli` via `uv tool install` if needed)
- `git` (unless you pass `--no-git`)

### Spec Kit compatibility

This launcher uses whatever `specify` is on `PATH`. It does **not** vendor Spec Kit skills or pin a CLI in `package.json`.

| | Version |
|--|---------|
| **Requires** | Spec Kit **1.0+** (`specify workflow overlay`, overlay path `.specify/workflows/overlays/`) |
| **Last smoke-tested** | **1.0.4** (2026-09-08) |

The chained-SDD overlay is written against the bundled `speckit` workflow step ids (`specify`, `review-spec`, `plan`, `review-plan`, `tasks`, `implement`). A newer CLI that renames those ids needs an overlay edit — see [After upgrading the `specify` CLI](#after-upgrading-the-specify-cli).

## Quick start

```bash
git clone https://github.com/timoyan/speckit-launch.git
node speckit-launch/bin/new-project.mjs my-app

# Init the current directory
node speckit-launch/bin/new-project.mjs --here

# Custom parent and script type
node speckit-launch/bin/new-project.mjs my-app --dir ~/projects --script sh
```

Default installs these Spec Kit integrations:

`copilot`, `claude`, `cursor-agent`, `gemini`, `grok`, `codex`

No `--ai` flag needed. Use `--only <integration>` only if you want a single agent.

If you install this package (or add it to `PATH` via `npm link` / `npx`):

```bash
npx speckit-launch my-app
```

### Flags

| Flag | Description |
|------|-------------|
| `--here` | Initialize in the current directory (or `--dir` if set) |
| `--dir <path>` | Parent directory for `<name>`, or target path with `--here` |
| `--only <integration>` | Install only this Spec Kit integration (skip the mainstream set) |
| `--script sh\|ps\|py` | Helper script type (default: `ps` on Windows, `sh` elsewhere) |
| `--no-git` | Skip `git init` |
| `--help` | Show usage |

Named projects are created under the **current working directory** unless `--dir` is set.

## What it does

1. Ensures `specify` is available (`uv tool install specify-cli` if needed)
2. `git init` (optional)
3. `specify init` for the first integration, then `specify integration install --force` for the rest of the mainstream set (or only `--only` if set)
4. Dedupes `speckit-*` skills into `.agents/skills`
5. Writes `.agents/skills.json` and `.agents/AGENTS.md` (chained pipeline)
6. Writes `.cursor/rules/speckit-pipeline.mdc` and installs `.specify/workflows/overlays/speckit/chained-sdd.yml` (does **not** overwrite the bundled workflow.yml)
7. Seeds the generic pipeline principle into the constitution template (does not copy another project's filled constitution)
8. Merges a short pipeline pointer into existing agent docs (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`) if those files already exist
9. Copies and runs `scripts/link-agent-skills.mjs` (Windows junction / Unix symlink)
10. Merges skill-mount rules into `.gitignore`

It does **not** copy another project's product constitution. After bootstrap, run `/speckit-constitution` in the new project (keep the seeded pipeline principle; fill the rest for **this** product).

## Spec Kit pipeline (from production use)

Official Spec Kit treats clarify / analyze / checklist as optional quality gates, and the bundled workflow inserts unconditional “review the spec / plan” stops.

This launcher overlays the **production chained run** used in real Spec Kit repos:

```
specify → clarify → plan → tasks → analyze → implement → converge
```

| Step | Default behavior |
|------|------------------|
| After **specify** | Always run **clarify** (do not jump to plan) |
| After **clarify** | **Pause** if questions were asked, `[NEEDS CLARIFICATION]` remains, the spec checklist still fails, or Outstanding / high-impact items remain. Otherwise **continue immediately** to plan |
| After **plan** | Always run **tasks** |
| After **tasks** | Always run **analyze** |
| After **analyze** | **Pause** on any CRITICAL / HIGH / MEDIUM finding. Zero findings or only LOW → **continue immediately** to implement |
| After **implement** | Run **converge**. If tasks were appended, implement then converge again (stop when converged, or after 3 passes) |

A single slash command (`/speckit-plan` only, …) does **not** start the chain. `/speckit-checklist` stays optional and is not in the default chain.

Overlays written into the new project:

- `.agents/AGENTS.md` — canonical pipeline + autonomy rules
- `.cursor/rules/speckit-pipeline.mdc` — Cursor `alwaysApply` copy of the pause rules
- `.specify/workflows/overlays/speckit/chained-sdd.yml` — Spec Kit 1.0 overlay: drop the two review gates, insert clarify / analyze / converge. Official `workflow.yml` stays upgradable.
- `.specify/templates/constitution-template.md` (and unfilled `constitution.md`) — generic **Autonomy & Spec Kit pipeline** principle

Product-specific rules (domain model, UI kit, changelog format, …) stay out of this launcher. Write those with `/speckit-constitution` for the new project.

## After upgrading the `specify` CLI

This repo is a **launcher**, not a Spec Kit project. There is no `.specify/` here. Do **not** run `specify integration upgrade` in this directory.

New projects pick up the new CLI automatically the next time you run `node bin/new-project.mjs`. To keep the launcher itself compatible:

1. Confirm the CLI: `specify version` (last smoke-tested: **1.0.4**; requires **1.0+**)
2. Skim `specify init --help` and `specify integration install --help` if a major release changed flags
3. Check that the bundled `speckit` workflow still has these step ids (overlay anchors): `specify`, `review-spec`, `plan`, `review-plan`, `tasks`, `implement`
4. Smoke-test: `node bin/new-project.mjs --only grok --no-git smoke-app --dir %TEMP%` (or `$TMPDIR`)
5. In the smoke project, confirm `.specify/workflows/overlays/speckit/chained-sdd.yml` exists and `specify workflow resolve speckit` shows clarify / analyze / converge without the review gates
6. Commit launcher/overlay changes if anything in steps 2–5 required an edit

Already-created apps (fin-tank, drop-case, …) are upgraded **in that repo**:

```bash
specify integration upgrade          # once per installed integration key
specify extension update
node scripts/link-agent-skills.mjs   # if that project uses skill mounts
```

Do not re-run `new-project.mjs --here` as an upgrade path.

## After clone

In a project created by this launcher:

```bash
node scripts/link-agent-skills.mjs
```

(Optional: add `"postinstall": "node scripts/link-agent-skills.mjs"` in that project's `package.json`.)

## User-level agent skill

Copy [`skill/new-project/SKILL.md`](skill/new-project/SKILL.md) into your agent's user skills directory (for example `~/.cursor/skills/new-project/` or `~/.claude/skills/new-project/`).

Point the skill at this repo via `SPECKIT_STARTER` or a path you provide — do not hardcode machine-specific locations.

## Layout

```text
speckit-launch/
  bin/new-project.mjs
  scripts/link-agent-skills.mjs
  templates/
    gitignore.fragment
    AGENTS.md
    skills.json
    speckit-pipeline.mdc
    speckit-overlay.yml
    constitution-pipeline.md
  skill/new-project/SKILL.md
  package.json
  LICENSE
  README.md
  README.zh-Hant.md
```

## License

MIT — see [LICENSE](LICENSE).
