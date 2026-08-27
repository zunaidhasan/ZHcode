import { describe, expect, test, beforeEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  detectProject,
  initializeProject,
  formatProjectInfo,
} from "../src/init";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "zhcode-init-test-"));
});

describe("detectProject", () => {
  test("detects a git + bun TypeScript project", async () => {
    await fs.mkdir(path.join(tmpDir, ".git"));
    await fs.writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        name: "my-app",
        scripts: { dev: "bun run src/index.ts" },
      }),
    );
    await fs.writeFile(path.join(tmpDir, "bun.lock"), "");

    const info = await detectProject(tmpDir);
    expect(info.name).toBe("my-app");
    expect(info.git).toBe(true);
    expect(info.packageManager).toBe("bun");
    expect(info.language).toBe("typescript");
  });

  test("falls back to the directory basename without package.json", async () => {
    const dir = path.join(tmpDir, "some-project");
    await fs.mkdir(dir);
    const info = await detectProject(dir);
    expect(info.name).toBe("some-project");
    expect(info.packageManager).toBe("none");
    expect(info.language).toBe("unknown");
  });

  test("detects other package managers", async () => {
    await fs.writeFile(path.join(tmpDir, "yarn.lock"), "");
    const info = await detectProject(tmpDir);
    expect(info.packageManager).toBe("yarn");
  });
});

describe("initializeProject", () => {
  test("writes .zhcode/config.json and returns a summary", async () => {
    await fs.mkdir(path.join(tmpDir, ".git"));
    await fs.writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "pkg" }),
    );

    const { info, configPath } = await initializeProject(tmpDir);
    expect(info.name).toBe("pkg");
    expect(configPath).toContain(".zhcode");
    expect(configPath).toContain("config.json");

    const written = JSON.parse(await fs.readFile(configPath, "utf-8"));
    expect(written.name).toBe("pkg");
    expect(written.git).toBe(true);
  });
});

describe("formatProjectInfo", () => {
  test("renders readable summary lines", () => {
    const lines = formatProjectInfo({
      name: "app",
      root: "/tmp/app",
      git: true,
      packageManager: "bun",
      language: "typescript",
    });
    expect(lines.join("\n")).toContain("ZHcode initialized for app");
    expect(lines.join("\n")).toContain("package manager: bun");
  });
});
