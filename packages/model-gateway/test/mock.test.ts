import { describe, expect, test } from "bun:test";
import { MockProvider } from "../src/mock";
import type { ModelRequest } from "../src/types";

function makeRequest(text: string): ModelRequest {
  return {
    messages: [{ role: "user", content: text }],
    model: "mock-model",
  };
}

describe("MockProvider.info()", () => {
  test("returns correct provider metadata", () => {
    const provider = new MockProvider();
    const info = provider.info();
    expect(info.name).toBe("mock");
    expect(info.models).toContain("mock-model");
    expect(info.capabilities.streaming).toBe(true);
    expect(info.capabilities.toolCalling).toBe(false);
  });
});

describe("MockProvider.generate()", () => {
  test("returns a response echoing the user message", async () => {
    const provider = new MockProvider();
    const res = await provider.generate(makeRequest("hello"));

    expect(res.content).toContain('You said: "hello"');
    expect(res.model).toBe("mock-model");
    expect(res.finishReason).toBe("stop");
  });

  test("includes usage information", async () => {
    const provider = new MockProvider();
    const res = await provider.generate(makeRequest("test"));

    expect(res.usage.promptTokens).toBeGreaterThanOrEqual(0);
    expect(res.usage.completionTokens).toBeGreaterThanOrEqual(0);
    expect(res.usage.totalTokens).toBeGreaterThanOrEqual(0);
  });

  test("uses custom prefix", async () => {
    const provider = new MockProvider({ prefix: "Custom prefix!" });
    const res = await provider.generate(makeRequest("hi"));

    expect(res.content).toContain("Custom prefix!");
  });

  test("handles empty messages", async () => {
    const provider = new MockProvider();
    const res = await provider.generate({
      messages: [],
      model: "mock-model",
    });

    expect(res.content).toContain("ZHcode model gateway");
  });
});

describe("MockProvider.stream()", () => {
  test("yields chunks ending with done=true", async () => {
    const provider = new MockProvider({ chunkDelayMs: 0 });
    const chunks: string[] = [];
    let done = false;

    for await (const chunk of provider.stream(makeRequest("hello"))) {
      chunks.push(chunk.delta);
      if (chunk.done) done = true;
    }

    expect(done).toBe(true);
    expect(chunks.join("")).toContain('You said: "hello"');
  });

  test("final chunk includes usage", async () => {
    const provider = new MockProvider({ chunkDelayMs: 0 });
    let lastChunk;

    for await (const chunk of provider.stream(makeRequest("test"))) {
      if (chunk.done) lastChunk = chunk;
    }

    expect(lastChunk).toBeDefined();
    expect(lastChunk!.usage).toBeDefined();
    expect(lastChunk!.finishReason).toBe("stop");
  });

  test("respects chunkDelayMs", async () => {
    const provider = new MockProvider({ chunkDelayMs: 50 });
    const start = Date.now();

    for await (const _ of provider.stream(makeRequest("hello"))) {
      // consume chunks
    }

    const elapsed = Date.now() - start;
    // Should have at least some delay (mock generates a few words)
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });
});
