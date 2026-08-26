import { describe, expect, test } from "bun:test";
import { Session } from "../src/session";

describe("Session", () => {
  test("records user and assistant messages in order", () => {
    const session = new Session();
    session.addUserMessage("hi");
    session.addAssistantMessage("hello");

    expect(session.messageCount).toBe(2);
    expect([...session.history].map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
  });

  test("reset clears history but keeps the instance usable", () => {
    const session = new Session();
    session.addUserMessage("one");
    session.reset();
    expect(session.messageCount).toBe(0);

    session.addUserMessage("two");
    expect(session.messageCount).toBe(1);
  });

  test("history cannot be mutated from outside", () => {
    const session = new Session();
    session.addUserMessage("locked");

    // The returned array itself is frozen.
    expect(() => {
      (session.history as unknown[]).push({ role: "assistant", content: "x" });
    }).toThrow();
    expect(session.messageCount).toBe(1);
  });
});
