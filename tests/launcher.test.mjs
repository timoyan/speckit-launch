import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { spawnSync } from "node:child_process";

import {
  parseArgs,
  getPipelineRules,
  adaptSkillScript,
  selectPrimaryIntegration,
  integrationsToInstall,
  buildSpecifyInitArgs,
  ensureAgentBridgeFiles,
  writeOptionalProcessTemplates,
  writeProcessRules,
  mergeGitattributes,
} from "../bin/new-project.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("getPipelineRules returns canonical pipeline rules", () => {
  const rules = getPipelineRules();
  assert.ok(rules.length > 100, "rules should not be empty");
  assert.ok(
    rules.includes("specify → clarify → plan → tasks → analyze → implement → converge"),
    "rules must contain full chained sequence",
  );
  assert.ok(
    rules.includes("## 4. Remediation Action Checklist"),
    "rules must mention analysis remediation checklist",
  );
  assert.ok(
    rules.includes("Auto-Extract ADR"),
    "rules must mention converge ADR extraction",
  );
  assert.ok(
    rules.includes("Model & capability tier routing"),
    "rules must include model capability routing",
  );
  assert.ok(
    rules.includes("Architect Role"),
    "rules must include Architect Role definition",
  );
  assert.ok(
    rules.includes("Single-Agent / Interactive Chat Environments"),
    "rules must include single-agent environment guidance",
  );
});

test("parseArgs parses valid flags correctly", () => {
  const opts = parseArgs(["my-proj", "--script", "sh", "--only", "claude", "--no-git", "--primary", "agy", "--non-interactive"]);
  assert.equal(opts.name, "my-proj");
  assert.equal(opts.script, "sh");
  assert.equal(opts.only, "claude");
  assert.equal(opts.primary, "agy");
  assert.equal(opts.nonInteractive, true);
  assert.equal(opts.noGit, true);
  assert.equal(opts.here, false);
});

test("selectPrimaryIntegration prioritizes explicit flag over detection", async () => {
  const dummyDetected = new Map([["claude", "Claude Code"]]);
  const primary = await selectPrimaryIntegration(ROOT, { primary: "agy", nonInteractive: true }, dummyDetected);
  assert.equal(primary, "agy");
});

test("buildSpecifyInitArgs installs the git extension unless --no-git", () => {
  const withGit = buildSpecifyInitArgs("grok", "ps");
  assert.deepEqual(withGit.slice(-2), ["--extension", "git"]);
  assert.ok(withGit.includes("--integration"));
  assert.equal(withGit[withGit.indexOf("--integration") + 1], "grok");

  const noGit = buildSpecifyInitArgs("claude", "sh", { noGit: true });
  assert.equal(noGit.includes("--extension"), false);
  assert.equal(noGit.includes("git"), false);
});

test("integrationsToInstall positions primary integration first", () => {
  const keys = integrationsToInstall({}, "agy");
  assert.equal(keys[0], "agy");
  assert.ok(keys.includes("copilot"));
  assert.ok(keys.includes("claude"));
});

test("parseArgs handles --here flag", () => {
  const opts = parseArgs(["--here", "--script", "py"]);
  assert.equal(opts.here, true);
  assert.equal(opts.script, "py");
});

test("CLI rejects invalid script types via stderr", () => {
  const r = spawnSync(process.execPath, [join(ROOT, "bin", "new-project.mjs"), "test-p", "--script", "ruby"], {
    encoding: "utf8",
  });
  assert.notEqual(r.status, 0);
  assert.ok(r.stderr.includes("--script must be sh, ps, or py"));
});

test("CLI shows help and version flags", () => {
  const rHelp = spawnSync(process.execPath, [join(ROOT, "bin", "new-project.mjs"), "--help"], {
    encoding: "utf8",
  });
  assert.equal(rHelp.status, 0);
  assert.ok(rHelp.stdout.includes("Usage:"));
  assert.ok(rHelp.stdout.includes("agy"));

  const rVer = spawnSync(process.execPath, [join(ROOT, "bin", "new-project.mjs"), "--version"], {
    encoding: "utf8",
  });
  assert.equal(rVer.status, 0);
  assert.match(rVer.stdout.trim(), /^\d+\.\d+\.\d+/);
});

test("CLI executes when invoked via relative path or symlink", () => {
  const rRel = spawnSync(process.execPath, ["bin/new-project.mjs", "--help"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(rRel.status, 0);
  assert.ok(rRel.stdout.includes("Usage:"), "CLI should output usage when invoked via relative path");
});

test("adaptSkillScript transforms commands across sh, ps, py", () => {
  const psSnippet = "Run `.specify/scripts/powershell/check-prerequisites.ps1 -Json -PathsOnly` from repo root";

  // ps retains PowerShell
  assert.equal(adaptSkillScript(psSnippet, "ps"), psSnippet);

  // sh transforms to bash and lowercase flags
  const shSnippet = adaptSkillScript(psSnippet, "sh");
  assert.ok(shSnippet.includes(".specify/scripts/bash/check-prerequisites.sh --json --paths-only"));
  assert.ok(!shSnippet.includes(".ps1"));

  // py transforms to python script and lowercase flags
  const pySnippet = adaptSkillScript(psSnippet, "py");
  assert.ok(pySnippet.includes("python .specify/scripts/python/check_prerequisites.py --json --paths-only"));
  assert.ok(!pySnippet.includes(".ps1"));
});

test("templates/AGENTS.md has clean injection marker", () => {
  const templatePath = join(ROOT, "templates", "AGENTS.md");
  assert.ok(existsSync(templatePath));
  const content = readFileSync(templatePath, "utf8");
  const marker = "<!-- speckit-launch:pipeline -->";
  assert.ok(content.includes(marker), "AGENTS.md template must contain injection marker");
  assert.ok(
    !content.includes("specify → clarify → plan"),
    "AGENTS.md template must not contain inline hardcoded pipeline duplicate",
  );

  // Injection test
  const rules = getPipelineRules();
  const injected = content.replace(marker, `${marker}\n\n${rules}`);
  assert.ok(injected.includes("specify → clarify → plan"));
  assert.ok(injected.includes("One-time project setup"));
});

test("presets/chained-sdd integrity", () => {
  const presetDir = join(ROOT, "presets", "chained-sdd");
  assert.ok(existsSync(join(presetDir, "preset.yml")), "preset.yml missing");
  assert.ok(existsSync(join(presetDir, "README.md")), "preset README.md missing");
  assert.ok(existsSync(join(presetDir, "install.mjs")), "install.mjs missing");
  assert.ok(existsSync(join(presetDir, "workflows", "chained-sdd.yml")), "chained-sdd.yml missing");
  assert.ok(existsSync(join(presetDir, "rules", "pipeline-rules.md")), "pipeline-rules.md missing");
  assert.ok(existsSync(join(presetDir, "rules", "speckit-pipeline.mdc")), "speckit-pipeline.mdc missing");
  assert.ok(existsSync(join(ROOT, "templates", "rules", "shell-encoding.md")), "shell-encoding.md missing");

  const skills = ["speckit-clarify", "speckit-analyze", "speckit-implement", "speckit-converge"];
  for (const s of skills) {
    const skillPath = join(presetDir, "skills", s, "SKILL.md");
    assert.ok(existsSync(skillPath), `skill missing: ${s}`);
    const content = readFileSync(skillPath, "utf8");
    assert.ok(content.length > 200, `skill ${s} content too short`);
  }
});

test("presets/chained-sdd/install.mjs guards against non-speckit directory", () => {
  const installScript = join(ROOT, "presets", "chained-sdd", "install.mjs");
  const r = spawnSync(process.execPath, [installScript, ROOT], {
    encoding: "utf8",
  });
  assert.notEqual(r.status, 0);
  assert.ok(r.stderr.includes("missing .specify/ directory"));
});

test("templates/gitignore.fragment does not ignore transient specs (tasks, checklists, analysis)", () => {
  const fragmentPath = join(ROOT, "templates", "gitignore.fragment");
  assert.ok(existsSync(fragmentPath));
  const content = readFileSync(fragmentPath, "utf8");
  assert.ok(!content.includes("specs/*/tasks.md"), "tasks.md should not be in gitignore.fragment");
  assert.ok(!content.includes("specs/*/checklists/"), "checklists/ should not be in gitignore.fragment");
  assert.ok(!content.includes("specs/*/analysis.md"), "analysis.md should not be in gitignore.fragment");
});

test("speckit-converge ensures transient execution artifacts are removed after ADR extraction", () => {
  const convergeSkillPath = join(ROOT, "presets", "chained-sdd", "skills", "speckit-converge", "SKILL.md");
  assert.ok(existsSync(convergeSkillPath));
  const content = readFileSync(convergeSkillPath, "utf8");
  assert.ok(content.includes("Auto-Extract ADR"), "converge must extract ADR");
  assert.ok(content.includes("FEATURE_DIR/tasks.md"), "converge must remove FEATURE_DIR/tasks.md");
  assert.ok(content.includes("FEATURE_DIR/checklists/"), "converge must remove FEATURE_DIR/checklists/");
  assert.ok(content.includes("FEATURE_DIR/analysis.md"), "converge must remove FEATURE_DIR/analysis.md");
});

test("scripts/new-worktree.mjs integrity and help output", () => {
  const scriptPath = join(ROOT, "scripts", "new-worktree.mjs");
  assert.ok(existsSync(scriptPath), "new-worktree.mjs must exist");

  const rHelp = spawnSync(process.execPath, [scriptPath, "--help"], {
    encoding: "utf8",
  });
  assert.equal(rHelp.status, 0);
  assert.ok(rHelp.stdout.includes("Usage:"));
  assert.ok(rHelp.stdout.includes("worktree"));

  const rNoArgs = spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
  });
  assert.notEqual(rNoArgs.status, 0);
});

test("extracted process templates stay generic and copy only when missing", () => {
  const agentsMd = readFileSync(join(ROOT, "templates", "AGENTS.md"), "utf8");
  assert.ok(agentsMd.includes(".agents/rules/"));
  assert.ok(agentsMd.includes("{{GITHUB_REPO}}"));
  assert.ok(!agentsMd.includes("specify → clarify → plan"));

  const changelog = readFileSync(join(ROOT, "templates", "rules", "changelog.md"), "utf8");
  assert.ok(changelog.includes("{{GITHUB_REPO}}"));
  assert.ok(changelog.includes("[skip ci]"));
  assert.ok(!changelog.includes("timoyan/fin-tank"));
  assert.ok(!changelog.includes("Asia/Taipei"));

  const checks = readFileSync(join(ROOT, "templates", "rules", "commit-checks.md"), "utf8");
  assert.ok(checks.includes("{{FORMAT_CHECK}}"));
  assert.ok(checks.includes("{{TYPECHECK}}"));
  assert.ok(checks.includes("{{RELATED_TESTS}}"));
  assert.ok(!checks.includes("biome"));
  assert.ok(!checks.includes("yarn"));

  const skill = readFileSync(join(ROOT, "templates", "skills", "commit-push-pr", "SKILL.md"), "utf8");
  assert.ok(skill.includes("{{GITHUB_REPO}}"));
  assert.ok(!skill.includes("biome"));
  assert.ok(!skill.includes("yarn"));

  const hook = readFileSync(join(ROOT, "templates", "agents", "scripts", "safety-check.cjs"), "utf8");
  assert.ok(hook.includes("git reset"));
  assert.ok(hook.includes("rm -rf") || hook.includes("rm\\s+"));
  assert.ok(!hook.includes("wrangler"));
  assert.ok(!hook.includes("schema_reset"));
  assert.ok(hook.includes("Example only"));

  const snippet = readFileSync(join(ROOT, "templates", "github", "ci-paths-ignore.snippet.yml"), "utf8");
  assert.ok(snippet.includes("paths-ignore"));
  assert.ok(snippet.includes("specs/**"));
  assert.ok(!snippet.includes("test:harness"));

  const attrs = readFileSync(join(ROOT, "templates", "gitattributes.fragment"), "utf8");
  assert.ok(attrs.includes("*.png binary"));
  assert.ok(attrs.includes("*.md text eol=lf"));

  const tmp = mkdtempSync(join(tmpdir(), "speckit-extract-"));
  try {
    writeProcessRules(tmp);
    writeOptionalProcessTemplates(tmp);
    mergeGitattributes(tmp);
    assert.ok(existsSync(join(tmp, ".agents", "rules", "shell-encoding.md")));
    assert.ok(existsSync(join(tmp, ".agents", "rules", "changelog.md")));
    assert.ok(existsSync(join(tmp, ".agents", "rules", "commit-checks.md")));
    const cursorMirror = readFileSync(join(tmp, ".cursor", "rules", "changelog.mdc"), "utf8");
    assert.ok(cursorMirror.includes("alwaysApply: true"));
    assert.ok(cursorMirror.includes("{{GITHUB_REPO}}"));
    assert.ok(existsSync(join(tmp, ".agents", "skills", "commit-push-pr", "SKILL.md")));
    assert.ok(existsSync(join(tmp, ".agents", "hooks.json")));
    assert.ok(readFileSync(join(tmp, ".gitattributes"), "utf8").includes("*.png binary"));

    writeFileSync(join(tmp, ".agents", "rules", "changelog.md"), "project-specific\n");
    writeProcessRules(tmp);
    assert.equal(readFileSync(join(tmp, ".agents", "rules", "changelog.md"), "utf8"), "project-specific\n");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("ensureAgentBridgeFiles creates bridge files pointing to .agents/AGENTS.md", () => {
  const tmp = mkdtempSync(join(tmpdir(), "speckit-bridge-test-"));
  try {
    ensureAgentBridgeFiles(tmp, ["claude", "cursor-agent", "copilot"]);

    const claudePath = join(tmp, "CLAUDE.md");
    assert.ok(existsSync(claudePath), "CLAUDE.md must be created");
    const claudeContent = readFileSync(claudePath, "utf8");
    assert.ok(claudeContent.includes(".agents/AGENTS.md"));

    const cursorRulesPath = join(tmp, ".cursorrules");
    assert.ok(existsSync(cursorRulesPath), ".cursorrules must be created");
    const cursorRulesContent = readFileSync(cursorRulesPath, "utf8");
    assert.ok(cursorRulesContent.includes(".agents/AGENTS.md"));

    const copilotPath = join(tmp, ".github", "copilot-instructions.md");
    assert.ok(existsSync(copilotPath), ".github/copilot-instructions.md must be created");
    const copilotContent = readFileSync(copilotPath, "utf8");
    assert.ok(copilotContent.includes(".agents/AGENTS.md"));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

