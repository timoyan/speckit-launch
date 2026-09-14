---
name: new-project
description: >-
  Launch a new Spec Kit project with mainstream AI agent integrations
  (Copilot, Claude, Cursor, Gemini, Grok, Codex, Antigravity) and shared skill mounts.
  Use when the user asks to open/create/launch a new project, bootstrap Spec Kit,
  or run new-project / speckit-launch.
---

# New Project (Spec Kit launcher)

## When to use

User wants a **new project** or to **bootstrap Spec Kit** in an empty/existing folder, on any OS, with any Spec Kit–supported coding agent.

## Locate the launcher

Do **not** hardcode a machine-specific path. Resolve the CLI in this order:

1. `SPECKIT_STARTER` env var → `$SPECKIT_STARTER/bin/new-project.mjs` (path to a `speckit-launch` clone)
2. Path the user gives in the conversation
3. `npx speckit-launch` if the package is published / linked
4. Ask the user where they cloned this repo

```bash
node <path-to-speckit-launch>/bin/new-project.mjs <name>
```

Do **not** re-implement `specify init` by hand.

## Defaults

By default the launcher installs mainstream integrations:

`copilot`, `claude`, `cursor-agent`, `gemini`, `grok`, `codex`, `agy`

Do **not** ask the user for `--ai`. Only pass `--only <integration>` if they explicitly want a single agent.

## Variants

| Intent | Command |
|--------|---------|
| New folder under cwd | `node <launcher>/bin/new-project.mjs <name>` |
| Init current / empty repo | `node <launcher>/bin/new-project.mjs --here` |
| Custom parent dir | `node <launcher>/bin/new-project.mjs <name> --dir <parent>` |
| Single agent only | add `--only copilot\|claude\|gemini\|grok\|cursor-agent\|codex\|…` |
| Force script type | add `--script sh\|ps\|py` (default: `ps` on Windows, `sh` elsewhere) |
| Skip git | add `--no-git` (also skips the Spec Kit git extension) |

Ask for `<name>` if missing (kebab-case or simple identifier). Confirm the target path before running if the user did not give an absolute path.

## After success

Tell the user:

1. Open the project in any of the installed agents
2. Run `/speckit-constitution` for **this** project's principles (do not copy another project's constitution; keep the seeded pipeline principle)
3. Then `/speckit-specify` — that starts the chained run:
   `specify → clarify → plan → tasks → analyze → implement` (then stop; `/speckit-converge` is manual after code review)
   Unless the project was created with `--no-git`, specify creates and checks out a feature branch first (Spec Kit git extension `before_specify` hook). Pause after clarify/analyze only when issues remain; do not add extra “does this plan look OK?” gates.
4. To open role panes, the user runs `node scripts/start-herdr-roles.mjs --kind <agent>`. Do not auto-start panes as part of the Spec Kit chain. After implement, if matching named agents are already live in Herdr, the coordinator prompts them (checker then reviewer; implementer only for Blocking). It does not pick which panes to start from the diff.

## Do not

- Do not install integrations one-by-one manually; the launcher already multi-installs the mainstream set
- Do not copy another project's `constitution.md`
- Do not scaffold a full app tech stack unless the user asked separately
