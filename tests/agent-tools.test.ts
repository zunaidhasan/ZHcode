import { describe, expect, test } from "bun:test";
import * as os from "node:os";
import * as path from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import { Agent } from "../packages/agent-runtime/src/index";
import { ModelGateway } from "../packages/model-gateway/src/index";
import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
  ProviderInfo,
} from "../packages/model-gateway/src/index";
import {
  createDefaultRegistry,
  ToolContext,
} from "../packages/tools/src/index";

/**
 * A scripted provider that acts like a real agentic model:
 *  - call 1: asks to read package.json (a tool call)
 *  - call 2: answers using whatever it "learned" from the tool result
 */
class ScriptedToolProvider implements ModelProvider {
  readonly name = "scripted-tool";
  calls = 0;

  info(): ProviderInfo {
    return {
      name: "scripted-tool",
      models: ["scripted-tool"],
      capabilities: {
        streaming: false,
        toolCalling: true,
        maxContextTokens: 4096,
      },
    };
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    this.calls++;
    if (this.calls === 1) {
      return {
        content:
          'I will read the project manifest.\n```tool name=read_file\n{ "path": "package.json" }\n```',
        model: "scripted-tool",
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        finishReason: "stop",
      };
    }
    const lastMessage =
      request.messages[request.messages.length - 1]?.content ?? "";
    const scriptsLine =
      lastMessage.split("\n").find((l) => l.includes('"scripts"')) ?? "";
    return {
      content: `Found it. The dev script is: ${scriptsLine.trim() || "unknown"}`,
      model: "scripted-tool",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: "stop",
    };
  }

  async *stream(): AsyncGenerator<ModelStreamChunk> {
    yield { delta: "", done: true };
  }
}

const PROJECT_ROOT = path.resolve(__dirname, "..");

/** A provider that tries to read .env on the first call. */
class EnvReadingProvider extends ScriptedToolProvider {
  override async generate(request: ModelRequest): Promise<ModelResponse> {
    this.calls++;
    if (this.calls === 1) {
      return {
        content:
          'Reading config.\n```tool name=read_file\n{ "path": ".env" }\n```',
        model: "scripted-tool",
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        finishReason: "stop",
      };
    }
    const last = request.messages[request.messages.length - 1]?.content ?? "";
    return {
      content: `Tool reported: ${last.slice(0, 200)}`,
      model: "scripted-tool",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: "stop",
    };
  }
}

describe("agent tool loop end-to-end", () => {
  test("agent reads a file with read_file and answers from its contents", async () => {
    const gateway = new ModelGateway();
    gateway.registerProvider("scripted-tool", new ScriptedToolProvider());
    gateway.setActiveProvider("scripted-tool");

    const registry = createDefaultRegistry();
    const toolContext = new ToolContext({
      projectRoot: PROJECT_ROOT,
      permissions: ["read"],
    });

    const agent = new Agent({ gateway, toolRegistry: registry, toolContext });
    const response = await agent.run({
      message: "read the package.json and tell me the scripts",
    });

    expect(response.status).toBe("complete");
    expect(response.toolCalls).toBe(1);
    expect(response.content).toContain("Found it.");
    expect(response.content).toContain("dev");

    // The tool result must have been fed back into the conversation.
    const toolResultMessage = response.messages.find((m) =>
      m.content.includes("[Tool Result"),
    );
    expect(toolResultMessage).toBeDefined();
  });

  test("agent refuses to read a blocked path (.env)", async () => {
    // Create a temp project with a real .env file (outside the repo).
    const tmp = await mkdtemp(path.join(os.tmpdir(), "zhcode-env-test-"));
    await writeFile(path.join(tmp, ".env"), "SECRET=1\n");

    const gateway = new ModelGateway();
    gateway.registerProvider("env-provider", new EnvReadingProvider());
    gateway.setActiveProvider("env-provider");

    const registry = createDefaultRegistry();
    const toolContext = new ToolContext({
      projectRoot: tmp,
      permissions: ["read"],
    });
    const agent = new Agent({ gateway, toolRegistry: registry, toolContext });
    const response = await agent.run({ message: "read .env" });

    expect(response.status).toBe("complete");
    expect(response.content).not.toContain("SECRET=1");
    // The tool result should mention the permission-layer block.
    expect(response.content).toMatch(/blocked|permission/i);
  });
});
