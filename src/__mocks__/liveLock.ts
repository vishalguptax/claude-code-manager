/**
 * Test helper: create a lock directory held by a simulated live holder.
 *
 * A real holder (Claude Code, another window) proves it is alive by renewing
 * the directory's mtime, so its lock never ages past the stale window while
 * it works. A freshly created directory only models that for the first few
 * seconds: on a loaded machine one retry sleep inside withLocks can stall
 * long enough that the "held" lock reads as abandoned and gets reclaimed,
 * which turns a lock-contention test into a coin toss. Dating the mtime an
 * hour ahead models the renewing holder for the whole test.
 */
import * as fs from "fs";

export function holdLiveLock(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const renewed = new Date(Date.now() + 60 * 60_000);
  fs.utimesSync(dir, renewed, renewed);
}
