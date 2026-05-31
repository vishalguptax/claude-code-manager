/**
 * Git integration — requires VS Code API.
 */
import * as vscode from "vscode";

/** Minimal interface for the VS Code built-in Git extension API. */
interface GitExtensionAPI {
  getAPI(version: number): GitAPI;
}

interface GitAPI {
  repositories: GitRepository[];
  onDidOpenRepository: vscode.Event<GitRepository>;
}

interface GitRepository {
  state: {
    HEAD?: {
      name?: string;
    };
    onDidChange: vscode.Event<void>;
  };
}

/**
 * Get the current Git branch name from the first repository in the workspace.
 * Returns an empty string if the Git extension is not active, no repo is open,
 * or the branch cannot be determined.
 */
export function getCurrentBranch(): string {
  try {
    const gitExt = vscode.extensions.getExtension<GitExtensionAPI>("vscode.git");
    if (!gitExt?.isActive) {
      return "";
    }
    const git = gitExt.exports.getAPI(1);
    const repo = git.repositories[0];
    return repo?.state?.HEAD?.name ?? "";
  } catch {
    return "";
  }
}

/**
 * Subscribe to branch changes (checkouts, detached HEAD, repo open/close).
 * Returns a Disposable that removes every underlying listener — the caller
 * must keep the returned value alive and dispose it when the subscriber
 * goes away. Fires `onChange` without arguments; consumers call
 * `getCurrentBranch()` themselves when they need the latest value.
 *
 * The Git extension activates asynchronously, so we retry once after
 * 2000ms when it is not ready yet. Any failure is swallowed — git is
 * optional; a workspace with no repo should not spew errors.
 */
export function onBranchChange(onChange: () => void): vscode.Disposable {
  const inner: vscode.Disposable[] = [];

  const attach = (): boolean => {
    const gitExt = vscode.extensions.getExtension<GitExtensionAPI>("vscode.git");
    if (!gitExt?.isActive) return false;
    try {
      const git = gitExt.exports.getAPI(1);
      for (const repo of git.repositories) {
        inner.push(repo.state.onDidChange(() => onChange()));
      }
      // New repos (e.g. a user clones/opens a folder after activation)
      // also need to be wired, otherwise the chip stays stale.
      inner.push(
        git.onDidOpenRepository((repo) => {
          inner.push(repo.state.onDidChange(() => onChange()));
          onChange();
        }),
      );
      // Fire once on attach so subscribers get the current branch as soon
      // as the git extension is up — otherwise the initial post made
      // before activation lands as "" and any (current) marker on the
      // sidebar's branch list stays cold until the user checks out.
      if (git.repositories.length > 0) onChange();
      return true;
    } catch {
      return false;
    }
  };

  if (!attach()) {
    const timer = setTimeout(() => attach(), 2000);
    inner.push({ dispose: () => clearTimeout(timer) });
  }

  return {
    dispose: () => {
      for (const d of inner) {
        try {
          d.dispose();
        } catch {
          // ignore — best-effort cleanup on webview dispose
        }
      }
    },
  };
}
