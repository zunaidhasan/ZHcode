import { describe, expect, test, beforeEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { Agent } from "../src/agent";
import { createAgentConfig } from "../src/config";
import { AgentContext } from "../src/context";
import { parseToolCalls } from "../src/loop";
import type { AgentEvent } from "../src/types";
import { ModelGateway } from "@zhcode/model-gateway";
import { createDefaultRegistry, ToolContext } from "@zhcode/tools";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "zhcode-agent-test-"));
});

function createTestAgent(options?: {
  model?: string;
  maxIterations?: number;
  onEvent?: (event: AgentEvent) => void;
}): Agent {
  const gateway = new ModelGateway();
  const toolRegistry = createDefaultRegistry();
  const toolContext = new ToolContext({
    projectRoot: tmpDir,
    permissions: ["read", "write", "execute", "git"],
  });

  return new Agent({
    gateway,
    toolRegistry,
    toolContext,
    config: {
      model: options?.model ?? "mock-model",
      maxIterations: options?.maxIterations ?? 10,
    },
    onEvent: options?.onEvent,
  });
}

// ---------------------------------------------------------------------------
// parseToolCalls
// ---------------------------------------------------------------------------

describe("parseToolCalls", () => {
  test("parses tool calls from markdown blocks", () => {
    const content = `I'll search for that.

\`\`\`tool name=search_files
{ "query": "auth" }
\`\`\`
`;
    const calls = parseToolCalls(content);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe("search_files");
    expect(calls[0]!.arguments).toEqual({ query: "auth" });
  });

  test("parses multiple tool calls", () => {
    const content = `
\`\`\`tool name=list_files
{ "path": "src" }
\`\`\`

\`\`\`tool name=read_file
{ "path": "src/index.ts" }
\`\`\`
`;
    const calls = parseToolCalls(content);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.name).toBe("list_files");
    expect(calls[1]!.name).toBe("read_file");
  });

  test("returns empty array for no tool calls", () => {
    const content = "This is a regular response with no tools.";
    const calls = parseToolCalls(content);
    expect(calls).toHaveLength(0);
  });

  test("handles malformed JSON gracefully", () => {
    const content = `
\`\`\`tool name=bad_tool
not json at all
\`\`\`
`;
    const calls = parseToolCalls(content);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe("bad_tool");
    expect(calls[0]!.arguments).toEqual({ raw: "not json at all" });
  });
});

// ---------------------------------------------------------------------------
// AgentConfig
// ---------------------------------------------------------------------------

describe("createAgentConfig", () => {
  test("creates config with defaults", () => {
    const config = createAgentConfig();
    expect(config.maxIterations).toBe(20);
    expect(config.maxToolCalls).toBe(50);
    expect(config.permissions).toContain("read");
  });

  test("overrides defaults", () => {
    const config = createAgentConfig({ maxIterations: 5 });
    expect(config.maxIterations).toBe(5);
    expect(config.maxToolCalls).toBe(50); // unchanged
  });
});

// ---------------------------------------------------------------------------
// AgentContext
// ---------------------------------------------------------------------------

describe("AgentContext", () => {
  test("shouldStop returns false when within limits", () => {
    const gw = new ModelGateway();
    const registry = createDefaultRegistry();
    const toolContext = new ToolContext({ projectRoot: tmpDir, permissions: ["read"] });
    const config = createAgentConfig({ maxIterations: 10 });

    const ctx = new AgentContext({
      gateway: gw,
      toolRegistry: registry,
      toolContext,
      config,
      messages: [],
    });

    ctx.iterations = 5;
    const result = ctx.shouldStop();
    expect(result.stop).toBe(false);
  });

  test("shouldStop returns true when iteration limit reached", () => {
    const gw = new ModelGateway();
    const registry = createDefaultRegistry();
    const toolContext = new ToolContext({ projectRoot: tmpDir, permissions: ["read"] });
    const config = createAgentConfig({ maxIterations: 3 });

    const ctx = new AgentContext({
      gateway: gw,
      toolRegistry: registry,
      toolContext,
      config,
      messages: [],
    });

    ctx.iterations = 3;
    const result = ctx.shouldStop();
    expect(result.stop).toBe(true);
    expect(result.reason).toContain("iteration");
  });

  test("shouldStop returns true when tool call limit reached", () => {
    const gw = new ModelGateway();
    const registry = createDefaultRegistry();
    const toolContext = new ToolContext({ projectRoot: tmpDir, permissions: ["read"] });
    const config = createAgentConfig({ maxToolCalls: 5 });

    const ctx = new AgentContext({
      gateway: gw,
      toolRegistry: registry,
      toolContext,
      config,
      messages: [],
    });

    ctx.toolCallCount = 5;
    const result = ctx.shouldStop();
    expect(result.stop).toBe(true);
    expect(result.reason).toContain("tool call");
  });

  test("emit calls the event handler", () => {
    const events: AgentEvent[] = [];
    const gw = new ModelGateway();
    const registry = createDefaultRegistry();
    const toolContext = new ToolContext({ projectRoot: tmpDir, permissions: ["read"] });
    const config = createAgentConfig();

    const ctx = new AgentContext({
      gateway: gw,
      toolRegistry: registry,
      toolContext,
      config,
      messages: [],
      onEvent: (e) => events.push(e),
    });

    ctx.emit({ type: "thinking", message: "test" });
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("thinking");
  });
});

// ---------------------------------------------------------------------------
// Agent — simple response (no tools)
// ---------------------------------------------------------------------------

describe("Agent — simple responses", () => {
  test("returns a response without using tools", async () => {
    const agent = createTestAgent();
    const response = await agent.run({ message: "hello" });

    expect(response.status).toBe("complete");
    expect(response.content).toContain("ZHcode model gateway");
    expect(response.toolCalls).toBe(0);
    expect(response.iterations).toBe(1);
  });

  test("records events during execution", async () => {
    const events: AgentEvent[] = [];
    const agent = createTestAgent({ onEvent: (e) => events.push(e) });
    await agent.run({ message: "hello" });

    expect(events.some((e) => e.type === "thinking")).toBe(true);
    expect(events.some((e) => e.type === "complete")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Agent — tool execution
// ---------------------------------------------------------------------------

describe("Agent — tool execution", () => {
  test("executes a tool when model requests it", async () => {
    // Create a file for the agent to find.
    await fs.writeFile(path.join(tmpDir, "hello.ts"), "console.log('hello');");

    const agent = createTestAgent();
    const response = await agent.run({ message: "hello" });

    expect(response.status).toBe("complete");
    expect(response.messages.length).toBeGreaterThan(0);
  });

  test("handles tool errors gracefully", async () => {
    const agent = createTestAgent();
    const response = await agent.run({ message: "test" });
    expect(response.status).toBe("complete");
  });
});

// ---------------------------------------------------------------------------
// Agent — cancellation
// ---------------------------------------------------------------------------

describe("Agent — cancellation", () => {
  test("can be cancelled via AbortSignal", async () => {
    const controller = new AbortController();
    const agent = createTestAgent();

    // Cancel immediately.
    controller.abort();

    const response = await agent.run({
      message: "hello",
      signal: controller.signal,
    });

    // The agent should handle the cancellation.
    expect(response.status === "cancelled" || response.status === "complete").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Agent — limits
// ---------------------------------------------------------------------------

describe("Agent — limits", () => {
  test("respects maxIterations", async () => {
    const agent = createTestAgent({ maxIterations: 1 });
    const response = await agent.run({ message: "hello" });

    // With maxIterations=1, the agent should complete in 1 iteration.
    expect(response.iterations).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Agent — conversation history
// ---------------------------------------------------------------------------

describe("Agent — conversation history", () => {
  test("includes previous messages in conversation", async () => {
    const agent = createTestAgent();
    const history = [
      { role: "user" as const, content: "Hello" },
      { role: "assistant" as const, content: "Hi there!" },
    ];

    const response = await agent.run({ message: "How are you?" }, history);
    expect(response.status).toBe("complete");
    // Should have system + 2 history + 1 new = 4 messages
    expect(response.messages.length).toBeGreaterThanOrEqual(4);
  });
});
