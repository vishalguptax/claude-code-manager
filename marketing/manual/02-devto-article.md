# 2 — dev.to article

## Steps

1. https://dev.to/new — paste draft below (frontmatter block is native dev.to)
2. Cover image: `marketing/promo-card.png`
3. Two ❗ TODO spots — drag in screenshots from `site/assets/screenshots/`
4. Publish
5. Keep the tutorial/workflow framing — dev.to buries pure promo

## Draft

```markdown
---
title: "Claude Code session manager in your VS Code sidebar: how I stopped losing sessions, hand-editing MCP JSON, and juggling accounts"
published: true
tags: vscode, ai, productivity, claude
description: "A free, open-source Claude Code manager for VS Code: full-text session search, git-branch-aware resume, MCP server toggles, skills, hooks, agents, multi-account switching, usage tracking. 100% local."
---

There's a specific kind of annoyance where you know the thing you need exists, you just can't find it. For me that was Claude Code sessions. I knew I'd worked through a tricky database migration with Claude two weeks ago. Somewhere in `claude --resume` was that conversation, along with forty other sessions with names like "Fix the thing" that I definitely wrote in a hurry.

Claude Code keeps everything in `~/.claude/` — sessions as JSONL files, config as JSON. It's all just files. Which eventually made me realize the fix didn't need to be complicated: parse the directory, show it in a sidebar.

That turned into [Claude Code Manager](https://marketplace.visualstudio.com/items?itemName=vishalguptax.claude-manager), a VS Code extension I've been building for a few months now. It's free and the code is Apache 2.0.

## A Claude Code session manager that actually searches

The main thing I wanted was search. Not a picker — actual full-text search across every session, filtered by project and git branch.

The branch filter turned out to matter more than I expected. If you resume a session that started on `feat/retry-queue` while you're sitting on `main`, the extension warns you. I added that after Claude cheerfully continued editing files on the wrong branch one afternoon.

❗ TODO: screenshot 01-sessions.webp

You can also fork a session (branch the conversation without losing the original), and export/import them, which is how I move context between my desktop and laptop.

## MCP servers, skills, hooks, agents — and switching Claude accounts without logging out

Once the session parsing worked, the other tabs were sort of inevitable. MCP servers were the next itch — I kept a JSON snippet in my notes app for toggling one server on and off, which is ridiculous. Now it's a switch. Secrets get masked when you inspect a server config.

Skills, slash commands, hooks, and agents each get a tab. Nothing fancy, just: here's what exists, here's what scope it's in, click to open or launch.

The account tab has a multi-login switcher. I run separate work and personal Claude accounts, and swapping used to mean a full logout/login round-trip. This was honestly the feature that pushed me from "script in a folder" to "actual extension."

❗ TODO: screenshot 07-account.webp

## 100% local — zero telemetry, zero network calls

Everything reads from disk. No telemetry, no account, no network calls — the webview runs under a strict CSP that blocks outbound requests entirely. This wasn't a marketing decision, it's just that the extension genuinely doesn't need a server for anything.

It works in VS Code, Cursor, Windsurf, and VSCodium, and with both the Claude Code CLI and the official extension. Sessions from either surface end up in the same list since they share `~/.claude/`.

## If you want to try it

Search "Claude Code Manager" in the Extensions panel, or:

    code --install-extension vishalguptax.claude-manager

Repo: https://github.com/vishalguptax/claude-code-manager

If you hit something broken, open an issue — I use this daily so bugs tend to get fixed fast.
```

## After publishing

- [ ] Article URL: _____________
- [ ] Date: _____________
