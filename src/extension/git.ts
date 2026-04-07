import * as vscode from "vscode";

/** Minimal interface for the VS Code built-in Git extension API. */
interface GitExtensionAPI {
  getAPI(version: number): GitAPI;
}

interface GitAPI {
  repositories: GitRepository[];
}

interface GitRepository {
  state: {
    HEAD?: {
      name?: string;
    };
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
