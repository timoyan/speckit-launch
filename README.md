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

Line endings are **LF** in this repo and in generated projects (`.gitattributes`: `* text=auto eol=lf`), so Windows `core.autocrlf` does not split diffs or break shebangs.

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

`copilot`, `claude`, `cursor-agent`, `gemini`, `grok`, `codex`, `agy`

No `--ai` flag needed. Use `--only <integration>` only if you want a single agent.

### Local link and global usage (`npm link`)

If you clone this repository and want to run `speckit-launch` or `npx speckit-launch` from any directory:

```bash
cd speckit-launch
npm run link          # equivalent to npm link
```

Once linked, create new projects from any working path:

```bash
npx speckit-launch my-app
# or directly:
speckit-launch my-app
```

To unlink later:

```bash
npm run unlink        # equivalent to npm unlink -g speckit-launch
```


### Flags

| Flag | Description |
|------|-------------|
| `--here` | Initialize in the current directory (or `--dir` if set) |
| `--dir <path>` | Parent directory for `<name>`, or target path with `--here` |
| `--primary <agent>` | Set the primary/default AI agent (e.g. `agy`, `claude`, `cursor-agent`) while installing all mainstream integrations |
| `--only <agent>` | Install only this Spec Kit integration (skip the mainstream set) |
| `--non-interactive` | Skip interactive prompt and use auto-detected defaults |
| `--script sh\|ps\|py` | Helper script type (default: `ps` on Windows, `sh` elsewhere) |
| `--no-git` | Skip `git init` |
| `--version`, `-v` | Print version |
| `--help` | Show usage |

In an interactive terminal, if `--primary` is not specified, the launcher auto-detects CLIs on PATH and presents an interactive menu to choose your primary agent.
Named projects are created under the **current working directory** unless `--dir` is set.

## What it does

1. Ensures `specify` is available (`uv tool install specify-cli` if needed)
2. `git init` (optional)
3. `specify init` for the first integration, then `specify integration install --force` for the rest of the mainstream set (including `agy`) (or only `--only` if set)
4. Dedupes `speckit-*` skills into `.agents/skills` and applies production-tested enhancements:
   - **Immediate Clarify Persistence**: Candidate questions and default recommendations written directly into `spec.md` with interactive checkboxes.
   - **Actionable `analysis.md` Audit Report**: Structured findings table and user-editable remediation checklist (`- [x] R...`).
   - **Auto-Remediation in Implement**: Automatically applies checked items from `analysis.md` to `spec.md` / `plan.md` / `tasks.md` before coding.
   - **Clean Converge with Auto-ADR & Living Spec**: Distills architectural decisions to `docs/adr/`, flattens completed features into high-signal living specs (`specs/<id>-<name>.md`), and cleans transient files.
5. Writes `.agents/skills.json` and `.agents/AGENTS.md` (chained pipeline rules, remediation workflow, and model routing)
6. Writes `.cursor/rules/speckit-pipeline.mdc` and installs `.specify/workflows/overlays/speckit/chained-sdd.yml` with interactive gates (`review-clarify` and `review-analyze`) configured with `on_reject: retry` to prevent fatal aborts
7. Installs the local `chained-sdd` preset (`specify preset add --dev`) so `/speckit-constitution` appends the pipeline principle. Also seeds an unfilled `constitution.md`. Does not copy another project's filled constitution. **Not** published to a Spec Kit catalog.
8. Merges a short pipeline pointer into existing agent docs (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`) if those files already exist
9. Copies and runs `scripts/link-agent-skills.mjs` (Windows junction / Unix symlink)
10. Merges skill-mount rules and local extension/credential patterns into `.gitignore`
11. Writes or merges `.gitattributes` (`* text=auto eol=lf`) so generated projects keep LF on Windows / macOS / Linux

It does **not** copy another project's product constitution. After bootstrap, run `/speckit-constitution` in the new project (keep the seeded pipeline principle; fill the rest for **this** product).

## Spec Kit pipeline (from production use)

Official Spec Kit treats clarify / analyze / checklist as optional quality gates, and the bundled workflow inserts unconditional “review the spec / plan” stops.

This launcher overlays the **production chained run** used in real Spec Kit repos:

```
specify → clarify → review-clarify [gate] → plan → tasks → analyze → review-analyze [gate] → implement → converge
```

| Step | Default behavior |
|------|------------------|
| After **specify** | Always run **clarify** (do not jump to plan) |
| After **clarify** | Questions and default recommendations persisted to `spec.md`. `review-clarify` pauses with `on_reject: retry`. Unanswered questions or failing checklists → **Pause**; clean → **continue to plan** |
| After **plan** | Always run **tasks** |
| After **tasks** | Always run **analyze** |
| After **analyze** | Analysis report written to `analysis.md`. `review-analyze` pauses for checklist inspection. Zero findings or only LOW → **continue to implement** |
| During **implement** | Step 2.5 auto-applies checked remediations from `analysis.md` before executing tasks |
| After **implement** | Run **converge**. If tasks were appended, implement then converge again (stop when converged, or after 3 passes). When converged: auto-extracts ADR, consolidates living spec, and cleans transient files |

A single slash command (`/speckit-plan` only, …) does **not** start the chain. `/speckit-checklist` stays optional and is not in the default chain.

Overlays written into the new project:

- `.agents/AGENTS.md` — canonical pipeline + autonomy rules + remediation / ADR converge workflow
- `.cursor/rules/speckit-pipeline.mdc` — Cursor `alwaysApply` copy of the pause rules
- `.specify/workflows/overlays/speckit/chained-sdd.yml` — Spec Kit 1.0 overlay: inserts clarify / analyze / converge, with non-destructive retry gates. Official `workflow.yml` stays upgradable.
- `chained-sdd` preset — appends the **Autonomy & Spec Kit pipeline** principle onto `constitution-template` (local `--dev` install; not a catalog release). Unfilled `constitution.md` is seeded the same way.

### Model & Agent Routing per Stage

Because Spec Kit decouples stages via disk artifacts in `specs/<feature>/`, you can route stages across models and agents based on strengths:

| Stage | Capability Tier | Recommended Examples | Primary Purpose |
|-------|-----------------|----------------------|-----------------|
| `specify` / `clarify` | High reasoning / Thinking (CoT) | Claude 3.7 Sonnet (Thinking), o3-mini, Gemini 2.5 Pro | Uncovers hidden constraints, edge cases, and ambiguities early |
| `plan` | Architectural reasoning | Claude 3.7 Sonnet, GPT-4o | Solid system boundaries and dependency planning |
| `tasks` | Structured decomposition | Flagship model | Generates clean, actionable task graphs |
| `analyze` | Large context / Deep verification | Gemini 1.5/2.0 Pro, Claude 3.7 Sonnet | Whole-repo consistency and spec vs code audit without context truncation |
| `implement` / `converge` | Fast, high-throughput coding | Claude 3.5/3.7 Sonnet, GPT-4o, DeepSeek-V3 | Rapid code writing, test loops, and convergence passes |

- **Dynamic Agent Model Selection**: Models are not hardcoded by default; the executing agent or CLI dynamically inputs/selects the best model according to the capability tier table above.
- **User Manual Override**: If you want to pin specific models, uncomment the respective steps in `.specify/workflows/overlays/speckit/chained-sdd.yml` (covers all 7 steps) and specify `model:` or `integration:`. User edits take strict precedence.
- **Single vs Multi-agent**: Bootstrap automatically detects agent CLIs on PATH, offering zero-config fallback for single-agent setups and routing tips for multi-agent environments.

> [!IMPORTANT]
> **Key Conclusion: Agents do NOT automatically switch models mid-flow**
> - **In IDE / chat sessions (e.g. Cursor, Claude Code, Copilot)**: The active model is chosen by you in the UI or CLI launch parameters. An active LLM cannot swap its own underlying engine mid-session. The capability table in `AGENTS.md` serves as **human guidance** (reminding you when to switch models manually in the UI).
> - **The ONLY way to automate cross-model switching: Spec Kit CLI Workflows**: Running `specify workflow run speckit` lets the Spec Kit orchestrator dispatch background steps according to the `model:` and `integration:` explicitly defined in `.specify/workflows/overlays/speckit/chained-sdd.yml`. If unspecified in the YAML, steps use the respective integration's default model.



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

Already-created apps are upgraded **in that repo**:

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

## Multi-Agent / Multi-Branch Parallelism (Git Worktree)

Spec Kit's chained SDD pipeline (`specify → clarify → plan → tasks → analyze → implement → converge`) produces artifacts scoped strictly inside `specs/<feature>/`, without global locks.

To have multiple AI agents work on separate feature branches concurrently, **do not switch branches inside the same working directory** (which causes Git state collisions and feature anchoring mismatches). Instead, use Git Worktrees:

### 1. One-command isolated worktree setup
The launcher includes a helper script that automatically creates the worktree, checks out the branch, and mounts agent skills:

```bash
# Create a worktree for a branch (defaults to ../<repo>-<branch>)
node scripts/new-worktree.mjs 002-billing

# Or specify a custom directory
node scripts/new-worktree.mjs 002-billing ../my-app-billing

# Or via npm script if package.json exists:
npm run worktree:new -- 002-billing
```

### 2. Independent execution per directory
Open each directory in a separate agent terminal or IDE window (Cursor, Claude Code, Antigravity, etc.) and run the chained pipeline independently:
```bash
cd ../my-app-billing
# Run specify to kick off the pipeline
/speckit-specify <feature description>
```

### 3. Cleanup after completion
Once the feature converges (`converge`), is reviewed via PR, and merged to main, remove the worktree:
```bash
git worktree remove ../my-app-billing
```

## User-level agent skill

Copy [`skill/new-project/SKILL.md`](skill/new-project/SKILL.md) into your agent's user skills directory (for example `~/.cursor/skills/new-project/` or `~/.claude/skills/new-project/`).

Point the skill at this repo via `SPECKIT_STARTER` or a path you provide — do not hardcode machine-specific locations.

## Architecture & Layout

`speckit-launch` cleanly decouples **Chained SDD Methodology Assets** from **Generic Repository Scaffolding**:

```text
speckit-launch/
├── bin/
│   └── new-project.mjs                      # Main launcher CLI orchestrator
├── scripts/
│   ├── link-agent-skills.mjs                # OS junction / symlink mount utility
│   └── new-worktree.mjs                     # Automated Git Worktree isolation & skill mount tool
├── presets/chained-sdd/                     # [Self-Contained Chained SDD Methodology Bundle]
│   ├── preset.yml                           # Spec Kit Preset declaration
│   ├── install.mjs                          # Standalone preset installer for existing projects
│   ├── README.md                            # Preset usage and integration guide
│   ├── LICENSE
│   ├── workflows/
│   │   └── chained-sdd.yml                  # SDD step graph with retry review gates
│   ├── rules/
│   │   ├── pipeline-rules.md                # Single source of truth for chained SDD rules
│   │   └── speckit-pipeline.mdc             # Agent chained pause/continue rules (Cursor)
│   ├── templates/
│   │   └── constitution-pipeline.md         # Seeded pipeline principle for constitution
│   └── skills/                              # Enhanced workflow execution skills
│       ├── speckit-clarify/SKILL.md         # Immediate question & default persistence
│       ├── speckit-analyze/SKILL.md         # Structured analysis.md with remediation checklist
│       ├── speckit-implement/SKILL.md       # Step 2.5 auto-remediation application
│       └── speckit-converge/SKILL.md        # Automated ADR extraction & living spec consolidation
├── templates/                               # [Pure Repository Infrastructure Scaffolding]
│   ├── AGENTS.md                            # Base agent autonomy scaffolding (pipeline rules injected at launch)
│   ├── gitattributes.fragment               # Cross-platform LF line endings (* text=auto eol=lf)
│   ├── gitignore.fragment                   # Gitignore template (extension caches, skill-mounts, local credentials)
│   └── skills.json                          # Shared .agents/skills catalog metadata
├── skill/new-project/
│   └── SKILL.md                             # Agent user skill for invoking speckit-launch
├── tests/
│   └── launcher.test.mjs                    # Automated test suite (node --test)
├── package.json
├── LICENSE
├── README.md
└── README.zh-Hant.md
```

### Architectural Layer Responsibilities

| Layer | Directory | Purpose | Lifecycle & Scope |
|-------|-----------|---------|-------------------|
| **Chained SDD Methodology** | `presets/chained-sdd/` | Bundles workflow graphs, agent pause rules, constitution fragments, and the 4 specialized SDD skills. | Portable & self-contained. Can be installed into any existing Spec Kit project via `specify preset add --dev`. |
| **Repo Scaffolding** | `templates/` | Pure project-level files (`.gitignore`, `.gitattributes`, `AGENTS.md`, `skills.json`). | Initialized once upon project bootstrap; decoupled from specific workflow presets. |
| **Agent Mounts Engine** | `scripts/` | Rebuilds Windows directory junctions or Unix symlinks pointing to `.agents/skills`. | Ensures cross-agent skill discovery without duplicate file copies or agent lock-in. |

## License

MIT — see [LICENSE](LICENSE).
