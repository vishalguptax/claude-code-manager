You are executing phase F1 (Foundation) of the Claude Manager v2 revamp. This is the BLOCKING phase. F2 sessions cannot start until you commit + push your work.

REQUIRED READING (do this first, in order):
1. docs/planning/v2-revamp-plan.md — entire doc, especially §1 (architecture) and §4 (your tasks)
2. docs/planning/production-readiness.md — context on gaps F1 addresses
3. src/extension/html.ts (current CSP)
4. src/extension/extension.ts (current activation)
5. src/webview/main.ts and the entire src/webview/ tree
6. package.json
7. tsconfig.json
8. Grep all current postMessage types: search for "webview.postMessage" and "vscode.postMessage" across src/

YOUR CONTEXT:
- Working directory is a git worktree on branch v2/foundation, off v2/integration-target.
- You have ~2 hours wall-time. Be efficient. Don't over-engineer.
- All F2 sessions block on your output. Get it right, get it merged.

YOUR FILE ALLOWLIST (you may create or modify ONLY these):
- package.json
- tsconfig.json
- biome.json (new)
- .nvmrc (new)
- scripts/build-extension.mjs (new)
- scripts/build-webview.mjs (new)
- src/extension/html.ts (modify CSP)
- src/extension/registry.ts (new, cross-feature registry)
- src/extension/terminal.ts (add branch-name validation)
- src/features/sessions/commands.ts (SINGLE-LINE security fix at line 370 — use validated function)
- src/core/lru.ts (new)
- src/shared/protocol/messages.ts (new)
- src/shared/protocol/schemas.ts (new)
- src/shared/types/feature.ts (new)
- src/webview/main.tsx (replaces main.ts)
- src/webview/App.tsx (new)
- src/webview/tabs/TabBar.tsx, TabPanel.tsx, tabRegistry.ts (new)
- src/webview/components/{Button,Icon,EmptyState,ErrorBoundary,Loading,ListItem,Modal,VirtualList,Input}.tsx (new)
- src/webview/hooks/{useApi,useDebounce,useTheme,useVirtualizer}.ts (new)
- src/webview/signals/{globalSignals,messageBus}.ts (new)
- src/webview/utils/{esc,format,classnames}.ts (new)
- src/styles/{tokens,base,components,tabs}.css (new or modify)
- src/styles/{account,sessions,skills,commands,hooks,mcp,agents}.css (create empty)
- .github/workflows/ci.yml (new)
- .github/dependabot.yml (new)
- Tests for everything you create (alongside source files in __tests__/)

DENYLIST (DO NOT TOUCH):
- src/features/{F}/parser.ts, state.ts, viewProvider.ts, types.ts, commands.ts (except sessions/commands.ts line 370 security fix)
- src/features/{F}/webview/** (F2 sessions own these)
- src/core/*.ts except lru.ts
- src/extension/*.ts except html.ts, registry.ts, terminal.ts
- src/webview/main.ts (DELETE it, replace with main.tsx)
- Any other feature files

TASKS — execute in this order:

1. Install dependencies:
   npm install preact @preact/signals valibot clsx
   npm install -D @biomejs/biome @vscode/test-electron @testing-library/preact @testing-library/jest-dom size-limit

2. Update tsconfig.json:
   - "jsx": "react-jsx"
   - "jsxImportSource": "preact"
   - "noUncheckedIndexedAccess": true
   - keep "strict": true

3. Create biome.json with:
   - formatter: indent style space, indent width 2, line width 100
   - linter: recommended rules + noRestrictedImports rule enforcing boundary:
     - src/core/** must not import vscode or node:* built-ins
     - src/features/*/webview/** must not import vscode or node:*
     - src/webview/** must not import vscode or node:*
   - organize imports on

4. Create .nvmrc with content: 20

5. Update package.json:
   - bump engines.node to >=20
   - bump engines.vscode to ^1.90.0
   - scripts:
     - "build": "node scripts/build-extension.mjs && node scripts/build-webview.mjs && node scripts/build-css.js"
     - "build:extension": "node scripts/build-extension.mjs"
     - "build:webview": "node scripts/build-webview.mjs"
     - "watch": parallel watch versions
     - "typecheck": "tsc --noEmit"
     - "check": "biome check ."
     - "format": "biome format --write ."
     - "size": "size-limit"
   - size-limit config in package.json:
     - dist/extension.js: 400 KB
     - dist/webview/main.js: 60 KB
     - dist/webview/chunks/*.js: 50 KB each
     - dist/webview/main.css: 50 KB

6. Create scripts/build-extension.mjs — esbuild for host:
   - entry: src/extension/extension.ts
   - format: cjs, platform: node, target: node20
   - external: ["vscode"]
   - minify: true
   - sourcemap: external
   - bundle: true
   - outfile: dist/extension.js

7. Create scripts/build-webview.mjs — esbuild for webview:
   - entry: src/webview/main.tsx
   - format: esm
   - target: chrome120
   - bundle: true
   - splitting: true
   - jsx: automatic, jsxImportSource: preact
   - minify: true
   - sourcemap: external
   - outdir: dist/webview
   - chunkNames: chunks/[name]-[hash]

8. Update src/extension/html.ts:
   - CSP: default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${cspSource}; img-src ${cspSource} https: data:; connect-src 'none';
   - Replace <script src=... nonce=...> with <script type="module" src=... nonce=...>
   - Keep nonce generation as-is

9. Create src/core/lru.ts — minimal LRU<K, V>:
   - constructor(max: number)
   - get(key): V | undefined (promotes)
   - set(key, value)
   - delete(key)
   - has(key)
   - clear()
   - get size(): number
   - ~30 LOC, no dependencies. Use Map insertion-order semantics.
   - Add __tests__/lru.test.ts with: cap eviction, promotion on get, clear, size.

10. Create src/extension/registry.ts:
    - FeatureContribution interface (id: string, parsers?: ..., onMessage?: ...)
    - registerFeature(contribution)
    - getFeatures(): list
    - Allows sessions feature to query other feature contributions WITHOUT direct import.
    - Add __tests__/registry.test.ts.

11. Update src/extension/terminal.ts:
    - Add `validateGitRef(name: string): string | null` — return null if invalid, otherwise return name.
    - Reject if matches: /^[-/]/, /\.\./, /[\s~^:?*\[\\]/, /\.lock$/, /[\x00-\x1f\x7f]/. Allow [A-Za-z0-9._/-]+.
    - Export from terminal.ts.
    - Add __tests__/terminal.test.ts with malicious fixtures: `x" && rm -rf /`, `; cat /etc/passwd`, `branch\nname`, valid names.

12. Update src/features/sessions/commands.ts ONLY at line 370:
    - Import validateGitRef from extension/terminal.
    - Before term.sendText, validate: const safe = validateGitRef(sessBranch); if (!safe) { vscode.window.showErrorMessage('Invalid branch name'); return; }
    - Use safe in template literal. Wrap in single quotes: `git checkout '${safe}' && ${cmd}`
    - DO NOT modify any other line in this file. Single-line scope discipline.

13. Create src/shared/protocol/messages.ts:
    - Discriminated union Message with EVERY postMessage type used today.
    - Grep src/ first for all message.type values, list them, then define the union.
    - Group by feature with subtype prefix: "sessions.list", "sessions.detail", "sessions.delete", "skills.list", "hooks.update", etc.
    - Export HostMessage (sent from host -> webview) and WebviewMessage (sent webview -> host) as Extract/Exclude helpers.

14. Create src/shared/protocol/schemas.ts:
    - For every Message variant, define valibot schema.
    - Export parseMessage(unknown): Message — uses v.variant or v.union to discriminate by type field.
    - Throws v.ValiError on shape mismatch.
    - Add __tests__/schemas.test.ts: round-trip a sample of each message type.

15. Create src/shared/types/feature.ts:
    - Feature interface (id, label, icon) — used by tabRegistry.

16. Create src/webview/main.tsx — entry:
    - Acquire vscode API once (window.acquireVsCodeApi())
    - Mount <App /> on #root
    - Setup message bus listener (window.addEventListener("message", handleMessage)) that validates with parseMessage and dispatches to feature signals

17. Create src/webview/App.tsx:
    - Reads globalSignals.activeTab
    - Renders <TabBar /> + <TabPanel feature={activeTab} />
    - Wraps in <ErrorBoundary />

18. Create src/webview/tabs/:
    - TabBar.tsx (renders feature tabs, click sets activeTab signal)
    - TabPanel.tsx (lazy-imports feature module: import(`../../features/${feature}/webview/index.js`))
    - tabRegistry.ts (Feature[] list with id, label, icon)

19. Create src/webview/components/:
    - Each component is a Preact functional component, no inline styles, uses CSS classes.
    - VirtualList.tsx is critical: accepts items, itemHeight, renderItem; uses useVirtualizer hook.
    - All components must have __tests__/{name}.test.tsx with @testing-library/preact.

20. Create src/webview/hooks/:
    - useApi() — wraps vscode.postMessage; types via WebviewMessage union
    - useDebounce<T>(value, delay)
    - useTheme() — reads CSS var values for theme awareness
    - useVirtualizer() — minimal windowing impl, ~50 LOC

21. Create src/webview/signals/globalSignals.ts:
    - activeTab signal (default "sessions")
    - ready signal (boolean)
    - theme signal

22. Create src/webview/signals/messageBus.ts:
    - Single window message handler
    - Validates via parseMessage
    - Routes to per-feature signal updaters (registered via registerFeatureHandler)

23. Create src/webview/utils/:
    - esc.ts — copy from current src/webview/utils.ts esc function (kept for any innerHTML escape, but should be rare)
    - format.ts — formatDate, formatBytes, formatRelativeTime
    - classnames.ts — re-export clsx

24. CSS foundation:
    - src/styles/tokens.css — consolidate every CSS variable used today + VS Code theme var mappings. Single source of truth.
    - src/styles/base.css — reset, body font from VS Code, scrollbar
    - src/styles/components.css — Button, ListItem, EmptyState, Modal, Loading, Icon styles
    - src/styles/tabs.css — tab bar + panel styles
    - Create empty stubs for {account,sessions,skills,commands,hooks,mcp,agents}.css
    - Update scripts/build-css.js FILES array to include new files in deterministic order.

25. Stub feature webview entries — so build doesn't fail until F2 ports them:
    - For each feature, create src/features/{F}/webview/index.tsx that exports a Preact component rendering <EmptyState>{F} migration pending</EmptyState>.
    - This is throwaway — F2 sessions overwrite.

26. .github/workflows/ci.yml:
    - Trigger: pull_request to v2/main, v2/integration-target, main
    - Matrix: node 20, 22
    - Steps: actions/checkout, setup-node, npm ci, npm run check, npm run typecheck, npm test -- --coverage, npm run build, npm run size, npm audit --omit=dev --audit-level=high

27. .github/dependabot.yml:
    - Weekly npm + github-actions, grouped minor/patch.

28. Final verification (MUST all pass):
    - npm run build — succeeds
    - npm test — green
    - npm run check — clean
    - npm run typecheck — clean
    - npm run size — within budget

29. Commit your work in logical chunks:
    - feat(F1): add Preact + valibot + Biome deps
    - feat(F1): tsconfig and build scripts for JSX webview
    - feat(F1): CSP-strict HTML shell for ESM modules
    - feat(F1): shared message protocol with valibot schemas
    - feat(F1): webview shell (App, tabs, components, hooks, signals)
    - feat(F1): CSS foundation tokens
    - feat(F1): cross-feature registry
    - feat(F1): CI workflow and dependabot
    - feat(F1): inline LRU helper
    - fix(F1/sessions): validate branch name before terminal.sendText (sec)

30. Push branch: git push -u origin v2/foundation

DO NOT:
- Add features not in this list
- Skip tests "for now"
- Skip the security fix
- Bump VS Code minimum past 1.90.0
- Touch any feature folder
- Add Tailwind, Zustand, React, Vite, SQLite, or telemetry SDKs
- Use inline styles in TSX
- Use innerHTML in Preact components (use JSX)

If you hit a blocker, commit your progress so far + write a detailed `BLOCKER.md` at repo root describing what's broken and what you tried. The orchestrator will surface it.

START NOW. Read first, plan in your head, then execute. Single commit per logical chunk.
