#!/usr/bin/env node
/**
 * Sample every PID file under ~/.claude/sessions/ on a short interval
 * and print each unique (sessionId, status) transition observed. Run
 * while interacting with Claude across all your active sessions to
 * surface every status string the CLI emits — useful for deciding
 * which dot variants need bespoke styling.
 *
 *   node scripts/observe-cli-statuses.mjs [intervalMs]
 *
 * Ctrl+C prints a summary of all unique status strings seen.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SESSIONS = path.join(os.homedir(), ".claude", "sessions");
const INTERVAL = Number(process.argv[2] ?? 500);

const lastStatus = new Map();
const allStatuses = new Set();

function tick() {
  let files;
  try {
    files = fs.readdirSync(SESSIONS);
  } catch {
    return;
  }
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(SESSIONS, f), "utf-8"));
    } catch {
      continue;
    }
    const sid = data.sessionId;
    if (!sid) continue;
    const status = typeof data.status === "string" ? data.status : "(none)";
    const prev = lastStatus.get(sid);
    if (prev !== status) {
      const ts = new Date().toISOString().slice(11, 19);
      const shortSid = sid.slice(0, 8);
      console.log(`[${ts}] ${shortSid}  ${prev ?? "(new)"} → ${status}`);
      lastStatus.set(sid, status);
      allStatuses.add(status);
    }
  }
}

console.log(`Watching ${SESSIONS} every ${INTERVAL}ms. Ctrl+C to summarize.\n`);
tick();
const handle = setInterval(tick, INTERVAL);

process.on("SIGINT", () => {
  clearInterval(handle);
  console.log("\n── Unique statuses observed ──");
  for (const s of [...allStatuses].sort()) console.log(`  ${s}`);
  process.exit(0);
});
