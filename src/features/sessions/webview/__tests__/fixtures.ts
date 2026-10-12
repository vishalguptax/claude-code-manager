/**
 * Shared test fixtures for the sessions explorer suite: a session factory and
 * a seeded workspace (one project, a filed folder, an empty folder, a pin, an
 * archived session, and a session from another project).
 */
import { act } from "@testing-library/preact";
import { normPath } from "../../../../core/utils";
import type { Session } from "../../types";
import {
  _resetExplorer,
  _resetSessionsSignals,
  sessionsSignal,
  setArchived,
  setFolderNames,
  setFolders,
  setPinned,
  setWorkspacePath,
} from "../model";

export function makeSession(id: string, over: Partial<Session> = {}): Session {
  const projectPath = over.projectPath ?? "/w/proj";
  return {
    id,
    name: `Session ${id}`,
    project: "proj",
    projectPath,
    branch: "main",
    entrypoint: "cli",
    startTime: 0,
    endTime: 0,
    messageCount: 3,
    summary: "",
    prompts: [],
    // Keyed by full path, as the host keys it (see historyParser).
    projectKey: normPath(projectPath),
    searchHaystack: `session ${id}`,
    ...over,
  };
}

/**
 * Reset every signal, then seed. Home (newest first) shows folders Work and
 * Empty, then sessions a, b, c; `w` is filed in Work, `p` is pinned (and
 * filed), `z` is archived, and `o` belongs to another project.
 */
export function seedExplorer(): void {
  _resetSessionsSignals();
  _resetExplorer();
  setWorkspacePath("/w/proj");
  sessionsSignal.value = [
    makeSession("a", { endTime: 50 }),
    makeSession("b", { endTime: 40 }),
    makeSession("c", { endTime: 30 }),
    makeSession("w", { endTime: 20 }),
    makeSession("p", { endTime: 10 }),
    makeSession("z", { endTime: 60 }),
    makeSession("o", { endTime: 70, project: "other", projectPath: "/w/other" }),
  ];
  setFolderNames(["Work", "Empty"]);
  setFolders({ w: "Work", p: "Work" });
  setPinned(["p"]);
  setArchived(["z"]);
}

/**
 * Dispatch a drag event carrying `data` (type -> value) and report whether
 * the page accepted it (called preventDefault).
 *
 * Built by hand rather than with testing-library's `fireEvent.dragOver(el,
 * { dataTransfer })`: under happy-dom, events built that way never reach the
 * element's listeners, so a drop test written with them passes or fails for
 * reasons unrelated to the code under test.
 */
export function drag(
  el: Element,
  type: "dragstart" | "dragover" | "dragleave" | "drop",
  data: Record<string, string> = {},
  init: { relatedTarget?: EventTarget | null } = {},
): { accepted: boolean; data: Record<string, string> } {
  const store = { ...data };
  const transfer = {
    types: Object.keys(store),
    getData: (t: string) => store[t] ?? "",
    setData: (t: string, v: string) => {
      store[t] = v;
    },
    setDragImage: () => {},
    effectAllowed: "",
    dropEffect: "",
  };
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "dataTransfer", { value: transfer });
  Object.defineProperty(ev, "relatedTarget", { value: init.relatedTarget ?? null });
  act(() => {
    el.dispatchEvent(ev);
  });
  return { accepted: ev.defaultPrevented, data: store };
}
