#!/usr/bin/env node
/**
 * Recreate per-agent skill mounts -> .agents/skills
 * Canonical skills live only in .agents/skills.
 * Mounts under .github / .grok / .cursor / .claude / .codex are discovery aids
 * so those agents can find the same skill set — not agent lock-in.
 * Windows: directory junction; macOS/Linux: relative symlink.
 *
 * Usage: node scripts/link-agent-skills.mjs
 *    or: npm run link-skills
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const canonical = join(root, ".agents", "skills");
const links = [
  ".github/skills",
  ".grok/skills",
  ".cursor/skills",
  ".claude/skills",
  ".codex/skills",
];
const isWindows = process.platform === "win32";

function pathsEqual(a, b) {
  let na = a;
  let nb = b;
  try {
    na = realpathSync(a);
    nb = realpathSync(b);
  } catch {
    na = resolve(a);
    nb = resolve(b);
  }
  na = String(na).replace(/\\/g, "/");
  nb = String(nb).replace(/\\/g, "/");
  return isWindows ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

if (!existsSync(canonical)) {
  console.error(`Canonical skills missing: ${canonical}`);
  process.exit(1);
}

function isMountOrMissing(path) {
  try {
    const st = lstatSync(path);
    if (st.isSymbolicLink()) return "symlink";
    if (!st.isDirectory()) {
      throw new Error(`${path} exists and is not a directory or symlink`);
    }
    // Windows junction: readlink usually works; realpath equals canonical.
    try {
      readlinkSync(path);
      return "junction";
    } catch {
      /* continue */
    }
    try {
      if (pathsEqual(path, canonical)) return "junction";
    } catch {
      /* continue */
    }
    if (readdirSync(path).length === 0) return "empty-dir";
    throw new Error(`${path} exists as a real directory with files. Move or remove it first.`);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return "missing";
    }
    throw err;
  }
}

for (const rel of links) {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });

  const kind = isMountOrMissing(path);
  if (kind !== "missing") {
    rmSync(path, { recursive: true, force: true });
  }

  if (isWindows) {
    symlinkSync(canonical, path, "junction");
  } else {
    symlinkSync(relative(dirname(path), canonical), path, "dir");
  }
  console.log(`linked ${rel} -> .agents/skills`);
}

console.log("Done. Skills are canonical at .agents/skills");
