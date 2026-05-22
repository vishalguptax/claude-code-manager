/**
 * Empty state shown when no hooks are configured in any scope. Explains
 * where hooks live and shows a minimal settings.json example. The example
 * is a static template literal rendered as text — no innerHTML.
 */

const EXAMPLE = `{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Write", "command": "echo 'Writing...'" }
    ]
  }
}`;

export function HooksEmpty() {
  return (
    <div class="hook-empty">
      <div class="hook-empty-title">No hooks configured</div>
      <div class="hook-empty-desc">
        <p>
          Hooks are defined in <code>~/.claude/settings.json</code> under the{" "}
          <code>hooks</code> key.
        </p>
        <p>
          Each hook has an event type (e.g. <code>PreToolUse</code>), an optional{" "}
          <code>matcher</code>, and a <code>command</code> to execute.
        </p>
        <p>Example:</p>
        <pre class="hook-example">
          <code>{EXAMPLE}</code>
        </pre>
      </div>
    </div>
  );
}
