import { describe, expect, test } from "bun:test";
import { createDefaultRegistry } from "../src/index";

describe("createDefaultRegistry()", () => {
  test("registers all 7 built-in tools", () => {
    const registry = createDefaultRegistry();
    const tools = registry.list();

    expect(tools).toContain("list_files");
    expect(tools).toContain("read_file");
    expect(tools).toContain("search_files");
    expect(tools).toContain("write_file");
    expect(tools).toContain("edit_file");
    expect(tools).toContain("run_command");
    expect(tools).toContain("git_status");
    expect(tools.length).toBe(7);
  });

  test("all tools have descriptions", () => {
    const registry = createDefaultRegistry();
    const tools = registry.listTools();
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  test("all tools have valid permission levels", () => {
    const registry = createDefaultRegistry();
    const validPermissions = new Set(["read", "write", "execute", "network", "git"]);
    const tools = registry.listTools();
    for (const tool of tools) {
      expect(validPermissions.has(tool.permission)).toBe(true);
    }
  });
});
