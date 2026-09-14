#!/usr/bin/env node
/**
 * Start one Herdr session and one pane per agent-roles/*.md file.
 * Does not choose roles from the diff, and does not run Spec Kit converge.
 *
 * Usage:
 *   node scripts/start-herdr-roles.mjs --kind agy
 *   node scripts/start-herdr-roles.mjs --kind agy --only react-checker,react-reviewer
 *   npm run herdr:roles -- --kind agy
 */
import { spawn, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const AGENT_NAME = /^[a-z][a-z0-9_-]{0,31}$/;

function die(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function sessionNameFromRepo(repo) {
  const slug = repo
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const base = slug && /[a-z0-9]/.test(slug) ? slug : "project";
  return `speckit-${base}`.slice(0, 40);
}

function parseArgs(argv) {
  const opts = {
    kind: "",
    only: null,
    session: "",
    dryRun: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--kind") opts.kind = argv[++i] || "";
    else if (arg === "--session") opts.session = argv[++i] || "";
    else if (arg === "--only") opts.only = (argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else die(`Unknown argument: ${arg}`);
  }
  return opts;
}

function printHelp() {
  console.log(`Usage:
  node scripts/start-herdr-roles.mjs --kind <agent> [--only a,b] [--session name] [--dry-run]

Starts one Herdr session and one pane per agent-roles/*.md file. Does not pick
roles from the git diff. Re-running skips a pane whose agent name is already live.

Options:
  --kind <agent>     Required. herdr agent kind (agy, claude, cursor, ...)
  --only a,b         Role file stems to start. Default: every agent-roles/*.md
  --session <name>   Named session. Default outside Herdr: speckit-<repo>. Inside a pane: the current session.
  --dry-run          Print the plan. Do not call herdr
  -h, --help         Show this help

After it returns, from a terminal that is not already inside Herdr:
  herdr session attach <session>
`);
}

function listRoles(only) {
  const dir = join(root, "agent-roles");
  if (!existsSync(dir)) die(`No agent-roles/ directory in ${root}`);
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => ({
      name: basename(name, ".md"),
      path: join(dir, name),
      rel: `agent-roles/${name}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (files.length === 0) die("agent-roles/ has no .md role files");
  const selected = only
    ? only.map((name) => {
        const role = files.find((item) => item.name === name);
        if (!role) die(`No agent-roles/${name}.md`);
        return role;
      })
    : files;
  for (const role of selected) {
    if (!AGENT_NAME.test(role.name)) {
      die(`Role file stem must match ${AGENT_NAME} (herdr agent name): ${role.rel}`);
    }
  }
  return selected;
}

function parseJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const start = raw.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(raw.slice(start));
  } catch {
    return null;
  }
}

function herdrArgs(session, args) {
  return session ? ["--session", session, ...args] : args;
}

function herdr(session, args, { allowFail = false } = {}) {
  const res = spawnSync("herdr", herdrArgs(session, args), {
    encoding: "utf8",
    windowsHide: true,
  });
  if (res.error) {
    if (res.error.code === "ENOENT") die("herdr is not on PATH");
    die(res.error.message);
  }
  const json = parseJson(res.stdout) || parseJson(res.stderr);
  if (res.status !== 0 || json?.error) {
    const message = json?.error?.message || (res.stderr || res.stdout || "").trim() || `herdr exited ${res.status}`;
    if (allowFail) return { ok: false, json, message, code: json?.error?.code || "" };
    die(message);
  }
  return { ok: true, json, message: "", code: "" };
}

function resultOf(call) {
  return call.json?.result || {};
}

function ensureServer(session) {
  const listed = herdr(session, ["workspace", "list"], { allowFail: true });
  if (listed.ok) return;
  if (listed.code !== "server_not_running") die(listed.message);
  const child = spawn("herdr", session ? ["--session", session, "server"] : ["server"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    sleep(300);
    const again = herdr(session, ["workspace", "list"], { allowFail: true });
    if (again.ok) return;
    if (again.code && again.code !== "server_not_running") die(again.message);
  }
  die(`herdr session '${session}' did not become ready. Attach manually: herdr session attach ${session}`);
}

function agentRecords(session) {
  const listed = resultOf(herdr(session, ["agent", "list"]));
  const agents = Array.isArray(listed.agents) ? listed.agents : [];
  return agents.map((agent) => ({
    name: agent.name || agent.agent_name || "",
    paneId: agent.pane_id || agent.pane?.pane_id || "",
  }));
}

function panesIn(session, workspaceId) {
  const listed = resultOf(herdr(session, ["pane", "list"]));
  const panes = Array.isArray(listed.panes) ? listed.panes : [];
  return panes.filter((pane) => pane.workspace_id === workspaceId);
}

function ensureWorkspace(session, label) {
  const listed = resultOf(herdr(session, ["workspace", "list"]));
  const existing = (listed.workspaces || []).find((ws) => ws.label === label);
  if (existing) return existing.workspace_id;
  const created = resultOf(
    herdr(session, ["workspace", "create", "--cwd", root, "--label", label, "--no-focus"]),
  );
  const id = created.workspace?.workspace_id;
  if (!id) die("herdr workspace create did not return a workspace id");
  return id;
}

function claimPane(session, workspaceId, roleName, splitFrom) {
  const live = new Set(agentRecords(session).map((agent) => agent.paneId).filter(Boolean));
  const panes = panesIn(session, workspaceId);
  if (panes.length === 0) die(`Workspace ${workspaceId} has no panes`);
  const labeled = panes.find((pane) => pane.label === roleName && !live.has(pane.pane_id));
  if (labeled) return labeled.pane_id;
  const blank = panes.find((pane) => !pane.label && !live.has(pane.pane_id));
  if (blank) {
    herdr(session, ["pane", "rename", blank.pane_id, roleName]);
    return blank.pane_id;
  }
  const direction = panes.length % 2 === 1 ? "right" : "down";
  const split = resultOf(
    herdr(session, [
      "pane",
      "split",
      splitFrom || panes[panes.length - 1].pane_id,
      "--direction",
      direction,
      "--cwd",
      root,
      "--no-focus",
    ]),
  );
  const paneId = split.pane?.pane_id;
  if (!paneId) die(`herdr pane split did not return a pane id for ${roleName}`);
  herdr(session, ["pane", "rename", paneId, roleName]);
  return paneId;
}

function startAgent(session, role, kind) {
  let last = "";
  for (let attempt = 1; attempt <= 6; attempt++) {
    const timeout = attempt < 6 ? "5000" : "30000";
    const started = herdr(
      session,
      ["agent", "start", role.name, "--kind", kind, "--pane", role.paneId, "--timeout", timeout],
      { allowFail: true },
    );
    if (started.ok) return;
    last = started.message;
    sleep(500);
  }
  die(`Could not start ${role.name} (${kind}) in ${role.paneId}: ${last}`);
}

function sendPrompt(session, role) {
  const text = readFileSync(role.path, "utf8");
  const prompted = herdr(session, ["agent", "prompt", role.name, text], { allowFail: true });
  if (!prompted.ok) {
    console.error(`Started ${role.name}, but prompt was not accepted: ${prompted.message}`);
    console.error(`Attach and send agent-roles/${role.name}.md yourself if the agent is waiting for approval.`);
  }
}

const opts = parseArgs(process.argv.slice(2).filter((arg) => arg !== "--"));
if (opts.help) {
  printHelp();
  process.exit(0);
}
if (!opts.kind) {
  printHelp();
  die("--kind is required");
}

const roles = listRoles(opts.only);
const insideHerdr = process.env.HERDR_ENV === "1";
const currentSession = process.env.HERDR_SESSION || "default";
const namedDefault = sessionNameFromRepo(basename(root));
const session = opts.session || (insideHerdr ? currentSession : namedDefault);
const inherited = insideHerdr && !opts.session && session === "default";
const herdrSession = inherited ? "" : session;
const label = `roles-${namedDefault.replace(/^speckit-/, "")}`;

if (opts.dryRun) {
  console.log(`session: ${session}`);
  console.log(`workspace: ${label}`);
  console.log(`kind: ${opts.kind}`);
  console.log("roles:");
  for (const role of roles) console.log(`  ${role.name}  ${role.rel}`);
  console.log("dry-run (no herdr commands)");
  process.exit(0);
}

ensureServer(herdrSession);
const workspaceId = ensureWorkspace(herdrSession, label);
const started = [];
const skipped = [];

for (const role of roles) {
  const live = agentRecords(herdrSession);
  if (live.some((agent) => agent.name === role.name)) {
    skipped.push(role.name);
    console.log(`skip ${role.name} (already running)`);
    continue;
  }
  const panes = panesIn(herdrSession, workspaceId);
  role.paneId = claimPane(herdrSession, workspaceId, role.name, panes.at(-1)?.pane_id);
  startAgent(herdrSession, role, opts.kind);
  sendPrompt(herdrSession, role);
  started.push(role.name);
  console.log(`started ${role.name} in ${role.paneId}`);
}

const sameSession = insideHerdr && (opts.session ? opts.session === currentSession : true);
let attach = "";
if (sameSession) {
  attach = "Panes are in this Herdr session. Use the sidebar. Do not run herdr session attach from this pane.";
} else if (insideHerdr) {
  attach = `This pane is already inside Herdr, so nested attach is blocked.
Detach with Ctrl+B then q, open a normal terminal, then:
  herdr session attach ${session}`;
} else {
  attach = `Attach:
  herdr session attach ${session}`;
}

console.log(`
Session: ${session}
Started: ${started.join(", ") || "(none)"}
Skipped: ${skipped.join(", ") || "(none)"}

${attach}
`);
