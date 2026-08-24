# speckit-launch

One command to launch a [GitHub Spec Kit](https://github.com/github/spec-kit) project with **mainstream AI agent integrations** and a shared canonical `.agents/skills` tree.

Works on **Windows, macOS, and Linux**. Not locked to one coding agent or OS.

## Why

Official init sets up **one** agent:

```bash
specify init <name> --integration copilot --script sh --non-interactive
```

This launcher installs the mainstream set in one step, consolidates `speckit-*` skills into `.agents/skills`, creates junction/symlink mounts, and updates `.gitignore`.

## Prerequisites

- [Node.js](https://nodejs.org/) (18+)
- [`specify`](https://github.com/github/spec-kit) on `PATH`, or [`uv`](https://docs.astral.sh/uv/) (the CLI installs `specify-cli` via `uv tool install` if needed)
- `git` (unless you pass `--no-git`)

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
5. Writes `.agents/skills.json` and `.agents/AGENTS.md`
6. Copies and runs `scripts/link-agent-skills.mjs` (Windows junction / Unix symlink)
7. Merges skill-mount rules into `.gitignore`

It does **not** copy another project's constitution. After bootstrap, run `/speckit-constitution` in the new project.

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
  skill/new-project/SKILL.md
  package.json
  LICENSE
  README.md
```

## License

MIT — see [LICENSE](LICENSE).
