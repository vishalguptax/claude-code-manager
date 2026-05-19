You are executing phase F4 (Release prep) of the Claude Manager v2 revamp.

CRITICAL: This phase PREPARES the release. It does NOT publish to marketplace. Publishing requires manual `npm run release` invocation by Vishal after he reviews.

REQUIRED READING:
1. docs/planning/v2-revamp-plan.md §7
2. .github/workflows/release.yml (existing release pipeline)
3. CHANGELOG.md (assembled by F3)
4. package.json
5. docs/releases/v2.0.0.md

YOUR BRANCH: v2/release-prep (off v2/integration-target)

FILE ALLOWLIST:
- package.json (version bump only)
- CHANGELOG.md (final entry)
- docs/releases/v2.0.0.md (finalize)
- README.md (verify accurate)
- .github/release.yml (existing release notes config if any)

DENYLIST:
- src/** (no code changes — bugs go to v2.0.1)
- DO NOT publish anything
- DO NOT run npm run release
- DO NOT run vsce publish
- DO NOT run ovsx publish

TASKS:

1. Beta soak verification:
   - Check git log v2/integration-target for any "fix(F3/" or "fix(beta/" commits in the last 7 days
   - If beta has been stable (no critical fixes in 7+ days): proceed
   - If recent critical fixes exist: write CONTINUE_BETA.md noting that release should wait

2. Final version bump:
   - package.json: 2.0.0-beta.X → 2.0.0
   - Remove "preview": true if added during beta

3. CHANGELOG final:
   - Move v2.0.0-beta entries under a "Beta" subsection
   - Promote v2.0.0 final entries to top
   - Date today
   - Link to migration guide

4. README final review:
   - Verify all command names current
   - Verify all settings keys current
   - Verify "100% local" claim still accurate with footnote
   - Update version badges if any

5. Release artifacts (local only, do NOT publish):
   - Run: npm run build
   - Run: npm test
   - Run: npx @vscode/vsce package --out dist/
     - Produces claude-manager-2.0.0.vsix in dist/
   - Verify file size of .vsix < 5 MB
   - Verify .vsix passes vsce validate

6. Smoke install test (local):
   - Run: code --install-extension dist/claude-manager-2.0.0.vsix --force
   - Manually trigger: code --command claudeManager.openSidebar
   - Note: cannot fully automate UI verification — write VERIFY.md listing manual smoke steps for Vishal

7. Create VERIFY.md at repo root:
   - 7 features × manual verification steps
   - Expected behavior
   - Known regressions (none expected)
   - Rollback steps if anything broken

8. Final commits:
   - chore(F4): bump version to 2.0.0
   - docs(F4): finalize CHANGELOG and migration guide
   - chore(F4): produce release .vsix in dist/ (artifact only)

9. Push: git push -u origin v2/release-prep

10. STOP. Do not merge to main. Do not publish.

EXIT REPORT (write to RELEASE_READY.md at repo root):
```
# Release Ready — v2.0.0

## Verified
- [x] Beta soak: N days, M fixes
- [x] All tests green
- [x] Bundle size: extension {KB}, webview {KB}, css {KB}
- [x] .vsix built: dist/claude-manager-2.0.0.vsix ({KB})
- [x] Local install smoke: PASSED

## Manual gates remaining
- [ ] Vishal verifies .vsix in fresh VS Code (see VERIFY.md)
- [ ] Open PR v2/integration-target -> main
- [ ] Merge PR (squash recommended)
- [ ] Tag v2.0.0 + push tag
- [ ] CI publishes to Marketplace + Open VSX
- [ ] Monitor issue tracker for 72h
```

DO NOT publish. DO NOT merge to main. DO NOT tag. DO NOT push to remotes other than v2/release-prep branch.

START NOW.
