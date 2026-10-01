/**
 * Session list shaping — grouping, stats, and filtering.
 *
 * Pure functions over an already-parsed `Session[]`. No file I/O and no
 * VS Code dependency: the view provider feeds these its cached session
 * list and forwards the results to the webview.
 */
import type { Session, SessionGroup, Stats } from "./types";

/**
 * Determine which date group label a timestamp belongs to.
 */
function getDateGroup(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  const monthAgo = new Date(today.getTime() - 30 * 86400000);

  if (date >= today) return "Today";
  if (date >= yesterday) return "Yesterday";
  if (date >= weekAgo) return "This Week";
  if (date >= monthAgo) return "This Month";
  return "Older";
}

/**
 * Trim a session to what the LIST needs before it crosses the postMessage
 * boundary. The list renders only `prompts[0]`, and its search runs off the
 * pre-lowered `searchHaystack`; the full `prompts` array (each entry can be
 * 50 KB+) is never read webview-side and only bloats the serialized payload
 * and the webview's retained copy. The host keeps the full array in its own
 * cache (`ctx.getSessions()`) for the transcript search. Sessions with a single prompt pass through
 * unchanged (no needless clone).
 */
function trimForList(s: Session): Session {
  if (s.prompts.length <= 1) return s;
  return { ...s, prompts: [s.prompts[0]] };
}

/**
 * Group sessions by date label (Today, Yesterday, This Week, This Month, Older).
 * Groups are returned in chronological order; only non-empty groups are included.
 */
export function groupSessions(sessions: Session[]): SessionGroup[] {
  const groups = new Map<string, Session[]>();
  const order = ["Today", "Yesterday", "This Week", "This Month", "Older"];

  for (const session of sessions) {
    const label = getDateGroup(session.endTime);
    const group = groups.get(label) ?? [];
    group.push(trimForList(session));
    groups.set(label, group);
  }

  return order
    .filter((label) => groups.has(label))
    .map((label) => ({
      label,
      sessions: groups.get(label)!,
    }));
}

/**
 * Compute aggregate statistics for a set of sessions.
 */
export function getStats(sessions: Session[]): Stats {
  const projects = new Set<string>();
  const weekAgo = Date.now() - 7 * 86400000;
  let thisWeek = 0;
  let totalMessages = 0;

  for (const s of sessions) {
    projects.add(s.projectKey);
    if (s.endTime >= weekAgo) thisWeek++;
    totalMessages += s.messageCount;
  }

  return {
    totalSessions: sessions.length,
    totalProjects: projects.size,
    thisWeek,
    totalMessages,
  };
}
