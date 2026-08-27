import { describe, expect, test } from "bun:test";
import { ToolRegistry } from "../src/registry";
import { ToolError } from "../src/types";
import type { Tool, ToolResult } from "../src/types";
import { ToolContext } from "../src/context";

function createMockTool(name: string): Tool {
  return {
    name,
    description: `Mock tool: ${name}`,
    inputSchema: { type: "object", properties: {} },
    permission: "read",
    async execute(_input, _context): Promise<ToolResult> {
      return { success: true, data: { tool: name } };
    },
  };
}

function createContext(): ToolContext {
  return new ToolContext({
    projectRoot: "/tmp/test-project",
    permissions: ["read", "write", "execute", "git"],
  });
}

describe("ToolRegistry.register()", () => {
  test("registers a tool successfully", () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool("test_tool"));
    expect(registry.has("test_tool")).toBe(true);
  });

  test("throws on duplicate registration", () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool("dup"));
    expect(() => registry.register(createMockTool("dup"))).toThrow(
      /already registered/,
    );
  });
});

describe("ToolRegistry.unregister()", () => {
  test("removes a registered tool", () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool("removable"));
    expect(registry.unregister("removable")).toBe(true);
    expect(registry.has("removable")).toBe(false);
  });

  test("returns false for unknown tool", () => {
    const registry = new ToolRegistry();
    expect(registry.unregister("nonexistent")).toBe(false);
  });
});

describe("ToolRegistry.get() and has()", () => {
  test("returns the registered tool", () => {
    const registry = new ToolRegistry();
    const tool = createMockTool("my_tool");
    registry.register(tool);
    expect(registry.get("my_tool")).toBe(tool);
  });

  test("returns undefined for unknown tool", () => {
    const registry = new ToolRegistry();
    expect(registry.get("nope")).toBeUndefined();
  });

  test("has() returns true for registered tools", () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool("exists"));
    expect(registry.has("exists")).toBe(true);
    expect(registry.has("missing")).toBe(false);
  });
});

describe("ToolRegistry.list()", () => {
  test("lists all registered tool names", () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool("alpha"));
    registry.register(createMockTool("beta"));
    registry.register(createMockTool("gamma"));

    const names = registry.list();
    expect(names).toContain("alpha");
    expect(names).toContain("beta");
    expect(names).toContain("gamma");
    expect(names.length).toBe(3);
  });

  test("listTools returns metadata", () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool("x"));
    const tools = registry.listTools();
    expect(tools.length).toBe(1);
    expect(tools[0]!.name).toBe("x");
    expect(tools[0]!.permission).toBe("read");
  });
});

describe("ToolRegistry.execute()", () => {
  test("executes a registered tool", async () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool("exec_me"));
    const result = await registry.execute("exec_me", {}, createContext());
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ tool: "exec_me" });
  });

  test("returns error for unknown tool", async () => {
    const registry = new ToolRegistry();
    const result = await registry.execute("ghost", {}, createContext());
    expect(result.success).toBe(false);
    expect(result.message).toContain("Unknown tool");
  });

  test("returns permission denied when context lacks permission", async () => {
    const readOnlyContext = new ToolContext({
      projectRoot: "/tmp/test",
      permissions: ["read"],
    });

    const registry = new ToolRegistry();
    const writeTool: Tool = {
      name: "write_tool",
      description: "writes",
      inputSchema: {},
      permission: "write",
      async execute() {
        return { success: true, data: null };
      },
    };
    registry.register(writeTool);

    const result = await registry.execute("write_tool", {}, readOnlyContext);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Permission denied");
  });

  test("handles tool execution errors gracefully", async () => {
    const registry = new ToolRegistry();
    const badTool: Tool = {
      name: "bad_tool",
      description: "fails",
      inputSchema: {},
      permission: "read",
      async execute() {
        throw new ToolError(
          "bad_tool",
          "Something went wrong",
          "EXECUTION_ERROR",
        );
      },
    };
    registry.register(badTool);

    const result = await registry.execute("bad_tool", {}, createContext());
    expect(result.success).toBe(false);
    expect(result.message).toContain("Something went wrong");
  });

  test("handles non-ToolError exceptions", async () => {
    const registry = new ToolRegistry();
    const crashTool: Tool = {
      name: "crash_tool",
      description: "crashes",
      inputSchema: {},
      permission: "read",
      async execute() {
        throw new Error("unexpected crash");
      },
    };
    registry.register(crashTool);

    const result = await registry.execute("crash_tool", {}, createContext());
    expect(result.success).toBe(false);
    expect(result.message).toContain("unexpected crash");
  });
});
