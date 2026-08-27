import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { FileIndex } from "../src/file-index";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "zhcode-context-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("FileIndex", () => {
  test("indexes files in project", async () => {
    await fs.writeFile(path.join(tmpDir, "index.ts"), "export {};");
    await fs.writeFile(
      path.join(tmpDir, "app.ts"),
      "import {} from './index';",
    );

    const index = new FileIndex(tmpDir);
    await index.build();

    expect(index.count).toBe(2);
    expect(index.getByPath("index.ts")).toBeDefined();
    expect(index.getByPath("app.ts")).toBeDefined();
  });

  test("skips node_modules", async () => {
    await fs.mkdir(path.join(tmpDir, "node_modules"));
    await fs.writeFile(path.join(tmpDir, "node_modules", "dep.ts"), "");
    await fs.writeFile(path.join(tmpDir, "app.ts"), "");

    const index = new FileIndex(tmpDir);
    await index.build();

    expect(index.count).toBe(1);
    expect(index.getByPath("app.ts")).toBeDefined();
  });

  test("detects file languages", async () => {
    await fs.writeFile(path.join(tmpDir, "app.ts"), "");
    await fs.writeFile(path.join(tmpDir, "main.py"), "");
    await fs.writeFile(path.join(tmpDir, "index.js"), "");

    const index = new FileIndex(tmpDir);
    await index.build();

    expect(index.getByPath("app.ts")?.language).toBe("typescript");
    expect(index.getByPath("main.py")?.language).toBe("python");
    expect(index.getByPath("index.js")?.language).toBe("javascript");
  });

  test("identifies important files", async () => {
    await fs.writeFile(path.join(tmpDir, "index.ts"), "");
    await fs.writeFile(path.join(tmpDir, "README.md"), "");
    await fs.writeFile(path.join(tmpDir, "random.ts"), "");

    const index = new FileIndex(tmpDir);
    await index.build();

    expect(index.getByPath("index.ts")?.isImportant).toBe(true);
    expect(index.getByPath("README.md")?.isImportant).toBe(true);
    expect(index.getByPath("random.ts")?.isImportant).toBe(false);
  });

  test("searchByPath finds files", async () => {
    await fs.mkdir(path.join(tmpDir, "src"));
    await fs.writeFile(path.join(tmpDir, "src", "auth.ts"), "");
    await fs.writeFile(path.join(tmpDir, "src", "user.ts"), "");

    const index = new FileIndex(tmpDir);
    await index.build();

    const results = index.searchByPath("auth");
    expect(results.length).toBe(1);
    expect(results[0]!.path).toContain("auth");
  });

  test("getByLanguage filters correctly", async () => {
    await fs.writeFile(path.join(tmpDir, "app.ts"), "");
    await fs.writeFile(path.join(tmpDir, "main.py"), "");

    const index = new FileIndex(tmpDir);
    await index.build();

    const tsFiles = index.getByLanguage("typescript");
    expect(tsFiles.length).toBe(1);
    expect(tsFiles[0]!.path).toBe("app.ts");
  });
});
