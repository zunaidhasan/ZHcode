import { describe, expect, test } from "bun:test";
import { ZHcodeApp } from "../src/app";

describe("ZHcodeApp commands", () => {
  test("/help lists all available commands", () => {
    const res = new ZHcodeApp().handle("/help");
    expect(res.action).toBe("continue");
    const text = res.lines.join("\n");
    for (const cmd of ["/help", "/clear", "/version", "/exit"]) {
      expect(text).toContain(cmd);
    }
  });

  test("/version reports the current version", () => {
    const res = new ZHcodeApp().handle("/version");
    expect(res.action).toBe("continue");
    expect(res.lines[0]).toMatch(/^ZHcode v\d+\.\d+\.\d+$/);
  });

  test("/clear resets conversation state", () => {
    const app = new ZHcodeApp();
    app.handle("remember this");
    app.handle("and this");
    expect(app.messageCount).toBeGreaterThan(0);

    const res = app.handle("/clear");
    expect(res.action).toBe("clear");
    expect(app.messageCount).toBe(0);
  });

  test("/exit signals exit action", () => {
    const res = new ZHcodeApp().handle("/exit");
    expect(res.action).toBe("exit");
  });
});

describe("ZHcodeApp messages", () => {
  test("plain messages are stored in the session with a stub reply", () => {
    const app = new ZHcodeApp();
    const res = app.handle("create a login page");

    expect(res.action).toBe("continue");
    expect(app.messageCount).toBe(2); // user + stub assistant reply
  });

  test("unknown commands get guidance instead of crashing", () => {
    const res = new ZHcodeApp().handle("/nope");
    expect(res.action).toBe("continue");
    expect(res.lines.join("\n")).toContain("/help");
  });

  test("empty input is a no-op", () => {
    const app = new ZHcodeApp();
    const res = app.handle("   ");
    expect(res.action).toBe("continue");
    expect(res.lines).toHaveLength(0);
    expect(app.messageCount).toBe(0);
  });
});
