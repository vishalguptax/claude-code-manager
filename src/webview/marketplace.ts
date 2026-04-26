/**
 * Marketplace link store — receives URLs from the host's `settings`
 * message so the Skills + MCP tabs can render "Browse community"
 * buttons without re-asking the host every render. Defaults are
 * embedded so a fresh install (or a settings.json that lacks the
 * keys) still has working buttons; the host's
 * `claudeManager.marketplaceSkillsUrl` / `claudeManager.marketplaceMcpUrl`
 * settings override at runtime.
 */

const DEFAULT_SKILLS_URL = "https://github.com/anthropics/claude-code/wiki/Skills";
const DEFAULT_MCP_URL = "https://mcp.so";

let _skillsUrl = DEFAULT_SKILLS_URL;
let _mcpUrl = DEFAULT_MCP_URL;

export function setMarketplaceSkillsUrl(url: string): void {
  _skillsUrl = url && url.length > 0 ? url : DEFAULT_SKILLS_URL;
}

export function setMarketplaceMcpUrl(url: string): void {
  _mcpUrl = url && url.length > 0 ? url : DEFAULT_MCP_URL;
}

export function getMarketplaceSkillsUrl(): string {
  return _skillsUrl;
}

export function getMarketplaceMcpUrl(): string {
  return _mcpUrl;
}
