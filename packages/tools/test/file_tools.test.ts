import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ToolContext } from "../src/context";
import { listFilesTool } from "../src/tools/list_files";
import { readFileTool } from "../src/tools/read_file";
import { writeFileTool } from "../src/tools/write_file";
import { editFileTool } from "../src/tools/edit_file";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "zhcode-tools-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function ctx(cwd?: string): ToolContext {
  return new ToolContext({
    projectRoot: tmpDir,
    cwd: cwd ?? tmpDir,
    permissions: ["read", "write", "execute", "git"],
  });
}

// ---------------------------------------------------------------------------
// list_files
// ---------------------------------------------------------------------------

describe("list_files", () => {
  test("lists files and directories", async () => {
    await fs.mkdir(path.join(tmpDir, "src"));
    await fs.writeFile(path.join(tmpDir, "app.ts"), "hello");
    await fs.writeFile(path.join(tmpDir, "index.ts"), "world");

    const result = await listFilesTool.execute({}, ctx());
    expect(result.success).toBe(true);
    const data = result.data as { files: string[]; directories: string[] };
    expect(data.files).toContain("app.ts");
    expect(data.files).toContain("index.ts");
    expect(data.directories).toContain("src");
  });

  test("returns error for non-existent path", async () => {
    const result = await listFilesTool.execute({ path: "nope" }, ctx());
    expect(result.success).toBe(false);
    expect(result.message).toContain("not found");
  });

  test("ignores node_modules", async () => {
    await fs.mkdir(path.join(tmpDir, "node_modules"));
    await fs.writeFile(path.join(tmpDir, "node_modules", "dep.js"), "");
    await fs.writeFile(path.join(tmpDir, "app.ts"), "");

    const result = await listFilesTool.execute({}, ctx());
    const data = result.data as { files: string[]; directories: string[] };
    expect(data.directories).not.toContain("node_modules");
    expect(data.files).toContain("app.ts");
  });
});

// ---------------------------------------------------------------------------
// read_file
// ---------------------------------------------------------------------------

describe("read_file", () => {
  test("reads file content with line numbers", async () => {
    await fs.writeFile(path.join(tmpDir, "test.ts"), "line1\nline2\nline3");

    const result = await readFileTool.execute({ path: "test.ts" }, ctx());
    expect(result.success).toBe(true);
    const data = result.data as { content: string; totalLines: number };
    expect(data.content).toContain("line1");
    expect(data.content).toContain("line2");
    expect(data.totalLines).toBe(3);
  });

  test("returns error for non-existent file", async () => {
    const result = await readFileTool.execute({ path: "ghost.ts" }, ctx());
    expect(result.success).toBe(false);
    expect(result.message).toContain("not found");
  });

  test("rejects directories", async () => {
    await fs.mkdir(path.join(tmpDir, "adir"));
    const result = await readFileTool.execute({ path: "adir" }, ctx());
    expect(result.success).toBe(false);
    expect(result.message).toContain("directory");
  });

  test("rejects binary files", async () => {
    const buf = Buffer.alloc(100);
    buf[0] = 0x00; // null byte
    await fs.writeFile(path.join(tmpDir, "binary.png"), buf);

    const result = await readFileTool.execute({ path: "binary.png" }, ctx());
    expect(result.success).toBe(false);
    expect(result.message).toContain("Binary");
  });

  test("supports offset and limit", async () => {
    const content = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n");
    await fs.writeFile(path.join(tmpDir, "big.ts"), content);

    const result = await readFileTool.execute(
      { path: "big.ts", offset: 10, limit: 5 },
      ctx(),
    );
    expect(result.success).toBe(true);
    const data = result.data as { content: string; totalLines: number; offset: number; linesRead: number };
    expect(data.offset).toBe(10);
    expect(data.linesRead).toBe(5);
    expect(data.totalLines).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// write_file
// ---------------------------------------------------------------------------

describe("write_file", () => {
  test("creates a new file", async () => {
    const result = await writeFileTool.execute(
      { path: "new.ts", content: "console.log('hello');" },
      ctx(),
    );
    expect(result.success).toBe(true);

    const content = await fs.readFile(path.join(tmpDir, "new.ts"), "utf-8");
    expect(content).toBe("console.log('hello');");
  });

  test("creates parent directories", async () => {
    const result = await writeFileTool.execute(
      { path: "src/utils/helper.ts", content: "export {};" },
      ctx(),
    );
    expect(result.success).toBe(true);

    const content = await fs.readFile(path.join(tmpDir, "src/utils/helper.ts"), "utf-8");
    expect(content).toBe("export {};");
  });

  test("overwrites existing file", async () => {
    await fs.writeFile(path.join(tmpDir, "existing.ts"), "old");
    const result = await writeFileTool.execute(
      { path: "existing.ts", content: "new" },
      ctx(),
    );
    expect(result.success).toBe(true);

    const content = await fs.readFile(path.join(tmpDir, "existing.ts"), "utf-8");
    expect(content).toBe("new");
  });
});

// ---------------------------------------------------------------------------
// edit_file
// ---------------------------------------------------------------------------

describe("edit_file", () => {
  test("replaces exact text", async () => {
    await fs.writeFile(path.join(tmpDir, "edit.ts"), "function foo() {\n  return 1;\n}");

    const result = await editFileTool.execute(
      { path: "edit.ts", oldText: "return 1;", newText: "return 42;" },
      ctx(),
    );
    expect(result.success).toBe(true);

    const content = await fs.readFile(path.join(tmpDir, "edit.ts"), "utf-8");
    expect(content).toContain("return 42;");
    expect(content).not.toContain("return 1;");
  });

  test("fails when text not found", async () => {
    await fs.writeFile(path.join(tmpDir, "edit.ts"), "function foo() {}");

    const result = await editFileTool.execute(
      { path: "edit.ts", oldText: "function bar()", newText: "function baz()" },
      ctx(),
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("not found");
  });

  test("fails when text is ambiguous", async () => {
    await fs.writeFile(path.join(tmpDir, "edit.ts"), "foo foo foo");

    const result = await editFileTool.execute(
      { path: "edit.ts", oldText: "foo", newText: "bar" },
      ctx(),
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("ambiguous");
  });

  test("returns error for non-existent file", async () => {
    const result = await editFileTool.execute(
      { path: "ghost.ts", oldText: "a", newText: "b" },
      ctx(),
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("not found");
  });
});
