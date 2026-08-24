#!/usr/bin/env node
/**
 * Bootstrap a new Spec Kit project with mainstream AI agent integrations
 * and cross-agent skill mounts (canonical copy in .agents/skills).
 *
 * Usage:
 *   node bin/new-project.mjs <name>              # create ./<name> under cwd
 *   node bin/new-project.mjs <name> --dir <path> # create under --dir
 *   node bin/new-project.mjs --here              # init current directory
 *
 * Flags:
 *   --here              Initialize in cwd (or --dir if set)
 *   --dir <path>        Parent directory for <name>, or target when --here
 *   --only <integration> Install only this Spec Kit integration (skip multi-agent)
 *   --script sh|ps|py   Script type (default: ps on Windows, sh elsewhere)
 *   --no-git            Skip git init
 *   --help              Show help
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const STARTER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES = join(STARTER_ROOT, "templates");
const DEFAULT_SCRIPT = process.platform === "win32" ? "ps" : "sh";

/** Mainstream agents installed by default (no --ai required). */
const MAINSTREAM_INTEGRATIONS = [
  "copilot",
  "claude",
  "cursor-agent",
  "gemini",
  "grok",
  "codex",
];

/**
 * Skill directories created by integrations. After init we keep one canonical
 * tree at .agents/skills and junction/symlink the rest.
 */
const SKILL_SCAN_DIRS = [
  ".agents/skills",
  ".github/skills",
  ".claude/skills",
  ".cursor/skills",
  ".grok/skills",
  ".codex/skills",
];

/** Mounts recreated by link-agent-skills.mjs (not including canonical). */
const SKILL_MOUNT_DIRS = [
  ".github/skills",
  ".claude/skills",
  ".cursor/skills",
  ".grok/skills",
  ".codex/skills",
];

function defaultScript() {
  return DEFAULT_SCRIPT;
}

function usage() {
  console.log(`Usage:
  node bin/new-project.mjs <name> [--dir <parent>] [--script sh|ps|py] [--only <integration>] [--no-git]
  node bin/new-project.mjs --here [--dir <path>] [--script sh|ps|py] [--only <integration>] [--no-git]

Default: install mainstream integrations (${MAINSTREAM_INTEGRATIONS.join(", ")})
Default parent for <name>: current working directory
Default --script: ${defaultScript()} (win32=ps, else sh)
--only <integration>: install a single Spec Kit integration instead of all mainstream`);
}

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = {
    name: null,
    here: false,
    dir: null,
    only: null,
    script: null,
    noGit: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--here") opts.here = true;
    else if (a === "--no-git") opts.noGit = true;
    else if (a === "--dir") {
      opts.dir = argv[++i];
      if (!opts.dir) die("--dir requires a path");
    } else if (a === "--only") {
      opts.only = argv[++i];
      if (!opts.only) die("--only requires an integration name (e.g. claude)");
    } else if (a === "--ai") {
      // Backward-compatible alias: treat as --only (single-agent mode)
      opts.only = argv[++i];
      if (!opts.only) die("--ai requires an integration name (alias of --only)");
      console.warn("warn: --ai is deprecated; use --only for single-agent installs (default installs all mainstream agents)");
    } else if (a === "--script") {
      opts.script = argv[++i];
      if (!opts.script) die("--script requires sh|ps|py");
    } else if (a.startsWith("-")) {
      die(`Unknown flag: ${a}\n`);
    } else if (!opts.name) {
      opts.name = a;
    } else {
      die(`Unexpected argument: ${a}`);
    }
  }

  if (opts.only != null && !/^[a-z][a-z0-9-]*$/.test(opts.only)) {
    die(`--only must be a lowercase integration key (got ${opts.only})`);
  }

  if (opts.script == null) opts.script = defaultScript();
  if (!["sh", "ps", "py"].includes(opts.script)) {
    die(`--script must be sh, ps, or py (got ${opts.script})`);
  }

  return opts;
}

function which(cmd) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], {
    encoding: "utf8",
    shell: false,
  });
  return r.status === 0 && r.stdout.trim().length > 0;
}

function run(cmd, args, cwd) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  let r = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (r.error && r.error.code === "ENOENT" && process.platform === "win32") {
    r = spawnSync(cmd, args, {
      cwd,
      stdio: "inherit",
      shell: true,
      env: process.env,
    });
  }
  if (r.error) die(`Failed to run ${cmd}: ${r.error.message}`);
  if (r.status !== 0) die(`${cmd} exited with ${r.status}`);
}

function ensureSpecify() {
  if (which("specify")) return;
  if (!which("uv")) {
    die(
      "Neither `specify` nor `uv` found on PATH.\nInstall uv: https://docs.astral.sh/uv/\nThen: uv tool install specify-cli",
    );
  }
  console.log("specify not found; installing specify-cli via uv…");
  run("uv", ["tool", "install", "specify-cli"]);
  if (!which("specify")) {
    die("specify still not on PATH after uv tool install. Restart the shell or add ~/.local/bin to PATH.");
  }
}

function isGitRepo(dir) {
  return existsSync(join(dir, ".git"));
}

function listSpeckitSkillDirs(skillsRoot) {
  if (!existsSync(skillsRoot)) return [];
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("speckit-"))
    .map((d) => d.name);
}

function integrationsToInstall(opts) {
  if (opts.only) return [opts.only];
  return [...MAINSTREAM_INTEGRATIONS];
}

function installIntegrations(projectRoot, keys, script) {
  const [primary, ...rest] = keys;
  run(
    "specify",
    [
      "init",
      "--here",
      "--force",
      "--integration",
      primary,
      "--script",
      script,
      "--non-interactive",
      "--ignore-agent-tools",
    ],
    projectRoot,
  );

  for (const key of rest) {
    run(
      "specify",
      ["integration", "install", key, "--force", "--script", script],
      projectRoot,
    );
  }
}

function moveSpeckitSkills(projectRoot) {
  const canonical = join(projectRoot, ".agents", "skills");
  mkdirSync(canonical, { recursive: true });

  const candidates = SKILL_SCAN_DIRS.map((rel) =>
    join(projectRoot, ...rel.split("/")),
  );

  const seen = new Set();
  let moved = 0;

  for (const srcRoot of candidates) {
    if (!existsSync(srcRoot)) continue;
    const names = listSpeckitSkillDirs(srcRoot);
    for (const name of names) {
      const from = join(srcRoot, name);
      const to = join(canonical, name);

      if (resolve(from) === resolve(to)) {
        seen.add(name);
        continue;
      }

      if (seen.has(name)) {
        // Duplicate from another integration — drop it; canonical already has it
        rmSync(from, { recursive: true, force: true });
        console.log(`removed duplicate ${name} from ${srcRoot}`);
        continue;
      }

      seen.add(name);
      if (existsSync(to)) {
        rmSync(to, { recursive: true, force: true });
      }
      renameSync(from, to);
      moved++;
      console.log(`moved ${name} -> .agents/skills/`);
    }
  }

  if (moved === 0 && listSpeckitSkillDirs(canonical).length === 0) {
    die(
      "No speckit-* skills found after specify init. Check specify version / integrations.",
    );
  }

  // Clear leftover agent skill dirs so link script can recreate mounts
  for (const rel of SKILL_MOUNT_DIRS) {
    const p = join(projectRoot, ...rel.split("/"));
    if (!existsSync(p)) continue;
    if (resolve(p) === resolve(canonical)) continue;
    try {
      const left = readdirSync(p);
      if (left.length === 0) {
        rmSync(p, { recursive: true, force: true });
      } else {
        // Remaining non-speckit files — leave; link script will error if so
        console.warn(`warn: ${rel} still has files: ${left.join(", ")}`);
      }
    } catch {
      /* ignore */
    }
  }
}

function mergeGitignore(projectRoot) {
  const fragmentPath = join(TEMPLATES, "gitignore.fragment");
  const fragment = readFileSync(fragmentPath, "utf8").trimEnd() + "\n";
  const gitignorePath = join(projectRoot, ".gitignore");
  let existing = "";
  if (existsSync(gitignorePath)) {
    existing = readFileSync(gitignorePath, "utf8");
  }

  const marker = "# Per-agent skill mounts (canonical copy is .agents/skills only)";
  if (existing.includes(marker) || existing.includes(".grok/skills/")) {
    console.log(".gitignore already has skill-mount rules; skipping merge");
    return;
  }

  const sep = existing && !existing.endsWith("\n") ? "\n\n" : existing ? "\n" : "";
  writeFileSync(gitignorePath, existing + sep + fragment, "utf8");
  console.log("merged Spec Kit / skill-mount rules into .gitignore");
}

function writeAgentsFiles(projectRoot) {
  const agentsDir = join(projectRoot, ".agents");
  mkdirSync(agentsDir, { recursive: true });

  const skillsJson = join(agentsDir, "skills.json");
  if (!existsSync(skillsJson)) {
    copyFileSync(join(TEMPLATES, "skills.json"), skillsJson);
    console.log("wrote .agents/skills.json");
  }

  const agentsMd = join(agentsDir, "AGENTS.md");
  if (!existsSync(agentsMd)) {
    copyFileSync(join(TEMPLATES, "AGENTS.md"), agentsMd);
    console.log("wrote .agents/AGENTS.md");
  }
}

function copyLinkScript(projectRoot) {
  const scriptsDir = join(projectRoot, "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  const dest = join(scriptsDir, "link-agent-skills.mjs");
  copyFileSync(join(STARTER_ROOT, "scripts", "link-agent-skills.mjs"), dest);
  console.log("copied scripts/link-agent-skills.mjs");
}

function runLinkScript(projectRoot) {
  run(process.execPath, [join(projectRoot, "scripts", "link-agent-skills.mjs")], projectRoot);
}

function resolveProjectDir(opts) {
  if (opts.here) {
    const target = opts.dir ? resolve(opts.dir) : process.cwd();
    mkdirSync(target, { recursive: true });
    return target;
  }
  if (!opts.name) {
    usage();
    die("Project name required (or use --here)");
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(opts.name)) {
    die(`Invalid project name: ${opts.name}`);
  }
  const parent = opts.dir ? resolve(opts.dir) : process.cwd();
  mkdirSync(parent, { recursive: true });
  const target = join(parent, opts.name);
  if (existsSync(target) && readdirSync(target).length > 0) {
    const entries = readdirSync(target).filter((e) => e !== ".git");
    if (entries.length > 0) {
      die(`Target already exists and is not empty: ${target}`);
    }
  }
  mkdirSync(target, { recursive: true });
  return target;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    process.exit(0);
  }

  const keys = integrationsToInstall(opts);
  const projectRoot = resolveProjectDir(opts);
  console.log(`Project root: ${projectRoot}`);
  console.log(`Integrations: ${keys.join(", ")}`);
  console.log(`Script: ${opts.script}`);

  ensureSpecify();

  if (!opts.noGit && !isGitRepo(projectRoot)) {
    run("git", ["init"], projectRoot);
  }

  installIntegrations(projectRoot, keys, opts.script);
  moveSpeckitSkills(projectRoot);
  writeAgentsFiles(projectRoot);
  copyLinkScript(projectRoot);
  runLinkScript(projectRoot);
  mergeGitignore(projectRoot);

  console.log(`
Done. Spec Kit project ready at:
  ${projectRoot}

Installed integrations:
  ${keys.join(", ")}

Next steps:
  1. Open the project in any of the installed coding agents
  2. Run /speckit-constitution  (set THIS project's principles)
  3. Run /speckit-specify       (describe what to build)

After clone on another machine:
  node scripts/link-agent-skills.mjs

Re-launch later:
  node ${join(STARTER_ROOT, "bin", "new-project.mjs")} <name>
`);
}

main();
