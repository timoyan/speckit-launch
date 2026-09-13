#!/usr/bin/env node

/**
 * Generic command safety gate (PreToolUse hook).
 *
 * Inspects `run_command` payloads before execution.
 * - Auto-approves safe commands (decision: "allow")
 * - Forces confirmation on destructive git and delete commands (decision: "force_ask")
 * - Denies disk format and database drop (decision: "deny")
 *
 * Project-specific deploy and database-reset commands are commented examples.
 * Uncomment and edit them in the project; do not treat them as launcher defaults.
 */

const DANGEROUS_RULES = [
  {
    pattern: /\bgit\s+reset\b.*--hard/i,
    reason: "Hard git reset discards uncommitted changes and rewinds commits.",
    decision: "force_ask",
  },
  {
    pattern: /\bgit\s+clean\b.*(-[a-zA-Z]*f|--force)/i,
    reason: "git clean --force permanently deletes untracked files.",
    decision: "force_ask",
  },
  {
    pattern: /\bgit\s+push\b.*(\s|^)(--force|-f|--force-with-lease)\b/i,
    reason: "Force pushing rewrites remote history and can destroy commits.",
    decision: "force_ask",
  },
  {
    pattern: /\bgit\s+(checkout|restore)\b.*(\s+--\s+|\s+)(\.|\*)\b/i,
    reason: "Discarding all working tree changes with git checkout/restore.",
    decision: "force_ask",
  },
  {
    pattern: /\bgit\s+branch\b.*(-D|--delete\s+--force)\b/i,
    reason: "Force-deleting a git branch may lose unmerged commits.",
    decision: "force_ask",
  },
  {
    pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\b/i,
    reason: "Recursive forced file deletion (rm -rf).",
    decision: "force_ask",
  },
  {
    pattern: /\brmdir\s+(\/s\s+\/q|\/q\s+\/s)\b/i,
    reason: "Recursive quiet directory deletion (rmdir /s /q).",
    decision: "force_ask",
  },
  {
    pattern: /\bdel\s+(\/[a-zA-Z]*[sqf][a-zA-Z]*\s+){2,}/i,
    reason: "Forceful quiet file deletion (del /f /s /q).",
    decision: "force_ask",
  },
  {
    pattern: /\b(Remove-Item|ri|erase|rd)\b.*(-Recurse|-r)\b.*(-Force|-f)\b/i,
    reason: "PowerShell recursive force deletion.",
    decision: "force_ask",
  },
  {
    pattern: /\b(mkfs|format\s+[a-zA-Z]:)\b/i,
    reason: "Disk format command.",
    decision: "deny",
  },
  {
    pattern: /\b(DROP\s+DATABASE|DROP\s+SCHEMA)\b/i,
    reason: "Destructive database drop command.",
    decision: "deny",
  },
  // Example only — enable in the project if it publishes packages:
  // { pattern: /\b(npm|yarn|pnpm)\s+publish\b/i, reason: "Package publish.", decision: "force_ask" },
  // Example only — enable for this project's deploy command, do not copy another repo's:
  // { pattern: /\bdeploy\b/i, reason: "Deployment command.", decision: "force_ask" },
  // Example only — enable for this project's database reset, do not copy another repo's:
  // { pattern: /\bdb:reset\b/i, reason: "Database reset.", decision: "force_ask" },
];

function evaluateCommand(commandLine) {
  if (!commandLine || typeof commandLine !== "string") {
    return { decision: "allow" };
  }

  for (const rule of DANGEROUS_RULES) {
    if (rule.pattern.test(commandLine)) {
      return {
        decision: rule.decision || "force_ask",
        reason: `[Safety Gate] ${rule.reason} (matched: ${rule.pattern})`,
      };
    }
  }

  return { decision: "allow" };
}

function main() {
  let rawInput = "";
  process.stdin.setEncoding("utf8");

  process.stdin.on("data", (chunk) => {
    rawInput += chunk;
  });

  process.stdin.on("end", () => {
    try {
      if (!rawInput.trim()) {
        process.stdout.write(JSON.stringify({ decision: "allow" }));
        return;
      }

      const payload = JSON.parse(rawInput);
      const args = payload?.toolCall?.args || {};
      const commandLine =
        args.CommandLine || args.commandLine || args.command || "";

      const result = evaluateCommand(commandLine);
      process.stdout.write(JSON.stringify(result));
    } catch (err) {
      process.stdout.write(
        JSON.stringify({
          decision: "ask",
          reason: `Safety check parse error: ${err.message}`,
        }),
      );
    }
  });
}

if (require.main === module) {
  main();
} else {
  module.exports = { evaluateCommand, DANGEROUS_RULES };
}
