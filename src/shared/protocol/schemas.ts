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
const getPromptHistory = v.object({ type: v.literal("getPromptHistory") });
const copyPrompt = v.object({ type: v.literal("copyPrompt"), text: v.string() });
const openPromptSession = v.object({
  type: v.literal("openPromptSession"),
  sessionId: v.string(),
});
// project + fileName, never a path: the host re-derives the location, so a
// compromised webview cannot address a file outside the memory store.
// Plugins carries its own scope picklist: unlike every other settings
// surface it must address the admin-managed file too, and widening the
// shared `scope` would let "managed" through on messages that cannot
// write there.
const pluginScope = v.picklist(["global", "project", "local", "managed"]);
const getPlugins = v.object({ type: v.literal("getPlugins") });
const openPluginDirectory = v.object({
  type: v.literal("openPluginDirectory"),
  id: v.string(),
});
const openPluginSettings = v.object({
  type: v.literal("openPluginSettings"),
  scope: pluginScope,
});
const copyPluginId = v.object({ type: v.literal("copyPluginId"), id: v.string() });
const setPluginEnabled = v.object({
  type: v.literal("setPluginEnabled"),
  id: v.string(),
  enabled: v.boolean(),
  scope: pluginScope,
});
const getMemories = v.object({ type: v.literal("getMemories") });
const openMemory = v.object({
  type: v.literal("openMemory"),
  project: v.string(),
  fileName: v.string(),
});
const revealMemory = v.object({
  type: v.literal("revealMemory"),
  project: v.string(),
  fileName: v.string(),
});
const deleteMemory = v.object({
  type: v.literal("deleteMemory"),
  project: v.string(),
  fileName: v.string(),
});
const archiveSession = v.object({ type: v.literal("archiveSession"), sessionId: v.string() });
const unarchiveSession = v.object({
  type: v.literal("unarchiveSession"),
  sessionId: v.string(),
});
const archiveSessions = v.object({
  type: v.literal("archiveSessions"),
  sessionIds: v.array(v.string()),
});
const markSessionRead = v.object({
  type: v.literal("markSessionRead"),
  sessionId: v.string(),
});
const markSessionUnread = v.object({
  type: v.literal("markSessionUnread"),
  sessionId: v.string(),
});
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
const importMultipleSessions = v.object({ type: v.literal("importMultipleSessions") });
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
  next: v.object({
    matcher: v.string(),
    command: v.string(),
    event: v.optional(v.string()),
    scope: v.optional(scope),
    timeout: v.optional(v.number()),
  }),
});
const promptAddHook = v.object({ type: v.literal("promptAddHook") });
const openHooksPanel = v.object({ type: v.literal("openHooksPanel") });
const getMcpServers = v.object({ type: v.literal("getMcpServers") });
const openMcpConfig = v.object({
  type: v.literal("openMcpConfig"),
  scope: v.string(),
  name: v.optional(v.string()),
});
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
const stringRecord = v.record(v.string(), v.string());
const mcpServerInput = v.object({
  name: v.string(),
  scope: v.string(),
  transport: v.string(),
  command: v.optional(v.string()),
  args: v.optional(v.array(v.string())),
  url: v.optional(v.string()),
  env: v.optional(stringRecord),
  headers: v.optional(stringRecord),
});
const addMcpServer = v.object({ type: v.literal("addMcpServer"), server: mcpServerInput });
const updateMcpServer = v.object({
  type: v.literal("updateMcpServer"),
  originalName: v.string(),
  server: mcpServerInput,
});
const authenticateMcp = v.object({ type: v.literal("authenticateMcp"), name: v.string() });
const logoutMcp = v.object({ type: v.literal("logoutMcp"), name: v.string() });
const reconnectMcp = v.object({ type: v.literal("reconnectMcp") });
const mcpListStatus = v.object({ type: v.literal("mcpListStatus") });
const getAgents = v.object({ type: v.literal("getAgents") });
const openAgentFile = v.object({ type: v.literal("openAgentFile"), path: v.string() });
const agentInput = v.object({
  scope: v.string(),
  name: v.string(),
  description: v.string(),
  model: v.string(),
  tools: v.array(v.string()),
  skills: v.array(v.string()),
  body: v.string(),
});
const createAgent = v.object({ type: v.literal("createAgent"), agent: agentInput });
const updateAgent = v.object({
  type: v.literal("updateAgent"),
  path: v.string(),
  agent: agentInput,
});
const deleteAgent = v.object({ type: v.literal("deleteAgent"), path: v.string() });
const duplicateAgent = v.object({ type: v.literal("duplicateAgent"), path: v.string() });
const getAccountData = v.object({ type: v.literal("getAccountData") });
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
const installStatusline = v.object({ type: v.literal("installStatusline") });
const uninstallStatusline = v.object({ type: v.literal("uninstallStatusline") });
const promptSaveProfile = v.object({ type: v.literal("promptSaveProfile") });
const openAccountSwitcher = v.object({ type: v.literal("openAccountSwitcher") });
/** Share-card export: the webview renders the PNG and hands the host the
 * base64 payload to write via a native save dialog. */
const saveStatsImage = v.object({
  type: v.literal("saveStatsImage"),
  pngBase64: v.string(),
});
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
// Host acknowledgement that a webview-originated message finished dispatch.
// Drives the shared busy indicator: every request gets exactly one ack.
const ack = v.object({ type: v.literal("ack") });
const reloadComplete = v.object({ type: v.literal("reloadComplete") });
const projects = v.object({ type: v.literal("projects"), data: v.array(v.string()) });
const accountData = v.object({ type: v.literal("accountData"), data: v.unknown() });
const commands = v.object({ type: v.literal("commands"), data: v.unknown() });
const parseErrors = v.optional(v.array(v.string()));
const hooks = v.object({ type: v.literal("hooks"), data: v.unknown(), errors: parseErrors });
const mcpServers = v.object({
  type: v.literal("mcpServers"),
  data: v.unknown(),
  errors: parseErrors,
});
const agents = v.object({ type: v.literal("agents"), data: v.unknown(), errors: parseErrors });
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
const terminalSessions = v.object({
  type: v.literal("terminalSessions"),
  ids: v.array(v.string()),
});
const tempSessions = v.object({
  type: v.literal("tempSessions"),
  ids: v.array(v.string()),
});
// Worktree map values pass through as `unknown` — the sessions feature owns
// and narrows the WorktreeRef shape (mirrors the `sessions` data: unknown).
const worktrees = v.object({
  type: v.literal("worktrees"),
  map: v.record(v.string(), v.unknown()),
});
const createWorktree = v.object({
  type: v.literal("createWorktree"),
  sessionId: v.string(),
});
const promoteTempSession = v.object({
  type: v.literal("promoteTempSession"),
  sessionId: v.string(),
});
const viewTerminal = v.object({
  type: v.literal("viewTerminal"),
  sessionId: v.string(),
});
// === END SESSIONS MESSAGES ===

// === CHECKPOINTS MESSAGES ===
// The webview never names a blob file: it sends (sessionId, filePath,
// version) and the host re-derives sha256(filePath).slice(0,16)@v<N>. That
// keeps the blob grammar — and the traversal guard behind it — host-side.
const getCheckpointSessions = v.object({ type: v.literal("getCheckpointSessions") });
const getCheckpoints = v.object({
  type: v.literal("getCheckpoints"),
  sessionId: v.string(),
});
const checkpointTarget = {
  sessionId: v.string(),
  filePath: v.string(),
  version: v.number(),
};
const diffCheckpoint = v.object({
  type: v.literal("diffCheckpoint"),
  ...checkpointTarget,
});
const restoreCheckpoint = v.object({
  type: v.literal("restoreCheckpoint"),
  ...checkpointTarget,
});
// Host → webview. Payloads pass through as `unknown` so the shared protocol
// stays free of the feature-local CheckpointFile / CheckpointSessionSummary
// types; the checkpoints feature narrows on receipt (mirrors `sessions`).
const checkpointSessions = v.object({
  type: v.literal("checkpointSessions"),
  data: v.unknown(),
});
const checkpoints = v.object({
  type: v.literal("checkpoints"),
  sessionId: v.string(),
  data: v.unknown(),
  orphanCount: v.number(),
});
// === END CHECKPOINTS MESSAGES ===

// Host → webview for the prompts / memory / plugins tabs. Payloads pass
// through as `unknown` for the same reason the checkpoint ones do: the
// shared protocol stays free of feature-local types and each feature
// narrows on receipt.
//
// These MUST be here, not only in messages.ts. messageBus validates every
// inbound message with parseMessage and drops what it cannot parse, so a
// reply that type-checks but has no schema is discarded at runtime and the
// tab sits on its loading skeleton forever.
const promptHistory = v.object({
  type: v.literal("promptHistory"),
  data: v.unknown(),
});
const memoryStore = v.object({
  type: v.literal("memoryStore"),
  data: v.unknown(),
});
const pluginsData = v.object({
  type: v.literal("pluginsData"),
  data: v.unknown(),
});

export const messageSchema = v.variant("type", [
  ready,
  markDemoSeen,
  refresh,
  newSession,
  newTempSession,
  promoteTempSession,
  continueLastSession,
  resumeSession,
  resumeMultiple,
  getSessionDetail,
  pinSession,
  unpinSession,
  getPromptHistory,
  copyPrompt,
  openPromptSession,
  getPlugins,
  openPluginDirectory,
  openPluginSettings,
  copyPluginId,
  setPluginEnabled,
  getMemories,
  openMemory,
  revealMemory,
  deleteMemory,
  archiveSession,
  unarchiveSession,
  archiveSessions,
  markSessionRead,
  markSessionUnread,
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
  importMultipleSessions,
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
  openHooksPanel,
  getMcpServers,
  openMcpConfig,
  toggleMcpServer,
  deleteMcpServer,
  addMcpServer,
  updateMcpServer,
  authenticateMcp,
  logoutMcp,
  reconnectMcp,
  mcpListStatus,
  getAgents,
  openAgentFile,
  createAgent,
  updateAgent,
  deleteAgent,
  duplicateAgent,
  getAccountData,
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
  installStatusline,
  uninstallStatusline,
  promptSaveProfile,
  openAccountSwitcher,
  saveStatsImage,
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
  ack,
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
  terminalSessions,
  tempSessions,
  worktrees,
  createWorktree,
  viewTerminal,
  // === END SESSIONS MESSAGES ===
  // === CHECKPOINTS MESSAGES ===
  getCheckpointSessions,
  getCheckpoints,
  diffCheckpoint,
  restoreCheckpoint,
  checkpointSessions,
  promptHistory,
  memoryStore,
  pluginsData,
  checkpoints,
  // === END CHECKPOINTS MESSAGES ===
]);

export function parseMessage(input: unknown): Message {
  return v.parse(messageSchema, input) as Message;
}
