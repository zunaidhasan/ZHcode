import { describe, expect, test } from "bun:test";
import * as os from "node:os";
import * as path from "node:path";
import { PermissionManager, PermissionProfiles } from "../src/permissions";
import { ToolContext } from "../src/context";
import { ToolRegistry } from "../src/registry";
import { readFileTool } from "../src/tools/read_file";
import { writeFileTool } from "../src/tools/write_file";

// Use a platform-appropriate temp directory for tests
const TEST_ROOT = path.join(os.tmpdir(), "zhcode-perm-test");

describe("PermissionManager", () => {
  test("defaults to readOnly permissions", () => {
    const pm = new PermissionManager({ projectRoot: TEST_ROOT });
    expect(pm.has("read")).toBe(true);
    expect(pm.has("write")).toBe(false);
    expect(pm.has("execute")).toBe(false);
  });

  test("grant adds a permission", () => {
    const pm = new PermissionManager({ projectRoot: TEST_ROOT });
    pm.grant("write");
    expect(pm.has("write")).toBe(true);
  });

  test("revoke removes a permission", () => {
    const pm = new PermissionManager({ projectRoot: TEST_ROOT });
    pm.grant("write");
    pm.revoke("write");
    expect(pm.has("write")).toBe(false);
  });

  test("list returns all granted permissions", () => {
    const pm = new PermissionManager({ projectRoot: TEST_ROOT });
    pm.grant("execute");
    pm.grant("git");
    const perms = pm.list();
    expect(perms).toContain("read");
    expect(perms).toContain("execute");
    expect(perms).toContain("git");
  });

  test("createContext uses current permissions", () => {
    const pm = new PermissionManager({ projectRoot: TEST_ROOT });
    pm.grant("write");
    const ctx = pm.createContext({ projectRoot: TEST_ROOT });
    expect(ctx.hasPermission("read")).toBe(true);
    expect(ctx.hasPermission("write")).toBe(true);
    expect(ctx.hasPermission("execute")).toBe(false);
  });

  test("canExecute checks tool permission", () => {
    const registry = new ToolRegistry();
    registry.register(readFileTool);
    registry.register(writeFileTool);

    const pm = new PermissionManager({ projectRoot: TEST_ROOT });
    expect(pm.canExecute("read_file", registry)).toBe(true);
    expect(pm.canExecute("write_file", registry)).toBe(false);

    pm.grant("write");
    expect(pm.canExecute("write_file", registry)).toBe(true);
  });

  test("PermissionProfiles.full grants everything", () => {
    const pm = new PermissionManager({
      projectRoot: TEST_ROOT,
      initialPermissions: [...PermissionProfiles.full],
    });
    expect(pm.has("read")).toBe(true);
    expect(pm.has("write")).toBe(true);
    expect(pm.has("execute")).toBe(true);
    expect(pm.has("network")).toBe(true);
    expect(pm.has("git")).toBe(true);
  });
});

describe("ToolContext", () => {
  test("resolves paths relative to project root", () => {
    // Use a real temp directory for path resolution tests
    const ctx = new ToolContext({ projectRoot: TEST_ROOT });
    const resolved = ctx.resolvePath("src/index.ts");
    expect(resolved).toContain("src/index.ts");
    expect(resolved).toContain(TEST_ROOT.replace(/\\/g, "/").split("/").pop() ?? "");
  });

  test("prevents path traversal", () => {
    const ctx = new ToolContext({ projectRoot: TEST_ROOT });
    expect(() => ctx.resolvePath("../../etc/passwd")).toThrow(
      /outside project root/,
    );
  });

  test("defaults cwd to projectRoot", () => {
    const ctx = new ToolContext({ projectRoot: TEST_ROOT });
    expect(ctx.cwd).toBe(TEST_ROOT.replace(/\\/g, "/"));
  });

  test("custom cwd is used for resolution", () => {
    const subDir = path.join(TEST_ROOT, "src");
    const ctx = new ToolContext({
      projectRoot: TEST_ROOT,
      cwd: subDir,
    });
    const resolved = ctx.resolvePath("index.ts");
    expect(resolved).toContain("index.ts");
  });

  test("environment variables are frozen", () => {
    const ctx = new ToolContext({
      projectRoot: TEST_ROOT,
      environment: { FOO: "bar" },
    });
    expect(ctx.environment.FOO).toBe("bar");
    expect(() => {
      (ctx.environment as Record<string, string>).FOO = "baz";
    }).toThrow();
  });
});
