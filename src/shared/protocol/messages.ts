export type SettingsScope = "global" | "project" | "local";
export type PermissionList = "allow" | "deny";
export type DetailMode = "first" | "last";

export type Message =
  | { type: "ready" }
  | { type: "markDemoSeen" }
  | { type: "refresh" }
  | { type: "newSession" }
  | { type: "newTempSession" }
  | { type: "continueLastSession" }
  | { type: "resumeSession"; sessionId: string; entrypoint?: string; projectPath?: string }
  | { type: "resumeMultiple"; sessionIds: string[]; projectPaths?: string[] }
  | { type: "getSessionDetail"; sessionId: string; mode?: DetailMode; query?: string }
  | { type: "pinSession"; sessionId: string }
  | { type: "unpinSession"; sessionId: string }
  | { type: "confirmDelete"; sessionId: string; callback?: string }
  | { type: "renameSession"; sessionId: string }
  | { type: "forkSession"; sessionId: string }
  | { type: "copyCommand"; sessionId: string }
  | { type: "openProject"; projectPath: string }
  | { type: "openUrl"; url: string }
  | { type: "exportSession"; sessionId: string }
  | { type: "importSession" }
  | { type: "searchFullText"; query: string }
  | { type: "launchChatWithPrompt"; prompt: string }
  | { type: "openProjectAndChat"; projectPath: string }
  | { type: "reloadAll" }
  | { type: "bulkPinSessions"; ids: string[]; pin: boolean }
  | { type: "bulkDeleteSessions"; ids: string[] }
  | { type: "bulkExportSessions"; ids: string[] }
  | { type: "getSkills" }
  | { type: "getSkillDetail"; skillId: string }
  | { type: "openSkillFile"; skillPath: string }
  | { type: "deleteSkill"; skillPath: string }
  | { type: "getCommands" }
  | { type: "openCommandFile"; path: string }
  | { type: "getHooks" }
  | { type: "openSettingsFile"; scope: SettingsScope }
  | { type: "toggleHookEnabled"; hook: unknown }
  | { type: "deleteHook"; hook: unknown }
  | { type: "updateHook"; original: unknown; next: { matcher: string; command: string } }
  | { type: "promptAddHook" }
  | { type: "getMcpServers" }
  | { type: "openMcpConfig"; scope: string; name?: string }
  | { type: "toggleMcpServer"; name: string; scope: string; disabled: boolean; pluginName?: string }
  | { type: "deleteMcpServer"; name: string; scope: string }
  | { type: "getAgents" }
  | { type: "openAgentFile"; path: string }
  | { type: "getAccountData" }
  | { type: "launchSlash"; command: string }
  | { type: "setModel"; model: string }
  | { type: "setVoiceEnabled"; value: boolean }
  | { type: "setCommitAttribution"; value: string }
  | { type: "setPrAttribution"; value: string }
  | { type: "removePermission"; scope: SettingsScope; tool: string; list: PermissionList }
  | { type: "promptAddPermission"; scope: SettingsScope; list: PermissionList }
  | { type: "promptCustomModel" }
  | { type: "restoreClaudeConfig" }
  | { type: "fetchQuota" }
  | { type: "installStatusline" }
  | { type: "uninstallStatusline" }
  | { type: "promptSaveProfile" }
  | { type: "openAccountSwitcher" }
  | { type: "setSetting"; key: string; value: unknown; scope?: SettingsScope }
  | { type: "promptAddDirectory" }
  | { type: "openExtensionSettings" }
  | { type: "runCommand"; command: string }
  | { type: "promptRemovePermission"; scope: SettingsScope; tool: string; list: PermissionList }
  | { type: "resetSettings"; scope: SettingsScope }
  | { type: "restoreSettingsSnapshot"; scope: SettingsScope; snapshotId: string }
  | { type: "deleteSettingsSnapshot"; scope: SettingsScope; snapshotId: string }
  | { type: "workspacePath"; data: string }
  | { type: "workspaceBranch"; data: string }
  | { type: "settings"; [extra: string]: unknown }
  | { type: "sessions"; data: unknown; stats?: unknown }
  | { type: "userState"; pinned?: string[]; deleted?: string[]; renames?: Record<string, string> }
  | { type: "navigateList" }
  | { type: "skills"; data: unknown }
  | { type: "skillDetail"; data: unknown }
  | { type: "sessionDetail"; data: unknown }
  | { type: "fullTextResults"; query: string; ids: string[] }
  | { type: "error"; message: string }
  | { type: "reloadComplete" }
  | { type: "projects"; data: string[] }
  | { type: "accountData"; data: unknown }
  | { type: "commands"; data: unknown }
  // `errors` carries user-readable parse failures (malformed config files)
  // so the webview can show a warning banner while still rendering
  // whatever parsed successfully.
  | { type: "hooks"; data: unknown; errors?: string[] }
  | { type: "mcpServers"; data: unknown; errors?: string[] }
  | { type: "agents"; data: unknown; errors?: string[] }
  | { type: "quotaData"; result: unknown }
  | { type: "terminalSessions"; ids: string[] }
  | { type: "viewTerminal"; sessionId: string }
  // === SESSIONS MESSAGES ===
  // Inbound (webview → host) session messages handled in
  // features/sessions/messageHandlers.ts. `search`/`filter` ask the host to
  // re-group the session list server-side; the webview currently filters
  // client-side instead, so these are a retained host capability rather than
  // an actively-sent message (kept so the host stays able to serve them).
  | { type: "search"; query: string }
  | { type: "filter"; project?: string; branch?: string; dateRange?: [number, number] }
  | { type: "deleteSession"; sessionId: string }
  | { type: "copyMarkdown"; sessionId: string }
  | { type: "openFile"; path: string }
  /**
   * Host → webview incremental session-list update. Carries only changed
   * rows so a file-watcher tick does not re-post the entire tree. The
   * webview applies it via signal mutation (`applyDelta`). Sessions are
   * passed through as `unknown[]` to keep the shared protocol free of the
   * feature-local `Session` type; the feature narrows on receipt.
   *
   * Receive side only today: the webview handles this, but the host still
   * re-posts the full `sessions` list on each watcher tick, so nothing emits
   * a delta yet. Kept wired so an incremental emitter can drop in later.
   */
  | {
      type: "sessions.delta";
      payload: { added?: unknown[]; updated?: unknown[]; removed?: string[] };
    };
// === END SESSIONS MESSAGES ===

type WebviewMessageType =
  | "ready"
  | "markDemoSeen"
  | "refresh"
  | "newSession"
  | "newTempSession"
  | "continueLastSession"
  | "resumeSession"
  | "resumeMultiple"
  | "getSessionDetail"
  | "pinSession"
  | "unpinSession"
  | "confirmDelete"
  | "renameSession"
  | "forkSession"
  | "copyCommand"
  | "openProject"
  | "openUrl"
  | "exportSession"
  | "importSession"
  | "searchFullText"
  | "launchChatWithPrompt"
  | "openProjectAndChat"
  | "reloadAll"
  | "bulkPinSessions"
  | "bulkDeleteSessions"
  | "bulkExportSessions"
  | "getSkills"
  | "getSkillDetail"
  | "openSkillFile"
  | "deleteSkill"
  | "getCommands"
  | "openCommandFile"
  | "getHooks"
  | "openSettingsFile"
  | "toggleHookEnabled"
  | "deleteHook"
  | "updateHook"
  | "promptAddHook"
  | "getMcpServers"
  | "openMcpConfig"
  | "toggleMcpServer"
  | "deleteMcpServer"
  | "getAgents"
  | "openAgentFile"
  | "getAccountData"
  | "launchSlash"
  | "setModel"
  | "setVoiceEnabled"
  | "setCommitAttribution"
  | "setPrAttribution"
  | "removePermission"
  | "promptAddPermission"
  | "promptCustomModel"
  | "restoreClaudeConfig"
  | "fetchQuota"
  | "installStatusline"
  | "uninstallStatusline"
  | "promptSaveProfile"
  | "openAccountSwitcher"
  | "setSetting"
  | "promptAddDirectory"
  | "openExtensionSettings"
  | "runCommand"
  | "promptRemovePermission"
  | "resetSettings"
  | "restoreSettingsSnapshot"
  | "deleteSettingsSnapshot"
  // === SESSIONS MESSAGES ===
  | "search"
  | "filter"
  | "deleteSession"
  | "copyMarkdown"
  | "openFile"
  | "viewTerminal";
// === END SESSIONS MESSAGES ===

export type WebviewMessage = Extract<Message, { type: WebviewMessageType }>;
export type HostMessage = Exclude<Message, WebviewMessage>;

export const HOST_MESSAGE_TYPES: readonly HostMessage["type"][] = [
  "workspacePath",
  "workspaceBranch",
  "settings",
  "sessions",
  "userState",
  "navigateList",
  "skills",
  "skillDetail",
  "sessionDetail",
  "fullTextResults",
  "error",
  "reloadComplete",
  "projects",
  "accountData",
  "commands",
  "hooks",
  "mcpServers",
  "agents",
  "quotaData",
  "sessions.delta",
  "terminalSessions",
];
