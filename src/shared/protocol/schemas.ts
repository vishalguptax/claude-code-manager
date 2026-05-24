import * as v from "valibot";
import type { Message } from "./messages";

export type { Message } from "./messages";

const scope = v.picklist(["global", "project", "local"]);
const permList = v.picklist(["allow", "deny"]);
const detailMode = v.picklist(["first", "last"]);

const ready = v.object({ type: v.literal("ready") });
const markDemoSeen = v.object({ type: v.literal("markDemoSeen") });
const refresh = v.object({ type: v.literal("refresh") });
const newSession = v.object({ type: v.literal("newSession") });
const newTempSession = v.object({ type: v.literal("newTempSession") });
const continueLastSession = v.object({ type: v.literal("continueLastSession") });
const resumeSession = v.object({
  type: v.literal("resumeSession"),
  sessionId: v.string(),
  entrypoint: v.optional(v.string()),
  projectPath: v.optional(v.string()),
});
const resumeMultiple = v.object({
  type: v.literal("resumeMultiple"),
  sessionIds: v.array(v.string()),
  projectPaths: v.optional(v.array(v.string())),
});
const getSessionDetail = v.object({
  type: v.literal("getSessionDetail"),
  sessionId: v.string(),
  mode: v.optional(detailMode),
  query: v.optional(v.string()),
});
const pinSession = v.object({ type: v.literal("pinSession"), sessionId: v.string() });
const unpinSession = v.object({ type: v.literal("unpinSession"), sessionId: v.string() });
const confirmDelete = v.object({
  type: v.literal("confirmDelete"),
  sessionId: v.string(),
  callback: v.optional(v.string()),
});
const renameSession = v.object({ type: v.literal("renameSession"), sessionId: v.string() });
const forkSession = v.object({ type: v.literal("forkSession"), sessionId: v.string() });
const copyCommand = v.object({ type: v.literal("copyCommand"), sessionId: v.string() });
const openProject = v.object({ type: v.literal("openProject"), projectPath: v.string() });
const openUrl = v.object({ type: v.literal("openUrl"), url: v.string() });
const exportSession = v.object({ type: v.literal("exportSession"), sessionId: v.string() });
const importSession = v.object({ type: v.literal("importSession") });
const searchFullText = v.object({ type: v.literal("searchFullText"), query: v.string() });
const launchChatWithPrompt = v.object({
  type: v.literal("launchChatWithPrompt"),
  prompt: v.string(),
});
const openProjectAndChat = v.object({
  type: v.literal("openProjectAndChat"),
  projectPath: v.string(),
});
const reloadAll = v.object({ type: v.literal("reloadAll") });
const bulkPinSessions = v.object({
  type: v.literal("bulkPinSessions"),
  ids: v.array(v.string()),
  pin: v.boolean(),
});
const bulkDeleteSessions = v.object({
  type: v.literal("bulkDeleteSessions"),
  ids: v.array(v.string()),
});
const bulkExportSessions = v.object({
  type: v.literal("bulkExportSessions"),
  ids: v.array(v.string()),
});
const getSkills = v.object({ type: v.literal("getSkills") });
const getSkillDetail = v.object({ type: v.literal("getSkillDetail"), skillId: v.string() });
const openSkillFile = v.object({ type: v.literal("openSkillFile"), skillPath: v.string() });
const deleteSkill = v.object({ type: v.literal("deleteSkill"), skillPath: v.string() });
const getCommands = v.object({ type: v.literal("getCommands") });
const openCommandFile = v.object({ type: v.literal("openCommandFile"), path: v.string() });
const getHooks = v.object({ type: v.literal("getHooks") });
const openSettingsFile = v.object({ type: v.literal("openSettingsFile"), scope });
const toggleHookEnabled = v.object({ type: v.literal("toggleHookEnabled"), hook: v.unknown() });
const deleteHook = v.object({ type: v.literal("deleteHook"), hook: v.unknown() });
const updateHook = v.object({
  type: v.literal("updateHook"),
  original: v.unknown(),
  next: v.object({ matcher: v.string(), command: v.string() }),
});
const promptAddHook = v.object({ type: v.literal("promptAddHook") });
const getMcpServers = v.object({ type: v.literal("getMcpServers") });
const openMcpConfig = v.object({ type: v.literal("openMcpConfig"), scope: v.string() });
const toggleMcpServer = v.object({
  type: v.literal("toggleMcpServer"),
  name: v.string(),
  scope: v.string(),
  disabled: v.boolean(),
  pluginName: v.optional(v.string()),
});
const deleteMcpServer = v.object({
  type: v.literal("deleteMcpServer"),
  name: v.string(),
  scope: v.string(),
});
const getAgents = v.object({ type: v.literal("getAgents") });
const openAgentFile = v.object({ type: v.literal("openAgentFile"), path: v.string() });
const getAccountData = v.object({ type: v.literal("getAccountData") });
const openAccountUrl = v.object({ type: v.literal("openAccountUrl"), url: v.string() });
const launchSlash = v.object({ type: v.literal("launchSlash"), command: v.string() });
const setModel = v.object({ type: v.literal("setModel"), model: v.string() });
const setVoiceEnabled = v.object({ type: v.literal("setVoiceEnabled"), value: v.boolean() });
const setCommitAttribution = v.object({
  type: v.literal("setCommitAttribution"),
  value: v.string(),
});
const setPrAttribution = v.object({ type: v.literal("setPrAttribution"), value: v.string() });
const removePermission = v.object({
  type: v.literal("removePermission"),
  scope,
  tool: v.string(),
  list: permList,
});
const promptAddPermission = v.object({
  type: v.literal("promptAddPermission"),
  scope,
  list: permList,
});
const promptCustomModel = v.object({ type: v.literal("promptCustomModel") });
const restoreClaudeConfig = v.object({ type: v.literal("restoreClaudeConfig") });
const fetchQuota = v.object({ type: v.literal("fetchQuota") });
const promptSaveProfile = v.object({ type: v.literal("promptSaveProfile") });
const openAccountSwitcher = v.object({ type: v.literal("openAccountSwitcher") });
const setSetting = v.object({
  type: v.literal("setSetting"),
  key: v.string(),
  value: v.unknown(),
  scope: v.optional(scope),
});
const promptAddDirectory = v.object({ type: v.literal("promptAddDirectory") });
const openExtensionSettings = v.object({ type: v.literal("openExtensionSettings") });
const runCommand = v.object({ type: v.literal("runCommand"), command: v.string() });
const promptRemovePermission = v.object({
  type: v.literal("promptRemovePermission"),
  scope,
  tool: v.string(),
  list: permList,
});
const resetSettings = v.object({ type: v.literal("resetSettings"), scope });
const restoreSettingsSnapshot = v.object({
  type: v.literal("restoreSettingsSnapshot"),
  scope,
  snapshotId: v.string(),
});
const deleteSettingsSnapshot = v.object({
  type: v.literal("deleteSettingsSnapshot"),
  scope,
  snapshotId: v.string(),
});

const workspacePath = v.object({ type: v.literal("workspacePath"), data: v.string() });
const workspaceBranch = v.object({ type: v.literal("workspaceBranch"), data: v.string() });
const settings = v.looseObject({ type: v.literal("settings") });
const sessions = v.object({
  type: v.literal("sessions"),
  data: v.unknown(),
  stats: v.optional(v.unknown()),
});
const userState = v.object({
  type: v.literal("userState"),
  pinned: v.optional(v.array(v.string())),
  deleted: v.optional(v.array(v.string())),
  renames: v.optional(v.record(v.string(), v.string())),
});
const navigateList = v.object({ type: v.literal("navigateList") });
const skills = v.object({ type: v.literal("skills"), data: v.unknown() });
const skillDetail = v.object({ type: v.literal("skillDetail"), data: v.unknown() });
const sessionDetail = v.object({ type: v.literal("sessionDetail"), data: v.unknown() });
const fullTextResults = v.object({
  type: v.literal("fullTextResults"),
  query: v.string(),
  ids: v.array(v.string()),
});
const errorMsg = v.object({ type: v.literal("error"), message: v.string() });
const reloadComplete = v.object({ type: v.literal("reloadComplete") });
const projects = v.object({ type: v.literal("projects"), data: v.array(v.string()) });
const accountData = v.object({ type: v.literal("accountData"), data: v.unknown() });
const commands = v.object({ type: v.literal("commands"), data: v.unknown() });
const hooks = v.object({ type: v.literal("hooks"), data: v.unknown() });
const mcpServers = v.object({ type: v.literal("mcpServers"), data: v.unknown() });
const agents = v.object({ type: v.literal("agents"), data: v.unknown() });
const quotaData = v.object({ type: v.literal("quotaData"), result: v.unknown() });

// === SESSIONS MESSAGES ===
// Inbound session messages, paired 1:1 with the SESSIONS MESSAGES block in
// messages.ts.
const search = v.object({ type: v.literal("search"), query: v.string() });
const filter = v.object({
  type: v.literal("filter"),
  project: v.optional(v.string()),
  branch: v.optional(v.string()),
  dateRange: v.optional(v.tuple([v.number(), v.number()])),
});
const deleteSession = v.object({ type: v.literal("deleteSession"), sessionId: v.string() });
const copyMarkdown = v.object({ type: v.literal("copyMarkdown"), sessionId: v.string() });
const openFile = v.object({ type: v.literal("openFile"), path: v.string() });
const sessionsDelta = v.object({
  type: v.literal("sessions.delta"),
  payload: v.object({
    added: v.optional(v.array(v.unknown())),
    updated: v.optional(v.array(v.unknown())),
    removed: v.optional(v.array(v.string())),
  }),
});
// === END SESSIONS MESSAGES ===

export const messageSchema = v.variant("type", [
  ready,
  markDemoSeen,
  refresh,
  newSession,
  newTempSession,
  continueLastSession,
  resumeSession,
  resumeMultiple,
  getSessionDetail,
  pinSession,
  unpinSession,
  confirmDelete,
  renameSession,
  forkSession,
  copyCommand,
  openProject,
  openUrl,
  exportSession,
  importSession,
  searchFullText,
  launchChatWithPrompt,
  openProjectAndChat,
  reloadAll,
  bulkPinSessions,
  bulkDeleteSessions,
  bulkExportSessions,
  getSkills,
  getSkillDetail,
  openSkillFile,
  deleteSkill,
  getCommands,
  openCommandFile,
  getHooks,
  openSettingsFile,
  toggleHookEnabled,
  deleteHook,
  updateHook,
  promptAddHook,
  getMcpServers,
  openMcpConfig,
  toggleMcpServer,
  deleteMcpServer,
  getAgents,
  openAgentFile,
  getAccountData,
  openAccountUrl,
  launchSlash,
  setModel,
  setVoiceEnabled,
  setCommitAttribution,
  setPrAttribution,
  removePermission,
  promptAddPermission,
  promptCustomModel,
  restoreClaudeConfig,
  fetchQuota,
  promptSaveProfile,
  openAccountSwitcher,
  setSetting,
  promptAddDirectory,
  openExtensionSettings,
  runCommand,
  promptRemovePermission,
  resetSettings,
  restoreSettingsSnapshot,
  deleteSettingsSnapshot,
  workspacePath,
  workspaceBranch,
  settings,
  sessions,
  userState,
  navigateList,
  skills,
  skillDetail,
  sessionDetail,
  fullTextResults,
  errorMsg,
  reloadComplete,
  projects,
  accountData,
  commands,
  hooks,
  mcpServers,
  agents,
  quotaData,
  // === SESSIONS MESSAGES ===
  search,
  filter,
  deleteSession,
  copyMarkdown,
  openFile,
  sessionsDelta,
  // === END SESSIONS MESSAGES ===
]);

export function parseMessage(input: unknown): Message {
  return v.parse(messageSchema, input) as Message;
}
