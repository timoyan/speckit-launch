#!/usr/bin/env node

/**
 * Standalone first install for the Chained SDD preset.
 * Not an upgrade entry — refresh launcher-owned files with `speckit-launch upgrade`.
 * - Ensures .agents/AGENTS.md uses paired pipeline markers when creating it
 * - Syncs the shared layer-2 allowlist (overlay, enhanced skills, cursor rule, scripts, preset snapshot)
 * - Registers the preset (specify preset add --dev)
 * - Does not rewrite a filled constitution
 *
 * Usage:
 *   node presets/chained-sdd/install.mjs [targetDir]
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeAgentsFiles, syncLayer2, enforceSpeckitVersion } from "../../bin/new-project.mjs";

const PRESET_ROOT = dirname(fileURLToPath(import.meta.url));
const IS_WINDOWS = process.platform === "win32";

function readText(p) {
  return readFileSync(p, "utf8");
}

function writeText(p, s) {
  writeFileSync(p, s, "utf8");
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
    console.error(
      `Error: ${projectRoot} is not a Spec Kit project (missing .specify/ directory).`,
    );
    console.error(
      "Initialize Spec Kit first with `specify init` or use `speckit-launch`.",
    );
    process.exit(1);
  }

  console.log(`Detected script type follows .specify/init-options.json, then .specify/scripts`);

  enforceSpeckitVersion({ projectRoot });
  writeAgentsFiles(projectRoot);
  syncLayer2(projectRoot, { dryRun: false });

  // 4b. Multi-agent docs pointer (.cursorrules, CLAUDE.md, .github/copilot-instructions.md)
  const agentDocCandidates = [
    ".cursorrules",
    "CLAUDE.md",
    ".github/copilot-instructions.md",
  ];
  const pointerBlock =
    "\n\n## Spec Kit chained pipeline\n\nCanonical rules: `.agents/AGENTS.md`.\n\n```\nspecify → clarify → plan → tasks → analyze → implement\n```\n\nPause after clarify/analyze only when issues remain. After implement, stop for code review. Do not start converge until Blocking fixes are done.\n";
  for (const doc of agentDocCandidates) {
    const docPath = join(projectRoot, ...doc.split("/"));
    if (existsSync(docPath)) {
      const content = readText(docPath);
      if (
        !content.includes(".agents/AGENTS.md") &&
        !content.includes("Spec Kit chained pipeline")
      ) {
        writeText(docPath, content.trimEnd() + pointerBlock);
        console.log(`✓ Merged Spec Kit pipeline pointer into ${doc}`);
      }
    }
  }

  // 5. Specify preset registration
  const r = runCmd(
    "specify",
    ["preset", "add", "--dev", PRESET_ROOT],
    projectRoot,
  );
  if (r.status === 0) {
    console.log("✓ Registered chained-sdd preset in Spec Kit");
  } else {
    console.log(
      "• specify preset add skipped (or specify CLI not found on PATH)",
    );
  }

  // Refresh mounts from the script syncLayer2 just wrote (do not treat this file as an upgrade CLI).
  const linkScriptDest = join(projectRoot, "scripts", "link-agent-skills.mjs");
  if (existsSync(linkScriptDest)) {
    runCmd(process.execPath, [linkScriptDest], projectRoot);
    console.log("✓ Refreshed cross-agent skill mounts");
  }

  console.log("\nChained SDD preset successfully installed!");
}

const target = process.argv[2] || process.cwd();
installPreset(target);
