/**
 * Strip leading YAML frontmatter from raw agent file content, returning the
 * trimmed body (the system prompt). Content with no frontmatter is returned
 * trimmed and unchanged. Pure — no JSX, no state.
 */
export function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  return (match ? match[1] : content).trim();
}
