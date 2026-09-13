/**
 * Empty state shown when no hooks are configured in any scope. Explains where
 * hooks live and shows a minimal settings.json example.
 *
 * The example is a static template literal rendered as text — never innerHTML.
 * Shape comes from the shared <EmptyState>, so this matches the MCP, Commands
 * and Agents empty states instead of describing its own.
 */
import { EmptyState } from "../../../../../webview/shared/ui";

const EXAMPLE = `{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Write", "command": "echo 'Writing...'" }
    ]
  }
}`;

export function HooksEmpty() {
  return (
    <EmptyState
      icon="webhook"
      title="No hooks configured"
      description={
        <>
          A hook is a shell command Claude runs at a lifecycle event. They live under the{" "}
          <code>hooks</code> key in <code>settings.json</code>, each with an event (such as{" "}
          <code>PreToolUse</code>), an optional <code>matcher</code>, and a{" "}
          <code>command</code>.
        </>
      }
    >
      <pre class="hook-example">
        <code>{EXAMPLE}</code>
      </pre>
    </EmptyState>
  );
}
