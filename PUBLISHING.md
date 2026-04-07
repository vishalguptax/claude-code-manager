# Publishing Claude Code Manager to VS Code Marketplace

## Prerequisites

1. **Microsoft Account** — Sign up at https://account.microsoft.com
2. **Azure DevOps Organization** — Create one at https://dev.azure.com
3. **Personal Access Token (PAT)** — Generate from Azure DevOps

## Step 1: Create a Publisher

```bash
npx @vscode/vsce create-publisher vishal
```

Or create at: https://marketplace.visualstudio.com/manage

Use:
- **Publisher ID**: `vishalguptax`
- **Display Name**: `Vishal Gupta`

## Step 2: Generate a Personal Access Token

1. Go to https://dev.azure.com
2. Click your profile icon → **Personal Access Tokens**
3. Click **+ New Token**
4. Settings:
   - **Name**: `vsce-publish`
   - **Organization**: `All accessible organizations`
   - **Scopes**: Click "Custom defined" → check **Marketplace > Manage**
   - **Expiration**: 1 year
5. Copy the token — you won't see it again

## Step 3: Login with vsce

```bash
npx @vscode/vsce login vishalguptax
# Paste your PAT when prompted
```

## Step 4: Package

```bash
npm run build
npx @vscode/vsce package --no-dependencies
```

This creates `claude-code-manager-0.1.0.vsix`.

## Step 5: Publish

```bash
npx @vscode/vsce publish --no-dependencies
```

The extension will be live on the marketplace within 5 minutes.

## Step 6: Verify

Visit: https://marketplace.visualstudio.com/items?itemName=vishalguptax.claude-code-manager

## Updating

1. Bump version in `package.json`
2. Update `CHANGELOG.md`
3. Build and publish:

```bash
npm run build
npx @vscode/vsce publish --no-dependencies
```

Or bump + publish in one command:

```bash
npx @vscode/vsce publish patch  # 0.1.0 → 0.1.1
npx @vscode/vsce publish minor  # 0.1.0 → 0.2.0
```

## Marketplace Page Checklist

- [x] `displayName` in package.json
- [x] `description` in package.json
- [x] `icon` (128x128 PNG) in package.json
- [x] `repository` URL in package.json
- [x] `categories` in package.json
- [x] `keywords` in package.json
- [x] `README.md` with screenshots
- [x] `CHANGELOG.md`
- [x] `LICENSE`

## Compatible IDEs

This extension works on all VS Code-based IDEs that use the VS Code Marketplace:
- **Visual Studio Code** (desktop + web)
- **Cursor**
- **Windsurf**
- **VSCodium** (needs Open VSX, not VS Code Marketplace)
- **GitHub Codespaces**
- **Gitpod**
