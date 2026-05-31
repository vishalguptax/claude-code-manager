// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { render } from "@testing-library/preact";
import type { Message, SessionDetail } from "../../../types";
import { DetailView } from "./DetailView";
import {
  currentProjectSignal,
  detailLoadingSignal,
  detailSignal,
  _resetSessionsSignals,
} from "../../model";

vi.mock("../../../../../webview/shared/hooks", async (importActual) => ({
  ...(await importActual<typeof import("../../../../../webview/shared/hooks")>()),
  useApi: () => ({ post: () => {} }),
  setVscodeApi: () => {},
}));

function msg(over: Partial<Message>): Message {
  return { role: "user", content: "c", timestamp: "", ...over };
}

function detail(over: Partial<SessionDetail> = {}): SessionDetail {
  return {
    id: "a",
    name: "My session",
    project: "proj",
    projectPath: "/p",
    branch: "main",
    entrypoint: "cli",
    startTime: 1_700_000_000_000,
    endTime: 1_700_000_300_000,
    messageCount: 2,
    summary: "the summary",
    prompts: [],
    projectKey: "proj",
    searchHaystack: "",
    messages: [msg({ content: "first" }), msg({ role: "assistant", content: "second" })],
    totalMessages: 2,
    detailMode: "last",
    ...over,
  };
}

describe("DetailView", () => {
  beforeEach(() => _resetSessionsSignals());

  it("renders a loading shell while loading", () => {
    detailLoadingSignal.value = true;
    detailSignal.value = null;
    const { container } = render(h(DetailView, {}));
    // The bare "Loading…" text was replaced by the content-shaped detail skeleton.
    expect(container.querySelector(".skeleton-detail-body")).toBeTruthy();
  });

  it("renders the title, project and messages", () => {
    currentProjectSignal.value = "proj";
    detailSignal.value = detail();
    const { container, getByText } = render(h(DetailView, {}));
    expect(container.querySelector(".d-title")?.textContent).toBe("My session");
    expect(getByText("Messages (2)")).toBeTruthy();
    expect(container.querySelectorAll(".d-msg").length).toBe(2);
  });

  it("renders newest-first in last mode", () => {
    currentProjectSignal.value = "proj";
    detailSignal.value = detail({ detailMode: "last" });
    const { container } = render(h(DetailView, {}));
    const contents = [...container.querySelectorAll(".d-msg-content")].map((e) => e.textContent);
    // last mode reverses → assistant "second" first.
    expect(contents[0]).toBe("second");
  });

  it("shows the cross-project notice when the session is from another project", () => {
    currentProjectSignal.value = "other";
    detailSignal.value = detail({ project: "proj", projectKey: "proj" });
    const { container, getByText } = render(h(DetailView, {}));
    expect(container.querySelector(".d-notice")).toBeTruthy();
    expect(getByText(/Open .* to resume/)).toBeTruthy();
  });

  it("shows the resume action for a same-project session", () => {
    currentProjectSignal.value = "proj";
    detailSignal.value = detail();
    const { getByText } = render(h(DetailView, {}));
    expect(getByText("Resume")).toBeTruthy();
  });

  it("shows the latest/earliest toggle (shared Segmented) only for long transcripts", () => {
    currentProjectSignal.value = "proj";
    detailSignal.value = detail({ totalMessages: 200 });
    const { container, getByText } = render(h(DetailView, {}));
    // Migrated from the legacy .vs-segmented pill to the shared <Segmented>
    // (native .vsc-segmented track look), so the selected-state matches every
    // other segmented control in the app.
    expect(container.querySelector(".vsc-segmented")).toBeTruthy();
    expect(getByText("Latest")).toBeTruthy();
    expect(getByText("Earliest")).toBeTruthy();
  });

  it("hides the toggle for short transcripts", () => {
    currentProjectSignal.value = "proj";
    detailSignal.value = detail({ totalMessages: 2 });
    const { container } = render(h(DetailView, {}));
    expect(container.querySelector(".vsc-segmented")).toBeNull();
  });
});
