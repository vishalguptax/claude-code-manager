<!--
Thanks for contributing to Claude Code Manager! Keep PRs focused — one concern per
PR. The CI gates (Biome, tsc, vitest + coverage, build, size-limit, npm audit)
must be green before review.
-->

## What & why

<!-- What does this change and why? Link the issue it closes, if any. -->

Closes #

## Type of change

- [ ] Bug fix (no API change)
- [ ] New feature (user-visible behaviour)
- [ ] Refactor / internal (no behaviour change)
- [ ] Docs only
- [ ] Build / tooling / CI

## Checklist

- [ ] `npm run check` (Biome) passes
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes; new/changed source has co-located `__tests__` coverage
- [ ] `npm run build` succeeds
- [ ] `npm run size` is within budget (note any intentional budget change)
- [ ] No new runtime network calls (100% local, zero telemetry is a hard promise)
- [ ] No new runtime dependency without justifying its shipped cost
- [ ] CSP/nonce respected for any new webview script or inline style
- [ ] Module boundaries respected (`src/core` no `vscode`; `webview/` no Node/`vscode`)

## Testing notes

<!-- How did you verify this? Manual steps, fixtures used, platforms tested. -->
