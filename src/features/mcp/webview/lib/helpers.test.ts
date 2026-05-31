import { describe, expect, it } from "vitest";
import type { McpServer } from "../../types";
import {
  buildRows,
  connectionPreview,
  groupLabel,
  maskSensitiveValue,
} from "./helpers";

function srv(p: Partial<McpServer> & Pick<McpServer, "name" | "scope">): McpServer {
  return { type: "stdio", command: "node", ...p };
}

describe("groupLabel", () => {
  it("labels by scope, naming the plugin for plugin servers", () => {
    expect(groupLabel(srv({ name: "a", scope: "project" }))).toBe("Project Servers");
    expect(groupLabel(srv({ name: "a", scope: "global" }))).toBe("Global Servers");
    expect(groupLabel(srv({ name: "a", scope: "plugin", pluginName: "p@m" }))).toBe(
      "Plugin: p@m",
    );
    expect(groupLabel(srv({ name: "a", scope: "plugin" }))).toBe("Plugin: unknown");
  });
});

describe("buildRows", () => {
  it("interleaves a group-label row before each new scope group", () => {
    const rows = buildRows([
      srv({ name: "a", scope: "project" }),
      srv({ name: "b", scope: "global" }),
      srv({ name: "c", scope: "global" }),
    ]);
    expect(rows.map((r) => (r.kind === "label" ? `L:${r.label}` : `I:${r.server.name}`))).toEqual([
      "L:Project Servers",
      "I:a",
      "L:Global Servers",
      "I:b",
      "I:c",
    ]);
  });
});

describe("connectionPreview", () => {
  it("joins command + args for stdio servers", () => {
    expect(connectionPreview(srv({ name: "a", scope: "project", args: ["x.js"] }))).toBe(
      "node x.js",
    );
  });

  it("uses the url for http servers", () => {
    expect(
      connectionPreview(srv({ name: "a", scope: "global", type: "http", url: "https://h" })),
    ).toBe("https://h");
  });

  it("truncates long previews", () => {
    const long = "a".repeat(100);
    const out = connectionPreview(srv({ name: "a", scope: "project", command: long }));
    expect(out.endsWith("...")).toBe(true);
    expect(out.length).toBe(63);
  });
});

describe("maskSensitiveValue", () => {
  it("fully masks short values", () => {
    expect(maskSensitiveValue("short")).toBe("****");
    expect(maskSensitiveValue("12345678")).toBe("****");
  });

  it("keeps the first and last 4 characters of long values", () => {
    expect(maskSensitiveValue("abcdefghijkl")).toBe("abcd****ijkl");
  });
});
