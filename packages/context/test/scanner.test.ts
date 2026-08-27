import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ProjectScanner } from "../src/scanner";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "zhcode-context-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("ProjectScanner", () => {
  test("detects TypeScript from tsconfig.json", async () => {
    await fs.writeFile(path.join(tmpDir, "tsconfig.json"), "{}");
    const scanner = new ProjectScanner(tmpDir);
    const ctx = await scanner.scan();
    expect(ctx.language).toBe("typescript");
  });

  test("detects Python from pyproject.toml", async () => {
    await fs.writeFile(path.join(tmpDir, "pyproject.toml"), "[project]\nname = 'test'");
    const scanner = new ProjectScanner(tmpDir);
    const ctx = await scanner.scan();
    expect(ctx.language).toBe("python");
  });

  test("detects PHP from composer.json", async () => {
    await fs.writeFile(path.join(tmpDir, "composer.json"), "{}");
    const scanner = new ProjectScanner(tmpDir);
    const ctx = await scanner.scan();
    expect(ctx.language).toBe("php");
  });

  test("detects TypeScript from package.json dependencies", async () => {
    await fs.writeFile(path.join(tmpDir, "package.json"), JSON.stringify({
      dependencies: { typescript: "^5.0.0" },
    }));
    const scanner = new ProjectScanner(tmpDir);
    const ctx = await scanner.scan();
    expect(ctx.language).toBe("typescript");
  });

  test("detects Bun package manager", async () => {
    await fs.writeFile(path.join(tmpDir, "bun.lock"), "");
    const scanner = new ProjectScanner(tmpDir);
    const ctx = await scanner.scan();
    expect(ctx.packageManager).toBe("bun");
  });

  test("detects npm package manager", async () => {
    await fs.writeFile(path.join(tmpDir, "package-lock.json"), "{}");
    const scanner = new ProjectScanner(tmpDir);
    const ctx = await scanner.scan();
    expect(ctx.packageManager).toBe("npm");
  });

  test("detects React framework", async () => {
    await fs.writeFile(path.join(tmpDir, "package.json"), JSON.stringify({
      dependencies: { react: "^18.0.0" },
    }));
    const scanner = new ProjectScanner(tmpDir);
    const ctx = await scanner.scan();
    expect(ctx.frameworks).toContain("react");
  });

  test("detects monorepo with workspaces", async () => {
    await fs.writeFile(path.join(tmpDir, "package.json"), JSON.stringify({
      workspaces: ["packages/*"],
    }));
    const scanner = new ProjectScanner(tmpDir);
    const ctx = await scanner.scan();
    expect(ctx.isMonorepo).toBe(true);
    expect(ctx.workspaces).toContain("packages/*");
  });

  test("returns unknown for empty project", async () => {
    const scanner = new ProjectScanner(tmpDir);
    const ctx = await scanner.scan();
    expect(ctx.language).toBe("unknown");
    expect(ctx.packageManager).toBe("unknown");
  });

  test("reads project name from package.json", async () => {
    await fs.writeFile(path.join(tmpDir, "package.json"), JSON.stringify({
      name: "my-project",
      description: "A test project",
    }));
    const scanner = new ProjectScanner(tmpDir);
    const ctx = await scanner.scan();
    expect(ctx.name).toBe("my-project");
    expect(ctx.description).toBe("A test project");
  });
});
