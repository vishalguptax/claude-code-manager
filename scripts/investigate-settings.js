#!/usr/bin/env node
/**
 * Investigate where Claude Code stores its config settings.
 *
 * Usage:
 *   1. node scripts/investigate-settings.js snapshot
 *   2. In a separate terminal: run `claude` → `/config` → change a setting → save
 *   3. node scripts/investigate-settings.js diff
 *
 * The diff will show exactly which files were created, modified, or had content
 * changes after you modified a setting in the Claude CLI.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const SNAPSHOT_FILE = path.join(__dirname, ".settings-snapshot.json");

const IGNORE = new Set(["projects", "shell-snapshots", "statsig", "image-cache"]);
const IGNORE_EXT = new Set([".jsonl", ".log"]);

function hashContent(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(content).digest("hex").slice(0, 12);
  } catch {
    return "unreadable";
  }
}

function walk(dir, out = {}) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (IGNORE.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(CLAUDE_DIR, full);

    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile()) {
      if (IGNORE_EXT.has(path.extname(entry.name))) continue;
      try {
        const stat = fs.statSync(full);
        if (stat.size > 1024 * 1024) {
          out[rel] = { size: stat.size, mtime: stat.mtimeMs, hash: "large-file" };
        } else {
          out[rel] = {
            size: stat.size,
            mtime: stat.mtimeMs,
            hash: hashContent(full),
          };
        }
      } catch {
        // skip
      }
    }
  }
  return out;
}

function takeSnapshot() {
  console.log(`Scanning ${CLAUDE_DIR}...`);
  const snap = walk(CLAUDE_DIR);
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snap, null, 2));
  console.log(`Snapshot saved with ${Object.keys(snap).length} files.`);
  console.log();
  console.log("Now open Claude in a terminal, run /config, change a setting, save, and exit.");
  console.log("Then run: node scripts/investigate-settings.js diff");
}

function showContentDiff(filePath, key) {
  console.log();
  console.log(`  Current content of ${key}:`);
  console.log("  " + "-".repeat(70));
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    if (lines.length > 30) {
      console.log("  " + lines.slice(0, 30).join("\n  "));
      console.log(`  ... (${lines.length - 30} more lines)`);
    } else {
      console.log("  " + content.replace(/\n/g, "\n  "));
    }
  } catch (err) {
    console.log(`  (could not read: ${err.message})`);
  }
  console.log("  " + "-".repeat(70));
}

function runDiff() {
  if (!fs.existsSync(SNAPSHOT_FILE)) {
    console.error("No snapshot found. Run `node scripts/investigate-settings.js snapshot` first.");
    process.exit(1);
  }

  const before = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf-8"));
  const after = walk(CLAUDE_DIR);

  const added = [];
  const modified = [];
  const removed = [];

  for (const key of Object.keys(after)) {
    if (!before[key]) {
      added.push(key);
    } else if (before[key].hash !== after[key].hash) {
      modified.push(key);
    }
  }

  for (const key of Object.keys(before)) {
    if (!after[key]) removed.push(key);
  }

  console.log();
  console.log("=".repeat(72));
  console.log("Settings investigation — what changed in ~/.claude/ ?");
  console.log("=".repeat(72));

  if (added.length === 0 && modified.length === 0 && removed.length === 0) {
    console.log();
    console.log("No changes detected.");
    console.log();
    console.log("Possible reasons:");
    console.log("  - You didn't save the setting (press Enter in /config)");
    console.log("  - Claude stores this setting in memory, not on disk");
    console.log("  - The setting is stored in an ignored directory (projects/, statsig/)");
    console.log("  - Claude writes to a binary/database we're not tracking");
    return;
  }

  if (added.length) {
    console.log();
    console.log("NEW FILES (created by Claude):");
    for (const key of added) {
      console.log(`  + ${key}`);
      showContentDiff(path.join(CLAUDE_DIR, key), key);
    }
  }

  if (modified.length) {
    console.log();
    console.log("MODIFIED FILES:");
    for (const key of modified) {
      console.log(`  ~ ${key}`);
      showContentDiff(path.join(CLAUDE_DIR, key), key);
    }
  }

  if (removed.length) {
    console.log();
    console.log("REMOVED FILES:");
    for (const key of removed) {
      console.log(`  - ${key}`);
    }
  }

  console.log();
  console.log("=".repeat(72));
  console.log("Match the setting you changed against the file contents above.");
  console.log("The key that now contains your new value tells us where to read/write.");
  console.log("=".repeat(72));
}

const cmd = process.argv[2];
if (cmd === "snapshot") {
  takeSnapshot();
} else if (cmd === "diff") {
  runDiff();
} else {
  console.log("Usage:");
  console.log("  node scripts/investigate-settings.js snapshot   # before changing setting");
  console.log("  node scripts/investigate-settings.js diff       # after changing setting");
}
