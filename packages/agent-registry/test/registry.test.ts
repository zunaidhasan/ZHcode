import { describe, expect, test } from "bun:test";
import {
  AgentRegistry,
  AgentRegistryError,
  createDefaultAgentRegistry,
} from "../src/index";

describe("AgentRegistry", () => {
  test("registers and looks up an agent definition", () => {
    const registry = new AgentRegistry();
    registry.register({
      id: "coder",
      name: "Coder",
      description: "Implements tasks",
      capabilities: ["write", "edit"],
      tools: ["read_file", "write_file", "edit_file"],
      toolPolicy: ["read", "write"],
      defaultModelClass: "balanced",
      defaultTaskClass: "code",
    });
    const def = registry.get("coder");
    expect(def.name).toBe("Coder");
    expect(def.toolPolicy).toContain("write");
  });

  test("throws on duplicate registration", () => {
    const registry = new AgentRegistry();
    const def = {
      id: "coder" as const,
      name: "Coder",
      description: "d",
      capabilities: ["write" as const],
      tools: [],
      toolPolicy: ["write" as const],
      defaultModelClass: "balanced" as const,
      defaultTaskClass: "code" as const,
    };
    registry.register(def);
    expect(() => registry.register(def)).toThrow(AgentRegistryError);
  });

  test("throws on unknown lookup", () => {
    const registry = new AgentRegistry();
    expect(() => registry.get("nope")).toThrow(/Unknown agent/);
  });
});

describe("createDefaultAgentRegistry", () => {
  test("includes explorer, planner, coder, tester, reviewer, debugger", () => {
    const registry = createDefaultAgentRegistry();
    const ids = registry.list().map((d) => d.id).sort();
    expect(ids).toEqual([
      "coder",
      "debugger",
      "explorer",
      "planner",
      "reviewer",
      "tester",
    ]);
  });

  test("explorer is read-only and cheap", () => {
    const explorer = createDefaultAgentRegistry().get("explorer");
    expect(explorer.toolPolicy).toEqual(["read"]);
    expect(explorer.defaultModelClass).toBe("cheap");
    expect(explorer.capabilities).not.toContain("write");
  });

  test("coder may write and edit", () => {
    const coder = createDefaultAgentRegistry().get("coder");
    expect(coder.toolPolicy).toContain("write");
    expect(coder.capabilities).toContain("edit");
  });
});
