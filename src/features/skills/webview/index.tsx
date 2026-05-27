/**
 * Skills feature entry. Mounts the list/detail views, wires the host→webview
 * message bus, and requests the initial skills list. The TabPanel imports the
 * default export the first time the Skills tab is activated.
 */
import { useEffect } from "preact/hooks";
import { useApi } from "../../../webview/shared/hooks";
import { registerFeatureHandler } from "../../../webview/shared/model";
import { Loading } from "../../../webview/shared/ui";
import type { Skill } from "../types";
import { getSkills } from "./api";
import { claudeCodeInstalled, loaded, marketplaceSkillsUrl, selectedSkill, skills } from "./model";
import { DetailView, ListView } from "./ui";

/**
 * Register message-bus handlers. Returns a disposer that removes them.
 * Exported for direct testing without mounting the component.
 *
 * The bus delivers messages already validated by the shared valibot
 * `parseMessage` (see messageBus.ts), so handlers can trust the variant
 * tag; we only narrow the `unknown` data payloads here.
 */
export function registerSkillsHandlers(): () => void {
  const offSkills = registerFeatureHandler("skill", (msg) => {
    if (msg.type === "skills") {
      skills.value = (msg.data as Skill[]) ?? [];
      // First list (even empty) ends the cold-start loading gate so the list /
      // empty-state can render; an empty array only reads as "no skills" once
      // the host has actually answered.
      loaded.value = true;
      // Re-resolve the selection against the fresh list so a delete or
      // rename on the host doesn't leave a stale detail panel open.
      const sel = selectedSkill.value;
      if (sel) selectedSkill.value = skills.value.find((s) => s.id === sel.id) ?? null;
    } else if (msg.type === "skillDetail") {
      selectedSkill.value = msg.data as Skill;
    }
  });

  // A host parse/read failure also ends loading — otherwise the panel would sit
  // on the <Loading /> placeholder forever.
  const offError = registerFeatureHandler("error", (msg) => {
    if (msg.type === "error") loaded.value = true;
  });

  // Marketplace URL + Claude Code install flag ride in on the host's
  // `settings` message. Kept feature-local so the webview is self-contained.
  const offSettings = registerFeatureHandler("settings", (msg) => {
    if (msg.type !== "settings") return;
    const s = msg as { marketplaceSkillsUrl?: unknown; claudeCodeExtensionInstalled?: unknown };
    if (typeof s.marketplaceSkillsUrl === "string" && s.marketplaceSkillsUrl.length > 0) {
      marketplaceSkillsUrl.value = s.marketplaceSkillsUrl;
    }
    if (typeof s.claudeCodeExtensionInstalled === "boolean") {
      claudeCodeInstalled.value = s.claudeCodeExtensionInstalled;
    }
  });

  return () => {
    offSkills();
    offSettings();
    offError();
  };
}

export default function SkillsTab() {
  const { post } = useApi();

  useEffect(() => {
    const dispose = registerSkillsHandlers();
    getSkills(post);
    return dispose;
  }, [post]);

  // Before the host's first `skills` message, show the full-panel <Loading />
  // rather than the list's "No skills found" empty-state. The detail view
  // renders synchronously from the already-loaded list skill, so it needs no
  // gate of its own.
  const selected = selectedSkill.value;
  if (selected) return <DetailView skill={selected} />;
  if (!loaded.value) return <Loading />;
  return <ListView />;
}
