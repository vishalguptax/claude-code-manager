import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";

/**
 * Module mocks must be hoisted by vitest. `vi.hoisted` lets the mock
 * factories reach the shared test-controlled values without triggering
 * "Cannot access X before initialization" at import time.
 */
const { credsState, requestState } = vi.hoisted(() => ({
  credsState: { token: "test-token-xyz", missing: false } as {
    token: string;
    missing: boolean;
  },
  requestState: {
    lastOptions: null as unknown as Record<string, unknown> | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: null as null | ((req: any, cb: any) => void),
  },
}));

vi.mock("fs", () => ({
  readFileSync: (p: string): string => {
    if (typeof p === "string" && p.endsWith(".credentials.json")) {
      if (credsState.missing) {
        const err = new Error("ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      }
      return JSON.stringify({
        claudeAiOauth: { accessToken: credsState.token },
      });
    }
    return "";
  },
}));

vi.mock("https", () => ({
  request: (options: Record<string, unknown>, cb: (res: EventEmitter) => void) => {
    requestState.lastOptions = options;
    const req = new EventEmitter() as EventEmitter & {
      end: () => void;
      destroy: (err?: Error) => void;
    };
    req.end = () => {
      if (requestState.handler) {
        requestState.handler(req, cb);
      }
    };
    req.destroy = () => {};
    return req;
  },
}));

// Module under test — imported AFTER mocks so its require() picks up
// our stubs instead of the real fs / https.
import { fetchQuota } from "../quota";

/** Drive the mocked `https.request` to emit a response with the given status + body. */
function whenHttps(statusCode: number, body: string): void {
  requestState.handler = (_req, cb) => {
    setImmediate(() => {
      const res = new EventEmitter() as EventEmitter & {
        statusCode?: number;
        setEncoding?: (e: string) => void;
      };
      res.statusCode = statusCode;
      res.setEncoding = () => {};
      cb(res);
      res.emit("data", body);
      res.emit("end");
    });
  };
}

/** Drive the mocked `https.request` to emit a connection error. */
function whenHttpsError(msg: string): void {
  requestState.handler = (req) => {
    setImmediate(() => req.emit("error", new Error(msg)));
  };
}

beforeEach(() => {
  credsState.token = "test-token-xyz";
  credsState.missing = false;
  requestState.lastOptions = null;
  requestState.handler = null;
});

describe("fetchQuota", () => {
  it("returns no-credentials error when the creds file is missing", async () => {
    credsState.missing = true;
    const result = await fetchQuota();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("no-credentials");
      expect(result.error.message).toMatch(/log in/i);
    }
  });

  it("returns no-credentials error when the token field is empty", async () => {
    credsState.token = "";
    const result = await fetchQuota();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("no-credentials");
  });

  it("returns unauthorized when the API replies with 401", async () => {
    whenHttps(401, '{"error":"expired"}');
    const result = await fetchQuota();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("unauthorized");
      expect(result.error.message).toMatch(/no longer valid|expired|refresh/i);
    }
  });

  it("returns network error for non-401 HTTP failures", async () => {
    whenHttps(503, "service unavailable");
    const result = await fetchQuota();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("network");
      expect(result.error.message).toContain("503");
    }
  });

  it("returns network error when the request errors before a response", async () => {
    whenHttpsError("ECONNRESET");
    const result = await fetchQuota();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("network");
      expect(result.error.message).toContain("ECONNRESET");
    }
  });

  it("returns parse error when the response isn't JSON", async () => {
    whenHttps(200, "<html>oops</html>");
    const result = await fetchQuota();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("parse");
      expect(result.error.message).toMatch(/JSON/i);
    }
  });

  it("returns parse error when expected fields are missing", async () => {
    whenHttps(200, JSON.stringify({ extra_usage: null }));
    const result = await fetchQuota();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("parse");
  });

  it("normalises a fully-populated quota response", async () => {
    whenHttps(
      200,
      JSON.stringify({
        five_hour: { utilization: 11.5, resets_at: "2026-04-21T01:00:00Z" },
        seven_day: { utilization: 46, resets_at: "2026-04-24T05:00:00Z" },
        seven_day_sonnet: { utilization: 0, resets_at: "2026-04-24T10:00:00Z" },
        seven_day_opus: null,
        extra_usage: {
          is_enabled: true,
          monthly_limit: 20,
          used_credits: 3.5,
          utilization: 17.5,
          currency: "USD",
        },
      }),
    );
    const result = await fetchQuota();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.fiveHour.utilization).toBe(11.5);
    expect(result.data.sevenDay.resetsAt).toBe("2026-04-24T05:00:00Z");
    expect(result.data.sevenDaySonnet).toEqual({
      utilization: 0,
      resetsAt: "2026-04-24T10:00:00Z",
    });
    expect(result.data.sevenDayOpus).toBeNull();
    expect(result.data.extraUsage).toEqual({
      enabled: true,
      monthlyLimit: 20,
      usedCredits: 3.5,
      utilization: 17.5,
      currency: "USD",
    });
    expect(typeof result.data.fetchedAt).toBe("string");
  });

  it("drops optional windows when the API reports them as null", async () => {
    whenHttps(
      200,
      JSON.stringify({
        five_hour: { utilization: 5, resets_at: null },
        seven_day: { utilization: 12, resets_at: null },
        seven_day_sonnet: null,
        seven_day_opus: null,
        extra_usage: null,
      }),
    );
    const result = await fetchQuota();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.sevenDaySonnet).toBeNull();
    expect(result.data.sevenDayOpus).toBeNull();
    expect(result.data.extraUsage).toBeNull();
    expect(result.data.fiveHour.resetsAt).toBe("");
  });

  it("sends the required Authorization and anthropic-beta headers", async () => {
    whenHttps(
      200,
      JSON.stringify({
        five_hour: { utilization: 1, resets_at: "" },
        seven_day: { utilization: 1, resets_at: "" },
      }),
    );
    await fetchQuota();
    const opts = requestState.lastOptions as {
      host: string;
      path: string;
      headers: Record<string, string>;
    };
    expect(opts.host).toBe("api.anthropic.com");
    expect(opts.path).toBe("/api/oauth/usage");
    expect(opts.headers.Authorization).toBe("Bearer test-token-xyz");
    expect(opts.headers["anthropic-beta"]).toBe("oauth-2025-04-20");
  });
});
