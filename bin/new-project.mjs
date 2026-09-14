#!/usr/bin/env node
/**
 * Bootstrap a new Spec Kit project with mainstream AI agent integrations,
 * cross-agent skill mounts (canonical copy in .agents/skills), and the
 * chained Spec Kit pipeline (specify → clarify → plan → tasks → analyze →
 * implement; stop for code review before converge).
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
 *   --no-git            Skip git init and the Spec Kit git extension
 *   --help              Show help
 *
 *   node bin/new-project.mjs upgrade [--apply] [--dry-run] [--dir <path>]
 *     Refresh launcher-owned layer 2 files. Default is dry-run (no writes).
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const STARTER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES = join(STARTER_ROOT, "templates");
const IS_WINDOWS = process.platform === "win32";
const DEFAULT_SCRIPT = IS_WINDOWS ? "ps" : "sh";

function readText(filePath) {
  return readFileSync(filePath, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function writeText(filePath, content) {
  writeFileSync(filePath, String(content).replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
}

function copyTextFile(from, to) {
  writeText(to, readText(from));
}

function safeRealpath(p) {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

function pathsEqual(a, b) {
  const na = safeRealpath(a).replace(/\\/g, "/");
  const nb = safeRealpath(b).replace(/\\/g, "/");
  return IS_WINDOWS ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

const AGENT_INTEGRATIONS = [
  { key: "agy", name: "Antigravity", bin: "agy", fallback: "antigravity" },
  { key: "claude", name: "Claude Code", bin: "claude" },
  { key: "cursor-agent", name: "Cursor", bin: "cursor-agent", fallback: "cursor" },
  { key: "copilot", name: "GitHub Copilot", bin: "copilot", fallback: "github-copilot-cli" },
  { key: "gemini", name: "Gemini CLI", bin: "gemini" },
  { key: "grok", name: "Grok Build", bin: "grok" },
  { key: "codex", name: "Codex CLI", bin: "codex" },
];

/** Mainstream agents installed by default (no --ai required). */
const MAINSTREAM_INTEGRATIONS = AGENT_INTEGRATIONS.map((a) => a.key);

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
  node bin/new-project.mjs <name> [--dir <parent>] [--primary <agent>] [--script sh|ps|py] [--only <agent>] [--no-git] [--non-interactive]
  node bin/new-project.mjs --here [--dir <path>] [--primary <agent>] [--script sh|ps|py] [--only <agent>] [--no-git] [--non-interactive]
  node bin/new-project.mjs upgrade [--apply] [--dry-run] [--dir <path>]

Default: install mainstream integrations (${MAINSTREAM_INTEGRATIONS.join(", ")})
Default parent for <name>: current working directory
Default --script: ${defaultScript()} (win32=ps, else sh)
--primary <integration>: set primary/default AI agent (e.g. agy, claude, cursor-agent)
--only <integration>: install a single Spec Kit integration instead of all mainstream
--non-interactive: skip interactive prompts and use auto-detected defaults
--no-git: skip git init and the Spec Kit git extension (no feature-branch hook)
upgrade: refresh launcher-owned layer 2 files in an existing Spec Kit project.
  Default is dry-run (print same / update / skip, write nothing). --apply writes.
  --dry-run is the explicit form of the default. --dir defaults to cwd.
  Do not use --here as an upgrade path.
--version, -v: print version
--help, -h: show usage`);
}

function upgradeUsage() {
  console.log(`Usage:
  node bin/new-project.mjs upgrade [--apply] [--dry-run] [--dir <path>]

Refresh launcher-owned layer 2 files in an existing Spec Kit project.
Default: print a plan (same / update / skip / add) and write nothing.
--apply: write allowlisted files
--dry-run: explicit form of the default (no writes)
--dir <path>: target project (default: current directory)

Fails if the target has no .specify/ (not a Spec Kit project).
Supported Spec Kit: >=1.0.0 <2.0.0 (last smoke-tested 1.0.4).
Below 1.0.0 or at/above 2.0.0, init and upgrade fail.
A newer 1.x than 1.0.4 warns and continues.
Optional process starters and agent-roles/*.md are copied only when missing.
Upgrade reads .specify/init-options.json speckit_version; missing specify on PATH warns and continues.
Does not run specify init, does not seed constitution, and does not overwrite
optional process starters that already exist.`);
}

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

/** Overlay step ids and `.specify/workflows/overlays/` are a Spec Kit 1.0 contract. */
const SPECKIT_VERSION_SUPPORT = {
  min: "1.0.0",
  tested: "1.0.4",
  maxExclusive: "2.0.0",
};

const OVERLAY_STEP_IDS = "specify, review-spec, plan, review-plan, tasks, implement";

function speckitRangeLabel() {
  const { min, maxExclusive } = SPECKIT_VERSION_SUPPORT;
  return `>=${min} <${maxExclusive}`;
}

function parseSpeckitVersion(input) {
  const m = String(input ?? "").match(/(\d+)\.(\d+)\.(\d+)([.-][0-9A-Za-z.-]+)?/);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    raw: `${m[1]}.${m[2]}.${m[3]}`,
    display: `${m[1]}.${m[2]}.${m[3]}${m[4] || ""}`,
  };
}

function cmpSpeckitVersion(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function assessSpeckitVersion(input) {
  const parsed =
    input && typeof input === "object" && "major" in input ? input : parseSpeckitVersion(input);
  const range = speckitRangeLabel();
  if (!parsed) {
    const shown = String(input ?? "").trim().slice(0, 80) || "(empty)";
    return {
      level: "warn",
      code: "unparsed",
      message: `could not parse Spec Kit version from "${shown}". Supported range is ${range}. Continuing.`,
    };
  }
  const min = parseSpeckitVersion(SPECKIT_VERSION_SUPPORT.min);
  const tested = parseSpeckitVersion(SPECKIT_VERSION_SUPPORT.tested);
  const max = parseSpeckitVersion(SPECKIT_VERSION_SUPPORT.maxExclusive);
  const label = parsed.display || parsed.raw;
  if (cmpSpeckitVersion(parsed, min) < 0) {
    return {
      level: "error",
      code: "too-old",
      message: `${label} is older than ${SPECKIT_VERSION_SUPPORT.min}. Supported range is ${range}. Overlay step ids (${OVERLAY_STEP_IDS}) and .specify/workflows/overlays/ need Spec Kit 1.0+.`,
    };
  }
  if (cmpSpeckitVersion(parsed, max) >= 0) {
    return {
      level: "error",
      code: "too-new",
      message: `${label} is outside ${range} (last smoke-tested ${SPECKIT_VERSION_SUPPORT.tested}). Refusing so a 1.0 overlay is not written onto an untested major. After verifying step ids (${OVERLAY_STEP_IDS}), raise SPECKIT_VERSION_SUPPORT.maxExclusive in bin/new-project.mjs.`,
    };
  }
  if (cmpSpeckitVersion(parsed, tested) > 0) {
    return {
      level: "warn",
      code: "newer-than-tested",
      message: `${label} is newer than the last smoke-tested ${SPECKIT_VERSION_SUPPORT.tested} (still within ${range}). Continuing. If workflow resolve drops clarify/analyze/converge, overlay step ids changed.`,
    };
  }
  return { level: "ok", code: "ok", message: "" };
}

function readCliSpeckitVersion() {
  if (!which("specify")) return { present: false, source: "CLI" };
  const text = specifyCliOutput(specifyCli(["--version"]));
  const parsed = parseSpeckitVersion(text);
  return {
    present: true,
    source: "CLI",
    display: parsed?.display ?? text.trim().slice(0, 80),
    parsed,
  };
}

function readProjectSpeckitVersion(projectRoot) {
  const path = join(projectRoot, ".specify", "init-options.json");
  if (!existsSync(path)) return { present: false, source: "project" };
  let field;
  try {
    field = JSON.parse(readText(path))?.speckit_version;
  } catch {
    return { present: true, source: "project", display: "", parsed: null };
  }
  if (field == null || field === "") return { present: false, source: "project" };
  const parsed = parseSpeckitVersion(String(field));
  return { present: true, source: "project", display: String(field), parsed };
}

function enforceSpeckitVersion({ projectRoot, requireCli = false } = {}) {
  const cli = readCliSpeckitVersion();
  const project = projectRoot ? readProjectSpeckitVersion(projectRoot) : { present: false };
  if (requireCli && !cli.present) {
    die(
      `Could not run \`specify --version\`. Install Spec Kit ${speckitRangeLabel()} (last smoke-tested ${SPECKIT_VERSION_SUPPORT.tested}).`,
    );
  }
  const checks = [cli, project].filter((c) => c.present);
  if (checks.length === 0) {
    console.warn(
      `warn: could not read Spec Kit version (no \`specify --version\` and no .specify/init-options.json speckit_version). Supported range is ${speckitRangeLabel()}. Continuing.`,
    );
    return { level: "warn" };
  }
  if (cli.parsed && project.parsed && cli.parsed.raw !== project.parsed.raw) {
    console.warn(
      `warn: PATH specify is ${cli.display} but .specify/init-options.json speckit_version is ${project.display}. The overlay is composed against the installed workflow.yml, not only the CLI.`,
    );
  }
  const errors = [];
  for (const check of checks) {
    const result = assessSpeckitVersion(check.parsed ?? check.display);
    if (result.level === "error") errors.push(`${check.source}: ${result.message}`);
    else if (result.level === "warn") console.warn(`warn: ${check.source}: ${result.message}`);
  }
  if (errors.length) die(errors.join("\n"));
  return { level: "ok" };
}

function parseArgs(argv) {
  const opts = {
    name: null,
    here: false,
    dir: null,
    only: null,
    primary: null,
    nonInteractive: false,
    script: null,
    noGit: false,
    help: false,
    version: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--version" || a === "-v") opts.version = true;
    else if (a === "--here") opts.here = true;
    else if (a === "--no-git") opts.noGit = true;
    else if (a === "--non-interactive") opts.nonInteractive = true;
    else if (a === "--dir") {
      opts.dir = argv[++i];
      if (!opts.dir) die("--dir requires a path");
    } else if (a === "--primary" || a === "--default") {
      opts.primary = argv[++i];
      if (!opts.primary) die(`${a} requires an integration name (e.g. agy)`);
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

  if (opts.primary != null && !/^[a-z][a-z0-9-]*$/.test(opts.primary)) {
    die(`--primary must be a lowercase integration key (got ${opts.primary})`);
  }

  if (opts.script == null) opts.script = defaultScript();
  if (!["sh", "ps", "py"].includes(opts.script)) {
    die(`--script must be sh, ps, or py (got ${opts.script})`);
  }

  return opts;
}

function which(cmd) {
  const bin = IS_WINDOWS ? "where" : "which";
  let r = spawnSync(bin, [cmd], { encoding: "utf8", shell: false });
  if (r.error && r.error.code === "ENOENT" && IS_WINDOWS) {
    r = spawnSync(bin, [cmd], { encoding: "utf8", shell: true });
  }
  return r.status === 0 && (r.stdout || "").trim().length > 0;
}

function getDetectedAgentMap() {
  const map = new Map();
  for (const agent of AGENT_INTEGRATIONS) {
    if (which(agent.bin) || (agent.fallback && which(agent.fallback))) {
      map.set(agent.key, agent.name);
    }
  }
  return map;
}

function detectAvailableAgentTools() {
  return Array.from(getDetectedAgentMap().values());
}

async function selectPrimaryIntegration(projectRoot, opts, detectedMap = getDetectedAgentMap()) {
  // 1. Explicit CLI flag takes highest priority
  if (opts.only) return opts.only;
  if (opts.primary) return opts.primary;

  // 2. Existing project configuration
  const integrationJsonPath = join(projectRoot, ".specify", "integration.json");
  const initOptionsJsonPath = join(projectRoot, ".specify", "init-options.json");
  try {
    if (existsSync(integrationJsonPath)) {
      const data = JSON.parse(readText(integrationJsonPath));
      if (data.default_integration || data.integration) {
        return data.default_integration || data.integration;
      }
    } else if (existsSync(initOptionsJsonPath)) {
      const data = JSON.parse(readText(initOptionsJsonPath));
      if (data.integration || data.ai) {
        return data.integration || data.ai;
      }
    }
  } catch {
    /* ignore */
  }

  // 3. Recommended default: first detected agent CLI on PATH, or agy
  const firstDetected = AGENT_INTEGRATIONS.find((a) => detectedMap.has(a.key))?.key || "agy";

  // 4. Interactive prompt if running in interactive terminal
  if (process.stdin.isTTY && !opts.nonInteractive) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      console.log("\nSelect your primary AI agent (default integration for Spec Kit):");
      AGENT_INTEGRATIONS.forEach((agent, idx) => {
        const isDetected = detectedMap.has(agent.key);
        const detectedTag = isDetected ? " [Detected on PATH]" : "";
        const defaultTag = agent.key === firstDetected ? " (Recommended)" : "";
        console.log(`  [${idx + 1}] ${agent.key.padEnd(14)} - ${agent.name}${detectedTag}${defaultTag}`);
      });
      const defaultIdx = AGENT_INTEGRATIONS.findIndex((a) => a.key === firstDetected) + 1;
      const answer = await rl.question(`\nChoose primary agent [1-${AGENT_INTEGRATIONS.length}] (default: ${defaultIdx} [${firstDetected}]): `);
      const trimmed = answer.trim().toLowerCase();
      if (!trimmed) {
        return firstDetected;
      }
      const num = parseInt(trimmed, 10);
      if (!isNaN(num) && num >= 1 && num <= AGENT_INTEGRATIONS.length) {
        return AGENT_INTEGRATIONS[num - 1].key;
      }
      const matched = AGENT_INTEGRATIONS.find((a) => a.key.toLowerCase() === trimmed);
      if (matched) {
        return matched.key;
      }
      console.log(`Unknown selection "${answer}". Defaulting to ${firstDetected}`);
      return firstDetected;
    } finally {
      rl.close();
    }
  }

  return firstDetected;
}


function run(cmd, args, cwd) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  let r = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (r.error && r.error.code === "ENOENT" && IS_WINDOWS) {
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

function integrationsToInstall(opts, primaryIntegration) {
  if (opts.only) return [opts.only];
  const list = [...MAINSTREAM_INTEGRATIONS];
  if (primaryIntegration && list.includes(primaryIntegration)) {
    return [primaryIntegration, ...list.filter((k) => k !== primaryIntegration)];
  }
  return list;
}

function buildSpecifyInitArgs(integration, script, { noGit = false } = {}) {
  const args = [
    "init",
    "--here",
    "--force",
    "--integration",
    integration,
    "--script",
    script,
    "--non-interactive",
    "--ignore-agent-tools",
  ];
  // Spec Kit 1.0+ does not create a feature branch unless the git extension
  // registers hooks.before_specify → speckit.git.feature. --no-git skips it.
  if (!noGit) {
    args.push("--extension", "git");
  }
  return args;
}

function gitExtensionInstalled(projectRoot) {
  const extYml = join(projectRoot, ".specify", "extensions.yml");
  if (!existsSync(extYml)) return false;
  return readText(extYml).includes("speckit.git.feature");
}

function ensureGitExtension(projectRoot, noGit) {
  if (noGit) {
    console.log("skipped Spec Kit git extension (--no-git)");
    return;
  }
  if (gitExtensionInstalled(projectRoot)) {
    console.log("installed Spec Kit git extension (specify creates a feature branch)");
    return;
  }
  console.log("git extension missing after init; installing with specify extension add git…");
  run("specify", ["extension", "add", "git"], projectRoot);
  if (!gitExtensionInstalled(projectRoot)) {
    die("specify extension add git did not register speckit.git.feature");
  }
  console.log("installed Spec Kit git extension (specify creates a feature branch)");
}

function installIntegrations(projectRoot, keys, script, primaryIntegration, { noGit = false } = {}) {
  let order = [...keys];
  const primary = primaryIntegration || order[0];
  if (order.includes(primary)) {
    order = [primary, ...order.filter((k) => k !== primary)];
  }

  const [firstKey, ...rest] = order;
  run("specify", buildSpecifyInitArgs(firstKey, script, { noGit }), projectRoot);

  for (const key of rest) {
    const r = specifyCli(
      ["integration", "install", key, "--force", "--script", script],
      projectRoot,
    );
    if (r.status === 0) {
      console.log(`installed integration ${key}`);
    } else {
      const out = specifyCliOutput(r);
      if (/unknown integration/i.test(out)) {
        console.warn(
          `warn: specify CLI does not support '${key}' yet (upstream pending; skills remain available via .agents/skills)`,
        );
      } else {
        die(`specify integration install ${key} failed: ${out}`);
      }
    }
  }

  const integrationJsonPath = join(projectRoot, ".specify", "integration.json");
  const initOptionsJsonPath = join(projectRoot, ".specify", "init-options.json");
  try {
    if (existsSync(integrationJsonPath)) {
      const data = JSON.parse(readText(integrationJsonPath));
      data.default_integration = primary;
      data.integration = primary;
      writeText(integrationJsonPath, JSON.stringify(data, null, 2) + "\n");
    }
    if (existsSync(initOptionsJsonPath)) {
      const data = JSON.parse(readText(initOptionsJsonPath));
      data.integration = primary;
      data.ai = primary;
      writeText(initOptionsJsonPath, JSON.stringify(data, null, 2) + "\n");
    }
  } catch {
    /* ignore */
  }

  ensureGitExtension(projectRoot, noGit);
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
    if (pathsEqual(srcRoot, canonical)) continue;
    const names = listSpeckitSkillDirs(srcRoot);
    for (const name of names) {
      const from = join(srcRoot, name);
      const to = join(canonical, name);

      if (pathsEqual(from, to)) {
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
    if (pathsEqual(p, canonical)) continue;
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

function adaptSkillScript(content, scriptType = "ps") {
  if (scriptType === "sh") {
    return content
      .replace(
        /\.specify\/scripts\/powershell\/check-prerequisites\.ps1/g,
        ".specify/scripts/bash/check-prerequisites.sh",
      )
      .replace(/ -Json\b/g, " --json")
      .replace(/ -PathsOnly\b/g, " --paths-only")
      .replace(/ -RequireSpec\b/g, " --require-spec")
      .replace(/ -RequireTasks\b/g, " --require-tasks")
      .replace(/ -IncludeTasks\b/g, " --include-tasks");
  }
  if (scriptType === "py") {
    return content
      .replace(
        /\.specify\/scripts\/powershell\/check-prerequisites\.ps1/g,
        "python .specify/scripts/python/check_prerequisites.py",
      )
      .replace(/ -Json\b/g, " --json")
      .replace(/ -PathsOnly\b/g, " --paths-only")
      .replace(/ -RequireSpec\b/g, " --require-spec")
      .replace(/ -RequireTasks\b/g, " --require-tasks")
      .replace(/ -IncludeTasks\b/g, " --include-tasks");
  }
  return content;
}

function mergeGitignore(projectRoot) {
  const fragmentPath = join(TEMPLATES, "gitignore.fragment");
  const fragment = readText(fragmentPath).trimEnd() + "\n";
  const gitignorePath = join(projectRoot, ".gitignore");
  let existing = "";
  if (existsSync(gitignorePath)) {
    existing = readText(gitignorePath);
  }

  const marker = "# Per-agent skill mounts (canonical copy is .agents/skills only)";
  if (existing.includes(marker) || existing.includes(".grok/skills/")) {
    console.log(".gitignore already has skill-mount rules; skipping merge");
    return;
  }

  const sep = existing && !existing.endsWith("\n") ? "\n\n" : existing ? "\n" : "";
  writeText(gitignorePath, existing + sep + fragment);
  console.log("merged Spec Kit / skill-mount rules into .gitignore");
}

const GITATTRIBUTES_LF_MARKER = "# speckit-launch: line endings";
const GITATTRIBUTES_TEXT_MARKER = "# speckit-launch: text and binary";

function mergeGitattributes(projectRoot) {
  const fragmentPath = join(TEMPLATES, "gitattributes.fragment");
  if (!existsSync(fragmentPath)) return;
  const fragment = readText(fragmentPath).trimEnd() + "\n";
  const textBinaryAt = fragment.indexOf(GITATTRIBUTES_TEXT_MARKER);
  const textBinary = textBinaryAt >= 0 ? fragment.slice(textBinaryAt) : "";
  const dest = join(projectRoot, ".gitattributes");
  if (!existsSync(dest)) {
    writeText(dest, fragment);
    console.log("wrote .gitattributes (LF line endings)");
    return;
  }
  const existing = readText(dest);
  const hasLf = existing.includes(GITATTRIBUTES_LF_MARKER) || existing.includes("eol=lf");
  const hasText = !textBinary || existing.includes(GITATTRIBUTES_TEXT_MARKER);
  if (hasLf && hasText) {
    console.log(".gitattributes already has LF rules; skipping merge");
    return;
  }
  const addition = !hasLf ? fragment : textBinary;
  const sep = existing.endsWith("\n") ? "\n" : "\n\n";
  writeText(dest, existing.trimEnd() + sep + addition);
  console.log("merged line-ending rules into .gitattributes");
}

function copyIfMissing(src, dest) {
  if (!existsSync(src) || existsSync(dest)) return false;
  mkdirSync(dirname(dest), { recursive: true });
  copyTextFile(src, dest);
  return true;
}

const PROCESS_RULES = [
  { name: "changelog", description: "Every main landing must update CHANGELOG.md" },
  { name: "commit-checks", description: "Every git commit must pass this repo's format, typecheck, and related tests" },
  { name: "shell-encoding", description: "Windows PowerShell UTF-8 writing rules (avoid mojibake in CHANGELOG and docs)" },
];

const AGENT_ROLE_FILES = ["react-reviewer.md", "react-implementer.md", "react-checker.md"];

function cursorAlwaysApplyRule(description, body) {
  return `---\ndescription: ${description}\nalwaysApply: true\n---\n\n${body.trim()}\n`;
}

function writeProcessRules(projectRoot) {
  for (const rule of PROCESS_RULES) {
    const src = join(TEMPLATES, "rules", `${rule.name}.md`);
    if (!existsSync(src)) continue;
    const body = readText(src);
    const agentsDest = join(projectRoot, ".agents", "rules", `${rule.name}.md`);
    if (copyIfMissing(src, agentsDest)) {
      console.log(`wrote .agents/rules/${rule.name}.md`);
    }
    const cursorDest = join(projectRoot, ".cursor", "rules", `${rule.name}.mdc`);
    if (!existsSync(cursorDest)) {
      mkdirSync(dirname(cursorDest), { recursive: true });
      writeText(cursorDest, cursorAlwaysApplyRule(rule.description, body));
      console.log(`wrote .cursor/rules/${rule.name}.mdc (Cursor mirror)`);
    }
  }
}

function writeOptionalProcessTemplates(projectRoot) {
  writeProcessRules(projectRoot);
  const copies = [
    [join(TEMPLATES, "skills", "commit-push-pr", "SKILL.md"), join(projectRoot, ".agents", "skills", "commit-push-pr", "SKILL.md"), ".agents/skills/commit-push-pr/SKILL.md"],
    [join(TEMPLATES, "agents", "scripts", "safety-check.cjs"), join(projectRoot, ".agents", "scripts", "safety-check.cjs"), ".agents/scripts/safety-check.cjs"],
    [join(TEMPLATES, "agents", "hooks.json"), join(projectRoot, ".agents", "hooks.json"), ".agents/hooks.json"],
  ];
  for (const [src, dest, label] of copies) {
    if (copyIfMissing(src, dest)) console.log(`wrote ${label}`);
  }
}

const PIPELINE_START = "<!-- speckit-launch:pipeline -->";
const PIPELINE_END = "<!-- /speckit-launch:pipeline -->";
const PIPELINE_MARKER = PIPELINE_START;
const PIPELINE_NEEDLE = "specify → clarify → plan → tasks → analyze";

const LAYER2_SKILLS = [
  "speckit-clarify",
  "speckit-analyze",
  "speckit-implement",
  "speckit-converge",
];

const LAYER2_HELPER_SCRIPTS = ["link-agent-skills.mjs", "new-worktree.mjs", "start-herdr-roles.mjs"];

const AGENT_DOC_CANDIDATES = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".cursorrules",
  ".github/copilot-instructions.md",
];

const AGENT_PIPELINE_POINTER = `## Spec Kit chained pipeline

Canonical rules: \`.agents/AGENTS.md\`. Full run:

\`\`\`
specify → clarify → plan → tasks → analyze → implement
\`\`\`

Stop after implement for code review. Do not start converge until Blocking fixes are done.

Pause after clarify/analyze only when issues remain. A single slash command does not start the chain.
`;

function getPipelineRules() {
  const rulesPath = join(STARTER_ROOT, "presets", "chained-sdd", "rules", "pipeline-rules.md");
  if (existsSync(rulesPath)) {
    return readText(rulesPath).trim();
  }
  return "";
}

function readInitOptionsScript(projectRoot) {
  const path = join(projectRoot, ".specify", "init-options.json");
  if (!existsSync(path)) return null;
  try {
    const script = JSON.parse(readText(path))?.script;
    if (script == null || script === "") return null;
    const normalized = String(script).trim().toLowerCase();
    if (normalized === "sh" || normalized === "ps" || normalized === "py") return normalized;
  } catch {
    /* ignore malformed init-options */
  }
  return null;
}

function detectProjectScriptType(projectRoot) {
  const fromOptions = readInitOptionsScript(projectRoot);
  if (fromOptions) return fromOptions;

  const scripts = join(projectRoot, ".specify", "scripts");
  const hasBash = existsSync(join(scripts, "bash"));
  const hasPwsh = existsSync(join(scripts, "powershell"));
  const hasPy = existsSync(join(scripts, "python"));
  // bash and powershell together must not become sh just because the bash dir exists.
  if (hasBash && hasPwsh) return "ps";
  const present = [hasBash && "sh", hasPwsh && "ps", hasPy && "py"].filter(Boolean);
  if (present.length === 1) return present[0];
  if (present.length === 0) return IS_WINDOWS ? "ps" : "sh";
  const osDefault = IS_WINDOWS ? "ps" : "sh";
  if (present.includes(osDefault)) return osDefault;
  return present.find((script) => script !== "sh") || present[0];
}

function renderPipelineSection(rules) {
  const body = String(rules || "").trim();
  return body
    ? `${PIPELINE_START}\n\n${body}\n\n${PIPELINE_END}`
    : `${PIPELINE_START}\n${PIPELINE_END}`;
}

function replacePipelineSection(text, rules) {
  const start = text.indexOf(PIPELINE_START);
  if (start < 0) {
    return { status: "skip", note: "no pipeline markers", text };
  }
  const end = text.indexOf(PIPELINE_END, start + PIPELINE_START.length);
  if (end < 0) {
    return { status: "skip", note: "pipeline section has no end marker", text };
  }
  const next = text.slice(0, start) + renderPipelineSection(rules) + text.slice(end + PIPELINE_END.length);
  if (next === text) return { status: "same", text: next };
  return { status: "update", text: next };
}

function listFilesRel(rootDir) {
  const out = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile()) out.push(relative(rootDir, abs).replaceAll("\\", "/"));
    }
  }
  walk(rootDir);
  return out.sort();
}

function planTextFile(relPath, destAbs, desired) {
  if (!existsSync(destAbs)) {
    return { status: "update", path: relPath, destAbs, desired };
  }
  if (readText(destAbs) === desired) {
    return { status: "same", path: relPath };
  }
  return { status: "update", path: relPath, destAbs, desired };
}

function planAddIfMissing(relPath, destAbs, desired) {
  if (existsSync(destAbs)) {
    return { status: "skip", path: relPath };
  }
  return { status: "add", path: relPath, destAbs, desired };
}

function formatLayer2Line(action) {
  const note = action.note ? `  ${action.note}` : "";
  return `${action.status}  ${action.path}${note}`;
}

function layer2DesiredFiles(projectRoot, scriptType) {
  const actions = [];
  const presetRoot = join(STARTER_ROOT, "presets", "chained-sdd");

  for (const name of LAYER2_SKILLS) {
    const relPath = `.agents/skills/${name}/SKILL.md`;
    const raw = readText(join(presetRoot, "skills", name, "SKILL.md"));
    actions.push(
      planTextFile(
        relPath,
        join(projectRoot, ...relPath.split("/")),
        adaptSkillScript(raw, scriptType),
      ),
    );
  }

  const pipelineRuleRel = ".cursor/rules/speckit-pipeline.mdc";
  actions.push(
    planTextFile(
      pipelineRuleRel,
      join(projectRoot, ...pipelineRuleRel.split("/")),
      readText(join(presetRoot, "rules", "speckit-pipeline.mdc")),
    ),
  );

  for (const scriptName of LAYER2_HELPER_SCRIPTS) {
    const relPath = `scripts/${scriptName}`;
    actions.push(
      planTextFile(
        relPath,
        join(projectRoot, "scripts", scriptName),
        readText(join(STARTER_ROOT, "scripts", scriptName)),
      ),
    );
  }

  for (const rel of listFilesRel(presetRoot)) {
    const relPath = `.specify/presets/chained-sdd/${rel}`;
    actions.push(
      planTextFile(
        relPath,
        join(projectRoot, ".specify", "presets", "chained-sdd", ...rel.split("/")),
        readText(join(presetRoot, ...rel.split("/"))),
      ),
    );
  }

  return actions;
}

function layer2OptionalFiles(projectRoot) {
  const actions = [];
  for (const rule of PROCESS_RULES) {
    const src = join(TEMPLATES, "rules", `${rule.name}.md`);
    if (!existsSync(src)) continue;
    const body = readText(src);
    const agentsRel = `.agents/rules/${rule.name}.md`;
    actions.push(
      planAddIfMissing(
        agentsRel,
        join(projectRoot, ...agentsRel.split("/")),
        body,
      ),
    );
    const cursorRel = `.cursor/rules/${rule.name}.mdc`;
    actions.push(
      planAddIfMissing(
        cursorRel,
        join(projectRoot, ...cursorRel.split("/")),
        cursorAlwaysApplyRule(rule.description, body),
      ),
    );
  }

  const copies = [
    [
      ".agents/skills/commit-push-pr/SKILL.md",
      join(TEMPLATES, "skills", "commit-push-pr", "SKILL.md"),
    ],
    [
      ".agents/scripts/safety-check.cjs",
      join(TEMPLATES, "agents", "scripts", "safety-check.cjs"),
    ],
    [".agents/hooks.json", join(TEMPLATES, "agents", "hooks.json")],
  ];
  for (const [relPath, src] of copies) {
    if (!existsSync(src)) continue;
    actions.push(
      planAddIfMissing(
        relPath,
        join(projectRoot, ...relPath.split("/")),
        readText(src),
      ),
    );
  }

  for (const name of AGENT_ROLE_FILES) {
    const src = join(TEMPLATES, "agent-roles", name);
    if (!existsSync(src)) continue;
    const relPath = `agent-roles/${name}`;
    actions.push(
      planAddIfMissing(relPath, join(projectRoot, "agent-roles", name), readText(src)),
    );
  }
  return actions;
}

function layer2AgentsAction(projectRoot) {
  const relPath = ".agents/AGENTS.md";
  const destAbs = join(projectRoot, ".agents", "AGENTS.md");
  if (!existsSync(destAbs)) {
    return { status: "skip", path: relPath, note: "missing" };
  }
  const existing = readText(destAbs);
  const replaced = replacePipelineSection(existing, getPipelineRules());
  if (replaced.status === "skip") {
    return { status: "skip", path: relPath, note: replaced.note };
  }
  if (replaced.status === "same") {
    return { status: "same", path: relPath };
  }
  return { status: "update", path: relPath, destAbs, desired: replaced.text };
}

const OVERLAY_REL = ".specify/workflows/overlays/speckit/chained-sdd.yml";
const OVERLAY_ADD_NOTE = "specify workflow overlay add --priority 10";

function overlaySourcePath() {
  return join(STARTER_ROOT, "presets", "chained-sdd", "workflows", "chained-sdd.yml");
}

function overlayDestPath(projectRoot) {
  return join(projectRoot, ...OVERLAY_REL.split("/"));
}

function overlayTextLooksRegistered(text) {
  if (!/(^|\n)\s*id:\s*["']?chained-sdd["']?\s*(?:\n|$)/.test(text)) return false;
  if (/(^|\n)\s*enabled:\s*false\s*(?:\n|$)/i.test(text)) return false;
  return true;
}

function overlayListShowsEnabled(text) {
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.includes("chained-sdd")) continue;
    if (/\bdisabled\b/i.test(line)) return false;
    if (/\benabled\b/i.test(line)) return true;
  }
  return false;
}

function overlayLooksRegisteredOnDisk(projectRoot) {
  const dest = overlayDestPath(projectRoot);
  return existsSync(dest) && overlayTextLooksRegistered(readText(dest));
}

function readOverlayRegistration(projectRoot, runSpecify) {
  const listed = runSpecify(["workflow", "overlay", "list", "speckit"], projectRoot);
  if (!listed || listed.status !== 0) return { known: false, enabled: false };
  return { known: true, enabled: overlayListShowsEnabled(specifyCliOutput(listed)) };
}

function overlayNeedsAdd(projectRoot, registration) {
  if (registration.known) return !registration.enabled;
  return !overlayLooksRegisteredOnDisk(projectRoot);
}

function layer2OverlayAction(projectRoot, { needsAdd, dryRun }) {
  const destAbs = overlayDestPath(projectRoot);
  const desired = readText(overlaySourcePath());
  const action = planTextFile(OVERLAY_REL, destAbs, desired);
  if (!needsAdd) return action;
  return {
    ...action,
    status: action.status === "same" ? "update" : action.status,
    destAbs,
    desired,
    overlayAdd: true,
    note: dryRun ? `would run ${OVERLAY_ADD_NOTE}` : OVERLAY_ADD_NOTE,
  };
}

function registerOverlayOrCopy(projectRoot, action, runSpecify) {
  const added = runSpecify(
    ["workflow", "overlay", "add", overlaySourcePath(), "--priority", "10"],
    projectRoot,
  );
  if (added && added.status === 0) {
    console.log(
      "installed speckit workflow overlay chained-sdd (clarify/analyze/converge; review-code gate before converge)",
    );
    return;
  }
  mkdirSync(dirname(action.destAbs), { recursive: true });
  writeText(action.destAbs, action.desired);
  const detail = added ? specifyCliOutput(added).split("\n")[0] : "specify not available";
  console.log(`wrote ${action.path} (${OVERLAY_ADD_NOTE} skipped: ${detail || "overlay add failed"})`);
}

/**
 * Shared layer-2 sync used by first install and `speckit-launch upgrade`.
 * dryRun prints the plan and writes nothing. `update` on a dry-run means the
 * file would be written. Optional starters are `add` only when missing.
 * A missing or unregistered chained-sdd overlay is registered with
 * `specify workflow overlay add` on apply; dry-run does not run that command.
 */
function syncLayer2(projectRoot, { dryRun = true, scriptType, runSpecify = specifyCli } = {}) {
  const root = resolve(projectRoot);
  if (!existsSync(join(root, ".specify"))) {
    die(`${root} is not a Spec Kit project (missing .specify/).`);
  }

  const resolvedScript = scriptType || detectProjectScriptType(root);
  const registration = readOverlayRegistration(root, runSpecify);
  if (!registration.known && runSpecify === specifyCli && !which("specify")) {
    console.warn(
      "warn: specify is not on PATH; overlay registration was not confirmed. Continuing.",
    );
  }
  const needsAdd = overlayNeedsAdd(root, registration);
  const actions = [
    layer2OverlayAction(root, { needsAdd, dryRun }),
    ...layer2DesiredFiles(root, resolvedScript),
    ...layer2OptionalFiles(root),
    layer2AgentsAction(root),
  ];

  console.log(dryRun ? "dry-run (no files written)" : "apply");
  for (const action of actions) {
    console.log(formatLayer2Line(action));
    if (dryRun) continue;
    if (action.overlayAdd) {
      registerOverlayOrCopy(root, action, runSpecify);
      continue;
    }
    if (action.status !== "update" && action.status !== "add") continue;
    mkdirSync(dirname(action.destAbs), { recursive: true });
    writeText(action.destAbs, action.desired);
  }

  return { dryRun, scriptType: resolvedScript, actions };
}

function writeAgentsFiles(projectRoot) {
  const agentsDir = join(projectRoot, ".agents");
  mkdirSync(agentsDir, { recursive: true });

  const skillsJson = join(agentsDir, "skills.json");
  if (!existsSync(skillsJson)) {
    copyTextFile(join(TEMPLATES, "skills.json"), skillsJson);
    console.log("wrote .agents/skills.json");
  }

  const agentsMd = join(agentsDir, "AGENTS.md");
  const template = readText(join(TEMPLATES, "AGENTS.md"));
  const pipelineRules = getPipelineRules();

  if (!existsSync(agentsMd)) {
    const rendered = replacePipelineSection(template, pipelineRules);
    writeText(agentsMd, rendered.text);
    console.log("wrote .agents/AGENTS.md");
    return;
  }

  const existing = readText(agentsMd);
  if (existing.includes(PIPELINE_START) || existing.includes(PIPELINE_NEEDLE)) {
    console.log(".agents/AGENTS.md already has Spec Kit pipeline; skipping");
    return;
  }

  const sep = existing.endsWith("\n") ? "\n" : "\n\n";
  writeText(agentsMd, existing.trimEnd() + sep + renderPipelineSection(pipelineRules) + "\n");
  console.log("merged Spec Kit pipeline into .agents/AGENTS.md");
}

function specifyCli(args, cwd) {
  let r = spawnSync("specify", args, {
    cwd,
    encoding: "utf8",
    shell: false,
    env: process.env,
  });
  if (r.error && r.error.code === "ENOENT" && IS_WINDOWS) {
    r = spawnSync("specify", args, {
      cwd,
      encoding: "utf8",
      shell: true,
      env: process.env,
    });
  }
  return r;
}

function specifyCliOutput(r) {
  return `${r.stdout || ""}\n${r.stderr || ""}\n${r.error?.message || ""}`.trim();
}

function installChainedSddPreset(projectRoot) {
  const presetDir = join(STARTER_ROOT, "presets", "chained-sdd");
  if (!existsSync(join(presetDir, "preset.yml"))) {
    console.warn("warn: presets/chained-sdd missing; skipped preset");
    return false;
  }
  if (!existsSync(join(projectRoot, ".specify"))) {
    console.warn("warn: .specify/ missing; skipped preset");
    return false;
  }

  const r = specifyCli(["preset", "add", "--dev", presetDir], projectRoot);
  const out = specifyCliOutput(r);
  if (r.status === 0) {
    console.log("installed chained-sdd preset (constitution-template append)");
    return true;
  }
  if (/already installed|already exists/i.test(out)) {
    console.log("chained-sdd preset already installed; skipping");
    return true;
  }
  console.warn(`warn: specify preset add --dev failed: ${out.split("\n")[0]}`);
  return false;
}

function looksLikeUnfilledConstitution(text) {
  return (
    text.includes("[PROJECT_NAME]") ||
    text.includes("[PRINCIPLE_1_NAME]") ||
    text.includes("[PRINCIPLE_1_DESCRIPTION]")
  );
}

function insertConstitutionPipeline(text, fragment) {
  const block = fragment.trimEnd() + "\n";
  const anchors = ["\n## [SECTION_2_NAME]", "\n## Governance", "\n## [SECTION_3_NAME]"];
  for (const anchor of anchors) {
    const i = text.indexOf(anchor);
    if (i >= 0) {
      return text.slice(0, i) + "\n" + block + text.slice(i);
    }
  }
  return text.trimEnd() + "\n\n" + block;
}

function seedConstitutionPipeline(projectRoot, { presetInstalled } = {}) {
  const fragmentPath = join(
    STARTER_ROOT,
    "presets",
    "chained-sdd",
    "templates",
    "constitution-pipeline.md",
  );
  if (!existsSync(fragmentPath)) return;
  const fragment = readText(fragmentPath);
  const needle = "Autonomy & Spec Kit pipeline";

  const targets = [];
  // Preset owns constitution-template composition. Only patch the core
  // template file if preset install failed.
  if (!presetInstalled) {
    targets.push(join(projectRoot, ".specify", "templates", "constitution-template.md"));
  }
  targets.push(join(projectRoot, ".specify", "memory", "constitution.md"));

  for (const dest of targets) {
    if (!existsSync(dest)) continue;
    const existing = readText(dest);
    if (existing.includes(needle)) {
      console.log(`${dest.includes("templates") ? "constitution-template.md" : "constitution.md"} already has pipeline principle; skipping`);
      continue;
    }
    const rel = dest.replace(/\\/g, "/");
    const isMemory = rel.endsWith("/memory/constitution.md");
    if (isMemory && !looksLikeUnfilledConstitution(existing)) {
      console.log("constitution.md is already filled; not injecting pipeline principle (edit via /speckit-constitution)");
      continue;
    }
    writeText(dest, insertConstitutionPipeline(existing, fragment));
    console.log(`seeded Autonomy & Spec Kit pipeline into ${dest.includes("templates") ? "constitution-template.md" : "constitution.md"}`);
  }
}

function ensureAgentBridgeFiles(projectRoot, keys = []) {
  if (keys.includes("claude")) {
    const claudeMd = join(projectRoot, "CLAUDE.md");
    if (!existsSync(claudeMd)) {
      const content = `# Project Instructions (Claude Code)

This repository follows [Spec-Driven Development (SDD)](https://github.com/github/spec-kit).
All workflow policies, role definitions, and capability tier routing are defined in:
👉 **[.agents/AGENTS.md](.agents/AGENTS.md)**

## Quick Reference
- **Workflow Pipeline**: \`specify → clarify → plan → tasks → analyze → implement\`. Stop for code review before \`/speckit-converge\`.
- **Principles**: Spec-first. Always specify requirements in \`specs/*/spec.md\` before coding.
- **Autonomy**: Day-to-day implementation is autonomous; pause after clarify/analyze only when issues remain.
`;
      writeText(claudeMd, content);
      console.log("wrote CLAUDE.md (bridge to .agents/AGENTS.md)");
    }
  }

  if (keys.includes("cursor-agent")) {
    const cursorRules = join(projectRoot, ".cursorrules");
    if (!existsSync(cursorRules)) {
      const content = `# Cursor Rules

This project follows GitHub Spec Kit for Spec-Driven Development.
Primary rules, role definitions, and workflow pipeline are documented in:
👉 **.agents/AGENTS.md**

## Quick Reference
- **Workflow Pipeline**: \`specify → clarify → plan → tasks → analyze → implement\`. Stop for code review before \`/speckit-converge\`.
- **Detailed Rules**: See \`.cursor/rules/speckit-pipeline.mdc\` and \`.agents/AGENTS.md\`.
- **Principles**: Spec-first. Keep transient execution artifacts in \`specs/<feature>/\` until converged.
`;
      writeText(cursorRules, content);
      console.log("wrote .cursorrules (bridge to .agents/AGENTS.md)");
    }
  }

  if (keys.includes("copilot")) {
    const copilotDir = join(projectRoot, ".github");
    mkdirSync(copilotDir, { recursive: true });
    const copilotMd = join(copilotDir, "copilot-instructions.md");
    if (!existsSync(copilotMd)) {
      const content = `# GitHub Copilot Instructions

See [.agents/AGENTS.md](../.agents/AGENTS.md) for full architecture guidelines and Spec-Driven Development pipelines.

## Spec Kit Chained Pipeline
\`specify → clarify → plan → tasks → analyze → implement\`

Follow spec-first principles and pause after clarify/analyze only when issues remain. After implement, stop for code review. Do not start converge until Blocking fixes are done.
`;
      writeText(copilotMd, content);
      console.log("wrote .github/copilot-instructions.md (bridge to .agents/AGENTS.md)");
    }
  }
}

function mergePipelinePointerIntoAgentDocs(projectRoot) {
  for (const rel of AGENT_DOC_CANDIDATES) {
    const dest = join(projectRoot, ...rel.split("/"));
    if (!existsSync(dest)) continue;
    const existing = readText(dest);
    if (
      existing.includes(PIPELINE_NEEDLE) ||
      existing.includes("Spec Kit chained pipeline") ||
      existing.includes(".agents/AGENTS.md")
    ) {
      continue;
    }
    const sep = existing.endsWith("\n") ? "\n" : "\n\n";
    writeText(dest, existing.trimEnd() + sep + AGENT_PIPELINE_POINTER);
    console.log(`merged Spec Kit pipeline pointer into ${rel}`);
  }
}

function updatePackageJsonScripts(projectRoot) {
  const pkgPath = join(projectRoot, "package.json");
  if (!existsSync(pkgPath)) return;
  try {
    const pkg = JSON.parse(readText(pkgPath));
    pkg.scripts = pkg.scripts || {};
    let changed = false;
    if (!pkg.scripts["link-skills"]) {
      pkg.scripts["link-skills"] = "node scripts/link-agent-skills.mjs";
      changed = true;
    }
    if (!pkg.scripts["worktree:new"]) {
      pkg.scripts["worktree:new"] = "node scripts/new-worktree.mjs";
      changed = true;
    }
    if (!pkg.scripts["herdr:roles"]) {
      pkg.scripts["herdr:roles"] = "node scripts/start-herdr-roles.mjs";
      changed = true;
    }
    if (changed) {
      writeText(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
      console.log("updated package.json with helper scripts (link-skills, worktree:new, herdr:roles)");
    }
  } catch {
    /* continue */
  }
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

function parseUpgradeArgs(argv) {
  const opts = { dryRun: true, dir: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--apply") opts.dryRun = false;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--dir") {
      opts.dir = argv[++i];
      if (!opts.dir) die("--dir requires a path");
    } else if (a.startsWith("-")) {
      die(`Unknown flag: ${a}`);
    } else {
      die(`Unexpected argument: ${a}\nUse --dir <path> to choose the target project.`);
    }
  }
  return opts;
}

function runUpgrade(argv) {
  const opts = parseUpgradeArgs(argv);
  if (opts.help) {
    upgradeUsage();
    return;
  }
  const projectRoot = opts.dir ? resolve(opts.dir) : process.cwd();
  if (!existsSync(join(projectRoot, ".specify"))) {
    die(`${projectRoot} is not a Spec Kit project (missing .specify/).`);
  }
  enforceSpeckitVersion({ projectRoot });
  syncLayer2(projectRoot, { dryRun: opts.dryRun });
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "upgrade") {
    runUpgrade(argv.slice(1));
    return;
  }
  const opts = parseArgs(process.argv.slice(2));
  if (opts.version) {
    const pkg = JSON.parse(readText(join(STARTER_ROOT, "package.json")));
    console.log(pkg.version);
    process.exit(0);
  }
  if (opts.help) {
    usage();
    process.exit(0);
  }

  const projectRoot = resolveProjectDir(opts);
  const detectedMap = getDetectedAgentMap();
  const primaryIntegration = await selectPrimaryIntegration(projectRoot, opts, detectedMap);
  const keys = integrationsToInstall(opts, primaryIntegration);

  console.log(`Project root: ${projectRoot}`);
  console.log(`Primary agent: ${primaryIntegration}`);
  console.log(`Integrations: ${keys.join(", ")}`);
  console.log(`Script: ${opts.script}`);

  ensureSpecify();
  enforceSpeckitVersion({ requireCli: true });

  if (!opts.noGit && !isGitRepo(projectRoot)) {
    run("git", ["init"], projectRoot);
  }

  installIntegrations(projectRoot, keys, opts.script, primaryIntegration, {
    noGit: opts.noGit,
  });
  moveSpeckitSkills(projectRoot);
  writeAgentsFiles(projectRoot);
  syncLayer2(projectRoot, { dryRun: false, scriptType: opts.script });
  const presetInstalled = installChainedSddPreset(projectRoot);
  seedConstitutionPipeline(projectRoot, { presetInstalled });
  ensureAgentBridgeFiles(projectRoot, keys);
  mergePipelinePointerIntoAgentDocs(projectRoot);
  runLinkScript(projectRoot);
  updatePackageJsonScripts(projectRoot);
  mergeGitignore(projectRoot);
  mergeGitattributes(projectRoot);

  const detectedAgents = detectAvailableAgentTools();
  let agentTip = "";
  if (detectedAgents.length > 1) {
    agentTip = `
Detected agent CLIs on PATH:
  ${detectedAgents.join(", ")}
  Tip: Multi-agent environment detected! Primary agent is '${primaryIntegration}'.
  You can configure per-stage model / agent routing in:
  - .agents/AGENTS.md (recommended capability tiers for interactive chats)
  - .specify/workflows/overlays/speckit/chained-sdd.yml (per-step CLI dispatch)
`;
  } else if (detectedAgents.length === 1) {
    agentTip = `
Detected agent CLI on PATH:
  ${detectedAgents[0]}
  Tip: Primary agent set to '${primaryIntegration}'. All stages default cleanly to your active agent.
`;
  } else {
    agentTip = `
Detected agent CLIs on PATH:
  None found on PATH (Primary set to '${primaryIntegration}'). IDE-based agents can be used directly.
`;
  }

  console.log(`
Done. Spec Kit project ready at:
  ${projectRoot}

Primary agent:
  ${primaryIntegration}
Installed integrations:
  ${keys.join(", ")}
${agentTip.trimEnd()}

Chained Spec Kit run (pause after clarify/analyze only when issues remain; stop after implement for code review):
  specify → clarify → plan → tasks → analyze → implement
  then /speckit-converge only after Blocking fixes

Next steps:
  1. Open the project in your primary agent (${primaryIntegration})
  2. Fill {{GITHUB_REPO}} in .agents/rules/changelog.md and the three commands in .agents/rules/commit-checks.md
  3. Run /speckit-constitution  (set THIS project's principles; keep the pipeline principle)
  4. Run /speckit-specify       (starts the chained run above${opts.noGit ? "" : "; creates a feature branch first"})

After clone on another machine:
  node scripts/link-agent-skills.mjs

Agent roles (not bound to one agent; any --type). Match by each file's Scope; then read the versions that Scope names:
  agent-roles/react-reviewer.md
  agent-roles/react-implementer.md
  agent-roles/react-checker.md
  node scripts/start-herdr-roles.mjs --kind <agent>
  node scripts/start-herdr-roles.mjs --kind <agent> --only react-checker,react-reviewer
  herdr session attach speckit-<repo>

Parallel multi-branch development (Git Worktree):
  node scripts/new-worktree.mjs <branch-name>

Re-launch later:
  node ${join(STARTER_ROOT, "bin", "new-project.mjs")} <name>
`);
}

export {
  parseArgs,
  SPECKIT_VERSION_SUPPORT,
  parseSpeckitVersion,
  assessSpeckitVersion,
  enforceSpeckitVersion,
  getPipelineRules,
  adaptSkillScript,
  defaultScript,
  usage,
  selectPrimaryIntegration,
  integrationsToInstall,
  buildSpecifyInitArgs,
  ensureAgentBridgeFiles,
  writeOptionalProcessTemplates,
  writeProcessRules,
  writeAgentsFiles,
  mergeGitattributes,
  syncLayer2,
  replacePipelineSection,
  detectProjectScriptType,
  AGENT_INTEGRATIONS,
};

const isDirectRun = Boolean(
  process.argv[1] &&
  safeRealpath(fileURLToPath(import.meta.url)).toLowerCase() === safeRealpath(process.argv[1]).toLowerCase()
);

if (isDirectRun) {
  main().catch((err) => {
    die(err?.message || String(err));
  });
}
