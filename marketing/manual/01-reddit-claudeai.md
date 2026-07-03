# 1 — Reddit post (r/ClaudeAI)

## Steps

1. Render promo image if missing:
   `node -e "require('sharp')('marketing/promo-card.svg',{density:192}).png().toFile('marketing/promo-card.png').then(()=>console.log('ok'))"`
2. https://www.reddit.com/r/ClaudeAI/submit — **Image** post, upload `marketing/promo-card.png`
3. Title from below
4. Paste body as FIRST comment right after posting (image posts have no body)
5. Flair: "Showcase" / "Built with Claude" (whatever the sub offers)
6. Timing: Tue–Thu, 15:00–18:00 UTC
7. Reply to every comment in the first 2 hours
8. Don't cross-post to r/vscode same day; wait a week, text post there

## Title

Reddit threads rank on Google — the title is the SEO. Both options carry "Claude Code" + the manager intent; pick by mood:

```
I got tired of losing Claude Code sessions in terminal scrollback, so I built a free VS Code sidebar that manages all of it — sessions, MCP servers, skills, accounts
```

(alternate, curiosity-led: `After 6 months of daily Claude Code I built the manager it's missing — session search, MCP toggles, multi-account switching, all local. Free + open source`)

## Body (paste as first comment)

```
Been using Claude Code since it came out and the thing that kept biting me was finding old sessions. claude --resume is fine until you have 40 sessions across 6 projects and you're trying to remember which one had the migration work in it.

So I built Claude Code Manager, a VS Code extension that reads ~/.claude/ and shows everything in a sidebar. Been using it myself for a few months, published it a while back, figured it's polished enough now to actually share.

What it does:

Sessions are the main thing. Full-text search across all of them, filter by project and git branch (it warns you if you're about to resume a session on the wrong branch, which has saved me a few times). Resume, fork, continue. You can export a session and import it on another machine.

The rest of the setup gets the same treatment. MCP servers you can toggle without editing JSON. Skills and slash commands, global and per-project. Hooks, agents, all browsable. There's a multi-account switcher too, so you can swap logins without doing the whole /logout /login dance — I use two accounts (work + personal) and this was honestly the reason I started building it.

On privacy since this sub cares (and so do I): it's local. Reads ~/.claude/, renders in a webview, no telemetry, no accounts, no network calls. The code's Apache 2.0 on GitHub if you want to check.

Works in VS Code, Cursor, Windsurf, VSCodium. Works with both the CLI and the official extension — sessions from either show up in the same list.

Install: search "Claude Code Manager" in Extensions
Repo: https://github.com/vishalguptax/claude-manager

It's free. If something's broken or missing tell me, I'm actively working on it.
```

## After posting

- [ ] Posted URL: _____________
- [ ] Date: _____________
