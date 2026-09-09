#!/usr/bin/env node
/**
 * Standalone installer for the Chained SDD preset.
 * Installs or updates Chained SDD methodology in an existing Spec Kit project:
 * - Deploys the workflow overlay (.specify/workflows/overlays/speckit/chained-sdd.yml)
 * - Copies enhanced workflow skills to .agents/skills/ (with script type adaptation)
 * - Injects chained SDD rules into .agents/AGENTS.md
 * - Writes .cursor/rules/speckit-pipeline.mdc
 * - Registers the preset (specify preset add --dev)
 * - Seeds the pipeline principle into .specify/memory/constitution.md
 * - Refreshes agent skill symlinks/junctions
 *
 * Usage:
 *   node presets/chained-sdd/install.mjs [targetDir]
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const PRESET_ROOT = dirname(fileURLToPath(import.meta.url));
const STARTER_ROOT = join(PRESET_ROOT, "..", "..");
const IS_WINDOWS = process.platform === "win32";

function readText(p) {
  return readFileSync(p, "utf8");
}

function writeText(p, s) {
  writeFileSync(p, s, "utf8");
}

function copyTextFile(src, dest) {
  writeText(dest, readText(src));
}

function detectScriptType(projectRoot) {
  if (existsSync(join(projectRoot, ".specify", "scripts", "bash"))) return "sh";
  if (existsSync(join(projectRoot, ".specify", "scripts", "powershell"))) return "ps";
  if (existsSync(join(projectRoot, ".specify", "scripts", "python"))) return "py";
  return IS_WINDOWS ? "ps" : "sh";
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

function runCmd(cmd, args, cwd) {
  let r = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: false });
  if (r.error && r.error.code === "ENOENT" && IS_WINDOWS) {
    r = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: true });
  }
  return r;
}

function installPreset(targetDir) {
  const projectRoot = resolve(targetDir || process.cwd());
  console.log(`Installing Chained SDD preset into: ${projectRoot}`);

  if (!existsSync(join(projectRoot, ".specify"))) {
    console.error(`Error: ${projectRoot} is not a Spec Kit project (missing .specify/ directory).`);
    console.error("Initialize Spec Kit first with \`specify init\` or use \`speckit-launch\`.");
    process.exit(1);
  }

  const scriptType = detectScriptType(projectRoot);
  console.log(`Detected script type: ${scriptType}`);

  // 1. Workflow overlay
  const overlaySrc = join(PRESET_ROOT, "workflows", "chained-sdd.yml");
  const overlayDestDir = join(projectRoot, ".specify", "workflows", "overlays", "speckit");
  mkdirSync(overlayDestDir, { recursive: true });
  copyTextFile(overlaySrc, join(overlayDestDir, "chained-sdd.yml"));
  console.log("✓ Deployed .specify/workflows/overlays/speckit/chained-sdd.yml");

  // 2. Enhanced skills
  const skillsSrcDir = join(PRESET_ROOT, "skills");
  const skillsDestDir = join(projectRoot, ".agents", "skills");
  mkdirSync(skillsDestDir, { recursive: true });
  if (existsSync(skillsSrcDir)) {
    const skillDirs = readdirSync(skillsSrcDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    for (const name of skillDirs) {
      const srcSkill = join(skillsSrcDir, name, "SKILL.md");
      if (!existsSync(srcSkill)) continue;
      const targetDir = join(skillsDestDir, name);
      mkdirSync(targetDir, { recursive: true });
      const content = readText(srcSkill);
      writeText(join(targetDir, "SKILL.md"), adaptSkillScript(content, scriptType));
      console.log(`✓ Installed skill .agents/skills/${name}/SKILL.md (${scriptType})`);
    }
  }

  // 3. Pipeline rules -> .agents/AGENTS.md
  const rulesPath = join(PRESET_ROOT, "rules", "pipeline-rules.md");
  if (existsSync(rulesPath)) {
    const pipelineRules = readText(rulesPath).trim();
    const agentsMd = join(projectRoot, ".agents", "AGENTS.md");
    const marker = "<!-- speckit-launch:pipeline -->";
    const needle = "specify → clarify → plan → tasks → analyze";

    if (!existsSync(agentsMd)) {
      const templatePath = join(STARTER_ROOT, "templates", "AGENTS.md");
      const baseTemplate = existsSync(templatePath)
        ? readText(templatePath)
        : `# Agent notes\n\n## Spec Kit\n\n${marker}\n`;
      writeText(agentsMd, baseTemplate.replace(marker, `${marker}\n\n${pipelineRules}`));
      console.log("✓ Wrote .agents/AGENTS.md");
    } else {
      const existing = readText(agentsMd);
      if (!existing.includes(marker) && !existing.includes(needle)) {
        writeText(agentsMd, existing.trimEnd() + `\n\n${marker}\n\n${pipelineRules}\n`);
        console.log("✓ Merged Chained SDD pipeline rules into .agents/AGENTS.md");
      } else {
        console.log("✓ .agents/AGENTS.md already contains pipeline rules");
      }
    }
  }

  // 4. Cursor rule -> .cursor/rules/speckit-pipeline.mdc
  const cursorRulesDir = join(projectRoot, ".cursor", "rules");
  mkdirSync(cursorRulesDir, { recursive: true });
  const cursorRuleDest = join(cursorRulesDir, "speckit-pipeline.mdc");
  const cursorRuleSrc = join(PRESET_ROOT, "rules", "speckit-pipeline.mdc");
  if (existsSync(cursorRuleSrc)) {
    copyTextFile(cursorRuleSrc, cursorRuleDest);
    console.log("✓ Wrote .cursor/rules/speckit-pipeline.mdc");
  }

  // 5. Specify preset registration
  const r = runCmd("specify", ["preset", "add", "--dev", PRESET_ROOT], projectRoot);
  if (r.status === 0) {
    console.log("✓ Registered chained-sdd preset in Spec Kit");
  } else {
    console.log("• specify preset add skipped (or specify CLI not found on PATH)");
  }

  // 6. Link agent skills
  const linkScriptSrc = join(STARTER_ROOT, "scripts", "link-agent-skills.mjs");
  const linkScriptDest = join(projectRoot, "scripts", "link-agent-skills.mjs");
  if (existsSync(linkScriptSrc)) {
    mkdirSync(join(projectRoot, "scripts"), { recursive: true });
    copyTextFile(linkScriptSrc, linkScriptDest);
    runCmd(process.execPath, [linkScriptDest], projectRoot);
    console.log("✓ Refreshed cross-agent skill mounts");
  }

  console.log("\nChained SDD preset successfully installed!");
}

const target = process.argv[2] || process.cwd();
installPreset(target);
