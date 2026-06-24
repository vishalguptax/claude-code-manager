---
name: release
description: Curate a release for the Claude Manager extension — analyze git commits since last tag, categorize them, generate a release notes markdown file in docs/releases/, decide the correct version bump, update CHANGELOG.md, and push a commit that triggers the CI/CD workflow to publish.
---

# Release Skill

Use this skill when the user says **"release"**, **"cut a release"**, **"ship it"**, or similar.

This skill curates a release for the Claude Manager VS Code extension. The CI/CD workflow (`.github/workflows/release.yml`) handles the actual version bump, build, packaging, and publish to the Marketplaces — this skill just **prepares human-readable release notes** and **decides the bump level** via the commit message.

---

## Flow

### 1. Verify git state

```bash
git status
git branch --show-current
```

- Working tree must be clean (no uncommitted changes)
- If not on `main`, ask the user whether to merge the current branch first
- Check there's anything to release: `git log $(git describe --tags --abbrev=0)..HEAD --oneline` must be non-empty

If no commits since last tag, stop and tell the user there's nothing to release.

### 2. Gather commits since last release

```bash
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -z "$LAST_TAG" ]; then
  git log --oneline
else
  git log $LAST_TAG..HEAD --oneline
fi
```

Read the list. Ignore commits authored by `github-actions[bot]` (those are auto-bumps).

### 3. Categorize commits

Group commits by conventional-commit prefix:

| Prefix | Section title |
| :-- | :-- |
| `feat:` / `feature:` | Features |
| `fix:` | Bug Fixes |
| `perf:` | Performance |
| `refactor:` | Refactoring |
| `docs:` | Documentation |
| `style:` | UI/Styling |
| `test:` | Tests |
| `build:` / `chore:` / `ci:` | Build / CI |
| anything else | Other |

Skip commits that are **purely** version bumps (`release: v1.2.3`) or merge commits (`Merge branch`) unless they carry meaningful content.

### 4. Decide bump level

Inspect commit messages to determine `patch` / `minor` / `major`:

- **Major**: any commit message contains `[major]` or starts with `breaking:` or `BREAKING CHANGE`
- **Minor**: any commit message contains `[minor]` or starts with `feat:` or `feature:`
- **Patch**: anything else (fixes, chores, docs, perf, refactor, style)

### 5. Compute next version

Read current version from `package.json`:

```bash
node -p "require('./package.json').version"
```

Apply the bump rule to get the next version (e.g., `1.1.1` + minor → `1.2.0`).

### 6. Generate the release notes markdown

Create a new file at `docs/releases/v{nextVersion}.md` with this structure:

```markdown
# v{nextVersion}

_Released YYYY-MM-DD_

<one-sentence summary of the release — what's the headline feature or theme>

## ✨ Features
- <feat: commit subject> ([short-sha](link-to-commit))
- ...

## 🐛 Bug Fixes
- <fix: commit subject> ([sha])
- ...

## ⚡ Performance
- ...

## 💅 UI / Styling
- ...

## 📦 Build / CI
- ...

## 📚 Documentation
- ...

## 🔧 Refactoring
- ...

## Other
- ...

---

**Full changelog**: https://github.com/vishalguptax/claude-manager/compare/{lastTag}...{nextVersion}
```

Skip empty sections. If a section has no commits, omit it entirely. Keep commit subjects as-is (don't paraphrase) but strip the `feat:` / `fix:` etc. prefix so the section headings carry the type info.

Links: use `https://github.com/vishalguptax/claude-manager/commit/{full-sha}` as the href, show the 7-char short SHA as the link text.

### 7. Update CHANGELOG.md at repo root

Prepend a new entry to `CHANGELOG.md` (create it if it doesn't exist) in this format:

```markdown
# Changelog

## [{nextVersion}] - YYYY-MM-DD

<same one-sentence summary as the release notes file>

See [docs/releases/v{nextVersion}.md](docs/releases/v{nextVersion}.md) for full details.

## [{previousVersion}] - ...
...
```

This keeps the root CHANGELOG short and marketplace-friendly while the per-release files hold the full detail.

### 8. Commit everything

Stage the new release notes file and the updated CHANGELOG.md. Commit with a message that includes the bump keyword so the CI workflow picks the right level:

- Patch: `release: v{nextVersion}` (no keyword needed, default is patch)
- Minor: `release: v{nextVersion} [minor]`
- Major: `release: v{nextVersion} [major]`

Example:

```bash
git add docs/releases/v1.2.0.md CHANGELOG.md
git commit -m "release: v1.2.0 [minor]"
```

### 9. Push

```bash
git push
```

The CI workflow `.github/workflows/release.yml` will:

1. Run tests
2. Build the extension
3. Bump `package.json` version (same bump we computed, via the commit message keyword)
4. Re-commit the version bump back to `main` as `github-actions[bot]`
5. Tag `{nextVersion}`
6. Package the `.vsix`
7. Publish to VS Code Marketplace (if `VSCE_PAT` secret set)
8. Publish to Open VSX (if `OVSX_TOKEN` secret set)
9. Create a GitHub Release with the `.vsix` attached, using the content of `docs/releases/v{nextVersion}.md` as the release body (workflow reads the file)

### 10. Report back

Tell the user:

- The new version number
- The bump level (patch / minor / major)
- How many commits are included
- Where the release notes file was created
- That CI is now handling the publish
- Link to Actions: `https://github.com/vishalguptax/claude-manager/actions`

---

## Guardrails

- **Never bump version in package.json directly** — let the CI workflow do it to avoid conflicts.
- **Never create the git tag directly** — CI creates it after bumping.
- **Never run `npm publish` or `vsce publish` locally** — CI owns publishing.
- **Don't include bot commits** in release notes (they're version bumps, not meaningful changes).
- **Don't release from a dirty tree** — stop and ask the user to commit or stash first.
- **Don't release from a feature branch without asking** — the main branch is the release source.
- If the user hasn't added the `VSCE_PAT` / `OVSX_TOKEN` secrets, the publish steps are skipped silently but the GitHub Release still gets created — mention this in the report.

## File expected by CI

The CI workflow expects the release notes file at:

```
docs/releases/v{version}.md
```

It uses `body_path` on the `softprops/action-gh-release` step to load the file content into the GitHub Release body. If the file is missing, the workflow falls back to GitHub's auto-generated release notes.
