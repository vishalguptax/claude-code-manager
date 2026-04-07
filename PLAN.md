# Claude Session Manager — VS Code Extension

## What It Does
A VS Code extension that lets Claude Code users **browse, search, and revisit** all their terminal sessions from a visual panel inside VS Code.

---

## Data Source

Claude Code stores everything at `~/.claude/`:

```
~/.claude/
├── history.jsonl                              # Index: every prompt with sessionId, project, timestamp
└── projects/
    └── <encoded-project-path>/
        └── <session-id>.jsonl                 # Full conversation (user + assistant messages, tool calls)
```

### history.jsonl entry
```json
{
  "display": "fix the auth middleware bug",
  "timestamp": 1762501363717,
  "project": "C:\\Users\\...\\my-app",
  "sessionId": "5e8a00bb-2d8c-4495-987e-fb58be39125f"
}
```

### Session .jsonl entry
```json
{
  "type": "user",
  "message": { "role": "user", "content": "fix the auth bug" },
  "timestamp": "2026-03-31T16:23:20.908Z",
  "sessionId": "836a0a59-...",
  "cwd": "C:\\Users\\...",
  "version": "2.1.88"
}
```

---

## How It Works

```
┌─ VS Code ──────────────────────────────────────┐
│                                                 │
│  Extension Host (Node.js)                       │
│  ├── Reads ~/.claude/history.jsonl              │
│  ├── Reads per-session .jsonl on demand         │
│  ├── Parses, groups, indexes sessions           │
│  └── Sends data to Webview via postMessage      │
│                                                 │
│  Webview Panel (React)                          │
│  ├── Sidebar: session list, search, filters     │
│  ├── Detail: conversation view                  │
│  └── Actions: resume in terminal, copy, export  │
│                                                 │
└─────────────────────────────────────────────────┘
```

- **Extension host** = Node.js backend with full filesystem access
- **Webview** = sandboxed HTML/CSS/JS panel (React app bundled into it)
- Communication via `postMessage` / `onDidReceiveMessage`

---

## UI Design

```
┌──────────────────────────────────────────────────────┐
│  Claude Sessions                          [Settings] │
│  [Search sessions...]           [Project ▼] [Date ▼] │
├────────────────────┬─────────────────────────────────┤
│                    │                                 │
│  TODAY             │  keus-iot-platform              │
│  ┌──────────────┐  │  Mar 31, 2026 · 2:30 PM        │
│  │ keus-iot     │◀─│  45 min · 12 messages           │
│  │ Storybook    │  │                                 │
│  │ setup for CV6│  │  Set up Storybook for CV6       │
│  │      2:30 PM │  │  frontend, created stories for  │
│  └──────────────┘  │  add appliance page.            │
│  ┌──────────────┐  │                                 │
│  │ claude-mgr   │  │  ── Conversation ─────────────  │
│  │ Project      │  │                                 │
│  │ planning     │  │  You:                           │
│  │      9:50 PM │  │  take reference from            │
│  └──────────────┘  │  apps/partners-app of storybook │
│                    │  setup and do the exact setup    │
│  YESTERDAY         │  on cv6...                      │
│  ┌──────────────┐  │                                 │
│  │ portfolio    │  │  Claude:                        │
│  │ Updated nav  │  │  I'll set up Storybook for the │
│  │      6:15 PM │  │  CV6 frontend. Let me start by │
│  └──────────────┘  │  reading the partners-app...    │
│                    │                                 │
│                    │  [Resume in Terminal] [Copy MD]  │
├────────────────────┴─────────────────────────────────┤
│  142 sessions · 16 projects · 23 this week           │
└──────────────────────────────────────────────────────┘
```

### Features
1. **Session list** — cards with project name, summary, time
2. **Date groups** — Today, Yesterday, This Week, This Month, Older
3. **Search** — full-text across all prompts
4. **Filters** — by project, date range
5. **Conversation view** — full chat with syntax-highlighted code
6. **Resume** — opens VS Code terminal, runs `claude --resume <id>`
7. **Copy/Export** — conversation as Markdown
8. **Stats** — session count, project count, weekly activity

---

## Tech Stack

| What | Tech |
|---|---|
| Extension | VS Code Extension API (TypeScript) |
| Webview UI | React + TypeScript (bundled) |
| Styling | Tailwind CSS (matches VS Code dark/light theme) |
| Bundler | esbuild (extension) + Vite (webview) |
| Search | Simple substring/regex on indexed prompts |
| Code blocks | Shiki (syntax highlighting) |
| Markdown | react-markdown |

---

## File Structure

```
claude-manager/
├── src/
│   ├── extension/                  # Extension host (Node.js)
│   │   ├── extension.ts            # activate/deactivate, register commands
│   │   ├── sessionParser.ts        # Parse history.jsonl + session .jsonl
│   │   ├── sessionProvider.ts      # Data provider, message handling
│   │   └── types.ts                # Shared types
│   │
│   └── webview/                    # Webview UI (React)
│       ├── App.tsx                 # Root component
│       ├── main.tsx                # Entry point
│       ├── components/
│       │   ├── SessionList.tsx     # Left panel: list of sessions
│       │   ├── SessionCard.tsx     # Individual session card
│       │   ├── SessionDetail.tsx   # Right panel: conversation view
│       │   ├── MessageBubble.tsx   # Single message (user/assistant)
│       │   ├── CodeBlock.tsx       # Syntax-highlighted code
│       │   ├── SearchBar.tsx       # Search input
│       │   ├── FilterBar.tsx       # Project + date filters
│       │   └── StatsBar.tsx        # Bottom stats
│       ├── hooks/
│       │   └── useVSCode.ts        # postMessage bridge to extension
│       ├── stores/
│       │   └── store.ts            # Zustand state
│       ├── styles/
│       │   └── globals.css         # Tailwind + VS Code theme vars
│       └── index.html
│
├── package.json                    # Extension manifest + scripts
├── tsconfig.json
├── vite.config.ts                  # Webview build
├── esbuild.js                      # Extension build
├── tailwind.config.js
├── .vscodeignore
├── .gitignore
├── CHANGELOG.md
├── PLAN.md
└── README.md
```

---

## Data Models

```typescript
// src/extension/types.ts

interface Session {
  id: string;
  project: string;           // "keus-iot-platform" (extracted from path)
  projectPath: string;       // Full path
  branch: string;            // Git branch (from gitBranch field in JSONL)
  startTime: number;         // Unix ms
  endTime: number;
  messageCount: number;
  summary: string;           // First user prompt, truncated to ~80 chars
  prompts: string[];         // All user prompts in this session
}

interface SessionDetail extends Session {
  messages: Message[];
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface SessionGroup {
  label: string;             // "Today", "Yesterday", etc.
  sessions: Session[];
}

// Messages between extension host <-> webview
type ExtensionMessage =
  | { type: 'sessions'; data: SessionGroup[] }
  | { type: 'sessionDetail'; data: SessionDetail }
  | { type: 'stats'; data: Stats }
  | { type: 'error'; message: string };

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'getSessionDetail'; sessionId: string }
  | { type: 'search'; query: string }
  | { type: 'filter'; project?: string; dateRange?: [number, number] }
  | { type: 'resumeSession'; sessionId: string }
  | { type: 'copyMarkdown'; sessionId: string };
```

---

## Extension Manifest (package.json highlights)

```json
{
  "name": "claude-session-manager",
  "displayName": "Claude Session Manager",
  "description": "Browse, search, and revisit your Claude Code terminal sessions",
  "version": "0.1.0",
  "engines": { "vsce": "^1.90.0" },
  "categories": ["Other"],
  "activationEvents": ["onCommand:claudeManager.open"],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "claudeManager.open",
        "title": "Claude: Open Session Manager"
      }
    ],
    "keybindings": [
      {
        "command": "claudeManager.open",
        "key": "ctrl+shift+h",
        "mac": "cmd+shift+h"
      }
    ]
  }
}
```

User opens it via:
- Command palette: **"Claude: Open Session Manager"**
- Keyboard: **Ctrl+Shift+H**

---

## Implementation Plan

### Phase 1: Core (MVP)
- [ ] Scaffold VS Code extension with webview
- [ ] Build `sessionParser.ts` — parse `history.jsonl`, group by session
- [ ] Build `sessionProvider.ts` — postMessage bridge
- [ ] Build session list UI (SessionList + SessionCard)
- [ ] Build session detail UI (conversation view)
- [ ] Date grouping (Today, Yesterday, This Week, Older)
- [ ] "Resume in Terminal" button
- [ ] Basic search (filter prompts by text)

### Phase 2: Polish
- [ ] Project filter dropdown
- [ ] Branch filter dropdown
- [ ] Date range filter
- [ ] Stats bar
- [ ] Copy conversation as Markdown
- [ ] Keyboard navigation (j/k, /, Enter)
- [ ] Respect VS Code light/dark theme
- [ ] Loading states, empty states, error handling

### Phase 3: Publish
- [ ] Icon + branding
- [ ] README with screenshots
- [ ] CHANGELOG
- [ ] Publish to VS Code Marketplace
- [ ] Share on Reddit/Twitter/Claude community

### Phase 4: Post-launch (based on feedback)
- [ ] AI-generated session summaries
- [ ] Session bookmarks
- [ ] Usage analytics chart
- [ ] Export all sessions
- [ ] npm CLI version (if demand exists)
