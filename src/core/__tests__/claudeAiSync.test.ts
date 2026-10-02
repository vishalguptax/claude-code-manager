import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activeSyncBucket, activeSyncedDir, claudeAiSyncEnabled, syncedDirName } from "../claudeAiSync";

const ROOT = path.join(os.tmpdir(), "claude-manager-claudeai-sync-test");
const SETTINGS = path.join(ROOT, ".claude", "settings.json");

// Real shapes: two claude.ai accounts in one org, as `~/.claude.json`
// `oauthAccount` records them (other keys omitted).
const ORG = "9fed4216-cef8-4112-a5f1-f6d81fd0cc9b";
const ACCOUNT_A = "29bb35ee-48ea-4e45-afe8-5ef8aa841252";
const ACCOUNT_B = "37a1ad5d-577a-4eda-999e-63a49f2c7ef8";

function write(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
}

beforeEach(() => fs.rmSync(ROOT, { recursive: true, force: true }));
afterEach(() => fs.rmSync(ROOT, { recursive: true, force: true }));

describe("activeSyncBucket", () => {
  it("names the signed-in account's bucket <org>_<account>", () => {
    const claudeJson = {
      oauthAccount: { organizationUuid: ORG, accountUuid: ACCOUNT_B, organizationRole: "admin" },
    };
    expect(activeSyncBucket(claudeJson, {})).toBe(`${ORG}_${ACCOUNT_B}`);
  });

  it("lowercases both halves, as the CLI does", () => {
    const claudeJson = {
      oauthAccount: { organizationUuid: ORG.toUpperCase(), accountUuid: ACCOUNT_A.toUpperCase() },
    };
    expect(activeSyncBucket(claudeJson, {})).toBe(`${ORG}_${ACCOUNT_A}`);
  });

  it("takes the org from CLAUDE_CODE_ORGANIZATION_UUID when it is set", () => {
    const other = "11111111-2222-3333-4444-555555555555";
    const claudeJson = { oauthAccount: { organizationUuid: ORG, accountUuid: ACCOUNT_A } };
    expect(activeSyncBucket(claudeJson, { CLAUDE_CODE_ORGANIZATION_UUID: other })).toBe(
      `${other}_${ACCOUNT_A}`,
    );
  });

  it("has no bucket when nobody is signed in to claude.ai or an id is not a UUID", () => {
    expect(activeSyncBucket(null, {})).toBeNull();
    expect(activeSyncBucket({ numStartups: 3 }, {})).toBeNull();
    expect(
      activeSyncBucket({ oauthAccount: { organizationUuid: ORG, accountUuid: "not-a-uuid" } }, {}),
    ).toBeNull();
  });
});

describe("claudeAiSyncEnabled", () => {
  it("is on by default", () => {
    expect(claudeAiSyncEnabled("skills", SETTINGS, () => null)).toBe(true);
  });

  it("honours false in user settings, per kind", () => {
    write(SETTINGS, { syncClaudeAiSkills: false });
    expect(claudeAiSyncEnabled("skills", SETTINGS, () => null)).toBe(false);
    expect(claudeAiSyncEnabled("plugins", SETTINGS, () => null)).toBe(true);
  });

  it("honours false in managed settings even when the user says true", () => {
    write(SETTINGS, { syncClaudeAiPlugins: true });
    expect(claudeAiSyncEnabled("plugins", SETTINGS, () => ({ syncClaudeAiPlugins: false }))).toBe(false);
  });

  it("does not let true anywhere turn sync on over a false", () => {
    write(SETTINGS, { syncClaudeAiSkills: false });
    expect(claudeAiSyncEnabled("skills", SETTINGS, () => ({ syncClaudeAiSkills: true }))).toBe(false);
  });
});

describe("syncedDirName", () => {
  it("keeps a plain name and appends ~g<N> for a later generation", () => {
    expect(syncedDirName("design")).toBe("design");
    expect(syncedDirName("cowork-plugin-management", 2)).toBe("cowork-plugin-management~g2");
    expect(syncedDirName("design", 1)).toBe("design");
  });

  it("replaces separators and reserved characters, and refuses a name that empties", () => {
    expect(syncedDirName("../etc/passwd")).toBe(".._etc_passwd");
    expect(syncedDirName("a:b")).toBe("a_b");
    expect(syncedDirName("..")).toBeNull();
    expect(syncedDirName("")).toBeNull();
  });
});

describe("activeSyncedDir", () => {
  it("answers from a stat alone when nothing was ever synced — no policy read", () => {
    let policyReads = 0;
    const managed = () => {
      policyReads++;
      return null;
    };
    expect(activeSyncedDir(path.join(ROOT, "skills", "synced"), "skills", managed)).toBeNull();
    expect(policyReads).toBe(0);
  });
});
