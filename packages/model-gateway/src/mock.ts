/**
 * MockProvider — a deterministic, API-key-free provider for testing.
 *
 * Returns canned responses that echo the last user message back with a
 * prefix. Useful for verifying the entire pipeline without network access.
 */

import type { ModelProvider } from "./provider";
import type {
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
  ProviderInfo,
} from "./types";

export interface MockProviderOptions {
  /** Delay in ms before each streaming chunk (default: 30). */
  chunkDelayMs?: number;
  /** Prefix prepended to the echoed response. */
  prefix?: string;
}

export class MockProvider implements ModelProvider {
  readonly name = "mock";
  private readonly prefix: string;
  private readonly chunkDelayMs: number;

  constructor(options?: MockProviderOptions) {
    this.prefix = options?.prefix ?? "Hello from ZHcode model gateway.";
    this.chunkDelayMs = options?.chunkDelayMs ?? 30;
  }

  info(): ProviderInfo {
    return {
      name: "mock",
      models: ["mock-model"],
      capabilities: {
        streaming: true,
        toolCalling: false,
        maxContextTokens: 4096,
      },
    };
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const content = this.buildContent(request);
    return {
      content,
      model: request.model || "mock-model",
      usage: {
        promptTokens: this.estimateTokens(request.messages),
        completionTokens: this.estimateTokens([{ role: "assistant", content }]),
        totalTokens: 0, // filled below
      },
      finishReason: "stop",
    };
  }

  async *stream(request: ModelRequest): AsyncGenerator<ModelStreamChunk> {
    const content = this.buildContent(request);
    const words = content.split(/(\s+)/);

    for (const word of words) {
      yield { delta: word, done: false };
      if (this.chunkDelayMs > 0) {
        await new Promise((r) => setTimeout(r, this.chunkDelayMs));
      }
    }

    const promptTokens = this.estimateTokens(request.messages);
    const completionTokens = this.estimateTokens([
      { role: "assistant", content },
    ]);
    yield {
      delta: "",
      done: true,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      finishReason: "stop",
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildContent(request: ModelRequest): string {
    const lastUser = [...request.messages]
      .reverse()
      .find((m) => m.role === "user");
    const userText = lastUser?.content ?? "";
    return `${this.prefix}\n\nYou said: "${userText}"`;
  }

  private estimateTokens(
    messages: { role: string; content: string }[],
  ): number {
    // Rough heuristic: ~4 chars per token.
    let total = 0;
    for (const m of messages) {
      total += m.content.length;
    }
    return Math.ceil(total / 4);
  }
}
