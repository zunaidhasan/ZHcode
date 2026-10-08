import { describe, expect, test } from "bun:test";
import { ZHcodeApp } from "../src/app";
import type { AgentEvent } from "@zhcode/agent-runtime";

describe("ZHcodeApp event wiring", () => {
  test("runAgent forwards events to the provided handler", async () => {
    const events: AgentEvent["type"][] = [];
    const app = new ZHcodeApp();
    await app.runAgent("hello", (e) => events.push(e.type));
    expect(events).toContain("thinking");
    expect(events).toContain("complete");
  });
});
