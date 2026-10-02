/**
 * Curated MCP server catalog, bundled with the extension.
 *
 * Bundled rather than fetched: the extension makes no network calls, so the
 * catalog ships as data and moves only with a release. Picking an entry opens
 * the Add form pre-filled — nothing is written until the user saves, so every
 * field stays reviewable and editable first.
 *
 * Inclusion bar: an official server from the vendor (or the MCP reference
 * set), with a config verified against the vendor's own setup docs. Remote
 * servers that sign in through OAuth are preferred, because they need no
 * secret in the config at all. Where a token is unavoidable, the preset
 * references an environment variable (`${VAR}`) so no secret is ever written
 * to a file that may be committed. Claude Code expands `${VAR}` in the
 * command, args, env, url and headers of project, local and user servers
 * alike (2.1.287), so a token server can be added at any scope.
 */
import type { McpServerInput } from "../../../../shared/protocol/messages";
import type { McpServerType } from "../../types";

/** How a catalog server authenticates, which decides the hint shown after adding. */
export type McpCatalogAuth =
  /** Signs in through the browser from Claude Code's `/mcp` panel. */
  | "oauth"
  /** Reads a token from the environment variable named in `tokenEnv`. */
  | "token"
  /** Runs locally with no account. */
  | "none";

/** One catalog entry: what the list shows, and the config the Add form starts from. */
export interface McpCatalogEntry {
  /** Config key written on add. Also how an existing install is recognised. */
  name: string;
  /** Display name. */
  title: string;
  /** One line on what the server gives Claude. */
  description: string;
  /** The vendor's setup page, opened from the entry. */
  homepage: string;
  auth: McpCatalogAuth;
  /** The environment variable a `token` server reads. */
  tokenEnv?: string;
  transport: McpServerType;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
}

export const MCP_CATALOG: readonly McpCatalogEntry[] = [
  {
    name: "github",
    title: "GitHub",
    description: "Repositories, issues, pull requests and Actions.",
    homepage: "https://github.com/github/github-mcp-server",
    auth: "token",
    tokenEnv: "GITHUB_PERSONAL_ACCESS_TOKEN",
    transport: "http",
    url: "https://api.githubcopilot.com/mcp/",
    headers: { Authorization: "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}" },
  },
  {
    name: "context7",
    title: "Context7",
    description: "Current, version-specific library docs pulled into the prompt.",
    homepage: "https://github.com/upstash/context7",
    auth: "none",
    transport: "http",
    url: "https://mcp.context7.com/mcp",
  },
  {
    name: "playwright",
    title: "Playwright",
    description: "Drive a real browser: navigate, click, fill forms, read pages.",
    homepage: "https://github.com/microsoft/playwright-mcp",
    auth: "none",
    transport: "stdio",
    command: "npx",
    args: ["@playwright/mcp@latest"],
  },
  {
    name: "chrome-devtools",
    title: "Chrome DevTools",
    description: "Inspect a live Chrome: console, network, performance traces.",
    homepage: "https://github.com/ChromeDevTools/chrome-devtools-mcp",
    auth: "none",
    transport: "stdio",
    command: "npx",
    args: ["-y", "chrome-devtools-mcp@latest"],
  },
  {
    name: "sentry",
    title: "Sentry",
    description: "Issues, errors and stack traces from your Sentry projects.",
    homepage: "https://mcp.sentry.dev/",
    auth: "oauth",
    transport: "http",
    url: "https://mcp.sentry.dev/mcp",
  },
  {
    name: "linear",
    title: "Linear",
    description: "Find, create and update Linear issues and projects.",
    homepage: "https://linear.app/docs/mcp",
    auth: "oauth",
    transport: "http",
    url: "https://mcp.linear.app/mcp",
  },
  {
    name: "notion",
    title: "Notion",
    description: "Search, read and edit pages and databases in your workspace.",
    homepage: "https://developers.notion.com/docs/mcp",
    auth: "oauth",
    transport: "http",
    url: "https://mcp.notion.com/mcp",
  },
  {
    name: "figma",
    title: "Figma",
    description: "Design context, variables and components from Figma files.",
    homepage: "https://github.com/figma/mcp-server-guide",
    auth: "oauth",
    transport: "http",
    url: "https://mcp.figma.com/mcp",
  },
  {
    name: "stripe",
    title: "Stripe",
    description: "Customers, payments and the Stripe docs.",
    homepage: "https://docs.stripe.com/mcp",
    auth: "oauth",
    transport: "http",
    url: "https://mcp.stripe.com",
  },
  {
    name: "supabase",
    title: "Supabase",
    description: "Manage projects, run SQL and read logs on Supabase.",
    homepage: "https://supabase.com/docs/guides/getting-started/mcp",
    auth: "oauth",
    transport: "http",
    url: "https://mcp.supabase.com/mcp",
  },
  {
    name: "vercel",
    title: "Vercel",
    description: "Projects, deployments and build logs on Vercel.",
    homepage: "https://vercel.com/docs/agent-resources/vercel-mcp",
    auth: "oauth",
    transport: "http",
    url: "https://mcp.vercel.com",
  },
  {
    name: "cloudflare-docs",
    title: "Cloudflare Docs",
    description: "Search Cloudflare's developer documentation.",
    homepage: "https://github.com/cloudflare/mcp-server-cloudflare",
    auth: "none",
    transport: "http",
    url: "https://docs.mcp.cloudflare.com/mcp",
  },
  {
    name: "hugging-face",
    title: "Hugging Face",
    description: "Search models, datasets, papers and Spaces on the Hub.",
    homepage: "https://huggingface.co/docs/hub/hf-mcp-server",
    auth: "none",
    transport: "http",
    url: "https://huggingface.co/mcp",
  },
  {
    name: "next-devtools",
    title: "Next.js DevTools",
    description: "Runtime errors, routes and docs from a running Next.js app.",
    homepage: "https://github.com/vercel/next-devtools-mcp",
    auth: "none",
    transport: "stdio",
    command: "npx",
    args: ["-y", "next-devtools-mcp@latest"],
  },
  {
    name: "memory",
    title: "Memory",
    description: "A local knowledge graph Claude can write to and recall from.",
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
    auth: "none",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
  },
  {
    name: "sequential-thinking",
    title: "Sequential Thinking",
    description: "Structured, revisable step-by-step reasoning for hard problems.",
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking",
    auth: "none",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
  },
];

/** Entries whose title, name or description contains the lowercased query. */
export function filterCatalog(
  entries: readonly McpCatalogEntry[],
  query: string,
): McpCatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...entries];
  return entries.filter(
    (e) =>
      e.title.toLowerCase().includes(q) ||
      e.name.includes(q) ||
      e.description.toLowerCase().includes(q),
  );
}

/**
 * Names already configured in any scope. A catalog entry is "added" when a
 * server of the same name exists — the config key is the only identity a
 * server has, and Claude Code itself resolves servers by it.
 */
export function configuredNames(servers: readonly { name: string }[]): Set<string> {
  return new Set(servers.map((s) => s.name));
}

/** What the user must do after adding the entry before it works, or null. */
export function catalogAuthHint(entry: McpCatalogEntry): string | null {
  if (entry.auth === "oauth") return "Sign in from /mcp after adding.";
  if (entry.auth === "token" && entry.tokenEnv) {
    return `Reads ${entry.tokenEnv} from your environment.`;
  }
  return null;
}

/** Starting values for the Add form, built from a catalog entry. */
export interface McpFormPreset {
  /** Every field but scope, which the user picks in the form. */
  input: Omit<McpServerInput, "scope">;
  /** What the server needs before it works, shown under the form's fields. */
  note: string | null;
}

export function catalogPreset(entry: McpCatalogEntry): McpFormPreset {
  return {
    input: {
      name: entry.name,
      transport: entry.transport,
      command: entry.command,
      args: entry.args ? [...entry.args] : undefined,
      url: entry.url,
      headers: entry.headers ? { ...entry.headers } : undefined,
    },
    note: catalogAuthHint(entry),
  };
}
