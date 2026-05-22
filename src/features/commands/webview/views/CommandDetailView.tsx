/**
 * Command detail view. Built-in commands show their description and a link to
 * the official docs; custom commands show their file path and full template.
 */
import { useState } from "preact/hooks";
import { Icon } from "../../../../webview/components/Icon";
import { useApi } from "../../../../webview/hooks/useApi";
import type { Command } from "../../types";
import { openCommandFileMsg, openUrlMsg, type Post } from "../api";
import { selected } from "../signals";

/** Official Claude Code built-in commands documentation. */
const BUILTIN_DOCS_URL = "https://code.claude.com/docs/en/commands";

export interface CommandDetailViewProps {
  command: Command;
}

export function CommandDetailView({ command }: CommandDetailViewProps) {
  const { post } = useApi();
  const send = post as Post;
  const [copied, setCopied] = useState(false);

  const goBack = (): void => {
    selected.value = null;
  };
  const copy = (): void => {
    navigator.clipboard?.writeText(`/${command.name}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  };

  return (
    <div class="panel">
      <button type="button" class="back-btn" onClick={goBack}>
        <Icon name="arrow-left" /> Back
      </button>

      <div class="cmd-detail-head">
        <div class="cmd-detail-title">/{command.name}</div>
        <span class={`cmd-scope-badge cmd-scope-${command.scope}`}>{command.scope}</span>
      </div>

      <div class="cmd-detail-actions">
        <button type="button" class="btn" onClick={copy}>
          <Icon name="copy" /> {copied ? "Copied!" : `Copy /${command.name}`}
        </button>
        {command.scope === "builtin" ? (
          <button type="button" class="btn" onClick={() => send(openUrlMsg(BUILTIN_DOCS_URL))}>
            <Icon name="external-link" /> View Docs
          </button>
        ) : (
          <button type="button" class="btn" onClick={() => send(openCommandFileMsg(command.path))}>
            <Icon name="external-link" /> Open File
          </button>
        )}
      </div>

      {command.scope === "builtin" ? (
        <div class="cmd-detail-content">
          <div class="cmd-detail-label">Description</div>
          <div class="cmd-detail-desc">{command.description ?? ""}</div>
          <div class="cmd-detail-label cmd-detail-label-spaced">Documentation</div>
          <button
            type="button"
            class="cmd-detail-link"
            onClick={() => send(openUrlMsg(BUILTIN_DOCS_URL))}
          >
            {BUILTIN_DOCS_URL}
          </button>
        </div>
      ) : (
        <>
          <div class="cmd-detail-path">
            <span class="text-sm text-muted">{command.path}</span>
          </div>
          <div class="cmd-detail-content">
            <div class="cmd-detail-label">Command Template</div>
            <pre class="cmd-detail-pre">{command.content}</pre>
          </div>
        </>
      )}
    </div>
  );
}
