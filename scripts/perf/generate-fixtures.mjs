#!/usr/bin/env node
/**
 * Generate a synthetic ~/.claude tree for performance measurement.
 *
 * Writes `<root>/projects/<slug>/<sessionId>.jsonl` files whose line shapes
 * mirror what Claude Code actually writes (user/assistant turns with
 * sessionId, timestamp, cwd, gitBranch, and a usage block on assistant
 * messages), so the real sessions parser exercises its true hot path.
 *
 * Usage:
 *   node scripts/perf/generate-fixtures.mjs --count 5000 [--root <dir>] [--projects 25] [--turns 20]
 *
 * Default root is `<os.tmpdir()>/claude-manager-perf-home`. The measure
 * script points the parser at this root via HOME / USERPROFILE.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const count = Number.parseInt(arg("count", "5000"), 10);
const projectCount = Number.parseInt(arg("projects", "25"), 10);
const turnsPerSession = Number.parseInt(arg("turns", "16"), 10);
const root = arg("root", path.join(os.tmpdir(), "claude-manager-perf-home"));

const projectsDir = path.join(root, ".claude", "projects");
fs.rmSync(path.join(root, ".claude"), { recursive: true, force: true });
fs.mkdirSync(projectsDir, { recursive: true });

const BRANCHES = ["main", "develop", "feature/x", "fix/y", "release/z"];

/** One JSONL line for a session turn. */
function turnLine(sessionId, cwd, branch, role, i, baseTs) {
  const ts = new Date(baseTs + i * 1000).toISOString();
  const base = {
    type: role,
    sessionId,
    uuid: randomUUID(),
    timestamp: ts,
    cwd,
    gitBranch: branch,
  };
  if (role === "user") {
    return JSON.stringify({
      ...base,
      message: { role: "user", content: `prompt ${i} for ${sessionId}` },
    });
  }
  return JSON.stringify({
    ...base,
    message: {
      role: "assistant",
      model: "claude-opus-4-7",
      content: [{ type: "text", text: `reply ${i} with some content to parse` }],
      usage: {
        input_tokens: 1200 + i,
        output_tokens: 400 + i,
        cache_read_input_tokens: 800,
        cache_creation_input_tokens: 100,
      },
    },
  });
}

const startTs = Date.now() - count * 60_000;
let written = 0;

for (let p = 0; p < projectCount; p++) {
  const slug = `-Users-perf-project-${p}`;
  const cwd = `/Users/perf/project-${p}`;
  const dir = path.join(projectsDir, slug);
  fs.mkdirSync(dir, { recursive: true });

  const perProject = Math.ceil(count / projectCount);
  for (let s = 0; s < perProject && written < count; s++) {
    const sessionId = randomUUID();
    const branch = BRANCHES[(p + s) % BRANCHES.length];
    const baseTs = startTs + written * 60_000;
    const lines = [];
    for (let t = 0; t < turnsPerSession; t++) {
      lines.push(turnLine(sessionId, cwd, branch, t % 2 === 0 ? "user" : "assistant", t, baseTs));
    }
    fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), lines.join("\n") + "\n");
    written++;
  }
}

console.log(
  JSON.stringify({
    root,
    projectsDir,
    sessions: written,
    projects: projectCount,
    turnsPerSession,
  }),
);
