#!/usr/bin/env node
/**
 * Create a new Git Worktree with automatic skill mount linking.
 * Allows multiple AI agents to run Spec Kit pipelines concurrently
 * on isolated branches without working-directory collisions.
 *
 * Usage:
 *   node scripts/new-worktree.mjs <branch-name> [target-dir]
 *   npm run worktree:new -- <branch-name> [target-dir]
 *
 * Examples:
 *   node scripts/new-worktree.mjs 002-billing
 *   node scripts/new-worktree.mjs 003-auth ../app-auth
 */
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));

function die(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function run(cmd, args, cwd = root) {
  const res = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    die(`Command failed (${res.status}): ${cmd} ${args.join(" ")}`);
  }
}

function isGitRepo() {
  const res = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: root,
    stdio: "ignore",
  });
  return res.status === 0;
}

function branchExists(branch) {
  const res = spawnSync("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], {
    cwd: root,
    stdio: "ignore",
  });
  return res.status === 0;
}

const args = process.argv.slice(2).filter((a) => a !== "--");

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(`Usage:
  node scripts/new-worktree.mjs <branch-name> [target-dir]
  npm run worktree:new -- <branch-name> [target-dir]

Arguments:
  <branch-name>  Name of the feature branch (e.g. 002-billing, feat-auth)
  [target-dir]   Path for the new worktree (default: ../<repo>-<branch-name>)

Examples:
  node scripts/new-worktree.mjs 002-billing
  node scripts/new-worktree.mjs 003-auth ../app-auth
`);
  process.exit(args.length === 0 ? 1 : 0);
}

if (!isGitRepo()) {
  die("Not inside a Git repository. Please initialize Git first with 'git init'.");
}

const branch = args[0];
const repoName = basename(root);
const defaultTarget = resolve(join(root, "..", `${repoName}-${branch}`));
const targetDir = args[1] ? resolve(args[1]) : defaultTarget;

if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
  die(`Target directory already exists and is not empty: ${targetDir}`);
}

console.log(`Setting up worktree for branch '${branch}'...`);
console.log(`  Repo root:   ${root}`);
console.log(`  Target path: ${targetDir}`);

const exists = branchExists(branch);
const gitArgs = exists
  ? ["worktree", "add", targetDir, branch]
  : ["worktree", "add", targetDir, "-b", branch];

run("git", gitArgs);

// Link agent skills in the new worktree
const linkScriptPath = join(targetDir, "scripts", "link-agent-skills.mjs");
if (existsSync(linkScriptPath)) {
  console.log(`Linking agent skills in new worktree...`);
  run(process.execPath, [linkScriptPath], targetDir);
}

console.log(`
✔ Worktree ready at:
  ${targetDir}

To start developing in this isolated branch:
  cd "${targetDir}"

Primary AI Agent next steps:
  1. Open ${targetDir} in your AI agent (Cursor, Claude, Antigravity, etc.)
  2. Run /speckit-specify <feature description> to begin the chained pipeline

When the feature is completed and merged:
  git worktree remove "${targetDir}"
`);
