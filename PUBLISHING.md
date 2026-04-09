# Publishing Claude Code Manager to the VS Code Marketplace

A practical, end-to-end guide. The Marketplace is run by Microsoft and uses Azure DevOps for authentication, but **publishing is completely free** — you do not need an Azure subscription or a credit card.

Official references:
- VS Code publishing guide: https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- Create an Azure DevOps organization: https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/create-organization

---

## Important: Azure DevOps ≠ Azure subscription

Microsoft offers two different products with confusingly similar names. You need the first one only.

| Product | URL | Cost | Needed for publishing? |
| :-- | :-- | :-- | :-- |
| **Azure DevOps organization** | https://dev.azure.com | Free | ✅ Yes |
| **Azure subscription** (cloud resources, billing) | https://portal.azure.com | Requires credit card | ❌ No |

If at any point you see a prompt asking for a credit card, a "free trial" button, or a "pay-as-you-go" subscription — **close the tab**. You are on the wrong page. Go back to `dev.azure.com` and sign in there directly.

---

## Step 1 — Create an Azure DevOps organization (free)

1. Open https://dev.azure.com and sign in with a Microsoft account. (Create one at https://account.microsoft.com if you don't have one.)
2. When prompted, **create a new organization**. Any name works — e.g. `vishalguptax`.
3. Pick a region close to you and click **Continue**.
4. You now have a free Azure DevOps org. No credit card needed.

Reference: https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/create-organization

---

## Step 2 — Create a publisher on the Marketplace

A "publisher" is the account name that appears next to your extension on the Marketplace. It must exactly match the `publisher` field in `package.json`.

1. Go to https://marketplace.visualstudio.com/manage and sign in with the **same** Microsoft account you used for Azure DevOps.
2. Click **Create publisher**.
3. Fill in:
   - **Publisher ID**: `vishalguptax` — ⚠️ must exactly match `"publisher": "vishalguptax"` in `package.json`. This ID is **permanent** and cannot be changed later.
   - **Display name**: `Vishal Gupta`
   - Contact email
4. Submit.

---

## Step 3 — Generate a Personal Access Token (PAT)

The PAT is what `vsce` uses to authenticate publish requests.

1. Go to https://dev.azure.com and click your profile icon (top right) → **Personal Access Tokens**.
2. Click **+ New Token** and fill in:
   - **Name**: `vsce-publish`
   - **Organization**: **All accessible organizations** ← important, don't leave this on a single org
   - **Expiration**: 1 year (maximum)
   - **Scopes**: select **Custom defined**, scroll down to **Marketplace**, and check **Manage**
3. Click **Create**.
4. **Copy the token immediately** — you will not be able to see it again. Store it in a password manager.

---

## Step 4 — Login with vsce

From the project root:

```bash
npx @vscode/vsce login vishalguptax
```

Paste the PAT when prompted. The credential is cached locally; you only do this once per machine.

---

## Step 5 — Build and publish

```bash
npm run build
npx @vscode/vsce publish --no-dependencies
```

The `--no-dependencies` flag is important: this repo uses esbuild to bundle the whole extension into `dist/`, so `node_modules` should not be shipped.

Your extension goes live within 2–5 minutes at:

```
https://marketplace.visualstudio.com/items?itemName=vishalguptax.claude-code-manager
```

---

## Updating an already-published extension

1. Update `CHANGELOG.md` describing what changed.
2. Bump the version and publish in one command:

```bash
npx @vscode/vsce publish patch   # 0.1.0 → 0.1.1 (bug fixes)
npx @vscode/vsce publish minor   # 0.1.0 → 0.2.0 (new features)
npx @vscode/vsce publish major   # 0.1.0 → 1.0.0 (breaking changes)
```

Rules:
- Version numbers only go **up**. You cannot re-publish the same version.
- To take a broken version down, run `npx @vscode/vsce unpublish vishalguptax.claude-code-manager@X.Y.Z`.

---

## Pre-publish sanity checks

**See exactly what will be packaged:**

```bash
npx @vscode/vsce ls
```

Verify there's no `node_modules/`, no `.env`, no source maps, no screenshots you didn't mean to ship.

**Package without publishing** (to inspect the VSIX locally first):

```bash
npm run package
# → produces claude-code-manager-0.1.0.vsix
```

Install it locally via `Ctrl+Shift+P` → **Extensions: Install from VSIX…** and smoke-test before pushing to the Marketplace.

---

## Required files — checklist

All present in this repo:

- [x] `package.json` with `displayName`, `description`, `icon`, `repository`, `categories`, `keywords`, `publisher`
- [x] `README.md` — rendered as the Marketplace landing page
- [x] `CHANGELOG.md` — shown on the "Changelog" tab on Marketplace
- [x] `LICENSE` — MIT
- [x] `media/marketplace-icon.png` — 128×128 PNG referenced by the `icon` field

---

## Compatibility with other editors

The VS Code Marketplace serves:

- **Visual Studio Code** (desktop + web)
- **Cursor**
- **Windsurf**
- **GitHub Codespaces**
- **Gitpod** (partial)

**VSCodium** and some privacy-forward forks do **not** use the VS Code Marketplace — they use [Open VSX](https://open-vsx.org). Publishing there is separate and optional:

```bash
# Get a token at https://open-vsx.org/user-settings/tokens
npx ovsx publish -p <OPEN_VSX_TOKEN>
```

---

## Troubleshooting

**"ERROR: Publisher ID mismatch"**
Your `package.json` has a different `publisher` field than the publisher you created. They must be identical.

**"ERROR: 401 Unauthorized"**
Your PAT expired or was created without the `Marketplace: Manage` scope. Regenerate it and re-run `vsce login`.

**"ERROR: Missing publisher name"**
You haven't logged in. Run `npx @vscode/vsce login <publisher-id>` first.

**"ERROR: Version X.Y.Z already exists"**
You must bump the version — either edit `package.json` manually or use `vsce publish patch|minor|major`.

**The Marketplace page is blank / shows no description**
The `README.md` is empty, malformed, or uses relative image paths. Use absolute URLs for images (e.g. GitHub raw URLs) since the Marketplace can't resolve relative paths.

**Credit card prompt appeared**
You landed on `portal.azure.com` (Azure cloud) instead of `dev.azure.com` (Azure DevOps). Close the tab and start over from Step 1.
