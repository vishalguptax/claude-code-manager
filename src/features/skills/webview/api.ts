/**
 * Typed postMessage wrappers for the skills feature. Every send is a
 * variant of the shared `WebviewMessage` union, so a typo or a payload
 * drift is a compile error. Callers obtain `post` from the `useApi()`
 * hook and pass it in, keeping these helpers free of singleton state.
 */
import type { WebviewMessage } from "../../../shared/protocol/messages";

export type Post = (msg: WebviewMessage) => void;

/** Request the full skills list from the host. */
export function getSkills(post: Post): void {
  post({ type: "getSkills" });
}

/** Request full detail for one skill by id. */
export function getSkillDetail(post: Post, skillId: string): void {
  post({ type: "getSkillDetail", skillId });
}

/** Open a skill's SKILL.md in the editor. */
export function openSkillFile(post: Post, skillPath: string): void {
  post({ type: "openSkillFile", skillPath });
}

/** Delete a skill folder (host shows a confirmation modal first). */
export function deleteSkill(post: Post, skillPath: string): void {
  post({ type: "deleteSkill", skillPath });
}

/**
 * Open the Claude Code chat with the skill invocation pre-filled. Skills
 * are invoked like slash commands, so the prompt body is `/<name>`.
 */
export function launchSkillInChat(post: Post, name: string): void {
  post({ type: "launchChatWithPrompt", prompt: `/${name}` });
}

/** Start a new Claude Code session (used by the detail view's "Open Claude"). */
export function newSession(post: Post): void {
  post({ type: "newSession" });
}

/** Open an external URL (the community skills marketplace). */
export function openUrl(post: Post, url: string): void {
  post({ type: "openUrl", url });
}
