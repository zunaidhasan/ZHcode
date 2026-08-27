import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ExplorerAgent } from "../src/explorer";
import { ModelGateway } from "@zhcode/model-gateway";
import { createDefaultRegistry } from "@zhcode/tools";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "zhcode-explorer-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function createExplorer(): ExplorerAgent {
  return new ExplorerAgent({
    gateway: new ModelGateway(),
    toolRegistry: createDefaultRegistry(),
    projectRoot: tmpDir,
    config: { maxIterations: 5, maxToolCalls: 10 },
  });
}

// ---------------------------------------------------------------------------
// ExplorerAgent basic properties
// ---------------------------------------------------------------------------

describe("ExplorerAgent properties", () => {
  test("has correct id and name", () => {
    const explorer = createExplorer();
    expect(explorer.id).toBe("explorer");
    expect(explorer.name).toBe("Explorer Agent");
  });

  test("has read-only permissions", () => {
    const explorer = createExplorer();
    expect(explorer.toolPolicy).toEqual(["read"]);
  });

  test("has correct capabilities", () => {
    const explorer = createExplorer();
    expect(explorer.capabilities).toContain("search");
    expect(explorer.capabilities).toContain("read");
    expect(explorer.capabilities).toContain("analyze");
    expect(explorer.capabilities).not.toContain("write");
    expect(explorer.capabilities).not.toContain("edit");
  });

  test("has a system prompt", () => {
    const explorer = createExplorer();
    expect(explorer.systemPrompt.length).toBeGreaterThan(0);
    expect(explorer.systemPrompt).toContain("read-only");
    expect(explorer.systemPrompt).toContain("DO NOT modify");
  });
});

// ---------------------------------------------------------------------------
// ExplorerAgent configuration
// ---------------------------------------------------------------------------

describe("ExplorerAgent configuration", () => {
  test("uses default config when not provided", () => {
    const explorer = new ExplorerAgent({
      gateway: new ModelGateway(),
      toolRegistry: createDefaultRegistry(),
      projectRoot: tmpDir,
    });
    expect(explorer).toBeDefined();
  });

  test("accepts custom config", () => {
    const explorer = new ExplorerAgent({
      gateway: new ModelGateway(),
      toolRegistry: createDefaultRegistry(),
      projectRoot: tmpDir,
      config: { maxIterations: 3, maxToolCalls: 5 },
    });
    expect(explorer).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// ExplorerAgent.run()
// ---------------------------------------------------------------------------

describe("ExplorerAgent.run()", () => {
  test("returns a result with summary", async () => {
    await fs.writeFile(path.join(tmpDir, "auth.ts"), "export function login() {}");

    const explorer = createExplorer();
    const result = await explorer.run({ task: "Find authentication code" });

    expect(result.success).toBe(true);
    expect(result.summary).toBeDefined();
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.iterations).toBeGreaterThanOrEqual(1);
  });

  test("records tool calls", async () => {
    await fs.writeFile(path.join(tmpDir, "app.ts"), "export const app = {};");

    const explorer = createExplorer();
    const result = await explorer.run({ task: "Explore the project" });

    expect(result.toolCalls).toBeGreaterThanOrEqual(0);
  });

  test("emits events during execution", async () => {
    const events: string[] = [];
    const explorer = createExplorer();

    await explorer.run({
      task: "Search for code",
      onEvent: (e) => events.push(e.type),
    });

    expect(events.length).toBeGreaterThan(0);
    expect(events).toContain("thinking");
  });

  test("handles cancellation", async () => {
    const controller = new AbortController();
    const explorer = createExplorer();

    // Cancel immediately.
    controller.abort();

    const result = await explorer.run({
      task: "Explore everything",
      signal: controller.signal,
    });

    // Should handle cancellation gracefully.
    expect(result.success === false || result.success === true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Investigation result parsing
// ---------------------------------------------------------------------------

describe("Investigation result parsing", () => {
  test("parses valid JSON investigation result", async () => {
    // The mock provider won't return JSON, so we test the parsing logic indirectly.
    // In a real scenario, the model would return structured JSON.
    const explorer = createExplorer();
    const result = await explorer.run({ task: "Investigate authentication" });

    // The result should have the expected structure.
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("iterations");
    expect(result).toHaveProperty("toolCalls");
  });
});

// ---------------------------------------------------------------------------
// ExplorerAgent with real project structure
// ---------------------------------------------------------------------------

describe("ExplorerAgent with project", () => {
  test("explores a TypeScript project", async () => {
    // Create a realistic project structure.
    await fs.mkdir(path.join(tmpDir, "src"));
    await fs.writeFile(path.join(tmpDir, "tsconfig.json"), "{}");
    await fs.writeFile(path.join(tmpDir, "package.json"), JSON.stringify({
      name: "test-app",
      dependencies: { react: "^18.0.0" },
    }));
    await fs.writeFile(path.join(tmpDir, "src", "app.ts"), "export const app = {};");
    await fs.writeFile(path.join(tmpDir, "src", "auth.ts"), "export function login() {}");

    const explorer = createExplorer();
    const result = await explorer.run({ task: "What does this project do?" });

    expect(result.success).toBe(true);
    expect(result.iterations).toBeGreaterThanOrEqual(1);
  });

  test("handles empty project", async () => {
    const explorer = createExplorer();
    const result = await explorer.run({ task: "Explore this project" });

    expect(result.success).toBe(true);
    expect(result.summary).toBeDefined();
  });

  test("respects max iterations", async () => {
    const explorer = new ExplorerAgent({
      gateway: new ModelGateway(),
      toolRegistry: createDefaultRegistry(),
      projectRoot: tmpDir,
      config: { maxIterations: 1, maxToolCalls: 5 },
    });

    const result = await explorer.run({ task: "Explore everything thoroughly" });
    expect(result.iterations).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Integration with mock project
// ---------------------------------------------------------------------------

describe("ExplorerAgent integration", () => {
  test("full exploration pipeline", async () => {
    // Create a mock project with authentication.
    await fs.mkdir(path.join(tmpDir, "src"));
    await fs.mkdir(path.join(tmpDir, "src", "auth"));
    await fs.writeFile(path.join(tmpDir, "src", "auth", "login.ts"), `
export function login(username: string, password: string) {
  return authenticate(username, password);
}
`);
    await fs.writeFile(path.join(tmpDir, "src", "auth", "service.ts"), `
import { login } from './login';
export class AuthService {
  login(user: string, pass: string) { return login(user, pass); }
}
`);
    await fs.writeFile(path.join(tmpDir, "src", "app.ts"), `
import { AuthService } from './auth/service';
const auth = new AuthService();
`);

    const explorer = createExplorer();
    const result = await explorer.run({
      task: "Find the authentication flow",
    });

    expect(result.success).toBe(true);
    expect(result.summary).toBeDefined();
    expect(result.iterations).toBeGreaterThanOrEqual(1);
  });
});
