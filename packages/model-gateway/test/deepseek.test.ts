import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { DeepSeekProvider } from "../src/deepseek";
import { AuthenticationError } from "../src/errors";
import type { ModelRequest } from "../src/types";

function makeRequest(text: string): ModelRequest {
  return {
    messages: [{ role: "user", content: text }],
    model: "deepseek-chat",
  };
}

describe("DeepSeekProvider.info()", () => {
  test("returns correct provider metadata", () => {
    const provider = new DeepSeekProvider({ apiKey: "test-key" });
    const info = provider.info();
    expect(info.name).toBe("deepseek");
    expect(info.models).toContain("deepseek-chat");
    expect(info.capabilities.streaming).toBe(true);
  });

  test("uses default model when not provided", () => {
    const provider = new DeepSeekProvider({ apiKey: "test-key" });
    expect(provider.info().models[0]).toBe("deepseek-chat");
  });
});

describe("DeepSeekProvider error handling", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: { message: "bad key" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("maps a 401 response to AuthenticationError", async () => {
    const provider = new DeepSeekProvider({ apiKey: "invalid-key" });
    try {
      await provider.generate(makeRequest("hello"));
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(AuthenticationError);
    }
  });
});
