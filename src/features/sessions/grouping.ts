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
 * Group sessions by date label (Today, Yesterday, This Week, This Month, Older).
 * Groups are returned in chronological order; only non-empty groups are included.
 */
export function groupSessions(sessions: Session[]): SessionGroup[] {
  const groups = new Map<string, Session[]>();
  const order = ["Today", "Yesterday", "This Week", "This Month", "Older"];

  for (const session of sessions) {
    const label = getDateGroup(session.endTime);
    const group = groups.get(label) ?? [];
    group.push(session);
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
    projects.add(s.project);
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

/**
 * Get a sorted list of unique project names across all sessions.
 */
export function getUniqueProjects(sessions: Session[]): string[] {
  return [...new Set(sessions.map((s) => s.project))].sort();
}

/**
 * Filter sessions by a text query. Case-insensitive.
 *
 * Fast path uses the pre-computed `searchHaystack` field — one `includes()`
 * per session instead of four `.toLowerCase().includes()` calls. Falls back
 * to scanning individual prompts only if the haystack misses, keeping the
 * common case allocation-free while still finding deep matches.
 */
export function searchSessions(sessions: Session[], query: string): Session[] {
  const lower = query.toLowerCase();
  return sessions.filter((s) => {
    if (s.searchHaystack.includes(lower)) return true;
    // Slow path — scan prompts. Prompts are not in the haystack because
    // they can be huge (50KB+) and would bloat every session payload.
    return s.prompts.some((p) => p.toLowerCase().includes(lower));
  });
}

/**
 * Filter sessions by project name, branch, and/or date range.
 * All filters are optional; only provided filters are applied.
 */
export function filterSessions(
  sessions: Session[],
  filters: {
    project?: string;
    branch?: string;
    dateRange?: [number, number];
  },
): Session[] {
  let result = sessions;
  if (filters.project) {
    result = result.filter((s) => s.project === filters.project);
  }
  if (filters.branch) {
    result = result.filter((s) => s.branch === filters.branch);
  }
  if (filters.dateRange) {
    const [from, to] = filters.dateRange;
    result = result.filter((s) => s.endTime >= from && s.endTime <= to);
  }
  return result;
}
