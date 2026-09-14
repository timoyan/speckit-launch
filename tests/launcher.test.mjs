import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { spawnSync } from "node:child_process";

import {
  parseArgs,
  assessSpeckitVersion,
  detectProjectScriptType,
  getPipelineRules,
  adaptSkillScript,
  selectPrimaryIntegration,
  integrationsToInstall,
  buildSpecifyInitArgs,
  ensureAgentBridgeFiles,
  writeOptionalProcessTemplates,
  writeProcessRules,
  mergeGitattributes,
  syncLayer2,
  replacePipelineSection,
} from "../bin/new-project.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("assessSpeckitVersion fails outside 1.x and warns on newer-than-tested", () => {
  assert.equal(assessSpeckitVersion("0.9.1").code, "too-old");
  assert.equal(assessSpeckitVersion("0.9.1").level, "error");
  assert.equal(assessSpeckitVersion("1.0.0").level, "ok");
  assert.equal(assessSpeckitVersion("1.0.4").level, "ok");
  const newer = assessSpeckitVersion("specify 1.0.6.dev0");
  assert.equal(newer.level, "warn");
  assert.equal(newer.code, "newer-than-tested");
  assert.match(newer.message, /1\.0\.6\.dev0/);
  assert.equal(assessSpeckitVersion("2.0.0").code, "too-new");
  assert.equal(assessSpeckitVersion("not a version").code, "unparsed");
  assert.equal(assessSpeckitVersion("not a version").level, "warn");
});

test("getPipelineRules returns canonical pipeline rules", () => {
  const rules = getPipelineRules();
  assert.ok(rules.length > 100, "rules should not be empty");
  assert.ok(
    rules.includes("specify → clarify → plan → tasks → analyze → implement"),
    "rules must contain the chained sequence through implement",
  );
  assert.ok(
    rules.includes("Do **not** start `/speckit-converge`"),
    "rules must not auto-start converge after implement",
  );
  assert.ok(
    rules.includes("Match roles to **changed files**"),
    "rules must match roles by diff, not one role for the project",
  );
  assert.ok(
    rules.includes("Versions do **not** choose the role"),
    "rules must read versions after a role matches",
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
  const endMarker = "<!-- /speckit-launch:pipeline -->";
  assert.ok(content.includes(marker), "AGENTS.md template must contain injection marker");
  assert.ok(content.includes(endMarker), "AGENTS.md template must contain the pipeline end marker");
  assert.ok(
    !content.includes("specify → clarify → plan"),
    "AGENTS.md template must not contain inline hardcoded pipeline duplicate",
  );

  const rules = getPipelineRules();
  const injected = replacePipelineSection(content, rules);
  assert.equal(injected.status, "update");
  assert.ok(injected.text.includes("specify → clarify → plan"));
  assert.ok(injected.text.includes("One-time project setup"));
  assert.ok(injected.text.indexOf("One-time project setup") > injected.text.indexOf(endMarker));
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

function writeUpgradeFixture(root) {
  const touch = (rel, body) => {
    const dest = join(root, ...rel.split("/"));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, body);
  };
  mkdirSync(join(root, ".specify", "scripts", "bash"), { recursive: true });
  touch(".specify/workflows/speckit/workflow.yml", "bundled-workflow-do-not-touch\n");
  touch(".specify/workflows/overlays/speckit/chained-sdd.yml", "old-overlay\n");
  touch(".specify/memory/constitution.md", "# Product constitution\n\nFilled principle for this product.\n");
  touch(".specify/templates/spec-template.md", "product-template\n");
  touch(".specify/presets/chained-sdd/local-extra.md", "keep-me\n");
  touch(".agents/skills/speckit-clarify/SKILL.md", "old skill still has -Json\n");
  touch(".cursor/rules/speckit-pipeline.mdc", "old-pipeline\n");
  touch(".agents/rules/changelog.md", "custom changelog rule\n");
  touch(".cursor/rules/changelog.mdc", "custom changelog mirror\n");
  touch(
    ".agents/AGENTS.md",
    "# Product\n\nDo not rewrite this paragraph.\n\n<!-- speckit-launch:pipeline -->\n\nold pipeline prose\n",
  );
  touch(".gitignore", "keep-gitignore\n");
  touch("package.json", '{"name":"keep"}\n');
  touch("scripts/link-agent-skills.mjs", "old-link\n");
  return {
    overlay: join(root, ".specify", "workflows", "overlays", "speckit", "chained-sdd.yml"),
    constitution: join(root, ".specify", "memory", "constitution.md"),
    changelog: join(root, ".agents", "rules", "changelog.md"),
    agents: join(root, ".agents", "AGENTS.md"),
    skill: join(root, ".agents", "skills", "speckit-clarify", "SKILL.md"),
    workflow: join(root, ".specify", "workflows", "speckit", "workflow.yml"),
    extra: join(root, ".specify", "presets", "chained-sdd", "local-extra.md"),
    gitignore: join(root, ".gitignore"),
    pkg: join(root, "package.json"),
  };
}

function snapshot(paths) {
  return Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, readFileSync(file, "utf8")]));
}

function specifyListsEnabled() {
  return {
    status: 0,
    stdout: "• chained-sdd (priority=10, source=project:chained-sdd, enabled)\n",
    stderr: "",
  };
}

test("detectProjectScriptType prefers init-options and does not default to bash when both shells exist", () => {
  const tmp = mkdtempSync(join(tmpdir(), "speckit-script-"));
  try {
    mkdirSync(join(tmp, ".specify", "scripts", "bash"), { recursive: true });
    mkdirSync(join(tmp, ".specify", "scripts", "powershell"), { recursive: true });
    assert.equal(detectProjectScriptType(tmp), "ps");

    writeFileSync(join(tmp, ".specify", "init-options.json"), JSON.stringify({ script: "ps" }));
    rmSync(join(tmp, ".specify", "scripts", "powershell"), { recursive: true, force: true });
    assert.equal(detectProjectScriptType(tmp), "ps");

    writeFileSync(join(tmp, ".specify", "init-options.json"), JSON.stringify({ script: "py" }));
    assert.equal(detectProjectScriptType(tmp), "py");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("missing overlay is registered with overlay add on apply, not on dry-run", () => {
  const tmp = mkdtempSync(join(tmpdir(), "speckit-overlay-add-"));
  try {
    mkdirSync(join(tmp, ".specify"), { recursive: true });
    const calls = [];
    const runSpecify = (args) => {
      calls.push(args);
      if (args[2] === "list") return { status: 0, stdout: "No overlays found\n", stderr: "" };
      return { status: 0, stdout: "added\n", stderr: "" };
    };
    const overlay = join(tmp, ".specify", "workflows", "overlays", "speckit", "chained-sdd.yml");

    const dry = syncLayer2(tmp, { dryRun: true, runSpecify });
    assert.equal(calls.some((args) => args[2] === "add"), false);
    assert.equal(existsSync(overlay), false);
    const planned = dry.actions.find((a) => a.path.endsWith("overlays/speckit/chained-sdd.yml"));
    assert.match(planned.note, /would run specify workflow overlay add --priority 10/);

    const applied = syncLayer2(tmp, { dryRun: false, runSpecify });
    const add = calls.find((args) => args[1] === "overlay" && args[2] === "add");
    assert.ok(add, "apply should register a missing overlay");
    assert.equal(add[4], "--priority");
    assert.equal(add[5], "10");
    assert.equal(existsSync(overlay), false, "successful overlay add must not fall back to a raw copy");
    const action = applied.actions.find((a) => a.path.endsWith("overlays/speckit/chained-sdd.yml"));
    assert.equal(action.overlayAdd, true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("overlay add failure copies the file, and an enabled overlay only overwrites content", () => {
  const tmp = mkdtempSync(join(tmpdir(), "speckit-overlay-copy-"));
  try {
    mkdirSync(join(tmp, ".specify"), { recursive: true });
    const overlay = join(tmp, ".specify", "workflows", "overlays", "speckit", "chained-sdd.yml");
    const calls = [];
    const failAdd = (args) => {
      calls.push(args.slice(0, 3).join(" "));
      if (args[2] === "list") return { status: 0, stdout: "No overlays found\n", stderr: "" };
      return { status: 1, stdout: "", stderr: "add failed" };
    };
    syncLayer2(tmp, { dryRun: false, runSpecify: failAdd });
    assert.ok(calls.includes("workflow overlay add"));
    const src = readFileSync(join(ROOT, "presets", "chained-sdd", "workflows", "chained-sdd.yml"), "utf8");
    assert.equal(readFileSync(overlay, "utf8").replace(/\r\n/g, "\n"), src.replace(/\r\n/g, "\n"));

    writeFileSync(overlay, "old-but-listed\n");
    const listed = [];
    const already = (args) => {
      listed.push(args[2]);
      return specifyListsEnabled();
    };
    syncLayer2(tmp, { dryRun: false, runSpecify: already });
    assert.equal(listed.includes("add"), false);
    assert.equal(readFileSync(overlay, "utf8").replace(/\r\n/g, "\n"), src.replace(/\r\n/g, "\n"));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("upgrade adds agent-roles when missing and does not overwrite an existing role prompt", () => {
  const tmp = mkdtempSync(join(tmpdir(), "speckit-agent-roles-"));
  try {
    mkdirSync(join(tmp, ".specify"), { recursive: true });
    const reviewer = join(tmp, "agent-roles", "react-reviewer.md");
    const dry = syncLayer2(tmp, { dryRun: true, runSpecify: specifyListsEnabled });
    assert.equal(existsSync(reviewer), false);
    const planned = dry.actions.find((a) => a.path === "agent-roles/react-reviewer.md");
    assert.equal(planned.status, "add");

    syncLayer2(tmp, { dryRun: false, runSpecify: specifyListsEnabled });
    const written = readFileSync(reviewer, "utf8");
    assert.match(written, /not bound to a specific agent/);
    assert.match(written, /Do not modify any files/);
    assert.match(written, /Do not ask the project to switch libraries/);
    assert.match(written, /## Scope/);
    assert.match(written, /## Versions in use/);
    assert.match(written, /prefer the resolved version over the range/);
    assert.equal(existsSync(join(tmp, "agent-roles", "react-implementer.md")), true);
    assert.equal(existsSync(join(tmp, "agent-roles", "react-checker.md")), true);
    assert.doesNotMatch(readFileSync(join(tmp, "agent-roles", "react-checker.md"), "utf8"), /agy|grok|cursor-agent/);
    assert.match(readFileSync(join(tmp, "agent-roles", "react-checker.md"), "utf8"), /Do not default to `eslint \.`/);

    writeFileSync(reviewer, "local reviewer prompt\n");
    syncLayer2(tmp, { dryRun: false, runSpecify: specifyListsEnabled });
    assert.equal(readFileSync(reviewer, "utf8"), "local reviewer prompt\n");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("upgrade dry-run does not write and skips an AGENTS.md pipeline section with no end marker", () => {
  const tmp = mkdtempSync(join(tmpdir(), "speckit-upgrade-dry-"));
  try {
    const paths = writeUpgradeFixture(tmp);
    const before = snapshot(paths);
    const result = syncLayer2(tmp, { dryRun: true });
    assert.equal(result.dryRun, true);
    assert.equal(result.scriptType, "sh");
    assert.deepEqual(snapshot(paths), before);

    const overlay = result.actions.find((a) => a.path.endsWith("chained-sdd.yml") && a.path.includes("overlays"));
    assert.equal(overlay.status, "update");
    const agents = result.actions.find((a) => a.path === ".agents/AGENTS.md");
    assert.equal(agents.status, "skip");
    assert.equal(agents.note, "pipeline section has no end marker");
    const changelog = result.actions.find((a) => a.path === ".agents/rules/changelog.md");
    assert.equal(changelog.status, "skip");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("upgrade --apply writes only the allowlist and keeps filled constitution and changelog", () => {
  const tmp = mkdtempSync(join(tmpdir(), "speckit-upgrade-apply-"));
  try {
    const paths = writeUpgradeFixture(tmp);
    const rawSkill = readFileSync(join(ROOT, "presets", "chained-sdd", "skills", "speckit-clarify", "SKILL.md"), "utf8");
    writeFileSync(paths.skill, rawSkill);
    const constitutionBefore = readFileSync(paths.constitution, "utf8");
    const changelogBefore = readFileSync(paths.changelog, "utf8");
    const agentsBefore = readFileSync(paths.agents, "utf8");
    const workflowBefore = readFileSync(paths.workflow, "utf8");
    const extraBefore = readFileSync(paths.extra, "utf8");
    const gitignoreBefore = readFileSync(paths.gitignore, "utf8");
    const pkgBefore = readFileSync(paths.pkg, "utf8");

    const result = syncLayer2(tmp, { dryRun: false, runSpecify: specifyListsEnabled });
    assert.equal(result.dryRun, false);

    const overlaySrc = readFileSync(join(ROOT, "presets", "chained-sdd", "workflows", "chained-sdd.yml"), "utf8");
    assert.equal(readFileSync(paths.overlay, "utf8").replace(/\r\n/g, "\n"), overlaySrc.replace(/\r\n/g, "\n"));
    const writtenSkill = readFileSync(paths.skill, "utf8");
    assert.ok(writtenSkill.includes(".specify/scripts/bash/check-prerequisites.sh"));
    assert.equal(writtenSkill.includes(".specify/scripts/powershell/check-prerequisites.ps1"), false);
    assert.equal(writtenSkill, adaptSkillScript(rawSkill.replace(/\r\n/g, "\n"), "sh"));

    assert.equal(readFileSync(paths.constitution, "utf8"), constitutionBefore);
    assert.equal(readFileSync(paths.changelog, "utf8"), changelogBefore);
    assert.equal(readFileSync(paths.agents, "utf8"), agentsBefore);
    assert.equal(readFileSync(paths.workflow, "utf8"), workflowBefore);
    assert.equal(readFileSync(paths.extra, "utf8"), extraBefore);
    assert.equal(readFileSync(paths.gitignore, "utf8"), gitignoreBefore);
    assert.equal(readFileSync(paths.pkg, "utf8"), pkgBefore);
    assert.equal(existsSync(join(tmp, ".specify", "presets", "chained-sdd", "preset.yml")), true);

    const agents = result.actions.find((a) => a.path === ".agents/AGENTS.md");
    assert.equal(agents.status, "skip");
    assert.match(agents.note, /pipeline section has no end marker/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("upgrade replaces only the paired AGENTS.md pipeline section", () => {
  const tmp = mkdtempSync(join(tmpdir(), "speckit-upgrade-agents-"));
  try {
    mkdirSync(join(tmp, ".specify", "scripts", "powershell"), { recursive: true });
    const agents = join(tmp, ".agents", "AGENTS.md");
    mkdirSync(join(tmp, ".agents"), { recursive: true });
    const outside = "# Product heading\n\nKeep this product paragraph.\n\n";
    writeFileSync(
      agents,
      `${outside}<!-- speckit-launch:pipeline -->\n\nold rules\n\n<!-- /speckit-launch:pipeline -->\n\n## After\n\nStill here.\n`,
    );
    const result = syncLayer2(tmp, { dryRun: false, runSpecify: specifyListsEnabled });
    const text = readFileSync(agents, "utf8");
    assert.ok(text.startsWith(outside));
    assert.ok(text.includes("## After\n\nStill here.\n"));
    assert.ok(text.includes("<!-- speckit-launch:pipeline -->"));
    assert.ok(text.includes("<!-- /speckit-launch:pipeline -->"));
    assert.ok(text.includes("specify → clarify → plan"));
    assert.equal(text.includes("old rules"), false);
    const action = result.actions.find((a) => a.path === ".agents/AGENTS.md");
    assert.equal(action.status, "update");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("speckit-launch upgrade CLI dry-run writes nothing and rejects a non-Spec Kit directory", () => {
  const tmp = mkdtempSync(join(tmpdir(), "speckit-upgrade-cli-"));
  try {
    const paths = writeUpgradeFixture(tmp);
    const before = readFileSync(paths.overlay, "utf8");
    const dry = spawnSync(process.execPath, [join(ROOT, "bin", "new-project.mjs"), "upgrade", "--dir", tmp, "--dry-run"], {
      encoding: "utf8",
    });
    assert.equal(dry.status, 0, dry.stderr);
    assert.ok(dry.stdout.includes("dry-run"));
    assert.ok(dry.stdout.includes("update"));
    assert.ok(dry.stdout.includes("pipeline section has no end marker"));
    assert.equal(readFileSync(paths.overlay, "utf8"), before);

    const empty = mkdtempSync(join(tmpdir(), "speckit-upgrade-empty-"));
    const missing = spawnSync(process.execPath, [join(ROOT, "bin", "new-project.mjs"), "upgrade", "--dir", empty], {
      encoding: "utf8",
    });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /not a Spec Kit project/);
    rmSync(empty, { recursive: true, force: true });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("upgrade refuses a Spec Kit older than 1.0 and writes nothing", () => {
  const tmp = mkdtempSync(join(tmpdir(), "speckit-upgrade-old-"));
  try {
    const paths = writeUpgradeFixture(tmp);
    writeFileSync(
      join(tmp, ".specify", "init-options.json"),
      JSON.stringify({ speckit_version: "0.9.5" }),
    );
    const before = readFileSync(paths.overlay, "utf8");
    const refused = spawnSync(
      process.execPath,
      [join(ROOT, "bin", "new-project.mjs"), "upgrade", "--apply", "--dir", tmp],
      { encoding: "utf8" },
    );
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /0\.9\.5/);
    assert.match(refused.stderr, /older than 1\.0\.0/);
    assert.equal(readFileSync(paths.overlay, "utf8"), before);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

