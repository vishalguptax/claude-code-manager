import { describe, it, expect, beforeEach } from "vitest";
import { registerFeatureHandler, dispatch, _resetMessageBus } from "../messageBus";
import type { Message } from "../../../../shared/protocol/messages";

describe("messageBus", () => {
  beforeEach(() => {
    _resetMessageBus();
  });

  it("dispatches to handlers whose prefix matches the message type", () => {
    const received: Message[] = [];
    registerFeatureHandler("session", (m) => received.push(m));
    dispatch({ type: "sessions", data: [] } as Message);
    expect(received).toHaveLength(1);
  });

  it("ignores handlers whose prefix does not match", () => {
    const received: Message[] = [];
    registerFeatureHandler("skills", (m) => received.push(m));
    dispatch({ type: "agents", data: [] } as Message);
    expect(received).toHaveLength(0);
  });

  it("unsubscribes when the disposer is called", () => {
    const received: Message[] = [];
    const off = registerFeatureHandler("agents", (m) => received.push(m));
    off();
    dispatch({ type: "agents", data: [] } as Message);
    expect(received).toHaveLength(0);
  });
});
