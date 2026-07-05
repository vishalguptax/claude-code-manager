/**
 * Command detail view. Built-in commands show their description and a link to
 * the official docs; custom commands show their file path and full template.
 * Actions are built from the shared <Button>; the scope tag from <Badge>.
 */
import { useState } from "preact/hooks";
import { BackButton, Badge, Button } from "../../../../../webview/shared/ui";
import { useApi } from "../../../../../webview/shared/hooks";
import type { Command } from "../../../types";
import { openCommandFileMsg, openUrlMsg, type Post } from "../../api";
import { selected } from "../../model";

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
      <BackButton onClick={goBack} />

      <div class="d-head d-head--row">
        <div class="d-title d-title--mono">/{command.name}</div>
        <Badge text={command.scope} variant="scope" class={`cmd-scope-${command.scope}`} />
      </div>

      <div class="cmd-detail-actions">
        <Button iconName="copy" onClick={copy}>
          {copied ? "Copied!" : `Copy /${command.name}`}
        </Button>
        {command.scope === "builtin" ? (
          <Button iconName="external-link" onClick={() => send(openUrlMsg(BUILTIN_DOCS_URL))}>
            View Docs
          </Button>
        ) : (
          <Button
            iconName="external-link"
            onClick={() => send(openCommandFileMsg(command.path))}
          >
            Open File
          </Button>
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
