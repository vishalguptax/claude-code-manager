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
  | { type: "openMcpConfig"; scope: string }
  | { type: "toggleMcpServer"; name: string; scope: string; disabled: boolean; pluginName?: string }
  | { type: "deleteMcpServer"; name: string; scope: string }
  | { type: "getAgents" }
  | { type: "openAgentFile"; path: string }
  | { type: "getAccountData" }
  | { type: "openAccountUrl"; url: string }
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
  | { type: "hooks"; data: unknown }
  | { type: "mcpServers"; data: unknown }
  | { type: "agents"; data: unknown }
  | { type: "quotaData"; result: unknown };

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
  | "openAccountUrl"
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
  | "promptSaveProfile"
  | "openAccountSwitcher"
  | "setSetting"
  | "promptAddDirectory"
  | "openExtensionSettings"
  | "runCommand"
  | "promptRemovePermission"
  | "resetSettings"
  | "restoreSettingsSnapshot"
  | "deleteSettingsSnapshot";

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
];
