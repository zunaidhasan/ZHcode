import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { RelevanceRanker } from "../src/ranking";
import { BudgetManager } from "../src/budget";
import { MemoryStore } from "../src/memory";
import { CodebaseExplorer } from "../src/explorer";
import { ContextEngine } from "../src/engine";
import type { FileMetadata } from "../src/types";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "zhcode-context-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeFile(p: string, important = false): FileMetadata {
  return {
    path: p,
    extension: path.extname(p),
    size: 100,
    language: "typescript",
    lastModified: Date.now(),
    isImportant: important,
  };
}

// ---------------------------------------------------------------------------
// RelevanceRanker
// ---------------------------------------------------------------------------

describe("RelevanceRanker", () => {
  test("ranks filename matches higher", () => {
    const ranker = new RelevanceRanker();
    const files = [
      makeFile("utils.ts"),
      makeFile("auth.ts"),
      makeFile("user.ts"),
    ];
    const results = ranker.rank(files, "auth");
    expect(results[0]!.path).toBe("auth.ts");
  });

  test("ranks path matches", () => {
    const ranker = new RelevanceRanker();
    const files = [
      makeFile("src/services/auth.ts"),
      makeFile("src/utils/helper.ts"),
    ];
    const results = ranker.rank(files, "services");
    expect(results[0]!.path).toContain("services");
  });

  test("ranks non-matching files lower", () => {
    const ranker = new RelevanceRanker();
    const files = [makeFile("app.ts")];
    const results = ranker.rank(files, "zzzznonexistent");
    // Files get points for extension bonus even without query match
    expect(results.length).toBeLessThanOrEqual(1);
    if (results.length > 0) {
      expect(results[0]!.score).toBeLessThan(0.5);
    }
  });

  test("respects maxResults", () => {
    const ranker = new RelevanceRanker();
    const files = [
      makeFile("auth1.ts"),
      makeFile("auth2.ts"),
      makeFile("auth3.ts"),
    ];
    const results = ranker.rank(files, "auth", 2);
    expect(results.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// BudgetManager
// ---------------------------------------------------------------------------

describe("BudgetManager", () => {
  test("selects files within budget", () => {
    const budget = new BudgetManager({
      maxFiles: 2,
      maxTokens: 10000,
      reservedOutputTokens: 0,
    });
    const files = [makeFile("a.ts"), makeFile("b.ts"), makeFile("c.ts")];
    const contents = new Map([
      ["a.ts", "content a"],
      ["b.ts", "content b"],
      ["c.ts", "content c"],
    ]);

    const { selected, budgetExceeded } = budget.selectFiles(files, contents);
    expect(selected.length).toBe(2);
    expect(budgetExceeded).toBe(true);
  });

  test("estimates tokens correctly", () => {
    const budget = new BudgetManager();
    const tokens = budget.estimateTokens("hello world"); // 11 chars ≈ 3 tokens
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(10);
  });

  test("truncates content to token limit", () => {
    const budget = new BudgetManager();
    const longContent = "x".repeat(1000);
    const truncated = budget.truncateContent(longContent, 10); // ~40 chars
    expect(truncated.length).toBeLessThan(longContent.length);
    expect(truncated).toContain("truncated");
  });
});

// ---------------------------------------------------------------------------
// MemoryStore
// ---------------------------------------------------------------------------

describe("MemoryStore", () => {
  test("starts with empty memory", async () => {
    const memory = new MemoryStore(tmpDir);
    await memory.load();
    expect(memory.getAll()).toHaveLength(0);
  });

  test("adds and retrieves entries", async () => {
    const memory = new MemoryStore(tmpDir);
    await memory.load();
    await memory.add("test-key", "discovery", "Test content");

    const entry = memory.get("test-key");
    expect(entry).toBeDefined();
    expect(entry!.content).toBe("Test content");
    expect(entry!.category).toBe("discovery");
  });

  test("updates existing entries", async () => {
    const memory = new MemoryStore(tmpDir);
    await memory.load();
    await memory.add("key", "architecture", "v1");
    await memory.add("key", "architecture", "v2");

    const entry = memory.get("key");
    expect(entry!.content).toBe("v2");
    expect(memory.getAll()).toHaveLength(1);
  });

  test("deletes entries", async () => {
    const memory = new MemoryStore(tmpDir);
    await memory.load();
    await memory.add("to-delete", "issue", "delete me");

    const deleted = await memory.delete("to-delete");
    expect(deleted).toBe(true);
    expect(memory.get("to-delete")).toBeUndefined();
  });

  test("persists to disk", async () => {
    const memory = new MemoryStore(tmpDir);
    await memory.load();
    await memory.add("persist", "decision", "Keep this");

    // Load in a new instance.
    const memory2 = new MemoryStore(tmpDir);
    await memory2.load();
    expect(memory2.get("persist")?.content).toBe("Keep this");
  });

  test("formats memory as text", async () => {
    const memory = new MemoryStore(tmpDir);
    await memory.load();
    await memory.add("test", "discovery", "Important finding");

    const text = memory.format();
    expect(text).toContain("Project Memory");
    expect(text).toContain("test");
    expect(text).toContain("Important finding");
  });

  test("filters by category", async () => {
    const memory = new MemoryStore(tmpDir);
    await memory.load();
    await memory.add("a", "architecture", "Arch note");
    await memory.add("b", "issue", "Bug note");

    const archEntries = memory.getAll("architecture");
    expect(archEntries.length).toBe(1);
    expect(archEntries[0]!.key).toBe("a");
  });
});

// ---------------------------------------------------------------------------
// CodebaseExplorer
// ---------------------------------------------------------------------------

describe("CodebaseExplorer", () => {
  test("finds relevant files", async () => {
    await fs.writeFile(
      path.join(tmpDir, "auth.ts"),
      "export function authenticate() {}",
    );
    await fs.writeFile(
      path.join(tmpDir, "user.ts"),
      "export function getUser() {}",
    );

    const explorer = new CodebaseExplorer({ root: tmpDir });
    await explorer.init();

    const results = await explorer.findRelevant("auth");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.path).toContain("auth");
  });

  test("reads file contents", async () => {
    await fs.writeFile(path.join(tmpDir, "test.ts"), "hello world");

    const explorer = new CodebaseExplorer({ root: tmpDir });
    await explorer.init();

    const contents = await explorer.readFiles(["test.ts"]);
    expect(contents.get("test.ts")).toBe("hello world");
  });
});

// ---------------------------------------------------------------------------
// ContextEngine
// ---------------------------------------------------------------------------

describe("ContextEngine", () => {
  test("initializes and detects project", async () => {
    await fs.writeFile(path.join(tmpDir, "tsconfig.json"), "{}");
    await fs.writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        name: "test-project",
        dependencies: { react: "^18.0.0" },
      }),
    );

    const engine = new ContextEngine({ root: tmpDir });
    await engine.init();

    const project = engine.getProjectContext();
    expect(project).not.toBeNull();
    expect(project!.language).toBe("typescript");
    expect(project!.frameworks).toContain("react");
  });

  test("detects intent from query", async () => {
    const engine = new ContextEngine({ root: tmpDir });
    await engine.init();

    expect(engine.detectIntent("Explain this project")).toBe("explain_project");
    expect(engine.detectIntent("Where is auth implemented?")).toBe("find_code");
    expect(engine.detectIntent("Fix the login bug")).toBe("fix_bug");
    expect(engine.detectIntent("Add a new feature")).toBe("add_feature");
    expect(engine.detectIntent("Refactor this code")).toBe("refactor");
    expect(engine.detectIntent("What is 2 + 2?")).toBe("general");
  });

  test("builds context for find_code intent", async () => {
    await fs.writeFile(path.join(tmpDir, "tsconfig.json"), "{}");
    await fs.writeFile(
      path.join(tmpDir, "auth.ts"),
      "export function authenticate() {}",
    );

    const engine = new ContextEngine({ root: tmpDir });
    await engine.init();

    const response = await engine.buildContext({
      query: "auth",
      intent: "find_code",
    });

    expect(response.project).toBeDefined();
    expect(response.structure).toBeDefined();
  });

  test("returns minimal context for general intent", async () => {
    await fs.writeFile(path.join(tmpDir, "tsconfig.json"), "{}");

    const engine = new ContextEngine({ root: tmpDir });
    await engine.init();

    const response = await engine.buildContext({
      query: "What is 2 + 2?",
      intent: "general",
    });

    expect(response.files).toHaveLength(0);
    expect(response.tokensUsed).toBe(0);
  });
});
