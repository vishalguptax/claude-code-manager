# 6 — Reclaim exact "Claude Code Manager" display name

The exact display name is held by `ClaudecodemanagerbyPrudkoArtur.claude-code-manager` — v0.1.2, 56 installs, published 2026-04, untouched since. Marketplace enforces unique display names, which is why we ship suffixed ("… — Sessions, Usage, MCP & Agents"). If Microsoft releases the name, we drop the suffix.

Low odds, five minutes, worth the email.

## Steps

1. Email from the publisher-account address (the one tied to vishalguptax on the marketplace)
2. To: VSMarketplace@microsoft.com
3. Subject + body below
4. If no reply in 3 weeks, try the marketplace publisher support form at https://aka.ms/vsmarketplace-support

## Email draft

Subject: `Display name conflict with abandoned extension — "Claude Code Manager"`

```
Hi,

I publish the extension vishalguptax.claude-manager (currently ~1.5K installs,
actively maintained, last release this week). I recently renamed it and found
the display name "Claude Code Manager" is blocked by an existing extension:

  ClaudecodemanagerbyPrudkoArtur.claude-code-manager

That extension is at v0.1.2 with 56 installs and has not been updated since
April 2026. Publishing my update with that display name fails with "This
extension display name is taken."

Is there a process for releasing a display name held by an inactive extension,
or for resolving this kind of conflict? Happy to provide anything you need
from my side.

Thanks,
Vishal Gupta
vishalguptax (marketplace publisher)
```

## After sending

- [ ] Date sent: _____________
- [ ] Reply: _____________
- [ ] If granted: drop suffix in package.json displayName + release patch
