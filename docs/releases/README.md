# Release Notes

This directory contains curated release notes for each version, one file per release.

Files are created by the `release` skill (see `.claude/skills/release/SKILL.md`) and consumed by `.github/workflows/release.yml` to populate the GitHub Release body.

## Creating a new release

Run `/release` in Claude Code while on this repo. The skill will:

1. Analyze git commits since the last tag
2. Categorize them (features, fixes, perf, etc.)
3. Decide a bump level (patch/minor/major)
4. Generate `vX.Y.Z.md` in this directory
5. Update root `CHANGELOG.md`
6. Commit and push — CI handles the rest

## File naming

`v{major}.{minor}.{patch}.md` — matches the git tag created by CI.

Example: `v1.2.0.md`
