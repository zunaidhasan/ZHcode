import { describe, expect, test } from "bun:test";
import type {
  ModelMessage,
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
  ModelUsage,
} from "../src/types";

describe("ModelMessage type shape", () => {
  test("accepts valid roles", () => {
    const msg: ModelMessage = { role: "user", content: "hello" };
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("hello");
  });

  test("accepts system role", () => {
    const msg: ModelMessage = { role: "system", content: "You are helpful." };
    expect(msg.role).toBe("system");
  });

  test("accepts assistant role", () => {
    const msg: ModelMessage = { role: "assistant", content: "Hi there!" };
    expect(msg.role).toBe("assistant");
  });
});

describe("ModelRequest type shape", () => {
  test("creates valid request", () => {
    const req: ModelRequest = {
      messages: [{ role: "user", content: "hello" }],
      model: "deepseek/deepseek-chat",
    };
    expect(req.messages).toHaveLength(1);
    expect(req.model).toBe("deepseek/deepseek-chat");
  });

  test("supports optional fields", () => {
    const req: ModelRequest = {
      messages: [],
      model: "test",
      maxTokens: 1024,
      temperature: 0.7,
      stream: true,
    };
    expect(req.maxTokens).toBe(1024);
    expect(req.temperature).toBe(0.7);
    expect(req.stream).toBe(true);
  });
});

describe("ModelResponse type shape", () => {
  test("creates valid response", () => {
    const res: ModelResponse = {
      content: "Hello!",
      model: "test-model",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: "stop",
    };
    expect(res.content).toBe("Hello!");
    expect(res.finishReason).toBe("stop");
    expect(res.usage.totalTokens).toBe(15);
  });

  test("accepts all finish reasons", () => {
    const reasons: ModelResponse["finishReason"][] = [
      "stop",
      "length",
      "tool_calls",
      "content_filter",
      "error",
    ];
    for (const reason of reasons) {
      const res: ModelResponse = {
        content: "",
        model: "test",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        finishReason: reason,
      };
      expect(res.finishReason).toBe(reason);
    }
  });
});

describe("ModelStreamChunk type shape", () => {
  test("creates non-final chunk", () => {
    const chunk: ModelStreamChunk = { delta: "Hello", done: false };
    expect(chunk.delta).toBe("Hello");
    expect(chunk.done).toBe(false);
    expect(chunk.usage).toBeUndefined();
  });

  test("creates final chunk with usage", () => {
    const chunk: ModelStreamChunk = {
      delta: "",
      done: true,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: "stop",
    };
    expect(chunk.done).toBe(true);
    expect(chunk.finishReason).toBe("stop");
  });
});

describe("ModelUsage type shape", () => {
  test("creates valid usage", () => {
    const usage: ModelUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    };
    expect(usage.promptTokens + usage.completionTokens).toBe(usage.totalTokens);
  });
});
