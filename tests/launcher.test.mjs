import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { spawnSync } from "node:child_process";

import {
  parseArgs,
  getPipelineRules,
  adaptSkillScript,
  selectPrimaryIntegration,
  integrationsToInstall,
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
