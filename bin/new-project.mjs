#!/usr/bin/env node
/**
 * Bootstrap a new Spec Kit project with mainstream AI agent integrations,
 * cross-agent skill mounts (canonical copy in .agents/skills), and the
 * chained Spec Kit pipeline (specify → clarify → plan → tasks → analyze →
 * implement → converge; pause after clarify/analyze only when issues remain).
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

function pathsEqual(a, b) {
  const na = resolve(a).replace(/\\/g, "/");
  const nb = resolve(b).replace(/\\/g, "/");
  return IS_WINDOWS ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

/** Mainstream agents installed by default (no --ai required). */
const MAINSTREAM_INTEGRATIONS = [
  "copilot",
  "claude",
  "cursor-agent",
  "gemini",
  "grok",
  "codex",
  "agy",
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
--only <integration>: install a single Spec Kit integration instead of all mainstream
--version, -v: print version
--help, -h: show usage`);
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
    version: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--version" || a === "-v") opts.version = true;
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
  const bin = IS_WINDOWS ? "where" : "which";
  let r = spawnSync(bin, [cmd], { encoding: "utf8", shell: false });
  if (r.error && r.error.code === "ENOENT" && IS_WINDOWS) {
    r = spawnSync(bin, [cmd], { encoding: "utf8", shell: true });
  }
  return r.status === 0 && (r.stdout || "").trim().length > 0;
}

const AGENT_CLI_DETECTION_TARGETS = [
  { name: "Claude Code", bin: "claude" },
  { name: "Gemini CLI", bin: "gemini" },
  { name: "Cursor CLI", bin: "cursor-agent", fallback: "cursor" },
  { name: "GitHub Copilot CLI", bin: "copilot", fallback: "github-copilot-cli" },
  { name: "Grok Build", bin: "grok" },
  { name: "Codex CLI", bin: "codex" },
  { name: "Antigravity", bin: "agy", fallback: "antigravity" },
];

function detectAvailableAgentTools() {
  const found = [];
  for (const agent of AGENT_CLI_DETECTION_TARGETS) {
    if (which(agent.bin) || (agent.fallback && which(agent.fallback))) {
      found.push(agent.name);
    }
  }
  return found;
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

function applyEnhancedSpeckitSkills(projectRoot) {
  const canonical = join(projectRoot, ".agents", "skills");
  const skillsTemplateDir = join(STARTER_ROOT, "presets", "chained-sdd", "skills");
  if (!existsSync(skillsTemplateDir)) return;

  const skillDirs = readdirSync(skillsTemplateDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const name of skillDirs) {
    const srcSkill = join(skillsTemplateDir, name, "SKILL.md");
    if (!existsSync(srcSkill)) continue;
    const destDir = join(canonical, name);
    mkdirSync(destDir, { recursive: true });
    const destSkill = join(destDir, "SKILL.md");
    copyTextFile(srcSkill, destSkill);
    console.log(`applied enhanced skill template -> .agents/skills/${name}/SKILL.md`);
  }
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

function mergeGitattributes(projectRoot) {
  const fragmentPath = join(TEMPLATES, "gitattributes.fragment");
  if (!existsSync(fragmentPath)) return;
  const fragment = readText(fragmentPath).trimEnd() + "\n";
  const dest = join(projectRoot, ".gitattributes");
  const marker = "# speckit-launch: line endings";
  if (!existsSync(dest)) {
    writeText(dest, fragment);
    console.log("wrote .gitattributes (LF line endings)");
    return;
  }
  const existing = readText(dest);
  if (existing.includes(marker) || existing.includes("eol=lf")) {
    console.log(".gitattributes already has LF rules; skipping merge");
    return;
  }
  const sep = existing.endsWith("\n") ? "\n" : "\n\n";
  writeText(dest, existing.trimEnd() + sep + fragment);
  console.log("merged LF line-ending rules into .gitattributes");
}

const PIPELINE_MARKER = "<!-- speckit-launch:pipeline -->";
const PIPELINE_NEEDLE = "specify → clarify → plan → tasks → analyze";

const AGENT_DOC_CANDIDATES = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".github/copilot-instructions.md",
];

const AGENT_PIPELINE_POINTER = `## Spec Kit chained pipeline

Canonical rules: \`.agents/AGENTS.md\`. Full run:

\`\`\`
specify → clarify → plan → tasks → analyze → implement → converge
\`\`\`

Pause after clarify/analyze only when issues remain. A single slash command does not start the chain.
`;

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
  if (!existsSync(agentsMd)) {
    writeText(agentsMd, template);
    console.log("wrote .agents/AGENTS.md");
    return;
  }

  const existing = readText(agentsMd);
  if (existing.includes(PIPELINE_MARKER) || existing.includes(PIPELINE_NEEDLE)) {
    console.log(".agents/AGENTS.md already has Spec Kit pipeline; skipping");
    return;
  }

  const markerAt = template.indexOf(PIPELINE_MARKER);
  const insert = "\n\n" + (markerAt >= 0 ? template.slice(markerAt) : template);
  writeText(agentsMd, existing.trimEnd() + insert);
  console.log("merged Spec Kit pipeline into .agents/AGENTS.md");
}

function writeCursorPipelineRule(projectRoot) {
  const destDir = join(projectRoot, ".cursor", "rules");
  mkdirSync(destDir, { recursive: true });
  const dest = join(destDir, "speckit-pipeline.mdc");
  copyTextFile(join(TEMPLATES, "speckit-pipeline.mdc"), dest);
  console.log("wrote .cursor/rules/speckit-pipeline.mdc");
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

function overlaySpeckitWorkflow(projectRoot) {
  if (!existsSync(join(projectRoot, ".specify"))) {
    console.warn("warn: .specify/ missing; skipped workflow overlay");
    return;
  }

  const overlaySrc = join(TEMPLATES, "speckit-overlay.yml");
  const destDir = join(projectRoot, ".specify", "workflows", "overlays", "speckit");
  const dest = join(destDir, "chained-sdd.yml");
  mkdirSync(destDir, { recursive: true });

  // Spec Kit 1.0+ composes overlays on top of the bundled workflow.yml.
  // Do not overwrite the installed workflow — `specify workflow update`
  // can refresh the base while this overlay keeps the chained SDD steps.
  if (existsSync(dest)) {
    copyTextFile(overlaySrc, dest);
    console.log("refreshed .specify/workflows/overlays/speckit/chained-sdd.yml");
    return;
  }

  const r = specifyCli(["workflow", "overlay", "add", overlaySrc, "--priority", "10"], projectRoot);
  if (r.status === 0) {
    console.log("installed speckit workflow overlay chained-sdd (clarify/analyze/converge; no fixed review gates)");
    return;
  }

  copyTextFile(overlaySrc, dest);
  const detail = specifyCliOutput(r).split("\n")[0] || "overlay add failed";
  console.log(`wrote ${dest} (specify workflow overlay add skipped: ${detail})`);
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

function mergePipelinePointerIntoAgentDocs(projectRoot) {
  for (const rel of AGENT_DOC_CANDIDATES) {
    const dest = join(projectRoot, ...rel.split("/"));
    if (!existsSync(dest)) continue;
    const existing = readText(dest);
    if (existing.includes(PIPELINE_NEEDLE) || existing.includes("Spec Kit chained pipeline")) {
      continue;
    }
    const sep = existing.endsWith("\n") ? "\n" : "\n\n";
    writeText(dest, existing.trimEnd() + sep + AGENT_PIPELINE_POINTER);
    console.log(`merged Spec Kit pipeline pointer into ${rel}`);
  }
}

function copyLinkScript(projectRoot) {
  const scriptsDir = join(projectRoot, "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  const dest = join(scriptsDir, "link-agent-skills.mjs");
  copyTextFile(join(STARTER_ROOT, "scripts", "link-agent-skills.mjs"), dest);
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
  if (opts.version) {
    const pkg = JSON.parse(readText(join(STARTER_ROOT, "package.json")));
    console.log(pkg.version);
    process.exit(0);
  }
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
  applyEnhancedSpeckitSkills(projectRoot);
  writeAgentsFiles(projectRoot);
  writeCursorPipelineRule(projectRoot);
  overlaySpeckitWorkflow(projectRoot);
  const presetInstalled = installChainedSddPreset(projectRoot);
  seedConstitutionPipeline(projectRoot, { presetInstalled });
  mergePipelinePointerIntoAgentDocs(projectRoot);
  copyLinkScript(projectRoot);
  runLinkScript(projectRoot);
  mergeGitignore(projectRoot);
  mergeGitattributes(projectRoot);

  const detectedAgents = detectAvailableAgentTools();
  let agentTip = "";
  if (detectedAgents.length > 1) {
    agentTip = `
Detected agent CLIs on PATH:
  ${detectedAgents.join(", ")}
  Tip: Multi-agent environment detected! You can configure per-stage model / agent routing in:
  - .agents/AGENTS.md (recommended capability tiers for interactive chats)
  - .specify/workflows/overlays/speckit/chained-sdd.yml (per-step CLI dispatch)
`;
  } else if (detectedAgents.length === 1) {
    agentTip = `
Detected agent CLI on PATH:
  ${detectedAgents[0]}
  Tip: Single-agent workflow. All stages default cleanly to your active agent.
`;
  } else {
    agentTip = `
Detected agent CLIs on PATH:
  None found on PATH (IDE-based agents like Cursor or VS Code Copilot can be used directly).
`;
  }

  console.log(`
Done. Spec Kit project ready at:
  ${projectRoot}

Installed integrations:
  ${keys.join(", ")}
${agentTip.trimEnd()}

Chained Spec Kit run (pause after clarify/analyze only when issues remain):
  specify → clarify → plan → tasks → analyze → implement → converge

Next steps:
  1. Open the project in any of the installed coding agents
  2. Run /speckit-constitution  (set THIS project's principles; keep the pipeline principle)
  3. Run /speckit-specify       (starts the chained run above)

After clone on another machine:
  node scripts/link-agent-skills.mjs

Re-launch later:
  node ${join(STARTER_ROOT, "bin", "new-project.mjs")} <name>
`);
}

main();
